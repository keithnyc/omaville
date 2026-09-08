import QtQuick
import qs.Commons
import qs.Ui
import "Model.js" as Model
import "Traffic.js" as Traffic
import "Ambience.js" as Ambience
import "Waterfront.js" as Waterfront

// The whole city view — stats, action palette, the map, traffic, utility
// warnings — as a standalone component so it can be hosted either by the
// docked bar panel (Panel.qml) or a real resizable window (DetachedWindow.qml)
// without duplicating any of this. Everything here is decoupled from `bar`
// (every themed color/font falls back to Color/Style defaults) since a
// detached window has no bar to inherit from.
Item {
  id: root

  property var cityService: null
  property var bar: null
  // Gates the car/blink animation timer — false while hidden so a closed
  // panel or an unfocused/minimized detached window costs nothing.
  property bool active: true
  // A banner of what happened since the player last looked, shown when the
  // panel opens and dismissed by acknowledging it. The mark-as-seen is
  // deliberately *not* automatic on open: a fire that burned three buildings
  // while the panel was shut should not vanish because the panel was
  // briefly opened and closed again.
  property bool awaySummaryOpen: false
  // The Gazette. An idle game's best moments happen while nobody is watching,
  // and all the player gets on their return is a number that went up — this
  // turns the log the city already keeps into a front page worth reading.
  property bool gazetteOpen: false
  // Snapshotted at open, because opening marks the edition read: without this
  // the page would set its own cutoff to now and print a blank.
  property real gazetteSince: 0
  readonly property var gazettePage: root.gazetteOpen && root.serviceReady
    ? Model.gazette({
        cityName: root.cityService.cityName, mayorName: root.cityService.mayorName,
        ageMinutes: root.cityService.ageMinutes, sinceMinute: root.gazetteSince,
        log: root.cityLog, history: root.cityHistory, stats: root.budgetStats,
        happiness: root.happiness, treasury: root.treasury,
        jammed: Model.jammedLotShare(root.serviceReady ? root.cityService.traffic : null),
        unserved: root.unservedResidents,
        character: root.cityService.character,
        editorial: Model.editorial({
          outOfOffice: root.outOfOffice,
          spare: Model.redundantTotal(root.redundancy).count,
          largerNeighbor: root.largestRival,
          unserved: root.unservedResidents,
          treasury: root.treasury,
          debt: Model.totalLoanDebt(root.cityService.loans),
          net: root.budgetNet,
          departures: root.departuresSinceEdition,
          jammed: Model.jammedLotShare(root.cityService.traffic),
          taxRatePercent: root.taxRatePercent,
          character: root.cityService.character.key,
          happiness: root.happiness,
          tick: root.cityService.ageMinutes,
          // The one lever that silences all of the above.
          bought: root.ordinances.indexOf("press") >= 0
        }),
        letters: Model.citizenLetters(root.cityService.citizens, {
          grid: root.grid, gridSize: root.gridSize, utilities: root.utilities,
          funding: root.cityService.funding, traffic: root.cityService.traffic,
          crimes: root.crimes, fires: root.fires
        }, 3),
        obituaries: root.obituariesSinceEdition
      })
    : null
  // The biggest neighbour that has grown past this city, for the leader column.
  readonly property string largestRival: {
    var best = "", size = root.population
    for (var i = 0; i < root.neighbors.length; i++) {
      var pop = Model.neighborPopulation(root.neighbors[i])
      if (pop > size) { size = pop; best = root.neighbors[i].name }
    }
    return best
  }
  // Households that gave up since the last edition — the paper counts what it
  // has already printed rather than the whole history of the city.
  // The deaths since the last edition, straight from the log the city keeps —
  // so the paper can only mourn people the city actually recognised.
  readonly property var obituariesSinceEdition: {
    var out = []
    for (var i = 0; i < root.cityLog.length; i++) {
      if (root.cityLog[i].m <= root.gazetteSince) break
      if (root.cityLog[i].kind === "death") out.push(root.cityLog[i].text)
    }
    return out
  }
  readonly property int departuresSinceEdition: {
    var n = 0
    for (var i = 0; i < root.cityLog.length; i++) {
      if (root.cityLog[i].m <= root.gazetteSince) break
      if (root.cityLog[i].kind === "departure") n++
    }
    return n
  }
  readonly property int unservedResidents: {
    var n = 0
    for (var i = 0; i < root.serviceCoverage.length; i++)
      if (!root.serviceCoverage[i].optional) n += root.serviceCoverage[i].unmet
    return n
  }
  function openGazette() {
    if (!root.serviceReady) return
    root.gazetteSince = root.cityService.lastGazetteMinute
    root.gazetteOpen = true
    root.cityService.markGazetteRead()
  }
  readonly property string gazetteSerif: "Noto Serif"
  // The engravings are commissioned separately (assets/gazette/BRIEF-gazette.md)
  // and the page is built to read without them. Pointing an Image at a file
  // that is not there is not an error, but it does log a warning on every
  // repaint, which would bury a real one — so the sources are gated until the
  // art lands. tests/gazette.mjs fails if this flag and the files disagree, so
  // it cannot be left stale in either direction.
  readonly property bool gazetteArt: true
  // The trade vignettes, which are white-line engravings for a dark panel
  // rather than black ones for newsprint. Gated the same way and checked by
  // the same test, so the flag cannot outlive the files or vice versa.
  readonly property bool tradeArt: true
  readonly property var tradeKinds: ["works", "counter", "street", "retired"]
  onActiveChanged: {
    if (active && root.serviceReady && root.unseenEvents.length > 0) root.awaySummaryOpen = true
    // Opening the panel is a moment somebody is about to read the coverage
    // card, and the spare-building survey only refreshes on the tick.
    if (active && root.serviceReady) root.cityService.refreshRedundancy()
  }
  function acknowledgeAway() {
    root.awaySummaryOpen = false
    if (root.cityService) root.cityService.markSeen()
  }
  // Only used to pick which icon (detach vs. dock) the button in the
  // header shows — the actual window management lives in whichever host
  // (Panel.qml / DetachedWindow.qml / BarWidget.qml) is listening.
  property bool detached: false
  signal detachRequested()
  signal reattachRequested()

  // The canvas area's own size — the docked panel leaves these at the
  // fixed default; a resizable detached window binds them to its actual
  // available space, so "resize the window" really does mean "see more
  // of the map," not just more empty space around a fixed square.
  property int viewportWidth: 560
  property int viewportHeight: 560
  readonly property real mapTop: mapRow.y
  readonly property real footerHeight: toolStatusLabel.implicitHeight

  readonly property bool serviceReady: !!cityService && cityService.initialized === true
  readonly property var grid: cityService ? cityService.grid : []
  onGridChanged: root.detectGrowth()

  // Growth otherwise happens completely silently — a tile just redraws
  // different the next time its cell is painted, with nothing calling out
  // the moment it actually happened. Diffing each new grid against the
  // previous one (rather than having Model.tickGrid report growth
  // explicitly) keeps this purely a CityView concern: the sim doesn't need
  // to know anything about how growth is *shown*, only that it happened.
  property var previousGrid: []
  property var growthFlashes: []
  readonly property int growthFlashDuration: 900

  function detectGrowth() {
    var prev = root.previousGrid
    var next = root.grid
    // First load (or a grid-size migration) has no meaningful "previous" to
    // diff against — every built tile would otherwise register as having
    // just grown from nothing.
    if (prev.length !== next.length) {
      root.previousGrid = next
      return
    }
    var fresh = []
    for (var i = 0; i < next.length; i++) {
      if (prev[i] === next[i]) continue
      var oldTile = Model.parseTile(prev[i])
      var newTile = Model.parseTile(next[i])
      if (newTile.type !== oldTile.type) continue
      if ((newTile.type === Model.TILE_RES || newTile.type === Model.TILE_COM || newTile.type === Model.TILE_IND)
          && newTile.level > oldTile.level) {
        fresh.push({ index: i, start: Date.now(), color: root.roofColors[newTile.type] })
      }
    }
    root.previousGrid = next
    if (fresh.length > 0) root.growthFlashes = root.growthFlashes.concat(fresh)
  }

  // Advanced by the 80ms utility-blink timer — expired entries are
  // dropped there so this list never grows without bound.
  function drawGrowthFlash(ctx, cx, cy, cellSize, flash, now) {
    var t = (now - flash.start) / root.growthFlashDuration
    if (t < 0 || t > 1) return
    var eased = 1 - Math.pow(1 - t, 2)
    var radius = cellSize * (0.22 + eased * 0.55)
    ctx.globalAlpha = (1 - t) * 0.85
    ctx.strokeStyle = flash.color
    ctx.lineWidth = Math.max(1.5, cellSize * 0.06 * (1 - t * 0.6))
    ctx.beginPath()
    ctx.arc(cx, cy, radius, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  readonly property int gridSize: cityService ? cityService.gridSize : Model.GRID_SIZE
  // Recomputed only when the grid itself changes (zoning, a sim tick) —
  // the blink overlay redraws far more often than that, so it just reads
  // this cached plant list rather than rescanning the whole grid for it
  // on every animation frame.
  // Whole-grid figures come from the service, which computes them once for
  // every open view. They used to be recomputed here as well, so a single
  // painted tile cost two full grid scans with the panel open and three with
  // the detached window beside it — which is what made painting a long road
  // drop tiles. The fallbacks only run before a service is attached.
  readonly property var utilities: root.cityService
    ? root.cityService.utilities : Model.findUtilities(root.grid)
  readonly property var serviceCoverage: root.cityService
    ? root.cityService.coverage
    : Model.serviceCoverageStats(root.grid, root.gridSize,
        root.serviceReady ? root.cityService.funding : null)
  readonly property int population: cityService ? cityService.population : 0
  readonly property int jobs: cityService ? cityService.jobs : 0
  readonly property real treasury: cityService ? cityService.treasury : 0
  readonly property int happiness: cityService ? cityService.happiness : 0
  // Model.computeDemand's raw growth-chance multipliers. Each zone's formula
  // has its own achievable [min, max] (mirrored here from computeDemand's
  // own constants), and the three are not on the same literal scale, so each
  // bar is rescaled against its own achievable span — floor to -100%, ceiling
  // to +100%. The spans come from Model rather than being copied here: this
  // file used to carry its own I: { min: 0.6, max: 0.9 }, mirroring the old
  // formula's constants by hand, which is exactly the arrangement that had the
  // coverage card measuring a different radius from the map.
  readonly property var demand: cityService ? cityService.demand : ({ R: 1, C: 1, I: 1 })
  readonly property var demandRange: Model.DEMAND_RANGE
  function demandPercent(key, value) {
    var range = root.demandRange[key]
    var span = range.max - range.min
    var pct = span > 0 ? (value - range.min) / span * 200 - 100 : 0
    return Math.max(-100, Math.min(100, Math.round(pct)))
  }
  readonly property int taxRatePercent: cityService ? cityService.taxRatePercent : 10
  readonly property var calendar: Model.calendarFor(cityService ? cityService.ageMinutes : 0)
  onCalendarChanged: calendarPulse.restart()

  // Mayor's dilemmas — Reigns-style binary decisions. Shown automatically
  // (no toggle to open it) whenever there's one waiting, since the whole
  // point is that it's the mayor's call, not something to dismiss unread.
  // Stacking is intentional: only the oldest shows at a time, and resolving
  // it reveals the next one straight away.
  readonly property var pendingEvents: cityService ? cityService.pendingEvents : []
  readonly property var currentEvent: pendingEvents.length > 0 ? pendingEvents[0] : null

  // Model tile-type char for the currently selected tool, or the sentinel
  // "bulldoze" for the clear tool. "" means no tool selected (right-click
  // to get here) — a neutral "just looking" cursor.
  property string activeTool: Model.TILE_ROAD
  // Hovering a palette icon previews its name/cost in the status line;
  // empty falls back to describing whatever's actually selected — same
  // "bottom-left status readout" pattern the original SimCity's icon
  // palette used instead of per-icon tooltips.
  property string hoveredToolType: ""
  onActiveToolChanged: {
    if (root.activeTool !== "inspect") root.inspectedIndex = -1
    root.flyoutType = ""
  }

  // Remember the exact selected infrastructure tier for direct placement
  // and upgrading matching buildings to that tier in a single action.
  readonly property var upgradeableTypes: [Model.TILE_PARK, Model.TILE_POWER, Model.TILE_WATER, Model.TILE_FIRE, Model.TILE_POLICE, Model.TILE_SCHOOL, Model.TILE_MEDICAL, Model.TILE_TRANSIT]
  property string upgradeTarget: ""
  property int selectedTier: 0
  // The tier flyout lives at the root of CityView, not inside the 34px tool
  // button it belongs to. A child drawn outside its parent's bounds is not in
  // the hit-test path there, so the flyout rendered correctly over the map and
  // the map's own MouseArea took every pointer event inside it — the flyout
  // was visible and completely unreachable. These carry the identity and
  // position the shared instance needs.
  property string flyoutType: ""
  property real flyoutAnchorX: 0
  property real flyoutAnchorY: 0
  readonly property bool flyoutDecorations: root.flyoutType === "decorations"
  readonly property bool flyoutUpgradeable: root.upgradeableTypes.indexOf(root.flyoutType) >= 0
  function openFlyoutFor(button, type) {
    var p = button.mapToItem(root, button.width, button.height / 2)
    root.flyoutAnchorX = p.x
    root.flyoutAnchorY = p.y
    root.flyoutType = type
  }
  property string decorationTool: Model.TILE_TREE
  // One shared summarize for everything that needs whole-city figures — the
  // Budget card's rows would otherwise each rescan the grid on every change.
  readonly property var budgetStats: root.cityService
    ? root.cityService.cityStats : Model.summarize(root.grid)
  // Read from the service rather than recomputed, so the Budget card cannot
  // quote a different bill from the one the treasury is actually charged.
  // It used to: both of these omitted ordinances, so passing one moved the
  // money without moving the number explaining it.
  readonly property real budgetIncome: root.serviceReady ? root.cityService.income : 0
  readonly property real budgetUpkeep: root.serviceReady ? root.cityService.upkeep : 0
  readonly property real budgetNet: root.budgetIncome - root.budgetUpkeep
  readonly property var cityHistory: root.serviceReady ? root.cityService.history : []
  readonly property var cityLog: root.serviceReady ? root.cityService.cityLog : []
  // Logged after the player last looked — drives the "while you were away"
  // summary and the unseen dots beside each entry.
  readonly property var unseenEvents: root.serviceReady ? root.cityService.unseenLog : []
  // Also from the service: without its ordinance effects, the water gauge
  // showed the draw a city would have had without its conservation ordinance.
  readonly property var utilityLoad: root.cityService
    ? root.cityService.load : Model.utilityLoad(root.grid, root.budgetStats)
  readonly property var upkeepBill: root.serviceReady ? root.cityService.upkeepBill : []
  // Active map data overlay ("" = off). The advisors name a problem; this is
  // how the player finds it on a 4096-tile map instead of hunting by hand.
  readonly property var fires: root.serviceReady ? root.cityService.fires : []
  readonly property var crimes: root.serviceReady ? root.cityService.crimes : []
  readonly property var neighbors: root.serviceReady ? root.cityService.neighbors : []
  readonly property var ordinances: root.serviceReady ? root.cityService.ordinances : []
  readonly property int approval: root.serviceReady ? root.cityService.approval : 0
  readonly property bool outOfOffice: root.serviceReady && root.cityService.outOfOffice
  readonly property int monthsOutOfOffice: root.serviceReady
    ? Math.max(1, Math.ceil(root.cityService.outOfOfficeUntil - root.cityService.ageMinutes)) : 0
  readonly property string outOfOfficeSpan: root.monthsOutOfOffice
    + (root.monthsOutOfOffice === 1 ? " more month" : " more months")
  // Buildings covering only what another already covers. Refreshed on the
  // tick and whenever a view is about to show it, never per grid change —
  // see Service.refreshRedundancy.
  readonly property var redundancy: root.serviceReady ? root.cityService.redundancy : []
  // Indices of the spare buildings for whichever coverage overlay is open, so
  // the map can point at them instead of only counting them in a card.
  readonly property var spareIndices: {
    var out = ({})
    if (!root.overlayDef || !root.overlayDef.service) return out
    for (var i = 0; i < root.redundancy.length; i++) {
      if (root.redundancy[i].key !== root.overlayDef.service) continue
      var list = root.redundancy[i].removable
      for (var j = 0; j < list.length; j++) out[list[j].index] = true
    }
    return out
  }
  readonly property var connectedNeighbors: root.cityService
    ? root.cityService.linkedNeighbors
    : Model.connectedNeighbors(root.grid, root.gridSize, root.neighbors)
  readonly property bool cityBurning: root.fires.length > 0
  property string overlayMode: ""
  readonly property var overlayDef: root.overlayMode !== "" ? Model.overlayDef(root.overlayMode) : null
  function setOverlay(mode) { root.overlayMode = root.overlayMode === mode ? "" : mode }
  // The survey only refreshes on the tick, so bring it up to date the moment
  // someone actually looks at it — otherwise a road just widened still reads
  // as jammed until the next month rolls over. On the property rather than in
  // setOverlay because the picker and the advisors set overlayMode directly.
  onOverlayModeChanged: {
    if (!root.serviceReady) return
    if (root.overlayMode === "traffic") root.cityService.refreshTraffic()
    else if (root.overlayMode !== "") root.cityService.refreshRedundancy()
  }
  readonly property int spareCount: {
    var n = 0
    for (var i = 0; i < root.redundancy.length; i++)
      if (!root.overlayDef || !root.overlayDef.service
        || root.redundancy[i].key === root.overlayDef.service)
        n += root.redundancy[i].removable.length
    return n
  }
  readonly property string overlayLegend: {
    if (!root.overlayDef) return ""
    if (root.overlayMode === "growth") return "Red: blocked from growing · dim: fully grown"
    if (root.overlayMode === "value") return "Brighter: higher land value from parks, water and landscaping"
    if (root.overlayMode === "traffic") return "Roads — green: flowing · amber: busy · red: gridlocked"
    return "Green: in range · red: built but uncovered"
      + (root.overlayDef.serves === "R" ? " · homes only, this one does nothing for shops or works" : "")
      + (root.spareCount > 0
        ? " · amber ✕: spare, covers nothing another does not" : "")
  }
  // Advisors run off the figures already computed above rather than rescanning
  // the grid themselves — the panel is only ever as expensive as one summarize.
  // Both live on the service now, so the panel and the bar widget report the
  // same advice from one computation instead of each rebuilding it.
  readonly property real civicLevel: root.serviceReady ? root.cityService.civicLevel : Model.CIVIC_MAX
  readonly property var cityAdvice: root.serviceReady ? root.cityService.advice : []
  readonly property var topAdvice: root.serviceReady ? root.cityService.topAdvice : null
  readonly property int attractiveness: Model.computeAttractiveness(root.budgetStats)
  readonly property var decorationSpriteUrls: ({
    T: Qt.resolvedUrl("assets/decorations/tree.png").toString(),
    B: Qt.resolvedUrl("assets/decorations/flowers.png").toString(),
    G: Qt.resolvedUrl("assets/decorations/hedge.png").toString(),
    K: Qt.resolvedUrl("assets/decorations/bench.png").toString(),
    V: Qt.resolvedUrl("assets/decorations/statue.png").toString(),
    O: Qt.resolvedUrl("assets/decorations/fountain.png").toString(),
    U: Qt.resolvedUrl("assets/decorations/arbour.png").toString(),
    J: Qt.resolvedUrl("assets/decorations/bandstand.png").toString()
  })

  function toolHint(type) {
    if (type === Model.TILE_LAKE) return "Water · $4 per tile\nPaint rivers and lakes on empty land. Roads over water become $35 bridges."
    if (type === Model.TILE_WATERFRONT_PARK) return "Waterfront Park · $30\nPlace on empty land beside water for a garden and pier. Adds park happiness."
    if (type === Model.TILE_ROAD) return "Road · $10 on land / $35 bridge on water\nServes zones up to 2 steps away through lots, gardens or open land. Water and service buildings block access. Removing a bridge restores water."
    if (type === Model.TOOL_AVENUE) return "Avenue · $30 new / $20 to widen a street\nCarries about two and a half times a street. Costs more to maintain."
    if (type === Model.TILE_PATH) return "Footpath · $" + Model.PATH_COST + " on land / $"
      + Model.PATH_BRIDGE_COST + " over water\nServes lots exactly as a road does, and carries "
      + "no cars at all — a block reached only on foot puts nothing on the network. "
      + "Industry needs a real road; shops on a path alone grow slowly."
    if (type === Model.TILE_TRANSIT) return "Transit · $130\nTakes car trips off the roads nearby. Costs a monthly per-resident budget like the other departments."
    if (type === "decorations") return "Decorations · hover to choose\nSix kinds, from a $10 hedgerow to a $55 fountain. Raise nearby home values and residential demand; the dearer ones raise them more."
    if (type === "inspect") return "Inspect · click a tile for services, property value and upgrades."
    if (type === "bulldoze") return "Bulldoze · remove a tile and reclaim its construction cost."
    var hint = (Model.TILE_LABELS[type] || type) + " · $" + Model.COSTS[type]
    if (Model.isDecoration(type))
      return hint + "\nImproves homes within 3 tiles. Property bonus capped at 25%; city appeal capped at 15%."
    if (root.upgradeableTypes.indexOf(type) >= 0) hint += "\nHover for placement and upgrade tiers."
    return hint
  }

  // Index of the tile the Info tool last clicked, or -1 for none. Recomputed
  // live from Model.inspectTile (the exact same helpers tickGrid uses) so
  // the card never shows a stale snapshot — if the tile changes under it
  // (grows, gets bulldozed), the tooltip just describes whatever's there now.
  property int inspectedIndex: -1
  readonly property int tileHoverIndex: root.active && root.serviceReady && gridMouse.containsMouse
    && !gridMouse.pressed && !gridMouse.painting && !gridMouse.panning
    && !root.gameMenuOpen && !root.settingsOpen && !root.confirmNewGameOpen && !root.currentEvent && root.flyoutType === ""
    ? gridMouse.tileIndexAt(gridMouse.mouseX, gridMouse.mouseY) : -1
  property bool tileHoverReady: false
  onTileHoverIndexChanged: {
    tileHoverReady = false
    tileHoverDelay.stop()
    if (tileHoverIndex >= 0) tileHoverDelay.restart()
  }
  readonly property var hoveredTileInfo: tileHoverReady && tileHoverIndex >= 0
    ? Model.inspectTile(root.grid, root.gridSize, tileHoverIndex, root.utilities, root.demand, root.population, root.treasury, root.civicLevel) : null
  Timer {
    id: tileHoverDelay
    interval: 650
    onTriggered: root.tileHoverReady = root.tileHoverIndex >= 0
  }
  readonly property var inspectedInfo: root.inspectedIndex >= 0 && root.serviceReady
    ? Model.inspectTile(root.grid, root.gridSize, root.inspectedIndex, root.utilities, root.demand, root.population, root.treasury, root.civicLevel)
    : null

  function inspectTitle(info) {
    if (!info) return ""
    if (info.type === Model.TILE_ROAD)
      return info.level === 3 ? "Avenue bridge" : info.level === 2 ? "Avenue"
        : info.level === 1 ? "Bridge" : "Road"
    if (info.tierName) return info.tierName + " · Tier " + (info.level + 1)
    var label = Model.TILE_LABELS[info.type] || "Unknown"
    var isZone = info.type === Model.TILE_RES || info.type === Model.TILE_COM || info.type === Model.TILE_IND
    if (!isZone) return label
    return label + " · " + (info.level > 0 ? ("Level " + info.level) : "Undeveloped")
  }

  function inspectLines(info) {
    if (!info) return []
    var lines = []
    // Who lives here, kept in its own list: the zone branch below replaces
    // `lines` wholesale, so anything pushed before it would be silently
    // discarded. Prepended at the return, because it is the only line on the
    // card about a person and it should not be the fifth thing read.
    // A road says which street it is, so the name in a letter can be found by
    // clicking the road itself.
    var whoLines = []
    if (info.type === Model.TILE_PATH) {
      lines.push(info.level % 2 === 1
        ? "Footbridge · bulldoze restores the water"
        : "Footpath · reaches lots like a road, carries no cars")
      lines.push("Industry cannot be served by one; shops on a path alone grow slowly")
    }
    if ((info.type === Model.TILE_ROAD || info.type === Model.TILE_PATH) && root.serviceReady) {
      var onStreet = Model.roadStreet(root.grid, root.gridSize, info.index,
        root.cityService.streetNames)
      if (onStreet) whoLines.push(onStreet.name + (onStreet.named ? " — your name for it" : ""))
    }
    var who = root.residentAt(info.index)
    if (who) {
      whoLines.push(who.name + ", " + who.age + " — " + (who.trade || "no trade recorded"))
      whoLines.push("Of " + who.street + ", here since Year " + who.arrivedYear
        + " (" + who.yearsHere + " years)")
      if (who.grievance) whoLines.push("Unhappy: see the Gazette's letters column")
    }
    var isZone = info.type === Model.TILE_RES || info.type === Model.TILE_COM || info.type === Model.TILE_IND
    if (isZone) {
      lines = [
        "Reached by: " + (info.roadAdjacent ? "road"
          : Model.hasFootAccess(root.grid, root.gridSize, info.index) ? "footpath only"
          : "nothing yet"),
        "Power: " + (info.powerCovered ? "Yes" : "No"),
        "Water: " + (info.waterCovered ? "Yes" : "No"),
        "Fire cover: " + (info.fireCovered ? "Yes" : "No"),
        "Police cover: " + (info.policeCovered ? "Yes" : "No")
      ]
      if (info.demand !== undefined) lines.push("Demand: " + root.demandPercent(info.type, info.demand) + "%")
      if (info.type === Model.TILE_RES) {
        lines.push("Education: " + (info.educationCovered ? "Covered · growth boosted" : "Unserved · growth slows after Pop 100"))
        lines.push("Healthcare: " + (info.medicalCovered ? "Covered · growth boosted" : "Unserved · growth slows after Pop 100"))
        lines.push("Property value: +" + info.propertyBonus + "% · growth / tax bonus")
        if (info.waterfrontBonus) lines.push("Waterfront contributes +" + info.waterfrontBonus + "% (maximum 12%)")
        if (info.nearIndustrial) lines.push("Near industrial — growth slowed")
        if (info.nearCommercial) lines.push("Near commercial — growth boosted")
      }
    }
    if (info.upgrade) {
      if (info.type !== Model.TILE_SCHOOL && info.type !== Model.TILE_MEDICAL
          && info.type !== Model.TILE_TRANSIT && root.coverageRadii[info.type])
        lines.push("Service range: " + Math.round(root.coverageRadii[info.type] * Model.INFRA_RADIUS_SCALE[info.level] * 10) / 10 + " tiles")
      if (info.type === Model.TILE_SCHOOL)
        lines.push("Education range: " + Model.SCHOOL_RADIUS * Model.INFRA_RADIUS_SCALE[info.level] + " tiles")
      if (info.type === Model.TILE_MEDICAL)
        lines.push("Healthcare range: " + Model.MEDICAL_RADIUS * Model.INFRA_RADIUS_SCALE[info.level] + " tiles")
      if (info.type === Model.TILE_TRANSIT)
        lines.push("Takes " + Math.round(Model.TRANSIT_RELIEF[info.level] * 100)
          + "% of car trips off the roads within "
          + Model.TRANSIT_RADIUS * Model.INFRA_RADIUS_SCALE[info.level] + " tiles")
      var u = info.upgrade
      if (u.reason === "max-level") lines.push("Max tier reached")
      else if (u.reason === "locked") lines.push("Upgrade needs Pop " + u.threshold + " ($" + u.cost + ")")
      else if (u.reason === "unschooled")
        lines.push("Upgrade needs " + Model.civicLabel(u.civicNeeded).toLowerCase()
          + " status — build and fund schools ($" + u.cost + ")")
      else if (u.reason === "cant-afford") lines.push("Upgrade ready — needs $" + u.cost)
      else if (u.ok) lines.push("Upgrade ready — $" + u.cost + " (hover the tool icon)")
    }
    if (Model.isDecoration(info.type))
      lines.push("Beautifies homes within 3 tiles (+" + Model.DECORATIONS[info.type].weight + " next door, less further out)",
        "Contributes to city appeal: +" + root.attractiveness + "% residential demand")
    if (info.type === Model.TILE_ROAD) {
      var overWater = info.level % 2 === 1
      var avenue = info.level >= 2
      lines.push(overWater ? "Carries traffic over water · bulldoze restores water"
        : "Connects buildings and carries traffic")
      lines.push("Capacity " + Model.roadCapacity(info.level) + " trips"
        + (avenue ? "" : " · widen to an avenue for " + Model.roadCapacity(2)))
      var congestion = root.serviceReady && root.cityService.traffic
        && root.cityService.traffic.roadCongestion
        ? (root.cityService.traffic.roadCongestion[info.index] || 0) : 0
      if (congestion > 0)
        lines.push("Currently at " + Math.round(congestion * 100) + "% of capacity"
          + (congestion >= Model.CONGESTION_JAM ? " — gridlocked"
            : congestion >= Model.CONGESTION_WATCH ? " — busy" : ""))
    }
    if (info.type === Model.TILE_LAKE)
      lines.push("Natural water · nearby homes gain up to 12% value", "Draw a road here to build a $35 bridge", "Does not provide utility water")
    if (info.type === Model.TILE_WATERFRONT_PARK)
      lines.push("Waterfront garden · contributes to park happiness")
    if (info.type === Model.TILE_PARK)
      lines.push("Park happiness contribution: +" + Model.PARK_BONUS_PER_LEVEL[info.level])
    return whoLines.concat(lines)
  }

  // --- game menu: the third UX category (game-level actions, distinct
  // from the build palette and the view controls) — today just New Game,
  // with Settings/Save Game listed as visible-but-disabled placeholders
  // so the menu's shape doesn't need to change again once they're built.
  property bool gameMenuOpen: false
  property bool confirmNewGameOpen: false
  property bool settingsOpen: false
  property bool budgetOpen: false
  property string budgetTab: "bill"
  property bool advisorsOpen: false
  property bool overlayMenuOpen: false
  property bool historyOpen: false
  property bool goalOpen: false
  property bool marketOpen: false
  // The residents. The whole reason for naming anybody: being able to ask who
  // lives here rather than only how many.
  property bool residentsOpen: false
  readonly property var citizenContext: root.serviceReady ? ({
    grid: root.grid, gridSize: root.gridSize, utilities: root.utilities,
    funding: root.cityService.funding, traffic: root.cityService.traffic,
    crimes: root.crimes, fires: root.fires, ageMinutes: root.cityService.ageMinutes,
    streetNames: root.cityService.streetNames
  }) : null
  readonly property var residents: {
    if (!root.serviceReady) return []
    var out = []
    var people = root.cityService.citizens
    for (var i = 0; i < people.length; i++)
      out.push(Model.citizenBio(people[i], root.citizenContext))
    // Longest-standing first: the city's memory, not its arrivals board.
    out.sort(function (a, b) { return b.yearsHere - a.yearsHere })
    return out
  }
  function residentAt(index) {
    for (var i = 0; i < root.residents.length; i++)
      if (root.residents[i].index === index) return root.residents[i]
    return null
  }
  readonly property bool editingTownName:
    (root.settingsOpen && townNameInput.activeFocus)
    || (root.confirmNewGameOpen
        && (newCityInput.activeFocus || newMayorInput.activeFocus))
  Shortcut {
    sequence: "F2"
    enabled: root.active && root.serviceReady
    onActivated: root.activateGameMenuItem("name")
  }
  onSettingsOpenChanged: {
    if (settingsOpen) townNameInput.text = root.serviceReady ? root.cityService.cityName : ""
  }
  onConfirmNewGameOpenChanged: {
    if (!confirmNewGameOpen) return
    // Carried over rather than blanked: starting again with the same names is
    // the common case, and retyping them is the annoying one.
    newCityInput.text = root.serviceReady ? root.cityService.cityName : ""
    newMayorInput.text = root.serviceReady ? root.cityService.mayorName : ""
    newCityInput.forceActiveFocus()
    newCityInput.selectAll()
  }
  // Two groups, not one list. Everything above the rule acts on the city you
  // are playing; everything below it acts on the game itself. New Game sat at
  // the top next to Budget, which is one slip away from ending a city built
  // over hours — it is now last, furthest from anything reached by habit.
  readonly property var gameMenuItems: [
    { action: "budget", label: "Budget", enabled: root.serviceReady },
    { action: "advisors", label: "Advisors", enabled: root.serviceReady },
    { action: "history", label: "History", enabled: root.serviceReady },
    { action: "market", label: "Market", enabled: root.serviceReady },
    { action: "residents", label: "Residents", enabled: root.serviceReady },
    { action: "goal", label: "City Goal", enabled: root.serviceReady },
    { action: "name", label: "Name Town", enabled: root.serviceReady },
    { action: "", label: "", enabled: false, heading: true },
    { action: "settings", label: "Settings", enabled: true },
    { action: "save", label: "Save Game", enabled: false },
    { action: "new", label: "New Game", enabled: true }
  ]
  function activateGameMenuItem(action) {
    root.gameMenuOpen = false
    if (action === "new") root.confirmNewGameOpen = true
    else if (action === "budget") root.budgetOpen = true
    else if (action === "advisors") root.advisorsOpen = true
    else if (action === "history") root.historyOpen = true
    else if (action === "goal") root.goalOpen = true
    else if (action === "market") root.marketOpen = true
    else if (action === "residents") root.residentsOpen = true
    else if (action === "settings") root.settingsOpen = true
    else if (action === "name") {
      root.settingsOpen = true
      townNameInput.forceActiveFocus()
      townNameInput.selectAll()
    }
  }

  // A build cost is only half the story — every one of these arrives again
  // every month, which is easy to miss until the treasury stops growing.
  function monthlyNote(type, level) {
    var monthly = Model.monthlyCostOf(type, level || 0)
    return monthly > 0 ? " · $" + (monthly < 1 ? monthly.toFixed(2) : Math.round(monthly)) + "/mo" : ""
  }

  function toolStatusText() {
    if (root.outOfOffice && root.serviceReady)
      return "Out of office — the interim administration is building nothing for "
        + root.outOfOfficeSpan
    var t = root.hoveredToolType !== "" ? root.hoveredToolType : root.activeTool
    if (t === Model.TILE_ROAD) return "Road — $10 on land · $35 bridge over water" + root.monthlyNote(t, 0)
    if (t === Model.TOOL_AVENUE) return "Avenue — $30 new · $20 to widen a street · carries 2.5x a street"
    if (t === Model.TILE_LAKE) return "Water — $4 · paint empty land · waterfront homes gain up to 12%"
    if (t === Model.TILE_WATERFRONT_PARK) return "Waterfront Park — $30 · requires empty land beside water" + root.monthlyNote(t, 0)
    if (t === "decorations") return "Decorations — hover to choose one of six"
    if (Model.isDecoration(t)) return Model.TILE_LABELS[t] + " — $" + Model.COSTS[t] + " · improves nearby home values"
    var item = null
    for (var i = 0; i < root.toolList.length; i++) {
      if (root.toolList[i].type === t) { item = root.toolList[i]; break }
    }
    if (!item) return "Click/drag to build · middle-drag to pan · scroll to zoom"
    if (t === "inspect") return item.label + " — click a tile to inspect it"
    if (root.upgradeTarget !== "" && root.upgradeTarget === t)
      return Model.UPGRADE_TIER_NAMES[t][root.selectedTier] + " — $"
        + Model.totalInvestment(t, root.selectedTier) + " new · existing buildings pay only the difference"
        + root.monthlyNote(t, root.selectedTier)
    var cost = t === "bulldoze" ? "free" : ("$" + Model.COSTS[t])
    var holdHint = root.upgradeableTypes.indexOf(t) >= 0 ? " · hover for upgrades" : ""
    return item.label + " — " + cost + root.monthlyNote(t, 0) + holdHint
  }

  // --- viewport: the canvas is a fixed-size window onto a much bigger
  // grid, panned/zoomed independently of the city data itself. Pan/zoom
  // are view state, not city state — they reset to a sensible default
  // (centered on the built area) each time the view is (re)created rather
  // than persisting, since "where you last looked" isn't worth a save-file
  // field.
  readonly property int baseCellSize: 32
  property real zoom: 1.0
  property real panX: 0
  property real panY: 0
  readonly property real effectiveCellSize: baseCellSize * zoom
  property bool panInitialized: false

  // When the whole grid (at this zoom) is smaller than the viewport —
  // unreachable in the docked panel's small fixed viewport, but easy to
  // hit by zooming out in a big detached window — clamping to [0, max]
  // degenerates to always 0, pinning the content to the top-left corner
  // instead of centering it in the extra space. Center it in that case
  // instead, with a negative pan offset if needed.
  function clampPan() {
    var contentSize = root.gridSize * root.effectiveCellSize
    root.panX = contentSize <= root.viewportWidth
      ? (contentSize - root.viewportWidth) / 2
      : Math.max(0, Math.min(contentSize - root.viewportWidth, root.panX))
    root.panY = contentSize <= root.viewportHeight
      ? (contentSize - root.viewportHeight) / 2
      : Math.max(0, Math.min(contentSize - root.viewportHeight, root.panY))
  }

  // Take the player to a tile. The reason the letters column names a street
  // at all: a complaint about Beacon Street is only actionable if the map can
  // be asked where Beacon Street is.
  property int highlightIndex: -1
  function goToTile(index) {
    if (index < 0 || index >= root.gridSize * root.gridSize) return
    if (root.zoom < 1.0) root.setZoom(1.0)
    var cell = root.effectiveCellSize
    root.panX = ((index % root.gridSize) + 0.5) * cell - root.viewportWidth / 2
    root.panY = (Math.floor(index / root.gridSize) + 0.5) * cell - root.viewportHeight / 2
    clampPan()
    root.highlightIndex = index
    highlightTimer.restart()
  }
  Timer {
    id: highlightTimer
    interval: 4000
    onTriggered: root.highlightIndex = -1
  }

  // Street names for labelling the roads. Costs about a millisecond per grid
  // change on a mature city, which is 5% of the whole per-tile cost of a road
  // drag — so it is gated on the zoom that drawStreetNames needs anyway. A
  // conditional binding only registers the dependencies of the branch it
  // takes, so zoomed out this does not depend on the grid at all and a long
  // drag pays nothing for it.
  readonly property real streetLabelZoom: 26
  readonly property var streetRuns: root.effectiveCellSize >= root.streetLabelZoom
    ? Model.streetRuns(root.grid, root.gridSize,
        root.serviceReady ? root.cityService.streetNames : null) : []

  function centerOnGrid() {
    var mid = root.gridSize * root.effectiveCellSize / 2
    root.panX = mid - root.viewportWidth / 2
    root.panY = mid - root.viewportHeight / 2
    clampPan()
  }

  // Zooming keeps whatever's at the viewport's center anchored in place,
  // rather than always zooming toward the grid's top-left corner.
  function setZoom(newZoom) {
    var clamped = Math.max(0.4, Math.min(2.5, newZoom))
    if (Math.abs(clamped - root.zoom) < 0.001) return
    var oldEffective = root.effectiveCellSize
    var centerWorldX = (root.panX + root.viewportWidth / 2) / oldEffective
    var centerWorldY = (root.panY + root.viewportHeight / 2) / oldEffective
    root.zoom = clamped
    var newEffective = root.baseCellSize * root.zoom
    root.panX = centerWorldX * newEffective - root.viewportWidth / 2
    root.panY = centerWorldY * newEffective - root.viewportHeight / 2
    clampPan()
  }

  function initPanIfReady() {
    if (root.panInitialized || !root.serviceReady) return
    root.panInitialized = true
    root.centerOnGrid()
  }

  Component.onCompleted: {
    initPanIfReady()
    if (root.active && root.serviceReady && root.unseenEvents.length > 0)
      root.awaySummaryOpen = true
  }
  onServiceReadyChanged: initPanIfReady()

  // --- traffic: small cosmetic cars wandering the road network. Purely
  // decorative — not persisted, not part of the sim, alive only while
  // `active` (see the Timer below) so a hidden view costs nothing.
  // Drawn on their own overlay canvas (see trafficCanvas) so animating
  // them doesn't force a full tile repaint 30 times a second — only the
  // cars themselves get redrawn that often.
  property var cars: []
  property var skyLife: Ambience.initialState()
  // Stretches of open water a boat can travel along. Bound to the grid rather
  // than recomputed per frame: it only changes when someone digs or fills.
  readonly property var waterRoutes: Waterfront.waterRuns(root.grid, root.gridSize)
  // Scales with the city instead of a fixed count — a tiny town shouldn't
  // look as busy as a growing one, and a shrinking one should visibly
  // quiet down. Floor of 3 once anyone actually lives here (not 0 — a
  // town of 150 still has *some* traffic), capped well below where more
  // cars would just look chaotic rather than alive.
  readonly property int carCount: root.population <= 0 ? 0
    : Math.max(3, Math.min(50, Math.round(root.population / 90)))
  readonly property var carColors: ["#e0524a", "#4a90d9", "#e8c93a", "#5fbf6f", "#e8e8e8", "#c96fd9"]

  readonly property var trafficRoadTiles: Traffic.roadTiles(root.grid, root.gridSize)

  // Rebuilt per call rather than bound: the survey object changes only on the
  // tick, and this is three property reads against a 33ms timer.
  function updateCars(dt, data, gridSize) {
    var survey = root.serviceReady ? root.cityService.traffic : null
    root.cars = Traffic.update(root.cars, dt, data, gridSize, root.carCount, root.trafficRoadTiles,
      root.carColors, root.cityBurning,
      survey && survey.roadCongestion
        ? { map: survey.roadCongestion, watch: Model.CONGESTION_WATCH, jam: Model.CONGESTION_JAM }
        : null)
  }

  function drawCar(ctx, car, cellSize, offsetX, offsetY, gridSize, viewW, viewH) {
    var pose = Traffic.pose(car, gridSize)
    var x = pose.x * cellSize - offsetX
    var y = pose.y * cellSize - offsetY
    var angle = pose.angle

    if (x < -cellSize || x > viewW + cellSize || y < -cellSize || y > viewH + cellSize) return
    var w = Math.max(3, cellSize * (car.schoolBus || car.ambulance ? 0.44 : 0.34))
    var h = Math.max(2, cellSize * 0.2)
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(angle)
    ctx.globalAlpha = Math.min(1, car.age / 0.5, Math.max(0, (90 - car.age) / 2))
    var lights = Traffic.lightPulse(car)
    if ((car.police || car.ambulance) && Traffic.emergencyActive(car)) {
      // Soft colored pools below the cruiser, with no full-screen flashes.
      for (var side = 0; side < 2; side++) {
        var intensity = side === 0 ? lights.red : lights.blue
        var rgb = side === 0 ? "255,55,65" : "55,125,255"
        var ly = (side === 0 ? -1 : 1) * h * 0.32
        var radius = cellSize * 0.40
        var glow = ctx.createRadialGradient(0, ly, 0, 0, ly, radius)
        glow.addColorStop(0, "rgba(" + rgb + "," + intensity * 0.42 + ")")
        glow.addColorStop(1, "rgba(" + rgb + ",0)")
        ctx.fillStyle = glow
        ctx.fillRect(-radius, ly - radius, radius * 2, radius * 2)
      }
    }
    ctx.fillStyle = "rgba(10, 15, 20, 0.4)"
    ctx.fillRect(-w / 2, -h / 2 + 1, w + 1, h)
    ctx.fillStyle = car.color
    ctx.fillRect(-w / 2, -h / 2, w, h)
    ctx.fillStyle = "#263f50"
    ctx.fillRect(w * 0.12, -h * 0.4, w * 0.14, h * 0.8)
    ctx.fillRect(-w * 0.3, -h * 0.4, w * 0.12, h * 0.8)
    if (car.police) {
      ctx.fillStyle = "#182b3c"
      ctx.fillRect(-w * 0.5, -h * 0.5, w * 0.2, h)
      ctx.fillRect(w * 0.29, -h * 0.5, w * 0.21, h)
      ctx.fillStyle = "#d8e0e1"
      ctx.fillRect(-w * 0.13, -h * 0.45, w * 0.20, h * 0.9)
      ctx.fillStyle = lights.red > 0.5 ? "#ffb2ab" : "#983a47"
      ctx.fillRect(-w * 0.08, -h * 0.47, w * 0.13, h * 0.42)
      ctx.fillStyle = lights.blue > 0.5 ? "#b5e0ff" : "#34658d"
      ctx.fillRect(-w * 0.08, h * 0.05, w * 0.13, h * 0.42)
    }
    if (car.schoolBus) {
      ctx.fillStyle = "#263f50"
      for (var window = 0; window < 4; window++) {
        ctx.fillRect(-w * 0.36 + window * w * 0.16, -h * 0.48, w * 0.10, h * 0.23)
        ctx.fillRect(-w * 0.36 + window * w * 0.16, h * 0.25, w * 0.10, h * 0.23)
      }
      ctx.fillStyle = "#f5ca4c"
      ctx.fillRect(-w * 0.34, -h * 0.18, w * 0.55, h * 0.36)
    }
    if (car.ambulance) {
      // Boxy patient compartment, green medical cross and cab lightbar.
      ctx.fillStyle = "#f1eee2"
      ctx.fillRect(-w * 0.45, -h * 0.45, w * 0.58, h * 0.9)
      ctx.fillStyle = "#389c81"
      ctx.fillRect(-w * 0.29, -h * 0.13, w * 0.26, h * 0.26)
      ctx.fillRect(-w * 0.20, -h * 0.34, w * 0.08, h * 0.68)
      ctx.fillRect(-w * 0.48, h * 0.35, w * 0.80, h * 0.10)
      ctx.fillStyle = lights.red > 0.5 ? "#ffb2ab" : "#983a47"
      ctx.fillRect(w * 0.08, -h * 0.47, w * 0.10, h * 0.42)
      ctx.fillStyle = lights.blue > 0.5 ? "#b5e0ff" : "#34658d"
      ctx.fillRect(w * 0.08, h * 0.05, w * 0.10, h * 0.42)
    }
    ctx.fillStyle = "#eee6bf"
    ctx.fillRect(w * 0.39, -h * 0.4, w * 0.09, h * 0.22)
    ctx.fillRect(w * 0.39, h * 0.18, w * 0.09, h * 0.22)
    ctx.fillStyle = car.braking ? "#ff5644" : "#8e3830"
    ctx.fillRect(-w * 0.5, -h * 0.4, w * 0.09, h * 0.24)
    ctx.fillRect(-w * 0.5, h * 0.16, w * 0.09, h * 0.24)
    ctx.restore()
  }

  // Utility blinks and growth flashes keep their cheaper 80ms cadence.
  property real blinkPhase: 0
  // The first widened range (0.12-0.80) still read as too faint overall —
  // most of the cycle sits well below the 0.80 peak. Raising the floor
  // keeps it visible through the whole pulse instead of just at the top.
  readonly property real blinkAlpha: 0.4 + 0.55 * (0.5 + 0.5 * Math.sin(root.blinkPhase))

  function drawMissingPowerIcon(ctx, cx, cy, cellSize, alpha) {
    var s = cellSize * 0.36
    ctx.globalAlpha = alpha
    ctx.fillStyle = "#f2d24a"
    ctx.strokeStyle = "rgba(40, 30, 5, 0.8)"
    ctx.lineWidth = Math.max(1, cellSize * 0.04)
    ctx.beginPath()
    ctx.moveTo(cx - s * 0.12, cy - s * 0.5)
    ctx.lineTo(cx + s * 0.2, cy - s * 0.06)
    ctx.lineTo(cx, cy - s * 0.06)
    ctx.lineTo(cx + s * 0.12, cy + s * 0.5)
    ctx.lineTo(cx - s * 0.2, cy + s * 0.02)
    ctx.lineTo(cx, cy + s * 0.02)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  function drawMissingWaterIcon(ctx, cx, cy, cellSize, alpha) {
    var r = cellSize * 0.17
    ctx.globalAlpha = alpha
    ctx.fillStyle = "#5fb0e8"
    ctx.strokeStyle = "rgba(10, 30, 45, 0.8)"
    ctx.lineWidth = Math.max(1, cellSize * 0.04)
    ctx.beginPath()
    ctx.moveTo(cx, cy - r * 1.3)
    ctx.quadraticCurveTo(cx + r * 1.1, cy + r * 0.3, cx, cy + r * 1.1)
    ctx.quadraticCurveTo(cx - r * 1.1, cy + r * 0.3, cx, cy - r * 1.3)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  // Which zoned tiles need a warning icon at all — split out from the
  // drawing itself so it's only recomputed when the grid (or the utility
  // buildings on it) actually changes, not on every 80ms blink frame. This
  // used to be folded into drawUtilityWarnings, re-parsing every visible
  // tile and re-running isCovered against every plant 12.5 times a second
  // regardless of whether anything had changed — cheap on a small city, but
  // it scales with both viewport tile count and plant count, and both grow
  // as the city does. The blink only needs the *alpha* to update that
  // often; the underlying set of flagged tiles doesn't.
  readonly property var utilityWarningTiles: root.serviceReady
    ? root.computeUtilityWarningTiles(root.grid) : []

  function computeUtilityWarningTiles(data) {
    var out = []
    for (var idx = 0; idx < data.length; idx++) {
      var tile = Model.parseTile(data[idx])
      if (tile.type !== Model.TILE_RES && tile.type !== Model.TILE_COM && tile.type !== Model.TILE_IND) continue
      var noPower = !Model.isCovered(root.gridSize, root.utilities.power, idx, Model.POWER_RADIUS)
      var noWater = !Model.isCovered(root.gridSize, root.utilities.water, idx, Model.WATER_RADIUS)
      if (!noPower && !noWater) continue
      out.push({ index: idx, noPower: noPower, noWater: noWater })
    }
    return out
  }

  // Zoned R/C/I tiles get flagged regardless of level — including an
  // unbuilt lot (still shown with its own dashed-outline treatment
  // underneath), since "why isn't this growing" is exactly what the icon
  // should explain for a lot that's zoned but stuck at level 0. Just
  // iterates the precomputed list above and culls to the visible viewport —
  // no per-tile parsing or coverage math here anymore.
  function drawUtilityWarnings(ctx, cellSize, offsetX, offsetY, viewW, viewH) {
    var startCol = Math.max(0, Math.floor(offsetX / cellSize))
    var endCol = Math.min(root.gridSize - 1, Math.ceil((offsetX + viewW) / cellSize))
    var startRow = Math.max(0, Math.floor(offsetY / cellSize))
    var endRow = Math.min(root.gridSize - 1, Math.ceil((offsetY + viewH) / cellSize))
    var alpha = root.blinkAlpha
    var tiles = root.utilityWarningTiles
    for (var i = 0; i < tiles.length; i++) {
      var w = tiles[i]
      var col = w.index % root.gridSize
      var row = Math.floor(w.index / root.gridSize)
      if (col < startCol || col > endCol || row < startRow || row > endRow) continue
      var cx = col * cellSize - offsetX + cellSize * 0.5
      var cy = row * cellSize - offsetY + cellSize * 0.5
      // Kept within the tile's own vertical bounds (a small nudge up
      // from dead-center, not floating above it) — pushing it further
      // up risked clipping off the canvas edge for anything in the top
      // row of the viewport, which is likely why this went unnoticed.
      if (w.noPower && w.noWater) {
        root.drawMissingPowerIcon(ctx, cx - cellSize * 0.18, cy - cellSize * 0.08, cellSize, alpha)
        root.drawMissingWaterIcon(ctx, cx + cellSize * 0.18, cy - cellSize * 0.08, cellSize, alpha)
      } else if (w.noPower) {
        root.drawMissingPowerIcon(ctx, cx, cy - cellSize * 0.1, cellSize, alpha)
      } else {
        root.drawMissingWaterIcon(ctx, cx, cy - cellSize * 0.1, cellSize, alpha)
      }
    }
  }

  readonly property var toolList: [
    { type: Model.TILE_ROAD, label: "Road" },
    { type: Model.TOOL_AVENUE, label: "Avenue" },
    { type: Model.TILE_PATH, label: "Footpath" },
    { type: Model.TILE_LAKE, label: "Water" },
    { type: Model.TILE_WATERFRONT_PARK, label: "Waterfront Park" },
    { type: Model.TILE_RES, label: "Residential" },
    { type: Model.TILE_COM, label: "Commercial" },
    { type: Model.TILE_IND, label: "Industrial" },
    { type: Model.TILE_PARK, label: "Playground" },
    { type: Model.TILE_POWER, label: "Generator" },
    { type: Model.TILE_WATER, label: "Well" },
    { type: Model.TILE_FIRE, label: "Firehouse" },
    { type: Model.TILE_POLICE, label: "Substation" },
    { type: Model.TILE_SCHOOL, label: "Elementary School" },
    { type: Model.TILE_MEDICAL, label: "Clinic" },
    { type: Model.TILE_TRANSIT, label: "Bus Depot" },
    { type: "decorations", label: "Decorations" },
    { type: "inspect", label: "Info" },
    { type: "bulldoze", label: "Bulldoze" }
  ]

  // A translucent tint of the bar foreground, for grid lines and the
  // empty/undeveloped-lot fill — keeps those elements native to the
  // current theme while the zone sprites below carry their own fixed,
  // non-theme colors (the point is to read the city at a glance the way
  // SimCity's palette always has, in either theme).
  function neutralTint(alpha) {
    var fg = root.bar ? root.bar.foreground : Color.foreground
    return Qt.rgba(fg.r, fg.g, fg.b, alpha)
  }

  // Drawn straight from above, not wall textures pretending to be aerial
  // (that's what made the Kenney sprite pass read as "some building
  // material" instead of "a house"). A house is a small terracotta roof
  // sitting in a yard — it doesn't fill the lot. Commercial and industrial
  // are big flat roofs that do, distinguished by roof color and rooftop
  // detail (AC units vs. stacks) rather than by facade material.
  readonly property var roofColors: ({ R: "#c1553f", C: "#5c7a94", I: "#7a7361" })
  readonly property var accentColors: ({ R: "#8f3f2d", C: "#3f5567", I: "#4a463b" })

  // Residential, commercial, and industrial use purpose-built sprite families. Keep each
  // category behind its own switch (and retain the procedural draw functions
  // below) so either visual pass remains independently reversible.
  property bool useResidentialSprites: true
  // Four more of each tier-3 building are commissioned (assets/BRIEF-more-
  // variants.md). A mature city is almost entirely tier 3 — 147 houses, 135
  // works and 97 shopfronts on a real save — so four sprites means every
  // building appears about thirty-five times and the map reads as a pattern.
  //
  // Off until the files exist AND their crop frames have been measured, since
  // a tier-3 sprite drawn without one is stretched to the wrong aspect. The
  // order is: drop the files, run tools/measure-frames.mjs, paste the rows
  // into matureSpriteFrames, flip this. tests/sprite-budget.mjs will not let
  // any of those three steps be skipped.
  readonly property bool useExtraVariants: true
  function tier3(base, extra) {
    return root.useExtraVariants ? base.concat(extra) : base
  }
  readonly property var residentialSpriteUrls: [
    [Qt.resolvedUrl("assets/residential/r1.png").toString(), Qt.resolvedUrl("assets/residential/r1b.png").toString()],
    [Qt.resolvedUrl("assets/residential/r2.png").toString(), Qt.resolvedUrl("assets/residential/r2b.png").toString()],
    root.tier3([Qt.resolvedUrl("assets/residential/r3.png").toString(), Qt.resolvedUrl("assets/residential/r3b.png").toString(), Qt.resolvedUrl("assets/residential/r3c.png").toString(), Qt.resolvedUrl("assets/residential/r3d.png").toString()],
      [Qt.resolvedUrl("assets/residential/r3e.png").toString(), Qt.resolvedUrl("assets/residential/r3f.png").toString(), Qt.resolvedUrl("assets/residential/r3g.png").toString(), Qt.resolvedUrl("assets/residential/r3h.png").toString()])
  ]
  property bool useCommercialSprites: true
  readonly property var commercialSpriteUrls: [
    [Qt.resolvedUrl("assets/commercial/c1a.png").toString(), Qt.resolvedUrl("assets/commercial/c1b.png").toString()],
    [Qt.resolvedUrl("assets/commercial/c2a.png").toString(), Qt.resolvedUrl("assets/commercial/c2b.png").toString()],
    root.tier3([Qt.resolvedUrl("assets/commercial/c3a.png").toString(), Qt.resolvedUrl("assets/commercial/c3b.png").toString(), Qt.resolvedUrl("assets/commercial/c3c.png").toString(), Qt.resolvedUrl("assets/commercial/c3d.png").toString()],
      [Qt.resolvedUrl("assets/commercial/c3e.png").toString(), Qt.resolvedUrl("assets/commercial/c3f.png").toString(), Qt.resolvedUrl("assets/commercial/c3g.png").toString(), Qt.resolvedUrl("assets/commercial/c3h.png").toString()])
  ]
  property bool useIndustrialSprites: true
  readonly property var industrialSpriteUrls: [
    [Qt.resolvedUrl("assets/industrial/i1a.png").toString(), Qt.resolvedUrl("assets/industrial/i1b.png").toString()],
    [Qt.resolvedUrl("assets/industrial/i2a.png").toString(), Qt.resolvedUrl("assets/industrial/i2b.png").toString()],
    root.tier3([Qt.resolvedUrl("assets/industrial/i3a.png").toString(), Qt.resolvedUrl("assets/industrial/i3b.png").toString(), Qt.resolvedUrl("assets/industrial/i3c.png").toString(), Qt.resolvedUrl("assets/industrial/i3d.png").toString()],
      [Qt.resolvedUrl("assets/industrial/i3e.png").toString(), Qt.resolvedUrl("assets/industrial/i3f.png").toString(), Qt.resolvedUrl("assets/industrial/i3g.png").toString(), Qt.resolvedUrl("assets/industrial/i3h.png").toString()])
  ]
  // Infrastructure tiers are zero-based (unlike the 1–3 zone growth levels).
  property bool useInfrastructureSprites: true
  readonly property var infrastructureSpriteUrls: ({
    M: [Qt.resolvedUrl("assets/transit/m1.png").toString(), Qt.resolvedUrl("assets/transit/m2.png").toString(), Qt.resolvedUrl("assets/transit/m3.png").toString()],
    H: [Qt.resolvedUrl("assets/medical/h1.png").toString(), Qt.resolvedUrl("assets/medical/h2.png").toString(), Qt.resolvedUrl("assets/medical/h3.png").toString()],
    N: [Qt.resolvedUrl("assets/schools/n1.png").toString(), Qt.resolvedUrl("assets/schools/n2.png").toString(), Qt.resolvedUrl("assets/schools/n3.png").toString()],
    E: [Qt.resolvedUrl("assets/power/e1.png").toString(), Qt.resolvedUrl("assets/power/e2.png").toString(), Qt.resolvedUrl("assets/power/e3.png").toString()],
    W: [Qt.resolvedUrl("assets/water/w1.png").toString(), Qt.resolvedUrl("assets/water/w2.png").toString(), Qt.resolvedUrl("assets/water/w3.png").toString()],
    F: [Qt.resolvedUrl("assets/fire/f1.png").toString(), Qt.resolvedUrl("assets/fire/f2.png").toString(), Qt.resolvedUrl("assets/fire/f3.png").toString()],
    S: [Qt.resolvedUrl("assets/police/s1.png").toString(), Qt.resolvedUrl("assets/police/s2.png").toString(), Qt.resolvedUrl("assets/police/s3.png").toString()],
    P: [Qt.resolvedUrl("assets/parks/p1.png").toString(), Qt.resolvedUrl("assets/parks/p2.png").toString(), Qt.resolvedUrl("assets/parks/p3.png").toString()]
  })
  readonly property var spriteLotTints: ({ R: "rgba(80, 120, 78, 0.08)", C: "rgba(92, 122, 148, 0.12)", I: "rgba(122, 115, 97, 0.11)", E: "rgba(201, 162, 39, 0.10)", W: "rgba(47, 111, 148, 0.10)", F: "rgba(193, 67, 54, 0.08)", S: "rgba(58, 111, 224, 0.10)", P: "rgba(80, 132, 77, 0.08)", M: "rgba(197, 133, 47, 0.10)" })

  // Matching overhead camera and bottom-centred 256px cutouts. The flowerbed
  // no longer needs a special scale/baseline to compensate for a tilted sprite.
  //
  // The four later sprites do not fill their frames the way the tree does — a
  // hedge is a low band with most of the frame empty below it, a statue is a
  // narrow column. So scale sizes each one by its *drawn* width rather than by
  // its frame, and baseline is set so every decoration's visible bottom edge
  // lands at 0.90 of the tile regardless of how much padding it carries. A
  // baseline past 1.0 only pushes transparent frame below the tile.
  readonly property var decorationMetrics: ({
    T: { scale: 1.08, baseline: 0.97 },
    B: { scale: 1.08, baseline: 0.97 },
    G: { scale: 1.18, baseline: 1.31 },
    K: { scale: 1.10, baseline: 1.13 },
    V: { scale: 1.09, baseline: 0.99 },
    O: { scale: 1.13, baseline: 1.00 },
    U: { scale: 1.05, baseline: 1.04 },
    // The bandstand is drawn narrow in its frame, so it needs the most scaling
    // of any of them to sit as the centrepiece of a square.
    J: { scale: 1.56, baseline: 1.02 }
  })

  // Stand-in until a sprite finishes loading, so a freshly placed decoration is
  // never an invisible tile.
  readonly property var decorationBlobColors: ({
    T: "#6c9a4d", B: "#c58794", G: "#5c8f45", K: "#a8703c", V: "#8fae9b", O: "#7fc7d8",
    U: "#7f6bb0", J: "#2f7a63"
  })

  // Data overlay painted over the finished map. Lives on its own thin Canvas
  // (see overlayCanvas) rather than inside the tile canvas, so toggling it
  // never forces every building on screen to re-render — the same rule the
  // hover-preview circle had to learn.
  function drawDataOverlay(ctx, data, cellSize, offsetX, offsetY, width, height) {
    var def = root.overlayDef
    if (!def) return
    var startCol = Math.max(0, Math.floor(offsetX / cellSize))
    var endCol = Math.min(root.gridSize - 1, Math.ceil((offsetX + width) / cellSize))
    var startRow = Math.max(0, Math.floor(offsetY / cellSize))
    var endRow = Math.min(root.gridSize - 1, Math.ceil((offsetY + height) / cellSize))
    var utilities = root.utilities
    var funding = root.serviceReady ? root.cityService.funding : null
    var traffic = root.serviceReady ? root.cityService.traffic : null

    for (var row = startRow; row <= endRow; row++) {
      for (var col = startCol; col <= endCol; col++) {
        var idx = row * root.gridSize + col
        var gx = col * cellSize - offsetX
        var gy = row * cellSize - offsetY
        var fill = ""

        if (root.overlayMode === "value") {
          var v = Model.landValueFraction(data, root.gridSize, idx)
          if (v > 0.02) fill = Qt.rgba(0.36 + v * 0.5, 0.82, 0.45, 0.12 + v * 0.45)
        } else if (root.overlayMode === "growth") {
          var reason = Model.growthBlocker(data, root.gridSize, idx, utilities, root.happiness, traffic)
          if (reason === "max") fill = Qt.rgba(0.55, 0.62, 0.55, 0.22)
          else if (reason !== "") fill = Qt.rgba(0.92, 0.34, 0.28, 0.5)
        } else if (root.overlayMode === "traffic") {
          // Roads carry the colour, because roads are what the player fixes.
          // Lots are tinted faintly so a jammed block reads as a block rather
          // than as a set of unrelated red lines.
          var tile = Model.parseTile(data[idx])
          if (tile.type === Model.TILE_ROAD) {
            var c = traffic && traffic.roadCongestion
              ? (traffic.roadCongestion[idx] || 0) : 0
            if (c > 0.05) {
              var over = Math.min(1, Math.max(0, (c - Model.CONGESTION_WATCH)
                / (Model.CONGESTION_JAM - Model.CONGESTION_WATCH)))
              if (c < Model.CONGESTION_WATCH)
                fill = Qt.rgba(0.35, 0.78, 0.42, 0.18 + 0.3 * (c / Model.CONGESTION_WATCH))
              else if (c < Model.CONGESTION_JAM)
                fill = Qt.rgba(0.95, 0.72, 0.25, 0.45 + 0.25 * over)
              else
                fill = Qt.rgba(0.92, 0.26, 0.22, Math.min(0.85, 0.6 + 0.25 * (c - 1)))
            }
          } else if (tile.level > 0) {
            var lc = Model.lotCongestion(traffic, idx)
            if (lc >= Model.CONGESTION_JAM) fill = Qt.rgba(0.92, 0.26, 0.22, 0.2)
            else if (lc >= Model.CONGESTION_WATCH) fill = Qt.rgba(0.95, 0.72, 0.25, 0.16)
          }
        } else {
          var state = Model.overlayCoverageState(data, root.gridSize, idx, def, utilities, funding)
          if (state === "gap") fill = Qt.rgba(0.92, 0.34, 0.28, 0.55)
          else if (state === "covered") fill = Qt.rgba(0.35, 0.78, 0.42, 0.34)
          else if (state === "idle") fill = Qt.rgba(0.35, 0.78, 0.42, 0.13)
        }

        if (fill !== "") {
          ctx.fillStyle = fill
          ctx.fillRect(gx, gy, cellSize + 1, cellSize + 1)
        }
      }
    }

    // Mark the sources themselves so it is obvious what is projecting cover.
    // A spare one — covering only blocks another already covers — is outlined
    // amber and struck through instead, because counting them in a card does
    // not tell anybody which building to walk over and demolish.
    if (def.service) {
      var plants = utilities[def.service] || []
      var spare = root.spareIndices
      for (var p = 0; p < plants.length; p++) {
        var pi = plants[p].index
        var pcol = pi % root.gridSize, prow = Math.floor(pi / root.gridSize)
        if (pcol < startCol || pcol > endCol || prow < startRow || prow > endRow) continue
        var px = pcol * cellSize - offsetX, py = prow * cellSize - offsetY
        var isSpare = spare[pi] === true
        ctx.strokeStyle = isSpare ? "rgba(232, 168, 76, 0.95)" : "rgba(255, 255, 255, 0.85)"
        ctx.lineWidth = Math.max(1, cellSize * (isSpare ? 0.11 : 0.08))
        ctx.strokeRect(px + 1, py + 1, cellSize - 2, cellSize - 2)
        if (isSpare) {
          var inset = cellSize * 0.28
          ctx.beginPath()
          ctx.moveTo(px + inset, py + inset)
          ctx.lineTo(px + cellSize - inset, py + cellSize - inset)
          ctx.moveTo(px + cellSize - inset, py + inset)
          ctx.lineTo(px + inset, py + cellSize - inset)
          ctx.stroke()
        }
      }
    }
  }

  // Burning tiles. Drawn on their own animated layer rather than into the
  // tile canvas, so the flicker never drags a full city re-render with it.
  // Crime waves: a slow pulsing stain over the district they cover, rather
  // than fire's sharp flicker — it reads as a condition, not an emergency.
  // Highway stubs at the map edge, one per neighbouring town. Drawn on the
  // main tile canvas because they are terrain, not an alert — they only
  // change when the grid does.
  // Street names, drawn along the carriageway the way they are on a map.
  // Only when the tiles are big enough to read at, and only for roads long
  // enough that the label fits — a name that overruns its own street is worse
  // than no name, and the map is a place to find Beacon Street, not a list.
  function drawStreetNames(ctx, cellSize, offsetX, offsetY, width, height) {
    if (cellSize < root.streetLabelZoom) return
    var runs = root.streetRuns
    ctx.save()
    ctx.font = Math.round(Math.max(9, cellSize * 0.30)) + "px sans-serif"
    ctx.textBaseline = "middle"
    // Round joins, or the backing stroke below grows miter spikes out of every
    // sharp corner in the type — a "W" at three pixels of line width throws
    // black shards several pixels clear of the letter.
    ctx.lineJoin = "round"
    ctx.lineCap = "round"
    for (var i = 0; i < runs.length; i++) {
      var run = runs[i]
      var fromX = (run.from % root.gridSize) * cellSize - offsetX
      var fromY = Math.floor(run.from / root.gridSize) * cellSize - offsetY
      var span = run.length * cellSize
      var label = run.name
      var textWidth = ctx.measureText(label).width
      if (textWidth > span - cellSize) continue
      // Skip a street that cannot be on screen at all, on its own axis as
      // well as across it.
      if (run.axis === "ns") {
        if (fromX < -cellSize || fromX > width + cellSize) continue
        if (fromY > height || fromY + span < 0) continue
      } else {
        if (fromY < -cellSize || fromY > height + cellSize) continue
        if (fromX > width || fromX + span < 0) continue
      }

      // Repeated along the street rather than placed once at its midpoint.
      // A 22-tile road is wider than the viewport, so a single central label
      // is frequently off screen while the street itself is not — which is
      // exactly the case this feature exists to serve. Real maps repeat them
      // for the same reason.
      var stride = Math.max(textWidth + cellSize * 4, cellSize * 10)
      var copies = Math.max(1, Math.floor(span / stride))
      var slot = span / copies
      for (var c = 0; c < copies; c++) {
        var along = c * slot + (slot - textWidth) / 2
        ctx.save()
        if (run.axis === "ns") {
          // Rotated to run with the road, reading top to bottom.
          ctx.translate(fromX + cellSize * 0.5, fromY + along)
          ctx.rotate(Math.PI / 2)
        } else {
          ctx.translate(fromX + along, fromY + cellSize * 0.5)
        }
        // A dark backing stroke first, so the name stays legible over asphalt,
        // markings and whatever traffic colour the overlay has put down.
        ctx.strokeStyle = "rgba(18, 20, 24, 0.85)"
        ctx.lineWidth = Math.max(2, cellSize * 0.09)
        ctx.strokeText(label, 0, 0)
        ctx.fillStyle = "rgba(236, 232, 214, 0.92)"
        ctx.fillText(label, 0, 0)
        ctx.restore()
      }
    }
    ctx.restore()
  }

  function drawNeighbors(ctx, cellSize, offsetX, offsetY, width, height) {
    var connected = root.connectedNeighbors
    for (var i = 0; i < root.neighbors.length; i++) {
      var n = root.neighbors[i]
      var col = n.index % root.gridSize, row = Math.floor(n.index / root.gridSize)
      var gx = col * cellSize - offsetX, gy = row * cellSize - offsetY
      if (gx < -cellSize * 3 || gy < -cellSize * 3
        || gx > width + cellSize * 2 || gy > height + cellSize * 2) continue

      var live = false
      for (var c = 0; c < connected.length; c++) if (connected[c].index === n.index) live = true

      // A chevron pointing off-map, filled once the road actually reaches it.
      ctx.save()
      ctx.translate(gx + cellSize * 0.5, gy + cellSize * 0.5)
      if (n.edge === "east") ctx.rotate(Math.PI / 2)
      else if (n.edge === "south") ctx.rotate(Math.PI)
      else if (n.edge === "west") ctx.rotate(-Math.PI / 2)

      ctx.fillStyle = live ? "rgba(126, 196, 122, 0.92)" : "rgba(180, 176, 160, 0.45)"
      ctx.beginPath()
      ctx.moveTo(0, -cellSize * 0.42)
      ctx.lineTo(cellSize * 0.30, cellSize * 0.10)
      ctx.lineTo(cellSize * 0.10, cellSize * 0.10)
      ctx.lineTo(cellSize * 0.10, cellSize * 0.40)
      ctx.lineTo(-cellSize * 0.10, cellSize * 0.40)
      ctx.lineTo(-cellSize * 0.10, cellSize * 0.10)
      ctx.lineTo(-cellSize * 0.30, cellSize * 0.10)
      ctx.closePath()
      ctx.fill()
      ctx.restore()

      // Only worth labelling when there is room to read it.
      if (cellSize >= 18) {
        ctx.save()
        ctx.font = Math.max(8, Math.round(cellSize * 0.34)) + "px sans-serif"
        ctx.textAlign = "center"
        var label = n.name + (live ? "" : " ·")
        var ty = n.edge === "north" ? gy + cellSize * 1.35
          : n.edge === "south" ? gy - cellSize * 0.5 : gy + cellSize * 1.25
        var tx = gx + cellSize * 0.5
        if (n.edge === "east") tx = gx - cellSize * 0.2
        if (n.edge === "west") tx = gx + cellSize * 1.2
        ctx.fillStyle = "rgba(12, 20, 16, 0.55)"
        ctx.fillText(label, tx + 1, ty + 1)
        ctx.fillStyle = live ? "rgba(150, 214, 145, 0.95)" : "rgba(196, 192, 176, 0.7)"
        ctx.fillText(label, tx, ty)
        ctx.restore()
      }
    }
  }

  function drawCrime(ctx, cellSize, offsetX, offsetY, width, height, phase) {
    var pulse = 0.5 + 0.5 * Math.sin(phase * 0.5)
    for (var c = 0; c < root.crimes.length; c++) {
      var index = root.crimes[c].index
      var cx = index % root.gridSize, cy = Math.floor(index / root.gridSize)
      for (var dy = -Model.CRIME_RADIUS; dy <= Model.CRIME_RADIUS; dy++) {
        for (var dx = -Model.CRIME_RADIUS; dx <= Model.CRIME_RADIUS; dx++) {
          var col = cx + dx, row = cy + dy
          if (col < 0 || row < 0 || col >= root.gridSize || row >= root.gridSize) continue
          if (Math.max(Math.abs(dx), Math.abs(dy)) > Model.CRIME_RADIUS) continue
          var gx = col * cellSize - offsetX, gy = row * cellSize - offsetY
          if (gx < -cellSize || gy < -cellSize || gx > width || gy > height) continue
          // Densest at the centre so the source of the wave is readable.
          var falloff = 1 - Math.max(Math.abs(dx), Math.abs(dy)) / (Model.CRIME_RADIUS + 1)
          ctx.fillStyle = Qt.rgba(0.36, 0.16, 0.52, (0.12 + 0.20 * falloff) * (0.65 + 0.35 * pulse))
          ctx.fillRect(gx, gy, cellSize + 1, cellSize + 1)
        }
      }
    }
  }

  function drawFires(ctx, cellSize, offsetX, offsetY, width, height, phase) {
    for (var i = 0; i < root.fires.length; i++) {
      var index = root.fires[i].index
      var col = index % root.gridSize, row = Math.floor(index / root.gridSize)
      var gx = col * cellSize - offsetX, gy = row * cellSize - offsetY
      if (gx < -cellSize || gy < -cellSize || gx > width || gy > height) continue

      // Two out-of-step flickers so neighbouring fires don't pulse in unison.
      var flicker = 0.55 + 0.45 * Math.abs(Math.sin(phase + index * 0.7))
      ctx.fillStyle = Qt.rgba(0.95, 0.35, 0.12, 0.30 + 0.25 * flicker)
      ctx.fillRect(gx, gy, cellSize + 1, cellSize + 1)

      var cx = gx + cellSize * 0.5, base = gy + cellSize * 0.82
      var h = cellSize * (0.42 + 0.16 * flicker)
      ctx.fillStyle = Qt.rgba(0.98, 0.55, 0.12, 0.92)
      ctx.beginPath()
      ctx.moveTo(cx, base - h)
      ctx.quadraticCurveTo(cx + cellSize * 0.26, base - h * 0.45, cx + cellSize * 0.16, base)
      ctx.lineTo(cx - cellSize * 0.16, base)
      ctx.quadraticCurveTo(cx - cellSize * 0.26, base - h * 0.45, cx, base - h)
      ctx.fill()
      ctx.fillStyle = Qt.rgba(1.0, 0.88, 0.42, 0.95)
      ctx.beginPath()
      ctx.moveTo(cx, base - h * 0.62)
      ctx.quadraticCurveTo(cx + cellSize * 0.12, base - h * 0.24, cx, base - cellSize * 0.04)
      ctx.quadraticCurveTo(cx - cellSize * 0.12, base - h * 0.24, cx, base - h * 0.62)
      ctx.fill()
    }
  }

  // A sparkline over one history field. Deliberately plain — the point is
  // the shape of the trend, not readable values, which the labels carry.
  function drawSparkline(ctx, history, field, w, h, stroke, fill) {
    if (!history || history.length < 2) return
    var range = Model.historyRange(history, field)
    var span = range.max - range.min
    var stepX = w / (history.length - 1)
    function yFor(i) { return h - ((history[i][field] - range.min) / span) * (h - 2) - 1 }

    if (fill !== "") {
      ctx.fillStyle = fill
      ctx.beginPath()
      ctx.moveTo(0, h)
      for (var f = 0; f < history.length; f++) ctx.lineTo(f * stepX, yFor(f))
      ctx.lineTo((history.length - 1) * stepX, h)
      ctx.closePath()
      ctx.fill()
    }
    ctx.strokeStyle = stroke
    ctx.lineWidth = 1.5
    ctx.beginPath()
    for (var i = 0; i < history.length; i++) {
      if (i === 0) ctx.moveTo(0, yFor(0))
      else ctx.lineTo(i * stepX, yFor(i))
    }
    ctx.stroke()
  }

  function drawSpriteLot(ctx, gx, gy, cellSize, type, index) {
    // Sprite PNGs are cutouts. This is map terrain beneath them, deliberately
    // shared across categories so a building does not look like a square decal.
    ctx.fillStyle = "#374a34"
    ctx.fillRect(gx, gy, cellSize + 1, cellSize + 1)
    if (root.spriteLotTints[type]) {
      ctx.fillStyle = root.spriteLotTints[type]
      ctx.fillRect(gx, gy, cellSize + 1, cellSize + 1)
    }
    if (index >= 0) root.drawEntrancePath(ctx, gx, gy, cellSize, index)
  }

  // Cosmetic lot detail, drawn under the building so the centre is occluded
  // and only the frontage and exposed corners read. Everything here is
  // ctx.fillRect against a coordinate hash: no assets, no randomness, and
  // nothing that shifts on repaint, zoom, growth or reopening the city.
  //
  // Deliberately one self-contained function rather than three: tests/
  // lot-dressing.mjs extracts it by name and runs it in a bare context, so a
  // call out to a sibling helper would be undefined there.
  function drawLotDressing(ctx, gx, gy, size, type, index) {
    if (index < 0) return
    var yard = type === "I"
    if (!yard && type !== "R" && type !== "C") return
    var seed = Math.imul((index | 0) ^ 0x5bd1e995, 0x45d9f3b)
    seed = (seed ^ (seed >>> 16)) >>> 0
    if (seed % 3 === 0) return
    ctx.save()
    ctx.translate(gx, gy)
    ctx.scale(size, size)

    // Which side the loose detail sits on, shared by every category so a lot
    // never stacks two things in the same corner.
    var right = (seed >>> 4) % 2 === 0

    if (yard) {
      // Industry gets a working yard, not a garden: hardstanding, pallets and
      // a skip. Greys, rust and pale timber only — green here would read as
      // landscaping and blur the line with residential frontage.
      //
      // The hardstanding covers most of the lot rather than a strip along the
      // frontage. In game a factory reaches the top of its tile, so a strip is
      // almost entirely hidden behind it and the district still reads as sheds
      // standing on a lawn. The inset varies per lot so a row of yards does not
      // become one flat slab with seams.
      var inset = 0.035 + ((seed >>> 14) % 3) * 0.012
      var far = 0.965 - ((seed >>> 17) % 3) * 0.012
      // Warm, gravelly and close in value to the terrain it sits on. A brighter
      // grey read as a concrete pad dropped on grass rather than a worn yard,
      // and washed the whole district out at district zoom.
      ctx.fillStyle = "#3a3d34"
      ctx.fillRect(inset, 0.34, far - inset, 0.625)
      ctx.fillStyle = "#4a4c41"
      ctx.fillRect(inset + 0.012, 0.355, far - inset - 0.024, 0.590)
      // A darker apron across the frontage, where deliveries actually stand.
      ctx.fillStyle = "#6d6f66"
      ctx.fillRect(0.08, 0.862, 0.58, 0.075)

      var yx = right ? 0.80 : 0.045
      if ((seed >>> 6) % 2 === 0) {
        // Stacked pallets: three pale boards with dark gaps between them.
        for (var pallet = 0; pallet < 3; pallet++) {
          ctx.fillStyle = pallet % 2 === 0 ? "#9b7f4e" : "#876b41"
          ctx.fillRect(yx, 0.845 - pallet * 0.042, 0.145, 0.030)
        }
      } else {
        // A skip, with a rusted rim so it does not read as a plain block.
        ctx.fillStyle = "rgba(16, 18, 16, 0.30)"
        ctx.fillRect(yx + 0.012, 0.800, 0.145, 0.115)
        ctx.fillStyle = "#4a5a4c"
        ctx.fillRect(yx, 0.785, 0.150, 0.115)
        ctx.fillStyle = "#7d5a3a"
        ctx.fillRect(yx, 0.785, 0.150, 0.020)
      }

      // A drum or two on the opposite side, on about half of yards.
      if ((seed >>> 9) % 2 === 0) {
        var dx = right ? 0.055 : 0.845
        ctx.fillStyle = "#8a4f33"
        ctx.fillRect(dx, 0.855, 0.058, 0.080)
        ctx.fillStyle = "#b06a44"
        ctx.fillRect(dx + 0.006, 0.855, 0.046, 0.026)
      }
      ctx.restore()
      return
    }

    // A small doorstep, not a slab beneath the whole building. Existing
    // road-oriented entrance paths remain visible and unchanged.
    ctx.fillStyle = type === "C" ? "#74796a" : "#81816b"
    ctx.fillRect(0.25, 0.88, 0.33, 0.105)
    ctx.fillStyle = type === "C" ? "#a0a28e" : "#a6a184"
    ctx.fillRect(0.26, 0.88, 0.31, 0.08)
    ctx.fillStyle = "#565e4d"
    ctx.fillRect(0.41, 0.88, 0.012, 0.105)

    // Keep planting in exposed corners, clear of the central entrance.
    var x = right ? 0.855 : 0.035
    var y = (seed >>> 6) % 2 === 0 ? 0.83 : 0.70
    var hedge = type === "R" && (seed >>> 8) % 2 === 0
    var h = hedge ? 0.20 : 0.11
    if (hedge) y = Math.min(y, 0.75)
    ctx.fillStyle = "rgba(20, 28, 19, 0.30)"
    ctx.fillRect(x + 0.015, y + 0.025, 0.11, h)
    if (type === "C") {
      ctx.fillStyle = "#a08f70"
      ctx.fillRect(x - 0.01, y + 0.015, 0.125, h + 0.015)
    }
    ctx.fillStyle = "#29452c"
    ctx.fillRect(x, y, 0.105, h)
    ctx.fillStyle = "#587b3d"
    ctx.fillRect(x + 0.007, y, 0.09, h - 0.018)
    ctx.fillStyle = "#81964f"
    ctx.fillRect(x + 0.012, y, 0.055, 0.035)

    // A second, smaller object on the far side from the planting, on about
    // half of dressed lots — enough to break up a terrace without every
    // frontage acquiring the same silhouette.
    if ((seed >>> 11) % 2 === 0) {
      var ox = right ? 0.055 : 0.855
      if (type === "R") {
        if ((seed >>> 13) % 2 === 0) {
          // Wheelie bin: body and a lighter lid.
          ctx.fillStyle = "#3f4a3d"
          ctx.fillRect(ox, 0.862, 0.062, 0.082)
          ctx.fillStyle = "#5d6b56"
          ctx.fillRect(ox, 0.862, 0.062, 0.022)
        } else {
          // Mailbox on a post.
          ctx.fillStyle = "#5a5348"
          ctx.fillRect(ox + 0.024, 0.878, 0.014, 0.066)
          ctx.fillStyle = "#7b6f5c"
          ctx.fillRect(ox, 0.856, 0.062, 0.034)
        }
      } else if ((seed >>> 13) % 2 === 0) {
        // Sandwich board leaning by the door.
        ctx.fillStyle = "rgba(16, 18, 16, 0.28)"
        ctx.fillRect(ox + 0.010, 0.905, 0.060, 0.038)
        ctx.fillStyle = "#6b5a3e"
        ctx.fillRect(ox, 0.860, 0.058, 0.070)
        ctx.fillStyle = "#c8b98d"
        ctx.fillRect(ox + 0.008, 0.868, 0.042, 0.042)
      } else {
        // A bench under the window.
        ctx.fillStyle = "#7a6a4d"
        ctx.fillRect(ox, 0.884, 0.082, 0.024)
        ctx.fillStyle = "#4f4536"
        ctx.fillRect(ox + 0.006, 0.906, 0.014, 0.032)
        ctx.fillRect(ox + 0.062, 0.906, 0.014, 0.032)
      }
    }
    ctx.restore()
  }

  function drawEntrancePath(ctx, gx, gy, size, index) {
    var conn = root.connectionsAt(index)
    if (!conn.down && !conn.left && !conn.right && !conn.up) return
    ctx.save()
    ctx.translate(gx, gy)
    ctx.scale(size, size)
    ctx.beginPath()
    if (conn.down) ctx.moveTo(0.4, 1)
    else if (conn.left) ctx.moveTo(0, 0.83)
    else if (conn.right) ctx.moveTo(1, 0.83)
    else { ctx.moveTo(0.12, 0); ctx.lineTo(0.12, 0.83) }
    ctx.lineTo(0.4, 0.83)
    ctx.strokeStyle = "#59604b"
    ctx.lineWidth = 0.105
    ctx.stroke()
    ctx.strokeStyle = "#96907a"
    ctx.lineWidth = 0.065
    ctx.stroke()
    ctx.restore()
  }

  function drawStreetDetails(ctx, gx, gy, size, conn) {
    var count = Number(conn.up) + Number(conn.down) + Number(conn.left) + Number(conn.right)
    if (count < 3) return
    // Corner posts stay outside the car lanes and leave crosswalks readable.
    var corners = [[0.08, 0.08], [0.92, 0.92]]
    ctx.save()
    for (var i = 0; i < corners.length; i++) {
      var x = gx + size * corners[i][0], y = gy + size * corners[i][1]
      var h = size * 0.22, w = size * 0.065
      ctx.fillStyle = "rgba(15, 20, 19, 0.25)"
      ctx.fillRect(x, y, h * 0.6, Math.max(1, size * 0.03))
      ctx.fillStyle = "#263735"
      ctx.fillRect(x - w * 0.45, y - h, w * 0.9, h)
      ctx.fillRect(x - w, y - size * 0.025, w * 2, size * 0.04)
      ctx.fillStyle = "#718578"
      ctx.fillRect(x - w * 0.15, y - h, Math.max(0.6, w * 0.23), h)
      ctx.fillStyle = "#34423c"
      ctx.fillRect(x - w, y - h - w * 1.2, w * 2, w * 1.6)
      ctx.fillStyle = "#e4c987"
      ctx.fillRect(x - w * 0.62, y - h - w * 0.85, w * 1.24, w)
      ctx.fillStyle = "#293a36"
      ctx.beginPath()
      ctx.moveTo(x - w * 1.3, y - h - w * 1.2)
      ctx.lineTo(x, y - h - w * 2)
      ctx.lineTo(x + w * 1.3, y - h - w * 1.2)
      ctx.closePath(); ctx.fill()
    }
    ctx.restore()
  }

  function infrastructureSpriteSource(type, level) {
    var sources = root.infrastructureSpriteUrls[type]
    if (!root.useInfrastructureSprites || !sources) return ""
    var tier = level === undefined ? 1 : Math.max(0, Math.min(2, Math.floor(level)))
    return sources[tier] || ""
  }

  function previewSpriteSource(type, tier) {
    if (type === Model.TILE_WATERFRONT_PARK) return root.infrastructureSpriteSource(Model.TILE_PARK, 2)
    if (type === "decorations") return root.decorationSpriteUrls[root.decorationTool]
    if (root.decorationSpriteUrls[type]) return root.decorationSpriteUrls[type]
    if (type === Model.TILE_RES && root.useResidentialSprites) return root.residentialSpriteUrls[0][0]
    if (type === Model.TILE_COM && root.useCommercialSprites) return root.commercialSpriteUrls[0][0]
    if (type === Model.TILE_IND && root.useIndustrialSprites) return root.industrialSpriteUrls[0][0]
    return root.infrastructureSpriteSource(type, tier)
  }

  function drawInfrastructureSprite(ctx, gx, gy, cellSize, type, level, index) {
    var source = root.infrastructureSpriteSource(type, level)
    if (!source || !cityCanvas.isImageLoaded(source)) return false
    var tier = level === undefined ? 1 : Math.max(0, Math.min(2, Math.floor(level)))
    root.drawSpriteLot(ctx, gx, gy, cellSize, type, index)
    // Parks remain inside their plots; civic buildings gain height with upgrades.
    var scale = type === Model.TILE_PARK ? [0.92, 1.0, 0.98][tier] : [0.86, 1.04, 1.14][tier]
    var size = cellSize * scale
    ctx.drawImage(source, gx + (cellSize - size) / 2, gy + cellSize * 0.98 - size, size, size)
    return true
  }
  // Same hues as roofColors/the demand meter, just translucent — so an
  // undeveloped lot reads as "this will be a house" at a glance instead of
  // looking identical to every other empty zone until it grows.
  readonly property var zoneUndevelopedColors: ({
    R: { fill: "rgba(193, 85, 63, 0.3)", stroke: "rgba(226, 138, 115, 0.9)" },
    C: { fill: "rgba(92, 122, 148, 0.3)", stroke: "rgba(140, 175, 205, 0.9)" },
    I: { fill: "rgba(122, 115, 97, 0.3)", stroke: "rgba(168, 158, 133, 0.9)" }
  })

  // Unclaimed land, not a void — a muted "wild grass" flat fill (duller
  // than Park's vivid maintained green, so Park still reads as the
  // deliberately-built feature) with a couple of small tuft marks. A
  // per-tile gradient here (like the buildings use) looked good on one
  // roof but turned into harsh repeating horizontal banding once tiled
  // across a big open field — flat is the right call for a texture that
  // repeats this many times.
  // Tuft positions are hashed from the tile's own coordinates rather
  // than Math.random(), so they're stable across repaints instead of
  // flickering to a new random pattern every time the grid changes.
  function drawEmpty(ctx, gx, gy, cellSize) {
    ctx.fillStyle = "#374a34"
    ctx.fillRect(gx, gy, cellSize + 1, cellSize + 1)

    var spots = [[0.3, 0.6], [0.65, 0.35], [0.5, 0.78], [0.22, 0.3]]
    var seed = Math.abs(Math.round(gx * 13 + gy * 7)) % spots.length
    ctx.strokeStyle = "rgba(80, 105, 65, 0.32)"
    ctx.lineWidth = Math.max(1, cellSize * 0.03)
    for (var i = 0; i < 2; i++) {
      var spot = spots[(seed + i) % spots.length]
      var tx = gx + cellSize * spot[0]
      var ty = gy + cellSize * spot[1]
      ctx.beginPath()
      ctx.moveTo(tx - cellSize * 0.04, ty + cellSize * 0.05)
      ctx.lineTo(tx, ty - cellSize * 0.06)
      ctx.lineTo(tx + cellSize * 0.04, ty + cellSize * 0.05)
      ctx.stroke()
    }
  }

  function drawUndeveloped(ctx, gx, gy, cellSize, type) {
    root.drawEmpty(ctx, gx, gy, cellSize)
    var colors = root.zoneUndevelopedColors[type]
    var inset = cellSize * 0.22
    var size = cellSize * 0.56
    if (colors) ctx.fillStyle = colors.fill
    else ctx.fillStyle = root.neutralTint(0.1)
    ctx.fillRect(gx + inset, gy + inset, size, size)
    ctx.setLineDash([2, 2])
    ctx.strokeStyle = colors ? colors.stroke : root.neutralTint(0.4)
    ctx.strokeRect(gx + inset, gy + inset, size, size)
    ctx.setLineDash([])
    // Letter only once tiles are big enough to actually read one — at deep
    // zoom-out it'd just be a blurry smudge, and the color alone still
    // tells R/C/I apart at that scale.
    if (colors && cellSize >= 16) {
      ctx.fillStyle = colors.stroke
      ctx.font = "bold " + Math.round(cellSize * 0.34) + "px sans-serif"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(type, gx + cellSize * 0.5, gy + cellSize * 0.52)
    }
  }

  // Which of the four neighbors are also road, so the lane marking can
  // follow the road's actual direction instead of always running N-S.
  function roadConnections(data, gridSize, index) {
    var x = index % gridSize, y = Math.floor(index / gridSize)
    function isRoad(i) {
      return i >= 0 && i < data.length && Model.parseTile(data[i]).type === Model.TILE_ROAD
    }
    return {
      left: x > 0 && isRoad(index - 1),
      right: x < gridSize - 1 && isRoad(index + 1),
      up: y > 0 && isRoad(index - gridSize),
      down: y < gridSize - 1 && isRoad(index + gridSize)
    }
  }

  // Which neighbours of a tile are roads is a pure function of the grid, and
  // the grid does not change at all while the map is being panned — but the
  // canvas repaints on every pixel of the drag, and three separate draw passes
  // asked this question per tile per frame. That allocated a closure, four
  // parsed-tile objects and a result object every time: thousands of
  // short-lived objects a second, all to re-derive an answer that had not
  // changed. Computed once per grid change instead, it allocates none.
  //
  // Deliberately reads the raw tile character rather than going through
  // Model.parseTile — the type is the first character, and this runs 4096
  // times per rebuild.
  readonly property var roadConnCache: {
    var data = root.grid
    var size = root.gridSize
    var road = Model.TILE_ROAD
    var out = new Array(data.length)
    for (var i = 0; i < data.length; i++) {
      var x = i % size, y = (i / size) | 0
      out[i] = {
        left: x > 0 && data[i - 1] && data[i - 1][0] === road,
        right: x < size - 1 && data[i + 1] && data[i + 1][0] === road,
        up: y > 0 && data[i - size] && data[i - size][0] === road,
        down: y < size - 1 && data[i + size] && data[i + size][0] === road
      }
    }
    return out
  }
  // The same cache for footpaths. Kept separate from the road one on purpose:
  // a path meeting a road is a corner where the surface changes, not a
  // junction, and joining them would have the path draw itself into the
  // carriageway.
  readonly property var pathConnCache: {
    var data = root.grid
    var size = root.gridSize
    var path = Model.TILE_PATH
    var road = Model.TILE_ROAD
    // A path runs into a road as well as into another path. Purely a drawing
    // decision — access is worked out separately — but without it the last
    // tile before a kerb draws a blunt end a third of a tile short of the
    // carriageway, and a path that plainly reaches the road looks like it
    // stops in the grass.
    function joins(tile) {
      return !!tile && (tile[0] === path || tile[0] === road)
    }
    var out = new Array(data.length)
    for (var i = 0; i < data.length; i++) {
      var x = i % size, y = (i / size) | 0
      out[i] = {
        left: x > 0 && joins(data[i - 1]),
        right: x < size - 1 && joins(data[i + 1]),
        up: y > 0 && joins(data[i - size]),
        down: y < size - 1 && joins(data[i + size])
      }
    }
    return out
  }
  function pathConnectionsAt(index) {
    var cache = root.pathConnCache
    return (index >= 0 && index < cache.length) ? cache[index]
      : { left: false, right: false, up: false, down: false }
  }

  // Safe for any index, including one from a grid that has since shrunk.
  function connectionsAt(index) {
    var cache = root.roadConnCache
    return (index >= 0 && index < cache.length) ? cache[index]
      : { left: false, right: false, up: false, down: false }
  }

  function roadTextureHash(value) {
    var hash = value | 0
    hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b)
    hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b)
    return (hash ^ (hash >>> 16)) >>> 0
  }

  // Avenue paint uses the same topology as streets, but replaces (rather than
  // overlays) the old centre dashes. Work in tile coordinates for seamless joins.
  // A footpath: pale gravel or flag, narrower than a carriageway, with a soft
  // edge rather than a kerb. Drawn procedurally like the roads, so a path can
  // meet another at any angle without a sprite per corner.
  function drawFootpath(ctx, x, y, s, conn, index) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s)
    var width = 0.34
    var near = 0.5 - width / 2, far = 0.5 + width / 2
    var ends = (conn.left ? 1 : 0) + (conn.right ? 1 : 0)
      + (conn.up ? 1 : 0) + (conn.down ? 1 : 0)

    // A lone flag reads as a stepping stone rather than a mistake.
    ctx.fillStyle = "#b9ad8e"
    if (ends === 0) ctx.fillRect(near, near, width, width)
    if (conn.left || conn.right) {
      ctx.fillRect(conn.left ? -0.01 : near, near,
        (conn.left ? near + 0.01 : 0) + width + (conn.right ? near + 0.01 : 0), width)
    }
    if (conn.up || conn.down) {
      ctx.fillRect(near, conn.up ? -0.01 : near, width,
        (conn.up ? near + 0.01 : 0) + width + (conn.down ? near + 0.01 : 0))
    }
    // Paving joints, stable per tile so they do not crawl while panning.
    ctx.strokeStyle = "rgba(120, 110, 88, 0.55)"
    ctx.lineWidth = 0.012
    var phase = (root.roadTextureHash(index) % 5) / 5
    if (conn.left || conn.right || ends === 0) {
      for (var jx = 0; jx < 3; jx++) {
        var px = (jx + phase) / 3
        if (px < 0.02 || px > 0.98) continue
        ctx.beginPath(); ctx.moveTo(px, near + 0.02); ctx.lineTo(px, far - 0.02); ctx.stroke()
      }
    }
    if (conn.up || conn.down) {
      for (var jy = 0; jy < 3; jy++) {
        var py = (jy + phase) / 3
        if (py < 0.02 || py > 0.98) continue
        ctx.beginPath(); ctx.moveTo(near + 0.02, py); ctx.lineTo(far - 0.02, py); ctx.stroke()
      }
    }
    ctx.restore()
  }

  readonly property string footbridgeSprite:
    Qt.resolvedUrl("assets/paths/footbridge.png").toString()

  // A plank footbridge where a path crosses water. The sprite runs edge to
  // edge left-right so a row of them is one continuous crossing; a north-south
  // crossing is the same image turned a quarter turn, which is why there is
  // only one file. Falls back to the drawn version if it has not loaded yet.
  function drawFootbridge(ctx, x, y, s, conn) {
    if (cityCanvas.isImageLoaded(root.footbridgeSprite)) {
      var vertical = (conn.up || conn.down) && !(conn.left || conn.right)
      ctx.save()
      if (vertical) {
        ctx.translate(x + s / 2, y + s / 2)
        ctx.rotate(Math.PI / 2)
        ctx.drawImage(root.footbridgeSprite, -s / 2, -s / 2, s, s)
      } else {
        ctx.drawImage(root.footbridgeSprite, x, y, s, s)
      }
      ctx.restore()
      return
    }
    root.drawFootbridgeFallback(ctx, x, y, s, conn)
  }

  function drawFootbridgeFallback(ctx, x, y, s, conn) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s)
    var vertical = conn.up || conn.down
    var horizontal = conn.left || conn.right
    if (!vertical && !horizontal) horizontal = true
    // The same width as the path either side, or the deck steps in where the
    // two meet.
    var width = 0.34
    var near = 0.5 - width / 2
    ctx.fillStyle = "rgba(12, 30, 36, 0.35)"
    if (vertical) ctx.fillRect(near + 0.03, 0, width, 1)
    if (horizontal) ctx.fillRect(0, near + 0.03, 1, width)
    ctx.fillStyle = "#9c7a52"
    if (vertical) ctx.fillRect(near, 0, width, 1)
    if (horizontal) ctx.fillRect(0, near, 1, width)
    ctx.fillStyle = "#c9a874"
    for (var plank = 0; plank < 7; plank++) {
      var p = 0.02 + plank * 0.14
      if (vertical) ctx.fillRect(near + 0.015, p, width - 0.03, 0.095)
      if (horizontal) ctx.fillRect(p, near + 0.015, 0.095, width - 0.03)
    }
    ctx.fillStyle = "#d8c49a"
    if (vertical) { ctx.fillRect(near - 0.02, 0, 0.022, 1); ctx.fillRect(near + width, 0, 0.022, 1) }
    if (horizontal) { ctx.fillRect(0, near - 0.02, 1, 0.022); ctx.fillRect(0, near + width, 1, 0.022) }
    ctx.restore()
  }

  function drawAvenueMarkings(ctx, gx, gy, cellSize, conn) {
    ctx.save()
    ctx.translate(gx + cellSize * 0.5, gy + cellSize * 0.5)
    ctx.scale(cellSize, cellSize)
    ctx.lineCap = "butt"
    ctx.lineJoin = "round"
    var count = Number(conn.up) + Number(conn.right) + Number(conn.down) + Number(conn.left)
    var straight = (conn.up && conn.down) || (conn.left && conn.right)
    var corner = count === 2 && !straight
    var rotation = 0
    if (corner) rotation = conn.up && conn.right ? 0 : conn.right && conn.down ? 1 : conn.down && conn.left ? 2 : 3
    else if (count <= 2) rotation = conn.up ? 0 : conn.right ? 1 : conn.down ? 2 : conn.left ? 3 : 0
    ctx.rotate(rotation * Math.PI / 2)
    function path(offset) {
      ctx.beginPath()
      if (corner) {
        ctx.moveTo(offset, -0.5)
        ctx.quadraticCurveTo(offset, -offset, 0.5, -offset)
      } else if (count <= 2) {
        ctx.moveTo(offset, count === 0 ? -0.30 : -0.5)
        ctx.lineTo(offset, count === 1 ? 0.12 : count === 0 ? 0.30 : 0.5)
      } else {
        if (conn.up) { ctx.moveTo(offset, -0.5); ctx.lineTo(offset, -0.30) }
        if (conn.down) { ctx.moveTo(offset, 0.30); ctx.lineTo(offset, 0.5) }
        if (conn.left) { ctx.moveTo(-0.5, offset); ctx.lineTo(-0.30, offset) }
        if (conn.right) { ctx.moveTo(0.30, offset); ctx.lineTo(0.5, offset) }
      }
      ctx.stroke()
    }
    ctx.setLineDash([])
    ctx.strokeStyle = "#d4b45f"
    ctx.lineWidth = 0.025
    path(-0.035); path(0.035)
    if (cellSize >= 20) {
      ctx.strokeStyle = "rgba(235, 234, 219, 0.66)"
      ctx.lineWidth = 0.018
      // Qt Canvas dash lengths are device-space even under the tile transform.
      ctx.setLineDash([cellSize * 0.12, cellSize * 0.13])
      path(-0.245); path(0.245)
      ctx.setLineDash([])
      if (count >= 3) {
        // Leave the turning area clear; zebra bars stay on each approach.
        ctx.fillStyle = "rgba(228, 225, 207, 0.65)"
        for (var arm = 0; arm < 4; arm++) {
          if ([conn.up, conn.right, conn.down, conn.left][arm]) {
            ctx.save(); ctx.rotate(arm * Math.PI / 2)
            for (var stripe = 0; stripe < 6; stripe++)
              ctx.fillRect(-0.34 + stripe * 0.12, -0.28, 0.07, 0.09)
            ctx.restore()
          }
        }
      }
    }
    ctx.restore()
  }

  function drawRoad(ctx, gx, gy, cellSize, conn, index, avenue) {
    ctx.save()

    // Layered asphalt: dark enough to frame the colorful buildings, with a
    // soft center lift and tiny coordinate-stable aggregate instead of a flat
    // gray slab or repaint-flickering random noise.
    ctx.fillStyle = "#2c2e32"
    ctx.fillRect(gx, gy, cellSize + 1, cellSize + 1)
    // The radius is deliberately larger than the cell so the gradient's dark
    // end falls *outside* it. At 0.72 the darkest ring landed right on the
    // tile edge, and since both neighbours did the same, every join along a
    // road showed as a black seam. Now the whole tile sits in the gentle
    // inner half and adjacent tiles meet at almost the same tone.
    var asphalt = ctx.createRadialGradient(
      gx + cellSize * 0.48, gy + cellSize * 0.46, 0,
      gx + cellSize * 0.48, gy + cellSize * 0.46, cellSize * 1.25)
    asphalt.addColorStop(0, "rgba(82, 84, 89, 0.34)")
    asphalt.addColorStop(0.72, "rgba(60, 62, 68, 0.12)")
    asphalt.addColorStop(1, "rgba(30, 32, 36, 0.10)")
    ctx.fillStyle = asphalt
    ctx.fillRect(gx, gy, cellSize + 1, cellSize + 1)

    var cx = gx + cellSize * 0.5
    var cy = gy + cellSize * 0.5

    // Slightly worn wheel path along every connected arm. This is deliberately
    // broad and faint: it should give the road depth without reading as lanes.
    var wearW = cellSize * 0.38
    ctx.fillStyle = "rgba(8, 9, 11, 0.08)"
    if (conn.up) ctx.fillRect(cx - wearW / 2, gy, wearW, cellSize * 0.5)
    if (conn.down) ctx.fillRect(cx - wearW / 2, cy, wearW, cellSize * 0.5 + 1)
    if (conn.left) ctx.fillRect(gx, cy - wearW / 2, cellSize * 0.5, wearW)
    if (conn.right) ctx.fillRect(cx, cy - wearW / 2, cellSize * 0.5 + 1, wearW)

    var seed = root.roadTextureHash(index + 37)
    var speckSize = Math.max(0.55, cellSize * 0.014)
    for (var s = 0; s < 4; s++) {
      seed = root.roadTextureHash(seed + s + 1)
      var sx = gx + cellSize * (0.12 + ((seed & 255) / 255) * 0.76)
      var sy = gy + cellSize * (0.12 + (((seed >>> 8) & 255) / 255) * 0.76)
      ctx.fillStyle = s % 2 === 0 ? "rgba(210, 211, 208, 0.12)" : "rgba(5, 6, 8, 0.14)"
      ctx.fillRect(sx, sy, speckSize, speckSize)
    }
    if (cellSize >= 24 && (seed & 3) === 0) {
      var crackX = gx + cellSize * (0.22 + ((seed >>> 12) & 63) / 160)
      var crackY = gy + cellSize * (0.24 + ((seed >>> 18) & 63) / 160)
      ctx.strokeStyle = "rgba(7, 8, 10, 0.24)"
      ctx.lineWidth = Math.max(0.6, cellSize * 0.014)
      ctx.beginPath()
      ctx.moveTo(crackX, crackY)
      ctx.lineTo(crackX + cellSize * 0.07, crackY + cellSize * 0.045)
      ctx.lineTo(crackX + cellSize * 0.04, crackY + cellSize * 0.11)
      ctx.stroke()
    }

    // A three-tone curb reads at both overview and close zoom: dark gutter,
    // concrete face, then a hairline highlight toward the neighboring lot.
    var edgeInset = cellSize * (avenue ? 0.018 : 0.035)
    function drawCurb(x1, y1, x2, y2) {
      ctx.lineCap = "square"
      ctx.strokeStyle = "rgba(15, 16, 18, 0.72)"
      ctx.lineWidth = Math.max(1.5, cellSize * 0.105)
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
      ctx.strokeStyle = "#74736f"
      ctx.lineWidth = Math.max(1, cellSize * 0.065)
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
      ctx.strokeStyle = "rgba(225, 219, 201, 0.42)"
      ctx.lineWidth = Math.max(0.65, cellSize * 0.018)
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
    }
    // Inset only the end that actually turns a corner. Insetting both ends
    // left a notch the width of two insets at every join along a through
    // road, so a straight street had its curb visibly chopped into segments.
    var curbX0 = conn.left ? gx : gx + edgeInset
    var curbX1 = conn.right ? gx + cellSize : gx + cellSize - edgeInset
    var curbY0 = conn.up ? gy : gy + edgeInset
    var curbY1 = conn.down ? gy + cellSize : gy + cellSize - edgeInset
    if (!conn.up) drawCurb(curbX0, gy + edgeInset, curbX1, gy + edgeInset)
    if (!conn.down) drawCurb(curbX0, gy + cellSize - edgeInset, curbX1, gy + cellSize - edgeInset)
    if (!conn.left) drawCurb(gx + edgeInset, curbY0, gx + edgeInset, curbY1)
    if (!conn.right) drawCurb(gx + cellSize - edgeInset, curbY0, gx + cellSize - edgeInset, curbY1)

    if (avenue) { ctx.restore(); return }
    var count = (conn.up ? 1 : 0) + (conn.down ? 1 : 0)
      + (conn.left ? 1 : 0) + (conn.right ? 1 : 0)
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.strokeStyle = "rgba(232, 230, 211, 0.72)"
    ctx.lineWidth = Math.max(1, cellSize * 0.045)
    ctx.setLineDash([cellSize * 0.13, cellSize * 0.12])

    if (count === 1) {
      ctx.beginPath()
      if (conn.up) { ctx.moveTo(cx, gy); ctx.lineTo(cx, cy) }
      else if (conn.down) { ctx.moveTo(cx, gy + cellSize); ctx.lineTo(cx, cy) }
      else if (conn.left) { ctx.moveTo(gx, cy); ctx.lineTo(cx, cy) }
      else { ctx.moveTo(gx + cellSize, cy); ctx.lineTo(cx, cy) }
      ctx.stroke()
      // Solid terminal bar makes a dead end intentional instead of broken.
      ctx.setLineDash([])
      ctx.strokeStyle = "rgba(232, 230, 211, 0.58)"
      ctx.beginPath()
      if (conn.up || conn.down) { ctx.moveTo(cx - cellSize * 0.11, cy); ctx.lineTo(cx + cellSize * 0.11, cy) }
      else { ctx.moveTo(cx, cy - cellSize * 0.11); ctx.lineTo(cx, cy + cellSize * 0.11) }
      ctx.stroke()
    } else if (count === 2 && conn.up && conn.down) {
      ctx.beginPath(); ctx.moveTo(cx, gy); ctx.lineTo(cx, gy + cellSize); ctx.stroke()
    } else if (count === 2 && conn.left && conn.right) {
      ctx.beginPath(); ctx.moveTo(gx, cy); ctx.lineTo(gx + cellSize, cy); ctx.stroke()
    } else if (count === 2) {
      // Adjacent connections get a genuine curved center marking.
      ctx.beginPath()
      if (conn.up && conn.right) { ctx.moveTo(cx, gy); ctx.quadraticCurveTo(cx, cy, gx + cellSize, cy) }
      else if (conn.right && conn.down) { ctx.moveTo(gx + cellSize, cy); ctx.quadraticCurveTo(cx, cy, cx, gy + cellSize) }
      else if (conn.down && conn.left) { ctx.moveTo(cx, gy + cellSize); ctx.quadraticCurveTo(cx, cy, gx, cy) }
      else { ctx.moveTo(gx, cy); ctx.quadraticCurveTo(cx, cy, cx, gy) }
      ctx.stroke()
    } else if (count >= 3) {
      // Intersection markings stop short of the conflict area instead of
      // painting an unrealistic bright knot in its center.
      var gap = cellSize * 0.13
      if (conn.up) { ctx.beginPath(); ctx.moveTo(cx, gy); ctx.lineTo(cx, cy - gap); ctx.stroke() }
      if (conn.down) { ctx.beginPath(); ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, gy + cellSize); ctx.stroke() }
      if (conn.left) { ctx.beginPath(); ctx.moveTo(gx, cy); ctx.lineTo(cx - gap, cy); ctx.stroke() }
      if (conn.right) { ctx.beginPath(); ctx.moveTo(cx + gap, cy); ctx.lineTo(gx + cellSize, cy); ctx.stroke() }

      if (cellSize >= 20) {
        // Two understated bars per approach suggest crosswalks without turning
        // every junction into a field of high-contrast zebra stripes.
        ctx.setLineDash([])
        ctx.strokeStyle = "rgba(235, 233, 219, 0.24)"
        ctx.lineWidth = Math.max(0.65, cellSize * 0.018)
        var crossHalf = cellSize * 0.27
        var near = cellSize * 0.19, far = cellSize * 0.25
        if (conn.up) {
          ctx.beginPath(); ctx.moveTo(cx - crossHalf, gy + near); ctx.lineTo(cx + crossHalf, gy + near); ctx.stroke()
          ctx.beginPath(); ctx.moveTo(cx - crossHalf, gy + far); ctx.lineTo(cx + crossHalf, gy + far); ctx.stroke()
        }
        if (conn.down) {
          ctx.beginPath(); ctx.moveTo(cx - crossHalf, gy + cellSize - near); ctx.lineTo(cx + crossHalf, gy + cellSize - near); ctx.stroke()
          ctx.beginPath(); ctx.moveTo(cx - crossHalf, gy + cellSize - far); ctx.lineTo(cx + crossHalf, gy + cellSize - far); ctx.stroke()
        }
        if (conn.left) {
          ctx.beginPath(); ctx.moveTo(gx + near, cy - crossHalf); ctx.lineTo(gx + near, cy + crossHalf); ctx.stroke()
          ctx.beginPath(); ctx.moveTo(gx + far, cy - crossHalf); ctx.lineTo(gx + far, cy + crossHalf); ctx.stroke()
        }
        if (conn.right) {
          ctx.beginPath(); ctx.moveTo(gx + cellSize - near, cy - crossHalf); ctx.lineTo(gx + cellSize - near, cy + crossHalf); ctx.stroke()
          ctx.beginPath(); ctx.moveTo(gx + cellSize - far, cy - crossHalf); ctx.lineTo(gx + cellSize - far, cy + crossHalf); ctx.stroke()
        }

        // Offset the cover so it never obscures the visual center of the junction.
        var coverX = cx + cellSize * 0.075, coverY = cy + cellSize * 0.065
        var coverR = cellSize * 0.052
        ctx.fillStyle = "#24262a"
        ctx.beginPath(); ctx.arc(coverX, coverY, coverR, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = "rgba(132, 134, 136, 0.62)"
        ctx.lineWidth = Math.max(0.65, cellSize * 0.016)
        ctx.stroke()
        ctx.beginPath(); ctx.moveTo(coverX - coverR * 0.55, coverY); ctx.lineTo(coverX + coverR * 0.55, coverY); ctx.stroke()
      }
    }

    ctx.setLineDash([])
    ctx.restore()
  }

  // Same treatment the buildings got: a gradient instead of a flat fill,
  // and real layered shading + an outline on each tree instead of one
  // flat dot — three different sizes so they don't look stamped.
  // Level 0/1/2 map to tier 1/2/3 — these five infrastructure types place
  // at tier 1 and get manually upgraded (see Service.qml's upgradeTile),
  // unlike R/C/I which grow automatically. level undefined (palette icon
  // previews) falls back to tier 2, the "canonical" look each type had
  // before tiers existed.
  function drawPark(ctx, gx, gy, cellSize, level) {
    if (level === undefined) level = 1
    if (level <= 0) root.drawParkPlayground(ctx, gx, gy, cellSize)
    else if (level === 1) root.drawParkGrove(ctx, gx, gy, cellSize)
    else root.drawParkGarden(ctx, gx, gy, cellSize)
  }

  // Tier 1 — a playground: a sand pit, a swing set, a slide. Smaller and
  // busier than open grass, reading as "just getting started" next to the
  // grove's full trees.
  function drawParkPlayground(ctx, gx, gy, cellSize) {
    var grad = ctx.createLinearGradient(gx, gy, gx, gy + cellSize)
    grad.addColorStop(0, "#4bab63")
    grad.addColorStop(1, "#357a44")
    ctx.fillStyle = grad
    ctx.fillRect(gx, gy, cellSize + 1, cellSize + 1)

    var px = gx + cellSize * 0.18, py = gy + cellSize * 0.36
    var pw = cellSize * 0.64, ph = cellSize * 0.46
    ctx.fillStyle = "#d8c48a"
    ctx.fillRect(px, py, pw, ph)
    ctx.strokeStyle = "rgba(90, 70, 30, 0.4)"
    ctx.lineWidth = Math.max(1, cellSize * 0.02)
    ctx.strokeRect(px, py, pw, ph)

    // swing set: two A-frames, a crossbar, two seats
    var topY = py - cellSize * 0.03
    ctx.strokeStyle = "#8a6a45"
    ctx.lineWidth = Math.max(1, cellSize * 0.025)
    ctx.beginPath()
    ctx.moveTo(px + pw * 0.12, py + ph * 0.85); ctx.lineTo(px + pw * 0.3, topY)
    ctx.moveTo(px + pw * 0.48, py + ph * 0.85); ctx.lineTo(px + pw * 0.3, topY)
    ctx.moveTo(px + pw * 0.3, topY); ctx.lineTo(px + pw * 0.3, topY)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(px + pw * 0.3, topY); ctx.lineTo(px + pw * 0.7, topY)
    ctx.stroke()
    ctx.strokeStyle = "#5a4530"
    ctx.lineWidth = Math.max(0.6, cellSize * 0.016)
    ctx.beginPath()
    ctx.moveTo(px + pw * 0.42, topY); ctx.lineTo(px + pw * 0.42, topY + ph * 0.45)
    ctx.moveTo(px + pw * 0.58, topY); ctx.lineTo(px + pw * 0.58, topY + ph * 0.45)
    ctx.stroke()
    ctx.fillStyle = "#3a3a3a"
    ctx.fillRect(px + pw * 0.37, topY + ph * 0.45, pw * 0.1, cellSize * 0.02)
    ctx.fillRect(px + pw * 0.53, topY + ph * 0.45, pw * 0.1, cellSize * 0.02)

    // slide
    var slideX = px + pw * 0.72
    ctx.fillStyle = "#c94f3f"
    ctx.beginPath()
    ctx.moveTo(slideX, py + ph * 0.95)
    ctx.lineTo(slideX, py + ph * 0.3)
    ctx.lineTo(slideX + pw * 0.16, py + ph * 0.95)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = "rgba(20, 10, 5, 0.5)"
    ctx.lineWidth = Math.max(0.5, cellSize * 0.012)
    ctx.stroke()
  }

  // Tier 2 — the original three-tree grove, unchanged.
  function drawParkGrove(ctx, gx, gy, cellSize) {
    var grad = ctx.createLinearGradient(gx, gy, gx, gy + cellSize)
    grad.addColorStop(0, "#4bab63")
    grad.addColorStop(1, "#357a44")
    ctx.fillStyle = grad
    ctx.fillRect(gx, gy, cellSize + 1, cellSize + 1)

    var outline = "rgba(20, 40, 15, 0.55)"
    var spots = [[0.32, 0.38, 1.0], [0.68, 0.3, 0.85], [0.52, 0.7, 1.15]]
    for (var i = 0; i < spots.length; i++) {
      var tx = gx + cellSize * spots[i][0]
      var ty = gy + cellSize * spots[i][1]
      var r = cellSize * 0.13 * spots[i][2]

      ctx.strokeStyle = "#5a3d22"
      ctx.lineWidth = Math.max(1, cellSize * 0.045 * spots[i][2])
      ctx.beginPath()
      ctx.moveTo(tx, ty + r * 0.9); ctx.lineTo(tx, ty + r * 0.15)
      ctx.stroke()

      ctx.fillStyle = "#2a6b3e"
      ctx.beginPath()
      ctx.arc(tx, ty, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = "#3a8a52"
      ctx.beginPath()
      ctx.arc(tx + r * 0.12, ty + r * 0.12, r * 0.82, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = "#57b06e"
      ctx.beginPath()
      ctx.arc(tx - r * 0.28, ty - r * 0.28, r * 0.45, 0, Math.PI * 2)
      ctx.fill()

      ctx.strokeStyle = outline
      ctx.lineWidth = Math.max(1, cellSize * 0.025)
      ctx.beginPath()
      ctx.arc(tx, ty, r, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  // Tier 3 — a garden: a stone fountain on a gravel ring, with flower beds
  // planted in each corner.
  function drawParkGarden(ctx, gx, gy, cellSize) {
    var grad = ctx.createLinearGradient(gx, gy, gx, gy + cellSize)
    grad.addColorStop(0, "#4bab63")
    grad.addColorStop(1, "#357a44")
    ctx.fillStyle = grad
    ctx.fillRect(gx, gy, cellSize + 1, cellSize + 1)

    var cx = gx + cellSize * 0.5, cy = gy + cellSize * 0.5

    ctx.strokeStyle = "#c9bfa0"
    ctx.lineWidth = cellSize * 0.08
    ctx.beginPath()
    ctx.arc(cx, cy, cellSize * 0.28, 0, Math.PI * 2)
    ctx.stroke()

    ctx.fillStyle = "#8a97a0"
    ctx.beginPath(); ctx.arc(cx, cy, cellSize * 0.17, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = "rgba(20, 30, 40, 0.4)"
    ctx.lineWidth = Math.max(0.5, cellSize * 0.012)
    ctx.stroke()
    var poolGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cellSize * 0.12)
    poolGrad.addColorStop(0, "#a9d8f0")
    poolGrad.addColorStop(1, "#4f8ab0")
    ctx.fillStyle = poolGrad
    ctx.beginPath(); ctx.arc(cx, cy, cellSize * 0.12, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)"
    ctx.beginPath(); ctx.arc(cx, cy, cellSize * 0.025, 0, Math.PI * 2); ctx.fill()

    var bedColors = ["#e0524a", "#e8c93a", "#c96fd9", "#f0a03a"]
    var bedPos = [[0.16, 0.16], [0.84, 0.16], [0.16, 0.84], [0.84, 0.84]]
    for (var b = 0; b < 4; b++) {
      var bx = gx + cellSize * bedPos[b][0], by = gy + cellSize * bedPos[b][1]
      for (var d = 0; d < 3; d++) {
        ctx.fillStyle = bedColors[(b + d) % bedColors.length]
        var ang = d * (Math.PI * 2 / 3)
        ctx.beginPath()
        ctx.arc(bx + Math.cos(ang) * cellSize * 0.045, by + Math.sin(ang) * cellSize * 0.045, cellSize * 0.032, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  // A soft offset rect peeking out from a building's bottom-right edge —
  // cheap depth cue (no shadowBlur, which tanks Canvas2D perf at the tile
  // counts this grid can hit) that still reads as "sitting on the ground"
  // instead of a flat decal painted onto it.
  function drawFootprintShadow(ctx, x, y, w, h, cellSize) {
    var off = cellSize * 0.05
    ctx.fillStyle = "rgba(8, 12, 8, 0.24)"
    ctx.fillRect(x + off, y + off, w, h)
  }

  // Same "actual different building per level" treatment as commercial and
  // industrial: a trailer growing into a real house growing into an
  // apartment block, instead of one house archetype just getting bigger.
  function drawResidential(ctx, gx, gy, cellSize, level) {
    root.drawSpriteLot(ctx, gx, gy, cellSize, "R")
    if (level <= 1) root.drawResidentialTrailer(ctx, gx, gy, cellSize)
    else if (level === 2) root.drawResidentialHouse(ctx, gx, gy, cellSize)
    else root.drawResidentialApartment(ctx, gx, gy, cellSize)
  }

  // Draw a roof-dominant, lightly dimensional building over the same square
  // lot as the procedural art. R1 stays comfortably within the tile, R2 gets
  // broader, and R3 grows upward into the row north of it. The grid itself is
  // still completely orthogonal; only the building illustration has depth.
  // Returning false lets drawTile fall back cleanly until every PNG is loaded.
  // Pick variation from the tile's world coordinate, not repaint order or a
  // random value. A block keeps the same building across pans and restarts.
  function spriteSourceFor(levelSets, level, index) {
    if (level < 1 || level > levelSets.length || index < 0) return ""
    var choices = levelSets[level - 1]
    if (!choices || choices.length === 0) return ""
    var hash = index | 0
    hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b)
    hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b)
    hash = (hash ^ (hash >>> 16)) >>> 0
    return choices[hash % choices.length]
  }

  // Bounds of the painted cutouts, excluding transparent export padding.
  // Crop only while drawing; uniform fit preserves each building's natural
  // proportions and lot gaps.
  //
  // Only the sprites that were exported with padding are listed. r3/r3b,
  // c3a/c3b and i3a/i3b are drawn by the generic path below, which uses a
  // fixed aspect per level that happens to match them — giving them frames
  // here would silently change how they have always been drawn.
  //
  // These are source-pixel rectangles, so they belong to a particular file at
  // a particular size. Downscaling the six sprites they describe from 1254px
  // to 256px put every one of them out of bounds and the canvas started
  // logging "drawImage(), index size error" on every repaint. Measured from
  // the shipped files rather than converted, and pinned by tests/sprite-budget.
  readonly property var matureSpriteFrames: ({
    "r3c.png": [43, 10, 169, 235],
    "r3d.png": [21, 12, 214, 225],
    "c3c.png": [45, 3, 162, 241],
    "c3d.png": [15, 5, 227, 238],
    "i3c.png": [10, 38, 237, 179],
    "i3d.png": [4, 3, 248, 233],
    "r3e.png": [24, 8, 207, 240],
    "r3f.png": [9, 8, 238, 240],
    "r3g.png": [69, 8, 117, 240],
    "r3h.png": [8, 73, 240, 175],
    "c3e.png": [17, 8, 221, 240],
    "c3f.png": [8, 55, 240, 193],
    "c3g.png": [48, 8, 160, 240],
    "c3h.png": [8, 91, 240, 157],
    "i3e.png": [34, 8, 187, 240],
    "i3f.png": [8, 68, 240, 180],
    "i3g.png": [26, 8, 204, 240],
    "i3h.png": [8, 35, 240, 213]
  })

  function drawMatureVariant(ctx, source, gx, gy, cellSize) {
    var name = source.substring(source.lastIndexOf("/") + 1)
    var frame = root.matureSpriteFrames[name]
    if (!frame) return false
    var scale = Math.min(cellSize * 0.84 / frame[2], cellSize * 0.88 / frame[3])
    var w = frame[2] * scale, h = frame[3] * scale
    ctx.drawImage(source, frame[0], frame[1], frame[2], frame[3],
                  gx + (cellSize - w) / 2, gy + cellSize * 0.94 - h, w, h)
    return true
  }

  function drawResidentialSprite(ctx, gx, gy, cellSize, level, index) {
    if (!root.useResidentialSprites || level < 1 || level > 3) return false
    var source = root.spriteSourceFor(root.residentialSpriteUrls, level, index)
    if (source === "") return false
    if (!cityCanvas.isImageLoaded(source)) return false

    root.drawSpriteLot(ctx, gx, gy, cellSize, "R", index)
    root.drawLotDressing(ctx, gx, gy, cellSize, "R", index)

    if (root.drawMatureVariant(ctx, source, gx, gy, cellSize)) return true

    // Source aspect ratios after transparent-edge trimming. Width is the
    // gameplay control: R2 reads denser laterally; R3 uses its narrower source
    // to gain height while staying inside its own lot.
    var sourceAspect = [256 / 244, 256 / 216, 220 / 256][level - 1]
    // Leave real daylight between silhouettes, including the row behind.
    var widthScale = [0.76, 0.84, 0.75][level - 1]
    var drawW = cellSize * widthScale
    var drawH = drawW / sourceAspect
    var drawX = gx + (cellSize - drawW) / 2
    var baseline = gy + cellSize * 0.94
    ctx.drawImage(source, drawX, baseline - drawH, drawW, drawH)
    return true
  }

  // Commercial shares the same near-overhead camera but fills more of its
  // block as it develops: corner shop, restaurant/market, then office-retail
  // complex. All source canvases are square so variants within a tier keep a
  // stable baseline and footprint despite their different silhouettes.
  function drawCommercialSprite(ctx, gx, gy, cellSize, level, index) {
    if (!root.useCommercialSprites || level < 1 || level > 3) return false
    var source = root.spriteSourceFor(root.commercialSpriteUrls, level, index)
    if (source === "") return false
    if (!cityCanvas.isImageLoaded(source)) return false

    root.drawSpriteLot(ctx, gx, gy, cellSize, "C", index)
    root.drawLotDressing(ctx, gx, gy, cellSize, "C", index)

    if (root.drawMatureVariant(ctx, source, gx, gy, cellSize)) return true

    var widthScale = [0.76, 0.84, 0.88][level - 1]
    var drawW = cellSize * widthScale
    var drawH = drawW
    var drawX = gx + (cellSize - drawW) / 2
    var baseline = gy + cellSize * 0.94
    ctx.drawImage(source, drawX, baseline - drawH, drawW, drawH)
    return true
  }

  // Industrial grows from a compact workshop into a working factory and a
  // dense processing plant. Matching square source canvases let the paired
  // silhouettes vary freely while keeping their lot baseline predictable.
  function drawIndustrialSprite(ctx, gx, gy, cellSize, level, index) {
    if (!root.useIndustrialSprites || level < 1 || level > 3) return false
    var source = root.spriteSourceFor(root.industrialSpriteUrls, level, index)
    if (source === "") return false
    if (!cityCanvas.isImageLoaded(source)) return false

    root.drawSpriteLot(ctx, gx, gy, cellSize, "I", index)
    root.drawLotDressing(ctx, gx, gy, cellSize, "I", index)

    if (root.drawMatureVariant(ctx, source, gx, gy, cellSize)) return true

    var widthScale = [0.78, 0.86, 0.90][level - 1]
    var drawW = cellSize * widthScale
    var drawH = drawW
    var drawX = gx + (cellSize - drawW) / 2
    var baseline = gy + cellSize * 0.94
    ctx.drawImage(source, drawX, baseline - drawH, drawW, drawH)
    return true
  }

  // Level 1 — a single-wide trailer. Low, long, an arched roof cap, a
  // color band, skirting at the base, and a hitch poking out one end —
  // the hitch is the one unmistakable "this is a trailer" cue.
  function drawResidentialTrailer(ctx, gx, gy, cellSize) {
    var bx = gx + cellSize * 0.16, by = gy + cellSize * 0.5
    var bw = cellSize * 0.7, bh = cellSize * 0.3
    var outline = "rgba(22, 15, 10, 0.65)"
    root.drawFootprintShadow(ctx, bx, by, bw, bh, cellSize)

    var bodyGrad = ctx.createLinearGradient(0, by, 0, by + bh)
    bodyGrad.addColorStop(0, "#e8e2d0")
    bodyGrad.addColorStop(1, "#c9c0a8")
    ctx.fillStyle = bodyGrad
    ctx.fillRect(bx, by, bw, bh)
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(1, cellSize * 0.025)
    ctx.strokeRect(bx, by, bw, bh)

    ctx.fillStyle = "#9a9284"
    ctx.fillRect(bx - cellSize * 0.01, by - cellSize * 0.035, bw + cellSize * 0.02, cellSize * 0.045)

    ctx.fillStyle = root.roofColors.R
    ctx.fillRect(bx, by + bh * 0.55, bw, bh * 0.18)

    ctx.fillStyle = "#8a8274"
    ctx.fillRect(bx, by + bh * 0.88, bw, bh * 0.12)

    var winW = bw * 0.22, winH = bh * 0.32
    var winX = bx + bw * 0.12, winY = by + bh * 0.14
    var glassGrad = ctx.createLinearGradient(0, winY, 0, winY + winH)
    glassGrad.addColorStop(0, "#cfe6f2")
    glassGrad.addColorStop(1, "#5f90b8")
    ctx.fillStyle = glassGrad
    ctx.fillRect(winX, winY, winW, winH)
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(0.5, cellSize * 0.014)
    ctx.strokeRect(winX, winY, winW, winH)

    var doorW = bw * 0.16, doorH = bh * 0.6
    var doorX = bx + bw * 0.62, doorY = by + bh - doorH
    ctx.fillStyle = "#8a4a1e"
    ctx.fillRect(doorX, doorY, doorW, doorH)
    ctx.strokeStyle = outline
    ctx.strokeRect(doorX, doorY, doorW, doorH)
    ctx.fillStyle = "#6b6255"
    ctx.fillRect(doorX - cellSize * 0.02, by + bh, doorW + cellSize * 0.04, cellSize * 0.03)

    ctx.strokeStyle = "#5a5248"
    ctx.lineWidth = Math.max(1, cellSize * 0.02)
    ctx.beginPath()
    ctx.moveTo(bx, by + bh * 0.5)
    ctx.lineTo(bx - cellSize * 0.1, by + bh * 0.5)
    ctx.stroke()
    ctx.fillStyle = "#3a3a3a"
    ctx.beginPath()
    ctx.arc(bx - cellSize * 0.1, by + bh * 0.5, cellSize * 0.02, 0, Math.PI * 2)
    ctx.fill()
  }

  // Level 2 — a proper single-family house: gabled roof with shingle rows
  // and a ridge glint, a glazed window, a paneled door, a chimney.
  function drawResidentialHouse(ctx, gx, gy, cellSize) {
    var frac = 0.62
    var pad = cellSize * (1 - frac) / 2
    var x = gx + pad, y = gy + pad, s = cellSize - pad * 2
    root.drawFootprintShadow(ctx, x, y, s, s, cellSize)

    var roofBase = root.roofColors.R
    var roofLight = Qt.lighter(roofBase, 1.4)
    var roofBright = Qt.lighter(roofBase, 1.65)
    var roofDark = root.accentColors.R
    var peakX = x + s * 0.5
    var eaveY = y + s * 0.6
    var outline = "rgba(22, 15, 10, 0.65)"
    var outlineW = Math.max(1, cellSize * 0.035)

    var leftGrad = ctx.createLinearGradient(x, eaveY, peakX, y)
    leftGrad.addColorStop(0, roofBase)
    leftGrad.addColorStop(0.55, roofLight)
    leftGrad.addColorStop(1, roofBright)
    ctx.fillStyle = leftGrad
    ctx.beginPath()
    ctx.moveTo(peakX, y); ctx.lineTo(x, eaveY); ctx.lineTo(peakX, eaveY)
    ctx.closePath()
    ctx.fill()

    var rightGrad = ctx.createLinearGradient(peakX, y, x + s, eaveY)
    rightGrad.addColorStop(0, roofBase)
    rightGrad.addColorStop(0.6, Qt.darker(roofBase, 1.15))
    rightGrad.addColorStop(1, roofDark)
    ctx.fillStyle = rightGrad
    ctx.beginPath()
    ctx.moveTo(peakX, y); ctx.lineTo(x + s, eaveY); ctx.lineTo(peakX, eaveY)
    ctx.closePath()
    ctx.fill()

    // Shingle rows — two per slope, endpoints computed straight off the
    // triangle's own edges (both are simple right triangles with one
    // vertical edge at peakX) rather than clipped, which is exact either
    // way and skips the extra save/clip/restore per row.
    ctx.strokeStyle = "rgba(20, 12, 8, 0.22)"
    ctx.lineWidth = Math.max(0.6, cellSize * 0.018)
    var rows = [0.35, 0.65]
    for (var ri = 0; ri < rows.length; ri++) {
      var t = rows[ri]
      var rowY = eaveY - t * (eaveY - y)
      var leftX = x + t * (peakX - x)
      var rightX = (x + s) + t * (peakX - (x + s))
      ctx.beginPath(); ctx.moveTo(leftX, rowY); ctx.lineTo(peakX, rowY); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(peakX, rowY); ctx.lineTo(rightX, rowY); ctx.stroke()
    }

    ctx.strokeStyle = outline
    ctx.lineWidth = outlineW
    ctx.lineJoin = "round"
    ctx.beginPath()
    ctx.moveTo(x, eaveY); ctx.lineTo(peakX, y); ctx.lineTo(x + s, eaveY)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(peakX, y); ctx.lineTo(peakX, eaveY)
    ctx.stroke()

    // Ridge glint — a short bright stroke on the sunlit slope only, right
    // at the peak, so the roof reads as catching light rather than just
    // being a lighter color up top.
    ctx.strokeStyle = Qt.lighter(roofBright, 1.15)
    ctx.lineWidth = Math.max(0.6, cellSize * 0.02)
    ctx.beginPath()
    ctx.moveTo(peakX - s * 0.16, y + (eaveY - y) * 0.16)
    ctx.lineTo(peakX, y)
    ctx.stroke()

    var wallH = (y + s) - eaveY
    if (wallH > 1) {
      var wallGrad = ctx.createLinearGradient(x, eaveY, x, y + s)
      wallGrad.addColorStop(0, "#efe8d4")
      wallGrad.addColorStop(1, "#d5cbaf")
      ctx.fillStyle = wallGrad
      ctx.fillRect(x, eaveY, s, wallH)
      ctx.strokeStyle = outline
      ctx.lineWidth = outlineW * 0.75
      ctx.strokeRect(x, eaveY, s, wallH)

      var winX = x + s * 0.14, winY = eaveY + wallH * 0.15
      var winW = s * 0.28, winH = wallH * 0.5
      var glassGrad = ctx.createLinearGradient(winX, winY, winX, winY + winH)
      glassGrad.addColorStop(0, "#cfe6f2")
      glassGrad.addColorStop(1, "#5f90b8")
      ctx.fillStyle = glassGrad
      ctx.fillRect(winX, winY, winW, winH)
      ctx.strokeStyle = outline
      ctx.lineWidth = Math.max(0.6, cellSize * 0.02)
      ctx.strokeRect(winX, winY, winW, winH)
      ctx.beginPath()
      ctx.moveTo(winX + winW / 2, winY); ctx.lineTo(winX + winW / 2, winY + winH)
      ctx.moveTo(winX, winY + winH / 2); ctx.lineTo(winX + winW, winY + winH / 2)
      ctx.stroke()
      ctx.strokeStyle = "rgba(255, 255, 255, 0.55)"
      ctx.lineWidth = Math.max(0.5, cellSize * 0.014)
      ctx.beginPath()
      ctx.moveTo(winX + winW * 0.18, winY + winH * 0.85)
      ctx.lineTo(winX + winW * 0.55, winY + winH * 0.15)
      ctx.stroke()

      var doorX = x + s * 0.58, doorY = eaveY + wallH * 0.3
      var doorW = s * 0.24, doorH = wallH * 0.7
      var doorGrad = ctx.createLinearGradient(doorX, doorY, doorX + doorW, doorY + doorH)
      doorGrad.addColorStop(0, "#b96b32")
      doorGrad.addColorStop(1, "#8a4a1e")
      ctx.fillStyle = doorGrad
      ctx.fillRect(doorX, doorY, doorW, doorH)
      ctx.strokeStyle = outline
      ctx.strokeRect(doorX, doorY, doorW, doorH)
      ctx.lineWidth = Math.max(0.5, cellSize * 0.012)
      ctx.beginPath()
      ctx.moveTo(doorX, doorY + doorH * 0.42); ctx.lineTo(doorX + doorW, doorY + doorH * 0.42)
      ctx.stroke()
      ctx.fillStyle = "#2e2013"
      ctx.beginPath()
      ctx.arc(doorX + doorW * 0.78, doorY + doorH * 0.5, Math.max(0.7, cellSize * 0.016), 0, Math.PI * 2)
      ctx.fill()
    }

    var chimW = s * 0.1, chimH = s * 0.12
    var chimGrad = ctx.createLinearGradient(peakX - chimW / 2, y, peakX + chimW / 2, y)
    chimGrad.addColorStop(0, "#8a8a8a")
    chimGrad.addColorStop(1, "#57575a")
    ctx.fillStyle = chimGrad
    ctx.fillRect(peakX - chimW / 2, y, chimW, chimH)
    ctx.strokeStyle = outline
    ctx.lineWidth = outlineW * 0.6
    ctx.strokeRect(peakX - chimW / 2, y, chimW, chimH)
  }

  // Level 3 — an apartment block: a tall flat-roofed building, a 2x3 grid
  // of glazed windows with balcony rails, a ground-floor entrance, and a
  // rooftop water tank — the unmistakable "this got dense" silhouette.
  function drawResidentialApartment(ctx, gx, gy, cellSize) {
    var bx = gx + cellSize * 0.14, by = gy + cellSize * 0.1
    var bw = cellSize * 0.72, bh = cellSize * 0.8
    var outline = "rgba(22, 15, 10, 0.65)"
    root.drawFootprintShadow(ctx, bx, by, bw, bh, cellSize)

    var wallGrad = ctx.createLinearGradient(0, by, 0, by + bh)
    wallGrad.addColorStop(0, "#d8c9a8")
    wallGrad.addColorStop(1, "#b8a482")
    ctx.fillStyle = wallGrad
    ctx.fillRect(bx, by, bw, bh)
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(1, cellSize * 0.03)
    ctx.strokeRect(bx, by, bw, bh)

    ctx.fillStyle = root.accentColors.R
    ctx.fillRect(bx - cellSize * 0.01, by - cellSize * 0.03, bw + cellSize * 0.02, cellSize * 0.04)

    var cols = 2, rows = 3
    var gridPadX = bw * 0.14
    var gridW = bw - gridPadX * 2, gridH = bh * 0.62
    var gridTop = by + bh * 0.12
    var winW = (gridW / cols) * 0.62, winH = (gridH / rows) * 0.55
    var glassGrad = ctx.createLinearGradient(0, gridTop, 0, gridTop + gridH)
    glassGrad.addColorStop(0, "#cfe6f2")
    glassGrad.addColorStop(1, "#5f90b8")
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var wx = bx + gridPadX + c * (gridW / cols) + (gridW / cols - winW) / 2
        var wy = gridTop + r * (gridH / rows) + (gridH / rows - winH) / 2
        ctx.fillStyle = glassGrad
        ctx.fillRect(wx, wy, winW, winH)
        ctx.strokeStyle = outline
        ctx.lineWidth = Math.max(0.5, cellSize * 0.012)
        ctx.strokeRect(wx, wy, winW, winH)
        ctx.strokeStyle = "rgba(60, 50, 40, 0.5)"
        ctx.lineWidth = Math.max(0.5, cellSize * 0.01)
        ctx.beginPath()
        ctx.moveTo(wx - winW * 0.08, wy + winH + cellSize * 0.015)
        ctx.lineTo(wx + winW * 1.08, wy + winH + cellSize * 0.015)
        ctx.stroke()
      }
    }

    var doorW = bw * 0.24, doorH = bh * 0.16
    var doorX = bx + bw * 0.5 - doorW / 2, doorY = by + bh - doorH
    ctx.fillStyle = "#5c3a22"
    ctx.fillRect(doorX, doorY, doorW, doorH)
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(0.5, cellSize * 0.014)
    ctx.strokeRect(doorX, doorY, doorW, doorH)
    ctx.fillStyle = root.accentColors.R
    ctx.fillRect(doorX - cellSize * 0.02, doorY - cellSize * 0.03, doorW + cellSize * 0.04, cellSize * 0.03)

    // Rooftop water tank — the signature "apartment block" cue.
    var tankX = bx + bw * 0.78, tankY = by - cellSize * 0.14
    ctx.fillStyle = "#8a6a45"
    ctx.beginPath()
    ctx.moveTo(tankX - cellSize * 0.05, tankY + cellSize * 0.09)
    ctx.lineTo(tankX + cellSize * 0.05, tankY + cellSize * 0.09)
    ctx.lineTo(tankX + cellSize * 0.04, tankY - cellSize * 0.02)
    ctx.lineTo(tankX - cellSize * 0.04, tankY - cellSize * 0.02)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(0.5, cellSize * 0.012)
    ctx.stroke()
    ctx.fillStyle = "#5c4530"
    ctx.beginPath()
    ctx.moveTo(tankX - cellSize * 0.06, tankY - cellSize * 0.02)
    ctx.lineTo(tankX + cellSize * 0.06, tankY - cellSize * 0.02)
    ctx.lineTo(tankX, tankY - cellSize * 0.07)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = "#3a3a3a"
    ctx.lineWidth = Math.max(0.5, cellSize * 0.008)
    ctx.beginPath()
    ctx.moveTo(tankX - cellSize * 0.035, tankY + cellSize * 0.09); ctx.lineTo(tankX - cellSize * 0.035, tankY + cellSize * 0.13)
    ctx.moveTo(tankX + cellSize * 0.035, tankY + cellSize * 0.09); ctx.lineTo(tankX + cellSize * 0.035, tankY + cellSize * 0.13)
    ctx.stroke()
  }

  // A cheap gear silhouette — a filled disc plus a ring of small rotated
  // teeth — reused at every industrial tier so "gear" reads as one
  // consistent visual language instead of a one-off doodle per level.
  function drawGear(ctx, cx, cy, r, teeth, fill, outline, cellSize) {
    ctx.fillStyle = fill
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(0.5, cellSize * 0.012)
    ctx.stroke()
    var toothW = r * 0.55, toothH = r * 0.5
    for (var t = 0; t < teeth; t++) {
      var ang = (t / teeth) * Math.PI * 2
      ctx.save()
      ctx.translate(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r)
      ctx.rotate(ang)
      ctx.fillStyle = fill
      ctx.fillRect(-toothW / 2, -toothH / 2, toothW, toothH)
      ctx.restore()
    }
    ctx.fillStyle = outline
    ctx.beginPath()
    ctx.arc(cx, cy, r * 0.35, 0, Math.PI * 2)
    ctx.fill()
  }

  // Commercial and industrial used to just be one archetype scaled up by
  // level — same silhouette, bigger numbers. That reads as abstract no
  // matter how much shading gets piled on, because there's nothing to
  // recognize. Each level is now an actual different kind of building —
  // a corner shop growing into a chain storefront growing into a mall; a
  // garage growing into a small factory growing into a full industrial
  // complex — the way a real block actually changes character as it
  // develops, not just gets taller.
  function drawCommercial(ctx, gx, gy, cellSize, level) {
    ctx.fillStyle = "#4a4a52"
    ctx.fillRect(gx, gy, cellSize + 1, cellSize + 1)
    if (level <= 1) root.drawCommercialShop(ctx, gx, gy, cellSize)
    else if (level === 2) root.drawCommercialFastFood(ctx, gx, gy, cellSize)
    else root.drawCommercialMall(ctx, gx, gy, cellSize)
  }

  // Level 1 — a small corner shop. A pastel storefront, a scalloped
  // awning, pastries in the window, and a rooftop donut sign on a pole —
  // the single most recognizable "small commercial" silhouette there is.
  function drawCommercialShop(ctx, gx, gy, cellSize) {
    var bx = gx + cellSize * 0.16, by = gy + cellSize * 0.46
    var bw = cellSize * 0.68, bh = cellSize * 0.4
    var outline = "rgba(15, 16, 20, 0.6)"
    root.drawFootprintShadow(ctx, bx, by, bw, bh, cellSize)

    var wallGrad = ctx.createLinearGradient(0, by, 0, by + bh)
    wallGrad.addColorStop(0, "#f4dcc8")
    wallGrad.addColorStop(1, "#dcb896")
    ctx.fillStyle = wallGrad
    ctx.fillRect(bx, by, bw, bh)
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(1, cellSize * 0.03)
    ctx.strokeRect(bx, by, bw, bh)

    var winW = bw * 0.32, winH = bh * 0.42
    var winX = bx + bw * 0.12, winY = by + bh * 0.3
    var glassGrad = ctx.createLinearGradient(0, winY, 0, winY + winH)
    glassGrad.addColorStop(0, "#fff6ea")
    glassGrad.addColorStop(1, "#e7b98c")
    ctx.fillStyle = glassGrad
    ctx.fillRect(winX, winY, winW, winH)
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(0.5, cellSize * 0.014)
    ctx.strokeRect(winX, winY, winW, winH)
    var treats = ["#c9752f", "#e0a23f", "#b5542a"]
    for (var t = 0; t < 3; t++) {
      ctx.fillStyle = treats[t]
      ctx.beginPath()
      ctx.arc(winX + winW * (0.22 + t * 0.28), winY + winH * 0.65, winW * 0.11, 0, Math.PI * 2)
      ctx.fill()
    }

    var doorW = bw * 0.26, doorH = bh * 0.62
    var doorX = bx + bw * 0.62, doorY = by + bh - doorH
    var doorGrad = ctx.createLinearGradient(doorX, doorY, doorX + doorW, doorY + doorH)
    doorGrad.addColorStop(0, "#8a5a3a")
    doorGrad.addColorStop(1, "#5c3a22")
    ctx.fillStyle = doorGrad
    ctx.fillRect(doorX, doorY, doorW, doorH)
    ctx.strokeStyle = outline
    ctx.strokeRect(doorX, doorY, doorW, doorH)

    var awningY = by - cellSize * 0.05
    var scallops = 4
    var scallopW = bw / scallops
    ctx.fillStyle = root.accentColors.C
    for (var sc = 0; sc < scallops; sc++) {
      ctx.beginPath()
      ctx.arc(bx + scallopW * (sc + 0.5), awningY, scallopW * 0.5, 0, Math.PI, false)
      ctx.fill()
    }
    ctx.fillStyle = "#e6e0d2"
    ctx.fillRect(bx, awningY - cellSize * 0.02, bw, cellSize * 0.05)

    var poleX = bx + bw * 0.5
    var poleTopY = by - cellSize * 0.34
    ctx.strokeStyle = "#3a3a3a"
    ctx.lineWidth = Math.max(1, cellSize * 0.02)
    ctx.beginPath()
    ctx.moveTo(poleX, awningY - cellSize * 0.02)
    ctx.lineTo(poleX, poleTopY)
    ctx.stroke()

    var donutR = cellSize * 0.11
    ctx.fillStyle = "#e79ac9"
    ctx.beginPath(); ctx.arc(poleX, poleTopY, donutR, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(0.6, cellSize * 0.014)
    ctx.stroke()
    ctx.fillStyle = "#4a4a52"
    ctx.beginPath(); ctx.arc(poleX, poleTopY, donutR * 0.4, 0, Math.PI * 2); ctx.fill()
    ctx.lineWidth = Math.max(0.5, cellSize * 0.01)
    ctx.stroke()
    var sprinkleColors = ["#5a3a8a", "#3a8a5a", "#e0d23a", "#3a5a8a"]
    var sprSize = Math.max(0.7, cellSize * 0.016)
    for (var sp = 0; sp < 4; sp++) {
      var ang = sp * (Math.PI / 2) + 0.4
      var rx = poleX + Math.cos(ang) * donutR * 0.68
      var ry = poleTopY + Math.sin(ang) * donutR * 0.68
      ctx.fillStyle = sprinkleColors[sp]
      ctx.fillRect(rx - sprSize / 2, ry - sprSize / 2, sprSize, sprSize)
    }
  }

  // Level 2 — a fast-food chain storefront. Wider, brighter, a bold arch
  // roofline, a lit menu-sign pole, and a drive-thru lane curling around
  // the side — the "this got a lot busier" silhouette.
  function drawCommercialFastFood(ctx, gx, gy, cellSize) {
    var bx = gx + cellSize * 0.08, by = gy + cellSize * 0.4
    var bw = cellSize * 0.84, bh = cellSize * 0.4
    var outline = "rgba(15, 16, 20, 0.6)"
    root.drawFootprintShadow(ctx, bx, by, bw, bh, cellSize)

    var wallGrad = ctx.createLinearGradient(0, by, 0, by + bh)
    wallGrad.addColorStop(0, "#e0524a")
    wallGrad.addColorStop(1, "#a83a34")
    ctx.fillStyle = wallGrad
    ctx.fillRect(bx, by, bw, bh)
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(1, cellSize * 0.03)
    ctx.strokeRect(bx, by, bw, bh)

    var winY = by + bh * 0.42, winH = bh * 0.42
    var glassGrad = ctx.createLinearGradient(0, winY, 0, winY + winH)
    glassGrad.addColorStop(0, "#eaf6fb")
    glassGrad.addColorStop(1, "#9fd0e8")
    ctx.fillStyle = glassGrad
    ctx.fillRect(bx + bw * 0.06, winY, bw * 0.88, winH)
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(0.5, cellSize * 0.014)
    ctx.strokeRect(bx + bw * 0.06, winY, bw * 0.88, winH)
    ctx.beginPath()
    for (var m = 1; m < 4; m++) {
      var mx = bx + bw * 0.06 + bw * 0.88 * (m / 4)
      ctx.moveTo(mx, winY); ctx.lineTo(mx, winY + winH)
    }
    ctx.stroke()

    ctx.strokeStyle = "#f0c020"
    ctx.lineWidth = Math.max(2, cellSize * 0.05)
    ctx.lineCap = "round"
    ctx.beginPath()
    ctx.moveTo(bx + bw * 0.12, by)
    ctx.quadraticCurveTo(bx + bw * 0.5, by - cellSize * 0.22, bx + bw * 0.88, by)
    ctx.stroke()
    ctx.lineCap = "butt"

    var poleX = bx + bw * 0.92
    ctx.strokeStyle = "#3a3a3a"
    ctx.lineWidth = Math.max(1, cellSize * 0.02)
    ctx.beginPath()
    ctx.moveTo(poleX, by)
    ctx.lineTo(poleX, by - cellSize * 0.3)
    ctx.stroke()
    var signW = cellSize * 0.16, signH = cellSize * 0.12
    ctx.fillStyle = "#f0c020"
    ctx.fillRect(poleX - signW / 2, by - cellSize * 0.3 - signH, signW, signH)
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(0.5, cellSize * 0.012)
    ctx.strokeRect(poleX - signW / 2, by - cellSize * 0.3 - signH, signW, signH)
    ctx.fillStyle = "#c9392f"
    ctx.beginPath()
    ctx.arc(poleX, by - cellSize * 0.3 - signH / 2, signH * 0.28, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = "rgba(230, 220, 200, 0.55)"
    ctx.lineWidth = Math.max(1, cellSize * 0.02)
    ctx.setLineDash([cellSize * 0.04, cellSize * 0.03])
    ctx.beginPath()
    ctx.moveTo(bx - cellSize * 0.02, by + bh * 0.2)
    ctx.quadraticCurveTo(bx - cellSize * 0.14, by + bh * 0.5, bx - cellSize * 0.02, by + bh * 0.85)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = "rgba(230, 220, 200, 0.7)"
    ctx.beginPath()
    ctx.moveTo(bx - cellSize * 0.02, by + bh * 0.85)
    ctx.lineTo(bx - cellSize * 0.06, by + bh * 0.78)
    ctx.lineTo(bx - cellSize * 0.01, by + bh * 0.8)
    ctx.closePath()
    ctx.fill()

    var doorW = bw * 0.14, doorH = bh * 0.5
    var doorX = bx + bw * 0.5 - doorW / 2, doorY = by + bh - doorH
    ctx.fillStyle = "#2a2a2e"
    ctx.fillRect(doorX, doorY, doorW, doorH)
    ctx.strokeStyle = outline
    ctx.strokeRect(doorX, doorY, doorW, doorH)
  }

  // Level 3 — a shopping mall. A wide flat-roofed block spanning most of
  // the tile, multiple storefront bays, an entrance canopy, and a couple
  // of parked cars out front — the "this is a destination now" silhouette.
  function drawCommercialMall(ctx, gx, gy, cellSize) {
    var bx = gx + cellSize * 0.05, by = gy + cellSize * 0.22
    var bw = cellSize * 0.9, bh = cellSize * 0.58
    var outline = "rgba(15, 16, 20, 0.6)"
    root.drawFootprintShadow(ctx, bx, by, bw, bh, cellSize)

    var wallGrad = ctx.createLinearGradient(0, by, 0, by + bh)
    wallGrad.addColorStop(0, "#8a97a8")
    wallGrad.addColorStop(1, "#5c6a7c")
    ctx.fillStyle = wallGrad
    ctx.fillRect(bx, by, bw, bh)
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(1, cellSize * 0.03)
    ctx.strokeRect(bx, by, bw, bh)

    ctx.fillStyle = "#aab4c2"
    ctx.fillRect(bx, by, bw, cellSize * 0.05)

    var bays = 3
    var bayW = bw / bays
    ctx.strokeStyle = "rgba(15, 16, 20, 0.3)"
    ctx.lineWidth = Math.max(0.5, cellSize * 0.012)
    for (var b = 1; b < bays; b++) {
      var bayX = bx + b * bayW
      ctx.beginPath(); ctx.moveTo(bayX, by + cellSize * 0.05); ctx.lineTo(bayX, by + bh); ctx.stroke()
    }
    var glassGrad = ctx.createLinearGradient(0, by + bh * 0.35, 0, by + bh * 0.85)
    glassGrad.addColorStop(0, "#dff0f7")
    glassGrad.addColorStop(1, "#86b8d2")
    for (var bi = 0; bi < bays; bi++) {
      var gxb = bx + bi * bayW + bayW * 0.12
      ctx.fillStyle = glassGrad
      ctx.fillRect(gxb, by + bh * 0.35, bayW * 0.76, bh * 0.5)
      ctx.strokeStyle = outline
      ctx.lineWidth = Math.max(0.5, cellSize * 0.012)
      ctx.strokeRect(gxb, by + bh * 0.35, bayW * 0.76, bh * 0.5)
    }

    var canW = bw * 0.26, canH = cellSize * 0.06
    var canX = bx + bw / 2 - canW / 2, canY = by + bh * 0.3
    ctx.fillStyle = root.accentColors.C
    ctx.fillRect(canX, canY, canW, canH)
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(0.5, cellSize * 0.012)
    ctx.strokeRect(canX, canY, canW, canH)
    ctx.beginPath()
    ctx.moveTo(canX + canW * 0.15, canY + canH); ctx.lineTo(canX + canW * 0.15, by + bh)
    ctx.moveTo(canX + canW * 0.85, canY + canH); ctx.lineTo(canX + canW * 0.85, by + bh)
    ctx.stroke()

    var dotColors = root.carColors
    var pRow = by + bh + cellSize * 0.08
    for (var pd = 0; pd < 4; pd++) {
      ctx.fillStyle = dotColors[pd % dotColors.length]
      ctx.beginPath()
      ctx.arc(bx + bw * (0.15 + pd * 0.24), pRow, cellSize * 0.035, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  function drawIndustrial(ctx, gx, gy, cellSize, level) {
    ctx.fillStyle = "#3a382f"
    ctx.fillRect(gx, gy, cellSize + 1, cellSize + 1)
    if (level <= 1) root.drawIndustrialWorkshop(ctx, gx, gy, cellSize)
    else if (level === 2) root.drawIndustrialFactory(ctx, gx, gy, cellSize)
    else root.drawIndustrialComplex(ctx, gx, gy, cellSize)
  }

  // Level 1 — a small workshop. A garage with a ridged roll-up door, a
  // roof vent, and a small gear emblem over the entrance — the "somebody's
  // running a business out of a shed" silhouette, not a full factory yet.
  function drawIndustrialWorkshop(ctx, gx, gy, cellSize) {
    var bx = gx + cellSize * 0.2, by = gy + cellSize * 0.44
    var bw = cellSize * 0.6, bh = cellSize * 0.42
    var outline = "rgba(12, 12, 10, 0.6)"
    root.drawFootprintShadow(ctx, bx, by, bw, bh, cellSize)

    var wallGrad = ctx.createLinearGradient(0, by, 0, by + bh)
    wallGrad.addColorStop(0, "#8a8378")
    wallGrad.addColorStop(1, "#5c574c")
    ctx.fillStyle = wallGrad
    ctx.fillRect(bx, by, bw, bh)
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(1, cellSize * 0.03)
    ctx.strokeRect(bx, by, bw, bh)

    ctx.fillStyle = root.accentColors.I
    ctx.fillRect(bx - cellSize * 0.02, by - cellSize * 0.05, bw + cellSize * 0.04, cellSize * 0.06)
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(0.6, cellSize * 0.02)
    ctx.strokeRect(bx - cellSize * 0.02, by - cellSize * 0.05, bw + cellSize * 0.04, cellSize * 0.06)

    var doorW = bw * 0.62, doorH = bh * 0.72
    var doorX = bx + bw * 0.08, doorY = by + bh - doorH
    ctx.fillStyle = "#3a3a3a"
    ctx.fillRect(doorX, doorY, doorW, doorH)
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(0.5, cellSize * 0.014)
    ctx.strokeRect(doorX, doorY, doorW, doorH)
    ctx.strokeStyle = "rgba(0, 0, 0, 0.4)"
    ctx.lineWidth = Math.max(0.5, cellSize * 0.01)
    for (var rdg = 1; rdg < 4; rdg++) {
      var ry = doorY + doorH * (rdg / 4)
      ctx.beginPath(); ctx.moveTo(doorX, ry); ctx.lineTo(doorX + doorW, ry); ctx.stroke()
    }

    var winW = bw * 0.2, winH = bh * 0.28
    var winX = bx + bw * 0.76, winY = by + bh * 0.2
    ctx.fillStyle = "#7fa9c4"
    ctx.fillRect(winX, winY, winW, winH)
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(0.5, cellSize * 0.014)
    ctx.strokeRect(winX, winY, winW, winH)

    var ventX = bx + bw * 0.82
    ctx.fillStyle = "#4c4c4c"
    ctx.fillRect(ventX, by - cellSize * 0.16, cellSize * 0.05, cellSize * 0.12)
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(0.5, cellSize * 0.012)
    ctx.strokeRect(ventX, by - cellSize * 0.16, cellSize * 0.05, cellSize * 0.12)

    root.drawGear(ctx, bx + bw * 0.5, by - cellSize * 0.02, cellSize * 0.05, 6, "#c9a53f", outline, cellSize)
  }

  // Level 2 — a small factory. Corrugated panels, one smokestack, a
  // corner hazard tag, and a pair of meshed gears on the wall — visible
  // machinery instead of a blank metal box.
  function drawIndustrialFactory(ctx, gx, gy, cellSize) {
    var bx = gx + cellSize * 0.1, by = gy + cellSize * 0.3
    var bw = cellSize * 0.68, bh = cellSize * 0.5
    var outline = "rgba(12, 12, 10, 0.6)"
    root.drawFootprintShadow(ctx, bx, by, bw, bh, cellSize)

    var panelCount = 4
    var panelW = bw / panelCount
    var lightGrad = ctx.createLinearGradient(0, by, 0, by + bh)
    lightGrad.addColorStop(0, "#828e98")
    lightGrad.addColorStop(1, "#5c6870")
    var darkGrad = ctx.createLinearGradient(0, by, 0, by + bh)
    darkGrad.addColorStop(0, "#5c646c")
    darkGrad.addColorStop(1, "#3c4248")
    for (var p = 0; p < panelCount; p++) {
      ctx.fillStyle = p % 2 === 0 ? lightGrad : darkGrad
      ctx.fillRect(bx + p * panelW, by, panelW, bh)
    }
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(1, cellSize * 0.03)
    ctx.strokeRect(bx, by, bw, bh)
    ctx.strokeStyle = "rgba(220, 225, 230, 0.35)"
    ctx.lineWidth = Math.max(0.5, cellSize * 0.012)
    ctx.beginPath(); ctx.moveTo(bx, by + 0.5); ctx.lineTo(bx + bw, by + 0.5); ctx.stroke()

    var gearR = cellSize * 0.09
    root.drawGear(ctx, bx + bw * 0.82, by + bh * 0.72, gearR, 6, "#c9a53f", outline, cellSize)
    root.drawGear(ctx, bx + bw * 0.82 + gearR * 1.5, by + bh * 0.72 + gearR * 0.2, gearR * 0.6, 6, "#e0b85a", outline, cellSize)

    var sx = bx + bw * 0.28
    var stackW = cellSize * 0.09, stackH = cellSize * 0.3
    var stackY = by - stackH * 0.7
    var stackGrad = ctx.createLinearGradient(sx - stackW / 2, 0, sx + stackW / 2, 0)
    stackGrad.addColorStop(0, "#26241f")
    stackGrad.addColorStop(0.5, "#4a4640")
    stackGrad.addColorStop(1, "#26241f")
    ctx.fillStyle = stackGrad
    ctx.fillRect(sx - stackW / 2, stackY, stackW, stackH)
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(0.5, cellSize * 0.012)
    ctx.strokeRect(sx - stackW / 2, stackY, stackW, stackH)
    ctx.fillStyle = "#c94f3f"
    ctx.beginPath(); ctx.arc(sx, stackY, stackW * 0.4, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = "rgba(210, 210, 210, 0.5)"
    ctx.beginPath(); ctx.arc(sx, stackY - cellSize * 0.08, cellSize * 0.07, 0, Math.PI * 2); ctx.fill()

    var hazW = bw * 0.22, hazH = cellSize * 0.06
    var hazX = bx + bw - hazW, hazY = by + bh - hazH
    ctx.save()
    ctx.beginPath(); ctx.rect(hazX, hazY, hazW, hazH); ctx.clip()
    var hazSeg = cellSize * 0.045
    var si = 0
    for (var hx = hazX - hazH; hx < hazX + hazW + hazH; hx += hazSeg) {
      ctx.fillStyle = si % 2 === 0 ? "#e0b02a" : "#232320"
      ctx.beginPath()
      ctx.moveTo(hx, hazY + hazH)
      ctx.lineTo(hx + hazH, hazY)
      ctx.lineTo(hx + hazH + hazSeg, hazY)
      ctx.lineTo(hx + hazSeg, hazY + hazH)
      ctx.closePath()
      ctx.fill()
      si++
    }
    ctx.restore()
  }

  // Level 3 — a full industrial complex. The corrugated-panel warehouse
  // from before, banded smokestacks trailing rising smoke, and a gear
  // cluster peeking out beside the hazard band.
  function drawIndustrialComplex(ctx, gx, gy, cellSize) {
    var bx = gx + cellSize * 0.08
    var by = gy + cellSize * 0.16
    var bw = cellSize * 0.84
    var bh = cellSize * 0.64
    var outline = "rgba(12, 12, 10, 0.6)"
    root.drawFootprintShadow(ctx, bx, by, bw, bh, cellSize)

    var panelCount = 6
    var panelW = bw / panelCount
    var lightGrad = ctx.createLinearGradient(0, by, 0, by + bh)
    lightGrad.addColorStop(0, "#828e98")
    lightGrad.addColorStop(1, "#5c6870")
    var darkGrad = ctx.createLinearGradient(0, by, 0, by + bh)
    darkGrad.addColorStop(0, "#5c646c")
    darkGrad.addColorStop(1, "#3c4248")
    for (var p = 0; p < panelCount; p++) {
      ctx.fillStyle = p % 2 === 0 ? lightGrad : darkGrad
      ctx.fillRect(bx + p * panelW, by, panelW, bh)
      if (p > 0) {
        ctx.fillStyle = "rgba(20, 20, 18, 0.4)"
        ctx.fillRect(bx + p * panelW - Math.max(0.5, cellSize * 0.006), by, Math.max(1, cellSize * 0.012), bh)
      }
    }
    ctx.fillStyle = "rgba(20, 20, 18, 0.5)"
    var rivetR = Math.max(0.5, cellSize * 0.01)
    for (var rp = 0; rp < panelCount; rp++) {
      var rx = bx + rp * panelW + panelW * 0.5
      ctx.beginPath(); ctx.arc(rx, by + bh * 0.08, rivetR, 0, Math.PI * 2); ctx.fill()
    }
    ctx.strokeStyle = "rgba(220, 225, 230, 0.35)"
    ctx.lineWidth = Math.max(0.5, cellSize * 0.012)
    ctx.beginPath(); ctx.moveTo(bx, by + 0.5); ctx.lineTo(bx + bw, by + 0.5); ctx.stroke()
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(1, cellSize * 0.03)
    ctx.strokeRect(bx, by, bw, bh)

    var hazardH = cellSize * 0.13
    var hazardY = by + bh - hazardH
    var hazSeg = cellSize * 0.09
    ctx.save()
    ctx.beginPath()
    ctx.rect(bx, hazardY, bw, hazardH)
    ctx.clip()
    var stripeIndex = 0
    for (var hx = bx - hazardH; hx < bx + bw + hazardH; hx += hazSeg) {
      ctx.fillStyle = stripeIndex % 2 === 0 ? "#e0b02a" : "#232320"
      ctx.beginPath()
      ctx.moveTo(hx, hazardY + hazardH)
      ctx.lineTo(hx + hazardH, hazardY)
      ctx.lineTo(hx + hazardH + hazSeg, hazardY)
      ctx.lineTo(hx + hazSeg, hazardY + hazardH)
      ctx.closePath()
      ctx.fill()
      stripeIndex++
    }
    ctx.restore()

    var gearR = cellSize * 0.07
    root.drawGear(ctx, bx + bw * 0.14, by + bh + gearR * 0.3, gearR, 7, "#c9a53f", outline, cellSize)
    root.drawGear(ctx, bx + bw * 0.14 + gearR * 1.6, by + bh + gearR * 0.55, gearR * 0.62, 6, "#e0b85a", outline, cellSize)

    var stackCount = 3
    for (var i = 0; i < stackCount; i++) {
      var sx = bx + bw * (0.28 + i * 0.28)
      var stackW = cellSize * 0.09
      var stackH = cellSize * 0.32
      var stackY = by - stackH * 0.7
      var stackGrad = ctx.createLinearGradient(sx - stackW / 2, 0, sx + stackW / 2, 0)
      stackGrad.addColorStop(0, "#26241f")
      stackGrad.addColorStop(0.5, "#4a4640")
      stackGrad.addColorStop(1, "#26241f")
      ctx.fillStyle = stackGrad
      ctx.fillRect(sx - stackW / 2, stackY, stackW, stackH)
      ctx.strokeStyle = "rgba(15, 14, 12, 0.5)"
      ctx.lineWidth = Math.max(0.5, cellSize * 0.01)
      for (var band = 1; band < 3; band++) {
        var byy = stackY + stackH * (band / 3)
        ctx.beginPath(); ctx.moveTo(sx - stackW / 2, byy); ctx.lineTo(sx + stackW / 2, byy); ctx.stroke()
      }
      ctx.strokeStyle = outline
      ctx.lineWidth = Math.max(0.5, cellSize * 0.012)
      ctx.strokeRect(sx - stackW / 2, stackY, stackW, stackH)
      ctx.fillStyle = "#c94f3f"
      ctx.beginPath()
      ctx.arc(sx, stackY, stackW * 0.4, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = "rgba(210, 210, 210, 0.5)"
      ctx.beginPath()
      ctx.arc(sx, stackY - cellSize * 0.08, cellSize * 0.07, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = "rgba(200, 200, 200, 0.3)"
      ctx.beginPath()
      ctx.arc(sx + stackW * 0.3, stackY - cellSize * 0.16, cellSize * 0.05, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = "rgba(200, 200, 200, 0.2)"
      ctx.beginPath()
      ctx.arc(sx + stackW * 0.6, stackY - cellSize * 0.24, cellSize * 0.06, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // Fixed single-tile buildings — no growth levels, just built or not.
  // Same treatment the zones got: outline + gradient instead of flat
  // fills, plus a hazard stripe (power) and support legs/ripple (water)
  // so each reads as real infrastructure, not a colored icon on a square.
  function drawPower(ctx, gx, gy, cellSize, level) {
    if (level === undefined) level = 1
    if (level <= 0) root.drawPowerGenerator(ctx, gx, gy, cellSize)
    else if (level === 1) root.drawPowerPlant(ctx, gx, gy, cellSize)
    else root.drawPowerStation(ctx, gx, gy, cellSize)
  }

  // Tier 1 — a generator: a small dark housing with a vent grille and one
  // warning bolt, well short of the full pad the plant gets.
  function drawPowerGenerator(ctx, gx, gy, cellSize) {
    ctx.fillStyle = "#2e2b1c"
    ctx.fillRect(gx, gy, cellSize + 1, cellSize + 1)
    var x = gx + cellSize * 0.28, y = gy + cellSize * 0.3
    var s = cellSize * 0.44
    var outline = "rgba(35, 25, 5, 0.65)"

    var bodyGrad = ctx.createLinearGradient(x, y, x + s, y + s)
    bodyGrad.addColorStop(0, "#8a8378")
    bodyGrad.addColorStop(1, "#5c574c")
    ctx.fillStyle = bodyGrad
    ctx.fillRect(x, y, s, s)
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(1, cellSize * 0.03)
    ctx.strokeRect(x, y, s, s)

    ctx.strokeStyle = "rgba(20, 20, 15, 0.5)"
    ctx.lineWidth = Math.max(0.5, cellSize * 0.014)
    for (var g = 1; g < 4; g++) {
      var gy2 = y + s * (g / 4)
      ctx.beginPath(); ctx.moveTo(x + s * 0.12, gy2); ctx.lineTo(x + s * 0.88, gy2); ctx.stroke()
    }

    var cx = x + s * 0.5, cy = y - cellSize * 0.06
    ctx.fillStyle = "#e0bb3f"
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(0.6, cellSize * 0.02)
    ctx.beginPath()
    ctx.moveTo(cx - cellSize * 0.06, cy - cellSize * 0.16)
    ctx.lineTo(cx + cellSize * 0.09, cy - cellSize * 0.02)
    ctx.lineTo(cx + cellSize * 0.01, cy - cellSize * 0.02)
    ctx.lineTo(cx + cellSize * 0.06, cy + cellSize * 0.16)
    ctx.lineTo(cx - cellSize * 0.09, cy + cellSize * 0.02)
    ctx.lineTo(cx - cellSize * 0.01, cy + cellSize * 0.02)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }

  // Tier 2 — the original hazard-striped plant, unchanged.
  function drawPowerPlant(ctx, gx, gy, cellSize) {
    ctx.fillStyle = "#2e2b1c"
    ctx.fillRect(gx, gy, cellSize + 1, cellSize + 1)

    var pad = cellSize * 0.08
    var x = gx + pad, y = gy + pad, s = cellSize - pad * 2
    var outline = "rgba(35, 25, 5, 0.65)"

    var padGrad = ctx.createLinearGradient(x, y, x + s, y + s)
    padGrad.addColorStop(0, "#e0bb3f")
    padGrad.addColorStop(1, "#b8901f")
    ctx.fillStyle = padGrad
    ctx.fillRect(x, y, s, s)
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(1, cellSize * 0.035)
    ctx.strokeRect(x, y, s, s)

    // hazard stripe along the bottom edge, same chevron trick as the
    // industrial dock — a strong, unambiguous "electrical" cue
    var hazardH = s * 0.16
    var hazardY = y + s - hazardH
    var hazSeg = cellSize * 0.09
    ctx.save()
    ctx.beginPath()
    ctx.rect(x, hazardY, s, hazardH)
    ctx.clip()
    var stripeIndex = 0
    for (var hx = x - hazardH; hx < x + s + hazardH; hx += hazSeg) {
      ctx.fillStyle = stripeIndex % 2 === 0 ? "#3a3020" : "#e0bb3f"
      ctx.beginPath()
      ctx.moveTo(hx, hazardY + hazardH)
      ctx.lineTo(hx + hazardH, hazardY)
      ctx.lineTo(hx + hazardH + hazSeg, hazardY)
      ctx.lineTo(hx + hazSeg, hazardY + hazardH)
      ctx.closePath()
      ctx.fill()
      stripeIndex++
    }
    ctx.restore()

    // corner pylon marks
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(1, cellSize * 0.03)
    var corners = [[x + s * 0.1, y + s * 0.1], [x + s * 0.9, y + s * 0.1]]
    for (var c = 0; c < corners.length; c++) {
      var pcx = corners[c][0], pcy = corners[c][1]
      ctx.beginPath()
      ctx.moveTo(pcx - s * 0.05, pcy); ctx.lineTo(pcx + s * 0.05, pcy)
      ctx.moveTo(pcx, pcy - s * 0.05); ctx.lineTo(pcx, pcy + s * 0.05)
      ctx.stroke()
    }

    // bolt, bigger and outlined
    var cx = gx + cellSize * 0.5, cy = gy + cellSize * 0.42
    ctx.fillStyle = "#fff3c2"
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(1, cellSize * 0.03)
    ctx.beginPath()
    ctx.moveTo(cx - cellSize * 0.1, cy - cellSize * 0.26)
    ctx.lineTo(cx + cellSize * 0.15, cy - cellSize * 0.03)
    ctx.lineTo(cx + cellSize * 0.02, cy - cellSize * 0.03)
    ctx.lineTo(cx + cellSize * 0.1, cy + cellSize * 0.26)
    ctx.lineTo(cx - cellSize * 0.15, cy + cellSize * 0.02)
    ctx.lineTo(cx - cellSize * 0.02, cy + cellSize * 0.02)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }

  // Tier 3 — a power station: a bigger hazard pad flanked by two
  // transformer coils, with a bolt at each end instead of just one.
  function drawPowerStation(ctx, gx, gy, cellSize) {
    ctx.fillStyle = "#2e2b1c"
    ctx.fillRect(gx, gy, cellSize + 1, cellSize + 1)

    var pad = cellSize * 0.04
    var x = gx + pad, y = gy + pad, s = cellSize - pad * 2
    var outline = "rgba(35, 25, 5, 0.65)"

    var padGrad = ctx.createLinearGradient(x, y, x + s, y + s)
    padGrad.addColorStop(0, "#e0bb3f")
    padGrad.addColorStop(1, "#b8901f")
    ctx.fillStyle = padGrad
    ctx.fillRect(x, y, s, s)
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(1, cellSize * 0.035)
    ctx.strokeRect(x, y, s, s)

    var hazardH = s * 0.13
    var hazardY = y + s - hazardH
    var hazSeg = cellSize * 0.08
    ctx.save()
    ctx.beginPath()
    ctx.rect(x, hazardY, s, hazardH)
    ctx.clip()
    var stripeIndex = 0
    for (var hx = x - hazardH; hx < x + s + hazardH; hx += hazSeg) {
      ctx.fillStyle = stripeIndex % 2 === 0 ? "#3a3020" : "#e0bb3f"
      ctx.beginPath()
      ctx.moveTo(hx, hazardY + hazardH)
      ctx.lineTo(hx + hazardH, hazardY)
      ctx.lineTo(hx + hazardH + hazSeg, hazardY)
      ctx.lineTo(hx + hazSeg, hazardY + hazardH)
      ctx.closePath()
      ctx.fill()
      stripeIndex++
    }
    ctx.restore()

    // transformer coils at each end
    var coilY = y + s * 0.28
    var coilXs = [x + s * 0.18, x + s * 0.82]
    for (var ci = 0; ci < coilXs.length; ci++) {
      ctx.strokeStyle = "rgba(60, 45, 15, 0.7)"
      ctx.lineWidth = Math.max(1, cellSize * 0.02)
      for (var loop = 0; loop < 3; loop++) {
        ctx.beginPath()
        ctx.arc(coilXs[ci], coilY - s * 0.06 + loop * s * 0.05, s * 0.07, 0, Math.PI * 2)
        ctx.stroke()
      }
    }

    var boltPositions = [gx + cellSize * 0.32, gx + cellSize * 0.68]
    for (var bi = 0; bi < boltPositions.length; bi++) {
      var cx = boltPositions[bi], cy = gy + cellSize * 0.42
      ctx.fillStyle = "#fff3c2"
      ctx.strokeStyle = outline
      ctx.lineWidth = Math.max(1, cellSize * 0.025)
      ctx.beginPath()
      ctx.moveTo(cx - cellSize * 0.07, cy - cellSize * 0.18)
      ctx.lineTo(cx + cellSize * 0.1, cy - cellSize * 0.02)
      ctx.lineTo(cx + cellSize * 0.01, cy - cellSize * 0.02)
      ctx.lineTo(cx + cellSize * 0.07, cy + cellSize * 0.18)
      ctx.lineTo(cx - cellSize * 0.1, cy + cellSize * 0.02)
      ctx.lineTo(cx - cellSize * 0.01, cy + cellSize * 0.02)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }
  }

  function drawWater(ctx, gx, gy, cellSize, level) {
    if (level === undefined) level = 1
    if (level <= 0) root.drawWaterWell(ctx, gx, gy, cellSize)
    else if (level === 1) root.drawWaterTower(ctx, gx, gy, cellSize)
    else root.drawWaterTreatmentPlant(ctx, gx, gy, cellSize)
  }

  // Tier 1 — a well: a small stone ring, a peaked roof, and a crank —
  // hand-drawn water, not piped.
  function drawWaterWell(ctx, gx, gy, cellSize) {
    ctx.fillStyle = "#1e2c33"
    ctx.fillRect(gx, gy, cellSize + 1, cellSize + 1)
    var cx = gx + cellSize * 0.5, cy = gy + cellSize * 0.58
    var r = cellSize * 0.2
    var outline = "rgba(10, 30, 45, 0.7)"

    ctx.strokeStyle = "#6b4a2a"
    ctx.lineWidth = Math.max(1, cellSize * 0.03)
    ctx.beginPath()
    ctx.moveTo(cx - r * 1.1, cy - r * 0.6); ctx.lineTo(cx - r * 1.3, cy - r * 1.9)
    ctx.moveTo(cx + r * 1.1, cy - r * 0.6); ctx.lineTo(cx + r * 1.3, cy - r * 1.9)
    ctx.stroke()
    ctx.fillStyle = "#8a5a32"
    ctx.beginPath()
    ctx.moveTo(cx - r * 1.6, cy - r * 1.7)
    ctx.lineTo(cx, cy - r * 2.6)
    ctx.lineTo(cx + r * 1.6, cy - r * 1.7)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(0.6, cellSize * 0.016)
    ctx.stroke()

    var wellGrad = ctx.createLinearGradient(cx, cy - r, cx, cy + r)
    wellGrad.addColorStop(0, "#9a9488")
    wellGrad.addColorStop(1, "#6c665c")
    ctx.fillStyle = wellGrad
    ctx.fillRect(cx - r, cy - r * 0.4, r * 2, r * 1.2)
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(1, cellSize * 0.025)
    ctx.strokeRect(cx - r, cy - r * 0.4, r * 2, r * 1.2)
    ctx.fillStyle = "#3f84ab"
    ctx.beginPath()
    ctx.arc(cx, cy - r * 0.4, r * 0.6, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = outline
    ctx.beginPath()
    ctx.arc(cx, cy - r * 0.4, r * 0.6, 0, Math.PI * 2)
    ctx.stroke()
  }

  // Tier 2 — the original tower on legs, unchanged.
  function drawWaterTower(ctx, gx, gy, cellSize) {
    ctx.fillStyle = "#1e2c33"
    ctx.fillRect(gx, gy, cellSize + 1, cellSize + 1)
    var cx = gx + cellSize * 0.5, cy = gy + cellSize * 0.5
    var r = cellSize * 0.33
    var outline = "rgba(10, 30, 45, 0.7)"

    // support legs poking out from under the tank, like a real water tower
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(1, cellSize * 0.035)
    var legs = 4
    for (var i = 0; i < legs; i++) {
      var a = (Math.PI / 4) + i * (Math.PI / 2)
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8)
      ctx.lineTo(cx + Math.cos(a) * r * 1.4, cy + Math.sin(a) * r * 1.4)
      ctx.stroke()
    }

    var tankGrad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r)
    tankGrad.addColorStop(0, "#a9d8f0")
    tankGrad.addColorStop(1, "#3f84ab")
    ctx.fillStyle = tankGrad
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(1, cellSize * 0.045)
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.stroke()

    // ripple ring for a bit of "water" detail
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)"
    ctx.lineWidth = Math.max(1, cellSize * 0.02)
    ctx.beginPath()
    ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2)
    ctx.stroke()
  }

  // Tier 3 — a treatment plant: two round settling tanks joined by a
  // pipe, bigger and more industrial than a single tower.
  function drawWaterTreatmentPlant(ctx, gx, gy, cellSize) {
    ctx.fillStyle = "#1e2c33"
    ctx.fillRect(gx, gy, cellSize + 1, cellSize + 1)
    var outline = "rgba(10, 30, 45, 0.7)"
    var r = cellSize * 0.22
    var tanks = [[gx + cellSize * 0.3, gy + cellSize * 0.42], [gx + cellSize * 0.68, gy + cellSize * 0.62]]

    ctx.strokeStyle = "#3f4a52"
    ctx.lineWidth = Math.max(1.5, cellSize * 0.045)
    ctx.beginPath()
    ctx.moveTo(tanks[0][0], tanks[0][1]); ctx.lineTo(tanks[1][0], tanks[1][1])
    ctx.stroke()

    for (var t = 0; t < tanks.length; t++) {
      var tx = tanks[t][0], ty = tanks[t][1]
      var tankGrad = ctx.createRadialGradient(tx - r * 0.3, ty - r * 0.3, r * 0.1, tx, ty, r)
      tankGrad.addColorStop(0, "#a9d8f0")
      tankGrad.addColorStop(1, "#3f84ab")
      ctx.fillStyle = tankGrad
      ctx.beginPath(); ctx.arc(tx, ty, r, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = outline
      ctx.lineWidth = Math.max(1, cellSize * 0.03)
      ctx.stroke()
      ctx.strokeStyle = "rgba(255, 255, 255, 0.4)"
      ctx.lineWidth = Math.max(0.6, cellSize * 0.014)
      ctx.beginPath(); ctx.arc(tx, ty, r * 0.6, 0, Math.PI * 2); ctx.stroke()
    }
  }

  function drawFire(ctx, gx, gy, cellSize, level) {
    if (level === undefined) level = 1
    if (level <= 0) root.drawFirehouse(ctx, gx, gy, cellSize)
    else if (level === 1) root.drawFireStation(ctx, gx, gy, cellSize)
    else root.drawFireBattalion(ctx, gx, gy, cellSize)
  }

  // Tier 1 — a firehouse: small, one narrow bay, a modest flame badge, no
  // roof beacon yet.
  function drawFirehouse(ctx, gx, gy, cellSize) {
    ctx.fillStyle = "#2a1614"
    ctx.fillRect(gx, gy, cellSize + 1, cellSize + 1)

    var x = gx + cellSize * 0.24, y = gy + cellSize * 0.28
    var s = cellSize * 0.5
    var outline = "rgba(30, 10, 8, 0.7)"

    var wallGrad = ctx.createLinearGradient(x, y, x + s, y + s)
    wallGrad.addColorStop(0, "#c14336")
    wallGrad.addColorStop(1, "#7f261c")
    ctx.fillStyle = wallGrad
    ctx.fillRect(x, y, s, s)
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(1, cellSize * 0.03)
    ctx.strokeRect(x, y, s, s)
    ctx.fillStyle = "#4a1a14"
    ctx.fillRect(x, y, s, s * 0.14)

    var bayW = s * 0.5, bayH = s * 0.4
    var bayX = x + (s - bayW) / 2, bayY = y + s - bayH - s * 0.08
    ctx.fillStyle = "#241210"
    ctx.fillRect(bayX, bayY, bayW, bayH)
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(1, cellSize * 0.02)
    ctx.strokeRect(bayX, bayY, bayW, bayH)

    var fcx = x + s * 0.5, fcy = y + s * 0.32, fr = s * 0.14
    ctx.fillStyle = "#f2a53a"
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(0.8, cellSize * 0.02)
    ctx.beginPath()
    ctx.moveTo(fcx, fcy - fr)
    ctx.quadraticCurveTo(fcx + fr * 0.9, fcy - fr * 0.2, fcx + fr * 0.35, fcy + fr * 0.5)
    ctx.quadraticCurveTo(fcx + fr * 0.55, fcy + fr * 0.1, fcx, fcy + fr)
    ctx.quadraticCurveTo(fcx - fr * 0.55, fcy + fr * 0.1, fcx - fr * 0.35, fcy + fr * 0.5)
    ctx.quadraticCurveTo(fcx - fr * 0.9, fcy - fr * 0.2, fcx, fcy - fr)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }

  // Tier 2 — the original single-bay station with a roof beacon, unchanged.
  function drawFireStation(ctx, gx, gy, cellSize) {
    ctx.fillStyle = "#2a1614"
    ctx.fillRect(gx, gy, cellSize + 1, cellSize + 1)

    var pad = cellSize * 0.1
    var x = gx + pad, y = gy + pad, s = cellSize - pad * 2
    var outline = "rgba(30, 10, 8, 0.7)"

    var wallGrad = ctx.createLinearGradient(x, y, x + s, y + s)
    wallGrad.addColorStop(0, "#c14336")
    wallGrad.addColorStop(1, "#7f261c")
    ctx.fillStyle = wallGrad
    ctx.fillRect(x, y, s, s)
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(1, cellSize * 0.035)
    ctx.strokeRect(x, y, s, s)

    // roof cap strip along the top — a station, not a house
    ctx.fillStyle = "#4a1a14"
    ctx.fillRect(x, y, s, s * 0.12)

    // the bay door: wide, dark, with a couple of light-stripe accents
    var bayW = s * 0.62, bayH = s * 0.42
    var bayX = x + (s - bayW) / 2, bayY = y + s - bayH - s * 0.06
    ctx.fillStyle = "#241210"
    ctx.fillRect(bayX, bayY, bayW, bayH)
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(1, cellSize * 0.025)
    ctx.strokeRect(bayX, bayY, bayW, bayH)
    ctx.strokeStyle = "rgba(255, 230, 200, 0.55)"
    ctx.lineWidth = Math.max(1, cellSize * 0.018)
    ctx.beginPath()
    ctx.moveTo(bayX + bayW * 0.33, bayY); ctx.lineTo(bayX + bayW * 0.33, bayY + bayH)
    ctx.moveTo(bayX + bayW * 0.67, bayY); ctx.lineTo(bayX + bayW * 0.67, bayY + bayH)
    ctx.stroke()

    // flame emblem above the door
    var fcx = x + s * 0.5, fcy = y + s * 0.36
    var fr = s * 0.16
    ctx.fillStyle = "#f2a53a"
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(1, cellSize * 0.025)
    ctx.beginPath()
    ctx.moveTo(fcx, fcy - fr)
    ctx.quadraticCurveTo(fcx + fr * 0.9, fcy - fr * 0.2, fcx + fr * 0.35, fcy + fr * 0.5)
    ctx.quadraticCurveTo(fcx + fr * 0.55, fcy + fr * 0.1, fcx, fcy + fr)
    ctx.quadraticCurveTo(fcx - fr * 0.55, fcy + fr * 0.1, fcx - fr * 0.35, fcy + fr * 0.5)
    ctx.quadraticCurveTo(fcx - fr * 0.9, fcy - fr * 0.2, fcx, fcy - fr)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = "#fde08a"
    ctx.beginPath()
    ctx.moveTo(fcx, fcy - fr * 0.35)
    ctx.quadraticCurveTo(fcx + fr * 0.35, fcy + fr * 0.15, fcx, fcy + fr * 0.6)
    ctx.quadraticCurveTo(fcx - fr * 0.35, fcy + fr * 0.15, fcx, fcy - fr * 0.35)
    ctx.fill()

    // a single roof beacon
    ctx.fillStyle = "#ff5540"
    ctx.beginPath()
    ctx.arc(x + s * 0.5, y + s * 0.06, s * 0.045, 0, Math.PI * 2)
    ctx.fill()
  }

  // Tier 3 — a battalion HQ: two bay doors, a watch tower with an antenna,
  // and a pair of roof beacons instead of just one.
  function drawFireBattalion(ctx, gx, gy, cellSize) {
    ctx.fillStyle = "#2a1614"
    ctx.fillRect(gx, gy, cellSize + 1, cellSize + 1)

    var pad = cellSize * 0.04
    var x = gx + pad, y = gy + pad, s = cellSize - pad * 2
    var outline = "rgba(30, 10, 8, 0.7)"

    var wallGrad = ctx.createLinearGradient(x, y, x + s, y + s)
    wallGrad.addColorStop(0, "#c14336")
    wallGrad.addColorStop(1, "#7f261c")
    ctx.fillStyle = wallGrad
    ctx.fillRect(x, y, s, s)
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(1, cellSize * 0.035)
    ctx.strokeRect(x, y, s, s)
    ctx.fillStyle = "#4a1a14"
    ctx.fillRect(x, y, s, s * 0.1)

    var bayW = s * 0.28, bayH = s * 0.4
    var bayY = y + s - bayH - s * 0.05
    var bayXs = [x + s * 0.14, x + s * 0.58]
    for (var bi = 0; bi < bayXs.length; bi++) {
      ctx.fillStyle = "#241210"
      ctx.fillRect(bayXs[bi], bayY, bayW, bayH)
      ctx.strokeStyle = outline
      ctx.lineWidth = Math.max(1, cellSize * 0.02)
      ctx.strokeRect(bayXs[bi], bayY, bayW, bayH)
      ctx.strokeStyle = "rgba(255, 230, 200, 0.55)"
      ctx.lineWidth = Math.max(0.6, cellSize * 0.014)
      ctx.beginPath()
      ctx.moveTo(bayXs[bi] + bayW * 0.5, bayY); ctx.lineTo(bayXs[bi] + bayW * 0.5, bayY + bayH)
      ctx.stroke()
    }

    // watch tower with antenna
    var towerX = x + s * 0.5, towerW = s * 0.14
    ctx.fillStyle = "#7f261c"
    ctx.fillRect(towerX - towerW / 2, y - s * 0.16, towerW, s * 0.2)
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(0.8, cellSize * 0.018)
    ctx.strokeRect(towerX - towerW / 2, y - s * 0.16, towerW, s * 0.2)
    ctx.beginPath()
    ctx.moveTo(towerX, y - s * 0.16); ctx.lineTo(towerX, y - s * 0.32)
    ctx.stroke()

    var fcx = x + s * 0.5, fcy = y + s * 0.42, fr = s * 0.12
    ctx.fillStyle = "#f2a53a"
    ctx.beginPath()
    ctx.moveTo(fcx, fcy - fr)
    ctx.quadraticCurveTo(fcx + fr * 0.9, fcy - fr * 0.2, fcx + fr * 0.35, fcy + fr * 0.5)
    ctx.quadraticCurveTo(fcx + fr * 0.55, fcy + fr * 0.1, fcx, fcy + fr)
    ctx.quadraticCurveTo(fcx - fr * 0.55, fcy + fr * 0.1, fcx - fr * 0.35, fcy + fr * 0.5)
    ctx.quadraticCurveTo(fcx - fr * 0.9, fcy - fr * 0.2, fcx, fcy - fr)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(0.8, cellSize * 0.02)
    ctx.stroke()

    ctx.fillStyle = "#ff5540"
    ctx.beginPath(); ctx.arc(x + s * 0.18, y + s * 0.06, s * 0.04, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(x + s * 0.82, y + s * 0.06, s * 0.04, 0, Math.PI * 2); ctx.fill()
  }

  function drawPolice(ctx, gx, gy, cellSize, level) {
    if (level === undefined) level = 1
    if (level <= 0) root.drawPoliceSubstation(ctx, gx, gy, cellSize)
    else if (level === 1) root.drawPoliceStation(ctx, gx, gy, cellSize)
    else root.drawPoliceSwat(ctx, gx, gy, cellSize)
  }

  // Tier 1 — a substation: a small booth with a plain badge, no light bar.
  function drawPoliceSubstation(ctx, gx, gy, cellSize) {
    ctx.fillStyle = "#141c2a"
    ctx.fillRect(gx, gy, cellSize + 1, cellSize + 1)

    var x = gx + cellSize * 0.28, y = gy + cellSize * 0.32
    var s = cellSize * 0.44
    var outline = "rgba(10, 16, 28, 0.7)"

    var wallGrad = ctx.createLinearGradient(x, y, x + s, y + s)
    wallGrad.addColorStop(0, "#5c7c9c")
    wallGrad.addColorStop(1, "#31465c")
    ctx.fillStyle = wallGrad
    ctx.fillRect(x, y, s, s)
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(1, cellSize * 0.03)
    ctx.strokeRect(x, y, s, s)

    var doorW = s * 0.3, doorH = s * 0.4
    ctx.fillStyle = "#161e2a"
    ctx.fillRect(x + (s - doorW) / 2, y + s - doorH, doorW, doorH)
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(0.6, cellSize * 0.018)
    ctx.strokeRect(x + (s - doorW) / 2, y + s - doorH, doorW, doorH)

    var bcx = x + s * 0.5, bcy = y - cellSize * 0.03, br = s * 0.14
    ctx.fillStyle = "#e8c93a"
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(0.6, cellSize * 0.02)
    ctx.beginPath()
    ctx.moveTo(bcx, bcy - br)
    ctx.lineTo(bcx + br * 0.85, bcy - br * 0.35)
    ctx.lineTo(bcx + br * 0.6, bcy + br * 0.75)
    ctx.lineTo(bcx, bcy + br)
    ctx.lineTo(bcx - br * 0.6, bcy + br * 0.75)
    ctx.lineTo(bcx - br * 0.85, bcy - br * 0.35)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }

  // Tier 2 — the original station with badge and light bar, unchanged.
  function drawPoliceStation(ctx, gx, gy, cellSize) {
    ctx.fillStyle = "#141c2a"
    ctx.fillRect(gx, gy, cellSize + 1, cellSize + 1)

    var pad = cellSize * 0.1
    var x = gx + pad, y = gy + pad, s = cellSize - pad * 2
    var outline = "rgba(10, 16, 28, 0.7)"

    var wallGrad = ctx.createLinearGradient(x, y, x + s, y + s)
    wallGrad.addColorStop(0, "#5c7c9c")
    wallGrad.addColorStop(1, "#31465c")
    ctx.fillStyle = wallGrad
    ctx.fillRect(x, y, s, s)
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(1, cellSize * 0.035)
    ctx.strokeRect(x, y, s, s)

    // entrance
    var doorW = s * 0.26, doorH = s * 0.4
    var doorX = x + (s - doorW) / 2, doorY = y + s - doorH - s * 0.06
    ctx.fillStyle = "#161e2a"
    ctx.fillRect(doorX, doorY, doorW, doorH)
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(1, cellSize * 0.02)
    ctx.strokeRect(doorX, doorY, doorW, doorH)

    // badge emblem above the door: a simple five-point shield
    var bcx = x + s * 0.5, bcy = y + s * 0.36, br = s * 0.15
    ctx.fillStyle = "#e8c93a"
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(1, cellSize * 0.022)
    ctx.beginPath()
    ctx.moveTo(bcx, bcy - br)
    ctx.lineTo(bcx + br * 0.85, bcy - br * 0.35)
    ctx.lineTo(bcx + br * 0.6, bcy + br * 0.75)
    ctx.lineTo(bcx, bcy + br)
    ctx.lineTo(bcx - br * 0.6, bcy + br * 0.75)
    ctx.lineTo(bcx - br * 0.85, bcy - br * 0.35)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    // roof light bar: red/blue pair, the unmistakable cue
    var barW = s * 0.34, barH = s * 0.09
    var barY = y + s * 0.02
    ctx.fillStyle = "#e0433a"
    ctx.fillRect(x + s * 0.5 - barW / 2, barY, barW / 2, barH)
    ctx.fillStyle = "#3a6fe0"
    ctx.fillRect(x + s * 0.5, barY, barW / 2, barH)
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(1, cellSize * 0.018)
    ctx.strokeRect(x + s * 0.5 - barW / 2, barY, barW, barH)
  }

  // Tier 3 — a SWAT HQ: darker tactical walls, a wider light bar with
  // three lamps, and an armored vehicle parked out front.
  function drawPoliceSwat(ctx, gx, gy, cellSize) {
    ctx.fillStyle = "#141c2a"
    ctx.fillRect(gx, gy, cellSize + 1, cellSize + 1)

    var pad = cellSize * 0.05
    var x = gx + pad, y = gy + pad * 1.5, s = cellSize * 0.6
    var outline = "rgba(8, 12, 20, 0.75)"

    var wallGrad = ctx.createLinearGradient(x, y, x + s, y + s)
    wallGrad.addColorStop(0, "#3a4a58")
    wallGrad.addColorStop(1, "#1e2830")
    ctx.fillStyle = wallGrad
    ctx.fillRect(x, y, s, s)
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(1, cellSize * 0.035)
    ctx.strokeRect(x, y, s, s)

    var doorW = s * 0.3, doorH = s * 0.42
    var doorX = x + (s - doorW) / 2, doorY = y + s - doorH - s * 0.05
    ctx.fillStyle = "#0e141c"
    ctx.fillRect(doorX, doorY, doorW, doorH)
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(0.8, cellSize * 0.02)
    ctx.strokeRect(doorX, doorY, doorW, doorH)

    var bcx = x + s * 0.5, bcy = y + s * 0.32, br = s * 0.13
    ctx.fillStyle = "#c9a53f"
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(0.8, cellSize * 0.02)
    ctx.beginPath()
    ctx.moveTo(bcx, bcy - br)
    ctx.lineTo(bcx + br * 0.85, bcy - br * 0.35)
    ctx.lineTo(bcx + br * 0.6, bcy + br * 0.75)
    ctx.lineTo(bcx, bcy + br)
    ctx.lineTo(bcx - br * 0.6, bcy + br * 0.75)
    ctx.lineTo(bcx - br * 0.85, bcy - br * 0.35)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    // wider light bar, three lamps
    var barW = s * 0.5, barH = s * 0.08, barY = y - s * 0.02
    var lampColors = ["#e0433a", "#3a6fe0", "#e0433a"]
    for (var l = 0; l < 3; l++) {
      ctx.fillStyle = lampColors[l]
      ctx.fillRect(x + s * 0.5 - barW / 2 + l * (barW / 3), barY, barW / 3, barH)
    }
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(0.8, cellSize * 0.018)
    ctx.strokeRect(x + s * 0.5 - barW / 2, barY, barW, barH)

    // armored vehicle parked at the bottom-left corner of the lot
    var vx = gx + cellSize * 0.12, vy = gy + cellSize * 0.78
    var vw = cellSize * 0.26, vh = cellSize * 0.14
    ctx.fillStyle = "#2c3438"
    ctx.fillRect(vx, vy, vw, vh)
    ctx.strokeStyle = outline
    ctx.lineWidth = Math.max(0.6, cellSize * 0.016)
    ctx.strokeRect(vx, vy, vw, vh)
    ctx.fillStyle = "#1a1a1a"
    ctx.beginPath(); ctx.arc(vx + vw * 0.22, vy + vh, vh * 0.28, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(vx + vw * 0.78, vy + vh, vh * 0.28, 0, Math.PI * 2); ctx.fill()
  }

  // A plain info badge for the palette icon only — "inspect" is a mode
  // like Bulldoze, never actually placed on the map, so this has no
  // corresponding case in drawTile.
  function drawInfoIcon(ctx, gx, gy, cellSize) {
    // A small brass-rimmed inspection glass, kept code-native for clarity.
    var cx = gx + cellSize * 0.4, cy = gy + cellSize * 0.38, r = cellSize * 0.25
    ctx.strokeStyle = "#263342"
    ctx.lineWidth = cellSize * 0.19
    ctx.beginPath()
    ctx.moveTo(cx + r * 0.6, cy + r * 0.6)
    ctx.lineTo(gx + cellSize * 0.83, gy + cellSize * 0.85)
    ctx.stroke()
    ctx.strokeStyle = "#bf8746"
    ctx.lineWidth = cellSize * 0.1
    ctx.stroke()
    ctx.fillStyle = "#5294a9"
    ctx.strokeStyle = "#dfba72"
    ctx.lineWidth = Math.max(1, cellSize * 0.07)
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.strokeStyle = "#d3eef0"
    ctx.lineWidth = Math.max(1, cellSize * 0.045)
    ctx.beginPath()
    ctx.arc(cx, cy, r * 0.65, Math.PI, Math.PI * 1.5)
    ctx.stroke()
  }

  function drawBulldozeIcon(ctx, gx, gy, cellSize) {
    // Readable amber tracked dozer; no generated bitmap needed for this tool.
    ctx.save()
    ctx.translate(gx, gy)
    ctx.scale(cellSize, cellSize)
    ctx.fillStyle = "#25313c"
    ctx.fillRect(0.1, 0.65, 0.64, 0.21)
    ctx.fillStyle = "#657581"
    for (var i = 0; i < 5; i++) ctx.fillRect(0.14 + i * 0.12, 0.69, 0.06, 0.1)
    ctx.fillStyle = "#c6892e"
    ctx.fillRect(0.14, 0.49, 0.62, 0.18)
    ctx.fillStyle = "#edbc55"
    ctx.fillRect(0.15, 0.47, 0.59, 0.08)
    ctx.fillRect(0.24, 0.2, 0.31, 0.31)
    ctx.fillStyle = "#77b3c2"
    ctx.fillRect(0.29, 0.26, 0.2, 0.19)
    ctx.fillStyle = "#344555"
    ctx.fillRect(0.2, 0.17, 0.39, 0.07)
    ctx.fillRect(0.65, 0.31, 0.055, 0.18)
    ctx.fillStyle = "#c1c9c9"
    ctx.beginPath()
    ctx.moveTo(0.79, 0.48); ctx.lineTo(0.92, 0.43)
    ctx.lineTo(0.92, 0.85); ctx.lineTo(0.76, 0.79)
    ctx.closePath(); ctx.fill()
    ctx.fillStyle = "#e8d8a9"
    ctx.fillRect(0.87, 0.46, 0.045, 0.34)
    ctx.restore()
  }

  function drawMedical(ctx, gx, gy, cellSize, level) {
    root.drawSpriteLot(ctx, gx, gy, cellSize, Model.TILE_MEDICAL)
    ctx.fillStyle = "#e3d7bd"
    ctx.fillRect(gx + cellSize * 0.12, gy + cellSize * 0.30, cellSize * 0.76, cellSize * 0.56)
    ctx.fillStyle = "#4d8779"
    ctx.fillRect(gx + cellSize * 0.08, gy + cellSize * 0.22, cellSize * 0.84, cellSize * 0.14)
    ctx.fillRect(gx + cellSize * 0.44, gy + cellSize * 0.42, cellSize * 0.12, cellSize * 0.34)
    ctx.fillRect(gx + cellSize * 0.33, gy + cellSize * 0.53, cellSize * 0.34, cellSize * 0.12)
  }

  function drawTransit(ctx, gx, gy, cellSize, level) {
    root.drawSpriteLot(ctx, gx, gy, cellSize, Model.TILE_TRANSIT)
    // A shelter canopy over a bus, gaining a second vehicle and a taller
    // canopy with each tier so the three read apart at a glance.
    ctx.fillStyle = "#4a5560"
    ctx.fillRect(gx + cellSize * 0.08, gy + cellSize * (0.30 - level * 0.04),
      cellSize * 0.84, cellSize * 0.10)
    ctx.fillStyle = "#6d7a86"
    ctx.fillRect(gx + cellSize * 0.10, gy + cellSize * 0.40, cellSize * 0.05, cellSize * 0.44)
    ctx.fillRect(gx + cellSize * 0.85, gy + cellSize * 0.40, cellSize * 0.05, cellSize * 0.44)
    var buses = 1 + Math.max(0, Math.min(2, level))
    for (var b = 0; b < buses; b++) {
      var by = gy + cellSize * (0.46 + b * 0.15)
      ctx.fillStyle = b % 2 === 0 ? "#d8a33f" : "#c8712f"
      ctx.fillRect(gx + cellSize * 0.18, by, cellSize * 0.58, cellSize * 0.12)
      ctx.fillStyle = "#2f3a44"
      ctx.fillRect(gx + cellSize * 0.22, by + cellSize * 0.02, cellSize * 0.34, cellSize * 0.05)
      ctx.fillRect(gx + cellSize * 0.24, by + cellSize * 0.11, cellSize * 0.07, cellSize * 0.03)
      ctx.fillRect(gx + cellSize * 0.62, by + cellSize * 0.11, cellSize * 0.07, cellSize * 0.03)
    }
  }

  function drawSchool(ctx, gx, gy, cellSize, level) {
    root.drawSpriteLot(ctx, gx, gy, cellSize, Model.TILE_SCHOOL)
    ctx.fillStyle = "#a46a4b"
    ctx.fillRect(gx + cellSize * 0.15, gy + cellSize * 0.35, cellSize * 0.7, cellSize * 0.5)
    ctx.fillStyle = "#386e73"
    ctx.fillRect(gx + cellSize * 0.10, gy + cellSize * 0.25, cellSize * 0.8, cellSize * 0.14)
    ctx.fillStyle = "#efdbb1"
    for (var i = 0; i < 3 + level; i++)
      ctx.fillRect(gx + cellSize * (0.21 + i * 0.12), gy + cellSize * 0.48, cellSize * 0.07, cellSize * 0.14)
  }

  function drawTile(ctx, tile, gx, gy, cellSize, data, index) {
    switch (tile.type) {
    case Model.TILE_LAKE:
      Waterfront.drawWater(ctx, gx, gy, cellSize, data, root.gridSize, index)
      break
    case Model.TILE_WATERFRONT_PARK:
      if (!root.drawInfrastructureSprite(ctx, gx, gy, cellSize, Model.TILE_PARK, 2, index)) root.drawPark(ctx, gx, gy, cellSize, 2)
      break
    case Model.TILE_TREE:
    case Model.TILE_FLOWERS:
    case Model.TILE_HEDGE:
    case Model.TILE_BENCH:
    case Model.TILE_STATUE:
    case Model.TILE_FOUNTAIN:
    case Model.TILE_ARBOUR:
    case Model.TILE_BANDSTAND:
      root.drawSpriteLot(ctx, gx, gy, cellSize, tile.type)
      var decorationSource = root.decorationSpriteUrls[tile.type]
      if (cityCanvas.isImageLoaded(decorationSource)) {
        var metrics = root.decorationMetrics[tile.type] || root.decorationMetrics.T
        var decorationSize = cellSize * metrics.scale
        ctx.drawImage(decorationSource, gx + (cellSize - decorationSize) / 2,
          gy + cellSize * metrics.baseline - decorationSize, decorationSize, decorationSize)
      } else {
        ctx.fillStyle = root.decorationBlobColors[tile.type] || "#6c9a4d"
        ctx.beginPath(); ctx.arc(gx + cellSize * 0.5, gy + cellSize * 0.6, cellSize * 0.22, 0, Math.PI * 2); ctx.fill()
      }
      break
    case Model.TILE_PATH:
      if (tile.level % 2 === 1) {
        Waterfront.drawWater(ctx, gx, gy, cellSize, data, root.gridSize, index)
        root.drawFootbridge(ctx, gx, gy, cellSize, root.pathConnectionsAt(index))
      } else {
        // The ground first. A footpath is a strip laid *on* the grass, unlike
        // a road, which replaces it with asphalt edge to edge — without this
        // the rest of the tile is whatever the canvas was cleared to, which
        // read as a wide black border down both sides of every path.
        root.drawEmpty(ctx, gx, gy, cellSize)
        root.drawFootpath(ctx, gx, gy, cellSize, root.pathConnectionsAt(index), index)
      }
      break
    case Model.TILE_ROAD:
      var roadConn = root.connectionsAt(index)
      if (tile.level % 2 === 1) {
        Waterfront.drawWater(ctx, gx, gy, cellSize, data, root.gridSize, index)
        Waterfront.drawBridge(ctx, gx, gy, cellSize, roadConn, tile.level >= 2)
      } else root.drawRoad(ctx, gx, gy, cellSize, roadConn, index, tile.level >= 2)
      if (tile.level >= 2) root.drawAvenueMarkings(ctx, gx, gy, cellSize, roadConn)
      break
    case Model.TILE_PARK:
      if (!root.drawInfrastructureSprite(ctx, gx, gy, cellSize, tile.type, tile.level, index)) root.drawPark(ctx, gx, gy, cellSize, tile.level)
      break
    case Model.TILE_POWER:
      if (!root.drawInfrastructureSprite(ctx, gx, gy, cellSize, tile.type, tile.level, index)) root.drawPower(ctx, gx, gy, cellSize, tile.level)
      break
    case Model.TILE_WATER:
      if (!root.drawInfrastructureSprite(ctx, gx, gy, cellSize, tile.type, tile.level, index)) root.drawWater(ctx, gx, gy, cellSize, tile.level)
      break
    case Model.TILE_FIRE:
      if (!root.drawInfrastructureSprite(ctx, gx, gy, cellSize, tile.type, tile.level, index)) root.drawFire(ctx, gx, gy, cellSize, tile.level)
      break
    case Model.TILE_POLICE:
      if (!root.drawInfrastructureSprite(ctx, gx, gy, cellSize, tile.type, tile.level, index)) root.drawPolice(ctx, gx, gy, cellSize, tile.level)
      break
    case Model.TILE_SCHOOL:
      if (!root.drawInfrastructureSprite(ctx, gx, gy, cellSize, tile.type, tile.level, index)) root.drawSchool(ctx, gx, gy, cellSize, tile.level)
      break
    case Model.TILE_MEDICAL:
      if (!root.drawInfrastructureSprite(ctx, gx, gy, cellSize, tile.type, tile.level, index)) root.drawMedical(ctx, gx, gy, cellSize, tile.level)
      break
    case Model.TILE_TRANSIT:
      if (!root.drawInfrastructureSprite(ctx, gx, gy, cellSize, tile.type, tile.level, index)) root.drawTransit(ctx, gx, gy, cellSize, tile.level)
      break
    case Model.TILE_RES:
      if (tile.level <= 0) root.drawUndeveloped(ctx, gx, gy, cellSize, tile.type)
      else if (!root.drawResidentialSprite(ctx, gx, gy, cellSize, tile.level, index))
        root.drawResidential(ctx, gx, gy, cellSize, tile.level)
      break
    case Model.TILE_COM:
      if (tile.level <= 0) root.drawUndeveloped(ctx, gx, gy, cellSize, tile.type)
      else if (!root.drawCommercialSprite(ctx, gx, gy, cellSize, tile.level, index))
        root.drawCommercial(ctx, gx, gy, cellSize, tile.level)
      break
    case Model.TILE_IND:
      if (tile.level <= 0) root.drawUndeveloped(ctx, gx, gy, cellSize, tile.type)
      else if (!root.drawIndustrialSprite(ctx, gx, gy, cellSize, tile.level, index))
        root.drawIndustrial(ctx, gx, gy, cellSize, tile.level)
      break
    default: root.drawEmpty(ctx, gx, gy, cellSize)
    }
  }

  // One line per boundary, not one inset border per tile — two tiles each
  // stroking their own edge left a visibly doubled line right where they
  // meet. Drawn once, after every tile, so it isn't painted over. Only the
  // boundaries crossing the current viewport are drawn — with a 64x64 grid
  // there's no reason to stroke thousands of off-screen lines every paint.
  // Lot boundaries, drawn as one shared overlay rather than a border per tile.
  //
  // Segmented so a line never crosses a road. Drawn edge to edge it put a
  // faint light stripe across the asphalt at every tile join — the seams that
  // survived the gradient fix were this, not the road rendering: they measured
  // *lighter* than the surrounding asphalt, which no darkening could explain.
  // Roads carry their own curbs, so the grid has nothing to add there.
  function drawGridOverlay(ctx, data, startCol, endCol, startRow, endRow, cellSize, offsetX, offsetY, viewW, viewH) {
    ctx.strokeStyle = root.neutralTint(0.04)
    ctx.lineWidth = 1
    var size = root.gridSize
    function roadAt(col, row) {
      if (col < 0 || row < 0 || col >= size || row >= size) return false
      var t = data[row * size + col]
      return !!t && t[0] === Model.TILE_ROAD
    }

    for (var c = startCol; c <= endCol + 1; c++) {
      var x = c * cellSize - offsetX + 0.5
      var vStart = -1
      for (var r = startRow; r <= endRow + 1; r++) {
        var vSkip = r > endRow || roadAt(c - 1, r) || roadAt(c, r)
        if (!vSkip && vStart < 0) vStart = r
        else if (vSkip && vStart >= 0) {
          ctx.beginPath()
          ctx.moveTo(x, vStart * cellSize - offsetY)
          ctx.lineTo(x, r * cellSize - offsetY)
          ctx.stroke()
          vStart = -1
        }
      }
    }

    for (var row = startRow; row <= endRow + 1; row++) {
      var y = row * cellSize - offsetY + 0.5
      var hStart = -1
      for (var col = startCol; col <= endCol + 1; col++) {
        var hSkip = col > endCol || roadAt(col, row - 1) || roadAt(col, row)
        if (!hSkip && hStart < 0) hStart = col
        else if (hSkip && hStart >= 0) {
          ctx.beginPath()
          ctx.moveTo(hStart * cellSize - offsetX, y)
          ctx.lineTo(col * cellSize - offsetX, y)
          ctx.stroke()
          hStart = -1
        }
      }
    }
  }

  readonly property var utilityRangeColors: ({
    H: { fill: "rgba(75, 195, 145, 0.16)", stroke: "rgba(130, 230, 170, 0.8)" },
    N: { fill: "rgba(69, 170, 150, 0.16)", stroke: "rgba(110, 210, 190, 0.8)" },
    E: { fill: "rgba(201, 162, 39, 0.16)", stroke: "rgba(230, 190, 60, 0.75)" },
    W: { fill: "rgba(47, 111, 148, 0.2)", stroke: "rgba(100, 180, 220, 0.75)" },
    F: { fill: "rgba(193, 67, 54, 0.16)", stroke: "rgba(230, 110, 90, 0.75)" },
    S: { fill: "rgba(58, 111, 224, 0.16)", stroke: "rgba(110, 150, 230, 0.75)" },
    M: { fill: "rgba(197, 133, 47, 0.16)", stroke: "rgba(226, 172, 80, 0.78)" }
  })
  readonly property var coverageRadii: ({
    H: Model.MEDICAL_RADIUS,
    N: Model.SCHOOL_RADIUS,
    E: Model.POWER_RADIUS, W: Model.WATER_RADIUS,
    F: Model.FIRE_RADIUS, S: Model.POLICE_RADIUS,
    M: Model.TRANSIT_RADIUS
  })
  readonly property var coverageTypes: [Model.TILE_POWER, Model.TILE_WATER, Model.TILE_FIRE, Model.TILE_POLICE, Model.TILE_SCHOOL, Model.TILE_MEDICAL, Model.TILE_TRANSIT]

  // Shows a plant's actual reach: while a coverage-building tool (power,
  // water, fire, police) is active, previews what placing one *here* would
  // cover (even on bare ground); otherwise, hovering an already-built one
  // shows its real coverage. Same circle either way, since the math
  // (Model.withinRadius) is literally the circle radius, not an
  // approximation of a square.
  // With a service building armed, mark every one already standing. Hunting
  // for the fire station you meant to upgrade is the tedious part of a big
  // city, and the information is already on screen — it just was not drawn.
  // R/C/I are excluded on purpose: those grow on their own, are everywhere,
  // and marking them would light up half the map.
  function drawSameTypeMarkers(ctx, data, cellSize, offsetX, offsetY, viewW, viewH) {
    var type = root.activeTool
    if (root.upgradeableTypes.indexOf(type) < 0) return
    var target = root.upgradeTarget === type ? root.selectedTier : 0
    var startCol = Math.max(0, Math.floor(offsetX / cellSize))
    var endCol = Math.min(root.gridSize - 1, Math.ceil((offsetX + viewW) / cellSize))
    var startRow = Math.max(0, Math.floor(offsetY / cellSize))
    var endRow = Math.min(root.gridSize - 1, Math.ceil((offsetY + viewH) / cellSize))
    var inset = Math.max(1, cellSize * 0.06)
    ctx.lineWidth = Math.max(1.5, cellSize * 0.055)
    for (var row = startRow; row <= endRow; row++) {
      for (var col = startCol; col <= endCol; col++) {
        var tile = Model.parseTile(data[row * root.gridSize + col])
        if (tile.type !== type) continue
        var gx = col * cellSize - offsetX, gy = row * cellSize - offsetY
        // Bright where clicking would actually raise the tier, muted where the
        // building already meets it — so the map answers "which of these still
        // needs my money" rather than just "where are they".
        var upgradeable = tile.level < target
        ctx.fillStyle = upgradeable
          ? Qt.rgba(Color.accent.r, Color.accent.g, Color.accent.b, 0.20)
          : root.neutralTint(0.08)
        ctx.fillRect(gx, gy, cellSize + 1, cellSize + 1)
        ctx.strokeStyle = upgradeable ? Color.accent : root.neutralTint(0.45)
        ctx.strokeRect(gx + inset, gy + inset,
          cellSize - inset * 2, cellSize - inset * 2)
      }
    }
  }

  function drawCoverageOverlay(ctx, data, hoverIndex, cellSize, offsetX, offsetY) {
    if (hoverIndex < 0) return
    var utilType = null
    var levelForRadius = 0
    if (root.coverageTypes.indexOf(root.activeTool) >= 0) {
      utilType = root.activeTool
      levelForRadius = root.upgradeTarget === root.activeTool ? root.selectedTier : 0
    } else {
      var hovered = Model.parseTile(data[hoverIndex])
      if (root.coverageTypes.indexOf(hovered.type) >= 0) { utilType = hovered.type; levelForRadius = hovered.level }
    }
    if (!utilType) return

    var radius = root.coverageRadii[utilType] * Model.INFRA_RADIUS_SCALE[levelForRadius]
    var colors = root.utilityRangeColors[utilType]
    var col = hoverIndex % root.gridSize
    var row = Math.floor(hoverIndex / root.gridSize)
    var cx = col * cellSize - offsetX + cellSize / 2
    var cy = row * cellSize - offsetY + cellSize / 2
    var pixelRadius = radius * cellSize

    ctx.fillStyle = colors.fill
    ctx.beginPath()
    ctx.arc(cx, cy, pixelRadius, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = colors.stroke
    ctx.lineWidth = 2
    ctx.setLineDash([6, 4])
    ctx.stroke()
    ctx.setLineDash([])
  }

  Flickable {
    anchors.fill: parent
    contentWidth: width
    contentHeight: content.implicitHeight
    clip: true
    boundsBehavior: Flickable.StopAtBounds

    Column {
      id: content
      width: parent.width
      spacing: Style.space(10)

      Row {
        width: parent.width
        spacing: Style.space(8)

        Button {
          id: gameMenuButton
          anchors.verticalCenter: parent.verticalCenter
          iconText: "☰"
          tooltipText: "Game menu"
          foreground: root.bar ? root.bar.foreground : Color.foreground
          onClicked: root.gameMenuOpen = !root.gameMenuOpen
        }

        Button {
          id: gazetteButton
          anchors.verticalCenter: parent.verticalCenter
          // Nerd Font newspaper. A dot rides on it when there is an edition
          // the player has not read, which is the only nudge it ever gives.
          iconText: "\uf1ea"
          tooltipText: root.serviceReady && root.cityService.gazetteNews
            ? "The " + root.cityService.cityName + " Gazette — a new edition"
            : "The city Gazette"
          foreground: root.serviceReady && root.cityService.gazetteNews
            ? "#e8a84c" : (root.bar ? root.bar.foreground : Color.foreground)
          onClicked: root.openGazette()
        }

        Text {
          width: parent.width - gameMenuButton.width - gazetteButton.width - taxRow.implicitWidth - detachButton.width - parent.spacing * 4
          text: root.serviceReady ? root.cityService.cityName : "Omaville"
          elide: Text.ElideRight
          color: root.bar ? root.bar.foreground : Color.foreground
          font.family: root.bar ? root.bar.fontFamily : Style.font.family
          font.pixelSize: Style.font.subtitle
          font.bold: true
          anchors.verticalCenter: parent.verticalCenter
        }

        Row {
          id: taxRow
          spacing: Style.space(4)
          anchors.verticalCenter: parent.verticalCenter

          Text {
            text: "Tax " + root.taxRatePercent + "%"
            color: root.bar ? root.bar.foreground : Color.foreground
            font.family: root.bar ? root.bar.fontFamily : Style.font.family
            font.pixelSize: Style.font.bodySmall
            anchors.verticalCenter: parent.verticalCenter
          }
          Button {
            iconText: "−"
            foreground: root.bar ? root.bar.foreground : Color.foreground
            onClicked: if (root.cityService) root.cityService.setTaxRate(root.taxRatePercent - 1)
          }
          Button {
            iconText: "+"
            foreground: root.bar ? root.bar.foreground : Color.foreground
            onClicked: if (root.cityService) root.cityService.setTaxRate(root.taxRatePercent + 1)
          }
        }

        Button {
          id: detachButton
          anchors.verticalCenter: parent.verticalCenter
          iconText: root.detached ? "⧈" : "⧉"
          tooltipText: root.detached ? "Dock back into the bar" : "Pop out into its own window"
          foreground: root.bar ? root.bar.foreground : Color.foreground
          onClicked: root.detached ? root.reattachRequested() : root.detachRequested()
        }
      }

      // Sits at the right end of the stats row rather than owning a line of
      // its own: four words centred in a wide panel cost more vertical space
      // than the map could afford.
      Text {
        id: calendarLabel
        parent: statsRow
        anchors.right: statsRow.right
        anchors.verticalCenter: statsRow.verticalCenter
        text: root.calendar.monthName + " · Year " + root.calendar.year
        color: root.bar ? root.bar.foreground : Color.foreground
        font.family: root.bar ? root.bar.fontFamily : Style.font.family
        font.pixelSize: Style.font.body
        font.bold: true

        transform: Scale {
          id: calendarScale
          origin.x: calendarLabel.width / 2
          origin.y: calendarLabel.height / 2
          xScale: 1
          yScale: 1
        }

        SequentialAnimation {
          id: calendarPulse
          NumberAnimation {
            targets: [calendarScale]
            properties: "xScale,yScale"
            to: 1.12
            duration: 90
            easing.type: Easing.OutQuad
          }
          NumberAnimation {
            targets: [calendarScale]
            properties: "xScale,yScale"
            to: 1
            duration: 160
            easing.type: Easing.InQuad
          }
        }
      }

      Item {
        id: statsRow
        width: parent.width
        height: statsFigures.implicitHeight

        MouseArea {
          id: statsHover
          anchors.fill: parent
          hoverEnabled: true
          acceptedButtons: Qt.NoButton
        }
        ToolHint {
          // Default placement is beside a small button; this parent is the
          // full panel width, so it would land off the edge. Sit under the row.
          x: 0
          y: parent ? parent.height + Style.space(4) : 0
          visible: statsHover.containsMouse
          text: "Residents · Jobs · Treasury · Happiness · Appeal"
        }

        Row {
          id: statsFigures
          spacing: Style.space(14)

          // Nerd Font glyphs rather than words: five labelled figures is a lot of
          // reading for a row that is glanced at. The same font the bar widget
          // already draws its alert icons from, so it is known to be present.
          // Money keeps its own symbol — a currency icon beside a "$" would be
          // saying it twice. A tooltip on the row names all five, since an icon
          // is only obvious once you already know what it means.
          Text {
            text: "\uf0c0  " + Model.groupDigits(root.population)
            color: root.bar ? root.bar.foreground : Color.foreground
            font.family: root.bar ? root.bar.fontFamily : Style.font.family
            font.pixelSize: Style.font.bodySmall
          }
          Text {
            text: "\uf0b1  " + Model.groupDigits(root.jobs)
            color: Qt.darker(root.bar ? root.bar.foreground : Color.foreground, 1.2)
            font.family: root.bar ? root.bar.fontFamily : Style.font.family
            font.pixelSize: Style.font.bodySmall
          }
          Text {
            text: Model.money(root.treasury)
            color: root.treasury < 0 ? Color.urgent : (root.bar ? root.bar.foreground : Color.foreground)
            font.family: root.bar ? root.bar.fontFamily : Style.font.family
            font.pixelSize: Style.font.bodySmall
          }
          Text {
            text: "\uf118  " + root.happiness + "%"
            color: root.happiness < 30 ? Color.urgent : Qt.darker(root.bar ? root.bar.foreground : Color.foreground, 1.2)
            font.family: root.bar ? root.bar.fontFamily : Style.font.family
            font.pixelSize: Style.font.bodySmall
          }
          Text {
            text: "\uf005  +" + root.attractiveness + "%"
            color: Qt.darker(root.bar ? root.bar.foreground : Color.foreground, 1.2)
            font.family: root.bar ? root.bar.fontFamily : Style.font.family
            font.pixelSize: Style.font.bodySmall
          }
        }
      }

      // Being out of office makes every build silently do nothing, which reads
      // as a broken game rather than a rule. This says so where the eye
      // already is, rather than only inside the Budget card.
      Rectangle {
        width: parent.width
        visible: root.outOfOffice
        height: visible ? outOfOfficeText.implicitHeight + Style.space(14) : 0
        radius: Style.cornerRadius
        color: Qt.rgba(0.88, 0.42, 0.32, 0.16)
        border.width: 1
        border.color: "#e0806a"

        Text {
          id: outOfOfficeText
          anchors.left: parent.left
          anchors.right: parent.right
          anchors.margins: Style.space(9)
          anchors.verticalCenter: parent.verticalCenter
          wrapMode: Text.WordWrap
          text: root.serviceReady
            ? "You are out of office. An interim administration runs "
              + root.cityService.cityName + " for " + root.outOfOfficeSpan
              + " — building, zoning and spending are disabled until then."
            : ""
          color: "#e0806a"
          font.family: root.bar ? root.bar.fontFamily : Style.font.family
          font.pixelSize: Style.font.caption
        }
      }

      // Coverage and demand share a row when the panel is wide enough, and
      // stack when it is not. Two full-width cards one above the other cost
      // the map a whole card's height on any normal window.
      Grid {
        id: instrumentRow
        width: parent.width
        columns: width >= Style.space(430) ? 2 : 1
        spacing: Style.space(8)
        readonly property real cellWidth:
          (width - spacing * (columns - 1)) / columns
        // Both cards take the taller one's height. Side by side at their own
        // natural sizes they sat at different heights with mismatched tops,
        // which reads as a layout accident rather than a pair.
        readonly property real cellHeight:
          Math.max(coverageCard.implicitHeight, demandCard.implicitHeight)

        CoverageStatus {
          id: coverageCard
          rows: root.serviceCoverage
          redundancy: root.redundancy
          active: root.active
          width: instrumentRow.cellWidth
          height: instrumentRow.cellHeight
        }

      // RCI demand meter, SimCity-style: one bar per zone that rises above
      // the center line when that zone is undersupplied (build more) and
      // dips below it when it's oversupplied (hold off) — same growth-chance
      // multiplier that actually drives tickGrid, just rescaled for display.
      // Given its own card (rather than sitting bare in the stats flow like
      // the Pop/Jobs/$/Happy row) so it reads as one grouped instrument
      // instead of three numbers floating loose in the layout.
      Rectangle {
        id: demandCard
        width: instrumentRow.cellWidth
        implicitHeight: demandColumn.implicitHeight + Style.space(16)
        height: instrumentRow.cellHeight
        radius: Style.cornerRadius
        color: Qt.rgba(Color.menu.background.r, Color.menu.background.g, Color.menu.background.b, 0.55)
        border.width: 1
        border.color: root.neutralTint(0.15)

        Row {
          id: demandColumn
          anchors.fill: parent
          anchors.margins: Style.space(8)
          spacing: Style.space(16)

          Text {
            anchors.verticalCenter: parent.verticalCenter
            text: "Demand"
            color: Qt.darker(root.bar ? root.bar.foreground : Color.foreground, 1.3)
            font.family: root.bar ? root.bar.fontFamily : Style.font.family
            font.pixelSize: Style.font.caption
          }

          Repeater {
              model: [
                { key: "R", color: root.roofColors.R },
                { key: "C", color: root.roofColors.C },
                { key: "I", color: root.roofColors.I }
              ]

              Row {
                id: demandItem
                required property var modelData
                spacing: Style.space(4)

                readonly property int pct: root.demandPercent(modelData.key, root.demand[modelData.key])
                readonly property real barHalf: Style.space(12)

                Item {
                  width: Style.space(10)
                  height: Style.space(24)
                  anchors.verticalCenter: parent.verticalCenter

                  Rectangle {
                    width: parent.width
                    height: 1
                    anchors.verticalCenter: parent.verticalCenter
                    color: root.neutralTint(0.35)
                  }

                  Rectangle {
                    width: parent.width
                    radius: 1
                    color: demandItem.modelData.color
                    y: demandItem.pct >= 0
                      ? demandItem.barHalf - demandItem.barHalf * demandItem.pct / 100
                      : demandItem.barHalf
                    height: demandItem.barHalf * Math.abs(demandItem.pct) / 100
                  }
                }

                Text {
                  anchors.verticalCenter: parent.verticalCenter
                  text: demandItem.modelData.key + " " + (demandItem.pct >= 0 ? "+" : "") + demandItem.pct + "%"
                  color: root.bar ? root.bar.foreground : Color.foreground
                  font.family: root.bar ? root.bar.fontFamily : Style.font.family
                  font.pixelSize: Style.font.caption
                }
              }
          }
        }
      }
      }

      PanelSeparator {
        foreground: root.bar ? root.bar.foreground : Color.foreground
      }

      // Palette-beside-map, SimCity-2000-style, instead of a horizontal
      // strip above it: a vertical icon column that just grows taller as
      // more tools are added, rather than eating into the map's own
      // vertical space row by row. Each icon is still a live mini-render
      // from the same draw functions used on the map, and the name/cost
      // still lives in the status line below rather than a per-icon label.
      Row {
        id: mapRow
        width: parent.width
        spacing: Style.space(8)

        // The palette column carries two different kinds of control, so they
        // are separated rather than merged: screen controls at the top drawn
        // as plain glyphs, then a rule, then the build tools drawn as live
        // tile renders. Zoom and centring used to sit in a row of their own
        // above the map, which cost the map a strip of height on every
        // window for four buttons.
        Column {
          id: paletteColumn
          // Dimmed rather than disabled: the tools stay hoverable so their
          // hints still explain what they would cost, but it is obvious at a
          // glance that nothing will happen.
          opacity: root.outOfOffice ? 0.4 : 1
          // Higher than the map Item beside it (default z: 0, but declared
          // *after* this Column so it paints on top when equal) — the tier
          // flyout escapes toolButton's own bounds to sit beside it, and
          // without this it was rendering underneath the map canvas.
          z: 5
          spacing: Style.space(6)

          Grid {
            id: toolPalette
            // Always two abreast. A single column in the detached window ran
            // longer than the window itself, which is the opposite of what
            // the vertical palette was for.
            columns: 2
            spacing: Style.space(6)

            Repeater {
              model: root.toolList

              Rectangle {
                id: toolButton
                required property var modelData
                z: root.flyoutType === modelData.type ? 10 : 0
                readonly property bool upgradeable: root.upgradeableTypes.indexOf(modelData.type) >= 0
                readonly property bool decorations: modelData.type === "decorations"
                readonly property bool hasFlyout: upgradeable || decorations
                readonly property bool armed: root.activeTool === modelData.type
                  || (decorations && Model.isDecoration(root.activeTool))
                readonly property bool upgradeArmed: armed && root.upgradeTarget === modelData.type
                width: Style.space(34)
                height: Style.space(34)
                radius: Style.space(4)
                color: !armed ? "transparent"
                  : upgradeArmed ? Qt.rgba(0.88, 0.62, 0.22, 0.35)
                  : Qt.rgba(Color.accent.r, Color.accent.g, Color.accent.b, 0.35)
                border.width: 1
                border.color: !armed ? root.neutralTint(0.35)
                  : upgradeArmed ? "#e0a83a"
                  : Color.accent

                Canvas {
                  id: toolIcon
                  visible: toolbarSprite.status !== Image.Ready
                  anchors.centerIn: parent
                  width: Style.space(26)
                  height: Style.space(26)
                  onPaint: {
                    var ctx = getContext("2d")
                    ctx.clearRect(0, 0, width, height)
                    switch (toolButton.modelData.type) {
                    case Model.TILE_ROAD:
                      root.drawRoad(ctx, 0, 0, width, { up: true, down: true, left: true, right: true })
                      break
                    case Model.TOOL_AVENUE:
                      root.drawRoad(ctx, 0, 0, width, { up: true, down: true, left: false, right: false }, 0, true)
                      root.drawAvenueMarkings(ctx, 0, 0, width, { up: true, down: true, left: false, right: false })
                      break
                    case Model.TILE_PATH:
                      root.drawFootpath(ctx, 0, 0, width, { up: true, down: true, left: false, right: false }, 0)
                      break
                    case Model.TILE_LAKE: Waterfront.drawWater(ctx, 0, 0, width, ['L0'], 1, 0); break
                    case Model.TILE_WATERFRONT_PARK: root.drawPark(ctx, 0, 0, width, 2); break
                    case Model.TILE_RES: root.drawResidential(ctx, 0, 0, width, 2); break
                    case Model.TILE_COM: root.drawCommercial(ctx, 0, 0, width, 2); break
                    case Model.TILE_IND: root.drawIndustrial(ctx, 0, 0, width, 2); break
                    case Model.TILE_PARK: root.drawPark(ctx, 0, 0, width, 0); break
                    case Model.TILE_POWER: root.drawPower(ctx, 0, 0, width, 0); break
                    case Model.TILE_WATER: root.drawWater(ctx, 0, 0, width, 0); break
                    case Model.TILE_FIRE: root.drawFire(ctx, 0, 0, width, 0); break
                    case Model.TILE_POLICE: root.drawPolice(ctx, 0, 0, width, 0); break
                    case Model.TILE_SCHOOL: root.drawSchool(ctx, 0, 0, width, 0); break
                    case Model.TILE_MEDICAL: root.drawMedical(ctx, 0, 0, width, 0); break
                    case Model.TILE_TRANSIT: root.drawTransit(ctx, 0, 0, width, 0); break
                    case "decorations": root.drawPark(ctx, 0, 0, width, 0); break
                    case "inspect": root.drawInfoIcon(ctx, 0, 0, width); break
                    default: root.drawBulldozeIcon(ctx, 0, 0, width); break
                    }
                  }
                }

                Image {
                  id: toolbarSprite
                  anchors.centerIn: parent
                  width: Style.space(30)
                  height: Style.space(30)
                  source: root.previewSpriteSource(toolButton.modelData.type,
                    root.upgradeTarget === toolButton.modelData.type ? root.selectedTier : 0)
                  fillMode: Image.PreserveAspectFit
                  smooth: true
                  visible: status === Image.Ready
                }

                // Corner marker identifies tools with hover choices.
                Rectangle {
                  visible: toolButton.hasFlyout
                  width: Style.space(6)
                  height: Style.space(6)
                  radius: width / 2
                  color: "#e0a83a"
                  anchors.right: parent.right
                  anchors.bottom: parent.bottom
                  anchors.margins: Style.space(1)
                }

                MouseArea {
                  id: toolMouse
                  anchors.fill: parent
                  hoverEnabled: true
                  cursorShape: Qt.PointingHandCursor
                  onClicked: {
                    // Deliberately doesn't reset upgradeTarget: once you've
                    // picked a tier from the flyout, a plain reselect of this
                    // same tool should keep remembering that choice instead
                    // of falling back to plain placement every time — only
                    // the flyout itself changes which mode is armed.
                    root.flyoutType = ""
                    root.activeTool = toolButton.decorations ? root.decorationTool : toolButton.modelData.type
                  }
                  onEntered: {
                    root.hoveredToolType = toolButton.modelData.type
                    flyoutCloseTimer.stop()
                    if (toolButton.hasFlyout) openFlyout.restart()
                    else root.flyoutType = ""
                  }
                  onExited: {
                    if (root.hoveredToolType === toolButton.modelData.type) root.hoveredToolType = ""
                    openFlyout.stop()
                    flyoutCloseTimer.restart()
                  }
                }

                Timer {
                  id: openFlyout
                  interval: 180
                  onTriggered: if (toolMouse.containsMouse)
                    root.openFlyoutFor(toolButton, toolButton.modelData.type)
                }
                ToolHint { visible: toolMouse.containsMouse; text: root.toolHint(toolButton.modelData.type) }

                // A hover bridge and close grace period keep choices reachable.
              }
            }
          }

          // The rule is the whole point of the rearrangement: the tools above
          // it change the city, the controls below it only change how you are
          // looking at it.
          Rectangle {
            width: paletteColumn.width
            height: 1
            color: root.neutralTint(0.3)
          }

          Grid {
            id: viewControls
            columns: 2
            // Zoom is deliberately the bottom row: it is the only control
            // here with a readout, and the percentage sits directly beneath.
            spacing: Style.space(6)

            Button {
              iconText: "\u2302"
              foreground: root.bar ? root.bar.foreground : Color.foreground
              onClicked: { root.zoom = 1; root.centerOnGrid() }
            }
            // Overlay picker. A single toggle rather than a row of eight
            // chips — the map is the scarce space here, and the list is only
            // needed at the moment of choosing.
            Button {
              iconText: root.overlayMode === "" ? "\u25d4" : "\u25c9"
              foreground: root.overlayMode === ""
                ? (root.bar ? root.bar.foreground : Color.foreground) : Color.accent
              onClicked: root.overlayMenuOpen = !root.overlayMenuOpen
            }
            Button {
              iconText: "\u2212"
              foreground: root.bar ? root.bar.foreground : Color.foreground
              onClicked: root.setZoom(root.zoom / 1.2)
            }
            Button {
              iconText: "+"
              foreground: root.bar ? root.bar.foreground : Color.foreground
              onClicked: root.setZoom(root.zoom * 1.2)
            }
          }

          Text {
            width: paletteColumn.width
            text: Math.round(root.zoom * 100) + "%"
            horizontalAlignment: Text.AlignHCenter
            color: Qt.darker(root.bar ? root.bar.foreground : Color.foreground, 1.3)
            font.family: root.bar ? root.bar.fontFamily : Style.font.family
            font.pixelSize: Style.font.caption
          }

          // Which overlay is on has to stay legible once the picker closes,
          // and the accent-coloured toggle alone does not say which one.
          Text {
            width: paletteColumn.width
            visible: root.overlayMode !== ""
            text: root.overlayDef ? root.overlayDef.label : ""
            horizontalAlignment: Text.AlignHCenter
            elide: Text.ElideRight
            color: Color.accent
            font.family: root.bar ? root.bar.fontFamily : Style.font.family
            font.pixelSize: Style.font.caption
          }
        }

        Item {
          width: root.viewportWidth
          height: cityCanvas.height

        Canvas {
          id: cityCanvas
          anchors.horizontalCenter: parent.horizontalCenter
          width: root.viewportWidth
          height: root.viewportHeight

          property var gridData: root.grid
          property real cellSize: root.effectiveCellSize
          property real offsetX: root.panX
          property real offsetY: root.panY
          property var neighborTiles: root.neighbors
          property int neighborLinks: root.connectedNeighbors.length
          onNeighborTilesChanged: requestPaint()
          onNeighborLinksChanged: requestPaint()
          onGridDataChanged: requestPaint()
          onCellSizeChanged: requestPaint()
          onOffsetXChanged: requestPaint()
          onOffsetYChanged: requestPaint()
          onWidthChanged: requestPaint()
          onHeightChanged: requestPaint()
          Component.onCompleted: {
            for (var ri = 0; ri < root.residentialSpriteUrls.length; ri++)
              for (var rj = 0; rj < root.residentialSpriteUrls[ri].length; rj++)
                loadImage(root.residentialSpriteUrls[ri][rj])
            for (var ci = 0; ci < root.commercialSpriteUrls.length; ci++)
              for (var cj = 0; cj < root.commercialSpriteUrls[ci].length; cj++)
                loadImage(root.commercialSpriteUrls[ci][cj])
            for (var ii = 0; ii < root.industrialSpriteUrls.length; ii++)
              for (var ij = 0; ij < root.industrialSpriteUrls[ii].length; ij++)
                loadImage(root.industrialSpriteUrls[ii][ij])
            loadImage(root.footbridgeSprite)
            for (var type in root.infrastructureSpriteUrls)
              for (var ti = 0; ti < root.infrastructureSpriteUrls[type].length; ti++)
                loadImage(root.infrastructureSpriteUrls[type][ti])
            for (var decoration in root.decorationSpriteUrls)
              loadImage(root.decorationSpriteUrls[decoration])
          }
          onImageLoaded: requestPaint()

          onPaint: {
            var ctx = getContext("2d")
            ctx.clearRect(0, 0, width, height)
            var data = gridData
            var size = cellSize
            var startCol = Math.max(0, Math.floor(offsetX / size))
            var endCol = Math.min(root.gridSize - 1, Math.ceil((offsetX + width) / size))
            // Taller R3/C3/I3 buildings extend north of their own lot. Include
            // one extra row so their overdraw is present at the viewport edge
            // instead of popping in during a pan.
            var startRow = Math.max(0, Math.floor(offsetY / size) - 1)
            var endRow = Math.min(root.gridSize - 1, Math.ceil((offsetY + height) / size))
            for (var row = startRow; row <= endRow; row++) {
              for (var col = startCol; col <= endCol; col++) {
                var idx = row * root.gridSize + col
                var tile = Model.parseTile(data[idx])
                var gx = col * size - offsetX
                var gy = row * size - offsetY
                root.drawTile(ctx, tile, gx, gy, size, data, idx)
              }
            }
            root.drawGridOverlay(ctx, data, startCol, endCol, startRow, endRow, size, offsetX, offsetY, width, height)
            root.drawNeighbors(ctx, size, offsetX, offsetY, width, height)
            root.drawStreetNames(ctx, size, offsetX, offsetY, width, height)
            for (var detailRow = startRow; detailRow <= endRow; detailRow++) {
              for (var detailCol = startCol; detailCol <= endCol; detailCol++) {
                var detailIndex = detailRow * root.gridSize + detailCol
                // Lamps and markings belong on any road on dry land, avenues
                // included; bridges carry their own railings instead.
                var detailTile = Model.parseTile(data[detailIndex])
                if (detailTile.type === Model.TILE_ROAD && detailTile.level % 2 === 0)
                  root.drawStreetDetails(ctx, detailCol * size - offsetX, detailRow * size - offsetY,
                    size, root.connectionsAt(detailIndex))
              }
            }
          }

          MouseArea {
            id: gridMouse
            anchors.fill: parent
            // The outer Flickable must not steal a road-paint or map-pan
            // gesture when a smaller detached window makes it scrollable.
            preventStealing: true
            acceptedButtons: Qt.LeftButton | Qt.MiddleButton | Qt.RightButton
            hoverEnabled: true
            property bool painting: false
            property bool panning: false
            property real lastX: 0
            property real lastY: 0
            property int hoverIndex: -1
            property var paintedTiles: ({})

            function tileIndexAt(mx, my) {
              var worldX = mx + root.panX
              var worldY = my + root.panY
              var col = Math.floor(worldX / root.effectiveCellSize)
              var row = Math.floor(worldY / root.effectiveCellSize)
              if (col < 0 || col >= root.gridSize || row < 0 || row >= root.gridSize) return -1
              return row * root.gridSize + col
            }

            // The last tile actually painted, so a drag can fill in the tiles
            // between two mouse samples. Mouse moves are delivered per frame
            // and coalesced, so a fast drag — or a slow frame — skips whole
            // runs of tiles. Sampling positions can never be enough on its
            // own: the gap has to be walked.
            property int lastPaintedIndex: -1

            function applyAt(mx, my) {
              if (root.activeTool === "") return
              var idx = tileIndexAt(mx, my)
              if (idx < 0) return
              if (lastPaintedIndex >= 0 && idx !== lastPaintedIndex) {
                var size = root.gridSize
                var x0 = lastPaintedIndex % size, y0 = Math.floor(lastPaintedIndex / size)
                var x1 = idx % size, y1 = Math.floor(idx / size)
                var steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))
                for (var step = 1; step < steps; step++) {
                  var t = step / steps
                  applyIndex(Math.round(y0 + (y1 - y0) * t) * size
                    + Math.round(x0 + (x1 - x0) * t))
                }
              }
              lastPaintedIndex = idx
              applyIndex(idx)
            }

            function applyIndex(idx) {
              if (idx < 0 || idx >= root.gridSize * root.gridSize) return
              if (root.activeTool === "inspect") { root.inspectedIndex = idx; return }
              if (paintedTiles[idx]) return
              paintedTiles[idx] = true
              if (!root.cityService) return
              if (root.activeTool === "bulldoze") { root.cityService.bulldozeTile(idx); return }
              if (root.upgradeableTypes.indexOf(root.activeTool) >= 0) {
                root.cityService.buildTier(idx, root.activeTool,
                  root.upgradeTarget === root.activeTool ? root.selectedTier : 0)
                return
              }
              root.cityService.zoneTile(idx, root.activeTool)
            }

            onPressed: function(mouse) {
              paintedTiles = ({})
              lastPaintedIndex = -1
              painting = false
              panning = false
              if (mouse.button === Qt.MiddleButton) {
                panning = true
                lastX = mouse.x
                lastY = mouse.y
              } else if (mouse.button === Qt.RightButton) {
                // Right-click deselects rather than painting with
                // whatever was active — a way back to a neutral
                // "just looking" cursor without picking Bulldoze.
                root.activeTool = ""
              } else {
                painting = true
                applyAt(mouse.x, mouse.y)
              }
            }
            onPositionChanged: function(mouse) {
              if (panning) {
                // Deliberately not updating hoverIndex here. A coverage
                // preview under the cursor is meaningless while the map is
                // being dragged, and recomputing it fired a second
                // full-viewport canvas repaint on every event of the drag —
                // on top of the tile repaint the pan itself already costs.
                if (hoverIndex !== -1) hoverIndex = -1
                root.panX -= (mouse.x - lastX)
                root.panY -= (mouse.y - lastY)
                root.clampPan()
                lastX = mouse.x
                lastY = mouse.y
                return
              }
              hoverIndex = tileIndexAt(mouse.x, mouse.y)
              if (painting) applyAt(mouse.x, mouse.y)
            }
            onReleased: function(mouse) { painting = false; panning = false }
            onCanceled: { painting = false; panning = false }
            onExited: hoverIndex = -1
            onWheel: function(wheel) {
              root.setZoom(root.zoom * (wheel.angleDelta.y > 0 ? 1.12 : 1 / 1.12))
            }
          }
        }

        // The hover-preview coverage circle used to be drawn as the last
        // step inside cityCanvas's own onPaint, which meant it depended on
        // hoverIndex — and hoverIndex changes on nearly every pixel of
        // mouse movement over the map, which was forcing a full viewport
        // tile re-render (every gradient-shaded building redrawn) on every
        // mouse move, not just an actual grid/pan/zoom change. Same fix as
        // the utility-warning one: split the thing that changes constantly
        // (a hover position) onto its own cheap layer instead of dragging
        // the whole tile grid along with it.
        // Data overlay: its own layer above the tiles so switching modes or
        // panning repaints a few translucent rects instead of every building.
        Canvas {
          id: overlayCanvas
          anchors.horizontalCenter: parent.horizontalCenter
          width: root.viewportWidth
          height: root.viewportHeight
          visible: root.overlayMode !== ""

          property var gridData: root.grid
          property real cellSize: root.effectiveCellSize
          property real offsetX: root.panX
          property real offsetY: root.panY
          property string mode: root.overlayMode
          // Guarded on the same condition as `visible` above: a hidden layer
          // must not spend a full-viewport repaint on every pan event.
          readonly property bool showing: root.overlayMode !== ""
          onGridDataChanged: if (showing) requestPaint()
          onCellSizeChanged: if (showing) requestPaint()
          onOffsetXChanged: if (showing) requestPaint()
          onOffsetYChanged: if (showing) requestPaint()
          onModeChanged: requestPaint()
          onWidthChanged: requestPaint()
          onHeightChanged: requestPaint()

          // Coverage reach moves with department funding, and the growth view
          // depends on happiness, so both have to repaint the overlay.
          Connections {
            target: root.cityService
            enabled: root.serviceReady
            function onFundingChanged() { overlayCanvas.requestPaint() }
            function onHappinessChanged() { overlayCanvas.requestPaint() }
          }

          onPaint: {
            var ctx = getContext("2d")
            ctx.clearRect(0, 0, width, height)
            if (root.overlayMode === "") return
            root.drawDataOverlay(ctx, gridData, cellSize, offsetX, offsetY, width, height)
          }
        }

        Canvas {
          id: coverageHoverCanvas
          anchors.horizontalCenter: parent.horizontalCenter
          width: root.viewportWidth
          height: root.viewportHeight

          property real offsetX: root.panX
          property real offsetY: root.panY
          property real cellSize: root.effectiveCellSize
          property int hoverIndex: gridMouse.hoverIndex
          // Two jobs: the hover coverage circle, and marking every building of
          // the armed type. The second does not need a cursor on the map, so
          // the pan guard has to allow for it as well as for hovering.
          readonly property bool marking: root.upgradeableTypes.indexOf(root.activeTool) >= 0
          onOffsetXChanged: if (hoverIndex >= 0 || marking) requestPaint()
          onOffsetYChanged: if (hoverIndex >= 0 || marking) requestPaint()
          onCellSizeChanged: if (hoverIndex >= 0 || marking) requestPaint()
          onHoverIndexChanged: requestPaint()
          onMarkingChanged: requestPaint()
          onWidthChanged: requestPaint()
          onHeightChanged: requestPaint()

          Connections {
            target: root
            function onActiveToolChanged() { coverageHoverCanvas.requestPaint() }
          }

          onPaint: {
            var ctx = getContext("2d")
            ctx.clearRect(0, 0, width, height)
            root.drawSameTypeMarkers(ctx, root.grid, cellSize, offsetX, offsetY, width, height)
            root.drawCoverageOverlay(ctx, root.grid, hoverIndex, cellSize, offsetX, offsetY)
          }
        }

        // Sits visually on top of cityCanvas (later sibling = drawn
        // later = on top) but has no MouseArea of its own, so clicks,
        // drags and hover all pass straight through to gridMouse
        // underneath — purely decorative, never in the way.
        Canvas {
          id: trafficCanvas
          anchors.horizontalCenter: parent.horizontalCenter
          width: root.viewportWidth
          height: root.viewportHeight

          // Repainted two ways: the 33ms car-movement timer (below)
          // for actual driving, and immediately on pan/zoom so cars
          // stay locked to the road while dragging — otherwise they
          // sit at a stale screen position for up to 80ms while the
          // tiles underneath track the mouse in real time, which
          // reads as the cars vibrating loose from the road.
          property real offsetX: root.panX
          property real offsetY: root.panY
          property real cellSize: root.effectiveCellSize
          onOffsetXChanged: requestPaint()
          onOffsetYChanged: requestPaint()
          onCellSizeChanged: requestPaint()
          onWidthChanged: requestPaint()
          onHeightChanged: requestPaint()

          onPaint: {
            var ctx = getContext("2d")
            ctx.clearRect(0, 0, width, height)
            var cars = root.cars
            for (var i = 0; i < cars.length; i++) {
              root.drawCar(ctx, cars[i], root.effectiveCellSize, root.panX, root.panY,
                root.gridSize, width, height)
            }
          }
        }

        // A faint blinking bolt/droplet over any built zone tile missing
        // power or water — its own overlay for the same reason traffic
        // gets one: the blink needs to redraw often, and that shouldn't
        // mean redrawing every tile in the viewport just to animate a
        // few small icons.
        // Fires: the one thing on the map that is actively going wrong, so it
        // sits above every other layer and animates regardless of overlay mode.
        Canvas {
          id: fireCanvas
          anchors.horizontalCenter: parent.horizontalCenter
          width: root.viewportWidth
          height: root.viewportHeight
          visible: root.cityBurning || root.crimes.length > 0

          property real offsetX: root.panX
          property real offsetY: root.panY
          property real cellSize: root.effectiveCellSize
          property var fireTiles: root.fires
          property var crimeTiles: root.crimes
          property real phase: 0
          onOffsetXChanged: if (visible) requestPaint()
          onOffsetYChanged: if (visible) requestPaint()
          onCellSizeChanged: requestPaint()
          onFireTilesChanged: requestPaint()
          onCrimeTilesChanged: requestPaint()
          onPhaseChanged: requestPaint()

          // Only runs while something is actually burning — an idle city pays
          // nothing for this layer existing.
          NumberAnimation on phase {
            running: root.active && (root.cityBurning || root.crimes.length > 0)
            loops: Animation.Infinite
            from: 0; to: Math.PI * 2
            duration: 1100
          }

          onPaint: {
            var ctx = getContext("2d")
            ctx.clearRect(0, 0, width, height)
            root.drawCrime(ctx, cellSize, offsetX, offsetY, width, height, phase)
            if (root.cityBurning)
              root.drawFires(ctx, cellSize, offsetX, offsetY, width, height, phase)
          }
        }

        Canvas {
          id: utilityWarningCanvas
          anchors.horizontalCenter: parent.horizontalCenter
          width: root.viewportWidth
          height: root.viewportHeight

          property real offsetX: root.panX
          property real offsetY: root.panY
          property real cellSize: root.effectiveCellSize
          // Bound to the precomputed warning list, not the raw grid — this
          // repaints when the set of flagged tiles actually changes, not on
          // every grid mutation (a road placed on the far side of the city
          // doesn't add or remove any warnings).
          property var warningTiles: root.utilityWarningTiles
          onOffsetXChanged: if (warningTiles.length) requestPaint()
          onOffsetYChanged: if (warningTiles.length) requestPaint()
          onCellSizeChanged: if (warningTiles.length) requestPaint()
          onWarningTilesChanged: requestPaint()
          onWidthChanged: requestPaint()
          onHeightChanged: requestPaint()

          onPaint: {
            var ctx = getContext("2d")
            ctx.clearRect(0, 0, width, height)
            root.drawUtilityWarnings(ctx, cellSize, offsetX, offsetY, width, height)
          }
        }

        // A quick expanding ring, tinted to the zone that just grew, the
        // instant a tile levels up — growth otherwise happens invisibly
        // between ticks, and this is the only cue that it happened at all
        // unless you were already staring at that exact tile.
        Canvas {
          id: growthFlashCanvas
          anchors.horizontalCenter: parent.horizontalCenter
          width: root.viewportWidth
          height: root.viewportHeight

          property real offsetX: root.panX
          property real offsetY: root.panY
          property real cellSize: root.effectiveCellSize
          onOffsetXChanged: if (root.growthFlashes.length || root.highlightIndex >= 0) requestPaint()
          onOffsetYChanged: if (root.growthFlashes.length || root.highlightIndex >= 0) requestPaint()
          onCellSizeChanged: if (root.growthFlashes.length || root.highlightIndex >= 0) requestPaint()
          onWidthChanged: requestPaint()
          onHeightChanged: requestPaint()

          Connections {
            target: root
            function onHighlightIndexChanged() { growthFlashCanvas.requestPaint() }
          }

          onPaint: {
            var ctx = getContext("2d")
            ctx.clearRect(0, 0, width, height)
            var now = Date.now()
            var flashes = root.growthFlashes
            for (var i = 0; i < flashes.length; i++) {
              var f = flashes[i]
              var cx = (f.index % root.gridSize) * cellSize - offsetX + cellSize / 2
              var cy = Math.floor(f.index / root.gridSize) * cellSize - offsetY + cellSize / 2
              root.drawGrowthFlash(ctx, cx, cy, cellSize, f, now)
            }
            // Where the paper just sent you. Fades on its own so it never
            // becomes another thing to dismiss.
            if (root.highlightIndex >= 0) {
              var hx = (root.highlightIndex % root.gridSize) * cellSize - offsetX
              var hy = Math.floor(root.highlightIndex / root.gridSize) * cellSize - offsetY
              ctx.strokeStyle = "rgba(232, 168, 76, 0.95)"
              ctx.lineWidth = Math.max(2, cellSize * 0.09)
              ctx.strokeRect(hx + 1, hy + 1, cellSize - 2, cellSize - 2)
              ctx.strokeStyle = "rgba(232, 168, 76, 0.35)"
              ctx.lineWidth = Math.max(1, cellSize * 0.05)
              ctx.strokeRect(hx - cellSize * 0.25, hy - cellSize * 0.25,
                cellSize * 1.5, cellSize * 1.5)
            }
          }
        }

        // No input handlers: building, inspecting and panning work through the sky.
        Canvas {
          id: ambienceCanvas
          anchors.horizontalCenter: parent.horizontalCenter
          width: root.viewportWidth
          height: root.viewportHeight
          property real offsetX: root.panX
          property real offsetY: root.panY
          property real cellSize: root.effectiveCellSize
          onOffsetXChanged: if (root.skyLife.objects.length) requestPaint()
          onOffsetYChanged: if (root.skyLife.objects.length) requestPaint()
          onCellSizeChanged: if (root.skyLife.objects.length) requestPaint()
          onWidthChanged: requestPaint()
          onHeightChanged: requestPaint()
          onPaint: {
            var ctx = getContext("2d")
            ctx.clearRect(0, 0, width, height)
            Ambience.draw(ctx, root.skyLife, cellSize, offsetX, offsetY, width, height)
          }
        }

        Timer {
          interval: 33
          running: root.active && root.serviceReady
          repeat: true
          property double previousTick: 0
          onRunningChanged: previousTick = 0
          onTriggered: {
            var now = Date.now()
            var dt = previousTick > 0 ? now - previousTick : interval
            root.updateCars(dt, root.grid, root.gridSize)
            var hadSkyLife = root.skyLife.objects.length > 0
            var size = root.effectiveCellSize
            root.skyLife = Ambience.update(root.skyLife, dt, {
              x: root.panX / size, y: root.panY / size,
              width: root.viewportWidth / size, height: root.viewportHeight / size
            }, root.waterRoutes)
            if (hadSkyLife || root.skyLife.objects.length) ambienceCanvas.requestPaint()
            previousTick = now
            trafficCanvas.requestPaint()
          }
        }

        Timer {
          interval: 80
          running: root.active && root.serviceReady
          repeat: true
          onTriggered: {
            root.blinkPhase += interval / 260
            utilityWarningCanvas.requestPaint()

            if (root.growthFlashes.length > 0) {
              var now = Date.now()
              root.growthFlashes = root.growthFlashes.filter(function(f) {
                return now - f.start < root.growthFlashDuration
              })
              growthFlashCanvas.requestPaint()
            }
          }
        }

        // Info tool's result: a small card near the clicked tile rather
        // than a fixed panel elsewhere, so it reads as "about that tile"
        // at a glance. Clamped inside the viewport (not just offset from
        // the tile) so a tile near the edge doesn't push it off-canvas —
        // the same off-canvas-clipping mistake the utility warning icons
        // made early on, worth not repeating here.
        Rectangle {
          id: inspectCard
          visible: root.inspectedInfo !== null
          width: Style.space(196)
          height: inspectColumn.implicitHeight + Style.space(16)
          radius: Style.cornerRadius
          color: Color.menu.background
          border.width: 1
          border.color: Color.menu.border
          z: 5

          readonly property real tileScreenX: root.inspectedIndex >= 0
            ? (root.inspectedIndex % root.gridSize) * root.effectiveCellSize - root.panX : 0
          readonly property real tileScreenY: root.inspectedIndex >= 0
            ? Math.floor(root.inspectedIndex / root.gridSize) * root.effectiveCellSize - root.panY : 0
          x: Math.max(0, Math.min(root.viewportWidth - width, tileScreenX + root.effectiveCellSize + Style.space(6)))
          y: Math.max(0, Math.min(root.viewportHeight - height, tileScreenY))

          Column {
            id: inspectColumn
            anchors.fill: parent
            anchors.margins: Style.space(8)
            spacing: Style.space(3)

            Row {
              width: parent.width
              Text {
                width: parent.width - closeInspect.width
                text: root.inspectTitle(root.inspectedInfo)
                color: Color.menu.text
                font.bold: true
                font.family: root.bar ? root.bar.fontFamily : Style.font.family
                font.pixelSize: Style.font.bodySmall
                elide: Text.ElideRight
              }
              Text {
                id: closeInspect
                text: "✕"
                color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.6)
                font.pixelSize: Style.font.caption
                MouseArea {
                  anchors.fill: parent
                  anchors.margins: -Style.space(4)
                  cursorShape: Qt.PointingHandCursor
                  onClicked: root.inspectedIndex = -1
                }
              }
            }

            Repeater {
              model: root.inspectLines(root.inspectedInfo)
              Text {
                required property string modelData
                width: inspectColumn.width
                text: modelData
                wrapMode: Text.WordWrap
                color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.8)
                font.family: root.bar ? root.bar.fontFamily : Style.font.family
                font.pixelSize: Style.font.caption
              }
            }

            // Name the street. The city generates a plausible name for every
            // road; this is where it stops being the city's and becomes yours,
            // and every letter about it changes wording accordingly.
            Item {
              visible: root.inspectedInfo !== null
                && root.inspectedInfo.type === Model.TILE_ROAD && root.serviceReady
              width: inspectColumn.width
              height: visible ? renameRow.implicitHeight + Style.space(4) : 0
              // A name typed for one road must not be left sitting in the box
              // when the player clicks a different one. Declared here rather
              // than as a handler on root, where the input's id is not in
              // scope and the clearing would silently never happen.
              Connections {
                target: root
                function onInspectedIndexChanged() { streetInput.text = "" }
              }
              Row {
                id: renameRow
                anchors.bottom: parent.bottom
                width: parent.width
                spacing: Style.space(4)
                Rectangle {
                  width: parent.width - renameApply.width - parent.spacing
                  height: streetInput.implicitHeight + Style.space(6)
                  radius: Style.space(3)
                  color: Qt.rgba(0.5, 0.6, 0.6, 0.12)
                  border.width: 1
                  border.color: streetInput.activeFocus ? Color.accent : root.neutralTint(0.3)
                  TextInput {
                    id: streetInput
                    anchors.fill: parent
                    anchors.margins: Style.space(4)
                    verticalAlignment: TextInput.AlignVCenter
                    clip: true
                    maximumLength: Model.STREET_NAME_MAX
                    color: Color.menu.text
                    selectionColor: Color.accent
                    font.family: root.bar ? root.bar.fontFamily : Style.font.family
                    font.pixelSize: Style.font.caption
                    onAccepted: renameApply.apply()
                    Text {
                      anchors.fill: parent
                      verticalAlignment: Text.AlignVCenter
                      visible: streetInput.text === "" && !streetInput.activeFocus
                      text: "Rename this street"
                      color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.4)
                      font.family: streetInput.font.family
                      font.pixelSize: streetInput.font.pixelSize
                    }
                  }
                }
                Button {
                  id: renameApply
                  text: "Name"
                  enabled: root.serviceReady && !root.outOfOffice
                  function apply() {
                    if (!root.serviceReady || root.outOfOffice) return
                    root.cityService.renameStreet(root.inspectedIndex, streetInput.text)
                    streetInput.text = ""
                    streetInput.focus = false
                  }
                  onClicked: apply()
                }
              }
            }
          }
        }
        }
      }

      Text {
        id: toolStatusLabel
        width: parent.width
        horizontalAlignment: Text.AlignHCenter
        text: root.toolStatusText()
        wrapMode: root.detached ? Text.NoWrap : Text.WordWrap
        color: Qt.darker(root.bar ? root.bar.foreground : Color.foreground, 1.45)
        font.family: root.bar ? root.bar.fontFamily : Style.font.family
        font.pixelSize: Style.font.caption
      }
    }
  }

  // Input-transparent overlay outside the Flickable: clamp to the actual
  // view, flip above the pointer near the bottom, and never steal map drags.
  Rectangle {
    id: tileHoverCard
    z: 20
    visible: root.hoveredTileInfo !== null && root.hoveredTileInfo.type !== Model.TILE_EMPTY
    readonly property point pointer: root.mapFromItem(gridMouse, gridMouse.mouseX, gridMouse.mouseY)
    width: Math.max(0, Math.min(Style.space(350), root.width - Style.space(16)))
    height: Math.min(tileHoverText.implicitHeight + Style.space(16), Math.max(0, root.height - Style.space(16)))
    x: Math.max(Style.space(8), Math.min(pointer.x + Style.space(16), root.width - width - Style.space(8)))
    y: Math.max(Style.space(8), Math.min(pointer.y + Style.space(20) + height <= root.height - Style.space(8)
      ? pointer.y + Style.space(20) : pointer.y - height - Style.space(12), root.height - height - Style.space(8)))
    color: Color.menu.background
    border.color: Color.menu.border
    radius: Style.space(6)
    clip: true
    Text {
      id: tileHoverText
      x: Style.space(8); y: Style.space(8)
      width: parent.width - Style.space(16)
      text: root.hoveredTileInfo ? root.inspectTitle(root.hoveredTileInfo)
        + "\n" + root.inspectLines(root.hoveredTileInfo).join("\n") : ""
      textFormat: Text.PlainText
      wrapMode: Text.WordWrap
      color: Color.menu.text
      font.family: Style.font.family
      font.pixelSize: Style.font.caption
    }
  }

  // Floats above the Flickable (declared after it, so it's on top and
  // unaffected by scroll position) rather than living inside the Column,
  // since a dropdown menu that scrolled away with the content would be
  // useless the moment the map pushed it out of view.
  Item {
    anchors.fill: parent
    visible: root.gameMenuOpen || root.confirmNewGameOpen || root.settingsOpen || root.budgetOpen || root.advisorsOpen || root.overlayMenuOpen || root.historyOpen || root.goalOpen || root.marketOpen || root.residentsOpen || root.gazetteOpen || (root.awaySummaryOpen && root.unseenEvents.length > 0)

    MouseArea {
      anchors.fill: parent
      visible: root.gameMenuOpen || root.settingsOpen || root.budgetOpen || root.advisorsOpen || root.overlayMenuOpen || root.historyOpen || root.goalOpen || root.marketOpen || root.residentsOpen || root.gazetteOpen
      onClicked: { root.gameMenuOpen = false; root.settingsOpen = false; root.budgetOpen = false; root.advisorsOpen = false; root.overlayMenuOpen = false; root.historyOpen = false; root.goalOpen = false; root.marketOpen = false; root.residentsOpen = false; root.gazetteOpen = false }
    }

    Rectangle {
      id: gameMenuCard
      visible: root.gameMenuOpen
      anchors.top: parent.top
      anchors.left: parent.left
      anchors.topMargin: Style.space(38)
      anchors.leftMargin: Style.space(2)
      width: Style.space(150)
      height: menuColumn.implicitHeight + Style.space(10)
      radius: Style.cornerRadius
      color: Color.menu.background
      border.width: 1
      border.color: Color.menu.border

      Column {
        id: menuColumn
        anchors.fill: parent
        anchors.margins: Style.space(5)
        spacing: Style.space(1)

        Repeater {
          model: root.gameMenuItems

          Rectangle {
            id: menuRow
            required property var modelData
            readonly property bool heading: menuRow.modelData.heading === true
            width: menuColumn.width
            height: heading ? Style.space(11) : Style.space(26)
            radius: Style.space(3)
            color: menuRowMouse.containsMouse && modelData.enabled
              ? Color.menu.selectedBackground : "transparent"

            // A plain rule, centred in its own short row: everything above it
            // acts on the city, everything below it on the game. A named
            // heading was tried here first and read as cramped — at caption
            // size beside full-size items it looked like a broken entry
            // rather than a divider.
            Rectangle {
              visible: menuRow.heading
              anchors.left: parent.left
              anchors.right: parent.right
              anchors.leftMargin: Style.space(6)
              anchors.rightMargin: Style.space(6)
              anchors.verticalCenter: parent.verticalCenter
              height: 1
              color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.18)
            }

            Text {
              anchors.left: parent.left
              anchors.right: parent.right
              anchors.leftMargin: Style.space(8)
              anchors.verticalCenter: parent.verticalCenter
              visible: !menuRow.heading
              text: menuRow.modelData.label
              color: menuRow.modelData.enabled
                ? (menuRowMouse.containsMouse ? Color.menu.selectedText : Color.menu.text)
                : Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.4)
              font.family: root.bar ? root.bar.fontFamily : Style.font.family
              font.pixelSize: Style.font.bodySmall
            }

            Text {
              // A heading is disabled by construction, not "coming soon".
              visible: !menuRow.modelData.enabled && !menuRow.heading
              anchors.right: parent.right
              anchors.rightMargin: Style.space(8)
              anchors.verticalCenter: parent.verticalCenter
              text: "soon"
              color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.35)
              font.family: root.bar ? root.bar.fontFamily : Style.font.family
              font.pixelSize: Style.font.caption
            }

            MouseArea {
              id: menuRowMouse
              anchors.fill: parent
              hoverEnabled: true
              enabled: menuRow.modelData.enabled
              cursorShape: Qt.PointingHandCursor
              onClicked: root.activateGameMenuItem(menuRow.modelData.action)
            }
          }
        }
      }
    }

    // Settings: today, just event frequency — a preference the game menu's
    // doc comment always meant to hold, not a placeholder like Save Game.
    Rectangle {
      id: settingsCard
      visible: root.settingsOpen
      anchors.centerIn: parent
      width: Math.min(parent.width - Style.space(32), Style.space(320))
      height: settingsColumn.implicitHeight + Style.space(28)
      radius: Style.cornerRadius
      color: Color.menu.background
      border.width: 1
      border.color: Color.menu.border

      // Swallow clicks so they don't fall through to the outside-click
      // dismiss MouseArea behind this card.
      MouseArea { anchors.fill: parent }

      Column {
        id: settingsColumn
        anchors.fill: parent
        anchors.margins: Style.space(16)
        spacing: Style.space(12)

        Text {
          text: "Settings"
          color: Color.menu.text
          font.bold: true
          font.family: root.bar ? root.bar.fontFamily : Style.font.family
          font.pixelSize: Style.font.body
        }

        Text {
          text: "Town name"
          color: Color.menu.text
          font.pixelSize: Style.font.bodySmall
        }
        Rectangle {
          width: parent.width
          height: Style.space(34)
          radius: Style.space(4)
          color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.06)
          border.color: townNameInput.activeFocus ? Color.accent : Color.menu.border
          TextInput {
            id: townNameInput
            anchors.fill: parent
            anchors.margins: Style.space(7)
            color: Color.menu.text
            selectionColor: Color.accent
            font.family: Style.font.family
            font.pixelSize: Style.font.bodySmall
            maximumLength: 40
            clip: true
            selectByMouse: true
            onAccepted: if (root.serviceReady && root.cityService.renameCity(text)) root.settingsOpen = false
            Keys.onEscapePressed: { root.settingsOpen = false; event.accepted = true }
          }
        }
        Row {
          spacing: Style.space(8)
          Button {
            text: "Save name"
            enabled: root.serviceReady && townNameInput.text.trim().length > 0
            onClicked: if (root.cityService.renameCity(townNameInput.text)) root.settingsOpen = false
          }
          Button { text: "Cancel"; onClicked: root.settingsOpen = false }
        }

        Column {
          width: parent.width
          spacing: Style.space(6)

          Text {
            text: "Mayor's dilemma frequency"
            color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.8)
            font.family: root.bar ? root.bar.fontFamily : Style.font.family
            font.pixelSize: Style.font.bodySmall
          }

          Row {
            width: parent.width
            spacing: Style.space(6)

            Repeater {
              model: root.serviceReady ? root.cityService.eventFrequencyOptions : []

              Rectangle {
                id: freqOption
                required property var modelData
                readonly property bool active: root.serviceReady
                  && root.cityService.eventFrequency === modelData.value
                width: (settingsColumn.width - Style.space(18)) / 4
                height: Style.space(28)
                radius: Style.space(4)
                color: active ? Qt.rgba(Color.accent.r, Color.accent.g, Color.accent.b, 0.35) : "transparent"
                border.width: 1
                border.color: active ? Color.accent : Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.3)

                Text {
                  anchors.centerIn: parent
                  text: freqOption.modelData.label
                  color: freqOption.active ? Color.accent : Color.menu.text
                  font.family: root.bar ? root.bar.fontFamily : Style.font.family
                  font.pixelSize: Style.font.caption
                }

                MouseArea {
                  anchors.fill: parent
                  cursorShape: Qt.PointingHandCursor
                  onClicked: if (root.cityService) root.cityService.setEventFrequency(freqOption.modelData.value)
                }
              }
            }
          }

          Text {
            width: parent.width
            text: "How often the mayor faces a decision — pick \"Off\" for no dilemmas at all."
            wrapMode: Text.WordWrap
            color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.5)
            font.family: root.bar ? root.bar.fontFamily : Style.font.family
            font.pixelSize: Style.font.caption
          }
        }

        // Desktop popups only. Deliberately not "notifications" — everything
        // else about them carries on, and a setting that read as switching the
        // city's news off would be describing something it does not do.
        Column {
          width: parent.width
          spacing: Style.space(6)

          Text {
            text: "Desktop popups"
            color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.8)
            font.family: root.bar ? root.bar.fontFamily : Style.font.family
            font.pixelSize: Style.font.bodySmall
          }

          Row {
            width: parent.width
            spacing: Style.space(6)

            Repeater {
              model: [{ label: "On", value: true }, { label: "Off", value: false }]

              Rectangle {
                id: popupOption
                required property var modelData
                readonly property bool active: root.serviceReady
                  && root.cityService.popupNotifications === modelData.value
                width: (settingsColumn.width - Style.space(6)) / 2
                height: Style.space(28)
                radius: Style.space(4)
                color: active ? Qt.rgba(Color.accent.r, Color.accent.g, Color.accent.b, 0.35) : "transparent"
                border.width: 1
                border.color: active ? Color.accent : Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.3)

                Text {
                  anchors.centerIn: parent
                  text: popupOption.modelData.label
                  color: popupOption.active ? Color.accent : Color.menu.text
                  font.family: root.bar ? root.bar.fontFamily : Style.font.family
                  font.pixelSize: Style.font.caption
                }
                MouseArea {
                  anchors.fill: parent
                  cursorShape: Qt.PointingHandCursor
                  onClicked: if (root.cityService)
                    root.cityService.setPopupNotifications(popupOption.modelData.value)
                }
              }
            }
          }

          Text {
            width: parent.width
            text: "Turns off the pop-ups your desktop shows. The city still logs "
              + "everything, the unseen markers still appear, and the Gazette still "
              + "reports it — you just find out when you look."
            wrapMode: Text.WordWrap
            color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.5)
            font.family: root.bar ? root.bar.fontFamily : Style.font.family
            font.pixelSize: Style.font.caption
          }
        }
      }
    }

    // Who lives here. The roster the mayor can actually read: every named
    // resident, oldest tenancy first, with what they do, how long they have
    // been here and whether they are about to give up on the place. Clicking
    // one goes and stands outside their house.
    Rectangle {
      id: residentsCard
      visible: root.residentsOpen
      anchors.centerIn: parent
      width: Math.min(parent.width - Style.space(24), Style.space(400))
      height: Math.min(parent.height - Style.space(24),
        residentsColumn.implicitHeight + Style.space(28))
      radius: Style.cornerRadius
      color: Color.menu.background
      border.width: 1
      border.color: Color.menu.border

      MouseArea { anchors.fill: parent }

      Flickable {
        anchors.fill: parent
        anchors.margins: Style.space(16)
        contentHeight: residentsColumn.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds

        Column {
          id: residentsColumn
          width: parent.width
          spacing: Style.space(8)

          Text {
            text: "Residents"
            color: Color.menu.text
            font.bold: true
            font.family: root.bar ? root.bar.fontFamily : Style.font.family
            font.pixelSize: Style.font.body
          }
          Text {
            width: parent.width
            wrapMode: Text.WordWrap
            text: root.residents.length > 0
              ? "The people this office knows by name, longest-standing first. "
                + "Click one to go to their street."
              : "Nobody is known here by name yet. A city of a few hundred is "
                + "still small enough to be a list of buildings."
            color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.6)
            font.family: root.bar ? root.bar.fontFamily : Style.font.family
            font.pixelSize: Style.font.caption
          }

          Repeater {
            model: root.residents
            Rectangle {
              required property var modelData
              width: residentsColumn.width
              height: Math.max(personColumn.implicitHeight + Style.space(12), Style.space(46))
              radius: Style.cornerRadius
              color: personMouse.containsMouse
                ? Qt.rgba(0.5, 0.6, 0.6, 0.14) : Qt.rgba(0.5, 0.6, 0.6, 0.06)
              border.width: 1
              border.color: modelData.grievance !== ""
                ? Qt.rgba(0.88, 0.62, 0.22, 0.45) : root.neutralTint(0.2)

              Image {
                id: tradeVignette
                visible: root.tradeArt && status === Image.Ready
                x: Style.space(8)
                anchors.verticalCenter: parent.verticalCenter
                width: Style.space(38)
                height: width
                fillMode: Image.PreserveAspectFit
                smooth: true
                source: root.tradeArt
                  ? Qt.resolvedUrl("assets/trades/trade-" + modelData.tradeKind + ".png") : ""
                opacity: 0.92
              }
              Column {
                id: personColumn
                x: tradeVignette.visible
                  ? tradeVignette.x + tradeVignette.width + Style.space(8) : Style.space(9)
                y: Style.space(6)
                width: parent.width - personColumn.x - Style.space(9)
                spacing: Style.space(1)
                Text {
                  width: parent.width
                  elide: Text.ElideRight
                  text: modelData.name + ", " + modelData.age
                  color: Color.menu.text
                  font.bold: true
                  font.family: root.bar ? root.bar.fontFamily : Style.font.family
                  font.pixelSize: Style.font.bodySmall
                }
                Text {
                  width: parent.width
                  wrapMode: Text.WordWrap
                  text: Model.capitalise(modelData.trade) + ", of " + modelData.street
                    + " · here since Year " + modelData.arrivedYear
                    + (modelData.yearsHere >= 1 ? " (" + modelData.yearsHere + " years)" : "")
                  color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.66)
                  font.family: root.bar ? root.bar.fontFamily : Style.font.family
                  font.pixelSize: Style.font.caption
                }
                Text {
                  visible: modelData.grievance !== ""
                  width: parent.width
                  wrapMode: Text.WordWrap
                  text: "“" + modelData.complaint + "”"
                  color: "#e4bd78"
                  font.italic: true
                  font.family: root.bar ? root.bar.fontFamily : Style.font.family
                  font.pixelSize: Style.font.caption
                }
                // Only worth saying when it is nearly too late to act on.
                Text {
                  visible: modelData.grievance !== ""
                    && modelData.patience <= Math.ceil(Model.CITIZEN_PATIENCE / 2)
                  width: parent.width
                  text: "Packing: " + modelData.patience
                    + (modelData.patience === 1 ? " month left" : " months left")
                  color: "#e0806a"
                  font.family: root.bar ? root.bar.fontFamily : Style.font.family
                  font.pixelSize: Style.font.caption
                }
              }
              MouseArea {
                id: personMouse
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: {
                  root.residentsOpen = false
                  root.goToTile(modelData.index)
                }
              }
            }
          }
        }
      }
    }

    // The Gazette. Deliberately the one screen that does not look like the
    // rest of the game: everything else is warm pixel art seen from above,
    // this is meant to read as a physical object from inside the world — ink
    // pressed into cheap paper. Its own palette and its own serif, on purpose.
    Rectangle {
      id: gazetteCard
      visible: root.gazetteOpen
      anchors.centerIn: parent
      width: Math.min(parent.width - Style.space(20), Style.space(430))
      height: Math.min(parent.height - Style.space(20),
        gazetteColumn.implicitHeight + Style.space(24))
      color: "#efe7d4"
      border.width: 1
      border.color: "#8a7f6a"
      radius: Style.space(2)

      readonly property color ink: "#221e18"
      readonly property color faded: "#5f5648"
      readonly property color rule: "#8a7f6a"
      readonly property var page: root.gazettePage

      Flickable {
        anchors.fill: parent
        anchors.margins: Style.space(12)
        contentHeight: gazetteColumn.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds

        Column {
          id: gazetteColumn
          width: parent.width
          spacing: Style.space(5)

          // Masthead: the engraving carries the top third as sky, so the
          // title is drawn over it rather than beside it.
          Item {
            width: parent.width
            height: Math.max(mastheadTitle.implicitHeight + Style.space(6),
              mastheadArt.status === Image.Ready ? width * 0.25 : 0)
            Image {
              id: mastheadArt
              anchors.fill: parent
              source: root.gazetteArt ? Qt.resolvedUrl("assets/gazette/masthead.png") : ""
              fillMode: Image.PreserveAspectFit
              visible: status === Image.Ready
              opacity: 0.85
              smooth: true
            }
            Text {
              id: mastheadTitle
              anchors.top: parent.top
              anchors.horizontalCenter: parent.horizontalCenter
              width: parent.width
              horizontalAlignment: Text.AlignHCenter
              text: gazetteCard.page ? gazetteCard.page.title : ""
              elide: Text.ElideRight
              color: gazetteCard.ink
              font.family: root.gazetteSerif
              font.pixelSize: Style.font.subtitle + Style.space(4)
              font.bold: true
            }
          }
          Rectangle { width: parent.width; height: 2; color: gazetteCard.rule }
          Rectangle { width: parent.width; height: 1; color: gazetteCard.rule }
          Text {
            width: parent.width
            horizontalAlignment: Text.AlignHCenter
            text: gazetteCard.page
              ? "Vol. " + gazetteCard.page.volume + " · No. " + gazetteCard.page.number
                + " · " + gazetteCard.page.dateline + " · " + gazetteCard.page.mayor
              : ""
            elide: Text.ElideRight
            color: gazetteCard.faded
            font.family: root.gazetteSerif
            font.pixelSize: Style.font.caption
          }
          Text {
            visible: text !== ""
            width: parent.width
            horizontalAlignment: Text.AlignHCenter
            text: gazetteCard.page ? gazetteCard.page.standing : ""
            elide: Text.ElideRight
            color: gazetteCard.ink
            font.family: root.gazetteSerif
            font.italic: true
            font.pixelSize: Style.font.caption
          }
          Rectangle { width: parent.width; height: 1; color: gazetteCard.rule }
          Item { width: 1; height: Style.space(2) }

          // A quiet stretch is worth printing too. An idle game that says
          // nothing happened is telling the truth.
          Text {
            visible: gazetteCard.page && gazetteCard.page.quiet
            width: parent.width
            horizontalAlignment: Text.AlignHCenter
            text: gazetteCard.page ? gazetteCard.page.quietNote : ""
            wrapMode: Text.WordWrap
            color: gazetteCard.faded
            font.family: root.gazetteSerif
            font.italic: true
            font.pixelSize: Style.font.bodySmall
          }

          // The leader column. Boxed and labelled, because it is the one part
          // of the page that is an opinion rather than a report — and it is an
          // opinion about the reader.
          Rectangle {
            visible: gazetteCard.page && gazetteCard.page.editorial !== null
            width: parent.width
            height: visible ? editorialColumn.implicitHeight + Style.space(14) : 0
            color: "transparent"
            border.width: 1
            border.color: gazetteCard.rule

            Column {
              id: editorialColumn
              x: Style.space(8)
              y: Style.space(7)
              width: parent.width - Style.space(16)
              spacing: Style.space(2)
              Text {
                text: gazetteCard.page && gazetteCard.page.editorial
                  && gazetteCard.page.editorial.bought ? "OPINION · A NOTICE FROM THE PROPRIETORS"
                  : "OPINION"
                color: gazetteCard.faded
                font.family: root.gazetteSerif
                font.pixelSize: Style.font.caption
                font.bold: true
              }
              Text {
                width: parent.width
                text: gazetteCard.page && gazetteCard.page.editorial
                  ? gazetteCard.page.editorial.headline : ""
                wrapMode: Text.WordWrap
                color: gazetteCard.ink
                font.family: root.gazetteSerif
                font.bold: true
                font.pixelSize: Style.font.bodySmall
              }
              Text {
                width: parent.width
                text: gazetteCard.page && gazetteCard.page.editorial
                  ? gazetteCard.page.editorial.body : ""
                wrapMode: Text.WordWrap
                color: gazetteCard.ink
                font.family: root.gazetteSerif
                font.pixelSize: Style.font.caption
              }
            }
          }
          Item { width: 1; height: Style.space(2) }

          GazetteStory {
            visible: gazetteCard.page && gazetteCard.page.lead !== null
            width: parent.width
            story: gazetteCard.page ? gazetteCard.page.lead : null
            lead: true
            art: root.gazetteArt
            serif: root.gazetteSerif
            ink: gazetteCard.ink
            faded: gazetteCard.faded
          }
          Repeater {
            model: gazetteCard.page ? gazetteCard.page.stories : []
            Column {
              required property var modelData
              width: gazetteColumn.width
              spacing: Style.space(5)
              Rectangle { width: parent.width; height: 1; color: gazetteCard.rule; opacity: 0.6 }
              GazetteStory {
                width: parent.width
                story: parent.modelData
                art: root.gazetteArt
                serif: root.gazetteSerif
                ink: gazetteCard.ink
                faded: gazetteCard.faded
              }
            }
          }

          // The letters column. The one place in the game that says *where*
          // something is wrong rather than what percentage of the city it
          // affects — and the reason to name residents at all.
          Column {
            visible: gazetteCard.page && gazetteCard.page.letters.length > 0
            width: parent.width
            spacing: Style.space(4)
            Item { width: 1; height: Style.space(2) }
            Rectangle { width: parent.width; height: 1; color: gazetteCard.rule }
            Text {
              text: "LETTERS TO THE EDITOR"
              color: gazetteCard.faded
              font.family: root.gazetteSerif
              font.pixelSize: Style.font.caption
              font.bold: true
            }
            Repeater {
              model: gazetteCard.page ? gazetteCard.page.letters : []
              Column {
                required property var modelData
                width: gazetteColumn.width
                spacing: Style.space(1)
                Text {
                  width: parent.width
                  text: "“" + modelData.text + "”"
                  wrapMode: Text.WordWrap
                  color: gazetteCard.ink
                  font.family: root.gazetteSerif
                  font.italic: true
                  font.pixelSize: Style.font.caption
                }
                Text {
                  id: signature
                  width: parent.width
                  horizontalAlignment: Text.AlignRight
                  // Clickable: the point of naming the street is being able to
                  // go and look at it. Closes the paper and takes the map there.
                  text: "— " + modelData.name + ", " + modelData.street
                    + (modelData.index >= 0 ? "  ›" : "")
                  color: signatureMouse.containsMouse ? Color.accent : gazetteCard.faded
                  font.family: root.gazetteSerif
                  font.pixelSize: Style.font.caption
                  MouseArea {
                    id: signatureMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: {
                      root.gazetteOpen = false
                      root.goToTile(modelData.index)
                    }
                  }
                }
                Item { width: 1; height: Style.space(3) }
              }
            }
          }

          // Deaths. An idle game's one unrepeatable asset is that it has
          // genuinely been running since Year 94, and somebody has genuinely
          // lived on Mill Road the whole time. This is where that is spent.
          Column {
            visible: gazetteCard.page && gazetteCard.page.obituaries.length > 0
            width: parent.width
            spacing: Style.space(3)
            Item { width: 1; height: Style.space(2) }
            Rectangle { width: parent.width; height: 1; color: gazetteCard.rule }
            Text {
              text: "DEATHS"
              color: gazetteCard.faded
              font.family: root.gazetteSerif
              font.pixelSize: Style.font.caption
              font.bold: true
            }
            Repeater {
              model: gazetteCard.page ? gazetteCard.page.obituaries : []
              Text {
                required property var modelData
                width: gazetteColumn.width
                text: modelData
                wrapMode: Text.WordWrap
                color: gazetteCard.ink
                font.family: root.gazetteSerif
                font.pixelSize: Style.font.caption
              }
            }
          }

          Item { width: 1; height: Style.space(2) }
          Rectangle { width: parent.width; height: 1; color: gazetteCard.rule }
          Text {
            width: parent.width
            text: "BY THE NUMBERS"
            color: gazetteCard.faded
            font.family: root.gazetteSerif
            font.pixelSize: Style.font.caption
            font.bold: true
          }
          Grid {
            width: parent.width
            columns: 2
            columnSpacing: Style.space(10)
            rowSpacing: Style.space(2)
            Repeater {
              model: gazetteCard.page ? gazetteCard.page.figures : []
              Text {
                required property var modelData
                width: (gazetteColumn.width - Style.space(10)) / 2
                text: modelData.label + " — "
                  + (modelData.money ? Model.money(modelData.value)
                     : Model.groupDigits(modelData.value) + (modelData.suffix || ""))
                  + (modelData.change
                     ? "  (" + (modelData.change > 0 ? "+" : "−")
                       + (modelData.moneyChange
                          ? Model.money(Math.abs(modelData.change))
                          : Model.groupDigits(Math.abs(modelData.change)))
                       + " on the year)"
                     : "")
                elide: Text.ElideRight
                color: gazetteCard.ink
                font.family: root.gazetteSerif
                font.pixelSize: Style.font.caption
              }
            }
          }
          Rectangle { width: parent.width; height: 1; color: gazetteCard.rule }
          Text {
            width: parent.width
            text: "THE ALMANAC — " + (gazetteCard.page ? gazetteCard.page.almanac : "")
            wrapMode: Text.WordWrap
            color: gazetteCard.faded
            font.family: root.gazetteSerif
            font.italic: true
            font.pixelSize: Style.font.caption
          }
          Item { width: 1; height: Style.space(4) }
          Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: "— close —"
            color: gazetteCard.faded
            font.family: root.gazetteSerif
            font.pixelSize: Style.font.caption
            MouseArea {
              anchors.fill: parent
              anchors.margins: -Style.space(8)
              cursorShape: Qt.PointingHandCursor
              onClicked: root.gazetteOpen = false
            }
          }
        }
      }
    }

    // "While you were away": the city keeps running with the panel shut, and
    // since fires can destroy buildings unattended, coming back to a silently
    // changed city was the gap this closes.
    Rectangle {
      id: awayCard
      visible: root.awaySummaryOpen && root.unseenEvents.length > 0
      anchors.centerIn: parent
      width: Math.min(parent.width - Style.space(32), Style.space(360))
      height: awayColumn.implicitHeight + Style.space(28)
      radius: Style.cornerRadius
      color: Color.menu.background
      border.width: 1
      border.color: Color.accent

      MouseArea { anchors.fill: parent }

      Column {
        id: awayColumn
        anchors.fill: parent
        anchors.margins: Style.space(16)
        spacing: Style.space(8)

        Text {
          text: "While you were away"
          color: Color.menu.text
          font.bold: true
          font.family: root.bar ? root.bar.fontFamily : Style.font.family
          font.pixelSize: Style.font.body
        }

        Repeater {
          model: root.unseenEvents

          Row {
            id: awayRow
            required property var modelData
            width: awayColumn.width
            spacing: Style.space(6)

            Rectangle {
              width: Style.space(5); height: Style.space(5)
              radius: width / 2
              anchors.verticalCenter: parent.verticalCenter
              color: awayRow.modelData.kind === "loss" || awayRow.modelData.kind === "brownout"
                ? "#e0806a" : awayRow.modelData.kind === "milestone" ? "#7fbf7f" : Color.accent
            }
            Text {
              text: Model.calendarFor(awayRow.modelData.m).monthName.substring(0, 3)
                + " " + Model.calendarFor(awayRow.modelData.m).year
              color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.4)
              font.family: root.bar ? root.bar.fontFamily : Style.font.family
              font.pixelSize: Style.font.caption
            }
            Text {
              width: awayRow.width - Style.space(120)
              text: awayRow.modelData.text
              wrapMode: Text.WordWrap
              color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.85)
              font.family: root.bar ? root.bar.fontFamily : Style.font.family
              font.pixelSize: Style.font.caption
            }
          }
        }

        Row {
          spacing: Style.space(8)
          Button { text: "Got it"; onClicked: root.acknowledgeAway() }
          Button {
            text: "Open history"
            onClicked: { root.acknowledgeAway(); root.historyOpen = true }
          }
        }
      }
    }

    // History: what the city has actually done over time, and what happened
    // while nobody was looking. The city has real tradeoffs now — funding
    // against safety, tax against happiness — and a snapshot cannot tell you
    // whether one of them paid off.
    Rectangle {
      id: historyCard
      visible: root.historyOpen
      anchors.centerIn: parent
      width: Math.min(parent.width - Style.space(32), Style.space(400))
      height: Math.min(parent.height - Style.space(32), historyColumn.implicitHeight + Style.space(28))
      radius: Style.cornerRadius
      color: Color.menu.background
      border.width: 1
      border.color: Color.menu.border

      MouseArea { anchors.fill: parent }

      Flickable {
        anchors.fill: parent
        anchors.margins: Style.space(16)
        contentHeight: historyColumn.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds

        Column {
          id: historyColumn
          width: parent.width
          spacing: Style.space(10)

          Text {
            text: "History"
            color: Color.menu.text
            font.bold: true
            font.family: root.bar ? root.bar.fontFamily : Style.font.family
            font.pixelSize: Style.font.body
          }

          Text {
            width: parent.width
            visible: root.cityHistory.length < 2
            text: "Not enough history yet — the city is sampled every few months."
            wrapMode: Text.WordWrap
            color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.5)
            font.family: root.bar ? root.bar.fontFamily : Style.font.family
            font.pixelSize: Style.font.caption
          }

          Repeater {
            model: root.cityHistory.length >= 2 ? [
              { field: "p", label: "Population", stroke: "#7fbf7f", fill: "rgba(127,191,127,0.16)" },
              { field: "t", label: "Treasury", stroke: "#e0b45a", fill: "rgba(224,180,90,0.16)" },
              { field: "h", label: "Happiness", stroke: "#6fa8dc", fill: "rgba(111,168,220,0.16)" }
            ] : []

            Column {
              id: graphRow
              required property var modelData
              width: historyColumn.width
              spacing: Style.space(2)

              Row {
                width: parent.width
                Text {
                  text: graphRow.modelData.label
                  color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.65)
                  font.family: root.bar ? root.bar.fontFamily : Style.font.family
                  font.pixelSize: Style.font.caption
                }
                Item { width: graphRow.width - 220; height: 1 }
                Text {
                  // Where it started against where it is now: the whole
                  // question a graph like this is asked to answer.
                  text: {
                    var h = root.cityHistory
                    if (h.length < 2) return ""
                    var first = h[0][graphRow.modelData.field]
                    var last = h[h.length - 1][graphRow.modelData.field]
                    var delta = last - first
                    return first + " → " + last
                      + "  (" + (delta >= 0 ? "+" : "−") + Math.abs(delta) + ")"
                  }
                  color: Color.menu.text
                  font.family: root.bar ? root.bar.fontFamily : Style.font.family
                  font.pixelSize: Style.font.caption
                }
              }

              Canvas {
                width: historyColumn.width
                height: Style.space(44)
                property var series: root.cityHistory
                onSeriesChanged: requestPaint()
                onWidthChanged: requestPaint()
                onPaint: {
                  var ctx = getContext("2d")
                  ctx.clearRect(0, 0, width, height)
                  root.drawSparkline(ctx, root.cityHistory, graphRow.modelData.field,
                    width, height, graphRow.modelData.stroke, graphRow.modelData.fill)
                }
              }
            }
          }

          Rectangle {
            width: parent.width; height: 1
            visible: root.cityLog.length > 0
            color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.15)
          }

          Text {
            visible: root.cityLog.length > 0
            text: "City log"
            color: Color.menu.text
            font.bold: true
            font.family: root.bar ? root.bar.fontFamily : Style.font.family
            font.pixelSize: Style.font.bodySmall
          }

          Repeater {
            model: root.cityLog

            Row {
              id: logRow
              required property var modelData
              required property int index
              width: historyColumn.width
              spacing: Style.space(6)

              // Anything logged after the player last looked is still news.
              readonly property bool unseen: root.serviceReady
                && logRow.modelData.m > root.cityService.lastSeenMinute

              Rectangle {
                width: Style.space(5); height: Style.space(5)
                radius: width / 2
                anchors.verticalCenter: parent.verticalCenter
                color: logRow.unseen ? Color.accent : "transparent"
              }
              Text {
                text: Model.calendarFor(logRow.modelData.m).monthName.substring(0, 3)
                  + " " + Model.calendarFor(logRow.modelData.m).year
                color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.4)
                font.family: root.bar ? root.bar.fontFamily : Style.font.family
                font.pixelSize: Style.font.caption
              }
              Text {
                width: logRow.width - Style.space(120)
                text: logRow.modelData.text
                elide: Text.ElideRight
                color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b,
                  logRow.unseen ? 0.95 : 0.6)
                font.family: root.bar ? root.bar.fontFamily : Style.font.family
                font.pixelSize: Style.font.caption
              }
            }
          }

          Button { text: "Done"; onClicked: root.historyOpen = false }
        }
      }
    }

    // Stakes in the neighbouring towns. Money here is money the treasury does
    // not have — the trade-off is the mechanic, so the card leads with what is
    // committed rather than with what it might be worth.
    Rectangle {
      id: marketCard
      visible: root.marketOpen
      anchors.centerIn: parent
      width: Math.min(parent.width - Style.space(32), Style.space(460))
      height: Math.min(parent.height - Style.space(32), marketColumn.implicitHeight + Style.space(28))
      radius: Style.cornerRadius
      color: Color.menu.background
      border.width: 1
      border.color: Color.menu.border

      MouseArea { anchors.fill: parent }

      Flickable {
        anchors.fill: parent
        anchors.margins: Style.space(16)
        contentHeight: marketColumn.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds

        Column {
          id: marketColumn
          width: parent.width
          spacing: Style.space(8)

          Text {
            text: "Neighbouring towns"
            color: Color.menu.text
            font.bold: true
            font.family: root.bar ? root.bar.fontFamily : Style.font.family
            font.pixelSize: Style.font.body
          }

          Text {
            width: parent.width
            wrapMode: Text.WordWrap
            text: root.serviceReady
              ? "Invested " + Model.money(root.cityService.portfolioCost)
                + " · now worth " + Model.money(root.cityService.portfolioValue)
                + ". This money is not in the treasury: if the city cannot pay its "
                + "bills it will be sold at a loss to cover the gap."
              : ""
            color: root.serviceReady && root.cityService.portfolioValue < root.cityService.portfolioCost
              ? "#e0806a" : Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.6)
            font.family: root.bar ? root.bar.fontFamily : Style.font.family
            font.pixelSize: Style.font.caption
          }

          Repeater {
            model: root.serviceReady ? root.cityService.marketQuotes : []

            Rectangle {
              id: townRow
              required property var modelData
              width: marketColumn.width
              height: townText.implicitHeight + Style.space(14)
              radius: Style.space(4)
              color: townRow.modelData.units > 0
                ? Qt.rgba(Color.accent.r, Color.accent.g, Color.accent.b, 0.10) : "transparent"
              border.width: 1
              border.color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.18)
              opacity: root.outOfOffice ? 0.45 : 1

              Column {
                id: townText
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.margins: Style.space(8)
                anchors.verticalCenter: parent.verticalCenter
                spacing: Style.space(2)

                Item {
                  width: parent.width
                  height: townName.implicitHeight
                  Text {
                    id: townName
                    anchors.left: parent.left
                    text: townRow.modelData.name
                      + " · " + Model.groupDigits(townRow.modelData.population)
                      + (townRow.modelData.connected ? " · linked" : "")
                    color: townRow.modelData.larger ? "#e4bd78" : Color.menu.text
                    font.family: root.bar ? root.bar.fontFamily : Style.font.family
                    font.pixelSize: Style.font.caption
                  }
                  Text {
                    anchors.right: parent.right
                    text: "$" + townRow.modelData.price.toFixed(2)
                      + (townRow.modelData.price >= townRow.modelData.previous ? "  \u25b2" : "  \u25bc")
                    color: townRow.modelData.price >= townRow.modelData.previous ? "#7fbf7f" : "#e0806a"
                    font.family: root.bar ? root.bar.fontFamily : Style.font.family
                    font.pixelSize: Style.font.caption
                  }
                }

                Text {
                  width: parent.width
                  wrapMode: Text.WordWrap
                  text: townRow.modelData.temperament
                    + (townRow.modelData.connected
                        ? " · linked: trades with you and competes with you"
                        : " · unconnected, moves on its own")
                    + (townRow.modelData.larger
                        ? "\nLarger than " + (root.serviceReady ? root.cityService.cityName : "this city")
                          + (townRow.modelData.connected
                              ? " — taking custom and residents" : "")
                        : "")
                    + (townRow.modelData.units > 0
                        ? "\nHolding $" + Math.round(townRow.modelData.value)
                          + " (" + (townRow.modelData.gain >= 0 ? "+" : "\u2212") + "$"
                          + Math.abs(Math.round(townRow.modelData.gain)) + ")"
                        : "")
                  color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.55)
                  font.family: root.bar ? root.bar.fontFamily : Style.font.family
                  font.pixelSize: Style.font.caption
                }

                Row {
                  spacing: Style.space(6)
                  Button {
                    text: "Buy $1k"
                    enabled: !root.outOfOffice && root.serviceReady
                      && root.treasury > 1000 + Model.TREASURY_FLOOR
                    onClicked: root.cityService.buyStake(townRow.modelData.id, 1000)
                  }
                  Button {
                    text: "Buy $10k"
                    enabled: !root.outOfOffice && root.serviceReady
                      && root.treasury > 10000 + Model.TREASURY_FLOOR
                    onClicked: root.cityService.buyStake(townRow.modelData.id, 10000)
                  }
                  Button {
                    text: "Sell half"
                    enabled: !root.outOfOffice && townRow.modelData.units > 0
                    onClicked: root.cityService.sellStake(townRow.modelData.id, 0.5)
                  }
                  Button {
                    text: "Sell all"
                    enabled: !root.outOfOffice && townRow.modelData.units > 0
                    onClicked: root.cityService.sellStake(townRow.modelData.id, 1)
                  }
                }
              }
            }
          }

          Text {
            width: parent.width
            wrapMode: Text.WordWrap
            text: "Every trade pays " + Math.round(Model.MARKET_COMMISSION * 100)
              + "% commission, so churning costs money. A forced sale loses "
              + Math.round(Model.MARKET_DISTRESS * 100) + "% on top."
            color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.45)
            font.family: root.bar ? root.bar.fontFamily : Style.font.family
            font.pixelSize: Style.font.caption
          }

          Button { text: "Done"; onClicked: root.marketOpen = false }
        }
      }
    }

    // The long goal, borrowed from LinCity-NG: a state the city holds rather
    // than a score it climbs, which is what an idle game can actually reward.
    Rectangle {
      id: goalCard
      visible: root.goalOpen
      anchors.centerIn: parent
      width: Math.min(parent.width - Style.space(32), Style.space(380))
      height: Math.min(parent.height - Style.space(32), goalColumn.implicitHeight + Style.space(28))
      radius: Style.cornerRadius
      color: Color.menu.background
      border.width: 1
      border.color: Color.menu.border

      MouseArea { anchors.fill: parent }

      Flickable {
        anchors.fill: parent
        anchors.margins: Style.space(16)
        contentHeight: goalColumn.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds

        Column {
          id: goalColumn
          width: parent.width
          spacing: Style.space(8)

          Text {
            text: root.serviceReady && root.cityService.sustainableAt > 0
              ? "A self-sustaining city" : "Toward a self-sustaining city"
            color: Color.menu.text
            font.bold: true
            font.family: root.bar ? root.bar.fontFamily : Style.font.family
            font.pixelSize: Style.font.body
          }

          Text {
            width: parent.width
            wrapMode: Text.WordWrap
            text: {
              if (!root.serviceReady) return ""
              var s = root.cityService
              if (s.sustainableAt > 0) {
                var cal = Model.calendarFor(s.sustainableAt)
                return "Reached in " + cal.monthName + ", Year " + cal.year
                  + ". The city has proved it can run itself — everything below is "
                  + "still worth holding, but the milestone is yours for good."
              }
              return "Hold every condition below for " + Model.SUSTAINABLE_HOLD_TICKS
                + " months. The streak resets the moment one of them lapses."
            }
            color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.6)
            font.family: root.bar ? root.bar.fontFamily : Style.font.family
            font.pixelSize: Style.font.caption
          }

          // What the city has become, which is the other kind of long-term
          // identity this card is about — one the player never chose and
          // cannot set, only build their way into or out of.
          Rectangle {
            width: parent.width
            height: characterColumn.implicitHeight + Style.space(16)
            radius: Style.cornerRadius
            color: Qt.rgba(0.5, 0.6, 0.6, 0.09)
            border.width: 1
            border.color: root.neutralTint(0.25)

            Column {
              id: characterColumn
              x: Style.space(10)
              y: Style.space(8)
              width: parent.width - Style.space(20)
              spacing: Style.space(3)
              Text {
                text: root.serviceReady ? root.cityService.character.name : ""
                color: Color.menu.text
                font.bold: true
                font.family: root.bar ? root.bar.fontFamily : Style.font.family
                font.pixelSize: Style.font.bodySmall
              }
              Text {
                width: parent.width
                wrapMode: Text.WordWrap
                text: root.serviceReady ? root.cityService.character.blurb : ""
                color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.7)
                font.family: root.bar ? root.bar.fontFamily : Style.font.family
                font.pixelSize: Style.font.caption
              }
              Text {
                width: parent.width
                wrapMode: Text.WordWrap
                text: "You never chose this. It follows from what you have built, "
                  + "and it changes when the balance of the city does."
                color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.45)
                font.family: root.bar ? root.bar.fontFamily : Style.font.family
                font.pixelSize: Style.font.caption
              }
            }
          }

          // Civic standing: what the schools currently entitle the city to
          // build. It had no home in the UI at all, so a tier quietly
          // unlocking (or quietly locking again) was invisible.
          Item {
            width: parent.width
            height: civicText.implicitHeight + Style.space(8)
            visible: root.serviceReady
            Text {
              id: civicText
              anchors.left: parent.left
              anchors.right: parent.right
              anchors.verticalCenter: parent.verticalCenter
              wrapMode: Text.WordWrap
              text: root.serviceReady
                ? Model.civicLabel(root.civicLevel) + " · tier "
                  + Math.max(1, Math.min(3, Math.floor(root.civicLevel)))
                  + " buildings unlocked"
                  + (root.civicLevel >= Model.CIVIC_MAX ? ""
                     : " · schools carry it toward " + Model.civicLabel(Math.floor(root.civicLevel) + 1).toLowerCase())
                : ""
              color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.75)
              font.family: root.bar ? root.bar.fontFamily : Style.font.family
              font.pixelSize: Style.font.caption
            }
          }

          // Progress bar for the streak.
          Item {
            width: parent.width
            height: streakLabel.implicitHeight + Style.space(8)
            visible: root.serviceReady
            Text {
              id: streakLabel
              anchors.left: parent.left
              anchors.verticalCenter: parent.verticalCenter
              text: root.serviceReady
                ? (root.cityService.sustainableNow
                    ? "Holding · " + Math.min(root.cityService.sustainedTicks,
                        Model.SUSTAINABLE_HOLD_TICKS) + " of "
                        + Model.SUSTAINABLE_HOLD_TICKS + " months"
                    : "Not currently holding")
                : ""
              color: root.serviceReady && root.cityService.sustainableNow
                ? Color.accent : Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.6)
              font.family: root.bar ? root.bar.fontFamily : Style.font.family
              font.pixelSize: Style.font.caption
            }
          }
          Rectangle {
            width: parent.width; height: Style.space(5); radius: height / 2
            color: Qt.rgba(0.5, 0.6, 0.6, 0.2)
            Rectangle {
              width: parent.width * (root.serviceReady
                ? Math.min(1, root.cityService.sustainedTicks / Model.SUSTAINABLE_HOLD_TICKS) : 0)
              height: parent.height; radius: height / 2
              color: Color.accent
              Behavior on width { NumberAnimation { duration: 300; easing.type: Easing.OutCubic } }
            }
          }

          Repeater {
            model: root.serviceReady ? root.cityService.sustainability : []

            Item {
              id: goalRow
              required property var modelData
              width: goalColumn.width
              height: goalText.implicitHeight + Style.space(6)

              Text {
                id: goalMark
                anchors.left: parent.left
                anchors.top: goalText.top
                width: Style.space(16)
                text: goalRow.modelData.met ? "\u2713" : "\u00b7"
                color: goalRow.modelData.met ? "#7fbf7f"
                  : Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.45)
                font.family: root.bar ? root.bar.fontFamily : Style.font.family
                font.pixelSize: Style.font.caption
              }
              Column {
                id: goalText
                anchors.left: goalMark.right
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                spacing: Style.space(1)
                Text {
                  width: parent.width
                  text: goalRow.modelData.label
                  color: goalRow.modelData.met ? Color.menu.text
                    : Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.75)
                  font.family: root.bar ? root.bar.fontFamily : Style.font.family
                  font.pixelSize: Style.font.caption
                }
                Text {
                  width: parent.width
                  text: goalRow.modelData.detail
                  wrapMode: Text.WordWrap
                  color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.5)
                  font.family: root.bar ? root.bar.fontFamily : Style.font.family
                  font.pixelSize: Style.font.caption
                }
              }
            }
          }

          Button { text: "Done"; onClicked: root.goalOpen = false }
        }
      }
    }

    // Overlay picker: which data view to paint over the map.
    Rectangle {
      id: overlayMenuCard
      visible: root.overlayMenuOpen
      anchors.centerIn: parent
      width: Math.min(parent.width - Style.space(32), Style.space(300))
      height: overlayColumn.implicitHeight + Style.space(28)
      radius: Style.cornerRadius
      color: Color.menu.background
      border.width: 1
      border.color: Color.menu.border

      MouseArea { anchors.fill: parent }

      Column {
        id: overlayColumn
        anchors.fill: parent
        anchors.margins: Style.space(16)
        spacing: Style.space(6)

        Text {
          text: "Map view"
          color: Color.menu.text
          font.bold: true
          font.family: root.bar ? root.bar.fontFamily : Style.font.family
          font.pixelSize: Style.font.body
        }

        Repeater {
          model: [{ key: "", label: "None" }].concat(Model.OVERLAYS)

          Rectangle {
            id: overlayOption
            required property var modelData
            readonly property bool active: root.overlayMode === modelData.key
            width: overlayColumn.width
            height: Style.space(26)
            radius: Style.space(4)
            color: active ? Qt.rgba(Color.accent.r, Color.accent.g, Color.accent.b, 0.3) : "transparent"
            border.width: 1
            border.color: active ? Color.accent
              : Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.18)

            Text {
              anchors.left: parent.left
              anchors.leftMargin: Style.space(8)
              anchors.verticalCenter: parent.verticalCenter
              text: overlayOption.modelData.label
              color: overlayOption.active ? Color.accent : Color.menu.text
              font.family: root.bar ? root.bar.fontFamily : Style.font.family
              font.pixelSize: Style.font.caption
            }

            MouseArea {
              anchors.fill: parent
              cursorShape: Qt.PointingHandCursor
              onClicked: {
                root.overlayMode = overlayOption.modelData.key
                root.overlayMenuOpen = false
              }
            }
          }
        }

        Text {
          width: parent.width
          text: root.overlayLegend
          visible: text !== ""
          wrapMode: Text.WordWrap
          color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.5)
          font.family: root.bar ? root.bar.fontFamily : Style.font.family
          font.pixelSize: Style.font.caption
        }
      }
    }

    // Advisors: five department heads, each reporting on what they can
    // actually see in the simulation. The Treasurer is also where loans are
    // taken, since "you are short of money" and "here is how to borrow some"
    // belong in the same breath.
    Rectangle {
      id: advisorsCard
      visible: root.advisorsOpen
      anchors.centerIn: parent
      width: Math.min(parent.width - Style.space(32), Style.space(400))
      height: Math.min(parent.height - Style.space(32), advisorsColumn.implicitHeight + Style.space(28))
      radius: Style.cornerRadius
      color: Color.menu.background
      border.width: 1
      border.color: Color.menu.border

      MouseArea { anchors.fill: parent }

      Flickable {
        anchors.fill: parent
        anchors.margins: Style.space(16)
        contentHeight: advisorsColumn.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds

        Column {
          id: advisorsColumn
          width: parent.width
          spacing: Style.space(10)

          Text {
            text: "Advisors"
            color: Color.menu.text
            font.bold: true
            font.family: root.bar ? root.bar.fontFamily : Style.font.family
            font.pixelSize: Style.font.body
          }

          Repeater {
            model: root.cityAdvice

            // The row is an Item, not a Column, purely so the hit area can
            // cover it: anchors.fill inside a Column silently disables that
            // Column's layout, which cost ten warnings a launch and would
            // have stacked every advisor on top of the first one.
            Item {
              id: adviceRow
              required property var modelData
              width: advisorsColumn.width
              height: adviceBody.height

              Column {
                id: adviceBody
                width: parent.width
                spacing: Style.space(2)

                Row {
                  spacing: Style.space(6)
                  // Severity dot: green settled, amber worth a look, red acting on.
                  Rectangle {
                    width: Style.space(8); height: Style.space(8)
                    radius: width / 2
                    anchors.verticalCenter: parent.verticalCenter
                    color: adviceRow.modelData.severity >= 2 ? "#e0806a"
                      : adviceRow.modelData.severity === 1 ? "#e0b45a" : "#7fbf7f"
                  }
                  Text {
                    text: adviceRow.modelData.name
                    color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.6)
                    font.family: root.bar ? root.bar.fontFamily : Style.font.family
                    font.pixelSize: Style.font.caption
                  }
                  Text {
                    text: adviceRow.modelData.headline
                    color: Color.menu.text
                    font.bold: true
                    font.family: root.bar ? root.bar.fontFamily : Style.font.family
                    font.pixelSize: Style.font.caption
                  }
                }

                Text {
                  width: adviceRow.width - Style.space(14)
                  x: Style.space(14)
                  text: adviceRow.modelData.detail
                    + (adviceRow.modelData.overlay !== "" ? "  — click to show on the map" : "")
                  wrapMode: Text.WordWrap
                  color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.65)
                  font.family: root.bar ? root.bar.fontFamily : Style.font.family
                  font.pixelSize: Style.font.caption
                }
              }

              // Naming a problem and then making the player hunt for it is
              // half a tool — an advisor with a map view hands them straight to it.
              MouseArea {
                anchors.fill: parent
                enabled: adviceRow.modelData.overlay !== ""
                cursorShape: Qt.PointingHandCursor
                onClicked: {
                  root.overlayMode = adviceRow.modelData.overlay
                  root.advisorsOpen = false
                }
              }
            }
          }

          Rectangle {
            width: parent.width; height: 1
            color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.15)
          }

          Text {
            text: root.serviceReady && root.cityService.loans.length > 0
              ? "Borrowing — $" + Math.round(Model.totalLoanDebt(root.cityService.loans))
                + " outstanding, $" + Math.round(Model.totalLoanPayment(root.cityService.loans)) + " a month"
              : "Borrowing"
            color: Color.menu.text
            font.bold: true
            font.family: root.bar ? root.bar.fontFamily : Style.font.family
            font.pixelSize: Style.font.bodySmall
          }

          Repeater {
            model: root.serviceReady ? Model.LOAN_OFFERS : []

            Rectangle {
              id: loanRow
              required property var modelData
              readonly property var check: root.serviceReady
                ? Model.canBorrow(loanRow.modelData, root.cityService.loans,
                    root.population, root.budgetIncome)
                : ({ ok: false, reason: "" })
              width: advisorsColumn.width
              height: loanText.implicitHeight + Style.space(14)
              radius: Style.space(4)
              color: check.ok ? Qt.rgba(Color.accent.r, Color.accent.g, Color.accent.b, 0.12) : "transparent"
              border.width: 1
              border.color: check.ok ? Color.accent
                : Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.2)
              opacity: check.ok ? 1 : 0.5

              Column {
                id: loanText
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.margins: Style.space(7)
                anchors.verticalCenter: parent.verticalCenter
                spacing: Style.space(1)

                Text {
                  text: loanRow.modelData.label + " — $" + loanRow.modelData.principal
                  color: Color.menu.text
                  font.family: root.bar ? root.bar.fontFamily : Style.font.family
                  font.pixelSize: Style.font.caption
                }
                Text {
                  width: loanText.width
                  wrapMode: Text.WordWrap
                  text: "$" + Math.round(Model.loanPaymentFor(loanRow.modelData)) + " a month for "
                    + loanRow.modelData.ticks + " months · "
                    + Math.round(loanRow.modelData.interest * 100) + "% interest"
                    + (loanRow.check.ok ? ""
                      : loanRow.check.reason === "too-small" ? " · needs " + loanRow.check.need + " residents"
                      : loanRow.check.reason === "too-many-loans" ? " · already carrying the maximum"
                      : " · the city could not service this")
                  color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.6)
                  font.family: root.bar ? root.bar.fontFamily : Style.font.family
                  font.pixelSize: Style.font.caption
                }
              }

              MouseArea {
                anchors.fill: parent
                enabled: loanRow.check.ok
                cursorShape: Qt.PointingHandCursor
                onClicked: root.cityService.borrow(loanRow.modelData.id)
              }
            }
          }

          Button { text: "Done"; onClicked: root.advisorsOpen = false }
        }
      }
    }

    // Budget: the department funding sliders. Its own card rather than a
    // Settings row because it's a gameplay screen the mayor comes back to,
    // not a preference set once — and it shows the live income/upkeep split
    // so the cost of a change is visible while making it.
    Rectangle {
      id: budgetCard
      visible: root.budgetOpen
      anchors.centerIn: parent
      // Wider on the ordinances tab so twelve policies can sit two abreast
      // rather than in one column taller than the screen. The other tabs are
      // short and read better narrow.
      width: Math.min(parent.width - Style.space(32),
        Style.space(root.budgetTab === "policy" ? 520 : 360))
      // Clamped to the panel and scrollable, like the other cards. Without
      // this the card grew to its content and ran clean off the screen once
      // ordinances were added to it.
      height: Math.min(parent.height - Style.space(32), budgetColumn.implicitHeight + Style.space(28))
      radius: Style.cornerRadius
      color: Color.menu.background
      border.width: 1
      border.color: Color.menu.border

      MouseArea { anchors.fill: parent }

      Flickable {
        anchors.fill: parent
        anchors.margins: Style.space(16)
        contentHeight: budgetColumn.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds

      Column {
        id: budgetColumn
        width: parent.width
        spacing: Style.space(10)

        Text {
          text: "Budget"
          color: Color.menu.text
          font.bold: true
          font.family: root.bar ? root.bar.fontFamily : Style.font.family
          font.pixelSize: Style.font.body
        }

        // Three genuinely separate things share one budget — the bill you are
        // paying, the departments you set, and the policies you have passed.
        // Tabs keep each one readable instead of stacking all three into a
        // card taller than the screen.
        Row {
          width: parent.width
          spacing: Style.space(5)

          Repeater {
            model: [
              { key: "bill", label: "Bill" },
              { key: "funding", label: "Funding" },
              { key: "policy", label: "Ordinances" }
            ]

            Rectangle {
              id: budgetTab
              required property var modelData
              readonly property bool current: root.budgetTab === modelData.key
              width: (budgetColumn.width - Style.space(10)) / 3
              height: Style.space(26)
              radius: Style.space(4)
              color: current ? Qt.rgba(Color.accent.r, Color.accent.g, Color.accent.b, 0.3) : "transparent"
              border.width: 1
              border.color: current ? Color.accent
                : Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.22)

              Text {
                anchors.centerIn: parent
                text: budgetTab.modelData.label
                color: budgetTab.current ? Color.accent : Color.menu.text
                font.family: root.bar ? root.bar.fontFamily : Style.font.family
                font.pixelSize: Style.font.caption
              }

              MouseArea {
                anchors.fill: parent
                cursorShape: Qt.PointingHandCursor
                onClicked: root.budgetTab = budgetTab.modelData.key
              }
            }
          }
        }

        Text {
          width: parent.width
          visible: root.serviceReady
          // The election is the one deadline in the game, so it sits above
          // the money rather than buried in a menu.
          text: {
            if (!root.serviceReady) return ""
            var s = root.cityService
            if (root.outOfOffice)
              return "Out of office — an interim administration is running the city for "
                + root.outOfOfficeSpan + "."
            var due = Math.max(0, Math.ceil(s.nextElectionAt - s.ageMinutes))
            return "Approval " + root.approval + "% · election in " + due
              + (due === 1 ? " month" : " months")
              + (root.serviceReady && root.approval < root.cityService.electionBar ? " · you would lose today" : "")
          }
          wrapMode: Text.WordWrap
          color: root.outOfOffice || root.serviceReady && root.approval < root.cityService.electionBar
            ? "#e0806a" : Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.75)
          font.family: root.bar ? root.bar.fontFamily : Style.font.family
          font.pixelSize: Style.font.caption
        }

        Text {
          width: parent.width
          text: root.serviceReady
            ? "Income $" + Math.round(root.budgetIncome) + " · Upkeep $" + Math.round(root.budgetUpkeep)
              + " · " + (root.budgetNet >= 0 ? "+" : "−") + "$" + Math.abs(Math.round(root.budgetNet)) + " a month"
            : ""
          wrapMode: Text.WordWrap
          color: root.budgetNet >= 0 ? Color.menu.text : "#e0806a"
          font.family: root.bar ? root.bar.fontFamily : Style.font.family
          font.pixelSize: Style.font.bodySmall
        }

        // The itemised bill. computeUpkeep is literally the sum of these rows,
        // so what's shown here can't drift from what's actually charged.
        Column {
          width: parent.width
          spacing: Style.space(1)
          visible: root.budgetTab === "bill"

          Repeater {
            model: root.upkeepBill

            Item {
              id: billRow
              required property var modelData
              visible: modelData.amount > 0.01
              width: budgetColumn.width
              height: visible ? billLabel.implicitHeight + Style.space(2) : 0

              Text {
                id: billLabel
                anchors.left: parent.left
                text: billRow.modelData.label
                color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.55)
                font.family: root.bar ? root.bar.fontFamily : Style.font.family
                font.pixelSize: Style.font.caption
              }
              // A bar makes the big line items obvious at a glance — the point
              // is noticing what dominates, not reading exact figures.
              Rectangle {
                anchors.verticalCenter: parent.verticalCenter
                anchors.right: billAmount.left
                anchors.rightMargin: Style.space(6)
                width: root.budgetUpkeep > 0
                  ? Math.max(1, (billRow.width * 0.32) * (billRow.modelData.amount / root.budgetUpkeep)) : 0
                height: Style.space(4)
                radius: height / 2
                color: Qt.rgba(Color.accent.r, Color.accent.g, Color.accent.b, 0.45)
              }
              Text {
                id: billAmount
                anchors.right: parent.right
                text: "$" + Math.round(billRow.modelData.amount)
                color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.75)
                font.family: root.bar ? root.bar.fontFamily : Style.font.family
                font.pixelSize: Style.font.caption
              }
            }
          }
        }

        Rectangle {
          width: parent.width; height: 1
          color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.15)
        }

        Repeater {
          model: root.budgetTab === "funding" && root.serviceReady ? Model.FUNDABLE_SERVICES : []

          Column {
            id: deptRow
            required property var modelData
            readonly property string dept: modelData
            readonly property bool present: root.serviceReady
              && root.budgetStats.departmentPresent[deptRow.dept] === true
            readonly property real level: root.serviceReady
              ? Model.fundingLevel(root.cityService.funding, deptRow.dept) : 1
            width: parent.width
            spacing: Style.space(4)
            opacity: present ? 1 : 0.45

            Row {
              width: parent.width
              Text {
                text: Model.DEPARTMENT_NAMES[deptRow.dept]
                color: Color.menu.text
                font.family: root.bar ? root.bar.fontFamily : Style.font.family
                font.pixelSize: Style.font.bodySmall
              }
              Item { width: deptRow.width - 200; height: 1 }
              Text {
                text: deptRow.present
                  ? Math.round(deptRow.level * 100) + "% · $"
                    + Math.round(Model.departmentSpend(root.budgetStats,
                        root.cityService.funding, deptRow.dept))
                  : "not built"
                color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.7)
                font.family: root.bar ? root.bar.fontFamily : Style.font.family
                font.pixelSize: Style.font.caption
              }
            }

            Row {
              width: parent.width
              spacing: Style.space(5)

              Repeater {
                model: [0.5, 0.75, 1.0, 1.25, 1.5]

                Rectangle {
                  id: levelOption
                  required property var modelData
                  readonly property bool active: Math.abs(deptRow.level - modelData) < 0.01
                  width: (budgetColumn.width - Style.space(20)) / 5
                  height: Style.space(26)
                  radius: Style.space(4)
                  color: active ? Qt.rgba(Color.accent.r, Color.accent.g, Color.accent.b, 0.35) : "transparent"
                  border.width: 1
                  border.color: active ? Color.accent : Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.3)

                  Text {
                    anchors.centerIn: parent
                    text: Math.round(levelOption.modelData * 100) + "%"
                    color: levelOption.active ? Color.accent : Color.menu.text
                    font.family: root.bar ? root.bar.fontFamily : Style.font.family
                    font.pixelSize: Style.font.caption
                  }

                  MouseArea {
                    anchors.fill: parent
                    enabled: deptRow.present
                    cursorShape: Qt.PointingHandCursor
                    onClicked: root.cityService.setFunding(deptRow.dept, levelOption.modelData)
                  }
                }
              }
            }
          }
        }

        Text {
          width: parent.width
          visible: root.budgetTab === "funding"
          text: "Departments are paid per resident served, so their cost grows with the city. "
            + "Funding buys coverage range; fire and police also see fewer incidents. "
            + "Starve one to save money and you'll feel it."
          wrapMode: Text.WordWrap
          color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.5)
          font.family: root.bar ? root.bar.fontFamily : Style.font.family
          font.pixelSize: Style.font.caption
        }

        // Ordinances sit in the budget rather than a screen of their own:
        // every one of them is a standing line on the same monthly bill.
        Item {
          width: parent.width
          height: root.budgetTab === "policy" ? policyHeading.implicitHeight : 0
          visible: root.budgetTab === "policy"
          Text {
            id: policyHeading
            anchors.left: parent.left
            anchors.verticalCenter: parent.verticalCenter
            text: "Ordinances"
            color: Color.menu.text
            font.bold: true
            font.family: root.bar ? root.bar.fontFamily : Style.font.family
            font.pixelSize: Style.font.bodySmall
          }
          Text {
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            text: root.serviceReady
              ? (Model.ordinanceCost(root.ordinances, root.population) < 0 ? "+$" : "$")
                + Math.abs(Math.round(Model.ordinanceCost(root.ordinances, root.population))) + " a month"
              : ""
            color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.6)
            font.family: root.bar ? root.bar.fontFamily : Style.font.family
            font.pixelSize: Style.font.caption
          }
        }

        // Two abreast when there is room, one when there is not, so the same
        // list works in the docked panel and in a small detached window.
        // Every row is the same height — the blurb is capped at two lines —
        // which keeps the grid from going ragged.
        Grid {
          id: policyGrid
          width: parent.width
          visible: root.budgetTab === "policy"
          columns: width >= Style.space(360) ? 2 : 1
          spacing: Style.space(6)

          Repeater {
            model: root.budgetTab === "policy" && root.serviceReady ? Model.ORDINANCES : []

            Rectangle {
              id: policyRow
              required property var modelData
              readonly property bool enacted: root.ordinances.indexOf(policyRow.modelData.id) >= 0
              readonly property real cost: Model.ordinanceCost([policyRow.modelData.id], root.population)
              width: (policyGrid.width - policyGrid.spacing * (policyGrid.columns - 1))
                / policyGrid.columns
              height: policyText.implicitHeight + Style.space(12)
              radius: Style.space(4)
              color: enacted ? Qt.rgba(Color.accent.r, Color.accent.g, Color.accent.b, 0.16) : "transparent"
              border.width: 1
              border.color: enacted ? Color.accent
                : Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.18)
              opacity: root.outOfOffice ? 0.45 : 1

              Column {
                id: policyText
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.margins: Style.space(7)
                anchors.verticalCenter: parent.verticalCenter
                spacing: Style.space(1)

                // Anchored rather than spaced with a fixed-width filler: the
                // old one was budgetColumn.width - 210, which goes negative in
                // a narrow column and shoves the price off the card.
                Item {
                  width: parent.width
                  height: policyName.implicitHeight
                  Text {
                    id: policyName
                    anchors.left: parent.left
                    anchors.right: policyCost.left
                    anchors.rightMargin: Style.space(6)
                    elide: Text.ElideRight
                    text: policyRow.modelData.name
                    color: policyRow.enacted ? Color.accent : Color.menu.text
                    font.family: root.bar ? root.bar.fontFamily : Style.font.family
                    font.pixelSize: Style.font.caption
                  }
                  Text {
                    id: policyCost
                    anchors.right: parent.right
                    // A negative rate is revenue, which is exactly how the
                    // devil's-bargain policies should read.
                    text: (policyRow.cost < 0 ? "+$" : "$") + Math.abs(Math.round(policyRow.cost))
                    color: policyRow.cost < 0 ? "#7fbf7f"
                      : Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.6)
                    font.family: root.bar ? root.bar.fontFamily : Style.font.family
                    font.pixelSize: Style.font.caption
                  }
                }
                Text {
                  width: policyText.width
                  text: policyRow.modelData.blurb
                  wrapMode: Text.WordWrap
                  maximumLineCount: 2
                  elide: Text.ElideRight
                  color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.55)
                  font.family: root.bar ? root.bar.fontFamily : Style.font.family
                  font.pixelSize: Style.font.caption
                }
              }

              MouseArea {
                anchors.fill: parent
                enabled: !root.outOfOffice
                cursorShape: Qt.PointingHandCursor
                onClicked: root.cityService.toggleOrdinance(policyRow.modelData.id)
              }
            }
          }
        }

        Button { text: "Done"; onClicked: root.budgetOpen = false }
      }
      }
    }

    // Founding a city is the one moment where naming it belongs, so this is a
    // form rather than a bare confirmation. Both names can still be changed
    // later in Settings; only the town's is required.
    Rectangle {
      id: newCityCard
      visible: root.confirmNewGameOpen
      anchors.centerIn: parent
      width: Math.min(parent.width - Style.space(32), Style.space(360))
      height: newCityColumn.implicitHeight + Style.space(28)
      radius: Style.cornerRadius
      color: Color.menu.background
      border.width: 1
      border.color: Color.menu.border

      MouseArea { anchors.fill: parent }

      function start() {
        if (!root.serviceReady || !Model.validName(newCityInput.text)) return
        root.confirmNewGameOpen = false
        root.cityService.resetCity(newCityInput.text, newMayorInput.text)
      }

      Column {
        id: newCityColumn
        anchors.fill: parent
        anchors.margins: Style.space(16)
        spacing: Style.space(10)

        Text {
          text: "Found a new city"
          color: Color.menu.text
          font.bold: true
          font.family: root.bar ? root.bar.fontFamily : Style.font.family
          font.pixelSize: Style.font.body
        }

        Text {
          width: parent.width
          wrapMode: Text.WordWrap
          text: "This clears " + (root.serviceReady ? root.cityService.cityName : "this city")
            + "'s grid, population and treasury. Both names can be changed later."
          color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.6)
          font.family: root.bar ? root.bar.fontFamily : Style.font.family
          font.pixelSize: Style.font.caption
        }

        Text {
          text: "Town name"
          color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.6)
          font.family: root.bar ? root.bar.fontFamily : Style.font.family
          font.pixelSize: Style.font.caption
        }
        Rectangle {
          width: parent.width
          height: Style.space(34)
          radius: Style.space(4)
          color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.06)
          border.color: newCityInput.activeFocus ? Color.accent : Color.menu.border
          TextInput {
            id: newCityInput
            anchors.fill: parent
            anchors.margins: Style.space(7)
            color: Color.menu.text
            selectionColor: Color.accent
            font.family: Style.font.family
            font.pixelSize: Style.font.bodySmall
            maximumLength: Model.NAME_MAX
            clip: true
            selectByMouse: true
            onAccepted: newMayorInput.forceActiveFocus()
            Keys.onEscapePressed: { root.confirmNewGameOpen = false; event.accepted = true }
          }
        }

        Text {
          text: "Mayor (optional)"
          color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.6)
          font.family: root.bar ? root.bar.fontFamily : Style.font.family
          font.pixelSize: Style.font.caption
        }
        Rectangle {
          width: parent.width
          height: Style.space(34)
          radius: Style.space(4)
          color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.06)
          border.color: newMayorInput.activeFocus ? Color.accent : Color.menu.border
          TextInput {
            id: newMayorInput
            anchors.fill: parent
            anchors.margins: Style.space(7)
            color: Color.menu.text
            selectionColor: Color.accent
            font.family: Style.font.family
            font.pixelSize: Style.font.bodySmall
            maximumLength: Model.NAME_MAX
            clip: true
            selectByMouse: true
            onAccepted: newCityCard.start()
            Keys.onEscapePressed: { root.confirmNewGameOpen = false; event.accepted = true }
          }
        }

        Row {
          spacing: Style.space(8)
          Button {
            text: "Found city"
            enabled: root.serviceReady && Model.validName(newCityInput.text)
            onClicked: newCityCard.start()
          }
          Button { text: "Cancel"; onClicked: root.confirmNewGameOpen = false }
        }
      }
    }
  }

  // Mayor's dilemma card — its own overlay (not folded into the game-menu
  // one above) since it's driven by data, not a button toggle, and has no
  // outside-click dismissal: the mayor picks one of the two choices, full
  // stop, the way Reigns never lets you shrug and walk away from the throne.
  Item {
    anchors.fill: parent
    visible: root.currentEvent !== null

    Rectangle {
      anchors.fill: parent
      color: Qt.rgba(0, 0, 0, 0.5)
    }

    Rectangle {
      id: eventCard
      anchors.centerIn: parent
      width: Math.min(parent.width - Style.space(32), Style.space(360))
      radius: Style.cornerRadius
      color: Color.menu.background
      border.width: 1
      border.color: Color.menu.border
      height: eventColumn.implicitHeight + Style.space(28)

      Column {
        id: eventColumn
        anchors.fill: parent
        anchors.margins: Style.space(16)
        spacing: Style.space(10)

        Text {
          width: parent.width
          text: root.currentEvent ? root.currentEvent.title : ""
          color: Color.menu.text
          font.family: root.bar ? root.bar.fontFamily : Style.font.family
          font.pixelSize: Style.font.body
          font.bold: true
          wrapMode: Text.WordWrap
        }

        Text {
          width: parent.width
          text: root.currentEvent ? root.currentEvent.flavor : ""
          color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.8)
          font.family: root.bar ? root.bar.fontFamily : Style.font.family
          font.pixelSize: Style.font.bodySmall
          wrapMode: Text.WordWrap
        }

        Repeater {
          model: root.currentEvent ? root.currentEvent.choices : []

          Rectangle {
            id: choiceItem
            required property var modelData
            required property int index
            width: eventColumn.width
            height: choiceColumn.implicitHeight + Style.space(14)
            radius: Style.space(4)
            color: choiceMouse.containsMouse ? Color.menu.selectedBackground : "transparent"
            border.width: 1
            border.color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.25)

            Column {
              id: choiceColumn
              anchors.fill: parent
              anchors.margins: Style.space(7)
              spacing: Style.space(2)

              Text {
                width: parent.width
                text: choiceItem.modelData.label
                color: choiceMouse.containsMouse ? Color.menu.selectedText : Color.menu.text
                font.bold: true
                font.family: root.bar ? root.bar.fontFamily : Style.font.family
                font.pixelSize: Style.font.bodySmall
              }

              Text {
                width: parent.width
                text: choiceItem.modelData.hint
                wrapMode: Text.WordWrap
                color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.65)
                font.family: root.bar ? root.bar.fontFamily : Style.font.family
                font.pixelSize: Style.font.caption
              }
            }

            MouseArea {
              id: choiceMouse
              anchors.fill: parent
              hoverEnabled: true
              cursorShape: Qt.PointingHandCursor
              onClicked: if (root.cityService && root.currentEvent)
                root.cityService.resolveEvent(root.currentEvent.id, choiceItem.index)
            }
          }
        }

        Text {
          width: parent.width
          visible: root.pendingEvents.length > 1
          text: (root.pendingEvents.length - 1) + " more decision"
            + (root.pendingEvents.length > 2 ? "s" : "") + " waiting"
          color: Qt.rgba(Color.menu.text.r, Color.menu.text.g, Color.menu.text.b, 0.5)
          font.family: root.bar ? root.bar.fontFamily : Style.font.family
          font.pixelSize: Style.font.caption
        }
      }
    }
  }

  // Declared last and at the root so it paints above everything and, more to
  // the point, so the pointer can actually reach it: positioned from the tool
  // button via openFlyoutFor rather than anchored inside it.
  Timer {
    id: flyoutCloseTimer
    interval: 300
    onTriggered: if (!flyoutHover.hovered && !flyoutBlocker.containsMouse) root.flyoutType = ""
  }

  Item {
    id: tierFlyout
    visible: root.flyoutType !== ""
    x: root.flyoutAnchorX
    y: root.flyoutAnchorY - height / 2
    width: flyoutBg.width + Style.space(6)
    height: flyoutBg.height
    z: 9000

    // Input-opaque body, declared first so the choices drawn after it still
    // get their own clicks. Without this, reaching across the flyout also
    // hovered whatever sat beneath it — in two columns, the neighbouring
    // tool button, whose onEntered clears flyoutType if it has no tiers.
    MouseArea {
      id: flyoutBlocker
      anchors.fill: parent
      hoverEnabled: true
    }

    // Observe the actual ancestor of the choices. A sibling
    // hover bridge underneath them loses hover to their MouseAreas.
    HoverHandler {
      id: flyoutHover
      onHoveredChanged: {
        if (hovered) flyoutCloseTimer.stop()
        else flyoutCloseTimer.restart()
      }
    }

    Rectangle {
      id: flyoutBg
      x: Style.space(6)
      width: flyoutRow.implicitWidth + Style.space(12)
      height: flyoutRow.implicitHeight + Style.space(12)
      radius: Style.space(6)
      color: Qt.rgba(Color.menu.background.r, Color.menu.background.g, Color.menu.background.b, 0.97)
      border.width: 1
      border.color: root.neutralTint(0.3)

      // Wraps rather than running off the panel edge: upgrade tiers are three
      // wide and stay one row, six decorations become three by two.
      Grid {
        id: flyoutRow
        anchors.centerIn: parent
        columns: 3
        spacing: Style.space(8)

        Repeater {
          model: root.flyoutDecorations ? Model.DECORATION_TYPES.length
            : root.flyoutUpgradeable ? 3 : 0

          Column {
            id: tierEntry
            required property int index
            readonly property string ttype: root.flyoutDecorations
              ? Model.DECORATION_TYPES[index] : root.flyoutType
            readonly property int tierIndex: root.flyoutDecorations ? 0 : index
            readonly property string tierName: root.flyoutDecorations
              ? (Model.TILE_LABELS[ttype] || "")
              : (Model.UPGRADE_TIER_NAMES[ttype] ? Model.UPGRADE_TIER_NAMES[ttype][tierIndex] : "")
            readonly property int threshold: Model.UPGRADE_THRESHOLDS[tierIndex]
            readonly property bool unlocked: root.population >= threshold
              && Model.civicAllowsBuild(root.civicLevel, tierEntry.ttype, tierEntry.tierIndex)
            // Resolved here rather than inside the ToolTip below, for the
            // scope reason noted at its use.
            readonly property string hint: root.flyoutDecorations
              ? root.toolHint(tierEntry.ttype)
              : tierEntry.tierName + " · " + (tierEntry.unlocked
                  ? "$" + Model.totalInvestment(tierEntry.ttype, tierEntry.tierIndex)
                    + " new; upgrades pay the difference"
                  : (root.population < tierEntry.threshold
                      ? "Unlocks at population " + tierEntry.threshold
                      : "Needs " + Model.civicLabel(tierEntry.tierIndex + 1).toLowerCase()
                        + " status — build and fund schools"))
            spacing: Style.space(2)
            width: Style.space(64)

            Rectangle {
              width: Style.space(30)
              height: Style.space(30)
              anchors.horizontalCenter: parent.horizontalCenter
              radius: Style.space(4)
              opacity: tierEntry.unlocked ? 1.0 : 0.45
              color: root.activeTool === tierEntry.ttype
                && ((tierEntry.tierIndex === 0 && root.upgradeTarget === "")
                  || (tierEntry.tierIndex > 0 && root.upgradeTarget === tierEntry.ttype
                    && root.selectedTier === tierEntry.tierIndex))
                ? Qt.rgba(0.88, 0.62, 0.22, 0.35) : "transparent"
              border.width: 1
              border.color: root.neutralTint(0.35)

              Canvas {
                anchors.fill: parent
                anchors.margins: Style.space(2)
                visible: tierSprite.status !== Image.Ready
                onPaint: {
                  var ctx = getContext("2d")
                  ctx.clearRect(0, 0, width, height)
                  switch (tierEntry.ttype) {
                  case Model.TILE_PARK: root.drawPark(ctx, 0, 0, width, tierEntry.tierIndex); break
                  case Model.TILE_POWER: root.drawPower(ctx, 0, 0, width, tierEntry.tierIndex); break
                  case Model.TILE_WATER: root.drawWater(ctx, 0, 0, width, tierEntry.tierIndex); break
                  case Model.TILE_FIRE: root.drawFire(ctx, 0, 0, width, tierEntry.tierIndex); break
                  case Model.TILE_POLICE: root.drawPolice(ctx, 0, 0, width, tierEntry.tierIndex); break
                  case Model.TILE_SCHOOL: root.drawSchool(ctx, 0, 0, width, tierEntry.tierIndex); break
                  case Model.TILE_MEDICAL: root.drawMedical(ctx, 0, 0, width, tierEntry.tierIndex); break
                  case Model.TILE_TRANSIT: root.drawTransit(ctx, 0, 0, width, tierEntry.tierIndex); break
                  case Model.TILE_TREE:
                  case Model.TILE_FLOWERS:
                  case Model.TILE_HEDGE:
                  case Model.TILE_BENCH:
                  case Model.TILE_STATUE:
                  case Model.TILE_FOUNTAIN:
                  case Model.TILE_ARBOUR:
                  case Model.TILE_BANDSTAND: root.drawPark(ctx, 0, 0, width, 0); break
                  }
                }
              }

              Image {
                id: tierSprite
                anchors.fill: parent
                anchors.margins: Style.space(2)
                source: root.previewSpriteSource(tierEntry.ttype, tierEntry.tierIndex)
                fillMode: Image.PreserveAspectFit
                smooth: true
                visible: status === Image.Ready
              }

              Text {
                visible: !tierEntry.unlocked
                anchors.centerIn: parent
                text: "🔒"
                font.pixelSize: Style.space(13)
              }

              MouseArea {
                id: tierMouse
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: tierEntry.unlocked ? Qt.PointingHandCursor : Qt.ArrowCursor
                onClicked: {
                  if (!tierEntry.unlocked) return
                  if (root.flyoutDecorations) root.decorationTool = tierEntry.ttype
                  root.upgradeTarget = tierEntry.tierIndex === 0 ? "" : tierEntry.ttype
                  root.selectedTier = tierEntry.tierIndex
                  root.activeTool = tierEntry.ttype
                  root.flyoutType = ""
                }
              }
              ToolHint {
                visible: tierMouse.containsMouse
                text: tierEntry.hint
              }
            }

            Text {
              width: parent.width
              horizontalAlignment: Text.AlignHCenter
              wrapMode: Text.WordWrap
              text: tierEntry.tierName
              font.pixelSize: Style.space(8)
              color: Color.menu.text
            }
            Text {
              anchors.horizontalCenter: parent.horizontalCenter
              text: tierEntry.unlocked
                ? "$" + Model.totalInvestment(tierEntry.ttype, tierEntry.tierIndex)
                : ("Pop " + tierEntry.threshold)
              font.pixelSize: Style.space(8)
              color: root.neutralTint(0.7)
            }
          }
        }
      }
    }
  }
}
