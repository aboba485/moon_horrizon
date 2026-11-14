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

  var state = {
    selected: ["mouton"],
    landingMs: 0,
    durationHours: 708.734,
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
    windows: []
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

  function cacheKey(site, panel) {
    return [
      site.id, site.lat, site.lon, state.landingMs, missionMs(), state.maskDeg,
      panel.tiltDeg, panel.tracking ? 1 : 0, panel.azimuthDeg, panel.efficiency
    ].join("|");
  }

  function missionFor(site, panel) {
    var key = cacheKey(site, panel);
    if (cache[key]) return cache[key];
    var samples = LunarEph.sampleMission(new Date(state.landingMs), missionMs(), site.lat, site.lon, {
      maskDeg: state.maskDeg,
      panel: panel
    });
    var entry = { samples: samples, summary: LunarEph.summarize(samples) };
    var keys = Object.keys(cache);
    if (keys.length > 24) delete cache[keys[0]];
    cache[key] = entry;
    return entry;
  }

  function dropCache() {
    cache = {};
  }

  /* ---------- events from samples ---------- */

  function channel(sample, which, mask) {
    if (which === "sun") return sample.sunAlt + sample.sunRadius - mask;
    if (which === "earth") return sample.earthAlt + sample.earthRadius - mask;
    return sample.stationAlt - mask;
  }

  /* Session 1 is adding LunarEph.eventsFromSamples. Use it only when its output is
     shaped the way the contract describes, otherwise walk the samples here. */
  function engineEvents(samples, fromMs, mask) {
    var fn = window.LunarEph && LunarEph.eventsFromSamples;
    if (typeof fn !== "function") return null;
    var out;
    try {
      out = fn(samples, fromMs, mask);
    } catch (err) {
      return null;
    }
    if (!Array.isArray(out) || !out.length) return null;
    var usable = out.every(function (e) {
      return e && typeof e.t === "number" && typeof e.type === "string" && typeof e.rise === "boolean";
    });
    return usable ? out : null;
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
        var frac = span === 0 ? 0 : (0 - a) / span;
        var t = samples[i].t + (samples[i + 1].t - samples[i].t) * clamp(frac, 0, 1);
        if (t >= fromMs) return t;
      }
    }
    return null;
  }

  function nextCrossing(samples, fromMs, which, mask, wantRise) {
    var fromEngine = engineEvents(samples, fromMs, mask);
    if (fromEngine) {
      var wanted = which === "sun" ? /sun/i : /dte|link|earth/i;
      var best = null;
      for (var i = 0; i < fromEngine.length; i++) {
        var e = fromEngine[i];
        if (e.t < fromMs || e.rise !== !!wantRise || !wanted.test(e.type)) continue;
        if (best === null || e.t < best) best = e.t;
      }
      if (best !== null) return best;
    }
    return walkCrossing(samples, fromMs, which, mask, wantRise);
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
        now: LunarEph.evaluate(new Date(state.playheadMs), site.lat, site.lon, state.maskDeg, panel)
      };
    }).filter(Boolean);

    return {
      sites: sites,
      primaryId: sites.length ? sites[0].id : null,
      playheadMs: state.playheadMs,
      landingMs: state.landingMs,
      maskDeg: state.maskDeg,
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

  function eventLine(mission, now, which) {
    var isUp = which === "sun" ? now.lit : now.dte;
    var t = nextCrossing(mission.samples, state.playheadMs, which, state.maskDeg, !isUp);
    var label = which === "sun" ? (isUp ? "Sunset" : "Sunrise") : (isUp ? "Link loss" : "Link return");
    if (t === null) return label + ": none in this mission";
    return label + " " + utcStamp(t) + " (in " + msHours(t - state.playheadMs) + ")";
  }

  function renderReadout(model) {
    var primary = model.sites[0];
    var now = primary.now;
    var clearance = now.earthAlt + now.earthRadius - state.maskDeg;
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

  function renderInsights(model) {
    var primary = model.sites[0];
    var s = primary.summary;
    var now = primary.now;
    var site = primary.site;
    var lines = [];

    lines.push("<b>" + esc(site.name) + "</b> over " + hours(state.durationHours) + " from " +
      utcStamp(state.landingMs) + ", with the horizon mask at " + deg(state.maskDeg, 1) + ".");

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

    lines.push('<span class="muted">Smooth 1,737.4 km sphere, no terrain horizon. The mask is a question, not a LOLA product.</span>');

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

  function drawCanvases(model) {
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
      renderReadout(model);
      renderPanelHint(model);
    }
    if (!options.light) {
      renderFilters();
      renderSiteList();
      renderChips();
      renderSiteNote();
      renderMetrics(model);
      renderCompare(model);
      renderInsights(model);
      renderWindows();
    }
    drawCanvases(model);
  }

  function recompute() {
    render();
    writeHash();
  }

  /* ---------- selection ---------- */

  function selectOnly(id) {
    if (!siteById(id)) return;
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
          maskDeg: state.maskDeg,
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
    params.set("s", state.selected.join(","));
    params.set("t", utcIso(state.landingMs));
    params.set("d", String(state.durationHours));
    params.set("m", String(state.maskDeg));
    params.set("p", state.panelMode);
    params.set("tilt", String(state.tiltDeg));
    params.set("trk", state.tracking ? "1" : "0");
    params.set("az", String(state.azimuthDeg));
    params.set("eff", String(state.efficiencyPct));
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
    return touched;
  }

  /* ---------- controls ---------- */

  function syncPanelInputs() {
    var effective = panelSpec();
    el("panel-mode").value = state.panelMode;
    el("tilt").value = String(effective.tiltDeg);
    el("tracking").checked = effective.tracking;
    el("azimuth").value = String(state.azimuthDeg);
    el("efficiency").value = String(state.efficiencyPct);
    el("mask").value = String(state.maskDeg);
    el("duration").value = String(state.durationHours);
    el("map-mode").value = state.mapMode;

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
    el("play").addEventListener("click", togglePlay);

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
    var readout = el("readout");
    if (readout) readout.innerHTML = '<div class="kicker">Not ready</div><p>' + esc(message) + "</p>";
  }

  function init() {
    if (!window.LunarEph) {
      fail("ephemeris.js did not load, so there is nothing to compute.");
      return;
    }
    state.landingMs = Math.floor(Date.now() / HOUR) * HOUR;
    readHash();
    resetPlayhead();
    el("land-date").value = utcDateValue(state.landingMs);
    el("land-time").value = utcTimeValue(state.landingMs);
    syncPanelInputs();
    wire();
    render();
    writeHash();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
