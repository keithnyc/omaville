import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const M=vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../Model.js',import.meta.url),'utf8').replace('.pragma library',''),M);
const qml=fs.readFileSync(new URL('../CityView.qml',import.meta.url),'utf8');
const root={attractiveness:4,coverageRadii:{E:M.POWER_RADIUS,W:M.WATER_RADIUS,F:M.FIRE_RADIUS,S:M.POLICE_RADIUS},demandPercent:()=>50};
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
