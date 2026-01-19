# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for the Pennyfarthing project.

## What is an ADR?

An ADR captures an important architectural decision along with its context and consequences. They serve as:

- Historical record of technical decisions
- Documentation for future maintainers
- Reference for understanding "why" not just "what"

## Format

Each ADR follows this structure:

```markdown
# ADR-NNNN: Title

**Status:** Proposed | Accepted | Deprecated | Superseded
**Date:** YYYY-MM-DD
**Author:** Agent or person

## Context
What is the issue that we're seeing that is motivating this decision?

## Decision
What is the change that we're proposing?

## Consequences
What becomes easier or more difficult because of this change?
```

## Index

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [0001](./0001-consolidate-code-duplication.md) | Consolidate Code Duplication | Accepted | 2025-12-31 |
| [0002](./0002-context-budget-optimization.md) | Context Budget Optimization | Proposed | 2026-01-03 |
| [0003](./0003-cyclist-claude-code-alignment.md) | Cyclist Claude Code 2.1.0 Alignment | Proposed | 2026-01-09 |
| [0004](./0004-wheelhub-background-agent-coordination.md) | Wheelhub Background Agent Coordination | Proposed | 2026-01-18 |

## Creating a New ADR

1. Copy the template above
2. Use the next available number (NNNN)
3. Fill in all sections
4. Add to the index table above
5. Submit for review
