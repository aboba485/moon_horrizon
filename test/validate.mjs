import { createRequire } from "module";
const require = createRequire(import.meta.url);
const Eph = require("../ephemeris.js");

const cases = [
  { name: "Mons Mouton Sun", body: "10", lat: -85.416, lon: 31.851, t: "2026-11-14 00:00" },
  { name: "Mons Mouton Earth", body: "399", lat: -85.416, lon: 31.851, t: "2026-11-14 00:00" },
  { name: "South pole Sun", body: "10", lat: -89.9, lon: 0, t: "2026-06-21 00:00" },
  { name: "South pole Earth", body: "399", lat: -89.9, lon: 0, t: "2026-06-21 00:00" },
  { name: "Apollo 11 Earth", body: "399", lat: 0.67408, lon: 23.47297, t: "2026-11-14 00:00" },
  { name: "Apollo 11 Sun", body: "10", lat: 0.67408, lon: 23.47297, t: "2026-11-14 00:00" },
  { name: "Slater Plain Earth", body: "399", lat: -87.478, lon: 124.521, t: "2026-11-14 00:00" },
  { name: "Far side Earth", body: "399", lat: 0, lon: 180, t: "2026-11-14 00:00" }
];

function parseAzEl(text) {
  const start = text.indexOf("$$SOE");
  const end = text.indexOf("$$EOE");
  const block = start >= 0 ? text.slice(start + 5, end) : text;
  const row = block.split("\n").map((line) => line.trim()).find((line) => /\d/.test(line) && line.includes("."));
  if (!row) throw new Error("no ephemeris row\n" + text.slice(0, 800));
  const nums = row.match(/-?\d+\.\d+/g);
  if (!nums || nums.length < 2) throw new Error("no az/el in " + row);
  return { az: parseFloat(nums[nums.length - 2]), el: parseFloat(nums[nums.length - 1]), row };
}

function plusMinute(time) {
  const [date, hm] = time.split(" ");
  const [h, m] = hm.split(":").map(Number);
  const d = new Date(Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
    h,
    m + 2
  ));
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

async function horizons(body, lon, lat, time) {
  const url = new URL("https://ssd.jpl.nasa.gov/api/horizons.api");
  const q = {
    format: "text",
    COMMAND: body,
    OBJ_DATA: "NO",
    MAKE_EPHEM: "YES",
    EPHEM_TYPE: "OBSERVER",
    CENTER: "coord@301",
    COORD_TYPE: "GEODETIC",
    SITE_COORD: `${lon},${lat},0`,
    START_TIME: time,
    STOP_TIME: plusMinute(time),
    STEP_SIZE: "1 m",
    QUANTITIES: "4",
    ANG_FORMAT: "DEG"
  };
  for (const [k, v] of Object.entries(q)) url.searchParams.set(k, v);
  const res = await fetch(url);
  if (!res.ok) throw new Error("horizons " + res.status);
  return parseAzEl(await res.text());
}

let worst = 0;
for (const c of cases) {
  const h = await horizons(c.body, c.lon, c.lat, c.t);
  const local = Eph.atSite(new Date(c.t.replace(" ", "T") + ":00Z"), c.lat, c.lon);
  const got = c.body === "10" ? local.sun : local.earth;
  let daz = Math.abs(got.az - h.az);
  if (daz > 180) daz = 360 - daz;
  const del = Math.abs(got.alt - h.el);
  worst = Math.max(worst, daz, del);
  const flag = daz > 0.15 || del > 0.15 ? "FAIL" : "ok";
  console.log(
    `${flag}  ${c.name.padEnd(22)} model az ${got.az.toFixed(3)} el ${got.alt.toFixed(3)}   horizons az ${h.az.toFixed(3)} el ${h.el.toFixed(3)}   dAz ${daz.toFixed(3)} dEl ${del.toFixed(3)}`
  );
}

const yearSamples = [];
for (let d = 0; d < 365; d += 10) {
  const sky = Eph.observe(new Date(Date.UTC(2026, 0, 1) + d * 86400000));
  yearSamples.push(sky.subSolar.lat);
}
const maxSub = Math.max(...yearSamples.map(Math.abs));
console.log(`subsolar latitude peak over 2026 sample: ${maxSub.toFixed(3)} deg`);
if (maxSub > 1.7) console.log("FAIL subsolar latitude out of range");
console.log(`worst angular error: ${worst.toFixed(3)} deg`);
if (worst > 0.15) process.exitCode = 1;
