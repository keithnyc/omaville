import QtQuick
import Quickshell
import qs.Commons
import qs.Ui
import "Model.js" as Model

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
  readonly property bool serviceReady: !!cityService && cityService.initialized === true
  readonly property var grid: cityService ? cityService.grid : []
  readonly property int gridSize: cityService ? cityService.gridSize : Model.GRID_SIZE
  readonly property int population: cityService ? cityService.population : 0
  readonly property int jobs: cityService ? cityService.jobs : 0
  readonly property real treasury: cityService ? cityService.treasury : 0
  readonly property int happiness: cityService ? cityService.happiness : 0
  readonly property int taxRatePercent: cityService ? cityService.taxRatePercent : 10

  // Model tile-type char for the currently selected tool, or the sentinel
  // "bulldoze" for the clear tool.
  property string activeTool: Model.TILE_ROAD

  readonly property var toolList: [
    { type: Model.TILE_ROAD, label: "Road" },
    { type: Model.TILE_RES, label: "Res" },
    { type: Model.TILE_COM, label: "Com" },
    { type: Model.TILE_IND, label: "Ind" },
    { type: Model.TILE_PARK, label: "Park" },
    { type: "bulldoze", label: "Clear" }
  ]

  function switchPanel(direction) {
    if (root.bar && typeof root.bar.switchPanelFrom === "function")
      return root.bar.switchPanelFrom(root.hostWidget || root, direction)
    return false
  }

  // Fixed, non-theme hues for zone types — the point is to read the city
  // at a glance the way SimCity's palette always has, in either theme.
  // Road/empty use a translucent tint of the bar foreground instead, so
  // the grid itself still sits naturally in light or dark.
  function neutralTint(alpha) {
    var fg = root.bar ? root.bar.foreground : Color.foreground
    return Qt.rgba(fg.r, fg.g, fg.b, alpha)
  }

  function levelColor(hex, level) {
    var factor = Math.max(1.0, 2.1 - level * 0.35)
    return Qt.lighter(hex, factor)
  }

  function tileColor(type, level) {
    switch (type) {
    case Model.TILE_ROAD: return neutralTint(0.5)
    case Model.TILE_RES: return levelColor("#3fae4a", level)
    case Model.TILE_COM: return levelColor("#2f8fd6", level)
    case Model.TILE_IND: return levelColor("#d69a2f", level)
    case Model.TILE_PARK: return "#3aa66b"
    default: return neutralTint(0.08)
    }
  }

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.hostWidget || root
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(430))
    contentHeight: panel.fittedContentHeight(content.implicitHeight, Style.space(640))

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }

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

            Text {
              width: parent.width - taxRow.implicitWidth - parent.spacing
              text: root.serviceReady ? root.cityService.cityName : "Omaville"
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
          }

          Row {
            width: parent.width
            spacing: Style.space(14)

            Text {
              text: "Pop " + root.population
              color: root.bar ? root.bar.foreground : Color.foreground
              font.family: root.bar ? root.bar.fontFamily : Style.font.family
              font.pixelSize: Style.font.bodySmall
            }
            Text {
              text: "Jobs " + root.jobs
              color: Qt.darker(root.bar ? root.bar.foreground : Color.foreground, 1.2)
              font.family: root.bar ? root.bar.fontFamily : Style.font.family
              font.pixelSize: Style.font.bodySmall
            }
            Text {
              text: "$" + Math.round(root.treasury)
              color: root.treasury < 0 ? Color.urgent : (root.bar ? root.bar.foreground : Color.foreground)
              font.family: root.bar ? root.bar.fontFamily : Style.font.family
              font.pixelSize: Style.font.bodySmall
            }
            Text {
              text: root.happiness + "% happy"
              color: root.happiness < 30 ? Color.urgent : Qt.darker(root.bar ? root.bar.foreground : Color.foreground, 1.2)
              font.family: root.bar ? root.bar.fontFamily : Style.font.family
              font.pixelSize: Style.font.bodySmall
            }
          }

          PanelSeparator {
            foreground: root.bar ? root.bar.foreground : Color.foreground
          }

          Row {
            width: parent.width
            spacing: Style.space(6)

            Repeater {
              model: root.toolList

              Rectangle {
                id: toolButton
                required property var modelData
                width: Style.space(58)
                height: Style.space(40)
                radius: Style.space(4)
                color: root.activeTool === modelData.type
                  ? Qt.rgba(Color.accent.r, Color.accent.g, Color.accent.b, 0.35)
                  : "transparent"
                border.width: 1
                border.color: root.activeTool === modelData.type
                  ? Color.accent
                  : root.neutralTint(0.35)

                Column {
                  anchors.centerIn: parent
                  spacing: 1
                  Text {
                    anchors.horizontalCenter: parent.horizontalCenter
                    text: toolButton.modelData.label
                    color: root.bar ? root.bar.foreground : Color.foreground
                    font.family: root.bar ? root.bar.fontFamily : Style.font.family
                    font.pixelSize: Style.font.caption
                    font.bold: root.activeTool === toolButton.modelData.type
                  }
                  Text {
                    anchors.horizontalCenter: parent.horizontalCenter
                    text: toolButton.modelData.type === "bulldoze"
                      ? "free" : ("$" + Model.COSTS[toolButton.modelData.type])
                    color: Qt.darker(root.bar ? root.bar.foreground : Color.foreground, 1.3)
                    font.family: root.bar ? root.bar.fontFamily : Style.font.family
                    font.pixelSize: Math.max(8, Style.font.caption - 2)
                  }
                }

                MouseArea {
                  anchors.fill: parent
                  onClicked: root.activeTool = toolButton.modelData.type
                }
              }
            }
          }

          Item {
            width: parent.width
            height: cityCanvas.height

            Canvas {
              id: cityCanvas
              anchors.horizontalCenter: parent.horizontalCenter
              readonly property int cellSize: 20
              width: root.gridSize * cellSize
              height: root.gridSize * cellSize

              property var gridData: root.grid
              onGridDataChanged: requestPaint()

              onPaint: {
                var ctx = getContext("2d")
                ctx.clearRect(0, 0, width, height)
                var data = gridData
                for (var i = 0; i < data.length; i++) {
                  var tile = Model.parseTile(data[i])
                  var gx = (i % root.gridSize) * cellSize
                  var gy = Math.floor(i / root.gridSize) * cellSize
                  ctx.fillStyle = root.tileColor(tile.type, tile.level)
                  ctx.fillRect(gx, gy, cellSize - 1, cellSize - 1)
                }
              }

              MouseArea {
                id: gridMouse
                anchors.fill: parent
                property bool painting: false

                function tileIndexAt(mx, my) {
                  var gx = Math.floor(mx / cityCanvas.cellSize)
                  var gy = Math.floor(my / cityCanvas.cellSize)
                  if (gx < 0 || gx >= root.gridSize || gy < 0 || gy >= root.gridSize) return -1
                  return gy * root.gridSize + gx
                }

                function applyAt(mx, my) {
                  var idx = tileIndexAt(mx, my)
                  if (idx < 0 || !root.cityService) return
                  if (root.activeTool === "bulldoze") root.cityService.bulldozeTile(idx)
                  else root.cityService.zoneTile(idx, root.activeTool)
                }

                onPressed: function(mouse) { painting = true; applyAt(mouse.x, mouse.y) }
                onPositionChanged: function(mouse) { if (painting) applyAt(mouse.x, mouse.y) }
                onReleased: function(mouse) { painting = false }
              }
            }
          }

          Text {
            width: parent.width
            horizontalAlignment: Text.AlignHCenter
            text: "Click or drag to build · roads first, zones grow along them"
            color: Qt.darker(root.bar ? root.bar.foreground : Color.foreground, 1.45)
            font.family: root.bar ? root.bar.fontFamily : Style.font.family
            font.pixelSize: Style.font.caption
          }
        }
      }
    }
  }
}
