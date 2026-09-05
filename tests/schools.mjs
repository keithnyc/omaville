import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
let seed = 321;
const math = Object.create(Math);
math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
function module(name) {
  const context = vm.createContext({ Math: math });
  vm.runInContext(fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8').replace('.pragma library', ''), context);
  return context;
}
const M = module('Model.js'), T = module('Traffic.js');
const size = 40, school = 820;
let grid = Array(size * size).fill('_0');
assert.equal(M.educationStats(grid, size).unmet, 0);
for (let tier = 0; tier < 3; tier++) {
  grid.fill('_0'); grid[school] = 'N' + tier;
  const radius = [6, 10, 15][tier];
  grid[school + radius] = 'R2'; grid[school + radius + 1] = 'R1';
  const u = M.findUtilities(grid);
  assert.equal(u.schools.length, 1);
  assert(M.isCovered(size, u.schools, school + radius, M.SCHOOL_RADIUS));
  assert(!M.isCovered(size, u.schools, school + radius + 1, M.SCHOOL_RADIUS));
  const stats = M.educationStats(grid, size);
  assert.equal(stats.served, M.RES_CAP_PER_LEVEL * 2);
  assert.equal(stats.unmet, M.RES_CAP_PER_LEVEL);
  assert.equal(stats.coverage, 67);
  assert.equal(M.summarize(grid).serviceUpkeep, M.SCHOOL_UPKEEP * M.INFRA_UPKEEP_SCALE[tier]);
  const removed = M.bulldozeTile(grid, school);
  assert.equal(M.educationStats(removed, size).coverage, 0);
  assert.equal(JSON.parse(JSON.stringify(grid))[school], 'N' + tier);
}
grid.fill('_0');
for (let x = 2; x < 38; x++) grid[20 * size + x] = '#0';
grid[school - size] = 'N0';
assert(T.nearSchool(grid, size, school));
assert(!T.nearSchool(grid, size, school + 10));
const roads = T.roadTiles(grid, size);
let buses = 0, ordinary = 0;
for (let i = 0; i < 600; i++) {
  const car = T.spawn(grid, size, roads, [], ['#fff']);
  assert(car);
  if (car.schoolBus) {
    buses++;
    assert(T.nearSchool(grid, size, car.tile));
    assert.equal(car.color, '#efbd38');
  } else ordinary++;
}
assert(buses > 5 && ordinary > buses);
grid[school - size] = '_0';
for (let i = 0; i < 100; i++) assert(!T.spawn(grid, size, roads, [], ['#fff']).schoolBus);
// Existing traffic turns over, allowing schools built later to gain buses.
const car = T.spawn(grid, size, roads, [], ['#fff']); car.age = 90;
assert(!T.update([car], 33, grid, size, 1, roads, ['#fff']).includes(car));
// Fixed growth roll: education boosts served homes, slows unmet need,
// and cannot replace power/water/road access or knock existing homes down.
grid.fill('_0'); grid[school] = 'R1'; grid[school + 1] = '#0';
const utilities = { power: [{ index: school, level: 2 }], water: [{ index: school, level: 2 }],
  fire: [{ index: school, level: 2 }], police: [{ index: school, level: 2 }], schools: [] };
math.random = () => 0.13;
assert.equal(M.tickGrid(grid, size, { population: 100 }, 70, utilities, { R: 1 })[school], 'R1');
assert.equal(M.tickGrid(grid, size, { population: 50 }, 70, utilities, { R: 1 })[school], 'R2');
utilities.schools = [{ index: school - size, level: 0 }];
utilities.medical = [{ index: school - size, level: 0 }];
math.random = () => 0.16;
assert.equal(M.tickGrid(grid, size, { population: 100 }, 70, utilities, { R: 1 })[school], 'R2');
utilities.water = [];
assert.equal(M.tickGrid(grid, size, { population: 100 }, 70, utilities, { R: 1 })[school], 'R1');
console.log('PASS: school ranges, weighted need, upkeep, demolition, persistence, growth/utility gates, local bus mix and traffic turnover.');
