// Mass transit, trip-reducing ordinances, and congestion slowing the
// emergency response. Transit is the congestion fix you buy, so the thing
// worth pinning is that it is genuinely weaker than the ones you plan.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../Model.js', import.meta.url), 'utf8')
  .replace('.pragma library', '');
const M = vm.createContext({ Math, Number });
vm.runInContext(source, M);
const size = M.GRID_SIZE;

// A street with housing along it, jammed by design.
function jammedTown() {
  const g = M.emptyGrid(size);
  const row = 30;
  for (let c = 10; c < 24; c++) {
    g[row * size + c] = 'R2';
    g[(row + 1) * size + c] = 'R2';
    g[(row + 2) * size + c] = '#0';
  }
  return { grid: g, row, lot: row * size + 16 };
}
const survey = (g, u, f, e) => M.trafficSurvey(g, size, u || M.findUtilities(g), f, e);

// --- the transit family is a service like any other ----------------------
{
  assert.equal(M.UPGRADE_TIER_NAMES.M.length, 3);
  assert.equal(M.UPGRADE_COSTS.M.length, 3);
  assert.ok(M.COSTS.M > 0, 'a depot costs money to build');
  assert.ok(M.FUNDABLE_SERVICES.indexOf('M') >= 0, 'and money to run');
  assert.ok(M.DEPARTMENT_RATE.M > 0 && M.DEPARTMENT_NAMES.M);
  assert.equal(M.defaultFunding().M, M.FUNDING_DEFAULT);

  const g = M.emptyGrid(size);
  g[100] = 'M1';
  const u = M.findUtilities(g);
  assert.equal(u.transit.length, 1, 'findUtilities reports it');
  assert.equal(u.transit[0].level, 1);
  assert.equal(M.summarize(g).transitCount, 1);
  assert.equal(M.summarize(g).departmentPresent.M, true, 'which opts the city into the bill');
  assert.ok(M.upkeepBreakdown(M.summarize(g), M.defaultFunding(), []).some(r => r.key === 'M'),
    'and it appears as its own line on the monthly bill');

  // Education is still row 4 — the transit row was appended, not inserted.
  const rows = M.serviceCoverageStats(g, size);
  assert.equal(rows[4].key, 'schools', 'educationStats indexing is undisturbed');
  assert.equal(rows[rows.length - 1].key, 'transit');
  const def = M.overlayDef('transit');
  assert.ok(def && def.service === 'transit' && def.funding === 'M',
    'and it has a coverage overlay like every other service');
  assert.ok(M.overlayRadius(def, M.defaultFunding()) > 0);
}

// --- transit takes trips off the road ------------------------------------
{
  const { grid, row, lot } = jammedTown();
  const before = survey(grid);
  assert.ok(before.jammedRoads > 0, 'the town starts jammed');
  assert.equal(before.savedTrips, 0, 'with nothing saving any trips');

  const served = grid.slice();
  served[(row - 3) * size + 16] = 'M0';
  const after = survey(served);
  assert.ok(after.totalTrips < before.totalTrips, 'a depot removes trips');
  assert.ok(after.savedTrips > 0, 'and reports how many');
  // Relief is local, so check the road under the depot rather than the
  // citywide worst — a station only helps the blocks it actually reaches,
  // which is the whole reason placement matters.
  const nearRoad = (row + 2) * size + 16;
  assert.ok(after.roadCongestion[nearRoad] < before.roadCongestion[nearRoad],
    'the road it covers gets easier');
  const farRoad = (row + 2) * size + 10;
  assert.ok(after.roadCongestion[farRoad] >= before.roadCongestion[farRoad] - 1e-9,
    'and one out of its range is not magically helped');

  // Higher tiers do more.
  let last = after.totalTrips;
  for (const level of ['M1', 'M2']) {
    const up = grid.slice();
    up[(row - 3) * size + 16] = level;
    const s = survey(up);
    assert.ok(s.totalTrips < last, `${level} removes more than the tier below`);
    last = s.totalTrips;
  }

  // Out of range it does nothing at all.
  const far = grid.slice();
  far[(row - 3) * size + 16] = '_0';
  far[60 * size + 60] = 'M2';
  assert.equal(survey(far).totalTrips, before.totalTrips, 'a depot across the map is no help');

  // Funding widens its reach, exactly like every other department. Six tiles
  // out sits between what a starved depot reaches (4.8) and what a
  // well-funded one does (7.2), so the budget alone decides.
  const edge = grid.slice();
  edge[(row - 6) * size + 16] = 'M0';
  const starved = survey(edge, null, { M: M.FUNDING_MIN });
  const rich = survey(edge, null, { M: M.FUNDING_MAX });
  assert.ok(rich.totalTrips < starved.totalTrips,
    'a better-funded network reaches further out');
}

// --- but it is weaker than planning, and cannot reach zero ---------------
{
  assert.ok(Math.max(...M.TRANSIT_RELIEF) < M.TRIP_LOCAL_RELIEF,
    'even a transit hub beats less traffic than a walkable neighbourhood does');
  for (let i = 1; i < M.TRANSIT_RELIEF.length; i++)
    assert.ok(M.TRANSIT_RELIEF[i] > M.TRANSIT_RELIEF[i - 1], 'each tier is a real upgrade');
  assert.ok(Math.max(...M.TRANSIT_RELIEF) < 1, 'and none of them empties the road');

  // Everything at once still leaves traffic: the reliefs compound, so no
  // stack of fixes can drive a lot's trips to zero.
  const g = M.emptyGrid(size);
  const lot = 30 * size + 30;
  g[lot] = 'R3';
  g[lot + 1] = '#0';
  for (let i = 0; i < 10; i++) g[(28 + (i % 3)) * size + 32 + i] = 'C3';
  g[(27 * size) + 30] = 'M2';
  const relief = M.transitRelief(size, M.findUtilities(g).transit, lot, M.defaultFunding());
  assert.ok(relief > 0, 'the hub reaches this lot');
  const stacked = M.tileTrips(g, size, lot, M.parseTile(g[lot]), relief,
    M.ordinanceEffects(['carpool', 'telecommute', 'tolls']).tripRate);
  assert.ok(stacked > 0, 'walkability, transit and every policy together still leave trips');
  assert.ok(stacked < M.tileTrips(g, size, lot, M.parseTile(g[lot])) * 0.5,
    'but they add up to a large reduction');
}

// --- the trip ordinances ---------------------------------------------------
{
  assert.equal(M.ordinanceEffects([]).tripRate, 1, 'no policy is neutral');
  for (const id of ['carpool', 'telecommute', 'tolls']) {
    const o = M.ordinance(id);
    assert.ok(o, `${id} exists`);
    assert.ok(o.effects.tripRate < 1, `${id} actually reduces trips`);
    const downside = o.rate > 0 || o.effects.happiness < 0 || o.effects.commercialDemand < 1;
    assert.ok(downside, `${id} costs something`);
  }
  assert.ok(M.ordinance('tolls').rate < 0, 'tolls make money');
  assert.ok(M.ordinance('tolls').effects.happiness < 0, 'and are resented for it');
  assert.ok(M.ordinance('telecommute').effects.commercialDemand < 1,
    'and telecommuting keeps people out of the shops');
  // They stack multiplicatively with each other.
  const both = M.ordinanceEffects(['carpool', 'tolls']).tripRate;
  assert.ok(Math.abs(both - 0.88 * 0.9) < 1e-9, 'trip multipliers multiply');

  const { grid } = jammedTown();
  const plain = survey(grid);
  const policed = survey(grid, null, null, M.ordinanceEffects(['telecommute']));
  assert.ok(policed.totalTrips < plain.totalTrips, 'and they reach the road');
  assert.ok(policed.savedTrips > 0);
}

// --- congestion slows the emergency response -----------------------------
{
  assert.equal(M.responseScale(null, 0), 1, 'no survey, no delay');
  assert.equal(M.responseScale({ lotCongestion: { 5: 0 } }, 5), 1, 'an empty road, no delay');
  assert.equal(M.responseScale({ lotCongestion: { 5: M.CONGESTION_WATCH } }, 5), 1,
    'a busy road still gets them through');
  // Compared with a tolerance: the scale is derived by subtraction, so it
  // lands a float's breadth away from the constant rather than on it.
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  assert.ok(near(M.responseScale({ lotCongestion: { 5: M.CONGESTION_JAM } }, 5),
    M.RESPONSE_MIN_SCALE), 'a gridlocked one does not');
  assert.ok(near(M.responseScale({ lotCongestion: { 5: 99 } }, 5), M.RESPONSE_MIN_SCALE),
    'and it never gets worse than that floor');
  assert.ok(M.RESPONSE_MIN_SCALE > 0,
    'a city can always eventually put a fire out, however bad the traffic');
  const mid = M.responseScale(
    { lotCongestion: { 5: (M.CONGESTION_WATCH + M.CONGESTION_JAM) / 2 } }, 5);
  assert.ok(mid > M.RESPONSE_MIN_SCALE && mid < 1, 'in between it tapers');

  // It reaches the real containment maths.
  const town = M.emptyGrid(size);
  for (let c = 10; c < 24; c++) { town[30 * size + c] = 'R2'; town[31 * size + c] = '#0'; }
  town[28 * size + 16] = 'F1';
  const u = M.findUtilities(town);
  const spot = 30 * size + 16;
  const clear = M.fireContainChance(size, u, spot, M.defaultFunding(), null);
  const stuck = M.fireContainChance(size, u, spot, M.defaultFunding(),
    { lotCongestion: { [spot]: 2 } });
  assert.ok(stuck < clear, 'a fire in gridlock is contained more slowly');
  assert.ok(stuck > 0, 'but never never');

  // Crime suppression takes the same hit, via the same scale.
  const forced = vm.createContext({ Math: Object.assign(Object.create(Math), { random: () => 0.3 }) });
  vm.runInContext(source, forced);
  const police = town.slice();
  police[28 * size + 16] = 'S1';
  const pu = forced.findUtilities(police);
  const wave = [{ index: spot, ticks: 0 }];
  const calm = forced.advanceCrime(police, size, wave, pu, forced.defaultFunding(), null, null);
  const snarled = forced.advanceCrime(police, size, wave, pu, forced.defaultFunding(), null,
    { lotCongestion: { [spot]: 2 } });
  assert.ok(calm.suppressed >= snarled.suppressed,
    'the same roll suppresses a wave in a clear city but not a gridlocked one');
}

// --- transit pays for itself only if you use it --------------------------
{
  // A depot in an empty field is pure cost — the bill is per resident, so it
  // is the city size that is charged, not the building.
  const empty = M.emptyGrid(size);
  empty[100] = 'M2';
  const stats = M.summarize(empty);
  assert.equal(M.departmentSpend(stats, M.defaultFunding(), 'M'), 0,
    'no residents, no transit bill');
  const busy = M.emptyGrid(size);
  busy[100] = 'M0';
  for (let i = 0; i < 30; i++) busy[500 + i] = 'R3';
  assert.ok(M.departmentSpend(M.summarize(busy), M.defaultFunding(), 'M') > 0,
    'a real city pays a real bill');
}

console.log('PASS: transit as a funded, upgradeable, coverage-mapped service that removes ' +
  'trips without ever emptying a road and stays weaker than good planning, three trip ' +
  'ordinances with real downsides, and congestion that slows fire and police response ' +
  'to a floor rather than to nothing.');

// --- every service type is complete in every table it appears in ---------
// A live TypeError came from adding TILE_TRANSIT to CityView's coverageTypes
// without adding it to utilityRangeColors, so hovering the map with the new
// tool selected threw on every mouse move. qmllint cannot see that: the
// tables are plain object literals. This reads them out of the QML and checks
// them against each other, for every service, not just transit.
{
  const qml = fs.readFileSync(new URL('../CityView.qml', import.meta.url), 'utf8');
  const table = name => {
    const m = qml.match(new RegExp('readonly property var ' + name +
      ': (\\(\\{[\\s\\S]*?\\}\\)|\\[[\\s\\S]*?\\])'));
    assert.ok(m, `${name} is still declared in CityView.qml`);
    return m[1];
  };
  const tileConst = /Model\.TILE_([A-Z_]+)/g;
  const namesIn = body => Array.from(body.matchAll(tileConst), m => m[1]);
  const letterFor = {
    POWER: 'E', WATER: 'W', FIRE: 'F', POLICE: 'S', SCHOOL: 'N',
    MEDICAL: 'H', TRANSIT: 'M', PARK: 'P'
  };

  const coverage = namesIn(table('coverageTypes'));
  assert.ok(coverage.includes('TRANSIT'), 'transit offers a coverage preview');
  const colors = table('utilityRangeColors');
  const radii = table('coverageRadii');
  for (const name of coverage) {
    const key = letterFor[name];
    assert.ok(key, `${name} has a known tile letter`);
    // drawCoverageOverlay reads both of these unguarded; a missing entry is a
    // runtime TypeError on hover, not a missing circle.
    assert.match(colors, new RegExp('\\b' + key + ':'),
      `${name} has a range colour, or hovering it throws`);
    assert.match(radii, new RegExp('\\b' + key + ':'),
      `${name} has a coverage radius, or hovering it throws`);
  }

  // Anything the toolbar can upgrade needs tier names and costs in the model.
  for (const name of namesIn(table('upgradeableTypes'))) {
    const key = letterFor[name];
    assert.ok(M.UPGRADE_TIER_NAMES[key], `${name} has tier names`);
    assert.equal(M.UPGRADE_TIER_NAMES[key].length, 3);
    assert.ok(M.UPGRADE_COSTS[key], `${name} has upgrade costs`);
    assert.ok(M.COSTS[key] > 0, `${name} has a placement cost`);
    assert.ok(M.TILE_LABELS[key], `${name} has a label`);
  }

  // And every funded department must be nameable and billable.
  for (const key of M.FUNDABLE_SERVICES) {
    assert.ok(M.DEPARTMENT_NAMES[key] && M.DEPARTMENT_RATE[key] > 0,
      `${key} is a complete department`);
    assert.ok(M.defaultFunding()[key] !== undefined, `${key} has a default budget`);
  }

  console.log('PASS: every coverage, upgradeable and funded type is complete in every table.');
}

// --- an optional service must never read as a failure --------------------
// Regression: adding a Transit row to serviceCoverageStats silently cost every
// city that had not built one about 4 points of approval, because
// computeApproval averages unmet coverage across every row — and made the
// coverage widget rotate a permanent "7,470 residents unserved" alarm for a
// service nobody was owed.
{
  const town = M.emptyGrid(size);
  for (let i = 0; i < 40; i++) town[500 + i] = 'R3';
  town[400] = 'E2'; town[401] = 'W2'; town[402] = 'F2';
  town[403] = 'S2'; town[404] = 'N2'; town[405] = 'H2';
  const pop = M.summarize(town).population;

  const rows = M.serviceCoverageStats(town, size);
  const transit = rows.find(r => r.key === 'transit');
  assert.ok(transit.optional, 'transit coverage is flagged optional');
  for (const r of rows.filter(x => x.key !== 'transit'))
    assert.ok(!r.optional, 'every other service is a real need');

  assert.equal(transit.coverage, 0, 'this city has no transit at all');
  assert.ok(transit.unmet > 0, 'and the row still reports the reach honestly');

  // The whole point: not building it costs nothing at the ballot box.
  const withRow = M.computeApproval(70, rows, 0, 0, 200, pop);
  const withoutRow = M.computeApproval(70, rows.filter(r => !r.optional), 0, 0, 200, pop);
  assert.equal(withRow, withoutRow,
    'an unbuilt optional service costs no approval whatsoever');

  // A real gap still does, so the skip is not just switching the term off.
  const noWater = town.slice();
  noWater[401] = '_0';
  const gapRows = M.serviceCoverageStats(noWater, size);
  assert.ok(M.computeApproval(70, gapRows, 0, 0, 200, pop) < withRow,
    'a genuine coverage gap still costs approval');

  // And building transit never *raises* approval either — it buys traffic
  // relief, not popularity, so the two systems stay separable.
  const served = town.slice();
  served[406] = 'M2';
  assert.equal(M.computeApproval(70, M.serviceCoverageStats(served, size), 0, 0, 200, pop),
    withRow, 'building it does not buy approval either');

  // Guard the divisor: a coverage list of nothing but optional rows must not
  // divide by zero and hand back NaN.
  assert.equal(M.computeApproval(70, [transit], 0, 0, 200, pop), 70,
    'an all-optional coverage list is simply neutral');
  assert.equal(M.computeApproval(70, [], 0, 0, 200, pop), 70, 'and so is an empty one');
}

console.log('PASS: optional coverage reports reach without costing approval or raising an alarm.');
