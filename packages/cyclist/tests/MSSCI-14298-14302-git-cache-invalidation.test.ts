/**
 * MSSCI-14298-14302: GitPanel shows dirty state after clean git operations
 *
 * Root cause: shouldInvalidateDiffCache (and shouldInvalidateGitCache) regex
 * failed to match `git -C <repo>` commands and chained commands.
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import { shouldInvalidateDiffCache } from '../src/git-diff.js';

// Helper to create a successful Bash tool event
function bashEvent(command: string) {
  return { toolName: 'Bash', success: true, input: command };
}

// Helper to create a failed Bash tool event
function failedBashEvent(command: string) {
  return { toolName: 'Bash', success: false, input: command };
}

describe('MSSCI-14298-14302: Git cache invalidation regex', () => {

  describe('git -C <repo> commands', () => {
    it('should invalidate on git -C <repo> add', () => {
      expect(shouldInvalidateDiffCache(bashEvent('git -C pennyfarthing add artifacts/'))).toBe(true);
    });

    it('should invalidate on git -C <repo> commit', () => {
      expect(shouldInvalidateDiffCache(bashEvent('git -C pennyfarthing commit -m "test"'))).toBe(true);
    });

    it('should invalidate on git -C <repo> checkout', () => {
      expect(shouldInvalidateDiffCache(bashEvent('git -C pennyfarthing checkout develop'))).toBe(true);
    });

    it('should invalidate on git -C <repo> merge', () => {
      expect(shouldInvalidateDiffCache(bashEvent('git -C pennyfarthing merge --no-ff foo'))).toBe(true);
    });

    it('should invalidate on git -C <repo> push', () => {
      expect(shouldInvalidateDiffCache(bashEvent('git -C pennyfarthing push origin develop'))).toBe(true);
    });

    it('should invalidate on git -C <repo> checkout -b', () => {
      expect(shouldInvalidateDiffCache(bashEvent('git -C pennyfarthing checkout -b fix/foo'))).toBe(true);
    });

    it('should invalidate on git -C <repo> reset', () => {
      expect(shouldInvalidateDiffCache(bashEvent('git -C pennyfarthing reset --hard HEAD~1'))).toBe(true);
    });

    it('should invalidate on git -C <repo> stash', () => {
      expect(shouldInvalidateDiffCache(bashEvent('git -C pennyfarthing stash'))).toBe(true);
    });
  });

  describe('chained commands', () => {
    it('should invalidate on && git merge', () => {
      expect(shouldInvalidateDiffCache(bashEvent('git checkout develop && git merge --no-ff foo'))).toBe(true);
    });

    it('should invalidate on cd && git add', () => {
      expect(shouldInvalidateDiffCache(bashEvent('cd pennyfarthing && git add .'))).toBe(true);
    });

    it('should invalidate on git -C checkout && git -C merge', () => {
      expect(shouldInvalidateDiffCache(bashEvent(
        'git -C pennyfarthing checkout develop && git -C pennyfarthing merge --no-ff chore/test'
      ))).toBe(true);
    });

    it('should invalidate on git add && git commit', () => {
      expect(shouldInvalidateDiffCache(bashEvent('git add . && git commit -m "test"'))).toBe(true);
    });
  });

  describe('plain git commands (no regression)', () => {
    it('should invalidate on git add', () => {
      expect(shouldInvalidateDiffCache(bashEvent('git add .'))).toBe(true);
    });

    it('should invalidate on git commit', () => {
      expect(shouldInvalidateDiffCache(bashEvent('git commit -m "test"'))).toBe(true);
    });

    it('should invalidate on git push', () => {
      expect(shouldInvalidateDiffCache(bashEvent('git push origin develop'))).toBe(true);
    });

    it('should invalidate on git checkout', () => {
      expect(shouldInvalidateDiffCache(bashEvent('git checkout -b feature/foo'))).toBe(true);
    });

    it('should invalidate on git merge', () => {
      expect(shouldInvalidateDiffCache(bashEvent('git merge --no-ff feature/foo'))).toBe(true);
    });

    it('should invalidate on git fetch', () => {
      expect(shouldInvalidateDiffCache(bashEvent('git fetch --quiet'))).toBe(true);
    });

    it('should invalidate on git stash', () => {
      expect(shouldInvalidateDiffCache(bashEvent('git stash'))).toBe(true);
    });

    it('should invalidate on git reset', () => {
      expect(shouldInvalidateDiffCache(bashEvent('git reset --hard HEAD~1'))).toBe(true);
    });

    it('should invalidate on git branch -D', () => {
      expect(shouldInvalidateDiffCache(bashEvent('git branch -D old-branch'))).toBe(true);
    });

    it('should invalidate on git rebase', () => {
      expect(shouldInvalidateDiffCache(bashEvent('git rebase main'))).toBe(true);
    });

    it('should invalidate on git cherry-pick', () => {
      expect(shouldInvalidateDiffCache(bashEvent('git cherry-pick abc123'))).toBe(true);
    });

    it('should invalidate on git revert', () => {
      expect(shouldInvalidateDiffCache(bashEvent('git revert HEAD'))).toBe(true);
    });

    it('should invalidate on git pull', () => {
      expect(shouldInvalidateDiffCache(bashEvent('git pull origin develop'))).toBe(true);
    });

    it('should invalidate on git restore', () => {
      expect(shouldInvalidateDiffCache(bashEvent('git restore file.ts'))).toBe(true);
    });

    it('should invalidate on git switch', () => {
      expect(shouldInvalidateDiffCache(bashEvent('git switch main'))).toBe(true);
    });

    it('should invalidate on git clean', () => {
      expect(shouldInvalidateDiffCache(bashEvent('git clean -fd'))).toBe(true);
    });
  });

  describe('read-only git commands (should NOT invalidate)', () => {
    it('should not invalidate on git status', () => {
      expect(shouldInvalidateDiffCache(bashEvent('git status'))).toBe(false);
    });

    it('should not invalidate on git log', () => {
      expect(shouldInvalidateDiffCache(bashEvent('git log --oneline'))).toBe(false);
    });

    it('should not invalidate on git diff', () => {
      expect(shouldInvalidateDiffCache(bashEvent('git diff HEAD'))).toBe(false);
    });

    it('should not invalidate on git show', () => {
      expect(shouldInvalidateDiffCache(bashEvent('git show HEAD:file.ts'))).toBe(false);
    });

    it('should not invalidate on git branch (list)', () => {
      expect(shouldInvalidateDiffCache(bashEvent('git branch'))).toBe(false);
    });

    it('should not invalidate on git remote', () => {
      expect(shouldInvalidateDiffCache(bashEvent('git remote -v'))).toBe(false);
    });

    it('should not invalidate on git -C status', () => {
      expect(shouldInvalidateDiffCache(bashEvent('git -C pennyfarthing status --short'))).toBe(false);
    });

    it('should not invalidate on git -C diff', () => {
      expect(shouldInvalidateDiffCache(bashEvent('git -C pennyfarthing diff HEAD'))).toBe(false);
    });

    it('should not invalidate on git -C log', () => {
      expect(shouldInvalidateDiffCache(bashEvent('git -C pennyfarthing log --oneline'))).toBe(false);
    });
  });

  describe('non-git tool events', () => {
    it('should invalidate on Edit', () => {
      expect(shouldInvalidateDiffCache({ toolName: 'Edit', success: true })).toBe(true);
    });

    it('should invalidate on Write', () => {
      expect(shouldInvalidateDiffCache({ toolName: 'Write', success: true })).toBe(true);
    });

    it('should not invalidate on Read', () => {
      expect(shouldInvalidateDiffCache({ toolName: 'Read', success: true })).toBe(false);
    });

    it('should not invalidate on Grep', () => {
      expect(shouldInvalidateDiffCache({ toolName: 'Grep', success: true })).toBe(false);
    });

    it('should not invalidate on failed Edit', () => {
      expect(shouldInvalidateDiffCache({ toolName: 'Edit', success: false })).toBe(false);
    });

    it('should not invalidate on failed Bash git command', () => {
      expect(shouldInvalidateDiffCache(failedBashEvent('git add .'))).toBe(false);
    });
  });

  describe('file-modifying commands', () => {
    it('should invalidate on rm', () => {
      expect(shouldInvalidateDiffCache(bashEvent('rm file.txt'))).toBe(true);
    });

    it('should invalidate on mv', () => {
      expect(shouldInvalidateDiffCache(bashEvent('mv old.ts new.ts'))).toBe(true);
    });

    it('should invalidate on cp', () => {
      expect(shouldInvalidateDiffCache(bashEvent('cp src.ts dest.ts'))).toBe(true);
    });

    it('should invalidate on npm install', () => {
      expect(shouldInvalidateDiffCache(bashEvent('npm install lodash'))).toBe(true);
    });

    it('should invalidate on pnpm add', () => {
      expect(shouldInvalidateDiffCache(bashEvent('pnpm add vitest'))).toBe(true);
    });
  });
});
