/* Lunar Horizon planner shell.
   Owns the DOM, the state, and the calls into LunarEph (sky math) and LunarViz (canvases).
   No ephemeris is re-derived here. Times are UTC everywhere. */
(function () {
  "use strict";

  var HOUR = 3600000;
  var DAY = 86400000;
  var COLORS = ["#f4efe4", "#ef8f62", "#7dcea0"];
  var MAX_SITES = 3;
  var STORE_KEY = "lunar-horizon-custom-sites";
  var PLAY_SPAN_MS = 24000;
  var SLIP_CHOICES = ["0", "-29.5", "-14", "-7", "7", "14", "29.5"];

  /* ---------- small helpers ---------- */

  function el(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function clamp(x, lo, hi) {
    return Math.max(lo, Math.min(hi, x));
  }

  function pad(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function deg(x, places) {
    var p = places == null ? 2 : places;
    var sign = x >= 0 ? "+" : "\u2212";
    return sign + Math.abs(x).toFixed(p) + "\u00b0";
  }

  function azDeg(x) {
    return x.toFixed(1) + "\u00b0";
  }

  function pct(x) {
    return (x * 100).toFixed(0) + "%";
  }

  function hours(h) {
    if (h == null || !isFinite(h)) return "\u2014";
    if (h < 1) return (h * 60).toFixed(0) + " min";
    if (h < 72) return h.toFixed(1) + " h";
    return (h / 24).toFixed(1) + " d";
  }

  function msHours(ms) {
    return hours(ms / HOUR);
  }

  function energy(wh) {
    if (wh >= 1000) return (wh / 1000).toFixed(1) + " kWh";
    return wh.toFixed(0) + " Wh";
  }

  function utcStamp(ms) {
    var d = new Date(ms);
    return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()) +
      " " + pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()) + " UTC";
  }

  function utcDateValue(ms) {
    var d = new Date(ms);
    return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
  }

  function utcTimeValue(ms) {
    var d = new Date(ms);
    return pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes());
  }

  function utcIso(ms) {
    return new Date(ms).toISOString().slice(0, 16) + "Z";
  }

  function elapsed(ms) {
    var total = Math.max(0, Math.round(ms / 60000));
    var d = Math.floor(total / 1440);
    var h = Math.floor((total % 1440) / 60);
    var m = total % 60;
    if (d > 0) return "T+" + d + "d " + pad(h) + "h " + pad(m) + "m";
    return "T+" + pad(h) + "h " + pad(m) + "m";
  }

  function latLonText(site) {
    var ns = site.lat < 0 ? "S" : "N";
    var ew = site.lon < 0 ? "W" : "E";
    return Math.abs(site.lat).toFixed(3) + "\u00b0 " + ns + "  " + Math.abs(site.lon).toFixed(3) + "\u00b0 " + ew;
  }

  function isFarSide(site) {
    var d = Math.PI / 180;
    return Math.cos(site.lat * d) * Math.cos(site.lon * d) <= 0;
  }

  /* ---------- custom sites ---------- */

  function loadCustom() {
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(function (s) {
        return s && typeof s.id === "string" && isFinite(s.lat) && isFinite(s.lon);
      });
    } catch (err) {
      return [];
    }
  }

  function saveCustom() {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(custom));
    } catch (err) {
      /* private mode or a full quota: the session still works, it just will not persist */
    }
  }

  /* ---------- state ---------- */

  var builtin = window.LUNAR_SITES || [];
  var groups = window.LUNAR_GROUPS || [];
  var custom = loadCustom();
  var terrain = window.LUNAR_TERRAIN || null;

  /* Three findings this tool produces that a flat-map answer does not. They are
     the demo and the argument at once: each one sets up a scenario and then the
     note reads the numbers back out of the live model, so nothing here can go
     stale if the engine or the terrain changes. */
  var STORY_EPOCH = Date.UTC(2026, 10, 14, 0, 0);
  var STORY_HOURS = 708.734;

  var STORIES = [
    {
      id: "rim",
      site: "shackleton",
      label: "The rim that eats the Sun",
      teaser: "Shackleton, with and without its own terrain"
    },
    {
      id: "margin",
      site: "mouton",
      label: "A whole lunar day of sunlight",
      teaser: "Mons Mouton, and the half-degree it hangs on"
    },
    {
      id: "silence",
      site: "change4",
      label: "Where Earth never rises",
      teaser: "Chang\u2019e 4 on the far side, and what libration cannot fix"
    },
    {
      /* Centred on the 2026-08-28 lunar eclipse, which from the Moon is a solar
         eclipse. Starts a day early so the approach is in the window. */
      id: "eclipse",
      site: "mouton",
      label: "The one outage you can predict",
      teaser: "2026-08-28: Earth crosses in front of the Sun",
      epoch: Date.UTC(2026, 7, 27, 0, 0),
      hours: 48
    }
  ];

  function storyById(id) {
    for (var i = 0; i < STORIES.length; i++) {
      if (STORIES[i].id === id) return STORIES[i];
    }
    return null;
  }

  var state = {
    ui: "simple",
    story: null,
    selected: ["mouton"],
    landingMs: 0,
    durationHours: 708.734,
    terrain: !!terrain,
    maskDeg: 0,
    panelMode: "vertical",
    tiltDeg: 60,
    tracking: true,
    azimuthDeg: 0,
    efficiencyPct: 30,
    playheadMs: 0,
    mapMode: "auto",
    group: "all",
    search: "",
    playing: false,
    scanning: false,
    windows: [],
    slipDays: 14,
    solve: null
  };

  function allSites() {
    return builtin.concat(custom);
  }

  function siteById(id) {
    var list = allSites();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  function primarySite() {
    return siteById(state.selected[0]) || builtin[0];
  }

  function missionMs() {
    return state.durationHours * HOUR;
  }

  /* ---------- horizon mask ---------- */

  /* The LOLA profile for a site, or null. Only the catalogue's south-polar
     sites have one: custom coordinates and everything outside the product fall
     back to the uniform mask. */
  function terrainFor(site) {
    if (!state.terrain || !terrain || !terrain.sites || !site) return null;
    return terrain.sites[site.id] || null;
  }

  function terrainCount() {
    return terrain && terrain.sites ? Object.keys(terrain.sites).length : 0;
  }

  /* What goes to the engine. With a profile the slider becomes an offset on top
     of the real skyline; without one it is the whole mask. */
  function maskFor(site) {
    var profile = terrainFor(site);
    if (!profile) return state.maskDeg;
    return { profile: profile.profile, offsetDeg: state.maskDeg };
  }

  function panelSpec() {
    var eff = state.efficiencyPct / 100;
    if (state.panelMode === "vertical") return { tiltDeg: 90, tracking: true, azimuthDeg: 0, efficiency: eff };
    if (state.panelMode === "horizontal") return { tiltDeg: 0, tracking: true, azimuthDeg: 0, efficiency: eff };
    return {
      tiltDeg: state.tiltDeg,
      tracking: state.tracking,
      azimuthDeg: state.azimuthDeg,
      efficiency: eff
    };
  }

  /* ---------- mission cache ---------- */

  var cache = {};

  function cacheKey(site, panel, startMs) {
    return [
      site.id, site.lat, site.lon, startMs, missionMs(), state.maskDeg,
      terrainFor(site) ? "lola" : "flat",
      panel.tiltDeg, panel.tracking ? 1 : 0, panel.azimuthDeg, panel.efficiency
    ].join("|");
  }

  /* The epoch is a parameter, not state, because the slip comparison runs the
     same mission from a different start and must not disturb the live one. */
  function missionAt(site, panel, startMs) {
    var key = cacheKey(site, panel, startMs);
    if (cache[key]) return cache[key];
    var samples = LunarEph.sampleMission(new Date(startMs), missionMs(), site.lat, site.lon, {
      maskDeg: maskFor(site),
      panel: panel
    });
    var entry = { samples: samples, summary: LunarEph.summarize(samples) };
    var keys = Object.keys(cache);
    if (keys.length > 24) delete cache[keys[0]];
    cache[key] = entry;
    return entry;
  }

  function missionFor(site, panel) {
    return missionAt(site, panel, state.landingMs);
  }

  /* Solve results name times inside one specific mission, so they go stale the
     moment the mission does. Clearing them here means every caller is covered. */
  function dropCache() {
    cache = {};
    state.solve = null;
  }

  /* ---------- events from samples ---------- */

  /* Samples carry the mask that was resolved for the azimuth each body sat at,
     which is the only correct threshold once the mask varies with azimuth. */
  function maskOf(sample, key, fallback) {
    return isFinite(sample[key]) ? sample[key] : fallback;
  }

  function channel(sample, which, mask) {
    if (which === "sun") return sample.sunAlt + sample.sunRadius - maskOf(sample, "maskSun", mask);
    if (which === "earth") return sample.earthAlt + sample.earthRadius - maskOf(sample, "maskEarth", mask);
    return sample.stationAlt - maskOf(sample, "maskLink", mask);
  }

  var EVENT_KEYS = ["sunset", "sunrise", "earthset", "earthrise", "linkDown", "linkUp"];

  /* LunarEph.eventsFromSamples returns {sunset, sunrise, earthset, earthrise,
     linkDown, linkUp}, each null or {t, kind}. It only fills the direction implied
     by the clearance at the playhead, so a null is not an answer and we fall back
     to walking the samples with the same clearance definitions. */
  function engineEvents(samples, fromMs, mask) {
    var fn = window.LunarEph && LunarEph.eventsFromSamples;
    if (typeof fn !== "function") return null;
    var out;
    try {
      out = fn(samples, fromMs, mask);
    } catch (err) {
      return null;
    }
    if (!out || typeof out !== "object") return null;
    var usable = EVENT_KEYS.every(function (key) {
      if (!(key in out)) return false;
      var value = out[key];
      return value === null || (value && isFinite(value.t));
    });
    return usable ? out : null;
  }

  /* Azimuth wraps at 360, so interpolate along the shortest arc. A sunset at
     due north is a 359 -> 1 step, and a naive lerp would report 180. */
  function lerpAz(a, b, f) {
    var d = ((b - a + 540) % 360) - 180;
    return ((a + d * f) % 360 + 360) % 360;
  }

  /* All three DSN complexes sit inside Earth's ~1.9-degree disk as seen from the
     Moon, so Earth's azimuth is the link's azimuth to well under a degree. */
  function azOf(sample, which) {
    return which === "sun" ? sample.sunAz : sample.earthAz;
  }

  function walkCrossing(samples, fromMs, which, mask, wantRise) {
    for (var i = 0; i < samples.length - 1; i++) {
      if (samples[i + 1].t <= fromMs) continue;
      var a = channel(samples[i], which, mask);
      var b = channel(samples[i + 1], which, mask);
      var rising = a <= 0 && b > 0;
      var setting = a > 0 && b <= 0;
      if ((wantRise && rising) || (!wantRise && setting)) {
        var span = b - a;
        var frac = clamp(span === 0 ? 0 : (0 - a) / span, 0, 1);
        var t = samples[i].t + (samples[i + 1].t - samples[i].t) * frac;
        if (t >= fromMs) {
          return {
            kind: wantRise ? "rise" : "set",
            t: t,
            azDeg: lerpAz(azOf(samples[i], which), azOf(samples[i + 1], which), frac)
          };
        }
      }
    }
    return null;
  }

  function eventKeyFor(which, wantRise) {
    if (which === "sun") return wantRise ? "sunrise" : "sunset";
    if (which === "earth") return wantRise ? "earthrise" : "earthset";
    return wantRise ? "linkUp" : "linkDown";
  }

  function azAt(samples, t, which) {
    for (var i = 0; i < samples.length - 1; i++) {
      if (t >= samples[i].t && t <= samples[i + 1].t) {
        var span = samples[i + 1].t - samples[i].t;
        var f = span === 0 ? 0 : (t - samples[i].t) / span;
        return lerpAz(azOf(samples[i], which), azOf(samples[i + 1], which), f);
      }
    }
    return null;
  }

  /* -> {kind, t, azDeg} or null. Null is a real answer: at Shackleton the Sun may
     not set inside the window, and on the far side Earth never rises at all. */
  function nextCrossing(samples, fromMs, which, mask, wantRise) {
    var fromEngine = engineEvents(samples, fromMs, mask);
    if (fromEngine) {
      var hit = fromEngine[eventKeyFor(which, wantRise)];
      if (hit && isFinite(hit.t) && hit.t >= fromMs) {
        return {
          kind: wantRise ? "rise" : "set",
          t: hit.t,
          azDeg: azAt(samples, hit.t, which)
        };
      }
    }
    return walkCrossing(samples, fromMs, which, mask, wantRise);
  }

  /* ---------- eclipses ----------

     Seen from the Moon, a lunar eclipse is a SOLAR eclipse: Earth crosses in
     front of the Sun. The engine's sunFrac only models the skyline occulting the
     Sun, so without this an eclipse reads as full power.

     Everything needed is already on every sample: both angular radii, and both
     alt/az pairs. Session A is bringing LunarEph.eclipseAt with the same
     meaning; when it lands, delete this and call it. */

  var RAD = Math.PI / 180;

  function angularSep(az1, alt1, az2, alt2) {
    var c1 = Math.cos(alt1 * RAD);
    var c2 = Math.cos(alt2 * RAD);
    var dot = c1 * c2 * Math.cos((az1 - az2) * RAD) + Math.sin(alt1 * RAD) * Math.sin(alt2 * RAD);
    return Math.acos(clamp(dot, -1, 1)) / RAD;
  }

  /* Fraction of the solar disk's AREA hidden behind Earth's disk: the overlap of
     two circles over the area of the smaller one. */
  function overlapFraction(d, R, r) {
    if (!(R > 0) || !(r > 0)) return 0;
    if (d >= R + r) return 0;
    if (d <= R - r) return 1;
    if (d <= r - R) return (R * R) / (r * r);
    var a = r * r * Math.acos(clamp((d * d + r * r - R * R) / (2 * d * r), -1, 1));
    var b = R * R * Math.acos(clamp((d * d + R * R - r * r) / (2 * d * R), -1, 1));
    var c = 0.5 * Math.sqrt(Math.max(0,
      (-d + r + R) * (d + r - R) * (d - r + R) * (d + r + R)));
    return clamp((a + b - c) / (Math.PI * r * r), 0, 1);
  }

  function eclipseAt(sample) {
    var sep = angularSep(sample.sunAz, sample.sunAlt, sample.earthAz, sample.earthAlt);
    var obs = overlapFraction(sep, sample.earthRadius, sample.sunRadius);
    var kind = "none";
    if (obs >= 1) kind = "total";
    else if (obs > 0) kind = "partial";
    return { sepDeg: sep, obscuration: obs, kind: kind };
  }

  /* Contiguous runs of obscuration > 0, with the peak inside each run. */
  function eclipsesIn(samples) {
    var out = [];
    var open = null;
    for (var i = 0; i < samples.length; i++) {
      var e = eclipseAt(samples[i]);
      if (e.obscuration > 0) {
        if (!open) open = { startMs: samples[i].t, peakMs: samples[i].t, endMs: samples[i].t, maxObscuration: 0, kind: "partial" };
        open.endMs = samples[i].t;
        if (e.obscuration > open.maxObscuration) {
          open.maxObscuration = e.obscuration;
          open.peakMs = samples[i].t;
          open.kind = e.kind;
        }
      } else if (open) {
        out.push(open);
        open = null;
      }
    }
    if (open) out.push(open);
    return out;
  }

  /* Watt-hours the mission total over-counts, because the engine's lit fraction
     does not know about Earth. Trapezoid over the samples inside the run. */
  function eclipseEnergyLoss(samples, run) {
    var wh = 0;
    for (var i = 0; i < samples.length - 1; i++) {
      var a = samples[i];
      var b = samples[i + 1];
      if (b.t < run.startMs || a.t > run.endMs) continue;
      var lossA = a.power * eclipseAt(a).obscuration;
      var lossB = b.power * eclipseAt(b).obscuration;
      wh += (lossA + lossB) / 2 * ((b.t - a.t) / HOUR);
    }
    return wh;
  }

  /* ---------- inverse position ----------

     The forward question is "where is the Sun at time T". A planner asks the
     inverse: "when is the Sun where I need it". Session A is bringing
     LunarEph.solveFor; this walks the samples the mission already computed. */

  function altOf(sample, which) {
    return which === "sun" ? sample.sunAlt : sample.earthAlt;
  }

  /* Signed miss distance from the target, in degrees. Either axis may be null,
     meaning "do not constrain this one". */
  function solveMiss(sample, which, target) {
    if (target.altDeg !== null && target.azDeg !== null) {
      return angularSep(azOf(sample, which), altOf(sample, which), target.azDeg, target.altDeg);
    }
    if (target.altDeg !== null) return altOf(sample, which) - target.altDeg;
    return ((azOf(sample, which) - target.azDeg + 540) % 360) - 180;
  }

  function solveFor(samples, which, target) {
    var both = target.altDeg !== null && target.azDeg !== null;
    var hits = [];
    var i;
    if (both) {
      /* Two constraints rarely have an exact root, so report closest approach:
         any sample that is a local minimum of the separation. */
      for (i = 1; i < samples.length - 1; i++) {
        var p = solveMiss(samples[i - 1], which, target);
        var q = solveMiss(samples[i], which, target);
        var r = solveMiss(samples[i + 1], which, target);
        if (q <= p && q <= r) {
          hits.push({
            t: samples[i].t,
            azDeg: azOf(samples[i], which),
            altDeg: altOf(samples[i], which),
            missDeg: q,
            exact: q < 0.25
          });
        }
      }
    } else {
      for (i = 0; i < samples.length - 1; i++) {
        var a = solveMiss(samples[i], which, target);
        var b = solveMiss(samples[i + 1], which, target);
        if (a === 0 || (a < 0) !== (b < 0)) {
          /* An azimuth miss jumps 180 -> -180 at the antipode; that sign change
             is the wrap, not a crossing. */
          if (Math.abs(b - a) > 180) continue;
          var span = b - a;
          var f = clamp(span === 0 ? 0 : (0 - a) / span, 0, 1);
          var step = samples[i + 1].t - samples[i].t;
          hits.push({
            t: samples[i].t + step * f,
            azDeg: lerpAz(azOf(samples[i], which), azOf(samples[i + 1], which), f),
            altDeg: altOf(samples[i], which) + (altOf(samples[i + 1], which) - altOf(samples[i], which)) * f,
            missDeg: 0,
            exact: true
          });
        }
      }
    }
    hits.sort(function (x, y) { return x.t - y.t; });
    return hits.slice(0, 12);
  }

  /* ---------- model for viz ---------- */

  function buildModel() {
    var panel = panelSpec();
    var sites = state.selected.map(function (id, index) {
      var site = siteById(id);
      if (!site) return null;
      var mission = missionFor(site, panel);
      return {
        id: site.id,
        name: site.name,
        short: site.short || site.name,
        lat: site.lat,
        lon: site.lon,
        color: COLORS[index % COLORS.length],
        samples: mission.samples,
        summary: mission.summary,
        site: site,
        terrain: terrainFor(site),
        now: LunarEph.evaluate(new Date(state.playheadMs), site.lat, site.lon, maskFor(site), panel)
      };
    }).filter(Boolean);

    var lead = sites.length ? sites[0].terrain : null;
    return {
      sites: sites,
      primaryId: sites.length ? sites[0].id : null,
      playheadMs: state.playheadMs,
      landingMs: state.landingMs,
      maskDeg: state.maskDeg,
      maskProfile: lead ? lead.profile : null,
      mapMode: state.mapMode
    };
  }

  /* ---------- rendering ---------- */

  function renderFilters() {
    var items = [{ id: "all", label: "All" }].concat(groups.map(function (g) {
      return { id: g.id, label: g.label };
    }));
    if (custom.length) items.push({ id: "custom", label: "Custom" });
    el("filters").innerHTML = items.map(function (g) {
      return '<button type="button" data-group="' + esc(g.id) + '"' +
        (state.group === g.id ? ' class="on"' : "") + ">" + esc(g.label) + "</button>";
    }).join("");
  }

  function visibleSites() {
    var q = state.search.trim().toLowerCase();
    return allSites().filter(function (site) {
      if (state.group !== "all" && site.group !== state.group) return false;
      if (!q) return true;
      return (site.name + " " + (site.program || "") + " " + (site.short || "")).toLowerCase().indexOf(q) >= 0;
    });
  }

  function renderSiteList() {
    var rows = visibleSites().map(function (site) {
      var index = state.selected.indexOf(site.id);
      var cls = "site-row" + (index === 0 ? " primary" : index > 0 ? " compare" : "");
      var color = index >= 0 ? COLORS[index % COLORS.length] : "transparent";
      return '<div class="' + cls + '" role="option" tabindex="0" data-id="' + esc(site.id) + '"' +
        ' aria-selected="' + (index >= 0 ? "true" : "false") + '">' +
        '<span class="pip" style="background:' + color + '"></span>' +
        "<span><b>" + esc(site.name) + "</b>" +
        "<small>" + esc(latLonText(site)) + "</small></span>" +
        '<span class="right"><span class="tag">' + esc(site.program || "") + "</span>" +
        '<button type="button" class="pin' + (index >= 0 ? " on" : "") + '" data-pin="' + esc(site.id) + '"' +
        ' title="Pin for comparison" aria-label="Pin ' + esc(site.name) + ' for comparison">' +
        (index >= 0 ? "pinned" : "pin") + "</button></span></div>";
    });
    el("site-list").innerHTML = rows.length ? rows.join("") : '<div class="site-row"><span></span><span class="muted">No site matches that search.</span><span></span></div>';
  }

  function renderChips() {
    el("chips").innerHTML = state.selected.map(function (id, index) {
      var site = siteById(id);
      if (!site) return "";
      var color = COLORS[index % COLORS.length];
      return '<span class="chip-group">' +
        '<button type="button" class="chip' + (index === 0 ? " primary" : "") + '" data-chip="' + esc(id) + '">' +
        '<i class="swatch" style="background:' + color + '"></i>' + esc(site.short || site.name) + "</button>" +
        (state.selected.length > 1
          ? '<button type="button" class="chip-x" data-drop="' + esc(id) + '" aria-label="Remove ' + esc(site.name) + '">\u00d7</button>'
          : "") +
        "</span>";
    }).join("");
  }

  function renderSiteNote() {
    var site = primarySite();
    var tail = isFarSide(site)
      ? " Past the mean-Earth hemisphere: Earth sits near or below the horizon here, and libration decides whether a direct link exists at all."
      : "";
    el("site-note").innerHTML = "<b>" + esc(site.name) + ".</b> " + esc(site.note || "") + esc(tail);
  }

  function renderSeason(now) {
    var lat = now.subSolarLat;
    var phrase;
    if (lat < -0.3) phrase = "South-pole sunlight season. The Sun is south of the lunar equator, so southern sites sit at their best elevations.";
    else if (lat > 0.3) phrase = "South-pole shadowed season. The Sun is north of the equator, so southern sites skim or sit below the horizon.";
    else phrase = "Transitional. The subsolar latitude is near zero and polar elevations are crossing the horizon.";
    el("season").innerHTML = "<b>Subsolar latitude " + deg(lat, 2) + "</b><span>" + esc(phrase) + "</span>";
  }

  /* "Sunset in 3 d 14 h, at azimuth 274" is the line the brief calls critical
     operational information. A null is printed as a sentence, never as a blank:
     "the Sun does not set here" is an answer, and at the pole it is the answer. */
  function eventLine(mission, now, which) {
    var isUp = which === "sun" ? now.lit : now.dte;
    var hit = nextCrossing(mission.samples, state.playheadMs, which, state.maskDeg, !isUp);
    var label = which === "sun" ? (isUp ? "Sunset" : "Sunrise") : (isUp ? "Link loss" : "Link return");
    if (!hit) {
      var body = which === "sun" ? "the Sun" : "the link";
      return label + ": never \u2014 " + body + " stays " +
        (isUp ? "up" : "down") + " for the whole window";
    }
    var az = isFinite(hit.azDeg) ? ", at " + azDeg(hit.azDeg) + " az" : "";
    return label + " in " + msHours(hit.t - state.playheadMs) + az +
      " \u00b7 " + utcStamp(hit.t);
  }

  function eclipseLine(entry) {
    var e = eclipseAt(entry.now);
    if (e.obscuration > 0) {
      return "<dt>Eclipse</dt><dd class=\"alert\">Earth is covering " + pct(e.obscuration) +
        " of the Sun \u00b7 " + esc(e.kind) + "</dd>";
    }
    var list = eclipsesIn(entry.samples).filter(function (x) { return x.peakMs >= state.playheadMs; });
    if (!list.length) {
      return "<dt>Eclipse</dt><dd>None ahead in this window \u00b7 Earth transits the Sun about twice a year</dd>";
    }
    var next = list[0];
    return "<dt>Eclipse</dt><dd>Earth crosses the Sun in " +
      msHours(next.peakMs - state.playheadMs) + " \u00b7 " + pct(next.maxObscuration) + " covered</dd>";
  }

  function renderReadout(model) {
    var primary = model.sites[0];
    var now = primary.now;
    var clearance = now.earthAlt + now.earthRadius - maskOf(now, "maskEarth", state.maskDeg);
    var notes = [];
    if (!window.LunarViz) notes.push("viz.js is not loaded yet.");
    if (now.earthDisk && !now.earthCenter) {
      notes.push("Earth\u2019s centre is below the horizon while the upper limb is still up. That margin is the whole link.");
    } else if (!now.earthDisk && clearance > -0.3) {
      notes.push("Earth is just under the horizon. A degree of terrain either way decides this.");
    }
    if (now.lit && now.sunAlt < 1 && now.sunAlt > -1) {
      notes.push("The Sun is part-risen: only a slice of the disk clears the mask.");
    }
    var ecl = eclipseAt(now);
    if (ecl.obscuration > 0) {
      notes.push("Earth is in front of the Sun, and the watts above do not know it: the engine\u2019s lit " +
        "fraction models the horizon mask, not Earth. Scale the power by " +
        (1 - ecl.obscuration).toFixed(2) + " for this instant.");
    }

    el("readout").innerHTML =
      '<div class="kicker">Playhead \u00b7 UTC</div>' +
      "<h2>" + esc(primary.name) + "</h2>" +
      "<dl>" +
      "<dt>Time</dt><dd>" + utcStamp(state.playheadMs) + " \u00b7 " + elapsed(state.playheadMs - state.landingMs) + "</dd>" +
      "<dt>Sun</dt><dd>" + deg(now.sunAlt) + " alt \u00b7 " + azDeg(now.sunAz) + " az" + (now.lit ? "" : " \u00b7 down") + "</dd>" +
      "<dt>Earth</dt><dd>" + deg(now.earthAlt) + " alt \u00b7 " + azDeg(now.earthAz) + " az</dd>" +
      "<dt>Limb</dt><dd>" + deg(clearance) + " clearance \u00b7 " + (now.earthDisk ? "disk up" : "disk down") + "</dd>" +
      "<dt>Link</dt><dd>" + (now.dte ? "direct to Earth" : "no direct link") + " \u00b7 best station " + deg(now.stationAlt, 1) + "</dd>" +
      "<dt>Power</dt><dd>" + now.power.toFixed(0) + " W/m\u00b2 at " + state.efficiencyPct + "% cells</dd>" +
      "<dt>Next</dt><dd>" + esc(eventLine(primary, now, "sun")) + "</dd>" +
      "<dt></dt><dd>" + esc(eventLine(primary, now, "dte")) + "</dd>" +
      eclipseLine(primary) +
      "</dl>" +
      (notes.length ? '<p class="readout-note">' + esc(notes.join(" ")) + "</p>" : "");
  }

  function renderMetrics(model) {
    var s = model.sites[0].summary;
    if (!s) {
      el("metrics").innerHTML = "";
      return;
    }
    function card(kind, label, value, sub) {
      return '<div class="card ' + kind + '"><div class="label">' + label + '</div>' +
        '<div class="value">' + value + '</div><div class="sub">' + sub + "</div></div>";
    }
    el("metrics").innerHTML =
      card("sun", "Sunlight", pct(s.sunlitFrac),
        hours(s.sunlitHours) + " lit \u00b7 longest night " + msHours(s.longestNight.ms)) +
      card("earth", "Direct to Earth", pct(s.dteFrac),
        hours(s.dteHours) + " in view \u00b7 longest gap " + msHours(s.longestBlackout.ms)) +
      card("joint", "Sun and link together", pct(s.jointFrac),
        hours(s.jointHours) + " of overlap \u00b7 Earth disk " + pct(s.earthFrac)) +
      card("power", "Energy", energy(s.energyWh) + "/m\u00b2",
        s.meanPower.toFixed(0) + " average watts per m\u00b2, night included");
  }

  /* The same mission against a smooth 1,737.4 km sphere, which is what every
     tool that does not carry a DEM is implicitly answering. */
  function sphereSummary(site) {
    var samples = LunarEph.sampleMission(new Date(state.landingMs), missionMs(), site.lat, site.lon, {
      maskDeg: 0,
      panel: panelSpec()
    });
    return LunarEph.summarize(samples);
  }

  function renderStories() {
    el("story-bar").innerHTML = STORIES.map(function (story) {
      return '<button type="button" data-story="' + esc(story.id) + '"' +
        (state.story === story.id ? ' class="on"' : "") + ">" +
        "<b>" + esc(story.label) + "</b><span>" + esc(story.teaser) + "</span></button>";
    }).join("");
  }

  function storyBody(model) {
    var entry = model.sites[0];
    var s = entry.summary;

    if (state.story === "rim") {
      var sphere = sphereSummary(entry.site);
      return "<h3>Shackleton keeps the Sun for " + '<span class="figure">' + pct(s.sunlitFrac) +
        "</span> of a lunar day, not " + '<span class="counter">' + pct(sphere.sunlitFrac) + "</span></h3>" +
        "<p>Shackleton sits almost exactly on the pole, so on a smooth sphere the Sun never sets: " +
        '<span class="counter">' + pct(sphere.sunlitFrac) + "</span> sunlit, " +
        '<span class="counter">' + energy(sphere.energyWh) + "/m\u00b2</span>. That is the answer you get from a map.</p>" +
        "<p>Against the crater\u2019s own rim, measured from the LOLA polar DEM at 120 m per pixel, " +
        "the skyline rises to " + deg(entry.terrain ? entry.terrain.max : 0, 1) +
        " in some directions and the Sun spends much of the month behind it: " +
        '<span class="figure">' + pct(s.sunlitFrac) + "</span> sunlit, " +
        '<span class="figure">' + energy(s.energyWh) + "/m\u00b2</span>, with a " +
        msHours(s.longestNight.ms) + " night the sphere model says does not exist.</p>" +
        "<p>That gap is the whole reason the terrain is in this tool. Size a battery off the first number and the lander dies.</p>";
    }

    if (state.story === "margin") {
      var tight = tightestSun(entry);
      return "<h3>Mons Mouton is sunlit all month \u2014 by " + '<span class="figure">' + deg(tight.margin, 2) + "</span></h3>" +
        "<p>Over this lunar day Mouton reads " + '<span class="figure">' + pct(s.sunlitFrac) +
        " sunlight</span> and " + '<span class="figure">' + energy(s.energyWh) +
        "/m\u00b2</span>. Printed on a slide that looks like a solved problem.</p>" +
        "<p>Walk the samples and the solar limb comes within " + '<span class="figure">' + deg(tight.margin, 2) +
        "</span> of the measured skyline on " + utcStamp(tight.timeMs) + ", with the Sun at " + deg(tight.alt, 1) +
        " and the terrain at " + deg(tight.mask, 1) + " on that bearing. The LOLA product resolves 120 m; " +
        "a ridge finer than that, or one beyond the 100 km these rays reach, erases the margin and with it the claim.</p>" +
        "<p>So the tool refuses to print \u201c100% sunlight\u201d on its own. The margin is reported every time, " +
        "because a number without its error bar is not a finding.</p>";
    }

    if (state.story === "eclipse") {
      var list = eclipsesIn(entry.samples);
      if (!list.length) {
        return "<h3>No eclipse in this window</h3><p>Nothing covers the Sun here between " +
          utcStamp(state.landingMs) + " and the end of the window.</p>";
      }
      var ec = list[0];
      var peak = entry.samples.reduce(function (best, s) {
        return Math.abs(s.t - ec.peakMs) < Math.abs(best.t - ec.peakMs) ? s : best;
      }, entry.samples[0]);
      var at = eclipseAt(peak);
      return "<h3>Earth covers " + '<span class="figure">' + pct(ec.maxObscuration) +
        "</span> of the Sun on " + utcStamp(ec.peakMs) + "</h3>" +
        "<p>Seen from Earth this is a lunar eclipse. Seen from the ground at " + esc(entry.name) +
        " it is a <b>solar</b> eclipse: Earth passes in front of the Sun. At peak the two are " +
        '<span class="figure">' + deg(at.sepDeg, 3) + "</span> apart in the sky, inside Earth\u2019s " +
        deg(peak.earthRadius, 2) + " disk, and the whole event runs " +
        msHours(ec.endMs - ec.startMs) + ".</p>" +
        "<p>For a solar-powered lander this is the one total outage you can predict years ahead " +
        "and size a battery for. The Sun is at " + deg(peak.sunAlt, 1) + " altitude and " +
        azDeg(peak.sunAz) + " azimuth when it happens, so there is nowhere to point an array to avoid it.</p>" +
        "<p>It is also a free check on the whole engine. An eclipse <em>is</em> Sun and Earth at the " +
        "same place in the sky, and this tool computes those two directions by completely separate paths. " +
        "They agree to " + deg(at.sepDeg, 3) + ". No sign error in the lunar rotation survives that.</p>" +
        "<p class=\"margin-note\">Known limit: the power and sunlight figures elsewhere on this page still " +
        "read " + pct(peak.sunFrac) + " of the disk at peak, because the engine\u2019s lit fraction models the " +
        "horizon mask occulting the Sun and not Earth occulting it. The eclipse geometry above is right; " +
        "the energy total over this window is optimistic by " +
        energy(eclipseEnergyLoss(entry.samples, ec)) + "/m\u00b2.</p>";
    }

    if (state.story === "silence") {
      return "<h3>Chang\u2019e 4 has " + '<span class="figure">' + pct(s.dteFrac) + "</span> direct-to-Earth time</h3>" +
        "<p>On the far side Earth is not low, it is absent. Over the whole lunar day Earth\u2019s altitude runs " +
        deg(s.earthMin, 1) + " to " + deg(s.earthMax, 1) + " \u2014 never once above the horizon \u2014 " +
        "so there is " + '<span class="figure">' + pct(s.dteFrac) + "</span> of direct link and a blackout " +
        msHours(s.longestBlackout.ms) + " long. China flew the Queqiao relay satellite for exactly this reason.</p>" +
        "<p>Contrast it with Slater Plain, just past the mean-Earth hemisphere near the south pole, where libration of " +
        "about \u00b18\u00b0 lifts Earth over the horizon for a third of the month. \u201cFar side\u201d and \u201cno link\u201d " +
        "are not the same statement, and only the geometry tells you which one you have.</p>" +
        "<p>Power is the other half: " + '<span class="figure">' + pct(s.sunlitFrac) + "</span> sunlit here, " +
        "with a " + msHours(s.longestNight.ms) + " night to survive.</p>";
    }
    return "";
  }

  function renderStoryNote(model) {
    el("story-note").innerHTML = state.story ? storyBody(model) : "";
  }

  function renderEvidence() {
    var v = window.LUNAR_VALIDATION;
    var body = el("evidence-body");
    if (!v) {
      body.innerHTML = '<p class="repro">validation.js is not loaded.</p>';
      return;
    }

    var sources = v.sources.map(function (src) {
      return '<div class="src"><b>' + esc(src.label) + '</b> <span class="detail">' + esc(src.detail) + "</span>" +
        '<div class="role">' + esc(src.role) + "</div>" +
        '<div class="where">' + esc(src.where) + "</div></div>";
    }).join("");

    var rows = v.cases.map(function (c) {
      return "<tr><td>" + esc(c.name) + " \u00b7 " + esc(c.body) + "</td>" +
        '<td class="num">' + c.az.toFixed(3) + " / " + c.el.toFixed(3) + "</td>" +
        '<td class="num">' + c.hAz.toFixed(3) + " / " + c.hEl.toFixed(3) + "</td>" +
        '<td class="num">' + c.dAz.toFixed(3) + "</td>" +
        '<td class="num">' + c.dEl.toFixed(3) + "</td>" +
        '<td class="pass">ok</td></tr>';
    }).join("");

    var terrainLine = terrain
      ? "Profiles for " + terrainCount() + " of the catalogue\u2019s sites, every one south of " +
        Math.abs(terrain.meta.minLat) + "\u00b0S, at " + terrain.meta.bins + " azimuths each, rays to " +
        terrain.meta.rayKm + " km. Generated " + esc(terrain.meta.generated) + " by tools/lola-horizon.mjs."
      : "terrain.js is not loaded.";

    body.innerHTML =
      "<h3>NASA data this project runs on</h3>" + sources +
      '<p class="repro">' + terrainLine + "</p>" +
      "<h3>Checked against JPL Horizons</h3>" +
      "<table><tr><th>Case</th><th class=\"num\">This tool az / el</th><th class=\"num\">Horizons az / el</th>" +
      "<th class=\"num\">\u0394az</th><th class=\"num\">\u0394el</th><th></th></tr>" + rows + "</table>" +
      '<p class="repro">Degrees, apparent azimuth and elevation, topocentric on the lunar surface (' +
      esc(v.centre) + ", quantity " + esc(v.quantity) + "). Worst disagreement <b>" +
      v.worstDeg.toFixed(3) + "\u00b0</b> against a " + v.toleranceDeg + "\u00b0 tolerance. " +
      "Subsolar latitude peaks at " + v.subSolarPeakDeg.toFixed(3) + "\u00b0 over 2026, inside the \u00b11.6\u00b0 the Moon\u2019s tilt allows. " +
      "Recorded " + esc(v.ranOn) + "; reproduce with <code>node test/validate.mjs</code>, which queries " +
      esc(v.api) + " live and fails if this tool ever drifts.</p>";
  }

  /* Simple mode's only readout. Same numbers the console shows, no controls.
     Deliberately leads with the two fractions a lander actually lives on. */
  function renderSimpleCard(model) {
    var entry = model.sites[0];
    var s = entry.summary;
    if (!s) {
      el("simple-card").innerHTML = "";
      return;
    }
    var now = entry.now;
    var site = entry.site;
    var prof = entry.terrain;
    var tight = tightestSun(entry);

    function big(kind, label, value) {
      return '<div><div class="label">' + label + '</div><div class="value ' + kind + '">' +
        value + "</div></div>";
    }

    var arrayText = state.panelMode === "vertical"
      ? "a vertical array tracking the Sun"
      : state.panelMode === "horizontal"
        ? "a flat panel"
        : "a fixed " + state.tiltDeg + "\u00b0 tilt";

    var note = "";
    if (s.sunlitFrac > 0.995 && tight.margin < 1.5) {
      note = '<p class="margin-note">Sunlit the whole window, but only by ' + deg(tight.margin, 2) +
        " at its tightest, on " + utcStamp(tight.timeMs) +
        ". A ridge finer than 120 m would end that.</p>";
    } else if (!prof) {
      note = '<p class="margin-note">No LOLA profile reaches this site, so its horizon is an assumption rather than a measurement.</p>';
    }

    el("simple-card").innerHTML =
      '<div class="kicker">' + esc(site.program || site.status || "Landing site") + "</div>" +
      "<h2>" + esc(site.name) + "</h2>" +
      '<div class="coords">' + esc(latLonText(site)) + "</div>" +
      '<div class="big">' +
        big("sun", "Sunlight", pct(s.sunlitFrac)) +
        big("earth", "Direct to Earth", pct(s.dteFrac)) +
      "</div>" +
      "<dl>" +
        "<dt>Energy</dt><dd>" + energy(s.energyWh) + "/m\u00b2 \u00b7 " + s.meanPower.toFixed(0) + " W/m\u00b2 mean</dd>" +
        "<dt>Longest night</dt><dd>" + msHours(s.longestNight.ms) + "</dd>" +
        "<dt>Longest gap</dt><dd>" + msHours(s.longestBlackout.ms) + " with no link</dd>" +
        /* Only worth a row where the Sun stays up: elsewhere it just reports how
           far below the horizon midnight goes, which is not a margin. */
        (s.sunlitFrac > 0.9
          ? "<dt>Sun margin</dt><dd>" + deg(tight.margin, 2) + " at its worst</dd>"
          : "") +
        "<dt>Skyline</dt><dd>" + (prof
          ? deg(prof.min, 1) + " to " + deg(prof.max, 1) + ", LOLA"
          : "uniform " + deg(state.maskDeg, 1) + " mask") + "</dd>" +
        "<dt>Sun now</dt><dd>" + deg(now.sunAlt) + " alt \u00b7 " + azDeg(now.sunAz) + " az</dd>" +
        "<dt>Earth now</dt><dd>" + deg(now.earthAlt) + " alt \u00b7 " + (now.dte ? "link up" : "no link") + "</dd>" +
        "<dt>Next</dt><dd>" + esc(eventLine(entry, now, "sun")) + "</dd>" +
        eclipseLine(entry) +
      "</dl>" +
      note +
      '<p class="source">' + hours(state.durationHours) + " from " + utcStamp(state.landingMs) +
      ", with " + arrayText + " at " + state.efficiencyPct +
      "% cells. Airless geometry, checked against JPL Horizons to better than 0.01\u00b0.</p>";
  }

  function renderCompare(model) {
    if (model.sites.length < 2) {
      el("compare").innerHTML = "";
      return;
    }
    var head = "<tr><th>Site</th><th class=\"num\">Sunlight</th><th class=\"num\">Longest night</th>" +
      "<th class=\"num\">DTE</th><th class=\"num\">Longest gap</th><th class=\"num\">Joint</th>" +
      "<th class=\"num\">Energy/m\u00b2</th><th class=\"num\">Mean W/m\u00b2</th></tr>";
    var rows = model.sites.map(function (entry) {
      var s = entry.summary;
      return "<tr><td><i class=\"swatch\" style=\"background:" + entry.color + "\"></i>" + esc(entry.name) +
        (entry.id === model.primaryId ? " <span class=\"tag\">primary</span>" : "") + "</td>" +
        '<td class="num">' + pct(s.sunlitFrac) + "</td>" +
        '<td class="num">' + msHours(s.longestNight.ms) + "</td>" +
        '<td class="num">' + pct(s.dteFrac) + "</td>" +
        '<td class="num">' + msHours(s.longestBlackout.ms) + "</td>" +
        '<td class="num">' + pct(s.jointFrac) + "</td>" +
        '<td class="num">' + energy(s.energyWh) + "</td>" +
        '<td class="num">' + s.meanPower.toFixed(0) + "</td></tr>";
    }).join("");
    el("compare").innerHTML = '<section class="panel compare-panel"><div class="block-title">Same mask, same array, different place</div>' +
      '<table class="compare-table">' + head + rows + "</table>" +
      '<p class="help">One landing epoch, one mission length, one horizon mask. The difference is the site.</p></section>';
  }

  function flatComparison(site, panel) {
    var alt = Object.assign({}, panel, { tiltDeg: panel.tiltDeg === 0 ? 90 : 0, tracking: true });
    return missionFor(site, alt).summary;
  }

  /* The sample where the solar limb came closest to the skyline. Worth saying
     out loud, because "the Sun never sets" can be true by a quarter of a degree. */
  function tightestSun(entry) {
    var best = null;
    for (var i = 0; i < entry.samples.length; i++) {
      var sample = entry.samples[i];
      var margin = channel(sample, "sun", state.maskDeg);
      if (!best || margin < best.margin) {
        best = {
          margin: margin,
          timeMs: sample.t,
          alt: sample.sunAlt,
          mask: maskOf(sample, "maskSun", state.maskDeg)
        };
      }
    }
    return best;
  }

  function renderInsights(model) {
    var primary = model.sites[0];
    var s = primary.summary;
    var now = primary.now;
    var site = primary.site;
    var lines = [];

    var prof = primary.terrain;
    lines.push("<b>" + esc(site.name) + "</b> over " + hours(state.durationHours) + " from " +
      utcStamp(state.landingMs) + ", against " + (prof
        ? "the LOLA skyline" + (Math.abs(state.maskDeg) > 0.05 ? " raised " + deg(state.maskDeg, 1) : "")
        : "a uniform horizon mask of " + deg(state.maskDeg, 1)) + ".");

    if (prof) {
      lines.push("The real skyline here runs " + deg(prof.min, 1) + " to " + deg(prof.max, 1) +
        " around the compass, from a site " + (prof.h0 >= 0 ? prof.h0 + " m above" : -prof.h0 + " m below") +
        " the 1,737.4 km datum. " +
        (prof.max - prof.min > 6
          ? "That spread is the whole point: one number could not stand in for it."
          : "A fairly even skyline, so a uniform mask is not a bad approximation here."));
    }

    if (s.sunlitFrac > 0.995) {
      var tight = tightestSun(primary);
      lines.push("The Sun never sets here over this window, but it is not comfortable: the closest it comes to the skyline is " +
        deg(tight.margin, 2) + " of clearance, on " + utcStamp(tight.timeMs) + ", with the Sun at " +
        deg(tight.alt, 1) + " altitude and the skyline at " + deg(tight.mask, 1) +
        " on that bearing. A ridge this tool cannot see would end it.");
    }

    if (now.subSolarLat < -0.3) {
      lines.push("The subsolar latitude is " + deg(now.subSolarLat, 2) +
        ", so this is south-pole sunlight season and southern sites are at their best.");
    } else if (now.subSolarLat > 0.3) {
      lines.push("The subsolar latitude is " + deg(now.subSolarLat, 2) +
        ", so this is south-pole shadowed season. Expect the Sun to sit low or below the horizon near the pole.");
    } else {
      lines.push("The subsolar latitude is " + deg(now.subSolarLat, 2) + ", a transitional month near the pole.");
    }

    lines.push("The Sun ranges " + deg(s.sunMin, 1) + " to " + deg(s.sunMax, 1) +
      " and Earth ranges " + deg(s.earthMin, 1) + " to " + deg(s.earthMax, 1) + " over the window." +
      (s.sunMax < 15 ? " That is a skimming polar Sun, not a day and a night." : ""));

    if (s.dteFrac < 0.05) {
      lines.push("Earth is effectively never in view: direct-to-Earth is " + pct(s.dteFrac) +
        " of the window while the Sun is up " + pct(s.sunlitFrac) +
        ". Power is not the problem here, the radio path is, and the answer is a relay.");
    } else if (isFarSide(site) && s.dteFrac < 0.6) {
      lines.push("This site is past the mean-Earth hemisphere, so Earth never climbs high: it runs " +
        deg(s.earthMin, 1) + " to " + deg(s.earthMax, 1) + " and clears the horizon " + pct(s.dteFrac) +
        " of the window. Near the pole, libration of about \u00b18\u00b0 is doing all the work, so a relay is the safe plan even though the link is not always gone." +
        (s.sunlitFrac > s.dteFrac ? " Sunlight is the easier resource here: " + pct(s.sunlitFrac) + " of the window." : ""));
    } else if (s.sunlitFrac > 0.5 && s.dteFrac > 0.5) {
      lines.push("Both the Sun and Earth are up for more than half the window, and they overlap " +
        pct(s.jointFrac) + " of the time.");
    }

    if (Math.abs(site.lat) > 80) {
      var panel = panelSpec();
      var other = flatComparison(site, panel);
      if (panel.tiltDeg === 0) {
        lines.push("Flat on the ground this site collects " + energy(s.energyWh) + "/m\u00b2. A vertical array tracking the Sun\u2019s azimuth collects " +
          energy(other.energyWh) + "/m\u00b2 on the same window, because a polar Sun arrives almost edge-on to a flat panel.");
      } else {
        lines.push("The array you picked collects " + energy(s.energyWh) + "/m\u00b2. Flat on the ground the same window gives " +
          energy(other.energyWh) + "/m\u00b2. Near the pole the Sun arrives almost horizontally, so the panel wants to stand up.");
      }
    }

    if (model.sites.length > 1) {
      for (var i = 1; i < model.sites.length; i++) {
        var other2 = model.sites[i];
        var dSun = s.sunlitHours - other2.summary.sunlitHours;
        var dDte = s.dteHours - other2.summary.dteHours;
        lines.push("Against <b>" + esc(other2.name) + "</b>: " + (dSun >= 0 ? "+" : "\u2212") + hours(Math.abs(dSun)) +
          " of sunlight and " + (dDte >= 0 ? "+" : "\u2212") + hours(Math.abs(dDte)) + " of direct-to-Earth time.");
      }
    }

    if (prof) {
      lines.push('<span class="muted">Skyline from ' + esc(terrain.meta.product) + ', LOLA at ' +
        terrain.meta.resolutionM + " m per pixel, rays to " + terrain.meta.rayKm +
        " km in " + terrain.meta.bins + " directions. Past that the datum sphere is assumed, which is the " +
        deg(prof.floor, 1) + " floor. Sun and Earth positions are still airless geometry on a sphere.</span>");
    } else {
      lines.push('<span class="muted">Smooth 1,737.4 km sphere with a uniform mask. No LOLA profile for this site, so the mask is a question, not a measurement.</span>');
    }

    el("insights").innerHTML = '<div class="block-title">Reading</div>' + lines.map(function (line) {
      return "<p>" + line + "</p>";
    }).join("");
  }

  function renderPanelHint(model) {
    var now = model.sites[0].now;
    var alt = now.sunAlt;
    if (alt > 0.5 && alt < 20) {
      var ratio = Math.cos(alt * Math.PI / 180) / Math.sin(alt * Math.PI / 180);
      el("panel-hint").textContent = "At the playhead the Sun is " + alt.toFixed(2) +
        "\u00b0 up. A vertical array that tracks the azimuth sees about " + ratio.toFixed(1) +
        "\u00d7 the irradiance of a flat panel at this instant, before cell efficiency.";
    } else if (alt <= 0.5) {
      el("panel-hint").textContent = "The Sun is at or below the horizon at the playhead, so the array is making nothing right now.";
    } else {
      el("panel-hint").textContent = "The Sun is " + alt.toFixed(1) + "\u00b0 up, high enough that a flat panel is reasonable.";
    }
  }

  function renderWindows() {
    var list = el("windows");
    if (state.scanning) {
      list.innerHTML = '<p class="help">Screening start times, 6-hour steps\u2026</p>';
      return;
    }
    if (!state.windows.length) {
      list.innerHTML = '<p class="help">Nothing scanned yet.</p>';
      return;
    }
    var overlap = state.durationHours > 24 * 60
      ? '<p class="help">This mission is long, so the ranked windows overlap heavily.</p>'
      : "";
    list.innerHTML = overlap + state.windows.map(function (w) {
      return '<button type="button" data-start="' + w.start + '">' +
        "<b>" + utcStamp(w.start) + "</b>" +
        "<span>sun " + pct(w.sunFrac) + " \u00b7 DTE " + pct(w.dteFrac) + " \u00b7 joint " + pct(w.jointFrac) +
        " \u00b7 " + energy(w.energyWh) + "/m\u00b2 \u00b7 night " + hours(w.longestNightH) +
        " \u00b7 blackout " + hours(w.longestBlackoutH) + "</span></button>";
    }).join("") + '<p class="help">A 6-hour screen, not a flight product. Open a date to read it at full resolution.</p>';
  }

  /* ---------- inverse position, eclipses, slip ---------- */

  function renderSolve() {
    var list = el("solve-list");
    var found = state.solve;
    if (!found) {
      list.innerHTML = "";
      return;
    }
    if (found.message) {
      list.innerHTML = '<p class="help">' + esc(found.message) + "</p>";
      return;
    }
    if (!found.hits.length) {
      list.innerHTML = '<p class="help">' + esc(found.label) +
        " never happens in this window. Try a longer mission, another site, or leave one axis free.</p>";
      return;
    }
    list.innerHTML = '<p class="help">' + esc(found.label) + " \u00b7 " +
      found.hits.length + (found.hits.length === 1 ? " time" : " times") + ".</p>" +
      found.hits.map(function (hit) {
        return '<button type="button" data-solve="' + Math.round(hit.t) + '">' +
          "<b>" + utcStamp(hit.t) + "</b><span>" + deg(hit.altDeg) + " alt \u00b7 " +
          azDeg(hit.azDeg) + " az \u00b7 " + msHours(hit.t - state.landingMs) + " after landing" +
          (hit.exact ? "" : " \u00b7 closest approach " + deg(hit.missDeg, 2)) +
          "</span></button>";
      }).join("");
  }

  function runSolve() {
    if (!lastModel || !lastModel.sites.length) return;
    var altRaw = el("solve-alt").value.trim();
    var azRaw = el("solve-az").value.trim();
    var wantAlt = altRaw === "" ? null : parseFloat(altRaw);
    var wantAz = azRaw === "" ? null : parseFloat(azRaw);

    if ((altRaw !== "" && !isFinite(wantAlt)) || (azRaw !== "" && !isFinite(wantAz))) {
      state.solve = { message: "Elevation and azimuth have to be numbers, in degrees." };
    } else if (wantAlt === null && wantAz === null) {
      state.solve = { message: "Give an elevation, an azimuth, or both. Both empty asks for every moment in the mission." };
    } else {
      var parts = [];
      if (wantAlt !== null) parts.push("elevation " + deg(wantAlt, 1));
      if (wantAz !== null) parts.push("azimuth " + azDeg(wantAz));
      state.solve = {
        message: null,
        label: "Sun at " + parts.join(" and "),
        hits: solveFor(lastModel.sites[0].samples, "sun", { altDeg: wantAlt, azDeg: wantAz })
      };
    }
    renderSolve();
  }

  /* An eclipse is the one total power loss a lander can put on a calendar, so it
     gets a jump button. Disabled is the honest answer when there is none in the
     window: eclipses come about twice a year, not twice a lunar day. */
  function syncEclipseButton(model) {
    var button = el("eclipse-btn");
    var list = eclipsesIn(model.sites[0].samples);
    button.disabled = !list.length;
    button.title = list.length
      ? "Jump to " + utcStamp(list[0].peakMs) + ", when Earth covers " +
        pct(list[0].maxObscuration) + " of the Sun"
      : "No eclipse at this site inside this mission";
  }

  function jumpToEclipse() {
    if (!lastModel || !lastModel.sites.length) return;
    var list = eclipsesIn(lastModel.sites[0].samples);
    if (!list.length) return;
    var next = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].peakMs > state.playheadMs + 60000) {
        next = list[i];
        break;
      }
    }
    stopPlay();
    setPlayhead((next || list[0]).peakMs);
    render();
  }

  /* "What if we slip two weeks" is the question a launch delay actually asks.
     Same site, same array, same mask, one epoch moved. */
  function renderSlip(model) {
    var host = el("slip-table");
    /* Hidden in Simple mode, and sampling a second mission is the most expensive
       thing on this page, so do not pay for it when nobody can see it. */
    if (!state.slipDays || state.ui === "simple") {
      host.innerHTML = "";
      return;
    }
    var panel = panelSpec();
    var slipMs = state.slipDays * DAY;

    /* A delta that rounds to zero against two figures that print the same is
       noise, so it is dropped rather than shown as "+0". */
    function cell(a, b, fmt, delta) {
      var shown = fmt(a) + " \u2192 " + fmt(b);
      var d = b - a;
      if (fmt(a) === fmt(b)) return '<td class="num">' + shown + "</td>";
      return '<td class="num">' + shown + ' <span class="delta ' + (d >= 0 ? "up" : "down") + '">' +
        (d >= 0 ? "+" : "\u2212") + delta(Math.abs(d)) + "</span></td>";
    }

    function pctCell(a, b) {
      return cell(a, b, pct, function (x) { return (x * 100).toFixed(0); });
    }

    function energyCell(a, b) {
      return cell(a, b, energy, energy);
    }

    var rows = model.sites.map(function (entry) {
      var a = entry.summary;
      var b = missionAt(entry.site, panel, state.landingMs + slipMs).summary;
      return '<tr><td><i class="swatch" style="background:' + entry.color + '"></i>' +
        esc(entry.name) + "</td>" +
        pctCell(a.sunlitFrac, b.sunlitFrac) +
        energyCell(a.energyWh, b.energyWh) +
        pctCell(a.dteFrac, b.dteFrac) +
        '<td class="num">' + msHours(a.longestNight.ms) + " \u2192 " + msHours(b.longestNight.ms) + "</td></tr>";
    }).join("");

    host.innerHTML = '<section class="panel compare-panel">' +
      '<div class="block-title">Same place, ' + Math.abs(state.slipDays) +
      " days " + (state.slipDays < 0 ? "earlier" : "later") + "</div>" +
      '<table class="compare-table"><tr><th>Site</th><th class="num">Sunlight</th>' +
      '<th class="num">Energy/m\u00b2</th><th class="num">Direct to Earth</th>' +
      '<th class="num">Longest night</th></tr>' + rows + "</table>" +
      '<p class="help">Left of each arrow is the landing epoch you set, right of it is ' +
      utcStamp(state.landingMs + slipMs) + ". Near the pole a slip of a week or two can invert the " +
      "answer, because it moves the Sun to the other side of the same rim.</p></section>";
  }

  /* The globe takes the whole catalogue, not just the selection, because its
     whole job is letting you pick. The subsolar point in `now` is what places
     the terminator, so the lighting is the ephemeris, not decoration. */
  function globeModel(model) {
    return {
      catalogue: allSites(),
      selectedIds: state.selected,
      primaryId: model.primaryId,
      now: model.sites[0].now
    };
  }

  function drawCanvases(model) {
    if (state.ui === "simple") {
      if (!window.LunarGlobe) return;
      try {
        LunarGlobe.drawGlobe(el("globe"), globeModel(model));
      } catch (err) {
        el("simple-card").insertAdjacentHTML("beforeend",
          '<p class="margin-note">globe.js threw while drawing: ' + esc(err && err.message) + "</p>");
      }
      return;
    }
    if (!window.LunarViz) return;
    try {
      LunarViz.drawMap(el("map"), model);
      LunarViz.drawHorizon(el("horizon"), model);
      LunarViz.drawChart(el("chart"), model);
    } catch (err) {
      el("readout").insertAdjacentHTML("beforeend",
        '<p class="readout-note">viz.js threw while drawing: ' + esc(err && err.message) + "</p>");
    }
  }

  var lastModel = null;
  var lastTextMs = 0;

  function render(opts) {
    var options = opts || {};
    var model = buildModel();
    lastModel = model;
    if (!model.sites.length) return;

    var wantText = !options.light || Date.now() - lastTextMs > 90;
    if (wantText) {
      lastTextMs = Date.now();
      renderSeason(model.sites[0].now);
      if (state.ui === "simple") {
        renderSimpleCard(model);
      } else {
        renderReadout(model);
        renderPanelHint(model);
      }
    }
    if (!options.light) {
      syncTerrainInputs();
      renderStories();
      renderStoryNote(model);
      renderFilters();
      renderSiteList();
      renderChips();
      renderSiteNote();
      renderMetrics(model);
      renderCompare(model);
      renderSlip(model);
      renderInsights(model);
      renderWindows();
      renderSolve();
      syncEclipseButton(model);
    }
    drawCanvases(model);
  }

  function recompute() {
    render();
    writeHash();
  }

  /* ---------- interface mode ---------- */

  function applyMode() {
    var simple = state.ui === "simple";
    document.querySelector(".app").classList.toggle("mode-simple", simple);
    el("mode-simple").classList.toggle("on", simple);
    el("mode-expert").classList.toggle("on", !simple);
    el("mode-simple").setAttribute("aria-pressed", simple ? "true" : "false");
    el("mode-expert").setAttribute("aria-pressed", simple ? "false" : "true");
  }

  function setMode(mode) {
    if (state.ui === mode) return;
    state.ui = mode;
    applyMode();
    recompute();
  }

  /* ---------- guided findings ---------- */

  var globeGoTo = null;

  function flyToPrimary() {
    if (!globeGoTo) return;
    var site = primarySite();
    if (!site) return;
    var polar = site.lat <= -80;
    globeGoTo(polar ? -89 : site.lat, site.lon, polar ? 2.8 : 1.6);
  }

  /* A story is a scenario, not a slideshow: it sets the same state the controls
     set, so every claim it makes stays live and the user can keep poking at it.
     Shared with boot, because `st=` in the URL has to reproduce the whole setup
     and not just the caption. */
  function applyStory(story) {
    state.story = story.id;
    state.selected = [story.site];
    state.landingMs = isFinite(story.epoch) ? story.epoch : STORY_EPOCH;
    state.durationHours = isFinite(story.hours) ? story.hours : STORY_HOURS;
    state.maskDeg = 0;
    state.terrain = !!terrain;
  }

  function storyFromHash() {
    var story = state.story ? storyById(state.story) : null;
    if (story && siteById(story.site)) applyStory(story);
    else state.story = null;
  }

  function setStory(id) {
    if (state.story === id) {
      state.story = null;
      recompute();
      return;
    }
    var story = storyById(id);
    if (!story || !siteById(story.site)) return;
    applyStory(story);
    stopPlay();
    el("land-date").value = utcDateValue(state.landingMs);
    el("land-time").value = utcTimeValue(state.landingMs);
    syncPanelInputs();
    resetPlayhead();
    dropCache();
    recompute();
    flyToPrimary();
  }

  /* ---------- selection ---------- */

  function selectOnly(id) {
    if (!siteById(id)) return;
    /* Picking a different site would leave the story's text describing a place
       that is no longer on screen, so the story steps aside. */
    state.story = null;
    state.selected = [id];
    resetPlayhead();
    recompute();
  }

  function togglePin(id) {
    var index = state.selected.indexOf(id);
    if (index >= 0) {
      if (state.selected.length === 1) return;
      state.selected.splice(index, 1);
    } else {
      if (state.selected.length >= MAX_SITES) return;
      state.selected.push(id);
    }
    recompute();
  }

  function makePrimary(id) {
    var index = state.selected.indexOf(id);
    if (index <= 0) return;
    state.selected.splice(index, 1);
    state.selected.unshift(id);
    recompute();
  }

  function setSelection(ids) {
    var keep = ids.filter(function (id) {
      return !!siteById(id);
    }).slice(0, MAX_SITES);
    if (!keep.length) return;
    state.selected = keep;
    resetPlayhead();
    recompute();
  }

  /* ---------- landing epoch and playhead ---------- */

  function resetPlayhead() {
    state.playheadMs = state.landingMs;
  }

  function setLanding(ms, keepOffset) {
    var offset = keepOffset ? state.playheadMs - state.landingMs : 0;
    state.landingMs = ms;
    el("land-date").value = utcDateValue(ms);
    el("land-time").value = utcTimeValue(ms);
    state.playheadMs = clamp(ms + offset, ms, ms + missionMs());
    dropCache();
    recompute();
  }

  function readLandingInputs() {
    var dateValue = el("land-date").value;
    var timeValue = el("land-time").value || "00:00";
    if (!dateValue) return;
    var d = dateValue.split("-").map(Number);
    var t = timeValue.split(":").map(Number);
    var ms = Date.UTC(d[0], d[1] - 1, d[2], t[0] || 0, t[1] || 0, 0, 0);
    if (!isFinite(ms)) return;
    state.landingMs = ms;
    resetPlayhead();
    dropCache();
    recompute();
  }

  function setPlayhead(ms) {
    state.playheadMs = clamp(ms, state.landingMs, state.landingMs + missionMs());
    render({ light: true });
  }

  /* ---------- play ---------- */

  var reduceMotion = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  var rafId = null;
  var timerId = null;

  function stopPlay() {
    state.playing = false;
    if (rafId) window.cancelAnimationFrame(rafId);
    if (timerId) window.clearInterval(timerId);
    rafId = null;
    timerId = null;
    el("play").textContent = "Play";
    el("play").classList.remove("playing");
  }

  function startPlay() {
    var end = state.landingMs + missionMs();
    if (state.playheadMs >= end - 1) state.playheadMs = state.landingMs;
    state.playing = true;
    el("play").textContent = "Pause";
    el("play").classList.add("playing");

    if (reduceMotion && reduceMotion.matches) {
      timerId = window.setInterval(function () {
        if (state.playheadMs + HOUR >= end) {
          setPlayhead(end);
          stopPlay();
          return;
        }
        setPlayhead(state.playheadMs + HOUR);
      }, 120);
      return;
    }

    var rate = missionMs() / PLAY_SPAN_MS;
    var last = null;
    var tick = function (now) {
      if (!state.playing) return;
      if (last === null) last = now;
      var dt = now - last;
      last = now;
      var next = state.playheadMs + dt * rate;
      if (next >= end) {
        setPlayhead(end);
        stopPlay();
        return;
      }
      setPlayhead(next);
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);
  }

  function togglePlay() {
    if (state.playing) stopPlay();
    else startPlay();
  }

  /* ---------- CSV ---------- */

  function downloadCsv() {
    if (!lastModel || !lastModel.sites.length) return;
    var entry = lastModel.sites[0];
    var head = "time_utc,sun_alt_deg,sun_az_deg,earth_alt_deg,earth_az_deg,sun_frac,earth_disk,dte,joint,irradiance_w_m2,power_w_m2";
    var rows = entry.samples.map(function (s) {
      return [
        utcIso(s.t),
        s.sunAlt.toFixed(4),
        s.sunAz.toFixed(4),
        s.earthAlt.toFixed(4),
        s.earthAz.toFixed(4),
        s.sunFrac.toFixed(4),
        s.earthDisk ? 1 : 0,
        s.dte ? 1 : 0,
        s.joint ? 1 : 0,
        s.irradiance.toFixed(1),
        s.power.toFixed(2)
      ].join(",");
    });
    var text = head + "\n" + rows.join("\n") + "\n";
    var name = "lunar-horizon-" + entry.id + "-" + utcDateValue(state.landingMs) + ".csv";
    var link = document.createElement("a");
    if (window.Blob && window.URL && window.URL.createObjectURL) {
      var url = window.URL.createObjectURL(new Blob([text], { type: "text/csv" }));
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(function () {
        window.URL.revokeObjectURL(url);
      }, 2000);
      return;
    }
    link.href = "data:text/csv;charset=utf-8," + encodeURIComponent(text);
    link.download = name;
    link.click();
  }

  /* ---------- scan ---------- */

  function runScan() {
    if (state.scanning) return;
    var site = primarySite();
    state.scanning = true;
    el("scan").disabled = true;
    renderWindows();
    window.setTimeout(function () {
      try {
        state.windows = LunarEph.scanWindows(site.lat, site.lon, missionMs(), new Date(state.landingMs), {
          maskDeg: maskFor(site),
          panel: panelSpec()
        });
      } catch (err) {
        state.windows = [];
      }
      state.scanning = false;
      el("scan").disabled = false;
      renderWindows();
    }, 30);
  }

  /* ---------- URL hash ---------- */

  function writeHash() {
    var params = new URLSearchParams();
    params.set("ui", state.ui);
    if (state.story) params.set("st", state.story);
    params.set("s", state.selected.join(","));
    params.set("t", utcIso(state.landingMs));
    params.set("d", String(state.durationHours));
    params.set("m", String(state.maskDeg));
    params.set("lola", state.terrain ? "1" : "0");
    params.set("p", state.panelMode);
    params.set("tilt", String(state.tiltDeg));
    params.set("trk", state.tracking ? "1" : "0");
    params.set("az", String(state.azimuthDeg));
    params.set("eff", String(state.efficiencyPct));
    params.set("slip", String(state.slipDays));
    var hash = "#" + params.toString();
    if (window.location.hash !== hash) {
      try {
        window.history.replaceState(null, "", window.location.pathname + window.location.search + hash);
      } catch (err) {
        window.location.hash = hash;
      }
    }
  }

  function readHash() {
    var raw = window.location.hash.replace(/^#/, "");
    if (!raw) return false;
    var params = new URLSearchParams(raw);
    var touched = false;

    var ui = params.get("ui");
    if (ui === "simple" || ui === "expert") state.ui = ui;
    state.story = storyById(params.get("st")) ? params.get("st") : null;

    var sites = params.get("s");
    if (sites) {
      var ids = sites.split(",").filter(function (id) {
        return !!siteById(id);
      }).slice(0, MAX_SITES);
      if (ids.length) {
        state.selected = ids;
        touched = true;
      }
    }
    var t = params.get("t");
    if (t) {
      var ms = Date.parse(t);
      if (isFinite(ms)) {
        state.landingMs = ms;
        touched = true;
      }
    }
    var d = parseFloat(params.get("d"));
    if (isFinite(d) && d > 0) {
      state.durationHours = d;
      touched = true;
    }
    var m = parseFloat(params.get("m"));
    if (isFinite(m)) state.maskDeg = clamp(m, -4, 15);
    var lola = params.get("lola");
    if (lola === "0" || lola === "1") state.terrain = !!terrain && lola === "1";
    var p = params.get("p");
    if (p === "vertical" || p === "horizontal" || p === "tilt") state.panelMode = p;
    var tilt = parseFloat(params.get("tilt"));
    if (isFinite(tilt)) state.tiltDeg = clamp(tilt, 0, 90);
    var trk = params.get("trk");
    if (trk === "0" || trk === "1") state.tracking = trk === "1";
    var az = parseFloat(params.get("az"));
    if (isFinite(az)) state.azimuthDeg = clamp(az, 0, 359);
    var eff = parseFloat(params.get("eff"));
    if (isFinite(eff)) state.efficiencyPct = clamp(eff, 15, 40);
    /* The slip select only holds these, and a value it cannot show would leave
       the control blank while the table below it said something else. */
    var slip = params.get("slip");
    if (SLIP_CHOICES.indexOf(slip) >= 0) state.slipDays = parseFloat(slip);
    return touched;
  }

  /* ---------- controls ---------- */

  function syncTerrainInputs() {
    var box = el("terrain");
    box.checked = state.terrain;
    box.disabled = !terrain;
    var profile = terrainFor(primarySite());
    el("mask-label").textContent = profile ? "Raise or lower the skyline" : "Terrain clearance";
    var note;
    if (!terrain) {
      note = "terrain.js is not loaded, so the horizon is a uniform mask.";
    } else if (!state.terrain) {
      note = "Off: one mask angle in every direction, on a smooth 1,737.4 km sphere.";
    } else if (profile) {
      note = terrain.meta.product + ": LOLA at " + terrain.meta.resolutionM +
        " m per pixel, skyline measured to " + terrain.meta.rayKm + " km in " +
        terrain.meta.bins + " directions. This site runs " + deg(profile.min, 1) +
        " to " + deg(profile.max, 1) + ".";
    } else {
      note = "No LOLA profile for this site. The product covers " +
        Math.abs(terrain.meta.minLat) + "\u00b0S to the pole, which is " + terrainCount() +
        " of the catalogue's sites, so this one falls back to the uniform mask.";
    }
    el("terrain-note").textContent = note;
  }

  function syncPanelInputs() {
    var effective = panelSpec();
    el("panel-mode").value = state.panelMode;
    el("tilt").value = String(effective.tiltDeg);
    el("tracking").checked = effective.tracking;
    el("azimuth").value = String(state.azimuthDeg);
    el("efficiency").value = String(state.efficiencyPct);
    el("mask").value = String(state.maskDeg);
    el("duration").value = String(state.durationHours);
    el("slip").value = String(state.slipDays);
    el("map-mode").value = state.mapMode;
    syncTerrainInputs();

    var fixed = state.panelMode === "tilt";
    el("tilt").disabled = !fixed;
    el("tracking").disabled = !fixed;
    el("azimuth").disabled = !fixed || effective.tracking;
    el("tilt-read").textContent = effective.tiltDeg + "\u00b0";
    el("az-read").textContent = state.azimuthDeg + "\u00b0";
    el("eff-read").textContent = state.efficiencyPct + "%";
    el("mask-read").textContent = state.maskDeg.toFixed(1) + "\u00b0";
  }

  function onPanelChange() {
    var wasFixed = state.panelMode === "tilt";
    state.panelMode = el("panel-mode").value;
    if (wasFixed && state.panelMode === "tilt") {
      state.tiltDeg = parseFloat(el("tilt").value);
      state.tracking = el("tracking").checked;
    }
    state.azimuthDeg = parseFloat(el("azimuth").value);
    state.efficiencyPct = parseFloat(el("efficiency").value);
    syncPanelInputs();
    dropCache();
    recompute();
  }

  function chartTimeAt(clientX) {
    var canvas = el("chart");
    var rect = canvas.getBoundingClientRect();
    var frac = clamp((clientX - rect.left) / rect.width, 0, 1);
    return state.landingMs + frac * missionMs();
  }

  function wire() {
    el("filters").addEventListener("click", function (e) {
      var button = e.target.closest("button[data-group]");
      if (!button) return;
      state.group = button.getAttribute("data-group");
      renderFilters();
      renderSiteList();
    });

    el("search").addEventListener("input", function () {
      state.search = el("search").value;
      renderSiteList();
    });

    el("site-list").addEventListener("click", function (e) {
      var pin = e.target.closest("button[data-pin]");
      if (pin) {
        togglePin(pin.getAttribute("data-pin"));
        return;
      }
      var row = e.target.closest(".site-row[data-id]");
      if (row) selectOnly(row.getAttribute("data-id"));
    });

    el("site-list").addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      var row = e.target.closest(".site-row[data-id]");
      if (row) {
        e.preventDefault();
        selectOnly(row.getAttribute("data-id"));
      }
    });

    el("chips").addEventListener("click", function (e) {
      var drop = e.target.closest("button[data-drop]");
      if (drop) {
        togglePin(drop.getAttribute("data-drop"));
        return;
      }
      var chip = e.target.closest("button[data-chip]");
      if (chip) makePrimary(chip.getAttribute("data-chip"));
    });

    el("preset-contrast").addEventListener("click", function () {
      setSelection(["mouton", "slater"]);
    });
    el("preset-artemis").addEventListener("click", function () {
      setSelection(["mouton", "nobile-2", "gerlache-2"]);
    });

    el("custom-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var lat = parseFloat(el("custom-lat").value);
      var lon = parseFloat(el("custom-lon").value);
      if (!isFinite(lat) || !isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        el("site-note").textContent = "Latitude must be between \u221290 and 90, longitude between \u2212180 and 180.";
        return;
      }
      var name = (el("custom-name").value || "").trim().slice(0, 60) || "Custom site";
      var id = "custom-" + Date.now().toString(36);
      custom.push({
        id: id,
        name: name,
        short: name.slice(0, 12),
        group: "custom",
        program: "Custom",
        status: "custom",
        lat: lat,
        lon: lon,
        note: "Custom coordinates you entered: " + latLonText({ lat: lat, lon: lon }) + "."
      });
      saveCustom();
      el("custom-name").value = "";
      selectOnly(id);
    });

    el("terrain").addEventListener("change", function () {
      state.terrain = !!terrain && el("terrain").checked;
      syncTerrainInputs();
      dropCache();
      recompute();
    });

    el("mask").addEventListener("input", function () {
      state.maskDeg = parseFloat(el("mask").value);
      el("mask-read").textContent = state.maskDeg.toFixed(1) + "\u00b0";
      dropCache();
      recompute();
    });

    el("mask-presets").addEventListener("click", function (e) {
      var button = e.target.closest("button[data-mask]");
      if (!button) return;
      state.maskDeg = parseFloat(button.getAttribute("data-mask"));
      syncPanelInputs();
      dropCache();
      recompute();
    });

    el("panel-mode").addEventListener("change", onPanelChange);
    el("tracking").addEventListener("change", onPanelChange);
    ["tilt", "azimuth", "efficiency"].forEach(function (id) {
      el(id).addEventListener("input", onPanelChange);
    });

    el("land-date").addEventListener("change", readLandingInputs);
    el("land-time").addEventListener("change", readLandingInputs);

    el("duration").addEventListener("change", function () {
      state.durationHours = parseFloat(el("duration").value);
      resetPlayhead();
      dropCache();
      recompute();
    });

    el("step-back").addEventListener("click", function () {
      setLanding(state.landingMs - DAY, false);
    });
    el("step-fwd").addEventListener("click", function () {
      setLanding(state.landingMs + DAY, false);
    });
    el("now-btn").addEventListener("click", function () {
      setLanding(Math.floor(Date.now() / HOUR) * HOUR, false);
    });
    el("eclipse-btn").addEventListener("click", jumpToEclipse);
    el("play").addEventListener("click", togglePlay);

    el("slip").addEventListener("change", function () {
      state.slipDays = parseFloat(el("slip").value);
      recompute();
    });

    el("solve-form").addEventListener("submit", function (e) {
      e.preventDefault();
      runSolve();
    });

    el("solve-list").addEventListener("click", function (e) {
      var button = e.target.closest("button[data-solve]");
      if (!button) return;
      stopPlay();
      setPlayhead(Number(button.getAttribute("data-solve")));
      render();
    });

    el("mode-simple").addEventListener("click", function () {
      setMode("simple");
    });
    el("mode-expert").addEventListener("click", function () {
      setMode("expert");
    });

    el("story-bar").addEventListener("click", function (e) {
      var button = e.target.closest("button[data-story]");
      if (button) setStory(button.getAttribute("data-story"));
    });

    if (window.LunarGlobe) {
      globeGoTo = LunarGlobe.attach(el("globe"), {
        model: function () {
          return lastModel ? globeModel(lastModel) : null;
        },
        onChange: function () {
          if (lastModel) drawCanvases(lastModel);
        },
        onPick: function (hit) {
          /* A pole cluster is 17 sites inside a few degrees, so the first click
             flies the camera in instead of guessing which one you meant. */
          if (hit.cluster) globeGoTo(-89, 0, 2.8);
          else selectOnly(hit.id);
        }
      });
    }

    el("map").addEventListener("click", function (e) {
      if (!window.LunarViz || !lastModel || typeof LunarViz.hitMap !== "function") return;
      var rect = el("map").getBoundingClientRect();
      var hit = LunarViz.hitMap(el("map"), lastModel, e.clientX - rect.left, e.clientY - rect.top);
      if (hit) selectOnly(hit);
    });

    el("map-mode").addEventListener("change", function () {
      state.mapMode = el("map-mode").value;
      recompute();
    });

    var dragging = false;
    el("chart").addEventListener("pointerdown", function (e) {
      dragging = true;
      el("chart").setPointerCapture(e.pointerId);
      stopPlay();
      setPlayhead(chartTimeAt(e.clientX));
    });
    el("chart").addEventListener("pointermove", function (e) {
      if (dragging) setPlayhead(chartTimeAt(e.clientX));
    });
    el("chart").addEventListener("pointerup", function (e) {
      dragging = false;
      try {
        el("chart").releasePointerCapture(e.pointerId);
      } catch (err) {
        /* capture already gone */
      }
      render();
    });

    el("csv").addEventListener("click", downloadCsv);
    el("scan").addEventListener("click", runScan);

    el("windows").addEventListener("click", function (e) {
      var button = e.target.closest("button[data-start]");
      if (!button) return;
      stopPlay();
      setLanding(Number(button.getAttribute("data-start")), false);
    });

    document.addEventListener("keydown", function (e) {
      var tag = (e.target && e.target.tagName) || "";
      if (/INPUT|SELECT|TEXTAREA/.test(tag)) return;
      var stepMs = e.shiftKey ? DAY : HOUR;
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        stopPlay();
        setPlayhead(state.playheadMs + stepMs);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        stopPlay();
        setPlayhead(state.playheadMs - stepMs);
      }
    });

    var resizePending = false;
    window.addEventListener("resize", function () {
      if (resizePending) return;
      resizePending = true;
      window.requestAnimationFrame(function () {
        resizePending = false;
        if (lastModel) drawCanvases(lastModel);
      });
    });

    window.addEventListener("hashchange", function () {
      if (readHash()) {
        storyFromHash();
        applyMode();
        syncPanelInputs();
        el("land-date").value = utcDateValue(state.landingMs);
        el("land-time").value = utcTimeValue(state.landingMs);
        resetPlayhead();
        dropCache();
        render();
      }
    });
  }

  /* ---------- boot ---------- */

  function fail(message) {
    var html = '<div class="kicker">Not ready</div><p>' + esc(message) + "</p>";
    var readout = el("readout");
    var card = el("simple-card");
    if (readout) readout.innerHTML = html;
    if (card) card.innerHTML = html;
  }

  function init() {
    if (!window.LunarEph) {
      fail("ephemeris.js did not load, so there is nothing to compute.");
      return;
    }
    state.landingMs = Math.floor(Date.now() / HOUR) * HOUR;
    readHash();
    storyFromHash();
    applyMode();
    resetPlayhead();
    el("land-date").value = utcDateValue(state.landingMs);
    el("land-time").value = utcTimeValue(state.landingMs);
    syncPanelInputs();
    wire();
    renderEvidence();
    render();
    writeHash();
    if (state.story) flyToPrimary();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
