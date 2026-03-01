#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "🔒 Secret Guard Test Suite"
echo "=========================="

npx --yes tsx "$DIR/test/test.ts"
