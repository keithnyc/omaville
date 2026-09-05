// Utility capacity and the city history/log. Both write into the save file,
// so the bounded-growth properties matter as much as the behaviour.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../Model.js', import.meta.url), 'utf8')
  .replace('.pragma library', '');
const M = vm.createContext({ Math });
vm.runInContext(source, M);
const size = M.GRID_SIZE;
const MAX_STATE_BYTES = 65536; // must match Service.qml's maxStateBytes

// --- utility capacity -----------------------------------------------------
const grid = M.emptyGrid(size);
for (let i = 0; i < 30; i++) grid[500 + i] = 'R3';
let stats = M.summarize(grid);
let load = M.utilityLoad(grid, stats);
assert.equal(load.powerCapacity, 0, 'no plants, no capacity');
assert.equal(load.power, 0, 'and nothing is served');
assert.equal(load.powerDemand, stats.builtDensity, 'draw is measured in building-levels');

grid[400] = 'E0';
load = M.utilityLoad(grid, M.summarize(grid));
assert.equal(load.powerCapacity, M.POWER_CAPACITY_PER_TIER[0]);
grid[401] = 'E2';
load = M.utilityLoad(grid, M.summarize(grid));
assert.equal(load.powerCapacity, M.POWER_CAPACITY_PER_TIER[0] + M.POWER_CAPACITY_PER_TIER[2],
  'capacity is the sum across plants, scaled by tier');
assert.ok(M.POWER_CAPACITY_PER_TIER[2] > M.POWER_CAPACITY_PER_TIER[0],
  'a bigger plant serves more');

// Satisfaction is the share of draw the grid can meet, clamped to 1.
const tiny = M.emptyGrid(size);
for (let i = 0; i < 40; i++) tiny[500 + i] = 'R3';   // draw 120
tiny[400] = 'E0';                                     // capacity 40
const tinyLoad = M.utilityLoad(tiny, M.summarize(tiny));
assert.ok(Math.abs(tinyLoad.power - 40 / 120) < 1e-9, 'a third of the draw can be served');
assert.equal(M.loadPercent(120, 40), 300);
assert.equal(M.loadPercent(0, 0), 0, 'an empty city is not overloaded');
assert.equal(M.loadPercent(10, 0), 999, 'draw with no capacity reads as maxed, not divide-by-zero');

const empty = M.emptyGrid(size);
assert.equal(M.utilityLoad(empty, M.summarize(empty)).power, 1,
  'nothing built means nothing unserved');

// An overloaded grid must slow growth, not stop the sim. With random() forced
// low every brownout roll passes, so the tick still behaves.
const forced = vm.createContext({
  Math: Object.assign(Object.create(Math), { random: () => 0 })
});
vm.runInContext(source, forced);
const served = forced.tickGrid(tiny, size, forced.summarize(tiny), 70,
  forced.findUtilities(tiny), { R: 1, C: 1, I: 1 }, forced.defaultFunding(), tinyLoad);
assert.equal(served.length, tiny.length, 'an overloaded tick still returns a whole grid');

// The utilities advisor escalates on load once coverage itself is fine.
const advise = (g, l) => {
  const st = M.summarize(g);
  return M.cityAdvice({
    stats: st, coverage: M.serviceCoverageStats(g, size), demand: M.computeDemand(st),
    income: 500, upkeep: 100, treasury: 5000, funding: M.defaultFunding(),
    loans: [], taxRatePercent: 10, fires: [], load: l
  }).find(a => a.advisor === 'utilities');
};
const covered = M.emptyGrid(size);
for (let i = 0; i < 6; i++) covered[30 * size + 30 + i] = 'R3';
covered[30 * size + 33] = 'E1';
covered[30 * size + 34] = 'W1';
assert.equal(advise(covered, M.utilityLoad(covered, M.summarize(covered))).severity, M.SEVERITY_OK,
  'covered and within capacity is a clean bill');
const strained = advise(covered, { powerDemand: 100, powerCapacity: 50, waterDemand: 100,
  waterCapacity: 500, power: 0.5, water: 1 });
assert.equal(strained.severity, M.SEVERITY_URGENT);
assert.match(strained.headline, /overloaded/);
assert.equal(strained.overlay, 'power', 'and points at the power view');
const nearly = advise(covered, { powerDemand: 90, powerCapacity: 100, waterDemand: 10,
  waterCapacity: 500, power: 1, water: 1 });
assert.equal(nearly.severity, M.SEVERITY_WATCH, '90% of capacity is a warning, not a crisis');

// --- history is a bounded ring buffer -------------------------------------
let history = [];
for (let tick = 0; tick < M.HISTORY_MAX * 3; tick++)
  history = M.recordHistory(history, {
    minute: tick, population: tick * 10, treasury: 1000 - tick,
    happiness: 60, income: 100, upkeep: 50
  });
assert.equal(history.length, M.HISTORY_MAX, 'history never grows past its cap');
assert.equal(history[history.length - 1].p, (M.HISTORY_MAX * 3 - 1) * 10,
  'the newest sample is kept');
assert.ok(history[0].m > 0, 'and the oldest is the one dropped');

const range = M.historyRange(history, 'p');
assert.equal(range.min, history[0].p);
assert.equal(range.max, history[history.length - 1].p);
const flat = M.historyRange([{ p: 5 }, { p: 5 }], 'p');
assert.ok(flat.max > flat.min, 'a constant series still gets a drawable band');
assert.ok(M.historyRange([], 'p').max > M.historyRange([], 'p').min, 'and so does an empty one');

// --- the log is newest-first, capped, and answers "since when" ------------
let log = [];
for (let i = 1; i <= M.LOG_MAX * 2; i++) log = M.pushLogEntry(log, i, 'fire', `event ${i}`);
assert.equal(log.length, M.LOG_MAX, 'the log never grows past its cap');
assert.equal(log[0].text, `event ${M.LOG_MAX * 2}`, 'newest first');
assert.ok(log[0].m > log[log.length - 1].m, 'and ordered by time');

const since = M.logSince(log, M.LOG_MAX * 2 - 3);
assert.equal(since.length, 3, 'only what happened after the player last looked');
assert.equal(M.logSince(log, M.LOG_MAX * 2).length, 0, 'nothing new right after looking');
assert.equal(M.logSince(log, 0).length, M.LOG_MAX, 'a player who never looked sees everything');
assert.equal(M.logSince([], 0).length, 0);
for (const kind of ['fire', 'loss', 'milestone', 'loan', 'brownout', 'dilemma', 'budget'])
  assert.ok(M.LOG_KIND_LABELS[kind], `${kind} entries are displayable`);

// Packed history must survive the round trip exactly, since it is what the
// graphs are drawn from.
const packed = M.packHistory(history);
const unpacked = M.unpackHistory(packed);
assert.equal(unpacked.length, history.length);
for (let i = 0; i < history.length; i++)
  for (const f of ['m', 'p', 't', 'h', 'i', 'u'])
    assert.equal(unpacked[i][f], history[i][f], `sample ${i} field ${f} survives packing`);
// Lengths, not deepEqual: arrays built inside the vm carry that realm's
// prototype, which deepStrictEqual treats as a mismatch.
assert.equal(M.unpackHistory('').length, 0);
for (const bad of [undefined, null, 42, 'nonsense', '1,2,3'])
  assert.equal(M.unpackHistory(bad).length, 0, `unpackHistory rejects ${JSON.stringify(bad)}`);
assert.ok(packed.length * 3 < JSON.stringify(history, null, 2).length,
  'packing is a real saving, not a rename (measured ~3.7x smaller)');

// --- and none of it can push the save past its read cap -------------------
// History and the log are the first unbounded-looking things to go into the
// save, so pin the worst case they can actually reach.
const fullGrid = M.emptyGrid(size).map((_, i) => ['R3', 'C3', 'I3', '#0', 'H2', 'N2'][i % 6]);
let worstHistory = [];
for (let i = 0; i < M.HISTORY_MAX; i++)
  worstHistory = M.recordHistory(worstHistory, {
    minute: 99999, population: 999999, treasury: 9999999,
    happiness: 100, income: 999999, upkeep: 999999
  });
let worstLog = [];
for (let i = 0; i < M.LOG_MAX; i++)
  worstLog = M.pushLogEntry(worstLog, 99999, 'loss',
    'The city has lost several buildings to a fire that spread through the district.');
const worst = Buffer.byteLength(JSON.stringify({
  cityName: 'A Fairly Long Town Name Here', foundedAtMs: Date.now(), ageMinutes: 99999,
  treasury: 123456.789, taxRatePercent: 30, grid: M.packGrid(fullGrid), gridSize: size,
  saveVersion: M.SAVE_VERSION, population: 99999, jobs: 99999, happiness: 100,
  demand: { R: 1.234567, C: 1.234567, I: 1.234567 }, reachedMilestones: M.MILESTONES.slice(),
  budgetCrisisActive: true, pendingEvents: M.EVENTS, activeEffects: [], eventChance: 0.05,
  eventFrequency: 2, funding: M.defaultFunding(),
  loans: M.takeLoan(M.takeLoan([], M.loanOffer('growth'), 0), M.loanOffer('seed'), 0),
  missedLoanTicks: 3,
  fires: Array.from({ length: M.FIRE_MAX_ACTIVE }, (_, i) => ({ index: i * 37, ticks: i })),
  history: M.packHistory(worstHistory), cityLog: worstLog, lastSeenMinute: 99999
}, null, 2) + '\n');
assert.ok(worst < MAX_STATE_BYTES * 0.6,
  `worst-case save ${worst}B must keep real headroom under the ${MAX_STATE_BYTES}B cap`);

console.log(`PASS: capacity sums and satisfaction, brownout advice, bounded history and log, ` +
  `"since you last looked", and a worst-case save of ${worst}B ` +
  `(${(worst / MAX_STATE_BYTES * 100).toFixed(1)}% of the cap).`);
