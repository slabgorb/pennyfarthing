# ADR-0020: Changed Panel Uses Git as Source of Truth

## Status

Proposed

## Context

The Changed Files panel currently tracks only files modified via Claude's `Edit` and `Write` tools. Files created or modified through Bash commands (`echo >`, `cp`, `mv`, `touch`, redirections) are invisible to users, creating confusion about what actually changed during a session.

**User expectation:** "Show me all files that changed"
**Current behavior:** "Show me files changed via Edit/Write tools only"

### Current Architecture

```
OTEL tool events → processToolUseForDiffs() → broadcastDiff() → /ws/diffs → ChangedPanel
                   (only Edit/Write)
```

The Changed panel subscribes to `/ws/diffs` WebSocket, which only receives events when `Edit` or `Write` tools are used. Bash operations bypass this entirely.

### Existing Infrastructure

We already have a robust git status caching system (`git-cache.ts`) that:
- Tracks ALL changed files via `git status --porcelain`
- Debounces refreshes (1.5s delay, 5s max) to prevent hammering git
- Invalidates on file-modifying operations (Edit, Write, Bash with redirects, etc.)
- Broadcasts updates via `/ws/git` WebSocket
- Returns `RepoGitInfo.dirtyFiles[]` with `{ status, path }` for each changed file

The Git panel already displays this data correctly.

## Decision

**Replace the `/ws/diffs` data source with `/ws/git` for the Changed Files panel.**

The Changed panel will subscribe to the existing git WebSocket endpoint and display `dirtyFiles` from `RepoGitInfo`. This reuses proven infrastructure rather than maintaining a parallel tracking system.

### New Architecture

```
Tool events → shouldInvalidateGitCache() → invalidateGitCache() → git status
                                                                       ↓
                                           /ws/git ← getCachedGitStatus()
                                               ↓
                                         ChangedPanel (reads dirtyFiles)
```

### Implementation

1. **ChangedPanel.tsx**: Change WebSocket subscription from `/ws/diffs` to `/ws/git`
2. **ChangedPanel.tsx**: Map `RepoGitInfo.dirtyFiles[]` to `FileChange[]` format
3. **Remove**: `/ws/diffs` WebSocket handler and `diffStore` (now unused)
4. **Remove**: `processToolUseForDiffs()` and `broadcastDiff()` (now unused)

### File Status Mapping

Git porcelain status → FileChange status:

| Git Status | Meaning | FileChange Status |
|------------|---------|-------------------|
| `?` | Untracked | `created` |
| `A` | Added (staged) | `created` |
| `M` | Modified | `modified` |
| `D` | Deleted | `deleted` |
| `R` | Renamed | `modified` |
| `C` | Copied | `created` |

### Multi-Repo Support

The git cache already handles multiple repos (orchestrator + subrepos). The Changed panel will display files grouped by repo, matching the Git panel's behavior.

## Consequences

### Positive

- **Complete coverage**: All file changes visible, regardless of how they were made
- **Single source of truth**: No parallel tracking systems to maintain
- **Proven infrastructure**: Reuses battle-tested git caching with proper debouncing
- **Less code**: Remove ~100 lines of diff tracking code
- **Consistent UX**: Changed panel and Git panel show the same data

### Negative

- **No immediate feedback**: Edit/Write changes won't appear until git cache refreshes (1.5s delay)
- **No diff content**: Panel shows file paths only, not the actual changes (but DiffsPanel can still use git diff)
- **Git-only**: Untracked files in `.gitignore` won't appear (acceptable - they're ignored for a reason)

### Neutral

- **Latency trade-off**: 1.5s delay is acceptable for "changed files" display; users can still see immediate tool output in the message stream

## Alternatives Considered

### B. Merge Both Sources (Edit/Write + Git)

Keep `/ws/diffs` for immediate Edit/Write feedback, add `/ws/git` for Bash changes.

**Rejected because:** Adds complexity, two sources of truth, potential for inconsistency.

### C. Extend Bash Detection

Parse Bash commands to extract file paths and broadcast synthetic diffs.

**Rejected because:** Fragile regex parsing, can't know file contents, git already does this better.

### D. File System Watcher (chokidar/fs.watch)

Watch project directories for all file changes.

**Rejected because:** Noisy (catches external changes), performance concerns, complexity.

## References

- `packages/cyclist/src/git-cache.ts` - Git caching implementation
- `packages/cyclist/src/websocket.ts:41-81` - `shouldInvalidateGitCache()` detection logic
- `packages/cyclist/src/public/hooks/useGitStatus.ts` - Frontend git hook
- `packages/cyclist/src/public/components/panels/GitPanel.tsx` - Git panel implementation
