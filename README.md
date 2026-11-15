# Lunar Horizon

A landing-site navigator for the Moon, built for the NASA Space Apps Challenge 2026 challenge *Lunar Landing Site Navigator*.

Pick a site and a landing date. The tool shows where the Sun and Earth sit relative to the local horizon through a whole mission, and turns that geometry into the two numbers a planner actually trades: how much solar energy the site gives, and how much of the time a direct radio path to Earth exists. Up to three sites can be compared on one landing epoch, one mission length, and one horizon mask, so the only difference between them is the place and the date.

The south pole is the interesting case. The Moon's spin axis is about 1.54° from the ecliptic pole, so the subsolar latitude stays inside roughly ±1.6°. At a polar site the Sun circles the horizon once per lunar day and never climbs high, and Earth is nearly fixed in the sky, wobbling by the libration of about ±8°. A degree of elevation is the whole mission there, which is why the readout quotes tenths of a degree and the horizon is taken from a real LOLA elevation model rather than assumed flat.

## The short version

**Who it is for.** Anyone choosing where a lander sits down: Artemis and CLPS mission planners, instrument teams sizing a battery, and students who want to see why a flat-map answer and a real-terrain answer are not the same number.

**What it does that a map cannot.** Shackleton crater is 100% sunlit on a smooth sphere and 48% sunlit against its own rim. That gap is 159 kWh/m² over a lunar day. Size a battery off the first number and the lander dies. The tool exists to make the second number as easy to get as the first.

**Why you can believe it.** Every angle is checked against JPL Horizons; worst disagreement over eight cases spanning the pole, Mons Mouton, Apollo 11 and the far side is **0.007°**, against a 0.15° tolerance. The check is not a claim in this file — it is a table inside the app, under *Where the data comes from, and how it was checked*, and `node test/validate.mjs` re-runs it live against the Horizons API.

**What NASA data it runs on.** LRO LOLA `LDEM_75S_120M` at 120 m per pixel supplies every horizon profile; JPL Horizons is the reference the engine is validated against; the IAU WGCCRE lunar orientation turns a sky vector into a direction on the ground; and the site catalogue is published landing coordinates, with the Artemis entries labelled as representative points inside candidate regions rather than touchdown pins. Remove the LOLA data and the headline numbers are wrong by tens of percent — it is load-bearing, not decoration.

**How to see all of that in ninety seconds.** Three buttons at the top of the stage, each of which sets the site, date, and mission length and then explains the result in numbers read live from the engine. See [`DEMO.md`](DEMO.md) for the timed walkthrough.

## Running it

No build step, no bundler, no package install. Open `index.html` in a browser, including over `file://`.

```
git clone https://github.com/aboba485/moon_horrizon.git
cd moon_horrizon
open index.html        # or double-click it
```

Scripts load in order: `vendor/astronomy.browser.js`, `sites.js`, `ephemeris.js`, `viz.js`, `globe.js`, `terrain.js`, `validation.js`, `app.js`.

- `ephemeris.js` is the sky math (`window.LunarEph`).
- `sites.js` is the site catalogue (`window.LUNAR_SITES`, `window.LUNAR_GROUPS`).
- `viz.js` draws the horizon, the chart, and the map (`window.LunarViz`).
- `globe.js` draws the rotatable Moon and handles picking (`window.LunarGlobe`).
- `terrain.js` is the measured LOLA horizon profiles (`window.LUNAR_TERRAIN`), generated offline by `tools/`.
- `validation.js` is a recorded run of `test/validate.mjs` (`window.LUNAR_VALIDATION`), so the agreement with Horizons is shown in the interface instead of only claimed in this file. Nothing in it is computed by the page.
- `app.js` is the shell: state, controls, metrics, and the text.

`terrain.js` and `validation.js` are scripts rather than JSON files on purpose: `fetch()` of a local file is blocked over `file://`, and opening `index.html` by double-clicking it has to keep working.

All times in the interface are UTC and labelled as such. The landing date and time inputs are UTC, not the local zone of the machine.

### Two interfaces, one engine

The header switches between **Simple** and **Expert**. Both run exactly the same computation; the only difference is how much of it is on screen.

**Simple** is the default: a rotatable Moon and one card. Drag to spin it, scroll or `+`/`-` to zoom, arrow keys to steer, and click a marker to read that site. The lighting is not decoration — the terminator is drawn at the subsolar point the ephemeris returns for the playhead, so pressing **Play** shows the real terminator sweep. The blue ring marks the sub-Earth point, which is where Earth sits directly overhead.

Fifteen of the thirty catalogue sites lie within a few degrees of the south pole and would overlap into one unclickable dot at globe scale, so they collapse into a single **South pole** marker. Clicking it flies the camera down to the pole and zooms in, at which point every polar site gets its own marker. Whatever site is currently selected always keeps its own labelled marker, even inside that cluster.

The globe is a hand-drawn orthographic projection on a 2D canvas, not WebGL. That is deliberate: a WebGL texture loaded from a `file://` URL is treated as cross-origin and cannot be uploaded, which would break the double-click-to-open requirement.

**Expert** is the full console: the site list, the horizon strip, the mission chart, the comparison table, the horizon and array controls, the date scan, and the CSV export. Nothing is removed in Simple mode, only hidden, and the mode is carried in the URL hash as `ui=simple` or `ui=expert`.

### The four findings

Above the view are four buttons. Each one sets the site, landing epoch, mission length, and mask to a scenario, flies the globe to it, and writes a short reading underneath. Every figure in that reading is pulled from the model that was just computed, not from a stored string, so the text cannot drift away from the engine.

- **The rim that eats the Sun** — Shackleton, computed twice. The smooth-sphere counterfactual is calculated on the spot at mask 0, so the 100% versus 48% comparison is two live runs of the same engine with and without the LOLA profile.
- **A whole lunar day of sunlight** — Mons Mouton holds the Sun for the entire window, and the reading names the date and bearing where the solar limb comes closest to the skyline. The tool will not print 100% without that margin.
- **Where Earth never rises** — Chang'e 4, where Earth's altitude never rises above −38°, against Slater Plain, where libration lifts Earth over the horizon for about a third of the month despite being past the mean-Earth hemisphere.
- **The one outage you can predict** — the 2026-08-28 eclipse at Mons Mouton. Seen from Earth that is a lunar eclipse; seen from the ground on the Moon it is a *solar* eclipse, and for a solar-powered lander it is the single scheduled total power loss of the mission.

The active finding rides the URL hash as `st=rim`, `st=margin`, `st=silence`, or `st=eclipse`, so each one is a shareable link. Picking any site by hand clears it.

### Events, inverse positions, and eclipses

**When the next thing happens, and on what bearing.** The readout's *Next* rows give a countdown to the next sunrise or sunset and to the next loss or return of the direct link, each with the **azimuth** the body will be at when it crosses. A bearing is operational information — it is where the array has to be pointing and where the ridge that matters is. Azimuth is interpolated along the shortest arc across the 0°/360° seam, so a crossing due north reports north rather than south. When there is no crossing inside the window the row says so in a sentence: *"Sunset: never — the Sun stays up for the whole window."* At a polar site that is not a missing answer, it is the answer.

**Find a Sun position.** The inverse question. Give an elevation, an azimuth, or both, and the tool lists every time inside the mission that matches, with the bearing and the time after landing; clicking a result moves the playhead there. With one axis constrained the crossing is found by interpolating a sign change, so the time is exact. With both constrained it reports closest approach instead, with the miss distance, because two constraints rarely have an exact root. Nothing matching is printed as a sentence rather than an empty list.

**Eclipses.** From the surface of the Moon, a lunar eclipse is a solar eclipse: Earth passes in front of the Sun. The tool computes the angular separation between the two bodies and the circle–circle overlap of their disks for every sample, so obscuration is an area fraction and not a yes/no. **Next eclipse** jumps the playhead to the peak; it is disabled, with the reason in its tooltip, when there is no eclipse at this site inside the window, which is the usual case — eclipses come roughly twice a year, not twice a lunar day.

An eclipse is also a free end-to-end check on the whole rotation chain. At peak the Sun and Earth must share both an azimuth and an elevation from any site on the Moon, and the tool derives those two directions by entirely separate paths. On 2026-08-28 at Mons Mouton they agree to 0.604°, inside Earth's 0.94° disk radius. No sign error in the lunar orientation survives that.

**If we slip.** A launch delay is the most common change to a plan, so it is a control rather than something to recompute by hand. Pick an offset — a week or two either way, or a full lunar day — and a table under the comparison runs the same site, array, and mask from the shifted epoch, showing sunlight, energy, direct-to-Earth time, and longest night as *before → after* with the delta. Near the pole two weeks can invert the answer, because it moves the Sun to the other side of the same rim.

Below the view, **Where the data comes from, and how it was checked** lists the four NASA and NASA-derived inputs the tool depends on, what each one is load-bearing for, and the full Horizons comparison table with the per-case deltas.

### Controls worth knowing

- Click a site row or the map to make it the only selection. The **pin** button adds it to a comparison of up to three. The first chip is primary; clicking a chip promotes it.
- The landing epoch is the start of the window. The playhead scrubs inside the window and drives the horizon view and the readout; it does not move the landing date.
- Drag or click the chart to move the playhead. Space plays and pauses, arrow keys step one hour, Shift and an arrow steps one day.
- **Scan the next year** ranks start times for the primary site at the current mission length, mask, and array. It is a 6-hour screen, not a flight product; click a result to open that date at full resolution.
- **Next eclipse** moves the playhead to the next time Earth crosses the Sun at the primary site. **If we slip** sets the offset for the comparison table.
- **Find a Sun position**, in the left column, answers the inverse question: when is the Sun at this elevation or bearing. Clicking a result jumps the playhead.
- **Download CSV** exports the primary site's samples: `time_utc, sun_alt_deg, sun_az_deg, earth_alt_deg, earth_az_deg, sun_frac, earth_disk, dte, joint, irradiance_w_m2, power_w_m2`.
- The URL hash carries the scenario (interface mode, sites, landing time, mission hours, mask, array, efficiency, slip offset), so a link reloads the same trade. Custom coordinates are kept in `localStorage` on the machine that entered them.

## Agreement with JPL Horizons

Positions come from Astronomy Engine 2.1.19. Orientation uses the IAU lunar pole and prime meridian in the Mean Earth / polar axis frame. Altitude and azimuth are airless, geometric, and topocentric on a sphere of radius 1737.4 km, with azimuth measured clockwise from north, matching the Horizons convention.

`test/validate.mjs` queries JPL Horizons (`CENTER=coord@301`, quantity 4, airless apparent az/el) and compares eight cases spanning the pole, Mons Mouton, Apollo 11, Slater Plain, and the far side.

```
node test/validate.mjs     # needs network access to Horizons
```

Worst angular error on those cases: **0.007°**. The Moon has no atmosphere, so there is no refraction and no twilight; altitude 0 is the geometric horizon of the sphere.

## What the numbers mean

**Horizon.** Two modes. With the LOLA skyline on, the horizon is a measured elevation angle for every one of 360 azimuths, different in every direction, and the slider raises or lowers that whole profile. With it off, the horizon is a single number in every direction: 0 is the smooth sphere, a positive mask asks "what if the skyline blocks the first few degrees?", a negative mask asks the opposite, as if the site sits on a peak above its surroundings. See [The LOLA skyline](#the-lola-skyline).

**Sunlight.** A site is lit when any part of the solar disk clears the mask. The lit fraction of the disk is interpolated across the disk radius, so a part-risen Sun counts partially.

**Power.** The solar constant of 1361 W/m² at 1 AU, scaled by the Moon–Sun distance, times the cosine of the incidence angle on the chosen array, times cell efficiency, times the lit fraction of the disk:

```
cos i = sin(alt) cos(tilt) + cos(alt) sin(tilt) cos(az_panel − az_sun)
```

Output is electrical watts per square metre of cells. There is no dust, no structural shading, no temperature derate, and no battery. Energy is watt-hours per square metre integrated over the window, and mean power is the average across the whole window with the night included.

Array arrangement matters more than anything else at a polar site. Over one lunar day from 2026-11-14 at Mons Mouton with a 0° mask and 30% cells, a vertical array that tracks the Sun's azimuth collects about 177 kWh/m², while the same cells lying flat collect about 12 kWh/m². A Sun that is 1° above the horizon arrives nearly edge-on to a flat panel.

**Direct to Earth (DTE).** A geometric line of sight from the site to a Deep Space Network complex: Goldstone, Madrid, or Canberra. The station must itself clear the horizon on its own bearing as seen from the site, which is stricter and more correct than asking whether the centre of Earth is up. Station positions are complex-level coordinates, not specific antennas. This is not a schedule, not a link budget, and not a terrain mask.

**Earth disk versus Earth centre.** Earth is about 1.9° across as seen from the Moon, so its upper limb can be above the horizon while its centre is still below. At Mons Mouton on 2026-11-14 00:00 UTC the centre of Earth is at −0.805° and the limb is essentially on the horizon. The readout reports the limb clearance for that reason.

**Joint.** Sunlit and in direct contact at the same time.

One result worth stating plainly, because it is easy to assume otherwise: a polar site on the far side of the mean-Earth hemisphere does not necessarily lose Earth for good. Slater Plain, at −87.478°, 124.521°, has Earth between −8.1° and +4.7° over a lunar day, so a direct path exists for roughly 38% of the window at a 0° mask. Libration does that. A properly far-side site such as the Chang'e 4 landing point never sees Earth at all: 0% of the window, which is why it flew with a relay.

## Site coordinates, and what they are not

Latitudes are degrees with south negative. Longitudes are east-positive in the Mean Earth / polar axis frame.

The Artemis III candidate-region points are **representative published locations inside those regions, taken from the candidate landing site table in Wueller et al., JGR Planets (2026). They are not NASA-selected touchdown points.** A region is tens of kilometres across and the geometry varies across it, so treat the point as a sample of the region, not as the landing site. Two 2022-list regions, Faustini Rim A and Connecting Ridge Extension, are absent because no cited coordinate was in hand; no coordinates were invented to fill the gap.

Landed missions (Apollo, CLPS, Chandrayaan-3, SLIM, the Chang'e series) use reported touchdown coordinates. Custom coordinates can be entered directly for any point on the sphere.

## The LOLA skyline

A single mask angle cannot describe a south-polar site. The horizon there is crater rims and massifs, and it is different in every direction, so `terrain.js` ships a measured horizon profile for each of the 17 catalogue sites south of 79°S.

**Source.** `LDEM_75S_120M` from the LOLA Gridded Data Record (LRO-L-LOLA-4-GDR-V1.0), the south polar DEM covering 75°S to the pole at 120 m per pixel, 7624 × 7624 16-bit samples, heights relative to a reference radius of 1737.4 km, in the same Mean Earth / polar axis frame the ephemeris uses. The raster is 110 MB and is not committed. `tools/fetch-lola.sh` downloads it and `tools/lola-horizon.mjs` reduces it to the 44 kB `terrain.js`.

**Method.** From each site, walk a great circle outward in each of 360 azimuths, sampling the DEM along the way out to 100 km. At every sample the exact spherical elevation angle of that point as seen from the site is

```
el = atan2((R + h)·cos δ − (R + h₀), (R + h)·sin δ)
```

where δ is the angular distance walked, h₀ the site height and h the sampled height. The profile keeps the largest value any sample on that ray reaches, which is the skyline. Where a ray runs off the edge of the product the profile falls back to the horizon of the datum sphere seen from the site's own elevation, `−acos(R / (R + h₀))`. Mons Mouton sits 6443 m up, so its floor is −4.93°; a site at the datum gets 0°.

The walk is done in 3D unit vectors, `p(s) = p₀·cos δ + d·sin δ` with `d = north·cos A + east·sin A`, and the polar stereographic projection back to pixels is `x = 2R·u_y/(1 − u_z)`, so there is no trigonometry in the inner loop.

**Validation.** The projection's sign convention is not documented in the files the archive still serves, so it was determined by scoring all four `(±x, ±y)` combinations against six craters with published coordinates; only one puts all six at the bottom of a depression, and it wins by an order of magnitude. The resulting geometry was then checked against published measurements:

| check | measured here | published |
| --- | --- | --- |
| Shackleton depth, rim to floor | 4026 m | ~4.2 km |
| Shackleton rim radius | 9.7–10.7 km | ~10.5 km |
| Shackleton rim angle from the floor centre | 21.2°, uniform in azimuth | 21.8° |
| Malapert Massif summit above datum | +4758 m | ~5 km |
| Shoemaker / Cabeus / Faustini floors | −3932 / −3286 / −2767 m | all deep PSRs |

A circular rim at the right radius *and* the right elevation angle cannot come out of a wrong projection.

**What it changes.** Shackleton crater goes from 100% sunlit on a smooth sphere to 48% against its own rim, which is the physically obvious answer and the one a smooth sphere cannot give. Slater Plain, a plain, barely moves: 74.5% to 60.4%. Direct-to-Earth generally falls, because Earth sits within a degree or two of the horizon and the skyline is now in the way on most bearings.

And one result worth reading carefully. Mons Mouton holds the Sun for an entire lunar day from 2026-11-14 — but the closest the solar limb comes to the skyline is **0.43°**, on 2026-12-08, with the Sun at −2.9° altitude and the southern skyline fallen to −3.0°. That margin is why the site is an Artemis III candidate, and it is also why "100% sunlight" should never be quoted without it. The tool says so in the reading panel.

## Limits

The skyline is binned at one degree of azimuth, so a knife-edge ridge is smoothed. Rays stop at 100 km, so a mountain beyond that is invisible. Sites north of 79°S have no profile at all and fall back to the uniform mask. There is no self-shadowing of local slopes, no light scattered from nearby terrain, and no thermal model. Dust, link budgets, landing hazards, and traverse planning are all outside the model.

**Known limit, stated because the tool will otherwise state it for you.** The engine's lit fraction models the horizon mask occulting the Sun and *not* Earth occulting the Sun, so across an eclipse the power and sunlight totals are optimistic — at the 2026-08-28 peak at Mons Mouton the engine still reads 100% of the disk while Earth is completely covering it. The eclipse geometry and the obscuration fraction are computed correctly and shown; the energy integral is not yet corrected for them. Both the readout at an eclipsed instant and the eclipse finding say so, and name the number: about 1.5 kWh/m² over that event. Do not take an eclipse-spanning energy total at face value.

Use it to compare sites and dates and to understand why polar geometry is hard. Do not use it as a flight product.
