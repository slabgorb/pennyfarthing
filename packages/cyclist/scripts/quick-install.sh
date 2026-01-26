#!/usr/bin/env bash
# quick-install.sh - Fast rebuild and install Cyclist.app
# Skips DMG creation for faster dev iterations
#
# Usage: ./scripts/quick-install.sh [--no-build]

set -euo pipefail

cd "$(dirname "$0")/.."

# Parse args
NO_BUILD=false
[[ "${1:-}" == "--no-build" ]] && NO_BUILD=true

# Quit existing
osascript -e 'quit app "Cyclist"' 2>/dev/null || true

if [[ "$NO_BUILD" != "true" ]]; then
    echo "Building..."
    npm run build

    echo "Packaging (--dir, no DMG)..."
    npx electron-builder --dir -c.npmRebuild=false
fi

echo "Installing..."
rm -rf /Applications/Cyclist.app
cp -R release/mac-arm64/Cyclist.app /Applications/

echo "Launching..."
open -a Cyclist

echo "Done!"
