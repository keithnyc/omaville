import QtQuick
import QtQuick.Controls as Controls
import qs.Commons
import "Model.js" as Model

FocusScope {
  id: root
  property var rows: []
  property bool active: true
  // Buildings that cover only what another building already covers. Reported
  // here because this is the card a player already checks to decide whether
  // they need another station — and it is the only place the answer "you have
  // three too many" can arrive before they build a fourth.
  property var redundancy: []
  readonly property var spare: Model.redundantTotal(root.redundancy)
  // Optional services (transit) are shown in the full list but never rotated as
  // a shortage — nobody is going unserved by a bus they were never promised.
  readonly property var shortages: rows.filter(function(row) {
    return row.unmet > 0 && !row.optional
  })
  property int currentIndex: 0
  readonly property var current: shortages.length ? shortages[currentIndex % shortages.length] : null
  // A gap outranks waste: somebody going unserved is the more urgent fact.
  readonly property string summary: current
    ? current.name + " " + current.coverage + "% covered · " + current.unmet + " residents unserved"
    : root.spare.count > 0
      ? "All covered · " + root.spare.count + (root.spare.count === 1 ? " spare building · " : " spare buildings · ")
        + Model.money(root.spare.refund) + " back"
      : rows.length && rows[0].residents > 0 ? "All residential services covered" : "No populated homes yet"
  // implicitHeight so a caller placing this beside another card can read its
  // natural size and match the two; height still defaults to it when nobody does.
  implicitHeight: summaryText.implicitHeight + Style.space(16)
  height: implicitHeight
  activeFocusOnTab: true
  Accessible.role: Accessible.Button
  Accessible.name: "Service coverage. " + summary + ". Open full list."
  Keys.onReturnPressed: details.open()
  Keys.onSpacePressed: details.open()
  onRowsChanged: { fade.stop(); summaryText.opacity = 1; currentIndex %= Math.max(1, shortages.length) }
  onActiveChanged: if (!active) { fade.stop(); summaryText.opacity = 1; details.close() }

  Rectangle {
    anchors.fill: parent
    radius: Style.space(4)
    color: mouse.containsMouse ? Qt.rgba(0.5, 0.6, 0.6, 0.12) : "transparent"
    border.width: 1
    border.color: root.activeFocus ? Color.accent : Qt.rgba(0.5, 0.6, 0.6, 0.2)
  }
  Text {
    id: summaryText
    x: Style.space(8)
    anchors.verticalCenter: parent.verticalCenter
    width: Math.max(0, parent.width - more.width - Style.space(28))
    text: root.summary
    wrapMode: Text.WordWrap
    color: root.current ? "#e4bd78" : root.spare.count > 0 ? "#9fb8d0" : "#7ac4b1"
    font.family: Style.font.family
    font.pixelSize: Style.font.caption
  }
  Text {
    id: more
    anchors.right: parent.right
    anchors.rightMargin: Style.space(8)
    anchors.verticalCenter: parent.verticalCenter
    text: "All " + root.rows.length + " ▾"
    color: Color.menu.text
    font.pixelSize: Style.font.caption
  }
  MouseArea {
    id: mouse
    anchors.fill: parent
    hoverEnabled: true
    cursorShape: Qt.PointingHandCursor
    onClicked: { root.forceActiveFocus(); details.open() }
    onEntered: { fade.stop(); summaryText.opacity = 1 }
  }
  Timer {
    interval: 4500
    repeat: true
    running: root.active && root.visible && !mouse.containsMouse && !details.visible && root.shortages.length > 1
    onTriggered: fade.start()
  }
  SequentialAnimation {
    id: fade
    NumberAnimation { target: summaryText; property: "opacity"; to: 0; duration: 180 }
    ScriptAction { script: root.currentIndex = (root.currentIndex + 1) % Math.max(1, root.shortages.length) }
    NumberAnimation { target: summaryText; property: "opacity"; to: 1; duration: 220 }
  }
  Controls.Popup {
    id: details
    y: root.height + Style.space(4)
    width: Math.min(root.width, Style.space(410))
    padding: Style.space(12)
    focus: true
    closePolicy: Controls.Popup.CloseOnEscape | Controls.Popup.CloseOnPressOutside
    onOpened: { fade.stop(); summaryText.opacity = 1 }
    background: Rectangle {
      color: Color.menu.background
      border.color: Color.menu.border
      radius: Style.space(6)
    }
    contentItem: Column {
      spacing: Style.space(10)
      Text { text: "Service coverage"; color: Color.menu.text; font.bold: true; font.pixelSize: Style.font.bodySmall }
      Text {
        width: parent.width
        text: "Share of residents within range. Businesses and undeveloped zones are not counted."
        wrapMode: Text.WordWrap
        color: Color.menu.text
        font.pixelSize: Style.font.caption
      }
      // Only ever shown when there is something to demolish, and only for the
      // services where a duplicate genuinely does nothing. Fire is absent on
      // purpose: a second station closer to a fire puts it out faster, so it
      // is never spare.
      Column {
        visible: root.spare.count > 0
        width: parent.width
        spacing: Style.space(3)
        Text {
          text: "Spare buildings"
          color: Color.menu.text
          font.bold: true
          font.pixelSize: Style.font.caption
        }
        Text {
          width: parent.width
          text: "These cover only blocks another building already covers. Demolishing them "
            + "changes nobody's service, refunds " + Model.money(root.spare.refund)
            + " and saves " + Model.money(root.spare.saving) + " a month."
          wrapMode: Text.WordWrap
          color: "#9fb8d0"
          font.pixelSize: Style.font.caption
        }
        Repeater {
          model: root.redundancy
          Text {
            required property var modelData
            width: parent.width
            text: "· " + modelData.label + ": " + modelData.removable.length
              + " of " + modelData.total + " (" + Model.money(modelData.refund) + " back)"
            wrapMode: Text.WordWrap
            color: Color.menu.text
            font.pixelSize: Style.font.caption
          }
        }
        Item { width: 1; height: Style.space(4) }
      }
      Repeater {
        model: root.rows
        Column {
          required property var modelData
          width: parent.width
          spacing: Style.space(3)
          // An optional service reports reach, not shortfall: "42% reached" is
          // a fact about the network, where "4300 unserved" would accuse the
          // player of neglecting something nobody is owed.
          readonly property bool lacking: modelData.unmet > 0 && !modelData.optional
          Text {
            width: parent.width
            text: modelData.optional
              ? modelData.name + " · " + modelData.coverage + "% reached"
              : modelData.name + " · " + modelData.coverage + "% · " + modelData.unmet + " unserved"
            wrapMode: Text.WordWrap
            color: parent.lacking ? "#e4bd78" : "#7ac4b1"
            font.pixelSize: Style.font.caption
          }
          Rectangle {
            width: parent.width; height: Style.space(4); radius: height / 2
            color: Qt.rgba(0.5, 0.6, 0.6, 0.2)
            Rectangle {
              width: parent.width * modelData.coverage / 100; height: parent.height; radius: height / 2
              color: parent.parent.lacking ? "#d5ab67" : "#7ac4b1"
            }
          }
        }
      }
    }
  }
}
