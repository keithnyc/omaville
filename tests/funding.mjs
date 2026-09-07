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

// Derived from FUNDABLE_SERVICES rather than listed, so adding a department
// extends the coverage here instead of silently going stale.
const services = Array.from(M.FUNDABLE_SERVICES);
const all = level => Object.fromEntries(services.map(k => [k, level]));

// --- clamping and defaults ------------------------------------------------
// Spread to a host object: values built inside the vm context carry that
// realm's prototype, which deepStrictEqual treats as a mismatch.
assert.deepEqual({ ...M.defaultFunding() }, all(M.FUNDING_DEFAULT),
  'every fundable department starts at the neutral default');
for (const key of services) {
  assert.ok(M.DEPARTMENT_RATE[key] > 0, `${key} has a per-resident rate`);
  assert.ok(M.DEPARTMENT_NAMES[key], `${key} has a display name`);
}
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

// A department's bill has two halves: staff, charged per resident served, and
// premises, charged per building owned. Staffing is what makes it a lasting
// sink rather than a one-off purchase; premises are what stop eight stations
// costing the same as two.
const big = M.emptyGrid(size);
for (let i = 0; i < 40; i++) big[500 + i] = 'R3';
big[600] = 'F0';
const bigStats = M.summarize(big);
assert.ok(bigStats.population > withFire.population);
assert.ok(M.departmentStaffing(bigStats, all(1), 'F')
  > M.departmentStaffing(withFire, all(1), 'F') * 1.9,
  'twice the residents costs about twice as much to police/protect');
assert.equal(M.departmentPremises(bigStats, 'F'), M.departmentPremises(withFire, 'F'),
  'but the same one firehouse costs the same to keep whoever lives around it');
assert.ok(M.departmentSpend(bigStats, all(1), 'F') > M.departmentSpend(withFire, all(1), 'F'),
  'so the total still rises with the city');
assert.ok(M.departmentSpend(withFire, all(1.5), 'F') > M.departmentSpend(withFire, all(1), 'F'),
  'raising the slider costs more');
assert.equal(M.departmentPremises(withFire, 'F'), M.departmentPremises(withFire, 'F'),
  'and the slider does not touch premises — a building costs what it costs');

// --- premises make consolidating worth doing ------------------------------
// The whole reason a player ends up with eight tier-0 stations is that nothing
// ever charged them for it. One big building must beat the several small ones
// it replaces, or the advice to upgrade is empty.
{
  // Coverage is a Chebyshev square, so a tier's reach is (2 * r + 1) squared.
  const reach = tier => {
    const r = Math.floor(M.POLICE_RADIUS * M.INFRA_RADIUS_SCALE[tier]);
    return (2 * r + 1) * (2 * r + 1);
  };
  const premises = tier => {
    const g = M.emptyGrid(size);
    for (let i = 0; i < 20; i++) g[500 + i] = 'R3';
    g[600] = 'S' + tier;
    return M.departmentPremises(M.summarize(g), 'S');
  };
  // What actually has to hold: a bigger station is cheaper for every block it
  // covers. It is *not* true that one tier-2 undercuts any number of tier-0s —
  // it beats the six it genuinely replaces (3.30 units against 1.85), not two.
  const perBlock = tier => premises(tier) / reach(tier);
  assert.ok(perBlock(1) < perBlock(0), 'a tier-1 station is cheaper per block covered');
  assert.ok(perBlock(2) < perBlock(1), 'and a tier-2 cheaper still');
  assert.ok(premises(2) < premises(0) * (reach(2) / reach(0)),
    'so replacing the tier-0s that cover the same ground with one tier-2 saves money');
  assert.ok(premises(2) > premises(0),
    'though a single bigger building on its own does cost more than a single small one');

  const many = M.emptyGrid(size);
  for (let i = 0; i < 20; i++) many[500 + i] = 'R3';
  for (let i = 0; i < 6; i++) many[600 + i * 2] = 'S0';
  const one = M.emptyGrid(size);
  for (let i = 0; i < 20; i++) one[500 + i] = 'R3';
  one[600] = 'S2';
  assert.ok(M.departmentPremises(M.summarize(one), 'S')
    < M.departmentPremises(M.summarize(many), 'S'),
    'six tier-0 stations cost more to keep than the one tier-2 that covers them');
  assert.equal(M.departmentStaffing(M.summarize(one), all(1), 'S'),
    M.departmentStaffing(M.summarize(many), all(1), 'S'),
    'while the staffing bill is unchanged — the same residents are served');
  assert.equal(M.departmentPremises(M.summarize(M.emptyGrid(size)), 'S'), 0,
    'and a city with no station owns no premises');
}

// --- money actually buys reach --------------------------------------------
const plants = [{ index: 0, level: 1 }];
const far = 12 * size; // 12 tiles straight down from the plant
assert.ok(!M.isCovered(size, plants, far, M.FIRE_RADIUS * M.fundingRadiusScale(1)),
  'out of reach at 100%');
assert.ok(M.isCovered(size, plants, far, M.FIRE_RADIUS * M.fundingRadiusScale(M.FUNDING_MAX) * 1.2),
  'a wider radius reaches further');

// --- the balance targets the rates were tuned to --------------------------
// A mature city should run a surplus at default funding, save real money by
// starving its departments, and pay real money for funding them well.
//
// These bounds were re-derived once, because they had stopped describing this
// city. They were written against computeIncome(population, tax), which is
// residential income only — so from the moment commerce and industry became
// taxable this measured a city earning half what it actually earns, and the
// numbers it asserted (a deficit at maximum funding, a swing worth 30% of
// income) were true of a city that no longer existed. It now uses incomeFor,
// which is the call that exists precisely so nobody forgets the businesses.
//
// Worth knowing rather than hiding: at this size the funding slider moves 21%
// of income and cannot push the city into the red on its own.
const city = M.emptyGrid(size);
let at = 0;
const put = (v, n) => { for (let i = 0; i < n; i++) { city[at] = v; at += 1; } };
put('R3', 23); put('C3', 24); put('I3', 30); put('#0', 112);
put('E1', 4); put('W1', 5); put('F1', 2); put('S1', 2); put('N1', 3); put('H1', 4);
const stats = M.summarize(city);
const income = M.incomeFor(stats, 15);
const net = level => income - M.computeUpkeep(stats, all(level));

assert.ok(net(1) > 0, 'default funding still leaves a surplus to build with');
assert.ok(net(1) < income * 0.5, 'but not a runaway one — money has to be managed');
assert.ok(net(M.FUNDING_MIN) > net(1), 'starving departments saves real money');
assert.ok(net(M.FUNDING_MAX) < net(1), 'funding everything to the hilt costs real money');
assert.ok(net(M.FUNDING_MIN) - net(M.FUNDING_MAX) > income * 0.15,
  'the range swings enough of the budget to be a real decision');

// A young city must not be crushed by the same rates.
const young = M.emptyGrid(size);
for (let i = 0; i < 10; i++) young[500 + i] = 'R1';
young[600] = 'F0'; young[601] = '#0';
const youngStats = M.summarize(young);
assert.ok(M.incomeFor(youngStats, 10) - M.computeUpkeep(youngStats, all(1)) > 0,
  'a starter town with one firehouse still runs in the black');
// Including the premises cost of that firehouse, which is the point: the very
// first service building must not be the thing that sinks a new town.
assert.ok(M.departmentPremises(youngStats, 'F') > 0, 'and it is genuinely being charged for');


// --- the itemised bill must equal what is actually charged ----------------
// The whole value of showing a breakdown is that it cannot drift from the
// real deduction, so assert the identity rather than trusting it.
for (const [grid, funding] of [[city, all(1)], [city, all(0.5)], [city, all(1.5)],
                               [young, all(1)], [bare, all(1.25)]]) {
  const st = M.summarize(grid);
  const bill = M.upkeepBreakdown(st, funding);
  const summed = bill.reduce((t, row) => t + row.amount, 0);
  assert.ok(Math.abs(summed - M.computeUpkeep(st, funding)) < 1e-9,
    'every itemised bill must sum to exactly the upkeep charged');
  for (const row of bill) {
    assert.ok(row.label && row.key, 'every line is displayable');
    assert.ok(row.amount >= 0, 'no negative line items');
  }
}

// --- recurring cost shown at the point of purchase ------------------------
// Infrastructure used to be effectively free to keep; these are the numbers
// the build hint promises, so they must be real.
assert.ok(M.monthlyCostOf('E', 0) > 0 && M.monthlyCostOf('W', 0) > 0 && M.monthlyCostOf('#', 0) > 0);
assert.ok(M.monthlyCostOf('E', 2) > M.monthlyCostOf('E', 0), 'a bigger plant costs more to run');
assert.equal(M.monthlyCostOf('R', 0), 0, 'zoning itself carries no direct monthly cost');
// Departments are billed per resident, so an extra station is not a second bill.
assert.equal(M.monthlyCostOf('F', 0), 0);

// Adding a plant really does raise the bill by exactly what was quoted.
const before = M.emptyGrid(size);
for (let i = 0; i < 20; i++) before[500 + i] = 'R3';
const after = before.slice();
after[900] = 'E0';
const delta = M.computeUpkeep(M.summarize(after), all(1)) - M.computeUpkeep(M.summarize(before), all(1));
assert.ok(Math.abs(delta - M.monthlyCostOf('E', 0)) < 1e-9,
  'the quoted monthly cost is what the next bill actually rises by');

console.log(`PASS: clamping, neutral defaults, per-resident billing, coverage purchase, balance, itemised billing and quoted monthly costs ` +
  `(mature city net ${net(1).toFixed(0)}/tick at 100%, ${net(M.FUNDING_MIN).toFixed(0)} at 50%, ` +
  `${net(M.FUNDING_MAX).toFixed(0)} at 150%).`);
