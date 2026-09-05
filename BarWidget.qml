import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui

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

  readonly property string icon: budgetCrisis ? "󰀦" : ""

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
    active: root.budgetCrisis
    tooltipText: root.serviceReady
      ? root.cityService.cityName + " · pop " + root.population
        + " · $" + root.treasury + " · " + root.cityService.happiness + "% happy"
      : "Omaville"
    fixedWidth: root.vertical ? -1 : Math.round(content.implicitWidth + scaledHorizontalMargin * 2)
    fixedHeight: root.vertical ? Math.round(content.implicitHeight + scaledVerticalPadding * 2) : -1
    onPressed: function(b) { root.toggle() }

    Row {
      id: content
      anchors.centerIn: parent
      spacing: Style.space(3)

      Row {
        id: skyline
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
        text: root.budgetCrisis ? root.icon : String(root.population)
        color: button.active && button.useActiveColor ? button.activeColor : button.foreground
        font.family: root.bar ? root.bar.fontFamily : Style.font.family
        font.pixelSize: Style.bar.iconFont
        anchors.verticalCenter: parent.verticalCenter
      }
    }
  }
}
