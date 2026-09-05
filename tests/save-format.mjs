// The packed-grid save format: lossless round-trip, backward compatibility
// with pre-v2 array saves, and real headroom under Service's 64KB read cap.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const M = vm.createContext({ Math });
vm.runInContext(
  fs.readFileSync(new URL('../Model.js', import.meta.url), 'utf8').replace('.pragma library', ''),
  M);

const MAX_STATE_BYTES = 65536; // must match Service.qml's maxStateBytes

// --- lossless round-trip, including every tile type the game can write -----
const types = ['_', '#', 'L', 'Q', 'R', 'C', 'I', 'P', 'E', 'W', 'F', 'S', 'N', 'H', 'T', 'B'];
const mixed = M.emptyGrid(M.GRID_SIZE).map((_, i) =>
  M.makeTile(types[i % types.length], i % 4));
assert.deepEqual(M.unpackGrid(M.packGrid(mixed)), mixed, 'mixed grid must round-trip exactly');

const empty = M.emptyGrid(M.GRID_SIZE);
assert.deepEqual(M.unpackGrid(M.packGrid(empty)), empty, 'empty grid must round-trip exactly');
assert.equal(M.packGrid(empty).length, M.GRID_SIZE * M.GRID_SIZE * 2, 'two chars per tile');

// Packing must survive JSON, which is how it actually travels.
assert.deepEqual(M.unpackGrid(JSON.parse(JSON.stringify(M.packGrid(mixed)))), mixed);

// --- malformed input returns null so Service can fall back, not crash -----
for (const bad of [undefined, null, 42, [], {}, '', 'R2C', 'odd'])
  assert.equal(M.unpackGrid(bad), null, `unpackGrid must reject ${JSON.stringify(bad)}`);

// --- a real pre-v2 save still loads (Service's Array.isArray branch) ------
const legacy = JSON.parse(fs.readFileSync(
  new URL('../../../.local/state/omarchy/omaville-state.json', import.meta.url), 'utf8'));
const legacyGrid = Array.isArray(legacy.grid) ? legacy.grid : M.unpackGrid(legacy.grid);
assert.ok(Array.isArray(legacyGrid), 'the live save must decode by either branch');
assert.equal(legacyGrid.length, M.GRID_SIZE * M.GRID_SIZE, 'decoded grid keeps its size');
assert.equal(M.summarize(legacyGrid).population, M.summarize(
  M.unpackGrid(M.packGrid(legacyGrid))).population, 'population survives a repack');

// --- the headroom this whole change exists for ----------------------------
function saveBytes(grid, pendingEvents) {
  return Buffer.byteLength(JSON.stringify({
    cityName: 'A Fairly Long Town Name Here', foundedAtMs: Date.now(), ageMinutes: 99999,
    treasury: 123456.789, taxRatePercent: 30, grid: M.packGrid(grid), gridSize: M.GRID_SIZE,
    saveVersion: M.SAVE_VERSION, population: 99999, jobs: 99999, happiness: 100,
    demand: { R: 1.234567, C: 1.234567, I: 1.234567 },
    reachedMilestones: M.MILESTONES.slice(), budgetCrisisActive: true,
    pendingEvents, activeEffects: [], eventChance: 0.05, eventFrequency: 2
  }, null, 2) + '\n');
}
// Worst case the game can actually produce: every dilemma queued at once
// (rollForEvent never queues a duplicate id) on a fully-built grid.
const worst = saveBytes(mixed, M.EVENTS);
assert.ok(worst < MAX_STATE_BYTES / 2,
  `worst-case save ${worst}B must sit well under the ${MAX_STATE_BYTES}B cap`);

console.log(`PASS: round-trip, malformed input, legacy array saves, and worst-case save ` +
  `${worst}B = ${(worst / MAX_STATE_BYTES * 100).toFixed(1)}% of the ${MAX_STATE_BYTES}B cap.`);
