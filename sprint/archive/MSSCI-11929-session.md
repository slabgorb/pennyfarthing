# Story MSSCI-11929: Use enriched tool descriptions in collapsed headers

## Overview
- **Epic:** MSSCI-11715 (Cyclist UI/UX)
- **Points:** 2
- **Priority:** P1
- **Repos:** cyclist
- **Workflow:** trivial
- **Branch:** feat/MSSCI-11929-enriched-tool-headers

## Problem
Tool result collapsed sections in the message stream show generic "Tool Result" as the header text. The OTEL enrichment already captures descriptive information:
- Bash: `description` parameter
- Read: `file_path`
- Task: `description`
- Grep/Glob: `pattern`

This data should be displayed in the collapsed header instead of "Tool Result".

## Acceptance Criteria
- [ ] Bash tool results show description param in header (e.g., "Check git status")
- [ ] Read tool results show filename in header (e.g., "Read sm.md")
- [ ] Task tool results show description in header
- [ ] Grep/Glob show pattern or search summary
- [ ] Falls back to "Tool Result" only if no description available

## Technical Context
The tool result renderer is in `packages/cyclist/src/public/js/`. Look at:
- How Bash results are currently rendered (MSSCI-11851/11928 added collapsible Bash)
- Where enrichment attributes are available
- The `tool_result` message handling in MessageView

## Workflow
```
Phase: implement
Agent: Dev
Status: ready
```

---
*Session started: 2026-01-19T08:02:00Z*
*Assigned to: Keith Avery*
