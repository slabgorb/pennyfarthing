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
| [0002](./0002-context-budget-optimization.md) | Context Budget Optimization | Superseded | 2026-01-03 |
| [0003](./0003-cyclist-claude-code-alignment.md) | Cyclist Claude Code 2.1.0 Alignment | Superseded | 2026-01-09 |
| [0004](./0004-wheelhub-background-agent-coordination.md) | Wheelhub Background Agent Coordination | Accepted | 2026-01-18 |
| [0005](./0005-single-source-of-truth-symlinks.md) | Single Source of Truth via Symlinks | Accepted | 2026-01-19 |
| [0006](./0006-state-detection-pattern.md) | State Detection Over Explicit Commands | Accepted | 2026-01-19 |
| [0007](./0007-subagent-delegation-model.md) | Subagent Delegation Model (Opus/Haiku) | Accepted | 2026-01-19 |
| [0008](./0008-result-object-error-handling.md) | Result Object Error Handling | Accepted | 2026-01-19 |
| [0009](./0009-session-file-coordination.md) | Session File Coordination Protocol | Accepted | 2026-01-19 |
| [0010](./0010-esm-module-requirements.md) | ESM Module Requirements | Accepted | 2026-01-19 |
| [0011](./0011-reflector-marker-consolidation.md) | Reflector Marker Consolidation | Accepted | 2026-01-23 |
| [0012](./0012-tandem-agent-pairing.md) | Tandem Agent Pairing | Proposed | 2026-01-23 |
| [0013](./0013-bmad-workflow-import.md) | Stepped Workflow Support (BMAD-Inspired) | Accepted | 2026-01-19 |
| [0014](./0014-cdn-portrait-storage.md) | CDN-Based Portrait Storage | Proposed | 2026-01-19 |
| [0015](./0015-prime-activation-system.md) | Prime Activation System | Accepted | 2026-01-28 |
| [0016](./0016-bell-mode-message-injection.md) | Bell Mode (Message Queue Injection) | Accepted | 2026-01-28 |
| [0017](./0017-relay-mode-automatic-handoff.md) | Relay Mode (Automatic Agent Handoff) | Accepted | 2026-01-28 |
| [0018](./0018-sprint-yaml-script-access.md) | Sprint YAML Script Access Pattern | Accepted | 2026-01-28 |

## Creating a New ADR

1. Copy the template above
2. Use the next available number (NNNN)
3. Fill in all sections
4. Add to the index table above
5. Submit for review
