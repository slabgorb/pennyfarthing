#!/usr/bin/env bash
# Run all E2E test scenarios in Docker containers.
#
# Usage:
#   ./tests/e2e/run.sh              # run all scenarios
#   ./tests/e2e/run.sh fresh-init   # run one scenario
#   ./tests/e2e/run.sh --local      # run locally (no Docker)
#
# Each scenario runs in an isolated container with Node 24 + Python 3.14.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

SCENARIOS=(
    fresh-init
    reinit-preserves-custom
    wheelhub-node24
    upgrade-safety
    orc-ax-snapshot
    idempotency
)

# --- Parse args ---
RUN_LOCAL=false
FILTER=""

for arg in "$@"; do
    case "$arg" in
        --local) RUN_LOCAL=true ;;
        --help|-h)
            echo "Usage: $0 [--local] [scenario-name]"
            echo ""
            echo "Scenarios:"
            for s in "${SCENARIOS[@]}"; do
                echo "  $s"
            done
            exit 0
            ;;
        *) FILTER="$arg" ;;
    esac
done

# --- Filter scenarios ---
if [[ -n "$FILTER" ]]; then
    FOUND=false
    for s in "${SCENARIOS[@]}"; do
        if [[ "$s" == "$FILTER" ]]; then
            SCENARIOS=("$FILTER")
            FOUND=true
            break
        fi
    done
    if [[ "$FOUND" == false ]]; then
        echo "Unknown scenario: $FILTER"
        echo "Available: ${SCENARIOS[*]}"
        exit 1
    fi
fi

# --- Run ---
TOTAL=0
PASSED=0
FAILED=0
FAILED_NAMES=()

echo ""
echo -e "${BLUE}Pennyfarthing E2E Test Suite${NC}"
echo "========================================="
echo ""

if [[ "$RUN_LOCAL" == true ]]; then
    echo "Mode: LOCAL (no Docker)"
    echo ""

    for scenario in "${SCENARIOS[@]}"; do
        TOTAL=$((TOTAL + 1))
        SCRIPT="$SCRIPT_DIR/scenarios/${scenario}.sh"
        if [[ ! -f "$SCRIPT" ]]; then
            echo -e "${RED}SKIP${NC}: $scenario (script not found)"
            FAILED=$((FAILED + 1))
            FAILED_NAMES+=("$scenario")
            continue
        fi

        echo -e "${BLUE}Running: $scenario${NC}"
        if bash "$SCRIPT"; then
            PASSED=$((PASSED + 1))
        else
            FAILED=$((FAILED + 1))
            FAILED_NAMES+=("$scenario")
        fi
        echo ""
    done
else
    echo "Mode: DOCKER"

    # Build the image once
    echo "Building test image ..."
    if ! docker compose -f "$SCRIPT_DIR/docker-compose.yml" build --quiet 2>&1 | tail -3; then
        echo -e "${RED}Docker build failed${NC}"
        exit 1
    fi
    echo ""

    for scenario in "${SCENARIOS[@]}"; do
        TOTAL=$((TOTAL + 1))
        echo -e "${BLUE}Running: $scenario${NC}"
        if docker compose -f "$SCRIPT_DIR/docker-compose.yml" run --rm "$scenario" 2>&1; then
            PASSED=$((PASSED + 1))
        else
            FAILED=$((FAILED + 1))
            FAILED_NAMES+=("$scenario")
        fi
        echo ""
    done
fi

# --- Summary ---
echo "========================================="
echo "  E2E Suite Summary"
echo "========================================="
echo "Total:  $TOTAL"
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"

if [[ ${#FAILED_NAMES[@]} -gt 0 ]]; then
    echo ""
    echo "Failed scenarios:"
    for name in "${FAILED_NAMES[@]}"; do
        echo -e "  ${RED}x${NC} $name"
    done
fi

echo ""
if [[ $FAILED -gt 0 ]]; then
    echo -e "${RED}FAILED${NC}"
    exit 1
else
    echo -e "${GREEN}ALL PASSED${NC}"
    exit 0
fi
