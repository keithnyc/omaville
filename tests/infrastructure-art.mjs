// Read the actual renderer helpers, without loading a service or touching saves.
// Run: node tests/infrastructure-art.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const base = new URL('../', import.meta.url);
const qml = fs.readFileSync(new URL('CityView.qml', base), 'utf8');
const root = { grid: [], gridSize: 64, useInfrastructureSprites: true, useResidentialSprites: true,
  useCommercialSprites: true, useIndustrialSprites: true };
const Model = { TILE_RES: 'R', TILE_COM: 'C', TILE_IND: 'I', TILE_PARK: 'P',
  TILE_POWER: 'E', TILE_WATER: 'W', TILE_FIRE: 'F', TILE_POLICE: 'S', TILE_SCHOOL: 'N', TILE_MEDICAL: 'H', TILE_ROAD: '#', TILE_TREE: 'T', TILE_FLOWERS: 'B' };
let loaded = true;
const context = vm.createContext({ root, Model, Qt: { resolvedUrl: x => x },
  cityCanvas: { isImageLoaded: () => loaded } });
for (const key of ['infrastructureSpriteUrls', 'spriteLotTints', 'decorationSpriteUrls']) {
  const expression = qml.match(new RegExp('readonly property var ' + key + ': (\\(\\{[\\s\\S]*?\\}\\))'))[1];
  root[key] = vm.runInContext(expression, context);
}
for (const key of ['residentialSpriteUrls', 'commercialSpriteUrls', 'industrialSpriteUrls']) {
  const expression = qml.match(new RegExp('readonly property var ' + key + ': (\\[[\\s\\S]*?\\n  \\])'))[1];
  root[key] = vm.runInContext(expression, context);
}
for (const name of ['roadConnections', 'drawEntrancePath', 'drawSpriteLot', 'infrastructureSpriteSource', 'previewSpriteSource', 'drawInfrastructureSprite', 'drawTile']) {
  const fn = qml.match(new RegExp('  function ' + name + '\\([\\s\\S]*?\\n  \\}'))[0];
  root[name] = vm.runInContext('(' + fn + ')', context);
}
let imageCalls = [], fallbackCalls = [];
const ctx = { fillRect() {}, drawImage(...args) { imageCalls.push(args); } };
for (const [type, helper] of Object.entries({ E: 'drawPower', F: 'drawFire', S: 'drawPolice', P: 'drawPark', W: 'drawWater', N: 'drawSchool', H: 'drawMedical' })) {
  root[helper] = () => fallbackCalls.push(type);
  for (let tier = 0; tier < 3; tier++) {
    const source = root.infrastructureSpriteUrls[type][tier];
    assert(fs.existsSync(new URL(source, base)), source);
    assert.equal(root.infrastructureSpriteSource(type, tier), source);
    assert.equal(root.previewSpriteSource(type, tier), source);
    for (const size of [16, 32, 64, 96]) {
      imageCalls = [];
      root.drawTile(ctx, { type, level: tier }, 100, 200, size, [], 0);
      assert.equal(imageCalls.length, 1);
      const [url, x, y, w, h] = imageCalls[0];
      assert.equal(url, source);
      assert([x, y, w, h].every(Number.isFinite));
      assert(Math.abs(y + h - (200 + size * 0.98)) < 1e-8);
      assert.equal(w, h);
    }
    loaded = false;
    fallbackCalls = [];
    root.drawTile(ctx, { type, level: tier }, 0, 0, 32, [], 0);
    assert.deepEqual(fallbackCalls, [type]);
    loaded = true;
  }
  assert.equal(root.infrastructureSpriteSource(type, undefined), root.infrastructureSpriteUrls[type][1]);
  assert.equal(root.infrastructureSpriteSource(type, -1), root.infrastructureSpriteUrls[type][0]);
  assert.equal(root.infrastructureSpriteSource(type, 99), root.infrastructureSpriteUrls[type][2]);
}
assert.equal(root.previewSpriteSource('inspect', 0), '');
for (const [type, family] of [['R', 'residential'], ['C', 'commercial'], ['I', 'industrial']])
  assert.equal(root.previewSpriteSource(type, 0), root[family + 'SpriteUrls'][0][0]);
root.useInfrastructureSprites = false;
for (const type of ['E', 'F', 'S', 'P', 'W']) {
  assert.equal(root.previewSpriteSource(type, 0), '');
  assert.equal(root.drawInfrastructureSprite(ctx, 0, 0, 32, type, 0), false);
}
fallbackCalls = [];
root.drawTile(ctx, { type: 'W', level: 2 }, 0, 0, 32, [], 0);
assert.deepEqual(fallbackCalls, ['W']);
console.log('PASS: 21 infrastructure tiers at 4 scales, asset paths, previews, and loading/disabled fallbacks.');
