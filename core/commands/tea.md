---
description: Test Engineer/Architect - Test strategy and TDD
---

```bash
$PROJECT_ROOT/scripts/agent-session.sh start "tea"
```

<agent-activation>
1. Load persona from theme config → `agents.tea`
2. Load and follow `.claude/agents/tea.md`
3. Load sidecar: `.claude/project/agents/tea-sidecar/*.md`
</agent-activation>

<agent-exit>
On exit: Capture learnings to sidecar, run `agent-session.sh stop`
</agent-exit>
