// Footpaths: a surface that serves a lot without carrying a car.
//
// Players were building car-free blocks — a ring of road around an interior of
// flats, trees and water — and then wondering how anybody got about in there,
// because the only surface the game had was one cars drive on. The model said
// those people were fine; the map said they lived in a hedge.
//
// The danger in fixing that is obvious: something cheaper than a road that
// serves a lot just as well is not a new option, it is a replacement for
// roads. So most of this file is about the price a path charges.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const M = vm.createContext({ Math, Number });
vm.runInContext(
  fs.readFileSync(new URL('../Model.js', import.meta.url), 'utf8').replace('.pragma library', ''),
  M);
const size = M.GRID_SIZE;
const at = (x, y) => y * size + x;

// --- a path reaches a lot, and reaches it the same way a road does --------
{
  const g = M.emptyGrid(size);
  for (let y = 10; y < 20; y++) g[at(20, y)] = 'D0';

  assert.equal(M.hasFootAccess(g, size, at(21, 15)), true, 'next door is served');
  assert.equal(M.hasRoadAccess(g, size, at(21, 15)), false, 'and not by a road');
  assert.equal(M.hasAccess(g, size, at(21, 15)), true);
  // Two steps through a passable tile, exactly as a road reaches.
  g[at(21, 15)] = 'R2';
  assert.equal(M.hasFootAccess(g, size, at(22, 15)), true, 'and so is the lot behind it');
  assert.equal(M.hasAccess(g, size, at(24, 15)), false, 'but not three deep');
}

// --- the price: a path carries no lorries ---------------------------------
{
  const g = M.emptyGrid(size);
  for (let y = 10; y < 20; y++) g[at(20, y)] = 'D0';
  const utilities = M.findUtilities(g);
  for (const [tile, expected] of [['R2', 'power'], ['C2', 'power'], ['I2', 'lorries']]) {
    const h = g.slice();
    h[at(21, 15)] = tile;
    assert.equal(M.growthBlocker(h, size, at(21, 15), M.findUtilities(h), 70, null), expected,
      `${tile} on a path alone`);
  }
  // The same works, on a road, is fine — so it is the surface being refused
  // and not the lot.
  const road = g.slice();
  for (let y = 10; y < 20; y++) road[at(20, y)] = '#0';
  road[at(21, 15)] = 'I2';
  assert.notEqual(M.growthBlocker(road, size, at(21, 15), M.findUtilities(road), 70, null),
    'lorries', 'industry on a road is never refused for want of one');
  assert.ok(M.GROWTH_BLOCKER_LABELS.lorries, 'and the refusal is reportable');
}

// --- the reward: nothing is driven down a footpath ------------------------
{
  // The same block twice: once with a paved interior spine, once walked.
  const block = surface => {
    const g = M.emptyGrid(size);
    for (let x = 14; x <= 26; x++) { g[at(x, 10)] = '#0'; g[at(x, 24)] = '#0'; }
    for (let y = 10; y <= 24; y++) { g[at(14, y)] = '#0'; g[at(26, y)] = '#0'; }
    for (let y = 12; y <= 22; y++) g[at(20, y)] = surface;
    for (let y = 12; y <= 22; y++) if (y !== 17) { g[at(19, y)] = 'R3'; g[at(21, y)] = 'R3'; }
    g[at(16, 12)] = 'E2'; g[at(17, 12)] = 'W2';
    return g;
  };
  const survey = g => M.trafficSurvey(g, size, M.findUtilities(g),
    M.defaultFunding(), M.ordinanceEffects([]));
  const paved = survey(block('#0')), walked = survey(block('D0'));

  assert.equal(M.summarize(block('#0')).population, M.summarize(block('D0')).population,
    'the same people either way');
  assert.ok(walked.savedTrips > 0, 'the walked journeys are counted as walked');
  assert.equal(paved.savedTrips, 0, 'and a paved interior saves none of them');
  assert.ok(walked.worst < paved.worst * 0.75,
    `pedestrianising should ease the surrounding roads: ${walked.worst} vs ${paved.worst}`);
  // Crucially: those trips are not counted as people stranded with no road.
  assert.equal(walked.unservedTrips, 0,
    'a lot reached on foot is served — reporting it as unserved would send the ' +
    'player looking for a road it does not need');
}

// --- a footbridge ---------------------------------------------------------
{
  const g = M.emptyGrid(size);
  g[at(10, 10)] = 'L0';
  assert.equal(M.placementCost(g, at(11, 10), 'D'), M.PATH_COST, 'a path on land');
  assert.equal(M.placementCost(g, at(10, 10), 'D'), M.PATH_BRIDGE_COST, 'and over water');
  assert.ok(M.PATH_BRIDGE_COST > M.PATH_COST && M.PATH_BRIDGE_COST < M.BRIDGE_COST,
    'a footbridge costs more than a path and less than a road bridge');
  assert.equal(M.canPlace(g, at(10, 10), 'D', 999), true);

  const built = M.placeTile(g, at(10, 10), 'D');
  assert.equal(built[at(10, 10)], 'D1', 'an odd level means it spans water');
  assert.equal(M.isBridgeTile(M.parseTile(built[at(10, 10)])), true);
  assert.equal(M.bulldozeTile(built, at(10, 10))[at(10, 10)], 'L0', 'removing it restores water');
  assert.equal(M.totalInvestment('D', 1), M.PATH_BRIDGE_COST, 'and refunds what it cost');
  assert.equal(M.totalInvestment('D', 0), M.PATH_COST);

  // Still water underneath, so the waterfront bonus is not lost by crossing it.
  const shore = M.emptyGrid(size);
  for (let y = 8; y < 14; y++) shore[at(10, y)] = 'L0';
  const before = M.propertyValueBonus(shore, size, at(11, 10));
  const crossed = M.placeTile(shore, at(10, 10), 'D');
  assert.equal(M.propertyValueBonus(crossed, size, at(11, 10)), before,
    'a footbridge over water is still water to the house looking at it');
}

// --- it is not free to keep -----------------------------------------------
{
  const g = M.emptyGrid(size);
  for (let x = 10; x < 30; x++) g[at(x, 15)] = 'D0';
  const stats = M.summarize(g);
  assert.equal(stats.pathCount, 20, 'paths are counted');
  const bill = M.upkeepBreakdown(stats, M.defaultFunding(), [])
    .find(r => r.key === 'roads');
  assert.ok(bill.amount > 0, 'and billed with the roads');
  assert.ok(bill.amount < 20 * M.ROAD_UPKEEP, 'but for much less than a road each');
  assert.equal(M.monthlyCostOf('D', 0), M.PATH_UPKEEP, 'and quoted at the point of purchase');
  assert.equal(M.COSTS.D, M.PATH_COST);
  assert.equal(M.TILE_LABELS.D, 'Footpath');
}

// --- a resident on a path has an address ----------------------------------
// Without this every one of them is "of the outskirts", which is a poor thing
// to print about somebody living in the nicest square in the city.
{
  const g = M.emptyGrid(size);
  for (let x = 6; x < 18; x++) g[at(x, 17)] = '#0';
  for (let x = 30; x < 42; x++) g[at(x, 17)] = 'D0';
  g[at(8, 18)] = 'R2'; g[at(32, 18)] = 'R2';

  const onRoad = M.streetOf(g, size, at(8, 18));
  const onPath = M.streetOf(g, size, at(32, 18));
  assert.notEqual(onPath, 'the outskirts', 'a pedestrian block is somewhere');
  assert.ok(/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(onPath), `${onPath} reads as a street`);
  // Street identity is keyed on axis and line, so without the surface in the
  // key these two would be the same name — which reads as a bug however
  // defensible it is in a real city.
  assert.notEqual(onRoad, onPath, 'a path and a road on the same row are two streets');
  assert.ok(Array.from(M.PATH_TAIL).some(t => onPath.endsWith(t)),
    `${onPath} should sound like somewhere you walk`);

  const runs = M.streetRuns(g, size);
  assert.equal(runs.length, 2, 'the map labels both');
  assert.equal(runs.filter(r => r.foot).length, 1, 'and knows which is which');

  // Renaming one leaves the other alone.
  const named = M.renameStreet({}, 'ew', 17, 'Keith Walk', true);
  assert.equal(M.streetOf(g, size, at(32, 18), named), 'Keith Walk');
  assert.equal(M.streetOf(g, size, at(8, 18), named), onRoad, 'the road keeps its name');
}

// --- and the existing streets must not have been renamed ------------------
// Generated names are derived, never stored, so a change to how they are
// derived silently renames every street in every save — including the ones
// already written into log entries and obituaries.
// Recorded from the build before footpaths existed, and confirmed at the time
// by generating every one of the 128 road lines under both versions and
// diffing them. These five are the canary: if the derivation ever shifts
// again, they say so before a save full of letters starts referring to
// streets that no longer have those names.
{
  const known = [
    ['ew', 17, 'Kiln Walk'],
    ['ns', 9, 'Quarry Way'],
    ['ew', 3, 'Chapel Way'],
    ['ns', 44, 'Harbour Way'],
    ['ew', 30, 'Quarry Terrace']
  ];
  for (const [axis, line, name] of known) {
    const g = M.emptyGrid(size);
    if (axis === 'ew') for (let x = 2; x < 20; x++) g[at(x, line)] = '#0';
    else for (let y = 2; y < 20; y++) g[at(line, y)] = '#0';
    const probe = axis === 'ew' ? at(5, line) : at(line, 5);
    assert.equal(M.roadStreet(g, size, probe).name, name,
      `the ${axis} road on line ${line} used to be called ${name} — every save's ` +
      `streets have just been renamed under it`);
  }
}

console.log('PASS: a surface that serves a lot without carrying a car, refused to industry, ' +
  'charged for, bridgeable, addressed, and paid for in the congestion it takes off the roads.');
