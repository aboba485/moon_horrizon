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

    // elevation grid
    const step = niceStep(range.hi - range.lo, 5);
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1;
    for (let el = Math.ceil(range.lo / step) * step; el <= range.hi; el += step) {
      const yy = y(el);
      ctx.beginPath();
      ctx.moveTo(m.left, yy);
      ctx.lineTo(m.left + pw, yy);
      ctx.stroke();
      const lab = Math.abs(el) < 1e-9 ? "0°" : el.toFixed(step < 1 ? 1 : 0) + "°";
      text(ctx, lab, m.left - 6, yy + 3, { mono: true, align: "right", size: 10 });
    }

    // cardinal directions: S at both edges, W quarter, N center, E three-quarter
    const cards = [
      { d: 0, lab: "S" },
      { d: 90, lab: "W" },
      { d: 180, lab: "N" },
      { d: 270, lab: "E" },
      { d: 360, lab: "S" }
    ];
    for (const c of cards) {
      const xx = x(c.d);
      ctx.strokeStyle = C.line;
      ctx.beginPath();
      ctx.moveTo(xx, m.top);
      ctx.lineTo(xx, m.top + ph);
      ctx.stroke();
      text(ctx, c.lab, xx, h - 10, { align: "center", color: C.muted, size: 11 });
    }

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

    // trails
    const sites = model.sites || [];
    const primaryIdx = Math.max(0, sites.findIndex((s) => s.id === model.primaryId));
    sites.forEach((site, i) => {
      const primary = i === primaryIdx;
      const alpha = primary ? 0.85 : 0.45;
      trail(ctx, site.samples, (s) => s.sunAlt, (s) => s.sunAz, x, y, C.sun, primary ? 1.6 : 1.1, alpha, null);
      trail(ctx, site.samples, (s) => s.earthAlt, (s) => s.earthAz, x, y, C.earth, primary ? 1.6 : 1.1, alpha, [4, 4]);
    });

    // disks at the playhead, true angular size on the elevation scale
    const pxPerDeg = ph / (range.hi - range.lo);
    let enlarged = false;
    const placed = [];
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

  function trail(ctx, samples, getAlt, getAz, x, y, color, width, alpha, dash) {
    if (!samples || samples.length < 2) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    let prev = null;
    for (const s of samples) {
      const d = dispAz(getAz(s));
      if (prev !== null && Math.abs(d - prev) > 180) {
        ctx.stroke();
        ctx.beginPath();
        prev = null;
      }
      const px = x(d);
      const py = y(getAlt(s));
      if (prev === null) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
      prev = d;
    }
    ctx.stroke();
    ctx.restore();
  }

  function labelNear(ctx, placed, str, px, py, color, align) {
    // nudge down until the label stops overlapping ones already placed
    let yy = py;
    for (let guard = 0; guard < 12; guard++) {
      const clash = placed.some((p) => Math.abs(p.x - px) < 46 && Math.abs(p.y - yy) < 12);
      if (!clash) break;
      yy += 12;
    }
    placed.push({ x: px, y: yy });
    text(ctx, str, px, yy + 3, { color: color || C.muted, align: align || "left", size: 10 });
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

  // Pure projection, css pixels. mode may be "auto" | "polar" | "near";
  // sites set the polar span and resolve "auto". hitMap and drawMap both use this.
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
    // near side orthographic, sub-Earth point at the center, north up, east right
    const cl = Math.cos(lat * DEG);
    const vx = cl * Math.sin(lon * DEG);
    const vy = Math.sin(lat * DEG);
    const vz = cl * Math.cos(lon * DEG);
    const front = vz > 0;
    let px = vx;
    let py = vy;
    if (!front) {
      // park far-side sites just inside the limb in the right direction
      const r = Math.hypot(vx, vy) || 1;
      px = (vx / r) * 0.985;
      py = (vy / r) * 0.985;
    }
    return { x: f.cx + px * f.R, y: f.cy - py * f.R, front };
  }

  function drawMap(canvas, model) {
    const { ctx, w, h } = setup(canvas);
    const sites = model.sites || [];
    const mode = resolveMode(model.mapMode, sites);
    const f = mapFrame(w, h);

    ctx.fillStyle = C.panel;
    ctx.fillRect(0, 0, w, h);

    // lunar disk
    ctx.beginPath();
    ctx.arc(f.cx, f.cy, f.R, 0, 2 * Math.PI);
    ctx.fillStyle = "#1a1813";
    ctx.fill();
    ctx.strokeStyle = C.lineStrong;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    if (mode === "polar") {
      const span = polarSpanDeg(sites);
      const rhoMax = Math.tan((span / 2) * DEG);
      const rho = (colat) => Math.tan((colat / 2) * DEG) / rhoMax * f.R;
      // latitude circles
      const stepC = span <= 16 ? 5 : niceStep(span, 4);
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 1;
      for (let colat = stepC; colat <= span + 1e-9; colat += stepC) {
        const r = rho(colat);
        ctx.beginPath();
        ctx.arc(f.cx, f.cy, r, 0, 2 * Math.PI);
        ctx.stroke();
        text(ctx, (colat - 90).toFixed(0) + "°", f.cx + 3, f.cy - r - 3, { mono: true, size: 9, color: C.faint });
      }
      // meridians every 30°
      for (let lon = 0; lon < 360; lon += 30) {
        ctx.beginPath();
        ctx.moveTo(f.cx, f.cy);
        ctx.lineTo(f.cx + f.R * Math.sin(lon * DEG), f.cy - f.R * Math.cos(lon * DEG));
        ctx.strokeStyle = C.line;
        ctx.stroke();
      }
      text(ctx, "0° — mean-Earth direction", f.cx, f.cy - f.R - 8, { align: "center", size: 10 });
      text(ctx, "South polar stereographic, span " + span.toFixed(0) + "° from the pole", f.cx, h - 6, { align: "center", size: 9, color: C.faint });
      text(ctx, "90°E", f.cx + f.R + 4, f.cy + 3, { size: 9, color: C.faint });
      text(ctx, "90°W", f.cx - f.R - 4, f.cy + 3, { align: "right", size: 9, color: C.faint });
    } else {
      // graticule: parallels are chords, meridians are ellipse arcs
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 1;
      for (const latg of [-60, -30, 0, 30, 60]) {
        const yy = f.cy - Math.sin(latg * DEG) * f.R;
        const half = Math.cos(latg * DEG) * f.R;
        ctx.beginPath();
        ctx.moveTo(f.cx - half, yy);
        ctx.lineTo(f.cx + half, yy);
        ctx.stroke();
      }
      for (const long of [-60, -30, 0, 30, 60]) {
        ctx.beginPath();
        ctx.ellipse(f.cx, f.cy, Math.abs(Math.sin(long * DEG)) * f.R || 0.6, f.R, 0, -Math.PI / 2, Math.PI / 2, long < 0);
        ctx.stroke();
      }
      text(ctx, "Near side, orthographic — N up, E right", f.cx, h - 6, { align: "center", size: 9, color: C.faint });
    }

    // markers
    const primaryIdx = Math.max(0, sites.findIndex((s) => s.id === model.primaryId));
    const placed = [];
    sites.forEach((site, i) => {
      const p = project(site.lat, site.lon, mode, w, h, sites);
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
  }

  function hitMap(canvas, model, cssX, cssY) {
    const { w, h } = cssSize(canvas);
    const sites = model.sites || [];
    let best = null;
    let bestD = Infinity;
    for (const site of sites) {
      const p = project(site.lat, site.lon, model.mapMode, w, h, sites);
      const d = Math.hypot(p.x - cssX, p.y - cssY);
      if (d <= 12 && d < bestD) {
        best = site.id;
        bestD = d;
      }
    }
    return best;
  }

  const api = { drawHorizon, drawChart, drawMap, hitMap, project };
  root.LunarViz = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
