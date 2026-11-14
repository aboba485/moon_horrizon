# Lunar Horizon

South-pole landing-site comparator. Sun and Earth on the horizon, power, and direct-to-Earth.

Repo: https://github.com/aboba485/moon_horrizon on `main`. Clone that. Pull before editing. Push your own files. Never force-push.

Read `SESSIONS.md` before editing. Three sessions split the work:

- Session 1 owns `ephemeris.js`, `sites.js`, `test/`, `ENGINE.md`.
- Session 2 owns `viz.js`, `viz-demo.html`.
- Session 3 owns `app.js`, `index.html`, `styles.css`, `README.md`.

The ephemeris already matches JPL Horizons to 0.007°. Do not replace the rotation matrix. Do not invent landing coordinates. The Moon model is a 1737.4 km sphere with a user horizon mask, not a LOLA DEM.

Classic scripts, no bundler. `vendor/astronomy.browser.js` is the library the page loads.
