import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const M=vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../Model.js',import.meta.url),'utf8').replace('.pragma library',''),M);
let grid=Array(81).fill('_0');
assert(M.canPlace(grid,40,'L',4)); assert(!M.canPlace(grid,40,'L',3));
grid=M.placeTile(grid,40,'L');assert.equal(grid[40],'L0');
assert(!M.canPlace(grid,40,'R',100));assert(!M.canPlace(grid,40,'L',100));
assert(M.canPlace(grid,40,'#',35));assert(!M.canPlace(grid,40,'#',34));
assert.equal(M.placementCost(grid,40,'#'),35);
grid=M.placeTile(grid,40,'#');assert.equal(grid[40],'#1');
assert(M.isRoadAdjacent(grid,9,41));assert(M.isWaterTile(grid[40]));
assert.equal(M.totalInvestment('#',1),35);
assert.equal(M.summarize(grid).roadCount,1);
assert.equal(JSON.parse(JSON.stringify(grid))[40],'#1');
grid=M.bulldozeTile(grid,40);assert.equal(grid[40],'L0');
assert(M.canPlace(grid,41,'Q',30));assert(!M.canPlace(grid,42,'Q',30));
assert(!M.canPlace(grid,41,'Q',29));
assert.equal(M.waterfrontBonus(grid,9,41),12);
assert.equal(M.waterfrontBonus(grid,9,42),8);
assert.equal(M.waterfrontBonus(grid,9,43),4);
assert.equal(M.waterfrontBonus(grid,9,44),0);
const parks=M.placeTile(grid,41,'Q');
assert.equal(M.summarize(parks).parkHappinessBonus,3);
grid=M.bulldozeTile(grid,40);assert.equal(grid[40],'_0');
assert.equal(M.waterfrontBonus(grid,9,41),0);
grid.fill('L0');grid[40]='R2';assert.equal(M.waterfrontBonus(grid,9,40),12,'water bonus never stacks');
assert.equal(M.propertyValueBonus(grid,9,40),12);
assert.equal(M.summarize(grid).taxablePopulation,M.summarize(grid).population*1.12);
grid.fill('_0');grid[8]='L0';assert.equal(M.waterfrontBonus(grid,9,9),0,'no row wrapping');
grid[40]='R1';assert(!M.canPlace(grid,40,'L',100),'water cannot erase buildings');
// Actual service charging/refund path: restore water first, terrain second.
const service=fs.readFileSync(new URL('../Service.qml',import.meta.url),'utf8');
const root={grid:Array(81).fill('_0'),treasury:100};let saves=0;
const ctx=vm.createContext({root,Model:M,flushState(){saves++;}});
const action=n=>vm.runInContext('('+service.match(new RegExp('  function '+n+'\\([\\s\\S]*?\\n  \\}'))[0]+')',ctx);
const zone=action('zoneTile'),remove=action('bulldozeTile');
zone(40,'L');zone(40,'#');assert.equal(root.treasury,61);
remove(40);assert.equal(root.treasury,96);assert.equal(root.grid[40],'L0');
// Draining refunds nothing: new maps start with lakes nobody paid for (see
// Model.totalInvestment), so the $4 painting it stays spent.
remove(40);assert.equal(root.treasury,96);assert.equal(saves,4);
// Same road identity means existing traffic pathing traverses bridges.
const T=vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../Traffic.js',import.meta.url),'utf8').replace('.pragma library',''),T);
grid.fill('_0');for(let i=37;i<44;i++)grid[i]=i>=39&&i<=41?'#1':'#0';
assert.equal(T.roadTiles(grid,9).length,7);
let cars=[],bridgeFrames=0;
for(let i=0;i<3000;i++) {
  cars=T.update(cars,33,grid,9,2,T.roadTiles(grid,9),['#fff']);
  for(const car of cars){assert(Number.isFinite(T.pose(car,9).x));if(grid[car.tile]==='#1')bridgeFrames++;}
}
assert(bridgeFrames>100);
console.log('PASS: water safety/costs, bridges/refunds/water restoration, shoreline parks, capped distance bonus, tax weighting, persistence and bridge traffic.');
