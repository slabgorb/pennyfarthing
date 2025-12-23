#!/bin/bash
# Pennyfarthing Health Check Script
# Usage: health-check.sh [--fix]
#
# Checks installation health and optionally applies fixes

set -e

# Colors
RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[0;33m'
CYAN=$'\033[0;36m'
RESET=$'\033[0m'

FIX_MODE="${1:-}"
PROJECT_ROOT="${PROJECT_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

# Detect if we're in pennyfarthing itself or a target project
if [ -f "$PROJECT_ROOT/VERSION" ] && [ -d "$PROJECT_ROOT/core" ]; then
    IS_PENNYFARTHING=true
    PENNYFARTHING_DIR="$PROJECT_ROOT"
else
    IS_PENNYFARTHING=false
    PENNYFARTHING_DIR="$PROJECT_ROOT/.claude/pennyfarthing"
fi

echo "${CYAN}Pennyfarthing Health Check${RESET}"
echo "Project: $PROJECT_ROOT"
[ "$IS_PENNYFARTHING" = true ] && echo "Mode: Pennyfarthing development"
echo ""

ISSUES=0
WARNINGS=0

check_pass() {
    echo "${GREEN}✓${RESET} $1"
}

check_fail() {
    echo "${RED}✗${RESET} $1"
    ((ISSUES++))
}

check_warn() {
    echo "${YELLOW}!${RESET} $1"
    ((WARNINGS++))
}

# 1. Submodule / Source check
echo "${CYAN}── Source ──${RESET}"
if [ "$IS_PENNYFARTHING" = true ]; then
    check_pass "Running in Pennyfarthing development mode"
    VERSION=$(cat "$PROJECT_ROOT/VERSION" 2>/dev/null || echo "unknown")
    check_pass "Version: $VERSION"
elif [ -d "$PENNYFARTHING_DIR" ]; then
    check_pass "Pennyfarthing submodule found"

    # Check if up to date
    cd "$PENNYFARTHING_DIR"
    git fetch origin --quiet 2>/dev/null || true
    LOCAL=$(git rev-parse HEAD 2>/dev/null)
    REMOTE=$(git rev-parse origin/main 2>/dev/null || echo "$LOCAL")

    if [ "$LOCAL" = "$REMOTE" ]; then
        check_pass "Submodule up to date"
    else
        BEHIND=$(git rev-list HEAD..origin/main --count 2>/dev/null || echo "?")
        check_warn "Submodule behind origin/main by $BEHIND commits"
        echo "        Run: cd .claude/pennyfarthing && git pull origin main"
    fi
    cd "$PROJECT_ROOT"
else
    check_fail "Pennyfarthing submodule not found at .claude/pennyfarthing"
    echo "        Run: git submodule add git@github.com:1898andCo/pennyfarthing.git .claude/pennyfarthing"
fi

# 2. Symlinks (only for target projects, not pennyfarthing itself)
echo ""
echo "${CYAN}── Symlinks ──${RESET}"
if [ "$IS_PENNYFARTHING" = true ]; then
    check_pass "Symlinks not needed in development mode"
else
    declare -A SYMLINKS=(
        [".claude/agents"]="pennyfarthing/core/agents"
        [".claude/subagents"]="pennyfarthing/core/subagents"
        [".claude/commands"]="pennyfarthing/core/commands"
        [".claude/guides"]="pennyfarthing/core/guides"
        [".claude/personas"]="pennyfarthing/personas"
    )

    for link in "${!SYMLINKS[@]}"; do
        target="${SYMLINKS[$link]}"
        full_path="$PROJECT_ROOT/$link"

        if [ -L "$full_path" ]; then
            actual_target=$(readlink "$full_path")
            if [ "$actual_target" = "$target" ]; then
                check_pass "$link → $target"
            else
                check_warn "$link points to $actual_target (expected $target)"
            fi
        elif [ -d "$full_path" ]; then
            check_warn "$link exists as directory, not symlink"
        else
            check_fail "$link missing"
            if [ "$FIX_MODE" = "--fix" ]; then
                echo "        Fixing: ln -sf $target $full_path"
                ln -sf "$target" "$full_path"
            fi
        fi
    done
fi

# 3. Settings format
echo ""
echo "${CYAN}── Settings ──${RESET}"
SETTINGS_FILE="$PROJECT_ROOT/.claude/settings.local.json"

if [ -f "$SETTINGS_FILE" ]; then
    check_pass "settings.local.json exists"

    # Check statusLine format (camelCase with object)
    if grep -q '"statusLine"' "$SETTINGS_FILE"; then
        if grep -q '"type": "command"' "$SETTINGS_FILE"; then
            check_pass "statusLine uses correct object format"
        else
            check_fail "statusLine should use object format with type/command"
        fi
    elif grep -q '"statusline"' "$SETTINGS_FILE"; then
        check_fail "statusline should be statusLine (camelCase)"
    else
        check_warn "statusLine not configured"
    fi

    # Check hook paths
    if grep -q '"command": "scripts/' "$SETTINGS_FILE"; then
        check_fail "Hooks use relative paths (should use \$CLAUDE_PROJECT_DIR)"
    else
        check_pass "Hook paths use \$CLAUDE_PROJECT_DIR"
    fi
else
    check_fail "settings.local.json not found"
fi

# 4. Statusline
echo ""
echo "${CYAN}── Statusline ──${RESET}"
SOURCE_STATUSLINE="$PENNYFARTHING_DIR/core/statusline.sh"

if [ "$IS_PENNYFARTHING" = true ]; then
    # In pennyfarthing, settings should point to core/statusline.sh
    if [ -f "$SOURCE_STATUSLINE" ]; then
        check_pass "core/statusline.sh exists"
        if grep -q 'core/statusline.sh' "$SETTINGS_FILE" 2>/dev/null; then
            check_pass "Settings points to core/statusline.sh"
        else
            check_warn "Settings should point to core/statusline.sh"
        fi
    else
        check_fail "core/statusline.sh not found"
    fi
else
    # In target projects, statusline is copied to .claude/
    LOCAL_STATUSLINE="$PROJECT_ROOT/.claude/statusline.sh"

    if [ -f "$SOURCE_STATUSLINE" ]; then
        if [ -f "$LOCAL_STATUSLINE" ]; then
            if diff -q "$LOCAL_STATUSLINE" "$SOURCE_STATUSLINE" > /dev/null 2>&1; then
                check_pass "Statusline up to date"
            else
                check_warn "Local statusline differs from source"
                if [ "$FIX_MODE" = "--fix" ]; then
                    echo "        Fixing: copying from core/statusline.sh"
                    cp "$SOURCE_STATUSLINE" "$LOCAL_STATUSLINE"
                    chmod +x "$LOCAL_STATUSLINE"
                else
                    echo "        Run with --fix to update, or manually copy"
                fi
            fi
        else
            check_warn "Local statusline.sh not found (may need to copy from core/)"
            if [ "$FIX_MODE" = "--fix" ]; then
                echo "        Fixing: copying from core/statusline.sh"
                cp "$SOURCE_STATUSLINE" "$LOCAL_STATUSLINE"
                chmod +x "$LOCAL_STATUSLINE"
            fi
        fi
    else
        check_fail "Source statusline not found at $SOURCE_STATUSLINE"
    fi
fi

# 5. Directories
echo ""
echo "${CYAN}── Directories ──${RESET}"
for dir in "sprint" ".session" ".claude/project"; do
    if [ -d "$PROJECT_ROOT/$dir" ]; then
        check_pass "$dir/ exists"
    else
        check_fail "$dir/ missing"
        if [ "$FIX_MODE" = "--fix" ]; then
            echo "        Fixing: mkdir -p $PROJECT_ROOT/$dir"
            mkdir -p "$PROJECT_ROOT/$dir"
        fi
    fi
done

# 6. Hook scripts
echo ""
echo "${CYAN}── Hooks ──${RESET}"
for hook in "session-start.sh" "pre-edit-check.sh"; do
    hook_path="$PROJECT_ROOT/scripts/hooks/$hook"
    if [ -f "$hook_path" ] || [ -L "$hook_path" ]; then
        if [ -x "$hook_path" ] || [ -L "$hook_path" ]; then
            check_pass "scripts/hooks/$hook"
        else
            check_warn "scripts/hooks/$hook not executable"
        fi
    else
        check_fail "scripts/hooks/$hook missing"
    fi
done

# 7. Version (only show for target projects - already shown for pennyfarthing dev mode)
if [ "$IS_PENNYFARTHING" = false ]; then
    echo ""
    echo "${CYAN}── Version ──${RESET}"
    if [ -f "$PENNYFARTHING_DIR/VERSION" ]; then
        VERSION=$(cat "$PENNYFARTHING_DIR/VERSION")
        check_pass "Pennyfarthing version: $VERSION"
    else
        check_warn "VERSION file not found"
    fi
fi

# Summary
echo ""
echo "${CYAN}── Summary ──${RESET}"
if [ $ISSUES -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo "${GREEN}HEALTHY${RESET} - All checks passed"
elif [ $ISSUES -eq 0 ]; then
    echo "${YELLOW}NEEDS_ATTENTION${RESET} - $WARNINGS warning(s)"
else
    echo "${RED}NEEDS_FIX${RESET} - $ISSUES issue(s), $WARNINGS warning(s)"
    if [ "$FIX_MODE" != "--fix" ]; then
        echo ""
        echo "Run with --fix to auto-repair: $0 --fix"
    fi
fi
