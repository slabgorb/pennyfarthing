#!/usr/bin/env bash
# Scenario 1: Fresh consumer project — pf init on empty repo
#
# Simulates a new user running `pf init` for the first time.
# Validates directory structure, commands, skills, settings, gitignore.

source /lib.sh 2>/dev/null || source "$(dirname "$0")/../lib.sh"
SCENARIO_NAME="Fresh Init"
header

# --- Setup: create a fresh git repo ---
create_repo "$WORKSPACE/fresh-project"
cd "$WORKSPACE/fresh-project"

# --- Run pf init (non-interactive, skip setup wizard) ---
echo "Running pf init --yes ..."
pf init --yes . 2>&1 | tail -5

# --- Assertions ---

echo ""
echo "Checking directory structure ..."
assert_dir .pennyfarthing
assert_dir .pennyfarthing/agents
assert_dir .pennyfarthing/commands
assert_dir .pennyfarthing/gates
assert_dir .pennyfarthing/guides
assert_dir .pennyfarthing/personas
assert_dir .pennyfarthing/scripts
assert_dir .pennyfarthing/skills
assert_dir .pennyfarthing/templates
assert_dir .pennyfarthing/workflows
assert_dir .claude
assert_dir .claude/commands
assert_dir .claude/skills

echo ""
echo "Checking commands copied ..."
assert_min_file_count .pennyfarthing/commands "pf-*.md" 20 "pf commands in .pennyfarthing"
assert_min_file_count .claude/commands "pf-*.md" 20 "pf commands in .claude"

echo ""
echo "Checking skills copied ..."
PF_SKILLS=$(find .pennyfarthing/skills -maxdepth 1 -type d -name "pf-*" 2>/dev/null | wc -l | tr -d ' ')
CLAUDE_SKILLS=$(find .claude/skills -maxdepth 1 -type d -name "pf-*" 2>/dev/null | wc -l | tr -d ' ')
if [[ "$PF_SKILLS" -ge 10 ]]; then
    pass "Skills in .pennyfarthing: $PF_SKILLS (>= 10)"
else
    fail "Skills in .pennyfarthing: $PF_SKILLS (expected >= 10)"
fi
if [[ "$CLAUDE_SKILLS" -ge 10 ]]; then
    pass "Skills in .claude: $CLAUDE_SKILLS (>= 10)"
else
    fail "Skills in .claude: $CLAUDE_SKILLS (expected >= 10)"
fi

echo ""
echo "Checking settings ..."
assert_file .claude/settings.local.json
assert_contains .claude/settings.local.json "SessionStart" "SessionStart hook"
assert_contains .claude/settings.local.json "PreToolUse" "PreToolUse hook"
assert_contains .claude/settings.local.json "PostToolUse" "PostToolUse hook"
assert_not_contains .claude/settings.local.json "npx pennyfarthing" "no npx references"

echo ""
echo "Checking gitignore ..."
assert_file .gitignore
assert_contains .gitignore ".session/" "session dir ignored"
assert_contains .gitignore ".claude/settings.local.json" "settings ignored"
assert_contains .gitignore ".pennyfarthing/config.local.yaml" "config ignored"

echo ""
echo "Checking manifest ..."
assert_file .pennyfarthing/init-manifest.json
assert_contains .pennyfarthing/init-manifest.json "pf_version" "version in manifest"
assert_contains .pennyfarthing/init-manifest.json "initialized_at" "timestamp in manifest"

echo ""
echo "Checking WheelHub bundle ..."
if [[ -f .pennyfarthing/server/wheelhub.mjs ]]; then
    pass "WheelHub bundle installed"
    assert_contains .pennyfarthing/server/wheelhub.mjs 'createRequire' "createRequire in bundle"
else
    warn "WheelHub bundle not installed (may require Node packages)"
fi

echo ""
echo "Checking pf shim ..."
assert_file .pennyfarthing/bin/pf
if [[ -x .pennyfarthing/bin/pf ]]; then
    pass "pf shim is executable"
else
    fail "pf shim is not executable"
fi

summary
