import QtQuick
import QtQuick.Window
import qs.Commons

// A genuine resizable, tileable XDG toplevel — not a layer-shell popup
// like everything else in this plugin — so the map can actually get
// bigger when the window does. Confirmed viable with an isolated `qs -p`
// spike before building this: Hyprland sees a plain QtQuick Window as a
// normal client (tileable, resizable, floatable), same as any other app.
Window {
  id: root

  property var cityService: null
  // BarWidget, so this window can hand control back to the docked panel
  // on "dock" or on the window simply being closed by the compositor.
  property var hostWidget: null

  visible: true
  readonly property string cityLabel: cityService && cityService.cityName ? cityService.cityName : ""
  title: cityLabel !== "" && cityLabel !== "Omaville" ? cityLabel + " — Omaville" : "Omaville"
  width: 900
  height: 720
  minimumWidth: 480
  minimumHeight: 420
  color: Color.background

  onClosing: function(closeEvent) {
    if (root.hostWidget) root.hostWidget.requestReattach()
  }

  CityView {
    anchors.fill: parent
    anchors.margins: 10
    cityService: root.cityService
    active: root.visible
    detached: true
    // Reserves rough space for the header/stats/footer rows above and below
    // the canvas, and — now that the tool palette sits beside the map
    // rather than above it — for the palette column's own width too. An
    // estimate, not an exact layout computation, since CityView's own
    // Flickable absorbs the difference if it's off.
    viewportWidth: Math.max(300, width - 20 - 46)
    viewportHeight: Math.max(300, height - 190)
    onReattachRequested: if (root.hostWidget) root.hostWidget.requestReattach()
  }
}
