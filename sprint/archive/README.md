# Sprint Archive

Historical records from Pennyfarthing development sprints.

## Contents

| Category | Pattern | Count | Description |
|----------|---------|-------|-------------|
| **Sprint YAML** | `sprint-*.yaml` | 7 | Point-in-time sprint snapshots |
| **Sprint Retros** | `sprint-*-retro*.md` | 6 | Retrospective notes (4Ls format) |
| **Story Sessions** | `story-*-*.md` | 179 | Work session logs per story |
| **Story Context** | `context-story-*.md` | 44 | Technical approach documents |
| **Epic Context** | `context-epic-*.md` | 1 | Epic-level technical context |
| **Misc Sessions** | `*-session.md` | ~15 | Numbered story sessions (31-16, 35-1, etc.) |

## Directory Structure

```
archive/
├── sessions/           # Overflow session files (Epic 11)
├── sidecar-archive/    # Historical agent learnings
│   ├── dev-sidecar/
│   ├── tea-sidecar/
│   ├── sm-sidecar/
│   ├── reviewer-sidecar/
│   └── ...
├── stories/            # Additional session files (Epics 13-14)
├── sprint-*.yaml       # Sprint snapshots
├── sprint-*-retro*.md  # Retrospectives
├── story-*-*.md        # Story work sessions
└── context-*.md        # Technical context docs
```

## File Naming Conventions

### Story Sessions
`story-{epic}-{story}-{date}.md`
- Example: `story-24-5-20260112.md` = Epic 24, Story 5, worked on 2026-01-12

### Context Files
`context-story-{epic}-{story}.md`
- Example: `context-story-31-6.md` = Technical approach for story 31-6

### Sprint Files
- `sprint-{N}.yaml` - Sprint N configuration snapshot
- `sprint-{N}-retro.md` - Sprint N retrospective

## Epic Coverage

| Epic Range | Status | Stories |
|------------|--------|---------|
| 1-30 | Completed | ~150 files |
| 31-36 | Active (Sprint 10) | ~30 files |

## Usage

### Finding Story History
```bash
# Find all files for a specific story
ls -la story-24-* context-story-24-*

# Search for content across sessions
grep -l "race condition" story-*.md
```

### Reading a Sprint's Work
```bash
# See what was done in Sprint 9
cat sprint-9-retro-final.md
```

### Reviewing Agent Learnings
```bash
# Check what Dev learned
cat sidecar-archive/dev-sidecar/*.md
```

## Retention Policy

- **Keep indefinitely:** Sprint YAML, retros, sidecar-archive
- **Safe to compress:** Story sessions for completed epics (1-30)
- **Current size:** ~4MB (263 files)

## Notes

Story summaries (condensed versions) are stored in `sprint/context/story-*-summary.md`, separate from this archive. The archive contains the full session logs with detailed work history.
