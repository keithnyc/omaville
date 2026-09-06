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
