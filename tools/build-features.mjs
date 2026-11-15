/* Offline build: python3 tools/fetch-features.py; sh tools/fetch-lola.sh;
   node tools/build-features.mjs
   No change to terrain.js: reuse exactly its ray walk to record skyline witnesses. */
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {profileFor} from './lola-horizon.mjs';
const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = JSON.parse(fs.readFileSync(path.join(repo,'data/nomenclature/features.json'),'utf8'));
require(path.join(repo,'sites.js'));
const rad = Math.PI/180;
function distance(a,b) {
 const dlat=(b.lat-a.lat)*rad, dlon=(b.lon-a.lon)*rad;
 const s=Math.sin(dlat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlon/2)**2;
 return 1737.4*2*Math.asin(Math.sqrt(Math.min(1,s)));
}
const skylines=[];
let named=0, unnamed=0;
for (const site of globalThis.LUNAR_SITES.filter(s=>s.lat<=-79)) {
 const profile=profileFor(site.lat,site.lon);
 if (!profile) continue;
 // Compact base-36 rows [feature index, distance in 0.1 km, elevation in 0.01 deg].
 // An empty row is deliberately unnamed, including the assumed datum-sphere floor.
 const rows=profile.witnesses.map(p=>{
  if(!p) {unnamed++;return '';}
  let best=-1, bestDistance=Infinity;
  source.features.forEach((f,i)=>{
   const d=distance(p,f);
   // A centre+diameter is only a footprint proxy, not a geological boundary.
   if(d<=Math.min(30,f.diamKm/2+2)&&d<bestDistance){best=i;bestDistance=d;}
  });
  if(best<0){unnamed++;return '';}
  named++;
  return [best,Math.round(p.distanceKm*10),Math.round(p.elevationDeg*100)].map(n=>n.toString(36)).join(',');
 });
 skylines.push({id:site.id,lat:site.lat,lon:site.lon,bins:rows.join(';')});
}
const data={meta:{...source.meta,skylineSource:'LDEM_75S_120M; same 3 subrays/bin and 60/120/300 m radial steps as tools/lola-horizon.mjs',
 attribution:'nearest named centre to the DEM maximum within min(30 km, diameter/2+2 km); approximate footprint attribution, not a surveyed boundary',
 encoding:'360 semicolon-separated bins; each nonempty bin: base36 featureIndex,distanceDeciKm,elevationCentiDeg'},
 features:source.features,skylines};
const output=path.join(repo,'features.js');
const script='/* Generated offline by tools/fetch-features.py and tools/build-features.mjs.\n   IAU/USGS Gazetteer, '+source.meta.source+'\n   Named skyline witnesses are computed from LOLA; no runtime fetch or DEM needed. */\n'+
 '(function(root){\n  root.LUNAR_FEATURES = '+JSON.stringify(data)+';\n'+
 '  if (typeof module !== "undefined" && module.exports) module.exports = root.LUNAR_FEATURES;\n})(typeof window !== "undefined" ? window : globalThis);\n';
if(Buffer.byteLength(script)>=100000) throw new Error('Feature artifact exceeds the 100 kB budget');
fs.writeFileSync(output,script);
console.log(`${source.features.length} named features, ${skylines.length} skylines, ${named} attributed / ${unnamed} unnamed bearings, ${Buffer.byteLength(script)} bytes`);
