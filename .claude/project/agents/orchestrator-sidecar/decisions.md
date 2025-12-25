# Orchestrator Decisions

> Key architectural decisions for Pennyfarthing

## Decision Log

### DEC-ORCH-001: Automatic Persona Loading
**Date:** December 2024
**Problem:** Agents ignored multi-step persona loading instructions
**Decision:** Scripts output persona directly; agents see it automatically
**Files:** All agent command files, `agent-session.sh`

### DEC-ORCH-002: Merge Config on Init
**Date:** December 2024
**Problem:** Critical hooks missing when settings.local.json existed
**Decision:** Merge required hooks into existing config files
**Files:** `src/cli/commands/init.ts`

### DEC-ORCH-003: .claude Climber Pattern
**Date:** December 2024
**Problem:** $CLAUDE_PROJECT_DIR not available in Bash tool calls
**Decision:** Use inline directory climbing to find project root
**Files:** All agent command files in `.claude/commands/`

---

*Add orchestration decisions made during process work below*
