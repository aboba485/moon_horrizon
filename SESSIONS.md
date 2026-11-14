# Lunar Horizon — research dossier and three Claude sessions

Repo: https://github.com/aboba485/moon_horrizon

NASA Space Apps Challenge 2026, challenge **Lunar Landing Site Navigator** (also listed under CLPS Lunar Mission Browser).

Page: https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/

Three Claude sessions clone that repo and work in parallel on `main`. Each prompt below includes the team rules. They do not share a working copy. GitHub is the handoff.

| Session | Owns | Does not touch |
| --- | --- | --- |
| 1 Sky engine | `ephemeris.js`, `sites.js`, `test/`, `ENGINE.md` | HTML, CSS, `app.js`, `viz.js` |
| 2 Views | `viz.js`, `viz-demo.html` | Engine, `index.html`, `styles.css`, `app.js` |
| 3 Planner shell | `app.js`, `index.html`, `styles.css`, `README.md` | `ephemeris.js`, `sites.js`, `viz.js` internals |

`app.js` does not exist yet. `index.html` and `styles.css` do. The page will not run until session 3 writes `app.js` and session 2 has written `viz.js`.

---

## 1. What the challenge asks for

Mission planners, educators, and the public need to compare landing sites and dates quickly. Existing tools (LROC QuickMap, NASA Moon Trek, JPL Horizons) can answer the question and are painful for a fast trade.

The position of the Sun sets solar-array power and thermal load. The position of Earth sets whether a direct-to-Earth link is possible without a relay. At the south pole both bodies live within a few degrees of the horizon, so a small move or a different month changes the mission.

The challenge explicitly allows:

- A curated list: Apollo, CLPS, commercial, and other nations, plus custom lat/lon
- Side-by-side comparison of sites
- Landing date and time, and how a lunar day or a season changes the answer
- Sun and Earth on the horizon, including time until sunset or Earthset
- Solar elevation, sunlight duration, Earth-visibility windows
- 2D (and optionally 3D) views
- Animation or a timeline across a lunar day
- Language that works for a planner and for a student

The longer brief (background, objectives, and potential considerations) does not change the product. Libration and the Moon’s changing distance are already in the ephemeris, and the prompts require them to be shown. The year-long date scan and a nearby-site delta stay required, because slipped launches and small site moves are the planning case. Solar elevation is the thermal proxy. Do not invent temperatures. LOLA, DEMs, and a 3D Moon stay out of scope. There is no atmosphere and no refraction. The horizon stays geometric, with a uniform mask the user can set.

Official data pointers: QuickMap, Moon Trek, Horizons. Horizons was used as the acceptance test for the engine already in this repo.

## 2. Why the south pole is a different problem

- A lunar day is one synodic month, about 29.53 Earth days. Equatorial sites get ~14 days of Sun and ~14 days of night.
- The Moon’s spin axis is only about 1.54° from the ecliptic pole. The subsolar latitude stays inside roughly ±1.6°.
- At the geographic south pole the Sun’s elevation is about the negative of the subsolar latitude. It circles the horizon once per lunar day and never climbs high.
- Positive subsolar latitude means the Sun is north of the lunar equator. That is south-pole winter. Around 21 June 2026 the model gives a south-pole solar elevation of about −1.4°.
- Earth is almost fixed in the lunar sky and wobbles with libration (about ±8° in longitude and ±7° in latitude). From the exact south pole, Earth bobs by that latitude libration. A site a little toward longitude 0 gets a permanent upward bias.
- Earth as seen from the Moon is about 1.9° across. The Sun is about 0.5° across. A center that is 0.8° below the horizon can still have its upper limb up. On 2026-11-14 00:00 UTC at Mons Mouton, Earth’s center is at −0.805° while the limb is essentially on the horizon. Horizons marked the Earth-limb present.
- There is no atmosphere. Horizon altitude 0 is the geometric horizon of the sphere. No refraction, no blue twilight.
- A horizontal panel at 2° solar elevation is nearly edge-on. A vertical panel that tracks azimuth sees cos(elevation) ≈ 1. Polar missions care about vertical or tilted arrays.
- Terrain is the part this tool does not solve. Crater rims move the local horizon by many degrees. A smooth-sphere altitude can call a crater floor “sunlit” when it is in shadow, or miss a peak of near-eternal light. The uniform mask is a question the user asks, not a LOLA product.

## 3. Geometry that already matches Horizons

Library: Astronomy Engine 2.1.19, MIT, Don Cross. Browser file: `vendor/astronomy.browser.js` (UMD, `window.Astronomy`). A second copy `vendor/astronomy.js` is the CommonJS build and is unused. Leave both.

Time scale: UTC `Date` in, Astronomy Engine TT internally.

Vectors, both EQJ, geometric (aberration off):

- Sun from Moon center = `GeoVector(Sun) − GeoMoon`, converted with `KM_PER_AU`
- Earth from Moon center = `−GeoMoon`

Orientation: `RotationAxis(Body.Moon)`.

- Right ascension is returned in **hours**. Degrees = `ra * 15`
- Declination and prime-meridian `spin` (IAU W) are degrees

Passive rotation, the SPICE / IAU convention, column vectors:

```
R = R3(W) · R1(90° − δ) · R3(90° + α)
v_body = R · v_eqj
```

```
R3(θ) = [[ cos θ, sin θ, 0],
         [-sin θ, cos θ, 0],
         [0, 0, 1]]
R1(θ) = [[1, 0, 0],
         [0,  cos θ, sin θ],
         [0, -sin θ, cos θ]]
```

This matrix was the one that matched Horizons. Do not replace it with a guessed transpose.

Site on a sphere of radius **1737.4 km** (Horizons Moon radius):

```
up    = (cos φ cos λ, cos φ sin λ, sin φ)
east  = (−sin λ, cos λ, 0)
north = (−sin φ cos λ, −sin φ sin λ, cos φ)
```

Topocentric vector = body-frame target − observer position. Sun parallax from the surface is tiny. Earth parallax is about 0.26°. It has to be topocentric.

Altitude / azimuth, Horizons convention, clockwise from north:

```
alt = asin(dot(unit, up))
az  = atan2(dot(unit, east), dot(unit, north))   // 0 north, 90 east
```

At latitude −90 the longitude still defines where north is. The reference site uses lat −89.99, lon 0, so north points along the prime meridian, toward mean Earth.

Angular radii:

- Sun radius 695,700 km
- Earth radius 6,378.137 km
- radius_deg = asin(radius / distance)

DSN geometric line of sight (not a schedule, not a link budget). Station ECEF → equator of date by Greenwich apparent sidereal time → EQJ by `Rotation_EQD_EQJ` when that function exists → into the Moon frame. A station is up when its own altitude clears the mask. That is stricter and more correct than “Earth center is up.”

Coordinates used in `ephemeris.js`:

| Station | Lat | East longitude |
| --- | --- | --- |
| Goldstone | 35.2471 | −116.7933 |
| Madrid | 40.4272 | −4.2508 |
| Canberra | −35.3985 | 148.9819 |

These are complex-level coordinates, not a specific antenna.

### Horizons acceptance, already run

Query: observer ephemeris, `CENTER=coord@301`, geodetic lon,lat,0 km, quantities 4 (airless apparent az/el), `ANG_FORMAT=DEG`. Stop time must be after start time.

Worst error on these cases: **0.007°**.

| Case | When (UTC) | Model az / el | Horizons az / el |
| --- | --- | --- | --- |
| Mons Mouton Sun, −85.416, 31.851 | 2026-11-14 00:00 | 94.880 / +1.170 | 94.875 / +1.171 |
| Mons Mouton Earth | same | 327.029 / −0.805 | 327.030 / −0.805 |
| South pole Sun, −89.9, 0 | 2026-06-21 00:00 | 108.386 / −1.401 | 108.384 / −1.400 |
| South pole Earth | same | 7.504 / −2.076 | 7.507 / −2.076 |
| Apollo 11 Earth, 0.67408, 23.47297 | 2026-11-14 00:00 | 279.017 / +64.944 | 279.018 / +64.944 |
| Apollo 11 Sun | same | 91.441 / −13.163 | 91.442 / −13.158 |
| Slater Plain Earth, −87.478, 124.521 | 2026-11-14 00:00 | 234.435 / −6.118 | 234.436 / −6.118 |
| Far side Earth, 0, 180 | same | 15.550 / −85.448 | 15.544 / −85.448 |

Subsolar latitude over a 10-day sample of 2026 peaked at **1.587°**.

Speed: 400 `atSite` calls in about 53 ms. One lunar day at a 30-minute step (1,418 samples) in about 67 ms. The UI can recompute on the main thread.

### Power model already in `evaluate`

Solar constant 1,361 W/m² at 1 AU, scaled by `(KM_PER_AU / moonSunDistanceKm)²`.

Panel tilt is degrees from horizontal. 0 = flat, 90 = vertical.

```
cos i = sin(alt) cos(tilt) + cos(alt) sin(tilt) cos(az_panel − az_sun)
```

Tracking sets the panel azimuth to the Sun. Otherwise `panel.azimuthDeg`.

Lit fraction of the solar disk:

```
sunFrac = clamp((alt − mask + sunRadius) / (2 · sunRadius), 0, 1)
power   = irradiance · max(0, cos i) · efficiency · sunFrac
```

Default efficiency 0.30. Output is electrical watts per square metre of cells. No dust, no structure shadow, no temperature derate.

Definitions:

- `lit`: any of the solar disk is above the mask (`sunFrac > 0`)
- `earthDisk` / `earthUp`: Earth limb above the mask (`earthAlt + earthRadius > mask`)
- `earthCenter`: center above the mask
- `dte`: at least one DSN station altitude above the mask
- `joint`: `lit` and `dte`

Sanity target, Mons Mouton, landing 2026-11-14 00:00 UTC, duration 29.53 days, 30-minute step, vertical tracking, 30% cells, mask 0:

- Sun elevation about −3.1° to +6.1°
- Earth elevation about −2.8° to +10.0°
- Sunlit fraction about 0.60 (425 h)
- Earth-disk fraction about 0.67
- Joint fraction about 0.57
- Energy about 177 kWh/m²
- Mean power including night about 250 W/m²

A flat panel on the same window should come out much smaller. If it comes out similar, the tilt formula is wrong.

## 4. Sites already in `sites.js`

Latitudes are degrees, south negative. Longitudes are east-positive, Mean Earth frame. Artemis coordinates are representative published points inside regions, not NASA touchdown pins. Source for the Artemis CLS points: Wueller et al., JGR Planets (2026), appendix table of candidate landing sites, values read from the paper’s HTML table.

2024 Artemis III nine regions (NASA, October 2024): Peak near Cabeus B, Haworth, Malapert Massif, Mons Mouton Plateau, Mons Mouton, Nobile Rim 1, Nobile Rim 2, de Gerlache Rim 2, Slater Plain.

2022 list also had Connecting Ridge, Connecting Ridge Extension, de Gerlache Rim 1, de Gerlache–Kocher Massif, Peak Near Shackleton, Faustini Rim A, Leibnitz Beta (renamed Mons Mouton), Amundsen Rim. Faustini Rim A and Connecting Ridge Extension are absent here because no cited point was in hand. Do not invent coordinates.

| id | Name | Lat | Lon | Note |
| --- | --- | --- | --- | --- |
| mouton | Mons Mouton | −85.416 | 31.851 | CLS MMO01. IM-2 region |
| mouton-plateau | Mons Mouton Plateau | −85.111 | 26.710 | CLS MMP01 |
| nobile-1 | Nobile Rim 1 | −85.295 | 36.917 | CLS NR101. VIPER’s region |
| nobile-2 | Nobile Rim 2 | −84.054 | 56.481 | CLS NR201 |
| malapert | Malapert Massif | −85.942 | −0.944 | CLS MMA01 |
| haworth | Haworth | −86.990 | −24.254 | HW_K2023 |
| gerlache-2 | de Gerlache Rim 2 | −88.389 | −68.865 | CLS dGR201 |
| cabeus-peak | Peak near Cabeus B | −83.763 | −69.983 | CLS PCB01 |
| slater | Slater Plain | −87.478 | 124.521 | CLS SP01, far side, Earth stays down |
| connecting | Connecting Ridge | −89.421 | −149.472 | CLS CR05, 2022 region |
| shackleton-peak | Peak near Shackleton | −89.061 | 128.442 | CLS PNS02, 2022 region |
| south-pole | Geographic south pole | −89.99 | 0 | Lon only sets the azimuth zero |
| shackleton | Shackleton crater | −89.9 | 0 | Crater, not a sunlit rim |
| amundsen | Amundsen Rim | −84.467 | 66.970 | CLS AR01, 2022 region |
| kocher | de Gerlache–Kocher | −85.726 | −116.813 | Far-side massif |
| im2 | IM-2 Athena | −84.7906 | 29.1957 | Reported touchdown 6 Mar 2025, on its side |
| im1 | IM-1 Odysseus | −80.13 | 1.44 | Malapert A, 22 Feb 2024. Ignore the stray 84.9°S, 12.9°E listing |
| blue-ghost | Blue Ghost 1 | 18.5623 | 61.8103 | Mare Crisium, 2 Mar 2025 |
| apollo11 | Apollo 11 | 0.67408 | 23.47297 | Tranquility |
| apollo12 | Apollo 12 | −3.01239 | −23.42157 | |
| apollo14 | Apollo 14 | −3.64530 | −17.47136 | |
| apollo15 | Apollo 15 | 26.13222 | 3.63386 | |
| apollo16 | Apollo 16 | −8.97301 | 15.50019 | |
| apollo17 | Apollo 17 | 20.19080 | 30.77168 | |
| chandrayaan3 | Chandrayaan-3 | −69.373 | 32.319 | Shiv Shakti, 23 Aug 2023 |
| slim | SLIM | −13.316 | 25.251 | Shioli, 19 Jan 2024 |
| change4 | Chang’e 4 | −45.4446 | 177.5991 | Far side, needed a relay |
| change5 | Chang’e 5 | 43.058 | −51.916 | Procellarum, Dec 2020 |
| change6 | Chang’e 6 | −41.6385 | −153.9852 | Far side, Jun 2024 |
| hakuto2 | Hakuto-R M2 | 60.4445 | −4.588 | Attempted 5 Jun 2025, contact lost |

Groups: `artemis`, `south`, `clps`, `apollo`, `world`. Fields on each record: `id`, `name`, `short`, `group`, `program`, `status` (`candidate` | `landed` | `attempted` | `reference`), `lat`, `lon`, `note`.

## 5. Engine API session 3 must call, session 1 must not break

Global: `window.LunarEph` after `ephemeris.js`. Also `module.exports` under Node.

`window.LUNAR_SITES` and `window.LUNAR_GROUPS` from `sites.js`.

```javascript
LunarEph.evaluate(date, lat, lon, maskDeg, panel)
LunarEph.sampleMission(startDate, durationMs, lat, lon, { stepMs, maskDeg, panel })
LunarEph.summarize(samples)
LunarEph.scanWindows(lat, lon, missionMs, fromDate, { maskDeg, panel, horizonDays })
LunarEph.atSite(date, lat, lon)          // instant geometry, no power
LunarEph.observe(date)                   // body-frame Sun and Earth, sub-points
LunarEph.incidence(sunAltDeg, sunAzDeg, panel)
LunarEph.nextCrossing(start, lat, lon, maskDeg, "sun"|"earth"|"dte", wantRise)
LunarEph.stepMsFor(durationMs)
LunarEph.DSN
LunarEph.MOON_RADIUS_KM
```

`panel` is `{ tiltDeg, tracking, azimuthDeg, efficiency }`. `tiltDeg` 90 and `tracking: true` is the polar default.

`evaluate` returns `sunAlt, sunAz, earthAlt, earthAz, sunRadius, earthRadius, sunFrac, lit, earthCenter, earthDisk, earthUp, stationAlt, stationUp, dte, joint, irradiance, cosI, power, subSolarLat, subEarthLat, subEarthLon, stations[{id,name,alt,az}]`, plus `t`, `sky`, `view`.

`sampleMission` deletes `sky` and `view` on each sample so the array stays small. Samples still have `stations`.

`summarize` returns `spanMs, sunlitHours, sunlitFrac, earthHours, earthFrac, dteHours, dteFrac, jointHours, jointFrac, longestNight {ms, start}, longestDay, longestBlackout, longestLink, sunMin, sunMax, earthMin, earthMax, energyWh, meanPower`.

`meanPower` is the average over the whole window, night included. `energyWh` is watt-hours per square metre.

`scanWindows` returns up to 6 rows: `start` (ms), `sunFrac, dteFrac, jointFrac, energyWh, longestNightH, longestBlackoutH, score`. Step is 6 hours. It is a screen, not a flight product. Label it that way in the UI.

## 6. Viz contract session 2 implements and session 3 calls

Global: `window.LunarViz`.

```javascript
LunarViz.drawHorizon(canvas, model)
LunarViz.drawChart(canvas, model)
LunarViz.drawMap(canvas, model)
LunarViz.hitMap(canvas, model, cssX, cssY)  // returns site id or null
```

`model`:

```javascript
{
  sites: [{ id, name, short, lat, lon, color, samples, now }],
  primaryId,
  playheadMs,
  landingMs,
  maskDeg,
  mapMode: "auto" | "polar" | "near"
}
```

`samples` are `sampleMission` output. `now` is an `evaluate` result (the instant under the playhead). `color` is a CSS color. Order is comparison order. Index 0 is primary if `primaryId` matches it.

Colors session 3 should pass: `#f4efe4`, `#ef8f62`, `#7dcea0`.

Drawing rules:

- Horizon x is azimuth with **north at the center**, east to the right, south split on the two edges. Azimuth increases eastward, matching Horizons.
- Y is elevation. Always include 0 and the mask. If every body stays inside a ~30° band, zoom until the polar skim is obvious and show a “zoomed to the horizon” label. If the Sun climbs past ~40°, use a scale that fits, still including the horizon.
- Draw the Sun and Earth at their true angular radii when the zoom makes that larger than about 6 px. Below that, use a 6 px minimum and say the disks are enlarged.
- Draw the trail of each body across `samples`. Break the polyline when azimuth wraps.
- Draw the ground as a translucent band so objects below the horizon stay visible. Elevation −1° and −8° are different engineering facts.
- Mask is a dashed line.
- Chart x is time from the first sample to the last. Y is elevation, shared by every site. Primary Sun may be filled. Other Suns are lines in site colors. Earth is a second line style. Playhead is `playheadMs`.
- Map `polar`: south-pole stereographic, longitude 0 at the top, labeled as the mean-Earth direction. Default span 15° from the pole when every selected site is south of −75°, otherwise span enough to include them.
- Map `near`: orthographic near side, front hemisphere `cos(lat) cos(lon) > 0`. Far-side sites still listed, drawn faded on the limb or just inside with a “far side” tag.
- `auto`: polar when every selected site has lat < −75, otherwise near side.
- `hitMap` uses the same projection as `drawMap`.
- Handle `devicePixelRatio`. Redraw from the current model. No animation loop inside viz. No DOM controls inside viz.
- Fonts: `Outfit, sans-serif` for labels, `IBM Plex Mono, ui-monospace, monospace` for numbers. Colors already in `styles.css`: background `#0c0b09`, sun `#f0a202`, earth `#3db7e8`, ink `#f4efe6`, muted `#a79d90`.

## 7. Shell that already exists

`index.html` loads, in order: `vendor/astronomy.browser.js`, `sites.js`, `ephemeris.js`. Session 3 adds `viz.js` before `app.js`.

Stable ids session 3 should wire before inventing new ones:

- `#season`
- `#map`, `#map-mode` (`auto` | `polar` | `near`)
- `#search`, `#filters`, `#site-list`, `#site-note`
- `#preset-contrast` (Mons Mouton + Slater Plain), `#preset-artemis` (Mouton, Nobile Rim 2, de Gerlache Rim 2)
- `#custom-form`, `#custom-name`, `#custom-lat`, `#custom-lon`
- `#mask` range −4 to 15 step 0.1, `#mask-read`, `#mask-presets` buttons with `data-mask`
- `#panel-mode` (`vertical` | `horizontal` | `tilt`), `#tilt`, `#tilt-read`, `#tracking`, `#azimuth`, `#az-read`, `#efficiency`, `#eff-read`, `#panel-hint`
- `#land-date`, `#land-time` interpreted as **UTC**, `#duration` values are **hours**: 24, 168, 336, 708.734, 2126.2, 4383, 8760
- `#step-back`, `#step-fwd` (±1 day on the landing epoch), `#now-btn`, `#play`, `#chips`
- `#horizon`, `#readout`
- `#metrics`, `#compare`
- `#chart`, `#csv`
- `#insights`, `#scan`, `#windows`

Visual direction is already in `styles.css`. Extend it. Do not replace it with a new theme.

Behavior the shell has to grow:

- Landing epoch is the start of the window. Playhead scrubs inside the window and drives the horizon. The date inputs stay on the landing epoch while scrubbing.
- One site by click. Pin up to three for comparison. First chip is primary. Removing the primary promotes the next.
- Same mask and same panel for every site in the comparison, so the delta is the place and the date.
- Metrics for the primary mission: sunlit fraction and hours, longest night, DTE fraction and longest gap, joint fraction and hours, energy Wh/m² and mean watts. Say “per m² at the selected efficiency, night included” next to mean power.
- Readout at the playhead: Sun alt/az, Earth alt/az, limb clearance `earthAlt + earthRadius − mask`, power now, countdown to sunset or sunrise and to link loss or link return, using the samples. If the crossing is outside the window, say so.
- Insights in plain sentences from those numbers. Mention south-pole summer when subsolar latitude is negative. Mention that Slater-like far-side sites can have Sun and still have no Earth. When two sites are selected, state the delta in sunlit hours and DTE hours.
- When `|lat| > 70` and the panel is vertical, also compute the flat-panel energy and say it. When the user has selected flat, compute the vertical case and say that.
- Scan button calls `scanWindows` for the primary site and fills `#windows`. Clicking a result sets the landing epoch.
- CSV of the primary samples: time UTC, sun alt/az, earth alt/az, sun fraction, dte, joint, irradiance, power.
- URL hash so a scenario reloads: sites, landing ISO time, duration hours, mask, panel, tilt, tracking, azimuth, efficiency.
- Custom sites kept in `localStorage` under one key.
- Escape any custom name before putting it in HTML.
- Keyboard: Space plays, arrows move the playhead by one hour, Shift+arrows by one day, clamped to the window.
- `#panel-hint` at low positive elevation: state the vertical-to-flat cosine ratio `cos(alt)/sin(alt)` when alt is between 0.5° and 20°.

Copy rules: UTC everywhere, labeled. No “flight certified”. The footer already tells the truth about Horizons, the sphere, and the missing terrain. Keep that truth if you edit the footer.

## 8. What is unfinished on purpose

- `viz.js` and `viz-demo.html` — session 2
- `app.js`, hash/CSV/scan wiring, README — session 3
- `ENGINE.md` and a sample-based event helper — session 1
- No LOLA DEM, no real horizon masks, no 3D terrain
- GitHub remote is https://github.com/aboba485/moon_horrizon on `main`. Sessions clone that, pull before they edit, and push their own files when a slice works.

Run the existing check from the project root:

```
node test/validate.mjs
```

It needs network access to Horizons. A failure above 0.15° is a real regression. The current worst error is 0.007°.

---

# Prompt 1 — Sky engine

Paste this whole block into a fresh Claude session. Its first action is cloning the GitHub repo.

```
You are session 1 of 3 building Lunar Horizon together. The other two sessions are working at the same time on the other parts. You do not share a laptop. GitHub is the only handoff.

Repo: https://github.com/aboba485/moon_horrizon
Branch: main
Start with: git clone https://github.com/aboba485/moon_horrizon.git
Work inside that clone. Do not start from a leftover folder, and do not create a second repo.

Who owns what:
- Session 1, you, sky engine: ephemeris.js, sites.js, test/, ENGINE.md
- Session 2, views: viz.js, viz-demo.html
- Session 3, planner shell: app.js, index.html, styles.css, README.md
Nobody edits vendor/, SESSIONS.md, CLAUDE.md, primer.md, or knowledge.md.

Team rules, all three sessions:
1. Touch only your files. A one-line change you want in someone else's file stays unmade. Say it in the commit message instead.
2. git pull before the first edit. Before every push, run git pull --rebase origin main and then git push origin main. If the push is rejected, pull --rebase again and push again. Never force-push. Never reset --hard. Never delete main.
3. A rebase conflict in a file you do not own: keep the version already on main. A conflict in a file you own: keep your work, and do not delete the other sessions' files while you resolve it.
4. Commit small slices of your own files and push each slice to main. The task is unfinished until git status is clean and git push has succeeded. Your last message names the commit SHA and links https://github.com/aboba485/moon_horrizon
5. Commit messages are one plain sentence about what changed. No Co-Authored-By line. No secrets, tokens, or .env files.
6. The other sessions will push while you work. Pull again before you call the task done. Code to the contract in this prompt even if their files are not on main yet. When their files appear, pull them. Do not rewrite them.
7. No build step, no framework, and no new astronomy library.

Challenge fit. The product is rapid comparison of sites and of dates for Sun position, Earth position, power, and direct-to-Earth. Libration and the Moon's changing distance are already in the ephemeris. Keep them. Do not replace them with a flat model. Topography and 3D terrain are optional in the brief and out of scope. Keep the uniform horizon mask and say it is not a LOLA horizon. Do not download DEMs or build a 3D moon. No atmosphere and no refraction. The horizon is geometric. Write for a planner and for a student on the same screen: numbers a planner can use, and one plain sentence about why the south pole is different from Apollo.

Your files are ephemeris.js, sites.js, test/, and a new ENGINE.md. Do not edit index.html, styles.css, app.js, viz.js, or viz-demo.html. Sessions 2 and 3 are writing those against the API below. If you change a return field, their work breaks.

The astronomy is already implemented and checked. On 2026-11-14 00:00 UTC at lat −85.416, lon 31.851, JPL Horizons airless apparent place is Sun az 94.875 el +1.171 and Earth az 327.030 el −0.805. This code returns 94.880 / +1.170 and 327.029 / −0.805. Seven other cases (south pole on 2026-06-21, Apollo 11, Slater Plain, the far-side equator) all agree within 0.007°. Subsolar latitude through 2026 stays inside ±1.59°. Keep that.

Do not replace the rotation. Astronomy Engine RotationAxis ra is in hours (multiply by 15). Declination and spin are degrees. The matrix that matches Horizons is the passive IAU/SPICE form R = R3(W) · R1(90−δ) · R3(90+α), with
R3 = [[c, s, 0], [−s, c, 0], [0, 0, 1]] and R1 = [[1, 0, 0], [0, c, s], [0, −s, c]].
Observer is on a 1737.4 km sphere. Azimuth is atan2(east, north), 0 at north, 90 at east. Topocentric Earth parallax is about 0.26° and must stay. Sun radius 695700 km, Earth radius 6378.137 km.

Power stays: irradiance = 1361 · (1 AU / distance)². Tilt 0 is horizontal, 90 is vertical. cos i = sin(alt)cos(tilt) + cos(alt)sin(tilt)cos(Δaz). sunFrac = clamp((alt − mask + sunRadius) / (2·sunRadius), 0, 1). power = irradiance · max(0, cos i) · efficiency · sunFrac. lit means sunFrac > 0. earthDisk means earthAlt + earthRadius > mask. dte means some DSN station altitude > mask. joint means lit and dte.

Public API that must keep working, same names and meanings:
LunarEph.evaluate, sampleMission, summarize, scanWindows, atSite, observe, incidence, nextCrossing, stepMsFor, DSN, MOON_RADIUS_KM.
evaluate fields: sunAlt, sunAz, earthAlt, earthAz, sunRadius, earthRadius, sunFrac, lit, earthCenter, earthDisk, earthUp, stationAlt, stationUp, dte, joint, irradiance, cosI, power, subSolarLat, subEarthLat, subEarthLon, stations, t.
summarize fields: spanMs, sunlitHours, sunlitFrac, earthHours, earthFrac, dteHours, dteFrac, jointHours, jointFrac, longestNight/longestDay/longestBlackout/longestLink as {ms, start}, sunMin, sunMax, earthMin, earthMax, energyWh, meanPower.
scanWindows rows: start (ms), sunFrac, dteFrac, jointFrac, energyWh, longestNightH, longestBlackoutH, score. Top 6.
panel object: { tiltDeg, tracking, azimuthDeg, efficiency }.
Sites live on window.LUNAR_SITES with id, name, short, group, program, status, lat, lon, note. Do not invent coordinates. Faustini Rim A and Connecting Ridge Extension are intentionally absent.

Your work:
1. Read ephemeris.js and sites.js. Write ENGINE.md that documents the API, units, the Horizons table above, the power definitions, and the limits: spherical Moon, uniform mask, no LOLA, DSN is geometric line of sight to Goldstone 35.2471/−116.7933, Madrid 40.4272/−4.2508, Canberra −35.3985/148.9819, complex-level not a specific dish. State that libration is already inside the IAU pole series, visible as subEarthLat and subEarthLon, and that the tool does not model terrain.
2. Add LunarEph.eventsFromSamples(samples, fromMs, maskDeg). It must not call the ephemeris. Walk the samples. Interpolate the crossing time between bracketing samples.
   Return { sunset, sunrise, earthset, earthrise, linkDown, linkUp }.
   Each value is either null (no crossing after fromMs inside the samples) or { t: milliseconds, kind }.
   Sun crossings use sunAlt + sunRadius − maskDeg. Earth crossings use earthAlt + earthRadius − maskDeg. Link crossings use stationAlt − maskDeg.
   sunset/earthset/linkDown are the next downward crossing if the playhead value is currently above zero. sunrise/earthrise/linkUp are the next upward crossing if it is currently at or below zero. If the playhead is already on the other side, that field is null.
3. Add test/events.test.mjs that builds a tiny synthetic sample array and checks interpolation, wrap of “already down”, and “no crossing”. No network.
4. Keep test/validate.mjs working. Run it. Also run the events test. Paste both outputs into ENGINE.md under a “Checks” heading. If Horizons is unreachable, say so and still run the events test. Do not loosen the 0.15° failure threshold.
5. Add one Mons Mouton sanity check in the events test file or a third small test: landing 2026-11-14T00:00:00Z, duration 29.530589 days, mask 0, panel {tiltDeg:90, tracking:true, efficiency:0.3}. Assert sunlitFrac between 0.5 and 0.7, earthFrac between 0.55 and 0.8, energyWh between 120 and 230, and sunMax < 12. This locks the polar behavior.

Do not add a build step, a framework, or a new astronomy library. vendor/astronomy.browser.js is the one the browser loads. vendor/astronomy.js is an unused CommonJS duplicate. Leave both.

Done means ENGINE.md exists, eventsFromSamples is exported, both tests have been run, a one-line note at the top of ENGINE.md says the other sessions may rely on the field lists above, and those commits are on origin/main. Paste the SHA and the GitHub link.
```

---

# Prompt 2 — Horizon, chart, and map

Paste this whole block into a fresh Claude session. Its first action is cloning the GitHub repo.

```
You are session 2 of 3 building Lunar Horizon together. The other two sessions are working at the same time on the other parts. You do not share a laptop. GitHub is the only handoff.

Repo: https://github.com/aboba485/moon_horrizon
Branch: main
Start with: git clone https://github.com/aboba485/moon_horrizon.git
Work inside that clone. Do not start from a leftover folder, and do not create a second repo.

Who owns what:
- Session 1, sky engine: ephemeris.js, sites.js, test/, ENGINE.md
- Session 2, you, views: viz.js, viz-demo.html
- Session 3, planner shell: app.js, index.html, styles.css, README.md
Nobody edits vendor/, SESSIONS.md, CLAUDE.md, primer.md, or knowledge.md.

Team rules, all three sessions:
1. Touch only your files. A one-line change you want in someone else's file stays unmade. Say it in the commit message instead.
2. git pull before the first edit. Before every push, run git pull --rebase origin main and then git push origin main. If the push is rejected, pull --rebase again and push again. Never force-push. Never reset --hard. Never delete main.
3. A rebase conflict in a file you do not own: keep the version already on main. A conflict in a file you own: keep your work, and do not delete the other sessions' files while you resolve it.
4. Commit small slices of your own files and push each slice to main. The task is unfinished until git status is clean and git push has succeeded. Your last message names the commit SHA and links https://github.com/aboba485/moon_horrizon
5. Commit messages are one plain sentence about what changed. No Co-Authored-By line. No secrets, tokens, or .env files.
6. The other sessions will push while you work. Pull again before you call the task done. Code to the contract in this prompt even if their files are not on main yet. When their files appear, pull them. Do not rewrite them.
7. No build step, no framework, and no new astronomy library.

Challenge fit. The product is rapid comparison of sites and of dates for Sun position, Earth position, power, and direct-to-Earth. Libration and the Moon's changing distance are already in the ephemeris. Keep them. Do not replace them with a flat model. Topography and 3D terrain are optional in the brief and out of scope. Keep the uniform horizon mask and say it is not a LOLA horizon. Do not download DEMs or build a 3D moon. No atmosphere and no refraction. The horizon is geometric. Write for a planner and for a student on the same screen: numbers a planner can use, and one plain sentence about why the south pole is different from Apollo.

You create two files only: viz.js and viz-demo.html. Do not edit ephemeris.js, sites.js, index.html, styles.css, app.js, ENGINE.md, or anything in test/. Session 3 owns the app shell and will call the API below. Session 1 owns the sky math. The math is already checked against JPL Horizons to 0.007°. Do not reimplement it. Pull before you finish so you are drawing against the latest engine on main.

Load order in viz-demo.html: vendor/astronomy.browser.js, then sites.js, then ephemeris.js, then viz.js. Classic script tags, not ES modules, so the demo works from file:// and from a static server. Global you must set: window.LunarViz.

Implement exactly these functions:

LunarViz.drawHorizon(canvas, model)
LunarViz.drawChart(canvas, model)
LunarViz.drawMap(canvas, model)
LunarViz.hitMap(canvas, model, cssX, cssY)

model is:
{
  sites: [{ id, name, short, lat, lon, color, samples, now }],
  primaryId, playheadMs, landingMs, maskDeg,
  mapMode: "auto" | "polar" | "near"
}

samples are arrays from LunarEph.sampleMission. Each point has t, sunAlt, sunAz, earthAlt, earthAz, sunRadius, earthRadius, sunFrac, lit, earthDisk, dte, joint, power, stationAlt, stations. now is a LunarEph.evaluate result for the playhead, including sunAlt, sunAz, earthAlt, earthAz, sunRadius, earthRadius, stations, subSolarLat. colors you will be given include #f4efe4, #ef8f62, #7dcea0. sites[0] is the primary when primaryId matches.

Science the pictures must not lie about:
- Azimuth 0 is north, 90 is east, clockwise, same as Horizons. On the horizon canvas, put north at the horizontal center, east to the right, south at both edges.
- The Moon has no air. The horizon is a hard line at elevation 0. The user’s mask is a second dashed line at model.maskDeg.
- At the south pole the Sun and Earth stay within a few degrees of that line. If the data span is under about 30°, zoom the elevation axis so the skim is readable, and paint a small label “Zoomed to the horizon”. Always include 0 and the mask in the axis. If any site sends the Sun above about 40°, expand the scale to fit. Apollo has to look different from Mons Mouton. That contrast is why a lunar day is not an Earth day. Do not add a 3D moon.
- Draw Sun and Earth disks at true angular diameter using the elevation scale (Sun ~0.5°, Earth ~1.9°, so Earth is several times wider). If the true radius would be under 6 px, draw 6 px and add the words “Disks enlarged”.
- A translucent ground may shade elevations below 0. Disks and trails below the horizon must remain visible. −1° and −8° are different answers.
- Trails come from samples across the mission. Break a trail when azimuth jumps by more than 180°.
- Label N, E, S, W and a few elevations. Use Outfit, sans-serif for words and IBM Plex Mono, ui-monospace, monospace for numbers. Page colors: background #0c0b09, sun #f0a202, earth #3db7e8, ink #f4efe6, muted #a79d90, warn #e08a62.
- Multiple sites: one Sun and one Earth per site, site color as a ring or stroke, short name as the label. Offset labels so they do not stack on the same pixel.
- Chart: time on x from the first sample to the last, elevation on y, one shared scale. Fill the primary Sun only. Other Suns are lines in site colors. Earth lines are dashed. Draw the mask and the zero line. Draw a playhead at playheadMs. Axis labels in UTC, not local time.
- Map polar: south stereographic, longitude 0 at the top, caption that top is the mean-Earth direction. Rho = 0 at lat −90. If every site in model.sites has lat < −75, span 15° from the pole. Otherwise span so every selected site is inside, with padding.
- Map near: orthographic disk of the near side. A point is on the front if cos(lat)cos(lon) > 0. Far-side selected sites still get a marker, faded, with a tiny “far side” tag.
- auto: polar when every selected site is south of −75, otherwise near.
- hitMap returns the site id under cssX, cssY, or null. Use the same projection as drawMap. Marker hit radius at least 12 css pixels.
- Size the backing store by devicePixelRatio. Read width and height from the canvas client size. No requestAnimationFrame loop inside viz.js. No controls, no data fetching, no writes to the ephemeris.

viz-demo.html is your proof. It should:
- Evaluate Mons Mouton (id mouton, lat −85.416, lon 31.851) for one lunar day starting 2026-11-14T00:00:00Z, mask 0, panel {tiltDeg:90, tracking:true, efficiency:0.3}, using LunarEph.sampleMission and one LunarEph.evaluate at the start.
- Also compute Apollo 11 (lat 0.67408, lon 23.47297) over the same window.
- Show two stacked demos, or a toggle you may put in the demo HTML only: “Mons Mouton” and “Apollo 11”. The horizon scale must zoom for Mouton and open up for Apollo.
- Include the map in polar mode with both sites passed in, so one is near the pole and Apollo falls outside a 15° cap. That is fine: when both are in the array, auto/polar span must grow to include Apollo or you document in a one-line comment that the demo forces mapMode "near" for the mixed pair and "polar" for Mouton alone. Mixed pair in polar mode must still plot both, so compute the span from the data.
- A range input in the demo scrubs playheadMs and redraws. That input lives in viz-demo.html, not in viz.js.
- Clicking the map logs the hit id or alerts it.

Check your work by opening viz-demo.html. If you cannot open a browser, run a local static server and say what you could not see. Do not claim the zoom works unless you have looked or have measured pixel positions in a small node canvas mock. A node mock is acceptable: create an OffscreenCanvas or a minimal fake if node has no canvas, and at least assert hitMap math with a pure function you export for the test. If you extract the projection into a pure function to test it, export it as LunarViz.project(lat, lon, mode, width, height, sites) returning {x, y, front} in css pixels. Session 3 does not have to call project. hitMap must use it.

Do not add npm, a bundler, or a second astronomy library. Do not “improve” ephemeris.js.

Done means viz.js defines the four functions, viz-demo.html runs against the real engine, Mouton’s horizon is a zoomed band, Apollo’s is not, Earth is drawn larger than the Sun, north is centered, and those commits are on origin/main. Paste the SHA and the GitHub link.
```

---

# Prompt 3 — Planner shell

Paste this whole block into a fresh Claude session. Its first action is cloning the GitHub repo.

```
You are session 3 of 3 building Lunar Horizon together. The other two sessions are working at the same time on the other parts. You do not share a laptop. GitHub is the only handoff.

Repo: https://github.com/aboba485/moon_horrizon
Branch: main
Start with: git clone https://github.com/aboba485/moon_horrizon.git
Work inside that clone. Do not start from a leftover folder, and do not create a second repo.

Who owns what:
- Session 1, sky engine: ephemeris.js, sites.js, test/, ENGINE.md
- Session 2, views: viz.js, viz-demo.html
- Session 3, you, planner shell: app.js, index.html, styles.css, README.md
Nobody edits vendor/, SESSIONS.md, CLAUDE.md, primer.md, or knowledge.md.

Team rules, all three sessions:
1. Touch only your files. A one-line change you want in someone else's file stays unmade. Say it in the commit message instead. You may add the viz.js script tag to index.html, because that file is yours.
2. git pull before the first edit. Before every push, run git pull --rebase origin main and then git push origin main. If the push is rejected, pull --rebase again and push again. Never force-push. Never reset --hard. Never delete main.
3. A rebase conflict in a file you do not own: keep the version already on main. A conflict in a file you own: keep your work, and do not delete the other sessions' files while you resolve it.
4. Commit small slices of your own files and push each slice to main. The task is unfinished until git status is clean and git push has succeeded. Your last message names the commit SHA and links https://github.com/aboba485/moon_horrizon
5. Commit messages are one plain sentence about what changed. No Co-Authored-By line. No secrets, tokens, or .env files.
6. The other sessions will push while you work. Pull again before you call the task done. Code to the contract in this prompt even if viz.js or eventsFromSamples is not on main yet. When they appear, pull and retest. Do not rewrite viz.js, viz-demo.html, ephemeris.js, sites.js, or test/.
7. No build step, no framework, and no new astronomy library.

Challenge fit. The product is rapid comparison of sites and of dates for Sun position, Earth position, power, and direct-to-Earth. Libration and the Moon's changing distance are already in the ephemeris. Keep them. Do not replace them with a flat model. Topography and 3D terrain are optional in the brief and out of scope. Keep the uniform horizon mask and say it is not a LOLA horizon. Do not download DEMs or build a 3D moon. No atmosphere and no refraction. The horizon is geometric. Write for a planner and for a student on the same screen: numbers a planner can use, and one plain sentence about why the south pole is different from Apollo.

You own app.js, index.html, styles.css, and README.md. Do not edit ephemeris.js, sites.js, viz.js, viz-demo.html, test/, or ENGINE.md.

The sky math is done. window.LunarEph is loaded by index.html. It has been checked against JPL Horizons to within 0.007°. Trust it. On 2026-11-14 00:00 UTC at Mons Mouton (−85.416, 31.851) the Sun is about +1.17° at azimuth 95° and the Earth’s center is about −0.81°. The Earth limb is about 0.95° in radius, so the limb is essentially on the horizon while the center is below it. Say that kind of thing in the readout when it is true. Do not re-derive the ephemeris in the UI.

index.html and styles.css already exist. The page does nothing until you write app.js. Add a script tag for viz.js immediately before app.js. Classic scripts, no bundler, file:// must keep working.

Viz API you call, implemented by session 2 in viz.js:
LunarViz.drawHorizon(canvas, model)
LunarViz.drawChart(canvas, model)
LunarViz.drawMap(canvas, model)
LunarViz.hitMap(canvas, model, cssX, cssY) -> site id or null

model = { sites: [{ id, name, short, lat, lon, color, samples, now }], primaryId, playheadMs, landingMs, maskDeg, mapMode }
Pass colors #f4efe4, #ef8f62, #7dcea0 in selection order. If LunarViz is missing, show one sentence in #readout: “viz.js is not loaded yet.” Do not reimplement the canvases yourself.

Engine calls you should use:
LunarEph.evaluate(date, lat, lon, maskDeg, panel)
LunarEph.sampleMission(start, durationMs, lat, lon, { maskDeg, panel })
LunarEph.summarize(samples)
LunarEph.scanWindows(lat, lon, missionMs, from, { maskDeg, panel })
LunarEph.eventsFromSamples(samples, fromMs, maskDeg) if it exists. Session 1 is adding it. If it is missing, walk the samples yourself the same way: interpolate sunAlt+sunRadius−mask, earthAlt+earthRadius−mask, and stationAlt−mask.

panel = { tiltDeg, tracking, azimuthDeg, efficiency }.
vertical mode → tiltDeg 90, tracking true.
horizontal → tiltDeg 0, tracking true.
tilt → tiltDeg from #tilt, tracking from #tracking.
efficiency is #efficiency / 100. azimuthDeg from #azimuth when tracking is off.

summarize gives sunlitHours, sunlitFrac, earthHours, earthFrac, dteHours, dteFrac, jointHours, jointFrac, longestNight/longestBlackout as {ms, start}, sunMin, sunMax, earthMin, earthMax, energyWh, meanPower.
meanPower includes the night. Label it “average watts per m², night included”. energyWh is per m² at the selected cell efficiency.
scanWindows returns up to 6 rows: start (ms), sunFrac, dteFrac, jointFrac, energyWh, longestNightH, longestBlackoutH, score. The scan step is 6 hours. Say “6-hour screen” next to the results.

Wire the ids already in index.html. Landing date #land-date and time #land-time are UTC, not the laptop zone. #duration values are hours: 24, 168, 336, 708.734, 2126.2, 4383, 8760. Default mission is one lunar day. Default site is mouton. Default landing is the current UTC time rounded down to the hour, unless the URL hash says otherwise.

Behavior:
- Click a site row or a map hit: that site becomes the only selection, unless the user used the pin control. Pin adds or removes a compare site, maximum 3. #chips lists them. The first is primary. A chip click makes it primary. A × removes it. The last site cannot be removed.
- #preset-contrast selects mouton and slater. #preset-artemis selects mouton, nobile-2, and gerlache-2.
- #search and #filters (one chip per LUNAR_GROUPS entry, plus All) filter #site-list. Show name, program, lat/lon, and the pin.
- #site-note shows the primary site’s note.
- Custom form appends a site, stores the custom list in localStorage, and selects it. Escape the name. Lat −90..90, lon −180..180.
- Mask #mask is degrees, shared by every site in the comparison. Preset buttons set it. #mask-read shows the value.
- Changing landing, duration, mask, panel, or the site list recomputes samples. Scrubbing the chart or playing only moves playheadMs and re-evaluates now. Do not resample the whole mission on each animation frame.
- #play animates the playhead from its current time to the end of the window. Respect prefers-reduced-motion by stepping in 1-hour jumps on a slow timer instead of a smooth glide.
- Chart click or drag sets the playhead. Space toggles play. Arrow keys move one hour. Shift+arrows move one day. Clamp to the window.
- #step-back and #step-fwd move the landing epoch by one day and reset the playhead to the new start. #now-btn sets the landing epoch to the current UTC hour.
- #readout is the playhead, not the landing form. Include T+ from landing, Sun alt and az, Earth alt and az, limb clearance (earthAlt + earthRadius − mask), power at this instant, and the next sunset or sunrise and link-down or link-up. If none fall inside the mission, say “none in this mission.” Also show subEarthLat and subEarthLon and call that Earth’s wobble (libration) in one clause.
- #metrics is four cards for the primary: sunlight percent and longest night, DTE percent and longest gap, joint percent and hours, energy and mean power. #compare is a table when two or three sites are selected, same metrics per site.
- #insights is a short reading in plain sentences. Negative subsolar latitude: south-pole sunlight season. Positive: south-pole shadowed season. Near zero: transitional. If the primary is south of −80 and the chosen array is vertical, also run sampleMission once with tiltDeg 0 and quote both energies. If the user picked horizontal, quote the vertical energy instead. With two sites, state the difference in sunlit hours and DTE hours. When two selected sites are both south of −80 and within about 5° of each other, say what that short move did to sunlight hours and DTE hours. Mention heat only as a consequence of solar elevation: a grazing Sun means low power and a long cold shadow. Do not invent temperatures. One sentence must be plain enough for a student and say why this polar site is unlike Apollo.
- #panel-hint: when Sun elevation at the playhead is between 0.5° and 20°, show the ratio cos(alt)/sin(alt) as how many times a tracking vertical array beats a flat one at that instant, before efficiency.
- #scan fills #windows for the primary site. This date scan is required. It is how a slipped launch gets a new window. Clicking a result sets the landing epoch to that start and recomputes. Disable the button while it runs. A year-long mission still calls scanWindows. The label can say the windows overlap.
- #csv downloads the primary samples: time_utc, sun_alt_deg, sun_az_deg, earth_alt_deg, earth_az_deg, sun_frac, earth_disk, dte, joint, irradiance_w_m2, power_w_m2.
- URL hash round-trips sites, landing time, duration hours, mask, panel mode, tilt, tracking, azimuth, efficiency. ReplaceState, do not push a new history entry on every scrub. Apply the hash on load.
- #season shows subsolar latitude from the playhead evaluation and one season phrase. A grazing elevation is the thermal proxy. Do not print a temperature.
- #map-mode is passed through as model.mapMode.

Copy: UTC labeled on the inputs. Status words from the site records can show as small tags. Do not call the tool flight-certified. Do not claim a LOLA horizon. The footer already explains the sphere, Horizons, and the mask. Keep that explanation accurate if you touch it.

styles.css is the visual system (warm near-black, sun gold, earth blue, Outfit and IBM Plex Mono). You may add rules for states you introduce. Do not restyle the page into a different product.

README.md: what the tool does, how to open index.html, the Horizons agreement (worst error 0.007° on the cases in test/validate.mjs), the power and DTE definitions, the site-coordinate caveat (Artemis points are representative CLS locations from Wueller et al. 2026, not NASA pins), and the terrain limit. No slogans.

Acceptance you must actually run:
1. node test/validate.mjs still passes. You did not change the engine, so this should be unchanged. If it fails, stop and report it. Do not edit ephemeris.js to force it green.
2. Open the app, select Mons Mouton, landing 2026-11-14 00:00 UTC, one lunar day, vertical 30% cells, mask 0. Sunlight should land near 60%, energy near 177 kWh/m², mean power near 250 W/m². If you are far from that, the panel wiring is wrong.
3. Compare with Slater Plain. Slater’s Earth/DTE fraction should be near zero on that date while Mons Mouton is not. That is the far-side lesson.
4. Switch the primary to Apollo 11 over the same window. The horizon scale is owned by viz.js. You should see a high Sun arc in the numbers: sunMax well above 40°.
5. Keyboard, hash reload, CSV header, and the scan click all work.

If viz.js is not on main yet, still finish app.js against the API, push it, and say the canvases could not be checked. Check the numbers with a small node script that requires ./ephemeris.js. Those numbers do not depend on viz. Pull once more before the final test so a viz.js that landed during your work is the one the page loads.

Done means a person can clone https://github.com/aboba485/moon_horrizon, open index.html, compare a near-side polar site with Slater Plain, scrub a lunar day, read power and link time, and reload the same scenario from the URL. Your commits are on origin/main. Paste the SHA and the GitHub link.
```
