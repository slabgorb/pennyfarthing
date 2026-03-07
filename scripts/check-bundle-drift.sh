#!/usr/bin/env bash
# check-bundle-drift.sh — Detect when wheelhub.mjs bundle is stale vs TypeScript source.
#
# Compares the newest mtime of server/*.ts source files against the bundle.
# If any source file is newer than the bundle, the bundle needs a rebuild.
#
# Usage: scripts/check-bundle-drift.sh [--quiet]
# Exit 0 = in sync, Exit 1 = bundle is stale

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

BUNDLE="$REPO_ROOT/pennyfarthing-dist/src/pf/_dist/server/wheelhub.mjs"
SOURCE_DIR="$REPO_ROOT/packages/core/src/server"

QUIET="${1:-}"

if [[ ! -f "$BUNDLE" ]]; then
  [[ "$QUIET" != "--quiet" ]] && echo "FAIL: Bundle not found at $BUNDLE"
  exit 1
fi

if [[ ! -d "$SOURCE_DIR" ]]; then
  [[ "$QUIET" != "--quiet" ]] && echo "FAIL: Source dir not found at $SOURCE_DIR"
  exit 1
fi

BUNDLE_MTIME=$(stat -f %m "$BUNDLE" 2>/dev/null || stat -c %Y "$BUNDLE")

# Find any .ts file in server/ tree newer than the bundle
STALE_FILES=()
while IFS= read -r -d '' tsfile; do
  TS_MTIME=$(stat -f %m "$tsfile" 2>/dev/null || stat -c %Y "$tsfile")
  if (( TS_MTIME > BUNDLE_MTIME )); then
    STALE_FILES+=("${tsfile#"$REPO_ROOT/"}")
  fi
done < <(find "$SOURCE_DIR" -name '*.ts' -not -name '*.test.ts' -not -name '*.d.ts' -print0)

if (( ${#STALE_FILES[@]} > 0 )); then
  if [[ "$QUIET" != "--quiet" ]]; then
    echo "FAIL: wheelhub.mjs bundle is stale. ${#STALE_FILES[@]} source file(s) newer than bundle:"
    for f in "${STALE_FILES[@]}"; do
      echo "  - $f"
    done
    echo ""
    echo "Rebuild with:"
    echo "  cd pennyfarthing && just rebuild-wheelhub"
  fi
  exit 1
fi

[[ "$QUIET" != "--quiet" ]] && echo "OK: wheelhub.mjs bundle is up to date."
exit 0
