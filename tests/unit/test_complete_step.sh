#!/bin/bash
# test_complete_step.sh - Unit tests for complete-step.py
# Story: PROJ-14299 - Wire up stepped workflow session state advancement
#
# Tests that complete-step.py correctly advances session state:
# AC1: Session file Current Step increments when a step completes
# AC2: Session file Steps Completed array populates correctly
# AC3: Session file Status changes to completed when all steps done
# AC4: Completion percentage updates in session file
# AC5: Works for all stepped workflows

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
COMPLETE_STEP="$PROJECT_DIR/pennyfarthing-dist/scripts/workflow/complete-step.py"

# Create temp directory for test fixtures
TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

echo "=== Complete Step Tests (PROJ-14299) ==="

PASS=0
FAIL=0

assert_eq() {
    local expected="$1"
    local actual="$2"
    local test_name="$3"

    if [[ "$actual" == "$expected" ]]; then
        echo "PASS: $test_name"
        ((PASS++))
    else
        echo "FAIL: $test_name - Expected '$expected', got '$actual'"
        ((FAIL++))
    fi
}

assert_contains() {
    local expected="$1"
    local actual="$2"
    local test_name="$3"

    if echo "$actual" | grep -qF "$expected"; then
        echo "PASS: $test_name"
        ((PASS++))
    else
        echo "FAIL: $test_name - Expected to contain '$expected', got '$actual'"
        ((FAIL++))
    fi
}

assert_not_contains() {
    local expected="$1"
    local actual="$2"
    local test_name="$3"

    if ! echo "$actual" | grep -qF "$expected"; then
        echo "PASS: $test_name"
        ((PASS++))
    else
        echo "FAIL: $test_name - Expected NOT to contain '$expected', got '$actual'"
        ((FAIL++))
    fi
}

# --- Setup mock project structure ---
setup_mock_project() {
    local test_dir="$1"
    rm -rf "$test_dir"
    mkdir -p "$test_dir/.pennyfarthing/workflows/test-workflow/steps"
    mkdir -p "$test_dir/.pennyfarthing/scripts/lib"
    mkdir -p "$test_dir/.session"

    # Create find-root.sh that uses explicit PROJECT_ROOT
    cat > "$test_dir/.pennyfarthing/scripts/lib/find-root.sh" << 'FINDROOT'
if [[ -n "${PROJECT_ROOT:-}" ]]; then
    export PROJECT_ROOT
    return 0 2>/dev/null || exit 0
fi
FINDROOT

    # Create workflow definition
    cat > "$test_dir/.pennyfarthing/workflows/test-workflow/workflow.yaml" << 'WFYAML'
workflow:
  name: test-workflow
  type: stepped
  description: Test workflow for unit tests
  agent: sm
  steps:
    path: ./steps
    pattern: "step-*.md"
WFYAML

    # Create 3 step files
    cat > "$test_dir/.pennyfarthing/workflows/test-workflow/steps/step-01-first.md" << 'STEP1'
# Step 1: First Step
Do the first thing.
STEP1

    cat > "$test_dir/.pennyfarthing/workflows/test-workflow/steps/step-02-second.md" << 'STEP2'
# Step 2: Second Step
Do the second thing.
STEP2

    cat > "$test_dir/.pennyfarthing/workflows/test-workflow/steps/step-03-third.md" << 'STEP3'
# Step 3: Third Step
Do the third thing.
STEP3
}

# Create a session file at step 1 (fresh workflow)
create_fresh_session() {
    local test_dir="$1"
    local workflow_name="${2:-test-workflow}"
    local session_file="$test_dir/.session/${workflow_name}-workflow-session.md"

    cat > "$session_file" << 'SESSION'
# Workflow Session: test-workflow

**Workflow:** test-workflow
**Type:** stepped
**Agent:** sm
**Started:** 2026-02-05T10:00:00Z

## Workflow State
- **Workflow Name:** test-workflow
- **Type:** stepped
- **Mode:** create
- **Started:** 2026-02-05T10:00:00Z
- **Last Updated:** 2026-02-05T10:00:00Z
- **Current Step:** 1
- **Steps Completed:** []
- **Status:** in_progress
- **Notes:** Session created via /workflow start

## Progress
- Total Steps: 3
- Completion: 0%

---

SESSION
    echo "$session_file"
}

# Create a session file at step 2 (1 step completed)
create_midway_session() {
    local test_dir="$1"
    local workflow_name="${2:-test-workflow}"
    local session_file="$test_dir/.session/${workflow_name}-workflow-session.md"

    cat > "$session_file" << 'SESSION'
# Workflow Session: test-workflow

**Workflow:** test-workflow
**Type:** stepped
**Agent:** sm
**Started:** 2026-02-05T10:00:00Z

## Workflow State
- **Workflow Name:** test-workflow
- **Type:** stepped
- **Mode:** create
- **Started:** 2026-02-05T10:00:00Z
- **Last Updated:** 2026-02-05T10:30:00Z
- **Current Step:** 2
- **Steps Completed:** [1]
- **Status:** in_progress
- **Notes:** Session created via /workflow start

## Progress
- Total Steps: 3
- Completion: 33%

---

SESSION
    echo "$session_file"
}

# Create a session file at step 3 (2 steps completed, about to finish)
create_penultimate_session() {
    local test_dir="$1"
    local workflow_name="${2:-test-workflow}"
    local session_file="$test_dir/.session/${workflow_name}-workflow-session.md"

    cat > "$session_file" << 'SESSION'
# Workflow Session: test-workflow

**Workflow:** test-workflow
**Type:** stepped
**Agent:** sm
**Started:** 2026-02-05T10:00:00Z

## Workflow State
- **Workflow Name:** test-workflow
- **Type:** stepped
- **Mode:** create
- **Started:** 2026-02-05T10:00:00Z
- **Last Updated:** 2026-02-05T11:00:00Z
- **Current Step:** 3
- **Steps Completed:** [1, 2]
- **Status:** in_progress
- **Notes:** Session created via /workflow start

## Progress
- Total Steps: 3
- Completion: 66%

---

SESSION
    echo "$session_file"
}

# =============================================================================
# Test: Script exists and is executable
# =============================================================================

echo ""
echo "--- Script Existence ---"

if [[ -f "$COMPLETE_STEP" ]]; then
    echo "PASS: complete-step.py exists"
    ((PASS++))
else
    echo "FAIL: complete-step.py does not exist at $COMPLETE_STEP"
    ((FAIL++))
fi

if [[ -x "$COMPLETE_STEP" ]]; then
    echo "PASS: complete-step.py is executable"
    ((PASS++))
else
    echo "FAIL: complete-step.py is not executable"
    ((FAIL++))
fi

# =============================================================================
# AC1: Session file Current Step increments when a step completes
# =============================================================================

echo ""
echo "--- AC1: Current Step Increments ---"

TEST_DIR="$TMPDIR/ac1"
setup_mock_project "$TEST_DIR"

# Test: Complete step 1, should advance to step 2
SESSION_FILE=$(create_fresh_session "$TEST_DIR")
PROJECT_ROOT="$TEST_DIR" "$COMPLETE_STEP" test-workflow 2>/dev/null
CURRENT_STEP=$(grep -E "^\- \*\*Current Step:\*\*" "$SESSION_FILE" 2>/dev/null | sed 's/.*\*\* //')
assert_eq "2" "$CURRENT_STEP" "AC1: Step 1 completion advances to step 2"

# Test: Complete step 2, should advance to step 3
SESSION_FILE=$(create_midway_session "$TEST_DIR")
PROJECT_ROOT="$TEST_DIR" "$COMPLETE_STEP" test-workflow 2>/dev/null
CURRENT_STEP=$(grep -E "^\- \*\*Current Step:\*\*" "$SESSION_FILE" 2>/dev/null | sed 's/.*\*\* //')
assert_eq "3" "$CURRENT_STEP" "AC1: Step 2 completion advances to step 3"

# Test: Explicit step number override
SESSION_FILE=$(create_fresh_session "$TEST_DIR")
PROJECT_ROOT="$TEST_DIR" "$COMPLETE_STEP" test-workflow --step 1 2>/dev/null
CURRENT_STEP=$(grep -E "^\- \*\*Current Step:\*\*" "$SESSION_FILE" 2>/dev/null | sed 's/.*\*\* //')
assert_eq "2" "$CURRENT_STEP" "AC1: Explicit --step 1 advances to step 2"

# =============================================================================
# AC2: Session file Steps Completed array populates correctly
# =============================================================================

echo ""
echo "--- AC2: Steps Completed Array ---"

TEST_DIR="$TMPDIR/ac2"
setup_mock_project "$TEST_DIR"

# Test: After completing step 1, array should be [1]
SESSION_FILE=$(create_fresh_session "$TEST_DIR")
PROJECT_ROOT="$TEST_DIR" "$COMPLETE_STEP" test-workflow 2>/dev/null
STEPS_COMPLETED=$(grep -E "^\- \*\*Steps Completed:\*\*" "$SESSION_FILE" 2>/dev/null | sed 's/.*\*\* //')
assert_eq "[1]" "$STEPS_COMPLETED" "AC2: After step 1 completion, array is [1]"

# Test: After completing step 2 (with step 1 already done), array should be [1, 2]
SESSION_FILE=$(create_midway_session "$TEST_DIR")
PROJECT_ROOT="$TEST_DIR" "$COMPLETE_STEP" test-workflow 2>/dev/null
STEPS_COMPLETED=$(grep -E "^\- \*\*Steps Completed:\*\*" "$SESSION_FILE" 2>/dev/null | sed 's/.*\*\* //')
assert_eq "[1, 2]" "$STEPS_COMPLETED" "AC2: After step 2 completion, array is [1, 2]"

# Test: After completing step 3 (final), array should be [1, 2, 3]
SESSION_FILE=$(create_penultimate_session "$TEST_DIR")
PROJECT_ROOT="$TEST_DIR" "$COMPLETE_STEP" test-workflow 2>/dev/null
STEPS_COMPLETED=$(grep -E "^\- \*\*Steps Completed:\*\*" "$SESSION_FILE" 2>/dev/null | sed 's/.*\*\* //')
assert_eq "[1, 2, 3]" "$STEPS_COMPLETED" "AC2: After final step completion, array is [1, 2, 3]"

# Test: Idempotent - completing same step twice doesn't duplicate
SESSION_FILE=$(create_midway_session "$TEST_DIR")
PROJECT_ROOT="$TEST_DIR" "$COMPLETE_STEP" test-workflow --step 1 2>/dev/null
STEPS_COMPLETED=$(grep -E "^\- \*\*Steps Completed:\*\*" "$SESSION_FILE" 2>/dev/null | sed 's/.*\*\* //')
assert_not_contains "1, 1" "$STEPS_COMPLETED" "AC2: Duplicate step completion is idempotent"

# =============================================================================
# AC3: Session file Status changes to completed when all steps done
# =============================================================================

echo ""
echo "--- AC3: Status Changes to Completed ---"

TEST_DIR="$TMPDIR/ac3"
setup_mock_project "$TEST_DIR"

# Test: Status stays in_progress when steps remain
SESSION_FILE=$(create_fresh_session "$TEST_DIR")
PROJECT_ROOT="$TEST_DIR" "$COMPLETE_STEP" test-workflow 2>/dev/null
STATUS=$(grep -E "^\- \*\*Status:\*\*" "$SESSION_FILE" 2>/dev/null | sed 's/.*\*\* //')
assert_eq "in_progress" "$STATUS" "AC3: Status remains in_progress after step 1 of 3"

# Test: Status stays in_progress after step 2
SESSION_FILE=$(create_midway_session "$TEST_DIR")
PROJECT_ROOT="$TEST_DIR" "$COMPLETE_STEP" test-workflow 2>/dev/null
STATUS=$(grep -E "^\- \*\*Status:\*\*" "$SESSION_FILE" 2>/dev/null | sed 's/.*\*\* //')
assert_eq "in_progress" "$STATUS" "AC3: Status remains in_progress after step 2 of 3"

# Test: Status changes to completed after final step
SESSION_FILE=$(create_penultimate_session "$TEST_DIR")
PROJECT_ROOT="$TEST_DIR" "$COMPLETE_STEP" test-workflow 2>/dev/null
STATUS=$(grep -E "^\- \*\*Status:\*\*" "$SESSION_FILE" 2>/dev/null | sed 's/.*\*\* //')
assert_eq "completed" "$STATUS" "AC3: Status changes to completed after all steps done"

# Test: Reject completion on already-completed workflow
SESSION_FILE=$(create_penultimate_session "$TEST_DIR")
# First complete it
PROJECT_ROOT="$TEST_DIR" "$COMPLETE_STEP" test-workflow 2>/dev/null
# Try to complete again
OUTPUT=$(PROJECT_ROOT="$TEST_DIR" "$COMPLETE_STEP" test-workflow 2>&1 || true)
assert_contains "completed" "$OUTPUT" "AC3: Already-completed workflow reports completed status"

# =============================================================================
# AC4: Completion percentage updates in session file
# =============================================================================

echo ""
echo "--- AC4: Completion Percentage Updates ---"

TEST_DIR="$TMPDIR/ac4"
setup_mock_project "$TEST_DIR"

# Test: After completing step 1 of 3, completion should be ~33%
SESSION_FILE=$(create_fresh_session "$TEST_DIR")
PROJECT_ROOT="$TEST_DIR" "$COMPLETE_STEP" test-workflow 2>/dev/null
COMPLETION=$(grep -E "^- Completion:" "$SESSION_FILE" 2>/dev/null | sed 's/.*: //' | tr -d '%')
assert_eq "33" "$COMPLETION" "AC4: Completion is 33% after 1 of 3 steps"

# Test: After completing step 2 of 3, completion should be ~66%
SESSION_FILE=$(create_midway_session "$TEST_DIR")
PROJECT_ROOT="$TEST_DIR" "$COMPLETE_STEP" test-workflow 2>/dev/null
COMPLETION=$(grep -E "^- Completion:" "$SESSION_FILE" 2>/dev/null | sed 's/.*: //' | tr -d '%')
assert_eq "66" "$COMPLETION" "AC4: Completion is 66% after 2 of 3 steps"

# Test: After completing all steps, completion should be 100%
SESSION_FILE=$(create_penultimate_session "$TEST_DIR")
PROJECT_ROOT="$TEST_DIR" "$COMPLETE_STEP" test-workflow 2>/dev/null
COMPLETION=$(grep -E "^- Completion:" "$SESSION_FILE" 2>/dev/null | sed 's/.*: //' | tr -d '%')
assert_eq "100" "$COMPLETION" "AC4: Completion is 100% after all steps done"

# Test: Last Updated timestamp changes
SESSION_FILE=$(create_fresh_session "$TEST_DIR")
BEFORE_UPDATE=$(grep -E "^\- \*\*Last Updated:\*\*" "$SESSION_FILE" 2>/dev/null | sed 's/.*\*\* //')
sleep 1  # Ensure timestamp changes
PROJECT_ROOT="$TEST_DIR" "$COMPLETE_STEP" test-workflow 2>/dev/null
AFTER_UPDATE=$(grep -E "^\- \*\*Last Updated:\*\*" "$SESSION_FILE" 2>/dev/null | sed 's/.*\*\* //')
if [[ "$BEFORE_UPDATE" != "$AFTER_UPDATE" ]]; then
    echo "PASS: AC4: Last Updated timestamp changes on step completion"
    ((PASS++))
else
    echo "FAIL: AC4: Last Updated timestamp should change (before=$BEFORE_UPDATE, after=$AFTER_UPDATE)"
    ((FAIL++))
fi

# =============================================================================
# AC5: Works for all stepped workflows
# =============================================================================

echo ""
echo "--- AC5: Works Across Workflow Types ---"

TEST_DIR="$TMPDIR/ac5"
setup_mock_project "$TEST_DIR"

# Test with a different workflow name (simulating different workflow)
mkdir -p "$TEST_DIR/.pennyfarthing/workflows/prd/steps"

cat > "$TEST_DIR/.pennyfarthing/workflows/prd/workflow.yaml" << 'WFYAML'
workflow:
  name: prd
  type: stepped
  description: Product Requirements Document workflow
  agent: pm
  steps:
    path: ./steps
    pattern: "step-*.md"
WFYAML

cat > "$TEST_DIR/.pennyfarthing/workflows/prd/steps/step-01-requirements.md" << 'STEP'
# Step 1: Requirements
Gather requirements.
STEP

cat > "$TEST_DIR/.pennyfarthing/workflows/prd/steps/step-02-document.md" << 'STEP'
# Step 2: Document
Write the PRD.
STEP

# Create session for prd workflow
PRD_SESSION="$TEST_DIR/.session/prd-workflow-session.md"
cat > "$PRD_SESSION" << 'SESSION'
# Workflow Session: prd

**Workflow:** prd
**Type:** stepped
**Agent:** pm
**Started:** 2026-02-05T10:00:00Z

## Workflow State
- **Workflow Name:** prd
- **Type:** stepped
- **Mode:** create
- **Started:** 2026-02-05T10:00:00Z
- **Last Updated:** 2026-02-05T10:00:00Z
- **Current Step:** 1
- **Steps Completed:** []
- **Status:** in_progress
- **Notes:** Session created via /workflow start

## Progress
- Total Steps: 2
- Completion: 0%

---

SESSION

# Test: Complete step on prd workflow
PROJECT_ROOT="$TEST_DIR" "$COMPLETE_STEP" prd 2>/dev/null
PRD_CURRENT=$(grep -E "^\- \*\*Current Step:\*\*" "$PRD_SESSION" 2>/dev/null | sed 's/.*\*\* //')
assert_eq "2" "$PRD_CURRENT" "AC5: Step completion works for prd workflow"

PRD_COMPLETION=$(grep -E "^- Completion:" "$PRD_SESSION" 2>/dev/null | sed 's/.*: //' | tr -d '%')
assert_eq "50" "$PRD_COMPLETION" "AC5: Completion percentage correct for 2-step workflow"

# Test: Auto-detect workflow from session when no name given
SESSION_FILE=$(create_fresh_session "$TEST_DIR")
# Remove the prd session so only test-workflow session exists
rm -f "$PRD_SESSION"
PROJECT_ROOT="$TEST_DIR" "$COMPLETE_STEP" 2>/dev/null
CURRENT_STEP=$(grep -E "^\- \*\*Current Step:\*\*" "$SESSION_FILE" 2>/dev/null | sed 's/.*\*\* //')
assert_eq "2" "$CURRENT_STEP" "AC5: Auto-detect workflow from active session"

# =============================================================================
# Edge Cases
# =============================================================================

echo ""
echo "--- Edge Cases ---"

TEST_DIR="$TMPDIR/edge"
setup_mock_project "$TEST_DIR"

# Test: No session file → error
OUTPUT=$(PROJECT_ROOT="$TEST_DIR" "$COMPLETE_STEP" nonexistent-workflow 2>&1 || true)
assert_contains "session" "$OUTPUT" "Edge: Missing session file reports error"

# Test: Usage with no args and no session → shows help
rm -rf "$TEST_DIR/.session/"*
OUTPUT=$(PROJECT_ROOT="$TEST_DIR" "$COMPLETE_STEP" 2>&1 || true)
if echo "$OUTPUT" | grep -qiE "usage|no.*session|error"; then
    echo "PASS: Edge: No args and no session shows usage/error"
    ((PASS++))
else
    echo "FAIL: Edge: Should show usage or error when no args and no session"
    ((FAIL++))
fi

# Test: Script outputs next step content after completion
SESSION_FILE=$(create_fresh_session "$TEST_DIR")
OUTPUT=$(PROJECT_ROOT="$TEST_DIR" "$COMPLETE_STEP" test-workflow 2>&1 || true)
assert_contains "Step 2" "$OUTPUT" "Edge: Output includes next step info after completion"

# =============================================================================
# Summary
# =============================================================================

echo ""
echo "================================"
echo "Results: $PASS passed, $FAIL failed"
echo "================================"

if [[ $FAIL -gt 0 ]]; then
    exit 1
else
    exit 0
fi
