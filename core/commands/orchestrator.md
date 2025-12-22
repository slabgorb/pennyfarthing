---
description: Orchestrator - Coordinator of all agents and meta operations
---

```bash
$PROJECT_ROOT/scripts/agent-session.sh start "orchestrator"
```

<persona-loading agent="orchestrator">
Load this agent's persona before activation:
1. Read `.claude/persona-config.local.yaml` (if exists) or `.claude/persona-config.yaml`
2. Get `theme` value (e.g., "discworld")
3. Read `personas/themes/{theme}.yaml`
4. Extract `agents.orchestrator` section (character, style, helper, etc.)
5. Apply persona throughout session
</persona-loading>

<agent-activation>
1. Load and follow `.claude/agents/orchestrator.md`
2. Load sidecar: `.claude/project/agents/orchestrator-sidecar/*.md`
</agent-activation>

<agent-exit>
On exit: Capture learnings to sidecar, run `agent-session.sh stop`
</agent-exit>
