import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const qml = fs.readFileSync(new URL('../Service.qml', import.meta.url), 'utf8');
const fn = qml.match(/  function renameCity\([\s\S]*?\n  \}/)[0];
const mayorFn = qml.match(/  function renameMayor\([\s\S]*?\n  \}/)[0];
// renameCity now defers to Model for sanitising, so the harness has to supply
// it — the point of the shared helper is that the dialog and the rename field
// cannot disagree about what is acceptable.
const Model = vm.createContext({ Math });
vm.runInContext(
  fs.readFileSync(new URL('../Model.js', import.meta.url), 'utf8').replace('.pragma library', ''),
  Model);
let saves = [];
const root = { initialized: true, cityName: 'Omaville', mayorName: '' };
const ctx = { root, Model, flushState() { saves.push(root.cityName); } };
const rename = vm.runInNewContext('(' + fn + ')', ctx);
const renameMayor = vm.runInNewContext('(' + mayorFn + ')', ctx);
assert.equal(rename('  New\n  Haven  '), true);
assert.equal(root.cityName, 'New Haven');
assert.deepEqual(saves, ['New Haven']);
assert.equal(rename('New Haven'), true);
assert.equal(saves.length, 1);
for (const invalid of ['', '  ', '\n\t']) assert.equal(rename(invalid), false);
// An over-long name is now truncated rather than refused. The field caps at
// NAME_MAX anyway, so this only affects a paste, where trimming to fit is what
// anyone would expect over a silent rejection.
assert.equal(rename('y'.repeat(60)), true);
assert.equal(root.cityName.length, Model.NAME_MAX);
rename('New Haven');
assert.equal(root.cityName, 'New Haven');
assert.equal(rename('São Tomé'), true);
assert.equal(rename('x'.repeat(40)), true);
root.initialized = false;
assert.equal(rename('Not loaded yet'), false);
assert.equal(saves.length, 5, 'one save per actual change, none for a no-op or a refusal');
console.log('PASS: town name normalization, empty/length validation, Unicode, unchanged names, save dispatch, and initialization guard.');

// --- the mayor's name -----------------------------------------------------
// Unlike the city's, it may be cleared: a player who does not want to be named
// should not be forced into one, and Model.mayorTitle degrades to a bare
// "Mayor" so nothing ever renders a dangling honorific.
root.initialized = true;
saves = [];
assert.equal(renameMayor('  Ada   Lovelace '), true);
assert.equal(root.mayorName, 'Ada Lovelace');
assert.equal(renameMayor('Ada Lovelace'), true, 'setting the same name is a no-op');
assert.equal(saves.length, 1, 'and does not write the save again');
assert.equal(renameMayor(''), true, 'clearing is allowed');
assert.equal(root.mayorName, '');
assert.equal(Model.mayorTitle(root.mayorName), 'Mayor', 'and still addresses the player');
assert.equal(Model.mayorTitle('Ada'), 'Mayor Ada');
root.initialized = false;
assert.equal(renameMayor('Too early'), false, 'not before the city has loaded');

console.log('PASS: shared name sanitising for the city and the mayor, truncation over refusal, ' +
  'a clearable mayor name, and no redundant saves.');
