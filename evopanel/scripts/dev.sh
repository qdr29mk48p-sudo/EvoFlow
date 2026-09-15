#!/usr/bin/env bash
# EvoPanel development launcher. Usage: ./scripts/dev.sh [web|tauri]

set -euo pipefail

cd "$(dirname "$0")/.."

MODE="${1:-tauri}"

cleanup() {
  echo "Cleaning up previous EvoPanel development processes..."
  pkill -f "vite.*evopanel" 2>/dev/null || true
  pkill -f "target/debug/evopanel" 2>/dev/null || true
  lsof -ti:1421 | xargs kill -9 2>/dev/null || true
  sleep 0.5
}

cleanup

case "$MODE" in
  web)
    echo "Starting the Vite frontend at http://127.0.0.1:1421"
    exec npx vite --host 127.0.0.1 --port 1421 --strictPort
    ;;
  tauri)
    echo "Starting the EvoFlow Tauri desktop application..."
    exec npm run tauri dev
    ;;
  *)
    echo "Usage: $0 [web|tauri]" >&2
    echo "  web   Start only the Vite frontend." >&2
    echo "  tauri Start the complete Tauri desktop application (default)." >&2
    exit 1
    ;;
esac
