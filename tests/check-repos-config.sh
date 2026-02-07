#!/usr/bin/env zsh
# Validate repos.yaml configuration
# Usage: ./tests/check-repos-config.sh [path-to-repos.yaml]
#
# Validates:
# 1. YAML syntax
# 2. Required fields
# 3. Repo paths exist
# 4. Build order contains only defined repos
# 5. Dependencies reference defined repos
# 6. No circular dependencies

set -euo pipefail

PROJECT_ROOT="${PROJECT_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
REPOS_CONFIG="${1:-$PROJECT_ROOT/.pennyfarthing/repos.yaml}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0
WARNINGS=0

log_pass() {
    echo -e "${GREEN}✓${NC} $1"
}

log_fail() {
    echo -e "${RED}✗${NC} $1"
    ((ERRORS++)) || true
}

log_warn() {
    echo -e "${YELLOW}!${NC} $1"
    ((WARNINGS++)) || true
}

log_info() {
    echo "  $1"
}

echo "=== Repos Configuration Validation ==="
echo "Config: $REPOS_CONFIG"
echo ""

# Check if file exists
if [ ! -f "$REPOS_CONFIG" ]; then
    log_fail "repos.yaml not found at $REPOS_CONFIG"
    echo ""
    echo "This is fine if using legacy API_REPO/UI_REPO environment variables."
    exit 0
fi

# Check for YAML parser
if command -v yq &>/dev/null; then
    PARSER="yq"
elif command -v python3 &>/dev/null; then
    PARSER="python"
else
    log_fail "No YAML parser available (yq or python3 required)"
    exit 1
fi

echo "Using parser: $PARSER"
echo ""

# Test 1: Validate YAML syntax
echo "=== Test 1: YAML Syntax ==="
if [ "$PARSER" = "yq" ]; then
    if yq . "$REPOS_CONFIG" >/dev/null 2>&1; then
        log_pass "YAML syntax is valid"
    else
        log_fail "YAML syntax error"
        yq . "$REPOS_CONFIG" 2>&1 || true
        exit 1
    fi
else
    if python3 -c "import yaml; yaml.safe_load(open('$REPOS_CONFIG'))" 2>/dev/null; then
        log_pass "YAML syntax is valid"
    else
        log_fail "YAML syntax error"
        python3 -c "import yaml; yaml.safe_load(open('$REPOS_CONFIG'))" 2>&1 || true
        exit 1
    fi
fi
echo ""

# Test 2: Check version field
echo "=== Test 2: Version Field ==="
if [ "$PARSER" = "yq" ]; then
    VERSION=$(yq -r '.version // ""' "$REPOS_CONFIG")
else
    VERSION=$(python3 -c "import yaml; print(yaml.safe_load(open('$REPOS_CONFIG')).get('version', ''))")
fi

if [ -n "$VERSION" ]; then
    log_pass "Version: $VERSION"
else
    log_warn "No version field (recommended: version: \"1.0\")"
fi
echo ""

# Test 3: Check repos section
echo "=== Test 3: Repos Section ==="
if [ "$PARSER" = "yq" ]; then
    REPO_COUNT=$(yq -r '.repos | keys | length' "$REPOS_CONFIG" 2>/dev/null || echo "0")
    REPO_NAMES=$(yq -r '.repos | keys | .[]' "$REPOS_CONFIG" 2>/dev/null || echo "")
else
    REPO_COUNT=$(python3 -c "import yaml; print(len(yaml.safe_load(open('$REPOS_CONFIG')).get('repos', {})))")
    REPO_NAMES=$(python3 -c "import yaml; print('\n'.join(yaml.safe_load(open('$REPOS_CONFIG')).get('repos', {}).keys()))")
fi

if [ "$REPO_COUNT" -eq 0 ]; then
    log_fail "No repos defined"
else
    log_pass "Found $REPO_COUNT repo(s)"
fi
echo ""

# Test 4: Validate required fields for each repo
echo "=== Test 4: Required Fields ==="
for repo in $REPO_NAMES; do
    echo "Checking: $repo"

    if [ "$PARSER" = "yq" ]; then
        PATH_VAL=$(yq -r ".repos.\"$repo\".path // \"\"" "$REPOS_CONFIG")
        TYPE_VAL=$(yq -r ".repos.\"$repo\".type // \"\"" "$REPOS_CONFIG")
    else
        PATH_VAL=$(python3 -c "import yaml; r=yaml.safe_load(open('$REPOS_CONFIG')).get('repos',{}).get('$repo',{}); print(r.get('path','') if r else '')")
        TYPE_VAL=$(python3 -c "import yaml; r=yaml.safe_load(open('$REPOS_CONFIG')).get('repos',{}).get('$repo',{}); print(r.get('type','') if r else '')")
    fi

    if [ -z "$PATH_VAL" ] || [ "$PATH_VAL" = "null" ]; then
        log_fail "  $repo: missing 'path' field"
    else
        log_pass "  $repo: path = $PATH_VAL"
    fi

    if [ -z "$TYPE_VAL" ] || [ "$TYPE_VAL" = "null" ]; then
        log_fail "  $repo: missing 'type' field"
    else
        # Validate type is one of the known types
        case "$TYPE_VAL" in
            api|ui|adapter|service|shared|lib)
                log_pass "  $repo: type = $TYPE_VAL"
                ;;
            *)
                log_warn "  $repo: unknown type '$TYPE_VAL' (expected: api, ui, adapter, service, shared, lib)"
                ;;
        esac
    fi
done
echo ""

# Test 5: Validate repo paths exist
echo "=== Test 5: Repo Paths ==="
for repo in $REPO_NAMES; do
    if [ "$PARSER" = "yq" ]; then
        PATH_VAL=$(yq -r ".repos.\"$repo\".path // \"$repo\"" "$REPOS_CONFIG")
    else
        PATH_VAL=$(python3 -c "import yaml; r=yaml.safe_load(open('$REPOS_CONFIG')).get('repos',{}).get('$repo',{}); print(r.get('path','$repo') if r else '$repo')")
    fi

    FULL_PATH="$PROJECT_ROOT/$PATH_VAL"
    if [ -d "$FULL_PATH" ]; then
        log_pass "$repo: $PATH_VAL exists"
    else
        log_warn "$repo: path not found - $FULL_PATH"
    fi
done
echo ""

# Test 6: Validate build_order
echo "=== Test 6: Build Order ==="
if [ "$PARSER" = "yq" ]; then
    BUILD_ORDER=$(yq -r '.build_order // [] | .[]' "$REPOS_CONFIG" 2>/dev/null || echo "")
else
    BUILD_ORDER=$(python3 -c "import yaml; print('\n'.join(yaml.safe_load(open('$REPOS_CONFIG')).get('build_order', [])))" 2>/dev/null || echo "")
fi

if [ -z "$BUILD_ORDER" ]; then
    log_info "No explicit build_order (will use repo definition order)"
else
    for repo in $BUILD_ORDER; do
        if echo "$REPO_NAMES" | grep -q "^${repo}$"; then
            log_pass "build_order: $repo is defined"
        else
            log_fail "build_order: $repo is NOT defined in repos section"
        fi
    done
fi
echo ""

# Test 7: Validate dependencies
echo "=== Test 7: Dependencies ==="
for repo in $REPO_NAMES; do
    if [ "$PARSER" = "yq" ]; then
        DEPS=$(yq -r ".repos.\"$repo\".dependencies // [] | .[]" "$REPOS_CONFIG" 2>/dev/null || echo "")
    else
        DEPS=$(python3 -c "import yaml; print('\n'.join(yaml.safe_load(open('$REPOS_CONFIG')).get('repos',{}).get('$repo',{}).get('dependencies',[])))" 2>/dev/null || echo "")
    fi

    if [ -z "$DEPS" ]; then
        log_info "$repo: no dependencies"
    else
        for dep in $DEPS; do
            if echo "$REPO_NAMES" | grep -q "^${dep}$"; then
                log_pass "$repo: depends on $dep (defined)"
            else
                log_fail "$repo: depends on $dep (NOT defined)"
            fi
        done
    fi
done
echo ""

# Test 8: Check for circular dependencies (basic check)
echo "=== Test 8: Circular Dependencies ==="
CIRCULAR_FOUND=false
for repo in $REPO_NAMES; do
    if [ "$PARSER" = "yq" ]; then
        DEPS=$(yq -r ".repos.\"$repo\".dependencies // [] | .[]" "$REPOS_CONFIG" 2>/dev/null || echo "")
    else
        DEPS=$(python3 -c "import yaml; print('\n'.join(yaml.safe_load(open('$REPOS_CONFIG')).get('repos',{}).get('$repo',{}).get('dependencies',[])))" 2>/dev/null || echo "")
    fi

    for dep in $DEPS; do
        # Check if dep depends on repo (direct circular)
        if [ "$PARSER" = "yq" ]; then
            DEP_DEPS=$(yq -r ".repos.\"$dep\".dependencies // [] | .[]" "$REPOS_CONFIG" 2>/dev/null || echo "")
        else
            DEP_DEPS=$(python3 -c "import yaml; print('\n'.join(yaml.safe_load(open('$REPOS_CONFIG')).get('repos',{}).get('$dep',{}).get('dependencies',[])))" 2>/dev/null || echo "")
        fi

        if echo "$DEP_DEPS" | grep -q "^${repo}$"; then
            log_fail "Circular dependency: $repo <-> $dep"
            CIRCULAR_FOUND=true
        fi
    done
done

if [ "$CIRCULAR_FOUND" = false ]; then
    log_pass "No circular dependencies detected"
fi
echo ""

# Summary
echo "=== Summary ==="
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}All checks passed!${NC}"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}$WARNINGS warning(s), 0 errors${NC}"
    exit 0
else
    echo -e "${RED}$ERRORS error(s), $WARNINGS warning(s)${NC}"
    exit 1
fi
