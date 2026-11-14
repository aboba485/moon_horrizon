/* Precompute a terrain horizon profile for every south-polar site in the
   catalogue, straight from the LOLA polar DEM, and write terrain.js.

   Run:  node tools/lola-horizon.mjs
   Needs data/lola/LDEM_75S_120M.IMG, which tools/fetch-lola.sh downloads.

   Nothing here runs in the browser. The browser only ever sees terrain.js.

   Geometry of LDEM_75S_120M, read from its PDS label:
     7624 x 7624 samples, LSB_INTEGER, 16 bit, 0.5 m per count
     height is relative to a reference radius of 1737.4 km
     polar stereographic, centre -90 lat / 0 lon, 120 m per pixel
     MEAN EARTH / POLAR AXIS OF DE421, longitudes east-positive

   Pixel mapping. For a unit vector u on the sphere the south polar
   stereographic plane coordinates reduce to a trig-free form:
     x =  2R * u.y / (1 - u.z)
     y = -2R * u.x / (1 - u.z)
   with x to increasing sample, y to increasing line, so longitude 0 points to
   the top of the image and 90 E to the right. That orientation was not assumed:
   it is the one of four sign combinations that puts Shackleton, Shoemaker,
   Faustini, de Gerlache, Cabeus and Amundsen all inside depressions, by about
   3 km each, where the other three combinations scatter.

   The sphere check: lat -75 on the 0 meridian lands 457,340 m from the centre,
   and the label's half width is 3811.5 px * 120 m = 457,380 m. */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");

const PRODUCT = "LDEM_75S_120M";
const IMG = path.join(repo, "data", "lola", PRODUCT + ".IMG");
const OUT = path.join(repo, "terrain.js");

const N = 7624; // samples per line and lines per file
const SCALE = 120; // metres per pixel
const CENTRE = (N - 1) / 2; // the pole sits at the centre of the grid, 0-based
const COUNT_TO_M = 0.5;
const R = 1737400; // the datum the heights are relative to, metres

const BINS = 360; // azimuth bins, 1 degree each
const SUBRAYS = 3; // rays per bin, so a narrow ridge between bins is not missed
const RAY_M = 100000; // how far to look, metres
const MIN_LAT = -79; // only sites with a full ray inside the product
const DEG = Math.PI / 180;

if (!fs.existsSync(IMG)) {
  console.error("missing " + IMG + "\nrun tools/fetch-lola.sh first");
  process.exit(1);
}

const buf = fs.readFileSync(IMG);
if (buf.length !== N * N * 2) {
  console.error("unexpected size " + buf.length + ", expected " + N * N * 2);
  process.exit(1);
}
const dem = new Int16Array(buf.buffer, buf.byteOffset, N * N);

require(path.join(repo, "sites.js"));
const sites = globalThis.LUNAR_SITES;

/* Height in metres above the 1737.4 km datum, bilinear, NaN off the grid. */
function height(i, j) {
  const i0 = Math.floor(i);
  const j0 = Math.floor(j);
  if (i0 < 0 || j0 < 0 || i0 + 1 >= N || j0 + 1 >= N) return NaN;
  const fi = i - i0;
  const fj = j - j0;
  const a = dem[i0 * N + j0];
  const b = dem[i0 * N + j0 + 1];
  const c = dem[(i0 + 1) * N + j0];
  const d = dem[(i0 + 1) * N + j0 + 1];
  const top = a + (b - a) * fj;
  const bot = c + (d - c) * fj;
  return (top + (bot - top) * fi) * COUNT_TO_M;
}

function unit(lat, lon) {
  const cl = Math.cos(lat * DEG);
  return { x: cl * Math.cos(lon * DEG), y: cl * Math.sin(lon * DEG), z: Math.sin(lat * DEG) };
}

/* Unit vector to pixel. Trig-free, see the header. */
function pixel(u) {
  const k = (2 * R) / (1 - u.z) / SCALE;
  return { j: CENTRE + u.y * k, i: CENTRE - u.x * k };
}

function heightAt(u) {
  const p = pixel(u);
  return height(p.i, p.j);
}

/* Steps along a ray: fine close in, coarser far out, where a pixel of the DEM
   covers less than a tenth of a degree of azimuth anyway. */
function raySteps() {
  const out = [];
  for (let s = 60; s < 2000; s += 60) out.push(s);
  for (let s = 2000; s < 20000; s += 120) out.push(s);
  for (let s = 20000; s <= RAY_M; s += 300) out.push(s);
  return out.map((s) => {
    const d = s / R;
    return { s, sin: Math.sin(d), cos: Math.cos(d) };
  });
}

const STEPS = raySteps();

/* The horizon profile at one site, degrees per azimuth bin.
   Azimuth is clockwise from north, matching the rest of the project. */
function profileFor(lat, lon) {
  const p0 = unit(lat, lon);
  const h0 = heightAt(p0);
  if (Number.isNaN(h0)) return null;
  const r0 = R + h0;

  const slat = Math.sin(lat * DEG);
  const clat = Math.cos(lat * DEG);
  const slon = Math.sin(lon * DEG);
  const clon = Math.cos(lon * DEG);
  const north = { x: -slat * clon, y: -slat * slon, z: clat };
  const east = { x: -slon, y: clon, z: 0 };

  // Beyond the mapped ray the datum sphere is assumed to continue, which for a
  // site above the datum means a horizon below level.
  const floor = h0 > 0 ? -Math.acos(R / r0) / DEG : 0;

  const profile = new Float64Array(BINS).fill(-Infinity);
  const far = new Float64Array(BINS); // metres to whatever sets the horizon
  const rays = BINS * SUBRAYS;

  for (let k = 0; k < rays; k++) {
    const azDeg = (k * 360) / rays;
    const bin = Math.round(azDeg) % BINS;
    const a = azDeg * DEG;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const dx = north.x * ca + east.x * sa;
    const dy = north.y * ca + east.y * sa;
    const dz = north.z * ca + east.z * sa;

    let bestTan = -Infinity;
    let bestS = 0;
    for (let n = 0; n < STEPS.length; n++) {
      const st = STEPS[n];
      const ux = p0.x * st.cos + dx * st.sin;
      const uy = p0.y * st.cos + dy * st.sin;
      const uz = p0.z * st.cos + dz * st.sin;
      const k2 = (2 * R) / (1 - uz) / SCALE;
      const h = height(CENTRE - ux * k2, CENTRE + uy * k2);
      if (Number.isNaN(h)) break; // left the product, stop this ray
      const r1 = R + h;
      // tan of the elevation angle, exact on a sphere. The denominator is
      // positive for every step, so the max of the tangent is the max angle.
      const t = (r1 * st.cos - r0) / (r1 * st.sin);
      if (t > bestTan) {
        bestTan = t;
        bestS = st.s;
      }
    }
    if (bestTan === -Infinity) continue;
    const el = Math.atan(bestTan) / DEG;
    if (el > profile[bin]) {
      profile[bin] = el;
      far[bin] = bestS;
    }
  }

  const out = [];
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let reach = 0;
  for (let b = 0; b < BINS; b++) {
    const v = Math.max(profile[b] === -Infinity ? floor : profile[b], floor);
    const r = Math.round(v * 100) / 100;
    out.push(r);
    min = Math.min(min, r);
    max = Math.max(max, r);
    sum += r;
    reach = Math.max(reach, far[b]);
  }
  return {
    h0: Math.round(h0),
    floor: Math.round(floor * 100) / 100,
    min,
    max,
    mean: Math.round((sum / BINS) * 100) / 100,
    reachKm: Math.round(reach / 100) / 10,
    profile: out
  };
}

const started = Date.now();
const result = {};
const rows = [];
for (const site of sites) {
  if (site.lat > MIN_LAT) continue;
  const p = profileFor(site.lat, site.lon);
  if (!p) {
    console.error("skipped " + site.id + ", outside the product");
    continue;
  }
  result[site.id] = p;
  rows.push(
    site.id.padEnd(16) +
      String(p.h0).padStart(7) + " m" +
      ("  min " + p.min.toFixed(2) + "°").padStart(16) +
      ("  mean " + p.mean.toFixed(2) + "°").padStart(17) +
      ("  max " + p.max.toFixed(2) + "°").padStart(16) +
      ("  floor " + p.floor.toFixed(2) + "°").padStart(18)
  );
}

const meta = {
  product: PRODUCT,
  source: "LRO LOLA GDR, imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/",
  datasetId: "LRO-L-LOLA-4-GDR-V1.0",
  resolutionM: SCALE,
  datumKm: R / 1000,
  bins: BINS,
  subrays: SUBRAYS,
  rayKm: RAY_M / 1000,
  minLat: MIN_LAT,
  generated: new Date().toISOString().slice(0, 10)
};

const lines = [];
lines.push("/* Terrain horizon profiles, generated by tools/lola-horizon.mjs.");
lines.push("   Do not edit by hand. Regenerate instead.");
lines.push("");
lines.push("   One entry per south-polar site in the catalogue. profile[i] is the");
lines.push("   elevation in degrees of the LOLA skyline at azimuth i degrees,");
lines.push("   clockwise from north. h0 is the site height above the " + meta.datumKm + " km");
lines.push("   datum in metres. floor is the horizon of the bare datum sphere seen");
lines.push("   from that height, which is what the profile falls back to past the");
lines.push("   " + meta.rayKm + " km the rays reach. */");
lines.push("(function (root) {");
lines.push("  root.LUNAR_TERRAIN = {");
lines.push("    meta: " + JSON.stringify(meta) + ",");
lines.push("    sites: {");
const ids = Object.keys(result);
ids.forEach((id, idx) => {
  const p = result[id];
  lines.push("      " + JSON.stringify(id) + ": {");
  lines.push("        h0: " + p.h0 + ", floor: " + p.floor + ", min: " + p.min + ", max: " + p.max + ", mean: " + p.mean + ", reachKm: " + p.reachKm + ",");
  lines.push("        profile: [");
  for (let b = 0; b < BINS; b += 20) {
    lines.push("          " + p.profile.slice(b, b + 20).join(", ") + (b + 20 < BINS ? "," : ""));
  }
  lines.push("        ]");
  lines.push("      }" + (idx < ids.length - 1 ? "," : ""));
});
lines.push("    }");
lines.push("  };");
lines.push("})(typeof window !== \"undefined\" ? window : globalThis);");
lines.push("");

fs.writeFileSync(OUT, lines.join("\n"));

console.log(rows.join("\n"));
console.log("");
console.log(ids.length + " sites, " + (Date.now() - started) + " ms, " + (fs.statSync(OUT).size / 1024).toFixed(1) + " kB written to terrain.js");
