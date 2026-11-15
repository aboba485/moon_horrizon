import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const E=require('../ephemeris.js');
const F=require('../features.js');
require('../sites.js');
assert.equal(F.meta.count,F.features.length);assert.ok(F.features.length>200);
assert.ok(F.meta.source.includes('planetarynames.wr.usgs.gov'));
assert.ok(fs.statSync(new URL('../features.js',import.meta.url)).size<100000);
for(const f of F.features){
 assert.ok(f.name&&f.kind&&Number.isFinite(f.diamKm)&&f.diamKm>=0);
 assert.ok(f.lat>=-90&&f.lat<=90&&f.lon>=-180&&f.lon<=180);
 assert.ok(f.lat<=-75||f.diamKm>=150);
}
for(const name of ['Shackleton','Malapert','Mons Mouton','Cabeus'])assert.ok(F.features.some(f=>f.name===name),name);
assert.equal(F.skylines.length,17);
let named=0,unnamed=0;
for(const s of F.skylines){
 assert.equal(s.bins.split(';').length,360);
 for(let az=0;az<360;az++){
  const result=E.featureAtAzimuth(s.lat,s.lon,az,{maskDeg:0});
  if(result){
   named++;assert.ok(result.distanceKm>0&&result.distanceKm<=100);assert.ok(result.elevationDeg>=-90&&result.elevationDeg<=90);
   assert.ok(F.features.some(f=>f.name===result.name));
   assert.deepEqual(result,E.featureAtAzimuth(s.lat,s.lon,az+360,{}));
   const offset=E.featureAtAzimuth(s.lat,s.lon,az,{maskDeg:{offsetDeg:2}});
   assert.equal(offset.elevationDeg,result.elevationDeg+2);
  }else unnamed++;
 }
}
assert.ok(named>1000&&unnamed>1000);
assert.equal(E.featureAtAzimuth(.67408,23.47297,150,{}),null);
assert.equal(E.featureAtAzimuth(-89.123,10,150,{}),null);
assert.equal(E.featureAtAzimuth(NaN,0,0,{}),null);
// Classic scripts in a browser-like file:// environment: no require/fetch/modules.
const context=vm.createContext({console});context.window=context;
for(const file of ['vendor/astronomy.browser.js','features.js','ephemeris.js'])
 vm.runInContext(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),context,{filename:file});
assert.equal(context.LUNAR_FEATURES.features.length,F.features.length);
assert.equal(typeof context.LunarEph.horizonEvents,'function');
assert.equal(context.LunarEph.eclipseAt('2026-03-03T11:33:40Z',-85.416,31.851).kind,'total');
assert.equal(context.LunarEph.featureAtAzimuth(.67408,23.47297,0,{}),null);
console.log(`ok features: ${F.features.length} IAU features, ${F.skylines.length} LOLA skylines, ${named} named / ${unnamed} unnamed bearings, <100 kB, classic-script globals`);
