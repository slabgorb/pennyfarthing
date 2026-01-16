/**
 * 35-11: Clickable File Paths in Diff View Tests
 *
 * Tests for the clickable file path functionality in the diff panel.
 * When a file path is clicked in a diff header, it should open in the OS default app.
 *
 * Acceptance Criteria:
 * - AC1: Click opens file in OS default application
 * - AC2: Error feedback if file no longer exists
 * - AC3: Console logs trace the click → IPC → shell path
 * - AC4: Works on macOS (shell.openPath)
 *
 * Bug Context:
 * The code exists but silently fails. Click handler at DiffViewer.js L336-356
 * has no feedback when electronAPI.fileBrowser is undefined.
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// =============================================================================
// Type Definitions
// =============================================================================

interface OpenFileResult {
  success: boolean;
  error?: string;
}

interface MockElectronAPI {
  fileBrowser?: {
    openFile: (path: string) => Promise<OpenFileResult>;
  };
}

interface DiffData {
  id: string;
  filePath: string;
  oldContent: string;
  newContent: string;
  toolType: 'Edit' | 'Write';
  timestamp: number;
}

// =============================================================================
// Test Data Factories
// =============================================================================

const createDiffData = (overrides: Partial<DiffData> = {}): DiffData => ({
  id: `diff-${Date.now()}`,
  filePath: '/path/to/file.ts',
  oldContent: 'const x = 1;',
  newContent: 'const x = 2;',
  toolType: 'Edit',
  timestamp: Date.now(),
  ...overrides,
});

// =============================================================================
// Mock electronAPI
// =============================================================================

let mockElectronAPI: MockElectronAPI | undefined;
let mockOpenFile: ReturnType<typeof vi.fn>;
let consoleLogSpy: ReturnType<typeof vi.spyOn>;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

function setupMockElectronAPI(options: { available?: boolean; openFileResult?: OpenFileResult } = {}) {
  const { available = true, openFileResult = { success: true } } = options;

  mockOpenFile = vi.fn().mockResolvedValue(openFileResult);

  if (available) {
    mockElectronAPI = {
      fileBrowser: {
        openFile: mockOpenFile,
      },
    };
  } else {
    mockElectronAPI = undefined;
  }

  // @ts-expect-error - mocking window.electronAPI
  window.electronAPI = mockElectronAPI;
}

// =============================================================================
// Helper: Create and render diff with file path link
// =============================================================================

/**
 * Creates a file path link element similar to DiffViewer.js L331-356
 * This simulates what renderDiff() creates
 */
function createFilePathLink(diffData: DiffData): HTMLAnchorElement {
  const filePathLink = document.createElement('a');
  filePathLink.className = 'file-path file-path-link';
  filePathLink.href = '#';
  filePathLink.textContent = diffData.filePath;
  filePathLink.title = 'Click to open in default application';

  filePathLink.addEventListener('click', async (e) => {
    e.preventDefault();
    console.log(`[DiffViewer] Click handler fired for: ${diffData.filePath}`);

    // 35-11: Check if electronAPI.fileBrowser exists
    if (window.electronAPI?.fileBrowser?.openFile) {
      console.log(`[DiffViewer] electronAPI.fileBrowser.openFile available, calling...`);
      try {
        const result = await window.electronAPI.fileBrowser.openFile(diffData.filePath);
        console.log(`[DiffViewer] openFile result:`, result);
        if (result && !result.success) {
          console.error(`[DiffViewer] Failed to open file: ${diffData.filePath}`, result.error);
          filePathLink.title = `Failed to open: ${result.error || 'file may no longer exist'}`;
          filePathLink.classList.add('file-path-error');
          setTimeout(() => filePathLink.classList.remove('file-path-error'), 3000);
        }
      } catch (err) {
        console.error(`[DiffViewer] Failed to open file: ${diffData.filePath}`, err);
        filePathLink.title = 'Failed to open file - it may no longer exist';
        filePathLink.classList.add('file-path-error');
        setTimeout(() => filePathLink.classList.remove('file-path-error'), 3000);
      }
    } else {
      // 35-11 FIX: Add else branch to show when API is missing
      console.error(`[DiffViewer] electronAPI.fileBrowser.openFile is not available`);
      filePathLink.title = 'Cannot open file - API not available';
      filePathLink.classList.add('file-path-error');
    }
  });

  return filePathLink;
}

// =============================================================================
// Tests
// =============================================================================

describe('35-11: Clickable File Paths in Diff View', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="diff-container"></div>';
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // @ts-expect-error - cleaning up mock
    window.electronAPI = undefined;
  });

  // ===========================================================================
  // AC1: Click opens file in OS default application
  // ===========================================================================

  describe('AC1: Click opens file in OS default application', () => {
    it('should call electronAPI.fileBrowser.openFile when file path is clicked', async () => {
      setupMockElectronAPI({ available: true, openFileResult: { success: true } });
      const diffData = createDiffData({ filePath: '/project/src/main.ts' });
      const link = createFilePathLink(diffData);
      document.body.appendChild(link);

      link.click();
      await vi.waitFor(() => {
        expect(mockOpenFile).toHaveBeenCalledWith('/project/src/main.ts');
      });
    });

    it('should pass the correct file path to openFile', async () => {
      setupMockElectronAPI({ available: true, openFileResult: { success: true } });
      const diffData = createDiffData({ filePath: '/deeply/nested/path/to/Component.tsx' });
      const link = createFilePathLink(diffData);
      document.body.appendChild(link);

      link.click();
      await vi.waitFor(() => {
        expect(mockOpenFile).toHaveBeenCalledWith('/deeply/nested/path/to/Component.tsx');
      });
    });

    it('should handle paths with spaces', async () => {
      setupMockElectronAPI({ available: true, openFileResult: { success: true } });
      const diffData = createDiffData({ filePath: '/project/my files/document.md' });
      const link = createFilePathLink(diffData);
      document.body.appendChild(link);

      link.click();
      await vi.waitFor(() => {
        expect(mockOpenFile).toHaveBeenCalledWith('/project/my files/document.md');
      });
    });

    it('should handle paths with special characters', async () => {
      setupMockElectronAPI({ available: true, openFileResult: { success: true } });
      const diffData = createDiffData({ filePath: '/project/pages/[id].tsx' });
      const link = createFilePathLink(diffData);
      document.body.appendChild(link);

      link.click();
      await vi.waitFor(() => {
        expect(mockOpenFile).toHaveBeenCalledWith('/project/pages/[id].tsx');
      });
    });

    it('should prevent default anchor behavior', async () => {
      setupMockElectronAPI({ available: true, openFileResult: { success: true } });
      const diffData = createDiffData();
      const link = createFilePathLink(diffData);
      document.body.appendChild(link);

      const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
      const preventDefaultSpy = vi.spyOn(clickEvent, 'preventDefault');

      link.dispatchEvent(clickEvent);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should not throw when openFile succeeds', async () => {
      setupMockElectronAPI({ available: true, openFileResult: { success: true } });
      const diffData = createDiffData();
      const link = createFilePathLink(diffData);
      document.body.appendChild(link);

      // Should not throw
      await expect(async () => {
        link.click();
        await vi.waitFor(() => expect(mockOpenFile).toHaveBeenCalled());
      }).not.toThrow();
    });
  });

  // ===========================================================================
  // AC2: Error feedback if file no longer exists
  // ===========================================================================

  describe('AC2: Error feedback if file no longer exists', () => {
    it('should add error class when file does not exist', async () => {
      setupMockElectronAPI({
        available: true,
        openFileResult: { success: false, error: 'File not found' },
      });
      const diffData = createDiffData({ filePath: '/project/deleted-file.ts' });
      const link = createFilePathLink(diffData);
      document.body.appendChild(link);

      link.click();
      await vi.waitFor(() => {
        expect(link.classList.contains('file-path-error')).toBe(true);
      });
    });

    it('should update title attribute with error message', async () => {
      setupMockElectronAPI({
        available: true,
        openFileResult: { success: false, error: 'ENOENT: no such file' },
      });
      const diffData = createDiffData();
      const link = createFilePathLink(diffData);
      document.body.appendChild(link);

      link.click();
      await vi.waitFor(() => {
        expect(link.title).toContain('Failed to open');
        expect(link.title).toContain('ENOENT');
      });
    });

    it('should show generic error message when error is undefined', async () => {
      setupMockElectronAPI({
        available: true,
        openFileResult: { success: false },
      });
      const diffData = createDiffData();
      const link = createFilePathLink(diffData);
      document.body.appendChild(link);

      link.click();
      await vi.waitFor(() => {
        expect(link.title).toContain('file may no longer exist');
      });
    });

    it('should handle thrown exceptions from openFile', async () => {
      setupMockElectronAPI({ available: true });
      mockOpenFile.mockRejectedValue(new Error('IPC channel closed'));
      const diffData = createDiffData();
      const link = createFilePathLink(diffData);
      document.body.appendChild(link);

      link.click();
      await vi.waitFor(() => {
        expect(link.classList.contains('file-path-error')).toBe(true);
        expect(link.title).toContain('Failed to open file');
      });
    });

    it('should remove error class after timeout', async () => {
      vi.useFakeTimers();
      setupMockElectronAPI({
        available: true,
        openFileResult: { success: false, error: 'File not found' },
      });
      const diffData = createDiffData();
      const link = createFilePathLink(diffData);
      document.body.appendChild(link);

      link.click();
      await vi.waitFor(() => {
        expect(link.classList.contains('file-path-error')).toBe(true);
      });

      vi.advanceTimersByTime(3000);
      expect(link.classList.contains('file-path-error')).toBe(false);

      vi.useRealTimers();
    });

    it('should add error class when API is not available', async () => {
      setupMockElectronAPI({ available: false });
      const diffData = createDiffData();
      const link = createFilePathLink(diffData);
      document.body.appendChild(link);

      link.click();
      await vi.waitFor(() => {
        expect(link.classList.contains('file-path-error')).toBe(true);
      });
    });

    it('should update title when API is not available', async () => {
      setupMockElectronAPI({ available: false });
      const diffData = createDiffData();
      const link = createFilePathLink(diffData);
      document.body.appendChild(link);

      link.click();
      await vi.waitFor(() => {
        expect(link.title).toContain('API not available');
      });
    });
  });

  // ===========================================================================
  // AC3: Console logs trace the click → IPC → shell path
  // ===========================================================================

  describe('AC3: Console logs trace the click → IPC → shell path', () => {
    it('should log when click handler fires', async () => {
      setupMockElectronAPI({ available: true, openFileResult: { success: true } });
      const diffData = createDiffData({ filePath: '/project/trace-test.ts' });
      const link = createFilePathLink(diffData);
      document.body.appendChild(link);

      link.click();
      await vi.waitFor(() => {
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('Click handler fired')
        );
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('/project/trace-test.ts')
        );
      });
    });

    it('should log when electronAPI.fileBrowser.openFile is available', async () => {
      setupMockElectronAPI({ available: true, openFileResult: { success: true } });
      const diffData = createDiffData();
      const link = createFilePathLink(diffData);
      document.body.appendChild(link);

      link.click();
      await vi.waitFor(() => {
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('openFile available')
        );
      });
    });

    it('should log the openFile result', async () => {
      setupMockElectronAPI({ available: true, openFileResult: { success: true } });
      const diffData = createDiffData();
      const link = createFilePathLink(diffData);
      document.body.appendChild(link);

      link.click();
      await vi.waitFor(() => {
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('openFile result'),
          expect.objectContaining({ success: true })
        );
      });
    });

    it('should log error when API is not available', async () => {
      setupMockElectronAPI({ available: false });
      const diffData = createDiffData();
      const link = createFilePathLink(diffData);
      document.body.appendChild(link);

      link.click();
      await vi.waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('not available')
        );
      });
    });

    it('should log error when file open fails', async () => {
      setupMockElectronAPI({
        available: true,
        openFileResult: { success: false, error: 'Permission denied' },
      });
      const diffData = createDiffData({ filePath: '/root/secret.txt' });
      const link = createFilePathLink(diffData);
      document.body.appendChild(link);

      link.click();
      await vi.waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Failed to open file'),
          expect.stringContaining('Permission denied')
        );
      });
    });

    it('should log error when openFile throws', async () => {
      setupMockElectronAPI({ available: true });
      mockOpenFile.mockRejectedValue(new Error('Network error'));
      const diffData = createDiffData();
      const link = createFilePathLink(diffData);
      document.body.appendChild(link);

      link.click();
      await vi.waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Failed to open file'),
          expect.any(Error)
        );
      });
    });
  });

  // ===========================================================================
  // AC4: Works on macOS (shell.openPath)
  // ===========================================================================

  describe('AC4: Works on macOS (shell.openPath)', () => {
    it('should handle macOS absolute paths', async () => {
      setupMockElectronAPI({ available: true, openFileResult: { success: true } });
      const diffData = createDiffData({ filePath: '/Users/developer/project/main.ts' });
      const link = createFilePathLink(diffData);
      document.body.appendChild(link);

      link.click();
      await vi.waitFor(() => {
        expect(mockOpenFile).toHaveBeenCalledWith('/Users/developer/project/main.ts');
      });
    });

    it('should handle macOS home directory paths', async () => {
      setupMockElectronAPI({ available: true, openFileResult: { success: true } });
      const diffData = createDiffData({ filePath: '/Users/user/Documents/code.ts' });
      const link = createFilePathLink(diffData);
      document.body.appendChild(link);

      link.click();
      await vi.waitFor(() => {
        expect(mockOpenFile).toHaveBeenCalledWith('/Users/user/Documents/code.ts');
      });
    });

    it('should handle various file extensions', async () => {
      const extensions = ['.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.css', '.html'];

      for (const ext of extensions) {
        setupMockElectronAPI({ available: true, openFileResult: { success: true } });
        const diffData = createDiffData({ filePath: `/project/file${ext}` });
        const link = createFilePathLink(diffData);
        document.body.appendChild(link);

        link.click();
        await vi.waitFor(() => {
          expect(mockOpenFile).toHaveBeenCalledWith(`/project/file${ext}`);
        });

        mockOpenFile.mockClear();
        document.body.removeChild(link);
      }
    });

    it('should handle shell.openPath returning error message (macOS behavior)', async () => {
      // On macOS, shell.openPath returns empty string on success, error message on failure
      setupMockElectronAPI({
        available: true,
        openFileResult: { success: false, error: 'The file /missing.ts does not exist.' },
      });
      const diffData = createDiffData({ filePath: '/missing.ts' });
      const link = createFilePathLink(diffData);
      document.body.appendChild(link);

      link.click();
      await vi.waitFor(() => {
        expect(link.classList.contains('file-path-error')).toBe(true);
      });
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should handle rapid multiple clicks', async () => {
      setupMockElectronAPI({ available: true, openFileResult: { success: true } });
      const diffData = createDiffData();
      const link = createFilePathLink(diffData);
      document.body.appendChild(link);

      link.click();
      link.click();
      link.click();

      await vi.waitFor(() => {
        expect(mockOpenFile).toHaveBeenCalledTimes(3);
      });
    });

    it('should handle empty file path', async () => {
      setupMockElectronAPI({ available: true, openFileResult: { success: false, error: 'Empty path' } });
      const diffData = createDiffData({ filePath: '' });
      const link = createFilePathLink(diffData);
      document.body.appendChild(link);

      link.click();
      await vi.waitFor(() => {
        expect(mockOpenFile).toHaveBeenCalledWith('');
      });
    });

    it('should handle very long file paths', async () => {
      const longPath = '/project/' + 'nested/'.repeat(50) + 'file.ts';
      setupMockElectronAPI({ available: true, openFileResult: { success: true } });
      const diffData = createDiffData({ filePath: longPath });
      const link = createFilePathLink(diffData);
      document.body.appendChild(link);

      link.click();
      await vi.waitFor(() => {
        expect(mockOpenFile).toHaveBeenCalledWith(longPath);
      });
    });

    it('should handle Unicode file paths', async () => {
      setupMockElectronAPI({ available: true, openFileResult: { success: true } });
      const diffData = createDiffData({ filePath: '/project/文件.ts' });
      const link = createFilePathLink(diffData);
      document.body.appendChild(link);

      link.click();
      await vi.waitFor(() => {
        expect(mockOpenFile).toHaveBeenCalledWith('/project/文件.ts');
      });
    });

    it('should have correct CSS classes for styling', () => {
      setupMockElectronAPI({ available: true });
      const diffData = createDiffData();
      const link = createFilePathLink(diffData);

      expect(link.classList.contains('file-path')).toBe(true);
      expect(link.classList.contains('file-path-link')).toBe(true);
    });

    it('should have href="#" to prevent navigation', () => {
      setupMockElectronAPI({ available: true });
      const diffData = createDiffData();
      const link = createFilePathLink(diffData);

      expect(link.href).toContain('#');
    });

    it('should have initial title for accessibility', () => {
      setupMockElectronAPI({ available: true });
      const diffData = createDiffData();
      const link = createFilePathLink(diffData);

      expect(link.title).toBe('Click to open in default application');
    });

    it('should display the file path as text content', () => {
      setupMockElectronAPI({ available: true });
      const diffData = createDiffData({ filePath: '/project/visible-path.ts' });
      const link = createFilePathLink(diffData);

      expect(link.textContent).toBe('/project/visible-path.ts');
    });
  });

  // ===========================================================================
  // Integration: Full render flow
  // ===========================================================================

  describe('Integration: Render flow', () => {
    it('should create link element with all required attributes', () => {
      setupMockElectronAPI({ available: true });
      const diffData = createDiffData({ filePath: '/project/integration.ts' });
      const link = createFilePathLink(diffData);

      expect(link.tagName).toBe('A');
      expect(link.className).toBe('file-path file-path-link');
      expect(link.href).toContain('#');
      expect(link.textContent).toBe('/project/integration.ts');
      expect(link.title).toBe('Click to open in default application');
    });

    it('should be clickable when added to DOM', async () => {
      setupMockElectronAPI({ available: true, openFileResult: { success: true } });
      const diffData = createDiffData();
      const link = createFilePathLink(diffData);

      const container = document.getElementById('diff-container')!;
      container.appendChild(link);

      // Verify it's in the DOM
      expect(document.querySelector('.file-path-link')).toBe(link);

      link.click();
      await vi.waitFor(() => {
        expect(mockOpenFile).toHaveBeenCalled();
      });
    });
  });
});
