import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code = fs.readFileSync(new URL('../Traffic.js', import.meta.url), 'utf8').replace(/^\.pragma library\s*/, '');
let seed = 17;
const math = Object.create(Math);
math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const T = vm.createContext({ Math: math });
vm.runInContext(code, T);
const size = 9, center = 40, sides = [39, 41, 31, 49];
const angleDiff = (a,b) => Math.abs(Math.atan2(Math.sin(a-b), Math.cos(a-b)));
for (const prev of sides) for (const next of sides) {
  const p = T.makePath(size, center, prev, next);
  const start = T.bezier(p, 0), end = T.bezier(p, 1);
  const incoming = T.direction(size, prev, center), outgoing = T.direction(size, center, next);
  assert(angleDiff(start.angle, Math.atan2(incoming.y, incoming.x)) < 1e-6);
  assert(angleDiff(end.angle, Math.atan2(outgoing.y, outgoing.x)) < 1e-6);
  for (let n=0; n<=100; n++) {
    const pose = T.bezier(p, n/100);
    assert(Number.isFinite(pose.angle));
    assert(Math.abs(pose.x) <= 0.50001 && Math.abs(pose.y) <= 0.50001);
  }
  // Every possible turn in the following tile joins at the exact same lane point.
  for (const offset of [-1, 1, -size, size]) {
    const nextPath = T.makePath(size, next, center, next+offset);
    const a = T.pose({ tile: center, path: p, distance: p.length }, size);
    const b = T.pose({ tile: next, path: nextPath, distance: 0 }, size);
    assert(Math.hypot(a.x-b.x, a.y-b.y) < 1e-6);
    assert(angleDiff(a.angle,b.angle) < 1e-6);
  }
}
const colors = ['#fff', '#f44'];
const empty = Array(81).fill('.');
assert.equal(T.roadTiles(empty,size).length,0);
assert.equal(T.update([],33,empty,size,10,[],colors).length,0);
const isolated = empty.slice(); isolated[40]='#';
assert.equal(T.roadTiles(isolated,size).length,0);
// Connected grid with crossroads, corner bends, and dead ends.
const data = Array(81).fill('.');
for(let y=1;y<8;y++)for(let x=1;x<8;x++)
  if(x===2||x===6||y===2||y===6) data[y*size+x]='#';
const roads = T.roadTiles(data,size);
let cars=[], traveled=0, transitions=0, tailTravel=0;
for(let frame=0;frame<9000;frame++) {
  const old = new Map(cars.map(c=>[c,{p:T.pose(c,size),tile:c.tile,speed:c.speed}]));
  cars=T.update(cars,33,data,size,12,roads,colors);
  const occupancy=new Set();
  for(const car of cars) {
    const pose=T.pose(car,size);
    assert([pose.x,pose.y,pose.angle,car.speed,car.distance].every(Number.isFinite));
    assert(T.isRoad(data,car.tile));
    assert(car.distance>=0 && car.distance<=car.path.length+1e-6);
    assert(car.speed>=0 && car.speed<=car.cruise+1e-6);
    if(T.neighbors(data,size,car.tile).length>2) {
      assert(!occupancy.has(car.tile),'intersection double occupancy'); occupancy.add(car.tile);
    }
    if(old.has(car)) {
      const before=old.get(car), moved=Math.hypot(pose.x-before.p.x,pose.y-before.p.y);
      assert(moved<0.027,'teleport at a lane or tile transition'); traveled+=moved;
      if (frame > 8000) tailTravel += moved;
      if(before.tile!==car.tile) transitions++;
    }
  }
}
assert(transitions>100,'traffic stalled: '+JSON.stringify({transitions,cars:cars.map(c=>({tile:c.tile,prev:c.prev,next:c.next,d:c.distance,len:c.path.length,v:c.speed}))}));
assert(traveled>100);
assert(tailTravel>5,'traffic eventually deadlocked: '+tailTravel);
// Road deletion removes invalid routes immediately; shrinking population trims cars.
const deleted=data.map(()=>'.');
assert.equal(T.update(cars,33,deleted,size,12,[],colors).length,0);
assert.equal(T.update(cars,33,data,size,0,roads,colors).length,0);
// A fast follower must queue behind a slower leader, never overtake it.
const straight=empty.slice(); for(let i=37;i<=43;i++)straight[i]='#';
const makeCar=(tile,distance,speed)=>({tile,prev:tile-1,next:tile+1,path:T.makePath(size,tile,tile-1,tile+1),distance,speed,cruise:speed,color:'#fff',age:1});
let pair=[makeCar(39,0.1,0.75),makeCar(40,0.2,0.3)];
for(let frame=0;frame<100;frame++) {
  pair=T.update(pair,33,straight,size,2,T.roadTiles(straight,size),colors);
  const follow=T.pose(pair[0],size),lead=T.pose(pair[1],size);
  assert(lead.x-follow.x>=T.gap-0.001,'following gap violated');
}
console.log(`PASS: all 16 lane paths, 64 joins, bounds/headings, 9000 simulation frames (${transitions} transitions), junction exclusion, following distance, empty/deleted roads and population shrink.`);
