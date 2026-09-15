// The land a new city is founded on.
//
// A fresh map used to be 4096 tiles of identical grass. Now it starts with
// lakes, sometimes a river, and woodland. The ways that goes wrong are all
// about the land getting in the way of the game: water over the spot every
// city starts from or across a highway connector, woodland that quietly costs
// upkeep or blocks a zone, or a lake that pays out when it is drained.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const M = vm.createContext({ Math });
vm.runInContext(
  fs.readFileSync(new URL('../Model.js', import.meta.url), 'utf8').replace('.pragma library', ''),
  M);
const size = M.GRID_SIZE;
const centre = (size - 1) / 2;
const seeds = Array.from({ length: 60 }, (_, i) => 1757000000000 + i * 7919);
const count = (grid, type) => grid.filter(t => t[0] === type).length;

// --- the same founding always produces the same land ----------------------
{
  const n = M.makeNeighbors(size, seeds[0]);
  assert.deepEqual(Array.from(M.generateTerrain(size, seeds[0], n)),
    Array.from(M.generateTerrain(size, seeds[0], n)), 'terrain is seeded');
  assert.notDeepEqual(Array.from(M.generateTerrain(size, seeds[0], n)),
    Array.from(M.generateTerrain(size, seeds[1], n)), 'and different seeds differ');
}

// --- every map has variety, and none of it is in the way ------------------
let rivers = 0;
for (const seed of seeds) {
  const neighbors = M.makeNeighbors(size, seed);
  const grid = M.generateTerrain(size, seed, neighbors);
  assert.equal(grid.length, size * size);
  for (const tile of grid) assert.ok(/^[_LX][0-3]$/.test(tile), `unexpected tile ${tile}`);

  const water = count(grid, 'L'), wood = count(grid, 'X');
  assert.ok(wood >= 100, `seed ${seed}: only ${wood} woodland tiles`);
  assert.ok(water > 0, `seed ${seed}: no water at all`);
  assert.ok(water < grid.length * 0.12, `seed ${seed}: ${water} water tiles drowns the map`);

  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = Math.hypot(x - centre, y - centre);
    if (d < M.TERRAIN_CLEAR_RADIUS)
      assert.equal(grid[y * size + x], '_0', `seed ${seed}: centre tile ${x},${y} is not clear`);
  }
  for (const n of neighbors) {
    const cx = n.index % size, cy = Math.floor(n.index / size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++)
      if (Math.hypot(x - cx, y - cy) < M.TERRAIN_CONNECTOR_CLEARANCE)
        assert.equal(grid[y * size + x], '_0', `seed ${seed}: ${n.edge} connector is obstructed`);
  }

  // No lone puddles, and no broken rivers. A river that steps diagonally
  // without filling the corner reads as a chain of one-tile ponds; one clipped
  // around a highway connector stopped dead in a field. Lakes keep off the
  // border, so any water touching an edge is a river and must reach the
  // opposite one.
  const seen = new Set();
  for (let i = 0; i < grid.length; i++) {
    if (grid[i][0] !== 'L' || seen.has(i)) continue;
    let tiles = 0; const stack = [i]; seen.add(i);
    const edges = new Set();
    while (stack.length) {
      const at = stack.pop(); tiles++;
      const x = at % size, y = Math.floor(at / size);
      if (x === 0) edges.add('W'); if (x === size - 1) edges.add('E');
      if (y === 0) edges.add('N'); if (y === size - 1) edges.add('S');
      for (const next of M.neighborIndices(size, at))
        if (grid[next][0] === 'L' && !seen.has(next)) { seen.add(next); stack.push(next); }
    }
    assert.ok(tiles >= 4, `seed ${seed}: a ${tiles}-tile puddle of water`);
    if (edges.size > 0) {
      rivers++;
      assert.ok((edges.has('W') && edges.has('E')) || (edges.has('N') && edges.has('S')),
        `seed ${seed}: water reaches the ${[...edges]} edge but does not cross the map`);
    }
  }
}
assert.ok(rivers > seeds.length * 0.3 && rivers < seeds.length * 0.8,
  `${rivers}/${seeds.length} maps have a river`);

// --- woodland is scenery, not a cost or an obstacle -----------------------
{
  const small = 9;
  const bare = M.emptyGrid(small);
  const wooded = bare.slice().fill('X2');
  bare[40] = wooded[40] = 'R2';
  bare[39] = wooded[39] = '#0';
  for (const type of ['R', 'C', 'I', 'P', '#', 'D', 'E', 'T', 'Q'.replace('Q', 'P')])
    assert.ok(M.canPlace(wooded, 10, type, 1000), `${type} builds straight over woodland`);
  assert.ok(M.canPlace(wooded, 10, 'A', 1000), 'so does an avenue');
  assert.ok(M.canBuildTier(wooded, 10, 'P', 0, 0, 1000, M.CIVIC_MAX).ok, 'and a tiered building');
  assert.equal(M.placeTile(wooded, 10, 'R')[10], 'R0');

  assert.equal(M.totalInvestment('X', 2), 0, 'clearing woodland refunds nothing');
  assert.equal(M.bulldozeTile(wooded, 10)[10], '_0', 'and leaves bare ground');

  const a = M.summarize(bare), b = M.summarize(wooded);
  assert.equal(M.computeAttractiveness(b), M.computeAttractiveness(a), 'woodland adds no appeal');
  assert.equal(M.computeUpkeep(b, M.defaultFunding()), M.computeUpkeep(a, M.defaultFunding()),
    'and costs nothing to keep');
  assert.equal(M.propertyValueBonus(wooded, small, 40), M.propertyValueBonus(bare, small, 40));

  // A lot reaches a road through woodland exactly as it does across grass.
  const reach = M.emptyGrid(small); reach[40] = 'R1'; reach[42] = '#0';
  const reachWooded = reach.slice(); reachWooded[41] = 'X0';
  assert.equal(M.hasRoadAccess(reach, small, 40), true);
  assert.equal(M.hasRoadAccess(reachWooded, small, 40), true, 'woodland is passable for access');
}

// --- water was paid for once, and draining it pays nothing back ----------
assert.equal(M.totalInvestment('L', 0), 0);

// --- the service lays land on a new city, and never over an existing one --
{
  const service = fs.readFileSync(new URL('../Service.qml', import.meta.url), 'utf8');
  const reset = service.match(/function resetCity\([\s\S]*?\n  \}/)[0];
  assert.ok(!/emptyGrid/.test(reset), 'New Game no longer starts on bare grass');
  const neighbors = reset.indexOf('root.neighbors = Model.makeNeighbors');
  const terrain = reset.indexOf('root.grid = Model.generateTerrain(root.gridSize, foundedSeed, root.neighbors)');
  assert.ok(neighbors >= 0 && terrain > neighbors, 'terrain is laid after the connectors it must avoid');
  assert.ok(/root\.foundedAtMs = foundedSeed/.test(reset), 'and from the city\'s own founding seed');
  assert.ok(/if \(Model\.isBlankGrid\(grid\)\) grid = Model\.generateTerrain\(gridSize, foundedAtMs, neighbors\)/
    .test(service), 'a first launch gets terrain only on a blank grid');
  assert.equal(M.isBlankGrid(M.emptyGrid(4)), true);
  const built = M.emptyGrid(4); built[5] = 'R0';
  assert.equal(M.isBlankGrid(built), false);
}

// --- and the view can draw and name it ------------------------------------
{
  const view = fs.readFileSync(new URL('../CityView.qml', import.meta.url), 'utf8');
  assert.ok(/case Model\.TILE_WILD:\s*\n\s*root\.drawEmpty\(ctx, gx, gy, cellSize\)\s*\n\s*root\.drawWoodland/.test(view),
    'drawTile paints woodland');
  assert.equal(M.TILE_LABELS.X, 'Woodland');
  const stands = view.match(/readonly property var woodlandStands: \[([\s\S]*?)\n  \]/)[1];
  assert.equal((stands.match(/^\s*\[\[/gm) || []).length, 4, 'one arrangement per tile level 0-3');
}

console.log(`PASS: terrain seeded, varied (${rivers}/${seeds.length} with rivers), clear centre and connectors, no puddles, woodland free and buildable, water refunds nothing, wired into new cities.`);
