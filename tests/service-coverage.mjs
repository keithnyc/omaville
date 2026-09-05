import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const M=vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../Model.js',import.meta.url),'utf8').replace('.pragma library',''),M);
const size=40, center=820;
const grid=Array(size*size).fill('_0');
assert(M.serviceCoverageStats(grid,size).every(r=>r.residents===0 && r.unmet===0 && r.coverage===100));
for(const [type,key,radius] of [['E','power',M.POWER_RADIUS],['W','water',M.WATER_RADIUS],
  ['F','fire',M.FIRE_RADIUS],['S','police',M.POLICE_RADIUS],['N','schools',M.SCHOOL_RADIUS],['H','medical',M.MEDICAL_RADIUS]]) {
  for(let tier=0;tier<3;tier++) {
    grid.fill('_0');grid[center]=type+tier;
    const reach=Math.floor(radius*M.INFRA_RADIUS_SCALE[tier]);
    grid[center+reach]='R2';grid[center+reach+1]='R1';
    grid[center-size]='C3';grid[center+size]='I3';grid[center-1]='R0';
    const rows=M.serviceCoverageStats(grid,size), row=rows.find(r=>r.key===key);
    assert.equal(row.residents,3*M.RES_CAP_PER_LEVEL);
    assert.equal(row.coverage,67);
    assert.equal(row.unmet,M.RES_CAP_PER_LEVEL);
    assert(rows.filter(r=>r.key!==key).every(r=>r.coverage===0));
    grid[center-size]=type+tier;
    assert.equal(M.serviceCoverageStats(grid,size).find(r=>r.key===key).served,row.served,'overlap not double-counted');
    grid[center]='_0';grid[center-size]='_0';
    assert(M.serviceCoverageStats(grid,size).every(r=>r.coverage===0));
  }
}
console.log('PASS: all six services and three tiers, population weighting, range edges, overlap, removal, empty cities and nonresidential exclusions.');
