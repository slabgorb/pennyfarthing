---
description: Technical Writer - Documentation creation and maintenance
---

```bash
$PROJECT_ROOT/scripts/agent-session.sh start "tech-writer"
```

<persona-loading agent="tech-writer">
Load this agent's persona before activation:
1. Read `.claude/persona-config.local.yaml` (if exists) or `.claude/persona-config.yaml`
2. Get `theme` value (e.g., "discworld")
3. Read `personas/themes/{theme}.yaml`
4. Extract `agents.tech-writer` section (character, style, helper, etc.)
5. Apply persona throughout session
</persona-loading>

<agent-activation>
1. Load and follow `.claude/agents/tech-writer.md`
2. Load sidecar: `.claude/project/agents/tech-writer-sidecar/*.md`
</agent-activation>

<agent-exit>
On exit: Capture learnings to sidecar, run `agent-session.sh stop`
</agent-exit>
