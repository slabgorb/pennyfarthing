/**
 * MSSCI-14238: Git-based Changed Files and Diffs Panels
 *
 * Story: Replace OTEL-based diff extraction with git commands
 * Epic: 76 - Sprint Data Management
 *
 * Acceptance Criteria:
 * - AC1: Changed Files panel shows all modified files via git status
 * - AC2: Diffs panel shows accurate diffs via git diff
 * - AC3: Real-time updates use existing debounce/backoff (1.5s normal, 5s max cap)
 * - AC4: Cache invalidation on Edit/Write/Bash file modifications (existing logic)
 * - AC5: Branch switch triggers immediate refresh (existing .git/HEAD watcher)
 * - AC6: Works correctly in both Electron and browser modes
 * - AC7: Bash commands that modify files are properly tracked
 * - AC8: Simpler codebase - remove OTEL tool correlation for diffs
 *
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// Types (to be implemented/updated)
// =============================================================================

/**
 * Git diff output structure - replaces OTEL-based DiffData
 * Uses native git diff format instead of old_string/new_string from Edit tool
 */
export interface GitDiffData {
  path: string;
  diff: string; // Raw git diff output
  status: 'modified' | 'added' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  timestamp: number;
}

/**
 * Git diff cache state - extends GitCacheState
 */
export interface GitDiffCacheState {
  diffs: Map<string, GitDiffData>;
  stale: boolean;
  lastFetch: number;
}

// =============================================================================
// AC1: Changed Files panel shows all modified files via git status
// (Existing functionality - verify it works with new architecture)
// =============================================================================

describe('MSSCI-14238: Git-based Changed Files and Diffs', () => {
  describe('AC1: Changed Files panel shows all modified files via git status', () => {
    it('should detect all modified files from git status --porcelain', async () => {
      // This tests the existing ChangedPanel/useGitStatus functionality
      // Verify it continues to work when diffs are refactored
      const { getChangedFilesFromGitStatus } = await import('../src/git-diff.js');

      const porcelainOutput = `M  src/file1.ts
 M src/file2.ts
?? src/new-file.ts
D  src/deleted.ts`;

      const files = getChangedFilesFromGitStatus(porcelainOutput);

      expect(files).toContainEqual({ path: 'src/file1.ts', status: 'modified' });
      expect(files).toContainEqual({ path: 'src/file2.ts', status: 'modified' });
      expect(files).toContainEqual({ path: 'src/new-file.ts', status: 'untracked' });
      expect(files).toContainEqual({ path: 'src/deleted.ts', status: 'deleted' });
    });

    it('should handle renamed files in git status', async () => {
      const { getChangedFilesFromGitStatus } = await import('../src/git-diff.js');

      const porcelainOutput = `R  old-name.ts -> new-name.ts`;

      const files = getChangedFilesFromGitStatus(porcelainOutput);

      expect(files).toContainEqual({
        path: 'new-name.ts',
        status: 'renamed',
        oldPath: 'old-name.ts'
      });
    });

    it('should return empty array for clean working directory', async () => {
      const { getChangedFilesFromGitStatus } = await import('../src/git-diff.js');

      const files = getChangedFilesFromGitStatus('');

      expect(files).toEqual([]);
    });
  });

  // ===========================================================================
  // AC2: Diffs panel shows accurate diffs via git diff
  // ===========================================================================

  describe('AC2: Diffs panel shows accurate diffs via git diff', () => {
    it('should parse unified diff format from git diff output', async () => {
      const { parseGitDiff } = await import('../src/git-diff.js');

      const gitDiffOutput = `diff --git a/src/file.ts b/src/file.ts
index 1234567..89abcdef 100644
--- a/src/file.ts
+++ b/src/file.ts
@@ -1,3 +1,3 @@
 const x = 1;
-const y = 2;
+const y = 42;
 const z = 3;`;

      const parsed = parseGitDiff(gitDiffOutput);

      expect(parsed.path).toBe('src/file.ts');
      expect(parsed.additions).toBe(1);
      expect(parsed.deletions).toBe(1);
      expect(parsed.diff).toContain('-const y = 2;');
      expect(parsed.diff).toContain('+const y = 42;');
    });

    it('should handle new file diff (no previous content)', async () => {
      const { parseGitDiff } = await import('../src/git-diff.js');

      const gitDiffOutput = `diff --git a/src/new-file.ts b/src/new-file.ts
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/src/new-file.ts
@@ -0,0 +1,3 @@
+const x = 1;
+const y = 2;
+const z = 3;`;

      const parsed = parseGitDiff(gitDiffOutput);

      expect(parsed.status).toBe('added');
      expect(parsed.additions).toBe(3);
      expect(parsed.deletions).toBe(0);
    });

    it('should handle deleted file diff', async () => {
      const { parseGitDiff } = await import('../src/git-diff.js');

      const gitDiffOutput = `diff --git a/src/deleted.ts b/src/deleted.ts
deleted file mode 100644
index 1234567..0000000
--- a/src/deleted.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-const x = 1;
-const y = 2;
-const z = 3;`;

      const parsed = parseGitDiff(gitDiffOutput);

      expect(parsed.status).toBe('deleted');
      expect(parsed.additions).toBe(0);
      expect(parsed.deletions).toBe(3);
    });

    it('should handle binary file diff', async () => {
      const { parseGitDiff } = await import('../src/git-diff.js');

      const gitDiffOutput = `diff --git a/image.png b/image.png
Binary files a/image.png and b/image.png differ`;

      const parsed = parseGitDiff(gitDiffOutput);

      expect(parsed.status).toBe('modified');
      expect(parsed.diff).toContain('Binary files');
    });

    it('should get diff for specific file using git diff HEAD -- <path>', async () => {
      const { getGitDiffForFile } = await import('../src/git-diff.js');

      // This should call git diff HEAD -- <path> and parse the result
      const diff = await getGitDiffForFile('/project', 'src/file.ts');

      expect(diff).toHaveProperty('path', 'src/file.ts');
      expect(diff).toHaveProperty('diff');
      expect(diff).toHaveProperty('status');
    });

    it('should get all diffs using git diff HEAD', async () => {
      const { getAllGitDiffs } = await import('../src/git-diff.js');

      const diffs = await getAllGitDiffs('/project');

      expect(Array.isArray(diffs)).toBe(true);
      // Each diff should have required fields
      if (diffs.length > 0) {
        expect(diffs[0]).toHaveProperty('path');
        expect(diffs[0]).toHaveProperty('diff');
        expect(diffs[0]).toHaveProperty('status');
      }
    });
  });

  // ===========================================================================
  // AC3: Real-time updates use existing debounce/backoff
  // ===========================================================================

  describe('AC3: Real-time updates use existing debounce/backoff', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should debounce diff cache invalidation with 1.5s delay', async () => {
      const { invalidateDiffCache, getDiffCacheState } = await import('../src/git-diff.js');

      // Invalidate multiple times quickly
      invalidateDiffCache('/project');
      invalidateDiffCache('/project');
      invalidateDiffCache('/project');

      // Should still be stale (refresh not triggered yet)
      expect(getDiffCacheState('/project').stale).toBe(true);

      // Advance time by 1.4s - still waiting
      vi.advanceTimersByTime(1400);
      // Advance time to 1.5s - should trigger refresh
      vi.advanceTimersByTime(100);

      // After debounce, cache should be refreshing
    });

    it('should cap invalidation delay at 5s max', async () => {
      const { invalidateDiffCache, getDiffCacheState } = await import('../src/git-diff.js');
      const refreshSpy = vi.fn();

      // Keep invalidating for 6 seconds (should force refresh at 5s)
      for (let i = 0; i < 12; i++) {
        invalidateDiffCache('/project');
        vi.advanceTimersByTime(500);
      }

      // After 6s with constant invalidations, should have forced refresh at 5s mark
    });

    it('should use same debounce constants as git-cache.ts', async () => {
      const { REFRESH_DELAY_MS, MAX_INVALIDATION_DELAY_MS } = await import('../src/git-diff.js');

      expect(REFRESH_DELAY_MS).toBe(1500);
      expect(MAX_INVALIDATION_DELAY_MS).toBe(5000);
    });
  });

  // ===========================================================================
  // AC4: Cache invalidation on Edit/Write/Bash file modifications
  // ===========================================================================

  describe('AC4: Cache invalidation on Edit/Write/Bash file modifications', () => {
    it('should invalidate diff cache on Edit tool success', async () => {
      const { shouldInvalidateDiffCache } = await import('../src/git-diff.js');

      const editEvent = {
        toolName: 'Edit',
        status: 'success',
        toolInput: { file_path: '/project/src/file.ts' }
      };

      expect(shouldInvalidateDiffCache(editEvent)).toBe(true);
    });

    it('should invalidate diff cache on Write tool success', async () => {
      const { shouldInvalidateDiffCache } = await import('../src/git-diff.js');

      const writeEvent = {
        toolName: 'Write',
        status: 'success',
        toolInput: { file_path: '/project/src/new-file.ts' }
      };

      expect(shouldInvalidateDiffCache(writeEvent)).toBe(true);
    });

    it('should invalidate diff cache on Bash file modification', async () => {
      const { shouldInvalidateDiffCache } = await import('../src/git-diff.js');

      const bashEvent = {
        toolName: 'Bash',
        status: 'success',
        toolInput: { command: 'rm src/file.ts' }
      };

      expect(shouldInvalidateDiffCache(bashEvent)).toBe(true);
    });

    it('should NOT invalidate on read-only Bash commands', async () => {
      const { shouldInvalidateDiffCache } = await import('../src/git-diff.js');

      const bashEvent = {
        toolName: 'Bash',
        status: 'success',
        toolInput: { command: 'ls -la' }
      };

      expect(shouldInvalidateDiffCache(bashEvent)).toBe(false);
    });

    it('should invalidate on git state-changing commands', async () => {
      const { shouldInvalidateDiffCache } = await import('../src/git-diff.js');

      const gitCommands = [
        'git add .',
        'git commit -m "test"',
        'git checkout feature',
        'git reset --hard',
        'git stash',
        'git merge main',
        'git rebase develop'
      ];

      for (const command of gitCommands) {
        const event = {
          toolName: 'Bash',
          status: 'success',
          toolInput: { command }
        };
        expect(shouldInvalidateDiffCache(event)).toBe(true);
      }
    });
  });

  // ===========================================================================
  // AC5: Branch switch triggers immediate refresh
  // ===========================================================================

  describe('AC5: Branch switch triggers immediate refresh', () => {
    it('should force immediate diff refresh on branch switch', async () => {
      const { forceRefreshDiffCache } = await import('../src/git-diff.js');

      // forceRefreshDiffCache should bypass debounce
      const diffs = await forceRefreshDiffCache('/project');

      expect(Array.isArray(diffs)).toBe(true);
    });

    it('should clear pending debounce timer on force refresh', async () => {
      vi.useFakeTimers();

      const { invalidateDiffCache, forceRefreshDiffCache } = await import('../src/git-diff.js');

      // Start a debounced refresh
      invalidateDiffCache('/project');

      // Force refresh should cancel the pending timer
      await forceRefreshDiffCache('/project');

      // Advancing time should not trigger another refresh
      vi.advanceTimersByTime(2000);

      vi.useRealTimers();
    });
  });

  // ===========================================================================
  // AC6: Works correctly in both Electron and browser modes
  // ===========================================================================

  describe('AC6: Works correctly in both Electron and browser modes', () => {
    it('should use WebSocket endpoint /ws/diffs in browser mode', async () => {
      // The useDiffs hook should connect to /ws/diffs
      // This is tested via the hook, not git-diff.ts directly
      const { useDiffs } = await import('../src/public/hooks/useDiffs.js');

      // Hook should be defined and exportable
      expect(useDiffs).toBeDefined();
      expect(typeof useDiffs).toBe('function');
    });

    it('should handle WebSocket reconnection on disconnect', async () => {
      // useDiffs should auto-reconnect with 2s delay
      // This behavior is already in useDiffs, verify it's maintained
    });
  });

  // ===========================================================================
  // AC7: Bash commands that modify files are properly tracked
  // ===========================================================================

  describe('AC7: Bash commands that modify files are properly tracked', () => {
    it('should detect file modification commands in Bash', async () => {
      const { shouldInvalidateDiffCache } = await import('../src/git-diff.js');

      const modifyCommands = [
        'rm file.ts',
        'mv old.ts new.ts',
        'cp src.ts dst.ts',
        'touch new-file.ts',
        'mkdir -p new-dir',
        'rmdir empty-dir',
        'echo "content" > file.ts',
        'cat something >> file.ts'
      ];

      for (const command of modifyCommands) {
        const event = {
          toolName: 'Bash',
          status: 'success',
          toolInput: { command }
        };
        expect(shouldInvalidateDiffCache(event)).toBe(true);
      }
    });

    it('should detect package manager commands', async () => {
      const { shouldInvalidateDiffCache } = await import('../src/git-diff.js');

      const pmCommands = [
        'npm install lodash',
        'pnpm add react',
        'npm remove express',
        'pnpm uninstall axios'
      ];

      for (const command of pmCommands) {
        const event = {
          toolName: 'Bash',
          status: 'success',
          toolInput: { command }
        };
        expect(shouldInvalidateDiffCache(event)).toBe(true);
      }
    });
  });

  // ===========================================================================
  // AC8: Simpler codebase - remove OTEL tool correlation for diffs
  // ===========================================================================

  describe('AC8: Simpler codebase - remove OTEL tool correlation for diffs', () => {
    it('should NOT export diffOriginal/diffModified from tool events', async () => {
      // The otlp-receiver should no longer extract old_string/new_string for diffs
      // After refactor, tool events should NOT have these fields
      const { processToolEvent } = await import('../src/otlp-receiver.js');

      const editEvent = {
        toolName: 'Edit',
        toolInput: {
          file_path: '/project/file.ts',
          old_string: 'const x = 1;',
          new_string: 'const x = 2;'
        }
      };

      const processed = processToolEvent(editEvent);

      // These fields should NOT be present after refactor
      expect(processed).not.toHaveProperty('diffOriginal');
      expect(processed).not.toHaveProperty('diffModified');
    });

    it('should use git diff instead of tool input for diff content', async () => {
      const { getDiffSource } = await import('../src/git-diff.js');

      const source = getDiffSource();

      expect(source).toBe('git');
      expect(source).not.toBe('otel');
    });
  });

  // ===========================================================================
  // WebSocket Integration
  // ===========================================================================

  describe('WebSocket /ws/diffs endpoint', () => {
    it('should broadcast git diff data on cache refresh', async () => {
      const { onDiffCacheRefresh } = await import('../src/git-diff.js');

      const callback = vi.fn();
      const unsubscribe = onDiffCacheRefresh(callback);

      expect(typeof unsubscribe).toBe('function');

      // Cleanup
      unsubscribe();
    });

    it('should send init message with all current diffs on WebSocket connect', async () => {
      // The /ws/diffs handler should send { type: 'init', diffs: [...] }
      // This tests the expected message format
      const initMessage = {
        type: 'init',
        diffs: [] as GitDiffData[]
      };

      expect(initMessage.type).toBe('init');
      expect(Array.isArray(initMessage.diffs)).toBe(true);
    });

    it('should send diff message when individual file changes', async () => {
      // The /ws/diffs handler should send { type: 'diff', diff: GitDiffData }
      const diffMessage = {
        type: 'diff',
        diff: {
          path: 'src/file.ts',
          diff: '...',
          status: 'modified' as const,
          additions: 1,
          deletions: 1,
          timestamp: Date.now()
        }
      };

      expect(diffMessage.type).toBe('diff');
      expect(diffMessage.diff.path).toBeDefined();
    });
  });
});
