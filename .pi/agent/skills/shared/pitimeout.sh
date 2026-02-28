#!/usr/bin/env bash
# pitimeout.sh — Portable timeout for macOS (no coreutils needed)
#
# Usage:
#   source ~/.pi/agent/skills/shared/pitimeout.sh
#   pitimeout <seconds> <command> [args...]
#
# Examples:
#   pitimeout 600 pi -p "do stuff" --no-session
#   pitimeout 300 bunx tsc --noEmit
#
# On timeout, kills the process and exits with code 143.

pitimeout() {
  local duration="$1"
  shift

  local tmpfile
  tmpfile=$(mktemp /tmp/pitimeout.XXXXXX)

  # Run the command in a subshell that records its PID
  (
    echo $$ > "$tmpfile.cmd"
    exec "$@"
  ) &
  local cmd_pid=$!

  # Watchdog in subshell
  (
    echo $$ > "$tmpfile.wd"
    trap 'exit 0' TERM HUP
    sleep "$duration" &
    local sleep_pid=$!
    echo $sleep_pid > "$tmpfile.sleep"
    wait $sleep_pid 2>/dev/null
    # If we get here, timeout elapsed
    kill -TERM "$cmd_pid" 2>/dev/null
    sleep 2
    kill -9 "$cmd_pid" 2>/dev/null
  ) &
  local watchdog_pid=$!

  # Wait for the command to finish
  wait "$cmd_pid" 2>/dev/null
  local exit_code=$?

  # Kill the watchdog and its sleep child
  kill "$watchdog_pid" 2>/dev/null
  # Also kill the sleep directly
  local sleep_pid
  sleep_pid=$(cat "$tmpfile.sleep" 2>/dev/null)
  [ -n "$sleep_pid" ] && kill "$sleep_pid" 2>/dev/null
  wait "$watchdog_pid" 2>/dev/null

  # Cleanup temp files
  rm -f "$tmpfile" "$tmpfile.cmd" "$tmpfile.wd" "$tmpfile.sleep" 2>/dev/null

  return $exit_code
}
