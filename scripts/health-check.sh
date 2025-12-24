#!/bin/bash
# Pennyfarthing Health Check Script
# Usage: health-check.sh [--fix] [--json]
#
# Checks installation health and optionally applies fixes.
# For direct-install projects only (submodule support removed).

set -e

# Colors (disabled if not a terminal or --json)
if [ -t 1 ] && [ "${1:-}" != "--json" ]; then
    RED=$'\033[0;31m'
    GREEN=$'\033[0;32m'
    YELLOW=$'\033[0;33m'
    CYAN=$'\033[0;36m'
    RESET=$'\033[0m'
else
    RED="" GREEN="" YELLOW="" CYAN="" RESET=""
fi

FIX_MODE=false
JSON_MODE=false
for arg in "$@"; do
    case "$arg" in
        --fix) FIX_MODE=true ;;
        --json) JSON_MODE=true ;;
    esac
done

PROJECT_ROOT="${PROJECT_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
CLAUDE_DIR="$PROJECT_ROOT/.claude"

# JSON output accumulator
JSON_RESULTS=()

# Counters
ISSUES=0
WARNINGS=0
FIXES=0

check_pass() {
    if [ "$JSON_MODE" = true ]; then
        JSON_RESULTS+=("{\"name\":\"$1\",\"status\":\"pass\"}")
    else
        echo "${GREEN}✓${RESET} $1"
    fi
}

check_fail() {
    if [ "$JSON_MODE" = true ]; then
        JSON_RESULTS+=("{\"name\":\"$1\",\"status\":\"fail\",\"detail\":\"$2\"}")
    else
        echo "${RED}✗${RESET} $1"
        [ -n "$2" ] && echo "  ${RED}→${RESET} $2"
    fi
    ((ISSUES++)) || true
}

check_warn() {
    if [ "$JSON_MODE" = true ]; then
        JSON_RESULTS+=("{\"name\":\"$1\",\"status\":\"warn\",\"detail\":\"$2\"}")
    else
        echo "${YELLOW}!${RESET} $1"
        [ -n "$2" ] && echo "  ${YELLOW}→${RESET} $2"
    fi
    ((WARNINGS++)) || true
}

check_fixed() {
    if [ "$JSON_MODE" = true ]; then
        JSON_RESULTS+=("{\"name\":\"$1\",\"status\":\"fixed\"}")
    else
        echo "${GREEN}⚡${RESET} Fixed: $1"
    fi
    ((FIXES++)) || true
}

header() {
    [ "$JSON_MODE" = true ] && return
    echo ""
    echo "${CYAN}── $1 ──${RESET}"
}

# Start output
if [ "$JSON_MODE" != true ]; then
    echo "${CYAN}Pennyfarthing Health Check${RESET}"
    echo "Project: $PROJECT_ROOT"
    echo ""
fi

# ─────────────────────────────────────────────────────────────
# 1. Check for deprecated submodule
# ─────────────────────────────────────────────────────────────
header "Installation"

if [ -d "$CLAUDE_DIR/pennyfarthing" ]; then
    check_fail "Old submodule detected" ".claude/pennyfarthing/ should be removed"
    echo "  Run: pennyfarthing migrate"
    echo "  Or:  rm -rf .claude/pennyfarthing && git rm .claude/pennyfarthing"
else
    check_pass "No deprecated submodule"
fi

# Check manifest
if [ -f "$CLAUDE_DIR/manifest.json" ]; then
    VERSION=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$CLAUDE_DIR/manifest.json" | cut -d'"' -f4)
    check_pass "Manifest exists (v$VERSION)"
else
    check_warn "No manifest.json" "Run pennyfarthing init or update"
fi

# ─────────────────────────────────────────────────────────────
# 2. Core directories
# ─────────────────────────────────────────────────────────────
header "Core Files"

CORE_DIRS=("core/agents" "core/subagents" "core/commands" "core/guides" "personas" "skills")
for dir in "${CORE_DIRS[@]}"; do
    if [ -d "$CLAUDE_DIR/$dir" ]; then
        check_pass ".claude/$dir"
    else
        check_fail ".claude/$dir missing"
    fi
done

# Check symlinks
SYMLINKS=("agents:core/agents" "subagents:core/subagents" "commands:core/commands" "guides:core/guides")
for pair in "${SYMLINKS[@]}"; do
    link="${pair%%:*}"
    target="${pair##*:}"
    full_path="$CLAUDE_DIR/$link"

    if [ -L "$full_path" ]; then
        actual=$(readlink "$full_path")
        if [ "$actual" = "$target" ]; then
            check_pass ".claude/$link → $target"
        else
            check_warn ".claude/$link → $actual (expected $target)"
            if [ "$FIX_MODE" = true ]; then
                rm "$full_path"
                ln -sf "$target" "$full_path"
                check_fixed ".claude/$link"
            fi
        fi
    elif [ -d "$full_path" ]; then
        check_warn ".claude/$link is directory, not symlink"
    else
        check_fail ".claude/$link missing"
        if [ "$FIX_MODE" = true ] && [ -d "$CLAUDE_DIR/$target" ]; then
            ln -sf "$target" "$full_path"
            check_fixed ".claude/$link"
        fi
    fi
done

# ─────────────────────────────────────────────────────────────
# 3. Settings
# ─────────────────────────────────────────────────────────────
header "Settings"

# Check settings.local.json
SETTINGS_LOCAL="$CLAUDE_DIR/settings.local.json"
if [ -f "$SETTINGS_LOCAL" ]; then
    check_pass "settings.local.json exists"

    # Check for old submodule paths
    if grep -q '\.claude/pennyfarthing/' "$SETTINGS_LOCAL" 2>/dev/null; then
        check_fail "settings.local.json has old .claude/pennyfarthing/ paths"
        echo "  Update hooks to use: \$CLAUDE_PROJECT_DIR/scripts/hooks/"
    else
        check_pass "No deprecated paths in settings.local.json"
    fi

    # Check statusLine format
    if grep -q '"statusLine"' "$SETTINGS_LOCAL"; then
        if grep -q '"type": "command"' "$SETTINGS_LOCAL"; then
            check_pass "statusLine uses correct format"
        else
            check_warn "statusLine should use {type, command} format"
        fi
    fi
else
    check_fail "settings.local.json missing"
fi

# Also check settings.json for old paths
SETTINGS="$CLAUDE_DIR/settings.json"
if [ -f "$SETTINGS" ]; then
    if grep -q '\.claude/pennyfarthing/' "$SETTINGS" 2>/dev/null; then
        check_fail "settings.json has old .claude/pennyfarthing/ paths"
        echo "  Update hooks to use: \$CLAUDE_PROJECT_DIR/scripts/hooks/"
    fi
fi

# ─────────────────────────────────────────────────────────────
# 4. Scripts and Hooks
# ─────────────────────────────────────────────────────────────
header "Scripts & Hooks"

# Check key scripts exist
SCRIPTS=("scripts/agent-session.sh" "scripts/hooks/session-start.sh" "scripts/hooks/pre-edit-check.sh")
for script in "${SCRIPTS[@]}"; do
    full_path="$PROJECT_ROOT/$script"
    if [ -f "$full_path" ]; then
        if [ -x "$full_path" ]; then
            check_pass "$script"
        else
            check_warn "$script not executable"
            if [ "$FIX_MODE" = true ]; then
                chmod +x "$full_path"
                check_fixed "$script"
            fi
        fi
    else
        check_fail "$script missing"
    fi
done

# Check project setup-env.sh
SETUP_ENV="$CLAUDE_DIR/project/hooks/setup-env.sh"
if [ -f "$SETUP_ENV" ]; then
    if [ -x "$SETUP_ENV" ]; then
        check_pass ".claude/project/hooks/setup-env.sh"
    else
        check_warn ".claude/project/hooks/setup-env.sh not executable"
        if [ "$FIX_MODE" = true ]; then
            chmod +x "$SETUP_ENV"
            check_fixed "setup-env.sh"
        fi
    fi
else
    check_warn ".claude/project/hooks/setup-env.sh missing"
fi

# ─────────────────────────────────────────────────────────────
# 5. Directories
# ─────────────────────────────────────────────────────────────
header "Directories"

DIRS=("sprint" ".session" ".claude/project" ".claude/project/agents" ".claude/project/docs")
for dir in "${DIRS[@]}"; do
    full_path="$PROJECT_ROOT/$dir"
    if [ -d "$full_path" ]; then
        check_pass "$dir/"
    else
        check_warn "$dir/ missing"
        if [ "$FIX_MODE" = true ]; then
            mkdir -p "$full_path"
            check_fixed "$dir/"
        fi
    fi
done

# ─────────────────────────────────────────────────────────────
# 6. Statusline
# ─────────────────────────────────────────────────────────────
header "Statusline"

STATUSLINE="$CLAUDE_DIR/statusline.sh"
STATUSLINE_CORE="$CLAUDE_DIR/core/statusline.sh"

if [ -f "$STATUSLINE" ]; then
    if [ -x "$STATUSLINE" ]; then
        check_pass ".claude/statusline.sh"
    else
        check_warn ".claude/statusline.sh not executable"
        if [ "$FIX_MODE" = true ]; then
            chmod +x "$STATUSLINE"
            check_fixed "statusline.sh"
        fi
    fi

    # Check if it matches core version
    if [ -f "$STATUSLINE_CORE" ]; then
        if diff -q "$STATUSLINE" "$STATUSLINE_CORE" > /dev/null 2>&1; then
            check_pass "statusline.sh matches core"
        else
            check_warn "statusline.sh differs from core"
            if [ "$FIX_MODE" = true ]; then
                cp "$STATUSLINE_CORE" "$STATUSLINE"
                chmod +x "$STATUSLINE"
                check_fixed "statusline.sh updated from core"
            fi
        fi
    fi
else
    check_fail ".claude/statusline.sh missing"
    if [ "$FIX_MODE" = true ] && [ -f "$STATUSLINE_CORE" ]; then
        cp "$STATUSLINE_CORE" "$STATUSLINE"
        chmod +x "$STATUSLINE"
        check_fixed "statusline.sh"
    fi
fi

# ─────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────
if [ "$JSON_MODE" = true ]; then
    echo "{"
    echo "  \"project\": \"$PROJECT_ROOT\","
    echo "  \"issues\": $ISSUES,"
    echo "  \"warnings\": $WARNINGS,"
    echo "  \"fixes\": $FIXES,"
    echo "  \"results\": ["
    first=true
    for result in "${JSON_RESULTS[@]}"; do
        [ "$first" = true ] && first=false || echo ","
        echo -n "    $result"
    done
    echo ""
    echo "  ]"
    echo "}"
else
    echo ""
    echo "${CYAN}── Summary ──${RESET}"

    if [ $FIXES -gt 0 ]; then
        echo "${GREEN}Applied $FIXES fix(es)${RESET}"
    fi

    if [ $ISSUES -eq 0 ] && [ $WARNINGS -eq 0 ]; then
        echo "${GREEN}HEALTHY${RESET} - All checks passed"
    elif [ $ISSUES -eq 0 ]; then
        echo "${YELLOW}NEEDS_ATTENTION${RESET} - $WARNINGS warning(s)"
    else
        echo "${RED}NEEDS_FIX${RESET} - $ISSUES error(s), $WARNINGS warning(s)"
        if [ "$FIX_MODE" != true ]; then
            echo ""
            echo "Run with --fix to auto-repair: $0 --fix"
        fi
    fi
fi

# Exit code
[ $ISSUES -eq 0 ] && exit 0 || exit 1
