#!/bin/bash

THEMES_DIR="../../pennyfarthing-dist/personas/themes"
OUTPUT_DIR="$(dirname "$0")"

cd "$OUTPUT_DIR"

for theme_file in $THEMES_DIR/*.yaml; do
  theme_name=$(basename "$theme_file" .yaml)

  # Extract theme metadata
  theme_display_name=$(yq '.theme.name // "Unknown"' "$theme_file")
  source=$(yq '.theme.source // "Unknown source"' "$theme_file")

  # Extract character names and styles
  orchestrator_char=$(yq '.agents.orchestrator.character // "Unknown"' "$theme_file")
  orchestrator_style=$(yq '.agents.orchestrator.style // ""' "$theme_file" | head -c 100)

  sm_char=$(yq '.agents.sm.character // "Unknown"' "$theme_file")
  sm_style=$(yq '.agents.sm.style // ""' "$theme_file" | head -c 100)

  tea_char=$(yq '.agents.tea.character // "Unknown"' "$theme_file")
  tea_style=$(yq '.agents.tea.style // ""' "$theme_file" | head -c 100)

  dev_char=$(yq '.agents.dev.character // "Unknown"' "$theme_file")
  dev_style=$(yq '.agents.dev.style // ""' "$theme_file" | head -c 100)

  reviewer_char=$(yq '.agents.reviewer.character // "Unknown"' "$theme_file")
  reviewer_style=$(yq '.agents.reviewer.style // ""' "$theme_file" | head -c 100)

  architect_char=$(yq '.agents.architect.character // "Unknown"' "$theme_file")
  architect_style=$(yq '.agents.architect.style // ""' "$theme_file" | head -c 100)

  pm_char=$(yq '.agents.pm.character // "Unknown"' "$theme_file")
  pm_style=$(yq '.agents.pm.style // ""' "$theme_file" | head -c 100)

  tech_writer_char=$(yq '.agents.tech-writer.character // "Unknown"' "$theme_file")
  tech_writer_style=$(yq '.agents.tech-writer.style // ""' "$theme_file" | head -c 100)

  ux_designer_char=$(yq '.agents.ux-designer.character // "Unknown"' "$theme_file")
  ux_designer_style=$(yq '.agents.ux-designer.style // ""' "$theme_file" | head -c 100)

  devops_char=$(yq '.agents.devops.character // "Unknown"' "$theme_file")
  devops_style=$(yq '.agents.devops.style // ""' "$theme_file" | head -c 100)

  cat > "${theme_name}.txt" << EOF
Create a sprite sheet of 10 character portrait busts in a 5×2 grid (500px × 200px total, each portrait 100×100px).

**Style:** Traditional woodcut illustration, black and white only, bold linework with crosshatching for shading. High contrast, no grayscale gradients - only pure black lines on white background. Evokes medieval or Renaissance woodblock prints.

**Theme:** ${theme_display_name}
**Source:** ${source}

**Row 1 (left to right):**
1. **Orchestrator:** ${orchestrator_char} - ${orchestrator_style}
2. **SM (Scrum Master):** ${sm_char} - ${sm_style}
3. **TEA (Test Engineer):** ${tea_char} - ${tea_style}
4. **Dev (Developer):** ${dev_char} - ${dev_style}
5. **Reviewer:** ${reviewer_char} - ${reviewer_style}

**Row 2 (left to right):**
6. **Architect:** ${architect_char} - ${architect_style}
7. **PM (Product Manager):** ${pm_char} - ${pm_style}
8. **Tech Writer:** ${tech_writer_char} - ${tech_writer_style}
9. **UX Designer:** ${ux_designer_char} - ${ux_designer_style}
10. **DevOps:** ${devops_char} - ${devops_style}

**Requirements:**
- Each portrait clearly identifiable as the named character
- Include a small identifying prop or visual element for each character
- Consistent woodcut style across all 10 portraits
- Bold black lines, white background, crosshatch shading only
- Bust/headshot composition for each cell
EOF

  echo "Generated: ${theme_name}.txt"
done

echo "Done! Generated $(ls -1 *.txt | wc -l) prompt files"
