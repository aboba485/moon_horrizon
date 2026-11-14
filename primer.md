# Primer

Lunar Horizon is a south-pole landing-site comparator for the 2026 NASA Space Apps challenge Lunar Landing Site Navigator.

## Done

- `ephemeris.js` matches JPL Horizons airless az/el to 0.007° on eight cases. Worst case was Mons Mouton, Apollo 11, the south pole, Slater Plain, and the far side.
- `sites.js` holds Artemis III 2024 regions, a few 2022 regions, CLPS, Apollo, and international landings. Artemis coordinates are representative CLS points, not NASA pins.
- `index.html` and `styles.css` are a shell. `app.js` and `viz.js` are not written.
- `SESSIONS.md` is the handoff: full research plus three prompts.

## Blocked

- The page does not run until session 2 writes `viz.js` and session 3 writes `app.js`.
- No LOLA terrain horizons. The mask is a uniform stand-in.
- Pushed to https://github.com/aboba485/moon_horrizon on `main`. Claude sessions should clone that repo.

## Next

Open three Claude sessions on this folder and paste the three prompts from `SESSIONS.md`. They own different files and can run together.

Session 1: `ephemeris.js`, `sites.js`, `test/`, `ENGINE.md`.
Session 2: `viz.js`, `viz-demo.html`.
Session 3: `app.js`, `index.html`, `styles.css`, `README.md`.
