#!/usr/bin/env bash
# Job Fair Status - Accurate coverage detection
# Usage: ./scripts/job-fair-status.sh [--verbose]

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
THEMES_DIR="$PROJECT_DIR/pennyfarthing-dist/personas/themes"
RESULTS_DIR="$PROJECT_DIR/internal/results/job-fair"

VERBOSE=false
[[ "$1" == "--verbose" || "$1" == "-v" ]] && VERBOSE=true

# Get all theme names
all_themes=$(ls "$THEMES_DIR"/*.yaml 2>/dev/null | xargs -n1 basename | sed 's/\.yaml$//' | sort)
total_themes=$(echo "$all_themes" | wc -l | tr -d ' ')

# Find themes with valid job fair data (summary.yaml with matrix: section)
themes_with_data=()
themes_without_data=()
themes_partial=()

for theme in $all_themes; do
  # Look for any directory matching this theme
  found=false
  has_matrix=false
  
  for dir in "$RESULTS_DIR"/${theme}*/; do
    [[ -d "$dir" ]] || continue
    found=true
    
    if [[ -f "${dir}summary.yaml" ]]; then
      if grep -q "^matrix:" "${dir}summary.yaml" 2>/dev/null; then
        has_matrix=true
        break
      fi
    fi
  done
  
  if $has_matrix; then
    themes_with_data+=("$theme")
  elif $found; then
    themes_partial+=("$theme")
  else
    themes_without_data+=("$theme")
  fi
done

# Output summary
echo "=== Job Fair Coverage Status ==="
echo "Total themes: $total_themes"
echo "With data:    ${#themes_with_data[@]} (summary.yaml with matrix)"
echo "Partial:      ${#themes_partial[@]} (directory exists, no matrix)"
echo "Not started:  ${#themes_without_data[@]}"
echo ""
echo "Coverage: ${#themes_with_data[@]}/$total_themes ($(( ${#themes_with_data[@]} * 100 / total_themes ))%)"

if $VERBOSE; then
  if [[ ${#themes_partial[@]} -gt 0 ]]; then
    echo ""
    echo "### Partial (need consolidation or re-run):"
    printf '  - %s\n' "${themes_partial[@]}"
  fi
  
  if [[ ${#themes_without_data[@]} -gt 0 ]]; then
    echo ""
    echo "### Not Started:"
    printf '  - %s\n' "${themes_without_data[@]}"
  fi
fi

# Exit with status based on coverage
if [[ ${#themes_with_data[@]} -eq $total_themes ]]; then
  echo ""
  echo "✓ Full coverage achieved!"
  exit 0
else
  exit 1
fi
