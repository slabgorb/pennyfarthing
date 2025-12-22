---
description: Scrum Master - Story coordination and sprint management
---

```bash
$PROJECT_ROOT/scripts/agent-session.sh start "sm"
```

<agent-activation>
1. Load persona from theme config → `agents.sm`
2. Load and follow `.claude/agents/sm.md`
3. Load sidecar: `.claude/project/agents/sm-sidecar/*.md`
</agent-activation>

<agent-exit>
On exit: Capture learnings to sidecar, run `agent-session.sh stop`
</agent-exit>
