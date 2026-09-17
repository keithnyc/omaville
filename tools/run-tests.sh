#!/usr/bin/env bash
# Every test in the project, in one command.
#
# The reason this exists is the QtQuick half. Run bare, qmltestrunner opens
# real windows on the desktop: they pop up in front of whatever you are doing,
# and — worse — the desktop pointer sitting over one of them delivers genuine
# hover events that race the synthetic ones the tests send, so the flyout tests
# fail at random with no bug to find. Offscreen they are silent, and the suite
# runs to the same time every go. Forgetting the environment is the whole
# failure mode, so nobody should be typing it by hand.
set -u
cd "$(dirname "$0")/.." || exit 1

QMLTESTRUNNER=/usr/lib/qt6/bin/qmltestrunner
export QT_QPA_PLATFORM=offscreen
export QT_QUICK_BACKEND=software

failures=0
for t in tests/*.mjs; do
  if ! out=$(node "$t" 2>&1); then
    failures=$((failures + 1))
    printf 'FAIL %s\n%s\n\n' "$t" "$out"
  fi
done

if ! out=$("$QMLTESTRUNNER" -input tests/hover 2>&1); then
  failures=$((failures + 1))
  printf 'FAIL tests/hover\n%s\n\n' "$out"
fi
printf '%s\n' "$(printf '%s' "$out" | grep '^Totals' || echo 'tests/hover: no totals reported')"

if [ "$failures" -eq 0 ]; then
  echo "PASS: $(ls tests/*.mjs | wc -l) model tests and the hover suite."
else
  echo "$failures failing."
fi
exit $((failures > 0))
