import QtQuick
import Quickshell
import qs.Commons
import qs.Ui

Panel {
  id: root
  moduleName: "io.github.keithnyc.omaville"
  ipcTarget: "io.github.keithnyc.omaville"
  manageIpc: false

  property var anchorItem: null
  property var hostWidget: null

  readonly property var cityService: bar && bar.shell
    ? bar.shell.serviceFor("io.github.keithnyc.omaville")
    : null

  function switchPanel(direction) {
    if (root.bar && typeof root.bar.switchPanelFrom === "function")
      return root.bar.switchPanelFrom(root.hostWidget || root, direction)
    return false
  }

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.hostWidget || root
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    // Wider than the map's own viewportWidth (560) to leave room for the
    // vertical tool palette now sitting beside it rather than above it.
    contentWidth: panel.fittedContentWidth(Style.space(680))
    contentHeight: panel.fittedContentHeight(Style.space(860), Style.space(860))

    PanelKeyCatcher {
      id: keyCatcher
      blocked: cityView.editingTownName
      anchors.fill: parent
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }

      CityView {
        id: cityView
        anchors.fill: parent
        cityService: root.cityService
        bar: root.bar
        active: root.opened
        // Docked-only sizing: compact two-column palette and reserve the
        // actual header/footer height rather than overflowing a fixed map.
        viewportWidth: Math.max(180, width - Style.space(82))
        viewportHeight: Math.max(180, height - mapTop - footerHeight - Style.space(20))
        onDetachRequested: if (root.hostWidget) root.hostWidget.requestDetach()
      }
    }
  }
}
