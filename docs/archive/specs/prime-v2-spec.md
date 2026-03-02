# Prime v2 Specification

> Unified agent bootstrap - one script to fully initialize an agent

## Overview

Prime v2 consolidates agent activation into a single entry point:
- Session management (register active agent)
- Workflow state detection
- Phase ownership validation
- Context loading (agent def, persona, guides, sidecars)
- Routing guidance

**Replaces:**
- `agent-session.sh start` (persona + session registration)
- `prime.sh` / `prime.py` (context loading)
- `workflow-status-check` subagent (state detection)

**Keeps separate:**
- `agent-session.sh status` (statusline JSON for BikeRack GUI)
- `agent-session.sh stop` (session cleanup)

## CLI Interface

```bash
# Full bootstrap (default)
python -m pf.prime --agent sm

# Refresh mode (clear cache, re-validate)
python -m pf.prime --agent sm --refresh

# Audit only (check settings, no context output)
python -m pf.prime --agent sm --audit

# Minimal (skip workflow check, just context)
python -m pf.prime --agent sm --minimal

# Full context including domain docs
python -m pf.prime --agent sm --full

# Quiet (suppress section headers)
python -m pf.prime --agent sm --quiet

# JSON output (for programmatic use)
python -m pf.prime --agent sm --json
```

## Output Structure

### Standard Output (stdout)

Context goes to stdout (consumed by Claude):

```
# Workflow State
state: IN_PROGRESS
phase: green
phase_owner: dev
action: CONTINUE
story_id: 63-8
workflow: tdd

# Agent Definition: dev
<agent definition content>

# Persona: Amos Burton (dev)
<persona content>

# Agent Behavior Guide
<behavior guide content>

# Sprint Context
Sprint 12: Complete WheelHub...
Progress: 241/263 points

# Active Session: 63-8-session.md
<session header>
---
<last assessment>

# Agent Sidecar: patterns.md
<patterns content>

# Agent Sidecar: gotchas.md
<gotchas content>
```

### Diagnostic Output (stderr)

Status/errors go to stderr (visible to user, not consumed by Claude):

```
[OK] Session registered: dev (session-12345)
[OK] Theme validated: the-expanse
[OK] Workflow state: IN_PROGRESS (phase: green)
[WARN] Stale session file: .session/old-story-session.md
```

### JSON Output (--json flag)

```json
{
  "session": {
    "agent": "dev",
    "session_id": "session-12345",
    "registered_at": "2026-01-26T11:30:00Z"
  },
  "workflow": {
    "state": "IN_PROGRESS",
    "phase": "green",
    "phase_owner": "dev",
    "story_id": "63-8",
    "workflow_type": "tdd",
    "action": "CONTINUE"
  },
  "audit": {
    "theme_valid": true,
    "agent_in_team": true,
    "persona_valid": true,
    "stale_sessions": []
  },
  "context": {
    "agent_definition": "...",
    "persona": "...",
    "behavior_guide": "...",
    "sprint_summary": "...",
    "session_header": "...",
    "session_assessment": "...",
    "sidecars": {
      "patterns.md": "...",
      "gotchas.md": "...",
      "decisions.md": "..."
    }
  },
  "redirect": null
}
```

## Workflow States

| State | Meaning | Agent Action |
|-------|---------|--------------|
| `FINISH` | Story in approved/review-approved phase | Run finish flow |
| `NEW_WORK` | No active session, backlog available | Research → setup → handoff |
| `IN_PROGRESS` | Active session exists | Check phase ownership |
| `EMPTY_BACKLOG` | No active session, no backlog | Suggest promote from future |
| `REDIRECT` | Wrong agent for current phase | Emit handoff marker |

## Phase Ownership

When `IN_PROGRESS`, prime checks if the activating agent owns the current phase:

```python
def check_phase_ownership(workflow: str, phase: str, agent: str) -> bool:
    """Check if agent owns this phase in this workflow."""
    # Load workflow definition
    workflow_def = load_workflow(workflow)

    # Find phase owner
    for p in workflow_def['phases']:
        if p['name'] == phase:
            return p['agent'] == agent

    return False
```

**If wrong agent:**
- Set state to `REDIRECT`
- Include `redirect.target_agent` in output
- Emit handoff marker at end of context

## Audit Checks

### Theme Validation
```python
def audit_theme(theme_name: str) -> AuditResult:
    """Validate theme exists and is well-formed."""
    theme_path = project_root / ".pennyfarthing/personas/themes" / f"{theme_name}.yaml"

    checks = []
    checks.append(("theme_exists", theme_path.exists()))

    if theme_path.exists():
        theme = yaml.safe_load(theme_path.read_text())
        checks.append(("has_agents", "agents" in theme))
        checks.append(("has_metadata", "theme" in theme))

    return AuditResult(checks)
```

### Agent in Team
```python
def audit_agent_in_team(theme: dict, agent_name: str) -> bool:
    """Check if agent exists in theme's team list."""
    return agent_name in theme.get("agents", {})
```

### Stale Sessions
```python
def find_stale_sessions(project_root: Path) -> list[Path]:
    """Find session files for completed/cancelled stories."""
    stale = []
    for session_file in (project_root / ".session").glob("*-session.md"):
        story_id = extract_story_id(session_file.name)
        status = get_story_status(story_id)
        if status in ("done", "cancelled", None):
            stale.append(session_file)
    return stale
```

### Persona Validation
```python
def audit_persona(theme: dict, agent_name: str) -> AuditResult:
    """Validate persona is well-formed."""
    persona = theme.get("agents", {}).get(agent_name, {})

    checks = []
    checks.append(("has_name", "name" in persona))
    checks.append(("has_style", "style" in persona))
    checks.append(("has_voice", "voice" in persona or "catchphrases" in persona))

    return AuditResult(checks)
```

## Refresh Mode

`--refresh` clears cached state and re-validates:

1. **Clear session registry** - Remove current agent registration
2. **Re-read config** - Don't use cached theme/settings
3. **Validate all** - Run full audit suite
4. **Report changes** - Show what was stale/fixed

```bash
$ python -m pf.prime --agent dev --refresh

[INFO] Clearing cached session state
[OK] Session re-registered: dev
[OK] Theme re-validated: the-expanse
[WARN] Cleared stale session: .session/old-story-session.md
[OK] Audit passed: 5/5 checks
```

## Module Structure

```
pf/prime/
├── __init__.py          # Public API
├── __main__.py          # Entry point
├── cli.py               # Argument parsing, main()
├── bootstrap.py         # Orchestrates full bootstrap    ← NEW
├── loader.py            # Context loading (existing)
├── session.py           # Session registration           ← NEW
├── workflow.py          # Workflow state detection       ← NEW
├── persona.py           # Persona loading                ← NEW
├── audit.py             # Audit checks                   ← NEW
└── output.py            # Output formatting              ← NEW
```

## Core Functions

### bootstrap.py

```python
@dataclass
class BootstrapResult:
    session: SessionInfo
    workflow: WorkflowState
    audit: AuditResult
    context: ContextBundle
    redirect: RedirectInfo | None

def bootstrap(
    agent_name: str,
    refresh: bool = False,
    audit_only: bool = False,
    minimal: bool = False,
    full: bool = False,
) -> BootstrapResult:
    """Full agent bootstrap sequence."""

    # 1. Session setup
    session = register_session(agent_name, refresh=refresh)

    # 2. Audit
    audit = run_audit(agent_name)
    if audit_only:
        return BootstrapResult(session, None, audit, None, None)

    # 3. Workflow check
    workflow = detect_workflow_state(agent_name)

    # 4. Phase ownership check
    redirect = None
    if workflow.state == "IN_PROGRESS":
        if not check_phase_ownership(workflow, agent_name):
            redirect = RedirectInfo(
                target_agent=workflow.phase_owner,
                reason=f"Phase '{workflow.phase}' owned by {workflow.phase_owner}"
            )

    # 5. Context loading (skip if minimal)
    context = None
    if not minimal:
        context = load_context(
            agent_name=agent_name,
            include_persona=True,
            include_domain_docs=full,
        )

    return BootstrapResult(session, workflow, audit, context, redirect)
```

### workflow.py

```python
@dataclass
class WorkflowState:
    state: str  # FINISH, NEW_WORK, IN_PROGRESS, EMPTY_BACKLOG, REDIRECT
    phase: str | None
    phase_owner: str | None
    story_id: str | None
    workflow_type: str | None
    action: str  # CONTINUE, FINISH, SETUP, REDIRECT, WAIT

def detect_workflow_state(agent_name: str) -> WorkflowState:
    """Detect current workflow state."""

    # Check for active session
    session_file = find_active_session()

    if session_file:
        # Parse session for phase info
        phase, workflow_type, story_id = parse_session(session_file)

        # Check if story is in finish state
        if phase in ("approved", "review-approved"):
            return WorkflowState(
                state="FINISH",
                phase=phase,
                phase_owner="sm",
                story_id=story_id,
                workflow_type=workflow_type,
                action="FINISH"
            )

        # Get phase owner from workflow definition
        phase_owner = get_phase_owner(workflow_type, phase)

        return WorkflowState(
            state="IN_PROGRESS",
            phase=phase,
            phase_owner=phase_owner,
            story_id=story_id,
            workflow_type=workflow_type,
            action="CONTINUE" if phase_owner == agent_name else "REDIRECT"
        )

    # No active session - check backlog
    backlog = get_backlog_stories()
    if backlog:
        return WorkflowState(
            state="NEW_WORK",
            phase=None,
            phase_owner="sm",
            story_id=None,
            workflow_type=None,
            action="SETUP"
        )

    return WorkflowState(
        state="EMPTY_BACKLOG",
        phase=None,
        phase_owner=None,
        story_id=None,
        workflow_type=None,
        action="WAIT"
    )
```

### persona.py

```python
def load_persona(agent_name: str, project_root: Path | None = None) -> str | None:
    """Load persona for agent from current theme."""
    root = project_root or get_project_root()

    # Get current theme
    config = load_yaml(root / ".pennyfarthing/config.local.yaml")
    theme_name = config.get("theme", "the-expanse")

    # Load theme file
    theme_path = root / ".pennyfarthing/personas/themes" / f"{theme_name}.yaml"
    if not theme_path.exists():
        return None

    theme = load_yaml(theme_path)
    persona_data = theme.get("agents", {}).get(agent_name)

    if not persona_data:
        return None

    # Format persona output
    return format_persona(agent_name, theme_name, persona_data)

def format_persona(agent_name: str, theme_name: str, persona: dict) -> str:
    """Format persona as XML-style block."""
    lines = [f'<persona agent="{agent_name}" theme="{theme_name}">']

    if "name" in persona:
        lines.append(f'  <name>{persona["name"]}</name>')

    if "style" in persona:
        lines.append(f'  <style>{persona["style"]}</style>')

    if "voice" in persona:
        lines.append(f'  <voice>{persona["voice"]}</voice>')

    if "catchphrases" in persona:
        lines.append("  <catchphrases>")
        for phrase in persona["catchphrases"]:
            lines.append(f"    - {phrase}")
        lines.append("  </catchphrases>")

    lines.append("</persona>")
    return "\n".join(lines)
```

## Output Priority Order

Context is output in attention-priority order:

1. **Workflow State** (highest) - What should I do?
2. **Agent Definition** - Who am I?
3. **Persona** - How should I sound?
4. **Behavior Guide** - Shared protocols
5. **Sprint Context** - What sprint are we in?
6. **Session Context** - What's the current story state?
7. **Sidecars** (lowest) - Patterns, gotchas, decisions
8. **Domain Docs** (--full only) - Project-specific context
9. **Redirect Marker** (if wrong agent) - Handoff signal

## Integration Points

### BikeRack GUI TirePump

TirePump calls prime for context reload:

```javascript
// In BikeRack GUI's context-clear handler
async function reloadContext(agent) {
  const result = await exec(`python3 -m pf.prime --agent ${agent} --json`);
  const bootstrap = JSON.parse(result.stdout);

  if (bootstrap.redirect) {
    // Wrong agent - show handoff button
    showHandoffButton(bootstrap.redirect.target_agent);
  }

  return bootstrap.context;
}
```

### Claude Code Hooks

SessionStart hook uses prime:

```bash
# hooks/session-start.sh
python3 -m pf.prime --agent "$AGENT" --quiet
```

### Agent Activation Commands

`/pf-sm`, `/pf-dev`, `/pf-tea` etc. use prime:

```markdown
<!-- In command file -->
Run bootstrap:
```bash
python3 -m pf.prime --agent sm
```
```

## Migration Path

### Phase 1: Add to existing prime.py
- Add persona loading
- Add workflow state detection
- Add session registration
- Keep backward compatibility

### Phase 2: Add new capabilities
- Add audit checks
- Add refresh mode
- Add JSON output

### Phase 3: Deprecate old scripts
- Mark agent-session.sh start as deprecated
- Update all callers to use prime.py
- Keep agent-session.sh status/stop

### Phase 4: Cleanup
- Remove deprecated code paths
- Update documentation
- Archive workflow-status-check subagent

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Agent not found |
| 3 | Theme not found |
| 4 | Audit failed (--audit mode) |
| 5 | No project root found |

## Examples

### Normal Activation
```bash
$ python -m pf.prime --agent dev

# Workflow State
state: IN_PROGRESS
phase: green
phase_owner: dev
action: CONTINUE
story_id: 63-8

# Agent Definition: dev
...
```

### Wrong Agent Activation
```bash
$ python -m pf.prime --agent dev
# When story is in review phase

# Workflow State
state: REDIRECT
phase: review
phase_owner: reviewer
action: REDIRECT
story_id: 63-8

# Agent Definition: dev
...

<!-- PF:HANDOFF:/pf-reviewer -->
```

### Audit Mode
```bash
$ python -m pf.prime --agent sm --audit

[OK] Theme exists: the-expanse
[OK] Agent in team: sm
[OK] Persona valid: James Holden
[OK] No stale sessions
[OK] Workflow definition valid

Audit passed: 5/5 checks
```

### Refresh Mode
```bash
$ python -m pf.prime --agent tea --refresh

[INFO] Clearing session cache
[OK] Session registered: tea (session-abc123)
[WARN] Removed stale session: .session/old-story-session.md
[OK] Theme validated: the-expanse
[OK] Bootstrap complete

# Workflow State
...
```
