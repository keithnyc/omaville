import QtQuick
import qs.Commons

// One story on the front page: an engraved spot illustration, a headline and
// the line the city log actually recorded. The illustration is optional by
// design — the page has to read correctly before the art exists, and a story
// with no matching engraving simply runs as text.
Item {
  id: root
  property var story: null
  property bool lead: false
  property string serif: "Noto Serif"
  property color ink: "#221e18"
  property color faded: "#5f5648"
  // See CityView.gazetteArt: gated until the engravings exist, so a missing
  // file cannot fill the journal with warnings on every repaint.
  property bool art: false

  implicitHeight: layout.implicitHeight
  height: implicitHeight

  Row {
    id: layout
    width: parent.width
    spacing: Style.space(8)

    Image {
      id: spot
      // The engravings are dense; below about 44px the hatching fills in and
      // a fire stops reading as a fire.
      width: root.lead ? Style.space(72) : Style.space(46)
      height: width
      source: root.art && root.story
        ? Qt.resolvedUrl("assets/gazette/spot-" + root.story.spot + ".png") : ""
      fillMode: Image.PreserveAspectFit
      visible: status === Image.Ready
      smooth: true
    }

    Column {
      width: layout.width - (spot.visible ? spot.width + layout.spacing : 0)
      spacing: Style.space(2)

      Text {
        width: parent.width
        text: root.story ? root.story.headline : ""
        wrapMode: Text.WordWrap
        color: root.ink
        font.family: root.serif
        font.bold: true
        font.pixelSize: root.lead ? Style.font.body + Style.space(2) : Style.font.bodySmall
      }
      Text {
        width: parent.width
        text: root.story ? root.story.body : ""
        wrapMode: Text.WordWrap
        color: root.ink
        font.family: root.serif
        font.pixelSize: Style.font.caption
      }
      Text {
        width: parent.width
        text: root.story ? root.story.dateline : ""
        color: root.faded
        font.family: root.serif
        font.italic: true
        font.pixelSize: Style.font.caption
      }
    }
  }
}
