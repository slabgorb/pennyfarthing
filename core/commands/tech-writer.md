---
description: Technical Writer - Documentation creation and maintenance
---

```bash
$PROJECT_ROOT/scripts/agent-session.sh start "tech-writer"
```

<agent-activation>
1. Load and follow `.claude/agents/tech-writer.md`
2. Load sidecar: `.claude/project/agents/tech-writer-sidecar/*.md`
</agent-activation>

<agent-exit>
On exit: Capture learnings to sidecar, run `agent-session.sh stop`
</agent-exit>
