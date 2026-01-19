---
description: Load essential project context at agent activation
---

<purpose>
Quickly load essential context files to reduce agent cold-start overhead.
Automatically invoked on agent activation via agent-session.sh.
</purpose>

<when-to-use>
- Automatically on agent activation (`/sm`, `/tea`, `/dev`, `/reviewer`)
- Manually to refresh context mid-session
- To verify what context is available
</when-to-use>

<execution>

## Running /prime

Use the prime.sh script:

```bash
# Load all essential context (default)
$CLAUDE_PROJECT_DIR/.pennyfarthing/scripts/prime.sh

# Minimal mode - CLAUDE.md only (fastest)
$CLAUDE_PROJECT_DIR/.pennyfarthing/scripts/prime.sh --minimal

# Full mode - include domain docs
$CLAUDE_PROJECT_DIR/.pennyfarthing/scripts/prime.sh --full

# Quiet mode - suppress headers (used by agent-session.sh)
$CLAUDE_PROJECT_DIR/.pennyfarthing/scripts/prime.sh --quiet

# With agent sidecar loading
$CLAUDE_PROJECT_DIR/.pennyfarthing/scripts/prime.sh --agent reviewer
```

## Options

| Option | Description |
|--------|-------------|
| `--minimal` | Load only CLAUDE.md files (fastest startup) |
| `--full` | Include domain docs from .claude/project/ |
| `--quiet` | Suppress section headers (for automated use) |
| `--agent <name>` | Load agent's sidecar patterns (learned project-specific patterns) |

## What Gets Loaded

Context is loaded in priority order:

### Default Mode
| Priority | Content | Source |
|----------|---------|--------|
| 1 | Project instructions | `CLAUDE.md` |
| 2 | User instructions | `~/.claude/CLAUDE.md` (if exists) |
| 3 | Sprint summary | `sprint/current-sprint.yaml` (key fields only) |
| 4 | Active session | `.session/*-session.md` (first 50 lines) |
| 5 | Agent sidecar | `.pennyfarthing/sidecars/{agent}/*.md` (if `--agent` provided) |
| 6 | Shared context | `.pennyfarthing/guides/agent-behavior.md` (project info - all agents) |
| 7 | Shared behavior | `.pennyfarthing/guides/agent-behavior.md` (protocols - all agents) |
| 8 | Tactical guide | `.pennyfarthing/guides/agent-behavior.md` (for sm, tea, dev, reviewer only) |

### Minimal Mode (`--minimal`)
Only loads CLAUDE.md files (priority 1-2).

### Full Mode (`--full`)
Adds domain documentation from `.claude/project/CLAUDE-*.md` files.

### Agent Sidecar (`--agent <name>`)
When agent name is provided, loads the agent's project-specific patterns from their sidecar directory. This gives agents their learned patterns immediately on activation.

### Agent Behavior Guide (automatic for all agents)
All agents receive the shared context guide which includes project info, directory structure, git strategy, sprint system overview, and build commands.

### Shared Behavior (automatic for all agents)
All agents receive the shared behavior guide which includes confidence protocols, sidecar memory system documentation, reasoning modes, and exit protocols.

### Tactical Guide (automatic for tactical agents)
For tactical agents (sm, tea, dev, reviewer), additionally loads the tactical behavior guide which includes critical patterns for Bash tool usage, session file handling, and handoff protocols.

</execution>

<output-format>

```
# CLAUDE.md
[Project instructions content...]

# ~/.claude/CLAUDE.md (if exists)
[User instructions content...]

---
# Sprint Context
Sprint 7: Benchmark framework expansion, monorepo consolidation, rich agent telemetry
Progress: 62/106 points

---
# Active Session
[First 50 lines of session file...]
```

With `--quiet`, section headers are suppressed.

</output-format>

<integration>

## agent-session.sh Integration

The `/prime` command is automatically invoked when agents activate:

1. User invokes `/sm`, `/tea`, `/dev`, or `/reviewer`
2. `agent-session.sh start` runs
3. Persona XML is output
4. `/prime --quiet --agent <agent-name>` loads context automatically
5. Agent starts with full context AND their learned patterns loaded

This reduces the "cold start" problem where agents must discover context through multiple file reads. The `--agent` flag ensures each agent gets their project-specific sidecar patterns immediately.

## Manual Refresh

If context becomes stale mid-session, run `/prime` manually:

```bash
/prime        # Refresh standard context
/prime --full # Include domain docs
```

</integration>

<reference>
- **Script:** `.pennyfarthing/scripts/prime.sh`
- **Called by:** agent-session.sh on agent start (with `--agent` flag)
- **Loads:** CLAUDE.md, sprint, session, sidecar, shared context, shared behavior, tactical guide
- **Sidecar location:** `.pennyfarthing/sidecars/{agent}/*.md`
- **Shared context:** `.pennyfarthing/guides/agent-behavior.md` (all agents)
- **Shared behavior:** `.pennyfarthing/guides/agent-behavior.md` (all agents)
- **Tactical guide:** `.pennyfarthing/guides/agent-behavior.md` (sm, tea, dev, reviewer only)
</reference>
