/* Lunar Horizon views.
   Pure canvas drawing. No DOM controls, no data fetching, no animation loop.
   Session 3 owns the model and calls these with sampleMission / evaluate output.
   Azimuth convention everywhere: 0 north, 90 east, clockwise, same as Horizons. */
(function (root) {
  const C = {
    bg: "#0c0b09",
    panel: "#11100d",
    ink: "#f4efe6",
    muted: "#a79d90",
    faint: "#6f675c",
    sun: "#f0a202",
    sun2: "#ffd27a",
    earth: "#3db7e8",
    earth2: "#b7e6f8",
    warn: "#e08a62",
    line: "rgba(243, 232, 214, 0.12)",
    lineStrong: "rgba(243, 232, 214, 0.3)",
    ground: "rgba(167, 157, 144, 0.12)",
    groundEdge: "rgba(244, 239, 230, 0.75)"
  };
  const SANS = '"Outfit", sans-serif';
  const MONO = '"IBM Plex Mono", ui-monospace, monospace';
  const DEG = Math.PI / 180;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function setup(canvas) {
    const dpr = root.devicePixelRatio || 1;
    const w = canvas.clientWidth || canvas.width / dpr || 300;
    const h = canvas.clientHeight || canvas.height / dpr || 150;
    const bw = Math.max(1, Math.round(w * dpr));
    const bh = Math.max(1, Math.round(h * dpr));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  function cssSize(canvas) {
    const dpr = root.devicePixelRatio || 1;
    return {
      w: canvas.clientWidth || canvas.width / dpr || 300,
      h: canvas.clientHeight || canvas.height / dpr || 150
    };
  }

  function text(ctx, str, x, y, opts) {
    const o = opts || {};
    ctx.save();
    ctx.font = (o.size || 11) + "px " + (o.mono ? MONO : SANS);
    ctx.fillStyle = o.color || C.muted;
    ctx.textAlign = o.align || "left";
    ctx.textBaseline = o.baseline || "alphabetic";
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  function niceStep(span, target) {
    if (!(span > 0)) return 1;
    const raw = span / Math.max(1, target);
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const r = raw / pow;
    const s = r < 1.5 ? 1 : r < 3.5 ? 2 : r < 7.5 ? 5 : 10;
    return s * pow;
  }

  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function fmtUTC(ms, withTime) {
    const d = new Date(ms);
    const date = MONTHS[d.getUTCMonth()] + " " + pad2(d.getUTCDate());
    if (!withTime) return date;
    return date + " " + pad2(d.getUTCHours()) + ":" + pad2(d.getUTCMinutes());
  }

  function dispAz(az) {
    // North at the horizontal center, east right of center, south on both edges.
    let a = (az + 180) % 360;
    if (a < 0) a += 360;
    return a;
  }

  /* ---------------- horizon ---------------- */

  /* The skyline elevation at one azimuth, degrees. profile holds one value per
     bin, bin 0 at north, clockwise; bins are interpolated. Kept local so these
     views stay free of any dependency on the ephemeris. */
  function maskAt(model, azDeg) {
    const offset = model.maskDeg || 0;
    const profile = model.maskProfile;
    if (!profile || !profile.length) return offset;
    const n = profile.length;
    const az = (((azDeg || 0) % 360) + 360) % 360;
    const x = (az / 360) * n;
    const i0 = Math.floor(x);
    const f = x - i0;
    const a = profile[i0 % n];
    const b = profile[(i0 + 1) % n];
    return a + (b - a) * f + offset;
  }

  function horizonRange(model) {
    const mask = model.maskDeg || 0;
    let lo = Math.min(0, mask);
    let hi = Math.max(0, mask);
    let any = false;
    for (const v of model.maskProfile || []) {
      lo = Math.min(lo, v + mask);
      hi = Math.max(hi, v + mask);
    }
    for (const site of model.sites || []) {
      for (const s of site.samples || []) {
        lo = Math.min(lo, s.sunAlt - s.sunRadius, s.earthAlt - s.earthRadius);
        hi = Math.max(hi, s.sunAlt + s.sunRadius, s.earthAlt + s.earthRadius);
        any = true;
      }
      const n = site.now;
      if (n) {
        lo = Math.min(lo, n.sunAlt - n.sunRadius, n.earthAlt - n.earthRadius);
        hi = Math.max(hi, n.sunAlt + n.sunRadius, n.earthAlt + n.earthRadius);
        any = true;
      }
    }
    if (!any) {
      lo = Math.min(lo, -10);
      hi = Math.max(hi, 10);
    }
    const pad = Math.max(0.5, (hi - lo) * 0.1);
    lo -= pad;
    hi += pad;
    return { lo, hi, zoomed: hi - lo < 30 };
  }

  function drawDisk(ctx, x, y, rPx, fill, ring, minPx) {
    const r = Math.max(rPx, minPx);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fillStyle = fill;
    ctx.fill();
    if (ring) {
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = ring;
      ctx.beginPath();
      ctx.arc(x, y, r + 2.4, 0, 2 * Math.PI);
      ctx.stroke();
    }
    ctx.restore();
    return r;
  }

  /* The skyline across the whole plot, left to right, in css pixels.
     Sampled every half degree of display azimuth, which is finer than the
     profile's own bins. */
  function skylinePath(model, x, y, pw, m) {
    const pts = [];
    const stepDeg = 0.5;
    for (let d = 0; d <= 360 + 1e-9; d += stepDeg) {
      const az = (d + 180) % 360;
      const el = maskAt(model, az);
      pts.push({ x: Math.min(m.left + pw, x(d)), y: y(el) });
    }
    return pts;
  }

  function drawHorizon(canvas, model) {
    const { ctx, w, h } = setup(canvas);
    const m = { left: 46, right: 14, top: 24, bottom: 28 };
    const pw = w - m.left - m.right;
    const ph = h - m.top - m.bottom;
    const mask = model.maskDeg || 0;
    const range = horizonRange(model);
    const y = (el) => m.top + ((range.hi - el) / (range.hi - range.lo)) * ph;
    const x = (d) => m.left + (d / 360) * pw;

    ctx.fillStyle = C.panel;
    ctx.fillRect(0, 0, w, h);

    // ground: translucent so bodies below the horizon stay readable
    const y0 = y(0);
    const skyline = model.maskProfile && model.maskProfile.length ? skylinePath(model, x, y, pw, m) : null;
    if (skyline) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(skyline[0].x, skyline[0].y);
      for (const p of skyline) ctx.lineTo(p.x, p.y);
      ctx.lineTo(m.left + pw, m.top + ph);
      ctx.lineTo(m.left, m.top + ph);
      ctx.closePath();
      ctx.clip();
      ctx.fillStyle = C.ground;
      ctx.fillRect(m.left, m.top, pw, ph);
      ctx.restore();
    } else if (y0 < m.top + ph) {
      ctx.fillStyle = C.ground;
      ctx.fillRect(m.left, Math.max(m.top, y0), pw, m.top + ph - Math.max(m.top, y0));
    }

    // elevation axis: tick interval follows the visible span (30° wide open,
    // 0.1° zoomed hard onto the horizon); the 0° line stays the anchor
    const step = niceStep(range.hi - range.lo, 5);
    ctx.lineWidth = 1;
    for (let el = Math.ceil(range.lo / step) * step; el <= range.hi + 1e-9; el += step) {
      const zero = Math.abs(el) < 1e-9;
      const yy = y(el);
      ctx.strokeStyle = C.line;
      ctx.beginPath();
      ctx.moveTo(m.left, yy);
      ctx.lineTo(m.left + pw, yy);
      ctx.stroke();
      const lab = zero ? "0°" : el.toFixed(step < 1 ? 1 : 0) + "°";
      text(ctx, lab, m.left - 6, yy + 3, { mono: true, align: "right", size: 10, color: zero ? C.ink : C.muted });
    }

    azimuthAxis(ctx, x, m, pw, ph);

    if (skyline) {
      // the sphere horizon stays as a faint reference, so the terrain reads as
      // a departure from it
      ctx.save();
      ctx.strokeStyle = C.faint;
      ctx.setLineDash([2, 5]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(m.left, y0);
      ctx.lineTo(m.left + pw, y0);
      ctx.stroke();
      ctx.restore();
      text(ctx, "sphere 0°", m.left + 4, y0 - 4, { mono: true, color: C.faint, size: 9 });

      ctx.save();
      ctx.strokeStyle = C.groundEdge;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      skyline.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
      ctx.restore();
      const label = "LOLA skyline" + (Math.abs(mask) > 1e-9 ? " + " + mask.toFixed(1) + "°" : "");
      text(ctx, label, m.left + pw - 4, m.top + ph - 6, { mono: true, align: "right", color: C.groundEdge, size: 10 });
    } else {
      // horizon: a hard line, no atmosphere
      ctx.strokeStyle = C.groundEdge;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(m.left, y0);
      ctx.lineTo(m.left + pw, y0);
      ctx.stroke();

      // mask, dashed
      const ym = y(mask);
      ctx.save();
      ctx.strokeStyle = C.warn;
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(m.left, ym);
      ctx.lineTo(m.left + pw, ym);
      ctx.stroke();
      ctx.restore();
      if (Math.abs(mask) > 1e-9) {
        text(ctx, "mask " + mask.toFixed(1) + "°", m.left + pw - 4, ym - 4, { mono: true, align: "right", color: C.warn, size: 10 });
      }
    }

    // traces, faded old-to-new so the sweep direction reads
    const sites = model.sites || [];
    const primaryIdx = Math.max(0, sites.findIndex((s) => s.id === model.primaryId));
    const placedEarly = [];
    sites.forEach((site, i) => {
      const primary = i === primaryIdx;
      const alpha = primary ? 0.9 : 0.4;
      trail(ctx, site.samples, (s) => s.sunAlt, (s) => s.sunAz, x, y, C.sun, primary ? 1.6 : 1.1, alpha, null, true);
      trail(ctx, site.samples, (s) => s.earthAlt, (s) => s.earthAz, x, y, C.earth, primary ? 1.6 : 1.1, alpha, [4, 4], true);
      if (!primary) return;
      const spanDays = site.samples && site.samples.length > 1
        ? (site.samples[site.samples.length - 1].t - site.samples[0].t) / 86400000 : 0;
      const labelDays = spanDays > 60 ? 10 : spanDays > 12 ? 5 : spanDays > 4 ? 2 : 1;
      traceTicks(ctx, site.samples, (s) => s.sunAlt, (s) => s.sunAz, x, y, C.sun2, labelDays, placedEarly);
      traceTicks(ctx, site.samples, (s) => s.earthAlt, (s) => s.earthAz, x, y, C.earth2, 0, placedEarly);
      // Earth's monthly figure IS the libration wobble; name it once.
      if (spanDays >= 20 && range.zoomed && site.samples.length) {
        let sx = 0, sy = 0, cnt = 0, loE = Infinity, hiE = -Infinity;
        for (const s of site.samples) {
          sx += x(dispAz(s.earthAz));
          sy += y(s.earthAlt);
          loE = Math.min(loE, s.earthAlt);
          hiE = Math.max(hiE, s.earthAlt);
          cnt++;
        }
        if (cnt && hiE - loE < 25) {
          labelNear(ctx, placedEarly, "Earth’s monthly loop = libration", sx / cnt + 10, sy / cnt, C.earth2, "left", 9);
        }
      }
    });

    // rise/set crossings against the real skyline, from the engine when present
    const primarySite = sites[primaryIdx];
    const events = primarySite ? siteEvents(primarySite, model) : [];
    events.forEach((ev, idx) => {
      const ex = x(dispAz(ev.azDeg));
      const ey = y(ev.altDeg);
      const color = ev.body === "sun" ? C.sun : C.earth;
      const up = ev.kind === "rise";
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(ex, ey + (up ? 4 : -4));
      ctx.lineTo(ex - 4, ey + (up ? -3 : 3));
      ctx.lineTo(ex + 4, ey + (up ? -3 : 3));
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.95;
      ctx.fill();
      ctx.restore();
      if (idx < 8) {
        const word = ev.body === "sun" ? (up ? "sunrise" : "sunset") : (up ? "earthrise" : "earthset");
        labelNear(ctx, placedEarly, word + " " + ev.azDeg.toFixed(1) + "°", ex + 6, ey + (up ? -10 : 12), color, "left", 9);
      }
    });

    // what the skyline is made of, when the engine can name it
    if (skyline && primarySite) {
      for (const a of skylineAttribution(model, primarySite)) {
        labelNear(ctx, placedEarly, a.name, x(dispAz(a.az)), y(a.el) - 8, C.groundEdge, "center", 9);
      }
    }

    // disks at the playhead, true angular size on the elevation scale
    const pxPerDeg = ph / (range.hi - range.lo);
    let enlarged = false;
    const placed = placedEarly;
    sites.forEach((site, i) => {
      const n = site.now;
      if (!n) return;
      const ring = sites.length > 1 ? site.color : null;
      const se = { x: x(dispAz(n.earthAz)), y: y(n.earthAlt), r: n.earthRadius * pxPerDeg };
      const ss = { x: x(dispAz(n.sunAz)), y: y(n.sunAlt), r: n.sunRadius * pxPerDeg };
      if (se.r < 6 || ss.r < 6) enlarged = true;
      const re = drawDisk(ctx, se.x, se.y, se.r, C.earth, ring, 6);
      const rs = drawDisk(ctx, ss.x, ss.y, ss.r, C.sun, ring, 6);
      if (sites.length > 1) {
        labelNear(ctx, placed, site.short || site.name || site.id, ss.x + rs + 5, ss.y, site.color);
      }
      if (i === primaryIdx) {
        labelNear(ctx, placed, "Sun", ss.x, ss.y - rs - 6, C.sun2, "center");
        labelNear(ctx, placed, "Earth", se.x, se.y - re - 6, C.earth2, "center");
      }
    });

    // captions
    const caps = [];
    if (range.zoomed) caps.push("Zoomed to the horizon");
    if (enlarged) caps.push("Disks enlarged");
    text(ctx, caps.join(" · "), w - m.right, 15, { align: "right", color: C.faint, size: 10 });
    text(ctx, "elevation °", m.left - 36, 15, { color: C.faint, size: 10 });
  }

  /* Azimuth axis: major ticks and gridlines every 30°, minor ticks every 10°,
     cardinal letters emphasised. x() takes DISPLAY azimuth (0 = south edge). */
  function azimuthAxis(ctx, x, m, pw, ph) {
    const axisY = m.top + ph;
    const CARD = { 0: "N", 90: "E", 180: "S", 270: "W" };
    const labelEvery = pw / 12 >= 40 ? 30 : 90;
    ctx.lineWidth = 1;
    for (let d = 0; d <= 360; d += 10) {
      const xx = x(d);
      const major = d % 30 === 0;
      if (major) {
        ctx.strokeStyle = C.line;
        ctx.beginPath();
        ctx.moveTo(xx, m.top);
        ctx.lineTo(xx, axisY);
        ctx.stroke();
      }
      ctx.strokeStyle = major ? C.lineStrong : C.line;
      ctx.beginPath();
      ctx.moveTo(xx, axisY);
      ctx.lineTo(xx, axisY + (major ? 5 : 3));
      ctx.stroke();
      if (d % labelEvery !== 0 || d === 360 && labelEvery === 30) continue;
      const az = (d + 180) % 360;
      const card = CARD[az];
      if (card) {
        text(ctx, az + "° " + card, xx, axisY + 16, { align: "center", color: C.ink, size: 10 });
      } else {
        text(ctx, az + "°", xx, axisY + 15, { mono: true, align: "center", color: C.faint, size: 9 });
      }
    }
  }

  /* Trace of one body across the window, faded from old to new so the sweep
     direction is readable, broken where the display azimuth wraps. */
  function trail(ctx, samples, getAlt, getAz, x, y, color, width, alpha, dash, fade) {
    if (!samples || samples.length < 2) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    if (dash) ctx.setLineDash(dash);
    const n = samples.length - 1;
    let prev = null;
    let prevPt = null;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const d = dispAz(getAz(s));
      const pt = { x: x(d), y: y(getAlt(s)) };
      if (prev !== null && Math.abs(d - prev) <= 180) {
        ctx.globalAlpha = fade ? alpha * (0.18 + 0.82 * (i / n)) : alpha;
        ctx.beginPath();
        ctx.moveTo(prevPt.x, prevPt.y);
        ctx.lineTo(pt.x, pt.y);
        ctx.stroke();
      }
      prev = d;
      prevPt = pt;
    }
    ctx.restore();
  }

  /* 24-hour ticks along a trace, with small date labels every labelDays days.
     Returns nothing; skips ticks that land on an azimuth wrap. */
  function traceTicks(ctx, samples, getAlt, getAz, x, y, color, labelDays, placed) {
    if (!samples || samples.length < 2) return;
    const t0 = samples[0].t;
    const t1 = samples[samples.length - 1].t;
    const DAY = 86400000;
    let k = 0;
    for (let t = Math.ceil(t0 / DAY) * DAY; t <= t1; t += DAY, k++) {
      let i = 0;
      while (i < samples.length - 1 && samples[i + 1].t <= t) i++;
      const a = samples[i];
      const b = samples[Math.min(i + 1, samples.length - 1)];
      if (b.t <= a.t) continue;
      const da = dispAz(getAz(a));
      const db = dispAz(getAz(b));
      if (Math.abs(db - da) > 180) continue;
      const f = (t - a.t) / (b.t - a.t);
      if (f < 0 || f > 1) continue;
      const px = x(da + (db - da) * f);
      const py = y(getAlt(a) + (getAlt(b) - getAlt(a)) * f);
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(px, py, 1.8, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();
      if (labelDays && k % labelDays === 0) {
        labelNear(ctx, placed, fmtUTC(t), px + 4, py - 5, C.faint, "left", 8.5);
      }
    }
  }

  /* Rise/set events for one site from LunarEph.horizonEvents, when Session A
     has shipped it; cached because the solver bisects. Degrades to []. */
  const eventCache = { key: null, events: null };

  function siteEvents(site, model) {
    const eph = root.LunarEph;
    if (!eph || typeof eph.horizonEvents !== "function") return [];
    const samples = site.samples || [];
    if (samples.length < 2) return [];
    const t0 = samples[0].t;
    const t1 = samples[samples.length - 1].t;
    const hasProfile = !!(site.terrain && site.terrain.profile && site.terrain.profile.length);
    const key = [site.id, t0, t1, model.maskDeg || 0, hasProfile].join("|");
    if (eventCache.key === key) return eventCache.events;
    const mask = hasProfile
      ? { profile: site.terrain.profile, offsetDeg: model.maskDeg || 0 }
      : model.maskDeg || 0;
    let events = [];
    try {
      for (const body of ["sun", "earth"]) {
        const list = eph.horizonEvents(new Date(t0), t1 - t0, site.lat, site.lon, { maskDeg: mask, body: body }) || [];
        for (const e of list) events.push({ body: body, kind: e.kind, t: e.t, azDeg: e.azDeg, altDeg: e.altDeg });
      }
    } catch (err) {
      events = [];
    }
    eventCache.key = key;
    eventCache.events = events;
    return events;
  }

  /* Which named feature makes the skyline at its peaks, via Session A's
     featureAtAzimuth. Cached; degrades to no labels. */
  const attribCache = { key: null, labels: null };

  function skylineAttribution(model, site) {
    const eph = root.LunarEph;
    if (!eph || typeof eph.featureAtAzimuth !== "function") return [];
    const profile = model.maskProfile;
    if (!profile || !profile.length) return [];
    const key = [site.id, model.maskDeg || 0, profile.length].join("|");
    if (attribCache.key === key) return attribCache.labels;
    const n = profile.length;
    const peaks = [];
    for (let i = 0; i < n; i++) {
      const prev = profile[(i + n - 1) % n];
      const next = profile[(i + 1) % n];
      if (profile[i] >= prev && profile[i] > next) peaks.push({ az: (i / n) * 360, el: profile[i] });
    }
    peaks.sort((a, b) => b.el - a.el);
    const chosen = [];
    for (const p of peaks) {
      if (chosen.length >= 4 || p.el < 0.5) break;
      const clash = chosen.some((c) => {
        const d = Math.abs(c.az - p.az) % 360;
        return Math.min(d, 360 - d) < 30;
      });
      if (!clash) chosen.push(p);
    }
    const labels = [];
    for (const p of chosen) {
      let f = null;
      try {
        f = eph.featureAtAzimuth(site.lat, site.lon, p.az, { maskDeg: model.maskDeg || 0 });
      } catch (err) {
        f = null;
      }
      // an unnamed ridge stays unnamed — only label real answers
      if (f && f.name) labels.push({ az: p.az, el: p.el + (model.maskDeg || 0), name: f.name });
    }
    attribCache.key = key;
    attribCache.labels = labels;
    return labels;
  }

  function labelNear(ctx, placed, str, px, py, color, align, size) {
    // nudge down until the label stops overlapping ones already placed
    let yy = py;
    for (let guard = 0; guard < 12; guard++) {
      const clash = placed.some((p) => Math.abs(p.x - px) < 46 && Math.abs(p.y - yy) < 12);
      if (!clash) break;
      yy += 12;
    }
    placed.push({ x: px, y: yy });
    text(ctx, str, px, yy + 3, { color: color || C.muted, align: align || "left", size: size || 10 });
  }

  /* ---------------- chart ---------------- */

  function drawChart(canvas, model) {
    const { ctx, w, h } = setup(canvas);
    const m = { left: 46, right: 14, top: 16, bottom: 30 };
    const pw = w - m.left - m.right;
    const ph = h - m.top - m.bottom;
    const mask = model.maskDeg || 0;
    const sites = model.sites || [];

    ctx.fillStyle = C.panel;
    ctx.fillRect(0, 0, w, h);

    let t0 = Infinity;
    let t1 = -Infinity;
    let lo = Math.min(0, mask);
    let hi = Math.max(0, mask);
    let any = false;
    for (const site of sites) {
      for (const s of site.samples || []) {
        t0 = Math.min(t0, s.t);
        t1 = Math.max(t1, s.t);
        lo = Math.min(lo, s.sunAlt, s.earthAlt);
        hi = Math.max(hi, s.sunAlt, s.earthAlt);
        if (Number.isFinite(s.maskSun)) {
          // the threshold has to stay on screen or the crossings read wrong
          lo = Math.min(lo, s.maskSun);
          hi = Math.max(hi, s.maskSun);
        }
        any = true;
      }
    }
    if (!any) {
      text(ctx, "no samples", w / 2, h / 2, { align: "center" });
      return;
    }
    const padY = Math.max(0.5, (hi - lo) * 0.08);
    lo -= padY;
    hi += padY;
    const x = (t) => m.left + ((t - t0) / Math.max(1, t1 - t0)) * pw;
    const y = (el) => m.top + ((hi - el) / (hi - lo)) * ph;

    // ground shade below elevation 0
    const y0 = y(0);
    if (y0 < m.top + ph) {
      ctx.fillStyle = C.ground;
      ctx.fillRect(m.left, Math.max(m.top, y0), pw, m.top + ph - Math.max(m.top, y0));
    }

    // elevation grid
    const stepE = niceStep(hi - lo, 5);
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1;
    for (let el = Math.ceil(lo / stepE) * stepE; el <= hi; el += stepE) {
      const yy = y(el);
      ctx.beginPath();
      ctx.moveTo(m.left, yy);
      ctx.lineTo(m.left + pw, yy);
      ctx.stroke();
      text(ctx, (Math.abs(el) < 1e-9 ? "0" : el.toFixed(stepE < 1 ? 1 : 0)) + "°", m.left - 6, yy + 3, { mono: true, align: "right", size: 10 });
    }

    // time grid, UTC
    const spanMs = t1 - t0;
    const stepsMs = [3600000, 3 * 3600000, 6 * 3600000, 12 * 3600000, 86400000, 2 * 86400000, 5 * 86400000, 10 * 86400000, 30 * 86400000, 90 * 86400000];
    let stepT = stepsMs[stepsMs.length - 1];
    for (const s of stepsMs) {
      if (spanMs / s <= 7) {
        stepT = s;
        break;
      }
    }
    for (let t = Math.ceil(t0 / stepT) * stepT; t <= t1; t += stepT) {
      const xx = x(t);
      ctx.strokeStyle = C.line;
      ctx.beginPath();
      ctx.moveTo(xx, m.top);
      ctx.lineTo(xx, m.top + ph);
      ctx.stroke();
      text(ctx, fmtUTC(t, stepT < 86400000), xx, h - 12, { mono: true, align: "center", size: 10 });
    }
    text(ctx, "UTC", w - m.right, h - 2, { align: "right", color: C.faint, size: 9 });

    // horizon and mask
    ctx.strokeStyle = C.groundEdge;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(m.left, y0);
    ctx.lineTo(m.left + pw, y0);
    ctx.stroke();
    const primaryIdx = Math.max(0, sites.findIndex((s) => s.id === model.primaryId));

    /* Eclipse bands. The samples already carry the obscuration, and ephemeris.js
       injects five-minute samples through every eclipse, so a four-hour event
       survives a year-long grid. It is still a thousandth of that grid wide, so
       the band takes a 3 px floor: otherwise the one total outage a planner can
       predict years ahead would be a sub-pixel gap in the Sun trace. */
    const runs = eclipseRuns(sites[primaryIdx]);
    let lastLabelX = -Infinity;
    for (const run of runs) {
      const xa = x(run.startMs);
      const bw = Math.max(3, x(run.endMs) - xa);
      ctx.fillStyle = "rgba(61, 183, 232, 0.2)";
      ctx.fillRect(xa, m.top, bw, ph);
      ctx.fillStyle = C.earth;
      ctx.fillRect(xa, m.top, bw, 2);
      const cx = xa + bw / 2;
      if (cx - lastLabelX > 58) {
        text(ctx, Math.round(run.max * 100) + "%", cx, m.top + 14,
          { mono: true, align: "center", color: C.earth2, size: 10 });
        lastLabelX = cx;
      }
    }

    // The threshold the Sun actually crosses. With a terrain profile that is
    // the skyline on the Sun's own bearing, which moves through the mission,
    // so plot the series the samples carry rather than one flat line.
    const lead = sites[primaryIdx];
    const varying = lead && (lead.samples || []).some((s) => Number.isFinite(s.maskSun));
    ctx.save();
    ctx.strokeStyle = C.warn;
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.2;
    if (varying) {
      ctx.beginPath();
      lead.samples.forEach((s, i) => {
        const py = y(Number.isFinite(s.maskSun) ? s.maskSun : mask);
        if (i === 0) ctx.moveTo(x(s.t), py);
        else ctx.lineTo(x(s.t), py);
      });
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(m.left, y(mask));
      ctx.lineTo(m.left + pw, y(mask));
      ctx.stroke();
    }
    ctx.restore();

    // primary sun filled between the curve and the horizon
    const prim = sites[primaryIdx];
    if (prim && prim.samples && prim.samples.length > 1) {
      ctx.save();
      ctx.beginPath();
      prim.samples.forEach((s, i) => {
        if (i === 0) ctx.moveTo(x(s.t), y(s.sunAlt));
        else ctx.lineTo(x(s.t), y(s.sunAlt));
      });
      ctx.lineTo(x(prim.samples[prim.samples.length - 1].t), y0);
      ctx.lineTo(x(prim.samples[0].t), y0);
      ctx.closePath();
      ctx.fillStyle = "rgba(240, 162, 2, 0.16)";
      ctx.fill();
      ctx.restore();
    }

    // lines: suns solid, earths dashed
    sites.forEach((site, i) => {
      const pts = site.samples || [];
      if (pts.length < 2) return;
      const primary = i === primaryIdx;
      line(ctx, pts, (s) => s.sunAlt, x, y, primary ? C.sun : site.color, primary ? 1.8 : 1.2, null);
      line(ctx, pts, (s) => s.earthAlt, x, y, primary ? C.earth : site.color, primary ? 1.8 : 1.2, [4, 4]);
    });

    // landing tick
    if (model.landingMs >= t0 && model.landingMs <= t1) {
      const xx = x(model.landingMs);
      ctx.fillStyle = C.muted;
      ctx.beginPath();
      ctx.moveTo(xx - 4, m.top + ph);
      ctx.lineTo(xx + 4, m.top + ph);
      ctx.lineTo(xx, m.top + ph - 6);
      ctx.closePath();
      ctx.fill();
    }

    // playhead
    if (model.playheadMs >= t0 && model.playheadMs <= t1) {
      const xx = x(model.playheadMs);
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(xx, m.top);
      ctx.lineTo(xx, m.top + ph);
      ctx.stroke();
      text(ctx, fmtUTC(model.playheadMs, true), Math.min(xx + 4, w - 90), m.top + ph - 8, { mono: true, color: C.ink, size: 10 });
    }

    // legend
    text(ctx, "— Sun", m.left + 4, m.top + 12, { color: C.sun, size: 10 });
    text(ctx, "┄ Earth", m.left + 46, m.top + 12, { color: C.earth, size: 10 });
    if (runs.length) {
      text(ctx, "▮ Earth over the Sun", m.left + 100, m.top + 12, { color: C.earth2, size: 10 });
    }
  }

  /* Contiguous stretches where Earth covers any part of the Sun, with the peak
     each one reaches. Read off the samples rather than recomputed, so the chart
     can never disagree with the readout standing next to it. */
  function eclipseRuns(site) {
    const out = [];
    let run = null;
    for (const s of (site && site.samples) || []) {
      const ob = s.eclipseObscuration || 0;
      if (ob > 0) {
        if (!run) run = { startMs: s.t, endMs: s.t, max: ob };
        else {
          run.endMs = s.t;
          run.max = Math.max(run.max, ob);
        }
      } else if (run) {
        run.endMs = s.t;
        out.push(run);
        run = null;
      }
    }
    if (run) out.push(run);
    return out;
  }

  function line(ctx, pts, getV, x, y, color, width, dash) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    pts.forEach((s, i) => {
      if (i === 0) ctx.moveTo(x(s.t), y(getV(s)));
      else ctx.lineTo(x(s.t), y(getV(s)));
    });
    ctx.stroke();
    ctx.restore();
  }

  /* ---------------- map ---------------- */

  const KM_PER_DEG = 1737.4 * Math.PI / 180; // great-circle km per degree, 30.32

  function resolveMode(mode, sites) {
    if (mode === "polar" || mode === "near") return mode;
    const all = (sites || []).length > 0 && sites.every((s) => s.lat < -75);
    return all ? "polar" : "near";
  }

  function polarSpanDeg(sites) {
    // degrees of colatitude from the south pole to the rim of the plot
    let maxColat = 0;
    let allPolar = true;
    for (const s of sites || []) {
      maxColat = Math.max(maxColat, 90 + s.lat);
      if (s.lat >= -75) allPolar = false;
    }
    if (!sites || !sites.length || (allPolar && maxColat <= 13)) return 15;
    if (allPolar) return Math.min(178, maxColat * 1.15 + 1);
    return Math.min(178, maxColat * 1.12 + 2);
  }

  function mapFrame(width, height) {
    const margin = 30;
    const R = Math.max(10, Math.min(width, height) / 2 - margin);
    return { cx: width / 2, cy: height / 2, R };
  }

  /* Pan/zoom state lives on the canvas, like the globe camera, so drawMap stays
     a pure function of (canvas, model). zoom 1 / pan 0 reproduces the old
     static framing exactly, so the app works unchanged until it calls attachMap. */
  function mapView(canvas) {
    if (!canvas._mapView) canvas._mapView = { zoom: 1, panX: 0, panY: 0 };
    return canvas._mapView;
  }

  // Screen transform applied on top of the base projection (uniform scale+pan).
  function xform(view, cx, cy) {
    const z = view.zoom;
    const tx = cx * (1 - z) + view.panX;
    const ty = cy * (1 - z) + view.panY;
    return {
      z,
      fwd: (p) => ({ x: p.x * z + tx, y: p.y * z + ty, front: p.front }),
      inv: (X, Y) => ({ x: (X - tx) / z, y: (Y - ty) / z })
    };
  }

  // Pure BASE projection, css pixels, before pan/zoom. mode may be
  // "auto" | "polar" | "near"; sites set the polar span and resolve "auto".
  function project(lat, lon, mode, width, height, sites) {
    const resolved = resolveMode(mode, sites);
    const f = mapFrame(width, height);
    if (resolved === "polar") {
      const span = polarSpanDeg(sites);
      const rhoMax = Math.tan((span / 2) * DEG);
      const rho = Math.tan(((90 + lat) / 2) * DEG) / rhoMax * f.R;
      // longitude 0 at the top (mean-Earth direction), east longitudes clockwise
      return {
        x: f.cx + rho * Math.sin(lon * DEG),
        y: f.cy - rho * Math.cos(lon * DEG),
        front: 90 + lat <= span + 1e-9
      };
    }
    // near side, equirectangular: lon −90…90 east-right, lat −90…90 north-up.
    // Scale is true along meridians; east–west stretches toward the poles.
    const k = f.R / 90;
    const wrapped = ((lon + 180) % 360 + 360) % 360 - 180;
    const front = Math.abs(wrapped) <= 90;
    // park far-side sites on the frame edge in the right direction
    const lo = front ? wrapped : wrapped > 0 ? 90 : -90;
    return { x: f.cx + lo * k, y: f.cy - lat * k, front };
  }

  /* Inverse of the base projection for the visible point at screen centre;
     used for the scale bar and the graticule regrade. */
  function unprojectBase(bx, by, mode, width, height, sites) {
    const resolved = resolveMode(mode, sites);
    const f = mapFrame(width, height);
    if (resolved === "polar") {
      const span = polarSpanDeg(sites);
      const rhoMax = Math.tan((span / 2) * DEG);
      const rho = Math.hypot(bx - f.cx, by - f.cy) / f.R * rhoMax;
      const colat = 2 * Math.atan(rho) / DEG;
      const lon = Math.atan2(bx - f.cx, f.cy - by) / DEG;
      return { lat: colat - 90, lon };
    }
    const k = f.R / 90;
    return { lat: (f.cy - by) / k, lon: (bx - f.cx) / k };
  }

  /* km of lunar surface per screen pixel at the view centre. */
  function kmPerPixel(canvas, model) {
    const { w, h } = cssSize(canvas);
    const sites = (model && model.sites) || [];
    const mode = resolveMode(model && model.mapMode, sites);
    const view = mapView(canvas);
    const T = xform(view, w / 2, h / 2);
    const b = T.inv(w / 2, h / 2);
    const c = unprojectBase(b.x, b.y, mode, w, h, sites);
    const lat = Math.max(-89.95, Math.min(89.95, c.lat));
    const p1 = T.fwd(project(lat - 0.05, c.lon, mode, w, h, sites));
    const p2 = T.fwd(project(lat + 0.05, c.lon, mode, w, h, sites));
    const px = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    return px > 0 ? (0.1 * KM_PER_DEG) / px : Infinity;
  }

  /* ---------- basemap (feature-detected, optional) ---------- */

  /* basemap.js ships window.LUNAR_BASEMAP = { src: dataURI, width, height,
     source } — an equirectangular mosaic as a classic script. A data: URI is
     same-origin, so sampling it can never taint a canvas. */
  const bm = { img: null, data: null, tried: false, polarKey: null, polarBuf: null, polarN: 0, refineTimer: null };

  function basemapImage() {
    const def = root.LUNAR_BASEMAP;
    if (!def || !def.src) return null;
    if (!bm.tried) {
      bm.tried = true;
      const img = new Image();
      img.onload = () => {
        bm.img = img;
        try {
          if (root.document && root.document.createEvent) {
            root.dispatchEvent(new Event("lunar-basemap-ready"));
          }
        } catch (e) { /* older engines: the next redraw picks it up */ }
      };
      img.src = def.src;
    }
    return bm.img;
  }

  function basemapData() {
    const img = basemapImage();
    if (!img) return null;
    if (!bm.data) {
      const cv = root.document.createElement("canvas");
      cv.width = img.naturalWidth;
      cv.height = img.naturalHeight;
      const cx = cv.getContext("2d");
      cx.drawImage(img, 0, 0);
      bm.data = { px: cx.getImageData(0, 0, cv.width, cv.height), w: cv.width, h: cv.height };
    }
    return bm.data;
  }

  /* A pan or a zoom is a fresh resample, so the sharp buffer cannot be built
     inside the drag. Paint coarse now, ask for sharp once the hand stops. */
  function schedulePolarRefine() {
    if (bm.refineTimer) return;
    bm.refineTimer = root.setTimeout(() => {
      bm.refineTimer = null;
      try { root.dispatchEvent(new Event("lunar-basemap-ready")); } catch (e) { /* stays coarse */ }
    }, 120);
  }

  /* Polar basemap: resample the equirectangular source through the inverse
     stereographic into a buffer cached per view.

     The buffer is then stretched over the whole map, so its size is the
     resolution on screen — a fixed 320 was a four-fold upscale on a retina
     display and read as a smudge. Match the device pixels the map covers
     instead, and stop at 1024: the source has 1024 rows across 180° of
     latitude, about 5 km a row, and no amount of zoom invents more. */
  const POLAR_COARSE = 320;
  const POLAR_MAX = 1024;

  function polarBasemap(canvas, w, h, sites, view) {
    const src = basemapData();
    if (!src) return null;
    const dpr = root.devicePixelRatio || 1;
    const want = Math.max(POLAR_COARSE, Math.min(POLAR_MAX, Math.ceil(Math.max(w, h) * dpr / 64) * 64));
    const key = [w, h, polarSpanDeg(sites).toFixed(2), view.zoom.toFixed(3), view.panX.toFixed(1), view.panY.toFixed(1)].join("|");
    if (bm.polarKey === key && bm.polarN >= want) return bm.polarBuf;
    const N = bm.polarKey === key ? want : POLAR_COARSE;
    if (!bm.polarBuf) {
      bm.polarBuf = root.document.createElement("canvas");
    }
    bm.polarBuf.width = N;
    bm.polarBuf.height = N;
    const bctx = bm.polarBuf.getContext("2d");
    const out = bctx.createImageData(N, N);
    const T = xform(view, w / 2, h / 2);
    const d = src.px.data;
    for (let py = 0; py < N; py++) {
      const Y = (py + 0.5) / N * h;
      for (let px = 0; px < N; px++) {
        const X = (px + 0.5) / N * w;
        const b = T.inv(X, Y);
        const g = unprojectBase(b.x, b.y, "polar", w, h, sites);
        const o = (py * N + px) * 4;
        if (g.lat < -90 || g.lat > 90) { out.data[o + 3] = 0; continue; }
        const sx = Math.min(src.w - 1, Math.max(0, Math.round((((g.lon + 540) % 360) / 360) * src.w)));
        const sy = Math.min(src.h - 1, Math.max(0, Math.round(((90 - g.lat) / 180) * src.h)));
        const so = (sy * src.w + sx) * 4;
        out.data[o] = d[so];
        out.data[o + 1] = d[so + 1];
        out.data[o + 2] = d[so + 2];
        out.data[o + 3] = 255;
      }
    }
    bctx.putImageData(out, 0, 0);
    bm.polarKey = key;
    bm.polarN = N;
    if (N < want) schedulePolarRefine();
    return bm.polarBuf;
  }

  /* ---------- named features (feature-detected, optional) ---------- */

  function mapFeatures(ctx, model, mode, w, h, sites, T, kmPx, placed) {
    const cat = root.LUNAR_FEATURES;
    if (!cat || !cat.features || !cat.features.length) return;
    const list = cat.features.slice().sort((a, b) => (b.diamKm || 0) - (a.diamKm || 0));
    let labels = 0;
    for (const ft of list) {
      if (labels >= 14) break;
      const diamPx = (ft.diamKm || 0) / kmPx;
      if (diamPx < 16) continue; // zoom-dependent threshold
      const p = T.fwd(project(ft.lat, ft.lon, mode, w, h, sites));
      if (!p.front) continue;
      if (p.x < -40 || p.x > w + 40 || p.y < -40 || p.y > h + 40) continue;
      ctx.save();
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.arc(p.x, p.y, diamPx / 2, 0, 2 * Math.PI);
      ctx.strokeStyle = C.muted;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 4]);
      ctx.stroke();
      ctx.restore();
      labelNear(ctx, placed, ft.name, p.x, p.y - diamPx / 2 - 4, C.muted, "center", 9);
      labels++;
    }
  }

  const GRAT_STEPS = [30, 10, 5, 2, 1, 0.5, 0.2, 0.1];

  function gratStep(effSpanDeg) {
    for (const s of GRAT_STEPS) {
      if (effSpanDeg / s >= 2.5) return s;
    }
    return 0.1;
  }

  function drawMap(canvas, model) {
    const { ctx, w, h } = setup(canvas);
    const sites = model.sites || [];
    const mode = resolveMode(model.mapMode, sites);
    const f = mapFrame(w, h);
    const view = mapView(canvas);
    const T = xform(view, f.cx, f.cy);

    ctx.fillStyle = C.panel;
    ctx.fillRect(0, 0, w, h);

    const kmPx = kmPerPixel(canvas, model);
    const placed = [];

    if (mode === "polar") {
      const span = polarSpanDeg(sites);
      const rhoMax = Math.tan((span / 2) * DEG);
      const rho = (colat) => Math.tan((colat / 2) * DEG) / rhoMax * f.R;
      const ctr = T.fwd({ x: f.cx, y: f.cy });
      const rimR = f.R * view.zoom;

      // plot disk
      ctx.beginPath();
      ctx.arc(ctr.x, ctr.y, rimR, 0, 2 * Math.PI);
      ctx.fillStyle = "#1a1813";
      ctx.fill();

      // basemap, resampled through the same projection
      const buf = polarBasemap(canvas, w, h, sites, view);
      if (buf) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(ctr.x, ctr.y, rimR, 0, 2 * Math.PI);
        ctx.clip();
        ctx.imageSmoothingEnabled = true;
        ctx.globalAlpha = 0.9;
        ctx.drawImage(buf, 0, 0, w, h);
        // keep the page's warm dark key
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = C.bg;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }

      ctx.beginPath();
      ctx.arc(ctr.x, ctr.y, rimR, 0, 2 * Math.PI);
      ctx.strokeStyle = C.lineStrong;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // graticule: step follows the zoomed-in span
      const effSpan = span / view.zoom;
      const stepC = gratStep(effSpan);
      ctx.lineWidth = 1;
      const colatMax = Math.min(178, span * 1.02 / Math.max(1, view.zoom * 0.5));
      for (let colat = stepC; colat <= colatMax + 1e-9; colat += stepC) {
        const r = rho(colat) * view.zoom;
        if (r > Math.hypot(w, h)) break;
        ctx.strokeStyle = C.line;
        ctx.beginPath();
        ctx.arc(ctr.x, ctr.y, r, 0, 2 * Math.PI);
        ctx.stroke();
        const latLab = (colat - 90);
        text(ctx, latLab.toFixed(stepC < 1 ? 1 : 0) + "°", ctr.x + 3, ctr.y - r - 3, { mono: true, size: 9, color: C.faint });
      }
      const lonStep = effSpan > 8 ? 30 : 10;
      for (let lon = 0; lon < 360; lon += lonStep) {
        const rim = { x: ctr.x + rimR * Math.sin(lon * DEG), y: ctr.y - rimR * Math.cos(lon * DEG) };
        ctx.strokeStyle = C.line;
        ctx.beginPath();
        ctx.moveTo(ctr.x, ctr.y);
        ctx.lineTo(rim.x, rim.y);
        ctx.stroke();
      }
      text(ctx, "0° — mean-Earth direction", f.cx, 14, { align: "center", size: 10 });
      text(ctx, "South polar stereographic · graticule " + stepC + "°", f.cx, h - 6, { align: "center", size: 9, color: C.faint });
    } else {
      // equirectangular near side: lon −90…90, lat −90…90
      const k = f.R / 90;
      const tl = T.fwd({ x: f.cx - 90 * k, y: f.cy - 90 * k });
      const br = T.fwd({ x: f.cx + 90 * k, y: f.cy + 90 * k });

      ctx.save();
      ctx.beginPath();
      ctx.rect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
      ctx.clip();
      ctx.fillStyle = "#1a1813";
      ctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);

      const img = basemapImage();
      if (img) {
        // the near-side half of the equirectangular source, affine under T
        ctx.imageSmoothingEnabled = true;
        ctx.globalAlpha = 0.9;
        ctx.drawImage(
          img,
          img.naturalWidth / 4, 0, img.naturalWidth / 2, img.naturalHeight,
          tl.x, tl.y, br.x - tl.x, br.y - tl.y
        );
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = C.bg;
        ctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
        ctx.globalAlpha = 1;
      }

      // graticule, regrading with zoom
      const step = gratStep(180 / view.zoom);
      ctx.lineWidth = 1;
      for (let lat = -90; lat <= 90 + 1e-9; lat += step) {
        const p = T.fwd({ x: f.cx - 90 * k, y: f.cy - lat * k });
        const q = T.fwd({ x: f.cx + 90 * k, y: f.cy - lat * k });
        if (p.y < -10 || p.y > h + 10) continue;
        ctx.strokeStyle = Math.abs(lat) < 1e-9 ? C.lineStrong : C.line;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(q.x, q.y);
        ctx.stroke();
        text(ctx, lat.toFixed(step < 1 ? 1 : 0) + "°", Math.max(2, p.x + 3), p.y - 2, { mono: true, size: 8.5, color: C.faint });
      }
      for (let lon = -90; lon <= 90 + 1e-9; lon += step) {
        const p = T.fwd({ x: f.cx + lon * k, y: f.cy - 90 * k });
        const q = T.fwd({ x: f.cx + lon * k, y: f.cy + 90 * k });
        if (p.x < -10 || p.x > w + 10) continue;
        ctx.strokeStyle = Math.abs(lon) < 1e-9 ? C.lineStrong : C.line;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(q.x, q.y);
        ctx.stroke();
        text(ctx, lon.toFixed(step < 1 ? 1 : 0) + "°", p.x + 2, Math.max(10, p.y + 10), { mono: true, size: 8.5, color: C.faint });
      }
      ctx.restore();

      ctx.strokeStyle = C.lineStrong;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
      text(ctx, "Equirectangular, near side · E–W stretches toward the poles · graticule " + step + "°", f.cx, h - 6, { align: "center", size: 9, color: C.faint });
    }

    // named features under the site markers
    mapFeatures(ctx, model, mode, w, h, sites, T, kmPx, placed);

    // markers
    const primaryIdx = Math.max(0, sites.findIndex((s) => s.id === model.primaryId));
    sites.forEach((site, i) => {
      const p = T.fwd(project(site.lat, site.lon, mode, w, h, sites));
      const primary = i === primaryIdx;
      ctx.save();
      if (!p.front) ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.arc(p.x, p.y, primary ? 6 : 5, 0, 2 * Math.PI);
      ctx.fillStyle = site.color || C.ink;
      ctx.fill();
      if (primary) {
        ctx.strokeStyle = C.ink;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 9, 0, 2 * Math.PI);
        ctx.stroke();
      }
      ctx.restore();
      const tag = (site.short || site.name || site.id) + (p.front ? "" : " · far side");
      labelNear(ctx, placed, tag, p.x + 9, p.y, p.front ? C.ink : C.faint);
    });

    scaleBar(ctx, w, h, kmPx);
    if (view.zoom > 1.01) {
      text(ctx, "×" + view.zoom.toFixed(1) + " · double-click to reset", w - 8, 14, { align: "right", size: 9, color: C.faint });
    }
  }

  function scaleBar(ctx, w, h, kmPx) {
    if (!isFinite(kmPx) || kmPx <= 0) return;
    const targetKm = kmPx * w * 0.22;
    const km = niceStep(targetKm, 1);
    const px = km / kmPx;
    if (px < 20 || px > w * 0.6) return;
    const x0 = 12;
    const y0 = h - 14;
    ctx.save();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + px, y0);
    ctx.moveTo(x0, y0 - 4);
    ctx.lineTo(x0, y0 + 4);
    ctx.moveTo(x0 + px, y0 - 4);
    ctx.lineTo(x0 + px, y0 + 4);
    ctx.stroke();
    ctx.restore();
    text(ctx, (km >= 1 ? km.toFixed(0) : km.toFixed(1)) + " km", x0 + px / 2, y0 - 6, { mono: true, align: "center", size: 9.5, color: C.ink });
  }

  function hitMap(canvas, model, cssX, cssY) {
    const { w, h } = cssSize(canvas);
    const sites = model.sites || [];
    const T = xform(mapView(canvas), w / 2, h / 2);
    let best = null;
    let bestD = Infinity;
    for (const site of sites) {
      const p = T.fwd(project(site.lat, site.lon, model.mapMode, w, h, sites));
      const d = Math.hypot(p.x - cssX, p.y - cssY);
      if (d <= 12 && d < bestD) {
        best = site.id;
        bestD = d;
      }
    }
    return best;
  }

  /* Wires wheel-zoom (toward the cursor) and drag-pan onto a map canvas.
     opts.onChange is called after every view change so the owner redraws;
     opts.onPick gets a site id when a click lands on a marker. Returns a
     reset function. Nothing here runs unless the owner opts in. */
  function attachMap(canvas, opts) {
    const o = opts || {};
    const view = mapView(canvas);
    let dragging = false;
    let moved = 0;
    let lastX = 0;
    let lastY = 0;

    function clampView() {
      view.zoom = Math.max(1, Math.min(80, view.zoom));
      if (view.zoom === 1) {
        view.panX = 0;
        view.panY = 0;
      } else {
        const { w, h } = cssSize(canvas);
        const lim = Math.max(w, h) * view.zoom;
        view.panX = Math.max(-lim, Math.min(lim, view.panX));
        view.panY = Math.max(-lim, Math.min(lim, view.panY));
      }
    }

    canvas.addEventListener("pointerdown", (ev) => {
      dragging = true;
      moved = 0;
      lastX = ev.clientX;
      lastY = ev.clientY;
      canvas.setPointerCapture(ev.pointerId);
    });
    canvas.addEventListener("pointermove", (ev) => {
      if (!dragging) return;
      const dx = ev.clientX - lastX;
      const dy = ev.clientY - lastY;
      lastX = ev.clientX;
      lastY = ev.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      view.panX += dx;
      view.panY += dy;
      clampView();
      if (o.onChange) o.onChange();
    });
    function release(ev) {
      if (!dragging) return;
      dragging = false;
      if (canvas.hasPointerCapture && canvas.hasPointerCapture(ev.pointerId)) {
        canvas.releasePointerCapture(ev.pointerId);
      }
      if (moved < 5 && o.onPick && o.model) {
        const rect = canvas.getBoundingClientRect();
        const id = hitMap(canvas, o.model(), ev.clientX - rect.left, ev.clientY - rect.top);
        if (id) o.onPick(id);
      }
    }
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);

    canvas.addEventListener("wheel", (ev) => {
      ev.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const X = ev.clientX - rect.left;
      const Y = ev.clientY - rect.top;
      const { w, h } = cssSize(canvas);
      const T0 = xform(view, w / 2, h / 2);
      const base = T0.inv(X, Y);
      view.zoom *= ev.deltaY < 0 ? 1.18 : 1 / 1.18;
      view.zoom = Math.max(1, Math.min(80, view.zoom));
      // keep the point under the cursor fixed
      view.panX = X - base.x * view.zoom - (w / 2) * (1 - view.zoom);
      view.panY = Y - base.y * view.zoom - (h / 2) * (1 - view.zoom);
      clampView();
      if (o.onChange) o.onChange();
    }, { passive: false });

    canvas.addEventListener("dblclick", () => {
      view.zoom = 1;
      view.panX = 0;
      view.panY = 0;
      if (o.onChange) o.onChange();
    });

    return function reset() {
      view.zoom = 1;
      view.panX = 0;
      view.panY = 0;
      if (o.onChange) o.onChange();
    };
  }

  const api = { drawHorizon, drawChart, drawMap, hitMap, project, attachMap, mapView, kmPerPixel };
  root.LunarViz = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
