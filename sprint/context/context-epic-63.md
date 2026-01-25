# Epic 63: Script Parallelism & Python Migration

## Overview

Epic 63 migrates Pennyfarthing's JavaScript utility scripts to Python for better maintainability, subprocess handling, and async patterns. The Python infrastructure is now well-established after completing stories 63-1 through 63-6.

## Python Infrastructure (63-4, established)

```
pyproject.toml                    # Package config: pyyaml, httpx, pytest-asyncio
pennyfarthing_scripts/            # Main package
├── __init__.py
├── config.py                     # Configuration loading
├── sprint.py                     # Sprint YAML utilities
├── jira/                         # Jira integration package
│   ├── __init__.py               # Re-exports all public API
│   ├── models.py                 # Dataclasses: JiraIssue, SyncChange, SyncPlan, etc.
│   ├── mappings.py               # Constants: JIRA_PROJECT, JIRA_URL, status mappings
│   ├── client.py                 # AsyncJiraClient (httpx-based)
│   ├── bidirectional.py          # Bidirectional sync logic (63-6)
│   └── compat.py                 # CLI wrapper functions for sync operations
├── jira.py                       # Backwards compat re-export
└── jira_sync.py                  # One-way sync (63-5)
```

## AsyncJiraClient Pattern

```python
async with AsyncJiraClient() as client:
    # Parallel fetches via asyncio.gather
    issues = await asyncio.gather(
        client.get_issue("MSSCI-12395"),
        client.get_issue("MSSCI-12396"),
    )

    # Available methods:
    # - get_issue(key) -> dict | None
    # - transition_issue(key, status) -> {success, error?}
    # - update_points(key, points) -> {success, error?}
    # - get_sprint_issues(sprint_id) -> list[dict]
    # - search_issues(jql) -> list[dict]
```

## JavaScript Scripts to Port (63-7 scope)

### jira-lib.mjs (~444 lines) - Shared library

Already ported functionality in Python:
- `JIRA_PROJECT`, `JIRA_URL` → `mappings.py`
- `mapStatusToJira`, `mapJiraToStatus` → `mappings.py`
- `extractJiraKey` → `mappings.py`
- `getIssueJson`, `getJiraField`, `getStoryPoints` → `compat.py`
- `moveIssue`, `syncStoryPoints` → `client.py` (async)
- `addComment` → `compat.py`

Functions NOT yet in Python:
- `findProjectRoot()` - Find .claude directory
- `checkDependencies()` - Verify jira CLI and JIRA_API_TOKEN
- `loadSprintFile()` - YAML loading (partially in sprint.py)
- `findEpic()`, `findStory()` - Sprint navigation
- `getStoryField()` - Extract field from sprint YAML story
- `mapGithubToJira()` - GitHub → Jira email mapping
- `parseArgs()` - CLI argument parsing

### jira-sync-story.mjs (~209 lines) - Single story sync

CLI tool that:
1. Finds story in sprint YAML
2. Fetches current Jira state
3. Optionally transitions to match Pennyfarthing status
4. Optionally syncs story points
5. Optionally adds comment
6. Auto-comments on transitions (branch, PR, completion)

### jira-epic-creation (in packages/core/src/jira/)

TypeScript module for auto-creating Jira epics. Currently in:
- `packages/core/src/jira/jira-epic-creation.ts`

## Testing Pattern

```
tests/python/
├── test_jira_sync.py              # Tests for jira_sync.py
├── test_jira_bidirectional_sync.py # Tests for bidirectional.py
└── conftest.py                    # Shared fixtures
```

Pattern: pytest-asyncio with mocked httpx responses.

## Result Object Convention

All functions return result objects, not exceptions:
```python
result = await client.transition_issue(key, status)
if result["success"]:
    ...
else:
    error = result.get("error")
```

## Just Recipes

```bash
just py <script.py>     # Run with venv python
just test-python        # Run pytest
just lint-python        # Run ruff
```

## Story 63-7 Goals

1. Port remaining jira-lib.mjs functions to `pennyfarthing_scripts/jira/`
2. Create `jira_sync_story.py` CLI replacing jira-sync-story.mjs
3. Add epic creation to Python (from TypeScript)
4. Consolidate all Jira logic in `pennyfarthing_scripts.jira` module
5. Maintain backwards compatibility with existing bash callers

## Key Files

| File | Purpose |
|------|---------|
| `pennyfarthing_scripts/jira/__init__.py` | Public API exports |
| `pennyfarthing_scripts/jira/client.py` | AsyncJiraClient |
| `pennyfarthing_scripts/jira/compat.py` | CLI wrapper (sync) |
| `pennyfarthing-dist/scripts/jira/jira-lib.mjs` | JS source to port |
| `pennyfarthing-dist/scripts/jira/jira-sync-story.mjs` | JS CLI to port |
| `tests/python/test_jira_*.py` | Test files |
