import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.js" as Model

BarWidget {
  id: root
  moduleName: "io.github.keithnyc.omaville"

  readonly property var cityService: bar && bar.shell
    ? bar.shell.serviceFor(root.moduleName)
    : null
  readonly property bool serviceReady: !!cityService && cityService.initialized === true
  readonly property int population: serviceReady ? cityService.population : 0
  readonly property int treasury: serviceReady ? Math.round(cityService.treasury) : 0
  readonly property bool budgetCrisis: serviceReady && cityService.budgetCrisisActive === true

  // What the city is currently doing wrong, if anything — the service ranks
  // these so the widget and the panel never disagree about what is urgent.
  readonly property string alertKind: serviceReady ? cityService.alertKind : ""
  // Shown in the bar because the bar is what is visible with the panel shut,
  // and a city that has stopped on purpose must not look like a city that has
  // stopped working.
  readonly property bool paused: serviceReady && cityService.paused === true
  readonly property bool alerting: alertKind !== ""
  // Events logged since the player last opened the panel. The widget is the
  // only place these are visible without opening anything, which is the whole
  // point of a city that keeps running while you work.
  readonly property int unseenCount: serviceReady ? cityService.unseenLog.length : 0

  // Nerd-font glyphs, matching the rest of the bar rather than emoji.
  readonly property var alertIcons: ({
    office: "\uf023", fire: "\uf06d", crime: "\uf132", brownout: "\uf0e7", budget: "\uf071"
  })
  readonly property string icon: root.alertIcons[root.alertKind] || ""

  // Shared with the panel via Model, so the same treasury never reads two ways.
  function money(value) { return Model.money(value) }

  function summaryLine() {
    if (!root.serviceReady) return "Omaville"
    var s = root.cityService
    var cal = Model.calendarFor(s.ageMinutes)
    var lines = [
      s.cityName + " · " + cal.monthName + ", Year " + cal.year
        + (root.paused ? "  (paused)" : ""),
      "Pop " + root.population + " · " + root.money(root.treasury) + " · " + s.happiness + "% happy"
    ]
    if (s.outOfOffice) {
      var left = Math.max(1, Math.ceil(s.outOfOfficeUntil - s.ageMinutes))
      lines.push("\nOut of office · " + left + (left === 1 ? " month left" : " months left"))
    }
    // Only the advisors with something to say — a wall of "all good" is not
    // worth the tooltip space. Severity is a single character on purpose: the
    // shell centres tooltip text, so a two-character "!!" against a one-
    // character "!" would leave the lines starting at different offsets.
    var advice = s.advice
    var flagged = 0
    for (var i = 0; i < advice.length && flagged < 3; i++) {
      if (advice[i].severity <= 0) continue
      if (flagged === 0) lines.push("")
      lines.push((advice[i].severity >= 2 ? "\u203c " : "\u00b7 ") + advice[i].headline)
      flagged++
    }
    if (flagged === 0) lines.push("\nThe city is running smoothly.")
    if (root.unseenCount > 0)
      lines.push(root.unseenCount === 1 ? "\n1 new event since you looked"
        : "\n" + root.unseenCount + " new events since you looked")
    return lines.join("\n")
  }

  // A tiny skyline instead of a static icon — five bars that grow toward
  // their own weighted height as population approaches skylineMaxPop
  // (5000, the same population milestone that fires a notification), so
  // the bar widget itself visibly reflects how the city's doing, not just
  // a number next to a generic building glyph.
  readonly property var skylineWeights: [0.4, 0.7, 1.0, 0.55, 0.85]
  readonly property int skylineMaxPop: 5000
  function skylineBarHeight(index) {
    var maxH = 12, minH = 3
    var t = Math.min(1, root.population / root.skylineMaxPop)
    var w = root.skylineWeights[index % root.skylineWeights.length]
    return Math.round(minH + (maxH - minH) * w * (0.2 + 0.8 * t))
  }

  // Whether the city view currently lives in its own window instead of
  // the docked bar panel — toggled by CityView's detach/dock button,
  // reachable in either host since both forward through hostWidget.
  property bool detached: false

  readonly property bool opened: panelLoader.item
    ? panelLoader.item.opened === true
    : false
  readonly property bool popoutSwitchClosing: panelLoader.item
    ? panelLoader.item.popoutSwitchClosing === true
    : false

  function open() {
    if (root.detached) return
    if (panelLoader.item) panelLoader.item.open()
  }

  function close() {
    if (panelLoader.item) panelLoader.item.close()
  }

  function toggle() {
    if (root.detached) return
    if (panelLoader.item) panelLoader.item.toggle()
  }

  function closeForPopoutSwitch() {
    if (panelLoader.item) panelLoader.item.closeForPopoutSwitch()
  }

  function requestDetach() {
    root.detached = true
    root.close()
  }

  function requestReattach() {
    root.detached = false
    Qt.callLater(root.open)
  }

  function injectPanel() {
    if (!panelLoader.item) return
    panelLoader.item.bar = root.bar
    panelLoader.item.anchorItem = button
    panelLoader.item.hostWidget = root
  }

  function injectDetachedWindow() {
    if (!detachedLoader.item) return
    detachedLoader.item.cityService = root.cityService
    detachedLoader.item.hostWidget = root
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  onBarChanged: injectPanel()

  Loader {
    id: panelLoader
    active: true
    source: Qt.resolvedUrl("Panel.qml")
    visible: false
    onLoaded: {
      root.injectPanel()
      Qt.callLater(root.injectPanel)
    }
  }

  // Only exists while detached — a real Window costs a compositor surface,
  // so it's not worth keeping alive (unlike the docked panel, which stays
  // loaded-but-hidden the whole time the shell runs).
  Loader {
    id: detachedLoader
    active: root.detached
    source: Qt.resolvedUrl("DetachedWindow.qml")
    onLoaded: root.injectDetachedWindow()
  }

  IpcHandler {
    target: root.moduleName

    function open(): void { root.open() }
    function close(): void { root.close() }
    function show(): void { root.open() }
    function hide(): void { root.close() }
    function toggle(): void { root.toggle() }
    function detach(): void { root.requestDetach() }
    function reattach(): void { root.requestReattach() }
  }

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    labelVisible: false
    hasVisualContent: true
    active: root.alerting
    tooltipText: root.summaryLine()
    fixedWidth: root.vertical ? -1 : Math.round(content.implicitWidth + scaledHorizontalMargin * 2)
    fixedHeight: root.vertical ? Math.round(content.implicitHeight + scaledVerticalPadding * 2) : -1
    onPressed: function(b) { root.toggle() }

    Row {
      id: content
      anchors.centerIn: parent
      spacing: Style.space(3)

      // Paused sits beside the skyline rather than replacing it, unlike an
      // alert: the size of the city is still the truth, it has simply stopped
      // changing. Dimmed and still, so it reads as stopped rather than as
      // something wanting attention.
      Text {
        visible: root.paused && !root.alerting
        text: "\uf04c"
        color: button.activeColor
        opacity: 0.55
        font.family: root.bar ? root.bar.fontFamily : Style.font.family
        font.pixelSize: Style.bar.iconFont
        anchors.verticalCenter: parent.verticalCenter
      }

      // The alert glyph replaces the skyline rather than sitting beside it:
      // bar space is scarce, and when the city is on fire its size is not
      // the thing worth reporting.
      Text {
        visible: root.alerting
        text: root.icon
        color: button.activeColor
        font.family: root.bar ? root.bar.fontFamily : Style.font.family
        font.pixelSize: Style.bar.iconFont
        anchors.verticalCenter: parent.verticalCenter

        // A slow breath, not a blink — noticeable in peripheral vision
        // without demanding attention the way a flashing icon would.
        SequentialAnimation on opacity {
          running: root.alerting
          loops: Animation.Infinite
          NumberAnimation { from: 1.0; to: 0.45; duration: 900; easing.type: Easing.InOutSine }
          NumberAnimation { from: 0.45; to: 1.0; duration: 900; easing.type: Easing.InOutSine }
        }
      }

      Row {
        id: skyline
        visible: !root.alerting
        anchors.verticalCenter: parent.verticalCenter
        spacing: 1

        Repeater {
          model: 5
          Rectangle {
            required property int index
            width: 2
            height: root.skylineBarHeight(index)
            anchors.bottom: parent.bottom
            color: button.active && button.useActiveColor ? button.activeColor : button.foreground

            Behavior on height {
              NumberAnimation { duration: 500; easing.type: Easing.OutCubic }
            }
          }
        }
      }

      Text {
        id: populationLabel
        text: String(root.population)
        color: button.active && button.useActiveColor ? button.activeColor : button.foreground
        font.family: root.bar ? root.bar.fontFamily : Style.font.family
        font.pixelSize: Style.bar.iconFont
        anchors.verticalCenter: parent.verticalCenter

        // Unseen-event badge: rides the population label so it never widens
        // the widget, and is deliberately absent while an alert is showing —
        // the alert already says "look at me".
        Rectangle {
          visible: root.unseenCount > 0 && !root.alerting
          width: Style.space(4); height: width
          radius: width / 2
          color: button.activeColor
          anchors.right: parent.right
          anchors.rightMargin: -Style.space(2)
          anchors.top: parent.top
          anchors.topMargin: -Style.space(1)
        }
      }
    }
  }
}
