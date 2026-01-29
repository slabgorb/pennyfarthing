#!/usr/bin/env zsh
# Sprint metrics calculator
# Usage: ./sprint-metrics.sh [--json]
#
# Displays sprint statistics from sprint/current-sprint.yaml:
# - Points burned vs remaining
# - Story completion rates
# - Days remaining in sprint
# - Percentage complete

set -e

# Find project root
find_project_root() {
    local dir="$PWD"
    while [[ ! -d "$dir/.pennyfarthing" ]] && [[ "$dir" != "/" ]]; do
        dir="$(dirname "$dir")"
    done
    if [[ -d "$dir/.pennyfarthing" ]]; then
        echo "$dir"
    else
        echo "$PWD"
    fi
}

PROJECT_ROOT="${PROJECT_ROOT:-$(find_project_root)}"
SPRINT_FILE="$PROJECT_ROOT/sprint/current-sprint.yaml"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m'

# Check for JSON output mode
JSON_MODE=false
for arg in "$@"; do
    case $arg in
        --json)
            JSON_MODE=true
            ;;
        -h|--help)
            cat << 'EOF'
Sprint Metrics - Display current sprint statistics

Usage: ./sprint-metrics.sh [--json]

Options:
  --json    Output in JSON format (for automation)
  -h        Show this help

Output includes:
  - Sprint number and goal
  - Points: completed, in progress, remaining
  - Stories: done, in progress, backlog counts
  - Days elapsed and remaining
  - Percentage complete
  - Velocity tracking

EOF
            exit 0
            ;;
    esac
done

# Verify sprint file exists
if [[ ! -f "$SPRINT_FILE" ]]; then
    echo -e "${RED}❌ Sprint file not found: $SPRINT_FILE${NC}"
    exit 1
fi

# Parse sprint metadata
SPRINT_NUMBER=$(grep -E "^  number:" "$SPRINT_FILE" | head -1 | awk '{print $2}')
SPRINT_GOAL=$(grep -E "^  goal:" "$SPRINT_FILE" | head -1 | sed 's/.*goal: *"//' | sed 's/"$//')
START_DATE=$(grep -E "^  start_date:" "$SPRINT_FILE" | head -1 | awk '{print $2}')
END_DATE=$(grep -E "^  end_date:" "$SPRINT_FILE" | head -1 | awk '{print $2}')

# Parse summary section
TOTAL_POINTS=$(grep -E "^  total_points:" "$SPRINT_FILE" | awk '{print $2}')
COMPLETED_POINTS=$(grep -E "^  completed_points:" "$SPRINT_FILE" | awk '{print $2}')
IN_PROGRESS_POINTS=$(grep -E "^  in_progress_points:" "$SPRINT_FILE" | awk '{print $2}')
BACKLOG_POINTS=$(grep -E "^  backlog_points:" "$SPRINT_FILE" | awk '{print $2}')
VELOCITY_TARGET=$(grep -E "^  velocity_target:" "$SPRINT_FILE" | awk '{print $2}')

# Count stories by status
DONE_STORIES=$(grep -E "^\s+status: done" "$SPRINT_FILE" | wc -l | tr -d ' ')
IN_PROGRESS_STORIES=$(grep -E "^\s+status: in.progress" "$SPRINT_FILE" | wc -l | tr -d ' ')
BACKLOG_STORIES=$(grep -E "^\s+status: backlog" "$SPRINT_FILE" | wc -l | tr -d ' ')
TOTAL_STORIES=$((DONE_STORIES + IN_PROGRESS_STORIES + BACKLOG_STORIES))

# Calculate dates
TODAY=$(date +%Y-%m-%d)
START_EPOCH=$(date -j -f "%Y-%m-%d" "$START_DATE" +%s 2>/dev/null || date -d "$START_DATE" +%s 2>/dev/null)
END_EPOCH=$(date -j -f "%Y-%m-%d" "$END_DATE" +%s 2>/dev/null || date -d "$END_DATE" +%s 2>/dev/null)
TODAY_EPOCH=$(date +%s)

TOTAL_DAYS=$(( (END_EPOCH - START_EPOCH) / 86400 ))
DAYS_ELAPSED=$(( (TODAY_EPOCH - START_EPOCH) / 86400 ))
DAYS_REMAINING=$(( (END_EPOCH - TODAY_EPOCH) / 86400 ))

# Ensure non-negative
[[ $DAYS_ELAPSED -lt 0 ]] && DAYS_ELAPSED=0
[[ $DAYS_REMAINING -lt 0 ]] && DAYS_REMAINING=0

# Calculate percentages
if [[ $TOTAL_POINTS -gt 0 ]]; then
    PERCENT_COMPLETE=$(( (COMPLETED_POINTS * 100) / TOTAL_POINTS ))
else
    PERCENT_COMPLETE=0
fi

if [[ $TOTAL_DAYS -gt 0 ]]; then
    PERCENT_TIME=$(( (DAYS_ELAPSED * 100) / TOTAL_DAYS ))
else
    PERCENT_TIME=0
fi

# Calculate velocity tracking
EXPECTED_POINTS=0
if [[ $TOTAL_DAYS -gt 0 ]]; then
    EXPECTED_POINTS=$(( (VELOCITY_TARGET * DAYS_ELAPSED) / TOTAL_DAYS ))
fi

# JSON output mode
if [[ "$JSON_MODE" == "true" ]]; then
    cat << EOF
{
  "sprint": $SPRINT_NUMBER,
  "dates": {
    "start": "$START_DATE",
    "end": "$END_DATE",
    "today": "$TODAY"
  },
  "points": {
    "total": $TOTAL_POINTS,
    "completed": $COMPLETED_POINTS,
    "in_progress": $IN_PROGRESS_POINTS,
    "backlog": $BACKLOG_POINTS,
    "velocity_target": $VELOCITY_TARGET
  },
  "stories": {
    "total": $TOTAL_STORIES,
    "done": $DONE_STORIES,
    "in_progress": $IN_PROGRESS_STORIES,
    "backlog": $BACKLOG_STORIES
  },
  "progress": {
    "percent_complete": $PERCENT_COMPLETE,
    "percent_time": $PERCENT_TIME,
    "days_elapsed": $DAYS_ELAPSED,
    "days_remaining": $DAYS_REMAINING,
    "total_days": $TOTAL_DAYS
  },
  "velocity": {
    "expected_points": $EXPECTED_POINTS,
    "actual_points": $COMPLETED_POINTS,
    "on_track": $([ $COMPLETED_POINTS -ge $EXPECTED_POINTS ] && echo "true" || echo "false")
  }
}
EOF
    exit 0
fi

# Human-readable output
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Sprint $SPRINT_NUMBER Metrics${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

echo ""
echo -e "${BOLD}📋 Goal:${NC} $SPRINT_GOAL"

echo ""
echo -e "${BOLD}📅 Timeline${NC}"
echo -e "   Start:     ${CYAN}$START_DATE${NC}"
echo -e "   End:       ${CYAN}$END_DATE${NC}"
echo -e "   Today:     ${CYAN}$TODAY${NC} (Day $DAYS_ELAPSED of $TOTAL_DAYS)"
if [[ $DAYS_REMAINING -gt 0 ]]; then
    echo -e "   Remaining: ${GREEN}$DAYS_REMAINING days${NC}"
else
    echo -e "   Remaining: ${RED}Sprint ended${NC}"
fi

echo ""
echo -e "${BOLD}📊 Points${NC}"
printf "   Completed:   ${GREEN}%3d${NC} pts\n" "$COMPLETED_POINTS"
printf "   In Progress: ${YELLOW}%3d${NC} pts\n" "$IN_PROGRESS_POINTS"
printf "   Backlog:     ${CYAN}%3d${NC} pts\n" "$BACKLOG_POINTS"
echo -e "   ─────────────────"
printf "   Total:       ${BOLD}%3d${NC} pts\n" "$TOTAL_POINTS"

echo ""
echo -e "${BOLD}📈 Stories${NC}"
printf "   Done:        ${GREEN}%3d${NC}\n" "$DONE_STORIES"
printf "   In Progress: ${YELLOW}%3d${NC}\n" "$IN_PROGRESS_STORIES"
printf "   Backlog:     ${CYAN}%3d${NC}\n" "$BACKLOG_STORIES"
echo -e "   ─────────────────"
printf "   Total:       ${BOLD}%3d${NC}\n" "$TOTAL_STORIES"

echo ""
echo -e "${BOLD}🎯 Progress${NC}"

# Progress bar for points
BAR_WIDTH=20
FILLED=$(( (PERCENT_COMPLETE * BAR_WIDTH) / 100 ))
EMPTY=$((BAR_WIDTH - FILLED))
BAR=""
for ((i=0; i<FILLED; i++)); do BAR+="█"; done
for ((i=0; i<EMPTY; i++)); do BAR+="░"; done

echo -e "   Points:   [${GREEN}${BAR}${NC}] ${PERCENT_COMPLETE}%"

# Progress bar for time
TIME_FILLED=$(( (PERCENT_TIME * BAR_WIDTH) / 100 ))
TIME_EMPTY=$((BAR_WIDTH - TIME_FILLED))
TIME_BAR=""
for ((i=0; i<TIME_FILLED; i++)); do TIME_BAR+="█"; done
for ((i=0; i<TIME_EMPTY; i++)); do TIME_BAR+="░"; done

echo -e "   Time:     [${CYAN}${TIME_BAR}${NC}] ${PERCENT_TIME}%"

echo ""
echo -e "${BOLD}🏃 Velocity${NC}"
echo -e "   Target:   ${CYAN}$VELOCITY_TARGET${NC} pts/sprint"
echo -e "   Expected: ${CYAN}$EXPECTED_POINTS${NC} pts by now"
echo -e "   Actual:   ${GREEN}$COMPLETED_POINTS${NC} pts completed"

if [[ $COMPLETED_POINTS -ge $EXPECTED_POINTS ]]; then
    echo -e "   Status:   ${GREEN}✅ On track${NC}"
elif [[ $COMPLETED_POINTS -ge $((EXPECTED_POINTS - 2)) ]]; then
    echo -e "   Status:   ${YELLOW}⚠️  Slightly behind${NC}"
else
    echo -e "   Status:   ${RED}❌ Behind schedule${NC}"
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
