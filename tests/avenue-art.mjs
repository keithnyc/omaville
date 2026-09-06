import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const qml=fs.readFileSync(new URL('../CityView.qml',import.meta.url),'utf8');
const names=['roadTextureHash','drawRoad','drawAvenueMarkings'];
const functions=names.map(n=>qml.match(new RegExp('  function '+n+'\\([\\s\\S]*?\\n  \\}'))[0]);
const root={};const context=vm.createContext({root});
functions.forEach((f,i)=>root[names[i]]=vm.runInContext('('+f+')',context));
const waterfront=fs.readFileSync(new URL('../Waterfront.js',import.meta.url),'utf8').replace('.pragma library','');
const W=vm.createContext({});vm.runInContext(waterfront,W);
let depth=0,strokes=[];
const ctx=new Proxy({save(){depth++},restore(){depth--},stroke(){strokes.push(this.strokeStyle)},
  createRadialGradient(){return {addColorStop(){}}}}, {
  get(o,k){return k in o?o[k]:(...a)=>{for(const v of a)if(typeof v==='number')assert(Number.isFinite(v));}},
  set(o,k,v){o[k]=v;return true;}
});
for(let mask=0;mask<16;mask++) for(const size of [16,32,48,96]) {
  const conn={up:!!(mask&1),right:!!(mask&2),down:!!(mask&4),left:!!(mask&8)};
  strokes=[];root.drawRoad(ctx,0,0,size,conn,42,true);
  assert(!strokes.includes('rgba(232, 230, 211, 0.72)'),'avenue suppresses street centre paint');
  root.drawAvenueMarkings(ctx,0,0,size,conn);
  assert(strokes.includes('#d4b45f'),'all masks get avenue identity');
  W.drawBridge(ctx,0,0,size,conn,true);root.drawAvenueMarkings(ctx,0,0,size,conn);
  root.drawRoad(ctx,0,0,size,conn,42,false);
  assert.equal(depth,0,'balanced canvas state');
}
assert(qml.includes('roadConn, index, tile.level >= 2'));
assert(qml.includes('roadConn, tile.level >= 2'));
console.log('PASS: 16 avenue/bridge masks at four scales, no old street centre paint, finite geometry and balanced canvas state.');
if(process.argv.includes('--preview')) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'omaville-avenue-preview-'));
  const bridge=waterfront.match(/function drawBridge\([\s\S]*?\n\}/)[0];
  fs.writeFileSync(path.join(dir,'tst_roads.qml'), `
import QtQuick
import QtTest
Item {
 id:root;width:880;height:600;property bool ready:false
 ${functions.join('\n')}
 ${bridge}
 Canvas {
  id:canvas;anchors.fill:parent
  onPaint:{
   var ctx=getContext("2d");ctx.fillStyle="#20202e";ctx.fillRect(0,0,width,height)
   ctx.fillStyle="#c6cbe0";ctx.font="16px monospace"
   ctx.fillText("Avenues - all 16 connections",20,25);ctx.fillText("Avenue bridges",450,25)
   for(var mask=0;mask<16;mask++) {
    var conn={up:!!(mask&1),right:!!(mask&2),down:!!(mask&4),left:!!(mask&8)}
    var x=20+(mask%4)*100,y=55+Math.floor(mask/4)*100
    root.drawRoad(ctx,x,y,80,conn,mask,true);root.drawAvenueMarkings(ctx,x,y,80,conn)
    ctx.fillStyle="#285a6a";ctx.fillRect(x+430,y,80,80)
    root.drawBridge(ctx,x+430,y,80,conn,true);root.drawAvenueMarkings(ctx,x+430,y,80,conn)
   }
   ctx.fillStyle="#c6cbe0";ctx.fillText("Street / avenue at 32px and 48px",20,480)
   for(var a=0;a<2;a++)for(var j=0;j<4;j++) {
    var c={up:false,down:false,left:true,right:true},s=a===0?32:48
    root.drawRoad(ctx,20+j*s,500+a*45,s,c,j,false)
    root.drawRoad(ctx,270+j*s,500+a*45,s,c,j,true)
    root.drawAvenueMarkings(ctx,270+j*s,500+a*45,s,c)
   }
   root.ready=true
  }
 }
 TestCase {name:"AvenuePreview";when:windowShown
  function test_render(){canvas.requestPaint();tryCompare(root,"ready",true);wait(200);grabImage(canvas).save("${dir}/preview.png")}
 }
}`);
  const r=spawnSync('/usr/lib/qt6/bin/qmltestrunner',['-input',dir],{encoding:'utf8',env:{...process.env,QT_QPA_PLATFORM:'offscreen',QT_QPA_PLATFORMTHEME:'generic',QT_QUICK_CONTROLS_STYLE:'Basic',QT_QUICK_BACKEND:'software'}});
  process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');assert.equal(r.status,0);
  assert(fs.statSync(path.join(dir,'preview.png')).size>1000);console.log('Preview: '+dir+'/preview.png');
}
