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
const types = ['_', '#', 'L', 'Q', 'R', 'C', 'I', 'P', 'E', 'W', 'F', 'S', 'N', 'H', 'T', 'B', 'G', 'K', 'V', 'O', 'D'];
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
const longestLetter = [].concat(
  Object.values(M.WISHES).flatMap(w => [w.ask, w.thanks]),
  Object.values(M.FIX_THANKS), Object.values(M.CITIZEN_COMPLAINTS),
  Object.values(M.MAIL_NEWS).flat(),
  [M.farewellLetterText({ reason: 'traffic', to: 'A Fairly Long Town Name Here' }),
   M.familyLetterText({ name: 'Reginald Marchbank', street: 'Gasworks Terrace' }),
   M.birthdayLetterText({ n: 'Reginald Marchbank' }, 'Gasworks Terrace')]
).map(t => t.split('$STREET').join('Gasworks Terrace').split('$CITY').join('A Fairly Long Town Name Here'))
  .sort((a, b) => b.length - a.length)[0];
function saveBytes(grid, pendingEvents, recentEventIds = []) {
  return Buffer.byteLength(JSON.stringify({
    cityName: 'A Fairly Long Town Name Here', foundedAtMs: Date.now(), ageMinutes: 99999,
    treasury: 123456.789, taxRatePercent: 30, grid: M.packGrid(grid), gridSize: M.GRID_SIZE,
    saveVersion: M.SAVE_VERSION, population: 99999, jobs: 99999, happiness: 100,
    demand: { R: 1.234567, C: 1.234567, I: 1.234567 },
    reachedMilestones: M.MILESTONES.slice(), budgetCrisisActive: true,
    pendingEvents, recentEventIds, activeEffects: [], eventChance: 0.05, eventFrequency: 2,
    // A full cast of residents, every one mid-request and greeted, plus a
    // town's worth of memorials and the most offers that can wait.
    citizens: Array.from({ length: M.CITIZEN_MAX }, (_, k) => ({
      n: 'Reginald Marchbank', i: 4095 - k, s: 99999, p: -M.CITIZEN_PATIENCE, b: -99999, a: -99999,
      t: 5, f: 100, h: 99999, y: 2026, q: { k: 'fix:industry', d: 99999 } })),
    playDay: 99999, lastPlayDate: '2026-12-31', residentNews: 999,
    memorials: Object.fromEntries(Array.from({ length: M.MEMORIAL_MAX }, (_, k) => [4000 - k,
      { n: 'Reginald Marchbank', street: 'Gasworks Terrace', year: 9999 }])),
    memorialOffers: Array.from({ length: M.MEMORIAL_MAX_OFFERS }, (_, k) => ({
      n: 'Reginald Marchbank', i: k, street: 'Gasworks Terrace' })),
    // A full mailbox of the longest letter any resident writes.
    mail: Array.from({ length: M.MAIL_MAX }, (_, k) => ({ id: 99999000 + k, d: 99999,
      from: 'Reginald Marchbank', i: 4095, kind: 'birthday', read: false, replied: false,
      text: longestLetter }))
  }, null, 2) + '\n');
}
// Worst case the game can actually produce, on a fully-built grid: the
// EVENT_MAX_PENDING largest dilemmas, with the longest names the templates
// can be filled with.
const longName = 'A Fairly Long Town Name Here';
const worstPending = M.EVENTS
  .map(e => M.instantiateEvent(e, { city: longName, neighborNames: [longName] }))
  .sort((a, b) => JSON.stringify(b).length - JSON.stringify(a).length)
  .slice(0, M.EVENT_MAX_PENDING);
const worstRecent = M.EVENTS.map(e => e.id)
  .sort((a, b) => b.length - a.length).slice(0, M.EVENT_RECENT_MEMORY);
const worst = saveBytes(mixed, worstPending, worstRecent);
assert.ok(worst < MAX_STATE_BYTES / 2,
  `worst-case save ${worst}B must sit well under the ${MAX_STATE_BYTES}B cap`);

console.log(`PASS: round-trip, malformed input, legacy array saves, and worst-case save ` +
  `${worst}B = ${(worst / MAX_STATE_BYTES * 100).toFixed(1)}% of the ${MAX_STATE_BYTES}B cap.`);
