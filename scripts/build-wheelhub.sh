#!/usr/bin/env bash
# Build WheelHub bundle from packages/core → pennyfarthing-dist/_dist/server/wheelhub.mjs
#
# This script:
#   1. Runs esbuild to bundle the server entry point (with createRequire banner for Node 24+ ESM compat)
#   2. Strips CLI main() blocks that would execute in the bundle
#   3. Validates the bundle
#   4. Copies the result to pennyfarthing-dist/src/pf/_dist/server/
#
# Usage: ./scripts/build-wheelhub.sh [--install]
#   --install   Also run `pipx install --force` after building

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CORE_PKG="$REPO_ROOT/packages/core"
ENTRY="$CORE_PKG/dist/server/entry.js"
DEST_DIR="$REPO_ROOT/pennyfarthing-dist/src/pf/_dist/server"
DEST="$DEST_DIR/wheelhub.mjs"
TMP_OUT="/tmp/wheelhub-build-$$.mjs"

# --- Pre-flight checks ---
if [[ ! -f "$ENTRY" ]]; then
    echo "[build-wheelhub] Entry point not found: $ENTRY" >&2
    echo "[build-wheelhub] Run 'cd packages/core && pnpm run build:tsc' first" >&2
    exit 1
fi

if ! command -v npx &>/dev/null; then
    echo "[build-wheelhub] npx not found" >&2
    exit 1
fi

# --- Step 1: esbuild bundle ---
echo "[build-wheelhub] Bundling $ENTRY ..."
npx esbuild "$ENTRY" \
    --bundle \
    --format=esm \
    --platform=node \
    --banner:js='import { createRequire } from "node:module"; var require = createRequire(import.meta.url);' \
    --outfile="$TMP_OUT"

echo "[build-wheelhub] Bundle size: $(wc -c < "$TMP_OUT" | tr -d ' ') bytes"

# --- Step 2: Strip CLI main() blocks ---
# Bundled modules with `if (import.meta.url === ...)` guards execute in the bundle
# because import.meta.url matches process.argv[1] when everything is in one file.
# These are standalone CLI entry points (skill-search, generate-skill-docs) that
# must not run during WheelHub server startup.
echo "[build-wheelhub] Stripping CLI main() blocks ..."
python3 - "$TMP_OUT" <<'PYEOF'
import re, sys

filepath = sys.argv[1]
with open(filepath, 'r') as f:
    content = f.read()

# Match: if (import.meta.url === `file://${process.argv[1]}`) { ... }
# These are top-level if-blocks with CLI entry points bundled by esbuild.
# In the bundle, import.meta.url always matches process.argv[1], so these
# blocks execute unintentionally and crash the server.
pattern = r'if \(import\.meta\.url === \x60file://\$\{process\.argv\[1\]\}\x60\) \{'

count = 0
while True:
    m = re.search(pattern, content)
    if not m:
        break
    start = m.start()
    depth = 0
    i = m.end() - 1
    while i < len(content):
        if content[i] == '{':
            depth += 1
        elif content[i] == '}':
            depth -= 1
            if depth == 0:
                content = content[:start] + content[i+1:]
                count += 1
                break
        i += 1
    else:
        print('[build-wheelhub] WARNING: Unbalanced braces in CLI block', file=sys.stderr)
        sys.exit(1)

with open(filepath, 'w') as f:
    f.write(content)

print(f'[build-wheelhub] Stripped {count} CLI main() block(s)')
PYEOF

# --- Step 3: Validate ---
echo "[build-wheelhub] Validating ..."

# Must have createRequire banner
if ! grep -q 'import { createRequire } from "node:module"' "$TMP_OUT"; then
    echo "[build-wheelhub] FAIL: Missing createRequire banner" >&2
    exit 1
fi

# Must NOT have CLI main() blocks
if grep -q 'import.meta.url === .file://\${process.argv\[1\]}.' "$TMP_OUT"; then
    echo "[build-wheelhub] FAIL: CLI main() blocks still present" >&2
    exit 1
fi

echo "[build-wheelhub] Validation passed"

# --- Step 4: Install ---
mkdir -p "$DEST_DIR"
cp "$TMP_OUT" "$DEST"
rm -f "$TMP_OUT"
echo "[build-wheelhub] Installed to $DEST"

# --- Step 5: Optional pipx reinstall ---
if [[ "${1:-}" == "--install" ]]; then
    echo "[build-wheelhub] Running pipx install --force ..."
    pipx install --force "$REPO_ROOT"
    echo "[build-wheelhub] pip package updated"
fi

echo "[build-wheelhub] Done. Run 'pf init' in consumer projects to propagate."
