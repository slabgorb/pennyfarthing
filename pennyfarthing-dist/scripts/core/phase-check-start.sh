#!/bin/bash
# Start an agent with phase check
# If the current story's phase belongs to a different agent, emit handoff marker instead
#
# Usage: .pennyfarthing/scripts/core/phase-check-start.sh <agent>
# Example: phase-check-start.sh dev

set -euo pipefail

AGENT="${1:-}"

if [[ -z "$AGENT" ]]; then
  echo "Usage: phase-check-start.sh <agent>" >&2
  exit 1
fi

# Self-locate and set up PROJECT_ROOT
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
source "$SCRIPT_DIR/../lib/find-root.sh"

SCRIPTS_DIR="$SCRIPT_DIR/.."
SESSION_DIR="$PROJECT_ROOT/.session"

# Find active session file
SESSION_FILE=$(find "$SESSION_DIR" -maxdepth 1 -name "*-session.md" 2>/dev/null | head -1)

if [[ -z "$SESSION_FILE" || ! -f "$SESSION_FILE" ]]; then
  # No session - just start the agent normally
  exec "$SCRIPTS_DIR/core/agent-session.sh" start "$AGENT"
fi

# Extract workflow and phase from session (handles multiple formats)
# Format 1: **Workflow:** value
# Format 2: - **Workflow**: value
WORKFLOW=$(grep -E "\*\*Workflow\*?\*?:" "$SESSION_FILE" 2>/dev/null | head -1 | sed 's/.*\*\*Workflow\*\*[:\*]* *//' | tr -d ' ' || echo "")
PHASE=$(grep -E "\*\*Phase\*?\*?:" "$SESSION_FILE" 2>/dev/null | head -1 | sed 's/.*\*\*Phase\*\*[:\*]* *//' | tr -d ' ' || echo "")

if [[ -z "$WORKFLOW" ]]; then
  # Can't determine workflow - start normally
  exec "$SCRIPTS_DIR/core/agent-session.sh" start "$AGENT"
fi

# If no Phase field, try to infer from status patterns
if [[ -z "$PHASE" ]]; then
  # Check for approval status (story is done, needs SM to close)
  if grep -qE "\*\*Status\*\*:.*APPROVED" "$SESSION_FILE" 2>/dev/null; then
    PHASE="approved"
  # Check for review status
  elif grep -qE "Reviewer Assessment|Review.*REJECTED\|Review.*APPROVED" "$SESSION_FILE" 2>/dev/null; then
    PHASE="review"
  # Check for green/implementation complete
  elif grep -qE "Dev Assessment|\*\*Status\*\*:.*GREEN" "$SESSION_FILE" 2>/dev/null; then
    # Has dev assessment - could be in review or approved
    if grep -qE "Reviewer Assessment" "$SESSION_FILE" 2>/dev/null; then
      PHASE="approved"  # Reviewer already assessed
    else
      PHASE="review"    # Needs reviewer
    fi
  # Check for red/test phase
  elif grep -qE "TEA Assessment|\*\*Status\*\*:.*RED" "$SESSION_FILE" 2>/dev/null; then
    PHASE="green"  # TEA done, Dev's turn
  else
    # Can't determine phase - start normally
    exec "$SCRIPTS_DIR/core/agent-session.sh" start "$AGENT"
  fi
fi

# Get the owner of this phase
OWNER=$("$SCRIPTS_DIR/workflow/phase-owner.sh" "$WORKFLOW" "$PHASE" 2>/dev/null || echo "")

if [[ -z "$OWNER" ]]; then
  # Phase owner lookup failed - start normally
  exec "$SCRIPTS_DIR/core/agent-session.sh" start "$AGENT"
fi

# Check if this agent owns the phase
if [[ "$OWNER" == "$AGENT" ]]; then
  # Correct agent - start normally
  exec "$SCRIPTS_DIR/core/agent-session.sh" start "$AGENT"
fi

# Wrong agent! Output the handoff marker and info
STORY_ID=$(basename "$SESSION_FILE" -session.md)

echo "Phase check: Story $STORY_ID is in '$PHASE' phase (workflow: $WORKFLOW)"
echo "Phase owner: $OWNER (you requested: $AGENT)"
echo ""

# Generate and output the handoff marker
pf handoff marker "$OWNER"
