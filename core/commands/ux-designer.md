---
description: UX Designer - User experience design and UI patterns
---

```bash
$PROJECT_ROOT/scripts/agent-session.sh start "ux-designer"
```

<agent-activation>
1. Load persona from theme config → `agents.ux-designer`
2. Load and follow `.claude/agents/ux-designer.md`
3. Load sidecar: `.claude/project/agents/ux-designer-sidecar/*.md`
</agent-activation>

<agent-exit>
On exit: Capture learnings to sidecar, run `agent-session.sh stop`
</agent-exit>
