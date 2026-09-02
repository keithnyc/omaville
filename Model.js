.pragma library

// Pure city-simulation math, kept separate from Service.qml's stateful
// plumbing so the tick logic can be read and tuned on its own.

var GRID_SIZE = 18

// Each tile is a 2-char string: type + density level (0-3 for R/C/I,
// always 0 for road/park/empty). Compact enough that a full 18x18 grid is
// a few KB of JSON, well under the plugin state read cap.
var TILE_EMPTY = "_"
var TILE_ROAD = "#"
var TILE_RES = "R"
var TILE_COM = "C"
var TILE_IND = "I"
var TILE_PARK = "P"

var COSTS = { "#": 10, "R": 5, "C": 5, "I": 5, "P": 15 }
var TILE_LABELS = {
  "_": "Clear", "#": "Road", "R": "Residential", "C": "Commercial",
  "I": "Industrial", "P": "Park"
}

var RES_CAP_PER_LEVEL = 15
var COM_JOBS_PER_LEVEL = 8
var IND_JOBS_PER_LEVEL = 12

var MILESTONES = [50, 150, 400, 1000, 2500, 5000, 10000, 20000]

function emptyGrid(size) {
  var grid = new Array(size * size)
  for (var i = 0; i < grid.length; i++) grid[i] = TILE_EMPTY + "0"
  return grid
}

function parseTile(str) {
  if (typeof str !== "string" || str.length < 2) return { type: TILE_EMPTY, level: 0 }
  var level = Number(str[1])
  return { type: str[0], level: isFinite(level) ? level : 0 }
}

function makeTile(type, level) {
  return type + String(Math.max(0, Math.min(3, level)))
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function neighborIndices(gridSize, index) {
  var x = index % gridSize
  var y = Math.floor(index / gridSize)
  var out = []
  if (x > 0) out.push(index - 1)
  if (x < gridSize - 1) out.push(index + 1)
  if (y > 0) out.push(index - gridSize)
  if (y < gridSize - 1) out.push(index + gridSize)
  return out
}

function isRoadAdjacent(grid, gridSize, index) {
  var neighbors = neighborIndices(gridSize, index)
  for (var i = 0; i < neighbors.length; i++)
    if (grid[neighbors[i]] && grid[neighbors[i]][0] === TILE_ROAD) return true
  return false
}

// One pass over the grid: population/jobs/counts, used both to drive this
// tick's growth decisions and to report bar-widget stats.
function summarize(grid) {
  var stats = {
    population: 0, jobsCommercial: 0, jobsIndustrial: 0,
    roadCount: 0, parkCount: 0, resCount: 0, comCount: 0, indCount: 0,
    builtDensity: 0
  }
  for (var i = 0; i < grid.length; i++) {
    var tile = parseTile(grid[i])
    switch (tile.type) {
    case TILE_ROAD: stats.roadCount++; break
    case TILE_PARK: stats.parkCount++; break
    case TILE_RES:
      stats.resCount++
      stats.population += tile.level * RES_CAP_PER_LEVEL
      stats.builtDensity += tile.level
      break
    case TILE_COM:
      stats.comCount++
      stats.jobsCommercial += tile.level * COM_JOBS_PER_LEVEL
      stats.builtDensity += tile.level
      break
    case TILE_IND:
      stats.indCount++
      stats.jobsIndustrial += tile.level * IND_JOBS_PER_LEVEL
      stats.builtDensity += tile.level
      break
    }
  }
  return stats
}

function computeHappiness(taxRatePercent, stats) {
  var taxPenalty = Math.max(0, taxRatePercent - 10) * 1.5
  var parkBonus = Math.min(20, stats.parkCount * 4)
  var industrialPenalty = Math.min(25, stats.indCount * 2)
  return Math.round(clamp(70 - taxPenalty + parkBonus - industrialPenalty, 0, 100))
}

// Growth/abandonment for one minute. Demand factors use the *pre-tick*
// stats so every tile decides off the same snapshot, not a shifting one.
function tickGrid(grid, gridSize, stats, happiness) {
  var jobsTotal = stats.jobsCommercial + stats.jobsIndustrial
  var demand = {
    R: 0.5 + 0.5 * clamp(jobsTotal / (stats.population + 10), 0, 1.5),
    C: 0.5 + 0.5 * clamp(stats.population / (stats.jobsCommercial + 10), 0, 1.5),
    I: 0.6 + 0.3 * clamp(stats.population / (stats.jobsIndustrial + 50), 0, 1.0)
  }
  var happinessFactor = clamp(happiness / 70, 0.3, 1.5)
  var baseGrowthChance = 0.15
  var baseDecayChance = 0.08

  var next = grid.slice()
  for (var i = 0; i < next.length; i++) {
    var tile = parseTile(next[i])
    if (tile.type !== TILE_RES && tile.type !== TILE_COM && tile.type !== TILE_IND) continue

    var connected = isRoadAdjacent(grid, gridSize, i)
    if (connected && tile.level < 3 && happiness >= 20) {
      var growthChance = baseGrowthChance * demand[tile.type] * happinessFactor
      if (Math.random() < growthChance) {
        next[i] = makeTile(tile.type, tile.level + 1)
        continue
      }
    }
    if (tile.level > 0 && (!connected || happiness < 25)) {
      if (Math.random() < baseDecayChance) next[i] = makeTile(tile.type, tile.level - 1)
    }
  }
  return next
}

// Upkeep scales with what's actually built, not just zoned — an empty
// zoned tile costs nothing until something grows on it.
function computeUpkeep(stats) {
  return stats.roadCount * 0.2 + stats.parkCount * 0.1 + stats.builtDensity * 0.3
}

function computeIncome(population, taxRatePercent) {
  return population * taxRatePercent * 0.02
}

// One full minute of simulation. Returns the new grid plus everything the
// service needs to update its own properties and persist.
function advanceCity(grid, gridSize, taxRatePercent) {
  var stats = summarize(grid)
  var happiness = computeHappiness(taxRatePercent, stats)
  var nextGrid = tickGrid(grid, gridSize, stats, happiness)
  var upkeep = computeUpkeep(stats)
  var income = computeIncome(stats.population, taxRatePercent)
  return {
    grid: nextGrid,
    population: stats.population,
    jobs: stats.jobsCommercial + stats.jobsIndustrial,
    happiness: happiness,
    incomeDelta: income - upkeep,
    income: income,
    upkeep: upkeep,
    roadCount: stats.roadCount,
    parkCount: stats.parkCount,
    resCount: stats.resCount,
    comCount: stats.comCount,
    indCount: stats.indCount
  }
}

// Newly-crossed population thresholds this tick, in ascending order.
function newMilestones(population, reached) {
  var out = []
  for (var i = 0; i < MILESTONES.length; i++) {
    var threshold = MILESTONES[i]
    if (population >= threshold && reached.indexOf(threshold) < 0) out.push(threshold)
  }
  return out
}

function canPlace(grid, index, type, treasury) {
  if (index < 0 || index >= grid.length) return false
  var cost = COSTS[type]
  if (cost === undefined) return false
  if (treasury < cost) return false
  var current = parseTile(grid[index])
  if (type === TILE_ROAD || type === TILE_PARK) return current.type === TILE_EMPTY
  return current.type === TILE_EMPTY
}

function placeTile(grid, index, type) {
  var next = grid.slice()
  next[index] = makeTile(type, 0)
  return next
}

function bulldozeTile(grid, index) {
  var next = grid.slice()
  next[index] = makeTile(TILE_EMPTY, 0)
  return next
}
