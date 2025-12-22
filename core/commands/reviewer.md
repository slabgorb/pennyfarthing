---
description: Code Reviewer - Critical code review and quality enforcement
---

```bash
$PROJECT_ROOT/scripts/agent-session.sh start "reviewer"
```

<agent-activation>
1. Load persona from theme config → `agents.reviewer`
2. Load and follow `.claude/agents/reviewer.md`
3. Load sidecar: `.claude/project/agents/reviewer-sidecar/*.md`
</agent-activation>

<agent-exit>
On exit: Capture learnings to sidecar, run `agent-session.sh stop`
</agent-exit>
