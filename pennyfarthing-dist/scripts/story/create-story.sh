#!/usr/bin/env bash
# create-story.sh - Generate a story YAML block for adding to sprint
# Usage: create-story.sh <epic-id> <title> <points> [options]
#   --type bug|feature|refactor|chore  Story type (default: feature)
#   --workflow <name>                  Workflow override (auto-determined if not set)
#   --priority P0|P1|P2|P3             Priority (default: P2)
#   --repos <name>                     Repos affected
#   --jira                             Also show Jira create command

set -euo pipefail

# Defaults
TYPE="feature"
WORKFLOW=""
PRIORITY="P2"
REPOS=""
CREATE_JIRA=false

# Parse args
EPIC_ID=""
TITLE=""
POINTS=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --type)
            TYPE="$2"
            shift 2
            ;;
        --workflow)
            WORKFLOW="$2"
            shift 2
            ;;
        --priority)
            PRIORITY="$2"
            shift 2
            ;;
        --repos)
            REPOS="$2"
            shift 2
            ;;
        --jira)
            CREATE_JIRA=true
            shift
            ;;
        *)
            if [[ -z "$EPIC_ID" ]]; then
                EPIC_ID="$1"
            elif [[ -z "$TITLE" ]]; then
                TITLE="$1"
            elif [[ -z "$POINTS" ]]; then
                POINTS="$1"
            fi
            shift
            ;;
    esac
done

# Validate required args
if [[ -z "$EPIC_ID" ]] || [[ -z "$TITLE" ]] || [[ -z "$POINTS" ]]; then
    cat << 'EOF'
Usage: create-story.sh <epic-id> "<title>" <points> [options]

Arguments:
  epic-id    Parent epic (e.g., PROJ-1234)
  title      Story title (quoted)
  points     Story points (1, 2, 3, 5, 8)

Options:
  --type bug|feature|refactor|chore  Story type (default: feature)
  --workflow <name>                  Override auto-workflow
  --priority P0|P1|P2|P3             Priority (default: P2)
  --repos <name>                     Affected repos
  --jira                             Also show Jira create command

Examples:
  create-story.sh PROJ-1234 "Add error handling" 3
  create-story.sh PROJ-1234 "Fix typo" 1 --type chore
  create-story.sh PROJ-1234 "New feature" 5 --jira
EOF
    exit 1
fi

# Auto-determine workflow if not set
if [[ -z "$WORKFLOW" ]]; then
    case "$POINTS" in
        1|2)
            if [[ "$TYPE" == "chore" ]] || [[ "$TYPE" == "bug" ]]; then
                WORKFLOW="trivial"
            else
                WORKFLOW="tdd"
            fi
            ;;
        *)
            WORKFLOW="tdd"
            ;;
    esac
fi

# Generate story ID placeholder
STORY_ID="PROJ-XXXXX"

# Output YAML block
echo "# Add this to sprint/current-sprint.yaml under epic $EPIC_ID:"
echo ""
echo "      - id: $STORY_ID"
echo "        title: \"$TITLE\""
echo "        points: $POINTS"
echo "        priority: $PRIORITY"
echo "        status: backlog"
if [[ -n "$REPOS" ]]; then
    echo "        repos: $REPOS"
fi
echo "        workflow: $WORKFLOW"

# Add type-specific fields
case "$TYPE" in
    bug)
        cat << 'EOF'
        acceptance_criteria:
          - Bug no longer occurs
          - Regression test added
          - Related code audited for same issue
EOF
        ;;
    feature)
        cat << 'EOF'
        acceptance_criteria:
          - Feature works as specified
          - Tests cover happy path and edge cases
          - Error handling implemented
EOF
        ;;
    refactor)
        cat << 'EOF'
        acceptance_criteria:
          - All existing tests pass
          - No behavior changes
          - Code follows new pattern
EOF
        ;;
    chore)
        cat << 'EOF'
        acceptance_criteria:
          - Task completed
          - No regressions introduced
EOF
        ;;
esac

echo ""
echo "---"
echo "Type: $TYPE | Workflow: $WORKFLOW | Points: $POINTS"

if [[ "$CREATE_JIRA" == "true" ]]; then
    echo ""
    echo "To create in Jira:"
    echo "  jira issue create -t Story -s \"$TITLE\" -P <PROJECT> --parent $EPIC_ID --custom story-points=$POINTS"
fi
