---
description: Developer - Feature implementation and coding
---

```bash
$PROJECT_ROOT/scripts/agent-session.sh start "dev"
```

<agent-activation>
1. Load and follow `.claude/agents/dev.md`
2. Load sidecar: `.claude/project/agents/dev-sidecar/*.md`
</agent-activation>

<agent-exit>
On exit: Capture learnings to sidecar, run `agent-session.sh stop`
</agent-exit>
