.pragma library

// Cosmetic traffic only. Units are road tiles and seconds, independent of zoom.
var lane = 0.20
var gap = 0.48

function isRoad(data, index) { return !!data[index] && data[index][0] === "#" }

// Spawn-local classification: buses keep their identity throughout a trip.
function nearService(data, size, index, type) {
  var x = index % size, y = Math.floor(index / size)
  for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
    if (dx * dx + dy * dy > 16 || x + dx < 0 || x + dx >= size || y + dy < 0 || y + dy >= size) continue
    var tile = data[(y + dy) * size + x + dx]
    if (tile && tile[0] === type) return true
  }
  return false
}

function nearSchool(data, size, index) { return nearService(data, size, index, "N") }

function emergencyActive(car) {
  // A fire truck runs hot for as long as anything is actually burning —
  // cruisers and ambulances only blink on their own routine dispatch cycle.
  if (car.fireTruck) return !!car.scrambled
  return !!(car.police || car.ambulance) && ((car.age + (car.dispatchOffset || 0)) % 32) < 10
}

function lightPulse(car) {
  if (!emergencyActive(car)) return { red: 0, blue: 0 }
  var phase = ((car.age + (car.dispatchOffset || 0)) * 2) % 1
  return { red: phase < 0.5 ? 0.9 : 0.08, blue: phase >= 0.5 ? 0.9 : 0.08 }
}

function neighbors(data, size, index) {
  var x = index % size, y = Math.floor(index / size), out = []
  if (x > 0 && isRoad(data, index - 1)) out.push(index - 1)
  if (x < size - 1 && isRoad(data, index + 1)) out.push(index + 1)
  if (y > 0 && isRoad(data, index - size)) out.push(index - size)
  if (y < size - 1 && isRoad(data, index + size)) out.push(index + size)
  return out
}

function roadTiles(data, size) {
  var out = []
  for (var i = 0; i < data.length; i++)
    if (isRoad(data, i) && neighbors(data, size, i).length > 0) out.push(i)
  return out
}

function direction(size, from, to) {
  return { x: to % size - from % size, y: Math.floor(to / size) - Math.floor(from / size) }
}

function pickNext(data, size, tile, prev) {
  var choices = neighbors(data, size, tile).filter(function(n) { return n !== prev })
  if (!choices.length) return isRoad(data, prev) ? prev : -1
  // Drivers usually continue along a street rather than turn at every junction.
  var incoming = direction(size, prev, tile)
  for (var i = 0; i < choices.length; i++) {
    var outgoing = direction(size, tile, choices[i])
    if (outgoing.x === incoming.x && outgoing.y === incoming.y && Math.random() < 0.72)
      return choices[i]
  }
  return choices[Math.floor(Math.random() * choices.length)]
}

function bezier(path, t) {
  var u = 1 - t, a = path.a, b = path.b, c = path.c, d = path.d
  var dx = 3 * u * u * (b.x - a.x) + 6 * u * t * (c.x - b.x) + 3 * t * t * (d.x - c.x)
  var dy = 3 * u * u * (b.y - a.y) + 6 * u * t * (c.y - b.y) + 3 * t * t * (d.y - c.y)
  return { x: u*u*u*a.x + 3*u*u*t*b.x + 3*u*t*t*c.x + t*t*t*d.x,
    y: u*u*u*a.y + 3*u*u*t*b.y + 3*u*t*t*c.y + t*t*t*d.y,
    angle: Math.atan2(dy, dx) }
}

function makePath(size, tile, prev, next) {
  var incoming = direction(size, prev, tile), outgoing = direction(size, tile, next)
  var a = { x: -incoming.x * 0.5 - incoming.y * lane, y: -incoming.y * 0.5 + incoming.x * lane }
  var d = { x: outgoing.x * 0.5 - outgoing.y * lane, y: outgoing.y * 0.5 + outgoing.x * lane }
  var dot = incoming.x * outgoing.x + incoming.y * outgoing.y
  var cross = incoming.x * outgoing.y - incoming.y * outgoing.x
  // Quarter-circle control points: tighter right turns, broader left turns.
  // Dead ends use a continuous hairpin contained entirely inside their tile.
  var control = dot === 1 ? 1/3 : dot === -1 ? 0.86 : 0.55228475 * (0.5 - cross * lane)
  var path = { a: a, b: { x: a.x + incoming.x * control, y: a.y + incoming.y * control },
    c: { x: d.x - outgoing.x * control, y: d.y - outgoing.y * control }, d: d,
    turning: dot !== 1, uturn: dot === -1, lengths: [0], length: 0 }
  var last = bezier(path, 0)
  for (var i = 1; i <= 24; i++) {
    var point = bezier(path, i / 24)
    path.length += Math.hypot(point.x - last.x, point.y - last.y)
    path.lengths.push(path.length)
    last = point
  }
  return path
}

function pose(car, size) {
  // Arc-length lookup prevents the cubic parameter from speeding cars up mid-turn.
  var lengths = car.path.lengths, distance = Math.max(0, Math.min(car.path.length, car.distance))
  var i = 1
  while (i < lengths.length - 1 && lengths[i] < distance) i++
  var fraction = (distance - lengths[i-1]) / Math.max(0.00001, lengths[i] - lengths[i-1])
  var p = bezier(car.path, (i - 1 + fraction) / (lengths.length - 1))
  p.x += car.tile % size + 0.5
  p.y += Math.floor(car.tile / size) + 0.5
  return p
}

function spawn(data, size, roads, pool, colors) {
  for (var attempt = 0; attempt < 40 && roads.length; attempt++) {
    var tile = roads[Math.floor(Math.random() * roads.length)]
    var ns = neighbors(data, size, tile)
    if (!ns.length || ns.length > 2) continue // Never materialize inside a junction.
    var prev = ns[Math.floor(Math.random() * ns.length)], next = pickNext(data, size, tile, prev)
    if (next < 0) continue
    var car = { tile: tile, prev: prev, next: next, path: makePath(size, tile, prev, next),
      distance: 0, speed: 0, cruise: 0.55 + Math.random() * 0.22,
      color: colors[Math.floor(Math.random() * colors.length)], age: 0, braking: false }
    car.distance = Math.random() * car.path.length
    car.schoolBus = nearSchool(data, size, tile) && Math.random() < 0.3
    if (car.schoolBus) { car.color = "#efbd38"; car.cruise *= 0.86 }
    car.police = !car.schoolBus && nearService(data, size, tile, "S") && Math.random() < 0.28
    if (car.police) {
      car.color = "#e5e8e5"
      car.dispatchOffset = Math.random() * 32
    }
    car.ambulance = !car.schoolBus && !car.police && nearService(data, size, tile, "H") && Math.random() < 0.28
    if (car.ambulance) {
      car.color = "#f1eee2"
      car.dispatchOffset = Math.random() * 32
    }
    car.fireTruck = !car.schoolBus && !car.police && !car.ambulance
      && nearService(data, size, tile, "F") && Math.random() < 0.3
    if (car.fireTruck) {
      car.color = "#c8352a"
      car.cruise *= 0.92
    }
    var p = pose(car, size), clear = true
    for (var i = 0; i < pool.length; i++) {
      var other = pose(pool[i], size)
      if (Math.hypot(p.x - other.x, p.y - other.y) < 0.65) { clear = false; break }
    }
    if (clear) return car
  }
  return null
}

function update(cars, dtMs, data, size, count, roads, colors, burning) {
  var dt = Math.max(0, Math.min(60, dtMs)) / 1000
  var hasPolice = data.some(function(tile) { return tile && tile[0] === "S" })
  var hasMedical = data.some(function(tile) { return tile && tile[0] === "H" })
  var hasFire = data.some(function(tile) { return tile && tile[0] === "F" })
  // Removed roads invalidate a route immediately, including its entry and exit.
  var pool = cars.filter(function(car) {
    return (!car.police || hasPolice) && (!car.ambulance || hasMedical) && (!car.fireTruck || hasFire)
      && car.age < 90 && isRoad(data, car.tile) && isRoad(data, car.prev) && isRoad(data, car.next)
  }).slice(0, count)
  for (var t = 0; t < pool.length; t++) if (pool[t].fireTruck) pool[t].scrambled = !!burning
  while (pool.length < count) {
    var added = spawn(data, size, roads, pool, colors)
    if (!added) break
    pool.push(added)
  }
  // One cosmetic reservation per intersection; cars already inside get priority.
  var owners = {}, limits = [], snapshots = []
  for (var i = 0; i < pool.length; i++) {
    snapshots.push({ tile: pool[i].tile, prev: pool[i].prev, distance: pool[i].distance })
    if (neighbors(data, size, pool[i].tile).length > 2) owners[pool[i].tile] = i
  }
  // Choose the nearest approaching driver, never an earlier array entry behind
  // it in the same lane (which would reserve the junction and deadlock the queue).
  var approaches = {}
  for (var i = 0; i < pool.length; i++) {
    var car = pool[i], remaining = car.path.length - car.distance
    if (remaining >= 0.7 || owners[car.next] !== undefined || neighbors(data, size, car.next).length <= 2) continue
    if (approaches[car.next] === undefined || remaining < approaches[car.next].distance)
      approaches[car.next] = { owner: i, distance: remaining }
  }
  for (var tile in approaches) owners[tile] = approaches[tile].owner
  for (var i = 0; i < pool.length; i++) {
    var car = pool[i], remaining = car.path.length - car.distance, free = Infinity
    for (var j = 0; j < snapshots.length; j++) {
      if (i === j) continue
      var other = snapshots[j]
      if (other.tile === car.tile && other.prev === car.prev && other.distance > car.distance)
        free = Math.min(free, other.distance - car.distance - gap)
      else if (other.tile === car.next && other.prev === car.tile)
        free = Math.min(free, remaining + other.distance - gap)
    }
    if (remaining < 0.7 && neighbors(data, size, car.next).length > 2) {
      if (owners[car.next] !== i) free = Math.min(free, remaining - 0.09)
    }
    limits.push(Math.max(0, free))
  }
  for (var i = 0; i < pool.length; i++) {
    var car = pool[i], free = limits[i]
    var target = car.cruise * (car.path.uturn ? 0.48 : car.path.turning ? 0.72 : 1)
    if (emergencyActive(car)) target *= 1.3
    // Anticipate the next curve instead of braking only after crossing into it.
    if (car.path.length - car.distance < 0.35 && neighbors(data, size, car.next).length !== 2)
      target *= 0.82
    target = Math.min(target, Math.sqrt(2 * 0.85 * free))
    var previousSpeed = car.speed
    var rate = target < car.speed ? 1.1 : 0.42
    car.speed += Math.max(-rate * dt, Math.min(rate * dt, target - car.speed))
    var advance = Math.min(free, (previousSpeed + car.speed) * 0.5 * dt)
    car.braking = target < previousSpeed - 0.03 || free < 0.12
    if (free < 0.002) car.speed = 0
    car.distance += advance
    car.age += dt
    if (car.distance >= car.path.length) {
      var carry = car.distance - car.path.length
      car.prev = car.tile
      car.tile = car.next
      car.next = pickNext(data, size, car.tile, car.prev)
      car.path = makePath(size, car.tile, car.prev, car.next)
      car.distance = carry
    }
  }
  return pool
}
