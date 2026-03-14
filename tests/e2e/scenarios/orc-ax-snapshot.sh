#!/usr/bin/env bash
# Scenario 5: orc-ax snapshot — simulate a real consumer with dirty state
#
# Recreates the orc-ax situation: a consumer repo that has custom workflows,
# modified gates, custom sidecars, and a potentially broken frame.
# Tests that pf init handles this gracefully.

source /lib.sh 2>/dev/null || source "$(dirname "$0")/../lib.sh"
SCENARIO_NAME="orc-ax Snapshot"
header

# --- Setup: create a repo mimicking orc-ax's state ---
create_repo "$WORKSPACE/orc-ax-sim"
cd "$WORKSPACE/orc-ax-sim"

echo "Running initial pf init ..."
pf init --yes . 2>&1 | tail -3

# --- Simulate orc-ax customizations ---
echo ""
echo "Simulating orc-ax state ..."

# 1. Custom Rust gates (orc-ax has 6 custom gates)
for gate in clippy-check rustfmt-check cargo-deny-check workspace-deps-check typos-check rust-review-checklist; do
    cat > ".pennyfarthing/gates/${gate}.md" << EOF
# ${gate}
Custom gate for Axiathon Rust project.

<gate-check>
Run ${gate} validation
</gate-check>
EOF
done
pass "Created 6 custom Rust gates"

# 2. Custom untracked workflows (orc-ax has axiathon-scenario-builder and axiathon-scenario-discovery)
mkdir -p .pennyfarthing/workflows/axiathon-scenario-builder/steps-code
mkdir -p .pennyfarthing/workflows/axiathon-scenario-builder/steps-open
mkdir -p .pennyfarthing/workflows/axiathon-scenario-builder/templates

cat > .pennyfarthing/workflows/axiathon-scenario-builder/workflow.yaml << 'EOF'
name: axiathon-scenario-builder
type: stepped
description: Build benchmark scenarios
variants:
  code:
    steps_dir: steps-code
  open:
    steps_dir: steps-open
EOF

for i in 1 2 3 4 5 6; do
    echo "# Step $i" > ".pennyfarthing/workflows/axiathon-scenario-builder/steps-code/step-${i}.md"
    echo "# Step $i" > ".pennyfarthing/workflows/axiathon-scenario-builder/steps-open/step-${i}.md"
done
echo "# Code template" > .pennyfarthing/workflows/axiathon-scenario-builder/templates/scenario-code.template.yaml
echo "# Open template" > .pennyfarthing/workflows/axiathon-scenario-builder/templates/scenario-open.template.yaml
pass "Created axiathon-scenario-builder workflow (12 step files, 2 templates)"

mkdir -p .pennyfarthing/workflows/axiathon-scenario-discovery/steps
cat > .pennyfarthing/workflows/axiathon-scenario-discovery/workflow.yaml << 'EOF'
name: axiathon-scenario-discovery
type: stepped
description: Discover benchmark scenarios from codebase
EOF
for i in 1 2 3 4 5 6 7; do
    echo "# Step $i" > ".pennyfarthing/workflows/axiathon-scenario-discovery/steps/step-${i}.md"
done
pass "Created axiathon-scenario-discovery workflow (7 step files)"

# 3. Custom sidecars (agent learning files)
mkdir -p .pennyfarthing/sidecars/reviewer .pennyfarthing/sidecars/sm
cat > .pennyfarthing/sidecars/reviewer/gotchas.md << 'EOF'
# Reviewer Gotchas for Axiathon
- Check for unsafe blocks without safety comments
- Verify error types implement std::error::Error
- Watch for unbounded Vec allocations in hot paths
EOF
cat > .pennyfarthing/sidecars/sm/gotchas.md << 'EOF'
# SM Gotchas for Axiathon
- Rust tests use #[test] not describe()
- Integration tests in tests/ dir, unit tests inline
- cargo test --workspace runs all crates
EOF
pass "Created custom sidecars (reviewer, sm)"

# 4. Modified agents
echo -e "\n## Axiathon Context\nRust workspace with 8 crates." >> .pennyfarthing/agents/sm.md
pass "Modified sm.md with project context"

# 5. Custom config
cat > .pennyfarthing/config.local.yaml << 'YAML'
theme: matrix
persona:
  agent_smith: reviewer
  neo: dev
  morpheus: architect
  trinity: tea
  oracle: pm
bell_mode: queue
relay_mode: auto
workflow: tdd-tandem
YAML
pass "Created Matrix theme config"

# 6. Sprint data (would exist in a real consumer)
mkdir -p sprint
cat > sprint/current-sprint.yaml << 'YAML'
sprint:
  id: DPGD-S4
  name: "Sprint 4"
  status: active
  shards:
    - epic-5.yaml
    - epic-8.yaml
YAML
pass "Created sprint data"

# --- Snapshot file counts ---
TOTAL_GATES=$(ls .pennyfarthing/gates/ | wc -l | tr -d ' ')
TOTAL_WORKFLOWS=$(find .pennyfarthing/workflows -maxdepth 1 -type d | wc -l | tr -d ' ')
SIDECAR_FILES=$(find .pennyfarthing/sidecars -type f 2>/dev/null | wc -l | tr -d ' ')

echo ""
echo "Pre-reinit state: $TOTAL_GATES gates, $TOTAL_WORKFLOWS workflow dirs, $SIDECAR_FILES sidecar files"

# --- Run pf init AGAIN (the dangerous part) ---
echo ""
echo "Running pf init again (simulating framework update) ..."
pf init --yes . 2>&1 | tail -5

# --- Assert everything survived ---
echo ""
echo "Checking orc-ax content survived ..."

# Custom gates
for gate in clippy-check rustfmt-check cargo-deny-check workspace-deps-check typos-check rust-review-checklist; do
    assert_file ".pennyfarthing/gates/${gate}.md"
done

# Custom workflows (the critical test — these were untracked in orc-ax)
assert_dir .pennyfarthing/workflows/axiathon-scenario-builder
assert_dir .pennyfarthing/workflows/axiathon-scenario-builder/steps-code
assert_dir .pennyfarthing/workflows/axiathon-scenario-builder/steps-open
assert_dir .pennyfarthing/workflows/axiathon-scenario-builder/templates
assert_file .pennyfarthing/workflows/axiathon-scenario-builder/workflow.yaml
# Count only in our custom dirs (not framework step files that may have been merged in)
STEP_CODE=$(find .pennyfarthing/workflows/axiathon-scenario-builder/steps-code -name "step-*.md" 2>/dev/null | wc -l | tr -d ' ')
STEP_OPEN=$(find .pennyfarthing/workflows/axiathon-scenario-builder/steps-open -name "step-*.md" 2>/dev/null | wc -l | tr -d ' ')
STEP_COUNT=$((STEP_CODE + STEP_OPEN))
if [[ "$STEP_COUNT" -eq 12 ]]; then
    pass "axiathon-scenario-builder: all 12 step files preserved"
else
    fail "axiathon-scenario-builder: $STEP_COUNT step files (expected 12, code=$STEP_CODE open=$STEP_OPEN)"
fi

assert_dir .pennyfarthing/workflows/axiathon-scenario-discovery
assert_file .pennyfarthing/workflows/axiathon-scenario-discovery/workflow.yaml
DISC_STEPS=$(find .pennyfarthing/workflows/axiathon-scenario-discovery/steps -name "step-*.md" 2>/dev/null | wc -l | tr -d ' ')
if [[ "$DISC_STEPS" -eq 7 ]]; then
    pass "axiathon-scenario-discovery: all 7 step files preserved"
else
    fail "axiathon-scenario-discovery: $DISC_STEPS step files (expected 7)"
fi

# Sidecars
assert_file .pennyfarthing/sidecars/reviewer/gotchas.md
assert_file .pennyfarthing/sidecars/sm/gotchas.md
assert_contains .pennyfarthing/sidecars/reviewer/gotchas.md "unsafe blocks" "sidecar content"

# Modified agent
# KNOWN LIMITATION: framework-owned files (sm.md) get overwritten on re-init
if grep -q "Axiathon Context" .pennyfarthing/agents/sm.md 2>/dev/null; then
    pass "Modified framework agent preserved (unexpected)"
else
    warn "Modified framework agent overwritten (KNOWN LIMITATION — use sidecars instead)"
fi

# Config untouched
assert_contains .pennyfarthing/config.local.yaml "matrix" "theme preserved"
assert_contains .pennyfarthing/config.local.yaml "tdd-tandem" "workflow preserved"

# Sprint data untouched
assert_file sprint/current-sprint.yaml
assert_contains sprint/current-sprint.yaml "DPGD-S4" "sprint data preserved"

# File counts should be >= before
GATES_AFTER=$(ls .pennyfarthing/gates/ | wc -l | tr -d ' ')
WORKFLOWS_AFTER=$(find .pennyfarthing/workflows -maxdepth 1 -type d | wc -l | tr -d ' ')
SIDECARS_AFTER=$(find .pennyfarthing/sidecars -type f 2>/dev/null | wc -l | tr -d ' ')

echo ""
echo "Post-reinit: $GATES_AFTER gates, $WORKFLOWS_AFTER workflow dirs, $SIDECARS_AFTER sidecar files"

if [[ "$GATES_AFTER" -ge "$TOTAL_GATES" ]]; then
    pass "Gate count preserved or grew: $TOTAL_GATES -> $GATES_AFTER"
else
    fail "Gates lost: $TOTAL_GATES -> $GATES_AFTER"
fi

if [[ "$WORKFLOWS_AFTER" -ge "$TOTAL_WORKFLOWS" ]]; then
    pass "Workflow count preserved or grew: $TOTAL_WORKFLOWS -> $WORKFLOWS_AFTER"
else
    fail "Workflows lost: $TOTAL_WORKFLOWS -> $WORKFLOWS_AFTER"
fi

if [[ "$SIDECARS_AFTER" -ge "$SIDECAR_FILES" ]]; then
    pass "Sidecar files preserved: $SIDECAR_FILES -> $SIDECARS_AFTER"
else
    fail "Sidecar files lost: $SIDECAR_FILES -> $SIDECARS_AFTER"
fi

summary
