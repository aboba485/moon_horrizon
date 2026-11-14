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

`sunRadius` and `earthRadius` are angular radii, not diameters. `stationAlt` is the maximum of station altitudes. `sunFrac` is a linear approximation to the visible solar-disk fraction (0–1). `lit` means any solar disk is above the mask. `earthCenter` means the center is above the mask; `earthDisk` and `earthUp` mean any Earth limb clears it. `stationUp` and `dte` mean at least one station has altitude strictly above the mask. `joint` means `lit && dte`. At equality the corresponding visibility is false.

### Summary fields

`spanMs`, `sunlitHours`, `sunlitFrac`, `earthHours`, `earthFrac`, `dteHours`, `dteFrac`, `jointHours`, `jointFrac`, `longestNight`, `longestDay`, `longestBlackout`, `longestLink`, `sunMin`, `sunMax`, `earthMin`, `earthMax`, `energyWh`, `meanPower`.

Each longest run is `{ms, start}` with epoch-ms start, or `{ms:0, start:null}` if no nonzero interval qualifies. Earth hours/fraction use disk visibility. Energy uses trapezoidal integration of power and is Wh/m²; mean power is W/m² over the whole span, including night. Boolean fractions use half an interval at a transition. Longest runs use left-endpoint state. These statistics are sample-resolution estimates, not exact event integrations.

### Sample events

Returns `{sunset, sunrise, earthset, earthrise, linkDown, linkUp}`. Each value is `null` or `{t, kind}`, with `kind` equal to its field name. Input samples must have finite geometry fields and strictly increasing finite timestamps.

Clearances are `sunAlt + sunRadius − maskDeg`, `earthAlt + earthRadius − maskDeg`, and `stationAlt − maskDeg`. The helper linearly interpolates clearance at the playhead. For a positive clearance it returns only the next downward crossing; at or below zero it returns only the next upward crossing. The opposite field stays null, even if that event occurs later. Crossing times are linearly interpolated between adjacent samples, strictly after `fromMs`, within the supplied window. Empty/singleton arrays, an out-of-range playhead, and missing future crossings yield nulls. A non-finite playhead also yields nulls.

Crossings hidden between two same-sign samples cannot be recovered. Coarse station samples can miss a short outage or station handoff. The helper interpolates the supplied maximum station altitude, without computing individual station trajectories.

## Power

Panel: `{tiltDeg, tracking, azimuthDeg, efficiency}`. Default is `{tiltDeg:90, tracking:true, efficiency:0.3}`. Tilt is from horizontal: 0° flat, 90° vertical. Efficiency is a fraction, not a percentage. Tracking follows solar azimuth; otherwise azimuth is fixed (default north).

```
irradiance = 1361 · (KM_PER_AU / moonSunDistanceKm)²
cosI = clamp(sin(alt)cos(tilt) + cos(alt)sin(tilt)cos(panelAz − sunAz), 0, 1)
sunFrac = clamp((sunAlt − mask + sunRadius) / (2·sunRadius), 0, 1)
power = irradiance · cosI · efficiency · sunFrac
```

Trigonometric arguments are radians internally. Irradiance and electrical power are W/m² of cells. No dust, temperature derating, mutual/structural shadow, or atmospheric effects. The disk fraction is a linear approximation, not circular-segment integration. A tracking vertical array collects approximately `cos(alt)` versus `sin(alt)` for a flat array at positive low elevation.

## DSN and terrain limits

| Complex | Latitude | East longitude |
| --- | ---: | ---: |
| Goldstone | 35.2471 | −116.7933 |
| Madrid | 40.4272 | −4.2508 |
| Canberra | −35.3985 | 148.9819 |

These are complex-level points, not individual dishes. Station geometry rotates an Earth surface point through sidereal time and the equator-of-date to EQJ rotation into the lunar frame. DTE is geometric line of sight under the lunar mask, not a station schedule, link budget, or antenna-availability guarantee.

There is no LOLA DEM, terrain skyline, or actual peak/crater shadow model. The shared uniform angular mask is a user scenario. A spherical crater-floor prediction can disagree with actual terrain by many degrees. Results are for comparison, not flight certification.

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
