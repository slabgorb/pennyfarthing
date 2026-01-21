# Story MSSCI-12037: Rewrite /just skill with prescriptive scripts

**Epic:** MSSCI-11952 - Skill Prescriptive Rewrites
**Points:** 1 | **Priority:** P2
**Repos:** pennyfarthing
**Branch:** feat/MSSCI-12037-just-skill-rewrite
**Jira:** MSSCI-12037
**Phase:** finish
**Status:** approved
**Workflow:** trivial

## Acceptance Criteria
- [ ] /just skill rewritten with prescriptive format (like /sprint)
- [ ] Common just recipes documented with Run blocks

## Technical Context

### Current State
The `/just` skill at `pennyfarthing-dist/skills/just/skill.md` is a general reference guide explaining:
- When to use just
- Common recipe patterns (generic, not project-specific)
- Recipe authoring syntax
- Best practices

### Target State
Rewrite to match the prescriptive `/sprint` pattern:
- Command sections with `**Run:**` blocks showing exact commands
- Arguments tables where applicable
- Concrete examples with output descriptions
- Quick reference summary at the end

### Project Recipes Available
From `just --list`:
- `build` - Build all packages
- `cyclist *args` - Main Cyclist command (multiple modes)
- `test` - Run all tests
- `test-cyclist` - Cyclist tests only
- `test-cyclist-watch` - Cyclist tests in watch mode
- `portraits theme` - Generate portraits for a theme
- `portraits-all` - Generate all portraits
- `portraits-preview theme` - Preview portraits

### Key Patterns from /sprint to Follow
1. YAML frontmatter with name, description, args
2. H2 sections for each command: `### /just <subcommand>`
3. `**Run:**` code blocks with exact bash commands
4. `**Arguments:**` tables (Arg | Required | Description)
5. `**Example:**` sections with concrete usage
6. `**What it does:**` numbered lists for complex commands
7. Quick Reference table at the end

### Files to Modify
- `pennyfarthing-dist/skills/just/skill.md` - Complete rewrite

## Workflow
- [x] SM: Story setup
- [x] Dev: Implement rewrite
- [x] Reviewer: Code review
- [ ] SM: Finish story

## Handoff Notes
Naomi - straightforward rewrite. The `/sprint` skill is your template. Focus on the `cyclist` command which has the most complexity (multiple run modes and maintenance subcommands). Keep recipe authoring tips in a collapsed section at the end if needed.

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `pennyfarthing-dist/skills/just/SKILL.md` - Complete rewrite to prescriptive format

**Tests:** N/A (documentation change)
**PR:** #377 - docs(just): rewrite skill with prescriptive scripts
**Branch:** feat/MSSCI-12037-just-skill-rewrite (pushed)

**Changes:**
- Added YAML frontmatter with `args:` field
- Documented all project recipes with `**Run:**` blocks
- Full Cyclist command coverage (run modes, maintenance subcommands)
- Portrait generation commands
- Arguments tables where applicable
- Quick Reference summary table
- Removed generic recipe authoring content (not needed for prescriptive format)

**Handoff:** To Reviewer for code review

## Reviewer Assessment

**PR:** #377
**Verdict:** APPROVED

**Code Review Evidence:**
- **Content accuracy:** Verified documented recipes match `just --list` output - all 10 recipes accounted for
- **Cyclist subcommands:** Verified against `just --show cyclist` - all modes (electron/web/server/here/verbose/dir=) and maintenance commands (setup/doctor/build/clean/rebuild/package/install) accurately documented
- **Format consistency:** Follows `/sprint` pattern exactly: YAML frontmatter with `args:`, `**Run:**` blocks, arguments tables, quick reference table
- **Removed cruft:** Generic recipe authoring tutorials appropriately removed - this is prescriptive documentation, not a tutorial
- **Fixed broken reference:** Removed link to non-existent `references/justfile-syntax.md`

**Acceptance Criteria:**
- [x] /just skill rewritten with prescriptive format (like /sprint)
- [x] Common just recipes documented with Run blocks

**Non-Blocking Observations:**
- [LOW] None - clean implementation

**Handoff:** To SM for finish-story workflow

---
*Session started: 2026-01-20*
