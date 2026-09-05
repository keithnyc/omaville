import QtQuick
import QtQuick.Controls as Controls
import qs.Commons

Controls.ToolTip {
  id: root
  delay: 450
  timeout: -1
  padding: Style.space(8)
  width: Style.space(256)
  x: parent ? parent.width + Style.space(6) : 0
  y: -height - Style.space(4)
  contentItem: Text {
    text: root.text
    textFormat: Text.PlainText
    color: Color.menu.text
    font.family: Style.font.family
    font.pixelSize: Style.font.caption
    wrapMode: Text.WordWrap
  }
  background: Rectangle {
    color: Color.menu.background
    border.color: Color.menu.border
    radius: Style.space(4)
  }
}
