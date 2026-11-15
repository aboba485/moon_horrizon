/* Lunar Horizon globe.
   A draggable, shaded Moon drawn with orthographic projection on a 2D canvas.
   No WebGL and no texture asset, because a texture loaded from a file:// URL is
   treated as cross-origin and cannot be uploaded to WebGL, and the page has to
   keep working when index.html is opened by double-clicking it.

   The lighting is not decoration: the terminator is placed at the real subsolar
   point from the ephemeris, so the lit crescent moves when the timeline is
   scrubbed. Same azimuth and frame conventions as viz.js.

   Interaction state lives on the canvas element, so the renderer stays a pure
   function of (canvas, model) the way the rest of the drawing code does. */
(function (root) {
  "use strict";

  var DEG = Math.PI / 180;
  var SANS = '"Outfit", sans-serif';
  var MONO = '"IBM Plex Mono", ui-monospace, monospace';

  var C = {
    space: "#0c0b09",
    limb: "rgba(243, 232, 214, 0.22)",
    grid: "rgba(243, 232, 214, 0.10)",
    gridWarm: "rgba(240, 162, 2, 0.16)",
    ink: "#f4efe6",
    muted: "#a79d90",
    faint: "#6f675c",
    sun: "#f0a202",
    earth: "#3db7e8",
    highland: "#a89e8e",
    mare: "#3f3c35",
    night: "#0e0d0b"
  };

  /* Major maria and a few bright craters, by published centre and diameter.
     These are drawn only so the globe reads as the Moon while you spin it. They
     are schematic circles, not mapped outlines, and nothing is computed from
     them. Diameters in km, from the IAU Gazetteer of Planetary Nomenclature. */
  var FEATURES = [
    { name: "Oceanus Procellarum", lat: 18.4, lon: -57.4, km: 2568, tone: 0.95 },
    { name: "Mare Imbrium", lat: 32.8, lon: -15.6, km: 1146, tone: 1 },
    { name: "Mare Serenitatis", lat: 28.0, lon: 17.5, km: 674, tone: 1 },
    { name: "Mare Tranquillitatis", lat: 8.5, lon: 31.4, km: 876, tone: 0.95 },
    { name: "Mare Fecunditatis", lat: -7.8, lon: 51.3, km: 840, tone: 0.85 },
    { name: "Mare Crisium", lat: 17.0, lon: 59.1, km: 556, tone: 1 },
    { name: "Mare Nubium", lat: -21.3, lon: -16.6, km: 715, tone: 0.8 },
    { name: "Mare Humorum", lat: -24.4, lon: -38.6, km: 389, tone: 0.9 },
    { name: "Mare Nectaris", lat: -15.2, lon: 34.6, km: 333, tone: 0.85 },
    { name: "Mare Vaporum", lat: 13.3, lon: 3.6, km: 245, tone: 0.8 },
    { name: "Mare Frigoris", lat: 56.0, lon: 1.4, km: 1446, tone: 0.7 },
    { name: "Mare Orientale", lat: -19.4, lon: -92.8, km: 327, tone: 0.9 },
    { name: "Mare Moscoviense", lat: 27.3, lon: 147.9, km: 276, tone: 0.9 },
    { name: "Mare Ingenii", lat: -33.7, lon: 163.5, km: 282, tone: 0.85 },
    { name: "Apollo basin", lat: -36.1, lon: -151.8, km: 492, tone: 0.7 },
    { name: "South Pole-Aitken", lat: -53.0, lon: 169.0, km: 2100, tone: 0.45 }
  ];

  /* Bright ray craters, drawn as light spots so the near side is recognisable. */
  var BRIGHT = [
    { name: "Tycho", lat: -43.3, lon: -11.4, km: 85 },
    { name: "Copernicus", lat: 9.6, lon: -20.1, km: 96 },
    { name: "Kepler", lat: 8.1, lon: -38.0, km: 31 },
    { name: "Aristarchus", lat: 23.7, lon: -47.5, km: 40 },
    { name: "Jackson", lat: 22.4, lon: -163.1, km: 71 }
  ];

  var MOON_KM = 1737.4;

  /* ---------- vector helpers ---------- */

  function toVec(latDeg, lonDeg) {
    var la = latDeg * DEG;
    var lo = lonDeg * DEG;
    var cl = Math.cos(la);
    return { x: cl * Math.cos(lo), y: cl * Math.sin(lo), z: Math.sin(la) };
  }

  /* Rotate body-frame xyz into view space for a camera at (centreLat, centreLon).
     View space is x right (east), y up (north), z toward the viewer. */
  function toView(v, centreLat, centreLon) {
    var la = centreLat * DEG;
    var lo = centreLon * DEG;
    var sinLo = Math.sin(lo);
    var cosLo = Math.cos(lo);
    var x1 = v.x * cosLo + v.y * sinLo;
    var y1 = -v.x * sinLo + v.y * cosLo;
    var sinLa = Math.sin(la);
    var cosLa = Math.cos(la);
    return {
      x: y1,
      y: v.z * cosLa - x1 * sinLa,
      z: x1 * cosLa + v.z * sinLa
    };
  }

  function dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }

  /* ---------- canvas plumbing ---------- */

  function setup(canvas) {
    var dpr = root.devicePixelRatio || 1;
    var w = canvas.clientWidth || canvas.width / dpr || 300;
    var h = canvas.clientHeight || canvas.height / dpr || 300;
    var bw = Math.max(1, Math.round(w * dpr));
    var bh = Math.max(1, Math.round(h * dpr));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h };
  }

  function cssSize(canvas) {
    var dpr = root.devicePixelRatio || 1;
    return {
      w: canvas.clientWidth || canvas.width / dpr || 300,
      h: canvas.clientHeight || canvas.height / dpr || 300
    };
  }

  function text(ctx, str, x, y, opts) {
    var o = opts || {};
    ctx.save();
    ctx.font = (o.weight ? o.weight + " " : "") + (o.size || 11) + "px " + (o.mono ? MONO : SANS);
    ctx.fillStyle = o.color || C.muted;
    ctx.textAlign = o.align || "left";
    ctx.textBaseline = o.baseline || "alphabetic";
    if (o.halo) {
      ctx.strokeStyle = o.halo;
      ctx.lineWidth = 3;
      ctx.lineJoin = "round";
      ctx.strokeText(str, x, y);
    }
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  /* ---------- camera ---------- */

  function cam(canvas) {
    if (!canvas._globeCam) {
      canvas._globeCam = { lat: -60, lon: 0, zoom: 1, spinLat: 0, spinLon: 0 };
    }
    return canvas._globeCam;
  }

  function frame(canvas, w, h) {
    var c = cam(canvas);
    return {
      cx: w / 2,
      cy: h / 2,
      R: Math.min(w, h) / 2 * 0.86 * c.zoom,
      lat: c.lat,
      lon: c.lon,
      zoom: c.zoom
    };
  }

  /* Project a lat/lon to screen. `front` is false on the hidden hemisphere. */
  function project(latDeg, lonDeg, f) {
    var v = toView(toVec(latDeg, lonDeg), f.lat, f.lon);
    return {
      x: f.cx + v.x * f.R,
      y: f.cy - v.y * f.R,
      z: v.z,
      front: v.z >= 0
    };
  }

  /* ---------- pin selection and decluttering ---------- */

  /* The globe is a picker, not a data table, so it shows a readable spread
     rather than all 30 catalogue entries. Everything within `clusterDeg` of the
     south pole collapses into one marker until the camera is actually looking at
     the pole and zoomed in, because 15 of the sites sit inside a few degrees of
     each other and would otherwise be a single unclickable blob. */
  function pinsFor(sites, f, selectedIds) {
    var polar = [];
    var out = [];
    var polarCut = -80;
    var expanded = f.lat < -55 && f.zoom > 1.7;

    for (var i = 0; i < sites.length; i++) {
      var site = sites[i];
      // A selected site always keeps its own pin, otherwise picking one from
      // the catalogue would leave nothing on the globe to show where it is.
      if (site.lat <= polarCut && !expanded && selectedIds.indexOf(site.id) < 0) {
        polar.push(site);
        continue;
      }
      out.push({ site: site, p: project(site.lat, site.lon, f) });
    }

    if (polar.length) {
      // One marker at the pole standing in for the whole cluster.
      out.push({
        cluster: polar,
        site: null,
        label: "South pole \u00b7 " + polar.length + " sites",
        selected: false,
        p: project(-89.6, 0, f)
      });
    }
    return out;
  }

  /* ---------- optional photographic basemap ---------- */

  /* window.LUNAR_BASEMAP (basemap.js) is an equirectangular mosaic as a
     data: URI — same-origin by definition, so sampling it cannot taint the
     canvas, which matters because this file lives on getImageData. When the
     script is absent the globe keeps its schematic shading. */
  var TEX_N = 224;
  var tex = { img: null, data: null, tried: false, buf: null, key: null };

  function texSource() {
    var def = root.LUNAR_BASEMAP;
    if (!def || !def.src) return null;
    if (!tex.tried) {
      tex.tried = true;
      var img = new Image();
      img.onload = function () {
        tex.img = img;
        try { root.dispatchEvent(new Event("lunar-basemap-ready")); } catch (e) { /* next redraw */ }
      };
      img.src = def.src;
    }
    if (!tex.img) return null;
    if (!tex.data) {
      var cv = root.document.createElement("canvas");
      cv.width = tex.img.naturalWidth;
      cv.height = tex.img.naturalHeight;
      var cx = cv.getContext("2d");
      cx.drawImage(tex.img, 0, 0);
      tex.data = { px: cx.getImageData(0, 0, cv.width, cv.height), w: cv.width, h: cv.height };
    }
    return tex.data;
  }

  /* Orthographic render of the mosaic for the current camera, into a small
     cached buffer — same approach and cost as the lighting pass. */
  function textureLayer(ctx, f) {
    var src = texSource();
    if (!src) return false;
    var key = f.lat.toFixed(1) + "|" + f.lon.toFixed(1);
    if (!tex.buf) {
      tex.buf = root.document.createElement("canvas");
      tex.buf.width = TEX_N;
      tex.buf.height = TEX_N;
    }
    if (tex.key !== key) {
      var bctx = tex.buf.getContext("2d");
      var out = bctx.createImageData(TEX_N, TEX_N);
      var d = src.px.data;
      var half = TEX_N / 2;
      var la = f.lat * DEG;
      var lo = f.lon * DEG;
      var sinLa = Math.sin(la);
      var cosLa = Math.cos(la);
      var sinLo = Math.sin(lo);
      var cosLo = Math.cos(lo);
      for (var py = 0; py < TEX_N; py++) {
        var ny = (half - py - 0.5) / half;
        for (var px = 0; px < TEX_N; px++) {
          var nx = (px + 0.5 - half) / half;
          var rr = nx * nx + ny * ny;
          var o = (py * TEX_N + px) * 4;
          if (rr > 1) { out.data[o + 3] = 0; continue; }
          var nz = Math.sqrt(1 - rr);
          // inverse of toView(): view (nx, ny, nz) back to body lat/lon
          var x1 = nz * cosLa - ny * sinLa;
          var vz = ny * cosLa + nz * sinLa;
          var vx = x1 * cosLo - nx * sinLo;
          var vy = x1 * sinLo + nx * cosLo;
          var lonD = Math.atan2(vy, vx) / DEG;
          var latD = Math.asin(Math.max(-1, Math.min(1, vz))) / DEG;
          var sx = Math.min(src.w - 1, Math.max(0, Math.round(((lonD + 180) / 360) * src.w)));
          var sy = Math.min(src.h - 1, Math.max(0, Math.round(((90 - latD) / 180) * src.h)));
          var so = (sy * src.w + sx) * 4;
          out.data[o] = d[so];
          out.data[o + 1] = d[so + 1];
          out.data[o + 2] = d[so + 2];
          out.data[o + 3] = 255;
        }
      }
      bctx.putImageData(out, 0, 0);
      tex.key = key;
    }
    ctx.save();
    ctx.beginPath();
    ctx.arc(f.cx, f.cy, f.R, 0, 2 * Math.PI);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(tex.buf, f.cx - f.R, f.cy - f.R, f.R * 2, f.R * 2);
    ctx.restore();
    return true;
  }

  /* ---------- drawing ---------- */

  function albedo(ctx, f) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(f.cx, f.cy, f.R, 0, 2 * Math.PI);
    ctx.clip();
    ctx.fillStyle = C.highland;
    ctx.fillRect(f.cx - f.R, f.cy - f.R, f.R * 2, f.R * 2);
    ctx.restore();
  }

  function featurePatch(ctx, f, item, fill, alpha) {
    var p = project(item.lat, item.lon, f);
    if (!p.front) return;
    // Angular radius of the feature, foreshortened by how far it sits from the
    // centre of the visible disk. A circle on the sphere projects to an ellipse.
    var ang = (item.km / 2) / MOON_KM;
    var rPx = Math.sin(ang) * f.R;
    if (rPx < 1) return;
    var tilt = Math.atan2(f.cy - p.y, p.x - f.cx);
    var squash = Math.max(0.12, p.z);
    ctx.save();
    ctx.globalAlpha = alpha * Math.min(1, 0.25 + p.z);
    ctx.translate(p.x, p.y);
    ctx.rotate(-tilt);
    ctx.beginPath();
    ctx.ellipse(0, 0, rPx * squash, rPx, 0, 0, 2 * Math.PI);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.restore();
  }

  function surface(ctx, f) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(f.cx, f.cy, f.R, 0, 2 * Math.PI);
    ctx.clip();
    var i;
    for (i = 0; i < FEATURES.length; i++) {
      featurePatch(ctx, f, FEATURES[i], C.mare, 0.66 * FEATURES[i].tone);
    }
    for (i = 0; i < BRIGHT.length; i++) {
      featurePatch(ctx, f, BRIGHT[i], "#ebe4d4", 0.5);
    }
    ctx.restore();
  }

  /* Lambert shading and the terminator, as one translucent overlay.

     Computed into a small offscreen buffer and scaled up rather than evaluated
     per screen pixel: the surface normal of a sphere under orthographic
     projection is a smooth function, so a 192 px buffer carries it with no
     visible banding and costs about 37k iterations instead of 360k. */
  var LIGHT_N = 192;
  var lightBuf = null;

  function lighting(ctx, f, sun) {
    var lit = toView(sun, f.lat, f.lon);
    if (!lightBuf) {
      lightBuf = root.document.createElement("canvas");
      lightBuf.width = LIGHT_N;
      lightBuf.height = LIGHT_N;
    }
    var bctx = lightBuf.getContext("2d");
    var img = bctx.createImageData(LIGHT_N, LIGHT_N);
    var data = img.data;
    var half = LIGHT_N / 2;

    for (var py = 0; py < LIGHT_N; py++) {
      var ny = (half - py - 0.5) / half;
      for (var px = 0; px < LIGHT_N; px++) {
        var nx = (px + 0.5 - half) / half;
        var rr = nx * nx + ny * ny;
        var o = (py * LIGHT_N + px) * 4;
        if (rr > 1) {
          data[o + 3] = 0;
          continue;
        }
        var nz = Math.sqrt(1 - rr);
        var illum = nx * lit.x + ny * lit.y + nz * lit.z;
        if (illum > 0) {
          // Lit side. A pure Lambert cosine would crush most of the disk into
          // shadow; the low exponent keeps the daylit face readable as a map
          // while still rounding off toward the terminator.
          var a = (1 - Math.pow(illum, 0.32)) * 0.58;
          data[o] = 10;
          data[o + 1] = 9;
          data[o + 2] = 7;
          data[o + 3] = Math.round(Math.min(255, a * 255));
        } else {
          // Night side. Deliberately not opaque: a solid disk would hide every
          // pin past the terminator, and the point of the globe is picking one.
          var d = 0.70 + Math.min(0.14, -illum * 0.7);
          data[o] = 8;
          data[o + 1] = 7;
          data[o + 2] = 6;
          data[o + 3] = Math.round(d * 255);
        }
      }
    }
    bctx.putImageData(img, 0, 0);

    ctx.save();
    ctx.beginPath();
    ctx.arc(f.cx, f.cy, f.R, 0, 2 * Math.PI);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(lightBuf, f.cx - f.R, f.cy - f.R, f.R * 2, f.R * 2);

    // Warm specular-ish bloom on the sunward side.
    var lm = Math.hypot(lit.x, lit.y, lit.z);
    if (lm > 0) {
      var gx = f.cx + (lit.x / lm) * f.R * 0.5;
      var gy = f.cy - (lit.y / lm) * f.R * 0.5;
      var g = ctx.createRadialGradient(gx, gy, 0, gx, gy, f.R * 0.95);
      g.addColorStop(0, "rgba(255, 236, 196, 0.18)");
      g.addColorStop(1, "rgba(255, 236, 196, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(f.cx - f.R, f.cy - f.R, f.R * 2, f.R * 2);
    }
    ctx.restore();
  }

  function graticule(ctx, f) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(f.cx, f.cy, f.R, 0, 2 * Math.PI);
    ctx.clip();
    ctx.lineWidth = 1;

    var lat, lon, first, p, i;
    for (lat = -60; lat <= 60; lat += 30) {
      ctx.beginPath();
      first = true;
      for (lon = -180; lon <= 180; lon += 3) {
        p = project(lat, lon, f);
        if (!p.front) { first = true; continue; }
        if (first) { ctx.moveTo(p.x, p.y); first = false; } else ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = lat === 0 ? C.gridWarm : C.grid;
      ctx.stroke();
    }
    for (i = -180; i < 180; i += 30) {
      ctx.beginPath();
      first = true;
      for (lat = -90; lat <= 90; lat += 3) {
        p = project(lat, i, f);
        if (!p.front) { first = true; continue; }
        if (first) { ctx.moveTo(p.x, p.y); first = false; } else ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = i === 0 ? C.gridWarm : C.grid;
      ctx.stroke();
    }
    ctx.restore();
  }

  function marker(ctx, p, opts) {
    var r = opts.primary ? 6.5 : opts.selected ? 5.5 : 4;
    var depth = Math.min(1, 0.35 + p.z * 0.8);
    ctx.save();
    ctx.globalAlpha = p.front ? depth : 0.22;
    // A short stem so the pin reads as standing on the surface.
    if (p.front && opts.primary) {
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x, p.y - 13);
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x, p.y - 15, r, 0, 2 * Math.PI);
      ctx.fillStyle = opts.color || C.sun;
      ctx.fill();
      ctx.strokeStyle = "rgba(12, 11, 9, 0.9)";
      ctx.lineWidth = 1.4;
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = opts.color || (opts.selected ? C.ink : C.muted);
      ctx.fill();
      ctx.strokeStyle = "rgba(12, 11, 9, 0.85)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawGlobe(canvas, model) {
    var s = setup(canvas);
    var ctx = s.ctx;
    var f = frame(canvas, s.w, s.h);
    var sites = model.catalogue || [];
    var selectedIds = model.selectedIds || [];
    var primaryId = model.primaryId;
    var now = model.now || {};

    ctx.clearRect(0, 0, s.w, s.h);

    var sun = toVec(
      isFinite(now.subSolarLat) ? now.subSolarLat : 0,
      isFinite(now.subSolarLon) ? now.subSolarLon : 0
    );

    // Soft glow so the disk does not sit flat on the background.
    var halo = ctx.createRadialGradient(f.cx, f.cy, f.R * 0.95, f.cx, f.cy, f.R * 1.3);
    halo.addColorStop(0, "rgba(240, 162, 2, 0.10)");
    halo.addColorStop(1, "rgba(240, 162, 2, 0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(f.cx, f.cy, f.R * 1.3, 0, 2 * Math.PI);
    ctx.fill();

    if (!textureLayer(ctx, f)) {
      albedo(ctx, f);
      surface(ctx, f);
    }
    lighting(ctx, f, sun);
    graticule(ctx, f);

    ctx.beginPath();
    ctx.arc(f.cx, f.cy, f.R, 0, 2 * Math.PI);
    ctx.strokeStyle = C.limb;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Sub-Earth point, so "near side" stops being an abstraction.
    if (isFinite(now.subEarthLat) && isFinite(now.subEarthLon)) {
      var pe = project(now.subEarthLat, now.subEarthLon, f);
      if (pe.front) {
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(pe.x, pe.y, 4, 0, 2 * Math.PI);
        ctx.strokeStyle = C.earth;
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(pe.x, pe.y, 9, 0, 2 * Math.PI);
        ctx.strokeStyle = "rgba(61, 183, 232, 0.35)";
        ctx.lineWidth = 1;
        ctx.stroke();
        text(ctx, "Earth overhead", pe.x + 12, pe.y + 4, {
          size: 10, color: C.earth, halo: "rgba(12, 11, 9, 0.85)"
        });
        ctx.restore();
      }
    }

    // Pins, far side first so near-side ones land on top.
    var pins = pinsFor(sites, f, selectedIds).sort(function (a, b) { return a.p.z - b.p.z; });
    var labels = [];
    for (var i = 0; i < pins.length; i++) {
      var pin = pins[i];
      var id = pin.site ? pin.site.id : null;
      var isPrimary = id != null && id === primaryId;
      var isSel = pin.cluster ? pin.selected : selectedIds.indexOf(id) >= 0;
      marker(ctx, pin.p, {
        primary: isPrimary,
        selected: isSel,
        color: isPrimary ? C.sun : isSel ? C.ink : pin.cluster ? C.sun : C.muted
      });
      if (pin.p.front && (isPrimary || isSel || pin.cluster || f.zoom > 1.4)) {
        labels.push({
          str: pin.label || pin.site.short || pin.site.name,
          x: pin.p.x + 10,
          y: pin.p.y + (isPrimary ? -11 : 4),
          strong: isPrimary || isSel
        });
      }
    }
    for (var j = 0; j < labels.length; j++) {
      var L = labels[j];
      var clash = false;
      for (var k = 0; k < j; k++) {
        if (Math.abs(labels[k].x - L.x) < 90 && Math.abs(labels[k].y - L.y) < 13) clash = true;
      }
      if (clash && !L.strong) continue;
      text(ctx, L.str, L.x, L.y, {
        size: L.strong ? 12 : 10.5,
        weight: L.strong ? "500" : "",
        color: L.strong ? C.ink : C.muted,
        halo: "rgba(12, 11, 9, 0.88)"
      });
    }

    // IAU feature names from features.js, once the camera is close enough that
    // they land on distinct pixels. Largest first, collision-avoided, capped.
    var cat = root.LUNAR_FEATURES;
    if (cat && cat.features && cat.features.length && f.zoom > 1.25) {
      var sorted = cat.features.slice().sort(function (a, b) { return (b.diamKm || 0) - (a.diamKm || 0); });
      var shown = 0;
      for (var q = 0; q < sorted.length && shown < 10; q++) {
        var ft = sorted[q];
        var diamPx = Math.sin(((ft.diamKm || 0) / 2) / MOON_KM) * f.R * 2;
        if (diamPx < 46 / f.zoom) continue;
        var fp = project(ft.lat, ft.lon, f);
        if (!fp.front || fp.z < 0.25) continue;
        var clash = false;
        for (var r = 0; r < labels.length; r++) {
          if (Math.abs(labels[r].x - fp.x) < 80 && Math.abs(labels[r].y - fp.y) < 13) clash = true;
        }
        if (clash) continue;
        labels.push({ x: fp.x, y: fp.y, strong: false });
        text(ctx, ft.name, fp.x, fp.y, {
          size: 9.5, color: C.faint, align: "center",
          halo: "rgba(12, 11, 9, 0.8)"
        });
        shown++;
      }
    }

    // Sun direction arrow at the edge, pointing where the light comes from.
    var ls = toView(sun, f.lat, f.lon);
    var lm = Math.hypot(ls.x, ls.y);
    if (lm > 0.02) {
      var ax = f.cx + (ls.x / lm) * (f.R + 20);
      var ay = f.cy - (ls.y / lm) * (f.R + 20);
      text(ctx, "\u2600 Sun", ax, ay, {
        size: 10, color: C.sun, align: "center", baseline: "middle",
        halo: "rgba(12, 11, 9, 0.9)"
      });
    }

    text(ctx, "Drag to spin \u00b7 scroll to zoom \u00b7 click a pin",
      f.cx, s.h - 8, { size: 10, color: C.faint, align: "center" });
    text(ctx, "view " + f.lat.toFixed(0) + "\u00b0, " + f.lon.toFixed(0) + "\u00b0",
      8, s.h - 8, { size: 9.5, color: C.faint, mono: true });
  }

  /* ---------- hit testing ---------- */

  /* Returns { id } for a site pin, { cluster: [...] } for the polar cluster, or
     null. Primary pins are drawn on a stem, so their clickable point is raised
     by the same amount they are. */
  function hitGlobe(canvas, model, cssX, cssY) {
    var m = model || {};
    var d = cssSize(canvas);
    var f = frame(canvas, d.w, d.h);
    var pins = pinsFor(m.catalogue || [], f, m.selectedIds || []);
    var best = null;
    var bestD = Infinity;
    for (var i = 0; i < pins.length; i++) {
      var pin = pins[i];
      if (!pin.p.front) continue;
      var isPrimary = pin.site && pin.site.id === m.primaryId;
      var py = pin.p.y - (isPrimary ? 15 : 0);
      var dist = Math.hypot(pin.p.x - cssX, py - cssY);
      if (dist <= 14 && dist < bestD) {
        bestD = dist;
        best = pin.cluster ? { cluster: pin.cluster } : { id: pin.site.id };
      }
    }
    return best;
  }

  /* ---------- interaction ---------- */

  /* Wires drag, wheel and keyboard onto the canvas. `onPick` gets the hit
     result, `onChange` is called whenever the camera moved so the shell can
     redraw. Returns a function that spins the globe to a given lat/lon. */
  function attach(canvas, opts) {
    var o = opts || {};
    var c = cam(canvas);
    var dragging = false;
    var moved = 0;
    var lastX = 0;
    var lastY = 0;
    var raf = null;
    var glide = null;

    function changed() {
      if (o.onChange) o.onChange();
    }

    function clampCam() {
      c.lat = Math.max(-90, Math.min(90, c.lat));
      c.lon = ((c.lon + 180) % 360 + 360) % 360 - 180;
      c.zoom = Math.max(1, Math.min(4, c.zoom));
    }

    function stopGlide() {
      if (raf) root.cancelAnimationFrame(raf);
      raf = null;
      glide = null;
    }

    canvas.addEventListener("pointerdown", function (ev) {
      stopGlide();
      dragging = true;
      moved = 0;
      lastX = ev.clientX;
      lastY = ev.clientY;
      canvas.setPointerCapture(ev.pointerId);
    });

    canvas.addEventListener("pointermove", function (ev) {
      if (!dragging) return;
      var dx = ev.clientX - lastX;
      var dy = ev.clientY - lastY;
      lastX = ev.clientX;
      lastY = ev.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      var k = 0.32 / c.zoom;
      c.lon -= dx * k;
      c.lat += dy * k;
      c.spinLon = -dx * k;
      c.spinLat = dy * k;
      clampCam();
      changed();
    });

    function release(ev) {
      if (!dragging) return;
      dragging = false;
      if (canvas.hasPointerCapture && canvas.hasPointerCapture(ev.pointerId)) {
        canvas.releasePointerCapture(ev.pointerId);
      }
      if (moved < 5) {
        var rect = canvas.getBoundingClientRect();
        var hit = hitGlobe(canvas, o.model(), ev.clientX - rect.left, ev.clientY - rect.top);
        if (hit && o.onPick) o.onPick(hit);
        return;
      }
      // Inertia, unless the user asked for less motion.
      if (root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      glide = { lat: c.spinLat, lon: c.spinLon };
      var tick = function () {
        if (!glide) return;
        glide.lat *= 0.92;
        glide.lon *= 0.92;
        c.lat += glide.lat;
        c.lon += glide.lon;
        clampCam();
        changed();
        if (Math.abs(glide.lat) + Math.abs(glide.lon) > 0.02) {
          raf = root.requestAnimationFrame(tick);
        } else {
          stopGlide();
        }
      };
      raf = root.requestAnimationFrame(tick);
    }

    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);

    canvas.addEventListener("wheel", function (ev) {
      ev.preventDefault();
      stopGlide();
      c.zoom *= ev.deltaY < 0 ? 1.12 : 1 / 1.12;
      clampCam();
      changed();
    }, { passive: false });

    canvas.addEventListener("keydown", function (ev) {
      var step = ev.shiftKey ? 15 : 5;
      var handled = true;
      if (ev.key === "ArrowLeft") c.lon -= step;
      else if (ev.key === "ArrowRight") c.lon += step;
      else if (ev.key === "ArrowUp") c.lat += step;
      else if (ev.key === "ArrowDown") c.lat -= step;
      else if (ev.key === "+" || ev.key === "=") c.zoom *= 1.15;
      else if (ev.key === "-") c.zoom /= 1.15;
      else handled = false;
      if (!handled) return;
      ev.preventDefault();
      stopGlide();
      clampCam();
      changed();
    });

    return function goTo(lat, lon, zoom) {
      stopGlide();
      var from = { lat: c.lat, lon: c.lon, zoom: c.zoom };
      var dLon = ((lon - from.lon + 540) % 360) - 180;
      var target = { lat: lat, lon: from.lon + dLon, zoom: zoom == null ? c.zoom : zoom };
      if (root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        c.lat = target.lat;
        c.lon = target.lon;
        c.zoom = target.zoom;
        clampCam();
        changed();
        return;
      }
      var t0 = root.performance ? root.performance.now() : Date.now();
      var dur = 520;
      var tick = function (now) {
        var t = Math.min(1, ((now || Date.now()) - t0) / dur);
        var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        c.lat = from.lat + (target.lat - from.lat) * e;
        c.lon = from.lon + (target.lon - from.lon) * e;
        c.zoom = from.zoom + (target.zoom - from.zoom) * e;
        clampCam();
        changed();
        if (t < 1) raf = root.requestAnimationFrame(tick);
        else stopGlide();
      };
      raf = root.requestAnimationFrame(tick);
    };
  }

  var api = { drawGlobe: drawGlobe, hitGlobe: hitGlobe, attach: attach, camera: cam };
  root.LunarGlobe = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
