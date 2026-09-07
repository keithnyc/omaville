// Whole-grid figures are computed once, by the service, for every open view.
//
// They were not. CityView carried its own summarize, coverage, findUtilities,
// connectedNeighbors and utilityLoad bindings on root.grid, so a single
// painted tile cost two full sets of grid scans with the panel open and three
// with the detached window beside it — the reason a fast road drag dropped
// tiles. Worse, the duplicates were not identical: the view's upkeep and
// utility load were computed without the city's ordinances, so the Budget card
// quoted a bill the treasury was not charged.
//
// These pin both halves: that the service is the only place a scan happens,
// and that the divergence the duplicates caused was real enough to matter.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const model = vm.createContext({ Math, Number });
vm.runInContext(
  fs.readFileSync(new URL('../Model.js', import.meta.url), 'utf8').replace('.pragma library', ''),
  model);
const service = fs.readFileSync(new URL('../Service.qml', import.meta.url), 'utf8');
const view = fs.readFileSync(new URL('../CityView.qml', import.meta.url), 'utf8');

// --- the ordinances the view used to drop --------------------------------
{
  const size = model.GRID_SIZE;
  const grid = model.emptyGrid(size);
  let n = 0;
  for (let r = 4; r < 40; r++) {
    if (r % 4 === 0) { for (let c = 4; c < 40; c++) grid[r * size + c] = '#0'; continue; }
    for (let c = 4; c < 40; c++) {
      const k = n++ % 9;
      grid[r * size + c] = k < 4 ? 'R3' : k < 7 ? 'C2' : k === 7 ? 'I2' : '_0';
    }
  }
  const stats = model.summarize(grid);
  const funding = model.defaultFunding();
  const all = model.ORDINANCES.map(o => o.id);

  assert.ok(model.computeUpkeep(stats, funding, all) > model.computeUpkeep(stats, funding) * 1.5,
    'ordinances are a large enough share of the bill that omitting them is a visible lie');
  assert.ok(model.utilityLoad(grid, stats, model.ordinanceEffects(['conservation'])).waterDemand
    < model.utilityLoad(grid, stats).waterDemand,
    'and water conservation genuinely changes the draw a gauge would show');

  // The total is the sum of the itemised rows, which is what lets the service
  // publish one and derive the other.
  const bill = model.upkeepBreakdown(stats, funding, all);
  const summed = bill.reduce((t, row) => t + row.amount, 0);
  assert.ok(Math.abs(summed - model.computeUpkeep(stats, funding, all)) < 1e-9,
    'the bill sums to the total, so a view can show either without them drifting');
}

// --- only the service scans the grid --------------------------------------
{
  // Every call that walks all 4096 tiles. A second binding on any of these in
  // a view doubles the cost of painting one tile.
  const scans = ['summarize', 'serviceCoverageStats', 'findUtilities',
    'connectedNeighbors', 'utilityLoad', 'trafficSurvey'];
  const calls = (source, fn) =>
    (source.match(new RegExp(`Model\\.${fn}\\s*\\(`, 'g')) || []).length;

  for (const fn of scans) {
    assert.ok(calls(service, fn) >= 1, `the service is where ${fn} is called`);
    // A view may keep exactly one call as the before-the-service-attaches
    // fallback, and it must sit in a conditional that prefers the service.
    const found = calls(view, fn);
    assert.ok(found <= 1, `CityView calls Model.${fn} ${found} times; at most one fallback`);
    if (found === 1) {
      const line = view.split('\n').findIndex(l => l.includes(`Model.${fn}(`));
      const binding = view.split('\n').slice(Math.max(0, line - 3), line + 1).join('\n');
      assert.ok(binding.includes('root.cityService'),
        `CityView's Model.${fn} call must be the fallback arm of a cityService check`);
    }
  }

  // And the figures it does show come from the service rather than its own math.
  for (const published of ['cityStats', 'coverage', 'utilities', 'load',
    'upkeepBill', 'income', 'upkeep', 'linkedNeighbors']) {
    assert.ok(new RegExp(`property .*\\b${published}\\b\\s*:`).test(service),
      `the service publishes ${published}`);
    assert.ok(view.includes(`root.cityService.${published}`),
      `CityView reads ${published} from the service`);
  }

  // The one that bit: these two must not be recomputed locally, because a
  // local computeUpkeep has no ordinances to pass.
  assert.ok(!/Model\.computeUpkeep\s*\(/.test(view),
    'CityView must not compute its own upkeep — it would omit ordinances');
  assert.ok(!/Model\.upkeepBreakdown\s*\(/.test(view),
    'CityView must not build its own bill — it would omit ordinances');
  assert.ok(/upkeepBreakdown\(root\.cityStats, root\.funding, root\.ordinances\)/.test(service),
    'and the service builds it with them');
}

console.log('PASS: one grid scan per change for every open view, and the budget the player ' +
  'is shown is the one the treasury is charged.');
