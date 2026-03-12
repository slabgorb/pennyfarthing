#!/usr/bin/env bash
# Scenario 6: Idempotency — run pf init 3 times, assert same result
#
# Verifies that pf init is truly idempotent: running it multiple times
# produces the same directory structure, same file counts, no duplicated
# gitignore entries, and no corrupt settings.

source /lib.sh 2>/dev/null || source "$(dirname "$0")/../lib.sh"
SCENARIO_NAME="Idempotency"
header

create_repo "$WORKSPACE/idempotent-project"
cd "$WORKSPACE/idempotent-project"

# --- Run 1 ---
echo "Run 1/3 ..."
pf init --yes . 2>&1 | tail -1

COMMANDS_1=$(find .pennyfarthing/commands -maxdepth 1 -name "pf-*.md" 2>/dev/null | wc -l | tr -d ' ')
SKILLS_1=$(find .pennyfarthing/skills -maxdepth 1 -type d -name "pf-*" 2>/dev/null | wc -l | tr -d ' ')
GITIGNORE_LINES_1=$(wc -l < .gitignore | tr -d ' ')
SETTINGS_1=$(md5sum .claude/settings.local.json | cut -d' ' -f1)

# --- Run 2 ---
echo "Run 2/3 ..."
pf init --yes . 2>&1 | tail -1

COMMANDS_2=$(find .pennyfarthing/commands -maxdepth 1 -name "pf-*.md" 2>/dev/null | wc -l | tr -d ' ')
SKILLS_2=$(find .pennyfarthing/skills -maxdepth 1 -type d -name "pf-*" 2>/dev/null | wc -l | tr -d ' ')
GITIGNORE_LINES_2=$(wc -l < .gitignore | tr -d ' ')
SETTINGS_2=$(md5sum .claude/settings.local.json | cut -d' ' -f1)

# --- Run 3 ---
echo "Run 3/3 ..."
pf init --yes . 2>&1 | tail -1

COMMANDS_3=$(find .pennyfarthing/commands -maxdepth 1 -name "pf-*.md" 2>/dev/null | wc -l | tr -d ' ')
SKILLS_3=$(find .pennyfarthing/skills -maxdepth 1 -type d -name "pf-*" 2>/dev/null | wc -l | tr -d ' ')
GITIGNORE_LINES_3=$(wc -l < .gitignore | tr -d ' ')
SETTINGS_3=$(md5sum .claude/settings.local.json | cut -d' ' -f1)

echo ""

# --- Assert stability ---
echo "Checking command count stability ..."
if [[ "$COMMANDS_1" -eq "$COMMANDS_2" && "$COMMANDS_2" -eq "$COMMANDS_3" ]]; then
    pass "Commands stable across 3 runs: $COMMANDS_1"
else
    fail "Commands changed: $COMMANDS_1 -> $COMMANDS_2 -> $COMMANDS_3"
fi

echo "Checking skill count stability ..."
if [[ "$SKILLS_1" -eq "$SKILLS_2" && "$SKILLS_2" -eq "$SKILLS_3" ]]; then
    pass "Skills stable across 3 runs: $SKILLS_1"
else
    fail "Skills changed: $SKILLS_1 -> $SKILLS_2 -> $SKILLS_3"
fi

echo "Checking gitignore stability (no duplicate entries) ..."
if [[ "$GITIGNORE_LINES_1" -eq "$GITIGNORE_LINES_2" && "$GITIGNORE_LINES_2" -eq "$GITIGNORE_LINES_3" ]]; then
    pass "Gitignore lines stable: $GITIGNORE_LINES_1"
else
    fail "Gitignore grew: $GITIGNORE_LINES_1 -> $GITIGNORE_LINES_2 -> $GITIGNORE_LINES_3"
fi

echo "Checking settings stability ..."
if [[ "$SETTINGS_1" == "$SETTINGS_2" && "$SETTINGS_2" == "$SETTINGS_3" ]]; then
    pass "Settings hash stable across 3 runs"
else
    fail "Settings changed between runs"
fi

# Check for duplicate gitignore entries specifically
echo "Checking for duplicate gitignore entries ..."
DUPES=$(sort .gitignore | uniq -d | { grep -v '^$' || true; } | { grep -v '^#' || true; } | wc -l | tr -d ' ')
if [[ "$DUPES" -eq 0 ]]; then
    pass "No duplicate gitignore entries"
else
    fail "$DUPES duplicate gitignore entries found"
    sort .gitignore | uniq -d | { grep -v '^$' || true; } | { grep -v '^#' || true; } | sed 's/^/  /'
fi

# Check manifest updates timestamp but keeps counts
echo "Checking manifest ..."
MANIFEST_CMDS=$(python3 -c "import json; print(json.load(open('.pennyfarthing/init-manifest.json'))['commands_copied'])")
if [[ "$MANIFEST_CMDS" -eq "$COMMANDS_3" ]]; then
    pass "Manifest commands_copied matches actual: $MANIFEST_CMDS"
else
    fail "Manifest commands_copied ($MANIFEST_CMDS) != actual ($COMMANDS_3)"
fi

# Settings is valid JSON
if python3 -c "import json; json.load(open('.claude/settings.local.json'))" 2>/dev/null; then
    pass "settings.local.json is valid JSON"
else
    fail "settings.local.json is corrupt"
fi

summary
