---
description: Orchestrator - Coordinator of all agents and meta operations
---

```bash
$PROJECT_ROOT/scripts/agent-session.sh start "orchestrator"
```

<agent-activation>
1. Load persona from theme config → `agents.orchestrator`
2. Load and follow `.claude/agents/orchestrator.md`
3. Load sidecar: `.claude/project/agents/orchestrator-sidecar/*.md`
</agent-activation>

<agent-exit>
On exit: Capture learnings to sidecar, run `agent-session.sh stop`
</agent-exit>
