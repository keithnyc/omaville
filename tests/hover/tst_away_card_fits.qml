// The "while you were away" card must fit the panel, and its buttons must stay
// reachable however much happened.
//
// A day at the desk fills the city log to its cap of twenty-four entries. Each
// wraps to four or five lines in a card this narrow, so the card grew to about
// three thousand pixels: it covered the whole panel, nothing behind it could
// be clicked, and "Got it" sat far below the bottom of the screen with no way
// to reach it. Every other card in the panel clamps to the parent; this one
// did not, because it was the only one whose height is set by how much
// happened rather than by what it contains.
//
// Geometry, so it is tested by measuring rather than by reading the source.
import QtQuick
import QtTest

Item {
  id: root
  width: 420; height: 520

  property int entryCount: 24
  readonly property var entries: {
    var out = []
    for (var i = 0; i < root.entryCount; i++)
      out.push({ m: i * 12,
        text: "Mayor — the water treatment SCADA box just kernel panicked: " +
              "It's up. For now. Ops has started a betting pool on when it panics again." })
    return out
  }

  Rectangle {
    id: card
    anchors.centerIn: parent
    width: Math.min(parent.width - 32, 360)
    height: Math.min(parent.height - 32,
      header.implicitHeight + list.contentHeight + actions.implicitHeight + 48)

    Column {
      id: column
      anchors.fill: parent
      anchors.margins: 16
      spacing: 8

      Text { id: header; text: "While you were away"; font.pixelSize: 14 }

      Flickable {
        id: list
        width: parent.width
        height: Math.max(0, column.height - header.height - actions.height - column.spacing * 2)
        contentHeight: entries.implicitHeight
        clip: true
        Column {
          id: entries
          width: parent.width
          spacing: 8
          Repeater {
            model: root.entries
            Text {
              required property var modelData
              width: entries.width
              text: modelData.text
              wrapMode: Text.WordWrap
              font.pixelSize: 11
            }
          }
        }
      }

      Row {
        id: actions
        spacing: 8
        Rectangle { id: gotIt; width: 70; height: 26; color: "#456" }
        Rectangle { width: 90; height: 26; color: "#456" }
      }
    }
  }

  TestCase {
    name: "AwayCardFits"
    when: windowShown

    function test_a_full_log_still_fits_the_panel() {
      root.entryCount = 24
      wait(60)
      verify(list.contentHeight > root.height,
        "the fixture is realistic: 24 wrapped entries are taller than the panel " +
        "(" + Math.round(list.contentHeight) + "px of content in " + root.height + "px)")
      compare(card.height <= root.height - 32, true,
        "but the card is clamped to the panel — it was " + Math.round(card.height) + "px")
      verify(list.contentHeight > list.height, "so the list scrolls")
    }

    function test_the_way_out_is_always_on_screen() {
      root.entryCount = 24
      wait(60)
      var bottom = actions.mapToItem(root, 0, actions.height).y
      verify(bottom <= root.height,
        "the buttons sit inside the panel at " + Math.round(bottom) +
        "px, not below its " + root.height + "px edge")
      var top = actions.mapToItem(root, 0, 0).y
      verify(top >= 0 && top < root.height, "and are not pushed off the top either")
    }

    function test_a_quiet_night_does_not_leave_a_tall_empty_card() {
      root.entryCount = 1
      wait(60)
      verify(card.height < root.height - 32,
        "one entry gives a small card, not a full-height one (" +
        Math.round(card.height) + "px)")
    }
  }
}
