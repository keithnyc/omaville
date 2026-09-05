import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import "Model.js" as Model

// Headless city brain. Loaded once at shell startup (independent of the
// bar widget and panel), so the city keeps growing with the panel closed.
// Age ticks in active-shell-minutes, not wall clock, the same trick
// Omagotchi uses — a machine that sleeps doesn't lose progress, but it
// doesn't secretly keep simulating while suspended either. That covers
// actual suspend for free (a sleeping machine can't run any Timer at all),
// but a machine left on and unlocked overnight never suspends — the Timer
// below used to happily fire the whole time, "simulating" months of city
// life (and rolling for a dilemma every tick) with nobody there to see it.
// idleMonitor closes that gap: the tick pauses once the compositor reports
// no keyboard/mouse activity for a while, exactly like the away-from-desk
// detection the shell's own screensaver/lock plugin uses.
Item {
  id: root

  property var shell: null
  property var manifest: null

  readonly property string stateHome: Quickshell.env("XDG_STATE_HOME")
    || ((Quickshell.env("HOME") || "") + "/.local/state")
  readonly property string stateDir: stateHome + "/omarchy"
  readonly property string statePath: stateDir + "/omaville-state.json"

  readonly property int gridSize: Model.GRID_SIZE

  // --- persistent city facts --------------------------------------------
  property string cityName: "Omaville"
  property double foundedAtMs: 0
  property real ageMinutes: 0
  property real treasury: 500
  property real taxRatePercent: 10
  property var grid: Model.emptyGrid(Model.GRID_SIZE)
  property int population: 0
  property int jobs: 0
  property int happiness: 70
  // R/C/I growth-chance multipliers from the last tick (Model.computeDemand)
  // — 1.0 is "balanced" for that zone, not a shared 0-1 scale across all
  // three. Persisted like population/jobs/happiness so the demand meter
  // shows real numbers immediately after a restart instead of a neutral
  // placeholder until the first tick fires.
  property var demand: ({ R: 1, C: 1, I: 1 })
  property var reachedMilestones: []
  property bool budgetCrisisActive: false
  // Queue of unresolved mayor's-dilemma events (oldest first) — stacking is
  // intentional, a mayor who's been away comes back to a backlog, not a
  // silently-dropped one. Each entry is a full event object from Model.EVENTS.
  property var pendingEvents: []
  // Lingering effects from resolved dilemmas (a happiness or income hit/boost
  // that plays out over a few ticks rather than landing all at once) —
  // folded into every tick via Model.advanceCity's modifier params.
  property var activeEffects: []
  // Per-tick roll chance for the next dilemma — a cooldown, not a constant.
  // Starts warmed up at the max (a brand-new city isn't "due" for a quiet
  // spell just because it's new); only firing an event resets it low, and it
  // doubles back toward the max on every quiet tick after that. See
  // Model.nextEventChance.
  property real eventChance: Model.EVENT_CHANCE_MAX
  // A player-facing multiplier on top of the cooldown above — 0 (Off), 0.5
  // (Low), 1 (Normal), 2 (Frequent). A preference, not city state: New Game
  // deliberately leaves this alone (see resetCity) so picking "Off" once
  // doesn't mean re-picking it for every fresh city after.
  property real eventFrequency: 1.0
  // Per-department budget levels (0.5-1.5, see Model.FUNDABLE_SERVICES). City
  // state, not a preference — a new city starts every department at 100%.
  property var funding: Model.defaultFunding()
  // Outstanding municipal loans (Model.LOAN_OFFERS). Repaid a slice per
  // tick; a tick the city cannot afford the payment is a missed one, which
  // stalls repayment rather than pushing the treasury below its floor.
  property var loans: []
  property int missedLoanTicks: 0
  // Active fires: [{ index, ticks }]. Persisted so a fire burning when the
  // shell restarts is still burning when it comes back — a disaster the
  // player can dodge by reloading is not a disaster.
  property var fires: []

  property bool initialized: false
  readonly property int maxStateBytes: 65536
  property bool stateFileLoaded: false
  property string loadedStateText: ""
  property string stateReadProblem: ""

  property string omarchyPath: Quickshell.env("OMARCHY_PATH") || ""
  readonly property string notificationExecutable: omarchyPath !== ""
    ? omarchyPath + "/bin/omarchy-notification-send"
    : "omarchy-notification-send"

  function notify(title, body) {
    Quickshell.execDetached([
      notificationExecutable, "--app-name", "omaville", "-u", "normal", title, body
    ])
  }

  // --- zoning actions ------------------------------------------------------

  function zoneTile(index, type) {
    if (!Model.canPlace(root.grid, index, type, root.treasury)) return false
    root.treasury -= Model.placementCost(root.grid, index, type)
    root.grid = Model.placeTile(root.grid, index, type)
    flushState()
    return true
  }

  function buildTier(index, type, level) {
    if (!root.initialized) return false
    var check = Model.canBuildTier(root.grid, index, type, level, root.population, root.treasury)
    if (!check.ok) return false
    var next = root.grid.slice()
    next[index] = Model.makeTile(type, level)
    root.treasury -= check.cost
    root.grid = next
    flushState()
    return true
  }

  function bulldozeTile(index) {
    if (index < 0 || index >= root.grid.length) return
    var tile = Model.parseTile(root.grid[index])
    var refund = Model.totalInvestment(tile.type, tile.level)
    root.grid = Model.bulldozeTile(root.grid, index)
    if (refund > 0) root.treasury += refund
    flushState()
  }

  // Park/Power/Water/Fire/Police upgrade one tier at a time — a deliberate
  // spend the player triggers (see CityView's tier flyout), gated by both
  // a population threshold and cost, unlike R/C/I's automatic
  // demand-driven growth. Model.canUpgrade is the single source of truth
  // for eligibility so the flyout's "locked"/"can't afford" state can
  // never drift from what actually happens when clicked.
  function upgradeTile(index) {
    if (index < 0 || index >= root.grid.length) return false
    var tile = Model.parseTile(root.grid[index])
    var check = Model.canUpgrade(tile.type, tile.level, root.population, root.treasury)
    if (!check.ok) return false
    root.treasury -= check.cost
    root.grid = Model.upgradeTile(root.grid, index)
    flushState()
    return true
  }

  // Borrowing is gated on the city being able to service the debt (see
  // Model.canBorrow), so a loan is a lever for a mayor with a plan rather
  // than an infinite hole for one without.
  function borrow(offerId) {
    if (!root.initialized) return false
    var offer = Model.loanOffer(offerId)
    if (!offer) return false
    var stats = Model.summarize(root.grid)
    var income = Model.computeIncome(stats.taxablePopulation, root.taxRatePercent)
    if (!Model.canBorrow(offer, root.loans, root.population, income).ok) return false
    root.loans = Model.takeLoan(root.loans, offer, root.ageMinutes)
    root.treasury += offer.principal
    root.notify(root.cityName, "Took out a " + offer.label + " — $" + offer.principal
      + " now, $" + Math.round(Model.loanPaymentFor(offer)) + " a month for "
      + offer.ticks + " months.")
    flushState()
    return true
  }

  function setTaxRate(percent) {
    var clamped = Math.max(0, Math.min(30, Math.round(percent)))
    if (clamped === root.taxRatePercent) return
    root.taxRatePercent = clamped
    flushState()
  }

  function renameCity(value) {
    var name = String(value).replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim()
    if (!root.initialized || name.length === 0 || name.length > 40) return false
    if (name !== root.cityName) {
      root.cityName = name
      flushState()
    }
    return true
  }

  // Wipes the grid and every stat back to a fresh city's defaults, keeping
  // the city's name (editable in Settings). foundedAtMs resets
  // too, so the calendar starts back at month 1 of a new founding year.
  function resetCity() {
    root.grid = Model.emptyGrid(root.gridSize)
    root.treasury = 500
    root.taxRatePercent = 10
    root.population = 0
    root.jobs = 0
    root.happiness = 70
    root.demand = { R: 1, C: 1, I: 1 }
    root.reachedMilestones = []
    root.budgetCrisisActive = false
    root.pendingEvents = []
    root.activeEffects = []
    root.eventChance = Model.EVENT_CHANCE_MAX
    root.funding = Model.defaultFunding()
    root.loans = []
    root.missedLoanTicks = 0
    root.fires = []
    root.ageMinutes = 0
    root.foundedAtMs = Date.now()
    flushState()
  }

  // --- mayor's dilemmas --------------------------------------------------

  readonly property var eventFrequencyOptions: [
    { value: 0, label: "Off" },
    { value: 0.5, label: "Low" },
    { value: 1, label: "Normal" },
    { value: 2, label: "Frequent" }
  ]

  function setEventFrequency(value) {
    var n = Number(value)
    if (!isFinite(n) || n < 0) return
    if (n === root.eventFrequency) return
    root.eventFrequency = n
    flushState()
  }

  // Funding is charged per resident served every tick, so this is the one
  // spending decision that keeps scaling with the city instead of being a
  // one-off purchase — raising a department buys coverage radius and (for
  // fire/police) lower incident risk, and starving one is a real saving with
  // a real cost. Assigning a fresh object rather than mutating in place so
  // QML property bindings on `funding` actually re-evaluate.
  function setFunding(type, value) {
    if (Model.FUNDABLE_SERVICES.indexOf(type) < 0) return false
    var level = Number(value)
    if (!isFinite(level)) return false
    level = Model.clamp(level, Model.FUNDING_MIN, Model.FUNDING_MAX)
    if (level === Model.fundingLevel(root.funding, type)) return false
    var next = {}
    for (var i = 0; i < Model.FUNDABLE_SERVICES.length; i++) {
      var key = Model.FUNDABLE_SERVICES[i]
      next[key] = key === type ? level : Model.fundingLevel(root.funding, key)
    }
    root.funding = next
    flushState()
    return true
  }

  function rollEvent() {
    var pendingIds = root.pendingEvents.map(function(e) { return e.id })
    var effectiveChance = root.eventChance * root.eventFrequency
    var event = Model.rollForEvent(pendingIds, root.population, effectiveChance)
    root.eventChance = Model.nextEventChance(root.eventChance, !!event)
    if (!event) return
    root.pendingEvents = root.pendingEvents.concat([event])
    root.notify(event.title, event.flavor + " Open Omaville to decide.")
    flushState()
  }

  function resolveEvent(eventId, choiceIndex) {
    var idx = -1
    for (var i = 0; i < root.pendingEvents.length; i++) {
      if (root.pendingEvents[i].id === eventId) { idx = i; break }
    }
    if (idx < 0) return
    var event = root.pendingEvents[idx]
    var choice = event.choices[choiceIndex]
    if (!choice) return

    var remaining = root.pendingEvents.slice()
    remaining.splice(idx, 1)
    root.pendingEvents = remaining

    var fx = choice.effects || {}
    if (fx.treasuryDelta) root.treasury = Math.max(Model.TREASURY_FLOOR, root.treasury + fx.treasuryDelta)
    if (fx.populationPercent) {
      var deltaPop = Math.round(root.population * fx.populationPercent)
      root.grid = Model.applyPopulationShock(root.grid, deltaPop)
    }
    if (fx.happinessDelta || (fx.incomeMultiplier !== undefined && fx.incomeMultiplier !== 1)) {
      root.activeEffects = root.activeEffects.concat([{
        id: event.id + "-" + Date.now(),
        label: event.title,
        happinessDelta: fx.happinessDelta || 0,
        incomeMultiplier: fx.incomeMultiplier !== undefined ? fx.incomeMultiplier : 1,
        ticksRemaining: fx.effectTicks || 1
      }])
    }
    root.notify(root.cityName, choice.outcome)
    flushState()
  }

  // --- the minute tick -------------------------------------------------------

  // ext-idle-notify-v1 via Quickshell.Wayland: true once the compositor has
  // seen no keyboard/mouse input for idleTimeoutSeconds, same signal the
  // shell's own screensaver uses. Not tied to whether Omaville's panel is
  // open — the point is "away from the machine entirely," not "not looking
  // at this specific widget."
  readonly property int idleTimeoutSeconds: 300
  IdleMonitor {
    id: idleMonitor
    enabled: true
    timeout: root.idleTimeoutSeconds
    respectInhibitors: true
  }

  // 15s for now while the pacing itself is still being playtested — the
  // eventual idle-game pace (a month per active minute) is one line to
  // restore once the mechanics feel right at a readable speed.
  Timer {
    interval: 15 * 1000
    running: root.initialized && !idleMonitor.isIdle
    repeat: true
    onTriggered: {
      var happinessModifier = 0
      var incomeMultiplier = 1
      var stillActive = []
      for (var i = 0; i < root.activeEffects.length; i++) {
        var eff = root.activeEffects[i]
        happinessModifier += eff.happinessDelta
        incomeMultiplier *= eff.incomeMultiplier
        var ticksLeft = eff.ticksRemaining - 1
        if (ticksLeft > 0) {
          stillActive.push({
            id: eff.id, label: eff.label, happinessDelta: eff.happinessDelta,
            incomeMultiplier: eff.incomeMultiplier, ticksRemaining: ticksLeft
          })
        }
      }
      root.activeEffects = stillActive

      var result = Model.advanceCity(root.grid, root.gridSize, root.taxRatePercent,
        happinessModifier, incomeMultiplier, root.funding)
      root.grid = result.grid
      root.population = result.population
      root.jobs = result.jobs
      root.happiness = result.happiness
      root.demand = result.demand
      var balance = root.treasury + result.incomeDelta
      // Debt service comes out after the month's income. A payment the city
      // genuinely cannot make is missed rather than forced: the loan simply
      // doesn't advance, so a struggling mayor stalls their repayment instead
      // of being shoved under the treasury floor by it.
      var due = Model.totalLoanPayment(root.loans)
      if (due > 0) {
        if (balance - due >= Model.TREASURY_FLOOR) {
          balance -= due
          root.loans = Model.advanceLoans(root.loans)
          if (root.missedLoanTicks !== 0) root.missedLoanTicks = 0
        } else {
          root.missedLoanTicks += 1
          if (root.missedLoanTicks === 3)
            root.notify(root.cityName + " — missed payment",
              "The city cannot cover its loan repayments. Cut spending or raise taxes.")
        }
      }
      root.treasury = Math.max(Model.TREASURY_FLOOR, balance)
      root.ageMinutes += 1
      root.advanceDisasters()
      root.checkMilestones()
      root.checkBudget()
      root.rollEvent()
      if (Math.round(root.ageMinutes) % 5 === 0) root.flushState()
    }
  }

  // Fires burn, spread and are put out here rather than inside tickGrid,
  // because unlike growth they are events with a beginning and an end that
  // the player should be told about — the whole reason fire stopped being an
  // invisible dice roll.
  function advanceDisasters() {
    var utilities = Model.findUtilities(root.grid)
    if (root.fires.length > 0) {
      var result = Model.advanceFires(root.grid, root.gridSize, root.fires, utilities, root.funding)
      root.grid = result.grid
      var wasBurning = root.fires.length
      root.fires = result.fires
      if (result.destroyed > 0)
        root.notify(root.cityName + " — fire",
          result.destroyed === 1 ? "A building has been lost to the fire."
            : result.destroyed + " buildings have been lost to the fire.")
      else if (result.fires.length === 0 && wasBurning > 0)
        root.notify(root.cityName, "The fire is out.")
    }

    var ignition = Model.rollFireStart(root.grid, root.gridSize, root.fires, utilities, root.funding)
    if (ignition >= 0) {
      root.fires = root.fires.concat([{ index: ignition, ticks: 0 }])
      var covered = Model.isCovered(root.gridSize, utilities.fire, ignition,
        Model.FIRE_RADIUS * Model.fundingRadiusScale(Model.fundingLevel(root.funding, "F")))
      root.notify(root.cityName + " — fire!",
        covered ? "A fire has broken out. Crews are on the scene."
          : "A fire has broken out with no fire station in range.")
      flushState()
    }
  }

  function checkMilestones() {
    var fresh = Model.newMilestones(root.population, root.reachedMilestones)
    if (fresh.length === 0) return
    root.reachedMilestones = root.reachedMilestones.concat(fresh)
    for (var i = 0; i < fresh.length; i++)
      root.notify(root.cityName, "Population reached " + fresh[i] + "!")
    flushState()
  }

  function checkBudget() {
    if (root.treasury < 0 && !root.budgetCrisisActive) {
      root.budgetCrisisActive = true
      root.notify(root.cityName + " — budget crisis",
        "The treasury has gone negative. Raise taxes or ease off building.")
      flushState()
    } else if (root.treasury >= 0 && root.budgetCrisisActive) {
      root.budgetCrisisActive = false
      flushState()
    }
  }

  // --- persistence -----------------------------------------------------------

  function boundedText(collector, exitCode) {
    if (exitCode !== 0) return ""
    var text = collector.text
    return text.length >= maxStateBytes ? "" : text
  }

  function flushState() {
    stateFile.setText(JSON.stringify({
      cityName: root.cityName,
      foundedAtMs: root.foundedAtMs,
      ageMinutes: root.ageMinutes,
      treasury: root.treasury,
      taxRatePercent: root.taxRatePercent,
      // Packed to one string rather than 4096 indented array lines — see
      // Model.packGrid for why the read cap makes that worth doing.
      grid: Model.packGrid(root.grid),
      gridSize: root.gridSize,
      saveVersion: Model.SAVE_VERSION,
      population: root.population,
      jobs: root.jobs,
      happiness: root.happiness,
      demand: root.demand,
      reachedMilestones: root.reachedMilestones,
      budgetCrisisActive: root.budgetCrisisActive,
      pendingEvents: root.pendingEvents,
      activeEffects: root.activeEffects,
      eventChance: root.eventChance,
      eventFrequency: root.eventFrequency,
      funding: root.funding,
      loans: root.loans,
      missedLoanTicks: root.missedLoanTicks,
      fires: root.fires
    }, null, 2) + "\n")
  }

  function initializeIfReady() {
    if (initialized || !stateFileLoaded) return

    var saveProblem = stateReadProblem
    var migratedGrid = false
    function num(v, fallback) {
      var n = Number(v)
      return isFinite(n) ? n : fallback
    }
    try {
      var saved = loadedStateText !== "" ? JSON.parse(loadedStateText) : {}
      cityName = typeof saved.cityName === "string" && saved.cityName !== "" ? saved.cityName : "Omaville"
      foundedAtMs = num(saved.foundedAtMs, 0)
      ageMinutes = Math.max(0, num(saved.ageMinutes, 0))
      treasury = Math.max(Model.TREASURY_FLOOR, num(saved.treasury, 500))
      taxRatePercent = Math.max(0, Math.min(30, num(saved.taxRatePercent, 10)))
      // Saves written before SAVE_VERSION 2 still hold a plain array here;
      // both forms decode to the same tile list, so an older city loads
      // unchanged and is simply rewritten packed on its next flush.
      var loadedGrid = Array.isArray(saved.grid) ? saved.grid : Model.unpackGrid(saved.grid)
      var savedSize = loadedGrid ? Math.round(Math.sqrt(loadedGrid.length)) : 0
      // A grid whose length doesn't match the current gridSize either means
      // a corrupt save (falls back to empty) or that GRID_SIZE grew since
      // this city was saved — in which case the old city is carried into
      // the middle of the new, bigger map rather than discarded.
      if (loadedGrid && savedSize * savedSize === loadedGrid.length && savedSize === gridSize) {
        grid = loadedGrid
      } else if (loadedGrid && savedSize > 0 && savedSize < gridSize) {
        grid = Model.migrateGrid(loadedGrid, savedSize, gridSize)
        migratedGrid = true
      } else {
        grid = Model.emptyGrid(gridSize)
      }
      population = Math.max(0, Math.round(num(saved.population, 0)))
      jobs = Math.max(0, Math.round(num(saved.jobs, 0)))
      happiness = Math.max(0, Math.min(100, Math.round(num(saved.happiness, 70))))
      demand = (saved.demand && typeof saved.demand === "object")
        ? { R: num(saved.demand.R, 1), C: num(saved.demand.C, 1), I: num(saved.demand.I, 1) }
        : { R: 1, C: 1, I: 1 }
      reachedMilestones = Array.isArray(saved.reachedMilestones) ? saved.reachedMilestones : []
      budgetCrisisActive = saved.budgetCrisisActive === true
      pendingEvents = Array.isArray(saved.pendingEvents) ? saved.pendingEvents : []
      activeEffects = Array.isArray(saved.activeEffects) ? saved.activeEffects : []
      eventChance = Model.clamp(num(saved.eventChance, Model.EVENT_CHANCE_MAX),
        Model.EVENT_CHANCE_BASE, Model.EVENT_CHANCE_MAX)
      eventFrequency = Math.max(0, num(saved.eventFrequency, 1))
      // Any department missing from an older save falls back to 100%.
      var loadedFunding = Model.defaultFunding()
      if (saved.funding && typeof saved.funding === "object")
        for (var f = 0; f < Model.FUNDABLE_SERVICES.length; f++) {
          var key = Model.FUNDABLE_SERVICES[f]
          loadedFunding[key] = Model.fundingLevel(saved.funding, key)
        }
      funding = loadedFunding
      loans = Array.isArray(saved.loans) ? saved.loans : []
      missedLoanTicks = Math.max(0, Math.round(num(saved.missedLoanTicks, 0)))
      fires = Array.isArray(saved.fires) ? saved.fires : []
    } catch (error) {
      saveProblem = "not valid JSON (" + error + ")"
      foundedAtMs = 0
      grid = Model.emptyGrid(gridSize)
    }

    var founded = false
    if (foundedAtMs === 0) {
      foundedAtMs = Date.now()
      founded = true
    }

    initialized = true
    if (saveProblem !== "") {
      console.warn("omaville: save file " + statePath + " " + saveProblem + " — starting a new city")
      notify("Omaville couldn't read its save file",
             "It was corrupt or oversized, so a fresh city takes over.")
    }
    if (migratedGrid)
      notify(root.cityName, "The map grew — your city now has room to expand.")
    if (founded || migratedGrid) flushState()
  }

  Process {
    id: stateReader
    command: ["head", "-c", String(root.maxStateBytes), root.statePath]
    running: true
    stdout: StdioCollector { id: stateOut }
    onExited: function(exitCode) {
      root.loadedStateText = root.boundedText(stateOut, exitCode)
      if (exitCode === 0 && stateOut.text.length >= root.maxStateBytes)
        root.stateReadProblem = "exceeds " + root.maxStateBytes + " bytes"
      root.stateFileLoaded = true
      root.initializeIfReady()
    }
  }

  FileView {
    id: stateFile
    path: root.statePath
    preload: false
    watchChanges: false
    atomicWrites: true
    printErrors: false
  }
}
