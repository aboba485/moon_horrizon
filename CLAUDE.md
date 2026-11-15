# Lunar Horizon

South-pole landing-site comparator. Sun and Earth on the horizon, power, and direct-to-Earth.

Repo: https://github.com/aboba485/moon_horrizon on `main`. Clone that. Pull before editing. Push your own files. Never force-push.

Read `SESSIONS.md` before editing. Three sessions split the work:

- Session 1 owns `ephemeris.js`, `sites.js`, `test/`, `ENGINE.md`.
- Session 2 owns `viz.js`, `viz-demo.html`.
- Session 3 owns `app.js`, `index.html`, `styles.css`, `README.md`.

The ephemeris already matches JPL Horizons to 0.007°. Do not replace the rotation matrix. Do not invent landing coordinates.

The Moon model is a 1737.4 km datum sphere. The horizon on it is a measured 360-azimuth LOLA skyline (`terrain.js`, from `LDEM_75S_120M`) for the 17 catalogue sites south of 79°S; everywhere else, and whenever the user turns the skyline off, it is a uniform mask in degrees. Both paths are live and the interface says which one a reading used.

Classic scripts, no bundler. `vendor/astronomy.browser.js` is the library the page loads.
