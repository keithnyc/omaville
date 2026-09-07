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
  // Who the city addresses when it has something to say. Empty is allowed and
  // degrades to a bare "Mayor" via Model.mayorTitle, so an older save or a
  // player who skips the field never sees a dangling honorific.
  property string mayorName: ""
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
  // Active crime waves: [{ index, ticks }]. Where fire destroys, crime
  // degrades — it bleeds money, drags happiness down and drives residents
  // out of the blocks it covers until police shut it down.
  property var crimes: []
  // The four neighbouring towns, one per map edge. Generated once from the
  // city's own founding seed so they never shuffle, and persisted so an
  // existing city keeps the neighbours it already ran roads to.
  // Standing policies, by id (Model.ORDINANCES). City state, not a
  // preference — a new administration starts with a clean slate.
  property var ordinances: []
  // Elections: the tick of the last one, and how long the player is out of
  // office after losing one.
  property real lastElectionTick: 0
  property real outOfOfficeUntil: 0
  readonly property bool outOfOffice: root.ageMinutes < root.outOfOfficeUntil
  property int lastApproval: 0
  property var neighbors: []
  // Highways already open, so a newly-opened one can be told apart from one
  // that has been open for hours. Seeded from the grid on load rather than
  // persisted, so it can never disagree with the roads actually on the map.
  property var connectedNeighborNames: []
  // Bounded history for the graphs, and a newest-first event log. Both are
  // capped in Model — they live in the save file, which has a hard read cap.
  property var history: []
  property var cityLog: []
  // The last minute the player actually looked, so the panel can say what
  // happened while they were away rather than replaying the whole log.
  property real lastSeenMinute: 0
  property bool brownoutActive: false

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

  // --- derived city state -------------------------------------------------
  // Computed here rather than in each view so the panel and the bar widget
  // read the same numbers from one pass over the grid, and so anything that
  // wants the advisors (the widget's tooltip, for one) does not have to
  // rebuild them.
  readonly property var cityStats: Model.summarize(root.grid)
  readonly property var coverage: Model.serviceCoverageStats(root.grid, root.gridSize)
  readonly property var policy: Model.ordinanceEffects(root.ordinances)
  readonly property var load: Model.utilityLoad(root.grid, root.cityStats, root.policy)
  // Deliberately NOT a binding on the grid. Surveying traffic means walking
  // every lot's road access, which costs milliseconds on a mature city — fine
  // once a month, ruinous on every tile of a road drag. It refreshes on the
  // tick, and on demand when something is about to show it.
  property var traffic: Model.trafficSurvey(root.grid, root.gridSize,
    Model.findUtilities(root.grid), root.funding, root.policy)
  function refreshTraffic() {
    root.traffic = Model.trafficSurvey(root.grid, root.gridSize,
      Model.findUtilities(root.grid), root.funding, root.policy)
  }
  readonly property real income: Model.incomeFor(root.cityStats, root.taxRatePercent)
  readonly property real upkeep: Model.computeUpkeep(root.cityStats, root.funding, root.ordinances)
  readonly property var linkedNeighbors: Model.connectedNeighbors(root.grid, root.gridSize, root.neighbors)
  readonly property var advice: root.initialized ? Model.cityAdvice({
    stats: root.cityStats, coverage: root.coverage,
    demand: Model.computeDemand(root.cityStats, root.linkedNeighbors.length, root.policy),
    income: root.income, upkeep: root.upkeep, treasury: root.treasury,
    funding: root.funding, loans: root.loans, taxRatePercent: root.taxRatePercent,
    fires: root.fires, crimes: root.crimes, load: root.load, traffic: root.traffic,
    mood: { happiness: root.happiness,
      rows: Model.moodBreakdown(root.taxRatePercent, root.cityStats,
        Model.trafficHappinessPenalty(root.traffic), root.policy.happiness) },
    neighborsLinked: root.linkedNeighbors.length,
    neighborsTotal: root.neighbors ? root.neighbors.length : 0
  }) : []
  readonly property var topAdvice: root.advice.length > 0 ? Model.topAdvice(root.advice) : null

  // The long goal. Derived every time anything it depends on changes, so the
  // panel always shows the truth; only the *streak* is persisted, because that
  // is the one part that is history rather than a current fact.
  readonly property var sustainability: root.initialized ? Model.sustainability({
    stats: root.cityStats, coverage: root.coverage, traffic: root.traffic,
    income: root.income, upkeep: root.upkeep, happiness: root.happiness,
    loans: root.loans
  }) : []
  readonly property bool sustainableNow: Model.sustainabilityMet(root.sustainability)
  // Civic level: what the city is schooled enough to build, as opposed to big
  // enough to want. Climbs and falls with education coverage and funding.
  property real civicLevel: Model.CIVIC_MIN
  readonly property real civicTarget: root.initialized
    ? Model.civicTarget(root.coverage, root.funding, Model.findUtilities(root.grid))
    : Model.CIVIC_MIN
  // Stakes in the neighbouring towns: { townName: { units, cost } }. Money
  // here is money the treasury does not have, which is the entire point.
  property var holdings: ({})
  readonly property var marketQuotes: root.initialized
    ? Model.marketQuotes(root.neighbors, root.connectedNeighborNames,
        root.ageMinutes, root.cityStats, root.holdings) : []
  readonly property real portfolioValue: root.initialized
    ? Model.portfolioValue(root.neighbors, root.connectedNeighborNames,
        root.ageMinutes, root.cityStats, root.holdings) : 0
  readonly property real portfolioCost: Model.portfolioCost(root.holdings)
  property int sustainedTicks: 0
  // ageMinutes when the city first held it long enough; 0 means never.
  property int sustainableAt: 0
  // Anything actively going wrong, most urgent first — what the bar widget
  // swaps its icon for.
  // Out of office outranks everything: a mayor who cannot act at all needs to
  // know that before they need to know the city is on fire, because they
  // cannot do anything about the fire either.
  readonly property string alertKind: root.outOfOffice ? "office"
    : root.fires.length > 0 ? "fire"
    : root.crimes.length > 0 ? "crime"
    : (root.load && (root.load.power < 1 || root.load.water < 1)) ? "brownout"
    : root.budgetCrisisActive ? "budget" : ""

  // --- zoning actions ------------------------------------------------------

  function zoneTile(index, type) {
    if (root.outOfOffice) return false
    if (!Model.canPlace(root.grid, index, type, root.treasury)) return false
    root.treasury -= Model.placementCost(root.grid, index, type)
    root.grid = Model.placeTile(root.grid, index, type)
    flushState()
    return true
  }

  function buildTier(index, type, level) {
    if (!root.initialized || root.outOfOffice) return false
    var check = Model.canBuildTier(root.grid, index, type, level, root.population,
      root.treasury, root.civicLevel)
    if (!check.ok) return false
    var next = root.grid.slice()
    next[index] = Model.makeTile(type, level)
    root.treasury -= check.cost
    root.grid = next
    flushState()
    return true
  }

  function bulldozeTile(index) {
    if (root.outOfOffice) return
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
    if (root.outOfOffice) return false
    if (index < 0 || index >= root.grid.length) return false
    var tile = Model.parseTile(root.grid[index])
    var check = Model.canUpgrade(tile.type, tile.level, root.population, root.treasury,
      root.civicLevel)
    if (!check.ok) return false
    root.treasury -= check.cost
    root.grid = Model.upgradeTile(root.grid, index)
    flushState()
    return true
  }

  // Borrowing is gated on the city being able to service the debt (see
  // Model.canBorrow), so a loan is a lever for a mayor with a plan rather
  // than an infinite hole for one without.
  function buyStake(town, amount) {
    if (!root.initialized || root.outOfOffice) return false
    var quote = null
    for (var i = 0; i < root.marketQuotes.length; i++)
      if (root.marketQuotes[i].id === town) quote = root.marketQuotes[i]
    if (!quote) return false
    var spend = Math.min(amount, root.treasury - Model.TREASURY_FLOOR)
    if (!(spend > 0)) return false
    var result = Model.buyUnits(root.holdings, town, quote.price, spend)
    if (!result) return false
    root.holdings = result.holdings
    root.treasury += result.cash
    root.logEvent("market", "Bought $" + Math.round(spend) + " of " + town + ".")
    flushState()
    return true
  }

  function sellStake(town, fraction) {
    if (!root.initialized || root.outOfOffice) return false
    var quote = null
    for (var i = 0; i < root.marketQuotes.length; i++)
      if (root.marketQuotes[i].id === town) quote = root.marketQuotes[i]
    if (!quote) return false
    var result = Model.sellUnits(root.holdings, town, quote.price, fraction)
    if (!result) return false
    root.holdings = result.holdings
    root.treasury += result.cash
    root.logEvent("market", "Sold " + town + " for $" + Math.round(result.cash) + ".")
    flushState()
    return true
  }

  function borrow(offerId) {
    if (!root.initialized || root.outOfOffice) return false
    var offer = Model.loanOffer(offerId)
    if (!offer) return false
    var stats = Model.summarize(root.grid)
    var income = Model.incomeFor(stats, root.taxRatePercent)
    if (!Model.canBorrow(offer, root.loans, root.population, income).ok) return false
    root.loans = Model.takeLoan(root.loans, offer, root.ageMinutes)
    root.treasury += offer.principal
    root.notify(root.cityName, "Took out a " + offer.label + " — $" + offer.principal
      + " now, $" + Math.round(Model.loanPaymentFor(offer)) + " a month for "
      + offer.ticks + " months.")
    root.logEvent("loan", "Took out a " + offer.label + " for $" + offer.principal + ".")
    flushState()
    return true
  }

  // Ordinances are locked while out of office: an interim administration is
  // running the city, not the player.
  function toggleOrdinance(id) {
    if (!root.initialized || root.outOfOffice) return false
    if (!Model.ordinance(id)) return false
    var next = []
    var had = false
    for (var i = 0; i < root.ordinances.length; i++) {
      if (root.ordinances[i] === id) { had = true; continue }
      next.push(root.ordinances[i])
    }
    if (!had) next.push(id)
    root.ordinances = next
    root.logEvent("ordinance", (had ? "Repealed " : "Passed ") + Model.ordinance(id).name + ".")
    flushState()
    return true
  }

  readonly property int approval: root.initialized
    ? Model.computeApproval(root.happiness, root.coverage, root.fires.length,
        root.crimes.length, root.income - root.upkeep, root.population)
    : 0
  readonly property real nextElectionAt: Model.nextElectionTick(root.ageMinutes, root.lastElectionTick)
  readonly property int electionBar: Model.electionThreshold(root.lastElectionTick)

  // Losing does not delete the city — it puts the player out of office for a
  // year. A game left running for hours should never be able to throw that
  // away on one bad quarter, but an election with no consequence is not an
  // election.
  function runElection() {
    var score = root.approval
    root.lastApproval = score
    root.lastElectionTick = root.ageMinutes
    // A founding administration is judged on a lower bar than an incumbent.
    if (score >= Model.electionThreshold(root.lastElectionTick)) {
      root.notify(root.cityName + " — re-elected",
        Model.mayorTitle(root.mayorName) + " keeps the office with "
          + score + "% approval.")
      root.logEvent("election", Model.mayorTitle(root.mayorName)
        + " re-elected with " + score + "% approval.")
    } else {
      root.outOfOfficeUntil = root.ageMinutes + Model.TERM_OUT_TICKS
      root.notify(root.cityName + " — voted out",
        Model.mayorTitle(root.mayorName) + " loses the office on " + score
          + "% approval. An interim administration runs the city for a year.")
      root.logEvent("election", Model.mayorTitle(root.mayorName)
        + " voted out with " + score + "% approval.")
    }
    flushState()
  }

  function setTaxRate(percent) {
    if (root.outOfOffice) return
    var clamped = Math.max(0, Math.min(30, Math.round(percent)))
    if (clamped === root.taxRatePercent) return
    root.taxRatePercent = clamped
    flushState()
  }

  function renameCity(value) {
    var name = Model.sanitizeName(value)
    if (!root.initialized || !Model.validName(name)) return false
    if (name !== root.cityName) {
      root.cityName = name
      flushState()
    }
    return true
  }

  // The mayor's name may be cleared, unlike the city's — a player who does not
  // want to be named should not be forced into one.
  function renameMayor(value) {
    var name = Model.sanitizeName(value)
    if (!root.initialized) return false
    if (name !== root.mayorName) {
      root.mayorName = name
      flushState()
    }
    return true
  }

  // Wipes the grid and every stat back to a fresh city's defaults, keeping
  // the city's name (editable in Settings). foundedAtMs resets
  // too, so the calendar starts back at month 1 of a new founding year.
  // newCityName/newMayorName are optional: the new-city dialog supplies both,
  // and anything else keeps the names the city already had.
  function resetCity(newCityName, newMayorName) {
    if (Model.validName(newCityName)) root.cityName = Model.sanitizeName(newCityName)
    if (newMayorName !== undefined) root.mayorName = Model.sanitizeName(newMayorName)
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
    root.crimes = []
    root.ordinances = []
    root.lastElectionTick = 0
    root.sustainedTicks = 0
    root.sustainableAt = 0
    root.civicLevel = Model.CIVIC_MIN
    root.holdings = ({})
    root.outOfOfficeUntil = 0
    root.lastApproval = 0
    root.neighbors = Model.makeNeighbors(root.gridSize, Date.now())
    root.connectedNeighborNames = []
    root.history = []
    root.cityLog = []
    root.lastSeenMinute = 0
    root.brownoutActive = false
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
    if (root.outOfOffice) return false
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
    root.logEvent("dilemma", event.title + ": " + choice.outcome)
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
      // A crime wave drags the whole city's mood, not just its own blocks —
      // folded in here so happiness stays one number the sim agrees on.
      var happinessModifier = -root.crimes.length * Model.CRIME_HAPPINESS_HIT
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
        happinessModifier, incomeMultiplier, root.funding, root.neighbors, root.ordinances)
      root.grid = result.grid
      root.traffic = result.traffic
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
      // The teeth. Money in the market is money the city does not have, so a
      // shortfall is covered by selling the portfolio at a distress price
      // rather than being quietly absorbed by the treasury floor. This is the
      // moment an over-committed mayor finds out what the gamble cost.
      if (balance < 0 && root.portfolioValue > 0) {
        var rescue = Model.liquidateFor(root.holdings, root.neighbors,
          root.connectedNeighborNames, root.ageMinutes, root.cityStats, -balance)
        if (rescue.raised > 0) {
          root.holdings = rescue.holdings
          balance += rescue.raised
          var soldNames = rescue.sold.join(", ")
          root.notify(root.cityName + " — forced sale",
            "The books would not balance, so the city sold its stake in "
              + soldNames + " at a loss to cover the shortfall.")
          root.logEvent("loss", "Sold " + soldNames + " under duress for $"
            + Math.round(rescue.raised) + ".")
        }
      }
      root.treasury = Math.max(Model.TREASURY_FLOOR, balance)
      root.ageMinutes += 1

      // Checked after the tick has settled, against the figures it produced.
      var goal = Model.sustainability({
        stats: Model.summarize(root.grid), coverage: root.coverage,
        traffic: root.traffic, income: result.income, upkeep: result.upkeep,
        happiness: root.happiness, loans: root.loans
      })
      var before = Math.floor(root.civicLevel)
      root.civicLevel = Model.advanceCivic(root.civicLevel, root.civicTarget)
      var after = Math.floor(root.civicLevel)
      // Unlocking a whole building tier is one of the biggest things that can
      // happen to a city, and it used to arrive as a line in the history that
      // nobody had reason to open. Both directions are worth a notification:
      // losing a tier silently would be worse still.
      if (after > before) {
        root.notify(root.cityName + " — " + Model.civicLabel(root.civicLevel),
          "Your schools have earned the city tier " + after
            + " buildings. They are unlocked in the build palette now.")
        root.logEvent("milestone", "The city reaches " + Model.civicLabel(root.civicLevel).toLowerCase()
          + " status — tier " + after + " building unlocked.")
      } else if (after < before) {
        root.notify(root.cityName + " — standing lost",
          "Schooling has slipped, and the city is back to "
            + Model.civicLabel(root.civicLevel).toLowerCase() + " status. Tier "
            + before + " buildings can no longer be built until it recovers.")
        root.logEvent("loss", "Schooling has slipped: the city is back to "
          + Model.civicLabel(root.civicLevel).toLowerCase() + " status.")
      }

      var heldBefore = root.sustainedTicks
      root.sustainedTicks = Model.advanceSustainability(goal, heldBefore)
      if (root.sustainedTicks >= Model.SUSTAINABLE_HOLD_TICKS && root.sustainableAt === 0) {
        root.sustainableAt = root.ageMinutes
        root.notify(root.cityName + " is self-sustaining",
          "Balanced books, every service covered, traffic flowing and residents content — "
          + "held for " + Model.SUSTAINABLE_HOLD_TICKS + " months.")
        root.logEvent("milestone", root.cityName + " reached a self-sustaining economy.")
      } else if (heldBefore >= 6 && root.sustainedTicks === 0 && root.sustainableAt === 0) {
        root.logEvent("milestone", "The city slipped out of balance after "
          + heldBefore + " months.")
      }
      // Log a brownout only when the grid crosses into overload, not every
      // tick it stays there — otherwise one shortage floods the whole log.
      var strained = result.load && (result.load.power < 1 || result.load.water < 1)
      if (strained && !root.brownoutActive) {
        root.brownoutActive = true
        var which = result.load.power <= result.load.water ? "power" : "water"
        root.notify(root.cityName + " — brownouts",
          "The " + which + " grid is over capacity. Growth has stalled until you add another plant.")
        root.logEvent("brownout", "The " + which + " grid went over capacity.")
      } else if (!strained && root.brownoutActive) {
        root.brownoutActive = false
        root.logEvent("brownout", "The grid is back within capacity.")
      }
      root.advanceDisasters()
      if (root.outOfOfficeUntil > 0 && root.ageMinutes >= root.outOfOfficeUntil) {
        root.outOfOfficeUntil = 0
        root.notify(root.cityName, Model.mayorTitle(root.mayorName)
          + " returns to office. The city is yours again.")
        root.logEvent("election", "Returned to office.")
      }
      if (Model.electionDue(root.ageMinutes, root.lastElectionTick)) root.runElection()
      root.checkNeighbors(result.connectedNeighbors)
      root.checkMilestones()
      root.checkBudget()
      root.rollEvent()
      if (Math.round(root.ageMinutes) % Model.HISTORY_EVERY_TICKS === 0) {
        root.sampleHistory(result.income, result.upkeep)
        root.flushState()
      }
    }
  }

  // Fires burn, spread and are put out here rather than inside tickGrid,
  // because unlike growth they are events with a beginning and an end that
  // the player should be told about — the whole reason fire stopped being an
  // invisible dice roll.
  function advanceDisasters() {
    var utilities = Model.findUtilities(root.grid)
    if (root.fires.length > 0) {
      // Traffic is passed in so a jammed city genuinely responds more slowly,
      // using the survey the rest of the tick already computed.
      var result = Model.advanceFires(root.grid, root.gridSize, root.fires, utilities,
        root.funding, root.traffic)
      root.grid = result.grid
      var wasBurning = root.fires.length
      root.fires = result.fires
      if (result.destroyed > 0) {
        var lost = result.destroyed === 1 ? "A building has been lost to the fire."
          : result.destroyed + " buildings have been lost to the fire."
        root.notify(root.cityName + " — fire", lost)
        root.logEvent("loss", lost)
      } else if (result.fires.length === 0 && wasBurning > 0) {
        root.notify(root.cityName, "The fire is out.")
        root.logEvent("fire", "A fire was put out.")
      }
    }

    if (root.crimes.length > 0) {
      var crimeResult = Model.advanceCrime(root.grid, root.gridSize, root.crimes, utilities,
        root.funding, root.policy, root.traffic)
      root.grid = crimeResult.grid
      var wasRunning = root.crimes.length
      root.crimes = crimeResult.crimes
      // Theft is charged before the floor clamp like every other outgoing.
      var stolen = Model.crimeTheft(root.grid, root.gridSize, root.crimes)
      if (stolen > 0) root.treasury = Math.max(Model.TREASURY_FLOOR, root.treasury - stolen)
      if (crimeResult.suppressed > 0 && root.crimes.length === 0 && wasRunning > 0) {
        root.notify(root.cityName, "Police have broken up the crime wave.")
        root.logEvent("crime", "A crime wave was broken up.")
      }
    }

    var outbreak = Model.rollCrimeStart(root.grid, root.gridSize, root.crimes, utilities, root.funding, root.policy)
    if (outbreak >= 0) {
      root.crimes = root.crimes.concat([{ index: outbreak, ticks: 0 }])
      var patrolled = Model.isCovered(root.gridSize, utilities.police, outbreak,
        Model.POLICE_RADIUS * Model.fundingRadiusScale(Model.fundingLevel(root.funding, "S")))
      var crimeText = patrolled
        ? "A crime wave has broken out. Police are responding."
        : "A crime wave has broken out with no police station in range."
      root.notify(root.cityName + " — crime wave", crimeText)
      root.logEvent("crime", crimeText)
      flushState()
    }

    var ignition = Model.rollFireStart(root.grid, root.gridSize, root.fires, utilities, root.funding, root.policy)
    if (ignition >= 0) {
      root.fires = root.fires.concat([{ index: ignition, ticks: 0 }])
      var covered = Model.isCovered(root.gridSize, utilities.fire, ignition,
        Model.FIRE_RADIUS * Model.fundingRadiusScale(Model.fundingLevel(root.funding, "F")))
      var opening = covered ? "A fire broke out. Crews are on the scene."
        : "A fire broke out with no fire station in range."
      root.notify(root.cityName + " — fire!", opening)
      root.logEvent("fire", opening)
      flushState()
    }
  }

  function logEvent(kind, text) {
    root.cityLog = Model.pushLogEntry(root.cityLog, root.ageMinutes, kind, text)
  }

  // Called when the player opens the panel: everything logged after this
  // point is "new" until they look again.
  function markSeen() {
    if (root.ageMinutes === root.lastSeenMinute) return
    root.lastSeenMinute = root.ageMinutes
    flushState()
  }

  readonly property var unseenLog: Model.logSince(root.cityLog, root.lastSeenMinute)

  function sampleHistory(income, upkeep) {
    root.history = Model.recordHistory(root.history, {
      minute: root.ageMinutes, population: root.population, treasury: root.treasury,
      happiness: root.happiness, income: income, upkeep: upkeep
    })
  }

  // A newly-opened highway is worth telling the player about: it is the one
  // growth lever that comes from outside their own zoning.
  function checkNeighbors(connected) {
    var names = []
    for (var i = 0; i < connected.length; i++) names.push(connected[i].name)
    var known = root.connectedNeighborNames
    for (var n = 0; n < names.length; n++) {
      if (known.indexOf(names[n]) >= 0) continue
      root.notify(root.cityName, "The highway to " + names[n]
        + " is open — expect new arrivals and trade.")
      root.logEvent("neighbor", "Highway to " + names[n] + " opened.")
    }
    if (names.length !== known.length || names.join() !== known.join()) {
      root.connectedNeighborNames = names
      flushState()
    }
  }

  function checkMilestones() {
    var fresh = Model.newMilestones(root.population, root.reachedMilestones)
    if (fresh.length === 0) return
    root.reachedMilestones = root.reachedMilestones.concat(fresh)
    for (var i = 0; i < fresh.length; i++) {
      root.notify(root.cityName, "Population reached " + fresh[i] + "!")
      root.logEvent("milestone", "Population reached " + fresh[i] + ".")
    }
    flushState()
  }

  function checkBudget() {
    if (root.treasury < 0 && !root.budgetCrisisActive) {
      root.budgetCrisisActive = true
      root.notify(root.cityName + " — budget crisis",
        "The treasury has gone negative. Raise taxes or ease off building.")
      root.logEvent("budget", "The treasury went negative.")
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
      mayorName: root.mayorName,
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
      fires: root.fires,
      crimes: root.crimes,
      ordinances: root.ordinances,
      lastElectionTick: root.lastElectionTick,
      civicLevel: root.civicLevel,
      holdings: root.holdings,
      sustainedTicks: root.sustainedTicks,
      sustainableAt: root.sustainableAt,
      outOfOfficeUntil: root.outOfOfficeUntil,
      lastApproval: root.lastApproval,
      neighbors: root.neighbors,
      history: Model.packHistory(root.history),
      cityLog: root.cityLog,
      lastSeenMinute: root.lastSeenMinute
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
      mayorName = Model.sanitizeName(saved.mayorName)
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
      crimes = Array.isArray(saved.crimes) ? saved.crimes : []
      ordinances = Array.isArray(saved.ordinances) ? saved.ordinances : []
      lastElectionTick = Math.max(0, num(saved.lastElectionTick, 0))
      holdings = (saved.holdings && typeof saved.holdings === "object") ? saved.holdings : ({})
      civicLevel = saved.civicLevel !== undefined
        ? Math.max(Model.CIVIC_MIN, Math.min(Model.CIVIC_MAX, num(saved.civicLevel, Model.CIVIC_MIN)))
        : -1   // resolved below, once coverage can be computed from the grid
      sustainedTicks = Math.max(0, Math.round(num(saved.sustainedTicks, 0)))
      sustainableAt = Math.max(0, Math.round(num(saved.sustainableAt, 0)))
      outOfOfficeUntil = Math.max(0, num(saved.outOfOfficeUntil, 0))
      lastApproval = Math.max(0, Math.round(num(saved.lastApproval, 0)))
      neighbors = Array.isArray(saved.neighbors) && saved.neighbors.length === 4
        ? saved.neighbors : null
      // Pre-pack saves stored history as an array; both decode the same way.
      history = Array.isArray(saved.history) ? saved.history : Model.unpackHistory(saved.history)
      cityLog = Array.isArray(saved.cityLog) ? saved.cityLog : []
      lastSeenMinute = Math.max(0, num(saved.lastSeenMinute, 0))
    } catch (error) {
      saveProblem = "not valid JSON (" + error + ")"
      foundedAtMs = 0
      grid = Model.emptyGrid(gridSize)
    }

    // An existing save predates neighbours entirely; seed them off its own
    // founding time so the same city always gets the same four towns.
    if (!neighbors) neighbors = Model.makeNeighbors(gridSize, foundedAtMs || Date.now())

    // Which highways are open is derived from the grid, never restored from
    // the save — the roads *are* the truth. Persisting it separately meant a
    // shell restart came back thinking every existing connection was brand
    // new, and re-announced roads the player had built long ago.
    var alreadyOpen = Model.connectedNeighbors(grid, gridSize, neighbors)
    var openNames = []
    for (var c = 0; c < alreadyOpen.length; c++) openNames.push(alreadyOpen[c].name)
    connectedNeighborNames = openNames

    var founded = false
    if (foundedAtMs === 0) {
      foundedAtMs = Date.now()
      founded = true
    }

    initialized = true

    // A save from before civic level existed starts where its schools say it
    // belongs, not at the bottom — an established city must not wake up locked
    // out of tiers it has been building for hours.
    if (civicLevel < 0) {
      // Never below what the city has already built: a save from before this
      // existed must not wake up unable to build what it is standing in.
      civicLevel = Math.max(
        Model.civicTarget(Model.serviceCoverageStats(grid, gridSize),
          funding, Model.findUtilities(grid)),
        Model.highestBuiltTier(grid) + 1)
    }
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
