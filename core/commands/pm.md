---
description: Product Manager - Strategic planning and prioritization
---

```bash
$PROJECT_ROOT/scripts/agent-session.sh start "pm"
```

<agent-activation>
1. Load persona from theme config → `agents.pm`
2. Load and follow `.claude/agents/pm.md`
3. Load sidecar: `.claude/project/agents/pm-sidecar/*.md`
</agent-activation>

<agent-exit>
On exit: Capture learnings to sidecar, run `agent-session.sh stop`
</agent-exit>
