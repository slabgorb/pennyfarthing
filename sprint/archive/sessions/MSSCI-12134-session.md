---
story_id: MSSCI-12134
jira: MSSCI-12134
title: "Import Product Brief workflow"
epic: epic-54
points: 2
priority: P0
status: in_progress
workflow: trivial
phase: dev
feature_branch: feat/MSSCI-12134-product-brief-workflow
repos: [pennyfarthing]
session_started: 2026-01-21T00:00:00Z
---

# Story: Import Product Brief workflow

## Context

Import BMAD product brief workflow into Pennyfarthing's stepped workflow system.

## Technical Context

### Source Workflow

- **Location:** `~/Projects/BMAD-METHOD/src/modules/bmm/workflows/1-analysis/create-product-brief/`
- **Type:** Single-mode workflow (create only)
- **Steps:** 6 step files (step-01-init.md through step-06-complete.md, plus step-01b-continue.md)
- **Template:** product-brief.template.md (minimal template)
- **Configuration:** workflow.md with YAML frontmatter

### Target Location

- **Pennyfarthing:** `pennyfarthing-dist/workflows/product-brief/`
- **Structure:** Single steps-c directory (no validate/edit modes)
- **Output:** workflow.yaml (Pennyfarthing schema)

### Migration Approach

1. Use existing `pennyfarthing-dist/scripts/migrate-bmad-workflow.sh` script
2. Script handles variable conversion ({var-name} → {var_name})
3. Generate workflow.yaml from workflow.md frontmatter
4. Copy step files maintaining step-NN-*.md pattern
5. Reference: PRD workflow migration (MSSCI-12133) uses same pattern

### Key Files to Create/Modify

1. `pennyfarthing-dist/workflows/product-brief/workflow.yaml` - Workflow configuration
2. `pennyfarthing-dist/workflows/product-brief/steps-c/step-*.md` - Step files (6 total)
3. `pennyfarthing-dist/workflows/product-brief/templates/product-brief.template.md` - Output template
4. `.claude/workflows/product-brief` - Symlink to workflow

## Workflow State

### Current Step

**Phase:** dev - Ready for developer handoff

## Notes

- Product brief is single-mode (create only) vs PRD's tri-modal
- Template is minimal with frontmatter metadata
- Step processing follows BMAD's step-file architecture
- No gates defined for product brief workflow

## SM Assessment

**Routing:** Trivial (2 pts) → Direct to Dev, skip TEA
**Scope:** Import single-mode BMAD workflow using established migration pattern
**Risk:** Low - migration script proven with PRD workflow
**Handoff:** Ready for Tyrion (Dev)

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `pennyfarthing-dist/workflows/product-brief/workflow.yaml` - Workflow configuration
- `pennyfarthing-dist/workflows/product-brief/steps/step-*.md` - 7 step files
- `pennyfarthing-dist/workflows/product-brief/templates/product-brief.template.md` - Output template
- `.claude/workflows/product-brief` - Symlink for discovery
- `sprint/current-sprint.yaml` - Story status update

**Tests:** N/A (trivial workflow import, no code)
**PR:** #408 - feat(MSSCI-12134): Import Product Brief workflow from BMAD
**Branch:** feat/MSSCI-12134-product-brief-workflow (pushed)

**Handoff:** To Reviewer for code review

## Reviewer Assessment

**Decision:** APPROVED

**Verification:**
- Workflow YAML structure matches Pennyfarthing schema
- Variable conversion complete (`{var-name}` → `{var_name}`)
- All 7 step files present and properly formatted
- Template in correct location with Mustache variables
- Symlink resolves correctly to pennyfarthing-dist
- Agent assignment (PM) appropriate for product definition
- Lint passes

**Tests:** 1575/1576 pass - single failure is pre-existing unrelated issue in workspace.test.js (CLI execution), not related to this content-only PR

**Security:** No concerns (markdown content only, no code execution)

**Minor Observations:**
- Session tech context said "steps-c" but implementation correctly used "steps" for single-mode workflow

**Handoff:** Ready for SM (Lord Varys) to finish story
