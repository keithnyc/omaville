// Exercise the actual map MouseArea inside an overflowing Flickable.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const qml = fs.readFileSync(new URL('../CityView.qml', import.meta.url), 'utf8');
const mouse = qml.match(/          MouseArea \{\n            id: gridMouse[\s\S]*?\n          \}/)[0];
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omaville-map-input-'));
fs.writeFileSync(path.join(dir, 'tst_map.qml'), `
import QtQuick
import QtTest
Item {
  id: root
  width: 400; height: 300
  property string activeTool: "#"
  property int gridSize: 64
  property real effectiveCellSize: 10
  property real panX: 0
  property real panY: 0
  property real zoom: 1
  property int inspectedIndex: -1
  property var upgradeableTypes: []
  property int paints: 0
  property var cityService: ({ zoneTile: function(i, t) { root.paints++ } })
  // The real decision is tested in tests/post-office.mjs; here only which
  // tile it answers for, so a real press can be sent at one.
  property int mailTile: -1
  property bool mailOpen: false
  function pressOpensMail(index) { return index === mailTile }
  function clampPan() {}
  function setZoom(z) { zoom = z }
  Flickable {
    id: flick
    anchors.fill: parent
    contentWidth: width; contentHeight: 900
    Item {
      width: 400; height: 900
      ${mouse}
    }
  }
  TestCase {
    name: "MapDragOwnership"
    when: windowShown
    function drag(button) {
      mousePress(gridMouse, 100, 180, button)
      for (var y = 170; y >= 60; y -= 10) mouseMove(gridMouse, 100, y, 20)
      mouseRelease(gridMouse, 100, 60, button)
      wait(200)
    }
    function test_drawingAndPanning() {
      drag(Qt.LeftButton)
      compare(flick.contentY, 0, "Outer content must not scroll while drawing")
      compare(root.panY, 0)
      verify(root.paints > 2, "Drawing continues throughout drag")
      var painted = root.paints
      drag(Qt.MiddleButton)
      verify(root.panY > 0, "Middle drag still pans map")
      compare(flick.contentY, 0)
      compare(root.paints, painted)
      var pan = root.panY
      drag(Qt.LeftButton)
      compare(root.panY, pan, "Left drag cannot inherit panning state")
      gridMouse.painting = true; gridMouse.panning = true
      gridMouse.canceled()
      verify(!gridMouse.painting && !gridMouse.panning)
    }
    // A real press on a post office opens the mailbox — with a building tool
    // in hand and with none — and paints nothing. Clicking one used to do
    // nothing in either case.
    function test_pressOpensMail() {
      root.mailTile = gridMouse.tileIndexAt(100, 180)
      for (var k = 0; k < 2; k++) {
        root.activeTool = k === 0 ? "Y" : ""
        root.mailOpen = false
        var painted = root.paints
        mouseClick(gridMouse, 100, 180, Qt.LeftButton)
        wait(50)
        verify(root.mailOpen, "a press on a post office opens the mailbox with tool '" + root.activeTool + "'")
        compare(root.paints, painted, "and builds nothing")
      }
      root.mailTile = -1
      root.activeTool = "#"
    }
  }
}
`);
const result = spawnSync('/usr/lib/qt6/bin/qmltestrunner', ['-input', dir], {
  env: { ...process.env, QT_QPA_PLATFORM: 'offscreen', QT_QUICK_BACKEND: 'software' }, encoding: 'utf8'
});
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
process.exit(result.status ?? 1);
