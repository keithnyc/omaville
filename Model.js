.pragma library

// Pure city-simulation math, kept separate from Service.qml's stateful
// plumbing so the tick logic can be read and tuned on its own.

var GRID_SIZE = 64

// Each tile is a 2-char string: type + density level (0-3 for R/C/I,
// always 0 for road/park/empty). Compact enough that a full 18x18 grid is
// a few KB of JSON, well under the plugin state read cap.
var TILE_EMPTY = "_"
var TILE_ROAD = "#"
// Bridges retain road identity for utilities/traffic; #1 means road over water.
var TILE_LAKE = "L"
var TILE_WATERFRONT_PARK = "Q"
var BRIDGE_COST = 35
var TILE_RES = "R"
var TILE_COM = "C"
var TILE_IND = "I"
var TILE_PARK = "P"
var TILE_POWER = "E"
var TILE_WATER = "W"
var TILE_FIRE = "F"
var TILE_POLICE = "S"
var TILE_SCHOOL = "N"
var SCHOOL_RADIUS = 10
var SCHOOL_UPKEEP = 1.2
var TILE_MEDICAL = "H"
var MEDICAL_RADIUS = 10
var MEDICAL_UPKEEP = 1.5
var TILE_TREE = "T"
var TILE_FLOWERS = "B"

var COSTS = { "#": 10, "R": 5, "C": 5, "I": 5, "P": 10, "E": 90, "W": 60, "F": 70, "S": 70, "T": 12, "B": 18, "N": 100, "H": 110, "L": 4, "Q": 30 }
var TILE_LABELS = {
  "_": "Clear", "#": "Road", "R": "Residential", "C": "Commercial",
  "I": "Industrial", "P": "Playground", "E": "Generator", "W": "Well",
  "F": "Firehouse", "S": "Substation", "T": "Tree", "B": "Flowerbed", "N": "Elementary School", "H": "Clinic", "L": "Water", "Q": "Waterfront Park"
}

var DECORATION_RADIUS = 3
var MAX_PROPERTY_BONUS = 25

function propertyValueBonus(grid, gridSize, index) {
  var x = index % gridSize, y = Math.floor(index / gridSize), bonus = 0
  for (var dy = -DECORATION_RADIUS; dy <= DECORATION_RADIUS; dy++) {
    for (var dx = -DECORATION_RADIUS; dx <= DECORATION_RADIUS; dx++) {
      var nx = x + dx, ny = y + dy, distance = Math.sqrt(dx * dx + dy * dy)
      if (nx < 0 || ny < 0 || nx >= gridSize || ny >= gridSize || distance === 0 || distance > DECORATION_RADIUS) continue
      var type = parseTile(grid[ny * gridSize + nx]).type
      if (type === TILE_TREE) bonus += 6 / distance
      else if (type === TILE_FLOWERS) bonus += 8 / distance
    }
  }
  return Math.min(MAX_PROPERTY_BONUS, Math.round(bonus)) + waterfrontBonus(grid, gridSize, index)
}

function isWaterTile(value) {
  var tile = parseTile(value)
  return tile.type === TILE_LAKE || (tile.type === TILE_ROAD && tile.level === 1)
}

function waterfrontBonus(grid, gridSize, index) {
  var x = index % gridSize, y = Math.floor(index / gridSize), nearest = Infinity
  for (var dy = -3; dy <= 3; dy++) for (var dx = -3; dx <= 3; dx++) {
    var nx = x + dx, ny = y + dy, distance = Math.sqrt(dx * dx + dy * dy)
    if (!distance || distance > 3 || nx < 0 || ny < 0 || nx >= gridSize || ny >= gridSize) continue
    if (isWaterTile(grid[ny * gridSize + nx])) nearest = Math.min(nearest, distance)
  }
  return nearest <= 1 ? 12 : nearest <= 2 ? 8 : nearest <= 3 ? 4 : 0
}

function shoreAdjacent(grid, gridSize, index) {
  return neighborIndices(gridSize, index).some(function(i) { return isWaterTile(grid[i]) })
}

function placementCost(grid, index, type) {
  return type === TILE_ROAD && parseTile(grid[index]).type === TILE_LAKE ? BRIDGE_COST : COSTS[type]
}

function computeAttractiveness(stats) {
  return Math.min(15, Math.round((stats.decorationPoints || 0) * 4 / Math.max(4, stats.resCount || 0)))
}

// A city with zero population has zero income, full stop — so a treasury
// that's already gone negative (over-built before power/water landed, an
// expensive dilemma choice, whatever) has no way to climb back out on its
// own: upkeep keeps compounding the debt every tick regardless of how deep
// it already is. Without a floor that's a genuine soft-lock, not just a
// rough patch — bulldozing everything for a full refund still might not
// cover both the accumulated debt *and* whatever's still needed to fix the
// actual problem (e.g. a missing power plant). The floor caps how deep
// insolvency can get: once here, further upkeep is simply waived rather
// than compounding, same spirit as a city halting services it can't pay
// for instead of quietly going trillions in debt.
var TREASURY_FLOOR = -200

var RES_CAP_PER_LEVEL = 15
var COM_JOBS_PER_LEVEL = 8
var IND_JOBS_PER_LEVEL = 12

// Square (Chebyshev-distance) coverage — simple to compute even over a
// 64x64 grid with several plants, and easy to read on the map: a coverage
// area is just a square around the plant, not a fiddly falloff curve.
var POWER_RADIUS = 9
var WATER_RADIUS = 9
// Recurring monthly cost per plant. Deliberately a real number: building
// infrastructure used to be a one-off purchase whose $1.65/month tail was
// small enough to ignore entirely, so a mayor could carpet the map with
// plants and never feel it. Every one of these is now a bill that arrives
// every month for as long as the building stands.
var POWER_UPKEEP = 6
var WATER_UPKEEP = 4

// Fire/police are protection, not hookups — unlike power/water they never
// block growth outright (retrofitting that onto an existing city would stall
// every zone at once the moment this shipped). Instead an uncovered built
// tile carries a small *extra* chance of losing a level each tick, on top of
// whatever the normal connected/happiness decay already rolls — a slow tax
// on skipping them rather than a hard requirement.
var FIRE_RADIUS = 9
var POLICE_RADIUS = 9
var FIRE_UPKEEP = 2
var POLICE_UPKEEP = 2
var FIRE_RISK_CHANCE = 0.03
var CRIME_RISK_CHANCE = 0.03

// --- department funding ---------------------------------------------------
// The treasury stopped being a constraint once a city matured: income scales
// with population, but upkeep only scaled with tile count, so a grown city
// just accumulated money with nothing left to spend it on. Funding is the
// permanent sink. Each department runs at a player-set level, and its cost is
// charged per resident served rather than per building — so unlike a one-off
// purchase it keeps scaling for as long as the city grows. Modelled on
// SimCity's department budget rather than invented, since that is the game
// this one is chasing.
var FUNDABLE_SERVICES = ["F", "S", "N", "H"]
var FUNDING_MIN = 0.5
var FUNDING_MAX = 1.5
var FUNDING_DEFAULT = 1

// Cost per 100 residents per tick at 100% funding. Tuned (see
// tests/funding.mjs) so a mature city at default funding runs a modest
// surplus, while the 50%-150% range swings the budget by enough to matter.
var DEPARTMENT_RATE = { F: 2.7, S: 2.7, N: 3.4, H: 3.7 }
var DEPARTMENT_NAMES = { F: "Fire", S: "Police", N: "Education", H: "Health" }

function defaultFunding() {
  return { F: FUNDING_DEFAULT, S: FUNDING_DEFAULT, N: FUNDING_DEFAULT, H: FUNDING_DEFAULT }
}

function fundingLevel(funding, type) {
  if (!funding) return FUNDING_DEFAULT
  var value = Number(funding[type])
  return isFinite(value) ? clamp(value, FUNDING_MIN, FUNDING_MAX) : FUNDING_DEFAULT
}

// A department only costs anything once the city has built one, so a mayor
// who has not opened a firehouse yet is not billed for a fire department.
function departmentSpend(stats, funding, type) {
  if (!stats.departmentPresent[type]) return 0
  return DEPARTMENT_RATE[type] * (stats.population / 100) * fundingLevel(funding, type)
}

// Money buys reach, with the baseline at 100%: a starved department is
// degraded rather than useless (50% still keeps 80% of its radius), and
// overfunding buys a real but bounded extension.
function fundingRadiusScale(level) {
  return 0.6 + 0.4 * level
}

// Underfunding fire/police makes incidents likelier and overfunding suppresses
// them — the inverse of funding, so 50% doubles the risk and 150% cuts a third.
function fundingRiskScale(level) {
  return 1 / level
}

// --- infrastructure upgrade tiers ---------------------------------------
// Park/Power/Water/Fire/Police all place at tier 1 and can be manually
// upgraded in place, one tier at a time, once the city's population
// crosses a threshold *and* the player pays for it. Unlike R/C/I growth
// (automatic, demand-driven) this is a deliberate spend — meant to read as
// a real decision, not another thing that just happens on its own.
var UPGRADE_TIER2_POP = 400
// Was 2500, which no real playthrough had ever reached — a Year-22 city sat at
// 855 with every tier-3 building still locked, so the whole top tier of the
// art was content the player had paid for and could not see. 1000 is the next
// milestone up from where a mature starter city plateaus, which makes it a
// near-term goal instead of a distant grind.
var UPGRADE_TIER3_POP = 1000
var UPGRADE_THRESHOLDS = [0, UPGRADE_TIER2_POP, UPGRADE_TIER3_POP]

var UPGRADE_TIER_NAMES = {
  P: ["Playground", "Park", "Garden"],
  E: ["Generator", "Power Plant", "Power Station"],
  W: ["Well", "Water Tower", "Treatment Plant"],
  F: ["Firehouse", "Fire Station", "Battalion HQ"],
  S: ["Substation", "Police Station", "SWAT HQ"],
  N: ["Elementary School", "High School", "University"],
  H: ["Clinic", "Hospital", "Medical Center"]
}

// Cost to upgrade INTO tier index 1 or 2 (index 0 is the initial COSTS
// price, not an upgrade) — a cheaper starter building now, with the real
// spend happening later as a deliberate choice.
var UPGRADE_COSTS = {
  P: [0, 30, 80],
  E: [0, 160, 380],
  W: [0, 110, 260],
  F: [0, 100, 240],
  S: [0, 100, 240],
  N: [0, 180, 420],
  H: [0, 200, 450]
}

// A bigger tier covers more ground but also costs more to run — indexed
// by tile level (0/1/2).
var INFRA_RADIUS_SCALE = [0.6, 1.0, 1.5]
var INFRA_UPKEEP_SCALE = [0.55, 1.0, 1.85]

// Replaces a flat per-tile happiness bonus — a Garden helps a lot more
// than a Playground, same "tier scales the benefit" idea as everything
// else here.
var PARK_BONUS_PER_LEVEL = [2, 4, 7]

// Pure eligibility check shared by Service.qml's upgrade action and
// CityView's tier flyout, so the flyout can show "locked" / cost
// accurately without duplicating the rule.
function canUpgrade(type, currentLevel, population, treasury) {
  if (!UPGRADE_COSTS[type]) return { ok: false, reason: "not-upgradeable", cost: 0 }
  if (currentLevel >= 2) return { ok: false, reason: "max-level", cost: 0 }
  var nextLevel = currentLevel + 1
  var cost = UPGRADE_COSTS[type][nextLevel]
  var threshold = UPGRADE_THRESHOLDS[nextLevel]
  if (population < threshold) return { ok: false, reason: "locked", cost: cost, threshold: threshold }
  if (treasury < cost) return { ok: false, reason: "cant-afford", cost: cost, threshold: threshold }
  return { ok: true, reason: "", cost: cost, threshold: threshold }
}

function upgradeTile(grid, index) {
  var next = grid.slice()
  var tile = parseTile(next[index])
  next[index] = makeTile(tile.type, tile.level + 1)
  return next
}

// What was actually spent on this tile so far (placement + every upgrade
// paid to reach its current level) — used for the bulldoze refund so
// tearing down an upgraded plant returns what it really cost, not just
// its original tier-1 price.
function totalInvestment(type, level) {
  if (type === TILE_ROAD && level === 1) return BRIDGE_COST
  var base = COSTS[type] || 0
  var upgrades = UPGRADE_COSTS[type]
  if (!upgrades) return base
  var total = base
  for (var lv = 1; lv <= level; lv++) total += upgrades[lv] || 0
  return total
}

// Place the selected infrastructure tier atomically, or raise a matching
// building to it for only the remaining investment. Never downgrade.
function canBuildTier(grid, index, type, level, population, treasury) {
  if (!UPGRADE_COSTS[type] || !Number.isInteger(level) || level < 0 || level > 2
      || !Number.isInteger(index) || index < 0 || index >= grid.length)
    return { ok: false, cost: 0 }
  var current = parseTile(grid[index])
  if (current.type !== TILE_EMPTY && (current.type !== type || current.level >= level))
    return { ok: false, cost: 0 }
  var cost = totalInvestment(type, level)
    - (current.type === type ? totalInvestment(type, current.level) : 0)
  return { ok: population >= UPGRADE_THRESHOLDS[level] && treasury >= cost, cost: cost }
}

var MILESTONES = [50, 150, 400, 1000, 2500, 5000, 10000, 20000]

var MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"]

// One tick is one simulated month, so the calendar is just ageMinutes
// reinterpreted — Year 1 opens the day the city is founded.
function calendarFor(ageMinutes) {
  var total = Math.max(0, Math.floor(ageMinutes))
  return {
    year: Math.floor(total / 12) + 1,
    monthIndex: total % 12,
    monthName: MONTH_NAMES[total % 12]
  }
}

function emptyGrid(size) {
  var grid = new Array(size * size)
  for (var i = 0; i < grid.length; i++) grid[i] = TILE_EMPTY + "0"
  return grid
}

// A grown GRID_SIZE would otherwise strand an existing save (its grid
// length no longer matches gridSize * gridSize, and the old code just
// regenerated empty) — this carries the old city into the middle of the
// new, bigger map instead of discarding it.
function migrateGrid(oldGrid, oldSize, newSize) {
  var next = emptyGrid(newSize)
  var offset = Math.floor((newSize - oldSize) / 2)
  for (var oy = 0; oy < oldSize; oy++) {
    for (var ox = 0; ox < oldSize; ox++) {
      next[(oy + offset) * newSize + (ox + offset)] = oldGrid[oy * oldSize + ox]
    }
  }
  return next
}

// The grid dominates the save file. Written as a pretty-printed JSON array
// its 4096 entries each take their own indented line (`    "R2",\n`), costing
// ~41KB of Service's 64KB read cap — leaving so little headroom that a full
// dilemma backlog could push a perfectly valid save past it, at which point
// initializeIfReady mistakes it for corrupt and starts a brand-new city.
// Every tile is exactly two characters (see makeTile, which clamps level to
// a single digit), so the whole grid packs losslessly into one 8192-char
// string and the save drops to ~10KB.
var SAVE_VERSION = 2

function packGrid(grid) {
  return grid.join("")
}

// Returns null (not an empty grid) for anything unusable, so the caller can
// tell "no packed grid here" from "a real but empty city" and fall through to
// its own corrupt-save handling.
function unpackGrid(packed) {
  if (typeof packed !== "string" || packed.length === 0 || packed.length % 2 !== 0) return null
  var out = new Array(packed.length / 2)
  for (var i = 0; i < out.length; i++) out[i] = packed.substr(i * 2, 2)
  return out
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

// True circular range (compared squared to skip the sqrt) — matches the
// circle Panel.qml draws as the coverage preview, so what you see hovering
// a plant is exactly what governs growth, not an approximation of it.
function withinRadius(gridSize, a, b, radius) {
  var ax = a % gridSize, ay = Math.floor(a / gridSize)
  var bx = b % gridSize, by = Math.floor(b / gridSize)
  var dx = ax - bx, dy = ay - by
  return (dx * dx + dy * dy) <= radius * radius
}

// plants is a list of {index, level} — a bigger tier covers more ground
// (INFRA_RADIUS_SCALE), so each plant's own effective radius is computed
// off its own level rather than one shared radius for the whole type.
function isCovered(gridSize, plants, index, baseRadius) {
  for (var i = 0; i < plants.length; i++) {
    var r = baseRadius * INFRA_RADIUS_SCALE[plants[i].level]
    if (withinRadius(gridSize, plants[i].index, index, r)) return true
  }
  return false
}

// Plant positions (plus level, for coverage-radius scaling) only —
// checking "is this zone covered" against a short list of plants is far
// cheaper than precomputing a coverage mask for every tile on a 64x64 grid.
function findUtilities(grid) {
  var power = [], water = [], fire = [], police = [], schools = [], medical = []
  for (var i = 0; i < grid.length; i++) {
    var t = parseTile(grid[i])
    if (t.type === TILE_POWER) power.push({ index: i, level: t.level })
    else if (t.type === TILE_WATER) water.push({ index: i, level: t.level })
    else if (t.type === TILE_FIRE) fire.push({ index: i, level: t.level })
    else if (t.type === TILE_POLICE) police.push({ index: i, level: t.level })
    else if (t.type === TILE_SCHOOL) schools.push({ index: i, level: t.level })
    else if (t.type === TILE_MEDICAL) medical.push({ index: i, level: t.level })
  }
  return { power: power, water: water, fire: fire, police: police, schools: schools, medical: medical }
}

function educationStats(grid, gridSize) {
  return serviceCoverageStats(grid, gridSize)[4]
}

function serviceCoverageStats(grid, gridSize) {
  var utilities = findUtilities(grid)
  var rows = [
    { name: "Electricity", key: "power", radius: POWER_RADIUS },
    { name: "Water", key: "water", radius: WATER_RADIUS },
    { name: "Fire protection", key: "fire", radius: FIRE_RADIUS },
    { name: "Police", key: "police", radius: POLICE_RADIUS },
    { name: "Education", key: "schools", radius: SCHOOL_RADIUS },
    { name: "Healthcare", key: "medical", radius: MEDICAL_RADIUS }
  ]
  for (var r = 0; r < rows.length; r++) { rows[r].residents = 0; rows[r].served = 0 }
  for (var i = 0; i < grid.length; i++) {
    var tile = parseTile(grid[i])
    if (tile.type !== TILE_RES || tile.level <= 0) continue
    var people = tile.level * RES_CAP_PER_LEVEL
    for (var r = 0; r < rows.length; r++) {
      rows[r].residents += people
      if (isCovered(gridSize, utilities[rows[r].key], i, rows[r].radius)) rows[r].served += people
    }
  }
  for (var r = 0; r < rows.length; r++) {
    rows[r].unmet = rows[r].residents - rows[r].served
    rows[r].coverage = rows[r].residents ? Math.round(rows[r].served / rows[r].residents * 100) : 100
  }
  return rows
}

// One pass over the grid: population/jobs/counts, used both to drive this
// tick's growth decisions and to report bar-widget stats.
function summarize(grid) {
  var stats = {
    population: 0, jobsCommercial: 0, jobsIndustrial: 0,
    roadCount: 0, parkCount: 0, resCount: 0, comCount: 0, indCount: 0,
    powerCount: 0, waterCount: 0, fireCount: 0, policeCount: 0, builtDensity: 0,
    // Level-weighted, not flat counts — a Garden or a Power Station costs
    // (and gives) more than a tier-1 Playground or Generator.
    parkHappinessBonus: 0, serviceUpkeep: 0,
    // Split out so the monthly bill can itemise where the money goes.
    powerUpkeep: 0, waterUpkeep: 0, decorationUpkeep: 0,
    departmentPresent: { F: false, S: false, N: false, H: false },
    treeCount: 0, flowerCount: 0, decorationPoints: 0, taxablePopulation: 0
  }
  for (var i = 0; i < grid.length; i++) {
    var tile = parseTile(grid[i])
    switch (tile.type) {
    case TILE_ROAD: stats.roadCount++; break
    case TILE_TREE: stats.treeCount++; stats.decorationPoints += 2; stats.decorationUpkeep += 0.03; break
    case TILE_FLOWERS: stats.flowerCount++; stats.decorationPoints += 3; stats.decorationUpkeep += 0.06; break
    case TILE_PARK:
      stats.parkCount++
      stats.parkHappinessBonus += PARK_BONUS_PER_LEVEL[tile.level]
      break
    case TILE_WATERFRONT_PARK:
      stats.parkCount++
      stats.parkHappinessBonus += 3
      break
    case TILE_POWER:
      stats.powerCount++
      stats.powerUpkeep += POWER_UPKEEP * INFRA_UPKEEP_SCALE[tile.level]
      break
    case TILE_WATER:
      stats.waterCount++
      stats.waterUpkeep += WATER_UPKEEP * INFRA_UPKEEP_SCALE[tile.level]
      break
    // Staffed departments are billed per resident served through the funding
    // budget (departmentSpend), not per building like the power and water
    // utilities above — a firehouse in a town of 200 and the same firehouse in
    // a city of 5000 are not the same running cost. Building one only opts the
    // city into paying for that department at all.
    case TILE_FIRE:
      stats.fireCount++
      stats.departmentPresent.F = true
      break
    case TILE_POLICE:
      stats.policeCount++
      stats.departmentPresent.S = true
      break
    case TILE_SCHOOL:
      stats.departmentPresent.N = true
      break
    case TILE_MEDICAL:
      stats.departmentPresent.H = true
      break
    case TILE_RES:
      stats.resCount++
      stats.population += tile.level * RES_CAP_PER_LEVEL
      stats.taxablePopulation += tile.level * RES_CAP_PER_LEVEL
        * (1 + propertyValueBonus(grid, Math.round(Math.sqrt(grid.length)), i) / 100)
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
  stats.serviceUpkeep = stats.powerUpkeep + stats.waterUpkeep + stats.decorationUpkeep
  return stats
}

function computeHappiness(taxRatePercent, stats) {
  var taxPenalty = Math.max(0, taxRatePercent - 10) * 1.5
  var parkBonus = Math.min(28, stats.parkHappinessBonus)
  var industrialPenalty = Math.min(25, stats.indCount * 2)
  return Math.round(clamp(70 - taxPenalty + parkBonus - industrialPenalty, 0, 100))
}

// The same ratios that drive growth chance, pulled out on its own so
// CityView can show it as an RCI demand meter without duplicating (and
// risking drifting out of sync with) the numbers that actually govern
// growth. R wants jobs relative to population; C and I want population
// relative to their own jobs — each clamped to its own tuned range, so the
// three bars aren't directly comparable to each other, only to their own
// "balanced" point (a multiplier of 1.0).
//
// laborAvailability mirrors the original SimCity engine's own demand model
// (Micropolis, GPL-released — setValves() in Micropolis.java computes a
// `laborBase = residents / (comPop + indPop)`, clamped, and multiplies it
// into both the commercial and industrial demand projections). The idea:
// commercial and industrial demand aren't just "does *this* zone have
// enough workers" in isolation — they should also cool off *together* when
// the city's total job count already outstrips its population, since
// there's no spare labor to staff more of either. Without this, a city
// with far more jobs than residents could show both C and I permanently
// pegged at maximum even though the real bottleneck is "build more
// housing," not "build more of this specific zone." R demand doesn't need
// the same treatment — it's already driven by the jobs-vs-residents
// employment ratio directly, which is the same relationship this mirrors.
function computeDemand(stats) {
  var jobsTotal = stats.jobsCommercial + stats.jobsIndustrial
  var laborAvailability = clamp(stats.population / (jobsTotal + 10), 0, 1.3)
  return {
    R: 0.5 + 0.5 * clamp(jobsTotal / (stats.population + 10), 0, 1.5) + computeAttractiveness(stats) / 100,
    C: 0.5 + 0.5 * clamp((stats.population / (stats.jobsCommercial + 10)) * laborAvailability, 0, 1.5),
    I: 0.6 + 0.3 * clamp((stats.population / (stats.jobsIndustrial + 50)) * laborAvailability, 0, 1.0)
  }
}

// Strategic placement, not just enough-of-each-zone: a house built right
// next to a smokestack is worse off than one a short walk from a row of
// shops, regardless of citywide RCI totals. Deliberately a fixed local box
// scan rather than isCovered-against-every-built-tile — R tiles can number
// in the thousands in a mature city, and comparing each one against every
// built C/I tile citywide would stop being cheap; a bounded box around just
// that one tile stays O(1) per tile no matter how big the city gets.
var INDUSTRIAL_NUISANCE_RADIUS = 3
var COMMERCIAL_WALKABILITY_RADIUS = 4
var INDUSTRIAL_GROWTH_PENALTY = 0.6
var COMMERCIAL_GROWTH_BONUS = 1.3
var INDUSTRIAL_NUISANCE_DECAY_CHANCE = 0.025

function nearbyZoneEffect(grid, gridSize, index) {
  var x = index % gridSize, y = Math.floor(index / gridSize)
  var maxR = Math.max(INDUSTRIAL_NUISANCE_RADIUS, COMMERCIAL_WALKABILITY_RADIUS)
  var indR2 = INDUSTRIAL_NUISANCE_RADIUS * INDUSTRIAL_NUISANCE_RADIUS
  var comR2 = COMMERCIAL_WALKABILITY_RADIUS * COMMERCIAL_WALKABILITY_RADIUS
  var nearIndustrial = false, nearCommercial = false
  for (var dy = -maxR; dy <= maxR && !(nearIndustrial && nearCommercial); dy++) {
    var ny = y + dy
    if (ny < 0 || ny >= gridSize) continue
    for (var dx = -maxR; dx <= maxR; dx++) {
      if (dx === 0 && dy === 0) continue
      var nx = x + dx
      if (nx < 0 || nx >= gridSize) continue
      var distSq = dx * dx + dy * dy
      if (distSq > maxR * maxR) continue
      var t = parseTile(grid[ny * gridSize + nx])
      if (t.level <= 0) continue
      if (!nearIndustrial && t.type === TILE_IND && distSq <= indR2) nearIndustrial = true
      if (!nearCommercial && t.type === TILE_COM && distSq <= comR2) nearCommercial = true
      if (nearIndustrial && nearCommercial) break
    }
  }
  return { nearIndustrial: nearIndustrial, nearCommercial: nearCommercial }
}

// Growth/abandonment for one minute. Demand factors use the *pre-tick*
// stats so every tile decides off the same snapshot, not a shifting one.
// A zone only grows when it's road-connected *and* inside both a power
// and a water plant's coverage — served, not just zoned. Losing any one
// of the three (plant bulldozed, road cut) puts it at decay risk exactly
// like a road disconnect always has.
function tickGrid(grid, gridSize, stats, happiness, utilities, demand, funding) {
  var happinessFactor = clamp(happiness / 70, 0.3, 1.5)
  var baseGrowthChance = 0.15
  var baseDecayChance = 0.08

  // Funding buys reach and safety. Resolved once per tick rather than per
  // tile — these are whole-department settings, and this loop runs over every
  // tile on a 64x64 grid.
  var fireRadius = FIRE_RADIUS * fundingRadiusScale(fundingLevel(funding, "F"))
  var policeRadius = POLICE_RADIUS * fundingRadiusScale(fundingLevel(funding, "S"))
  var schoolRadius = SCHOOL_RADIUS * fundingRadiusScale(fundingLevel(funding, "N"))
  var medicalRadius = MEDICAL_RADIUS * fundingRadiusScale(fundingLevel(funding, "H"))
  var fireRisk = FIRE_RISK_CHANCE * fundingRiskScale(fundingLevel(funding, "F"))
  var crimeRisk = CRIME_RISK_CHANCE * fundingRiskScale(fundingLevel(funding, "S"))

  var next = grid.slice()
  for (var i = 0; i < next.length; i++) {
    var tile = parseTile(next[i])
    if (tile.type !== TILE_RES && tile.type !== TILE_COM && tile.type !== TILE_IND) continue

    var zoneEffect = tile.type === TILE_RES ? nearbyZoneEffect(grid, gridSize, i) : null

    var connected = isRoadAdjacent(grid, gridSize, i)
      && isCovered(gridSize, utilities.power, i, POWER_RADIUS)
      && isCovered(gridSize, utilities.water, i, WATER_RADIUS)
    if (connected && tile.level < 3 && happiness >= 20) {
      var growthChance = baseGrowthChance * demand[tile.type] * happinessFactor
      if (zoneEffect) {
        // Education rewards coverage; unmet need slows growth after the
        // starter-town phase, without causing abandonment in existing saves.
        var educated = isCovered(gridSize, utilities.schools || [], i, schoolRadius)
        growthChance *= educated ? 1.15 : stats.population >= 100 ? 0.75 : 1
        var healthcare = isCovered(gridSize, utilities.medical || [], i, medicalRadius)
        growthChance *= healthcare ? 1.10 : stats.population >= 100 ? 0.85 : 1
        growthChance *= 1 + propertyValueBonus(grid, gridSize, i) / 100
        if (zoneEffect.nearIndustrial) growthChance *= INDUSTRIAL_GROWTH_PENALTY
        if (zoneEffect.nearCommercial) growthChance *= COMMERCIAL_GROWTH_BONUS
      }
      if (Math.random() < growthChance) {
        next[i] = makeTile(tile.type, tile.level + 1)
        continue
      }
    }
    if (tile.level > 0 && (!connected || happiness < 25)) {
      if (Math.random() < baseDecayChance) next[i] = makeTile(tile.type, tile.level - 1)
    }

    // Fire/crime risk: independent of the connected/happiness decay above,
    // and only ever a small extra chance to slip a level — never a hard
    // block on growth the way power/water are.
    var afterTile = parseTile(next[i])
    if (afterTile.level > 0) {
      if (!isCovered(gridSize, utilities.fire, i, fireRadius) && Math.random() < fireRisk) {
        afterTile = parseTile(next[i])
        if (afterTile.level > 0) next[i] = makeTile(afterTile.type, afterTile.level - 1)
      }
      if (!isCovered(gridSize, utilities.police, i, policeRadius) && Math.random() < crimeRisk) {
        afterTile = parseTile(next[i])
        if (afterTile.level > 0) next[i] = makeTile(afterTile.type, afterTile.level - 1)
      }
    }

    // Same shape as the fire/crime risk above: a small independent chance
    // to slip a level, on top of everything else, for homes that grew up
    // next to a factory.
    if (zoneEffect && zoneEffect.nearIndustrial && Math.random() < INDUSTRIAL_NUISANCE_DECAY_CHANCE) {
      var nuisanceTile = parseTile(next[i])
      if (nuisanceTile.level > 0) next[i] = makeTile(nuisanceTile.type, nuisanceTile.level - 1)
    }
  }
  return next
}

// Everything a player might want to know about one tile, for the Info tool
// — deliberately built from the exact same helpers tickGrid itself uses
// (isCovered, isRoadAdjacent, nearbyZoneEffect, computeDemand's output) so
// what the tooltip reports can never drift out of sync with what's actually
// governing growth.
function inspectTile(grid, gridSize, index, utilities, demand, population, treasury) {
  var tile = parseTile(grid[index])
  var info = {
    type: tile.type,
    level: tile.level,
    roadAdjacent: isRoadAdjacent(grid, gridSize, index),
    powerCovered: isCovered(gridSize, utilities.power, index, POWER_RADIUS),
    waterCovered: isCovered(gridSize, utilities.water, index, WATER_RADIUS),
    fireCovered: isCovered(gridSize, utilities.fire, index, FIRE_RADIUS),
    policeCovered: isCovered(gridSize, utilities.police, index, POLICE_RADIUS),
    educationCovered: isCovered(gridSize, utilities.schools || [], index, SCHOOL_RADIUS),
    medicalCovered: isCovered(gridSize, utilities.medical || [], index, MEDICAL_RADIUS)
  }
  if (tile.type === TILE_RES || tile.type === TILE_COM || tile.type === TILE_IND) {
    info.demand = demand[tile.type]
  }
  if (tile.type === TILE_RES) {
    var zoneEffect = nearbyZoneEffect(grid, gridSize, index)
    info.nearIndustrial = zoneEffect.nearIndustrial
    info.nearCommercial = zoneEffect.nearCommercial
    info.propertyBonus = propertyValueBonus(grid, gridSize, index)
    info.waterfrontBonus = waterfrontBonus(grid, gridSize, index)
  }
  if (UPGRADE_COSTS[tile.type]) {
    info.tierName = UPGRADE_TIER_NAMES[tile.type][tile.level]
    info.upgrade = canUpgrade(tile.type, tile.level, population || 0, treasury || 0)
  }
  return info
}

// A denser city costs more per building to run, not the same — roads carry
// more traffic, utilities run nearer capacity. Without this the flat 0.3 per
// level meant upkeep grew linearly while income grew linearly too, and since
// income per resident far exceeded upkeep per resident the gap only ever
// widened, which is how a mature city ended up with a runaway treasury.
var DENSITY_UPKEEP_SOFTCAP = 420
// Lowered from 0.3 alongside raising the infrastructure rates above. This
// line is general city services — real, but not attributable to anything the
// player chose, and it was 40% of the bill. Shifting weight out of it and
// into roads/plants/parks leaves the total about the same while making the
// budget answer "what am I paying for?" instead of just "how much?".
var DENSITY_UPKEEP_RATE = 0.22
var ROAD_UPKEEP = 0.25
var PARK_UPKEEP = 0.3

// Upkeep scales with what's actually built, not just zoned — an empty
// zoned tile costs nothing until something grows on it. `funding` is the
// player's department budget (see departmentSpend); omitting it prices the
// city at default funding.
function computeUpkeep(stats, funding) {
  var bill = upkeepBreakdown(stats, funding)
  var total = 0
  for (var i = 0; i < bill.length; i++) total += bill[i].amount
  return total
}

// The monthly bill, itemised. computeUpkeep is just the sum of this, so what
// the player is shown can never drift from what they are actually charged.
function upkeepBreakdown(stats, funding) {
  var densityRate = DENSITY_UPKEEP_RATE * (1 + stats.builtDensity / DENSITY_UPKEEP_SOFTCAP)
  var rows = [
    { key: "roads", label: "Roads", amount: stats.roadCount * ROAD_UPKEEP },
    { key: "power", label: "Power plants", amount: stats.powerUpkeep },
    { key: "water", label: "Water", amount: stats.waterUpkeep },
    { key: "parks", label: "Parks", amount: stats.parkCount * PARK_UPKEEP },
    { key: "decorations", label: "Landscaping", amount: stats.decorationUpkeep },
    { key: "services", label: "City services", amount: stats.builtDensity * densityRate }
  ]
  for (var i = 0; i < FUNDABLE_SERVICES.length; i++) {
    var type = FUNDABLE_SERVICES[i]
    rows.push({
      key: type, label: DEPARTMENT_NAMES[type],
      amount: departmentSpend(stats, funding, type)
    })
  }
  return rows
}

// What one more of this building would add to every future monthly bill —
// shown at the point of purchase so a recurring cost is never a surprise.
// Departments are excluded on purpose: they are billed per resident, so an
// extra firehouse widens coverage without adding a second bill.
function monthlyCostOf(type, level) {
  var tier = INFRA_UPKEEP_SCALE[level || 0]
  if (type === TILE_ROAD) return ROAD_UPKEEP
  if (type === TILE_PARK || type === TILE_WATERFRONT_PARK) return PARK_UPKEEP
  if (type === TILE_POWER) return POWER_UPKEEP * tier
  if (type === TILE_WATER) return WATER_UPKEEP * tier
  if (type === TILE_TREE) return 0.03
  if (type === TILE_FLOWERS) return 0.06
  return 0
}

function computeIncome(population, taxRatePercent) {
  return population * taxRatePercent * 0.02
}

// One full minute of simulation. Returns the new grid plus everything the
// service needs to update its own properties and persist. happinessModifier
// and incomeMultiplier fold in whatever active dilemma effects are still
// running (see Service.qml's activeEffects) — happiness stays otherwise
// fully deterministic from tax/parks/industry, and income is the only thing
// a multiplier touches (upkeep is unaffected, so a bad multiplier really
// does squeeze the budget rather than just look worse on paper).
function advanceCity(grid, gridSize, taxRatePercent, happinessModifier, incomeMultiplier, funding) {
  happinessModifier = happinessModifier || 0
  incomeMultiplier = incomeMultiplier === undefined ? 1 : incomeMultiplier
  var stats = summarize(grid)
  var happiness = Math.round(clamp(computeHappiness(taxRatePercent, stats) + happinessModifier, 0, 100))
  var utilities = findUtilities(grid)
  var demand = computeDemand(stats)
  var nextGrid = tickGrid(grid, gridSize, stats, happiness, utilities, demand, funding)
  var upkeep = computeUpkeep(stats, funding)
  var income = computeIncome(stats.taxablePopulation, taxRatePercent) * incomeMultiplier
  return {
    grid: nextGrid,
    population: stats.population,
    jobs: stats.jobsCommercial + stats.jobsIndustrial,
    happiness: happiness,
    demand: demand,
    incomeDelta: income - upkeep,
    income: income,
    upkeep: upkeep,
    roadCount: stats.roadCount,
    parkCount: stats.parkCount,
    resCount: stats.resCount,
    comCount: stats.comCount,
    indCount: stats.indCount,
    powerCount: stats.powerCount,
    waterCount: stats.waterCount
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
  var cost = placementCost(grid, index, type)
  if (cost === undefined) return false
  if (treasury < cost) return false
  var current = parseTile(grid[index])
  if (type === TILE_ROAD && current.type === TILE_LAKE) return true
  if (type === TILE_WATERFRONT_PARK)
    return current.type === TILE_EMPTY && shoreAdjacent(grid, Math.round(Math.sqrt(grid.length)), index)
  return current.type === TILE_EMPTY
}

function placeTile(grid, index, type) {
  var next = grid.slice()
  next[index] = makeTile(type, type === TILE_ROAD && parseTile(grid[index]).type === TILE_LAKE ? 1 : 0)
  return next
}

function bulldozeTile(grid, index) {
  var next = grid.slice()
  var tile = parseTile(grid[index])
  next[index] = makeTile(tile.type === TILE_ROAD && tile.level === 1 ? TILE_LAKE : TILE_EMPTY, 0)
  return next
}

// --- mayor's dilemmas ------------------------------------------------------
// Reigns-style binary decisions: a dry/witty sysadmin scenario, two choices,
// each with an immediate effect (treasuryDelta, populationPercent) and/or a
// lingering one (happinessDelta/incomeMultiplier over effectTicks months).
// Population isn't a free-standing counter — it's always recomputed from the
// grid — so a populationPercent effect has to actually grow or shrink
// residential tiles (see applyPopulationShock) rather than just nudge a
// number that the next tick would immediately overwrite.
var EVENT_MIN_POPULATION = 60
// The roll chance isn't fixed — it's a cooldown that resets low right after
// a dilemma fires and doubles back up each quiet tick, so two events almost
// never land back-to-back but the long-run rate still averages out to
// roughly EVENT_CHANCE_MAX. Service.qml owns the actual `eventChance` value
// (it's persisted state, not pure math) and starts it warmed up at the max —
// only *firing* an event should ever cool it back down, not simply being new.
// Lowered twice now (0.03/0.18, then 0.015/0.08) — still read as too
// frequent even with the cooldown shape doing its job. This is the base
// "Normal" rate; Service.qml's eventFrequency setting scales it further
// (down to 0 for "Off", up for "Frequent") since how chatty the mayor's
// dilemmas feel is genuinely a matter of taste, not something one default
// can get right for everyone.
var EVENT_CHANCE_BASE = 0.01
var EVENT_CHANCE_MAX = 0.05
var EVENT_CHANCE_GROWTH = 2

var EVENTS = [
  {
    id: "packet_storm",
    title: "Mayor — we've got a packet storm inbound",
    flavor: "Every port lit up at once around 3 AM. Ops swears it's an attack, not just Steam sales again.",
    choices: [
      {
        label: "Raise the firewall",
        hint: "Costs the city now, keeps everyone connected.",
        effects: { treasuryDelta: -160, incomeMultiplier: 0.85, effectTicks: 3 },
        outcome: "Rules deployed. Traffic's clean, the budget's a little lighter."
      },
      {
        label: "Tough it out",
        hint: "Save the cash — some residents lose patience and leave.",
        effects: { treasuryDelta: 80, populationPercent: -0.07 },
        outcome: "The storm passed. So did a few residents, fed up with the lag."
      }
    ]
  },
  {
    id: "server_room_ac",
    title: "Mayor — the server room just hit 95°F",
    flavor: "The datacenter's cooling died overnight. Every rack in the building is quietly panicking.",
    choices: [
      {
        label: "Rush a new AC unit",
        hint: "Expensive, but nothing melts.",
        effects: { treasuryDelta: -220 },
        outcome: "New unit's humming. The treasury's a bit cooler too."
      },
      {
        label: "Prop the door open",
        hint: "Cheap fix — some gear, and some trust, doesn't survive.",
        effects: { treasuryDelta: 20, happinessDelta: -10, effectTicks: 3 },
        outcome: "It mostly worked. 'Mostly' is doing a lot of work in that sentence."
      }
    ]
  },
  {
    id: "legacy_migration",
    title: "Mayor — the billing system runs on a 2009 kernel",
    flavor: "Nobody remembers who wrote it. It still works. That's the problem.",
    choices: [
      {
        label: "Rip it out and rebuild",
        hint: "Painful downtime, but it's finally modern.",
        effects: { treasuryDelta: -140, incomeMultiplier: 0.8, effectTicks: 2 },
        outcome: "Downtime was rough, but the new system doesn't creak anymore."
      },
      {
        label: "Duct-tape it again",
        hint: "Cheap today — a slow tax on every day after.",
        effects: { treasuryDelta: 40, incomeMultiplier: 0.92, effectTicks: 5 },
        outcome: "It's alive. It'll keep costing you in small, invisible ways."
      }
    ]
  },
  {
    id: "ransom_note",
    title: "Mayor — city hall got a ransom note",
    flavor: "Every file on the shared drive is now named 'read_me_mayor.txt'. Someone wants payment by Friday.",
    choices: [
      {
        label: "Pay it",
        hint: "Fast and quiet — and sets a bad precedent.",
        effects: { treasuryDelta: -260 },
        outcome: "Files are back. So, probably, is whoever did this."
      },
      {
        label: "Restore from backups",
        hint: "Free, but the restore takes days and tempers fray.",
        effects: { happinessDelta: -12, effectTicks: 3, populationPercent: -0.03 },
        outcome: "Backups held. A few residents still haven't forgiven the outage."
      }
    ]
  },
  {
    id: "friday_deploy",
    title: "Mayor — an intern just pushed to production. On a Friday.",
    flavor: "It's already live. Half the city's traffic lights are stuck on a Comic Sans error page.",
    choices: [
      {
        label: "Cover for them",
        hint: "Costs a weekend and some cash — morale stays high.",
        effects: { treasuryDelta: -90, happinessDelta: 8, effectTicks: 2 },
        outcome: "Fixed by Monday. The intern owes everyone coffee for a month."
      },
      {
        label: "Let them face the postmortem alone",
        hint: "Saves money — word gets around city hall.",
        effects: { treasuryDelta: 60, happinessDelta: -8, effectTicks: 2 },
        outcome: "Budget's fine. Morale in IT is not."
      }
    ]
  },
  {
    id: "viral_skyline",
    title: "Mayor — the city just went viral",
    flavor: "A drone shot of the skyline hit the front page of every feed at once. Nobody planned this.",
    choices: [
      {
        label: "Lean into it",
        hint: "Growth spike, but services strain to keep up.",
        effects: { populationPercent: 0.06, incomeMultiplier: 0.9, effectTicks: 2 },
        outcome: "New residents are moving in fast. Infrastructure is... coping."
      },
      {
        label: "Let it blow over",
        hint: "Steady as she goes, but the moment passes.",
        effects: { treasuryDelta: 50 },
        outcome: "The internet moved on by Tuesday. The city didn't change a bit."
      }
    ]
  },
  {
    id: "mandatory_2fa",
    title: "Mayor — IT wants mandatory 2FA, city-wide",
    flavor: "Security's been asking for a year. Residents are not going to enjoy this.",
    choices: [
      {
        label: "Enforce it",
        hint: "Safer systems, a wave of grumbling.",
        effects: { happinessDelta: -10, effectTicks: 2, treasuryDelta: -30 },
        outcome: "It's rolled out. The complaint tickets have complaint tickets."
      },
      {
        label: "Skip it for now",
        hint: "Nobody's annoyed today. Today.",
        effects: { treasuryDelta: 20 },
        outcome: "Deferred. IT has added this to the 'told you so' pile."
      }
    ]
  },
  {
    id: "license_audit",
    title: "Mayor — a license audit just flagged half our stack",
    flavor: "Turns out 'it's free' and 'it's compliant' are two very different things.",
    choices: [
      {
        label: "Pay for proper licenses",
        hint: "Expensive, but it's clean now.",
        effects: { treasuryDelta: -190 },
        outcome: "Paperwork's filed. Legal finally stopped calling."
      },
      {
        label: "Quietly ignore it",
        hint: "Free today. A bigger bill always finds you eventually.",
        effects: { treasuryDelta: 30, incomeMultiplier: 0.88, effectTicks: 4 },
        outcome: "Nothing happened. Yet. Legal keeps 'checking in.'"
      }
    ]
  },
  {
    id: "scada_kernel_panic",
    title: "Mayor — the water treatment SCADA box just kernel panicked",
    flavor: "It rebooted itself twice already, and each time comes back a little more confused than before.",
    choices: [
      {
        label: "Reboot and pray",
        hint: "Free, but flaky while it 'stabilizes.'",
        effects: { happinessDelta: -6, effectTicks: 2 },
        outcome: "It's up. For now. Ops has started a betting pool on when it panics again."
      },
      {
        label: "Bring in a proper contractor",
        hint: "Costs real money, actually gets fixed.",
        effects: { treasuryDelta: -170 },
        outcome: "Root cause found and patched. Ops's betting pool is disappointed."
      }
    ]
  },
  {
    id: "finance_gpu_miner",
    title: "Mayor — Finance's GPU cluster is 'doing analytics' at 3 AM",
    flavor: "The power bill's up 40% and nobody in Finance will make eye contact.",
    choices: [
      {
        label: "Confiscate the rigs",
        hint: "Ends it clean — Finance is furious.",
        effects: { treasuryDelta: 60, happinessDelta: -8, effectTicks: 2 },
        outcome: "The rigs are gone. Finance is filing a strongly worded memo."
      },
      {
        label: "Let it ride, take a cut",
        hint: "Quiet income now — it'll keep drawing power.",
        effects: { treasuryDelta: 70, incomeMultiplier: 0.94, effectTicks: 4 },
        outcome: "Nobody asks questions. The power grid quietly resents this."
      }
    ]
  },
  {
    id: "wifi_rm_rf",
    title: "Mayor — public WiFi's down after somebody's bad rm -rf",
    flavor: "The config directory is gone. So, apparently, is the backup script that was supposed to protect it.",
    choices: [
      {
        label: "Restore from last night's backup",
        hint: "A little stale, back online fast.",
        effects: { treasuryDelta: -60 },
        outcome: "WiFi's back. Last night's config, this morning's problems."
      },
      {
        label: "Rebuild it by hand",
        hint: "Free, but it's a long, cranky day for everyone offline.",
        effects: { happinessDelta: -9, effectTicks: 2 },
        outcome: "Rebuilt from memory and muscle memory. Never doing that again."
      }
    ]
  },
  {
    id: "maintainer_burnout",
    title: "Mayor — our favorite open-source maintainer just threatened to quit",
    flavor: "One person, unpaid, has been quietly keeping half the city's infrastructure running for years.",
    choices: [
      {
        label: "Actually fund them",
        hint: "Costs the city, keeps the lights on properly.",
        effects: { treasuryDelta: -130, incomeMultiplier: 1.06, effectTicks: 3 },
        outcome: "They're funded, thrilled, and shipping fixes again."
      },
      {
        label: "Wish them luck",
        hint: "Free today — the dependency it protects gets fragile.",
        effects: { incomeMultiplier: 0.85, effectTicks: 3 },
        outcome: "They're gone. Something load-bearing is now nobody's job."
      }
    ]
  },
  {
    id: "viral_outage",
    title: "Mayor — someone screenshotted our 500 error page and it's trending",
    flavor: "Turns out a wall of red Nginx text is very shareable. Not the kind of viral anyone wanted.",
    choices: [
      {
        label: "Own it publicly",
        hint: "A little cash for the apology tour — goodwill earned.",
        effects: { treasuryDelta: -50, happinessDelta: 9, effectTicks: 2 },
        outcome: "A candid post-mortem thread wins people over. Mostly."
      },
      {
        label: "Deny everything",
        hint: "Saves face today — nobody buys it.",
        effects: { treasuryDelta: 20, happinessDelta: -10, effectTicks: 2 },
        outcome: "Nobody believes the denial. The screenshots remain undefeated."
      }
    ]
  },
  {
    id: "dst_bug",
    title: "Mayor — the whole city's clocks just went sideways",
    flavor: "A daylight-saving bug rolled every clock back an hour, then forward two, then just... gave up.",
    choices: [
      {
        label: "Patch the timezone database",
        hint: "Costs a bit, fixes it properly.",
        effects: { treasuryDelta: -70 },
        outcome: "tzdata updated. Every clock agrees again, suspiciously."
      },
      {
        label: "Let people set their own clocks",
        hint: "Free, but nobody's on time for anything for a while.",
        effects: { happinessDelta: -7, effectTicks: 2 },
        outcome: "Everyone's running on their own schedule now. It's chaos, but cheap chaos."
      }
    ]
  },
  {
    id: "arch_migration",
    title: "Mayor — ops wants to migrate the whole datacenter to Arch. Tonight.",
    flavor: "The pitch is 'it'll be more stable long-term.' The timing is 'we already started.'",
    choices: [
      {
        label: "Approve the migration",
        hint: "Rocky for a bit, better footing after.",
        effects: { incomeMultiplier: 0.82, effectTicks: 2, happinessDelta: 6 },
        outcome: "Rough week, smoother month. Ops won't stop mentioning it."
      },
      {
        label: "Stick with the boring stable distro",
        hint: "Nothing breaks tonight. Nothing improves either.",
        effects: { treasuryDelta: 25 },
        outcome: "Boring, stable, unchanged. Ops sighs and updates the ticket to 'later.'"
      }
    ]
  },
  {
    id: "hackathon_budget",
    title: "Mayor — the dev team wants a hackathon (and the beer budget to match)",
    flavor: "They swear something useful will come out of it. Last time, it was a Comic Sans dashboard.",
    choices: [
      {
        label: "Fund it",
        hint: "Costs the city, morale goes way up.",
        effects: { treasuryDelta: -100, happinessDelta: 10, effectTicks: 2 },
        outcome: "Best morale in months. The dashboard is, once again, Comic Sans."
      },
      {
        label: "Deny it",
        hint: "Saves the budget, a little morale lost.",
        effects: { treasuryDelta: 30, happinessDelta: -6, effectTicks: 2 },
        outcome: "Budget's intact. The team's Slack channel has gone quiet."
      }
    ]
  },
  {
    id: "runaway_goat_herd",
    title: "Mayor — a herd of goats got loose in the flower district",
    flavor: "Nobody knows whose goats these are. The tulips didn't stand a chance.",
    choices: [
      {
        label: "Round them up humanely",
        hint: "Costs a bit — everyone gets their goats back.",
        effects: { treasuryDelta: -50, happinessDelta: 5, effectTicks: 1 },
        outcome: "Goats rehomed. Somehow they're already local celebrities."
      },
      {
        label: "Let them become a tourist attraction",
        hint: "Free, and people love a little chaos.",
        effects: { happinessDelta: 8, effectTicks: 2 },
        outcome: "The goats have their own hashtag now. City Hall has stopped fighting it."
      }
    ]
  },
  {
    id: "duck_pond_drama",
    title: "Mayor — the duck pond committee has seceded from the parks department",
    flavor: "It's a nine-person committee. Six of them are the same family.",
    choices: [
      {
        label: "Give the ducks their own budget line",
        hint: "Small cost, resolves a surprisingly loud feud.",
        effects: { treasuryDelta: -40, happinessDelta: 6, effectTicks: 1 },
        outcome: "Ducks have a line item now. Council spent an hour on duck-bread policy."
      },
      {
        label: "Dissolve the committee",
        hint: "Free, but you've made enemies for life.",
        effects: { happinessDelta: -7, effectTicks: 2 },
        outcome: "The committee is gone. The family still brings it up at every town hall."
      }
    ]
  },
  {
    id: "mystery_sinkhole",
    title: "Mayor — a sinkhole opened downtown and it's oddly, perfectly round",
    flavor: "Geologists are stumped. A local psychic has already opened a stand next to it.",
    choices: [
      {
        label: "Fence it off and fill it properly",
        hint: "Costs money, ends the speculation.",
        effects: { treasuryDelta: -130 },
        outcome: "Filled and paved. The psychic has relocated two blocks over."
      },
      {
        label: "Turn it into a tourist attraction",
        hint: "Free, and mysteriously popular.",
        effects: { treasuryDelta: 70, happinessDelta: 4, effectTicks: 2 },
        outcome: "'The Hole' is now on every postcard. Nobody has explained it. Nobody wants to."
      }
    ]
  },
  {
    id: "worlds_largest_twine",
    title: "Mayor — a resident wants funding for the 'World's Largest Ball of Twine'",
    flavor: "It's currently the size of a golf cart. He assures you it has 'huge potential.'",
    choices: [
      {
        label: "Fund it",
        hint: "Costs the city — tourists do love a weird landmark.",
        effects: { treasuryDelta: -90, populationPercent: 0.02 },
        outcome: "The twine ball grows. So, slowly, does tourism."
      },
      {
        label: "Politely decline",
        hint: "Saves the budget. He's very disappointed.",
        effects: { happinessDelta: -3, effectTicks: 1 },
        outcome: "He's funding it himself now. It is somehow already bigger."
      }
    ]
  },
  {
    id: "rooster_uprising",
    title: "Mayor — a rogue rooster has been waking the whole east side at 4 AM",
    flavor: "Nobody's claimed it. It has opinions about that, loudly, every single morning.",
    choices: [
      {
        label: "Deploy animal control",
        hint: "Costs a bit, silence returns.",
        effects: { treasuryDelta: -45, happinessDelta: 6, effectTicks: 1 },
        outcome: "Rooster relocated to a farm upstate. The east side sleeps again."
      },
      {
        label: "Let the neighborhood adopt it",
        hint: "Free, but the 4 AM wake-up calls continue indefinitely.",
        effects: { happinessDelta: -5, effectTicks: 3 },
        outcome: "The rooster has a name now. The complaints have not stopped."
      }
    ]
  },
  {
    id: "proposal_at_fountain",
    title: "Mayor — a marriage proposal at the fountain has blocked downtown traffic for an hour",
    flavor: "It's genuinely sweet. It is also gridlocking six blocks.",
    choices: [
      {
        label: "Let it play out",
        hint: "Free, and everyone loves a happy ending.",
        effects: { happinessDelta: 10, effectTicks: 1 },
        outcome: "She said yes. The crowd cheered. Traffic remains, gloriously, still stuck."
      },
      {
        label: "Reroute traffic around it",
        hint: "A little overtime cost, keeps the city moving.",
        effects: { treasuryDelta: -30 },
        outcome: "Traffic flows again. The couple didn't even notice the detour."
      }
    ]
  },
  {
    id: "unofficial_cat_mascot",
    title: "Mayor — a stray cat has taken up residence in city hall and citizens have Opinions",
    flavor: "It sleeps on the mayor's old chair. There's already a fan account.",
    choices: [
      {
        label: "Make it official",
        hint: "Small cost for a city-hall cat budget, big popularity boost.",
        effects: { treasuryDelta: -25, happinessDelta: 9, effectTicks: 2 },
        outcome: "The cat now has a title, a food budget, and more approval than the council."
      },
      {
        label: "Have it relocated",
        hint: "Frees up the chair — does not free up the outrage.",
        effects: { happinessDelta: -9, effectTicks: 2 },
        outcome: "The cat's been rehomed. The fan account has not forgiven you."
      }
    ]
  },
  {
    id: "groundhog_dispute",
    title: "Mayor — two rival groundhogs both predicted the weather, and disagreed",
    flavor: "One says six more weeks of winter. The other says an early spring. The town is furious either way.",
    choices: [
      {
        label: "Officially back the optimistic groundhog",
        hint: "Free, morale up short-term.",
        effects: { happinessDelta: 7, effectTicks: 1 },
        outcome: "Spirits are high. Whether spring actually comes early is, notably, not up to the groundhog."
      },
      {
        label: "Stay neutral",
        hint: "Diplomatic, deeply unsatisfying to literally everyone.",
        effects: { happinessDelta: -4, effectTicks: 1 },
        outcome: "Both groundhog camps are now mad at you specifically."
      }
    ]
  }
]

// Rolled once per tick from Service.qml's timer — gated on population (no
// dilemmas before there's a city worth having one) and deduped against
// whatever's already pending so the same scenario can't stack on itself,
// though stacking *different* scenarios is intentional: if the mayor's
// been away, a queue of unresolved decisions is the point. `chance` is
// Service.qml's persisted cooldown value, already scaled by the
// eventFrequency setting — not a constant here, see nextEventChance.
function rollForEvent(pendingIds, population, chance) {
  if (population < EVENT_MIN_POPULATION) return null
  if (chance <= 0) return null
  if (Math.random() >= chance) return null
  var pool = EVENTS.filter(function(e) { return pendingIds.indexOf(e.id) < 0 })
  if (pool.length === 0) return null
  return pool[Math.floor(Math.random() * pool.length)]
}

// The cooldown step: straight back to the floor the tick an event actually
// fires, otherwise doubling toward the ceiling. A few quiet ticks recover
// the full rate quickly, but two dilemmas essentially never land back to
// back.
function nextEventChance(currentChance, eventFired) {
  if (eventFired) return EVENT_CHANCE_BASE
  return Math.min(EVENT_CHANCE_MAX, currentChance * EVENT_CHANCE_GROWTH)
}

// Approximates a population swing by actually growing/shrinking residential
// tiles rather than a bare counter, since population is always recomputed
// from the grid on the next tick anyway. Chunky in units of
// RES_CAP_PER_LEVEL (a level at a time) rather than exact — fine for a
// flavor event, not a precision instrument. Growth only touches tiles
// already below max density; shrinkage is a "people are leaving" shock, so
// it isn't limited to already-struggling tiles.
function applyPopulationShock(grid, deltaPop) {
  var next = grid.slice()
  var remaining = Math.round(deltaPop)
  if (remaining === 0) return next
  var growing = remaining > 0
  var guard = 0
  while (remaining !== 0 && guard < 20) {
    guard++
    var candidates = []
    for (var i = 0; i < next.length; i++) {
      var tile = parseTile(next[i])
      if (tile.type !== TILE_RES) continue
      if (growing && tile.level < 3) candidates.push(i)
      if (!growing && tile.level > 0) candidates.push(i)
    }
    if (candidates.length === 0) break
    for (var s = candidates.length - 1; s > 0; s--) {
      var j = Math.floor(Math.random() * (s + 1))
      var tmp = candidates[s]; candidates[s] = candidates[j]; candidates[j] = tmp
    }
    for (var c = 0; c < candidates.length; c++) {
      var idx = candidates[c]
      var t = parseTile(next[idx])
      next[idx] = makeTile(t.type, growing ? t.level + 1 : t.level - 1)
      remaining += growing ? -RES_CAP_PER_LEVEL : RES_CAP_PER_LEVEL
      if ((growing && remaining <= 0) || (!growing && remaining >= 0)) break
    }
  }
  return next
}

// --- municipal loans ------------------------------------------------------
// A city that over-built before its power plant landed used to be genuinely
// stuck: TREASURY_FLOOR stops the debt spiral, but nothing lets a broke mayor
// actually fix the problem that caused it. Borrowing is that way out, and it
// costs something real — repayments are taken every tick, so a loan trades a
// lump sum now for a tighter budget for a long time afterwards. That tension
// is the point; this is not free money.
var LOAN_OFFERS = [
  { id: "seed", label: "Seed bond", principal: 2000, ticks: 60, interest: 0.12, minPopulation: 0 },
  { id: "works", label: "Public works bond", principal: 6000, ticks: 90, interest: 0.16, minPopulation: 300 },
  { id: "growth", label: "Growth bond", principal: 15000, ticks: 120, interest: 0.22, minPopulation: 900 }
]
var MAX_ACTIVE_LOANS = 2
// Debt service is capped as a share of income, which is what stops borrowing
// from becoming an infinite hole — a city can only carry what it can service.
var LOAN_BURDEN_LIMIT = 0.4

function loanOffer(id) {
  for (var i = 0; i < LOAN_OFFERS.length; i++) if (LOAN_OFFERS[i].id === id) return LOAN_OFFERS[i]
  return null
}

function loanPaymentFor(offer) {
  return offer.principal * (1 + offer.interest) / offer.ticks
}

function totalLoanPayment(loans) {
  var total = 0
  if (!loans) return 0
  for (var i = 0; i < loans.length; i++) total += loans[i].perTick || 0
  return total
}

function totalLoanDebt(loans) {
  var total = 0
  if (!loans) return 0
  for (var i = 0; i < loans.length; i++) total += Math.max(0, loans[i].remaining || 0)
  return total
}

function canBorrow(offer, loans, population, income) {
  if (!offer) return { ok: false, reason: "no-such-loan" }
  var active = loans ? loans.length : 0
  if (active >= MAX_ACTIVE_LOANS) return { ok: false, reason: "too-many-loans" }
  if (population < offer.minPopulation) return { ok: false, reason: "too-small", need: offer.minPopulation }
  var burden = totalLoanPayment(loans) + loanPaymentFor(offer)
  if (burden > Math.max(0, income) * LOAN_BURDEN_LIMIT)
    return { ok: false, reason: "cant-service", burden: burden }
  return { ok: true, reason: "", burden: burden }
}

function takeLoan(loans, offer, ageMinutes) {
  var next = loans ? loans.slice() : []
  next.push({
    id: offer.id,
    label: offer.label,
    principal: offer.principal,
    remaining: offer.principal * (1 + offer.interest),
    perTick: loanPaymentFor(offer),
    takenAt: ageMinutes || 0
  })
  return next
}

// One tick of repayment. Loans that reach zero drop off the list.
function advanceLoans(loans) {
  var next = []
  if (!loans) return next
  for (var i = 0; i < loans.length; i++) {
    var remaining = loans[i].remaining - loans[i].perTick
    if (remaining > 0.01) {
      next.push({
        id: loans[i].id, label: loans[i].label, principal: loans[i].principal,
        remaining: remaining, perTick: loans[i].perTick, takenAt: loans[i].takenAt
      })
    }
  }
  return next
}

// --- city advisors --------------------------------------------------------
// Every advisor reads the same helpers the tick itself uses — summarize,
// serviceCoverageStats, computeDemand, computeUpkeep — rather than its own
// parallel heuristics. Same reasoning as inspectTile: advice derived from
// different numbers than the simulation will eventually contradict it, and an
// advisor that lies is worse than no advisor at all.
var ADVISOR_ORDER = ["planning", "utilities", "safety", "wellbeing", "finance"]
var ADVISOR_NAMES = {
  planning: "City Planner",
  utilities: "Utilities",
  safety: "Public Safety",
  wellbeing: "Health & Education",
  finance: "Treasurer"
}
var SEVERITY_OK = 0
var SEVERITY_WATCH = 1
var SEVERITY_URGENT = 2

// How many residents the current residential zoning could ever hold, if every
// zoned tile grew to level 3. A city sitting near this is not "stalled" — it
// is full, and no amount of waiting will change that.
function residentialCeiling(stats) {
  return stats.resCount * 3 * RES_CAP_PER_LEVEL
}

function advice(advisor, severity, headline, detail) {
  return {
    advisor: advisor, name: ADVISOR_NAMES[advisor],
    severity: severity, headline: headline, detail: detail
  }
}

function coverageRow(coverage, key) {
  for (var i = 0; i < coverage.length; i++) if (coverage[i].key === key) return coverage[i]
  return { unmet: 0, coverage: 100, residents: 0 }
}

function planningAdvice(stats, demand) {
  var ceiling = residentialCeiling(stats)
  if (stats.resCount === 0)
    return advice("planning", SEVERITY_URGENT, "Nowhere to live",
      "Zone some residential land — nothing else matters until people can move in.")
  if (ceiling > 0 && stats.population >= ceiling * 0.85)
    return advice("planning", SEVERITY_URGENT, "Housing is full",
      "Residential is at " + Math.round(stats.population / ceiling * 100) + "% of its zoned ceiling ("
      + stats.population + " of " + ceiling + "). Growth has stopped because there is nowhere left to "
      + "build up — zone more residential land.")
  var jobs = stats.jobsCommercial + stats.jobsIndustrial
  if (jobs > stats.population * 1.6 && stats.population > 0)
    return advice("planning", SEVERITY_WATCH, "More jobs than workers",
      jobs + " jobs for " + stats.population + " residents. Zone housing to fill them.")
  if (stats.population > Math.max(jobs, 0) * 2 && stats.population > 60)
    return advice("planning", SEVERITY_WATCH, "Not enough work",
      stats.population + " residents and only " + jobs + " jobs. Zone commercial or industrial.")
  if (demand && demand.R > 1.2)
    return advice("planning", SEVERITY_WATCH, "Demand for housing",
      "Residential demand is running high — more R zoning would fill quickly.")
  return advice("planning", SEVERITY_OK, "Zoning looks balanced",
    stats.resCount + " residential, " + stats.comCount + " commercial, " + stats.indCount + " industrial.")
}

function utilitiesAdvice(coverage) {
  var power = coverageRow(coverage, "power"), water = coverageRow(coverage, "water")
  var worst = power.unmet >= water.unmet ? power : water
  var label = worst === power ? "Power" : "Water"
  if (worst.unmet > 0)
    return advice("utilities", SEVERITY_URGENT, label + " is not reaching everyone",
      worst.unmet + " residents have no " + label.toLowerCase() + " (" + worst.coverage
      + "% covered). Uncovered zones cannot grow at all until this is fixed.")
  return advice("utilities", SEVERITY_OK, "Everyone is connected",
    "Power and water both reach the whole city.")
}

function safetyAdvice(coverage, funding) {
  var fire = coverageRow(coverage, "fire"), police = coverageRow(coverage, "police")
  var worst = fire.unmet >= police.unmet ? fire : police
  var isFire = worst === fire
  var label = isFire ? "Fire protection" : "Police"
  var level = fundingLevel(funding, isFire ? "F" : "S")
  if (worst.unmet > 0) {
    var starved = level < 1
      ? " Its budget is at " + Math.round(level * 100) + "%, which is shrinking its range — raising it would help before building anything."
      : ""
    return advice("safety", SEVERITY_WATCH, label + " has gaps",
      worst.unmet + " residents are outside cover (" + worst.coverage
      + "%). Uncovered buildings risk losing a level." + starved)
  }
  if (fundingLevel(funding, "F") < 1 || fundingLevel(funding, "S") < 1)
    return advice("safety", SEVERITY_WATCH, "Running lean",
      "Everyone is covered, but a department is underfunded — incidents are likelier than they need to be.")
  return advice("safety", SEVERITY_OK, "The city is covered",
    "Fire and police both reach every resident.")
}

function wellbeingAdvice(coverage, stats, funding) {
  var schools = coverageRow(coverage, "schools"), medical = coverageRow(coverage, "medical")
  var worst = schools.unmet >= medical.unmet ? schools : medical
  var isSchool = worst === schools
  var label = isSchool ? "Education" : "Healthcare"
  if (worst.unmet > 0 && stats.population >= 100)
    return advice("wellbeing", SEVERITY_WATCH, label + " is short",
      worst.unmet + " residents are not served (" + worst.coverage
      + "%). Homes without it grow more slowly.")
  if (worst.unmet > 0)
    return advice("wellbeing", SEVERITY_OK, "Not needed yet",
      "A town this small grows fine without full " + label.toLowerCase()
      + " — it starts to matter past 100 residents.")
  if (fundingLevel(funding, "N") < 1 || fundingLevel(funding, "H") < 1)
    return advice("wellbeing", SEVERITY_WATCH, "Underfunded",
      "Coverage is complete but a budget is below 100%, which narrows its reach.")
  return advice("wellbeing", SEVERITY_OK, "Well served",
    "Schools and clinics reach everyone.")
}

function financeAdvice(stats, income, upkeep, treasury, loans, taxRatePercent) {
  var debt = totalLoanPayment(loans)
  var net = income - upkeep - debt
  if (treasury <= TREASURY_FLOOR + 1)
    return advice("finance", SEVERITY_URGENT, "The city is insolvent",
      "The treasury has bottomed out. Bulldoze what you can spare for a refund, cut department "
      + "funding, or take a loan to get moving again.")
  if (net < 0)
    return advice("finance", SEVERITY_URGENT, "Spending more than we earn",
      "Running $" + Math.round(-net) + " a month short. Raise taxes, cut department funding, or grow "
      + "the tax base." + (debt > 0 ? " Debt service is $" + Math.round(debt) + " of that." : ""))
  if (debt > 0)
    return advice("finance", SEVERITY_WATCH, "Carrying debt",
      "$" + Math.round(totalLoanDebt(loans)) + " outstanding at $" + Math.round(debt)
      + " a month. Still $" + Math.round(net) + " a month clear.")
  if (taxRatePercent > 15)
    return advice("finance", SEVERITY_WATCH, "Taxes are steep",
      taxRatePercent + "% is holding happiness down, which slows growth. Lower it if the budget allows.")
  if (treasury > 8000 && net > 0)
    return advice("finance", SEVERITY_WATCH, "Money sitting idle",
      "$" + Math.round(treasury) + " in the bank earning nothing. Upgrade infrastructure, raise "
      + "department funding, or expand — a treasury this size is not doing any work.")
  return advice("finance", SEVERITY_OK, "Books are healthy",
    "$" + Math.round(net) + " a month clear on $" + Math.round(income) + " of income.")
}

// ctx: { stats, coverage, demand, income, upkeep, treasury, funding, loans,
// taxRatePercent } — all already computed by the caller so nothing here
// rescans the grid.
function cityAdvice(ctx) {
  return [
    planningAdvice(ctx.stats, ctx.demand),
    utilitiesAdvice(ctx.coverage),
    safetyAdvice(ctx.coverage, ctx.funding),
    wellbeingAdvice(ctx.coverage, ctx.stats, ctx.funding),
    financeAdvice(ctx.stats, ctx.income, ctx.upkeep, ctx.treasury, ctx.loans, ctx.taxRatePercent)
  ]
}

// The single thing most worth telling the mayor right now, for the one-line
// summary — highest severity wins, ties broken by ADVISOR_ORDER.
function topAdvice(list) {
  var best = null
  for (var i = 0; i < list.length; i++)
    if (!best || list[i].severity > best.severity) best = list[i]
  return best
}
