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


// --- firefighting depth ---------------------------------------------------
// Containment is now distance-based, so *where* a station sits matters and
// not just how many there are. Pin the shape of that curve.
const stationAt = 30 * size + 30;
const fireUnits = { fire: [{ index: stationAt, level: 1 }] };
const chanceAt = d => M.fireContainChance(size, fireUnits, stationAt + d, M.defaultFunding());
assert.ok(chanceAt(0) > chanceAt(4) && chanceAt(4) > chanceAt(8),
  'a blaze nearer the station is contained faster');
assert.ok(chanceAt(0) <= M.FIRE_CONTAIN_COVERED * 1.0001,
  'the doorstep rate is the covered rate, not more');
assert.equal(chanceAt(40), M.FIRE_CONTAIN_UNCOVERED, 'beyond reach falls to the token rate');
assert.equal(M.fireContainChance(size, { fire: [] }, stationAt, M.defaultFunding()),
  M.FIRE_CONTAIN_UNCOVERED, 'no station at all is the same as out of reach');
assert.ok(M.fireContainChance(size, fireUnits, stationAt, { F: M.FUNDING_MAX, S: 1, N: 1, H: 1 })
  > chanceAt(0), 'and funding still buys a faster response on top');

// Industry burns hotter than housing.
assert.ok(M.fireFuel(M.parseTile('I2')) > M.fireFuel(M.parseTile('C2')));
assert.ok(M.fireFuel(M.parseTile('C2')) > M.fireFuel(M.parseTile('R2')));
assert.equal(M.fireFuel(M.parseTile('#0')), 1, 'anything else is neutral fuel');

// --- crime waves ----------------------------------------------------------
// Crime degrades where fire destroys, so the distinction worth pinning is
// that a wave costs money and residents but never levels a building.
function district(withStation) {
  const grid = M.emptyGrid(size);
  for (let row = 40; row < 46; row++)
    for (let col = 40; col < 46; col++) grid[row * size + col] = 'R3';
  if (withStation) grid[43 * size + 43] = 'S1';
  return grid;
}
const lawless = district(false);
const policed = district(true);
const lawlessSurvey = M.crimeSurvey(lawless, size, M.findUtilities(lawless), all(1));
const policedSurvey = M.crimeSurvey(policed, size, M.findUtilities(policed), all(1));
assert.equal(lawlessSurvey.policed.length, 0);
assert.equal(policedSurvey.unpoliced.length, 0);
assert.ok(M.crimeStartChance(lawlessSurvey) > M.crimeStartChance(policedSurvey) * 2,
  'an unpoliced district sees markedly more crime');
assert.ok(M.crimeStartChance(policedSurvey) > 0, 'but policing makes it rare, not impossible');
assert.equal(M.crimeStartChance(M.crimeSurvey(M.emptyGrid(size), size,
  M.findUtilities(M.emptyGrid(size)), all(1))), 0, 'nothing to rob in an empty city');

// Theft scales with the value sitting inside the wave.
const wave = [{ index: 43 * size + 43, ticks: 0 }];
const thin = M.emptyGrid(size);
thin[43 * size + 43] = 'R1';
assert.ok(M.crimeTheft(lawless, size, wave) > M.crimeTheft(thin, size, wave) * 5,
  'crime in a dense district costs far more than crime on the edge');
assert.equal(M.crimeTheft(lawless, size, []), 0, 'no wave, no theft');
assert.equal(M.crimeTheft(M.emptyGrid(size), size, wave), 0);

// A wave drives residents out but never destroys the building itself.
const drained = load(7);
let crimeGrid = district(false);
let waves = [{ index: 43 * size + 43, ticks: 0 }];
const crimeUnits = drained.findUtilities(crimeGrid);
let totalOut = 0;
for (let tick = 0; tick < 40 && waves.length; tick++) {
  const r = drained.advanceCrime(crimeGrid, size, waves, crimeUnits, all(drained.FUNDING_MIN));
  crimeGrid = r.grid; waves = r.crimes; totalOut += r.drivenOut;
}
assert.ok(totalOut > 0, 'an unpoliced wave really does push residents out');
for (let i = 0; i < crimeGrid.length; i++) {
  const was = M.parseTile(district(false)[i]), now = M.parseTile(crimeGrid[i]);
  assert.equal(now.type, was.type, 'crime never changes what a tile is');
  assert.ok(now.level <= was.level);
  if (was.level > 0) assert.ok(now.level > 0, 'crime degrades a building, it never razes one');
}

// Policing genuinely shuts waves down sooner.
function waveDuration(fundingLevel, seed, grid) {
  const m = load(seed);
  let g = grid.slice(), w = [{ index: 43 * size + 43, ticks: 0 }];
  const u = m.findUtilities(g);
  let ticks = 0;
  while (w.length > 0 && ticks < 500) {
    const r = m.advanceCrime(g, size, w, u, all(fundingLevel));
    g = r.grid; w = r.crimes; ticks += 1;
  }
  return ticks;
}
let unpolicedTotal = 0, policedTotal = 0;
for (let seed = 1; seed <= 25; seed++) {
  unpolicedTotal += waveDuration(1, seed, district(false));
  policedTotal += waveDuration(1, seed, district(true));
}
assert.ok(policedTotal * 2 < unpolicedTotal,
  `police end a wave far sooner (${policedTotal} vs ${unpolicedTotal} ticks)`);
assert.ok(waveDuration(M.FUNDING_MAX, 3, district(true)) <= waveDuration(M.FUNDING_MIN, 3, district(true)),
  'and funding shortens it further');

// Crime terminates, and never exceeds its own cap.
for (let seed = 1; seed <= 30; seed++) {
  const m = load(seed);
  let g = district(false), w = [{ index: 43 * size + 43, ticks: 0 }];
  const u = m.findUtilities(g);
  let ticks = 0;
  while (w.length > 0) {
    const r = m.advanceCrime(g, size, w, u, all(m.FUNDING_MIN));
    g = r.grid; w = r.crimes; ticks += 1;
    assert.ok(w.length <= m.CRIME_MAX_ACTIVE, `seed ${seed}: crime respects its cap`);
    assert.ok(ticks < 3000, `seed ${seed}: a wave must end, not run forever`);
  }
}

// Waves do not stack on top of each other.
const crowded = [];
for (let i = 0; i < M.CRIME_MAX_ACTIVE; i++) crowded.push({ index: 40 * size + i * 9, ticks: 0 });
assert.equal(M.rollCrimeStart(lawless, size, crowded, M.findUtilities(lawless), all(1)), -1,
  'no new wave once the cap is reached');

// The safety advisor reports a wave and points at the police view.
const crimeAdvice = M.cityAdvice({
  stats: M.summarize(policed), coverage: M.serviceCoverageStats(policed, size),
  demand: M.computeDemand(M.summarize(policed)), income: 500, upkeep: 100, treasury: 1000,
  funding: all(1), loans: [], taxRatePercent: 15, fires: [], crimes: wave
}).find(a => a.advisor === 'safety');
assert.equal(crimeAdvice.severity, M.SEVERITY_URGENT);
assert.match(crimeAdvice.headline, /crime/i);
assert.equal(crimeAdvice.overlay, 'police');

console.log('PASS: fuel rules, coverage lowering ignition, uncovered ground favoured, funding ' +
  'shortening fires, guaranteed termination under the cascade cap, bounded damage, ' +
  'distance-based containment, and crime waves that degrade without destroying.');
