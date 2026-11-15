# Round 2 — three parallel sessions

The app already works: validated ephemeris, a measured LOLA skyline, a Simple/Expert
UI, three guided findings, and an in-app evidence panel. Round 2 closes the gap
between what it computes and what the challenge brief actually asks for, and raises
the visual quality toward QuickMap / Moon Trek.

Three sessions run in parallel on `main`. GitHub is the only handoff.

| Session | Owns | Theme |
| --- | --- | --- |
| **A** | `ephemeris.js`, `sites.js`, `features.js` (new), `tools/`, `test/`, `ENGINE.md` | Events, inverse solve, eclipses, named features |
| **B** | `viz.js`, `globe.js`, `viz-demo.html` | Axes, graticule, traces, basemap, labels |
| **C** | `app.js`, `index.html`, `styles.css`, `README.md`, `DEMO.md` | Controls, readouts, wiring |

**Nobody edits** `vendor/`, `SESSIONS.md`, `CLAUDE.md`, `primer.md`, `knowledge.md`,
`terrain.js`, `validation.js`.

---

## Shared contracts

Read this section before starting. B and C must be able to write code against these
signatures **before A has shipped them**, so they are fixed here, in advance. If you
need to change one, change it here in the same commit and say so in the message.

### Already in the engine — use these, do not re-derive

`LunarEph.evaluate(date, lat, lon, mask, panel)` already returns, per sample:

```
sunAlt, sunAz, earthAlt, earthAz      degrees, az clockwise from north
sunRadius, earthRadius                 angular RADII in degrees (Sun ~0.266, Earth ~0.94)
sunFrac                                fraction of the solar disk not blocked by the MASK
lit, dte, joint, power, irradiance, cosI
subSolarLat, subSolarLon, subEarthLat, subEarthLon
stations, stationAlt, stationUp
```

`mask` is either a number or `{profile: number[360], offsetDeg}` — see
`maskResolver()` at `ephemeris.js:246`.

### New — Session A delivers, B and C consume

```js
// 1. Rise/set events, against the REAL skyline, not a flat horizon.
LunarEph.horizonEvents(start, durationMs, lat, lon, { maskDeg, body })
//   body: "sun" | "earth"
//   -> [{ kind: "rise"|"set", t: ms, azDeg, altDeg, refined: true }]
//   Bisect to <= 1 s. The azimuth AT the crossing is the point of the feature.

LunarEph.nextEvent(fromMs, lat, lon, { maskDeg, body })
//   -> { kind, t, azDeg, msUntil } | null   (null = never, e.g. Earth on the far side)

// 2. Inverse solve: "when is the Sun at azimuth X / elevation Y?"
LunarEph.solveFor(start, durationMs, lat, lon, {
  body: "sun"|"earth", azDeg, altDeg, toleranceDeg, maskDeg
})
//   -> [{ t, azDeg, altDeg, exact: bool }]
//   Either azDeg or altDeg may be null; null means "don't constrain this axis".

// 3. Eclipses: Earth transiting the Sun as seen FROM the site.
LunarEph.eclipseAt(date, lat, lon)
//   -> { sepDeg, earthRadiusDeg, sunRadiusDeg, obscuration, kind }
//   kind: "none" | "penumbral" | "partial" | "total"
//   obscuration: fraction of the SOLAR DISK AREA covered by Earth, 0..1

LunarEph.findEclipses(start, durationMs, lat, lon)
//   -> [{ startMs, peakMs, endMs, maxObscuration, kind }]

// 4. Named surface features, for labels and for skyline attribution.
window.LUNAR_FEATURES = {
  meta: { source, count, generated },
  features: [{ name, kind, lat, lon, diamKm }]   // kind: crater|mons|vallis|mare|...
}
LunarEph.featureAtAzimuth(lat, lon, azDeg, { maskDeg })
//   -> { name, distanceKm, elevationDeg } | null
//   "the ridge blocking you at azimuth 150 is Malapert Massif"
```

### Hard rules, all sessions

- No build step, no bundler, no framework. **Must work opened as `file://`.**
- Data ships as **classic scripts** assigning a `window.*` global, never JSON —
  `fetch()` of a local file is CORS-blocked over `file://`.
- Do **not** touch the rotation matrix `R3(W)·R1(90−δ)·R3(90+α)`. Astronomy Engine
  returns pole RA in **hours** (×15 for degrees).
- Do **not** invent landing coordinates or feature coordinates. Cite the source.
- `git pull --rebase origin main` before every push. Small slices. **Never force-push.**
  No `Co-Authored-By` line in commit messages.
- Gates that must stay green: `node test/events.test.mjs` and `node test/validate.mjs`
  (the latter needs network; worst error must stay ≤ 0.007°).
- The URL hash is the whole scenario. Any new state gets a short key and must
  round-trip. ⚠️ The site key is `s=`, not `site=`, and unknown keys are silently
  ignored — a typo renders the default and looks exactly like a broken feature.
- 🔑 **A control that sets N pieces of state must call one function that sets all N,
  from every entry point** (`init()` *and* the `hashchange` handler). We already
  shipped one bug where `#st=rim` printed Shackleton's headline over Mons Mouton's
  numbers because the hash set a label and nothing applied the rest.

---

# SESSION A — engine, events, eclipses, features

You own `ephemeris.js`, `sites.js`, `features.js` (new), `tools/`, `test/`, `ENGINE.md`.
Do not edit `viz.js`, `globe.js`, `app.js`, `index.html`, `styles.css`.

Read the **Shared contracts** section above. The signatures there are fixed — two other
sessions are already writing code against them.

## A1. Rise/set events with azimuths  (the brief asks for this explicitly)

The brief says: *"You may consider showing how much time remains before sunset or
Earthset, as this directly impacts mission operations and power generation windows."*
We don't have it.

Implement `horizonEvents()` and `nextEvent()` per the contract. Requirements:

- Crossings are against the **real skyline** when a profile is passed, so a sunset
  azimuth at Shackleton is where the Sun goes behind *that bearing's* rim, not where
  it crosses altitude 0.
- Bisect to ≤ 1 second. Coarse-scan at the existing `stepMsFor()` cadence, then refine.
- Report the **azimuth at the crossing**. That is the headline number the user asked
  for: *"с каким азимутом восходит солнце"*.
- Handle the polar cases honestly: a site can have **zero** crossings in a window
  (permanent day, permanent night, Earth permanently below the horizon). Return an
  empty array and let the caller say "never", rather than inventing an event.
- `nextEvent()` returns `msUntil` so the UI can render a live countdown.

Existing `eventsFromSamples()` and `nextCrossing()` are a starting point — extend or
replace, but keep whatever `app.js` currently imports working, or coordinate with C.

## A2. Inverse position solve

*"sun inverse position visualisation"* — the forward question is "where is the Sun at
time T". The inverse is **"when is the Sun where I want it"**, which is the question a
planner actually has: *I need the Sun at 10° elevation for this instrument, when?*

Implement `solveFor()` per the contract. Notes:

- Constrain azimuth, elevation, or both. Both constrained usually has no exact
  solution — return the closest approach with `exact: false` and the separation.
- Return **all** solutions in the window, not the first. Over a lunar day the Sun
  passes a given azimuth once; a given elevation twice.
- This is a root-find on a smooth function. Coarse scan then bisect; do not
  brute-force at 1-minute steps across a year.

## A3. Eclipses — and a real bug this exposes

🔴 **The engine currently reports full sunlight during a total solar eclipse.**
Verified on this repo, 2026-03-03 11:33:40 UTC at Mons Mouton:

```
sep(Sun, Earth) = 0.618°   R_earth = 0.955°   R_sun = 0.268°
  -> Earth's disk completely covers the Sun
but the engine returns:  sunFrac 1.000, power 412.4 W/m2
```

`sunFrac` only accounts for the **horizon mask** occulting the Sun. Nothing accounts
for **Earth** occulting the Sun. From the Moon, a lunar eclipse *is* a solar eclipse,
and for a solar-powered lander it is the one scheduled total power loss in the mission.

Fix it:

- Implement `eclipseAt()` and `findEclipses()` per the contract.
- Compute obscuration as the **circle–circle overlap area** of the two disks divided
  by the solar disk area. Use the angular radii the engine *already* returns
  (`sunRadius`, `earthRadius`) — do not hardcode them, they vary by several percent
  with distance.
- Fold the result into `sunFrac` / `power`, so energy totals finally include eclipses.
- ⚠️ **Do not claim irradiance goes to exactly zero in totality.** Earth's atmosphere
  refracts light into the umbra — that is why an eclipsed Moon is red. The geometric
  obscuration is what you can defend; say so in `ENGINE.md` and leave a documented
  floor rather than inventing a radiative transfer model.
- ⚠️ The geometric umbra of the solid Earth is not the real umbra; Earth's atmosphere
  enlarges it by roughly 2%. State the assumption, don't silently fudge it.

**Verified fixtures for your tests** (computed from this repo, 2026-11-15):

| date UTC | site | sep | R_earth | R_sun |
| --- | --- | --- | --- | --- |
| 2026-03-03 11:33:40 | Apollo 11 | 0.380° | 0.959° | 0.268° |
| 2026-03-03 11:33:40 | Mons Mouton | 0.618° | 0.955° | 0.268° |
| 2026-08-28 04:12:49 | Mons Mouton | 0.220° | 0.936° | 0.263° |
| 2026-08-28 04:12:49 | Apollo 11 | 0.500° | 0.940° | 0.263° |

Cross-check against Astronomy Engine's own `SearchLunarEclipse` / `NextLunarEclipse`,
which are in the bundled vendor file and give the Earth-centric view:

```
total      2026-03-03T11:33:40Z  obscuration 1.000
partial    2026-08-28T04:12:49Z  obscuration 0.966
penumbral  2027-02-20T23:12:44Z  obscuration 0.000
```

🔑 **The eclipse is also a free end-to-end validation of the whole engine.** At eclipse
peak the Sun and Earth must be at nearly the same azimuth *and* elevation from any
site — that is what an eclipse is. The table above shows they agree to 0.2–0.6°, which
no accidental sign error in the rotation matrix would survive. Add that as a test.

Note the 2026-08-28 case the user specifically asked about is a **partial** lunar
eclipse from Earth (96.6% of the lunar disk in the umbra), so **different sites on the
Moon see different eclipses on the same date** — some totality, some partial. That is
the brief's "small location changes have large impacts" thesis, handed to us for free.
Do not flatten it to one global answer.

## A4. Named surface features

Build `features.js` the same way `terrain.js` was built: a `tools/` script that fetches
a published dataset offline and emits a committed classic script.

- Source: the **IAU Gazetteer of Planetary Nomenclature** (planetarynames.wr.usgs.gov)
  is the authoritative list of approved lunar feature names with centre coordinates and
  diameters. Cite it in `meta.source`.
- Keep it small. Filter to features above some diameter, plus everything within the
  polar region we care about. Target well under 100 kB — `terrain.js` is 44 kB.
- Implement `featureAtAzimuth()`: given a site and a bearing, say which named feature is
  responsible for the skyline there. Walk the same great circle `tools/lola-horizon.mjs`
  walks, find the sample that set the maximum elevation angle, and return the nearest
  named feature to that point.
- ⚠️ Return `null` when nothing is near. An unnamed ridge is unnamed. Do not attach the
  nearest name from 200 km away just to have a label.

## Deliverables

Working `horizonEvents`, `nextEvent`, `solveFor`, `eclipseAt`, `findEclipses`,
`featureAtAzimuth`, `window.LUNAR_FEATURES`; tests for each in `test/`; `ENGINE.md`
updated with the eclipse model and its stated limits. Both existing gates still green.

---

# SESSION B — visualisation, axes, basemap, labels

You own `viz.js`, `globe.js`, `viz-demo.html`. Do not edit `ephemeris.js`, `app.js`,
`index.html`, `styles.css`.

Read the **Shared contracts** section above. Session A's functions may not exist yet —
code against the signatures and **degrade gracefully if the function is missing**, so
the page never breaks while A is mid-flight:

```js
var ev = (window.LunarEph && LunarEph.horizonEvents) ? LunarEph.horizonEvents(...) : [];
```

Current API you must preserve: `LunarViz.drawMap`, `drawHorizon`, `drawChart`;
`LunarGlobe.drawGlobe`, `hitGlobe`, `attach`, `camera`.

## B1. Axes and 30° graduations  (highest priority, explicitly requested)

The horizon view currently has no scale. A user cannot read an azimuth off it.

- **Azimuth axis**: ticks every 30°, labelled `0° N`, `30°`, `60°`, `90° E` … with the
  cardinal letters emphasised. Minor ticks every 10°.
- **Elevation axis**: ticks at a sensible interval with a hard, visually distinct
  **0° line** — on an airless body that line is the geometric horizon and it is the
  single most important reference in the whole view.
- The axes must stay readable when the view is zoomed to a 2° window near the horizon,
  which is the polar use case. Choose the tick interval from the visible span: 30° at
  full width, down to 0.1° when zoomed hard. Never let labels collide or disappear.
- Same treatment on the chart: a time axis with real date ticks, not sample indices.

## B2. Sun and Earth path traces

Draw the **track** the Sun and Earth sweep across the mission window, not just their
current dots. At a polar site this is the money shot: the Sun scribes a shallow circle
around the horizon while Earth sits nearly still and wobbles by libration.

- Fade the trace by time so direction is readable, and tick it at a round interval
  (every 24 h) with small date labels.
- Mark rise/set crossings on the trace from `LunarEph.horizonEvents()` with the azimuth
  called out — this is the *"с каким азимутом восходит солнце"* answer, drawn.
- Earth's trace over a lunar month is the libration figure. Label it as such; it is a
  genuinely beautiful and unfamiliar shape, and it explains the ±8° DTE result the tool
  already reports.

## B3. Named features and skyline attribution

- Draw `window.LUNAR_FEATURES` labels on the map and the globe, with a
  zoom-dependent threshold so only large features show when zoomed out. Collision-avoid
  the labels; overlapping text is worse than no text.
- On the horizon view, annotate the skyline with what is making it, using
  `LunarEph.featureAtAzimuth()`. "That 22° wall at azimuth 150 is Malapert Massif" is
  the single thing that turns the LOLA profile from a squiggle into terrain.

## B4. QuickMap / Moon Trek quality and scaling

The reference tools are LROC QuickMap and Moon Trek. Match their *affordances*, not
their feature count:

- Smooth zoom and pan with a **scale bar in km** and a **lat/lon graticule** that
  re-grades as you zoom (30° → 10° → 1° → 0.1°).
- A readable projection switch. Polar stereographic for the pole, equirectangular for
  the near side. Say which one is active and what it distorts.
- A real basemap instead of flat grey.

⚠️ **The basemap decision has a trap.** `globe.js` shades the Moon by writing into an
`ImageData` buffer. If you draw a remote tile image onto that canvas, the canvas
becomes **tainted** and `getImageData()` throws a `SecurityError` — the globe breaks
completely, and only when someone opens it over `file://`, which is how we demo.

Two safe options, pick one and write down why:

1. **Pre-bake** a low-resolution LOLA colour-relief or hillshade offline into a
   base64 PNG inside a classic script, exactly like `terrain.js`. Zero network, works
   over `file://`, bounded size. Best for the demo.
2. **Optional online tile layer** drawn to a **separate, non-tainted canvas** that is
   never read back, feature-detected and silently skipped when offline.

Doing both is fine: baked basemap always, tiles as an enhancement. What is not fine is
a page that looks great on your machine and throws on the demo laptop.

## Deliverables

Axes and graduations on the horizon and chart; Sun/Earth traces with event markers;
feature labels; scale bar and graticule; a basemap that cannot taint the globe canvas.
`viz-demo.html` exercises every new drawing path so it can be checked without the app.

---

# SESSION C — controls, readouts, wiring

You own `app.js`, `index.html`, `styles.css`, `README.md`, `DEMO.md`. Do not edit
`ephemeris.js`, `viz.js`, `globe.js`, `sites.js`.

Read the **Shared contracts** section above. A's functions may land after you do —
feature-detect every one of them and hide the control if it is missing, rather than
shipping a dead button.

## C1. The operational readout the brief asks for

Front and centre, in both Simple and Expert:

- **Next event, with a live countdown.** "Sunset in 3 d 14 h, at azimuth 274°."
  The brief calls time-to-sunset *"critical operational information"*; it is currently
  nowhere in the app.
- **Sunrise / sunset azimuths** for the current window, stated as numbers.
- **"Never"** handled as a first-class answer. At Shackleton the Sun may not set in the
  window; at Chang'e 4 Earth never rises. Print "Earth never rises at this site" —
  never a blank, never a `—`, never `NaN`.

## C2. Inverse position control

A small panel: *"Put the Sun at ____ "* with elevation and/or azimuth inputs, a
**Find** button, and a list of matching times in the window. Clicking a result moves the
playhead there.

This is the feature that makes the tool a *planning* tool rather than a viewer: a
planner asks "when do I get 10° of solar elevation", not "what is the elevation now".

## C3. Eclipse awareness

- A **"Next eclipse"** button that jumps the playhead to the next time Earth transits
  the Sun at this site, and a marker on the chart for every eclipse in the window.
- A plain-language readout: kind, obscuration, duration, and the energy lost.
- Add a fourth guided finding alongside `rim`, `margin`, `silence` — hash key
  `st=eclipse` — on **2026-08-28**, the date the user asked about. Build it the same
  way as the existing three: **every number read live from the model, never a stored
  string**, following the `applyStory()` / `storyFromHash()` pattern already in
  `app.js`. Register it in `STORIES` and make sure the deep link works cold.
- 🔑 The honest framing to write: a lunar eclipse seen from Earth is a **solar** eclipse
  seen from the Moon, and for a solar-powered lander it is a scheduled total power loss
  — the one outage you can predict years ahead and design a battery around.

## C4. Make the comparison faster

The brief's actual complaint about existing tools is that *"evaluating each site-date
combination means navigating multiple interfaces"*. Close that:

- Compare sites **and dates** in one table, not just sites — the same site at three
  launch dates is the question a slipped schedule creates.
- A "what changes if we slip 2 weeks" control that re-runs the current comparison at
  shifted epochs and shows the deltas.

## C5. Presentation upkeep

Update `README.md` and `DEMO.md` for whatever ships. Keep `DEMO.md`'s timings honest —
if the script no longer fits 2 minutes, change the script, not the claim.

## Deliverables

Countdown and rise/set azimuth readouts, the inverse-position panel, eclipse controls
and the `st=eclipse` finding, site×date comparison, hash round-trip for all new state,
docs updated. Both gates green, zero console errors over `file://`.

---

## Suggested order

A1 → A3 unblocks the most interesting UI, so Session A should land events and eclipses
before features. B1 is the highest-value visual change and depends on nothing — do it
first. C can build every panel against feature-detected stubs from hour one.
