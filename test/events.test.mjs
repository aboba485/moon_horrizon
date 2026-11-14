import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Eph = require('../ephemeris.js');

const empty = { sunset: null, sunrise: null, earthset: null, earthrise: null, linkDown: null, linkUp: null };
// Different angular radii ensure limb crossings cannot be confused with centers.
const point = (t, clearance) => ({ t, sunAlt: clearance - 0.25, sunRadius: 0.25,
  earthAlt: clearance - 1, earthRadius: 1, stationAlt: clearance });
const samples = [point(0, 2), point(1000, -2), point(2000, 2), point(3000, -2)];
const event = (kind, t) => ({ kind, t });
assert.deepEqual(Eph.eventsFromSamples(samples, 0), { ...empty,
  sunset: event('sunset', 500), earthset: event('earthset', 500), linkDown: event('linkDown', 500) });
// State must be interpolated at the playhead, not taken from the left sample.
assert.deepEqual(Eph.eventsFromSamples(samples, 750), { ...empty,
  sunrise: event('sunrise', 1500), earthrise: event('earthrise', 1500), linkUp: event('linkUp', 1500) });
assert.deepEqual(Eph.eventsFromSamples(samples, 1750), { ...empty,
  sunset: event('sunset', 2500), earthset: event('earthset', 2500), linkDown: event('linkDown', 2500) });
assert.deepEqual(Eph.eventsFromSamples(samples, 500), { ...empty,
  sunrise: event('sunrise', 1500), earthrise: event('earthrise', 1500), linkUp: event('linkUp', 1500) });
assert.deepEqual(Eph.eventsFromSamples(samples, 0, 1), { ...empty,
  sunset: event('sunset', 250), earthset: event('earthset', 250), linkDown: event('linkDown', 250) });
const independent = [point(0, 2), { ...point(1000, 2), stationAlt: -2 }];
assert.deepEqual(Eph.eventsFromSamples(independent, 0), { ...empty, linkDown: event('linkDown', 500) });
assert.deepEqual(Eph.eventsFromSamples([point(0, 1), point(1000, 0)], 0), { ...empty,
  sunset: event('sunset', 1000), earthset: event('earthset', 1000), linkDown: event('linkDown', 1000) });
for (const input of [[], [point(0, 1)], [point(0, 1), point(1000, 1)]]) {
  assert.deepEqual(Eph.eventsFromSamples(input, 0), empty);
}
for (const from of [-1, 2750, 3000, 4000, NaN]) assert.deepEqual(Eph.eventsFromSamples(samples, from), empty);
console.log('ok events: limb and link interpolation, playhead state, already-down wrap, mask, boundaries, no crossing');

const start = new Date('2026-11-14T00:00:00Z');
const duration = 29.530589 * 86400000;
const options = { maskDeg: 0, panel: { tiltDeg: 90, tracking: true, efficiency: 0.3 } };
const mission = Eph.sampleMission(start, duration, -85.416, 31.851, options);
assert.equal(mission.at(-1).t, new Date(start.getTime() + duration).getTime());
const summary = Eph.summarize(mission);
assert.equal(summary.spanMs, new Date(start.getTime() + duration).getTime() - start.getTime());
assert.ok(summary.sunlitFrac > 0.5 && summary.sunlitFrac < 0.7);
assert.ok(summary.earthFrac > 0.55 && summary.earthFrac < 0.8);
// Public API is Wh/m²; the prompt's 120–230 target is kWh/m².
assert.ok(summary.energyWh > 120000 && summary.energyWh < 230000);
assert.ok(summary.sunMax < 12);
const flat = Eph.summarize(Eph.sampleMission(start, duration, -85.416, 31.851,
  { ...options, panel: { ...options.panel, tiltDeg: 0 } }));
assert.ok(summary.energyWh > flat.energyWh * 5);
assert.equal(Eph.sampleMission(start, 0, -85.416, 31.851, options).length, 1);
assert.throws(() => Eph.sampleMission(start, NaN, 0, 0, options), RangeError);
assert.throws(() => Eph.sampleMission(start, duration, 0, 0, { stepMs: -1 }), RangeError);
console.log(`ok Mons Mouton: sunlight ${(summary.sunlitFrac * 100).toFixed(2)}%, Earth disk ${(summary.earthFrac * 100).toFixed(2)}%, energy ${(summary.energyWh / 1000).toFixed(3)} kWh/m², mean ${summary.meanPower.toFixed(3)} W/m², Sun max ${summary.sunMax.toFixed(3)}°`);
console.log(`ok mission endpoint: exact ${summary.spanMs} ms; flat array ${(flat.energyWh / 1000).toFixed(3)} kWh/m²`);
