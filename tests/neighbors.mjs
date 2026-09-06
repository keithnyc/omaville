// Neighbouring cities: four highway stubs at the map edges that open growth
// from outside once a road actually reaches them.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const M = vm.createContext({ Math });
vm.runInContext(
  fs.readFileSync(new URL('../Model.js', import.meta.url), 'utf8').replace('.pragma library', ''),
  M);
const size = M.GRID_SIZE;

// --- generation is stable, distinct, and uses the whole name pool ---------
const a = M.makeNeighbors(size, 12345);
const b = M.makeNeighbors(size, 12345);
assert.equal(a.length, 4, 'one neighbour per edge');
assert.deepEqual(Array.from(a, n => n.name), Array.from(b, n => n.name),
  'the same city always gets the same neighbours');
assert.deepEqual(Array.from(a, n => n.index), Array.from(b, n => n.index));
assert.deepEqual(Array.from(a, n => n.edge), Array.from(M.NEIGHBOR_EDGES));

// Names are drawn without replacement, and the pool is fully reachable. Both
// were real bugs: multiplying the seed by a large constant inline overflowed
// past 2^53, which produced duplicate names and left a third of the pool
// unreachable.
const seen = {};
let duplicates = 0;
for (let seed = 1; seed < 3000; seed++) {
  const names = Array.from(M.makeNeighbors(size, seed * 7919 + seed), n => n.name);
  if (new Set(names).size !== 4) duplicates += 1;
  for (const n of names) seen[n] = (seen[n] || 0) + 1;
}
assert.equal(duplicates, 0, 'no city ever gets two neighbours with the same name');
assert.equal(Object.keys(seen).length, M.NEIGHBOR_NAMES.length, 'every name is reachable');
const counts = Object.values(seen);
assert.ok(Math.max(...counts) < Math.min(...counts) * 2, 'and they are drawn fairly evenly');

// Connectors sit on their own edge, never in a corner where two edges meet.
for (const n of M.makeNeighbors(size, 99)) {
  const col = n.index % size, row = Math.floor(n.index / size);
  if (n.edge === 'north') assert.equal(row, 0);
  if (n.edge === 'south') assert.equal(row, size - 1);
  if (n.edge === 'west') assert.equal(col, 0);
  if (n.edge === 'east') assert.equal(col, size - 1);
  assert.ok(col > 0 && col < size - 1 || row > 0 && row < size - 1, 'never a corner tile');
}

// --- a connection needs a real route home, not just a road at the edge ----
const neighbors = M.makeNeighbors(size, 4242);
const north = neighbors.find(n => n.edge === 'north');
const grid = M.emptyGrid(size);

// A city with no roads at all connects to nothing.
assert.equal(M.connectedNeighbors(grid, size, neighbors).length, 0);

// A lone road on the connector, joined to nothing, still connects to nothing —
// this is the case a naive "is the connector a road" check would get wrong.
grid[north.index] = '#0';
assert.equal(M.connectedNeighbors(grid, size, neighbors).length, 0,
  'a stub at the edge is not a connection');

// Build a town well inside the map, with a road beside it but no route out.
const col = north.index % size;   // the connector's own column, row 0
const townRow = 20;
grid[north.index] = '_0';
grid[townRow * size + col + 1] = 'R2';
grid[townRow * size + col] = '#0';
assert.equal(M.connectedNeighbors(grid, size, neighbors).length, 0,
  'a town with a road but no route to the edge is still unconnected');

// Now lay a continuous road up that column to the connector itself.
for (let row = 0; row <= townRow; row++) grid[row * size + col] = '#0';
const linked = M.connectedNeighbors(grid, size, neighbors);
assert.equal(linked.length, 1, 'a continuous road to the connector opens it');
assert.equal(linked[0].name, north.name, 'and it is the right neighbour');

// Cutting the road anywhere along it closes the highway again.
grid[10 * size + col] = '_0';
assert.equal(M.connectedNeighbors(grid, size, neighbors).length, 0,
  'severing the highway closes the connection');

// --- what a connection is actually worth ---------------------------------
const bonus = n => M.neighborBonus(n);
assert.equal(bonus(0).migration, 1, 'no connections is exactly neutral');
assert.equal(bonus(0).commerce, 1);
assert.equal(bonus(0).trade, 1);
for (const n of [1, 2, 3, 4]) {
  assert.ok(bonus(n).migration > bonus(n - 1).migration, 'each highway adds migration');
  assert.ok(bonus(n).commerce > bonus(n - 1).commerce);
  assert.ok(bonus(n).trade > bonus(n - 1).trade);
}
assert.ok(bonus(4).migration < 2, 'four connections is a tailwind, not a doubling');
assert.equal(bonus(-5).migration, 1, 'a nonsense count reads as none');

// Demand really does lift, and industry is deliberately untouched — highways
// bring people and trade, not factories.
const city = M.emptyGrid(size);
for (let i = 0; i < 20; i++) { city[500 + i] = 'R3'; city[560 + i] = 'C3'; city[620 + i] = 'I3'; }
const stats = M.summarize(city);
const alone = M.computeDemand(stats, 0);
const linkedUp = M.computeDemand(stats, 4);
assert.ok(linkedUp.R > alone.R, 'migration raises residential demand');
assert.ok(linkedUp.C > alone.C, 'trade raises commercial demand');
assert.equal(linkedUp.I, alone.I, 'industry is unaffected by highways');
assert.equal(M.computeDemand(stats).R, alone.R, 'omitting the count means unconnected');

// --- the planner names it as an opportunity ------------------------------
// A city with room to grow: at its zoned ceiling "housing is full" rightly
// outranks anything about highways, so use a town that still has headroom.
const roomy = M.emptyGrid(size);
for (let i = 0; i < 20; i++) { roomy[500 + i] = 'R1'; roomy[560 + i] = 'C1'; roomy[620 + i] = 'I1'; }
const roomyStats = M.summarize(roomy);
const advise = (linked, total) => M.cityAdvice({
  stats: roomyStats, coverage: M.serviceCoverageStats(roomy, size),
  demand: M.computeDemand(roomyStats, linked),
  income: 500, upkeep: 100, treasury: 2000, funding: M.defaultFunding(),
  loans: [], taxRatePercent: 10, fires: [], crimes: [],
  load: M.utilityLoad(roomy, roomyStats), neighborsLinked: linked, neighborsTotal: total
}).find(x => x.advisor === 'planning');
assert.match(advise(0, 4).headline, /No highways/);
assert.match(advise(2, 4).headline, /2 neighbours still unconnected/);
assert.ok(!/highway|neighbour/i.test(advise(4, 4).headline),
  'once every highway is open the planner moves on to something else');


// --- an already-open highway is not news ----------------------------------
// Regression: which highways are open was tracked in memory but never
// persisted, so every shell restart came back thinking each existing
// connection was brand new and re-announced roads built hours earlier. The
// fix derives it from the grid at load, so this asserts the derivation is
// stable across a save/reload round trip rather than trusting stored state.
const stable = M.emptyGrid(size);
const nbs = M.makeNeighbors(size, 8080);
const target = nbs.find(n => n.edge === 'north');
const lane = target.index % size;
for (let row = 0; row <= 18; row++) stable[row * size + lane] = '#0';
stable[18 * size + lane + 1] = 'R2';

const openNow = M.connectedNeighbors(stable, size, nbs);
assert.equal(openNow.length, 1, 'the highway is open');

// Round-trip the grid exactly as the save does, then re-derive.
const reloaded = M.unpackGrid(M.packGrid(stable));
const openAfter = M.connectedNeighbors(reloaded, size, nbs);
assert.equal(openAfter.length, openNow.length, 'still open after a reload');
assert.equal(openAfter[0].name, openNow[0].name, 'and it is the same highway');

// Derivation is pure: repeating it never changes the answer, so a restart can
// never manufacture a "newly opened" highway that was already there.
for (let again = 0; again < 3; again++)
  assert.equal(M.connectedNeighbors(reloaded, size, nbs).length, 1,
    'deriving repeatedly is stable');

console.log('PASS: stable distinct generation over the whole name pool, edge placement, ' +
  'route-home connection detection, bounded bonuses, demand lift, planner advice, and connection state that survives a reload.');
