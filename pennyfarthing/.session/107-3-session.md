# Story 107-3: Gate authoring guide and validation command

**Jira:** MSSCI-15011
**Points:** 2
**Workflow:** agent-docs
**Phase:** setup
**Repos:** pennyfarthing
**Branch:** feat/107-3-gate-authoring-guide-validation-command

---

## Description

Create pennyfarthing-dist/guides/gate-schema.md with complete schema, working example, and authoring best practices. Add validation command that checks schema, acyclic, depth, mandatory pass/fail — reporting ALL errors at once. Valid gates get confirmation with structure summary.

## Acceptance Criteria

- [ ] `pennyfarthing-dist/guides/gate-schema.md` exists with complete gate schema reference
- [ ] Guide includes working example gate file
- [ ] Guide covers authoring best practices
- [ ] Validation command checks schema, acyclic, depth, mandatory pass/fail
- [ ] Validation reports ALL errors at once (not fail-fast)
- [ ] Valid gates get confirmation with structure summary

## Context

- Epic 107: Gate Validation & Authoring (MSSCI-15008)
- 107-1 (done): Gate schema validation at parse time
- 107-2 (done): Acyclic validation and depth limit enforcement
- Key file: `packages/core/src/shared/gate-file-validation.ts`
- Initiative: gate-extraction

## Workflow Tracking

| Phase | Agent | Status | Timestamp |
|-------|-------|--------|-----------|
| setup | sm | done | 2026-02-15T16:05:00Z |
| analyze | orchestrator | pending | |
| implement | orchestrator | pending | |
| review | tech-writer | pending | |
| finish | sm | pending | |
