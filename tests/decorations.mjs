import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const model = vm.createContext({ Math });
vm.runInContext(fs.readFileSync(new URL('../Model.js', import.meta.url), 'utf8').replace('.pragma library', ''), model);
const empty = () => Array(81).fill('_0');
let grid = empty();
grid[40] = 'R2';
const baseline = model.summarize(grid);
assert.equal(baseline.taxablePopulation, baseline.population);
assert.equal(model.computeAttractiveness(baseline), 0);
for (const [type, cost, bonus] of model.DECORATION_TYPES.map(
  t => [t, model.COSTS[t], model.DECORATIONS[t].weight])) {
  assert(model.canPlace(grid, 41, type, cost));
  assert(!model.canPlace(grid, 41, type, cost - 1));
  assert(!model.canPlace(grid, 40, type, 100));
  const placed = model.placeTile(grid, 41, type);
  assert.equal(placed[41], type + '0');
  assert.equal(model.propertyValueBonus(placed, 9, 40), bonus);
  const stats = model.summarize(placed);
  assert.equal(stats.population, baseline.population);
  assert.equal(stats.taxablePopulation, baseline.population * (1 + bonus / 100));
  assert(model.computeDemand(stats).R > model.computeDemand(baseline).R);
  assert.equal(model.propertyValueBonus(model.bulldozeTile(placed, 41), 9, 40), 0);
  assert.deepEqual(JSON.parse(JSON.stringify(placed)), Array.from(placed));
}
grid[42] = 'T0';
assert.equal(model.propertyValueBonus(grid, 9, 40), 3);
grid[42] = '_0'; grid[44] = 'T0';
assert.equal(model.propertyValueBonus(grid, 9, 40), 0);
grid = empty(); grid[8] = 'T0';
assert.equal(model.propertyValueBonus(grid, 9, 9), 0, 'no row wrapping');
grid.fill('B0'); grid[40] = 'R2';
assert.equal(model.propertyValueBonus(grid, 9, 40), 25);
assert.equal(model.computeAttractiveness(model.summarize(grid)), 15);

// --- the table is the only place a decoration is described -----------------
// Adding one used to mean six separate edits — cost, label, weight, upkeep,
// appeal points, palette — and a miss showed up as a live TypeError rather
// than a test failure. These pin every derived table back to DECORATIONS.
{
  const types = Array.from(model.DECORATION_TYPES);
  assert.equal(types.length, 6, 'six decorations to choose from');
  assert.equal(new Set(types).size, types.length, 'no letter used twice');
  for (const t of types) {
    const d = model.DECORATIONS[t];
    assert(d, `${t} is in the table`);
    assert(model.isDecoration(t), `${t} reads as a decoration`);
    assert.equal(model.COSTS[t], d.cost, `${t} priced from the table`);
    assert.equal(model.TILE_LABELS[t], d.label, `${t} labelled from the table`);
    assert.equal(model.monthlyCostOf(t, 0), d.upkeep, `${t} billed from the table`);
    assert(d.cost > 0 && d.weight > 0 && d.upkeep > 0 && d.points > 0,
      `${t} costs something and does something`);
  }
  // A letter that already means another tile would silently repaint the map.
  for (const t of types)
    assert(!['_', '#', 'A', 'R', 'C', 'I', 'P', 'E', 'W', 'F', 'S', 'N', 'H', 'M', 'L', 'Q']
      .includes(t), `${t} does not collide with an existing tile type`);
  assert.equal(model.isDecoration('R'), false, 'and a zone is not a decoration');

  // Price has to track effect, or the cheap one is simply the right answer.
  const byCost = types.slice().sort((a, b) => model.DECORATIONS[a].cost - model.DECORATIONS[b].cost);
  for (let i = 1; i < byCost.length; i++) {
    const cheap = model.DECORATIONS[byCost[i - 1]], dear = model.DECORATIONS[byCost[i]];
    assert(dear.weight >= cheap.weight, `${byCost[i]} is dearer, so it must not do less`);
    assert(dear.upkeep >= cheap.upkeep, `${byCost[i]} is dearer, so it must not cost less to keep`);
  }
  // And the dearest is worth buying: on its own it should reach most of the cap.
  const best = byCost[byCost.length - 1];
  const g = empty(); g[40] = 'R2'; g[41] = best + '0';
  assert(model.propertyValueBonus(g, 9, 40) >= model.MAX_PROPERTY_BONUS * 0.6,
    'the centrepiece is a real alternative to filling a block with trees');
}

// --- every decoration is drawable ------------------------------------------
// A type with no sprite, metrics or fallback colour renders as a blank tile,
// which the QML side cannot tell you about at load time.
{
  const view = fs.readFileSync(new URL('../CityView.qml', import.meta.url), 'utf8');
  const table = name => {
    const body = view.match(new RegExp(`property var ${name}: \\(\\{([\\s\\S]*?)\\}\\)`))[1];
    return body.match(/(\w+)\s*:/g).map(k => k.replace(/[\s:]/g, ''));
  };
  for (const name of ['decorationSpriteUrls', 'decorationMetrics', 'decorationBlobColors']) {
    const keys = table(name);
    for (const t of model.DECORATION_TYPES)
      assert(keys.includes(t), `${t} is missing from ${name}`);
  }
  for (const t of model.DECORATION_TYPES) {
    const file = view.match(new RegExp(`\\n\\s*${t}: Qt.resolvedUrl\\("(assets/decorations/[\\w.-]+)"`))[1];
    assert(fs.existsSync(new URL('../' + file, import.meta.url)), `${file} exists on disk`);
    assert(view.includes(`case Model.TILE_${
      Object.entries(model).find(([k, v]) => k.startsWith('TILE_') && v === t)[0].slice(5)}:`),
      `${t} has a drawTile case`);
  }
  // The palette must come from the table rather than a hand-written list.
  assert(view.includes('Model.DECORATION_TYPES[index]'), 'the flyout enumerates the table');
  assert(view.includes('Model.DECORATION_TYPES.length'), 'and sizes itself from it');
}

console.log('PASS: decoration costs, placement, persistence, removal, local falloff, boundaries, ' +
  'caps, demand, taxable population, and one table driving price, effect, upkeep and art.');
