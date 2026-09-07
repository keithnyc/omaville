// The tick reads derived bindings immediately after assigning what they
// depend on: Service sets `root.grid = result.grid` and then reads
// `root.cityStats` to judge the sustainability goal, rather than calling
// summarize a second time on the same grid.
//
// That is only correct if a QML binding is re-evaluated synchronously when its
// dependency is assigned, rather than being deferred to the next frame. It is
// — but it is an assumption worth failing loudly if it ever stops holding,
// because the symptom would be a goal judged against last month's city, which
// nothing else would report.
import QtQuick
import QtTest

Item {
  id: root
  property var source: [1]
  readonly property var derived: root.source.length * 10

  function assignThenRead() {
    var before = root.derived
    root.source = [1, 2, 3]
    return { before: before, after: root.derived }
  }

  TestCase {
    name: "BindingFreshness"

    function test_a_binding_is_current_the_moment_its_dependency_is_assigned() {
      var r = root.assignThenRead()
      compare(r.before, 10, "the binding starts from the original value")
      compare(r.after, 30,
        "reading a derived binding right after assigning its dependency gives the new value")
    }
  }
}
