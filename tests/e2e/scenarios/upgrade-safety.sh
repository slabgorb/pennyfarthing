#!/usr/bin/env bash
# Scenario 4: Framework upgrade doesn't clobber consumer customizations
#
# Simulates what happens when a consumer runs pf init after the framework
# ships new agents, gates, or workflows. New framework content should appear,
# but custom consumer content must not be overwritten or deleted.

source /lib.sh 2>/dev/null || source "$(dirname "$0")/../lib.sh"
SCENARIO_NAME="Upgrade Safety"
header

# --- Setup: create repo, init, add custom content ---
create_repo "$WORKSPACE/upgrade-project"
cd "$WORKSPACE/upgrade-project"

echo "Running initial pf init ..."
pf init --yes . 2>&1 | tail -3

# Add consumer customizations
echo ""
echo "Adding consumer customizations ..."

# 1. Custom gate with project-specific checks
cat > .pennyfarthing/gates/rustfmt-check.md << 'GATE'
# Rustfmt Check

<gate-check>
cargo fmt --check --all
</gate-check>

<gate-fix>
cargo fmt --all
</gate-fix>
GATE

# 2. Modified guide (consumer added Rust-specific patterns)
if [[ -f .pennyfarthing/guides/agent-behavior.md ]]; then
    ORIGINAL_SIZE=$(wc -c < .pennyfarthing/guides/agent-behavior.md)
    cat >> .pennyfarthing/guides/agent-behavior.md << 'GUIDE'

## Rust-Specific Patterns

- Use `cargo test` not `npm test`
- Prefer `Result<T, E>` over panicking
- Run `cargo clippy` before review
GUIDE
    MODIFIED_SIZE=$(wc -c < .pennyfarthing/guides/agent-behavior.md)
    pass "Modified agent-behavior.md ($ORIGINAL_SIZE -> $MODIFIED_SIZE bytes)"
fi

# 3. Custom config.local.yaml (should NEVER be touched)
cat > .pennyfarthing/config.local.yaml << 'YAML'
theme: matrix
bell_mode: silent
relay_mode: off
workflow: tdd
YAML

# 4. Custom settings with user hooks
python3 -c "
import json
settings = json.load(open('.claude/settings.local.json'))
# Add a custom user hook
settings['hooks'].setdefault('PostToolUse', []).append({
    'hooks': [{'type': 'command', 'command': 'my-linter --check'}]
})
json.dump(settings, open('.claude/settings.local.json', 'w'), indent=2)
"
pass "Added custom PostToolUse hook"

# Snapshot state
CUSTOM_GATE_HASH=$(md5sum .pennyfarthing/gates/rustfmt-check.md | cut -d' ' -f1)
CONFIG_HASH=$(md5sum .pennyfarthing/config.local.yaml | cut -d' ' -f1)

# --- Simulate framework upgrade by re-running pf init ---
echo ""
echo "Simulating framework upgrade (re-running pf init) ..."
pf init --yes . 2>&1 | tail -3

# --- Assert nothing was clobbered ---
echo ""
echo "Checking upgrade safety ..."

# Custom gate preserved exactly
if [[ -f .pennyfarthing/gates/rustfmt-check.md ]]; then
    NEW_HASH=$(md5sum .pennyfarthing/gates/rustfmt-check.md | cut -d' ' -f1)
    if [[ "$NEW_HASH" == "$CUSTOM_GATE_HASH" ]]; then
        pass "Custom gate unchanged (hash match)"
    else
        fail "Custom gate was modified during upgrade"
    fi
else
    fail "Custom gate deleted during upgrade"
fi

# config.local.yaml untouched
if [[ -f .pennyfarthing/config.local.yaml ]]; then
    NEW_CONFIG_HASH=$(md5sum .pennyfarthing/config.local.yaml | cut -d' ' -f1)
    if [[ "$NEW_CONFIG_HASH" == "$CONFIG_HASH" ]]; then
        pass "config.local.yaml untouched"
    else
        fail "config.local.yaml was modified during upgrade"
    fi
else
    fail "config.local.yaml deleted during upgrade"
fi

# Modified guide — KNOWN LIMITATION: framework-owned files get overwritten
# Guides are framework content; consumer modifications don't survive re-init
if grep -q "Rust-Specific Patterns" .pennyfarthing/guides/agent-behavior.md 2>/dev/null; then
    pass "Modified framework guide preserved (unexpected)"
else
    warn "Modified framework guide overwritten (KNOWN LIMITATION — use sidecars for project-specific notes)"
fi

# User hook preserved in settings
# KNOWN LIMITATION: settings are not overwritten (settings_written=False on re-init),
# but hook upgrade/confirmation flow may modify hook entries
HOOK_FOUND=$(python3 -c "
import json
settings = json.load(open('.claude/settings.local.json'))
hooks = settings.get('hooks', {}).get('PostToolUse', [])
found = any('my-linter' in str(h) for h in hooks)
print('yes' if found else 'no')
" 2>/dev/null || echo "error")
if [[ "$HOOK_FOUND" == "yes" ]]; then
    pass "Custom user hook preserved in settings"
elif [[ "$HOOK_FOUND" == "no" ]]; then
    fail "Custom user hook lost during upgrade"
else
    fail "Could not parse settings.local.json"
fi

# Framework content should still exist (not deleted by custom additions)
assert_dir .pennyfarthing/agents
assert_dir .pennyfarthing/workflows
assert_file .pennyfarthing/agents/dev.md
assert_file .pennyfarthing/agents/sm.md

# Manifest should be updated
assert_file .pennyfarthing/init-manifest.json
assert_contains .pennyfarthing/init-manifest.json "pf_version" "manifest updated"

summary
