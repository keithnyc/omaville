// Actual production renderer and deterministic choices, plus optional Qt preview.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const qml = fs.readFileSync(new URL('../CityView.qml', import.meta.url), 'utf8');
const declarations = ['residentialSpriteUrls', 'commercialSpriteUrls'].map(name =>
  qml.match(new RegExp('  readonly property var '+name+': \\[[\\s\\S]*?\\n  \\]'))[0]);
declarations.push(qml.match(/  readonly property var matureSpriteFrames: \(\{[\s\S]*?\}\)/)[0]);
const names = ['spriteSourceFor','drawMatureVariant','drawLotDressing','drawResidentialSprite','drawCommercialSprite'];
const functions = names.map(name => qml.match(new RegExp('  function '+name+'\\([\\s\\S]*?\\n  \\}'))[0]);
const root = {useResidentialSprites:true,useCommercialSprites:true,drawSpriteLot() {}};
const ctx = vm.createContext({root,Qt:{resolvedUrl:s=>s},cityCanvas:{isImageLoaded:()=>true}});
for (const declaration of declarations) {
  const [,name,expression] = declaration.match(/property var (\w+): ([\s\S]*)/);
  root[name] = vm.runInContext(expression,ctx);
}
functions.forEach((fn,i)=>root[names[i]]=vm.runInContext('('+fn+')',ctx));
for (const family of ['Residential','Commercial']) {
  const sets = root[family.toLowerCase()+'SpriteUrls'];
  assert.deepEqual(Array.from(sets,s=>s.length),[2,2,4]);
  const seen = new Set();
  for (let index=0;index<4096;index++) {
    const source = root.spriteSourceFor(sets,3,index);
    seen.add(source);
    assert.equal(source,root.spriteSourceFor(sets,3,index));
  }
  assert.equal(seen.size,4);
  for (const source of sets[2]) {
    assert(fs.existsSync(new URL('../'+source,import.meta.url)));
    const index = Array.from({length:100},(_,i)=>i).find(i=>root.spriteSourceFor(sets,3,i)===source);
    for (const size of [16,32,48,64,96]) {
      let draw;
      assert(root['draw'+family+'Sprite']({drawImage:(...a)=>draw=a,save(){},restore(){},translate(){},scale(){},fillRect(){}},100,200,size,3,index));
      const [x,y,w,h] = draw.slice(-4);
      assert(x>=100 && y>=200 && x+w<=100+size && y+h<=200+size);
      if (draw.length===9) assert(Math.abs(w/h-draw[3]/draw[4])<1e-9,'no stretching');
    }
  }
}
console.log('PASS: four mature variants per family, stable selection, asset paths, aspect ratios and tile bounds at five scales.');

if (process.argv.includes('--preview')) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'omaville-mature-preview-'));
  const assetBase = new URL('../',import.meta.url).href;
  fs.writeFileSync(path.join(dir,'tst_art.qml'), `
import QtQuick
import QtTest
Item {
  id: root; width: 800; height: 440
  property bool useResidentialSprites: true
  property bool useCommercialSprites: true
  property bool ready: false
  ${declarations.join('\n').replaceAll('Qt.resolvedUrl("assets/','Qt.resolvedUrl("'+assetBase+'assets/')}
  ${functions.join('\n')}
  function drawSpriteLot(ctx,x,y,s,type,index) {
    ctx.fillStyle = type === "R" ? "#3b5037" : "#3d4840"
    ctx.fillRect(x,y,s,s)
  }
  Canvas {
    id: cityCanvas; anchors.fill: parent
    onPaint: {
      var ctx = getContext("2d"); ctx.fillStyle="#20202e";ctx.fillRect(0,0,width,height)
      ctx.fillStyle="#c6cbe0";ctx.font="16px monospace"
      ctx.fillText("Mature residential / commercial - production renderer",16,25)
      for (var row=0;row<4;row++) for (var col=0;col<14;col++) {
        var idx=700+row*64+col
        if (row<2) root.drawResidentialSprite(ctx,16+col*54,40+row*54,54,3,idx)
        else root.drawCommercialSprite(ctx,16+col*54,64+row*54,54,3,idx)
      }
      // Larger strip checks each silhouette, not only a random sample.
      for (var family=0;family<2;family++) {
        var sets=family===0?root.residentialSpriteUrls:root.commercialSpriteUrls
        for (var v=0;v<4;v++) {
          var index=0
          while(root.spriteSourceFor(sets,3,index)!==sets[2][v]) index++
          if(family===0) root.drawResidentialSprite(ctx,16+v*94,310,90,3,index)
          else root.drawCommercialSprite(ctx,420+v*90,310,90,3,index)
        }
      }
      root.ready=true
    }
    Component.onCompleted: {
      for(var f=0;f<2;f++) {
        var sets=f===0?root.residentialSpriteUrls:root.commercialSpriteUrls
        for(var i=0;i<sets[2].length;i++) loadImage(sets[2][i])
      }
    }
  }
  TestCase {
    name: "MatureArtPreview"; when: windowShown
    function test_render() {
      tryVerify(function() {
        return root.residentialSpriteUrls[2].concat(root.commercialSpriteUrls[2]).every(function(s){return cityCanvas.isImageLoaded(s)})
      },10000)
      root.ready=false; cityCanvas.requestPaint(); tryCompare(root,"ready",true)
      wait(200)
      var preview=grabImage(cityCanvas)
      compare(preview.width,800)
      preview.save("${dir}/preview.png")
    }
  }
}`);
  const result=spawnSync('/usr/lib/qt6/bin/qmltestrunner',['-input',dir],{
    env:{...process.env,QT_QPA_PLATFORM:'offscreen',QT_QPA_PLATFORMTHEME:'generic',QT_QUICK_CONTROLS_STYLE:'Basic',QT_QUICK_BACKEND:'software'},encoding:'utf8'});
  process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');
  assert.equal(result.status,0);
  assert(fs.statSync(path.join(dir,'preview.png')).size>1000);
  console.log('Preview: '+dir+'/preview.png');
}
