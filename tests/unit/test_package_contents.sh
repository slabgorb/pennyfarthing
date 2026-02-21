#!/usr/bin/env bash
#
# test_package_contents.sh - Assert npm pack tarball contents against known-good manifest
#
# Runs `npm pack --dry-run --json` and verifies the tarball would contain
# all required files, directories, and nothing unexpected.
# Catches missing-file regressions like those seen in 11.3.x releases.
#
# Usage: ./tests/unit/test_package_contents.sh
#
# Requires: npm, python3 (for JSON parsing)

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MANIFEST="$SCRIPT_DIR/../fixtures/package-manifest.json"

PASS=0
FAIL=0

pass() {
    echo "PASS: $1"
    ((PASS++))
}

fail() {
    echo "FAIL: $1"
    ((FAIL++))
}

# --- Pre-flight ---

if [[ ! -f "$MANIFEST" ]]; then
    echo "ERROR: Manifest not found at $MANIFEST"
    exit 1
fi

if ! command -v python3 &>/dev/null; then
    echo "ERROR: python3 required for JSON parsing"
    exit 1
fi

echo "=== Package Contents Assertion Tests ==="
echo "Manifest: $MANIFEST"
echo ""

# --- Run npm pack --dry-run ---

echo "Running npm pack --dry-run --json..."
PACK_OUTPUT=$(cd "$PROJECT_ROOT" && npm pack --dry-run --json 2>/dev/null)

if [[ -z "$PACK_OUTPUT" ]]; then
    fail "npm pack --dry-run produced no output"
    echo ""
    echo "Results: $PASS passed, $FAIL failed"
    exit 1
fi

# Extract file paths from pack output into a temp file
PACK_FILES=$(mktemp)
trap 'rm -f "$PACK_FILES"' EXIT

echo "$PACK_OUTPUT" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for f in data[0]['files']:
    print(f['path'])
" > "$PACK_FILES"

TOTAL_FILES=$(wc -l < "$PACK_FILES" | tr -d ' ')
echo "Tarball contains $TOTAL_FILES files"
echo ""

# --- Test: Required root files ---

echo "--- Required Root Files ---"
while IFS= read -r file; do
    if grep -qx "$file" "$PACK_FILES"; then
        pass "Root file present: $file"
    else
        fail "Root file MISSING: $file"
    fi
done < <(python3 -c "
import json
m = json.load(open('$MANIFEST'))
for f in m['required_root_files']:
    print(f)
")

echo ""

# --- Test: Required top-level directories ---

echo "--- Required Top-Level Directories ---"
while IFS= read -r dir; do
    if grep -q "^${dir}/" "$PACK_FILES"; then
        pass "Top-level dir present: $dir/"
    else
        fail "Top-level dir MISSING: $dir/"
    fi
done < <(python3 -c "
import json
m = json.load(open('$MANIFEST'))
for d in m['required_top_level_dirs']:
    print(d)
")

echo ""

# --- Test: No unexpected top-level entries ---

echo "--- Unexpected Top-Level Entries ---"
ALLOWED=$(python3 -c "
import json
m = json.load(open('$MANIFEST'))
for e in m['allowed_top_level_entries']:
    print(e)
")

# Get actual top-level entries from tarball
ACTUAL_TOP=$(python3 -c "
import sys
seen = set()
for line in sys.stdin:
    line = line.strip()
    parts = line.split('/')
    entry = parts[0]
    if entry not in seen:
        seen.add(entry)
        print(entry)
" < "$PACK_FILES")

UNEXPECTED_FOUND=0
while IFS= read -r entry; do
    if echo "$ALLOWED" | grep -qx "$entry"; then
        : # expected
    else
        fail "Unexpected top-level entry: $entry"
        UNEXPECTED_FOUND=1
    fi
done <<< "$ACTUAL_TOP"

if [[ $UNEXPECTED_FOUND -eq 0 ]]; then
    pass "No unexpected top-level entries"
fi

echo ""

# --- Test: Required pennyfarthing-dist subdirectories ---

echo "--- Required pennyfarthing-dist/ Subdirectories ---"
while IFS= read -r subdir; do
    if grep -q "^pennyfarthing-dist/${subdir}/" "$PACK_FILES"; then
        pass "pennyfarthing-dist/$subdir/ present"
    else
        fail "pennyfarthing-dist/$subdir/ MISSING"
    fi
done < <(python3 -c "
import json
m = json.load(open('$MANIFEST'))
for d in m['required_pennyfarthing_dist_subdirs']:
    print(d)
")

echo ""

# --- Test: Required packages subdirectories ---

echo "--- Required packages/ Subdirectories ---"
while IFS= read -r subdir; do
    if grep -q "^packages/${subdir}/" "$PACK_FILES"; then
        pass "packages/$subdir/ present"
    else
        fail "packages/$subdir/ MISSING"
    fi
done < <(python3 -c "
import json
m = json.load(open('$MANIFEST'))
for d in m['required_packages_subdirs']:
    print(d)
")

echo ""

# --- Test: Critical files ---

echo "--- Critical Files ---"
while IFS= read -r file; do
    if grep -qx "$file" "$PACK_FILES"; then
        pass "Critical file present: $file"
    else
        fail "Critical file MISSING: $file"
    fi
done < <(python3 -c "
import json
m = json.load(open('$MANIFEST'))
for f in m['critical_files']:
    print(f)
")

echo ""

# --- Test: Required pennyfarthing-dist scripts ---

echo "--- Required pennyfarthing-dist Scripts ---"
while IFS= read -r file; do
    if grep -qx "$file" "$PACK_FILES"; then
        pass "Script present: $file"
    else
        fail "Script MISSING: $file"
    fi
done < <(python3 -c "
import json
m = json.load(open('$MANIFEST'))
for f in m['required_pennyfarthing_dist_scripts']:
    print(f)
")

echo ""

# --- Test: pennyfarthing-dist directories are non-empty ---

echo "--- pennyfarthing-dist/ Directories Non-Empty ---"
while IFS= read -r subdir; do
    COUNT=$(grep -c "^pennyfarthing-dist/${subdir}/" "$PACK_FILES" || true)
    if [[ $COUNT -gt 0 ]]; then
        pass "pennyfarthing-dist/$subdir/ has $COUNT files"
    else
        fail "pennyfarthing-dist/$subdir/ is EMPTY (0 files)"
    fi
done < <(python3 -c "
import json
m = json.load(open('$MANIFEST'))
for d in m['required_pennyfarthing_dist_subdirs']:
    print(d)
")

echo ""

# --- Summary ---

echo "========================================"
echo "  Package Contents Test Summary"
echo "========================================"
echo "Passed: $PASS"
echo "Failed: $FAIL"
echo ""

if [[ $FAIL -gt 0 ]]; then
    echo "FAILED: $FAIL assertion(s) failed"
    exit 1
else
    echo "PASSED: All package content assertions passed"
    exit 0
fi
