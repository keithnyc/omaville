import QtQuick
import Quickshell
import Quickshell.Io
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
  readonly property string labelText: root.icon + " " + root.population

  readonly property bool opened: panelLoader.item
    ? panelLoader.item.opened === true
    : false
  readonly property bool popoutSwitchClosing: panelLoader.item
    ? panelLoader.item.popoutSwitchClosing === true
    : false

  function open() {
    if (panelLoader.item) panelLoader.item.open()
  }

  function close() {
    if (panelLoader.item) panelLoader.item.close()
  }

  function toggle() {
    if (panelLoader.item) panelLoader.item.toggle()
  }

  function closeForPopoutSwitch() {
    if (panelLoader.item) panelLoader.item.closeForPopoutSwitch()
  }

  function injectPanel() {
    if (!panelLoader.item) return
    panelLoader.item.bar = root.bar
    panelLoader.item.anchorItem = button
    panelLoader.item.hostWidget = root
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

  IpcHandler {
    target: root.moduleName

    function open(): void { root.open() }
    function close(): void { root.close() }
    function show(): void { root.open() }
    function hide(): void { root.close() }
    function toggle(): void { root.toggle() }
  }

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: root.labelText
    active: root.budgetCrisis
    tooltipText: root.serviceReady
      ? root.cityService.cityName + " · pop " + root.population
        + " · $" + root.treasury + " · " + root.cityService.happiness + "% happy"
      : "Omaville"
    onPressed: function(b) { root.toggle() }
  }
}
