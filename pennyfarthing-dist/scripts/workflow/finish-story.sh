#!/bin/bash
# DEPRECATED: Use `pf sprint story finish` instead.
#
# This shell script had a bug where yq paths targeted .epics[].stories[]
# but the sprint YAML uses sharded epic files with .stories[] at root.
# The Python implementation (pennyfarthing_scripts.sprint.story_finish)
# correctly handles sharded YAML via read_sprint/write_sprint.
#
# Usage: finish-story.sh <story-id> [--dry-run]

set -euo pipefail

echo "DEPRECATED: finish-story.sh is deprecated. Forwarding to 'pf sprint story finish'." >&2

ARGS=()
for arg in "$@"; do
  ARGS+=("$arg")
done

exec pf sprint story finish "${ARGS[@]}"
