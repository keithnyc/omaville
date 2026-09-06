import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const M = vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../Model.js', import.meta.url), 'utf8').replace('.pragma library', ''), M);
const size = 9, lot = 40;
for (const through of ['_0', 'R0', 'R3', 'C2', 'I1', 'P2', 'Q0', 'T0', 'B0', 'L0', 'E0', 'W2', 'F0', 'S1', 'N2', 'H0']) {
  const grid = Array(size * size).fill('_0');
  grid[lot] = 'R1'; grid[lot - 1] = through; grid[lot - 2] = '#0';
  const expected = '_RCIPQTB'.includes(through[0]);
  assert.equal(M.hasRoadAccess(grid, size, lot), expected, through);
  assert.equal(!!M.cityRoadNetwork(grid, size)[lot - 2], expected, `network ${through}`);
  assert.equal(M.inspectTile(grid, size, lot, M.findUtilities(grid), {R:1,C:1,I:1}, 100, 100).roadAdjacent, expected);
  assert.equal(M.growthBlocker(grid, size, lot, M.findUtilities(grid), 100) === 'road', !expected);
}
for (const road of ['#0', '#1']) {
  const grid = Array(81).fill('_0'); grid[lot - 2] = road;
  assert(M.hasRoadAccess(grid, size, lot));
  assert(!M.hasRoadAccess(grid, size, lot + 1), 'no chain beyond two steps');
  grid[lot - 2] = '_0'; assert(!M.hasRoadAccess(grid, size, lot), 'removal');
}
const corner = Array(81).fill('_0'); corner[8] = '#0';
assert(!M.hasRoadAccess(corner, size, 9), 'no row wrapping');
const bend = Array(81).fill('_0'); bend[30] = '#0';
assert(M.hasRoadAccess(bend, size, lot), 'two-step bend');
bend[31] = 'L0'; bend[39] = 'L0';
assert(!M.hasRoadAccess(bend, size, lot), 'no diagonal crossing water');

const qml = fs.readFileSync(new URL('../CityView.qml', import.meta.url), 'utf8');
const root = { useResidentialSprites:true, useCommercialSprites:true, useIndustrialSprites:true,
  spriteSourceFor:()=> 'sprite', drawSpriteLot() {}, drawLotDressing() {}, drawMatureVariant:()=>false };
let loaded = true, calls = [];
const context = vm.createContext({root, cityCanvas:{isImageLoaded:()=>loaded}});
for (const family of ['Residential', 'Commercial', 'Industrial']) {
  const name = `draw${family}Sprite`;
  const fn = vm.runInContext('(' + qml.match(new RegExp('  function ' + name + '\\([\\s\\S]*?\\n  \\}'))[0] + ')', context);
  for (const cell of [16,32,64,96]) for (const tier of [1,2,3]) {
    calls = [];
    assert(fn({drawImage:(...args)=>calls.push(args)},100,200,cell,tier,40));
    const [,x,y,w,h] = calls[0];
    assert(x >= 100 + cell * .049 && x+w <= 100 + cell * .951, `${family} side margins`);
    assert(y >= 200 && y+h <= 200 + cell * .95, `${family} row separation`);
  }
  loaded = false; assert.equal(fn({},0,0,32,1,40),false); loaded = true;
}
console.log('PASS: two-step road access, blocked terrain, bridges, boundaries, network/inspect agreement, and RCI sprite separation at all tiers/scales.');
