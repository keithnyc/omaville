// Fires: the one thing in the sim that actively destroys what the player
// built, so the properties worth pinning are the safety rails — that coverage
// and funding really do help, that it cannot cascade unbounded, and that it
// always terminates rather than burning a city down while nobody is looking.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../Model.js', import.meta.url), 'utf8')
  .replace('.pragma library', '');
// A seeded generator, so "unlucky" runs are reproducible rather than flaky.
// The seed is mixed and the generator warmed before use: a bare LCG seeded
// with small consecutive integers emits nearly identical first values, which
// would quietly turn "40 seeds" into one sample repeated 40 times.
function load(seed = 1) {
  let state = Math.imul(seed >>> 0 || 1, 2654435761) >>> 0;
  const rng = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (let warm = 0; warm < 16; warm++) rng();
  const ctx = vm.createContext({ Math: Object.assign(Object.create(Math), { random: rng }) });
  vm.runInContext(source, ctx);
  return ctx;
}
const M = load();
const size = M.GRID_SIZE;
const all = level => ({ F: level, S: level, N: level, H: level });

// A block of buildings, optionally with a fire station in the middle.
function town(withStation) {
  const grid = M.emptyGrid(size);
  for (let row = 20; row < 26; row++)
    for (let col = 20; col < 26; col++) grid[row * size + col] = 'R3';
  if (withStation) grid[23 * size + 23] = 'F1';
  return grid;
}

// --- what can burn --------------------------------------------------------
assert.ok(M.isBurnable(M.parseTile('R1')) && M.isBurnable(M.parseTile('C2')));
assert.ok(!M.isBurnable(M.parseTile('R0')), 'an empty zone has nothing to burn');
assert.ok(!M.isBurnable(M.parseTile('#0')) && !M.isBurnable(M.parseTile('E1')),
  'roads and infrastructure are not fire fuel');

// --- coverage genuinely lowers how often fires start ----------------------
const exposed = town(false);
const guarded = town(true);
const exposedSurvey = M.fireSurvey(exposed, size, M.findUtilities(exposed), all(1));
const guardedSurvey = M.fireSurvey(guarded, size, M.findUtilities(guarded), all(1));
assert.equal(exposedSurvey.covered.length, 0, 'no station: nothing is covered');
assert.equal(guardedSurvey.exposed.length, 0, 'a station in the middle covers this block');
assert.ok(M.fireStartChance(exposedSurvey) > M.fireStartChance(guardedSurvey) * 2,
  'an uncovered city burns markedly more often');
assert.ok(M.fireStartChance(guardedSurvey) > 0,
  'but perfect coverage makes fire rare, not impossible');
assert.equal(M.fireStartChance(M.fireSurvey(M.emptyGrid(size), size,
  M.findUtilities(M.emptyGrid(size)), all(1))), 0, 'an empty map cannot catch fire');

// Fires start where nobody is watching: with both pools available, the
// exposed one should dominate by a wide margin.
const mixed = M.emptyGrid(size);
for (let i = 0; i < 20; i++) mixed[10 * size + i] = 'R2';   // far from any station
for (let i = 0; i < 20; i++) mixed[50 * size + i] = 'R2';
mixed[50 * size + 10] = 'F1';
const mixedSurvey = M.fireSurvey(mixed, size, M.findUtilities(mixed), all(1));
assert.ok(mixedSurvey.covered.length > 0 && mixedSurvey.exposed.length > 0, 'both pools exist');
let inExposed = 0;
for (let i = 0; i < 400; i++)
  if (mixedSurvey.exposed.indexOf(M.pickFireSite(mixedSurvey, [])) >= 0) inExposed += 1;
assert.ok(inExposed > 280, `fires favour uncovered ground (${inExposed}/400)`);

// --- funding buys a faster response ---------------------------------------
// Same seed, same city, different budgets: the well-funded one burns shorter.
function burnDuration(fundingLevel, seed) {
  const m = load(seed);
  let grid = town(true);
  let fires = [{ index: 23 * size + 22, ticks: 0 }];
  const u = m.findUtilities(grid);
  let ticks = 0;
  while (fires.length > 0 && ticks < 400) {
    const r = m.advanceFires(grid, size, fires, u, all(fundingLevel));
    grid = r.grid; fires = r.fires; ticks += 1;
  }
  return ticks;
}
let starvedTotal = 0, fundedTotal = 0;
for (let seed = 1; seed <= 25; seed++) {
  starvedTotal += burnDuration(M.FUNDING_MIN, seed);
  fundedTotal += burnDuration(M.FUNDING_MAX, seed);
}
assert.ok(fundedTotal < starvedTotal,
  `a well-funded fire service puts fires out sooner (${fundedTotal} vs ${starvedTotal} ticks)`);

// --- it always terminates, and never exceeds the cascade cap --------------
// The important safety property for a game that runs unattended: whatever the
// seed, fires must burn out rather than consume the city indefinitely.
for (let seed = 1; seed <= 40; seed++) {
  const m = load(seed);
  let grid = town(false);          // worst case: no fire cover at all
  let fires = [{ index: 22 * size + 22, ticks: 0 }];
  const u = m.findUtilities(grid);
  let ticks = 0;
  while (fires.length > 0) {
    const r = m.advanceFires(grid, size, fires, u, all(m.FUNDING_MIN));
    grid = r.grid; fires = r.fires; ticks += 1;
    assert.ok(fires.length <= m.FIRE_MAX_ACTIVE,
      `seed ${seed}: never more than ${m.FIRE_MAX_ACTIVE} fires at once`);
    assert.ok(ticks < 2000, `seed ${seed}: fires must burn out, not run forever`);
  }
  // Even completely unfought, a fire must not be able to level the whole town.
  const left = grid.filter(t => m.isBurnable(m.parseTile(t))).length;
  assert.ok(left > 0, `seed ${seed}: an unfought fire still cannot raze every building`);
}

// --- damage is real, and bounded to the burning tiles ---------------------
const before = town(false);
const spot = 22 * size + 22;
const damaged = M.advanceFires(before, size, [{ index: spot, ticks: 0 }],
  M.findUtilities(before), all(M.FUNDING_MIN));
let changed = 0;
for (let i = 0; i < before.length; i++) if (before[i] !== damaged.grid[i]) changed += 1;
assert.ok(changed <= 1, 'a single tick of one fire changes at most the tile that is burning');
assert.ok(M.parseTile(damaged.grid[spot]).level <= M.parseTile(before[spot]).level,
  'burning never improves a building');

// A fire on a tile that stopped being a building simply stops.
const razed = M.emptyGrid(size);
const gone = M.advanceFires(razed, size, [{ index: spot, ticks: 0 }],
  M.findUtilities(razed), all(1));
assert.equal(gone.fires.length, 0, 'nothing left to burn: the fire ends');
assert.equal(gone.contained, 1);

// --- ignition respects the cap and never double-books a tile --------------
const packed = [];
for (let i = 0; i < M.FIRE_MAX_ACTIVE; i++) packed.push({ index: 20 * size + i, ticks: 0 });
assert.equal(M.rollFireStart(town(false), size, packed, M.findUtilities(town(false)), all(1)), -1,
  'no new fires once the cap is reached');
const busy = M.fireSurvey(exposed, size, M.findUtilities(exposed), all(1));
const taken = busy.exposed.slice();
assert.equal(M.pickFireSite(busy, taken), -1, 'never starts a second fire on a burning tile');

// --- the safety advisor leads with an active fire -------------------------
const advising = {
  stats: M.summarize(guarded), coverage: M.serviceCoverageStats(guarded, size),
  demand: M.computeDemand(M.summarize(guarded)), income: 500, upkeep: 100,
  treasury: 1000, funding: all(1), loans: [], taxRatePercent: 15,
  fires: [{ index: spot, ticks: 2 }]
};
const safety = M.cityAdvice(advising).find(a => a.advisor === 'safety');
assert.equal(safety.severity, M.SEVERITY_URGENT);
assert.match(safety.headline, /fire/i);
assert.equal(safety.overlay, 'fire', 'and points at the map view that shows it');

console.log('PASS: fuel rules, coverage lowering ignition, uncovered ground favoured, funding ' +
  'shortening fires, guaranteed termination under the cascade cap, bounded damage and advisor.');
