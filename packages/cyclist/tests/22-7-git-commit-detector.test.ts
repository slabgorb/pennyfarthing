/**
 * 22-7: Git Commit Detector Tests
 *
 * Tests for detecting git commit tool uses and removing
 * committed files from the Changed Files list.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock DiffViewer before importing git-commit-detector
vi.mock('../src/public/js/components/DiffViewer.js', () => ({
  removeDiffsForFiles: vi.fn(() => 0),
  getDiffs: vi.fn(() => []),
}));

describe('22-7: Git Commit Detector', () => {
  let gitCommitDetector: typeof import('../src/public/js/git-commit-detector.js');
  let mockDiffViewer: { removeDiffsForFiles: ReturnType<typeof vi.fn>; getDiffs: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.resetModules();
    mockDiffViewer = await vi.importMock('../src/public/js/components/DiffViewer.js');
    gitCommitDetector = await import('../src/public/js/git-commit-detector.js');
    gitCommitDetector.clearPendingCommits();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('isGitCommitToolUse', () => {
    it('should detect "git commit" Bash tool use', () => {
      const message = {
        type: 'tool_use',
        tool_name: 'Bash',
        tool_id: 'test-123',
        input: { command: 'git commit -m "test message"' },
      };
      expect(gitCommitDetector.isGitCommitToolUse(message)).toBe(true);
    });

    it('should detect "git commit" with heredoc', () => {
      const message = {
        type: 'tool_use',
        tool_name: 'Bash',
        tool_id: 'test-456',
        input: { command: 'git commit -m "$(cat <<\'EOF\'\nmultiline\nmessage\nEOF\n)"' },
      };
      expect(gitCommitDetector.isGitCommitToolUse(message)).toBe(true);
    });

    it('should not detect non-git Bash commands', () => {
      const message = {
        type: 'tool_use',
        tool_name: 'Bash',
        tool_id: 'test-789',
        input: { command: 'npm test' },
      };
      expect(gitCommitDetector.isGitCommitToolUse(message)).toBe(false);
    });

    it('should not detect git status as commit', () => {
      const message = {
        type: 'tool_use',
        tool_name: 'Bash',
        tool_id: 'test-abc',
        input: { command: 'git status' },
      };
      expect(gitCommitDetector.isGitCommitToolUse(message)).toBe(false);
    });

    it('should not detect non-Bash tools', () => {
      const message = {
        type: 'tool_use',
        tool_name: 'Edit',
        tool_id: 'test-def',
        input: { file_path: '/some/file.js' },
      };
      expect(gitCommitDetector.isGitCommitToolUse(message)).toBe(false);
    });

    it('should not detect non-tool_use messages', () => {
      const message = {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'git commit' }] },
      };
      expect(gitCommitDetector.isGitCommitToolUse(message)).toBe(false);
    });
  });

  describe('handleMessage', () => {
    it('should track git commit tool_use', () => {
      const toolUse = {
        type: 'tool_use',
        tool_name: 'Bash',
        tool_id: 'commit-123',
        input: { command: 'git commit -m "test"' },
      };

      // Should not throw and should track the commit
      gitCommitDetector.handleMessage(toolUse);

      // Verify by sending a matching tool_result
      mockDiffViewer.getDiffs.mockReturnValue([
        { filePath: '/path/to/file.js' },
      ]);

      const toolResult = {
        type: 'tool_result',
        tool_id: 'commit-123',
        output: '[main abc123] test\n 1 file changed, 10 insertions(+)',
        is_error: false,
      };

      gitCommitDetector.handleMessage(toolResult);

      // Should have tried to remove diffs (fallback since no file paths in output)
      expect(mockDiffViewer.removeDiffsForFiles).toHaveBeenCalled();
    });

    it('should not process failed commits', () => {
      const toolUse = {
        type: 'tool_use',
        tool_name: 'Bash',
        tool_id: 'commit-456',
        input: { command: 'git commit -m "test"' },
      };

      gitCommitDetector.handleMessage(toolUse);

      const toolResult = {
        type: 'tool_result',
        tool_id: 'commit-456',
        output: 'error: nothing to commit',
        is_error: true,
      };

      gitCommitDetector.handleMessage(toolResult);

      // Should not try to remove diffs on error
      expect(mockDiffViewer.removeDiffsForFiles).not.toHaveBeenCalled();
    });

    it('should extract file paths from create mode output', () => {
      const toolUse = {
        type: 'tool_use',
        tool_name: 'Bash',
        tool_id: 'commit-789',
        input: { command: 'git commit -m "add files"' },
      };

      gitCommitDetector.handleMessage(toolUse);

      const toolResult = {
        type: 'tool_result',
        tool_id: 'commit-789',
        output: `[main abc123] add files
 2 files changed, 50 insertions(+)
 create mode 100644 src/new-file.ts
 create mode 100644 src/another-file.ts`,
        is_error: false,
      };

      gitCommitDetector.handleMessage(toolResult);

      // Should extract the file paths from create mode lines
      expect(mockDiffViewer.removeDiffsForFiles).toHaveBeenCalledWith([
        'src/new-file.ts',
        'src/another-file.ts',
      ]);
    });

    it('should fallback to removing all diffs when no files extracted', () => {
      const toolUse = {
        type: 'tool_use',
        tool_name: 'Bash',
        tool_id: 'commit-abc',
        input: { command: 'git commit -m "update"' },
      };

      gitCommitDetector.handleMessage(toolUse);

      mockDiffViewer.getDiffs.mockReturnValue([
        { filePath: '/path/to/file1.js' },
        { filePath: '/path/to/file2.js' },
      ]);

      const toolResult = {
        type: 'tool_result',
        tool_id: 'commit-abc',
        output: '[main def456] update\n 2 files changed, 20 insertions(+)',
        is_error: false,
      };

      gitCommitDetector.handleMessage(toolResult);

      // Should fallback to removing all current diffs
      expect(mockDiffViewer.removeDiffsForFiles).toHaveBeenCalledWith([
        '/path/to/file1.js',
        '/path/to/file2.js',
      ]);
    });

    it('should ignore unrelated tool_result messages', () => {
      const toolResult = {
        type: 'tool_result',
        tool_id: 'untracked-123',
        output: 'some output',
        is_error: false,
      };

      gitCommitDetector.handleMessage(toolResult);

      expect(mockDiffViewer.removeDiffsForFiles).not.toHaveBeenCalled();
    });

    it('should ignore assistant messages', () => {
      const message = {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'I will run git commit' }] },
      };

      gitCommitDetector.handleMessage(message);

      expect(mockDiffViewer.removeDiffsForFiles).not.toHaveBeenCalled();
    });
  });

  describe('clearPendingCommits', () => {
    it('should clear tracked commits', () => {
      const toolUse = {
        type: 'tool_use',
        tool_name: 'Bash',
        tool_id: 'commit-clear',
        input: { command: 'git commit -m "test"' },
      };

      gitCommitDetector.handleMessage(toolUse);
      gitCommitDetector.clearPendingCommits();

      // Now send tool_result - should not be processed
      const toolResult = {
        type: 'tool_result',
        tool_id: 'commit-clear',
        output: '[main xyz] test\n create mode 100644 file.js',
        is_error: false,
      };

      gitCommitDetector.handleMessage(toolResult);

      expect(mockDiffViewer.removeDiffsForFiles).not.toHaveBeenCalled();
    });
  });
});
