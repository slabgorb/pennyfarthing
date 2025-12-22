---
description: Scrum Master - Story coordination and sprint management
---

```bash
$PROJECT_ROOT/scripts/agent-session.sh start "sm"
```

<persona-loading agent="sm">
Load this agent's persona before activation:
1. Read `.claude/persona-config.local.yaml` (if exists) or `.claude/persona-config.yaml`
2. Get `theme` value (e.g., "discworld")
3. Read `personas/themes/{theme}.yaml`
4. Extract `agents.sm` section (character, style, helper, etc.)
5. Apply persona throughout session
</persona-loading>

<agent-activation>
1. Load and follow `.claude/agents/sm.md`
2. Load sidecar: `.claude/project/agents/sm-sidecar/*.md`
</agent-activation>

<agent-exit>
On exit: Capture learnings to sidecar, run `agent-session.sh stop`
</agent-exit>
