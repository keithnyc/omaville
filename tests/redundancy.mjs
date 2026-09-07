// Which service buildings do nothing.
//
// Coverage is spatial, so a player builds until the gaps close and then stops
// getting feedback — nothing ever says a station covers only blocks another
// station already covers. Read against a real 4,000-person save, that produced
// 63 service buildings for 90 residential lots.
//
// The report has to be trustworthy in one specific way: demolishing everything
// it names must leave every lot exactly as well served as it is now. If that
// is ever false the feature is worse than useless, because it tells players to
// bulldoze their coverage. Most of this file is that one property.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const M = vm.createContext({ Math, Number });
vm.runInContext(
  fs.readFileSync(new URL('../Model.js', import.meta.url), 'utf8').replace('.pragma library', ''),
  M);
const size = M.GRID_SIZE;
const funding = M.defaultFunding();
const at = (x, y) => y * size + x;

// --- only services whose benefit is binary are reported -------------------
{
  const keys = M.REDUNDANCY_RULES.map(r => r.key);
  assert.deepEqual(Array.from(keys).sort(), ['medical', 'police', 'schools', 'transit'],
    'exactly the services where a second building in the same place adds nothing');

  // Fire must never appear. fireContainChance falls off with distance, so a
  // second station covering the same blocks genuinely puts fires out faster —
  // calling it redundant would be telling the player to make their city worse.
  assert.ok(!keys.includes('fire'),
    'fire is graded by proximity, so an overlapping station is not redundant');
  // Power and water supply capacity, so an overlapping plant is still carrying
  // load. Reporting them would be advice to cause a brownout.
  for (const k of ['power', 'water'])
    assert.ok(!keys.includes(k), `${k} is capacity, not coverage`);
}

// --- the shapes that must and must not be flagged -------------------------
{
  // The residential extent matters as much as the station positions: a station
  // is only spare if somebody else already reaches every lot it reaches.
  const withStations = (places, from, to) => {
    const g = M.emptyGrid(size);
    for (let x = from; x < to; x++) for (let y = from; y < to; y++) g[at(x, y)] = 'R2';
    for (const [x, y, lv] of places) g[at(x, y)] = 'S' + (lv === undefined ? 1 : lv);
    return g;
  };
  const police = M.REDUNDANCY_RULES.find(r => r.key === 'police');
  const flagged = (places, from, to) =>
    M.redundantPlants(withStations(places, from, to), size, police, funding).removable.length;

  // A tight neighbourhood, well inside one station's radius of 9.
  assert.equal(flagged([[25, 25]], 21, 30), 0, 'a lone station is never redundant');
  assert.equal(flagged([[25, 25], [25, 26]], 21, 30), 1,
    'two stations covering the same small neighbourhood: one is doing nothing');
  assert.equal(flagged([[20, 25], [25, 25], [30, 25]], 21, 30), 2,
    'three covering it: two are doing nothing');

  // Spread the housing out and the same pairs stop being interchangeable —
  // each station is then the only one reaching its own edge of town.
  assert.equal(flagged([[12, 12], [37, 37]], 10, 40), 0,
    'two stations at opposite corners each hold ground the other cannot reach');
  assert.equal(flagged([[25, 25], [25, 26]], 10, 40), 0,
    'and even a near-overlapping pair is not spare if the city outgrows them');
}

// --- transit is graded, not binary ----------------------------------------
// Relief is the best depot in range rather than the sum, so a small depot
// inside a big one's reach adds nothing — but the reverse is not true.
{
  const depots = (aLevel, bLevel) => {
    const g = M.emptyGrid(size);
    for (let x = 20; x < 30; x++) for (let y = 20; y < 30; y++) g[at(x, y)] = 'R2';
    g[at(25, 25)] = 'M' + aLevel;
    g[at(26, 25)] = 'M' + bLevel;
    const rule = M.REDUNDANCY_RULES.find(r => r.key === 'transit');
    return M.redundantPlants(g, size, rule, funding).removable;
  };
  const smallBesideBig = depots(0, 2);
  assert.equal(smallBesideBig.length, 1, 'the lesser depot is the redundant one');
  assert.equal(smallBesideBig[0].level, 0,
    'and it is the small one that goes, never the big one it sits inside');
  assert.ok(M.TRANSIT_RELIEF[2] > M.TRANSIT_RELIEF[0],
    'which only means anything because a bigger depot genuinely relieves more');
}

// --- the property that makes the feature safe -----------------------------
// Demolish everything the report names, then check nothing got worse. Run over
// randomly generated cities so it is not just the shapes I thought of.
{
  let rng = 1;
  const rand = n => (rng = (rng * 1103515245 + 12345) & 0x7fffffff) % n;
  const served = grid => M.serviceCoverageStats(grid, size)
    .map(r => `${r.key}:${r.served}`).join(' ');

  let citiesWithFindings = 0;
  for (let trial = 0; trial < 40; trial++) {
    const g = M.emptyGrid(size);
    const x0 = 6 + rand(10), y0 = 6 + rand(10);
    const w = 12 + rand(20), h = 12 + rand(20);
    for (let x = x0; x < Math.min(size - 2, x0 + w); x++)
      for (let y = y0; y < Math.min(size - 2, y0 + h); y++)
        if (rand(3) > 0) g[at(x, y)] = 'R' + (1 + rand(3));
    for (const [tile, n] of [['S', 3 + rand(6)], ['N', 3 + rand(6)],
      ['H', 2 + rand(5)], ['M', 2 + rand(4)]]) {
      for (let i = 0; i < n; i++)
        g[at(x0 + rand(Math.min(w, size - x0 - 2)), y0 + rand(Math.min(h, size - y0 - 2)))] =
          tile + rand(3);
    }

    const before = served(g);
    const report = M.redundancyReport(g, size, funding);
    let after = g.slice();
    let removed = 0;
    for (const row of report) {
      for (const p of row.removable) {
        assert.equal(M.tileTypeOf(after[p.index]),
          M.REDUNDANCY_RULES.find(r => r.key === row.key).type,
          'the report names a building of the service it claims');
        after = M.bulldozeTile(after, p.index);
        removed++;
      }
    }
    if (removed > 0) citiesWithFindings++;
    assert.equal(served(after), before,
      `city ${trial}: demolishing ${removed} reported buildings changed who is served`);
  }
  assert.ok(citiesWithFindings > 20,
    `the report has to actually find things — only ${citiesWithFindings}/40 cities had any`);
}

// --- and it says what removing them is worth ------------------------------
{
  const g = M.emptyGrid(size);
  for (let x = 20; x < 30; x++) for (let y = 20; y < 30; y++) g[at(x, y)] = 'R2';
  g[at(25, 25)] = 'S1'; g[at(25, 26)] = 'S1'; g[at(24, 25)] = 'S0';
  const report = M.redundancyReport(g, size, funding);
  const total = M.redundantTotal(report);
  assert.ok(total.count >= 1);
  assert.ok(total.refund > 0, 'bulldozing reclaims construction cost, so say how much');
  assert.ok(total.saving > 0, 'and the premises they no longer cost every month');
  const police = report.find(r => r.key === 'police');
  assert.equal(police.refund,
    police.removable.reduce((t, p) => t + p.refund, 0), 'the refund is its parts');
  for (const p of police.removable)
    assert.equal(p.refund, M.totalInvestment(M.TILE_POLICE, p.level),
      'each refund is what that building actually cost to build and upgrade');

  // .length rather than deepEqual: vm-realm arrays do not match host ones.
  assert.equal(M.redundancyReport(M.emptyGrid(size), size, funding).length, 0,
    'an empty city is not nagged');
  assert.deepEqual({ ...M.redundantTotal([]) }, { count: 0, refund: 0, saving: 0 });
  assert.deepEqual({ ...M.redundantTotal(null) }, { count: 0, refund: 0, saving: 0 });
}

// --- it reaches the player, and does not cost a scan per painted tile -----
{
  const service = fs.readFileSync(new URL('../Service.qml', import.meta.url), 'utf8');
  const view = fs.readFileSync(new URL('../CityView.qml', import.meta.url), 'utf8');
  const card = fs.readFileSync(new URL('../CoverageStatus.qml', import.meta.url), 'utf8');

  // Superlinear in building count, so it must be refreshed like the traffic
  // survey — on the tick and on demand — never bound to the grid, or a road
  // drag pays for it on every tile.
  assert.ok(/property var redundancy: \[\]/.test(service),
    'redundancy is a plain property, not a binding on the grid');
  assert.ok(!/property var redundancy: Model\./.test(service),
    'binding it to the grid would run the survey on every painted tile');
  assert.ok(/function refreshRedundancy\(\)/.test(service), 'and is refreshed explicitly');
  assert.ok(/root\.refreshRedundancy\(\)/.test(service), 'on the tick');
  assert.ok(/refreshRedundancy\(\)/.test(view), 'and when a view is about to show it');

  // Two places it surfaces: the card a player already reads, and the map, so
  // they can find the building rather than just learn a number.
  assert.ok(/redundancy: root\.redundancy/.test(view), 'the coverage card is given the report');
  assert.ok(/Model\.redundantTotal/.test(card), 'which totals it for the summary line');
  assert.ok(/spare/.test(card), 'and says so on the face of the card');
  assert.ok(/spareIndices/.test(view), 'the overlay knows which buildings are spare');
  assert.ok(/isSpare/.test(view), 'and marks them differently from the rest');
}

console.log('PASS: redundant buildings found only where coverage is binary, never fire or ' +
  'utilities, demolishing every one reported leaves the city exactly as well served, and ' +
  'the survey is refreshed rather than rebound to the grid.');
