#!/usr/bin/env bash

# Live logging with preserved interactive terminal.
# The real task exit status is reported separately.

set +e

LOG="/tmp/nomogenesis_last_run.log"
STATUS="/tmp/nomogenesis_last_run.status"

echo "RUNNING" > "$STATUS"

echo "========================================"
echo " NOMOGENESIS LIVE SAFE RUNNER"
echo "========================================"

bash -euo pipefail -s 2>&1 | tee "$LOG"

CODES=("${PIPESTATUS[@]}")
RESULT="${CODES[0]}"

if [ "${CODES[1]}" -ne 0 ] && [ "$RESULT" -eq 0 ]; then
    RESULT="${CODES[1]}"
fi

echo
echo "========================================"

if [ "$RESULT" -eq 0 ]; then
    echo "RESULT: PASS"
    echo "PASS" > "$STATUS"
else
    echo "RESULT: FAIL"
    echo "CHILD EXIT CODE: $RESULT"
    echo "FAIL: $RESULT" > "$STATUS"

    echo "=== ERROR SUMMARY ==="
    grep -n -E \
      '^error|FAILED|panicked at|AssertionError|Traceback' \
      "$LOG" | tail -25 || true
fi

echo "FULL LOG: $LOG"
echo "TERMINAL: PRESERVED"
echo "========================================"

exit 0
