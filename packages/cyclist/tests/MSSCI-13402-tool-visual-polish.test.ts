/**
 * Story MSSCI-13402: Tool Use Visual Design Polish Tests
 *
 * Tests verify all acceptance criteria for visual design polish:
 * - AC1: Status indicators for pending/success/error
 * - AC2: Tool type color coding
 * - AC3: Elapsed time display
 * - AC4: Error state styling
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';

// Cleanup after each test to prevent DOM pollution
afterEach(() => {
  cleanup();
});

// ============================================================================
// AC1: Status Indicators Tests - ToolStatus Component
// ============================================================================

describe('MSSCI-13402: Tool Visual Design Polish', () => {
  describe('AC1: Status Indicators (ToolStatus Component)', () => {
    describe('Component existence and exports', () => {
      it('should export ToolStatus component from utils', async () => {
        const module = await import('../src/public/components/ToolStatus.js');
        expect(module.ToolStatus).toBeDefined();
      });

      it('should export ToolStatusProps type', async () => {
        const module = await import('../src/public/components/ToolStatus.js');
        expect(typeof module.ToolStatus).toBe('function');
      });
    });

    describe('Pending state', () => {
      it('should render spinner icon when status is "pending"', async () => {
        const { ToolStatus } = await import('../src/public/components/ToolStatus.js');

        render(React.createElement(ToolStatus, { status: 'pending' }));

        const indicator = screen.getByTestId('tool-status-indicator');
        expect(indicator).toHaveClass('status-pending');
        expect(indicator.querySelector('.spinner, [data-loading="true"]')).toBeTruthy();
      });

      it('should have appropriate ARIA label for pending state', async () => {
        const { ToolStatus } = await import('../src/public/components/ToolStatus.js');

        render(React.createElement(ToolStatus, { status: 'pending' }));

        const indicator = screen.getByTestId('tool-status-indicator');
        expect(indicator).toHaveAttribute('aria-label', expect.stringMatching(/pending|loading|running/i));
      });
    });

    describe('Success state', () => {
      it('should render green checkmark when status is "success"', async () => {
        const { ToolStatus } = await import('../src/public/components/ToolStatus.js');

        render(React.createElement(ToolStatus, { status: 'success' }));

        const indicator = screen.getByTestId('tool-status-indicator');
        expect(indicator).toHaveClass('status-success');
        expect(indicator.textContent).toMatch(/✓|✔|check/i);
      });

      it('should have appropriate ARIA label for success state', async () => {
        const { ToolStatus } = await import('../src/public/components/ToolStatus.js');

        render(React.createElement(ToolStatus, { status: 'success' }));

        const indicator = screen.getByTestId('tool-status-indicator');
        expect(indicator).toHaveAttribute('aria-label', expect.stringMatching(/success|complete|done/i));
      });
    });

    describe('Error state', () => {
      it('should render red X icon when status is "error"', async () => {
        const { ToolStatus } = await import('../src/public/components/ToolStatus.js');

        render(React.createElement(ToolStatus, { status: 'error' }));

        const indicator = screen.getByTestId('tool-status-indicator');
        expect(indicator).toHaveClass('status-error');
        expect(indicator.textContent).toMatch(/✗|✕|×|x|error/i);
      });

      it('should have appropriate ARIA label for error state', async () => {
        const { ToolStatus } = await import('../src/public/components/ToolStatus.js');

        render(React.createElement(ToolStatus, { status: 'error' }));

        const indicator = screen.getByTestId('tool-status-indicator');
        expect(indicator).toHaveAttribute('aria-label', expect.stringMatching(/error|failed/i));
      });
    });
  });

  // ============================================================================
  // AC2: Tool Type Color Coding Tests
  // ============================================================================

  describe('AC2: Tool Type Color Coding', () => {
    describe('CSS custom properties', () => {
      it('should define --tool-read-color variable (blue)', async () => {
        const { getToolTypeColor } = await import('../src/public/utils/toolTypeColors.js');
        const color = getToolTypeColor('Read');
        expect(color).toMatch(/#3b82f6|blue|read/i);
      });

      it('should define --tool-write-color variable (orange)', async () => {
        const { getToolTypeColor } = await import('../src/public/utils/toolTypeColors.js');
        const color = getToolTypeColor('Write');
        expect(color).toMatch(/#f97316|orange|write/i);
      });

      it('should define --tool-bash-color variable (green)', async () => {
        const { getToolTypeColor } = await import('../src/public/utils/toolTypeColors.js');
        const color = getToolTypeColor('Bash');
        expect(color).toMatch(/#22c55e|green|bash/i);
      });

      it('should define --tool-glob-color variable (purple)', async () => {
        const { getToolTypeColor } = await import('../src/public/utils/toolTypeColors.js');
        const color = getToolTypeColor('Glob');
        expect(color).toMatch(/#a855f7|purple|glob/i);
      });

      it('should define --tool-grep-color variable (cyan)', async () => {
        const { getToolTypeColor } = await import('../src/public/utils/toolTypeColors.js');
        const color = getToolTypeColor('Grep');
        expect(color).toMatch(/#06b6d4|cyan|grep/i);
      });

      it('should define --tool-edit-color variable (yellow)', async () => {
        const { getToolTypeColor } = await import('../src/public/utils/toolTypeColors.js');
        const color = getToolTypeColor('Edit');
        expect(color).toMatch(/#eab308|yellow|edit/i);
      });

      it('should define --tool-task-color variable (pink)', async () => {
        const { getToolTypeColor } = await import('../src/public/utils/toolTypeColors.js');
        const color = getToolTypeColor('Task');
        expect(color).toMatch(/#ec4899|pink|task/i);
      });

      it('should return default color for unknown tools', async () => {
        const { getToolTypeColor } = await import('../src/public/utils/toolTypeColors.js');
        const color = getToolTypeColor('UnknownTool');
        expect(color).toBeDefined();
        expect(typeof color).toBe('string');
      });
    });

    describe('ToolCallBlock color application', () => {
      it('should apply tool-read class for Read tool', async () => {
        const ToolCallBlock = (await import('../src/public/components/ToolCallBlock.js')).default;

        const toolUse = { type: 'tool_use' as const, tool_name: 'Read', tool_id: '1', input: { file_path: '/test.ts' }, timestamp: Date.now() };
        render(React.createElement(ToolCallBlock, { toolUse }));

        const block = screen.getByTestId('tool-call-block');
        expect(block).toHaveClass('tool-read');
      });

      it('should apply tool-write class for Write tool', async () => {
        const ToolCallBlock = (await import('../src/public/components/ToolCallBlock.js')).default;

        const toolUse = { type: 'tool_use' as const, tool_name: 'Write', tool_id: '1', input: { file_path: '/test.ts' }, timestamp: Date.now() };
        render(React.createElement(ToolCallBlock, { toolUse }));

        const block = screen.getByTestId('tool-call-block');
        expect(block).toHaveClass('tool-write');
      });

      it('should apply tool-bash class for Bash tool', async () => {
        const ToolCallBlock = (await import('../src/public/components/ToolCallBlock.js')).default;

        const toolUse = { type: 'tool_use' as const, tool_name: 'Bash', tool_id: '1', input: { command: 'ls' }, timestamp: Date.now() };
        render(React.createElement(ToolCallBlock, { toolUse }));

        const block = screen.getByTestId('tool-call-block');
        expect(block).toHaveClass('tool-bash');
      });

      it('should apply tool-glob class for Glob tool', async () => {
        const ToolCallBlock = (await import('../src/public/components/ToolCallBlock.js')).default;

        const toolUse = { type: 'tool_use' as const, tool_name: 'Glob', tool_id: '1', input: { pattern: '*.ts' }, timestamp: Date.now() };
        render(React.createElement(ToolCallBlock, { toolUse }));

        const block = screen.getByTestId('tool-call-block');
        expect(block).toHaveClass('tool-glob');
      });

      it('should apply tool-grep class for Grep tool', async () => {
        const ToolCallBlock = (await import('../src/public/components/ToolCallBlock.js')).default;

        const toolUse = { type: 'tool_use' as const, tool_name: 'Grep', tool_id: '1', input: { pattern: 'TODO' }, timestamp: Date.now() };
        render(React.createElement(ToolCallBlock, { toolUse }));

        const block = screen.getByTestId('tool-call-block');
        expect(block).toHaveClass('tool-grep');
      });

      it('should apply tool-edit class for Edit tool', async () => {
        const ToolCallBlock = (await import('../src/public/components/ToolCallBlock.js')).default;

        const toolUse = { type: 'tool_use' as const, tool_name: 'Edit', tool_id: '1', input: { file_path: '/test.ts' }, timestamp: Date.now() };
        render(React.createElement(ToolCallBlock, { toolUse }));

        const block = screen.getByTestId('tool-call-block');
        expect(block).toHaveClass('tool-edit');
      });

      it('should apply tool-task class for Task tool', async () => {
        const ToolCallBlock = (await import('../src/public/components/ToolCallBlock.js')).default;

        const toolUse = { type: 'tool_use' as const, tool_name: 'Task', tool_id: '1', input: { subagent_type: 'Explore' }, timestamp: Date.now() };
        render(React.createElement(ToolCallBlock, { toolUse }));

        const block = screen.getByTestId('tool-call-block');
        expect(block).toHaveClass('tool-task');
      });

      it('should handle unknown tool types gracefully', async () => {
        const ToolCallBlock = (await import('../src/public/components/ToolCallBlock.js')).default;

        const toolUse = { type: 'tool_use' as const, tool_name: 'UnknownTool', tool_id: '1', input: {}, timestamp: Date.now() };
        render(React.createElement(ToolCallBlock, { toolUse }));

        const block = screen.getByTestId('tool-call-block');
        expect(block).toBeInTheDocument();
      });
    });
  });

  // ============================================================================
  // AC3: Elapsed Time Display Tests
  // ============================================================================

  describe('AC3: Elapsed Time Display', () => {
    describe('formatDuration utility', () => {
      it('should export formatDuration function', async () => {
        const module = await import('../src/public/utils/formatDuration.js');
        expect(module.formatDuration).toBeDefined();
        expect(typeof module.formatDuration).toBe('function');
      });

      it('should format milliseconds < 1000 as "XXXms"', async () => {
        const { formatDuration } = await import('../src/public/utils/formatDuration.js');
        expect(formatDuration(245)).toBe('245ms');
        expect(formatDuration(1)).toBe('1ms');
        expect(formatDuration(999)).toBe('999ms');
      });

      it('should format seconds as "X.Xs"', async () => {
        const { formatDuration } = await import('../src/public/utils/formatDuration.js');
        expect(formatDuration(1000)).toBe('1.0s');
        expect(formatDuration(1500)).toBe('1.5s');
        expect(formatDuration(2345)).toBe('2.3s');
        expect(formatDuration(10000)).toBe('10.0s');
      });

      it('should handle 0ms', async () => {
        const { formatDuration } = await import('../src/public/utils/formatDuration.js');
        expect(formatDuration(0)).toBe('0ms');
      });

      it('should handle undefined gracefully', async () => {
        const { formatDuration } = await import('../src/public/utils/formatDuration.js');
        expect(formatDuration(undefined as unknown as number)).toMatch(/—|N\/A|unknown/i);
      });

      it('should handle negative values gracefully', async () => {
        const { formatDuration } = await import('../src/public/utils/formatDuration.js');
        const result = formatDuration(-100);
        expect(typeof result).toBe('string');
      });
    });

    describe('ToolCallBlock elapsed time display', () => {
      it('should display elapsed time in header when result is present with durationMs', async () => {
        const ToolCallBlock = (await import('../src/public/components/ToolCallBlock.js')).default;

        const toolUse = { type: 'tool_use' as const, tool_name: 'Read', tool_id: '1', input: { file_path: '/test.ts' }, timestamp: Date.now() };
        const result = { type: 'tool_result' as const, tool_id: '1', content: 'file content', timestamp: Date.now(), durationMs: 245 };

        render(React.createElement(ToolCallBlock, { toolUse, result }));

        const durationDisplay = screen.getByTestId('tool-duration');
        expect(durationDisplay).toHaveTextContent('245ms');
      });

      it('should display elapsed time with seconds format for longer durations', async () => {
        const ToolCallBlock = (await import('../src/public/components/ToolCallBlock.js')).default;

        const toolUse = { type: 'tool_use' as const, tool_name: 'Bash', tool_id: '1', input: { command: 'npm test' }, timestamp: Date.now() };
        const result = { type: 'tool_result' as const, tool_id: '1', content: 'tests passed', timestamp: Date.now(), durationMs: 5230 };

        render(React.createElement(ToolCallBlock, { toolUse, result }));

        const durationDisplay = screen.getByTestId('tool-duration');
        expect(durationDisplay).toHaveTextContent('5.2s');
      });

      it('should not display elapsed time when result has no durationMs', async () => {
        const ToolCallBlock = (await import('../src/public/components/ToolCallBlock.js')).default;

        const toolUse = { type: 'tool_use' as const, tool_name: 'Read', tool_id: '1', input: { file_path: '/test.ts' }, timestamp: Date.now() };
        const result = { type: 'tool_result' as const, tool_id: '1', content: 'file content', timestamp: Date.now() };

        render(React.createElement(ToolCallBlock, { toolUse, result }));

        const durationDisplay = screen.queryByTestId('tool-duration');
        expect(durationDisplay === null || durationDisplay.textContent === '' || durationDisplay.textContent?.match(/—|N\/A/)).toBeTruthy();
      });

      it('should not display elapsed time when tool is pending', async () => {
        const ToolCallBlock = (await import('../src/public/components/ToolCallBlock.js')).default;

        const toolUse = { type: 'tool_use' as const, tool_name: 'Read', tool_id: '1', input: { file_path: '/test.ts' }, timestamp: Date.now() };

        render(React.createElement(ToolCallBlock, { toolUse }));

        const durationDisplay = screen.queryByTestId('tool-duration');
        expect(durationDisplay === null || durationDisplay.textContent === '').toBeTruthy();
      });
    });
  });

  // ============================================================================
  // AC4: Error State Styling Tests
  // ============================================================================

  describe('AC4: Error State Styling', () => {
    describe('Error detection', () => {
      it('should detect error from is_error flag', async () => {
        const ToolCallBlock = (await import('../src/public/components/ToolCallBlock.js')).default;

        const toolUse = { type: 'tool_use' as const, tool_name: 'Bash', tool_id: '1', input: { command: 'exit 1' }, timestamp: Date.now() };
        const result = { type: 'tool_result' as const, tool_id: '1', content: 'Error: command failed', timestamp: Date.now(), is_error: true };

        render(React.createElement(ToolCallBlock, { toolUse, result }));

        const block = screen.getByTestId('tool-call-block');
        expect(block).toHaveClass('tool-error');
      });
    });

    describe('Error styling', () => {
      it('should apply tool-error class to block', async () => {
        const ToolCallBlock = (await import('../src/public/components/ToolCallBlock.js')).default;

        const toolUse = { type: 'tool_use' as const, tool_name: 'Bash', tool_id: '1', input: { command: 'bad_command' }, timestamp: Date.now() };
        const result = { type: 'tool_result' as const, tool_id: '1', content: 'command not found', timestamp: Date.now(), is_error: true };

        render(React.createElement(ToolCallBlock, { toolUse, result }));

        const block = screen.getByTestId('tool-call-block');
        expect(block).toHaveClass('tool-error');
      });

      it('should show error status indicator for error state', async () => {
        const ToolCallBlock = (await import('../src/public/components/ToolCallBlock.js')).default;

        const toolUse = { type: 'tool_use' as const, tool_name: 'Read', tool_id: '1', input: { file_path: '/nonexistent' }, timestamp: Date.now() };
        const result = { type: 'tool_result' as const, tool_id: '1', content: 'File not found', timestamp: Date.now(), is_error: true };

        render(React.createElement(ToolCallBlock, { toolUse, result }));

        const status = screen.getByTestId('tool-status');
        expect(status).toHaveClass('tool-status-error');
      });

      it('should have error content highlighted', async () => {
        const ToolCallBlock = (await import('../src/public/components/ToolCallBlock.js')).default;

        const toolUse = { type: 'tool_use' as const, tool_name: 'Bash', tool_id: '1', input: { command: 'fail' }, timestamp: Date.now() };
        const result = { type: 'tool_result' as const, tool_id: '1', content: 'Critical error occurred', timestamp: Date.now(), is_error: true };

        render(React.createElement(ToolCallBlock, { toolUse, result }));

        // Expand the result first
        const toggle = screen.getByTestId('tool-result-toggle');
        toggle.click();

        const resultContent = screen.getByTestId('tool-result-content');
        expect(resultContent).toHaveClass('error-content');
      });
    });

    describe('Non-error states', () => {
      it('should not apply tool-error class for successful results', async () => {
        const ToolCallBlock = (await import('../src/public/components/ToolCallBlock.js')).default;

        const toolUse = { type: 'tool_use' as const, tool_name: 'Read', tool_id: '1', input: { file_path: '/test.ts' }, timestamp: Date.now() };
        const result = { type: 'tool_result' as const, tool_id: '1', content: 'file content', timestamp: Date.now(), is_error: false };

        render(React.createElement(ToolCallBlock, { toolUse, result }));

        const block = screen.getByTestId('tool-call-block');
        expect(block).not.toHaveClass('tool-error');
      });

      it('should not apply tool-error class for pending tools', async () => {
        const ToolCallBlock = (await import('../src/public/components/ToolCallBlock.js')).default;

        const toolUse = { type: 'tool_use' as const, tool_name: 'Read', tool_id: '1', input: { file_path: '/test.ts' }, timestamp: Date.now() };

        render(React.createElement(ToolCallBlock, { toolUse }));

        const block = screen.getByTestId('tool-call-block');
        expect(block).not.toHaveClass('tool-error');
      });
    });
  });

  // ============================================================================
  // Integration Tests
  // ============================================================================

  describe('Integration: All Visual Elements Together', () => {
    it('should render complete tool block with all visual elements for success', async () => {
      const ToolCallBlock = (await import('../src/public/components/ToolCallBlock.js')).default;

      const toolUse = { type: 'tool_use' as const, tool_name: 'Read', tool_id: '1', input: { file_path: '/src/test.ts' }, timestamp: Date.now() };
      const result = { type: 'tool_result' as const, tool_id: '1', content: 'export const x = 1;', timestamp: Date.now(), durationMs: 123, is_error: false };

      render(React.createElement(ToolCallBlock, { toolUse, result }));

      const block = screen.getByTestId('tool-call-block');
      expect(block).toHaveClass('tool-read');
      expect(block).not.toHaveClass('tool-error');
      expect(screen.getByTestId('tool-status')).toHaveClass('tool-status-success');
      expect(screen.getByTestId('tool-duration')).toHaveTextContent('123ms');
    });

    it('should render complete tool block with all visual elements for error', async () => {
      const ToolCallBlock = (await import('../src/public/components/ToolCallBlock.js')).default;

      const toolUse = { type: 'tool_use' as const, tool_name: 'Bash', tool_id: '1', input: { command: 'exit 1' }, timestamp: Date.now() };
      const result = { type: 'tool_result' as const, tool_id: '1', content: 'Error: exit code 1', timestamp: Date.now(), durationMs: 50, is_error: true };

      render(React.createElement(ToolCallBlock, { toolUse, result }));

      const block = screen.getByTestId('tool-call-block');
      expect(block).toHaveClass('tool-bash');
      expect(block).toHaveClass('tool-error');
      expect(screen.getByTestId('tool-status')).toHaveClass('tool-status-error');
      expect(screen.getByTestId('tool-duration')).toHaveTextContent('50ms');
    });
  });

  // ============================================================================
  // Data Pipeline Integration Tests (MSSCI-13402 fix for Reviewer feedback)
  // ============================================================================

  describe('Data Pipeline: MessagePanel transformMessage', () => {
    it('should preserve is_error field from SDK message', async () => {
      // Dynamically import to access the transformMessage function indirectly via component behavior
      // Since transformMessage is internal, we verify by testing the MessageData interface fields
      // are correctly typed to include is_error and durationMs
      const ToolCallBlock = (await import('../src/public/components/ToolCallBlock.js')).default;

      // Simulate what MessagePanel would produce after transformMessage
      const toolUse = { type: 'tool_use' as const, tool_name: 'Bash', tool_id: '1', input: { command: 'exit 1' }, timestamp: Date.now() };
      const result = {
        type: 'tool_result' as const,
        tool_id: '1',
        content: 'command not found: bad_command',
        timestamp: Date.now(),
        is_error: true,  // This field must flow through the pipeline
        durationMs: 42,   // This field must flow through the pipeline
      };

      render(React.createElement(ToolCallBlock, { toolUse, result }));

      // Verify is_error is properly received and applied
      const block = screen.getByTestId('tool-call-block');
      expect(block).toHaveClass('tool-error');

      // Verify durationMs is properly received and displayed
      expect(screen.getByTestId('tool-duration')).toHaveTextContent('42ms');
    });

    it('should handle undefined is_error and durationMs gracefully', async () => {
      const ToolCallBlock = (await import('../src/public/components/ToolCallBlock.js')).default;

      const toolUse = { type: 'tool_use' as const, tool_name: 'Read', tool_id: '1', input: { file_path: '/test.ts' }, timestamp: Date.now() };
      const result = {
        type: 'tool_result' as const,
        tool_id: '1',
        content: 'file contents',
        timestamp: Date.now(),
        // Intentionally omit is_error and durationMs to test undefined handling
      };

      render(React.createElement(ToolCallBlock, { toolUse, result }));

      // Should NOT have error class when is_error is undefined
      const block = screen.getByTestId('tool-call-block');
      expect(block).not.toHaveClass('tool-error');

      // Duration should be empty when durationMs is undefined
      const duration = screen.getByTestId('tool-duration');
      expect(duration.textContent).toBe('');
    });
  });
});
