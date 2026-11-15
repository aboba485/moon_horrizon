import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const E = require('../ephemeris.js');
const A = require('../vendor/astronomy.browser.js');
require('../terrain.js');
const DAY = 86400000, start = Date.parse('2026-11-14T00:00:00Z');
const apollo = [.67408,23.47297], mouton = [-85.416,31.851];
const close = (x,y,tol) => assert.ok(Math.abs(x-y)<=tol, `${x} differs from ${y} (tol ${tol})`);
const clearance = (t,lat,lon,body,mask) => {
 const p=E.atSite(new Date(t),lat,lon), look=p[body];
 return look.alt+(body==='sun'?p.sunRadiusDeg:p.earthRadiusDeg)-E.maskResolver(mask)(look.az);
};
for (const [coords, mask] of [[apollo,0],[[-89.9,0],{profile:globalThis.LUNAR_TERRAIN.sites.shackleton.profile,offsetDeg:0}]]) {
 const events=E.horizonEvents(start,30*DAY,...coords,{body:'sun',maskDeg:mask});
 assert.ok(events.length>=2);
 for (const e of events) {
  assert.equal(e.refined,true);
  close(e.azDeg,E.atSite(new Date(e.t),...coords).sun.az,1e-9);
  const before=clearance(e.t-1000,...coords,'sun',mask), after=clearance(e.t+1000,...coords,'sun',mask);
  assert.ok(e.kind==='rise' ? before<=0&&after>0 : before>0&&after<=0);
 }
}
assert.deepEqual(E.horizonEvents(start,DAY,-45.4446,177.5991,{body:'earth'}),[]);
assert.deepEqual(E.horizonEvents(start,30*DAY,...mouton,{body:'sun',maskDeg:-90}),[]);
assert.deepEqual(E.horizonEvents(start,30*DAY,...mouton,{body:'sun',maskDeg:90}),[]);
const next=E.nextEvent(start,...apollo,{body:'sun'});
assert.equal(next.kind,'rise'); assert.equal(next.msUntil,next.t-start); assert.ok(next.azDeg>80&&next.azDeg<100);
assert.equal(E.nextEvent(start,-45.4446,177.5991,{body:'earth'}),null);
assert.throws(()=>E.horizonEvents(start,DAY,...apollo,{body:'mars'}),RangeError);
console.log('ok horizon events: real LOLA bearings, sub-second brackets, polar day/night, far-side Earth, countdown');

const roots=E.solveFor(start,30*DAY,...apollo,{body:'sun',altDeg:10,azDeg:null});
assert.equal(roots.length,2); for(const p of roots){assert.equal(p.exact,true);close(p.altDeg,10,.001);}
const targetT=start+5*DAY, target=E.atSite(new Date(targetT),...mouton).sun;
const both=E.solveFor(start,30*DAY,...mouton,{body:'sun',azDeg:target.az,altDeg:target.alt,toleranceDeg:.001});
assert.ok(both.some(p=>p.exact&&Math.abs(p.t-targetT)<1000));
const impossible=E.solveFor(start,30*DAY,...mouton,{body:'sun',altDeg:80});
assert.equal(impossible.length,1);assert.equal(impossible[0].exact,false);assert.ok(impossible[0].separationDeg>60);
const az=E.solveFor(start,30*DAY,...mouton,{body:'sun',azDeg:0});
assert.equal(az.length,1);assert.equal(az[0].exact,true);assert.ok(Math.min(az[0].azDeg,360-az[0].azDeg)<.01);
const earth=E.solveFor(start,30*DAY,...mouton,{body:'earth',altDeg:0});
assert.ok(earth.length>=1);assert.ok(earth.every(p=>p.exact));
assert.deepEqual(E.solveFor(start,DAY,...apollo,{}),[]);
assert.throws(()=>E.solveFor(start,DAY,...apollo,{altDeg:100}),RangeError);
console.log('ok inverse: both elevation roots, azimuth wrap, two-axis solve, unattainable target, Earth');

for(const [date,coords,sep,re,rs] of [
 ['2026-03-03T11:33:40Z',apollo,.380,.959,.268],['2026-03-03T11:33:40Z',mouton,.618,.955,.268],
 ['2026-08-28T04:12:49Z',mouton,.220,.936,.263],['2026-08-28T04:12:49Z',apollo,.500,.940,.263]]) {
 const e=E.eclipseAt(date,...coords),p=E.evaluate(date,...coords,0);
 close(e.sepDeg,sep,.001);close(e.earthRadiusDeg,re,.001);close(e.sunRadiusDeg,rs,.001);
 assert.equal(e.obscuration,1);assert.equal(e.kind,'total');assert.equal(p.sunFrac,0);assert.equal(p.lit,false);
 assert.ok(p.irradiance>1300);assert.ok(p.power>0&&p.power<.001); // documented numerical residual, not a transmission model
 close(p.power/p.powerWithoutEclipse,E.ECLIPSE_POWER_FLOOR,1e-12);
 const v=E.atSite(new Date(date),...coords);
 assert.ok(Math.abs(v.sun.alt-v.earth.alt)<.7);
 assert.ok(Math.abs(((v.sun.az-v.earth.az+540)%360)-180)<2);
}
assert.equal(E.eclipseAt('2026-11-14',...mouton).kind,'none');
const north = E.findEclipses('2026-08-27',3*DAY,80,0)[0];
assert.equal(north.kind,'partial');assert.ok(north.maxObscuration>.95&&north.maxObscuration<.97);
assert.equal(E.eclipseAt('2026-08-28T04:12:49Z',...mouton).kind,'total');
for (const dt of [-60000,60000]) assert.ok(north.maxObscuration>=E.eclipseAt(new Date(north.peakMs+dt),80,0).obscuration);
let global=A.SearchLunarEclipse(new Date('2026-01-01'));
assert.equal(global.kind,'total');assert.equal(global.obscuration,1);
global=A.NextLunarEclipse(global.peak);assert.equal(global.kind,'partial');close(global.obscuration,.966,.002);
global=A.NextLunarEclipse(global.peak);assert.equal(global.kind,'penumbral');assert.equal(global.obscuration,0);
const eclipses=E.findEclipses('2026-01-01',365*DAY,...mouton);
assert.equal(eclipses.length,2);
for(const ev of eclipses){
 assert.ok(ev.startMs<ev.peakMs&&ev.peakMs<ev.endMs);assert.equal(ev.kind,'total');
 assert.equal(E.eclipseAt(new Date(ev.startMs-1000),...mouton).kind,'none');
 assert.ok(E.eclipseAt(new Date(ev.startMs+1000),...mouton).obscuration>0);
 assert.equal(E.eclipseAt(new Date(ev.endMs+1000),...mouton).kind,'none');
 assert.ok(E.eclipseAt(new Date(ev.endMs-1000),...mouton).obscuration>0);
 assert.equal(E.findEclipses(ev.peakMs,60000,...mouton).length,1); // window already in eclipse
}
// Partial overlap independently integrated as vertical slices of the solar disk.
const partial=E.eclipseAt(new Date(eclipses[0].startMs+15*60000),...mouton);
assert.ok(partial.obscuration>0&&partial.obscuration<1);
let area=0; const n=20000,dx=2*partial.sunRadiusDeg/n;
for(let i=0;i<n;i++){
 const x=-partial.sunRadiusDeg+(i+.5)*dx;
 const ys=Math.sqrt(Math.max(0,partial.sunRadiusDeg**2-x*x));
 const ye=Math.sqrt(Math.max(0,partial.earthRadiusDeg**2-(x-partial.sepDeg)**2));
 area+=2*Math.min(ys,ye)*dx;
}
close(partial.obscuration,area/(Math.PI*partial.sunRadiusDeg**2),1e-5);
const mission=E.sampleMission('2026-03-02',3*DAY,...mouton,{stepMs:6*3600000,maskDeg:-10});
assert.ok(mission.some(p=>p.eclipseKind==='total'));
assert.ok(E.summarize(mission).energyWh < mission.slice(0,-1).reduce((sum,p,i)=>sum+(p.powerWithoutEclipse+mission[i+1].powerWithoutEclipse)/2*(mission[i+1].t-p.t)/3600000,0));
assert.deepEqual(E.findEclipses('2026-11-14',DAY,...mouton),[]);
console.log('ok eclipses: four site fixtures, circle-overlap area, vendor global sequence, contacts, energy loss on coarse missions');
