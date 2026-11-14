/* Curated lunar sites. Latitudes and longitudes are degrees, east-positive,
   in the Mean Earth / polar axis frame. Artemis points are representative
   published locations inside candidate regions, not NASA-selected touchdown pins. */
(function (root) {
  const SITES = [
    {
      id: "mouton",
      name: "Mons Mouton",
      short: "Mouton",
      group: "artemis",
      program: "Artemis III",
      status: "candidate",
      lat: -85.416,
      lon: 31.851,
      note: "Representative point on the Mons Mouton candidate region. IM-2 Athena touched down on this massif."
    },
    {
      id: "mouton-plateau",
      name: "Mons Mouton Plateau",
      short: "Plateau",
      group: "artemis",
      program: "Artemis III",
      status: "candidate",
      lat: -85.111,
      lon: 26.71,
      note: "A point on the broad plateau north of the Mons Mouton region. Useful for seeing what a short move does to Earth visibility."
    },
    {
      id: "nobile-1",
      name: "Nobile Rim 1",
      short: "Nobile 1",
      group: "artemis",
      program: "Artemis III",
      status: "candidate",
      lat: -85.295,
      lon: 36.917,
      note: "Southwestern rim of Nobile, where the rim meets Mons Mouton. VIPER was aimed at the Nobile region."
    },
    {
      id: "nobile-2",
      name: "Nobile Rim 2",
      short: "Nobile 2",
      group: "artemis",
      program: "Artemis III",
      status: "candidate",
      lat: -84.054,
      lon: 56.481,
      note: "Eastern Nobile rim. Farther from the pole, so the Sun climbs higher and the lunar night is more like a long eclipse than a season."
    },
    {
      id: "malapert",
      name: "Malapert Massif",
      short: "Malapert",
      group: "artemis",
      program: "Artemis III",
      status: "candidate",
      lat: -85.942,
      lon: -0.944,
      note: "Massif near longitude zero. Earth stays close to due north and often clears the horizon."
    },
    {
      id: "haworth",
      name: "Haworth",
      short: "Haworth",
      group: "artemis",
      program: "Artemis III",
      status: "candidate",
      lat: -86.99,
      lon: -24.254,
      note: "Rim terrain by Haworth crater, on the near-side approach to the pole."
    },
    {
      id: "gerlache-2",
      name: "de Gerlache Rim 2",
      short: "de Gerlache",
      group: "artemis",
      program: "Artemis III",
      status: "candidate",
      lat: -88.389,
      lon: -68.865,
      note: "High-latitude rim. The Sun skims, and Earth sits low in the north."
    },
    {
      id: "cabeus-peak",
      name: "Peak near Cabeus B",
      short: "Cabeus B",
      group: "artemis",
      program: "Artemis III",
      status: "candidate",
      lat: -83.763,
      lon: -69.983,
      note: "Massif southwest of Cabeus B, one of the nine Artemis III regions selected in 2024."
    },
    {
      id: "slater",
      name: "Slater Plain",
      short: "Slater",
      group: "artemis",
      program: "Artemis III",
      status: "candidate",
      lat: -87.478,
      lon: 124.521,
      note: "Far-side plain near Slater. Sunlight can be good while Earth stays below the horizon, so a relay is the radio plan."
    },
    {
      id: "connecting",
      name: "Connecting Ridge",
      short: "Ridge",
      group: "south",
      program: "Artemis 2022",
      status: "candidate",
      lat: -89.421,
      lon: -149.472,
      note: "Ridge between Shackleton and de Gerlache, about 18 km from the pole. Dropped from the 2024 Artemis III shortlist, still the cleanest place to watch polar geometry."
    },
    {
      id: "shackleton-peak",
      name: "Peak near Shackleton",
      short: "Shackleton",
      group: "south",
      program: "Artemis 2022",
      status: "candidate",
      lat: -89.061,
      lon: 128.442,
      note: "Between Shackleton and Slater. Near the pole, on the far-side side of Shackleton."
    },
    {
      id: "south-pole",
      name: "Geographic south pole",
      short: "Pole",
      group: "south",
      program: "Reference",
      status: "reference",
      lat: -89.99,
      lon: 0,
      note: "The pole itself. Longitude only orients the azimuth dial: north points along longitude 0, toward mean Earth."
    },
    {
      id: "shackleton",
      name: "Shackleton crater",
      short: "Crater",
      group: "south",
      program: "Reference",
      status: "reference",
      lat: -89.9,
      lon: 0,
      note: "Shackleton crater, whose floor is permanently shadowed. This point is the crater, not a sunlit rim."
    },
    {
      id: "amundsen",
      name: "Amundsen Rim",
      short: "Amundsen",
      group: "south",
      program: "Artemis 2022",
      status: "candidate",
      lat: -84.467,
      lon: 66.97,
      note: "Earlier Artemis candidate on the Amundsen rim. Not in the 2024 nine, still a strong sunlight and Earth-view comparison."
    },
    {
      id: "kocher",
      name: "de Gerlache–Kocher",
      short: "Kocher",
      group: "south",
      program: "Artemis 2022",
      status: "candidate",
      lat: -85.726,
      lon: -116.813,
      note: "Far-side massif. Expect long stretches with no direct view of Earth."
    },
    {
      id: "im2",
      name: "IM-2 Athena",
      short: "IM-2",
      group: "clps",
      program: "CLPS",
      status: "landed",
      lat: -84.7906,
      lon: 29.1957,
      note: "Intuitive Machines Athena, reported touchdown on Mons Mouton, 6 March 2025. The lander came to rest on its side."
    },
    {
      id: "im1",
      name: "IM-1 Odysseus",
      short: "IM-1",
      group: "clps",
      program: "CLPS",
      status: "landed",
      lat: -80.13,
      lon: 1.44,
      note: "Intuitive Machines Odysseus, Malapert A, 22 February 2024. About 300 km from the pole, so days and nights are long but ordinary."
    },
    {
      id: "blue-ghost",
      name: "Blue Ghost Mission 1",
      short: "Blue Ghost",
      group: "clps",
      program: "CLPS",
      status: "landed",
      lat: 18.5623,
      lon: 61.8103,
      note: "Firefly Blue Ghost, Mare Crisium, 2 March 2025. An equatorial contrast: the Sun climbs high, and Earth stays overhead."
    },
    {
      id: "apollo11",
      name: "Apollo 11",
      short: "Apollo 11",
      group: "apollo",
      program: "Apollo",
      status: "landed",
      lat: 0.67408,
      lon: 23.47297,
      note: "Tranquility Base. Two weeks of Sun, Earth high in the sky, then two weeks of night."
    },
    {
      id: "apollo12",
      name: "Apollo 12",
      short: "Apollo 12",
      group: "apollo",
      program: "Apollo",
      status: "landed",
      lat: -3.01239,
      lon: -23.42157,
      note: "Ocean of Storms."
    },
    {
      id: "apollo14",
      name: "Apollo 14",
      short: "Apollo 14",
      group: "apollo",
      program: "Apollo",
      status: "landed",
      lat: -3.6453,
      lon: -17.47136,
      note: "Fra Mauro."
    },
    {
      id: "apollo15",
      name: "Apollo 15",
      short: "Apollo 15",
      group: "apollo",
      program: "Apollo",
      status: "landed",
      lat: 26.13222,
      lon: 3.63386,
      note: "Hadley–Apennine. Far enough north that lunar seasons show up in the Sun's peak elevation."
    },
    {
      id: "apollo16",
      name: "Apollo 16",
      short: "Apollo 16",
      group: "apollo",
      program: "Apollo",
      status: "landed",
      lat: -8.97301,
      lon: 15.50019,
      note: "Descartes Highlands."
    },
    {
      id: "apollo17",
      name: "Apollo 17",
      short: "Apollo 17",
      group: "apollo",
      program: "Apollo",
      status: "landed",
      lat: 20.1908,
      lon: 30.77168,
      note: "Taurus–Littrow. Last crewed landing, December 1972."
    },
    {
      id: "chandrayaan3",
      name: "Chandrayaan-3",
      short: "Ch-3",
      group: "world",
      program: "ISRO",
      status: "landed",
      lat: -69.373,
      lon: 32.319,
      note: "Shiv Shakti Point, 23 August 2023. South, but not polar: a real sunrise and a real two-week night."
    },
    {
      id: "slim",
      name: "SLIM",
      short: "SLIM",
      group: "world",
      program: "JAXA",
      status: "landed",
      lat: -13.316,
      lon: 25.251,
      note: "JAXA SLIM, Shioli crater, 19 January 2024."
    },
    {
      id: "change4",
      name: "Chang'e 4",
      short: "CE-4",
      group: "world",
      program: "CNSA",
      status: "landed",
      lat: -45.4446,
      lon: 177.5991,
      note: "Von Kármán crater, far side. Earth is below the horizon for the whole mission. Queqiao was the relay."
    },
    {
      id: "change5",
      name: "Chang'e 5",
      short: "CE-5",
      group: "world",
      program: "CNSA",
      status: "landed",
      lat: 43.058,
      lon: -51.916,
      note: "Oceanus Procellarum sample return, December 2020."
    },
    {
      id: "change6",
      name: "Chang'e 6",
      short: "CE-6",
      group: "world",
      program: "CNSA",
      status: "landed",
      lat: -41.6385,
      lon: -153.9852,
      note: "Apollo basin, far side, sample return, June 2024."
    },
    {
      id: "hakuto2",
      name: "Hakuto-R Resilience",
      short: "Hakuto-R",
      group: "world",
      program: "ispace",
      status: "attempted",
      lat: 60.4445,
      lon: -4.588,
      note: "Attempted landing in Mare Frigoris, 5 June 2025. Contact was lost before touchdown."
    }
  ];

  const GROUPS = [
    { id: "artemis", label: "Artemis" },
    { id: "south", label: "South pole" },
    { id: "clps", label: "CLPS" },
    { id: "apollo", label: "Apollo" },
    { id: "world", label: "International" }
  ];

  root.LUNAR_SITES = SITES;
  root.LUNAR_GROUPS = GROUPS;
})(typeof window !== "undefined" ? window : globalThis);
