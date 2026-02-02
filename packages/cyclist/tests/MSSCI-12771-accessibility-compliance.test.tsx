/**
 * Story MSSCI-12771: Accessibility Compliance
 *
 * WCAG AA compliance tests for Cyclist UI components.
 *
 * Acceptance Criteria:
 * AC1: ARIA labels on all interactive elements
 * AC2: Visible focus indicators on focusable elements
 * AC3: Logical tab order through UI
 * AC4: 4.5:1 contrast ratio compliance
 * AC5: prefers-reduced-motion support
 * AC6: Screen reader announcements for streaming content
 * AC7: Skip links for keyboard navigation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Get computed contrast ratio between foreground and background colors
 * Returns a number >= 1 (higher = more contrast)
 */
function getContrastRatio(fg: string, bg: string): number {
  // Parse RGB values
  const parseColor = (color: string): [number, number, number] => {
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
    }
    // Default to black if unparseable
    return [0, 0, 0];
  };

  const getLuminance = ([r, g, b]: [number, number, number]): number => {
    const [rs, gs, bs] = [r, g, b].map((c) => {
      c = c / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  };

  const l1 = getLuminance(parseColor(fg));
  const l2 = getLuminance(parseColor(bg));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check if an element has a visible focus indicator
 */
function hasFocusIndicator(element: Element): boolean {
  const styles = window.getComputedStyle(element);
  const outline = styles.outline;
  const boxShadow = styles.boxShadow;
  const border = styles.border;

  // Check for visible outline (not 'none' or '0px')
  const hasOutline = outline && !outline.includes('none') && !outline.startsWith('0px');

  // Check for box-shadow (commonly used for focus rings)
  const hasBoxShadow = boxShadow && boxShadow !== 'none';

  // Check for visible border change
  const hasBorder = border && !border.includes('0px');

  return hasOutline || hasBoxShadow || hasBorder;
}

// =============================================================================
// Mock Setup
// =============================================================================

// Mock electronAPI for component rendering
const mockElectronAPI = {
  claude: {
    abort: vi.fn(),
    clear: vi.fn(),
    interrupt: vi.fn(),
    onMessage: vi.fn(),
    onComplete: vi.fn(),
    onError: vi.fn(),
  },
  messages: {
    clear: vi.fn(),
  },
  config: {
    get: vi.fn(() => Promise.resolve({})),
    set: vi.fn(() => Promise.resolve()),
  },
  wheelhub: {
    onUpdate: vi.fn(),
  },
};

Object.defineProperty(window, 'electronAPI', {
  value: mockElectronAPI,
  writable: true,
});

// Mock matchMedia for prefers-reduced-motion
const mockMatchMedia = vi.fn();
Object.defineProperty(window, 'matchMedia', {
  value: mockMatchMedia,
  writable: true,
});

// =============================================================================
// AC1: ARIA labels on all interactive elements
// =============================================================================

describe('AC1: ARIA labels on all interactive elements', () => {
  describe('ControlBar buttons', () => {
    it('should have aria-label on Stop button', async () => {
      const { ControlBar } = await import('../src/public/components/ControlBar');
      render(<ControlBar isRunning={true} onStop={vi.fn()} onReset={vi.fn()} />);

      const stopButton = screen.getByTestId('stop-button');
      expect(stopButton).toHaveAttribute('aria-label');
      expect(stopButton.getAttribute('aria-label')).not.toBe('');
    });

    it('should have aria-label on Reset button', async () => {
      const { ControlBar } = await import('../src/public/components/ControlBar');
      render(<ControlBar isRunning={false} onStop={vi.fn()} onReset={vi.fn()} />);

      const resetButton = screen.getByTestId('reset-button');
      expect(resetButton).toHaveAttribute('aria-label');
      expect(resetButton.getAttribute('aria-label')).not.toBe('');
    });

    it('should have aria-label on Bell Mode toggle', async () => {
      const { ControlBar } = await import('../src/public/components/ControlBar');
      render(<ControlBar isRunning={false} onStop={vi.fn()} onReset={vi.fn()} />);

      const bellToggle = screen.getByTestId('bell-mode-toggle');
      expect(bellToggle).toHaveAttribute('aria-label');
    });
  });

  describe('ModeSwitch buttons', () => {
    it('should have aria-label on each mode option', async () => {
      const { ModeSwitch } = await import('../src/public/components/ModeSwitch');
      render(<ModeSwitch />);

      const modeButtons = screen.getAllByRole('button');
      modeButtons.forEach((button) => {
        expect(button).toHaveAttribute('aria-label');
      });
    });

    it('should have aria-pressed indicating current selection', async () => {
      const { ModeSwitch } = await import('../src/public/components/ModeSwitch');
      render(<ModeSwitch mode="manual" />);

      const manualButton = screen.getByRole('button', { name: /manual/i });
      expect(manualButton).toHaveAttribute('aria-pressed', 'true');
    });

    it('should have role="group" with aria-label on container', async () => {
      const { ModeSwitch } = await import('../src/public/components/ModeSwitch');
      render(<ModeSwitch />);

      const container = screen.getByRole('group');
      expect(container).toHaveAttribute('aria-label', 'Permission mode');
    });
  });

  describe('FileTree interactive elements', () => {
    it('should have aria-label on expand/collapse buttons', async () => {
      const { FileTree } = await import('../src/public/components/FileTree');
      const files = [
        { path: 'src/components/Button.tsx', status: 'modified' as const },
      ];
      render(<FileTree files={files} />);

      const expandButtons = screen.getAllByRole('button', { name: /expand|collapse/i });
      expandButtons.forEach((button) => {
        expect(button).toHaveAttribute('aria-label');
      });
    });

    it('should have aria-label on file items describing name and status', async () => {
      const { FileTree } = await import('../src/public/components/FileTree');
      const files = [
        { path: 'src/Button.tsx', status: 'created' as const },
      ];
      render(<FileTree files={files} />);

      const fileItem = screen.getByRole('treeitem');
      expect(fileItem).toHaveAttribute('aria-label');
      expect(fileItem.getAttribute('aria-label')).toMatch(/Button\.tsx/);
      expect(fileItem.getAttribute('aria-label')).toMatch(/created/i);
    });
  });

  describe('CommandPalette', () => {
    it('should have aria-label on search input', async () => {
      const { CommandPaletteProvider, CommandPalette } = await import(
        '../src/public/components/CommandPalette'
      );
      render(
        <CommandPaletteProvider>
          <CommandPalette isOpen={true} onClose={vi.fn()} />
        </CommandPaletteProvider>
      );

      const searchInput = screen.getByRole('combobox');
      expect(searchInput).toHaveAttribute('aria-label', 'Search commands');
    });

    it('should have aria-labelledby linking input to results', async () => {
      const { CommandPaletteProvider, CommandPalette } = await import(
        '../src/public/components/CommandPalette'
      );
      render(
        <CommandPaletteProvider>
          <CommandPalette isOpen={true} onClose={vi.fn()} />
        </CommandPaletteProvider>
      );

      const searchInput = screen.getByRole('combobox');
      const resultsId = searchInput.getAttribute('aria-controls');
      expect(resultsId).toBeTruthy();
      expect(document.getElementById(resultsId!)).toBeInTheDocument();
    });

    it('should have role="dialog" with aria-modal on overlay', async () => {
      const { CommandPaletteProvider, CommandPalette } = await import(
        '../src/public/components/CommandPalette'
      );
      render(
        <CommandPaletteProvider>
          <CommandPalette isOpen={true} onClose={vi.fn()} />
        </CommandPaletteProvider>
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-label', 'Command palette');
    });
  });

  describe('QuickActions buttons', () => {
    it('should have aria-label on dynamically generated action buttons', async () => {
      const { QuickActions } = await import('../src/public/components/QuickActions');
      const actions = [
        { label: 'Continue', command: '/dev' },
        { label: 'Review', command: '/reviewer' },
      ];
      render(<QuickActions actions={actions} onAction={vi.fn()} />);

      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).toHaveAttribute('aria-label');
      });
    });
  });

  describe('DiffViewer', () => {
    it('should have aria-label describing the diff content', async () => {
      const { DiffViewer } = await import('../src/public/components/DiffViewer');
      render(<DiffViewer filePath="src/Button.tsx" oldContent="" newContent="new" />);

      const diffContainer = screen.getByRole('region');
      expect(diffContainer).toHaveAttribute('aria-label');
      expect(diffContainer.getAttribute('aria-label')).toMatch(/diff|changes/i);
    });
  });
});

// =============================================================================
// AC2: Visible focus indicators on focusable elements
// =============================================================================

describe('AC2: Visible focus indicators on focusable elements', () => {
  it('should show focus indicator on buttons when focused', async () => {
    const { ControlBar } = await import('../src/public/components/ControlBar');
    render(<ControlBar isRunning={true} onStop={vi.fn()} onReset={vi.fn()} />);

    const stopButton = screen.getByTestId('stop-button');
    stopButton.focus();

    // Check for visible focus style
    expect(stopButton).toHaveClass('focused');
  });

  it('should show focus ring with sufficient contrast', async () => {
    const { ControlBar } = await import('../src/public/components/ControlBar');
    render(<ControlBar isRunning={true} onStop={vi.fn()} onReset={vi.fn()} />);

    const stopButton = screen.getByTestId('stop-button');
    stopButton.focus();

    // Focus ring should be visible (not transparent or same as background)
    const styles = window.getComputedStyle(stopButton);
    expect(styles.outlineColor).not.toBe('transparent');
    expect(styles.outlineWidth).not.toBe('0px');
  });

  it('should show focus indicator on ModeSwitch options', async () => {
    const { ModeSwitch } = await import('../src/public/components/ModeSwitch');
    render(<ModeSwitch />);

    const buttons = screen.getAllByRole('button');
    buttons[0].focus();

    expect(buttons[0]).toHaveClass('focused');
  });

  it('should show focus indicator on FileTree items', async () => {
    const { FileTree } = await import('../src/public/components/FileTree');
    const files = [{ path: 'README.md', status: 'modified' as const }];
    render(<FileTree files={files} />);

    const fileItem = screen.getByRole('treeitem');
    fileItem.focus();

    expect(fileItem).toHaveClass('focused');
  });

  it('should show focus indicator on CommandPalette search input', async () => {
    const { CommandPaletteProvider, CommandPalette } = await import(
      '../src/public/components/CommandPalette'
    );
    render(
      <CommandPaletteProvider>
        <CommandPalette isOpen={true} onClose={vi.fn()} />
      </CommandPaletteProvider>
    );

    const searchInput = screen.getByRole('combobox');
    searchInput.focus();

    const styles = window.getComputedStyle(searchInput);
    // Should have visible focus outline or box-shadow
    expect(
      styles.outline !== 'none' ||
      styles.boxShadow !== 'none' ||
      searchInput.classList.contains('focused')
    ).toBe(true);
  });

  it('should maintain focus visibility when navigating with keyboard', async () => {
    const { FileTree } = await import('../src/public/components/FileTree');
    const files = [
      { path: 'file1.ts', status: 'modified' as const },
      { path: 'file2.ts', status: 'created' as const },
    ];
    render(<FileTree files={files} />);

    const items = screen.getAllByRole('treeitem');
    items[0].focus();

    // Press arrow down
    fireEvent.keyDown(items[0], { key: 'ArrowDown' });

    // Second item should now have focus indicator
    expect(items[1]).toHaveClass('focused');
  });

  it('should have focus-visible polyfill or :focus-visible support', async () => {
    const { ControlBar } = await import('../src/public/components/ControlBar');
    render(<ControlBar isRunning={false} onStop={vi.fn()} onReset={vi.fn()} />);

    const resetButton = screen.getByTestId('reset-button');
    // Simulate keyboard focus (not mouse click)
    fireEvent.keyDown(resetButton, { key: 'Tab' });
    resetButton.focus();

    // Should show focus indicator for keyboard users
    expect(resetButton.matches(':focus-visible') || resetButton.classList.contains('focus-visible')).toBe(true);
  });
});

// =============================================================================
// AC3: Logical tab order through UI
// =============================================================================

describe('AC3: Logical tab order through UI', () => {
  it('should have positive tabindex on interactive elements', async () => {
    const { ControlBar } = await import('../src/public/components/ControlBar');
    render(<ControlBar isRunning={true} onStop={vi.fn()} onReset={vi.fn()} />);

    const stopButton = screen.getByTestId('stop-button');
    const resetButton = screen.getByTestId('reset-button');

    expect(stopButton).not.toHaveAttribute('tabindex', '-1');
    expect(resetButton).not.toHaveAttribute('tabindex', '-1');
  });

  it('should follow visual order in ModeSwitch (Plan → Manual → Accept)', async () => {
    const { ModeSwitch } = await import('../src/public/components/ModeSwitch');
    render(<ModeSwitch />);

    const buttons = screen.getAllByRole('button');
    const labels = buttons.map((b) => b.textContent);

    expect(labels).toEqual(['Plan', 'Manual', 'Accept']);

    // Tab order should match visual order
    buttons.forEach((button, index) => {
      const tabIndex = parseInt(button.getAttribute('tabindex') || '0');
      expect(tabIndex).toBeGreaterThanOrEqual(0);
    });
  });

  it('should trap focus within CommandPalette when open', async () => {
    const { CommandPaletteProvider, CommandPalette } = await import(
      '../src/public/components/CommandPalette'
    );
    render(
      <CommandPaletteProvider>
        <CommandPalette isOpen={true} onClose={vi.fn()} />
      </CommandPaletteProvider>
    );

    const dialog = screen.getByRole('dialog');
    const focusableElements = dialog.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    expect(focusableElements.length).toBeGreaterThan(0);

    // First focusable element should receive focus automatically
    expect(document.activeElement).toBe(focusableElements[0]);
  });

  it('should restore focus when CommandPalette closes', async () => {
    const { CommandPaletteProvider, CommandPalette } = await import(
      '../src/public/components/CommandPalette'
    );

    const triggerButton = document.createElement('button');
    triggerButton.textContent = 'Trigger';
    document.body.appendChild(triggerButton);
    triggerButton.focus();

    const { rerender } = render(
      <CommandPaletteProvider>
        <CommandPalette isOpen={true} onClose={vi.fn()} />
      </CommandPaletteProvider>
    );

    rerender(
      <CommandPaletteProvider>
        <CommandPalette isOpen={false} onClose={vi.fn()} />
      </CommandPaletteProvider>
    );

    // Focus should return to trigger element
    await waitFor(() => {
      expect(document.activeElement).toBe(triggerButton);
    });

    document.body.removeChild(triggerButton);
  });

  it('should have no tab stops in hidden/collapsed sections', async () => {
    const { FileTree } = await import('../src/public/components/FileTree');
    const files = [
      { path: 'src/Button.tsx', status: 'modified' as const },
      { path: 'src/Input.tsx', status: 'modified' as const },
    ];
    render(<FileTree files={files} />);

    // Collapse the directory
    const collapseButton = screen.getByRole('button', { name: /collapse/i });
    fireEvent.click(collapseButton);

    // Hidden items should not be tabbable
    const fileItems = screen.getAllByRole('treeitem', { hidden: true });
    fileItems.forEach((item) => {
      expect(item).toHaveAttribute('tabindex', '-1');
    });
  });

  it('should allow arrow key navigation within FileTree', async () => {
    const { FileTree } = await import('../src/public/components/FileTree');
    const files = [
      { path: 'file1.ts', status: 'modified' as const },
      { path: 'file2.ts', status: 'created' as const },
      { path: 'file3.ts', status: 'deleted' as const },
    ];
    render(<FileTree files={files} />);

    const items = screen.getAllByRole('treeitem');
    items[0].focus();

    // Arrow down should move focus
    fireEvent.keyDown(items[0], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1]);

    // Arrow up should move focus back
    fireEvent.keyDown(items[1], { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items[0]);
  });
});

// =============================================================================
// AC4: 4.5:1 contrast ratio compliance
// =============================================================================

describe('AC4: 4.5:1 contrast ratio compliance', () => {
  it('should have sufficient contrast for button text', async () => {
    const { ControlBar } = await import('../src/public/components/ControlBar');
    render(<ControlBar isRunning={true} onStop={vi.fn()} onReset={vi.fn()} />);

    const stopButton = screen.getByTestId('stop-button');
    const styles = window.getComputedStyle(stopButton);

    const contrast = getContrastRatio(styles.color, styles.backgroundColor);
    expect(contrast).toBeGreaterThanOrEqual(4.5);
  });

  it('should have sufficient contrast for ModeSwitch labels', async () => {
    const { ModeSwitch } = await import('../src/public/components/ModeSwitch');
    render(<ModeSwitch />);

    const buttons = screen.getAllByRole('button');
    buttons.forEach((button) => {
      const styles = window.getComputedStyle(button);
      const contrast = getContrastRatio(styles.color, styles.backgroundColor);
      expect(contrast).toBeGreaterThanOrEqual(4.5);
    });
  });

  it('should have sufficient contrast for file status indicators', async () => {
    const { FileTree } = await import('../src/public/components/FileTree');
    const files = [
      { path: 'created.ts', status: 'created' as const },
      { path: 'modified.ts', status: 'modified' as const },
      { path: 'deleted.ts', status: 'deleted' as const },
    ];
    render(<FileTree files={files} />);

    const statusIndicators = [
      screen.getByTestId('status-created'),
      screen.getByTestId('status-modified'),
      screen.getByTestId('status-deleted'),
    ];

    statusIndicators.forEach((indicator) => {
      const styles = window.getComputedStyle(indicator);
      const contrast = getContrastRatio(styles.color, styles.backgroundColor);
      expect(contrast).toBeGreaterThanOrEqual(4.5);
    });
  });

  it('should have sufficient contrast for CommandPalette text', async () => {
    const { CommandPaletteProvider, CommandPalette } = await import(
      '../src/public/components/CommandPalette'
    );
    render(
      <CommandPaletteProvider>
        <CommandPalette isOpen={true} onClose={vi.fn()} />
      </CommandPaletteProvider>
    );

    const commandItems = screen.getAllByRole('option');
    commandItems.forEach((item) => {
      const styles = window.getComputedStyle(item);
      const contrast = getContrastRatio(styles.color, styles.backgroundColor);
      expect(contrast).toBeGreaterThanOrEqual(4.5);
    });
  });

  it('should maintain contrast in dark theme', async () => {
    document.documentElement.classList.add('dark-theme');

    const { ControlBar } = await import('../src/public/components/ControlBar');
    render(<ControlBar isRunning={false} onStop={vi.fn()} onReset={vi.fn()} />);

    const resetButton = screen.getByTestId('reset-button');
    const styles = window.getComputedStyle(resetButton);

    const contrast = getContrastRatio(styles.color, styles.backgroundColor);
    expect(contrast).toBeGreaterThanOrEqual(4.5);

    document.documentElement.classList.remove('dark-theme');
  });

  it('should have sufficient contrast for focus indicators', async () => {
    const { ControlBar } = await import('../src/public/components/ControlBar');
    render(<ControlBar isRunning={false} onStop={vi.fn()} onReset={vi.fn()} />);

    const resetButton = screen.getByTestId('reset-button');
    resetButton.focus();

    const styles = window.getComputedStyle(resetButton);
    // Focus ring should have 3:1 contrast minimum against adjacent colors
    expect(styles.outlineColor).not.toBe('transparent');
  });
});

// =============================================================================
// AC5: prefers-reduced-motion support
// =============================================================================

describe('AC5: prefers-reduced-motion support', () => {
  beforeEach(() => {
    mockMatchMedia.mockClear();
  });

  it('should detect prefers-reduced-motion media query', async () => {
    mockMatchMedia.mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    const { ModeSwitch } = await import('../src/public/components/ModeSwitch');
    render(<ModeSwitch />);

    expect(mockMatchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
  });

  it('should disable animations when reduced motion is preferred', async () => {
    mockMatchMedia.mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    const { ModeSwitch } = await import('../src/public/components/ModeSwitch');
    render(<ModeSwitch mode="plan" />);

    const container = screen.getByRole('group');
    const styles = window.getComputedStyle(container);

    // Animations should be disabled or instant
    expect(styles.transition).toMatch(/none|0s|0ms/);
  });

  it('should apply reduced motion class to root element', async () => {
    mockMatchMedia.mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    // Import App which should set up reduced motion detection
    const { default: App } = await import('../src/public/App');
    render(<App />);

    expect(document.documentElement.classList.contains('reduced-motion')).toBe(true);
  });

  it('should not disable essential animations that convey state changes', async () => {
    mockMatchMedia.mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    const { ControlBar } = await import('../src/public/components/ControlBar');
    render(<ControlBar isRunning={true} isStopping={true} onStop={vi.fn()} onReset={vi.fn()} />);

    // Loading spinner can still exist, but should use minimal animation
    const stopButton = screen.getByTestId('stop-button');
    const spinner = stopButton.querySelector('.spinner, .loading');

    if (spinner) {
      const styles = window.getComputedStyle(spinner);
      // Animation should be simplified, not completely removed
      expect(styles.animationDuration === '0s' || styles.animationIterationCount === '1').toBe(true);
    }
  });

  it('should respond to reduced motion preference changes', async () => {
    let listener: ((e: MediaQueryListEvent) => void) | null = null;
    mockMatchMedia.mockReturnValue({
      matches: false,
      media: '(prefers-reduced-motion: reduce)',
      addEventListener: vi.fn((event, cb) => {
        listener = cb;
      }),
      removeEventListener: vi.fn(),
    });

    const { default: App } = await import('../src/public/App');
    render(<App />);

    expect(document.documentElement.classList.contains('reduced-motion')).toBe(false);

    // Simulate preference change
    if (listener) {
      listener({ matches: true } as MediaQueryListEvent);
    }

    expect(document.documentElement.classList.contains('reduced-motion')).toBe(true);
  });
});

// =============================================================================
// AC6: Screen reader announcements for streaming content
// =============================================================================

describe('AC6: Screen reader announcements for streaming content', () => {
  it('should have aria-live region for streaming messages', async () => {
    const { MessageView } = await import('../src/public/components/Message');
    render(<MessageView messages={[]} />);

    const liveRegion = screen.getByRole('log') || document.querySelector('[aria-live]');
    expect(liveRegion).toBeInTheDocument();
    expect(liveRegion).toHaveAttribute('aria-live', 'polite');
  });

  it('should announce new messages via aria-live', async () => {
    const { MessageView } = await import('../src/public/components/Message');
    const { rerender } = render(<MessageView messages={[]} />);

    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion).toBeInTheDocument();

    // Add a new message
    rerender(
      <MessageView
        messages={[{ id: '1', role: 'assistant', content: 'Hello!' }]}
      />
    );

    // Live region should contain announcement-worthy content
    await waitFor(() => {
      expect(liveRegion?.textContent).toMatch(/hello|assistant|new message/i);
    });
  });

  it('should have aria-atomic on streaming content container', async () => {
    const { StreamingContent } = await import('../src/public/components/StreamingContent');
    render(<StreamingContent content="Streaming..." isStreaming={true} />);

    const streamingContainer = screen.getByTestId('streaming-content');
    // aria-atomic="false" so only new content is announced, not entire region
    expect(streamingContainer).toHaveAttribute('aria-atomic', 'false');
  });

  it('should announce when streaming starts', async () => {
    const { StreamingContent } = await import('../src/public/components/StreamingContent');
    render(<StreamingContent content="" isStreaming={true} />);

    const statusRegion = document.querySelector('[role="status"]');
    expect(statusRegion).toBeInTheDocument();
    expect(statusRegion?.textContent).toMatch(/streaming|loading|thinking/i);
  });

  it('should announce when streaming completes', async () => {
    const { StreamingContent } = await import('../src/public/components/StreamingContent');
    const { rerender } = render(<StreamingContent content="Hello" isStreaming={true} />);

    rerender(<StreamingContent content="Hello world!" isStreaming={false} />);

    const statusRegion = document.querySelector('[role="status"]');
    await waitFor(() => {
      expect(statusRegion?.textContent).toMatch(/complete|done|finished/i);
    });
  });

  it('should have aria-busy on container while streaming', async () => {
    const { StreamingContent } = await import('../src/public/components/StreamingContent');
    render(<StreamingContent content="Loading..." isStreaming={true} />);

    const container = screen.getByTestId('streaming-content');
    expect(container).toHaveAttribute('aria-busy', 'true');
  });

  it('should remove aria-busy when streaming finishes', async () => {
    const { StreamingContent } = await import('../src/public/components/StreamingContent');
    const { rerender } = render(<StreamingContent content="Loading..." isStreaming={true} />);

    rerender(<StreamingContent content="Done!" isStreaming={false} />);

    const container = screen.getByTestId('streaming-content');
    expect(container).toHaveAttribute('aria-busy', 'false');
  });

  it('should throttle announcements to avoid screen reader overload', async () => {
    const { StreamingContent } = await import('../src/public/components/StreamingContent');
    const { rerender } = render(<StreamingContent content="a" isStreaming={true} />);

    // Rapid updates
    for (let i = 0; i < 10; i++) {
      rerender(<StreamingContent content={'a'.repeat(i + 2)} isStreaming={true} />);
    }

    // Should not announce every character, only periodically
    const announcements = document.querySelectorAll('[aria-live] [data-announced]');
    expect(announcements.length).toBeLessThan(10);
  });
});

// =============================================================================
// AC7: Skip links for keyboard navigation
// =============================================================================

describe('AC7: Skip links for keyboard navigation', () => {
  it('should render skip link as first focusable element', async () => {
    const { default: App } = await import('../src/public/App');
    render(<App />);

    const skipLink = screen.getByRole('link', { name: /skip to main content/i });
    expect(skipLink).toBeInTheDocument();

    // Should be first focusable element
    const allFocusable = document.querySelectorAll(
      'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    expect(allFocusable[0]).toBe(skipLink);
  });

  it('should be visually hidden until focused', async () => {
    const { default: App } = await import('../src/public/App');
    render(<App />);

    const skipLink = screen.getByRole('link', { name: /skip to main content/i });

    // Should be visually hidden
    expect(skipLink).toHaveClass('sr-only', 'skip-link');

    // But still in DOM and focusable
    skipLink.focus();
    expect(skipLink).toHaveClass('skip-link-visible');
  });

  it('should become visible on focus', async () => {
    const { default: App } = await import('../src/public/App');
    render(<App />);

    const skipLink = screen.getByRole('link', { name: /skip to main content/i });
    skipLink.focus();

    const styles = window.getComputedStyle(skipLink);
    expect(styles.position).not.toBe('absolute');
    expect(styles.left).not.toBe('-9999px');
  });

  it('should navigate to main content area when activated', async () => {
    const { default: App } = await import('../src/public/App');
    render(<App />);

    const skipLink = screen.getByRole('link', { name: /skip to main content/i });
    const mainContent = screen.getByRole('main') || document.getElementById('main-content');

    expect(skipLink).toHaveAttribute('href', '#main-content');
    expect(mainContent).toBeInTheDocument();
    expect(mainContent).toHaveAttribute('id', 'main-content');
  });

  it('should move focus to main content when skip link clicked', async () => {
    const { default: App } = await import('../src/public/App');
    render(<App />);

    const skipLink = screen.getByRole('link', { name: /skip to main content/i });
    const mainContent = document.getElementById('main-content')!;

    // Ensure main content is focusable
    expect(mainContent).toHaveAttribute('tabindex', '-1');

    fireEvent.click(skipLink);

    await waitFor(() => {
      expect(document.activeElement).toBe(mainContent);
    });
  });

  it('should have skip link to message input', async () => {
    const { default: App } = await import('../src/public/App');
    render(<App />);

    const skipToInput = screen.getByRole('link', { name: /skip to input/i });
    expect(skipToInput).toBeInTheDocument();
    expect(skipToInput).toHaveAttribute('href', '#message-input');
  });

  it('should have skip link to sidebar navigation', async () => {
    const { default: App } = await import('../src/public/App');
    render(<App />);

    const skipToNav = screen.getByRole('link', { name: /skip to navigation/i });
    expect(skipToNav).toBeInTheDocument();
  });
});

// =============================================================================
// Integration: All ACs together
// =============================================================================

describe('Integration: Full accessibility compliance', () => {
  it('should pass accessibility audit on main app', async () => {
    // This is a placeholder for axe-core integration
    // In a real implementation, you would use jest-axe:
    // const { axe, toHaveNoViolations } = require('jest-axe');
    // expect.extend(toHaveNoViolations);
    // const results = await axe(container);
    // expect(results).toHaveNoViolations();

    const { default: App } = await import('../src/public/App');
    const { container } = render(<App />);

    // Basic checks that should be expanded with axe-core
    expect(container.querySelectorAll('img:not([alt])').length).toBe(0);
    expect(container.querySelectorAll('button:not([aria-label]):not(:has(*))').length).toBe(0);
  });

  it('should support keyboard-only navigation through entire app', async () => {
    const { default: App } = await import('../src/public/App');
    render(<App />);

    const user = userEvent.setup();

    // Should be able to tab through all interactive elements
    await user.tab(); // Skip link
    await user.tab(); // First button/control
    await user.tab(); // Second button/control

    // Should eventually reach message input
    let foundInput = false;
    for (let i = 0; i < 20; i++) {
      await user.tab();
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        foundInput = true;
        break;
      }
    }

    expect(foundInput).toBe(true);
  });
});
