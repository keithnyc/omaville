// Read the actual renderer helpers, without loading a service or touching saves.
// Run: node tests/infrastructure-art.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const base = new URL('../', import.meta.url);
const qml = fs.readFileSync(new URL('CityView.qml', base), 'utf8');
// roadConnCache is a QML binding rather than a function, so the harness
// supplies it directly. Empty here, which is what an empty grid produces and
// which exercises connectionsAt's out-of-range fallback.
const root = { grid: [], gridSize: 64, roadConnCache: [],
  useInfrastructureSprites: true, useResidentialSprites: true,
  useCommercialSprites: true, useIndustrialSprites: true };
const Model = { TILE_RES: 'R', TILE_COM: 'C', TILE_IND: 'I', TILE_PARK: 'P',
  TILE_POWER: 'E', TILE_WATER: 'W', TILE_FIRE: 'F', TILE_POLICE: 'S', TILE_SCHOOL: 'N', TILE_MEDICAL: 'H', TILE_TRANSIT: 'M', TILE_ROAD: '#', TILE_TREE: 'T', TILE_FLOWERS: 'B' };
let loaded = true;
const context = vm.createContext({ root, Model, Qt: { resolvedUrl: x => x },
  cityCanvas: { isImageLoaded: () => loaded } });
for (const key of ['infrastructureSpriteUrls', 'spriteLotTints', 'decorationSpriteUrls', 'decorationMetrics']) {
  const expression = qml.match(new RegExp('readonly property var ' + key + ': (\\(\\{[\\s\\S]*?\\}\\))'))[1];
  root[key] = vm.runInContext(expression, context);
}
for (const key of ['residentialSpriteUrls', 'commercialSpriteUrls', 'industrialSpriteUrls']) {
  const expression = qml.match(new RegExp('readonly property var ' + key + ': (\\[[\\s\\S]*?\\n  \\])'))[1];
  root[key] = vm.runInContext(expression, context);
}
for (const name of ['roadConnections', 'connectionsAt', 'drawEntrancePath', 'drawSpriteLot', 'infrastructureSpriteSource', 'previewSpriteSource', 'drawInfrastructureSprite', 'drawTile']) {
  const fn = qml.match(new RegExp('  function ' + name + '\\([\\s\\S]*?\\n  \\}'))[0];
  root[name] = vm.runInContext('(' + fn + ')', context);
}
let imageCalls = [], fallbackCalls = [];
const ctx = { fillRect() {}, drawImage(...args) { imageCalls.push(args); } };
for (const [type, helper] of Object.entries({ E: 'drawPower', F: 'drawFire', S: 'drawPolice', P: 'drawPark', W: 'drawWater', N: 'drawSchool', H: 'drawMedical', M: 'drawTransit' })) {
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
for (const type of ['E', 'F', 'S', 'P', 'W', 'M']) {
  assert.equal(root.previewSpriteSource(type, 0), '');
  assert.equal(root.drawInfrastructureSprite(ctx, 0, 0, 32, type, 0), false);
}
fallbackCalls = [];
root.drawTile(ctx, { type: 'W', level: 2 }, 0, 0, 32, [], 0);
assert.deepEqual(fallbackCalls, ['W']);
console.log('PASS: 24 infrastructure tiers at 4 scales, asset paths, previews, and loading/disabled fallbacks.');

assert.equal(root.decorationMetrics.B.scale,root.decorationMetrics.T.scale);
assert.equal(root.decorationMetrics.B.baseline,root.decorationMetrics.T.baseline);
for (const type of ['T','B']) for (const size of [16,32,48,96]) {
  imageCalls=[];
  root.drawTile(ctx,{type,level:0},100,200,size,[],0);
  assert.equal(imageCalls.length,1);
  const [source,x,y,w,h]=imageCalls[0];
  assert.equal(source,root.decorationSpriteUrls[type]);
  assert.equal(w,h);
  assert(Math.abs(y+h-(200+size*0.97))<1e-8);
}
console.log('PASS: tree and flowerbed share scale/baseline at four zoom levels.');

if (process.argv.includes('--preview')) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omaville-transit-preview-'));
  const declarations = ['infrastructureSpriteUrls', 'spriteLotTints', 'decorationSpriteUrls', 'decorationMetrics'].map(key =>
    qml.match(new RegExp('  readonly property var ' + key + ': \\(\\{[\\s\\S]*?\\}\\)'))[0]);
  const functions = ['drawSpriteLot', 'infrastructureSpriteSource', 'drawInfrastructureSprite', 'drawTile'].map(name =>
    qml.match(new RegExp('  function ' + name + '\\([\\s\\S]*?\\n  \\}'))[0]);
  fs.writeFileSync(path.join(dir, 'tst_transit.qml'), `
import QtQuick
import QtTest
Item {
  id: root; width: 720; height: 620
  property bool useInfrastructureSprites: true
  property var model: ${JSON.stringify(Model)}
  property bool ready: false
  ${declarations.join('\n').replaceAll('Qt.resolvedUrl("assets/', 'Qt.resolvedUrl("' + base.href + 'assets/')}
  ${functions.join('\n').replaceAll('Model.', 'root.model.')}
  function drawEntrancePath(ctx,x,y,s,index) {}
  Canvas {
    id: cityCanvas; anchors.fill: parent
    Component.onCompleted: {
      for(var tier=0;tier<3;tier++) loadImage(root.infrastructureSpriteUrls.M[tier])
      loadImage(root.decorationSpriteUrls.T);loadImage(root.decorationSpriteUrls.B)
    }
    onPaint: {
      var ctx=getContext("2d"); ctx.fillStyle="#20202e";ctx.fillRect(0,0,width,height)
      ctx.font="16px monospace";ctx.fillStyle="#c6cbe0"
      var labels=["Bus Depot","Tram Line","Transit Hub"]
      for(var tier=0;tier<3;tier++) {
        ctx.fillStyle="#c6cbe0";ctx.fillText(labels[tier],24+tier*230,26)
        root.drawInfrastructureSprite(ctx,24+tier*230,65,180,"M",tier,0)
        root.drawInfrastructureSprite(ctx,24+tier*230,292,32,"M",tier,0)
        root.drawInfrastructureSprite(ctx,82+tier*230,276,48,"M",tier,0)
      }
      ctx.fillStyle="#c6cbe0";ctx.fillText("Matching decoration camera / baseline",24,380)
      for(var d=0;d<2;d++) {
        var type=d===0?"T":"B"
        root.drawTile(ctx,{type:type,level:0},24+d*220,410,160,[],0)
        root.drawTile(ctx,{type:type,level:0},470+d*100,485,48,[],0)
      }
      root.ready=true
    }
  }
  TestCase {
    name:"TransitArtPreview";when:windowShown
    function test_render() {
      tryVerify(function(){return root.infrastructureSpriteUrls.M.every(function(s){return cityCanvas.isImageLoaded(s)})},10000)
      tryVerify(function(){return cityCanvas.isImageLoaded(root.decorationSpriteUrls.T)&&cityCanvas.isImageLoaded(root.decorationSpriteUrls.B)},10000)
      root.ready=false;cityCanvas.requestPaint();tryCompare(root,"ready",true);wait(200)
      var img=grabImage(cityCanvas);compare(img.width,720);img.save("${dir}/preview.png")
    }
  }
}`);
  const result = spawnSync('/usr/lib/qt6/bin/qmltestrunner', ['-input',dir], {
    env:{...process.env,QT_QPA_PLATFORM:'offscreen',QT_QPA_PLATFORMTHEME:'generic',QT_QUICK_CONTROLS_STYLE:'Basic',QT_QUICK_BACKEND:'software'},encoding:'utf8'});
  process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');
  assert.equal(result.status,0);assert(fs.statSync(path.join(dir,'preview.png')).size>1000);
  console.log('Preview: '+dir+'/preview.png');
}
