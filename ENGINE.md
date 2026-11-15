Sessions 2 and 3 may rely on the public field lists below; existing names and meanings are preserved.

# Lunar Horizon engine

Classic scripts, no build step. Load `vendor/astronomy.browser.js`, `sites.js`, then `ephemeris.js`. The engine is `window.LunarEph` in a browser and `module.exports` under Node. The vendored browser library also supports Node; `vendor/astronomy.js` is an unused CommonJS duplicate. Neither library is modified.

## Coordinates, time, geometry

Libration is already included through the IAU lunar pole/orientation series and the changing Earth–Moon geometry; `subEarthLat` and `subEarthLon` expose Earth's wobble in the lunar sky. Distances vary with the computed ephemeris, affecting angular radii and solar irradiance. At the south pole the Sun grazes the horizon, unlike Apollo sites where it climbs high and gives roughly two weeks of daylight followed by night.

Pass a UTC `Date`, epoch milliseconds, or an ISO timestamp with an explicit UTC offset. Returned `t` and event times are Unix milliseconds. Durations and steps are milliseconds. All angles are degrees, latitude south-negative, longitude east-positive in the Mean Earth frame. Azimuth is clockwise from north: N 0°, E 90°, S 180°, W 270°. At the exact pole, longitude sets the azimuth reference.

The Moon is a 1737.4 km sphere. Geometric EQJ vectors from Astronomy Engine are rotated with the passive IAU/SPICE matrix `R3(W) · R1(90−δ) · R3(90+α)`. Astronomy Engine pole right ascension is hours and is multiplied by 15. Sun and Earth directions are topocentric: the surface observer is subtracted before computing azimuth/elevation. Earth surface parallax is about 0.26°. No atmospheric refraction is applied. Sun radius is 695700 km and Earth radius is 6378.137 km; angular radius uses topocentric distance.

## API

- `observe(date)`: body-frame geometry, returning `date`, `R`, `moonEqKm`, `sunBody`, `earthBody`, `sunDistKm`, `earthDistKm`, `sunRadiusDeg`, `earthRadiusDeg`, `subSolar {lat,lon}`, `subEarth {lat,lon}`, and `irradiance`. Vectors and distances are km; irradiance is W/m².
- `siteView(sky, lat, lon)`: uses an existing observation; returns `sun {alt,az}`, `earth {alt,az}`, `sunDistKm`, `earthDistKm`, `sunRadiusDeg`, `earthRadiusDeg`, and `stations`.
- `atSite(date, lat, lon)`: the same site view plus `sky`.
- `evaluate(date, lat, lon, maskDeg, panel)`: instant geometry, visibility, and power; fields listed below. Mask defaults to zero.
- `incidence(sunAltDeg, sunAzDeg, panel)`: clamped cosine of panel incidence (0–1).
- `sampleMission(start, durationMs, lat, lon, {stepMs, maskDeg, panel})`: ascending array of evaluate results with `sky` and `view` removed; `stations` remains. Includes both start and exact end (to Date's millisecond precision), shortening the final interval when needed. A zero duration returns one point. Invalid start/duration or a negative step throws `RangeError`; a missing or zero step uses the automatic step.
- `stepMsFor(durationMs)`: 10 minutes through 48 hours, 30 minutes through 45 days, 2 hours through 200 days, otherwise 6 hours.
- `summarize(samples)`: fields listed below; empty input returns `null`.
- `eventsFromSamples(samples, fromMs, maskDeg = 0)`: event fields listed below. No ephemeris calls.
- `nextCrossing(start, lat, lon, maskDeg, which, wantRise)`: legacy search with 30-minute brackets and bisection, up to 400 days, returning `Date` or `null`. Existing implementation uses center altitude for `"sun"` and `"earth"`; `"dte"` currently falls through to Sun. Use `eventsFromSamples` for limb and link readouts. This legacy behavior is preserved in this change.
- `scanWindows(lat, lon, missionMs, from, {maskDeg, panel, horizonDays})`: returns up to six rows, highest score first. Default search horizon is 370 days. Data grid is 6 hours; candidate starts are spaced one day apart. Mission length is rounded to grid steps (minimum one), so this is a coarse screen. Rows: `start` (epoch ms), `sunFrac`, `dteFrac`, `jointFrac`, `energyWh`, `longestNightH`, `longestBlackoutH`, `score`. Fractions are 0–1; energy is Wh/m²; longest runs are hours. Score is `100·jointFrac − 0.15·nightSteps − 0.05·blackoutSteps`. Windows may overlap, including for year-long missions.
- Constants: `MOON_RADIUS_KM`, `DSN` (station records below).

### Instant fields

`evaluate` returns `t`, `sky`, `view`, `sunAlt`, `sunAz`, `earthAlt`, `earthAz`, `sunRadius`, `earthRadius`, `sunFrac`, `lit`, `earthCenter`, `earthDisk`, `earthUp`, `stationAlt`, `stationUp`, `dte`, `joint`, `irradiance`, `cosI`, `power`, `subSolarLat`, `subEarthLat`, `subEarthLon`, and `stations [{id,name,alt,az}]`.

`sunRadius` and `earthRadius` are angular radii, not diameters. `stationAlt` is the altitude of the station with the greatest clearance above the skyline on its own bearing; `maskLink` is that skyline angle. `horizonSunFrac` is a linear approximation to the solar-disk fraction above the skyline (0–1). `sunFrac = horizonSunFrac · (1 − eclipseObscuration)` also accounts for geometric occultation by Earth. `lit` means `sunFrac > 0`. Horizon and eclipse fractions are multiplied, an approximation when both masks cut the disk simultaneously. `earthCenter` means the center is above the mask; `earthDisk` and `earthUp` mean any Earth limb clears it. `stationUp` and `dte` mean at least one station has altitude strictly above the mask. `joint` means `lit && dte`. At equality the corresponding visibility is false.

### Summary fields

`spanMs`, `sunlitHours`, `sunlitFrac`, `earthHours`, `earthFrac`, `dteHours`, `dteFrac`, `jointHours`, `jointFrac`, `longestNight`, `longestDay`, `longestBlackout`, `longestLink`, `sunMin`, `sunMax`, `earthMin`, `earthMax`, `energyWh`, `meanPower`.

Power, illumination, and joint availability include eclipses. Each longest run is `{ms, start}` with epoch-ms start, or `{ms:0, start:null}` if no nonzero interval qualifies. Earth hours/fraction use disk visibility. Energy uses trapezoidal integration of power and is Wh/m²; mean power is W/m² over the whole span, including night. Boolean fractions use half an interval at a transition. Longest runs use left-endpoint state. These statistics are sample-resolution estimates, not exact event integrations.

### Sample events

Returns `{sunset, sunrise, earthset, earthrise, linkDown, linkUp}`. Each value is `null` or `{t, kind}`, with `kind` equal to its field name. Input samples must have finite geometry fields and strictly increasing finite timestamps.

Clearances are `sunAlt + sunRadius − maskDeg`, `earthAlt + earthRadius − maskDeg`, and `stationAlt − maskDeg`. The helper linearly interpolates clearance at the playhead. For a positive clearance it returns only the next downward crossing; at or below zero it returns only the next upward crossing. The opposite field stays null, even if that event occurs later. Crossing times are linearly interpolated between adjacent samples, strictly after `fromMs`, within the supplied window. Empty/singleton arrays, an out-of-range playhead, and missing future crossings yield nulls. A non-finite playhead also yields nulls.

Crossings hidden between two same-sign samples cannot be recovered. Coarse station samples can miss a short outage or station handoff. The helper interpolates the supplied maximum station altitude, without computing individual station trajectories.

## Power

Panel: `{tiltDeg, tracking, azimuthDeg, efficiency}`. Default is `{tiltDeg:90, tracking:true, efficiency:0.3}`. Tilt is from horizontal: 0° flat, 90° vertical. Efficiency is a fraction, not a percentage. Tracking follows solar azimuth; otherwise azimuth is fixed (default north).

```
irradiance = 1361 · (KM_PER_AU / moonSunDistanceKm)²
cosI = clamp(sin(alt)cos(tilt) + cos(alt)sin(tilt)cos(panelAz − sunAz), 0, 1)
horizonSunFrac = clamp((sunAlt − maskAt(sunAz) + sunRadius) / (2·sunRadius), 0, 1)
sunFrac = horizonSunFrac · (1 − eclipseObscuration)
power = irradiance · cosI · efficiency · horizonSunFrac · max(1e-6, 1 − eclipseObscuration)
```

Trigonometric arguments are radians internally. Irradiance and electrical power are W/m² of cells. No dust, temperature derating, mutual/structural shadow, or atmospheric effects. The disk fraction is a linear approximation, not circular-segment integration. A tracking vertical array collects approximately `cos(alt)` versus `sin(alt)` for a flat array at positive low elevation.

## DSN and terrain limits

| Complex | Latitude | East longitude |
| --- | ---: | ---: |
| Goldstone | 35.2471 | −116.7933 |
| Madrid | 40.4272 | −4.2508 |
| Canberra | −35.3985 | 148.9819 |

These are complex-level points, not individual dishes. Station geometry rotates an Earth surface point through sidereal time and the equator-of-date to EQJ rotation into the lunar frame. DTE is geometric line of sight under the lunar mask, not a station schedule, link budget, or antenna-availability guarantee.

The sky geometry still uses a spherical Moon. `terrain.js` supplies offline LOLA skyline profiles for 17 catalogue sites south of 79°S: 120 m DEM pixels, 360 azimuth bins, rays to 100 km. Pass `{profile, offsetDeg}` as `maskDeg` to evaluate against that skyline; a number retains the uniform-mask model. Each station uses its own bearing. Profiles do not supply local slope self-shadowing, scattered light, thermal behaviour, or a landing hazard map. Custom coordinates and sites outside the catalogue profiles retain the uniform-mask fallback. Results are for comparison, not flight certification.

## Sites

`sites.js` exposes `window.LUNAR_SITES` and `window.LUNAR_GROUPS`. Site fields are `id`, `name`, `short`, `group`, `program`, `status`, `lat`, `lon`, `note`. Status is candidate, landed, attempted, or reference. Groups have `id` and `label`: artemis, south, clps, apollo, world.

Artemis coordinates are representative CLS points attributed in `SESSIONS.md` to Wueller et al. (2026), not NASA-selected touchdown pins. No coordinates were changed or invented. Faustini Rim A and Connecting Ridge Extension remain intentionally absent.

## Horizons reference cases

Reference values recorded in `SESSIONS.md`, rounded to 0.001°. Test queries use `CENTER=coord@301`, geodetic east longitude/latitude at zero height, airless apparent azimuth/elevation (quantity 4). Acceptance tolerance remains 0.15° for either angle.

| Case | UTC | Model az/el (°) | Horizons az/el (°) |
| --- | --- | --- | --- |
| Mons Mouton Sun | 2026-11-14 00:00 | 94.880 / +1.170 | 94.875 / +1.171 |
| Mons Mouton Earth | 2026-11-14 00:00 | 327.029 / −0.805 | 327.030 / −0.805 |
| South pole Sun (−89.9°, 0°) | 2026-06-21 00:00 | 108.386 / −1.401 | 108.384 / −1.400 |
| South pole Earth | 2026-06-21 00:00 | 7.504 / −2.076 | 7.507 / −2.076 |
| Apollo 11 Earth | 2026-11-14 00:00 | 279.017 / +64.944 | 279.018 / +64.944 |
| Apollo 11 Sun | 2026-11-14 00:00 | 91.441 / −13.163 | 91.442 / −13.158 |
| Slater Plain Earth | 2026-11-14 00:00 | 234.435 / −6.118 | 234.436 / −6.118 |
| Far side Earth (0°, 180°) | 2026-11-14 00:00 | 15.550 / −85.448 | 15.544 / −85.448 |

Mons Mouton is −85.416°, 31.851°; Apollo 11 is 0.67408°, 23.47297°; Slater is −87.478°, 124.521°. The recorded worst discrepancy is 0.007° on these cases, not a global accuracy guarantee.

## Checks

Run from the repository root with Node; no packages or build step are needed. `test/events.test.mjs` is offline. `test/validate.mjs` requires access to NASA JPL Horizons.

The prompt's sanity range “energyWh between 120 and 230” is interpreted as 120–230 kWh/m², i.e. 120000–230000 Wh/m², consistent with the public API and the stated ~177 kWh/m² target.

`node test/events.test.mjs` (2026-11-14):

```text
ok events: limb and link interpolation, playhead state, already-down wrap, mask, boundaries, no crossing
ok Mons Mouton: sunlight 62.12%, Earth disk 75.38%, energy 177.529 kWh/m², mean 250.488 W/m², Sun max 6.120°
ok mission endpoint: exact 2551442889 ms; flat array 11.868 kWh/m²
```

`node test/validate.mjs` (2026-11-14, live NASA response; exit 0):

```text
ok  Mons Mouton Sun        model az 94.880 el 1.170   horizons az 94.875 el 1.171   dAz 0.004 dEl 0.001
ok  Mons Mouton Earth      model az 327.029 el -0.805   horizons az 327.030 el -0.805   dAz 0.000 dEl 0.000
ok  South pole Sun         model az 108.386 el -1.401   horizons az 108.384 el -1.400   dAz 0.001 dEl 0.001
ok  South pole Earth       model az 7.504 el -2.076   horizons az 7.507 el -2.076   dAz 0.003 dEl 0.000
ok  Apollo 11 Earth        model az 279.017 el 64.944   horizons az 279.018 el 64.944   dAz 0.001 dEl 0.000
ok  Apollo 11 Sun          model az 91.441 el -13.163   horizons az 91.442 el -13.158   dAz 0.001 dEl 0.004
ok  Slater Plain Earth     model az 234.435 el -6.118   horizons az 234.436 el -6.118   dAz 0.000 dEl 0.000
ok  Far side Earth         model az 15.550 el -85.448   horizons az 15.544 el -85.448   dAz 0.007 dEl 0.000
subsolar latitude peak over 2026 sample: 1.587 deg
worst angular error: 0.007 deg
```

## Round 2 operational APIs

All functions are synchronous, offline browser/Node functions. Existing exports and rotation math are preserved. New fields are additive except that `sunFrac`, `lit`, `joint`, and `power` now include Earth occultation; use `horizonSunFrac` for the previous horizon-only fraction.

### Refined rise/set events

`horizonEvents(start, durationMs, lat, lon, {maskDeg, body})` returns chronological `{kind:"rise"|"set", t, azDeg, altDeg, refined:true}` objects. Body defaults to `"sun"`; `"earth"` is also supported. Clearance is upper limb elevation minus the skyline at that body's current bearing. Rise is the first limb appearing, set the last limb disappearing. These are horizon events, not eclipse contacts. The function coarse-scans at `stepMsFor(durationMs)`, then bisects each sign-change bracket to 500 ms or less and reports the actual azimuth/elevation at the rounded epoch. Events strictly after the start and through the end are returned; no crossing gives `[]`. Short excursions entirely between same-sign coarse samples can be missed, especially across narrow terrain peaks. Sub-second refinement is timing precision conditional on the geometric/terrain model, not a sub-second physical accuracy claim.

`nextEvent(fromMs, lat, lon, {maskDeg, body})` returns `{kind,t,azDeg,msUntil}` for the first such crossing, searching 400 days, or null. Null means no crossing found within that finite search, not a proof of perpetual visibility for arbitrary terrain. It is appropriate for far-side Earth that never rises. Callers should cache results while counting down rather than rerunning a seasonal search on every animation frame.

The older `eventsFromSamples` remains available, uses per-sample `maskSun`, `maskEarth`, `maskLink`, and is an inexpensive interpolation for UI scrubbing. `nextCrossing` remains the legacy center-altitude API; the new limb-aware APIs are preferred.

### Inverse solve

`solveFor(start, durationMs, lat, lon, {body,azDeg,altDeg,toleranceDeg,maskDeg})` returns chronological `{t,azDeg,altDeg,exact,separationDeg,aboveHorizon}` results. Either target axis may be null; both null returns `[]`. Default tolerance is 0.01°. Azimuth wraps through north correctly. Elevation must be within −90..90°. A single axis is solved for all bracketed roots (plus tangent minima), with sub-second refinement. If unattainable, its closest sampled/refined approach is returned with `exact:false`. For two constrained axes, local minima of spherical angular separation are refined and reported, including one-sided boundary minima. `exact` requires every specified coordinate to be within tolerance. With one axis, `separationDeg` is absolute coordinate error; with both, it is spherical angular separation. Mask controls only the `aboveHorizon` annotation: a requested direction below the skyline is still a valid geometric inverse solution. Azimuth at the zenith is ill-conditioned. As with events, the scan can miss structure narrower than its cadence.

### Site-specific eclipses

`eclipseAt(date,lat,lon)` returns `{sepDeg,earthRadiusDeg,sunRadiusDeg,obscuration,kind}`. Separation is calculated from the topocentric Sun/Earth directions using atan2(cross-product magnitude, dot product), stable at conjunction. Obscuration is circle–circle overlap area divided by solar disk area, clamped to 0..1, using the actual varying angular radii. No overlap is `none`, any partial disk overlap is `partial`, full coverage is `total`. `penumbral` is reserved in the shared contract: an Earth-observed penumbral lunar eclipse does not map to a unique site-wide class. The local function reports solid-disk overlap only, not atmospheric dimming. It does not filter events by local horizon; an occultation can happen below the ground, where panel power is already zero.

`findEclipses(start,durationMs,lat,lon)` uses Astronomy Engine's `SearchLunarEclipse` / `NextLunarEclipse` only to locate candidate lunations. It then finds site-specific closest approach and bisects solid-disk contact times to <=500 ms. Returns `{startMs,peakMs,endMs,maxObscuration,kind}` for every local occultation overlapping the window; contact times are the full physical event and can extend outside the requested window. Peak is the minimum external-disk clearance, avoiding an arbitrary point on a flat totality plateau. Global total/partial/penumbral classification is never substituted for local obscuration: the same global partial lunar eclipse can be total at one site and partial or absent at another.

`evaluate` also returns `eclipse`, `eclipseObscuration`, `eclipseKind`, `horizonSunFrac`, `powerWithoutEclipse`. `irradiance` remains the unobstructed distance-scaled solar irradiance, even at totality. `sunFrac` is zero at geometric totality. Panel power retains the exported **`ECLIPSE_POWER_FLOOR = 1e-6`** of uneclipsed horizon-limited power: a numerical residual only, not a claimed estimate or lower bound for sunlight transmitted by Earth's atmosphere. Do not design an energy reserve from this floor. Real totality illumination is nonzero, red and variable, because Earth's atmosphere refracts/scatters light; no radiative-transfer model is supplied. Earth's geometric radius is **6378.137 km** with no atmospheric enlargement. The real effective umbra is often described as roughly 2% larger; this model intentionally does not silently apply that empirical correction. Solid-Earth contacts and energy loss are model estimates.

`sampleMission` retains the requested regular cadence and additionally includes eclipse contacts, peak, and 5-minute samples inside each overlapping eclipse. This prevents long-mission 6-hour steps from omitting an eclipse entirely. Energy uses those nonuniform samples. `scanWindows` remains a coarse 6-hour screen and can miss an eclipse or brief outage; it must not be used for battery sizing. Eclipse energy lost can be integrated as `powerWithoutEclipse − power`.

### Round 2 checks

`node test/round2.test.mjs` (2026-11-15):

```text
ok horizon events: real LOLA bearings, sub-second brackets, polar day/night, far-side Earth, countdown
ok inverse: both elevation roots, azimuth wrap, two-axis solve, unattainable target, Earth
ok eclipses: four site fixtures, circle-overlap area, vendor global sequence, contacts, energy loss on coarse missions
```

Both original gate tests are rerun unchanged; their 2026-11-14 angular fixtures and Mons Mouton November energy remain unchanged. March 3 at 11:33:40 UTC, Mons Mouton now reports separation 0.617635°, Earth radius 0.955481°, Sun radius 0.268095°, obscuration 1 and residual power ~0.000412 W/m², versus the former ~412.4 W/m². At August 28 04:12:49 UTC the same site has separation 0.219900° and total local coverage even though the Earth-centric lunar eclipse is partial (vendor obscuration ~0.966). Four topocentric fixtures and an independent numerical area integration test the overlap model.

### Named surface features and skyline witnesses

Load **`features.js` as a classic script before `app.js`** (Session C owns the script tag). It sets `window.LUNAR_FEATURES = {meta,features,skylines}` and supports CommonJS for tests. The engine resolves the global lazily; in a browser without the feature script, `featureAtAzimuth` returns null. No `fetch`, modules, or raw DEM are needed in the browser.

The official [IAU/USGS Gazetteer GIS download](https://planetarynames.wr.usgs.gov/GIS_Downloads) supplies the [Moon KMZ](https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MOON_nomenclature_center_pts.kmz). The source describes planetocentric latitude, east-positive longitude and the LOLA 2011 lunar control network. `meta.source`, `download`, and `sourceSha256` record provenance. Filter: adopted IAU features with diameter >=150 km anywhere, plus **all** adopted features south of 75°S, including satellite craters. The result is 290 `{name,kind,lat,lon,diamKm,id}` records; coordinates are copied from the source, longitude normalized to −180..180. The feature centre of Mons Mouton is deliberately different from the mission's representative landing coordinate. Gazetteer diameter is a footprint approximation, not a terrain height or a mapped geological boundary.

Reproduce offline artifacts from the repository root:

```sh
python3 tools/fetch-features.py       # download official KMZ to ignored data/nomenclature/
sh tools/fetch-lola.sh               # download the 120 m polar DEM to ignored data/lola/
node tools/build-features.mjs        # writes only features.js, never terrain.js
```

`python3 tools/fetch-features.py --input /path/to/MOON_nomenclature_center_pts.kmz` reuses an existing source archive. No external Python or Node packages are required. Downloads and intermediate JSON stay in ignored `data/`; only the classic-script artifact is committed. The generated artifact is **61,934 bytes**, below the hard 100 kB size guard.

`tools/lola-horizon.mjs` now exports `profileFor` and records the actual DEM maximum's location on every ray. It retains the original 3 subrays per 1° bin, 60/120/300 m radial steps, 100 km reach, projection and skyline formula. Importing it no longer regenerates terrain.js; invoking it directly retains its original behaviour. The feature builder uses those same witnesses and selects the nearest Gazetteer centre only when it lies within **min(30 km, diameter/2 + 2 km)** of that DEM maximum. Otherwise it leaves the direction unnamed. An assumed datum-sphere floor has no physical terrain witness and is also unnamed. This is approximate **nearest named feature at the skyline maximum**, not a survey proving which named geological boundary made a ridge. Small named features near an unnamed ridge can still produce ambiguous labels; inspect the source data for operational use.

`featureAtAzimuth(lat,lon,azDeg,{maskDeg})` returns `{name,distanceKm,elevationDeg}` or null. `distanceKm` is from the observer to the terrain point that set the skyline, **not** the distance to the feature centre. `elevationDeg` is the measured witness elevation, with the user's numeric offset or `maskDeg.offsetDeg` added. Invoke it when displaying the real skyline; a uniform-mask-only view has no named obstruction and should omit terrain labels. Attribution uses the nearest 1° provenance bin, which retains the winning subray, rather than interpolating names. Azimuth wraps through 0/360. Runtime lookup requires the exact catalogue coordinates (within 1e-6 degrees); it never assigns a nearby catalogue site's terrain to custom coordinates. Features outside the mapped site skylines, unnamed directions, missing data, or non-finite coordinates return null.

`skylines` is an additional internal compact index: each site has `{id,lat,lon,bins}`; `bins` contains 360 semicolon-delimited rows, with nonempty rows holding base-36 feature index, observer distance in decikilometres, and elevation in centidegrees. Consumers should use `featureAtAzimuth`, not decode this implementation detail. The public `features` array remains ordinary records for labels.

`node test/features.test.mjs` (2026-11-15):

```text
ok features: 290 IAU features, 17 LOLA skylines, 3512 named / 2608 unnamed bearings, <100 kB, classic-script globals
```

The test executes vendor + feature + engine scripts in a browser-like context without CommonJS or network, checks published records and coordinate bounds, all 6,120 provenance bins, unknown/custom sites, unnamed bearings, azimuth wrapping and offset handling. It does not assert that a name proximity heuristic is a geological boundary. Raw DEM input is not needed to run these tests.
