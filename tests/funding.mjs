// Department funding: the permanent money sink. Covers billing, the
// coverage/risk effects money buys, save round-tripping, and the balance
// targets the rates were tuned to hit.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const M = vm.createContext({ Math });
vm.runInContext(
  fs.readFileSync(new URL('../Model.js', import.meta.url), 'utf8').replace('.pragma library', ''),
  M);

const all = level => ({ F: level, S: level, N: level, H: level });

// --- clamping and defaults ------------------------------------------------
// Spread to a host object: values built inside the vm context carry that
// realm's prototype, which deepStrictEqual treats as a mismatch.
assert.deepEqual({ ...M.defaultFunding() }, { F: 1, S: 1, N: 1, H: 1 });
assert.equal(M.fundingLevel(undefined, 'F'), M.FUNDING_DEFAULT, 'missing budget reads as default');
assert.equal(M.fundingLevel({}, 'F'), M.FUNDING_DEFAULT, 'missing department reads as default');
assert.equal(M.fundingLevel({ F: 'nonsense' }, 'F'), M.FUNDING_DEFAULT);
assert.equal(M.fundingLevel({ F: 99 }, 'F'), M.FUNDING_MAX, 'clamped high');
assert.equal(M.fundingLevel({ F: -5 }, 'F'), M.FUNDING_MIN, 'clamped low');

// --- default funding must be exactly neutral ------------------------------
// Every radius and risk constant is written against 100%, so an existing city
// loading with no saved budget must behave precisely as it did before.
assert.equal(M.fundingRadiusScale(1), 1, '100% funding is the radius baseline');
assert.equal(M.fundingRiskScale(1), 1, '100% funding is the risk baseline');
assert.ok(M.fundingRadiusScale(M.FUNDING_MIN) < 1 && M.fundingRadiusScale(M.FUNDING_MIN) > 0.5,
  'a starved department is degraded, not useless');
assert.ok(M.fundingRiskScale(M.FUNDING_MIN) > 1, 'underfunding raises risk');
assert.ok(M.fundingRiskScale(M.FUNDING_MAX) < 1, 'overfunding lowers risk');

// --- you are only billed for departments you have built -------------------
const size = M.GRID_SIZE;
const bare = M.emptyGrid(size);
assert.equal(M.computeUpkeep(M.summarize(bare), all(1.5)), 0,
  'an empty city pays nothing however the sliders are set');

const town = M.emptyGrid(size);
for (let i = 0; i < 20; i++) town[500 + i] = 'R3';
const noDepts = M.summarize(town);
assert.equal(M.departmentSpend(noDepts, all(1), 'F'), 0, 'no firehouse, no fire budget');
town[600] = 'F0';
const withFire = M.summarize(town);
assert.ok(M.departmentSpend(withFire, all(1), 'F') > 0, 'building one opts the city in');
assert.equal(M.departmentSpend(withFire, all(1), 'S'), 0, 'other departments stay unbilled');

// Cost scales with residents served, which is what makes it a lasting sink
// rather than a one-off purchase.
const big = M.emptyGrid(size);
for (let i = 0; i < 40; i++) big[500 + i] = 'R3';
big[600] = 'F0';
const bigStats = M.summarize(big);
assert.ok(bigStats.population > withFire.population);
assert.ok(M.departmentSpend(bigStats, all(1), 'F') > M.departmentSpend(withFire, all(1), 'F') * 1.9,
  'twice the residents costs about twice as much to police/protect');
assert.ok(M.departmentSpend(withFire, all(1.5), 'F') > M.departmentSpend(withFire, all(1), 'F'),
  'raising the slider costs more');

// --- money actually buys reach --------------------------------------------
const plants = [{ index: 0, level: 1 }];
const far = 12 * size; // 12 tiles straight down from the plant
assert.ok(!M.isCovered(size, plants, far, M.FIRE_RADIUS * M.fundingRadiusScale(1)),
  'out of reach at 100%');
assert.ok(M.isCovered(size, plants, far, M.FIRE_RADIUS * M.fundingRadiusScale(M.FUNDING_MAX) * 1.2),
  'a wider radius reaches further');

// --- the balance targets the rates were tuned to --------------------------
// A mature city should run a modest surplus at default funding, be able to
// save by starving its departments, and be able to overspend into deficit.
const city = M.emptyGrid(size);
let at = 0;
const put = (v, n) => { for (let i = 0; i < n; i++) { city[at] = v; at += 1; } };
put('R3', 23); put('C3', 24); put('I3', 30); put('#0', 112);
put('E1', 4); put('W1', 5); put('F1', 2); put('S1', 2); put('N1', 3); put('H1', 4);
const stats = M.summarize(city);
const income = M.computeIncome(stats.taxablePopulation, 15);
const net = level => income - M.computeUpkeep(stats, all(level));

assert.ok(net(1) > 0, 'default funding still leaves a surplus to build with');
assert.ok(net(1) < income * 0.35, 'but not a runaway one — money has to be managed');
assert.ok(net(M.FUNDING_MIN) > net(1), 'starving departments saves real money');
assert.ok(net(M.FUNDING_MAX) < 0, 'funding everything to the hilt runs a deficit');
assert.ok(net(M.FUNDING_MIN) - net(M.FUNDING_MAX) > income * 0.3,
  'the range swings enough of the budget to be a real decision');

// A young city must not be crushed by the same rates.
const young = M.emptyGrid(size);
for (let i = 0; i < 10; i++) young[500 + i] = 'R1';
young[600] = 'F0'; young[601] = '#0';
const youngStats = M.summarize(young);
assert.ok(M.computeIncome(youngStats.taxablePopulation, 10) - M.computeUpkeep(youngStats, all(1)) > 0,
  'a starter town with one firehouse still runs in the black');

console.log(`PASS: clamping, neutral defaults, per-resident billing, coverage purchase, and balance ` +
  `(mature city net ${net(1).toFixed(0)}/tick at 100%, ${net(M.FUNDING_MIN).toFixed(0)} at 50%, ` +
  `${net(M.FUNDING_MAX).toFixed(0)} at 150%).`);
