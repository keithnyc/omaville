// Traffic congestion. The system is only worth having if each of the three
// counter-strategies measurably works — mix your zoning, connect your grid,
// or widen the road — so each one is pinned here against the others.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../Model.js', import.meta.url), 'utf8')
  .replace('.pragma library', '');
const M = vm.createContext({ Math, Number });
vm.runInContext(source, M);
const size = M.GRID_SIZE;

// A lot with roads on every side, so trips have somewhere to go.
function lotWithRoads(type, roads) {
  const g = M.emptyGrid(size);
  const at = 20 * size + 20;
  g[at] = type;
  for (const d of roads) g[at + d] = '#0';
  return { grid: g, at };
}

// --- trips come from density, and both sides of a commute generate them ---
{
  const { grid, at } = lotWithRoads('R1', [-1]);
  const one = M.tileTrips(grid, size, at, M.parseTile(grid[at]));
  grid[at] = 'R3';
  const three = M.tileTrips(grid, size, at, M.parseTile(grid[at]));
  assert.ok(three > one * 2.5, 'a dense block generates far more trips than a sparse one');

  for (const type of ['C2', 'I2']) {
    grid[at] = type;
    assert.ok(M.tileTrips(grid, size, at, M.parseTile(grid[at])) > 0,
      `${type} generates trips too — jobs draw traffic in, not just homes out`);
  }
  grid[at] = 'P0';
  assert.equal(M.tileTrips(grid, size, at, M.parseTile(grid[at])), 0, 'a park generates none');
  grid[at] = 'R0';
  assert.equal(M.tileTrips(grid, size, at, M.parseTile(grid[at])), 0, 'nor does an empty zone');
}

// --- LEVER 1: mixing zones cuts trips at the source (costs nothing) -------
{
  const bedroom = M.emptyGrid(size);
  const at = 30 * size + 30;
  bedroom[at] = 'R3';
  bedroom[at - 1] = '#0';
  const isolated = M.tileTrips(bedroom, size, at, M.parseTile(bedroom[at]));

  const mixed = bedroom.slice();
  for (let i = 0; i < 8; i++) mixed[(28 + (i % 3)) * size + 32 + i] = 'C3';
  const local = M.tileTrips(mixed, size, at, M.parseTile(mixed[at]));
  assert.ok(local < isolated, 'jobs within walking distance absorb commutes');
  assert.ok(local >= isolated * (1 - M.TRIP_LOCAL_RELIEF) - 1e-9,
    'but never all of them — somebody always drives');

  // Symmetric: a shop with customers nearby also generates fewer car trips.
  const shop = M.emptyGrid(size);
  shop[at] = 'C3'; shop[at - 1] = '#0';
  const alone = M.tileTrips(shop, size, at, M.parseTile(shop[at]));
  for (let i = 0; i < 8; i++) shop[(28 + (i % 3)) * size + 32 + i] = 'R3';
  assert.ok(M.tileTrips(shop, size, at, M.parseTile(shop[at])) < alone,
    'and customers nearby do the same for a shop');

  // Distance matters: the same jobs far away relieve nothing.
  const faraway = bedroom.slice();
  for (let i = 0; i < 8; i++) faraway[(50 + (i % 3)) * size + 50 + i] = 'C3';
  assert.equal(M.tileTrips(faraway, size, at, M.parseTile(faraway[at])), isolated,
    'jobs across the map are not walkable and relieve nothing');
}

// --- LEVER 2: a connected grid spreads the same trips (costs nothing) -----
{
  // Identical buildings, identical count. One town hangs off a single spine;
  // the other has streets on both sides. Same trips, different congestion.
  const spine = M.emptyGrid(size);
  const grid2 = M.emptyGrid(size);
  const row = 30;
  for (let c = 10; c < 22; c++) {
    spine[row * size + c] = 'R3';
    grid2[row * size + c] = 'R3';
    spine[(row + 1) * size + c] = '#0';
    grid2[(row + 1) * size + c] = '#0';
    grid2[(row - 1) * size + c] = '#0';
  }
  const a = M.trafficSurvey(spine, size);
  const b = M.trafficSurvey(grid2, size);
  assert.ok(Math.abs(a.totalTrips - b.totalTrips) < 1e-9,
    'the two towns generate exactly the same trips');
  assert.ok(b.worst < a.worst * 0.75,
    'but spreading them over a second street roughly halves the worst road');
  const spineLots = Object.values(a.lotCongestion);
  const gridLots = Object.values(b.lotCongestion);
  assert.ok(Math.max(...gridLots) < Math.max(...spineLots),
    'and every lot is better off for it');
}

// --- LEVER 3: avenues raise what one tile can carry (costs money) ---------
{
  assert.ok(M.roadCapacity(2) > M.roadCapacity(0) * 2, 'an avenue is worth more than two streets');
  assert.equal(M.roadCapacity(3), M.roadCapacity(2), 'an avenue bridge carries an avenue load');
  assert.equal(M.roadCapacity(1), M.roadCapacity(0), 'a plain bridge carries a street load');
  assert.equal(M.roadCapacity(99), M.roadCapacity(0), 'a nonsense level falls back to a street');

  const town = M.emptyGrid(size);
  const row = 30;
  for (let c = 10; c < 22; c++) {
    town[row * size + c] = 'R3';
    town[(row + 1) * size + c] = '#0';
  }
  const before = M.trafficSurvey(town, size);
  assert.ok(before.jammedRoads > 0, 'the single street is jammed');

  const widened = town.slice();
  for (let c = 10; c < 22; c++) widened[(row + 1) * size + c] = '#2';
  const after = M.trafficSurvey(widened, size);
  assert.equal(after.totalTrips, before.totalTrips, 'widening does not change demand');
  assert.equal(after.jammedRoads, 0, 'only what the road can carry');
  assert.ok(after.worst < before.worst, 'and the worst road improves');
}

// --- congestion throttles growth, and the overlay agrees with the tick ----
{
  assert.equal(M.trafficGrowthScale(0), 1, 'an empty road never slows anything');
  assert.equal(M.trafficGrowthScale(M.CONGESTION_WATCH - 0.01), 1, 'nor does a busy one');
  assert.equal(M.trafficGrowthScale(M.CONGESTION_JAM), 0, 'a jammed road stops growth dead');
  assert.equal(M.trafficGrowthScale(9), 0, 'and stays stopped');
  const mid = M.trafficGrowthScale((M.CONGESTION_WATCH + M.CONGESTION_JAM) / 2);
  assert.ok(mid > 0 && mid < 1, 'between the two it tapers rather than switching');

  assert.equal(M.lotCongestion(null, 5), 0, 'no survey reads as free-flowing');
  assert.equal(M.lotCongestion({ lotCongestion: {} }, 5), 0, 'and so does an unlisted lot');

  // A lot the overlay calls gridlocked must be one the tick really refuses to
  // grow. Force every roll maximally favourable: if it still never rises, the
  // block is real rather than unlucky.
  const jam = M.emptyGrid(size);
  const row = 30;
  // Two rows of housing hanging off one street — the classic mistake the
  // whole system exists to punish.
  for (let c = 10; c < 24; c++) {
    jam[row * size + c] = 'R2';
    jam[(row + 1) * size + c] = 'R2';
    jam[(row + 2) * size + c] = '#0';
  }
  jam[(row - 4) * size + 16] = 'E2';
  jam[(row - 4) * size + 17] = 'W2';
  const traffic = M.trafficSurvey(jam, size);
  const spot = row * size + 16;
  assert.ok(M.lotCongestion(traffic, spot) >= M.CONGESTION_JAM, 'this lot is gridlocked');

  const u = M.findUtilities(jam);
  assert.equal(M.growthBlocker(jam, size, spot, u, 70, traffic), 'traffic',
    'and the overlay names traffic as the reason');
  assert.ok(M.GROWTH_BLOCKER_LABELS.traffic, 'which is displayable');

  const forced = vm.createContext({ Math: Object.assign(Object.create(Math), { random: () => 0 }) });
  vm.runInContext(source, forced);
  const stats = M.summarize(jam);
  const after = forced.tickGrid(jam, size, stats, 70, u,
    { R: 9, C: 9, I: 9 }, M.defaultFunding(), null, null, traffic);
  assert.equal(M.parseTile(after[spot]).level, 2,
    'the tick agrees: a gridlocked lot does not grow even on a perfect roll');

  // The same tile with the same everything, minus the jam, does grow — so it
  // is the congestion doing this and not some other blocker.
  const clear = forced.tickGrid(jam, size, stats, 70, u,
    { R: 9, C: 9, I: 9 }, M.defaultFunding(), null, null, null);
  assert.equal(M.parseTile(clear[spot]).level, 3, 'without the jam it grows');

  // Blockers are reported in the order the tick actually applies them:
  // utilities come first, so a lot with no water says water, not traffic.
  const dry = jam.slice();
  dry[(row - 4) * size + 17] = '_0';
  assert.equal(M.growthBlocker(dry, size, spot, M.findUtilities(dry), 70, traffic), 'water',
    'traffic never masks a missing utility');
  assert.equal(M.growthBlocker(jam, size, spot, u, 70), '',
    'and with no survey supplied it stays silent rather than guessing');
}

// --- the citywide cost is bounded ----------------------------------------
{
  assert.equal(M.trafficHappinessPenalty(null), 0, 'no survey, no penalty');
  assert.equal(M.trafficHappinessPenalty({ totalTrips: 0 }), 0, 'an empty city, no penalty');
  assert.equal(M.trafficHappinessPenalty({ totalTrips: 100, stuckShare: 0 }), 0,
    'a free-flowing city, no penalty');
  assert.ok(M.trafficHappinessPenalty({ totalTrips: 100, stuckShare: 0.2 }) > 0,
    'a jammed one, a real penalty');
  assert.equal(M.trafficHappinessPenalty({ totalTrips: 100, stuckShare: 5 }),
    M.TRAFFIC_MAX_HAPPINESS_PENALTY, 'and it is capped however bad things get');

  const stats = M.summarize(M.emptyGrid(size));
  assert.ok(M.computeHappiness(10, stats, 10) < M.computeHappiness(10, stats),
    'the penalty reaches happiness');
  assert.equal(M.computeHappiness(10, stats), M.computeHappiness(10, stats, 0),
    'and omitting it changes nothing');
  assert.ok(M.computeHappiness(10, stats, 999) >= 0, 'happiness stays a percentage');
}

// --- lots with no road at all are counted, not crashed on -----------------
{
  const orphan = M.emptyGrid(size);
  orphan[40 * size + 40] = 'R3';
  const s = M.trafficSurvey(orphan, size);
  assert.ok(s.totalTrips > 0, 'an unreachable lot still wants to travel');
  assert.equal(s.unservedTrips, s.totalTrips, 'but none of it reaches a road');
  assert.equal(s.usedRoads, 0);
  assert.equal(s.worst, 0);
  assert.equal(s.stuckShare, 0, 'and it cannot make the city look congested');

  const empty = M.trafficSurvey(M.emptyGrid(size), size);
  assert.equal(empty.totalTrips, 0);
  assert.equal(empty.stuckShare, 0, 'an empty city divides by nothing safely');
}

// --- the avenue as a build tool ------------------------------------------
{
  const g = M.emptyGrid(size);
  const at = 10 * size + 10;

  // On open land it is a road that costs more.
  assert.equal(M.placementCost(g, at, M.TOOL_AVENUE), M.COSTS['A']);
  assert.ok(M.canPlace(g, at, M.TOOL_AVENUE, 999));
  assert.equal(M.canPlace(g, at, M.TOOL_AVENUE, 5), false, 'and it must be affordable');
  let out = M.placeTile(g, at, M.TOOL_AVENUE);
  assert.equal(out[at], '#2', 'an avenue is a road, not a new kind of tile');
  assert.ok(M.isAvenueTile(M.parseTile(out[at])));
  assert.equal(M.isBridgeTile(M.parseTile(out[at])), false);

  // Widening a street you already paid for costs only the widening.
  const street = M.placeTile(g, at, M.TILE_ROAD);
  assert.equal(M.placementCost(street, at, M.TOOL_AVENUE), M.AVENUE_UPGRADE_COST);
  assert.ok(M.placementCost(street, at, M.TOOL_AVENUE) < M.COSTS['A']);
  assert.ok(M.canPlace(street, at, M.TOOL_AVENUE, 999));
  assert.equal(M.placeTile(street, at, M.TOOL_AVENUE)[at], '#2');

  // Widening an avenue would charge for nothing, so it is refused.
  const avenue = M.placeTile(g, at, M.TOOL_AVENUE);
  assert.equal(M.canPlace(avenue, at, M.TOOL_AVENUE, 999), false);
  assert.equal(M.canPlace(avenue, at, M.TILE_ROAD, 999), false, 'and so is narrowing it');

  // Over water it is a bridge, and both bridge kinds stay water underneath.
  const lake = M.emptyGrid(size);
  lake[at] = 'L0';
  assert.equal(M.placementCost(lake, at, M.TOOL_AVENUE), M.BRIDGE_COST + M.AVENUE_UPGRADE_COST);
  const span = M.placeTile(lake, at, M.TOOL_AVENUE);
  assert.equal(span[at], '#3', 'an avenue over water is an avenue bridge');
  assert.ok(M.isBridgeTile(M.parseTile(span[at])) && M.isAvenueTile(M.parseTile(span[at])));
  assert.ok(M.isWaterTile(span[at]), 'which still reads as water for the shoreline');
  assert.equal(M.bulldozeTile(span, at)[at], 'L0', 'and demolishing it gives the water back');

  // Widening an existing plain bridge keeps it a bridge.
  const bridge = M.placeTile(lake, at, M.TILE_ROAD);
  assert.equal(bridge[at], '#1');
  assert.equal(M.placementCost(bridge, at, M.TOOL_AVENUE), M.AVENUE_UPGRADE_COST);
  assert.equal(M.placeTile(bridge, at, M.TOOL_AVENUE)[at], '#3');

  // Refunds return what was really spent, at every road level.
  assert.equal(M.totalInvestment(M.TILE_ROAD, 0), M.COSTS['#']);
  assert.equal(M.totalInvestment(M.TILE_ROAD, 1), M.BRIDGE_COST);
  assert.equal(M.totalInvestment(M.TILE_ROAD, 2), M.COSTS['#'] + M.AVENUE_UPGRADE_COST);
  assert.equal(M.totalInvestment(M.TILE_ROAD, 3), M.BRIDGE_COST + M.AVENUE_UPGRADE_COST);
  assert.equal(M.totalInvestment(M.TILE_ROAD, 2), M.COSTS['A'], 'a fresh avenue refunds its price');

  // A demolished avenue on land leaves land, not water.
  assert.equal(M.bulldozeTile(avenue, at)[at], '_0');
}

// --- avenues cost more to run --------------------------------------------
{
  const streets = M.emptyGrid(size);
  const avenues = M.emptyGrid(size);
  for (let i = 0; i < 30; i++) { streets[100 + i] = '#0'; avenues[100 + i] = '#2'; }
  const a = M.summarize(streets), b = M.summarize(avenues);
  assert.equal(a.roadCount, b.roadCount, 'both are thirty road tiles');
  assert.equal(a.avenueCount, 0);
  assert.equal(b.avenueCount, 30);
  const bill = s => M.upkeepBreakdown(s, M.defaultFunding(), []).find(r => r.key === 'roads').amount;
  assert.ok(bill(b) > bill(a), 'an avenue costs more to maintain than a street');
  assert.ok(M.computeUpkeep(b, M.defaultFunding(), []) > M.computeUpkeep(a, M.defaultFunding(), []),
    'and that reaches the monthly bill');
}

// --- the overlay is registered -------------------------------------------
{
  const def = M.overlayDef('traffic');
  assert.ok(def && def.label, 'traffic is a real overlay');
  assert.equal(M.overlayRadius(def, M.defaultFunding()), 0, 'it is a heatmap, not a coverage circle');
}

// --- calibration lock ----------------------------------------------------
// The numbers only matter as a gradient: planning has to pay, and neglect has
// to hurt, at populations this game actually reaches. Built from one town
// generator so the only differences are the ones being measured.
{
  function town(roadEvery, cross, mixed) {
    const g = M.emptyGrid(size);
    let n = 0;
    for (let r = 8; r < 32; r++) {
      for (let c = 8; c < 32; c++) {
        const i = r * size + c;
        if (r % roadEvery === 0 || (cross && c % cross === 0)) { g[i] = '#0'; continue; }
        g[i] = mixed && (n++ % 3 === 0) ? 'C3' : 'R3';
      }
    }
    for (let r = 8; r < 32; r++) g[r * size + 7] = '#0';
    return g;
  }
  const measure = g => {
    const s = M.trafficSurvey(g, size);
    const lots = Object.values(s.lotCongestion);
    return {
      pop: M.summarize(g).population,
      stuck: lots.filter(v => v >= M.CONGESTION_JAM).length / lots.length,
      penalty: M.trafficHappinessPenalty(s)
    };
  };

  // A city planned the way the system asks — a real street grid, shops mixed
  // in among the homes — carries this game's typical mature population with
  // room to spare. Good play has to be rewarded, or the mechanic is just a tax.
  const planned = measure(town(3, 3, true));
  assert.ok(planned.pop > 6000, `the planned city is a real city (pop ${planned.pop})`);
  assert.ok(planned.stuck < 0.05,
    `a planned mixed city flows (stuck ${(planned.stuck * 100).toFixed(0)}%)`);
  assert.equal(planned.penalty, 0, 'and nobody complains about the commute');

  // Stretch the grid and it starts to bite, without falling over.
  const stretched = measure(town(4, 4, true));
  assert.ok(stretched.stuck > planned.stuck,
    'thinning the street grid makes congestion worse');
  assert.ok(stretched.stuck < 0.4,
    `but a still-mixed city stays workable (stuck ${(stretched.stuck * 100).toFixed(0)}%)`);

  // Bedroom sprawl on a few feeder roads is the failure the system exists to
  // punish, and it must be unmistakable rather than a rounding error.
  const sprawl = measure(town(4, 0, false));
  assert.ok(sprawl.stuck > 0.5,
    `unmixed sprawl on feeder roads gridlocks (stuck ${(sprawl.stuck * 100).toFixed(0)}%)`);
  assert.ok(sprawl.penalty > stretched.penalty, 'and the city hates it');

  // The whole point: worse layout, worse traffic, every step of the way.
  assert.ok(planned.stuck < stretched.stuck && stretched.stuck < sprawl.stuck,
    'congestion tracks layout quality monotonically');
  assert.ok(planned.penalty <= stretched.penalty && stretched.penalty <= sprawl.penalty,
    'and so does what it costs in happiness');
}

console.log('PASS: trips from density and both commute ends, all three counter-levers ' +
  '(mixed zoning, connected grid, avenues) measurably working, growth throttling that ' +
  'the tick honours, bounded happiness cost, avenue placement/refund/bridges/upkeep, ' +
  'and a calibration gradient where planning pays and sprawl gridlocks.');

// --- the transport advisor names it, and points at the map ---------------
// Appended after the summary above deliberately: this exercises the advisor
// wiring rather than the traffic maths itself.
{
  const roomy = M.emptyGrid(size);
  for (let i = 0; i < 20; i++) { roomy[500 + i] = 'R1'; roomy[560 + i] = 'C1'; roomy[620 + i] = 'I1'; }
  const stats = M.summarize(roomy);
  const plan = traffic => M.cityAdvice({
    stats, coverage: M.serviceCoverageStats(roomy, size),
    demand: M.computeDemand(stats, 0), income: 500, upkeep: 100, treasury: 2000,
    funding: M.defaultFunding(), loans: [], taxRatePercent: 10, fires: [], crimes: [],
    load: M.utilityLoad(roomy, stats), neighborsLinked: 4, neighborsTotal: 4, traffic
  }).find(a => a.advisor === 'transport');

  // Traffic has its own advisor rather than sharing the planner's single slot:
  // on a mature city "Housing is full" permanently outranked it, so the whole
  // system had no voice. Severity, not wording, is what says whether it is
  // raising an alarm — its calm state still has "traffic" in the headline.
  assert.equal(plan(null).severity, M.SEVERITY_OK,
    'with no survey the advisor is calm rather than silent');

  const fake = share => ({
    totalTrips: 100, stuckShare: 0.1,
    lotCongestion: Object.fromEntries(
      Array.from({ length: 100 }, (_, i) => [i, i < share * 100 ? 1.5 : 0.1]))
  });
  assert.equal(M.jammedLotShare(null), 0, 'no survey, nothing jammed');
  assert.equal(M.jammedLotShare({ lotCongestion: {} }), 0, 'no lots, nothing jammed');
  assert.ok(Math.abs(M.jammedLotShare(fake(0.3)) - 0.3) < 1e-9, 'and it counts what is stuck');

  assert.equal(plan(fake(0.02)).severity, M.SEVERITY_OK,
    'a couple of jammed lots is not worth raising');
  const building = plan(fake(0.12));
  assert.match(building.headline, /Traffic/);
  assert.equal(building.severity, M.SEVERITY_WATCH);
  assert.equal(building.overlay, 'traffic', 'and it hands them the map that shows it');
  const bad = plan(fake(0.4));
  assert.match(bad.headline, /gridlocked/i);
  assert.equal(bad.severity, M.SEVERITY_URGENT, 'a gridlocked city is urgent');
  assert.equal(bad.overlay, 'traffic');
  // Every counter-strategy is named, since none is obvious from the map.
  assert.match(bad.detail, /shops/i, 'mixing zones');
  assert.match(bad.detail, /route/i, 'a connected grid');
  assert.match(bad.detail, /avenue/i, 'widening');
  assert.match(bad.detail, /transit/i, 'and transit');

  console.log('PASS: the planner escalates traffic and points at the overlay.');
}
