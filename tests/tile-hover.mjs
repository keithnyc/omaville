import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const M=vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../Model.js',import.meta.url),'utf8').replace('.pragma library',''),M);
const qml=fs.readFileSync(new URL('../CityView.qml',import.meta.url),'utf8');
// residentAt is how the inspector answers "who lives here". Stubbed to nobody
// for the sweep below, and exercised on its own further down.
// grid/gridSize are read when the card reports how a lot is reached; a bare
// grid means "no footpath anywhere", which is what the sweep below wants.
const root={attractiveness:4,coverageRadii:{E:M.POWER_RADIUS,W:M.WATER_RADIUS,F:M.FIRE_RADIUS,S:M.POLICE_RADIUS},demandPercent:()=>50,residentAt:()=>null,
  grid:M.emptyGrid(M.GRID_SIZE), gridSize:M.GRID_SIZE, serviceReady:false};
const ctx=vm.createContext({root,Model:M});
for(const n of ['inspectTitle','inspectLines']) root[n]=vm.runInContext('('+qml.match(new RegExp('  function '+n+'\\([\\s\\S]*?\\n  \\}'))[0]+')',ctx);
for(const type of Object.keys(M.COSTS)) for(let level=0;level<(M.UPGRADE_COSTS[type]?3:1);level++) {
  const grid=Array(81).fill('_0');grid[40]=type+level;
  const info=M.inspectTile(grid,9,40,M.findUtilities(grid),{R:1,C:1,I:1},1000,1000);
  const text=root.inspectTitle(info)+'\n'+root.inspectLines(info).join('\n');
  assert(!/undefined|NaN/.test(text),text);
  assert(root.inspectTitle(info).length>0);
}
assert.equal(root.inspectTitle({type:'#',level:1}),'Bridge');
assert(root.inspectLines({type:'L',level:0}).join(' ').includes('Does not provide utility water'));
assert(root.inspectLines({type:'R',level:2,propertyBonus:20,waterfrontBonus:12}).join(' ').includes('Waterfront contributes +12%'));
console.log('PASS: hover/inspect descriptions for all tile families and infrastructure tiers, bridge identity and waterfront status.');

// inspectTile must say which tile it describes. inspectLines is shared by the
// hover card and the Inspect card, so a renderer that cannot ask the info
// object for its own index has to be told out of band — which is how the road
// congestion readout ended up reporting the inspected tile while describing
// the hovered one.
{
  const g = M.emptyGrid(M.GRID_SIZE);
  g[100] = '#0'; g[101] = 'R2';
  for (const at of [100, 101]) {
    const info = M.inspectTile(g, M.GRID_SIZE, at, M.findUtilities(g),
      { R: 1, C: 1, I: 1 }, 500, 500);
    assert.equal(info.index, at, 'the info object knows which tile it is');
  }
}
console.log('PASS: inspect info identifies its own tile.');

// --- the inspector says who lives here ------------------------------------
// The point of naming residents is being able to click a house and be told
// about a person, which is the thing that turns a grid into a place.
{
  const g = M.emptyGrid(M.GRID_SIZE);
  g[100] = '#0'; g[101] = 'R2';
  const info = M.inspectTile(g, M.GRID_SIZE, 101, M.findUtilities(g),
    { R: 1, C: 1, I: 1 }, 500, 500);

  assert.ok(!root.inspectLines(info).join(' ').includes(','),
    'an empty house says nothing about anybody');

  root.residentAt = i => i !== 101 ? null : {
    index: 101, name: 'Elsie Halloway', age: 62, trade: 'a moulder',
    street: 'Mill Road', arrivedYear: 94, yearsHere: 44, grievance: ''
  };
  const text = root.inspectLines(info).join('\n');
  assert.ok(!/undefined|NaN/.test(text), text);
  for (const fact of ['Elsie Halloway', '62', 'a moulder', 'Mill Road', 'Year 94', '44'])
    assert.ok(text.includes(fact), `the inspector should mention ${fact}`);
  assert.ok(!text.includes('Unhappy'), 'a contented resident is not flagged as unhappy');

  root.residentAt = () => ({ index: 101, name: 'Cyril Rooke', age: 40, trade: '',
    street: 'the outskirts', arrivedYear: 130, yearsHere: 0, grievance: 'fire' });
  const cross = root.inspectLines(info).join('\n');
  assert.ok(!/undefined|NaN/.test(cross), cross);
  assert.ok(cross.includes('Unhappy'), 'and an unhappy one is');
  assert.ok(cross.includes('no trade recorded'), 'a resident with no trade still reads');
  root.residentAt = () => null;
}
console.log('PASS: the inspector reports who lives at a tile, or nobody.');

// --- and how a lot is reached ---------------------------------------------
// "Road access: No" was a lie once a footpath could serve a lot, and it is the
// kind of lie that sends a player to build a road they do not need.
{
  const g = M.emptyGrid(M.GRID_SIZE);
  const at = (x, y) => y * M.GRID_SIZE + x;
  for (let y = 10; y < 20; y++) g[at(20, y)] = 'D0';
  g[at(21, 15)] = 'R2';
  root.grid = g;
  const walked = M.inspectTile(g, M.GRID_SIZE, at(21, 15), M.findUtilities(g),
    { R: 1, C: 1, I: 1 }, 500, 500);
  assert.ok(root.inspectLines(walked).join('\n').includes('footpath only'),
    'a lot on a path is reported as reached on foot, not as unreachable');

  const road = g.slice();
  for (let y = 10; y < 20; y++) road[at(20, y)] = '#0';
  root.grid = road;
  assert.ok(root.inspectLines(M.inspectTile(road, M.GRID_SIZE, at(21, 15),
    M.findUtilities(road), { R: 1, C: 1, I: 1 }, 500, 500)).join('\n').includes('road'));

  // The lot stays; only its surface goes. An empty tile is not a zone and
  // never reaches the branch under test.
  const stranded = M.emptyGrid(M.GRID_SIZE);
  stranded[at(21, 15)] = 'R2';
  root.grid = stranded;
  assert.ok(root.inspectLines(M.inspectTile(stranded, M.GRID_SIZE, at(21, 15),
    M.findUtilities(stranded), { R: 1, C: 1, I: 1 }, 500, 500)).join('\n')
    .includes('nothing yet'), 'and a lot with neither says so plainly');

  // The path tile itself explains what it is and what it will not carry.
  const onPath = M.inspectTile(g, M.GRID_SIZE, at(20, 15), M.findUtilities(g),
    { R: 1, C: 1, I: 1 }, 500, 500);
  const text = root.inspectLines(onPath).join('\n');
  assert.ok(/carries no cars/.test(text) && /Industry cannot/.test(text), text);
  const bridge = M.inspectTile(['D1'], 1, 0, M.findUtilities(['D1']), { R: 1, C: 1, I: 1 }, 0, 0);
  assert.ok(root.inspectLines(bridge).join('\n').includes('Footbridge'));
}
console.log('PASS: the inspector says how a lot is reached, and what a footpath will not carry.');
