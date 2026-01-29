#!/bin/bash
# Initialize a new sprint from template
# Usage: .pennyfarthing/scripts/core/run.sh sprint/new-sprint.sh <sprint-yyww> <jira-id> <start-date> <end-date> "<goal>"
#
# Example: .pennyfarthing/scripts/core/run.sh sprint/new-sprint.sh 2605 277 2026-02-03 2026-02-16 "Polish and stabilization"

set -euo pipefail

SPRINT_YYWW="${1:-}"
JIRA_ID="${2:-}"
START_DATE="${3:-}"
END_DATE="${4:-}"
GOAL="${5:-}"

if [[ -z "$SPRINT_YYWW" || -z "$JIRA_ID" || -z "$START_DATE" || -z "$END_DATE" || -z "$GOAL" ]]; then
  echo "Usage: new-sprint.sh <sprint-yyww> <jira-id> <start-date> <end-date> \"<goal>\""
  echo ""
  echo "Arguments:"
  echo "  sprint-yyww  Sprint identifier in YYWW format (e.g., 2605 for 2026 week 5)"
  echo "  jira-id      Jira sprint ID number (e.g., 277)"
  echo "  start-date   Sprint start date YYYY-MM-DD"
  echo "  end-date     Sprint end date YYYY-MM-DD"
  echo "  goal         Sprint goal (quoted string)"
  echo ""
  echo "Example:"
  echo "  new-sprint.sh 2605 277 2026-02-03 2026-02-16 \"Polish and stabilization\""
  exit 1
fi

# PROJECT_ROOT should be set by run.sh, but find it if not
if [[ -z "${PROJECT_ROOT:-}" ]]; then
  d="$PWD"
  while [[ ! -d "$d/.claude" ]] && [[ "$d" != "/" ]]; do
    d="$(dirname "$d")"
  done
  PROJECT_ROOT="$d"
fi
TEMPLATE_FILE="$PROJECT_ROOT/sprint/sprint-template.yaml"
SPRINT_FILE="$PROJECT_ROOT/sprint/current-sprint.yaml"
ARCHIVE_FILE="$PROJECT_ROOT/sprint/archive/sprint-${SPRINT_YYWW}-completed.yaml"

# Check template exists
if [[ ! -f "$TEMPLATE_FILE" ]]; then
  echo "Error: Template file not found at $TEMPLATE_FILE"
  exit 1
fi

# Warn if current sprint file exists and is active
if [[ -f "$SPRINT_FILE" ]]; then
  if ! command -v yq &> /dev/null; then
    echo "Warning: yq not installed, cannot check current sprint status"
  else
    CURRENT_STATUS=$(yq eval '.sprint.status' "$SPRINT_FILE")
    if [[ "$CURRENT_STATUS" == "active" ]]; then
      echo "Warning: Current sprint is still active!"
      echo "Current sprint file will be overwritten."
      echo ""
      read -p "Continue? [y/N] " -n 1 -r
      echo
      if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 1
      fi
    fi
  fi
fi

# Create new sprint file
cat > "$SPRINT_FILE" << EOF
sprint:
  name: "TO Sprint $SPRINT_YYWW"
  jira_sprint_id: $JIRA_ID
  jira_sprint_name: "TO Sprint $SPRINT_YYWW"
  goal: $GOAL
  start_date: $START_DATE
  end_date: $END_DATE
  status: active

# Completed stories archived to: sprint/archive/sprint-${SPRINT_YYWW}-completed.yaml

epics:
  # Add epics and stories here
  # See sprint/sprint-template.yaml for format reference
EOF

echo "Created $SPRINT_FILE"

# Create archive file
cat > "$ARCHIVE_FILE" << EOF
# Sprint TO Sprint $SPRINT_YYWW - Completed Stories
# Jira Sprint ID: $JIRA_ID
# Archived: $(date +%Y-%m-%d)

sprint:
  name: "TO Sprint $SPRINT_YYWW"
  jira_sprint_id: $JIRA_ID
  jira_sprint_name: "TO Sprint $SPRINT_YYWW"
  goal: $GOAL

completed:
  # Completed stories will be appended here by archive-story.sh
EOF

echo "Created $ARCHIVE_FILE"

echo ""
echo "New sprint initialized:"
echo "  Name: TO Sprint $SPRINT_YYWW"
echo "  Jira ID: $JIRA_ID"
echo "  Dates: $START_DATE to $END_DATE"
echo "  Goal: $GOAL"
echo ""
echo "Next steps:"
echo "  1. Add epics and stories to $SPRINT_FILE"
echo "  2. Use sprint-status.sh to check progress"
echo "  3. Use archive-story.sh to move completed stories"
