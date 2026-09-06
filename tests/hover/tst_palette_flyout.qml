import QtQuick
import QtQuick.Controls as Controls
import QtTest

// The real containment, not an isolated button: the palette is a Grid inside a
// Column inside a Row, and the map is the Row's *next* sibling with its own
// hover-enabled MouseArea covering it. A tier flyout anchored to a button's
// right edge therefore hangs over the map, and for a left-column button it
// hangs over the button beside it. Both cases are reproduced here.
Item {
  id: scene
  width: 700; height: 400

  property string flyoutType: ""
  property bool clicked: false

  Row {
    id: mapRow
    anchors.fill: parent
    spacing: 8

    Column {
      id: paletteColumn
      z: 5
      spacing: 6

      Grid {
        id: toolPalette
        columns: 2
        spacing: 6

        Repeater {
          model: [
            { type: "park", tiers: true },
            { type: "road", tiers: false },
            { type: "power", tiers: true },
            { type: "water", tiers: true }
          ]

          Rectangle {
            id: toolButton
            required property var modelData
            required property int index
            z: scene.flyoutType === modelData.type ? 10 : 0
            width: 34; height: 34
            color: "#333"

            MouseArea {
              id: toolMouse
              anchors.fill: parent
              hoverEnabled: true
              onEntered: {
                closeFlyout.stop()
                if (toolButton.modelData.tiers) openFlyout.restart()
                else scene.flyoutType = ""
              }
              onExited: { openFlyout.stop(); closeFlyout.restart() }
            }
            Timer {
              id: openFlyout
              interval: 180
              onTriggered: if (toolMouse.containsMouse) scene.flyoutType = toolButton.modelData.type
            }
            Timer {
              id: closeFlyout
              interval: 300
              onTriggered: if (!toolMouse.containsMouse && !flyoutHover.hovered
                && !flyoutBlocker.containsMouse
                && scene.flyoutType === toolButton.modelData.type) scene.flyoutType = ""
            }

            Item {
              id: tierFlyout
              objectName: "flyout_" + toolButton.modelData.type
              visible: scene.flyoutType === toolButton.modelData.type
              anchors.left: parent.right
              anchors.verticalCenter: parent.verticalCenter
              width: 220; height: 72
              z: 200

              MouseArea {
                id: flyoutBlocker
                anchors.fill: parent
                hoverEnabled: true
              }
              HoverHandler { id: flyoutHover }

              Rectangle {
                x: 6; width: 214; height: 72
                color: "#222"
                MouseArea {
                  id: choice
                  objectName: "choice_" + toolButton.modelData.type
                  x: 15; y: 10; width: 30; height: 30
                  hoverEnabled: true
                  onClicked: scene.clicked = true
                }
              }
            }

            // ToolHint is a Controls.ToolTip — a Popup, in the window's
            // overlay layer, positioned at exactly the same x as the flyout.
            Controls.ToolTip {
              objectName: "hint_" + toolButton.modelData.type
              visible: toolMouse.containsMouse
              delay: 450
              timeout: -1
              width: 256
              x: parent ? parent.width + 6 : 0
              y: -height - 4
              text: "hint"
            }
          }
        }
      }
    }

    // The map: declared after the palette, hover-enabled, covering everything
    // the flyout hangs over.
    Item {
      id: map
      width: 500; height: 400
      MouseArea {
        id: gridMouse
        anchors.fill: parent
        hoverEnabled: true
        preventStealing: true
      }
    }
  }

  TestCase {
    name: "PaletteFlyoutReachable"
    when: windowShown

    // Left column: the flyout hangs over the right-column button beside it.
    function test_left_column_flyout_survives_the_reach() {
      scene.flyoutType = "";
      var btn = findChild(scene, "flyout_park").parent;
      mouseMove(btn, 15, 15); wait(300);
      compare(scene.flyoutType, "park", "flyout opened");
      var fly = findChild(scene, "flyout_park");
      mouseMove(fly, 3, 36); wait(400);
      compare(scene.flyoutType, "park", "the bridge gap keeps it open");
      var ch = findChild(scene, "choice_park");
      mouseMove(ch, 15, 15); wait(500);
      compare(scene.flyoutType, "park", "hovering a choice keeps it open");
      mouseClick(ch, 15, 15);
      verify(scene.clicked, "and the choice is clickable");

      // The part of the flyout that hangs over the MAP, not over the palette.
      // The palette column is only as wide as its buttons; the flyout is far
      // wider, and the earlier assertions only ever touched the near edge.
      scene.flyoutType = ""; wait(400);
      mouseMove(btn, 15, 15); wait(300);
      compare(scene.flyoutType, "park", "reopened");
      mouseMove(fly, 190, 36); wait(500);
      compare(scene.flyoutType, "park",
        "the far end of the flyout, over the map, must still hold the pointer");
    }

    // Right column: the flyout hangs over the map, which has its own
    // hover-enabled MouseArea.
    function test_right_column_flyout_survives_the_map() {
      scene.flyoutType = ""; scene.clicked = false;
      var btn = findChild(scene, "flyout_water").parent;
      mouseMove(btn, 15, 15); wait(300);
      compare(scene.flyoutType, "water", "flyout opened over the map");
      var ch = findChild(scene, "choice_water");
      mouseMove(ch, 15, 15); wait(500);
      compare(scene.flyoutType, "water", "the map does not steal the hover");
      mouseClick(ch, 15, 15);
      verify(scene.clicked, "and the choice is clickable over the map");
    }
  }
}
