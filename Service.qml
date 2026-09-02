import QtQuick
import Quickshell
import Quickshell.Io
import "Model.js" as Model

// Headless city brain. Loaded once at shell startup (independent of the
// bar widget and panel), so the city keeps growing with the panel closed.
// Age ticks in active-shell-minutes, not wall clock, the same trick
// Omagotchi uses — a machine that sleeps doesn't lose progress, but it
// doesn't secretly keep simulating while suspended either.
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
  property var reachedMilestones: []
  property bool budgetCrisisActive: false

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
    root.treasury -= Model.COSTS[type]
    root.grid = Model.placeTile(root.grid, index, type)
    flushState()
    return true
  }

  function bulldozeTile(index) {
    if (index < 0 || index >= root.grid.length) return
    root.grid = Model.bulldozeTile(root.grid, index)
    flushState()
  }

  function setTaxRate(percent) {
    var clamped = Math.max(0, Math.min(30, Math.round(percent)))
    if (clamped === root.taxRatePercent) return
    root.taxRatePercent = clamped
    flushState()
  }

  // --- the minute tick -------------------------------------------------------

  Timer {
    interval: 60 * 1000
    running: root.initialized
    repeat: true
    onTriggered: {
      var result = Model.advanceCity(root.grid, root.gridSize, root.taxRatePercent)
      root.grid = result.grid
      root.population = result.population
      root.jobs = result.jobs
      root.happiness = result.happiness
      root.treasury += result.incomeDelta
      root.ageMinutes += 1
      root.checkMilestones()
      root.checkBudget()
      if (Math.round(root.ageMinutes) % 5 === 0) root.flushState()
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
      grid: root.grid,
      gridSize: root.gridSize,
      population: root.population,
      jobs: root.jobs,
      happiness: root.happiness,
      reachedMilestones: root.reachedMilestones,
      budgetCrisisActive: root.budgetCrisisActive
    }, null, 2) + "\n")
  }

  function initializeIfReady() {
    if (initialized || !stateFileLoaded) return

    var saveProblem = stateReadProblem
    function num(v, fallback) {
      var n = Number(v)
      return isFinite(n) ? n : fallback
    }
    try {
      var saved = loadedStateText !== "" ? JSON.parse(loadedStateText) : {}
      cityName = typeof saved.cityName === "string" && saved.cityName !== "" ? saved.cityName : "Omaville"
      foundedAtMs = num(saved.foundedAtMs, 0)
      ageMinutes = Math.max(0, num(saved.ageMinutes, 0))
      treasury = num(saved.treasury, 500)
      taxRatePercent = Math.max(0, Math.min(30, num(saved.taxRatePercent, 10)))
      var loadedGrid = Array.isArray(saved.grid) ? saved.grid : null
      // A grid whose length doesn't match the current gridSize (schema
      // change, corrupt save) falls back to a fresh empty map rather than
      // indexing garbage for the lifetime of the city.
      grid = loadedGrid && loadedGrid.length === gridSize * gridSize
        ? loadedGrid : Model.emptyGrid(gridSize)
      population = Math.max(0, Math.round(num(saved.population, 0)))
      jobs = Math.max(0, Math.round(num(saved.jobs, 0)))
      happiness = Math.max(0, Math.min(100, Math.round(num(saved.happiness, 70))))
      reachedMilestones = Array.isArray(saved.reachedMilestones) ? saved.reachedMilestones : []
      budgetCrisisActive = saved.budgetCrisisActive === true
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
    if (founded) flushState()
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
