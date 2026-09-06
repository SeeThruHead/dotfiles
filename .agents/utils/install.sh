#!/usr/bin/env bash
# Install pi-skills utils — symlinks CLIs to ~/.local/bin
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BIN_DIR="${HOME}/.local/bin"

mkdir -p "$BIN_DIR"

# pi-sandbox
ln -sf "$SCRIPT_DIR/pi-sandbox/pi-sandbox" "$BIN_DIR/pi-sandbox"
echo "  pi-sandbox -> $BIN_DIR/pi-sandbox"

echo ""
echo "Done. Make sure ~/.local/bin is on your PATH."
