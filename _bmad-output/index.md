# Pennyfarthing Brownfield Discovery Index

**Generated:** 2026-01-19
**Scan Level:** Deep Scan
**Methodology:** BMAD 6.0

## Overview

This documentation set was generated using the BMAD brownfield discovery methodology. It provides comprehensive analysis of the Pennyfarthing codebase for AI-assisted development.

## Documentation Files

| Document | Purpose |
|----------|---------|
| [project-overview.md](./project-overview.md) | Executive summary and high-level architecture |
| [source-tree-analysis.md](./source-tree-analysis.md) | Annotated directory structure |
| [technology-stack.md](./technology-stack.md) | Complete technology stack reference |
| [architecture-patterns.md](./architecture-patterns.md) | Code patterns and conventions |
| [agent-architecture.md](./agent-architecture.md) | AI agent system design |
| [critical-rules.md](./critical-rules.md) | Implementation rules and constraints |
| [ai-guidance.md](./ai-guidance.md) | Guidance for AI agents working on this codebase |
| [development-guide.md](./development-guide.md) | Local setup and development workflow |

## Quick Reference

**Project Type:** pnpm monorepo with TypeScript/ES modules
**Version:** 7.0.2
**Node:** >=18.0.0
**Packages:** 3 (@pennyfarthing/core, @pennyfarthing/cyclist, @pennyfarthing/shared)

## What This Project Does

Pennyfarthing is a **Claude Code agent orchestration framework** that coordinates multiple AI agents (SM, TEA, Dev, Reviewer) through story-driven Test-Driven Development (TDD) cycles with themed personas.

## Key Architectural Decisions

1. **Single Source of Truth** - All definitions in `pennyfarthing-dist/`, accessed via symlinks
2. **State Detection** - Agents detect workflow state from `.session/{story-id}-session.md`
3. **Subagent Delegation** - Opus handles reasoning; Haiku handles mechanical work
4. **Lazy Context Loading** - Context loaded only when needed per agent type
5. **Tracked Build Output** - `dist/` is committed (served directly from GitHub)

## Navigation

- Start with [project-overview.md](./project-overview.md) for high-level understanding
- Review [critical-rules.md](./critical-rules.md) before making changes
- Consult [ai-guidance.md](./ai-guidance.md) for agent-specific patterns
