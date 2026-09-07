.pragma library

// Ephemeral sky life. Coordinates use map tiles so panning/zooming feels natural.
function initialState() { return { nextIn: 8, cycle: 0, objects: [] } }

// Water life travels along a stretch of open water rather than across the
// whole view, because unlike a bird it has to stay on the water. runs comes
// from Waterfront.waterRuns, recomputed only when the grid changes.
function createOnWater(kind, runs) {
  var run = runs[Math.floor(Math.random() * runs.length)]
  var forward = Math.random() > 0.5
  var pad = 1.5
  var dx = run.x1 - run.x0, dy = run.y1 - run.y0
  var len = Math.sqrt(dx * dx + dy * dy) || 1
  // Start and finish just off the ends so it drifts in and out rather than
  // popping into existence mid-water.
  var ux = dx / len, uy = dy / len
  var a = { x: run.x0 - ux * pad, y: run.y0 - uy * pad }
  var b = { x: run.x1 + ux * pad, y: run.y1 + uy * pad }
  var from = forward ? a : b, to = forward ? b : a
  return { kind: kind, age: 0,
    // Slow: a boat that crossed as fast as a plane would read as a jetski.
    duration: (kind === "ducks" ? 9 : 5) * len + 12,
    x0: from.x, y0: from.y, x1: to.x, y1: to.y,
    phase: Math.random() * Math.PI * 2,
    color: Math.random() < 0.5 ? "#b8563f" : "#3f6f86" }
}

function create(kind, view) {
  var right = Math.random() > 0.5
  var margin = 3
  var y = view.y + view.height * (0.25 + Math.random() * 0.5)
  return { kind: kind, age: 0,
    duration: kind === "balloon" ? 65 + Math.random() * 25 : kind === "plane" ? 14 + Math.random() * 6 : 20 + Math.random() * 8,
    x0: view.x + (right ? -margin : view.width + margin),
    x1: view.x + (right ? view.width + margin : -margin),
    y0: y, y1: y + (Math.random() - 0.5) * view.height * 0.45,
    phase: Math.random() * Math.PI * 2,
    color: Math.random() < 0.5 ? "#bb604c" : "#548f9f" }
}

function update(state, milliseconds, view, waterRuns) {
  var dt = Math.max(0, Math.min(milliseconds, 100)) / 1000
  state.objects = state.objects.filter(function(item) { item.age += dt; return item.age < item.duration })
  if (state.objects.length) return state
  state.nextIn -= dt
  if (state.nextIn <= 0 && view.width > 0 && view.height > 0) {
    // Rotate categories so every kind appears; vary the route and quiet
    // interval. Water kinds only join the rotation when there is water long
    // enough to cross, so an inland city never waits on a boat that cannot
    // spawn.
    var kinds = ["birds", "plane", "balloon"]
    var runs = waterRuns || []
    if (runs.length > 0) kinds = kinds.concat(["boat", "ducks"])
    var kind = kinds[state.cycle % kinds.length]
    state.cycle++
    state.objects.push(kind === "boat" || kind === "ducks"
      ? createOnWater(kind, runs) : create(kind, view))
    state.nextIn = 18 + Math.random() * 25
  }
  return state
}

function pose(item) {
  var t = Math.min(1, item.age / item.duration)
  return { x: item.x0 + (item.x1 - item.x0) * t,
    y: item.y0 + (item.y1 - item.y0) * t,
    angle: Math.atan2(item.y1 - item.y0, item.x1 - item.x0),
    alpha: Math.min(1, item.age / 1.5, (item.duration - item.age) / 1.5) }
}

function planeShape(ctx) {
  // Nose points right. Broad wings and tail distinguish it from ground traffic.
  ctx.beginPath()
  ctx.moveTo(0.55, 0); ctx.lineTo(0.35, -0.08); ctx.lineTo(0.08, -0.08)
  ctx.lineTo(-0.08, -0.57); ctx.lineTo(-0.23, -0.57); ctx.lineTo(-0.16, -0.07)
  ctx.lineTo(-0.4, -0.055); ctx.lineTo(-0.49, -0.22); ctx.lineTo(-0.59, -0.22)
  ctx.lineTo(-0.55, 0); ctx.lineTo(-0.59, 0.22); ctx.lineTo(-0.49, 0.22)
  ctx.lineTo(-0.4, 0.055); ctx.lineTo(-0.16, 0.07); ctx.lineTo(-0.23, 0.57)
  ctx.lineTo(-0.08, 0.57); ctx.lineTo(0.08, 0.08); ctx.lineTo(0.35, 0.08)
  ctx.closePath()
}

function draw(ctx, state, cellSize, panX, panY, width, height) {
  for (var i = 0; i < state.objects.length; i++) {
    var item = state.objects[i], p = pose(item)
    var x = p.x * cellSize - panX, y = p.y * cellSize - panY
    var size = cellSize * (item.kind === "birds" ? 0.65
      : item.kind === "ducks" ? 0.34 : item.kind === "boat" ? 0.62 : 0.95)
    if (x < -size * 3 || x > width + size * 3 || y < -size * 3 || y > height + size * 3) continue
    ctx.save()
    ctx.globalAlpha = p.alpha
    if (item.kind === "plane") {
      ctx.save()
      ctx.translate(x + cellSize * 0.65, y + cellSize * 0.85)
      ctx.rotate(p.angle); ctx.scale(size * 0.7, size * 0.7)
      ctx.fillStyle = "rgba(12, 24, 23, 0.16)"; planeShape(ctx); ctx.fill()
      ctx.restore()
      ctx.translate(x, y); ctx.rotate(p.angle); ctx.scale(size, size)
      ctx.lineWidth = 0.025; ctx.strokeStyle = "#42535b"
      ctx.fillStyle = "#d9d6bc"; planeShape(ctx); ctx.fill(); ctx.stroke()
      ctx.fillStyle = item.color
      ctx.fillRect(-0.21, -0.52, 0.11, 0.12); ctx.fillRect(-0.21, 0.4, 0.11, 0.12)
      ctx.fillRect(-0.48, -0.045, 0.7, 0.09)
      ctx.fillStyle = "#395c70"; ctx.fillRect(0.24, -0.052, 0.09, 0.104)
      ctx.strokeStyle = "rgba(214, 226, 221, 0.65)"; ctx.lineWidth = 0.027
      var prop = 0.08 + Math.abs(Math.sin(item.age * 42)) * 0.07
      ctx.beginPath(); ctx.moveTo(0.56, -prop); ctx.lineTo(0.56, prop); ctx.stroke()
    } else if (item.kind === "boat") {
      ctx.translate(x, y); ctx.rotate(p.angle); ctx.scale(size, size)
      // A wake trailing behind, so it reads as moving even in a still frame.
      ctx.strokeStyle = "rgba(214, 236, 238, 0.30)"; ctx.lineWidth = 0.05
      ctx.beginPath()
      ctx.moveTo(-0.35, -0.16); ctx.lineTo(-1.5, -0.34)
      ctx.moveTo(-0.35, 0.16); ctx.lineTo(-1.5, 0.34); ctx.stroke()
      ctx.fillStyle = "rgba(10, 30, 38, 0.28)"
      ctx.beginPath(); ctx.ellipse(0, 0.16, 0.52, 0.20, 0, 0, Math.PI * 2); ctx.fill()
      // Hull: pointed bow to the right, square stern.
      ctx.fillStyle = "#7d5a3a"
      ctx.beginPath()
      ctx.moveTo(0.52, 0); ctx.lineTo(0.18, -0.20); ctx.lineTo(-0.44, -0.18)
      ctx.lineTo(-0.44, 0.18); ctx.lineTo(0.18, 0.20)
      ctx.closePath(); ctx.fill()
      ctx.fillStyle = "#b1855a"
      ctx.beginPath()
      ctx.moveTo(0.44, 0); ctx.lineTo(0.16, -0.13); ctx.lineTo(-0.38, -0.11)
      ctx.lineTo(-0.38, 0.11); ctx.lineTo(0.16, 0.13)
      ctx.closePath(); ctx.fill()
      // A small cabin and a stubby mast, tinted per boat.
      ctx.fillStyle = item.color
      ctx.fillRect(-0.24, -0.12, 0.22, 0.24)
      ctx.fillStyle = "#e8e2cb"; ctx.fillRect(-0.21, -0.08, 0.16, 0.07)
      ctx.strokeStyle = "#5d4530"; ctx.lineWidth = 0.045
      ctx.beginPath(); ctx.moveTo(0.02, 0); ctx.lineTo(0.02, -0.42); ctx.stroke()
    } else if (item.kind === "ducks") {
      ctx.translate(x, y); ctx.rotate(p.angle); ctx.scale(size, size)
      // Four in a loose trail, bobbing slightly out of step with each other.
      for (var duck = 0; duck < 4; duck++) {
        var bob = Math.sin(item.age * 1.6 + item.phase + duck * 1.1) * 0.06
        var dx = -duck * 0.62, dy = (duck % 2 === 0 ? 0.16 : -0.14) + bob
        ctx.fillStyle = "rgba(10, 30, 38, 0.26)"
        ctx.beginPath(); ctx.ellipse(dx, dy + 0.16, 0.26, 0.10, 0, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = duck === 0 ? "#4a4034" : "#5c5142"
        ctx.beginPath(); ctx.ellipse(dx, dy, 0.24, 0.15, 0, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = "#2f2a24"
        ctx.beginPath(); ctx.arc(dx + 0.20, dy - 0.10, 0.10, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = "#c08a3e"
        ctx.fillRect(dx + 0.27, dy - 0.12, 0.10, 0.05)
      }
    } else if (item.kind === "birds") {
      ctx.translate(x, y); ctx.rotate(p.angle)
      // Five birds in a relaxed V; independent wingbeats keep it from looking rigid.
      var flock = [[0,0],[-0.36,-0.3],[-0.43,0.34],[-0.77,-0.56],[-0.85,0.65]]
      ctx.strokeStyle = "#d7dcc9"; ctx.lineWidth = Math.max(1, cellSize * 0.027)
      for (var b = 0; b < flock.length; b++) {
        var bx = flock[b][0] * size, by = flock[b][1] * size
        var flap = Math.sin(item.age * 7 + item.phase + b * 1.7)
        var span = size * (0.12 + 0.04 * flap)
        ctx.beginPath()
        ctx.moveTo(bx - span * 0.5, by - span)
        ctx.quadraticCurveTo(bx + span * flap, by - span * 0.4, bx, by)
        ctx.quadraticCurveTo(bx + span * flap, by + span * 0.4, bx - span * 0.5, by + span)
        ctx.stroke()
      }
    } else {
      ctx.fillStyle = "rgba(15, 25, 20, 0.12)"
      ctx.save(); ctx.translate(x + size * 0.5, y + size * 1.4)
      ctx.scale(size * 0.28, size * 0.13)
      ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill(); ctx.restore()
      ctx.translate(x, y + Math.sin(item.age * 0.6 + item.phase) * size * 0.04)
      ctx.scale(size, size)
      ctx.rotate(Math.sin(item.age * 0.35) * 0.035)
      ctx.strokeStyle = "#705d43"; ctx.lineWidth = 0.025
      ctx.beginPath(); ctx.moveTo(-0.14,0.24); ctx.lineTo(-0.09,0.51)
      ctx.moveTo(0.14,0.24); ctx.lineTo(0.09,0.51); ctx.stroke()
      ctx.fillStyle = item.color
      ctx.beginPath(); ctx.moveTo(-0.13,0.3)
      ctx.bezierCurveTo(-0.24,0.13,-0.44,-0.03,-0.4,-0.3)
      ctx.bezierCurveTo(-0.35,-0.68,0.35,-0.68,0.4,-0.3)
      ctx.bezierCurveTo(0.44,-0.03,0.24,0.13,0.13,0.3)
      ctx.closePath(); ctx.fill()
      ctx.save(); ctx.clip(); ctx.fillStyle = "#e5ce8e"
      ctx.beginPath(); ctx.moveTo(-0.06,0.3)
      ctx.bezierCurveTo(-0.2,-0.05,-0.23,-0.42,-0.1,-0.61)
      ctx.lineTo(0.1,-0.61); ctx.bezierCurveTo(0.23,-0.42,0.2,-0.05,0.06,0.3)
      ctx.closePath(); ctx.fill()
      var shade = ctx.createLinearGradient(-0.4, 0, 0.4, 0)
      shade.addColorStop(0, "rgba(255, 241, 207, 0.2)")
      shade.addColorStop(0.38, "rgba(255, 241, 207, 0)")
      shade.addColorStop(1, "rgba(23, 38, 46, 0.32)")
      ctx.fillStyle = shade; ctx.fillRect(-0.5, -0.7, 1, 1.1)
      ctx.strokeStyle = "rgba(83, 67, 48, 0.25)"; ctx.lineWidth = 0.016
      ctx.beginPath(); ctx.moveTo(0, -0.6); ctx.bezierCurveTo(-0.32, -0.43, -0.26, -0.06, -0.08, 0.3)
      ctx.moveTo(0, -0.6); ctx.bezierCurveTo(0.32, -0.43, 0.26, -0.06, 0.08, 0.3); ctx.stroke()
      ctx.restore()
      ctx.fillStyle = "#9f7847"; ctx.fillRect(-0.12,0.48,0.24,0.17)
      ctx.fillStyle = "#dec08a"; ctx.fillRect(-0.13,0.47,0.26,0.045)
      ctx.fillStyle = "#66563c"; ctx.fillRect(-0.1,0.61,0.2,0.035)
    }
    ctx.restore()
  }
}
