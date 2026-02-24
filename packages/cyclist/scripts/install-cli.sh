#!/usr/bin/env bash
#
# Install 'cyclist' CLI command to /usr/local/bin
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CYCLIST_DIR="$(dirname "$SCRIPT_DIR")"
CLI_PATH="/usr/local/bin/cyclist"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Verify build exists
if [[ ! -f "$CYCLIST_DIR/dist/server.js" ]]; then
    log_error "Cyclist not built. Run 'just cyclist-build' first."
    exit 1
fi

# Check if existing CLI points to a different location
if [[ -f "$CLI_PATH" ]]; then
    EXISTING_PATH=$(grep "^CYCLIST_ROOT=" "$CLI_PATH" 2>/dev/null | cut -d'"' -f2 || echo "")
    if [[ -n "$EXISTING_PATH" && "$EXISTING_PATH" != "$CYCLIST_DIR" ]]; then
        log_warn "Existing CLI points to different location:"
        log_warn "  Current:  $EXISTING_PATH"
        log_warn "  New:      $CYCLIST_DIR"
        log_warn "Replacing with new location. Remove old installation if needed:"
        log_warn "  sudo rm $CLI_PATH"
        echo ""
    fi
fi

# Create /usr/local/bin if needed
if [[ ! -d "/usr/local/bin" ]]; then
    log_info "Creating /usr/local/bin (may require sudo)"
    sudo mkdir -p /usr/local/bin
fi

# Create CLI wrapper script
log_info "Installing CLI to $CLI_PATH"

# Check if we need sudo
if [[ -w "/usr/local/bin" ]]; then
    SUDO=""
else
    SUDO="sudo"
    log_warn "Requires sudo to write to /usr/local/bin"
fi

$SUDO tee "$CLI_PATH" > /dev/null << EOF
#!/usr/bin/env bash
#
# Cyclist CLI - Launch Cyclist web server for a project
#
# Usage: cyclist [project_dir]
#        cyclist --help
#

set -euo pipefail

CYCLIST_ROOT="$CYCLIST_DIR"

show_help() {
    echo "Cyclist - Visual terminal for Claude Code"
    echo ""
    echo "Usage:"
    echo "  cyclist [project_dir]    Start Cyclist server for project"
    echo "  cyclist --help           Show this help"
    echo ""
    echo "Examples:"
    echo "  cyclist                  Use current directory"
    echo "  cyclist ~/projects/app   Use specified directory"
    echo ""
    echo "The project must be initialized with Pennyfarthing (.claude/ directory)."
}

if [[ "\${1:-}" == "--help" ]] || [[ "\${1:-}" == "-h" ]]; then
    show_help
    exit 0
fi

PROJECT_DIR="\${1:-\$PWD}"

# Resolve to absolute path
PROJECT_DIR="\$(cd "\$PROJECT_DIR" && pwd)"

if [[ ! -d "\$PROJECT_DIR/.claude" ]]; then
    echo "Error: Not a Pennyfarthing project (no .claude/ directory)"
    echo "Initialize with: cd \$PROJECT_DIR && pf setup"
    exit 1
fi

echo "🚴 Starting Cyclist for: \$PROJECT_DIR"
echo "   Server: http://localhost:1898 (or next available port)"
echo ""

cd "\$CYCLIST_ROOT"
CYCLIST_PROJECT_DIR="\$PROJECT_DIR" node dist/server.js
EOF

$SUDO chmod +x "$CLI_PATH"

log_info "Installation complete!"
echo ""
echo "Usage:"
echo "  cyclist              # Use current directory"
echo "  cyclist /path/to/project"
echo "  cyclist --help"
