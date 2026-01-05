#!/bin/bash
# doctor-dogfood.sh - Health check for Pennyfarthing developers (dogfooding)
#
# Usage: ./pennyfarthing-dist/scripts/doctor-dogfood.sh [--fix]
#
# Checks and optionally fixes common setup issues for developers working
# on the pennyfarthing repo itself.

set -uo pipefail

FIX_MODE=false
if [[ "${1:-}" == "--fix" ]]; then
    FIX_MODE=true
fi

# Colors (if terminal supports them)
if [[ -t 1 ]]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[0;33m'
    NC='\033[0m' # No Color
else
    RED=''
    GREEN=''
    YELLOW=''
    NC=''
fi

ERRORS=0
WARNINGS=0
FIXED=0

ok() {
    echo -e "${GREEN}OK${NC}    $1"
}

warn() {
    echo -e "${YELLOW}WARN${NC}  $1"
    ((WARNINGS++))
}

fail() {
    echo -e "${RED}FAIL${NC}  $1"
    ((ERRORS++))
}

fix() {
    echo -e "${GREEN}FIX${NC}   $1"
    ((FIXED++))
}

# Find project root
find_project_root() {
    local dir="$PWD"
    while [[ ! -d "$dir/pennyfarthing-dist" ]] && [[ "$dir" != "/" ]]; do
        dir="$(dirname "$dir")"
    done
    if [[ -d "$dir/pennyfarthing-dist" ]]; then
        echo "$dir"
    else
        echo ""
    fi
}

PROJECT_ROOT="$(find_project_root)"

echo "Pennyfarthing Dogfooding Doctor"
echo "================================"
echo ""

# Check we're in the right place
if [[ -z "$PROJECT_ROOT" ]]; then
    fail "Not in pennyfarthing repo (no pennyfarthing-dist/ found)"
    exit 1
fi

cd "$PROJECT_ROOT"
ok "Project root: $PROJECT_ROOT"

echo ""
echo "Checking prerequisites..."
echo ""

# Check Node.js
if command -v node &>/dev/null; then
    NODE_VERSION=$(node --version)
    ok "Node.js: $NODE_VERSION"
else
    fail "Node.js not installed"
fi

# Check npm
if command -v npm &>/dev/null; then
    NPM_VERSION=$(npm --version)
    ok "npm: $NPM_VERSION"
else
    fail "npm not installed"
fi

# Check yq (for sprint YAML manipulation)
if command -v yq &>/dev/null; then
    YQ_VERSION=$(yq --version 2>&1 | head -1)
    ok "yq: $YQ_VERSION"
else
    warn "yq not installed (needed for post-merge hook)"
    if $FIX_MODE; then
        echo "     Run: brew install yq"
    fi
fi

# Check jira CLI (optional)
if command -v jira &>/dev/null; then
    ok "jira CLI: installed"
else
    warn "jira CLI not installed (optional, for Jira sync)"
fi

echo ""
echo "Checking symlinks..."
echo ""

# Check .claude/pennyfarthing symlink
if [[ -L ".claude/pennyfarthing" ]]; then
    TARGET=$(readlink ".claude/pennyfarthing")
    if [[ "$TARGET" == "../pennyfarthing-dist" ]]; then
        ok ".claude/pennyfarthing -> ../pennyfarthing-dist"
    else
        fail ".claude/pennyfarthing points to wrong target: $TARGET"
    fi
elif [[ -d ".claude/pennyfarthing" ]]; then
    fail ".claude/pennyfarthing is a directory, should be symlink"
else
    fail ".claude/pennyfarthing missing"
fi

# Check scripts directory/symlink
if [[ -L "scripts" ]]; then
    TARGET=$(readlink "scripts")
    ok "scripts -> $TARGET"
elif [[ -d "scripts" ]]; then
    # Check if contents are symlinks to pennyfarthing-dist
    if [[ -L "scripts/agent-session.sh" ]]; then
        ok "scripts/ directory with symlinks (dogfooding setup)"
    else
        warn "scripts/ is a directory but contents may not be symlinked"
    fi
else
    fail "scripts/ missing"
fi

echo ""
echo "Checking git hooks..."
echo ""

# Check git hooks
HOOKS=("pre-commit" "pre-push" "post-merge")
for hook in "${HOOKS[@]}"; do
    hook_path=".git/hooks/$hook"
    expected_target="../../pennyfarthing-dist/scripts/hooks/${hook}.sh"

    if [[ -L "$hook_path" ]]; then
        actual_target=$(readlink "$hook_path")
        if [[ "$actual_target" == "$expected_target" ]]; then
            ok "$hook hook -> $expected_target"
        else
            warn "$hook hook points to: $actual_target"
            if $FIX_MODE; then
                ln -sf "$expected_target" "$hook_path"
                fix "$hook hook updated"
            fi
        fi
    elif [[ -f "$hook_path" ]]; then
        # Check if it's our hook (contains pennyfarthing marker)
        if grep -q "pennyfarthing" "$hook_path" 2>/dev/null; then
            ok "$hook hook (file, pennyfarthing)"
        else
            warn "$hook hook exists but is not pennyfarthing hook"
            if $FIX_MODE; then
                mv "$hook_path" "${hook_path}.backup"
                ln -sf "$expected_target" "$hook_path"
                fix "$hook hook replaced (backup saved)"
            fi
        fi
    else
        fail "$hook hook missing"
        if $FIX_MODE; then
            ln -sf "$expected_target" "$hook_path"
            fix "$hook hook installed"
        fi
    fi
done

echo ""
echo "Checking build..."
echo ""

# Check if dist/ is up to date
if [[ -d "dist" ]]; then
    # Check if any src file is newer than its dist counterpart
    OUTDATED=false
    for src_file in src/cli/commands/*.ts; do
        if [[ -f "$src_file" ]]; then
            base=$(basename "$src_file" .ts)
            dist_file="dist/cli/commands/${base}.js"
            if [[ -f "$dist_file" ]]; then
                if [[ "$src_file" -nt "$dist_file" ]]; then
                    OUTDATED=true
                    break
                fi
            fi
        fi
    done

    if $OUTDATED; then
        warn "dist/ may be outdated (run: npm run build)"
        if $FIX_MODE; then
            npm run build >/dev/null 2>&1
            fix "Rebuilt dist/"
        fi
    else
        ok "dist/ appears up to date"
    fi
else
    fail "dist/ directory missing"
    if $FIX_MODE; then
        npm run build >/dev/null 2>&1
        fix "Built dist/"
    fi
fi

# Check node_modules
if [[ -d "node_modules" ]]; then
    ok "node_modules/ exists"
else
    fail "node_modules/ missing (run: npm install)"
    if $FIX_MODE; then
        npm install >/dev/null 2>&1
        fix "Installed dependencies"
    fi
fi

echo ""
echo "Checking Claude Code integration..."
echo ""

# Check settings.local.json
if [[ -f ".claude/settings.local.json" ]]; then
    ok ".claude/settings.local.json exists"
else
    warn ".claude/settings.local.json missing"
fi

# Check persona-config.yaml (local takes precedence)
if [[ -f ".claude/persona-config.local.yaml" ]]; then
    THEME=$(grep "^theme:" ".claude/persona-config.local.yaml" | awk '{print $2}')
    ok "Theme: ${THEME:-unknown} (local)"
elif [[ -f ".claude/persona-config.yaml" ]]; then
    THEME=$(grep "^theme:" ".claude/persona-config.yaml" | awk '{print $2}')
    ok "Theme: ${THEME:-unknown}"
else
    warn "No persona-config.yaml found (will use default theme)"
fi

echo ""
echo "================================"
echo "Summary"
echo "================================"
echo ""

if [[ $ERRORS -eq 0 ]] && [[ $WARNINGS -eq 0 ]]; then
    echo -e "${GREEN}All checks passed!${NC}"
elif [[ $ERRORS -eq 0 ]]; then
    echo -e "${YELLOW}$WARNINGS warning(s), 0 errors${NC}"
else
    echo -e "${RED}$ERRORS error(s), $WARNINGS warning(s)${NC}"
fi

if $FIX_MODE && [[ $FIXED -gt 0 ]]; then
    echo -e "${GREEN}$FIXED issue(s) fixed${NC}"
fi

if [[ $ERRORS -gt 0 ]] && ! $FIX_MODE; then
    echo ""
    echo "Run with --fix to attempt automatic repairs:"
    echo "  ./pennyfarthing-dist/scripts/doctor-dogfood.sh --fix"
fi

exit $ERRORS
