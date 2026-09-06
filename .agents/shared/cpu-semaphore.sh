#!/usr/bin/env bash
# cpu-semaphore.sh — File-based semaphore for CPU-intensive operations
#
# Limits concurrent CPU-heavy tasks (tsc, vitest) across all pi agents.
# Uses atomic mkdir for lock acquisition (POSIX-safe).
#
# Usage:
#   source /path/to/cpu-semaphore.sh
#   sem_acquire "typecheck"   # blocks until a slot is available
#   bunx tsc --noEmit
#   sem_release "typecheck"
#
# Or wrap a command:
#   sem_run "typecheck" bunx tsc --noEmit
#
# Configuration:
#   PI_SEM_DIR       — semaphore directory (default: /tmp/pi-semaphore)
#   PI_SEM_MAX_SLOTS — max concurrent operations per category (default: 1)
#   PI_SEM_TIMEOUT   — max seconds to wait for a slot (default: 300)
#   PI_SEM_POLL      — seconds between poll attempts (default: 3)

PI_SEM_DIR="${PI_SEM_DIR:-/tmp/pi-semaphore}"
PI_SEM_MAX_SLOTS="${PI_SEM_MAX_SLOTS:-1}"
PI_SEM_TIMEOUT="${PI_SEM_TIMEOUT:-300}"
PI_SEM_POLL="${PI_SEM_POLL:-3}"

_sem_init() {
  mkdir -p "$PI_SEM_DIR" 2>/dev/null
}

# Clean up stale locks from dead processes
_sem_clean_stale() {
  local category="$1"
  local slot_dir="$PI_SEM_DIR/$category"
  
  if [ ! -d "$slot_dir" ]; then
    return
  fi
  
  for lock in "$slot_dir"/slot-*; do
    [ -e "$lock" ] || continue
    local pid_file="$lock/pid"
    if [ -f "$pid_file" ]; then
      local pid
      pid=$(cat "$pid_file" 2>/dev/null)
      # If the process that holds this lock is dead, remove it
      if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then
        rm -rf "$lock" 2>/dev/null
      fi
    else
      # No pid file = stale lock
      rm -rf "$lock" 2>/dev/null
    fi
  done
}

# Count active slots for a category
_sem_count() {
  local category="$1"
  local slot_dir="$PI_SEM_DIR/$category"
  
  if [ ! -d "$slot_dir" ]; then
    echo 0
    return
  fi
  
  local count=0
  for lock in "$slot_dir"/slot-*; do
    [ -d "$lock" ] && count=$((count + 1))
  done
  echo "$count"
}

# Acquire a semaphore slot. Blocks until available or timeout.
# Sets _SEM_SLOT_PATH for release.
sem_acquire() {
  local category="$1"
  local max_slots="${2:-$PI_SEM_MAX_SLOTS}"
  local timeout="${3:-$PI_SEM_TIMEOUT}"
  
  _sem_init
  mkdir -p "$PI_SEM_DIR/$category" 2>/dev/null
  
  local start_time
  start_time=$(date +%s)
  local my_id="$$-$(date +%s%N 2>/dev/null || echo $RANDOM)"
  
  while true; do
    # Clean stale locks from dead processes
    _sem_clean_stale "$category"
    
    local current
    current=$(_sem_count "$category")
    
    if [ "$current" -lt "$max_slots" ]; then
      # Try to acquire a slot (mkdir is atomic)
      local slot_path="$PI_SEM_DIR/$category/slot-$my_id"
      if mkdir "$slot_path" 2>/dev/null; then
        echo $$ > "$slot_path/pid"
        echo "$category" > "$slot_path/category"
        date +%s > "$slot_path/acquired_at"
        _SEM_SLOT_PATH="$slot_path"
        return 0
      fi
    fi
    
    # Check timeout
    local now
    now=$(date +%s)
    local elapsed=$((now - start_time))
    if [ "$elapsed" -ge "$timeout" ]; then
      echo "SEMAPHORE TIMEOUT: waited ${elapsed}s for '$category' slot (max $max_slots concurrent)" >&2
      return 1
    fi
    
    sleep "$PI_SEM_POLL"
  done
}

# Release the currently held semaphore slot
sem_release() {
  if [ -n "$_SEM_SLOT_PATH" ] && [ -d "$_SEM_SLOT_PATH" ]; then
    rm -rf "$_SEM_SLOT_PATH" 2>/dev/null
    _SEM_SLOT_PATH=""
  fi
}

# Run a command with semaphore protection
# Usage: sem_run "category" [max_slots] -- command args...
sem_run() {
  local category="$1"
  shift
  
  local max_slots="$PI_SEM_MAX_SLOTS"
  if [[ "$1" =~ ^[0-9]+$ ]]; then
    max_slots="$1"
    shift
  fi
  
  # Skip "--" separator if present
  [ "$1" = "--" ] && shift
  
  sem_acquire "$category" "$max_slots"
  local acq_status=$?
  if [ $acq_status -ne 0 ]; then
    return $acq_status
  fi
  
  "$@"
  local cmd_status=$?
  
  sem_release
  return $cmd_status
}

# Show current semaphore status
sem_status() {
  _sem_init
  echo "=== PI Semaphore Status ==="
  echo "Directory: $PI_SEM_DIR"
  
  if [ ! -d "$PI_SEM_DIR" ]; then
    echo "No semaphores active."
    return
  fi
  
  for category_dir in "$PI_SEM_DIR"/*/; do
    [ -d "$category_dir" ] || continue
    local category
    category=$(basename "$category_dir")
    _sem_clean_stale "$category"
    local count
    count=$(_sem_count "$category")
    echo "  $category: $count active slots"
    
    for lock in "$category_dir"/slot-*; do
      [ -d "$lock" ] || continue
      local pid
      pid=$(cat "$lock/pid" 2>/dev/null || echo "unknown")
      local acquired
      acquired=$(cat "$lock/acquired_at" 2>/dev/null || echo "unknown")
      echo "    - PID $pid (acquired at $acquired)"
    done
  done
}

# Clean all semaphores (use when resetting after a crash)
sem_clean_all() {
  rm -rf "$PI_SEM_DIR" 2>/dev/null
  echo "All semaphores cleaned."
}

# Trap to release on exit (for scripts that source this file)
_sem_cleanup_on_exit() {
  sem_release
}
trap _sem_cleanup_on_exit EXIT
