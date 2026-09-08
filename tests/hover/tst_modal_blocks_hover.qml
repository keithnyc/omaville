// A card covering the map must stop the map hovering underneath it.
//
// With the Gazette open, moving the mouse across it went on reaching the map's
// hover area and the map kept popping tile tooltips out from behind the card.
// Two separate causes, both worth pinning:
//
//   1. The scrim over the map swallowed clicks but was not hoverEnabled, and a
//      MouseArea that is not hoverEnabled does not consume hover at all.
//   2. The map's hover condition kept its own hand-written list of which cards
//      were open, naming five of the twelve.
//
// This is the first cause. A string search cannot catch it — whether hover
// propagates is a fact about Qt's input routing, not about the source.
import QtQuick
import QtTest

Item {
  id: root
  width: 300; height: 200

  property bool cardOpen: false

  // Stands in for the map.
  MouseArea {
    id: map
    anchors.fill: parent
    hoverEnabled: true
  }

  // The same scrim as it used to be: click-swallowing, not hoverEnabled.
  property bool leakyOpen: false
  Item {
    anchors.fill: parent
    visible: root.leakyOpen
    MouseArea {
      id: leaky
      anchors.fill: parent
      acceptedButtons: Qt.AllButtons
    }
  }

  // Stands in for the modal overlay and its scrim.
  Item {
    anchors.fill: parent
    visible: root.cardOpen
    MouseArea {
      id: scrim
      anchors.fill: parent
      hoverEnabled: true
      acceptedButtons: Qt.AllButtons
    }
  }

  TestCase {
    name: "ModalBlocksHover"
    when: windowShown

    function test_a_card_takes_the_hover_off_the_map() {
      root.cardOpen = false
      mouseMove(root, 150, 100)
      tryCompare(map, "containsMouse", true, 500,
        "with nothing open the map hovers normally")

      root.cardOpen = true
      mouseMove(root, 151, 101)
      tryCompare(scrim, "containsMouse", true, 500, "the scrim takes the hover")
      tryCompare(map, "containsMouse", false, 500,
        "and the map underneath stops hovering — otherwise tooltips keep " +
        "appearing from behind the card")

      root.cardOpen = false
      mouseMove(root, 152, 102)
      tryCompare(map, "containsMouse", true, 500, "closing it gives the map back")
    }

    function test_the_original_bug_reproduces_without_hoverEnabled() {
      // Demonstrated rather than asserted: a scrim that swallows clicks but is
      // not hoverEnabled lets hover straight through to the map. This is what
      // the code did, and why "the card blocks clicks" was not enough.
      root.cardOpen = false
      root.leakyOpen = true
      mouseMove(root, 60, 60)
      tryCompare(leaky, "pressed", false, 500)
      tryCompare(map, "containsMouse", true, 500,
        "a scrim without hoverEnabled does not stop the map hovering — " +
        "which is exactly the bug this file exists for")
      root.leakyOpen = false
    }
  }
}
