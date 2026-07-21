#!/usr/bin/env bash
#
# LeakScan — double-click launcher.
#
# Drag this file to your Desktop or Dock. Double-click it when you sit down in an
# agency: it checks everything, starts the console, and opens the browser.
#
# Written for the actual working conditions: laptop closed between meetings,
# switching between mobile hotspot and office wifi, no terminal in front of a
# prospect.

cd "$(dirname "$0")" || exit 1

PORT="${LEAKSCAN_WEB_PORT:-5250}"
GREEN=$'\033[32m'; RED=$'\033[31m'; YELLOW=$'\033[33m'; BOLD=$'\033[1m'; OFF=$'\033[0m'

clear
echo ""
echo "  ${BOLD}LeakScan${OFF}"
echo ""

# --- Is the console already running? ------------------------------------------
# After a sleep/wake cycle the server usually survives. Starting a second one
# would fail on the port and look like a crash.
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "  ${GREEN}Console already running.${OFF}"
  open "http://localhost:$PORT/ops"
  echo ""
  echo "  Opened http://localhost:$PORT/ops"
  echo ""
  echo "  ${BOLD}Leave this window open.${OFF} Closing it stops the console."
  echo "  Press Ctrl-C to stop."
  echo ""
  # Keep the window alive so closing it is a deliberate act.
  while lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; do sleep 5; done
  exit 0
fi

# --- Preflight ----------------------------------------------------------------
echo "  Checking everything…"
echo ""
npm run --silent preflight
PREFLIGHT=$?

echo ""
if [ $PREFLIGHT -ne 0 ]; then
  echo "  ${RED}${BOLD}NOT READY.${OFF} Fix what's listed above."
  echo ""
  echo "  Most common causes:"
  echo "    · No internet        → connect your hotspot, then double-click again"
  echo "    · API key expired    → paste a new one into leakscan/.env"
  echo ""
  echo "  ${YELLOW}You can still DEMO without internet${OFF} — the sample report and PDF"
  echo "  work offline. You just can't run a new scan until you're online."
  echo ""
  read -r -p "  Start the console anyway (demo only)? [y/N] " ANSWER
  case "$ANSWER" in
    [yY]*) echo "" ;;
    *) echo ""; exit 1 ;;
  esac
fi

# --- Start ---------------------------------------------------------------------
echo "  Starting the console…"
npm run --silent web &
SERVER_PID=$!

# Wait for the port rather than sleeping a fixed guess — a cold start after a
# reboot is much slower than a warm one.
for _ in $(seq 1 40); do
  if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then break; fi
  sleep 0.25
done

if ! lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo ""
  echo "  ${RED}The console did not start.${OFF} Scroll up for the error."
  echo ""
  read -r -p "  Press Return to close."
  exit 1
fi

open "http://localhost:$PORT/ops"

echo ""
echo "  ${GREEN}${BOLD}Ready.${OFF}  http://localhost:$PORT/ops"
echo ""
echo "  ${BOLD}Leave this window open all day.${OFF}"
echo "  Closing it stops the console. Closing the laptop lid is fine."
echo ""

# Stop the server if this window is closed or Ctrl-C'd, rather than leaving an
# orphan holding the port.
trap 'kill $SERVER_PID 2>/dev/null' EXIT INT TERM
wait $SERVER_PID
