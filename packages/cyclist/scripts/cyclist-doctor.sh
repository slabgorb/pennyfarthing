#!/usr/bin/env bash
#
# Cyclist Health Check - Validates Cyclist setup and diagnoses issues
#
# Usage: ./cyclist-doctor.sh [--fix] [--help]
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CYCLIST_DIR="$(dirname "$SCRIPT_DIR")"
MONOREPO_ROOT="$(cd "$CYCLIST_DIR/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Counters
PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

# Fix mode
FIX_MODE=false

# =============================================================================
# Logging Functions
# =============================================================================

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((PASS_COUNT++)) || true
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((FAIL_COUNT++)) || true
    if [[ -n "${2:-}" ]]; then
        echo -e "       ${BLUE}Fix:${NC} $2"
    fi
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
    ((WARN_COUNT++)) || true
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

# =============================================================================
# Help
# =============================================================================

show_help() {
    cat << EOF
Cyclist Doctor - Health Check for Cyclist Setup

Usage: $0 [OPTIONS]

Options:
  --fix       Auto-fix issues where possible
  -h, --help  Show this help message

Checks performed:
  - System prerequisites (Node.js, pnpm, Python 3, Xcode tools, just)
  - Build state (dist/server.js, dist/main.js)
  - Native modules (node-pty prebuild and loadability)
  - Electron compatibility with node-pty
  - Workspace dependencies (@pennyfarthing/core, @pennyfarthing/shared)
  - Port 1898 availability

Exit codes:
  0  All checks passed
  1  One or more checks failed

Examples:
  $0              Run health check
  $0 --fix        Run health check and auto-fix issues
EOF
}

# =============================================================================
# Argument Parsing
# =============================================================================

while [[ $# -gt 0 ]]; do
    case $1 in
        --fix)
            FIX_MODE=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# =============================================================================
# Check Functions
# =============================================================================

check_node() {
    echo ""
    log_info "Checking Node.js..."

    if ! command -v node &> /dev/null; then
        log_fail "Node.js not found" "brew install node OR use nvm"
        if [[ "$FIX_MODE" == true ]]; then
            log_info "Attempting to install Node.js via brew..."
            brew install node || true
        fi
        return
    fi

    local node_version
    node_version=$(node --version | sed 's/v//')
    local major_version
    major_version=$(echo "$node_version" | cut -d. -f1)

    if [[ "$major_version" -lt 18 ]]; then
        log_fail "Node.js version $node_version is below minimum (18)" "brew install node OR nvm install 18"
        if [[ "$FIX_MODE" == true ]]; then
            log_info "Attempting to upgrade Node.js..."
            brew upgrade node || true
        fi
    else
        log_pass "Node.js $node_version (>= 18 required)"
    fi
}

check_pnpm() {
    echo ""
    log_info "Checking pnpm..."

    if ! command -v pnpm &> /dev/null; then
        log_fail "pnpm not found" "npm install -g pnpm OR corepack enable"
        if [[ "$FIX_MODE" == true ]]; then
            log_info "Attempting to install pnpm..."
            npm install -g pnpm || corepack enable || true
        fi
        return
    fi

    local pnpm_version
    pnpm_version=$(pnpm --version)
    log_pass "pnpm $pnpm_version"
}

check_python3() {
    echo ""
    log_info "Checking Python 3..."

    if ! command -v python3 &> /dev/null; then
        log_fail "Python 3 not found (required for native module compilation)" "brew install python3"
        if [[ "$FIX_MODE" == true ]]; then
            log_info "Attempting to install Python 3..."
            brew install python3 || true
        fi
        return
    fi

    local python_version
    python_version=$(python3 --version 2>&1 | awk '{print $2}')
    log_pass "Python $python_version"
}

check_xcode() {
    echo ""
    log_info "Checking Xcode Command Line Tools..."

    if [[ "$(uname)" != "Darwin" ]]; then
        log_info "Skipping Xcode check (not macOS)"
        return
    fi

    if ! xcode-select -p &> /dev/null; then
        log_fail "Xcode Command Line Tools not installed" "xcode-select --install"
        if [[ "$FIX_MODE" == true ]]; then
            log_info "Attempting to install Xcode Command Line Tools..."
            xcode-select --install || true
        fi
        return
    fi

    log_pass "Xcode Command Line Tools installed"
}

check_just() {
    echo ""
    log_info "Checking just command runner..."

    if ! command -v just &> /dev/null; then
        log_fail "just not found" "brew install just"
        if [[ "$FIX_MODE" == true ]]; then
            log_info "Attempting to install just..."
            brew install just || true
        fi
        return
    fi

    local just_version
    just_version=$(just --version | awk '{print $2}')
    log_pass "just $just_version"
}

check_build_state() {
    echo ""
    log_info "Checking build state..."

    local has_error=false

    if [[ ! -f "$CYCLIST_DIR/dist/server.js" ]]; then
        log_fail "dist/server.js not found" "just cyclist-build OR npm run build"
        has_error=true
    else
        log_pass "dist/server.js exists"
    fi

    if [[ ! -f "$CYCLIST_DIR/dist/main.js" ]]; then
        log_fail "dist/main.js not found" "just cyclist-build OR npm run build"
        has_error=true
    else
        log_pass "dist/main.js exists"
    fi

    if [[ "$has_error" == true ]] && [[ "$FIX_MODE" == true ]]; then
        log_info "Attempting to build Cyclist..."
        (cd "$CYCLIST_DIR" && npm run build) || true
    fi
}

check_node_pty() {
    echo ""
    log_info "Checking node-pty native module..."

    # Detect platform and architecture
    local os
    local arch
    os=$(uname -s | tr '[:upper:]' '[:lower:]')
    arch=$(uname -m)

    # Map architecture names
    if [[ "$arch" == "x86_64" ]]; then
        arch="x64"
    elif [[ "$arch" == "aarch64" ]] || [[ "$arch" == "arm64" ]]; then
        arch="arm64"
    fi

    local prebuild_dir="$CYCLIST_DIR/node_modules/node-pty/prebuilds/${os}-${arch}"

    if [[ ! -d "$prebuild_dir" ]]; then
        log_fail "node-pty prebuild not found for ${os}-${arch}" "pnpm install from monorepo root"
        return
    fi

    if [[ ! -f "$prebuild_dir/pty.node" ]]; then
        log_fail "node-pty pty.node not found in prebuilds" "just cyclist-rebuild OR npx electron-rebuild"
        return
    fi

    log_pass "node-pty prebuild exists for ${os}-${arch}"

    # Check if node-pty is loadable
    log_info "Testing node-pty loadability..."

    if node -e "require('$CYCLIST_DIR/node_modules/node-pty')" 2>/dev/null; then
        log_pass "node-pty loads successfully"
    else
        log_fail "node-pty failed to load (ABI mismatch?)" "just cyclist-rebuild OR npx electron-rebuild"
        if [[ "$FIX_MODE" == true ]]; then
            log_info "Attempting to rebuild node-pty for Electron..."
            (cd "$CYCLIST_DIR" && npx electron-rebuild) || true
        fi
    fi
}

check_electron_compat() {
    echo ""
    log_info "Checking Electron compatibility..."

    local electron_version
    local package_json="$CYCLIST_DIR/package.json"

    if [[ ! -f "$package_json" ]]; then
        log_fail "package.json not found" "Check Cyclist installation"
        return
    fi

    # Extract Electron version from package.json
    electron_version=$(grep -o '"electron":\s*"[^"]*"' "$package_json" | grep -o '[0-9][^"]*' | head -1)

    if [[ -z "$electron_version" ]]; then
        log_warn "Could not determine Electron version from package.json"
        return
    fi

    log_pass "Electron version $electron_version configured"

    # Check node-pty compatibility with Electron
    # The electron-rebuild ensures ABI compatibility between Electron and node-pty
    if [[ -d "$CYCLIST_DIR/node_modules/node-pty/build" ]]; then
        log_pass "node-pty appears rebuilt for Electron (ABI compat)"
    else
        log_info "node-pty using prebuilds (should be compatible)"
    fi
}

check_workspace_deps() {
    echo ""
    log_info "Checking workspace dependencies..."

    local node_modules="$CYCLIST_DIR/node_modules/@pennyfarthing"

    # Check @pennyfarthing/core symlink
    local core_link="$node_modules/core"
    if [[ -L "$core_link" ]]; then
        if [[ -d "$core_link" ]]; then
            log_pass "@pennyfarthing/core symlink valid"
        else
            log_fail "@pennyfarthing/core symlink broken" "pnpm install from monorepo root"
        fi
    else
        log_fail "@pennyfarthing/core not found" "pnpm install from monorepo root"
    fi

    # Check @pennyfarthing/shared symlink
    local shared_link="$node_modules/shared"
    if [[ -L "$shared_link" ]]; then
        if [[ -d "$shared_link" ]]; then
            log_pass "@pennyfarthing/shared symlink valid"
        else
            log_fail "@pennyfarthing/shared symlink broken" "pnpm install from monorepo root"
        fi
    else
        log_fail "@pennyfarthing/shared not found" "pnpm install from monorepo root"
    fi

    if [[ "$FIX_MODE" == true ]] && [[ $FAIL_COUNT -gt 0 ]]; then
        log_info "Attempting to fix workspace dependencies..."
        (cd "$MONOREPO_ROOT" && pnpm install) || true
    fi
}

check_port() {
    echo ""
    log_info "Checking port 1898 availability..."

    if command -v lsof &> /dev/null; then
        if lsof -i :1898 &> /dev/null; then
            log_warn "Port 1898 is in use (Cyclist will auto-select next available port)"
            lsof -i :1898 | head -2 || true
        else
            log_pass "Port 1898 is available"
        fi
    elif command -v netstat &> /dev/null; then
        if netstat -an | grep -q ":1898 "; then
            log_warn "Port 1898 is in use (Cyclist will auto-select next available port)"
        else
            log_pass "Port 1898 is available"
        fi
    else
        log_warn "Cannot check port 1898 (lsof/netstat not available)"
    fi
}

# =============================================================================
# Main
# =============================================================================

main() {
    echo ""
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║           Cyclist Doctor - Health Check                      ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"

    if [[ "$FIX_MODE" == true ]]; then
        echo -e "${YELLOW}Running in FIX mode - will attempt to auto-fix issues${NC}"
    fi

    # Run all checks
    check_node
    check_pnpm
    check_python3
    check_xcode
    check_just
    check_build_state
    check_node_pty
    check_electron_compat
    check_workspace_deps
    check_port

    # Summary
    echo ""
    echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}Summary:${NC}"
    echo -e "  ${GREEN}Passed:${NC}  $PASS_COUNT"
    echo -e "  ${RED}Failed:${NC}  $FAIL_COUNT"
    echo -e "  ${YELLOW}Warnings:${NC} $WARN_COUNT"
    echo ""

    if [[ $FAIL_COUNT -eq 0 ]]; then
        echo -e "${GREEN}All checks passed! Cyclist is ready to run.${NC}"
        echo ""
        echo "Start Cyclist with:"
        echo "  just cyclist-electron    # Electron app"
        echo "  just cyclist-web /path   # Web mode"
        exit 0
    else
        echo -e "${RED}$FAIL_COUNT check(s) failed. Please fix the issues above.${NC}"
        if [[ "$FIX_MODE" == false ]]; then
            echo ""
            echo "Tip: Run with --fix to attempt automatic fixes:"
            echo "  $0 --fix"
        fi
        exit 1
    fi
}

main "$@"
