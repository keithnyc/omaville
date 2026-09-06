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
for(const type of ['R','C','I']) {
  let plain=0;const shapes=new Set();
  for(let i=0;i<4096;i++) {
    const a=draw(type,i);if(!a.length) plain++;
    assert.deepEqual(a,draw(type,i),'stable repaint');
    assert.deepEqual(a,draw(type,i,96),'stable zoom');
    assert(a.length<=12,'bounded detail');
    shapes.add(JSON.stringify(a));
  }
  assert(plain>1100&&plain<1600,'roughly one third plain');
  // Variety is the point of the second pass: a street of identical frontages
  // reads worse than no dressing at all.
  // Keyed on full geometry, not just colour: side, height and which second
  // object appears are all part of what stops a terrace looking stamped out.
  assert(shapes.size>=8,`${type} needs several distinct dressings, got ${shapes.size}`);
}

// Industry gets a working yard, not a garden. Greens belong to residential and
// commercial planting; if they leak into I the two categories stop reading
// apart at a glance, which is the whole reason industry is dressed differently.
const gardenGreens=new Set(['#29452c','#587b3d','#81964f']);
for(let i=0;i<512;i++)
  for(const [fill] of draw('I',i))
    assert(!gardenGreens.has(fill),'industrial yards use no garden planting');
// And the doorstep is a frontage idea, not a yard one.
for(let i=0;i<512;i++) {
  const yard=draw('I',i);
  if(yard.length) assert(!yard.some(r=>r[1]===0.25&&r[2]===0.88),'no residential doorstep on a yard');
}

for(const type of ['_','#','L','P','T','B','E','W','N','H','M','Q']) assert.equal(draw(type,1).length,0);
assert.equal(draw('R',-1).length,0);
console.log('PASS: stable sparse cosmetic lot details, category gating, tile bounds and balanced canvas state.');
