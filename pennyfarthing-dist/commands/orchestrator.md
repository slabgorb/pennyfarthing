---
description: Orchestrator - Coordinator of all agents and meta operations
---

```bash
d="$PWD"; while [[ ! -d "$d/.claude" ]] && [[ "$d" != "/" ]]; do d="$(dirname "$d")"; done; "$d/.pennyfarthing/scripts/core/run.sh" core/agent-session.sh start "orchestrator"
```
