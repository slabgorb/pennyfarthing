#!/usr/bin/env bash
#
# Portrait Generator - Batch 2 of 3 (themes 33-64)
# Run all three scripts in parallel for faster generation
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

THEMES=(
    "foundation"
    "futurama"
    "game-of-thrones"
    "gilligans-island"
    "gothic-literature"
    "great-gatsby"
    "greek-mythology"
    "hannibal"
    "harry-potter"
    "his-dark-materials"
    "historical-figures"
    "hitchhikers-guide"
    "house-md"
    "imperial-radch"
    "inspector-morse"
    "jane-austen"
    "jazz-legends"
    "justified"
    "legion-of-doom"
    "les-miserables"
    "lord-of-the-rings"
    "lovecraft-mythos"
    "mad-men"
    "marvel-mcu"
    "mash"
    "mass-effect"
    "military-commanders"
    "moby-dick"
    "neuromancer"
    "norse-mythology"
    "parks-and-rec"
    "peaky-blinders"
)

echo "Batch 2/3: ${#THEMES[@]} themes"
for theme in "${THEMES[@]}"; do
    "$SCRIPT_DIR/generate-portraits.sh" --theme "$theme" --skip-existing "$@"
done
echo "Batch 2/3 complete"
