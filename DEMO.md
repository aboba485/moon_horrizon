# Demo script

A timed walkthrough of Lunar Horizon. Three versions: 30 seconds, 2 minutes, 5 minutes. All of them use the four buttons at the top of the stage, so nothing has to be typed on stage and nothing can be mistyped.

Open `index.html`. It starts in **Simple** mode on the globe. Have the window wide enough that the globe and the card sit side by side.

Every number below was produced by the app on the date it was written. If a number on screen disagrees with a number here, trust the screen and fix this file — the readings are computed live from the engine, this file is not.

---

## 30 seconds

Use this for the video or a hallway pitch. One click, one sentence each.

| t | do | say |
| --- | --- | --- |
| 0:00 | the globe is already turning under the cursor | "Where a lander sits down decides whether it survives the night." |
| 0:05 | click **The rim that eats the Sun** | "Shackleton crater. On a smooth sphere it is sunlit 100% of the lunar day." |
| 0:15 | point at the two numbers in the reading | "Against its own rim, measured from LOLA, it is 48%. That gap is 159 kilowatt-hours per square metre." |
| 0:25 | — | "Size a battery off the first number and the lander dies. That is the whole tool." |

---

## 2½ minutes

The core demo. Four clicks, in this order, because each one answers a different question. Drop the eclipse click if you are held to two minutes.

**0:00 — the problem (15 s).**
Globe on screen, no story selected. Drag it once so it is obviously live.

> "Artemis is going to the lunar south pole. At the pole the Sun never gets more than about a degree and a half above the horizon, so the thing that decides whether a site is a good site is not latitude. It is what the skyline looks like from where you are standing."

**0:15 — click *The rim that eats the Sun* (35 s).**
The globe flies to the pole, Shackleton is selected, and the reading appears.

> "Shackleton crater, one lunar day. On a smooth sphere the answer is 100% sunlight, 297 kilowatt-hours per square metre. That is the answer a map gives you.
>
> Against the crater's own rim — LOLA polar DEM, 120 metres per pixel, the skyline reaching plus 22 degrees in some directions — it is 48% sunlight, 138 kilowatt-hours, and an eight-day night that the sphere model says does not exist.
>
> Both of those are the same engine on the same date. The only difference is whether the terrain is in it."

**0:50 — click *A whole lunar day of sunlight* (35 s).**

> "Mons Mouton, an Artemis III candidate. Here the terrain is on and the answer really is 100% sunlight for the entire month.
>
> But the tool will not print that on its own. It walks every sample and finds that the solar limb comes within 0.43 degrees of the measured skyline on the eighth of December — Sun at minus 2.9, terrain at minus 3.0 on that bearing.
>
> Half a degree is inside what a one-degree azimuth bin can resolve. So the honest output is '100%, and here is the half-degree it hangs on', not '100%'."

**1:25 — click *Where Earth never rises* (25 s).**

> "The other half of a landing site is whether you can talk to it. Chang'e 4 on the far side: Earth's altitude runs minus 51 to minus 38 degrees. Never up. Zero direct-to-Earth, a blackout as long as the mission. China flew a relay satellite for exactly this reason.
>
> And the interesting case next to it — Slater Plain is past the mean-Earth hemisphere, so you would assume the same answer. Libration of plus or minus eight degrees lifts Earth over its horizon for about a third of the month."

**1:50 — click *The one outage you can predict* (25 s).**

> "One more, because it is the only thing in a mission plan you can put a date on. The 28th of August 2026. From Earth that is a lunar eclipse. From the ground at Mons Mouton it is a *solar* eclipse — Earth passes in front of the Sun, covers 100% of it, and the whole event runs four point seven hours.
>
> And it validates the engine for free. An eclipse is the Sun and Earth at the same place in the sky, and this tool computes those two directions by completely separate paths. They agree to 0.604 degrees, inside Earth's 0.94-degree disk. No sign error in the lunar rotation survives that."

**2:15 — close (10 s).**

> "Everything you just saw is checked against JPL Horizons to 0.007 degrees, and the comparison table is in the app, not just in the README."

Scroll to **Where the data comes from, and how it was checked** and open it. Leave it on screen.

---

## 5 minutes

Run the core script, then add these in order.

**+0:30 — the evidence panel, read out.**
Already open from the close. Walk the four sources and say what each is load-bearing for: LOLA is every horizon profile, Horizons is the reference, IAU WGCCRE turns a sky vector into a direction on the ground, and the catalogue is published coordinates. Then the table: eight cases, the pole, Mouton, Apollo 11, Slater, the far side, worst delta 0.007° against a 0.15° tolerance.

> "`node test/validate.mjs` re-runs this live against the Horizons API. If the engine ever drifts, this file stops matching."

**+1:00 — switch to Expert.**
Click **A whole lunar day of sunlight** again first, so the state is known: Mons Mouton, 2026-11-14, one lunar day, LOLA on, mask 0. Every number quoted from here down is for that scenario. Then click **Expert** in the header.

> "Nothing is removed in the simple view, only hidden. This is the same state."

Point at, in this order:
- the **horizon strip** — Sun and Earth against the measured skyline, with the mask shaded;
- the **chart** — altitude, power, and the direct-link bands through the mission;
- the **comparison table** — up to three sites on one epoch, one mission length, one mask, so the only difference is the place.

**+1:00 — the trade that surprises people.**
In the array controls, switch **Arrangement** from *Vertical, tracking the Sun in azimuth* to *Flat on the ground*. Watch the energy number collapse.

> "At Mouton over a lunar day: about 177 kilowatt-hours per square metre vertical and tracking, about 12 lying flat. A Sun that is one degree up arrives nearly edge-on. At the pole the mounting angle is a bigger decision than the cell efficiency."

Switch it back.

**+0:40 — the two questions a planner actually asks.**

First, the inverse. In the left column under **Find a Sun position**, type `3` into *Elevation*, leave *Azimuth* empty, and click **Find times in this mission**.

> "Not 'where is the Sun now' but 'when is it where I need it'. At Mouton over this lunar day the Sun is at three degrees twice — once on a bearing of 72 degrees, once on 289. Click either one and the playhead goes there."

Second, the delay. Set **If we slip** to *14 days later*.

> "A launch slip is the most common change to a plan, so it is a control, not a recomputation. Same site, same array, same mask, epoch moved two weeks. Here direct-to-Earth goes from 49 to 58 per cent. Near the pole two weeks can invert the answer, because it moves the Sun to the other side of the same rim."

**+0:30 — scan and export.**
Click **Scan the next year**, let it rank start dates, open one.

> "That is a six-hour screen, not a flight product. Click a result and it opens at full resolution. Download CSV gives you the samples."

**+0:30 — limits, said out loud.**
Do not skip this. It is the difference between a tool and a demo.

> "Azimuth is binned at one degree, so a knife-edge ridge is smoothed. Rays stop at 100 kilometres. Sites north of 79 south have no profile at all and fall back to a uniform mask. There is no self-shadowing, no scattered light, no thermal model, no link budget. A half-degree margin is a question for a real terrain study, not an answer.
>
> And one we found in our own engine: the lit fraction models the horizon blocking the Sun, not Earth blocking the Sun. So across an eclipse the energy total is optimistic — about 1.5 kilowatt-hours per square metre at Mouton on the 28th of August. The geometry is right, the integral is not corrected yet, and the app says so itself rather than letting you find out."

---

## If you only remember one thing

Say the Shackleton number. 100% on a map, 48% against the real rim. Everything else in the project is in service of being allowed to say that second number.

## Things that go wrong on stage

- **Open it by double-clicking `index.html`.** There is no server and no build. If someone asks, that is deliberate — `fetch()` of a local file is blocked over `file://`, which is why the data ships as scripts.
- **The four buttons are also links.** `index.html#st=rim`, `#st=margin`, `#st=silence`, `#st=eclipse`. If a click misses, use the URL.
- **Next eclipse is usually disabled, and that is correct.** Eclipses come about twice a year, so most missions contain none. The tooltip says why. It lights up on the eclipse finding.
- **Clicking any site by hand clears the active finding.** That is intended; the reading would otherwise describe a site that is no longer selected.
- **Play is safe to leave running.** Clicking a finding stops it and returns the playhead to the landing epoch, so the reading is never for a moved playhead.
- **Expert mode needs width.** Below about 860 px the console stacks into one column and the aside drops under the stage. It is only CSS, so widening the window fixes it immediately.
