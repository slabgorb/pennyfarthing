#!/bin/bash
# Copy medium and large portraits for npm distribution
# Run from packages/cyclist directory

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CYCLIST_DIR="$(dirname "$SCRIPT_DIR")"
PORTRAITS_SRC="$CYCLIST_DIR/../../pennyfarthing-dist/personas/portraits"
PORTRAITS_DEST="$CYCLIST_DIR/portraits"

# Clean and create destination
rm -rf "$PORTRAITS_DEST"
mkdir -p "$PORTRAITS_DEST"

# Copy only medium (128x128) and large (256x256) portraits
echo "Copying portraits for distribution..."

for theme_dir in "$PORTRAITS_SRC"/*/; do
    theme_name=$(basename "$theme_dir")

    # Create theme directory
    mkdir -p "$PORTRAITS_DEST/$theme_name"

    # Copy medium if exists
    if [ -d "$theme_dir/medium" ]; then
        cp -r "$theme_dir/medium" "$PORTRAITS_DEST/$theme_name/"
    fi

    # Copy large if exists
    if [ -d "$theme_dir/large" ]; then
        cp -r "$theme_dir/large" "$PORTRAITS_DEST/$theme_name/"
    fi
done

# Calculate size
SIZE=$(du -sh "$PORTRAITS_DEST" | cut -f1)
echo "Copied portraits: $SIZE"
