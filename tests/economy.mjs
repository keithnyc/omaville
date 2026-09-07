// The income model. A city used to be taxed purely on headcount while its
// services bill grew with the square of built density, so past a certain size
// every new building lost money and a mature city could not grow out of a
// deficit — the one move players reach for first. These pin the fix.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const M = vm.createContext({ Math, Number });
vm.runInContext(
  fs.readFileSync(new URL('../Model.js', import.meta.url), 'utf8').replace('.pragma library', ''),
  M);
const size = M.GRID_SIZE;

// --- businesses are taxed, and commerce is the better earner -------------
{
  assert.equal(M.computeIncome(1000, 10), 1000 * 10 * 0.02,
    'a city with no businesses is taxed exactly as it always was');
  assert.equal(M.computeIncome(1000, 10, 0, 0), M.computeIncome(1000, 10),
    'and passing zero jobs changes nothing');

  assert.ok(M.computeIncome(1000, 10, 100, 0) > M.computeIncome(1000, 10),
    'commerce adds revenue');
  assert.ok(M.computeIncome(1000, 10, 0, 100) > M.computeIncome(1000, 10),
    'so does industry');
  assert.ok(M.computeIncome(0, 10, 100, 0) > M.computeIncome(0, 10, 0, 100),
    'a commercial job is worth more than an industrial one');
  assert.ok(M.COM_TAX_WEIGHT < 1,
    'but a job is still worth less than a resident, or nobody would zone housing');
  assert.ok(M.IND_TAX_WEIGHT > 0 && M.IND_TAX_WEIGHT < M.COM_TAX_WEIGHT);

  // Tax rate scales all of it, so the tax slider still means one thing.
  assert.ok(Math.abs(M.computeIncome(500, 20, 50, 50)
    - 2 * M.computeIncome(500, 10, 50, 50)) < 1e-9, 'income is linear in the tax rate');
  assert.equal(M.computeIncome(500, 0, 50, 50), 0, 'and zero tax is zero income');

  // incomeFor is the same thing read off a stats object, so no caller can
  // pass the population and quietly forget the businesses.
  const g = M.emptyGrid(size);
  for (let i = 0; i < 10; i++) { g[500 + i] = 'R3'; g[560 + i] = 'C3'; g[620 + i] = 'I3'; }
  const st = M.summarize(g);
  assert.equal(M.incomeFor(st, 12),
    M.computeIncome(st.taxablePopulation, 12, st.jobsCommercial, st.jobsIndustrial));
  assert.ok(M.incomeFor(st, 12) > M.computeIncome(st.taxablePopulation, 12),
    'and it is genuinely more than headcount alone');
}

// --- the services rate is capped -----------------------------------------
{
  assert.ok(M.DENSITY_UPKEEP_MAX_SCALE > 1, 'density still costs more than nothing');
  const rate = stats => M.upkeepBreakdown(stats, M.defaultFunding(), [])
    .find(r => r.key === 'services').amount / Math.max(1, stats.builtDensity);

  const small = { builtDensity: 100, population: 0, roadCount: 0, avenueCount: 0,
    parkCount: 0, powerUpkeep: 0, waterUpkeep: 0, decorationUpkeep: 0,
    departmentPresent: {} };
  const huge = Object.assign({}, small, { builtDensity: 100000 });
  assert.ok(rate(huge) > rate(small), 'a denser city pays a higher rate...');
  assert.ok(rate(huge) <= M.DENSITY_UPKEEP_RATE * M.DENSITY_UPKEEP_MAX_SCALE + 1e-9,
    '...but the rate stops climbing at the cap');

  // Total still rises with density — the cap bounds the rate, not the bill.
  const total = stats => M.upkeepBreakdown(stats, M.defaultFunding(), [])
    .find(r => r.key === 'services').amount;
  assert.ok(total(huge) > total(small), 'a bigger city still pays more in total');
}

// --- the property that was broken: growth must pay for itself ------------
{
  // A mature, dense city well past the old crossover point.
  const city = M.emptyGrid(size);
  let n = 0;
  for (let r = 8; r < 44; r++) {
    if (r % 3 === 0) { for (let c = 8; c < 44; c++) city[r * size + c] = '#0'; continue; }
    for (let c = 8; c < 44; c++) city[r * size + c] = (n++ % 3 === 0) ? 'C3' : 'R3';
  }
  city[4 * size + 10] = 'E2'; city[4 * size + 12] = 'W2';
  // Staffed departments matter to the comparison below: they are billed per
  // *resident*, so housing carries a running cost that a shop does not. A test
  // city with no fire or police service would make housing look better than it
  // is in any city anyone actually plays.
  city[4 * size + 14] = 'F1'; city[4 * size + 16] = 'S1';
  city[4 * size + 18] = 'N1'; city[4 * size + 20] = 'H1';
  const stats = M.summarize(city);
  assert.ok(stats.builtDensity > M.DENSITY_UPKEEP_SOFTCAP * 2,
    `the test city is genuinely dense (${stats.builtDensity})`);

  const net = (g, tax) => {
    const s = M.summarize(g);
    return M.incomeFor(s, tax) - M.computeUpkeep(s, M.defaultFunding(), []);
  };
  const perLot = (type, tax) => {
    const g = city.slice();
    let added = 0;
    for (let i = 0; i < g.length && added < 10; i++) if (g[i] === '_0') { g[i] = type; added++; }
    assert.equal(added, 10, 'there was room to build');
    return (net(g, tax) - net(city, tax)) / 10;
  };

  for (const type of ['R3', 'C3', 'I3']) {
    assert.ok(perLot(type, 12) > 0,
      `${type} must pay for itself even in a dense city (got ${perLot(type, 12).toFixed(2)})`);
  }

  // Which zone earns most depends on the tax rate, and that tension is the
  // point. Departments are billed per resident, so housing carries a running
  // cost a shop does not: below the crossover a resident does not pay back
  // what they cost in services and commerce is the better lever, above it
  // housing wins. A low-tax city is therefore business-led by necessity —
  // which is exactly the situation a player hits when the voters want cuts.
  assert.ok(perLot('C3', 8) > perLot('R3', 8),
    'at a low tax rate commerce out-earns housing');
  assert.ok(perLot('R3', 16) > perLot('C3', 16),
    'at a high tax rate housing out-earns commerce');
  assert.ok(perLot('C3', 8) > 0,
    'and commerce still pays even at a tax rate housing cannot survive');

  // Commerce always beats industry per lot: it is taxed harder and industry
  // has the nuisance penalty to justify being the cheap way to make jobs.
  for (const tax of [8, 12, 16])
    assert.ok(perLot('C3', tax) > perLot('I3', tax), `commerce beats industry at ${tax}%`);
}

// --- but a young city must still be a struggle ---------------------------
{
  const young = M.emptyGrid(size);
  for (let i = 0; i < 10; i++) { young[500 + i] = 'R1'; young[560 + i] = 'C1'; }
  young[400] = 'E0'; young[401] = 'W0';
  const st = M.summarize(young);
  const net = M.incomeFor(st, 10) - M.computeUpkeep(st, M.defaultFunding(), []);
  assert.ok(net > 0, 'a starter town is viable');
  assert.ok(net < 200, `but not rich (net ${net.toFixed(0)}) — the early game is still a squeeze`);

  // And an empty city earns nothing, however the formula is arranged.
  const empty = M.summarize(M.emptyGrid(size));
  assert.equal(M.incomeFor(empty, 20), 0, 'no city, no income');
}

console.log('PASS: businesses taxed with commerce ahead of industry, a capped services rate, ' +
  'growth that pays for itself in a dense city, and a starter town that is still a squeeze.');

// --- the long goal --------------------------------------------------------
// Borrowed from LinCity-NG's sustainable-economy win condition. It has to be a
// state the city *holds*, not one it touches once, or an idle game rewards a
// lucky moment instead of being run well.
{
  const good = {
    stats: { population: 5000 }, income: 900, upkeep: 500,
    coverage: [{ name: 'Water', key: 'water', unmet: 0 },
               { name: 'Transit', key: 'transit', unmet: 9999, optional: true }],
    traffic: null, happiness: 80, loans: []
  };
  const rows = M.sustainability(good);
  assert.ok(rows.length >= 5, 'several conditions, not one');
  for (const r of rows) {
    assert.ok(r.key && r.label && r.detail, `${r.key} is displayable`);
    assert.equal(typeof r.met, 'boolean');
  }
  assert.ok(M.sustainabilityMet(rows), 'a well-run city qualifies');
  assert.deepEqual({ ...M.sustainabilityProgress(rows) }, { met: rows.length, total: rows.length });

  // An optional service must never block the goal — otherwise it is a demand
  // to spend rather than a test of running the city well.
  assert.ok(rows.find(r => r.key === 'served').met,
    'unmet optional coverage does not count against it');

  const fails = (patch, key) => {
    const rows = M.sustainability(Object.assign({}, good, patch));
    const row = rows.find(r => r.key === key);
    assert.ok(row && !row.met, `${key} should fail`);
    assert.ok(!M.sustainabilityMet(rows), `and block the goal`);
    return rows;
  };
  fails({ income: 100 }, 'solvent');
  fails({ stats: { population: 10 } }, 'grown');
  fails({ coverage: [{ name: 'Water', key: 'water', unmet: 40 }] }, 'served');
  fails({ happiness: 20 }, 'content');
  fails({ loans: [{ remaining: 500, payment: 10 }] }, 'unencumbered');
  fails({ traffic: { lotCongestion: Object.fromEntries(
    Array.from({ length: 10 }, (_, i) => [i, 5])) } }, 'moving');

  // The streak accumulates only while everything holds, and resets hard.
  let held = 0;
  for (let i = 0; i < 5; i++) held = M.advanceSustainability(rows, held);
  assert.equal(held, 5, 'holding accumulates');
  held = M.advanceSustainability(M.sustainability({ ...good, happiness: 10 }), held);
  assert.equal(held, 0, 'one lapse resets the streak entirely');
  assert.equal(M.advanceSustainability([], 9), 0, 'no criteria is not success');
  assert.ok(M.SUSTAINABLE_HOLD_TICKS > 1, 'and it must be held for a real span');
}

console.log('PASS: a sustainability goal that must be held, resets on any lapse, ' +
  'and is never blocked by an optional service.');

// --- coverage must never claim 100% while anyone is unserved -------------
// Reported from a live city: "Education 100% covered · 30 residents unserved".
// 8,070 of 8,100 is 99.6%, which rounded up. The percentage and the headcount
// are read side by side on the status line, so they have to agree.
{
  const rows = () => {
    const g = M.emptyGrid(size);
    // A big well-served block, plus one lone house far outside every radius.
    for (let r = 10; r < 20; r++) for (let c = 10; c < 30; c++) g[r * size + c] = 'R3';
    g[15 * size + 20] = 'N2';
    g[60 * size + 60] = 'R1';
    return M.serviceCoverageStats(g, size);
  };
  const edu = rows().find(r => r.key === 'schools');
  assert.ok(edu.unmet > 0, 'somebody is genuinely unserved');
  assert.ok(edu.coverage < 100,
    `coverage must not read 100% with ${edu.unmet} unserved (got ${edu.coverage}%)`);
  assert.ok(edu.coverage > 90, 'but it should still read as nearly complete');
  assert.equal(edu.coverage, 99,
    'a near-miss caps at 99 rather than being floored somewhere lower');

  // Ordinary percentages are still rounded, not floored — only the top is
  // capped, so a two-thirds-covered city still reads 67%.
  const twoThirds = (() => {
    const g = M.emptyGrid(size);
    g[15 * size + 20] = 'R3'; g[15 * size + 21] = 'R3'; g[50 * size + 50] = 'R3';
    g[15 * size + 22] = 'N0';
    return M.serviceCoverageStats(g, size).find(r => r.key === 'schools');
  })();
  assert.equal(twoThirds.coverage, 67, '2 of 3 rounds to 67, not 66');

  // The two directions that must stay exact.
  const empty = M.serviceCoverageStats(M.emptyGrid(size), size);
  for (const r of empty) {
    assert.equal(r.unmet, 0, 'nobody to serve');
    assert.equal(r.coverage, 100, 'and an empty city is not a failure');
  }

  const served = (() => {
    const g = M.emptyGrid(size);
    g[15 * size + 20] = 'R3';
    for (const [t, at] of [['E2', 0], ['W2', 1], ['F2', 2], ['S2', 3],
                           ['N2', 4], ['H2', 5], ['M2', 6]])
      g[15 * size + 21 + at] = t;
    return M.serviceCoverageStats(g, size);
  })();
  for (const r of served) {
    assert.equal(r.unmet, 0, `${r.name} reaches everyone`);
    assert.equal(r.coverage, 100, `${r.name} therefore reads exactly 100%`);
  }
}

console.log('PASS: coverage percentages agree with the headcount beside them.');

// --- civic level: progress that can be lost ------------------------------
// LinCity-NG's tech level, adapted. Every unlock here was gated on population,
// which only ever rises, so nothing was ever at stake. This climbs while
// education reaches people and is funded, and slides back when either lapses.
{
  const town = school => {
    const g = M.emptyGrid(size);
    // Homes tight around the school: a tier-1 school only reaches 6 tiles, and
    // a fixture where it cannot cover its own town would be measuring reach
    // rather than the ladder.
    for (let c = 18; c < 24; c++) g[15 * size + c] = 'R3';
    if (school !== null) g[16 * size + 21] = school;
    return g;
  };
  const target = (school, funding) => {
    const g = town(school);
    return M.civicTarget(M.serviceCoverageStats(g, size),
      funding || M.defaultFunding(), M.findUtilities(g));
  };

  // The school ladder maps onto the civic ladder: elementary supports tier 2,
  // only a university supports tier 3.
  assert.equal(target(null), M.CIVIC_MIN, 'no schools, no civic standing');
  assert.ok(target('N0') >= 2, 'an elementary system supports tier 2');
  assert.ok(target('N0') < 3, 'but not tier 3');
  assert.ok(target('N1') > target('N0'), 'a high school is worth more');
  assert.ok(target('N1') < 3, 'and still not enough for tier 3');
  assert.equal(target('N2'), M.CIVIC_MAX, 'a university system reaches the top');

  // Money and reach both matter, which is what makes it losable.
  assert.ok(target('N2', { N: M.FUNDING_MIN }) < target('N2'),
    'starving the schools lowers what the city can sustain');
  const farAway = (() => {
    const g = town('N2');
    g[60 * size + 60] = 'R3';   // a district the university cannot reach
    return M.civicTarget(M.serviceCoverageStats(g, size), M.defaultFunding(),
      M.findUtilities(g));
  })();
  assert.ok(farAway < M.CIVIC_MAX, 'and so does leaving a district unschooled');

  // It moves gradually, in both directions, and cannot be rushed or crash.
  assert.ok(M.advanceCivic(1, 3) > 1 && M.advanceCivic(1, 3) < 3, 'climbs gradually');
  assert.ok(M.advanceCivic(3, 1) < 3 && M.advanceCivic(3, 1) > 1, 'falls gradually');
  assert.equal(M.advanceCivic(2, 2), 2, 'and holds when nothing changes');
  assert.equal(M.advanceCivic(undefined, 3), M.CIVIC_MIN + M.CIVIC_RATE,
    'a missing value starts at the bottom rather than NaN');
  let up = M.CIVIC_MIN;
  for (let i = 0; i < 200; i++) up = M.advanceCivic(up, 9);
  assert.equal(up, M.CIVIC_MAX, 'and it is bounded above');

  // The gate itself.
  assert.ok(M.civicAllowsTier(1, 0), 'tier 1 is always available');
  assert.ok(!M.civicAllowsTier(1, 1), 'tier 2 needs civic 2');
  assert.ok(M.civicAllowsTier(2, 1) && !M.civicAllowsTier(2, 2), 'tier 3 needs civic 3');
  assert.ok(M.civicAllowsTier(3, 2));
  assert.ok(M.civicAllowsTier(undefined, 2),
    'an unknown civic level must not lock anything — old saves and old callers');

  // Construction is gated; nothing already standing is ever condemned.
  const g = town('N0');
  const spot = 20 * size + 20;
  const rich = 999999;
  assert.equal(M.canBuildTier(g, spot, 'F', 0, 5000, rich, 1).ok, true, 'tier 1 always buildable');
  assert.equal(M.canBuildTier(g, spot, 'F', 1, 5000, rich, 1).ok, false, 'tier 2 blocked at civic 1');
  assert.equal(M.canBuildTier(g, spot, 'F', 1, 5000, rich, 2).ok, true, 'and allowed at civic 2');
  assert.equal(M.canBuildTier(g, spot, 'F', 2, 5000, rich, 2).ok, false, 'tier 3 blocked at civic 2');
  assert.equal(M.canBuildTier(g, spot, 'F', 2, 5000, rich, 3).ok, true, 'and allowed at civic 3');

  const upg = M.canUpgrade('F', 1, 5000, rich, 2);
  assert.equal(upg.ok, false);
  assert.equal(upg.reason, 'unschooled', 'and the reason is reportable');
  assert.equal(upg.civicNeeded, 3);
  assert.ok(M.civicLabel(upg.civicNeeded), 'which has a name to show');

  // An existing tier-3 building keeps standing when schooling lapses — the
  // level gates what you may build, never what you already built.
  const built = M.emptyGrid(size);
  built[spot] = 'F2';
  const after = M.tickGrid(built, size, M.summarize(built), 70, M.findUtilities(built),
    { R: 1, C: 1, I: 1 }, M.defaultFunding());
  assert.equal(after[spot], 'F2', 'a finished building is never condemned by civic decay');
}

console.log('PASS: a civic level earned from schooling, lost when it lapses, gating what ' +
  'may be built without ever condemning what stands.');

// --- civic level must not confiscate on migration ------------------------
{
  // 99% education coverage lands at 2.98. Locking tier 3 over that last
  // percent would read as a bug, so the gate forgives a rounding gap.
  assert.ok(M.CIVIC_TOLERANCE > 0 && M.CIVIC_TOLERANCE < 0.2, 'a small tolerance, not a loophole');
  assert.ok(M.civicAllowsTier(2.98, 2), 'a city one rounding error short still builds tier 3');
  assert.ok(!M.civicAllowsTier(2.5, 2), 'but letting schooling slide really does lock it');

  // What is already standing sets the floor a legacy save starts from.
  const g = M.emptyGrid(size);
  assert.equal(M.highestBuiltTier(g), 0, 'an empty city has built nothing');
  g[100] = 'F0'; assert.equal(M.highestBuiltTier(g), 0);
  g[101] = 'N2'; assert.equal(M.highestBuiltTier(g), 2, 'a university counts');
  g[102] = 'R3'; assert.equal(M.highestBuiltTier(g), 2, 'but a grown house is not a tier build');
  assert.ok(M.civicAllowsTier(M.highestBuiltTier(g) + 1, M.highestBuiltTier(g)),
    'so a migrated city can always still build what it already has');
}

console.log('PASS: civic gating forgives a rounding gap and never demotes a city on load.');

// --- money is written one way everywhere ---------------------------------
// The bar widget had its own copy of this and the panel had none, so the same
// treasury appeared with separators in one place and without them in another.
{
  assert.equal(M.money(0), '$0');
  assert.equal(M.money(999), '$999', 'no separator below a thousand');
  assert.equal(M.money(1000), '$1,000');
  assert.equal(M.money(161320), '$161,320');
  assert.equal(M.money(1234567), '$1,234,567');
  assert.equal(M.money(-4500), '-$4,500', 'a deficit keeps its sign outside the symbol');
  assert.equal(M.money(3.7), '$4', 'rounded, since cents are never shown');
  // Anything the UI might hand it before the city has loaded.
  for (const empty of [null, undefined, NaN, ''])
    assert.equal(M.money(empty), '$0', `${String(empty)} reads as nothing, not NaN`);
}

console.log('PASS: one money formatter, with separators, signs and safe defaults.');
