import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const Model = vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../Model.js', import.meta.url), 'utf8').replace('.pragma library', ''), Model);
const service = fs.readFileSync(new URL('../Service.qml', import.meta.url), 'utf8');
const root = { initialized: true, grid: [], treasury: 0, population: 0 };
let saves = 0;
const build = vm.runInNewContext('(' + service.match(/  function buildTier\([\s\S]*?\n  \}/)[0] + ')',
  { root, Model, flushState() { saves++; } });
for (const type of Object.keys(Model.UPGRADE_COSTS)) {
  for (let tier = 0; tier < 3; tier++) {
    const cost = Model.totalInvestment(type, tier);
    Object.assign(root, { grid: ['_0'], population: Model.UPGRADE_THRESHOLDS[tier], treasury: cost });
    const before = saves;
    assert.equal(build(0, type, tier), true);
    assert.equal(root.grid[0], type + tier);
    assert.equal(root.treasury, 0);
    assert.equal(saves, before + 1);
    root.treasury = 10000;
    assert.equal(build(0, type, tier), false, 'repeated clicks cannot upgrade further');
    assert.equal(root.treasury, 10000);
    for (let from = 0; from < tier; from++) {
      root.grid = [type + from]; root.treasury = cost - Model.totalInvestment(type, from);
      assert.equal(build(0, type, tier), true);
      assert.equal(root.grid[0], type + tier);
      assert.equal(root.treasury, 0);
    }
    for (const [tile, population, treasury] of [['_0', root.population, cost - 1],
      ['R1', root.population, cost], [type + '2', root.population, cost],
      ...tier ? [['_0', Model.UPGRADE_THRESHOLDS[tier] - 1, cost]] : []]) {
      Object.assign(root, { grid: [tile], population, treasury });
      const count = saves;
      assert.equal(build(0, type, tier), false);
      assert.equal(root.grid[0], tile);
      assert.equal(root.treasury, treasury);
      assert.equal(saves, count);
    }
  }
}
for (const [index, type, tier] of [[-1, 'S', 1], [1, 'S', 1], [0, 'R', 1], [0, 'S', 3], [0, 'S', 1.5]])
  assert.equal(build(index, type, tier), false);
console.log('PASS: all infrastructure tier placements, exact cost, partial upgrades, repeat clicks, locks, affordability, occupied tiles and save atomicity.');
