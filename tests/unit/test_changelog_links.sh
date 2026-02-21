#!/usr/bin/env bash
#
# test_changelog_links.sh - Unit tests for changelog-links.sh
#
# Verifies that the changelog link generator correctly:
# - Parses version headers from CHANGELOG.md
# - Generates proper comparison links
# - Detects missing/incorrect links
# - Fixes broken links in-place
#
# Usage: ./tests/unit/test_changelog_links.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LINKS_SCRIPT="$PROJECT_ROOT/pennyfarthing-dist/scripts/git/changelog-links.sh"

PASS=0
FAIL=0
TMPDIR_TEST=""

pass() {
    echo "PASS: $1"
    ((PASS++))
}

fail() {
    echo "FAIL: $1"
    ((FAIL++))
}

setup() {
    TMPDIR_TEST=$(mktemp -d)
}

teardown() {
    [[ -n "$TMPDIR_TEST" ]] && rm -rf "$TMPDIR_TEST"
}

echo "=== Changelog Links Unit Tests ==="
echo ""

# --- Test: script exists and is executable ---

if [[ -x "$LINKS_SCRIPT" ]]; then
    pass "changelog-links.sh exists and is executable"
else
    fail "changelog-links.sh missing or not executable"
fi

# --- Test: --help flag works ---

if "$LINKS_SCRIPT" --help >/dev/null 2>&1; then
    pass "--help exits cleanly"
else
    fail "--help should exit 0"
fi

# --- Test: validates correct links ---

setup
cat > "$TMPDIR_TEST/CHANGELOG.md" << 'EOF'
# Changelog

## [Unreleased]

## [2.0.0] - 2026-02-01

### Added
- Feature B

## [1.0.0] - 2026-01-01

### Added
- Feature A

[Unreleased]: https://github.com/test/repo/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/test/repo/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/test/repo/releases/tag/v1.0.0
EOF

if "$LINKS_SCRIPT" --validate --changelog "$TMPDIR_TEST/CHANGELOG.md" >/dev/null 2>&1; then
    pass "Validates correct links as PASS"
else
    fail "Should pass validation on correct links"
fi
teardown

# --- Test: detects missing links ---

setup
cat > "$TMPDIR_TEST/CHANGELOG.md" << 'EOF'
# Changelog

## [Unreleased]

## [2.0.0] - 2026-02-01

### Added
- Feature B

## [1.0.0] - 2026-01-01

### Added
- Feature A

[Unreleased]: https://github.com/test/repo/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/test/repo/releases/tag/v1.0.0
EOF

if "$LINKS_SCRIPT" --validate --changelog "$TMPDIR_TEST/CHANGELOG.md" >/dev/null 2>&1; then
    fail "Should detect missing [2.0.0] link"
else
    pass "Detects missing version link"
fi
teardown

# --- Test: detects wrong Unreleased target ---

setup
cat > "$TMPDIR_TEST/CHANGELOG.md" << 'EOF'
# Changelog

## [Unreleased]

## [3.0.0] - 2026-03-01

## [2.0.0] - 2026-02-01

## [1.0.0] - 2026-01-01

[Unreleased]: https://github.com/test/repo/compare/v2.0.0...HEAD
[3.0.0]: https://github.com/test/repo/compare/v2.0.0...v3.0.0
[2.0.0]: https://github.com/test/repo/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/test/repo/releases/tag/v1.0.0
EOF

if "$LINKS_SCRIPT" --validate --changelog "$TMPDIR_TEST/CHANGELOG.md" >/dev/null 2>&1; then
    fail "Should detect Unreleased pointing to v2.0.0 instead of v3.0.0"
else
    pass "Detects wrong Unreleased target"
fi
teardown

# --- Test: --fix regenerates links ---

setup
cat > "$TMPDIR_TEST/CHANGELOG.md" << 'EOF'
# Changelog

## [Unreleased]

## [2.0.0] - 2026-02-01

### Added
- Feature B

## [1.0.0] - 2026-01-01

### Added
- Feature A

[Unreleased]: https://github.com/test/repo/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/test/repo/releases/tag/v1.0.0
EOF

"$LINKS_SCRIPT" --fix --changelog "$TMPDIR_TEST/CHANGELOG.md" >/dev/null 2>&1
if "$LINKS_SCRIPT" --validate --changelog "$TMPDIR_TEST/CHANGELOG.md" >/dev/null 2>&1; then
    pass "--fix regenerates correct links"
else
    fail "--fix should produce valid links"
fi
teardown

# --- Test: --fix preserves content above links ---

setup
cat > "$TMPDIR_TEST/CHANGELOG.md" << 'EOF'
# Changelog

## [Unreleased]

## [1.0.0] - 2026-01-01

### Added
- Feature A

[Unreleased]: https://github.com/test/repo/compare/v0.9.0...HEAD
EOF

"$LINKS_SCRIPT" --fix --changelog "$TMPDIR_TEST/CHANGELOG.md" >/dev/null 2>&1

# Verify content is preserved
if grep -q "### Added" "$TMPDIR_TEST/CHANGELOG.md" && grep -q "Feature A" "$TMPDIR_TEST/CHANGELOG.md"; then
    pass "--fix preserves changelog content"
else
    fail "--fix should not alter content sections"
fi
teardown

# --- Test: --print outputs to stdout without modifying file ---

setup
cat > "$TMPDIR_TEST/CHANGELOG.md" << 'EOF'
# Changelog

## [Unreleased]

## [1.0.0] - 2026-01-01

### Added
- Feature A

[Unreleased]: https://github.com/test/repo/compare/v0.9.0...HEAD
EOF

CHECKSUM_BEFORE=$(md5 -q "$TMPDIR_TEST/CHANGELOG.md" 2>/dev/null || md5sum "$TMPDIR_TEST/CHANGELOG.md" | cut -d' ' -f1)
OUTPUT=$("$LINKS_SCRIPT" --print --changelog "$TMPDIR_TEST/CHANGELOG.md" 2>&1)
CHECKSUM_AFTER=$(md5 -q "$TMPDIR_TEST/CHANGELOG.md" 2>/dev/null || md5sum "$TMPDIR_TEST/CHANGELOG.md" | cut -d' ' -f1)

if [[ "$CHECKSUM_BEFORE" == "$CHECKSUM_AFTER" ]]; then
    pass "--print does not modify file"
else
    fail "--print should not modify the file"
fi

if echo "$OUTPUT" | grep -q '\[Unreleased\]:'; then
    pass "--print outputs links to stdout"
else
    fail "--print should output links"
fi
teardown

# --- Test: validates real CHANGELOG.md ---

if "$LINKS_SCRIPT" --validate --changelog "$PROJECT_ROOT/CHANGELOG.md" >/dev/null 2>&1; then
    pass "Project CHANGELOG.md links are valid"
else
    fail "Project CHANGELOG.md links are invalid (run --fix)"
fi

echo ""

# --- Summary ---

echo "========================================"
echo "  Changelog Links Unit Test Summary"
echo "========================================"
echo "Passed: $PASS"
echo "Failed: $FAIL"
echo ""

if [[ $FAIL -gt 0 ]]; then
    echo "FAILED: $FAIL assertion(s) failed"
    exit 1
else
    echo "PASSED: All changelog link assertions passed"
    exit 0
fi
