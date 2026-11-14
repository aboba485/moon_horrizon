/* A recorded run of test/validate.mjs, so the agreement with JPL Horizons can be
   shown in the interface instead of only claimed in a README.

   Nothing here is computed by the page. Every row is the output of one query to
   the JPL Horizons API compared against this repository's own ephemeris at the
   same instant and the same coordinates. Re-run `node test/validate.mjs` to
   reproduce it; the script hits Horizons live and will disagree with this file
   if the engine ever drifts. */
(function (root) {
  root.LUNAR_VALIDATION = {
    ranOn: "2026-11-14",
    api: "https://ssd.jpl.nasa.gov/api/horizons.api",
    /* Observer-table query, topocentric on the lunar surface:
       CENTER=coord@301, COORD_TYPE=GEODETIC, QUANTITIES=4 (apparent az/el). */
    centre: "coord@301",
    quantity: "4 (apparent azimuth and elevation)",
    toleranceDeg: 0.15,
    worstDeg: 0.007,
    subSolarPeakDeg: 1.587,
    cases: [
      { name: "Mons Mouton", body: "Sun", t: "2026-11-14 00:00", lat: -85.416, lon: 31.851, az: 94.880, el: 1.170, hAz: 94.875, hEl: 1.171, dAz: 0.004, dEl: 0.001 },
      { name: "Mons Mouton", body: "Earth", t: "2026-11-14 00:00", lat: -85.416, lon: 31.851, az: 327.029, el: -0.805, hAz: 327.030, hEl: -0.805, dAz: 0.000, dEl: 0.000 },
      { name: "South pole", body: "Sun", t: "2026-06-21 00:00", lat: -89.9, lon: 0, az: 108.386, el: -1.401, hAz: 108.384, hEl: -1.400, dAz: 0.001, dEl: 0.001 },
      { name: "South pole", body: "Earth", t: "2026-06-21 00:00", lat: -89.9, lon: 0, az: 7.504, el: -2.076, hAz: 7.507, hEl: -2.076, dAz: 0.003, dEl: 0.000 },
      { name: "Apollo 11", body: "Earth", t: "2026-11-14 00:00", lat: 0.674, lon: 23.473, az: 279.017, el: 64.944, hAz: 279.018, hEl: 64.944, dAz: 0.001, dEl: 0.000 },
      { name: "Apollo 11", body: "Sun", t: "2026-11-14 00:00", lat: 0.674, lon: 23.473, az: 91.441, el: -13.163, hAz: 91.442, hEl: -13.158, dAz: 0.001, dEl: 0.004 },
      { name: "Slater Plain", body: "Earth", t: "2026-11-14 00:00", lat: -87.478, lon: 124.521, az: 234.435, el: -6.118, hAz: 234.436, hEl: -6.118, dAz: 0.000, dEl: 0.000 },
      { name: "Far side centre", body: "Earth", t: "2026-11-14 00:00", lat: 0, lon: 180, az: 15.550, el: -85.448, hAz: 15.544, hEl: -85.448, dAz: 0.007, dEl: 0.000 }
    ],
    /* NASA and NASA-derived inputs this project actually depends on, as opposed
       to things it merely cites. */
    sources: [
      {
        label: "LRO LOLA polar DEM",
        detail: "LDEM_75S_120M, 120 m per pixel, dataset LRO-L-LOLA-4-GDR-V1.0",
        role: "Every horizon profile. Without it the Moon is a smooth sphere and the sunlight numbers are wrong by tens of percent.",
        where: "PDS Geosciences Node, LOLA GDR polar products"
      },
      {
        label: "JPL Horizons",
        detail: "Observer ephemeris, topocentric on the lunar surface",
        role: "The reference every angle in this tool is checked against. Eight cases, worst disagreement 0.007\u00b0.",
        where: "ssd.jpl.nasa.gov/api/horizons.api"
      },
      {
        label: "IAU WGCCRE lunar orientation",
        detail: "Pole right ascension and declination, prime meridian W, Mean Earth / polar axis frame",
        role: "Turns a sky vector into a direction on the ground at a named landing site.",
        where: "IAU Working Group on Cartographic Coordinates and Rotational Elements"
      },
      {
        label: "Published landing coordinates",
        detail: "30 sites: Artemis candidate regions, CLPS deliveries, all six Apollo landings, and international missions",
        role: "The catalogue. Every coordinate is a published location, not an invented one. The Artemis entries are representative points inside candidate regions, not NASA-selected touchdown pins.",
        where: "NASA Artemis landing region announcements and mission records"
      }
    ]
  };
  if (typeof module !== "undefined" && module.exports) module.exports = root.LUNAR_VALIDATION;
})(typeof window !== "undefined" ? window : globalThis);
