#!/usr/bin/env bash
# Pennyfarthing installer — installs pf CLI for org members.
# Usage: curl -fsSL https://raw.githubusercontent.com/1898andCo/pennyfarthing/main/pennyfarthing-dist/scripts/install.sh | bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[pf]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[pf]${NC} $1"; }
log_error() { echo -e "${RED}[pf]${NC} $1"; }

# --- Step 1: Check GitHub auth ---
has_gh_auth() {
    if command -v gh &>/dev/null && gh auth status &>/dev/null 2>&1; then
        return 0
    fi
    if [[ -n "${HOMEBREW_GITHUB_API_TOKEN:-}" ]]; then
        return 0
    fi
    return 1
}

if ! has_gh_auth; then
    log_error "GitHub authentication required (private repo)."
    echo ""
    echo "  Option 1: Install gh and authenticate"
    echo "    brew install gh && gh auth login"
    echo ""
    echo "  Option 2: Set a personal access token"
    echo "    export HOMEBREW_GITHUB_API_TOKEN=ghp_..."
    echo ""
    exit 1
fi

# --- Step 2: Install pf ---
OS="$(uname -s)"

if [[ "$OS" == "Darwin" ]] && command -v brew &>/dev/null; then
    # macOS with Homebrew — preferred path
    log_info "Installing via Homebrew..."

    # Ensure tap is added
    if ! brew tap 2>/dev/null | grep -q 1898andco/pf; then
        brew tap 1898andco/pf
    fi

    brew install pennyfarthing

elif command -v uv &>/dev/null; then
    log_info "Installing via uv..."
    uv tool install "pennyfarthing-scripts @ git+https://github.com/1898andCo/pennyfarthing.git"

elif command -v pipx &>/dev/null; then
    log_info "Installing via pipx..."
    pipx install "git+https://github.com/1898andCo/pennyfarthing.git"

elif command -v pip &>/dev/null; then
    log_info "Installing via pip..."
    pip install "git+https://github.com/1898andCo/pennyfarthing.git"

else
    log_error "No supported package manager found."
    echo "  Install one of: brew (macOS), uv, pipx, or pip"
    exit 1
fi

# --- Step 3: Verify ---
if ! command -v pf &>/dev/null; then
    # uv/pipx install to ~/.local/bin which may not be on PATH
    export PATH="$HOME/.local/bin:$PATH"
fi

if command -v pf &>/dev/null; then
    PF_VERSION=$(pf --version 2>/dev/null || echo "unknown")
    log_info "Installed pf $PF_VERSION"
    echo ""
    echo "  Next steps:"
    echo "    cd your-project"
    echo "    pf init"
    echo ""
else
    log_error "Installation completed but 'pf' not found on PATH."
    echo "  Try: export PATH=\"\$HOME/.local/bin:\$PATH\""
    exit 1
fi
