# Lunar Horizon

A landing-site navigator for the Moon, built for the NASA Space Apps Challenge 2026 challenge *Lunar Landing Site Navigator*.

Pick a site and a landing date. The tool shows where the Sun and Earth sit relative to the local horizon through a whole mission, and turns that geometry into the two numbers a planner actually trades: how much solar energy the site gives, and how much of the time a direct radio path to Earth exists. Up to three sites can be compared on one landing epoch, one mission length, and one horizon mask, so the only difference between them is the place and the date.

The south pole is the interesting case. The Moon's spin axis is about 1.54° from the ecliptic pole, so the subsolar latitude stays inside roughly ±1.6°. At a polar site the Sun circles the horizon once per lunar day and never climbs high, and Earth is nearly fixed in the sky, wobbling by the libration of about ±8°. A degree of elevation is the whole mission there, which is why the readout quotes tenths of a degree and the horizon mask is adjustable.

## Running it

No build step, no bundler, no package install. Open `index.html` in a browser, including over `file://`.

```
git clone https://github.com/aboba485/moon_horrizon.git
cd moon_horrizon
open index.html        # or double-click it
```

Scripts load in order: `vendor/astronomy.browser.js`, `sites.js`, `ephemeris.js`, `viz.js`, `app.js`.

- `ephemeris.js` is the sky math (`window.LunarEph`).
- `sites.js` is the site catalogue (`window.LUNAR_SITES`, `window.LUNAR_GROUPS`).
- `viz.js` draws the horizon, the chart, and the map (`window.LunarViz`).
- `app.js` is the shell: state, controls, metrics, and the text.

All times in the interface are UTC and labelled as such. The landing date and time inputs are UTC, not the local zone of the machine.

### Controls worth knowing

- Click a site row or the map to make it the only selection. The **pin** button adds it to a comparison of up to three. The first chip is primary; clicking a chip promotes it.
- The landing epoch is the start of the window. The playhead scrubs inside the window and drives the horizon view and the readout; it does not move the landing date.
- Drag or click the chart to move the playhead. Space plays and pauses, arrow keys step one hour, Shift and an arrow steps one day.
- **Scan the next year** ranks start times for the primary site at the current mission length, mask, and array. It is a 6-hour screen, not a flight product; click a result to open that date at full resolution.
- **Download CSV** exports the primary site's samples: `time_utc, sun_alt_deg, sun_az_deg, earth_alt_deg, earth_az_deg, sun_frac, earth_disk, dte, joint, irradiance_w_m2, power_w_m2`.
- The URL hash carries the scenario (sites, landing time, mission hours, mask, array, efficiency), so a link reloads the same trade. Custom coordinates are kept in `localStorage` on the machine that entered them.

## Agreement with JPL Horizons

Positions come from Astronomy Engine 2.1.19. Orientation uses the IAU lunar pole and prime meridian in the Mean Earth / polar axis frame. Altitude and azimuth are airless, geometric, and topocentric on a sphere of radius 1737.4 km, with azimuth measured clockwise from north, matching the Horizons convention.

`test/validate.mjs` queries JPL Horizons (`CENTER=coord@301`, quantity 4, airless apparent az/el) and compares eight cases spanning the pole, Mons Mouton, Apollo 11, Slater Plain, and the far side.

```
node test/validate.mjs     # needs network access to Horizons
```

Worst angular error on those cases: **0.007°**. The Moon has no atmosphere, so there is no refraction and no twilight; altitude 0 is the geometric horizon of the sphere.

## What the numbers mean

**Horizon mask.** One number, in degrees, standing in for local terrain. 0 is the smooth sphere. A positive mask asks "what if the skyline blocks the first few degrees?" A negative mask asks the opposite, as if the site sits on a peak above its surroundings. It is uniform in azimuth, which no real site is.

**Sunlight.** A site is lit when any part of the solar disk clears the mask. The lit fraction of the disk is interpolated across the disk radius, so a part-risen Sun counts partially.

**Power.** The solar constant of 1361 W/m² at 1 AU, scaled by the Moon–Sun distance, times the cosine of the incidence angle on the chosen array, times cell efficiency, times the lit fraction of the disk:

```
cos i = sin(alt) cos(tilt) + cos(alt) sin(tilt) cos(az_panel − az_sun)
```

Output is electrical watts per square metre of cells. There is no dust, no structural shading, no temperature derate, and no battery. Energy is watt-hours per square metre integrated over the window, and mean power is the average across the whole window with the night included.

Array arrangement matters more than anything else at a polar site. Over one lunar day from 2026-11-14 at Mons Mouton with a 0° mask and 30% cells, a vertical array that tracks the Sun's azimuth collects about 177 kWh/m², while the same cells lying flat collect about 12 kWh/m². A Sun that is 1° above the horizon arrives nearly edge-on to a flat panel.

**Direct to Earth (DTE).** A geometric line of sight from the site to a Deep Space Network complex: Goldstone, Madrid, or Canberra. The station must itself clear the mask as seen from the site, which is stricter and more correct than asking whether the centre of Earth is up. Station positions are complex-level coordinates, not specific antennas. This is not a schedule, not a link budget, and not a terrain mask.

**Earth disk versus Earth centre.** Earth is about 1.9° across as seen from the Moon, so its upper limb can be above the horizon while its centre is still below. At Mons Mouton on 2026-11-14 00:00 UTC the centre of Earth is at −0.805° and the limb is essentially on the horizon. The readout reports the limb clearance for that reason.

**Joint.** Sunlit and in direct contact at the same time.

One result worth stating plainly, because it is easy to assume otherwise: a polar site on the far side of the mean-Earth hemisphere does not necessarily lose Earth for good. Slater Plain, at −87.478°, 124.521°, has Earth between −8.1° and +4.7° over a lunar day, so a direct path exists for roughly 38% of the window at a 0° mask. Libration does that. A properly far-side site such as the Chang'e 4 landing point never sees Earth at all: 0% of the window, which is why it flew with a relay.

## Site coordinates, and what they are not

Latitudes are degrees with south negative. Longitudes are east-positive in the Mean Earth / polar axis frame.

The Artemis III candidate-region points are **representative published locations inside those regions, taken from the candidate landing site table in Wueller et al., JGR Planets (2026). They are not NASA-selected touchdown points.** A region is tens of kilometres across and the geometry varies across it, so treat the point as a sample of the region, not as the landing site. Two 2022-list regions, Faustini Rim A and Connecting Ridge Extension, are absent because no cited coordinate was in hand; no coordinates were invented to fill the gap.

Landed missions (Apollo, CLPS, Chandrayaan-3, SLIM, the Chang'e series) use reported touchdown coordinates. Custom coordinates can be entered directly for any point on the sphere.

## Limits

There is no LOLA digital elevation model and no real horizon profile in this tool. The Moon here is a smooth sphere plus one adjustable mask angle. Real south-polar skylines are crater rims and massifs that move the local horizon by many degrees and vary with azimuth, so a smooth-sphere result can call a crater floor sunlit when it is in shadow, or miss a peak of near-eternal light. Thermal behaviour, dust, communications link budgets, landing hazards, and traverse planning are all outside the model.

Use it to compare sites and dates and to understand why polar geometry is hard. Do not use it as a flight product.
