#!/usr/bin/env bash
# Scenario 2: Re-init preserves custom content
#
# Simulates a consumer who has added custom gates, workflows, agents,
# and sidecars. Running pf init again must NOT destroy their work.
# This is the scenario that broke orc-ax (fixed in ff47df3f0).

source /lib.sh 2>/dev/null || source "$(dirname "$0")/../lib.sh"
SCENARIO_NAME="Re-init Preserves Custom Content"
header

# --- Setup: create repo and run initial pf init ---
create_repo "$WORKSPACE/custom-project"
cd "$WORKSPACE/custom-project"

echo "Running initial pf init ..."
pf init --yes . 2>&1 | tail -3

# --- Add custom content (simulating what orc-ax has) ---
echo ""
echo "Adding custom content ..."

# Custom gate (like orc-ax's clippy-check)
cat > .pennyfarthing/gates/clippy-check.md << 'EOF'
# Clippy Check Gate

Validates that `cargo clippy` passes with no warnings.

<gate-check>
Run `cargo clippy --workspace --all-targets -- -D warnings`
</gate-check>
EOF
pass "Created custom gate: clippy-check.md"

# Custom workflow (like orc-ax's scenario-builder)
mkdir -p .pennyfarthing/workflows/custom-pipeline/steps
cat > .pennyfarthing/workflows/custom-pipeline/workflow.yaml << 'EOF'
name: custom-pipeline
type: stepped
steps:
  - name: analyze
    agent: architect
  - name: implement
    agent: dev
  - name: verify
    agent: tea
EOF
cat > .pennyfarthing/workflows/custom-pipeline/steps/step-1-analyze.md << 'EOF'
# Step 1: Analyze
Analyze the codebase for implementation targets.
EOF
pass "Created custom workflow: custom-pipeline"

# Custom sidecar (agent learning file)
mkdir -p .pennyfarthing/sidecars/reviewer
cat > .pennyfarthing/sidecars/reviewer/gotchas.md << 'EOF'
# Reviewer Gotchas

- Always check for unsafe unwrap() in Rust code
- Prefer ? operator over .unwrap()
EOF
pass "Created custom sidecar: reviewer/gotchas.md"

# Modified agent (consumer customized sm.md)
# NOTE: Framework files (sm.md) get overwritten by pf init's _copy_tree.
# This is a KNOWN LIMITATION — consumer modifications to framework-owned
# files do not survive re-init. Custom files (not in framework dist) DO survive.
if [[ -f .pennyfarthing/agents/sm.md ]]; then
    echo -e "\n\n## Project-Specific Notes\n\nThis project uses Rust. Use cargo test." >> .pennyfarthing/agents/sm.md
    pass "Modified agent: sm.md with project-specific notes"
fi

# Custom .claude command (user-created, not pf-prefixed)
cat > .claude/commands/my-deploy.md << 'EOF'
# Deploy command
Deploy to staging environment.
EOF
pass "Created user command: my-deploy.md"

# Snapshot counts before re-init
GATES_BEFORE=$(ls .pennyfarthing/gates/ | wc -l | tr -d ' ')
WORKFLOW_DIRS_BEFORE=$(find .pennyfarthing/workflows -maxdepth 1 -type d | wc -l | tr -d ' ')

# --- Run pf init AGAIN ---
echo ""
echo "Running pf init AGAIN (re-init) ..."
pf init --yes . 2>&1 | tail -3

# --- Assert custom content survived ---
echo ""
echo "Checking custom content survived re-init ..."

# Custom gate
assert_file .pennyfarthing/gates/clippy-check.md
assert_contains .pennyfarthing/gates/clippy-check.md "cargo clippy" "clippy content"

# Custom workflow
assert_dir .pennyfarthing/workflows/custom-pipeline
assert_file .pennyfarthing/workflows/custom-pipeline/workflow.yaml
assert_file .pennyfarthing/workflows/custom-pipeline/steps/step-1-analyze.md
assert_contains .pennyfarthing/workflows/custom-pipeline/workflow.yaml "custom-pipeline" "workflow name"

# Custom sidecar
assert_file .pennyfarthing/sidecars/reviewer/gotchas.md
assert_contains .pennyfarthing/sidecars/reviewer/gotchas.md "unsafe unwrap" "sidecar content"

# Modified agent — KNOWN LIMITATION: framework-owned files get overwritten
# This is expected to FAIL until ADR-0021 Phase 3 (pf- prefix namespacing) ships
if grep -q "Project-Specific Notes" .pennyfarthing/agents/sm.md 2>/dev/null; then
    pass "Modified framework agent preserved (unexpected — check if _copy_tree changed)"
else
    warn "Modified framework agent overwritten (KNOWN LIMITATION — sm.md is framework-owned)"
fi

# User command (non-pf-prefixed)
assert_file .claude/commands/my-deploy.md
assert_contains .claude/commands/my-deploy.md "staging" "user command content"

# Gate count should be >= before (framework may add new ones, but never remove custom)
GATES_AFTER=$(ls .pennyfarthing/gates/ | wc -l | tr -d ' ')
if [[ "$GATES_AFTER" -ge "$GATES_BEFORE" ]]; then
    pass "Gate count preserved: $GATES_BEFORE -> $GATES_AFTER"
else
    fail "Gates lost during re-init: $GATES_BEFORE -> $GATES_AFTER"
fi

# Workflow dirs should be >= before
WORKFLOW_DIRS_AFTER=$(find .pennyfarthing/workflows -maxdepth 1 -type d | wc -l | tr -d ' ')
if [[ "$WORKFLOW_DIRS_AFTER" -ge "$WORKFLOW_DIRS_BEFORE" ]]; then
    pass "Workflow count preserved: $WORKFLOW_DIRS_BEFORE -> $WORKFLOW_DIRS_AFTER"
else
    fail "Workflows lost during re-init: $WORKFLOW_DIRS_BEFORE -> $WORKFLOW_DIRS_AFTER"
fi

# Settings should still be valid JSON
echo ""
echo "Checking settings integrity ..."
if python3 -c "import json; json.load(open('.claude/settings.local.json'))" 2>/dev/null; then
    pass "settings.local.json is valid JSON after re-init"
else
    fail "settings.local.json is corrupt after re-init"
fi

summary
