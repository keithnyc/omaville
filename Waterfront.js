.pragma library

// Any odd road level is a bridge, so an avenue bridge ('#3') still has water
// under it and still joins up with the shoreline banks around it.
function wet(value) {
  return value === 'L0'
    || (typeof value === 'string' && value[0] === '#' && Number(value[1]) % 2 === 1)
}
function adjacent(data, size, index) {
  var x = index % size, y = Math.floor(index / size)
  return [y > 0 ? data[index-size] : 'L0', x < size-1 ? data[index+1] : 'L0',
    y < size-1 ? data[index+size] : 'L0', x > 0 ? data[index-1] : 'L0']
}

function drawWater(ctx, x, y, s, data, size, index) {
  ctx.save(); ctx.translate(x,y); ctx.scale(s,s)
  ctx.fillStyle='#28596d'; ctx.fillRect(0,0,1,1)
  var banks=adjacent(data,size,index)
  for(var side=0;side<4;side++) {
    ctx.save(); ctx.translate(.5,.5);ctx.rotate(side*Math.PI/2);ctx.translate(-.5,-.5)
    if(!wet(banks[side])) {
      ctx.fillStyle='#3b775f';ctx.fillRect(0,0,1,.035)
      ctx.fillStyle='#b7aa78';ctx.fillRect(0,.035,1,.04)
      ctx.fillStyle='#589a99';ctx.fillRect(0,.075,1,.055)
      ctx.fillStyle='#387c87';ctx.fillRect(0,.13,1,.045)
      ctx.strokeStyle='rgba(185,222,201,.4)';ctx.lineWidth=.012
      ctx.beginPath();ctx.moveTo(.08,.12);ctx.quadraticCurveTo(.5,.15,.92,.12);ctx.stroke()
    }
    // A neighboring waterfront park owns a short timber pier into this tile.
    if(banks[side] === 'Q0') {
      ctx.fillStyle='rgba(13,35,40,.4)';ctx.fillRect(.37,.03,.3,.33)
      ctx.fillStyle='#98724d';ctx.fillRect(.36,0,.28,.31)
      ctx.fillStyle='#d1ad73'
      for(var plank=0;plank<5;plank++)ctx.fillRect(.37,.012+plank*.058,.26,.044)
      ctx.fillStyle='#604b36';ctx.fillRect(.34,.02,.035,.32);ctx.fillRect(.625,.02,.035,.32)
      ctx.fillStyle='#dcc08b';ctx.fillRect(.33,.28,.055,.055);ctx.fillRect(.62,.28,.055,.055)
    }
    ctx.restore()
  }
  // Deterministic tiny ripples: stable during repaint, no tiled-image seams.
  ctx.strokeStyle='rgba(122,184,192,.25)';ctx.lineWidth=.014
  for(var i=0;i<3;i++) {
    var rx=.20+((index*13+i*19)%53)/100, ry=.28+i*.22
    ctx.beginPath();ctx.moveTo(rx,ry);ctx.quadraticCurveTo(rx+.06,ry+.018,rx+.13,ry);ctx.stroke()
  }
  ctx.restore()
}

function drawBridge(ctx,x,y,s,conn) {
  ctx.save();ctx.translate(x,y);ctx.scale(s,s)
  var vertical=conn.up||conn.down, horizontal=conn.left||conn.right
  if(!vertical&&!horizontal) horizontal=true
  ctx.fillStyle='rgba(10,27,33,.4)'
  if(vertical)ctx.fillRect(.11,0,.80,1)
  if(horizontal)ctx.fillRect(0,.11,1,.80)
  ctx.fillStyle='#555861'
  if(vertical)ctx.fillRect(.16,0,.68,1)
  if(horizontal)ctx.fillRect(0,.16,1,.68)
  ctx.fillStyle='#c0b993'
  for(var mark=0;mark<3;mark++) {
    if(vertical)ctx.fillRect(.489,.06+mark*.34,.022,.18)
    if(horizontal)ctx.fillRect(.06+mark*.34,.489,.18,.022)
  }
  ctx.fillStyle='#a8a69a'
  // Rail segments leave connected side-road entrances open.
  if(vertical) for(var side=0;side<2;side++) {
    var railX=side===0?.14:.83, opening=side===0?conn.left:conn.right
    if(opening){ctx.fillRect(railX,0,.035,.16);ctx.fillRect(railX,.84,.035,.16)}
    else ctx.fillRect(railX,0,.035,1)
  }
  if(horizontal) for(var side=0;side<2;side++) {
    var railY=side===0?.14:.83, opening=side===0?conn.up:conn.down
    if(opening){ctx.fillRect(0,railY,.16,.035);ctx.fillRect(.84,railY,.16,.035)}
    else ctx.fillRect(0,railY,1,.035)
  }
  ctx.fillStyle='#ddd2b0'
  for(var post=0;post<4;post++) {
    var p=.035+post*.30
    if(vertical) {
      if(!conn.left||p<.16||p>.84)ctx.fillRect(.13,p,.06,.05)
      if(!conn.right||p<.16||p>.84)ctx.fillRect(.81,p,.06,.05)
    }
    if(horizontal) {
      if(!conn.up||p<.16||p>.84)ctx.fillRect(p,.13,.05,.06)
      if(!conn.down||p<.16||p>.84)ctx.fillRect(p,.81,.05,.06)
    }
  }
  ctx.restore()
}
