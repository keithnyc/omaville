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
// Mass transit: the answer to congestion you buy rather than plan around.
// Same radius machinery as schools and clinics (6/10/15 by tier), and like
// them it is a staffed department billed per resident rather than per
// building — a bus network for 5000 people costs more than one for 500.
var TILE_TRANSIT = "M"
var TRANSIT_RADIUS = 10
var TILE_TREE = "T"
var TILE_FLOWERS = "B"

var COSTS = { "#": 10, "A": 30, "R": 5, "C": 5, "I": 5, "P": 10, "E": 90, "W": 60, "F": 70, "S": 70, "T": 12, "B": 18, "N": 100, "H": 110, "M": 130, "L": 4, "Q": 30 }
var TILE_LABELS = {
  "_": "Clear", "#": "Road", "A": "Avenue", "R": "Residential", "C": "Commercial",
  "I": "Industrial", "P": "Playground", "E": "Generator", "W": "Well",
  "F": "Firehouse", "S": "Substation", "T": "Tree", "B": "Flowerbed", "N": "Elementary School", "H": "Clinic", "M": "Bus Depot", "L": "Water", "Q": "Waterfront Park"
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
  return tile.type === TILE_LAKE || isBridgeTile(tile)
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
  var current = parseTile(grid[index])
  // Widening a street you already paid for costs only the widening, the same
  // way raising a building to a higher tier costs only the difference.
  if (type === TOOL_AVENUE) {
    if (current.type === TILE_ROAD) return AVENUE_UPGRADE_COST
    return (current.type === TILE_LAKE ? BRIDGE_COST : COSTS[TILE_ROAD]) + AVENUE_UPGRADE_COST
  }
  return type === TILE_ROAD && current.type === TILE_LAKE ? BRIDGE_COST : COSTS[type]
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
// every zone at once the moment this shipped). Both used to be an invisible
// per-tile dice roll; both are now real events instead — a spreading fire
// (FIRE_CHANCE_BASE, advanceFires) and a crime wave sitting over a district
// (CRIME_CHANCE_BASE, advanceCrime). These radii still say how far a station
// reaches, they just govern response now rather than a hidden probability.
var FIRE_RADIUS = 9
var POLICE_RADIUS = 9
var FIRE_UPKEEP = 2
var POLICE_UPKEEP = 2

// --- department funding ---------------------------------------------------
// The treasury stopped being a constraint once a city matured: income scales
// with population, but upkeep only scaled with tile count, so a grown city
// just accumulated money with nothing left to spend it on. Funding is the
// permanent sink. Each department runs at a player-set level, and its cost is
// charged per resident served rather than per building — so unlike a one-off
// purchase it keeps scaling for as long as the city grows. Modelled on
// SimCity's department budget rather than invented, since that is the game
// this one is chasing.
var FUNDABLE_SERVICES = ["F", "S", "N", "H", "M"]
var FUNDING_MIN = 0.5
var FUNDING_MAX = 1.5
var FUNDING_DEFAULT = 1

// Cost per 100 residents per tick at 100% funding. Tuned (see
// tests/funding.mjs) so a mature city at default funding runs a modest
// surplus, while the 50%-150% range swings the budget by enough to matter.
var DEPARTMENT_RATE = { F: 2.7, S: 2.7, N: 3.4, H: 3.7, M: 3.2 }
var DEPARTMENT_NAMES = { F: "Fire", S: "Police", N: "Education", H: "Health", M: "Transit" }

function defaultFunding() {
  return { F: FUNDING_DEFAULT, S: FUNDING_DEFAULT, N: FUNDING_DEFAULT,
    H: FUNDING_DEFAULT, M: FUNDING_DEFAULT }
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
  H: ["Clinic", "Hospital", "Medical Center"],
  M: ["Bus Depot", "Tram Line", "Transit Hub"]
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
  H: [0, 200, 450],
  M: [0, 260, 620]
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
function canUpgrade(type, currentLevel, population, treasury, civic) {
  if (!UPGRADE_COSTS[type]) return { ok: false, reason: "not-upgradeable", cost: 0 }
  if (currentLevel >= 2) return { ok: false, reason: "max-level", cost: 0 }
  var nextLevel = currentLevel + 1
  var cost = UPGRADE_COSTS[type][nextLevel]
  var threshold = UPGRADE_THRESHOLDS[nextLevel]
  if (population < threshold) return { ok: false, reason: "locked", cost: cost, threshold: threshold }
  if (!civicAllowsTier(civic, nextLevel))
    return { ok: false, reason: "unschooled", cost: cost, threshold: threshold,
      civicNeeded: nextLevel + 1 }
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
  if (type === TILE_ROAD && level > 0)
    return (level % 2 === 1 ? BRIDGE_COST : COSTS[TILE_ROAD])
      + (level >= 2 ? AVENUE_UPGRADE_COST : 0)
  var base = COSTS[type] || 0
  var upgrades = UPGRADE_COSTS[type]
  if (!upgrades) return base
  var total = base
  for (var lv = 1; lv <= level; lv++) total += upgrades[lv] || 0
  return total
}

// Place the selected infrastructure tier atomically, or raise a matching
// building to it for only the remaining investment. Never downgrade.
function canBuildTier(grid, index, type, level, population, treasury, civic) {
  if (!UPGRADE_COSTS[type] || !Number.isInteger(level) || level < 0 || level > 2
      || !Number.isInteger(index) || index < 0 || index >= grid.length)
    return { ok: false, cost: 0 }
  var current = parseTile(grid[index])
  if (current.type !== TILE_EMPTY && (current.type !== type || current.level >= level))
    return { ok: false, cost: 0 }
  var cost = totalInvestment(type, level)
    - (current.type === type ? totalInvestment(type, current.level) : 0)
  // Population says the city is big enough to want it; the civic level says it
  // is schooled enough to run it. Both gate construction only — anything
  // already built stays built if the schools later lapse.
  return {
    ok: population >= UPGRADE_THRESHOLDS[level] && treasury >= cost
      && civicAllowsTier(civic, level),
    cost: cost
  }
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

// Local shared access: at most two orthogonal steps to an actual road.
// Gardens and zone setbacks are passable; water and service compounds are not.
// Never recurse through other served buildings, which would give infinite reach.
function roadAccessIndices(grid, gridSize, index) {
  var roads = []
  var neighbors = neighborIndices(gridSize, index)
  for (var i = 0; i < neighbors.length; i++) {
    var next = neighbors[i]
    var type = (grid[next] || "")[0]
    if (type === TILE_ROAD) roads.push(next)
    else if (type && "_RCIPQTB".indexOf(type) >= 0) {
      var outer = neighborIndices(gridSize, next)
      for (var j = 0; j < outer.length; j++) {
        var candidate = outer[j]
        if (candidate !== index && (grid[candidate] || "")[0] === TILE_ROAD
            && roads.indexOf(candidate) < 0) roads.push(candidate)
      }
    }
  }
  return roads
}

function hasRoadAccess(grid, gridSize, index) {
  return roadAccessIndices(grid, gridSize, index).length > 0
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
  var power = [], water = [], fire = [], police = [], schools = [], medical = [], transit = []
  for (var i = 0; i < grid.length; i++) {
    var t = parseTile(grid[i])
    if (t.type === TILE_POWER) power.push({ index: i, level: t.level })
    else if (t.type === TILE_WATER) water.push({ index: i, level: t.level })
    else if (t.type === TILE_FIRE) fire.push({ index: i, level: t.level })
    else if (t.type === TILE_POLICE) police.push({ index: i, level: t.level })
    else if (t.type === TILE_SCHOOL) schools.push({ index: i, level: t.level })
    else if (t.type === TILE_MEDICAL) medical.push({ index: i, level: t.level })
    else if (t.type === TILE_TRANSIT) transit.push({ index: i, level: t.level })
  }
  return { power: power, water: water, fire: fire, police: police, schools: schools,
    medical: medical, transit: transit }
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
    { name: "Healthcare", key: "medical", radius: MEDICAL_RADIUS },
    // optional: reported like the others, but not a need. A city with no
    // transit is not failing anybody — it just has more cars. Anything that
    // treats unmet coverage as a shortage must skip these, or every city that
    // has not built an optional service looks like it is neglecting one.
    { name: "Transit", key: "transit", radius: TRANSIT_RADIUS, optional: true }
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
    // Never round up to 100 while anyone is still unserved. At 8,070 of 8,100
    // the true figure is 99.6%, and "100% covered · 30 residents unserved" is
    // a contradiction a player reads straight off the status line.
    // Rounded as normal, but capped below 100 while anyone is unserved: the
    // only misleading value is the one that claims completeness.
    rows[r].coverage = rows[r].unmet > 0
      ? Math.min(99, Math.round(rows[r].served / Math.max(1, rows[r].residents) * 100))
      : 100
  }
  return rows
}

// One pass over the grid: population/jobs/counts, used both to drive this
// tick's growth decisions and to report bar-widget stats.
function summarize(grid) {
  var stats = {
    population: 0, jobsCommercial: 0, jobsIndustrial: 0,
    roadCount: 0, avenueCount: 0, parkCount: 0, resCount: 0, comCount: 0, indCount: 0,
    powerCount: 0, waterCount: 0, fireCount: 0, policeCount: 0, builtDensity: 0,
    // Level-weighted, not flat counts — a Garden or a Power Station costs
    // (and gives) more than a tier-1 Playground or Generator.
    parkHappinessBonus: 0, serviceUpkeep: 0,
    // Split out so the monthly bill can itemise where the money goes.
    powerUpkeep: 0, waterUpkeep: 0, decorationUpkeep: 0,
    departmentPresent: { F: false, S: false, N: false, H: false, M: false },
    treeCount: 0, flowerCount: 0, decorationPoints: 0, taxablePopulation: 0, transitCount: 0
  }
  for (var i = 0; i < grid.length; i++) {
    var tile = parseTile(grid[i])
    switch (tile.type) {
    case TILE_ROAD:
      stats.roadCount++
      if (tile.level >= 2) stats.avenueCount++
      break
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
    case TILE_TRANSIT:
      stats.transitCount++
      stats.departmentPresent.M = true
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

// How much the smokestacks cost the mood. Proportional to industry's share of
// the built city, not its absolute size — a flat two points per tile meant a
// twelve-tile industrial district cost the same 24 points in a town of 500 as
// in a city of 8000. Since a new city has to zone industry for jobs and has no
// parks yet to offset it, that alone could put a first-term mayor below the
// election threshold before they had done anything wrong.
var INDUSTRIAL_HAPPINESS_MAX = 25
// Share of built lots at which the penalty maxes out. Deliberately close to
// what a normal city already runs (~20%), so this fixes the *shape* — a
// light-industry city is now rewarded for it — without handing every existing
// city a large happiness rebate it never earned.
var INDUSTRIAL_HAPPINESS_SHARE = 0.25

function industrialMood(stats) {
  var built = (stats.resCount || 0) + (stats.comCount || 0) + (stats.indCount || 0)
  if (built <= 0) return 0
  var share = (stats.indCount || 0) / built
  return Math.min(INDUSTRIAL_HAPPINESS_MAX,
    INDUSTRIAL_HAPPINESS_MAX * share / INDUSTRIAL_HAPPINESS_SHARE)
}

function computeHappiness(taxRatePercent, stats, trafficPenalty) {
  var taxPenalty = Math.max(0, taxRatePercent - 10) * 1.5
  var parkBonus = Math.min(28, stats.parkHappinessBonus)
  var industrialPenalty = industrialMood(stats)
  return Math.round(clamp(
    70 - taxPenalty + parkBonus - industrialPenalty - (trafficPenalty || 0), 0, 100))
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
// `neighbors` is the count of connected neighbouring cities: migration from
// outside lifts residential demand and their trade lifts commercial, which is
// the whole point of running a highway to the map edge.
function computeDemand(stats, neighbors, effects) {
  var jobsTotal = stats.jobsCommercial + stats.jobsIndustrial
  var laborAvailability = clamp(stats.population / (jobsTotal + 10), 0, 1.3)
  var bonus = neighborBonus(neighbors)
  var policy = effects || ordinanceEffects([])
  return {
    R: (0.5 + 0.5 * clamp(jobsTotal / (stats.population + 10), 0, 1.5)
      + computeAttractiveness(stats) / 100) * bonus.migration * policy.residentialDemand,
    C: (0.5 + 0.5 * clamp((stats.population / (stats.jobsCommercial + 10)) * laborAvailability, 0, 1.5))
      * bonus.commerce * policy.commercialDemand,
    I: (0.6 + 0.3 * clamp((stats.population / (stats.jobsIndustrial + 50)) * laborAvailability, 0, 1.0))
      * policy.industrialDemand
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

// --- traffic ---------------------------------------------------------------
// Congestion is the first constraint a big city meets that a small one never
// does. One rule produces the whole system: every built lot generates trips,
// those trips spread evenly across the road tiles that actually serve the lot,
// and a road tile carries only so many.
//
// All three counter-strategies fall out of that rule rather than being bolted
// on beside it. Zoning shops near homes cuts trips at the source. A connected
// grid spreads the same trips over more roads than one feeder spine can carry.
// An avenue raises what a single tile can take. Nothing here routes anything:
// pathfinding thousands of trips across 4096 tiles every tick would cost far
// more than the effect is worth, and would not change the advice it gives.

// Street, bridge, avenue, avenue bridge. The level is two independent bits —
// odd means over water, >= 2 means avenue — so bridges keep working untouched.
// Calibrated against a mature 7,500-resident city built with no thought for
// traffic at all: about a sixth of its lots come out gridlocked and a fifth
// merely slowed, which is a problem worth fixing rather than a city that
// stops dead the moment the system arrives.
var ROAD_CAPACITY = [20, 20, 50, 50]
var AVENUE_UPGRADE_COST = 20
var AVENUE_UPKEEP = 0.55
// A build tool, not a tile type: it writes TILE_ROAD at an avenue level, so
// every road-shaped thing in the model stays a road.
var TOOL_AVENUE = "A"

var TRIPS_PER_RESIDENT = 0.55
var TRIPS_PER_JOB = 0.4
// How far a trip can be satisfied locally, and how much local opportunity it
// takes to absorb as much as a neighbourhood ever can. Never all of it:
// somebody always drives.
var TRIP_LOCAL_RADIUS = 5
var TRIP_LOCAL_TARGET = 70
var TRIP_LOCAL_RELIEF = 0.55

// Share of a covered lot's remaining car trips that transit takes off the
// road, by station tier. Never all of them, and deliberately less than the
// walkability relief a well-mixed neighbourhood earns for free — transit is
// the fix you buy when you have already run out of planning.
var TRANSIT_RELIEF = [0.28, 0.40, 0.50]

// Below WATCH a road flows freely; between WATCH and JAM growth tapers; at or
// above JAM the lot cannot grow at all until someone fixes the road.
var CONGESTION_WATCH = 0.7
var CONGESTION_JAM = 1.0
var TRAFFIC_MAX_HAPPINESS_PENALTY = 14

function isBridgeTile(tile) {
  return tile.type === TILE_ROAD && tile.level % 2 === 1
}

function isAvenueTile(tile) {
  return tile.type === TILE_ROAD && tile.level >= 2
}

function roadCapacity(level) {
  return ROAD_CAPACITY[level] || ROAD_CAPACITY[0]
}

// The other half of a commute, within walking distance: jobs for a home,
// customers for a shop or a plant. A bounded box keeps this O(1) per tile
// however big the city gets — the same reason nearbyZoneEffect is written
// this way instead of comparing every built tile against every other one.
function localOpportunity(grid, gridSize, index, type) {
  var x = index % gridSize, y = Math.floor(index / gridSize)
  var r = TRIP_LOCAL_RADIUS, r2 = r * r, total = 0
  for (var dy = -r; dy <= r; dy++) {
    var ny = y + dy
    if (ny < 0 || ny >= gridSize) continue
    for (var dx = -r; dx <= r; dx++) {
      var nx = x + dx
      if (nx < 0 || nx >= gridSize) continue
      if (dx * dx + dy * dy > r2) continue
      var t = parseTile(grid[ny * gridSize + nx])
      if (t.level < 1) continue
      if (type === TILE_RES) {
        if (t.type === TILE_COM) total += t.level * COM_JOBS_PER_LEVEL
        else if (t.type === TILE_IND) total += t.level * IND_JOBS_PER_LEVEL
      } else if (t.type === TILE_RES) total += t.level * RES_CAP_PER_LEVEL
    }
  }
  return total
}

// The best relief any transit station in range offers this tile. Uses the
// same radius machinery as every other service, so funding widens a transit
// network exactly the way it widens fire cover.
function transitRelief(gridSize, transit, index, funding) {
  if (!transit || transit.length === 0) return 0
  var radius = TRANSIT_RADIUS * fundingRadiusScale(fundingLevel(funding, "M"))
  var best = 0
  for (var i = 0; i < transit.length; i++) {
    if (!withinRadius(gridSize, transit[i].index, index,
        radius * INFRA_RADIUS_SCALE[transit[i].level])) continue
    var relief = TRANSIT_RELIEF[transit[i].level] || 0
    if (relief > best) best = relief
  }
  return best
}

// Trips one lot puts onto the network this tick, after everything that takes
// them off it first. Walking, transit and policy compound rather than add:
// each removes a share of what the one before it left, so no combination can
// ever drive a lot's traffic to zero.
function tileTrips(grid, gridSize, index, tile, transitShare, tripRate) {
  var base = 0
  if (tile.type === TILE_RES) base = tile.level * RES_CAP_PER_LEVEL * TRIPS_PER_RESIDENT
  else if (tile.type === TILE_COM) base = tile.level * COM_JOBS_PER_LEVEL * TRIPS_PER_JOB
  else if (tile.type === TILE_IND) base = tile.level * IND_JOBS_PER_LEVEL * TRIPS_PER_JOB
  if (base <= 0) return 0
  var local = localOpportunity(grid, gridSize, index, tile.type)
  return base
    * (1 - TRIP_LOCAL_RELIEF * Math.min(1, local / TRIP_LOCAL_TARGET))
    * (1 - (transitShare || 0))
    * (tripRate === undefined ? 1 : tripRate)
}

function trafficSurvey(grid, gridSize, utilities, funding, effects) {
  var roadLoad = {}, lotRoads = {}, totalTrips = 0, unservedTrips = 0, savedTrips = 0
  var transit = utilities && utilities.transit ? utilities.transit : []
  var tripRate = effects && effects.tripRate !== undefined ? effects.tripRate : 1

  for (var i = 0; i < grid.length; i++) {
    var tile = parseTile(grid[i])
    if (tile.level < 1) continue
    if (tile.type !== TILE_RES && tile.type !== TILE_COM && tile.type !== TILE_IND) continue
    var relief = transitRelief(gridSize, transit, i, funding)
    var trips = tileTrips(grid, gridSize, i, tile, relief, tripRate)
    if (relief > 0 || tripRate !== 1)
      savedTrips += tileTrips(grid, gridSize, i, tile) - trips
    if (trips <= 0) continue
    totalTrips += trips
    // The same set of roads that lets this lot grow at all is the set that
    // carries its traffic, so a lot can never be served by a road it cannot
    // reach, and widening the wrong street can never help it.
    var serving = roadAccessIndices(grid, gridSize, i)
    if (serving.length === 0) { unservedTrips += trips; continue }
    lotRoads[i] = serving
    var share = trips / serving.length
    for (var r = 0; r < serving.length; r++)
      roadLoad[serving[r]] = (roadLoad[serving[r]] || 0) + share
  }

  var roadCongestion = {}, jammed = 0, busy = 0, used = 0, stuck = 0, worst = 0
  for (var key in roadLoad) {
    var capacity = roadCapacity(parseTile(grid[Number(key)]).level)
    var value = roadLoad[key] / capacity
    roadCongestion[key] = value
    used++
    if (value >= CONGESTION_JAM) { jammed++; stuck += roadLoad[key] - capacity }
    else if (value >= CONGESTION_WATCH) busy++
    if (value > worst) worst = value
  }

  // A lot's congestion is the mean across the roads serving it: one bad street
  // out of four is a nuisance, not a shutdown — and that gap is exactly what a
  // connected grid buys over a single feeder.
  var lotCongestion = {}
  for (var lot in lotRoads) {
    var serving2 = lotRoads[lot], sum = 0
    for (var s = 0; s < serving2.length; s++) sum += roadCongestion[serving2[s]] || 0
    lotCongestion[lot] = sum / serving2.length
  }

  return {
    roadCongestion: roadCongestion, lotCongestion: lotCongestion,
    totalTrips: totalTrips, unservedTrips: unservedTrips, savedTrips: savedTrips,
    jammedRoads: jammed, busyRoads: busy, usedRoads: used,
    worst: worst, stuckTrips: stuck,
    stuckShare: totalTrips > 0 ? stuck / totalTrips : 0
  }
}

function lotCongestion(traffic, index) {
  if (!traffic || !traffic.lotCongestion) return 0
  var value = traffic.lotCongestion[index]
  return value === undefined ? 0 : value
}

// Full speed up to WATCH, tapering to a standstill at JAM. Returned rather
// than applied inline so tickGrid and growthBlocker read it from one place and
// cannot disagree about whether a lot is stuck.
function trafficGrowthScale(congestion) {
  if (congestion < CONGESTION_WATCH) return 1
  if (congestion >= CONGESTION_JAM) return 0
  return 1 - (congestion - CONGESTION_WATCH) / (CONGESTION_JAM - CONGESTION_WATCH)
}

// The share of built lots that cannot grow because of the roads serving them.
// This is what the planner reports and what the overlay paints red, so the two
// can never disagree about how bad things are.
function jammedLotShare(traffic) {
  if (!traffic || !traffic.lotCongestion) return 0
  var total = 0, stuck = 0
  for (var key in traffic.lotCongestion) {
    total++
    if (traffic.lotCongestion[key] >= CONGESTION_JAM) stuck++
  }
  return total > 0 ? stuck / total : 0
}

function trafficHappinessPenalty(traffic) {
  if (!traffic || !traffic.totalTrips) return 0
  return Math.min(TRAFFIC_MAX_HAPPINESS_PENALTY, Math.round(traffic.stuckShare * 45))
}

// Growth/abandonment for one minute. Demand factors use the *pre-tick*
// stats so every tile decides off the same snapshot, not a shifting one.
// A zone only grows when it's road-connected *and* inside both a power
// and a water plant's coverage — served, not just zoned. Losing any one
// of the three (plant bulldozed, road cut) puts it at decay risk exactly
// like a road disconnect always has.
function tickGrid(grid, gridSize, stats, happiness, utilities, demand, funding, load, effects, traffic) {
  var policy = effects || ordinanceEffects([])
  var powerSatisfaction = load ? load.power : 1
  var waterSatisfaction = load ? load.water : 1
  var happinessFactor = clamp(happiness / 70, 0.3, 1.5)
  var baseGrowthChance = 0.15
  var baseDecayChance = 0.08

  // Funding buys reach and safety. Resolved once per tick rather than per
  // tile — these are whole-department settings, and this loop runs over every
  // tile on a 64x64 grid.
  var schoolRadius = SCHOOL_RADIUS * fundingRadiusScale(fundingLevel(funding, "N"))
  var medicalRadius = MEDICAL_RADIUS * fundingRadiusScale(fundingLevel(funding, "H"))

  var next = grid.slice()
  for (var i = 0; i < next.length; i++) {
    var tile = parseTile(next[i])
    if (tile.type !== TILE_RES && tile.type !== TILE_COM && tile.type !== TILE_IND) continue

    var zoneEffect = tile.type === TILE_RES ? nearbyZoneEffect(grid, gridSize, i) : null

    // Coverage says a plant reaches this tile; load says whether the network
    // can actually serve it this month. An overloaded grid browns out tile by
    // tile rather than failing citywide, so growth slows before it stops.
    var connected = hasRoadAccess(grid, gridSize, i)
      && isCovered(gridSize, utilities.power, i, POWER_RADIUS)
      && (powerSatisfaction >= 1 || Math.random() < powerSatisfaction)
      && isCovered(gridSize, utilities.water, i, WATER_RADIUS)
      && (waterSatisfaction >= 1 || Math.random() < waterSatisfaction)
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
        if (zoneEffect.nearIndustrial)
          growthChance *= 1 - (1 - INDUSTRIAL_GROWTH_PENALTY) * policy.industrialNuisance
        if (zoneEffect.nearCommercial) growthChance *= COMMERCIAL_GROWTH_BONUS
      }
      // Congestion throttles every zone equally: goods, customers and
      // workers all arrive by the same jammed street.
      growthChance *= trafficGrowthScale(lotCongestion(traffic, i))
      if (Math.random() < growthChance) {
        next[i] = makeTile(tile.type, tile.level + 1)
        continue
      }
    }
    if (tile.level > 0 && (!connected || happiness < 25)) {
      if (Math.random() < baseDecayChance) next[i] = makeTile(tile.type, tile.level - 1)
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
// (isCovered, hasRoadAccess, nearbyZoneEffect, computeDemand's output) so
// what the tooltip reports can never drift out of sync with what's actually
// governing growth.
function inspectTile(grid, gridSize, index, utilities, demand, population, treasury, civic) {
  var tile = parseTile(grid[index])
  var info = {
    // Carried so anything rendering this tile's details can look the tile up
    // for itself. Without it a shared renderer has to be told which tile it is
    // describing out of band, which is exactly how the congestion readout came
    // to report the inspected tile while describing the hovered one.
    index: index,
    type: tile.type,
    level: tile.level,
    roadAdjacent: hasRoadAccess(grid, gridSize, index),
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
    info.upgrade = canUpgrade(tile.type, tile.level, population || 0, treasury || 0, civic)
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
var DENSITY_UPKEEP_MAX_SCALE = 2.4
var ROAD_UPKEEP = 0.25
var PARK_UPKEEP = 0.3

// Upkeep scales with what's actually built, not just zoned — an empty
// zoned tile costs nothing until something grows on it. `funding` is the
// player's department budget (see departmentSpend); omitting it prices the
// city at default funding.
function computeUpkeep(stats, funding, ordinances) {
  var bill = upkeepBreakdown(stats, funding, ordinances)
  var total = 0
  for (var i = 0; i < bill.length; i++) total += bill[i].amount
  return total
}

// The monthly bill, itemised. computeUpkeep is just the sum of this, so what
// the player is shown can never drift from what they are actually charged.
function upkeepBreakdown(stats, funding, ordinances) {
  // Capped: past the cap a denser city still costs more in total (the bill is
  // rate x density) but stops being charged an ever-worsening *rate* for it.
  // Uncapped, this outran income entirely and growth became self-defeating.
  var densityRate = DENSITY_UPKEEP_RATE
    * Math.min(DENSITY_UPKEEP_MAX_SCALE, 1 + stats.builtDensity / DENSITY_UPKEEP_SOFTCAP)
  var rows = [
    { key: "roads", label: "Roads",
      amount: (stats.roadCount - (stats.avenueCount || 0)) * ROAD_UPKEEP
        + (stats.avenueCount || 0) * AVENUE_UPKEEP },
    { key: "power", label: "Power plants", amount: stats.powerUpkeep },
    { key: "water", label: "Water", amount: stats.waterUpkeep },
    { key: "parks", label: "Parks", amount: stats.parkCount * PARK_UPKEEP },
    { key: "decorations", label: "Landscaping", amount: stats.decorationUpkeep },
    { key: "services", label: "City services", amount: stats.builtDensity * densityRate },
    { key: "ordinances", label: "Ordinances", amount: ordinanceCost(ordinances, stats.population) }
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

// Businesses are taxed too, per job, at their own weight against a resident.
// Without this, income was purely headcount while the services bill grew with
// the square of built density — so past a certain size every new building lost
// money and a mature city had no way to grow out of a deficit. It also made
// the obvious player instinct ("zone commerce to raise income") simply wrong.
//
// Commerce earns more per job than industry: shops and offices are taxed on
// what they turn over, while industry is the cheap way to *create* jobs and
// already pays for itself by unlocking residential growth.
var COM_TAX_WEIGHT = 0.8
var IND_TAX_WEIGHT = 0.5

function computeIncome(population, taxRatePercent, jobsCommercial, jobsIndustrial) {
  var taxed = population
    + (jobsCommercial || 0) * COM_TAX_WEIGHT
    + (jobsIndustrial || 0) * IND_TAX_WEIGHT
  return taxed * taxRatePercent * 0.02
}

// Everything a city is taxed on, from one stats object — so callers cannot
// pass the population and forget the businesses.
function incomeFor(stats, taxRatePercent) {
  return computeIncome(stats.taxablePopulation, taxRatePercent,
    stats.jobsCommercial, stats.jobsIndustrial)
}

// One full minute of simulation. Returns the new grid plus everything the
// service needs to update its own properties and persist. happinessModifier
// and incomeMultiplier fold in whatever active dilemma effects are still
// running (see Service.qml's activeEffects) — happiness stays otherwise
// fully deterministic from tax/parks/industry, and income is the only thing
// a multiplier touches (upkeep is unaffected, so a bad multiplier really
// does squeeze the budget rather than just look worse on paper).
function advanceCity(grid, gridSize, taxRatePercent, happinessModifier, incomeMultiplier, funding, neighbors, ordinances) {
  happinessModifier = happinessModifier || 0
  var policy = ordinanceEffects(ordinances)
  incomeMultiplier = incomeMultiplier === undefined ? 1 : incomeMultiplier
  var stats = summarize(grid)
  var utilities = findUtilities(grid)
  var traffic = trafficSurvey(grid, gridSize, utilities, funding, policy)
  var happiness = Math.round(clamp(
    computeHappiness(taxRatePercent, stats, trafficHappinessPenalty(traffic))
      + happinessModifier + policy.happiness, 0, 100))
  var connected = connectedNeighbors(grid, gridSize, neighbors)
  var demand = computeDemand(stats, connected.length, policy)
  var load = utilityLoad(grid, stats, policy)
  var nextGrid = tickGrid(grid, gridSize, stats, happiness, utilities, demand, funding, load, policy, traffic)
  var upkeep = computeUpkeep(stats, funding, ordinances)
  var income = incomeFor(stats, taxRatePercent) * incomeMultiplier
    * neighborBonus(connected.length).trade
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
    waterCount: stats.waterCount,
    load: load,
    traffic: traffic,
    connectedNeighbors: connected
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
  // An avenue can be laid on open land or water like a road, or widen an
  // existing street or bridge in place. Widening an avenue is a no-op, so it
  // is refused rather than silently charging for nothing.
  if (type === TOOL_AVENUE)
    return current.type === TILE_EMPTY || current.type === TILE_LAKE
      || (current.type === TILE_ROAD && !isAvenueTile(current))
  if (type === TILE_WATERFRONT_PARK)
    return current.type === TILE_EMPTY && shoreAdjacent(grid, Math.round(Math.sqrt(grid.length)), index)
  return current.type === TILE_EMPTY
}

function placeTile(grid, index, type) {
  var next = grid.slice()
  var current = parseTile(grid[index])
  if (type === TOOL_AVENUE) {
    var overWater = current.type === TILE_LAKE || isBridgeTile(current)
    next[index] = makeTile(TILE_ROAD, overWater ? 3 : 2)
    return next
  }
  next[index] = makeTile(type, type === TILE_ROAD && current.type === TILE_LAKE ? 1 : 0)
  return next
}

function bulldozeTile(grid, index) {
  var next = grid.slice()
  var tile = parseTile(grid[index])
  next[index] = makeTile(isBridgeTile(tile) ? TILE_LAKE : TILE_EMPTY, 0)
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
// Order is the tie-break when two advisors report the same severity, so it
// runs roughly in the order a problem stops a city: you cannot fix traffic
// before you have power, and neither matters with nowhere to live.
var ADVISOR_ORDER = ["planning", "utilities", "transport", "safety", "wellbeing", "finance"]
var ADVISOR_NAMES = {
  planning: "City Planner",
  utilities: "Utilities",
  transport: "Transport",
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

// `overlay` names the map view that shows where the problem is, so the
// advisor panel can hand the player straight to it instead of describing a
// location they then have to hunt for.
function advice(advisor, severity, headline, detail, overlay) {
  return {
    advisor: advisor, name: ADVISOR_NAMES[advisor],
    severity: severity, headline: headline, detail: detail,
    overlay: overlay || ""
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
      + "build up — zone more residential land.", "growth")
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

// Everything about how the city moves: what the roads are carrying, what
// relieves them, and the highways that connect the city to anywhere else.
// Its own advisor rather than a branch of the planner because each advisor
// speaks once, and on a mature city the planner is always already busy
// saying something about zoning.
function transportAdvice(stats, traffic, coverage, neighborsLinked, neighborsTotal) {
  neighborsLinked = neighborsLinked || 0
  neighborsTotal = neighborsTotal || 0
  var stuckShare = jammedLotShare(traffic)
  var transitRow = coverageRow(coverage || [], "transit")
  var hasTransit = stats && stats.transitCount > 0

  // Gridlock stops growth outright, so it outranks everything else here. All
  // four fixes are named because none of them is obvious from the map.
  if (stuckShare >= 0.25)
    return advice("transport", SEVERITY_URGENT, "The city is gridlocked",
      Math.round(stuckShare * 100) + "% of built lots sit on jammed roads and cannot grow. "
      + "Zone shops among the houses so fewer trips start at all, open a second route so the "
      + "traffic has somewhere else to go, widen the worst streets into avenues, or build "
      + "transit to take cars off them.", "traffic")
  if (stuckShare >= 0.08)
    return advice("transport", SEVERITY_WATCH, "Traffic is building up",
      Math.round(stuckShare * 100) + "% of built lots are on roads at capacity. Widening them "
      + "into avenues, mixing shops into the housing, or a transit stop nearby will keep "
      + "growth moving.", "traffic")

  // A highway is the cheapest growth a city can buy, so an unopened one is
  // worth raising even when the roads are flowing.
  if (neighborsTotal > 0 && neighborsLinked < neighborsTotal)
    return advice("transport", SEVERITY_WATCH,
      neighborsLinked === 0 ? "No highways out of town"
        : (neighborsTotal - neighborsLinked) + " neighbours still unconnected",
      "Running a road to a marked connector at the map edge opens a highway: "
      + "new arrivals raise housing demand and their trade lifts commerce and income.")

  // Only once a city is big enough for it to be worth the monthly bill.
  if (!hasTransit && stats && stats.population >= 1200)
    return advice("transport", SEVERITY_WATCH, "No public transport",
      "A city this size runs on its roads alone. A bus depot takes a share of the car trips "
      + "around it off the streets, which buys room to grow without laying more asphalt.",
      "transit")
  if (hasTransit && transitRow.coverage < 40 && stats.population >= 1200)
    return advice("transport", SEVERITY_OK, "Transit reaches "
      + transitRow.coverage + "% of residents",
      "Another stop, or an upgrade to an existing one, would widen that.", "transit")

  return advice("transport", SEVERITY_OK, "Traffic is flowing",
    stats && stats.avenueCount > 0
      ? stats.roadCount + " road tiles, " + stats.avenueCount + " of them avenues."
      : (stats ? stats.roadCount + " road tiles, no avenues yet." : "The roads are clear."),
    "traffic")
}

function utilitiesAdvice(coverage, load) {
  var power = coverageRow(coverage, "power"), water = coverageRow(coverage, "water")
  var worst = power.unmet >= water.unmet ? power : water
  var label = worst === power ? "Power" : "Water"
  // A coverage gap is a hard blocker, so it outranks a capacity problem.
  if (worst.unmet > 0)
    return advice("utilities", SEVERITY_URGENT, label + " is not reaching everyone",
      worst.unmet + " residents have no " + label.toLowerCase() + " (" + worst.coverage
      + "% covered). Uncovered zones cannot grow at all until this is fixed.",
      worst === power ? "power" : "water")

  if (load) {
    var powerPct = loadPercent(load.powerDemand, load.powerCapacity)
    var waterPct = loadPercent(load.waterDemand, load.waterCapacity)
    var strained = powerPct >= waterPct
    var pct = strained ? powerPct : waterPct
    var which = strained ? "power" : "water"
    if (pct > 100)
      return advice("utilities", SEVERITY_URGENT, "The " + which + " grid is overloaded",
        "Draw is at " + pct + "% of capacity, so buildings are browning out and growth has "
        + "stalled across the city. Build another plant, or upgrade an existing one.", which)
    if (pct >= 85)
      return advice("utilities", SEVERITY_WATCH, "The " + which + " grid is near capacity",
        "At " + pct + "% of capacity. A little more growth and it starts browning out.", which)
  }

  return advice("utilities", SEVERITY_OK, "Everyone is connected",
    "Power and water reach the whole city, with capacity to spare.")
}

function safetyAdvice(coverage, funding, fires, crimes) {
  // An active fire outranks everything else this advisor could say.
  if (fires && fires.length > 0)
    return advice("safety", SEVERITY_URGENT,
      fires.length === 1 ? "A building is on fire" : fires.length + " fires burning",
      "Fire crews contain a blaze faster where they have cover and funding. "
      + "Anything still burning is losing a level at a time.", "fire")
  if (crimes && crimes.length > 0)
    return advice("safety", SEVERITY_URGENT,
      crimes.length === 1 ? "A crime wave is running" : crimes.length + " crime waves running",
      "It is bleeding money, holding happiness down and pushing residents out of the blocks "
      + "it covers. Police shut one down faster with cover and funding.", "police")
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
      + "%). Uncovered buildings risk losing a level." + starved,
      isFire ? "fire" : "police")
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
      + "%). Homes without it grow more slowly.", isSchool ? "schools" : "medical")
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
    utilitiesAdvice(ctx.coverage, ctx.load),
    transportAdvice(ctx.stats, ctx.traffic, ctx.coverage,
      ctx.neighborsLinked, ctx.neighborsTotal),
    safetyAdvice(ctx.coverage, ctx.funding, ctx.fires, ctx.crimes),
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

// --- map data overlays ----------------------------------------------------
// The advisors say what is wrong; these say where. Both read the same
// helpers the tick does, so an overlay can never highlight a tile the
// simulation disagrees about.
var OVERLAYS = [
  { key: "power", label: "Power", service: "power", radius: POWER_RADIUS },
  { key: "water", label: "Water", service: "water", radius: WATER_RADIUS },
  { key: "fire", label: "Fire", service: "fire", radius: FIRE_RADIUS, funding: "F" },
  { key: "police", label: "Police", service: "police", radius: POLICE_RADIUS, funding: "S" },
  { key: "schools", label: "Schools", service: "schools", radius: SCHOOL_RADIUS, funding: "N" },
  { key: "medical", label: "Health", service: "medical", radius: MEDICAL_RADIUS, funding: "H" },
  { key: "transit", label: "Transit", service: "transit", radius: TRANSIT_RADIUS, funding: "M" },
  { key: "value", label: "Land value" },
  { key: "growth", label: "Growth" },
  { key: "traffic", label: "Traffic" }
]

function overlayDef(key) {
  for (var i = 0; i < OVERLAYS.length; i++) if (OVERLAYS[i].key === key) return OVERLAYS[i]
  return null
}

// The effective radius an overlay should draw, including whatever the
// department's funding level is currently buying (see fundingRadiusScale) —
// so the picture matches the reach the tick actually uses.
function overlayRadius(def, funding) {
  if (!def || !def.radius) return 0
  return def.radius * (def.funding ? fundingRadiusScale(fundingLevel(funding, def.funding)) : 1)
}

// Per-tile verdict for a coverage overlay:
//   "gap"     a built zone outside cover — the actionable case
//   "covered" inside cover
//   "idle"    inside cover but nothing there to benefit
//   ""        outside cover and nothing there either
function overlayCoverageState(grid, gridSize, index, def, utilities, funding) {
  var covered = isCovered(gridSize, utilities[def.service] || [], index, overlayRadius(def, funding))
  var tile = parseTile(grid[index])
  var built = (tile.type === TILE_RES || tile.type === TILE_COM || tile.type === TILE_IND)
    && tile.level > 0
  if (!covered) return built ? "gap" : ""
  return built ? "covered" : "idle"
}

// Why this tile is not growing, in exactly the terms tickGrid uses to decide
// — same helpers, same order, so the overlay cannot claim a tile is blocked
// on something the simulation isn't actually blocking it on. "" means
// nothing is stopping it.
var GROWTH_BLOCKER_LABELS = {
  max: "Fully grown", road: "No road", power: "No power",
  water: "No water", traffic: "Gridlocked", unhappy: "City too unhappy"
}

function growthBlocker(grid, gridSize, index, utilities, happiness, traffic) {
  var tile = parseTile(grid[index])
  if (tile.type !== TILE_RES && tile.type !== TILE_COM && tile.type !== TILE_IND) return ""
  if (tile.level >= 3) return "max"
  if (!hasRoadAccess(grid, gridSize, index)) return "road"
  if (!isCovered(gridSize, utilities.power, index, POWER_RADIUS)) return "power"
  if (!isCovered(gridSize, utilities.water, index, WATER_RADIUS)) return "water"
  if (traffic && trafficGrowthScale(lotCongestion(traffic, index)) <= 0) return "traffic"
  if (happiness < 20) return "unhappy"
  return ""
}

// 0..1 for the land-value heatmap, against the bonus cap a tile can reach.
function landValueFraction(grid, gridSize, index) {
  return clamp(propertyValueBonus(grid, gridSize, index) / (MAX_PROPERTY_BONUS + 12), 0, 1)
}

// --- disasters ------------------------------------------------------------
// Fire used to be an invisible dice roll that quietly shaved a level off an
// uncovered building, which meant the fire station a player funded never
// visibly earned its money. A real fire starts somewhere, spreads if nobody
// puts it out, and is contained faster by coverage and by how well that
// department is funded — so protection becomes something you watch work
// rather than a number you take on faith.
var FIRE_CHANCE_BASE = 0.035
// Hard cap on simultaneous fires. An idle game that can be left alone for an
// hour must not be able to cascade into a razed city while nobody is looking.
var FIRE_MAX_ACTIVE = 10
var FIRE_CONTAIN_COVERED = 0.45
var FIRE_CONTAIN_UNCOVERED = 0.08
var FIRE_SPREAD_COVERED = 0.07
var FIRE_SPREAD_UNCOVERED = 0.18
var FIRE_DAMAGE_CHANCE = 0.4

function isBurnable(tile) {
  return (tile.type === TILE_RES || tile.type === TILE_COM || tile.type === TILE_IND)
    && tile.level > 0
}

// One pass splitting everything that can burn into what the fire service can
// reach and what it can't. Computed once per tick and reused for both the
// start chance and the choice of site.
function fireSurvey(grid, gridSize, utilities, funding) {
  var radius = FIRE_RADIUS * fundingRadiusScale(fundingLevel(funding, "F"))
  var covered = [], exposed = []
  for (var i = 0; i < grid.length; i++) {
    var tile = parseTile(grid[i])
    if (!isBurnable(tile)) continue
    if (isCovered(gridSize, utilities.fire, i, radius)) covered.push(i)
    else exposed.push(i)
  }
  return { covered: covered, exposed: exposed, built: covered.length + exposed.length }
}

// A well-covered city still burns occasionally — just far less often. The
// floor is deliberate: perfect coverage should make fire rare, not abolish it.
function fireStartChance(survey, effects) {
  if (survey.built === 0) return 0
  return FIRE_CHANCE_BASE * (0.25 + 0.75 * (survey.exposed.length / survey.built))
    * ((effects || ordinanceEffects([])).fireChance)
}

// Fires overwhelmingly start where nobody is watching, which is what makes a
// coverage gap feel like a gap rather than a statistic.
function pickFireSite(survey, activeIndices) {
  var pool = survey.exposed.length > 0
    && (survey.covered.length === 0 || Math.random() < 0.8) ? survey.exposed : survey.covered
  if (pool.length === 0) return -1
  for (var attempt = 0; attempt < 6; attempt++) {
    var candidate = pool[Math.floor(Math.random() * pool.length)]
    if (activeIndices.indexOf(candidate) < 0) return candidate
  }
  return -1
}

function rollFireStart(grid, gridSize, fires, utilities, funding, effects) {
  if (fires.length >= FIRE_MAX_ACTIVE) return -1
  var survey = fireSurvey(grid, gridSize, utilities, funding)
  if (Math.random() >= fireStartChance(survey, effects)) return -1
  var active = []
  for (var i = 0; i < fires.length; i++) active.push(fires[i].index)
  return pickFireSite(survey, active)
}

// One tick of every active fire: contain, damage, spread. Returns the new
// grid and fire list plus what happened, so the caller can notify without
// re-deriving it.
function advanceFires(grid, gridSize, fires, utilities, funding, traffic) {
  var next = grid.slice()
  var stillBurning = []
  var contained = 0, destroyed = 0, spread = []
  var radius = FIRE_RADIUS * fundingRadiusScale(fundingLevel(funding, "F"))
  var level = fundingLevel(funding, "F")

  for (var i = 0; i < fires.length; i++) {
    var fire = fires[i]
    var tile = parseTile(next[fire.index])
    // Bulldozed, burnt out, or otherwise no longer a building: nothing to burn.
    if (!isBurnable(tile)) { contained++; continue }

    var covered = isCovered(gridSize, utilities.fire, fire.index, radius)
    // Funding buys a faster response, not just a wider one.
    var containChance = fireContainChance(gridSize, utilities, fire.index, funding, traffic)
    if (Math.random() < containChance) { contained++; continue }

    if (Math.random() < FIRE_DAMAGE_CHANCE) {
      var damaged = parseTile(next[fire.index])
      next[fire.index] = makeTile(damaged.type, damaged.level - 1)
      if (damaged.level - 1 <= 0) destroyed++
    }

    var spreadChance = (covered ? FIRE_SPREAD_COVERED : FIRE_SPREAD_UNCOVERED) * fireFuel(tile)
    if (Math.random() < spreadChance && fires.length + spread.length < FIRE_MAX_ACTIVE) {
      var neighbors = neighborIndices(gridSize, fire.index)
      var options = []
      for (var n = 0; n < neighbors.length; n++) {
        if (!isBurnable(parseTile(next[neighbors[n]]))) continue
        var already = false
        for (var f = 0; f < fires.length; f++) if (fires[f].index === neighbors[n]) already = true
        for (var g = 0; g < spread.length; g++) if (spread[g] === neighbors[n]) already = true
        if (!already) options.push(neighbors[n])
      }
      if (options.length > 0) spread.push(options[Math.floor(Math.random() * options.length)])
    }

    if (isBurnable(parseTile(next[fire.index])))
      stillBurning.push({ index: fire.index, ticks: (fire.ticks || 0) + 1 })
    else contained++
  }

  for (var s = 0; s < spread.length; s++) stillBurning.push({ index: spread[s], ticks: 0 })
  return {
    grid: next, fires: stillBurning, contained: contained,
    destroyed: destroyed, spread: spread.length
  }
}

// --- utility capacity -----------------------------------------------------
// Plants used to serve unlimited buildings inside their radius: only reach
// mattered, never load, so one generator could power a metropolis and utility
// planning was a one-time puzzle rather than an ongoing problem. Capacity is
// measured in building-levels served, the same unit as builtDensity, so a
// district that grows denser draws more without spreading any wider.
var POWER_CAPACITY_PER_TIER = [40, 90, 200]
var WATER_CAPACITY_PER_TIER = [30, 70, 160]

function utilityCapacity(grid) {
  var power = 0, water = 0
  for (var i = 0; i < grid.length; i++) {
    var tile = parseTile(grid[i])
    if (tile.type === TILE_POWER) power += POWER_CAPACITY_PER_TIER[tile.level]
    else if (tile.type === TILE_WATER) water += WATER_CAPACITY_PER_TIER[tile.level]
  }
  return { power: power, water: water }
}

// Demand is builtDensity — every level of every R/C/I building draws. An
// over-subscribed grid browns out: satisfaction is the share of draw the
// network can actually meet, applied per tile per tick as a rolling blackout
// rather than a citywide cliff, so an overloaded city degrades instead of
// stopping dead.
function utilityLoad(grid, stats, effects) {
  var capacity = utilityCapacity(grid)
  var demand = stats.builtDensity
  // Water conservation cuts draw rather than adding capacity, which is why it
  // is cheaper than another treatment plant.
  var waterDraw = demand * ((effects || ordinanceEffects([])).waterDemand)
  return {
    powerDemand: demand, powerCapacity: capacity.power,
    waterDemand: waterDraw, waterCapacity: capacity.water,
    power: demand === 0 ? 1 : clamp(capacity.power / demand, 0, 1),
    water: waterDraw === 0 ? 1 : clamp(capacity.water / waterDraw, 0, 1)
  }
}

function loadPercent(demand, capacity) {
  if (capacity <= 0) return demand > 0 ? 999 : 0
  return Math.round(demand / capacity * 100)
}

// --- history and the city log ---------------------------------------------
// The city has real tradeoffs now — funding against safety, tax against
// happiness, capacity against cost — but no instrument to judge them by. A
// snapshot cannot answer "did cutting fire funding cost me more than it
// saved". Both series are capped ring buffers: this all lives in the save
// file, which has a hard read cap (see packGrid), so history is deliberately
// bounded rather than allowed to grow forever.
var HISTORY_MAX = 72
var HISTORY_EVERY_TICKS = 5
var LOG_MAX = 24

function recordHistory(history, sample) {
  var next = (history || []).slice()
  next.push({
    m: Math.round(sample.minute), p: Math.round(sample.population),
    t: Math.round(sample.treasury), h: Math.round(sample.happiness),
    i: Math.round(sample.income), u: Math.round(sample.upkeep)
  })
  while (next.length > HISTORY_MAX) next.shift()
  return next
}

// Newest first, so "what happened while I was away" reads top-down and the
// cap drops the oldest entry rather than the most recent one.
function pushLogEntry(log, minute, kind, text) {
  var next = [{ m: Math.round(minute), kind: kind, text: text }].concat(log || [])
  while (next.length > LOG_MAX) next.pop()
  return next
}

function logSince(log, minute) {
  var out = []
  for (var i = 0; i < (log || []).length; i++) {
    if (log[i].m <= minute) break
    out.push(log[i])
  }
  return out
}

// Min/max across one history field, for scaling a sparkline. Returns a flat
// band around a constant series so a city that never changed still draws a
// sensible line instead of dividing by zero.
function historyRange(history, field) {
  if (!history || history.length === 0) return { min: 0, max: 1 }
  var min = history[0][field], max = history[0][field]
  for (var i = 1; i < history.length; i++) {
    if (history[i][field] < min) min = history[i][field]
    if (history[i][field] > max) max = history[i][field]
  }
  if (max - min < 1) { min = min - 1; max = max + 1 }
  return { min: min, max: max }
}

// History is by far the chattiest thing in the save: pretty-printed, each
// sample costs ~100 bytes of braces and indentation for six small integers.
// Packed as delimited text it costs about a quarter of that, which matters
// because overflowing the read cap destroys the city (see packGrid).
function packHistory(history) {
  var out = []
  for (var i = 0; i < (history || []).length; i++) {
    var h = history[i]
    out.push([h.m, h.p, h.t, h.h, h.i, h.u].join(","))
  }
  return out.join(";")
}

function unpackHistory(packed) {
  if (typeof packed !== "string" || packed === "") return []
  var rows = packed.split(";"), out = []
  for (var i = 0; i < rows.length; i++) {
    var f = rows[i].split(",")
    if (f.length !== 6) continue
    var sample = { m: +f[0], p: +f[1], t: +f[2], h: +f[3], i: +f[4], u: +f[5] }
    var ok = true
    for (var k in sample) if (!isFinite(sample[k])) ok = false
    if (ok) out.push(sample)
  }
  return out
}

var LOG_KIND_LABELS = {
  fire: "Fire", loss: "Destroyed", milestone: "Milestone",
  loan: "Borrowed", brownout: "Brownout", dilemma: "Decision", budget: "Budget",
  crime: "Crime", neighbor: "Highway",
  ordinance: "Policy", election: "Election", market: "Market"
}

// --- firefighting depth ---------------------------------------------------
// Containment used to be binary: inside a station's radius or not. Distance
// is what actually decides a response, so a blaze on a station's doorstep is
// now put out markedly faster than one at the far edge of the same radius —
// which makes *where* a station sits matter, not just how many there are.
function nearestPlantDistance(gridSize, plants, index) {
  var best = Infinity
  var x = index % gridSize, y = Math.floor(index / gridSize)
  for (var i = 0; i < plants.length; i++) {
    var px = plants[i].index % gridSize, py = Math.floor(plants[i].index / gridSize)
    var d = Math.max(Math.abs(px - x), Math.abs(py - y))
    if (d < best) best = d
  }
  return best
}

// Industry burns hotter than housing: more to catch, and it spreads further.
var FIRE_FUEL = { R: 1.0, C: 1.15, I: 1.45 }

function fireFuel(tile) {
  return FIRE_FUEL[tile.type] || 1
}

// Full containment speed at the station's doorstep, tapering to the base rate
// at the edge of its reach, and a token effort beyond it.
// A fire engine stuck in traffic is a fire engine that is not there yet.
// Congestion around an incident slows the response rather than cancelling it:
// even a gridlocked city still puts the fire out, it just takes longer, which
// with spreading fires is quite bad enough.
var RESPONSE_MIN_SCALE = 0.45

function responseScale(traffic, index) {
  var congestion = lotCongestion(traffic, index)
  if (congestion <= CONGESTION_WATCH) return 1
  var over = Math.min(1, (congestion - CONGESTION_WATCH) / (CONGESTION_JAM - CONGESTION_WATCH))
  return 1 - (1 - RESPONSE_MIN_SCALE) * over
}

function fireContainChance(gridSize, utilities, index, funding, traffic) {
  var radius = FIRE_RADIUS * fundingRadiusScale(fundingLevel(funding, "F"))
  var distance = nearestPlantDistance(gridSize, utilities.fire || [], index)
  if (!isFinite(distance) || distance > radius) return FIRE_CONTAIN_UNCOVERED
  var proximity = 1 - (distance / radius) * 0.55
  return FIRE_CONTAIN_COVERED * fundingLevel(funding, "F") * proximity
    * responseScale(traffic, index)
}

// --- crime waves ----------------------------------------------------------
// Crime was the same invisible dice roll fire used to be. It is now a visible
// wave sitting over a district: unlike fire it does not level buildings —
// fire destroys, crime degrades. While one runs it bleeds money, drags
// happiness down city-wide, and slowly drives residents out of the blocks it
// covers, until police suppress it.
var CRIME_CHANCE_BASE = 0.03
var CRIME_MAX_ACTIVE = 6
var CRIME_SUPPRESS_COVERED = 0.32
var CRIME_SUPPRESS_UNCOVERED = 0.045
var CRIME_RADIUS = 3
// Tuned against the densest block of a real save: one wave sitting on it
// costs ~13% of monthly income, so ignoring it is expensive without being
// ruinous — and a wave over sparse edge-of-town blocks barely registers,
// which is the intended difference.
var CRIME_THEFT_PER_LEVEL = 1.2
var CRIME_HAPPINESS_HIT = 5
var CRIME_DECAY_CHANCE = 0.05

function crimeSurvey(grid, gridSize, utilities, funding) {
  var radius = POLICE_RADIUS * fundingRadiusScale(fundingLevel(funding, "S"))
  var policed = [], unpoliced = []
  for (var i = 0; i < grid.length; i++) {
    var tile = parseTile(grid[i])
    if (!isBurnable(tile)) continue
    if (isCovered(gridSize, utilities.police, i, radius)) policed.push(i)
    else unpoliced.push(i)
  }
  return { policed: policed, unpoliced: unpoliced, built: policed.length + unpoliced.length }
}

function crimeStartChance(survey, effects) {
  if (survey.built === 0) return 0
  return CRIME_CHANCE_BASE * (0.2 + 0.8 * (survey.unpoliced.length / survey.built))
    * ((effects || ordinanceEffects([])).crimeChance)
}

function rollCrimeStart(grid, gridSize, crimes, utilities, funding, effects) {
  if (crimes.length >= CRIME_MAX_ACTIVE) return -1
  var survey = crimeSurvey(grid, gridSize, utilities, funding)
  if (Math.random() >= crimeStartChance(survey, effects)) return -1
  var pool = survey.unpoliced.length > 0
    && (survey.policed.length === 0 || Math.random() < 0.85) ? survey.unpoliced : survey.policed
  if (pool.length === 0) return -1
  for (var attempt = 0; attempt < 6; attempt++) {
    var candidate = pool[Math.floor(Math.random() * pool.length)]
    var clash = false
    for (var i = 0; i < crimes.length; i++)
      if (withinRadius(gridSize, crimes[i].index, candidate, CRIME_RADIUS * 2)) clash = true
    if (!clash) return candidate
  }
  return -1
}

// What a wave costs the city this month: proportional to the value sitting
// inside it, so crime in a dense downtown hurts more than crime on the edge.
function crimeTheft(grid, gridSize, crimes) {
  var total = 0
  for (var c = 0; c < (crimes || []).length; c++) {
    for (var i = 0; i < grid.length; i++) {
      if (!withinRadius(gridSize, crimes[c].index, i, CRIME_RADIUS)) continue
      var tile = parseTile(grid[i])
      if (isBurnable(tile)) total += tile.level * CRIME_THEFT_PER_LEVEL
    }
  }
  return total
}

function advanceCrime(grid, gridSize, crimes, utilities, funding, effects, traffic) {
  var policy = effects || ordinanceEffects([])
  var next = grid.slice()
  var stillRunning = [], suppressed = 0, drivenOut = 0
  var radius = POLICE_RADIUS * fundingRadiusScale(fundingLevel(funding, "S"))
  var level = fundingLevel(funding, "S")

  for (var c = 0; c < crimes.length; c++) {
    var wave = crimes[c]
    var covered = isCovered(gridSize, utilities.police, wave.index, radius)
    var suppressChance = (covered ? CRIME_SUPPRESS_COVERED * level : CRIME_SUPPRESS_UNCOVERED)
      * policy.crimeSuppress * responseScale(traffic, wave.index)
    if (Math.random() < suppressChance) { suppressed++; continue }

    // Residents give up on a block long before a building falls down.
    for (var i = 0; i < next.length; i++) {
      if (!withinRadius(gridSize, wave.index, i, CRIME_RADIUS)) continue
      var tile = parseTile(next[i])
      // Stops at level 1: crime thins a block out, it does not clear the lot.
      // Emptying a tile is fire's job, and keeping that line sharp is what
      // makes the two disasters feel like different problems.
      if (tile.type !== TILE_RES || tile.level <= 1) continue
      if (Math.random() < CRIME_DECAY_CHANCE) {
        next[i] = makeTile(tile.type, tile.level - 1)
        drivenOut++
      }
    }
    stillRunning.push({ index: wave.index, ticks: (wave.ticks || 0) + 1 })
  }

  return { grid: next, crimes: stillRunning, suppressed: suppressed, drivenOut: drivenOut }
}

// --- neighbouring cities --------------------------------------------------
// Four highway stubs, one per map edge, each belonging to a neighbouring
// town. Run a road out to one and the connection opens: people and trade
// start arriving from outside, which is the only source of growth that does
// not come from the player's own zoning. On a 64x64 grid with the city
// starting in the middle, reaching an edge is a genuine investment of road
// (and road upkeep), which is what makes it a decision rather than a freebie.
var NEIGHBOR_NAMES = [
  "Ashford", "Bellhaven", "Crestwood", "Dunmore", "Eastvale", "Fairbrook",
  "Glenmoor", "Harrowfield", "Ironvale", "Kestrel Bay", "Larkspur", "Marchmont",
  "Northgate", "Oakhurst", "Pinecrest", "Quarry Hill", "Ravenswood", "Stonefall",
  "Thornbury", "Westmere", "Yarrow", "Aldermill", "Brightwater", "Copperfield"
]
var NEIGHBOR_EDGES = ["north", "east", "south", "west"]
// Bounded so four connections are a strong tailwind, never a substitute for
// actually running the city.
var NEIGHBOR_MIGRATION_BONUS = 0.18
var NEIGHBOR_COMMERCE_BONUS = 0.12
var NEIGHBOR_TRADE_BONUS = 0.05

// Where on its edge a connector sits. Offset from centre by a stable amount
// derived from the city's own seed, so every city's highways sit differently
// but never move once founded.
function neighborConnectorIndex(gridSize, edge, seed) {
  var spread = Math.floor(gridSize * 0.3)
  var offset = spread === 0 ? 0 : (seed % (spread * 2 + 1)) - spread
  var mid = clamp(Math.floor(gridSize / 2) + offset, 1, gridSize - 2)
  if (edge === "north") return mid
  if (edge === "south") return (gridSize - 1) * gridSize + mid
  if (edge === "west") return mid * gridSize
  return mid * gridSize + (gridSize - 1)
}

// A small deterministic generator (MINSTD). Multiplying the seed by a large
// constant inline would overflow past 2^53 and make the modulo meaningless —
// which it did: four edges kept drawing duplicate names and only two thirds
// of the pool was ever reachable. The first few draws are discarded because
// consecutive seeds otherwise start with near-identical values.
function neighborRandom(seed) {
  var state = Math.abs(Math.floor(seed)) % 2147483647
  if (state === 0) state = 1
  function next() {
    state = (state * 48271) % 2147483647
    return state / 2147483647
  }
  next(); next(); next()
  return next
}

function makeNeighbors(gridSize, seed) {
  var random = neighborRandom(seed)
  // Drawn without replacement, so no two neighbours share a name.
  var pool = NEIGHBOR_NAMES.slice()
  var out = []
  for (var i = 0; i < NEIGHBOR_EDGES.length; i++) {
    var pick = Math.floor(random() * pool.length)
    out.push({
      edge: NEIGHBOR_EDGES[i],
      name: pool.splice(pick, 1)[0],
      index: neighborConnectorIndex(gridSize, NEIGHBOR_EDGES[i],
        Math.floor(random() * 100000))
    })
  }
  return out
}

// Roads that actually reach the city, flood-filled from every road serving a
// built zone. A lone road out at the map edge is not "connected" to anything,
// so a connector only counts once there is a continuous route home.
function cityRoadNetwork(grid, gridSize) {
  var reached = new Array(grid.length)
  var queue = []
  for (var i = 0; i < grid.length; i++) {
    var tile = parseTile(grid[i])
    if ("RCI".indexOf(tile.type) < 0 || tile.level < 1) continue
    var roads = roadAccessIndices(grid, gridSize, i)
    for (var n = 0; n < roads.length; n++) {
      var road = roads[n]
      if (!reached[road]) { reached[road] = true; queue.push(road) }
    }
  }
  while (queue.length > 0) {
    var current = queue.pop()
    var around = neighborIndices(gridSize, current)
    for (var a = 0; a < around.length; a++) {
      var next = around[a]
      if (reached[next]) continue
      if (parseTile(grid[next]).type !== TILE_ROAD) continue
      reached[next] = true
      queue.push(next)
    }
  }
  return reached
}

function connectedNeighbors(grid, gridSize, neighbors) {
  var network = cityRoadNetwork(grid, gridSize)
  var out = []
  for (var i = 0; i < (neighbors || []).length; i++)
    if (network[neighbors[i].index]) out.push(neighbors[i])
  return out
}

function neighborBonus(connectedCount) {
  var n = Math.max(0, connectedCount || 0)
  return {
    migration: 1 + NEIGHBOR_MIGRATION_BONUS * n,
    commerce: 1 + NEIGHBOR_COMMERCE_BONUS * n,
    trade: 1 + NEIGHBOR_TRADE_BONUS * n
  }
}

// --- ordinances -----------------------------------------------------------
// Standing city-wide policies. Each one is a permanent cost with a real
// tradeoff attached, so the interesting ones are never free wins — a curfew
// buys quiet at the price of a city that resents it. Costs are per resident
// like department funding, which keeps a policy meaningful at every size
// instead of becoming rounding error once the city is big.
var ORDINANCES = [
  { id: "smoke", name: "Smoke detector code", rate: 1.0,
    blurb: "Fires start less often.", effects: { fireChance: 0.65 } },
  { id: "watch", name: "Neighbourhood watch", rate: 0.9,
    blurb: "Fewer crime waves, and people like being asked to help.",
    effects: { crimeChance: 0.7, happiness: 1 } },
  { id: "curfew", name: "Night curfew", rate: 1.6,
    blurb: "Police shut crime down far faster. Nobody enjoys living under it.",
    effects: { crimeSuppress: 1.6, crimeChance: 0.75, happiness: -6 } },
  { id: "recycling", name: "Recycling programme", rate: 2.0,
    blurb: "Cleaner streets, and industry is a worse neighbour than it was.",
    effects: { happiness: 4, industrialNuisance: 0.7 } },
  { id: "conservation", name: "Water conservation", rate: 0.8,
    blurb: "Cuts water draw by a fifth — cheaper than another treatment plant.",
    effects: { waterDemand: 0.8, happiness: -2 } },
  { id: "tourism", name: "Tourism campaign", rate: 2.3,
    blurb: "Visitors lift commerce. They also bring opportunists.",
    effects: { commercialDemand: 1.25, crimeChance: 1.35 } },
  { id: "homestead", name: "Homestead grant", rate: 2.7,
    blurb: "Helps people buy in. Housing demand rises.",
    effects: { residentialDemand: 1.3 } },
  { id: "subsidy", name: "Industrial subsidy", rate: 2.2,
    blurb: "Factories expand faster. The air is worse for it.",
    effects: { industrialDemand: 1.35, happiness: -4 } },
  { id: "carpool", name: "Carpool incentive", rate: 1.1,
    blurb: "Fewer cars for the same journeys. Nobody loves sharing a ride.",
    effects: { tripRate: 0.88, happiness: -1 } },
  { id: "telecommute", name: "Telecommuting grant", rate: 2.4,
    blurb: "Many of the trips simply stop happening. The shops notice.",
    effects: { tripRate: 0.8, commercialDemand: 0.93 } },
  { id: "tolls", name: "Road tolls", rate: -2.0,
    blurb: "Pays the city and thins the traffic. Drivers will not forgive it.",
    effects: { tripRate: 0.9, happiness: -6 } },
  { id: "gambling", name: "Legalised gambling", rate: -3.2,
    blurb: "Pays for itself several times over. Brings the trouble you'd expect.",
    effects: { crimeChance: 1.5, happiness: -3 } }
]

function ordinance(id) {
  for (var i = 0; i < ORDINANCES.length; i++) if (ORDINANCES[i].id === id) return ORDINANCES[i]
  return null
}

// Negative rates (gambling) are revenue, so this can come out below zero —
// which is the point of putting it in the same line as every other policy.
function ordinanceCost(active, population) {
  var total = 0
  for (var i = 0; i < (active || []).length; i++) {
    var o = ordinance(active[i])
    if (o) total += o.rate * (population / 100)
  }
  return total
}

// One bundle of modifiers for everything the policies touch, so callers apply
// them without knowing which ordinance produced what.
function ordinanceEffects(active) {
  var out = {
    happiness: 0, fireChance: 1, crimeChance: 1, crimeSuppress: 1,
    waterDemand: 1, residentialDemand: 1, commercialDemand: 1,
    industrialDemand: 1, industrialNuisance: 1, tripRate: 1
  }
  for (var i = 0; i < (active || []).length; i++) {
    var o = ordinance(active[i])
    if (!o) continue
    for (var key in o.effects) {
      if (key === "happiness") out.happiness += o.effects[key]
      else out[key] *= o.effects[key]
    }
  }
  return out
}

// --- elections ------------------------------------------------------------
// Every four years the city decides whether to keep you. Approval is a
// summary judgement rather than raw happiness: it is what the city has
// actually been like to live in — how content, how safe, how solvent, how
// well served. Losing does not delete the city; it puts you out of office for
// a year, which is a real sting in a game you leave running without deleting
// the thing the player spent hours building.
var ELECTION_INTERVAL_TICKS = 48
var ELECTION_THRESHOLD = 50
var TERM_OUT_TICKS = 12

function computeApproval(happiness, coverage, fires, crimes, netIncome, population) {
  var approval = happiness
  // Being unable to pay for the city reads as mismanagement.
  if (netIncome < 0) approval -= Math.min(18, Math.abs(netIncome) / 12)
  // Anything actively on fire or being robbed dominates the mood.
  approval -= (fires || 0) * 6
  approval -= (crimes || 0) * 8
  // Unserved residents, weighted across every service the city offers.
  if (population > 0) {
    var unmet = 0, counted = 0
    for (var i = 0; i < (coverage || []).length; i++) {
      if (coverage[i].optional) continue
      counted++
      unmet += (coverage[i].unmet || 0) / Math.max(1, coverage[i].residents || 1)
    }
    if (counted > 0) approval -= (unmet / counted) * 25
  }
  return Math.round(clamp(approval, 0, 100))
}

function nextElectionTick(ageMinutes, lastElectionTick) {
  var last = lastElectionTick || 0
  if (last > 0) return last + ELECTION_INTERVAL_TICKS
  return FIRST_ELECTION_TICKS
}

// A founding mayor gets a longer first term. Services cost money a new city
// does not have, so judging a six-month-old town by the same bar as an
// established one is judging it on how fast it could spend, not how well it
// was run.
var FIRST_ELECTION_TICKS = 72
// Voters give a founding administration the benefit of the doubt. A six-month
// old town cannot have parks, full service coverage or a surplus, so holding
// it to the same bar as an established city judges how fast it could spend
// rather than how well it was run.
var FIRST_ELECTION_THRESHOLD = 35

function electionInterval(lastElectionTick) {
  return (lastElectionTick || 0) > 0 ? ELECTION_INTERVAL_TICKS : FIRST_ELECTION_TICKS
}

function electionThreshold(lastElectionTick) {
  return (lastElectionTick || 0) > 0 ? ELECTION_THRESHOLD : FIRST_ELECTION_THRESHOLD
}

function electionDue(ageMinutes, lastElectionTick) {
  return ageMinutes - (lastElectionTick || 0) >= electionInterval(lastElectionTick)
}

// --- the long goal --------------------------------------------------------
// Borrowed from LinCity-NG, which is won either by evacuating everyone by
// rocket or by reaching a sustainable economy. The second idea suits an idle
// game far better than a score does: it is a *state you hold*, not a number
// you climb, so the game has a destination without ever demanding a session.
//
// Every criterion below is derived from figures the tick already computes.
// Nothing here simulates anything new — it only asks whether the city is
// currently being run well, and for how long it has been true.
var SUSTAINABLE_MIN_POP = 2000
var SUSTAINABLE_MIN_HAPPINESS = 70
var SUSTAINABLE_MAX_JAMMED = 0.05
var SUSTAINABLE_HOLD_TICKS = 24

function sustainability(ctx) {
  var rows = []
  function row(key, label, met, detail) {
    rows.push({ key: key, label: label, met: !!met, detail: detail })
  }

  var stats = ctx.stats || {}
  var surplus = (ctx.income || 0) - (ctx.upkeep || 0)
  row("solvent", "Budget in surplus", surplus > 0,
    (surplus >= 0 ? "+" : "−") + "$" + Math.abs(Math.round(surplus)) + " a month")

  var pop = stats.population || 0
  row("grown", "A real city", pop >= SUSTAINABLE_MIN_POP,
    pop + " of " + SUSTAINABLE_MIN_POP + " residents")

  // Optional services (transit) are excluded deliberately: a city is not
  // failing anyone by not running buses, and demanding it would make the
  // goal about spending rather than about being run well.
  var unmet = 0, worst = ""
  var coverage = ctx.coverage || []
  for (var i = 0; i < coverage.length; i++) {
    if (coverage[i].optional) continue
    if ((coverage[i].unmet || 0) > 0) { unmet++; if (!worst) worst = coverage[i].name }
  }
  row("served", "Every service reaches everyone", unmet === 0,
    unmet === 0 ? "all covered" : unmet + " short, worst: " + worst)

  var jammed = jammedLotShare(ctx.traffic)
  row("moving", "Traffic flowing", jammed <= SUSTAINABLE_MAX_JAMMED,
    Math.round(jammed * 100) + "% of lots gridlocked, needs " 
      + Math.round(SUSTAINABLE_MAX_JAMMED * 100) + "% or less")

  var happiness = ctx.happiness || 0
  row("content", "Residents content", happiness >= SUSTAINABLE_MIN_HAPPINESS,
    happiness + "% happy, needs " + SUSTAINABLE_MIN_HAPPINESS + "%")

  // A city living on borrowed money is not sustaining itself by definition.
  var debt = totalLoanDebt(ctx.loans || [])
  row("unencumbered", "Free of debt", debt <= 0,
    debt > 0 ? "$" + Math.round(debt) + " outstanding" : "no loans")

  return rows
}

function sustainabilityMet(rows) {
  for (var i = 0; i < rows.length; i++) if (!rows[i].met) return false
  return rows.length > 0
}

function sustainabilityProgress(rows) {
  var met = 0
  for (var i = 0; i < rows.length; i++) if (rows[i].met) met++
  return { met: met, total: rows.length }
}

// Held ticks only accumulate while every criterion is true, and reset the
// moment one lapses — the goal is running the city well, not touching the
// state once.
function advanceSustainability(rows, heldTicks) {
  return sustainabilityMet(rows) ? Math.max(0, heldTicks || 0) + 1 : 0
}

// --- civic level ----------------------------------------------------------
// LinCity-NG's sharpest idea: schools consume resources to sustain a tech
// level, that level unlocks buildings, and it *falls* if the schools are
// starved. Every unlock in Omaville was gated on population, which only ever
// rises — so progress here was a one-way ratchet with nothing at stake.
//
// A civic level is earned the same way: it climbs while education actually
// reaches people and is paid for, and it slides back when either lapses. It
// gates what you may *build* — never what already stands, because retroactively
// condemning a player's finished buildings would be a punishment, not a
// mechanic.
var CIVIC_MIN = 1
var CIVIC_MAX = 3
// What each school tier can sustain at full reach and funding. Deliberately
// matched to the school ladder: an elementary system supports tier 2, and only
// a university system supports tier 3.
var CIVIC_LADDER = [2.0, 2.6, 3.0]
// Per tick, so a city climbs 1 -> 3 in roughly 25 months of steady schooling
// and loses it just as slowly. Slow enough that it reads as a trend rather
// than a switch, fast enough to matter inside one session.
var CIVIC_RATE = 0.08

function bestSchoolTier(utilities) {
  var schools = (utilities && utilities.schools) || []
  var best = -1
  for (var i = 0; i < schools.length; i++) if (schools[i].level > best) best = schools[i].level
  return best
}

// Where the civic level is heading, given how good the schooling currently is.
function civicTarget(coverage, funding, utilities) {
  var best = bestSchoolTier(utilities)
  if (best < 0) return CIVIC_MIN
  var row = coverageRow(coverage || [], "schools")
  var reach = clamp((row.coverage || 0) / 100, 0, 1)
  var money = fundingLevel(funding, "N")
  var effective = clamp(reach * money, 0, 1)
  var ceiling = CIVIC_LADDER[clamp(best, 0, CIVIC_LADDER.length - 1)]
  return clamp(CIVIC_MIN + (ceiling - CIVIC_MIN) * effective, CIVIC_MIN, CIVIC_MAX)
}

// Moves toward the target at a bounded rate in both directions — the point is
// that it can be lost, so decay is not made gentler than growth.
function advanceCivic(current, target) {
  var from = clamp(typeof current === "number" && isFinite(current) ? current : CIVIC_MIN,
    CIVIC_MIN, CIVIC_MAX)
  var to = clamp(target, CIVIC_MIN, CIVIC_MAX)
  if (to > from) return Math.min(to, from + CIVIC_RATE)
  if (to < from) return Math.max(to, from - CIVIC_RATE)
  return from
}

// Tier index 0/1/2 needs civic level 1/2/3, with a small tolerance: a city at
// 99% education coverage sits at 2.98, and locking a whole building tier over
// a rounding gap would read as a bug rather than a rule. Wide enough to
// forgive the last percent, far too narrow to forgive letting schools slide.
var CIVIC_TOLERANCE = 0.05

function civicAllowsTier(civic, level) {
  var have = typeof civic === "number" && isFinite(civic) ? civic : CIVIC_MAX
  return have >= level + 1 - CIVIC_TOLERANCE
}

// The highest tier the city has actually finished building. Used only when
// migrating a save from before civic level existed: whatever is already
// standing proves the city could once support it, so it starts there and is
// left to drift rather than being retroactively demoted on load.
function highestBuiltTier(grid) {
  var best = 0
  for (var i = 0; i < grid.length; i++) {
    var tile = parseTile(grid[i])
    if (UPGRADE_COSTS[tile.type] && tile.level > best) best = tile.level
  }
  return best
}

function civicLabel(civic) {
  var n = Math.floor(clamp(civic || CIVIC_MIN, CIVIC_MIN, CIVIC_MAX))
  return ["", "Township", "Educated city", "University city"][n] || "Township"
}

// --- names ----------------------------------------------------------------
// One sanitiser for every name the player types, so the new-city dialog and
// the rename fields cannot disagree about what is acceptable and then reject
// something the other just allowed.
var NAME_MAX = 40

function sanitizeName(value) {
  if (value === null || value === undefined) return ""
  return String(value)
    .replace(/[\x00-\x1f\x7f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, NAME_MAX)
}

function validName(value) {
  return sanitizeName(value).length > 0
}

// "Mayor Robinson" for messages the city addresses to the player. Kept here
// rather than interpolated at each call site so the honorific stays consistent
// and a blank name degrades to something sensible instead of "Mayor ".
function mayorTitle(name) {
  var clean = sanitizeName(name)
  return clean.length === 0 ? "Mayor" : "Mayor " + clean
}

// --- the market -----------------------------------------------------------
// Somewhere for a mature city's surplus to go that is a genuine trade-off
// rather than a money sink. Cash put into the market leaves the treasury, so
// it is not there when a fire needs a station or the water grid needs another
// plant — and if the city cannot pay its bills it is sold out from under you
// at a distress price. The gamble has to be able to hurt or it is just a
// slower way of getting richer.
//
// Prices are DERIVED from (seed, tick), never accumulated and never stored.
// Three things follow, all of them deliberate:
//   - the save stays bounded, which is a hard constraint here (see packGrid),
//   - reloading cannot reroll the market to dodge a loss,
//   - and pricing is O(1) rather than O(ticks), so a year-200 city does not
//     replay two hundred ticks of random walk on every repaint.
// The shape comes from three overlapping cycles rather than a true random
// walk, which also means prices oscillate instead of drifting to zero or to
// the moon over a long idle game.
var MARKET_TRADE_WEIGHT = 0.30
var MARKET_COMMISSION = 0.01
// What the city loses per unit when the market is liquidated to pay the bills.
var MARKET_DISTRESS = 0.15
var MARKET_MIN_PRICE = 0.15
// How volatile a town can be, picked per town from its own index so each one
// has a fixed character for the life of the city rather than a random mood.
var MARKET_TEMPERAMENTS = [
  { key: "steady", label: "Steady", amps: [0.05, 0.03, 0.02], noise: 0.010 },
  { key: "mixed", label: "Mixed", amps: [0.14, 0.08, 0.05], noise: 0.028 },
  { key: "volatile", label: "Volatile", amps: [0.30, 0.17, 0.11], noise: 0.065 }
]

// Deterministic 0..1 from any pair, mixed hard enough that neighbouring ticks
// do not produce neighbouring values (the bug that made an earlier seeded
// system emit forty near-identical "random" draws).
function marketHash(a, b) {
  var h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b)
  h = Math.imul(h ^ (b | 0) ^ (h >>> 13), 0xc2b2ae35)
  h = (h ^ (h >>> 16)) >>> 0
  return h / 4294967296
}

// A town's fixed character, from its own connector index so it never changes.
function townTemperament(neighbor) {
  var pick = Math.floor(marketHash(neighbor.index, 7919) * MARKET_TEMPERAMENTS.length)
  return MARKET_TEMPERAMENTS[clamp(pick, 0, MARKET_TEMPERAMENTS.length - 1)]
}

// Once a highway is open you are trading with the place, so its fortunes ride
// partly on yours. That is the whole tension: a connected town is the safer
// bet *and* the one that falls with you, while an unconnected town is pure
// nerve and uncorrelated with everything you control.
function townTradeFactor(connected, stats) {
  if (!connected || !stats) return 1
  var trade = (stats.jobsCommercial || 0) + (stats.population || 0) * 0.25
  return 1 + MARKET_TRADE_WEIGHT * (clamp(trade / 2600, 0, 2) - 1)
}

function townPrice(neighbor, tick, stats, connected) {
  if (!neighbor) return 0
  var temper = townTemperament(neighbor)
  var t = Math.max(0, tick || 0)
  var periods = [67 + (neighbor.index % 29), 31 + (neighbor.index % 13), 11 + (neighbor.index % 7)]
  var wave = 1
  for (var i = 0; i < temper.amps.length; i++) {
    var phase = marketHash(neighbor.index, i * 977) * Math.PI * 2
    wave += temper.amps[i] * Math.sin(2 * Math.PI * t / periods[i] + phase)
  }
  var jitter = (marketHash(neighbor.index + t, periods[0]) - 0.5) * 2 * temper.noise
  return Math.max(MARKET_MIN_PRICE, wave * (1 + jitter) * townTradeFactor(connected, stats))
}

// Every town priced at once, with what the city holds of each. connectedNames
// is the list the service already derives from the grid for highway bonuses,
// so a share price and a trade bonus can never disagree about who is linked.
function marketQuotes(neighbors, connectedNames, tick, stats, holdings) {
  var out = []
  var linked = connectedNames || []
  for (var i = 0; i < (neighbors || []).length; i++) {
    var n = neighbors[i]
    var connected = linked.indexOf(n.name) >= 0
    var price = townPrice(n, tick, stats, connected)
    var held = (holdings && holdings[n.name]) || { units: 0, cost: 0 }
    var units = Math.max(0, held.units || 0)
    var value = units * price
    out.push({
      id: n.name, name: n.name, edge: n.edge, connected: connected,
      temperament: townTemperament(n).label,
      price: price,
      // Last tick's price, so the panel can show a direction without keeping
      // any history of its own.
      previous: townPrice(n, Math.max(0, tick - 1), stats, connected),
      units: units, cost: held.cost || 0, value: value,
      gain: value - (held.cost || 0)
    })
  }
  return out
}

function portfolioValue(neighbors, connectedNames, tick, stats, holdings) {
  var quotes = marketQuotes(neighbors, connectedNames, tick, stats, holdings)
  var total = 0
  for (var i = 0; i < quotes.length; i++) total += quotes[i].value
  return total
}

function portfolioCost(holdings) {
  var total = 0
  for (var key in (holdings || {})) total += (holdings[key] || {}).cost || 0
  return total
}

// Buying and selling are pure: they take holdings and return new holdings plus
// the cash delta, so the service never has to reason about partial updates.
function buyUnits(holdings, id, price, spend) {
  if (!id || !(price > 0) || !(spend > 0)) return null
  var fee = spend * MARKET_COMMISSION
  var units = (spend - fee) / price
  if (!(units > 0)) return null
  var next = {}
  for (var key in (holdings || {})) next[key] = { units: holdings[key].units, cost: holdings[key].cost }
  var held = next[id] || { units: 0, cost: 0 }
  next[id] = { units: held.units + units, cost: held.cost + spend }
  return { holdings: next, cash: -spend, units: units }
}

// fraction 0..1 of the position. Cost basis is reduced proportionally so the
// remaining holding still reports an honest gain.
function sellUnits(holdings, id, price, fraction) {
  var held = (holdings || {})[id]
  if (!held || !(held.units > 0) || !(price > 0)) return null
  var share = clamp(fraction === undefined ? 1 : fraction, 0, 1)
  var units = held.units * share
  if (!(units > 0)) return null
  var gross = units * price
  var proceeds = gross - gross * MARKET_COMMISSION
  var next = {}
  for (var key in holdings) next[key] = { units: holdings[key].units, cost: holdings[key].cost }
  var remaining = held.units - units
  if (remaining <= 1e-9) delete next[id]
  else next[id] = { units: remaining, cost: held.cost * (1 - share) }
  return { holdings: next, cash: proceeds, units: units }
}

// The teeth. When the city cannot pay its bills, the market is sold to cover
// the gap at a discount — so an over-committed mayor does not merely miss an
// opportunity, they crystallise a loss at the worst possible moment.
function liquidateFor(holdings, neighbors, connectedNames, tick, stats, needed) {
  var quotes = marketQuotes(neighbors, connectedNames, tick, stats, holdings)
  quotes.sort(function(a, b) { return b.value - a.value })
  var next = holdings, raised = 0, sold = []
  for (var i = 0; i < quotes.length && raised < needed; i++) {
    var q = quotes[i]
    if (q.units <= 0) continue
    var distressPrice = q.price * (1 - MARKET_DISTRESS)
    var stillNeed = needed - raised
    var fraction = clamp(stillNeed / Math.max(1e-9, q.units * distressPrice), 0, 1)
    var result = sellUnits(next, q.id, distressPrice, fraction)
    if (!result) continue
    next = result.holdings
    raised += result.cash
    sold.push(q.name)
  }
  return { holdings: next, raised: raised, sold: sold }
}
