---
description: Product Manager - Strategic planning and prioritization
---

```bash
$PROJECT_ROOT/scripts/agent-session.sh start "pm"
```

<persona-loading agent="pm">
Load this agent's persona before activation:
1. Read `.claude/persona-config.local.yaml` (if exists) or `.claude/persona-config.yaml`
2. Get `theme` value (e.g., "discworld")
3. Read `personas/themes/{theme}.yaml`
4. Extract `agents.pm` section (character, style, helper, etc.)
5. Apply persona throughout session
</persona-loading>

<agent-activation>
1. Load and follow `.claude/agents/pm.md`
2. Load sidecar: `.claude/project/agents/pm-sidecar/*.md`
</agent-activation>

<agent-exit>
On exit: Capture learnings to sidecar, run `agent-session.sh stop`
</agent-exit>
