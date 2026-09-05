import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
let seed = 129;
const math = Object.create(Math);
math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const T = vm.createContext({ Math: math });
vm.runInContext(fs.readFileSync(new URL('../Traffic.js', import.meta.url), 'utf8').replace('.pragma library', ''), T);
const size = 20, data = Array(400).fill('_0');
for(let x=1;x<19;x++) data[200+x]='#0';
const roads=T.roadTiles(data,size), colors=['#fff'];
for(let i=0;i<100;i++) assert(!T.spawn(data,size,roads,[],colors).ambulance);
for(let tier=0;tier<3;tier++) {
  data[190]='H'+tier;
  let count=0;
  for(let i=0;i<400;i++) {
    const car=T.spawn(data,size,roads,[],colors);
    if(car.ambulance) {count++;assert(T.nearService(data,size,car.tile,'H'));assert(!car.schoolBus && !car.police);}
  }
  assert(count>5 && count<200);
}
const cruiser={tile:210,prev:209,next:211,path:T.makePath(size,210,209,211),distance:.1,
  speed:0,cruise:.6,age:1,ambulance:true,dispatchOffset:0};
assert(T.emergencyActive(cruiser));
const red=T.lightPulse(cruiser); cruiser.age+=.25;
assert.notEqual(red.red,T.lightPulse(cruiser).red);
cruiser.age=15;assert(!T.emergencyActive(cruiser));
cruiser.age=1;
let pool=[cruiser];
for(let i=0;i<90;i++) pool=T.update(pool,33,data,size,1,roads,colors);
assert(cruiser.speed>.6, 'Emergency run is faster than normal cruise');
assert(cruiser.speed<=.6*1.3+1e-6);
// Faster cruiser must still queue behind a slower vehicle.
cruiser.distance=.1;
const leader={tile:cruiser.tile+1,prev:cruiser.tile,next:cruiser.tile+2,
  path:T.makePath(size,cruiser.tile+1,cruiser.tile,cruiser.tile+2),distance:.1,speed:.3,cruise:.3,age:1};
pool=[cruiser,leader];
for(let i=0;i<80;i++) {
  pool=T.update(pool,33,data,size,2,roads,colors);
  assert(T.pose(leader,size).x-T.pose(cruiser,size).x>=T.gap-.001);
}
data[190]='_0';
assert(!T.update(pool,33,data,size,2,roads,colors).some(c=>c.ambulance));
console.log('PASS: medical facility-gated spawning at all tiers, no bus hybrids, alternating lights, emergency speed, safe following and last-station removal.');
