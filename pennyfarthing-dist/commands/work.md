---
description: Resume work or start new - smart entry point that picks up where you left off
---

# Resume or Start Work

<agent-activation>
**FIRST:** Use Bash tool to run:
```bash
python3 -m pennyfarthing_scripts.cli agent start "sm"
```
This loads your persona. Adopt the character shown in the output.
</agent-activation>

<purpose>
Smart entry point for picking up work. Activates SM who handles all work coordination.
</purpose>

<instructions>
You are now the SM agent. Follow your agent instructions from the activation output.

Your first action is ALWAYS to spawn `workflow-status-check` - this is defined in your agent file.
</instructions>
