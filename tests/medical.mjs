import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const math=Object.create(Math); math.random=()=>0.17;
const M=vm.createContext({Math:math});
vm.runInContext(fs.readFileSync(new URL('../Model.js',import.meta.url),'utf8').replace('.pragma library',''),M);
const grid=Array(400).fill('_0'), home=210;
grid[home]='R1';grid[home+1]='#0';
const covered=[{index:home,level:2}];
const u={power:covered,water:covered,fire:covered,police:covered,schools:covered,medical:[]};
assert.equal(M.tickGrid(grid,20,{population:100},70,u,{R:1})[home],'R1');
assert.equal(M.tickGrid(grid,20,{population:50},70,u,{R:1})[home],'R2');
u.medical=covered;
assert.equal(M.tickGrid(grid,20,{population:100},70,u,{R:1})[home],'R2');
u.water=[];
assert.equal(M.tickGrid(grid,20,{population:100},70,u,{R:1})[home],'R1');
for(let tier=0;tier<3;tier++) {
  const g=Array(400).fill('_0');g[home]='H'+tier;
  assert.equal(M.findUtilities(g).medical[0].level,tier);
  assert.equal(M.summarize(g).serviceUpkeep,1.5*M.INFRA_UPKEEP_SCALE[tier]);
  assert.equal(M.totalInvestment('H',tier),[110,310,760][tier]);
  assert.equal(JSON.parse(JSON.stringify(g))[home],'H'+tier);
  assert.equal(M.findUtilities(M.bulldozeTile(g,home)).medical.length,0);
}
console.log('PASS: medical growth/utility gates, starter grace, no abandonment, upkeep, costs, save encoding and demolition.');
