#!/usr/bin/env bash
#
# Hooks Export Audit
# Story: 141-3
#
# Validates that:
# 1. Every use*.ts hook file in hooks/ has a corresponding export in index.ts
# 2. Deleted hooks (useMessageStream, usePlanModeExit) do not exist
# 3. No stale imports of deleted hooks remain in source code
# 4. No deprecation comments for deleted hooks linger in index.ts
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
HOOKS_DIR="$PROJECT_ROOT/packages/core/src/public/hooks"
INDEX_FILE="$HOOKS_DIR/index.ts"
SRC_DIR="$PROJECT_ROOT/packages/core/src"

PASS=0
FAIL=0

pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=== Hooks Export Audit ==="
echo ""

# --- Section 1: Deleted hooks must not exist ---
echo "--- Deleted hooks ---"
DELETED_HOOKS="useMessageStream usePlanModeExit"
for hook in $DELETED_HOOKS; do
  if [ -f "$HOOKS_DIR/${hook}.ts" ]; then
    fail "$hook.ts should be deleted but still exists"
  else
    pass "$hook.ts correctly deleted"
  fi
done

# --- Section 2: No stale imports of deleted hooks in source ---
echo ""
echo "--- Stale import check ---"
for hook in $DELETED_HOOKS; do
  # Search .ts/.tsx files in src/, excluding node_modules and dist
  stale_hits=$(grep -r --include='*.ts' --include='*.tsx' \
    --exclude-dir=node_modules --exclude-dir=dist \
    "from.*['\"].*${hook}['\"]" "$SRC_DIR" 2>/dev/null || true)
  stale_count=$(echo "$stale_hits" | grep -c . || true)
  if [ -n "$stale_hits" ]; then
    fail "Found $stale_count stale import(s) of $hook in source"
    echo "$stale_hits" | head -5
  else
    pass "No stale imports of $hook"
  fi
done

# --- Section 3: No deprecation comments for deleted hooks in index ---
echo ""
echo "--- Deprecation comment cleanup ---"
for hook in $DELETED_HOOKS; do
  if grep -qi "$hook" "$INDEX_FILE"; then
    fail "index.ts still references deleted hook $hook"
  else
    pass "index.ts clean of $hook references"
  fi
done

# --- Section 4: Every hook file has a corresponding export ---
echo ""
echo "--- Hook exports ---"
for hook_file in "$HOOKS_DIR"/use*.ts; do
  hook_name="$(basename "$hook_file" .ts)"

  # Skip index.ts
  [ "$hook_name" = "index" ] && continue

  if grep -q "from './${hook_name}'" "$INDEX_FILE"; then
    pass "$hook_name exported"
  else
    fail "$hook_name NOT exported from index.ts"
  fi
done

# --- Section 5: Every hook has at least one value export (not just types) ---
echo ""
echo "--- Value export check ---"
for hook_file in "$HOOKS_DIR"/use*.ts; do
  hook_name="$(basename "$hook_file" .ts)"
  [ "$hook_name" = "index" ] && continue

  # Check for `export { hookName` or `export { ... hookName` (value, not type-only)
  if grep -q "^export {.*${hook_name}" "$INDEX_FILE"; then
    pass "$hook_name has value export"
  else
    fail "$hook_name missing value export (type-only?)"
  fi
done

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
