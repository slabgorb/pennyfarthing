# SM Agent Gotchas

> Top 10 pitfalls - keep this file under 50 lines

## Critical (will break workflow)

### 1. SM Never Writes Implementation Code
Read implementation files ONLY for context summaries. Create session → handoff to TEA/Dev.

### 2. Write Without Read
Always `Read` existing files before `Write` or `Edit`.

### 3. Assessment Before Handoff
Edit session file with assessment BEFORE spawning handoff subagent.

### 4. Jira Field Name
Use `jira:` not `jira_key:` in sprint YAML.

### 5. Never Guess Jira IDs
Look up in sprint YAML, query Jira, or ask user. Never fabricate `MSSCI-XXXXX` keys.

## Important (causes friction)

### 6. Trivial vs Standard Routing
1-2 pts → Dev directly. 3+ pts → TEA first.

### 7. Symlinks for New Commands
Create both `pennyfarthing-dist/commands/X.md` AND symlink in `.claude/commands/`.

### 8. Handoff Marker Required
Emit `<!-- CYCLIST:HANDOFF:/agent -->` for Cyclist UI button.

### 9. American Spelling for Jira
Use "Canceled" not "Cancelled" for transitions.

### 10. Verify Subagent Data
Cross-check story counts against `sprint/current-sprint.yaml`.

---
*Full history: See git log for this file*
