/* Lunar Horizon ephemeris.
   Sun and Earth altitudes from a site on a spherical Moon.
   Positions: Astronomy Engine (VSOP87 + truncated ELP).
   Orientation: IAU WGCCRE lunar pole and prime meridian, Mean-Earth frame.
   Validated against JPL Horizons airless apparent az/el. */
(function (root) {
  const Astronomy = root.Astronomy || (typeof require === "function" ? require("./vendor/astronomy.browser.js") : null);
  if (!Astronomy) throw new Error("Astronomy Engine failed to load");

  const DEG = Math.PI / 180;
  const RAD = 180 / Math.PI;
  const KM_PER_AU = Astronomy.KM_PER_AU;
  const MOON_RADIUS_KM = 1737.4;
  const SUN_RADIUS_KM = 695700;
  const EARTH_RADIUS_KM = 6378.137;
  const SOLAR_CONSTANT = 1361;

  const DSN = [
    { id: "goldstone", name: "Goldstone", lat: 35.2471, lon: -116.7933 },
    { id: "madrid", name: "Madrid", lat: 40.4272, lon: -4.2508 },
    { id: "canberra", name: "Canberra", lat: -35.3985, lon: 148.9819 }
  ];

  function rotZ(deg) {
    const a = deg * DEG;
    const c = Math.cos(a);
    const s = Math.sin(a);
    return [
      [c, s, 0],
      [-s, c, 0],
      [0, 0, 1]
    ];
  }

  function rotX(deg) {
    const a = deg * DEG;
    const c = Math.cos(a);
    const s = Math.sin(a);
    return [
      [1, 0, 0],
      [0, c, s],
      [0, -s, c]
    ];
  }

  function matMul(A, B) {
    const C = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0]
    ];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        C[i][j] = A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
      }
    }
    return C;
  }

  function apply(M, v) {
    return {
      x: M[0][0] * v.x + M[0][1] * v.y + M[0][2] * v.z,
      y: M[1][0] * v.x + M[1][1] * v.y + M[1][2] * v.z,
      z: M[2][0] * v.x + M[2][1] * v.y + M[2][2] * v.z
    };
  }

  function moonMatrix(date) {
    const axis = Astronomy.RotationAxis(Astronomy.Body.Moon, date);
    const raDeg = axis.ra * 15;
    return matMul(rotZ(axis.spin), matMul(rotX(90 - axis.dec), rotZ(90 + raDeg)));
  }

  function xyz(v) {
    return { x: v.x, y: v.y, z: v.z };
  }

  function scale(v, s) {
    return { x: v.x * s, y: v.y * s, z: v.z * s };
  }

  function sub(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  }

  function mag(v) {
    return Math.hypot(v.x, v.y, v.z);
  }

  function siteUnit(latDeg, lonDeg) {
    const lat = latDeg * DEG;
    const lon = lonDeg * DEG;
    const cl = Math.cos(lat);
    return {
      x: cl * Math.cos(lon),
      y: cl * Math.sin(lon),
      z: Math.sin(lat)
    };
  }

  function enu(latDeg, lonDeg) {
    const lat = latDeg * DEG;
    const lon = lonDeg * DEG;
    const sl = Math.sin(lat);
    const cl = Math.cos(lat);
    return {
      east: { x: -Math.sin(lon), y: Math.cos(lon), z: 0 },
      north: { x: -sl * Math.cos(lon), y: -sl * Math.sin(lon), z: cl },
      up: { x: cl * Math.cos(lon), y: cl * Math.sin(lon), z: sl }
    };
  }

  function dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }

  function altAz(vec, basis) {
    const r = mag(vec);
    const up = dot(vec, basis.up) / r;
    const east = dot(vec, basis.east) / r;
    const north = dot(vec, basis.north) / r;
    const alt = Math.asin(Math.max(-1, Math.min(1, up))) * RAD;
    let az = Math.atan2(east, north) * RAD;
    if (az < 0) az += 360;
    return { alt, az };
  }

  function angularRadius(radiusKm, distanceKm) {
    return Math.asin(Math.min(1, radiusKm / distanceKm)) * RAD;
  }

  function sphereLatLon(v) {
    const r = mag(v);
    return {
      lat: Math.asin(Math.max(-1, Math.min(1, v.z / r))) * RAD,
      lon: Math.atan2(v.y, v.x) * RAD
    };
  }

  function observe(date) {
    const when = date instanceof Date ? date : new Date(date);
    const R = moonMatrix(when);
    const sunEq = Astronomy.GeoVector(Astronomy.Body.Sun, when, false);
    const moonEq = Astronomy.GeoMoon(when);
    const sunFromMoon = scale(sub(xyz(sunEq), xyz(moonEq)), KM_PER_AU);
    const earthFromMoon = scale(xyz(moonEq), -KM_PER_AU);
    const sunBody = apply(R, sunFromMoon);
    const earthBody = apply(R, earthFromMoon);
    const subSolar = sphereLatLon(sunBody);
    const subEarth = sphereLatLon(earthBody);
    return {
      date: when,
      R,
      moonEqKm: scale(xyz(moonEq), KM_PER_AU),
      sunBody,
      earthBody,
      sunDistKm: mag(sunBody),
      earthDistKm: mag(earthBody),
      sunRadiusDeg: angularRadius(SUN_RADIUS_KM, mag(sunBody)),
      earthRadiusDeg: angularRadius(EARTH_RADIUS_KM, mag(earthBody)),
      subSolar,
      subEarth,
      irradiance: SOLAR_CONSTANT * Math.pow(KM_PER_AU / mag(sunBody), 2)
    };
  }

  function stationBody(latDeg, lonDeg, sky) {
    const gast = Astronomy.SiderealTime(sky.date) * 15 * DEG;
    const lat = latDeg * DEG;
    const lon = lonDeg * DEG;
    const cl = Math.cos(lat);
    const ecef = {
      x: cl * Math.cos(lon),
      y: cl * Math.sin(lon),
      z: Math.sin(lat)
    };
    const cg = Math.cos(gast);
    const sg = Math.sin(gast);
    const eqd = {
      x: ecef.x * cg - ecef.y * sg,
      y: ecef.x * sg + ecef.y * cg,
      z: ecef.z
    };
    let eqj = eqd;
    if (typeof Astronomy.Rotation_EQD_EQJ === "function") {
      const rot = Astronomy.Rotation_EQD_EQJ(sky.date);
      const rotated = Astronomy.RotateVector(rot, eqd);
      eqj = { x: rotated.x, y: rotated.y, z: rotated.z };
    }
    const fromMoonEq = sub(scale(eqj, EARTH_RADIUS_KM), sky.moonEqKm);
    return apply(sky.R, fromMoonEq);
  }

  function siteView(sky, latDeg, lonDeg) {
    const basis = enu(latDeg, lonDeg);
    const observer = scale(siteUnit(latDeg, lonDeg), MOON_RADIUS_KM);
    const sunVec = sub(sky.sunBody, observer);
    const earthVec = sub(sky.earthBody, observer);
    const sun = altAz(sunVec, basis);
    const earth = altAz(earthVec, basis);
    const stations = DSN.map((station) => {
      const vec = sub(stationBody(station.lat, station.lon, sky), observer);
      const look = altAz(vec, basis);
      return {
        id: station.id,
        name: station.name,
        alt: look.alt,
        az: look.az
      };
    });
    return {
      sun,
      earth,
      sunDistKm: mag(sunVec),
      earthDistKm: mag(earthVec),
      sunRadiusDeg: angularRadius(SUN_RADIUS_KM, mag(sunVec)),
      earthRadiusDeg: angularRadius(EARTH_RADIUS_KM, mag(earthVec)),
      stations
    };
  }

  function atSite(date, latDeg, lonDeg) {
    const sky = observe(date);
    const view = siteView(sky, latDeg, lonDeg);
    return Object.assign({ sky }, view);
  }

  function incidence(sunAltDeg, sunAzDeg, panel) {
    const alt = sunAltDeg * DEG;
    const tilt = (panel.tiltDeg == null ? 90 : panel.tiltDeg) * DEG;
    const tracking = panel.tracking !== false;
    const panelAz = (tracking ? sunAzDeg : panel.azimuthDeg || 0) * DEG;
    const daz = panelAz - sunAzDeg * DEG;
    const cosI = Math.sin(alt) * Math.cos(tilt) + Math.cos(alt) * Math.sin(tilt) * Math.cos(daz);
    return Math.max(0, Math.min(1, cosI));
  }

  function clamp01(x) {
    return Math.max(0, Math.min(1, x));
  }

  /* The horizon mask as a function of azimuth.
     Accepts a plain number for a uniform mask, or { profile, offsetDeg } where
     profile holds one elevation per azimuth bin, bin 0 at north, running
     clockwise. Bins are interpolated so the skyline has no 1 degree steps. */
  function maskResolver(maskDeg) {
    if (maskDeg && typeof maskDeg === "object" && Array.isArray(maskDeg.profile) && maskDeg.profile.length) {
      const profile = maskDeg.profile;
      const n = profile.length;
      const offset = Number(maskDeg.offsetDeg) || 0;
      return function (azDeg) {
        const az = (((Number(azDeg) || 0) % 360) + 360) % 360;
        const x = (az / 360) * n;
        const i0 = Math.floor(x);
        const f = x - i0;
        const a = profile[i0 % n];
        const b = profile[(i0 + 1) % n];
        return a + (b - a) * f + offset;
      };
    }
    const flat = Number(maskDeg) || 0;
    return function () {
      return flat;
    };
  }

  function evaluate(date, lat, lon, maskDeg, panel) {
    const sky = observe(date);
    const view = siteView(sky, lat, lon);
    const maskAt = maskResolver(maskDeg);
    const p = panel || { tiltDeg: 90, tracking: true, efficiency: 0.3 };
    const radius = view.sunRadiusDeg || 0.27;
    const maskSun = maskAt(view.sun.az);
    const maskEarth = maskAt(view.earth.az);
    const sunFrac = clamp01((view.sun.alt - maskSun + radius) / (2 * radius));
    const cosI = sunFrac > 0 ? incidence(view.sun.alt, view.sun.az, p) : 0;
    const eff = p.efficiency == null ? 0.3 : p.efficiency;
    // A station counts when it clears the skyline on its own bearing, so the
    // one to report is the one with the most clearance, not the highest one.
    let stationAlt = -Infinity;
    let maskLink = 0;
    let bestMargin = -Infinity;
    for (const station of view.stations) {
      const m = maskAt(station.az);
      const margin = station.alt - m;
      if (margin > bestMargin) {
        bestMargin = margin;
        stationAlt = station.alt;
        maskLink = m;
      }
    }
    return {
      t: sky.date.getTime(),
      sky,
      view,
      sunAlt: view.sun.alt,
      sunAz: view.sun.az,
      earthAlt: view.earth.alt,
      earthAz: view.earth.az,
      sunRadius: view.sunRadiusDeg,
      earthRadius: view.earthRadiusDeg,
      sunFrac,
      lit: sunFrac > 0,
      earthCenter: view.earth.alt > maskEarth,
      earthDisk: view.earth.alt + view.earthRadiusDeg > maskEarth,
      earthUp: view.earth.alt + view.earthRadiusDeg > maskEarth,
      stationUp: bestMargin > 0,
      stationAlt,
      dte: bestMargin > 0,
      joint: sunFrac > 0 && bestMargin > 0,
      maskSun,
      maskEarth,
      maskLink,
      irradiance: sky.irradiance,
      cosI,
      power: sky.irradiance * cosI * eff * sunFrac,
      subSolarLat: sky.subSolar.lat,
      subEarthLat: sky.subEarth.lat,
      subEarthLon: sky.subEarth.lon,
      stations: view.stations
    };
  }

  function stepMsFor(durationMs) {
    const hours = durationMs / 3600000;
    if (hours <= 48) return 10 * 60 * 1000;
    if (hours <= 24 * 45) return 30 * 60 * 1000;
    if (hours <= 24 * 200) return 2 * 3600000;
    return 6 * 3600000;
  }

  function sampleMission(start, durationMs, lat, lon, opts) {
    const options = opts || {};
    const step = options.stepMs || stepMsFor(durationMs);
    const mask = options.maskDeg || 0;
    const panel = options.panel || { tiltDeg: 90, tracking: true, efficiency: 0.3 };
    const t0 = start instanceof Date ? start.getTime() : new Date(start).getTime();
    if (!Number.isFinite(t0) || !Number.isFinite(durationMs) || durationMs < 0 ||
        !Number.isFinite(step) || step <= 0) {
      throw new RangeError("Mission requires a valid start, nonnegative finite duration, and positive finite step");
    }
    const samples = [];
    for (let t = t0; ; t += step) {
      const stamp = new Date(Math.min(t, t0 + durationMs));
      const point = evaluate(stamp, lat, lon, mask, panel);
      delete point.sky;
      delete point.view;
      samples.push(point);
      if (t >= t0 + durationMs) break;
    }
    return samples;
  }

  function longestRun(samples, pred) {
    let best = 0;
    let run = 0;
    let runStart = null;
    let bestStart = null;
    for (let i = 0; i < samples.length; i++) {
      if (pred(samples[i])) {
        if (run === 0) runStart = samples[i].t;
        const nextT = i + 1 < samples.length ? samples[i + 1].t : samples[i].t;
        const dt = i + 1 < samples.length ? nextT - samples[i].t : 0;
        run += dt;
        if (run > best) {
          best = run;
          bestStart = runStart;
        }
      } else {
        run = 0;
        runStart = null;
      }
    }
    return { ms: best, start: bestStart };
  }

  // Interpolate only the supplied samples; never recompute the sky while scrubbing.
  function eventsFromSamples(samples, fromMs, maskDeg = 0) {
    const events = { sunset: null, sunrise: null, earthset: null, earthrise: null, linkDown: null, linkUp: null };
    if (samples.length < 2 || !Number.isFinite(fromMs) ||
        fromMs < samples[0].t || fromMs >= samples[samples.length - 1].t) return events;
    // Each sample carries the mask that was actually resolved for the azimuth
    // each body sat at, so use that and fall back to the argument.
    const flat = Number(maskDeg) || 0;
    const maskOf = (sample, key) => (Number.isFinite(sample[key]) ? sample[key] : flat);
    const channels = [
      { value: (s) => s.sunAlt + s.sunRadius - maskOf(s, "maskSun"), down: "sunset", up: "sunrise" },
      { value: (s) => s.earthAlt + s.earthRadius - maskOf(s, "maskEarth"), down: "earthset", up: "earthrise" },
      { value: (s) => s.stationAlt - maskOf(s, "maskLink"), down: "linkDown", up: "linkUp" }
    ];
    let index = 0;
    while (samples[index + 1].t <= fromMs) index++;
    for (const channel of channels) {
      const a = samples[index];
      const b = samples[index + 1];
      const atPlayhead = channel.value(a) + (channel.value(b) - channel.value(a)) *
        ((fromMs - a.t) / (b.t - a.t));
      const wantRise = atPlayhead <= 0;
      const kind = wantRise ? channel.up : channel.down;
      for (let i = index; i < samples.length - 1; i++) {
        const before = channel.value(samples[i]);
        const after = channel.value(samples[i + 1]);
        const crosses = wantRise ? before <= 0 && after > 0 : before > 0 && after <= 0;
        if (!crosses) continue;
        const t = samples[i].t + (samples[i + 1].t - samples[i].t) * (-before / (after - before));
        if (t > fromMs) {
          events[kind] = { t, kind };
          break;
        }
      }
    }
    return events;
  }

  function integrate(samples, key) {
    let sum = 0;
    for (let i = 0; i < samples.length - 1; i++) {
      const dt = (samples[i + 1].t - samples[i].t) / 1000;
      sum += 0.5 * (samples[i][key] + samples[i + 1][key]) * dt;
    }
    return sum;
  }

  function fraction(samples, pred) {
    if (samples.length < 2) return 0;
    let held = 0;
    let total = 0;
    for (let i = 0; i < samples.length - 1; i++) {
      const dt = samples[i + 1].t - samples[i].t;
      total += dt;
      if (pred(samples[i]) || pred(samples[i + 1])) {
        if (pred(samples[i]) && pred(samples[i + 1])) held += dt;
        else held += dt * 0.5;
      }
    }
    return total > 0 ? held / total : 0;
  }

  function hoursBetween(samples, pred) {
    if (samples.length < 2) return 0;
    let held = 0;
    for (let i = 0; i < samples.length - 1; i++) {
      const dt = samples[i + 1].t - samples[i].t;
      if (pred(samples[i]) && pred(samples[i + 1])) held += dt;
      else if (pred(samples[i]) || pred(samples[i + 1])) held += dt * 0.5;
    }
    return held / 3600000;
  }

  function summarize(samples) {
    if (!samples.length) return null;
    const span = samples[samples.length - 1].t - samples[0].t;
    let sunMin = Infinity;
    let sunMax = -Infinity;
    let earthMin = Infinity;
    let earthMax = -Infinity;
    for (const s of samples) {
      sunMin = Math.min(sunMin, s.sunAlt);
      sunMax = Math.max(sunMax, s.sunAlt);
      earthMin = Math.min(earthMin, s.earthAlt);
      earthMax = Math.max(earthMax, s.earthAlt);
    }
    const energyJ = integrate(samples, "power");
    return {
      spanMs: span,
      sunlitHours: hoursBetween(samples, (s) => s.lit),
      sunlitFrac: fraction(samples, (s) => s.lit),
      earthHours: hoursBetween(samples, (s) => s.earthDisk),
      earthFrac: fraction(samples, (s) => s.earthDisk),
      dteHours: hoursBetween(samples, (s) => s.dte),
      dteFrac: fraction(samples, (s) => s.dte),
      jointHours: hoursBetween(samples, (s) => s.joint),
      jointFrac: fraction(samples, (s) => s.joint),
      longestNight: longestRun(samples, (s) => !s.lit),
      longestDay: longestRun(samples, (s) => s.lit),
      longestBlackout: longestRun(samples, (s) => !s.dte),
      longestLink: longestRun(samples, (s) => s.dte),
      sunMin,
      sunMax,
      earthMin,
      earthMax,
      energyWh: energyJ / 3600,
      meanPower: span > 0 ? energyJ / (span / 1000) : 0
    };
  }

  function nextCrossing(start, lat, lon, maskDeg, which, wantRise) {
    const t0 = start instanceof Date ? start.getTime() : new Date(start).getTime();
    const step = 30 * 60 * 1000;
    const limit = t0 + 400 * 86400000;
    const maskAt = maskResolver(maskDeg);
    const clearance = (look) => look.alt - maskAt(look.az);
    let prevT = t0;
    let prev = atSite(new Date(t0), lat, lon);
    let prevAlt = clearance(which === "earth" ? prev.earth : prev.sun);
    for (let t = t0 + step; t <= limit; t += step) {
      const cur = atSite(new Date(t), lat, lon);
      const alt = clearance(which === "earth" ? cur.earth : cur.sun);
      const before = prevAlt;
      const after = alt;
      const rising = before <= 0 && after > 0;
      const setting = before > 0 && after <= 0;
      if ((wantRise && rising) || (!wantRise && setting)) {
        let a = prevT;
        let b = t;
        for (let k = 0; k < 24; k++) {
          const m = 0.5 * (a + b);
          const mid = atSite(new Date(m), lat, lon);
          const mAlt = clearance(which === "earth" ? mid.earth : mid.sun);
          if ((mAlt > 0) === (after > 0)) b = m;
          else a = m;
        }
        return new Date(0.5 * (a + b));
      }
      prevT = t;
      prevAlt = alt;
    }
    return null;
  }

  function scanWindows(lat, lon, missionMs, from, opts) {
    const options = opts || {};
    const mask = options.maskDeg || 0;
    const panel = options.panel || { tiltDeg: 90, tracking: true, efficiency: 0.3 };
    const horizon = options.horizonDays || 370;
    const stepH = 6;
    const t0 = from instanceof Date ? from.getTime() : new Date(from).getTime();
    const gridStep = stepH * 3600000;
    const gridEnd = t0 + horizon * 86400000 + missionMs;
    const grid = [];
    for (let t = t0; t <= gridEnd; t += gridStep) {
      const point = evaluate(new Date(t), lat, lon, mask, panel);
      grid.push({
        t,
        lit: point.lit,
        earthUp: point.earthDisk,
        dte: point.dte,
        joint: point.joint,
        power: point.power
      });
    }
    const missionSteps = Math.max(1, Math.round(missionMs / gridStep));
    const ranked = [];
    for (let i = 0; i + missionSteps < grid.length; i += Math.max(1, Math.round(24 / stepH))) {
      let sun = 0;
      let earth = 0;
      let joint = 0;
      let energy = 0;
      let night = 0;
      let worstNight = 0;
      let blackout = 0;
      let worstBlackout = 0;
      for (let k = 0; k < missionSteps; k++) {
        const g = grid[i + k];
        if (g.lit) {
          sun++;
          night = 0;
        } else {
          night++;
          worstNight = Math.max(worstNight, night);
        }
        if (g.dte) {
          earth++;
          blackout = 0;
        } else {
          blackout++;
          worstBlackout = Math.max(worstBlackout, blackout);
        }
        if (g.joint) joint++;
        energy += g.power * stepH;
      }
      const n = missionSteps;
      ranked.push({
        start: grid[i].t,
        sunFrac: sun / n,
        dteFrac: earth / n,
        jointFrac: joint / n,
        energyWh: energy,
        longestNightH: worstNight * stepH,
        longestBlackoutH: worstBlackout * stepH,
        score: joint / n * 100 - worstNight * 0.15 - worstBlackout * 0.05
      });
    }
    ranked.sort((a, b) => b.score - a.score);
    return ranked.slice(0, 6);
  }

  const api = {
    DSN,
    MOON_RADIUS_KM,
    observe,
    siteView,
    atSite,
    evaluate,
    incidence,
    maskResolver,
    sampleMission,
    summarize,
    eventsFromSamples,
    nextCrossing,
    scanWindows,
    stepMsFor
  };

  root.LunarEph = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
