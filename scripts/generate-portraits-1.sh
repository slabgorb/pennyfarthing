#!/usr/bin/env bash
#
# Portrait Generator - Batch 1 of 3 (themes 1-32)
# Run all three scripts in parallel for faster generation
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

THEMES=(
    "1984"
    "a-team"
    "agatha-christie"
    "ancient-philosophers"
    "ancient-strategists"
    "arcane"
    "arthurian-mythos"
    "avatar-the-last-airbender"
    "babylon-5"
    "battlestar-galactica"
    "better-call-saul"
    "big-lebowski"
    "black-sails"
    "blade-runner"
    "bobiverse"
    "breaking-bad"
    "catch-22"
    "classical-composers"
    "control"
    "count-of-monte-cristo"
    "cowboy-bebop"
    "deadwood"
    "dickens"
    "discworld"
    "doctor-who"
    "don-quixote"
    "dune"
    "enlightenment-thinkers"
    "expeditionary-force"
    "fargo"
    "film-auteurs"
    "firefly"
)

echo "Batch 1/3: ${#THEMES[@]} themes"
for theme in "${THEMES[@]}"; do
    "$SCRIPT_DIR/generate-portraits.sh" --theme "$theme" --skip-existing "$@"
done
echo "Batch 1/3 complete"
