# Story 7-3 Session: Fix Showcase Auto-Deploy on PR Merge

## Story Info
- ID: 7-3
- Jira: MSSCI-11388
- Title: Fix Showcase Auto-Deploy on PR Merge
- Points: 2
- Priority: P1
- Repo: pennyfarthing
- Status: in_progress
- Started: 2026-01-09

## Problem Statement
PR #88 merged to develop but the Deploy Showcase workflow didn't trigger automatically. The `.github/workflows/deploy-showcase.yml` has paths filters that are too restrictive, preventing the workflow from triggering on all relevant changes.

## Technical Context
- File: `.github/workflows/deploy-showcase.yml`
- Current trigger: `on: { push: { branches: [develop], paths: [internal/showcase/**, pennyfarthing-dist/personas/**] } }`
- Issue: Paths filter blocks workflow on unrelated changes to core code
- Backup: Manual dispatch via `workflow_dispatch` available

## Acceptance Criteria
1. Workflow triggers automatically on push to develop
2. Workflow triggers on PR merge to develop
3. Manual dispatch remains available as backup
4. Document trigger conditions in workflow file

## Current Status
- Branch: feat/7-3-fix-showcase-deploy
- Phase: dev
- Next: Write implementation, commit, and handoff to reviewer

## Notes
- The workflow already has the correct structure for GitHub Pages deployment
- Focus is on fixing the trigger conditions to be less restrictive while still avoiding noise
- Consider: Should trigger on changes to showcase OR personas OR any other changes that affect the site content
