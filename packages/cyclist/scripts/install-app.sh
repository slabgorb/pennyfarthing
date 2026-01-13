#!/usr/bin/env bash
#
# Install Cyclist.app to /Applications (macOS only)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CYCLIST_DIR="$(dirname "$SCRIPT_DIR")"
RELEASE_DIR="$CYCLIST_DIR/release"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check we're on macOS
if [[ "$(uname)" != "Darwin" ]]; then
    log_error "This script is for macOS only"
    exit 1
fi

# Find the built app
APP_PATH=""
if [[ -d "$RELEASE_DIR/mac-arm64/Cyclist.app" ]]; then
    APP_PATH="$RELEASE_DIR/mac-arm64/Cyclist.app"
elif [[ -d "$RELEASE_DIR/mac/Cyclist.app" ]]; then
    APP_PATH="$RELEASE_DIR/mac/Cyclist.app"
elif [[ -d "$RELEASE_DIR/mac-x64/Cyclist.app" ]]; then
    APP_PATH="$RELEASE_DIR/mac-x64/Cyclist.app"
fi

if [[ -z "$APP_PATH" ]]; then
    log_error "Cyclist.app not found in $RELEASE_DIR"
    log_error "Run 'just cyclist-package' first to build the app"
    exit 1
fi

log_info "Found $APP_PATH"

# Remove existing installation
if [[ -d "/Applications/Cyclist.app" ]]; then
    log_warn "Removing existing /Applications/Cyclist.app"
    rm -rf "/Applications/Cyclist.app"
fi

# Copy to Applications
log_info "Installing to /Applications/Cyclist.app"
cp -R "$APP_PATH" "/Applications/"

# Clear quarantine attribute (app is locally built)
xattr -cr "/Applications/Cyclist.app" 2>/dev/null || true

log_info "Installation complete!"
echo ""
echo "Launch Cyclist from:"
echo "  - Spotlight: ⌘+Space, type 'Cyclist'"
echo "  - Applications folder"
echo "  - Terminal: open /Applications/Cyclist.app"
