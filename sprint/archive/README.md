# Sprint Archive

Historical records from Pennyfarthing development sprints (Dec 2025 - Jan 2026).

## Contents

| Category | Pattern | Description |
|----------|---------|-------------|
| **Consolidated YAML** | `sprints-*.yaml` | Lean sprint records by era |
| **History Summary** | `history-summary.md` | Human-readable overview |
| **Sprint Retros** | `sprint-*-retro*.md` | Retrospective notes (kept for learnings) |
| **Sidecar Archive** | `sidecar-archive/` | Historical agent learnings |

## Directory Structure

```
archive/
├── history-summary.md      # Overview of all 10 sprints
├── sprints-1-5.yaml        # Pre-Jira era (139 pts, 63 stories)
├── sprints-6-10.yaml       # Jira era (244 pts, 256 stories)
├── sprint-*-retro*.md      # Sprint retrospectives
├── sprint-9-grooming-report.md
├── sidecar-archive/        # Historical agent learnings
│   ├── dev-sidecar/
│   ├── tea-sidecar/
│   ├── sm-sidecar/
│   └── ...
└── README.md
```

## What Was Pruned (2026-01-17)

The following were deleted to reduce archive bloat (recoverable from git history):

| Deleted | Count | Rationale |
|---------|-------|-----------|
| `story-*.md` | 185 | Individual story session logs |
| `context-*.md` | 51 | Technical context per story |
| `*-session*.md` | 41 | Work session files |
| `epic-*.md` | 3 | Epic-level context |
| `sprint-N.yaml` | 8 | Verbose sprint files (replaced by consolidated) |

**Reduction:** ~5MB → ~200KB (96% reduction)

## Quick Reference

### Sprint Overview
```bash
cat history-summary.md
```

### Sprint Details
```bash
# Pre-Jira era (Sprints 1-5)
cat sprints-1-5.yaml

# Jira era (Sprints 6-10)
cat sprints-6-10.yaml
```

### Sprint Learnings
```bash
# List all retros
ls sprint-*-retro*.md

# Read specific retro
cat sprint-10-retro.md
```

### Agent Historical Patterns
```bash
cat sidecar-archive/dev-sidecar/*.md
```

## Retention Policy

- **Keep:** Consolidated YAML, retros, sidecar-archive, history summary
- **Pruned:** Individual story/context/session files (in git history)
- **Current size:** ~200KB

## Recovery

All pruned files remain in git history:
```bash
# Restore a specific file
git show HEAD~1:sprint/archive/story-24-5-20260112.md

# List deleted files
git diff --name-only HEAD~1
```
