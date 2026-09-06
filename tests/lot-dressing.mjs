import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const qml=fs.readFileSync(new URL('../CityView.qml',import.meta.url),'utf8');
const fn=vm.runInNewContext('('+qml.match(/  function drawLotDressing\([\s\S]*?\n  \}/)[0]+')');
function draw(type,index,size=48) {
  const rects=[];let balance=0;
  const ctx={save(){balance++},restore(){balance--},translate(){},scale(){},
    fillRect(x,y,w,h){
      assert(x>=0&&y>=0&&x+w<=1&&y+h<=1,'inside lot');
      rects.push([this.fillStyle,x,y,w,h]);
    }};
  fn(ctx,0,0,size,type,index);assert.equal(balance,0);return rects;
}
for(const type of ['R','C']) {
  let plain=0;
  for(let i=0;i<4096;i++) {
    const a=draw(type,i);if(!a.length) plain++;
    assert.deepEqual(a,draw(type,i),'stable repaint');
    assert.deepEqual(a,draw(type,i,96),'stable zoom');
    assert(a.length<=10,'bounded detail');
  }
  assert(plain>1100&&plain<1600,'roughly one third plain');
}
for(const type of ['I','_','#','L','P','T','B','E','W','N','H']) assert.equal(draw(type,1).length,0);
assert.equal(draw('R',-1).length,0);
console.log('PASS: stable sparse cosmetic lot details, category gating, tile bounds and balanced canvas state.');
