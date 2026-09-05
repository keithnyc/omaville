import QtQuick
import QtTest

Item {
  id: scene
  width: 500; height: 300
  property bool opened: true
  property bool clicked: false
  Rectangle {
    id: button
    x: 20; y: 100; width: 34; height: 34
    MouseArea {
      id: toolMouse
      anchors.fill: parent; hoverEnabled: true
      onEntered: closeFlyout.stop()
      onExited: closeFlyout.restart()
    }
    Item {
      id: tierFlyout
      visible: opened
      anchors.left: parent.right
      anchors.verticalCenter: parent.verticalCenter
      width: 220; height: 72
      HoverHandler {
        id: flyoutHover
        onHoveredChanged: {
          if (hovered) closeFlyout.stop()
          else closeFlyout.restart()
        }
      }
      Rectangle {
        x: 6; width: 214; height: 72
        MouseArea {
          id: choice
          x: 15; y: 10; width: 30; height: 30
          hoverEnabled: true
          onClicked: scene.clicked = true
        }
      }
    }
  }
  Timer {
    id: closeFlyout
    interval: 300
    onTriggered: if (!toolMouse.containsMouse && !flyoutHover.hovered) opened = false
  }
  TestCase {
    name: "FlyoutPointerRetention"
    when: windowShown
    function test_hover() {
      mouseMove(toolMouse, 15, 15); wait(50)
      mouseMove(tierFlyout, 3, 36); wait(450)
      verify(opened, "Gap keeps flyout open")
      mouseMove(choice, 15, 15); wait(2200)
      verify(opened, "Hovered choice stays open beyond close timeout")
      verify(flyoutHover.hovered, "Ancestor handler sees child MouseArea")
      mouseClick(choice, 15, 15)
      verify(clicked)
      mouseMove(tierFlyout, 190, 60); wait(450)
      verify(opened, "Blank flyout background keeps it open")
      mouseMove(button, 350, 150); wait(450)
      verify(!opened, "Leaving closes flyout")
    }
  }
}
