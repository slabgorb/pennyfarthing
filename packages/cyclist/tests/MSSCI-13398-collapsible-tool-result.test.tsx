/**
 * MSSCI-13398: Collapsible Tool Result Display Tests
 *
 * Tests for enhanced tool result display with collapse, line count, truncation, and copy.
 * Story: MSSCI-13398 - Collapsible tool result display
 * Epic: epic-74 (Tool Use Visualization)
 *
 * Acceptance Criteria:
 * - AC1: Results collapsed by default
 * - AC2: Line count shown in collapsed state
 * - AC3: Large results truncated with expand option
 * - AC4: Copy to clipboard button
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

import ToolCallBlock from '../src/public/components/ToolCallBlock';

// ============================================================================
// Test Fixtures
// ============================================================================

const mockToolUse = {
  type: 'tool_use' as const,
  tool_name: 'Read',
  tool_id: 'tool_123',
  input: { file_path: '/src/example.ts' },
  timestamp: Date.now(),
};

const shortResult = {
  type: 'tool_result' as const,
  tool_id: 'tool_123',
  content: 'Line 1\nLine 2\nLine 3',
  timestamp: Date.now(),
};

const mediumResult = {
  type: 'tool_result' as const,
  tool_id: 'tool_123',
  content: Array.from({ length: 25 }, (_, i) => `Line ${i + 1}`).join('\n'),
  timestamp: Date.now(),
};

// Generate a large result with 100 lines (>50 threshold)
const largeResult = {
  type: 'tool_result' as const,
  tool_id: 'tool_123',
  content: Array.from({ length: 100 }, (_, i) => `Line ${i + 1}: Some content here`).join('\n'),
  timestamp: Date.now(),
};

// Mock clipboard API
const mockWriteText = vi.fn(() => Promise.resolve());

beforeEach(() => {
  // Mock clipboard using Object.defineProperty since it's read-only
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: mockWriteText },
    writable: true,
    configurable: true,
  });
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================================
// AC1: Results collapsed by default
// ============================================================================

describe('AC1: Results collapsed by default', () => {
  it('should render result content as collapsed when result is present', () => {
    render(<ToolCallBlock toolUse={mockToolUse} result={shortResult} />);

    const resultContent = screen.getByTestId('tool-result-content');
    expect(resultContent).toHaveClass('collapsed');
  });

  it('should show collapsed indicator arrow (▶) by default', () => {
    render(<ToolCallBlock toolUse={mockToolUse} result={shortResult} />);

    const toggle = screen.getByTestId('tool-result-toggle');
    expect(toggle.textContent).toContain('▶');
  });

  it('should expand when toggle is clicked', () => {
    render(<ToolCallBlock toolUse={mockToolUse} result={shortResult} />);

    const toggle = screen.getByTestId('tool-result-toggle');
    fireEvent.click(toggle);

    const resultContent = screen.getByTestId('tool-result-content');
    expect(resultContent).not.toHaveClass('collapsed');
  });

  it('should show expanded indicator arrow (▼) after expanding', () => {
    render(<ToolCallBlock toolUse={mockToolUse} result={shortResult} />);

    const toggle = screen.getByTestId('tool-result-toggle');
    fireEvent.click(toggle);

    expect(toggle.textContent).toContain('▼');
  });

  it('should collapse again when toggle is clicked twice', () => {
    render(<ToolCallBlock toolUse={mockToolUse} result={shortResult} />);

    const toggle = screen.getByTestId('tool-result-toggle');
    fireEvent.click(toggle); // expand
    fireEvent.click(toggle); // collapse

    const resultContent = screen.getByTestId('tool-result-content');
    expect(resultContent).toHaveClass('collapsed');
  });
});

// ============================================================================
// AC2: Line count shown in collapsed state
// ============================================================================

describe('AC2: Line count shown in collapsed state', () => {
  it('should display line count in the toggle button text', () => {
    render(<ToolCallBlock toolUse={mockToolUse} result={shortResult} />);

    const toggle = screen.getByTestId('tool-result-toggle');
    // shortResult has 3 lines
    expect(toggle.textContent).toContain('3 lines');
  });

  it('should show correct line count for medium results', () => {
    render(<ToolCallBlock toolUse={mockToolUse} result={mediumResult} />);

    const toggle = screen.getByTestId('tool-result-toggle');
    // mediumResult has 25 lines
    expect(toggle.textContent).toContain('25 lines');
  });

  it('should show correct line count for large results', () => {
    render(<ToolCallBlock toolUse={mockToolUse} result={largeResult} />);

    const toggle = screen.getByTestId('tool-result-toggle');
    // largeResult has 100 lines
    expect(toggle.textContent).toContain('100 lines');
  });

  it('should show "1 line" (singular) for single-line results', () => {
    const singleLineResult = {
      ...shortResult,
      content: 'Just one line',
    };
    render(<ToolCallBlock toolUse={mockToolUse} result={singleLineResult} />);

    const toggle = screen.getByTestId('tool-result-toggle');
    expect(toggle.textContent).toContain('1 line');
    expect(toggle.textContent).not.toContain('1 lines');
  });

  it('should handle empty content gracefully', () => {
    const emptyResult = {
      ...shortResult,
      content: '',
    };
    render(<ToolCallBlock toolUse={mockToolUse} result={emptyResult} />);

    const toggle = screen.getByTestId('tool-result-toggle');
    expect(toggle.textContent).toContain('0 lines');
  });
});

// ============================================================================
// AC3: Large results truncated with expand option
// ============================================================================

describe('AC3: Large results truncated with expand option', () => {
  it('should show truncated preview for results over 50 lines', () => {
    render(<ToolCallBlock toolUse={mockToolUse} result={largeResult} />);

    // Expand to see content
    const toggle = screen.getByTestId('tool-result-toggle');
    fireEvent.click(toggle);

    // Should show truncated class
    const resultContent = screen.getByTestId('tool-result-content');
    expect(resultContent).toHaveClass('truncated');
  });

  it('should only show first 50 lines in truncated state', () => {
    render(<ToolCallBlock toolUse={mockToolUse} result={largeResult} />);

    const toggle = screen.getByTestId('tool-result-toggle');
    fireEvent.click(toggle);

    const resultContent = screen.getByTestId('tool-result-content');
    // Should contain Line 50 but not Line 51
    expect(resultContent.textContent).toContain('Line 50');
    expect(resultContent.textContent).not.toContain('Line 51');
  });

  it('should show "Show all (N lines)" button for large results', () => {
    render(<ToolCallBlock toolUse={mockToolUse} result={largeResult} />);

    const toggle = screen.getByTestId('tool-result-toggle');
    fireEvent.click(toggle);

    const expandButton = screen.getByTestId('tool-result-expand');
    expect(expandButton.textContent).toContain('Show all');
    expect(expandButton.textContent).toContain('100 lines');
  });

  it('should show full content when "Show all" is clicked', () => {
    render(<ToolCallBlock toolUse={mockToolUse} result={largeResult} />);

    const toggle = screen.getByTestId('tool-result-toggle');
    fireEvent.click(toggle);

    const expandButton = screen.getByTestId('tool-result-expand');
    fireEvent.click(expandButton);

    const resultContent = screen.getByTestId('tool-result-content');
    expect(resultContent).not.toHaveClass('truncated');
    expect(resultContent.textContent).toContain('Line 100');
  });

  it('should not show expand button for results under 50 lines', () => {
    render(<ToolCallBlock toolUse={mockToolUse} result={mediumResult} />);

    const toggle = screen.getByTestId('tool-result-toggle');
    fireEvent.click(toggle);

    const expandButton = screen.queryByTestId('tool-result-expand');
    expect(expandButton).not.toBeInTheDocument();
  });

  it('should not apply truncation to small results', () => {
    render(<ToolCallBlock toolUse={mockToolUse} result={shortResult} />);

    const toggle = screen.getByTestId('tool-result-toggle');
    fireEvent.click(toggle);

    const resultContent = screen.getByTestId('tool-result-content');
    expect(resultContent).not.toHaveClass('truncated');
  });
});

// ============================================================================
// AC4: Copy to clipboard button
// ============================================================================

describe('AC4: Copy to clipboard button', () => {
  it('should render a copy button', () => {
    render(<ToolCallBlock toolUse={mockToolUse} result={shortResult} />);

    const copyButton = screen.getByTestId('tool-result-copy');
    expect(copyButton).toBeInTheDocument();
  });

  it('should have accessible label for copy button', () => {
    render(<ToolCallBlock toolUse={mockToolUse} result={shortResult} />);

    const copyButton = screen.getByTestId('tool-result-copy');
    expect(copyButton).toHaveAttribute('aria-label', 'Copy result to clipboard');
  });

  it('should copy result content to clipboard when clicked', async () => {
    render(<ToolCallBlock toolUse={mockToolUse} result={shortResult} />);

    const copyButton = screen.getByTestId('tool-result-copy');
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledWith(shortResult.content);
    });
  });

  it('should show visual feedback after copying', async () => {
    render(<ToolCallBlock toolUse={mockToolUse} result={shortResult} />);

    const copyButton = screen.getByTestId('tool-result-copy');
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(copyButton).toHaveClass('copied');
    });
  });

  it('should reset visual feedback after a delay', async () => {
    vi.useFakeTimers();
    render(<ToolCallBlock toolUse={mockToolUse} result={shortResult} />);

    const copyButton = screen.getByTestId('tool-result-copy');
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(copyButton).toHaveClass('copied');
    });

    // Advance timers by 2 seconds
    vi.advanceTimersByTime(2000);

    await waitFor(() => {
      expect(copyButton).not.toHaveClass('copied');
    });

    vi.useRealTimers();
  });

  it('should not render copy button when there is no result', () => {
    render(<ToolCallBlock toolUse={mockToolUse} />);

    const copyButton = screen.queryByTestId('tool-result-copy');
    expect(copyButton).not.toBeInTheDocument();
  });

  it('should copy full content even when display is truncated', async () => {
    render(<ToolCallBlock toolUse={mockToolUse} result={largeResult} />);

    const copyButton = screen.getByTestId('tool-result-copy');
    fireEvent.click(copyButton);

    await waitFor(() => {
      // Should copy ALL 100 lines, not just the visible 50
      expect(mockWriteText).toHaveBeenCalledWith(largeResult.content);
    });
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge cases', () => {
  it('should handle result with only whitespace content', () => {
    const whitespaceResult = {
      ...shortResult,
      content: '   \n\n   \n',
    };
    render(<ToolCallBlock toolUse={mockToolUse} result={whitespaceResult} />);

    const toggle = screen.getByTestId('tool-result-toggle');
    // Whitespace-only lines should still be counted
    expect(toggle.textContent).toContain('4 lines');
  });

  it('should handle result with Windows line endings (CRLF)', () => {
    const crlfResult = {
      ...shortResult,
      content: 'Line 1\r\nLine 2\r\nLine 3',
    };
    render(<ToolCallBlock toolUse={mockToolUse} result={crlfResult} />);

    const toggle = screen.getByTestId('tool-result-toggle');
    expect(toggle.textContent).toContain('3 lines');
  });

  it('should handle very long single line gracefully', () => {
    const longLineResult = {
      ...shortResult,
      content: 'x'.repeat(10000),
    };
    render(<ToolCallBlock toolUse={mockToolUse} result={longLineResult} />);

    const toggle = screen.getByTestId('tool-result-toggle');
    expect(toggle.textContent).toContain('1 line');
  });

  it('should handle clipboard API failure gracefully', async () => {
    mockWriteText.mockRejectedValueOnce(new Error('Clipboard failed'));

    render(<ToolCallBlock toolUse={mockToolUse} result={shortResult} />);

    const copyButton = screen.getByTestId('tool-result-copy');
    fireEvent.click(copyButton);

    // Should not throw, should show error state
    await waitFor(() => {
      expect(copyButton).toHaveClass('copy-error');
    });
  });
});
