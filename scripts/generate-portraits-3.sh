#!/usr/bin/env bash
#
# Portrait Generator - Batch 3 of 3 (themes 65-96)
# Run all three scripts in parallel for faster generation
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

THEMES=(
    "princess-bride"
    "renaissance-masters"
    "rome"
    "russian-masters"
    "sandman"
    "scientific-revolutionaries"
    "shakespeare"
    "sherlock-holmes"
    "snow-crash"
    "software-pioneers"
    "star-trek-tng"
    "star-trek-tos"
    "star-wars"
    "succession"
    "superfriends"
    "ted-lasso"
    "the-americans"
    "the-crown"
    "the-expanse"
    "the-good-place"
    "the-matrix"
    "the-office"
    "the-simpsons"
    "the-sopranos"
    "the-wire"
    "the-witcher"
    "vorkosigan-saga"
    "watchmen"
    "west-wing"
    "world-explorers"
    "wwii-leaders"
)

echo "Batch 3/3: ${#THEMES[@]} themes"
for theme in "${THEMES[@]}"; do
    "$SCRIPT_DIR/generate-portraits.sh" --theme "$theme" --skip-existing "$@"
done
echo "Batch 3/3 complete"
