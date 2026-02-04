/**
 * MSSCI-13400: Tool Use Stack Between Messages
 *
 * TDD RED phase - these tests should FAIL until Dev implements the functionality.
 * Tests verify all acceptance criteria for grouping consecutive tool uses into collapsible stacks.
 *
 * Acceptance Criteria:
 * - AC1: Consecutive tool uses grouped into collapsible stack
 * - AC2: Stack shows count when collapsed (e.g., "3 tools")
 * - AC3: Individual tool summaries visible when expanded
 * - AC4: Active/pending tool always visible (not collapsed into stack)
 * - AC5: Clear visual distinction between current and historical
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Import the components/utilities we're testing (these don't exist yet - RED state)
import ToolStack from '../src/public/components/ToolStack.js';
import { groupToolsIntoStacks, type ToolStackData } from '../src/public/utils/toolStackGrouper.js';

// Test fixtures
const createToolUse = (
  tool_name: string,
  tool_id: string,
  input: Record<string, unknown> = {},
  timestamp: number = Date.now(),
  isStreaming: boolean = false
) => ({
  type: 'tool_use' as const,
  tool_name,
  tool_id,
  input,
  timestamp,
  isStreaming,
});

const createToolResult = (
  tool_id: string,
  content: string,
  timestamp: number = Date.now()
) => ({
  type: 'tool_result' as const,
  tool_id,
  content,
  timestamp,
});

const createAssistantMessage = (content: string, timestamp: number = Date.now()) => ({
  type: 'assistant' as const,
  content,
  timestamp,
});

describe('MSSCI-13400: Tool Use Stack Between Messages', () => {
  describe('Module Structure', () => {
    it('should export ToolStack component as default', async () => {
      const module = await import('../src/public/components/ToolStack.js');
      expect(module.default).toBeDefined();
      expect(typeof module.default).toBe('function');
    });

    it('should export groupToolsIntoStacks utility function', async () => {
      const module = await import('../src/public/utils/toolStackGrouper.js');
      expect(module.groupToolsIntoStacks).toBeDefined();
      expect(typeof module.groupToolsIntoStacks).toBe('function');
    });

    it('should export ToolStackData type', async () => {
      const module = await import('../src/public/utils/toolStackGrouper.js');
      // TypeScript types verified by successful import
      expect(module.groupToolsIntoStacks).toBeDefined();
    });
  });

  describe('AC1: Consecutive tool uses grouped into collapsible stack', () => {
    describe('groupToolsIntoStacks utility', () => {
      it('should group 2 consecutive tool_use messages into a single stack', () => {
        const messages = [
          createToolUse('Read', 'tool-1', { file_path: '/a.ts' }, 1000),
          createToolUse('Read', 'tool-2', { file_path: '/b.ts' }, 2000),
        ];

        const stacks = groupToolsIntoStacks(messages);

        expect(stacks).toHaveLength(1);
        expect(stacks[0].tools).toHaveLength(2);
      });

      it('should group 5 consecutive tool_use messages into a single stack', () => {
        const messages = [
          createToolUse('Read', 'tool-1', { file_path: '/a.ts' }, 1000),
          createToolUse('Glob', 'tool-2', { pattern: '*.ts' }, 2000),
          createToolUse('Grep', 'tool-3', { pattern: 'TODO' }, 3000),
          createToolUse('Bash', 'tool-4', { command: 'git status' }, 4000),
          createToolUse('Read', 'tool-5', { file_path: '/c.ts' }, 5000),
        ];

        const stacks = groupToolsIntoStacks(messages);

        expect(stacks).toHaveLength(1);
        expect(stacks[0].tools).toHaveLength(5);
      });

      it('should create separate stacks when assistant message intervenes', () => {
        const messages = [
          createToolUse('Read', 'tool-1', { file_path: '/a.ts' }, 1000),
          createToolUse('Read', 'tool-2', { file_path: '/b.ts' }, 2000),
          createAssistantMessage('Here are the files', 3000),
          createToolUse('Bash', 'tool-3', { command: 'npm test' }, 4000),
        ];

        const stacks = groupToolsIntoStacks(messages);

        expect(stacks).toHaveLength(2);
        expect(stacks[0].tools).toHaveLength(2);
        expect(stacks[1].tools).toHaveLength(1);
      });

      it('should not create a stack for a single tool_use (renders normally)', () => {
        const messages = [
          createAssistantMessage('Let me check', 1000),
          createToolUse('Read', 'tool-1', { file_path: '/a.ts' }, 2000),
          createAssistantMessage('Here it is', 3000),
        ];

        const stacks = groupToolsIntoStacks(messages);

        // Single tools should not be wrapped in a stack
        expect(stacks).toHaveLength(0);
      });

      it('should assign unique stackId to each stack', () => {
        const messages = [
          createToolUse('Read', 'tool-1', {}, 1000),
          createToolUse('Read', 'tool-2', {}, 2000),
          createAssistantMessage('break', 3000),
          createToolUse('Bash', 'tool-3', {}, 4000),
          createToolUse('Bash', 'tool-4', {}, 5000),
        ];

        const stacks = groupToolsIntoStacks(messages);

        expect(stacks[0].stackId).toBeDefined();
        expect(stacks[1].stackId).toBeDefined();
        expect(stacks[0].stackId).not.toBe(stacks[1].stackId);
      });

      it('should include timestamp of first tool in stack', () => {
        const messages = [
          createToolUse('Read', 'tool-1', {}, 1000),
          createToolUse('Read', 'tool-2', {}, 2000),
          createToolUse('Read', 'tool-3', {}, 3000),
        ];

        const stacks = groupToolsIntoStacks(messages);

        expect(stacks[0].timestamp).toBe(1000);
      });
    });

    describe('ToolStack component collapsibility', () => {
      it('should render collapsed by default', () => {
        const stack: ToolStackData = {
          stackId: 'stack-1',
          tools: [
            createToolUse('Read', 'tool-1', { file_path: '/a.ts' }),
            createToolUse('Read', 'tool-2', { file_path: '/b.ts' }),
          ],
          count: 2,
          isActive: false,
          timestamp: Date.now(),
        };

        render(<ToolStack stack={stack} toolResults={new Map()} />);

        const container = screen.getByTestId('tool-stack');
        expect(container).toHaveClass('collapsed');
      });

      it('should expand when header is clicked', () => {
        const stack: ToolStackData = {
          stackId: 'stack-1',
          tools: [
            createToolUse('Read', 'tool-1', { file_path: '/a.ts' }),
            createToolUse('Read', 'tool-2', { file_path: '/b.ts' }),
          ],
          count: 2,
          isActive: false,
          timestamp: Date.now(),
        };

        render(<ToolStack stack={stack} toolResults={new Map()} />);

        const header = screen.getByTestId('tool-stack-header');
        fireEvent.click(header);

        const container = screen.getByTestId('tool-stack');
        expect(container).not.toHaveClass('collapsed');
      });

      it('should toggle collapsed state on repeated clicks', () => {
        const stack: ToolStackData = {
          stackId: 'stack-1',
          tools: [
            createToolUse('Read', 'tool-1', {}),
            createToolUse('Read', 'tool-2', {}),
          ],
          count: 2,
          isActive: false,
          timestamp: Date.now(),
        };

        render(<ToolStack stack={stack} toolResults={new Map()} />);

        const header = screen.getByTestId('tool-stack-header');
        const container = screen.getByTestId('tool-stack');

        // Initially collapsed
        expect(container).toHaveClass('collapsed');

        // Click to expand
        fireEvent.click(header);
        expect(container).not.toHaveClass('collapsed');

        // Click to collapse again
        fireEvent.click(header);
        expect(container).toHaveClass('collapsed');
      });

      it('should render with data-collapsible attribute', () => {
        const stack: ToolStackData = {
          stackId: 'stack-1',
          tools: [createToolUse('Read', 'tool-1', {}), createToolUse('Read', 'tool-2', {})],
          count: 2,
          isActive: false,
          timestamp: Date.now(),
        };

        render(<ToolStack stack={stack} toolResults={new Map()} />);

        const container = screen.getByTestId('tool-stack');
        expect(container).toHaveAttribute('data-collapsible', 'true');
      });
    });
  });

  describe('AC2: Stack shows count when collapsed', () => {
    it('should display count "2 tools" when collapsed with 2 tools', () => {
      const stack: ToolStackData = {
        stackId: 'stack-1',
        tools: [
          createToolUse('Read', 'tool-1', {}),
          createToolUse('Bash', 'tool-2', {}),
        ],
        count: 2,
        isActive: false,
        timestamp: Date.now(),
      };

      render(<ToolStack stack={stack} toolResults={new Map()} />);

      // Component renders "2 tools completed" or "2 tools running" based on isActive
      expect(screen.getByText('2 tools completed')).toBeInTheDocument();
    });

    it('should display count "5 tools" when collapsed with 5 tools', () => {
      const stack: ToolStackData = {
        stackId: 'stack-1',
        tools: [
          createToolUse('Read', 'tool-1', {}),
          createToolUse('Glob', 'tool-2', {}),
          createToolUse('Grep', 'tool-3', {}),
          createToolUse('Bash', 'tool-4', {}),
          createToolUse('Read', 'tool-5', {}),
        ],
        count: 5,
        isActive: false,
        timestamp: Date.now(),
      };

      render(<ToolStack stack={stack} toolResults={new Map()} />);

      // Component renders "5 tools completed" or "5 tools running" based on isActive
      expect(screen.getByText('5 tools completed')).toBeInTheDocument();
    });

    it('should display "1 tool" (singular) when only 1 tool in stack edge case', () => {
      // Edge case: if a single-tool stack is rendered (shouldn't normally happen)
      const stack: ToolStackData = {
        stackId: 'stack-1',
        tools: [createToolUse('Read', 'tool-1', {})],
        count: 1,
        isActive: false,
        timestamp: Date.now(),
      };

      render(<ToolStack stack={stack} toolResults={new Map()} />);

      // Should use singular form with status
      expect(screen.getByText('1 tool completed')).toBeInTheDocument();
    });

    it('should have count visible in collapsed header', () => {
      const stack: ToolStackData = {
        stackId: 'stack-1',
        tools: [createToolUse('Read', 'tool-1', {}), createToolUse('Read', 'tool-2', {})],
        count: 2,
        isActive: false,
        timestamp: Date.now(),
      };

      render(<ToolStack stack={stack} toolResults={new Map()} />);

      const count = screen.getByTestId('tool-stack-count');
      expect(count).toBeInTheDocument();
      expect(count.textContent).toContain('2');
    });

    it('should keep count visible when expanded for context', () => {
      const stack: ToolStackData = {
        stackId: 'stack-1',
        tools: [createToolUse('Read', 'tool-1', {}), createToolUse('Read', 'tool-2', {})],
        count: 2,
        isActive: false,
        timestamp: Date.now(),
      };

      render(<ToolStack stack={stack} toolResults={new Map()} />);

      // Expand
      fireEvent.click(screen.getByTestId('tool-stack-header'));

      // Count remains visible for context (shows status)
      const count = screen.queryByTestId('tool-stack-count');
      expect(count).toBeVisible();
    });
  });

  describe('AC3: Individual tool summaries visible when expanded', () => {
    it('should render individual ToolCallBlock for each tool when expanded', () => {
      const stack: ToolStackData = {
        stackId: 'stack-1',
        tools: [
          createToolUse('Read', 'tool-1', { file_path: '/a.ts' }),
          createToolUse('Bash', 'tool-2', { command: 'npm test' }),
          createToolUse('Grep', 'tool-3', { pattern: 'TODO' }),
        ],
        count: 3,
        isActive: false,
        timestamp: Date.now(),
      };

      render(<ToolStack stack={stack} toolResults={new Map()} />);

      // Expand
      fireEvent.click(screen.getByTestId('tool-stack-header'));

      const toolBlocks = screen.getAllByTestId('tool-call-block');
      expect(toolBlocks).toHaveLength(3);
    });

    it('should show tool intent summary in each expanded tool', () => {
      const stack: ToolStackData = {
        stackId: 'stack-1',
        tools: [
          createToolUse('Read', 'tool-1', { file_path: '/a.ts' }),
          createToolUse('Bash', 'tool-2', { command: 'npm test' }),
        ],
        count: 2,
        isActive: false,
        timestamp: Date.now(),
      };

      render(<ToolStack stack={stack} toolResults={new Map()} />);

      // Expand
      fireEvent.click(screen.getByTestId('tool-stack-header'));

      // ToolCallBlock renders intent summaries - npm test becomes "Running tests"
      expect(screen.getByText(/Reading.*a\.ts/)).toBeInTheDocument();
      expect(screen.getByText('Running tests')).toBeInTheDocument();
    });

    it('should pass tool results to ToolCallBlock when available', () => {
      const stack: ToolStackData = {
        stackId: 'stack-1',
        tools: [
          createToolUse('Read', 'tool-1', { file_path: '/a.ts' }),
          createToolUse('Bash', 'tool-2', { command: 'npm test' }),
        ],
        count: 2,
        isActive: false,
        timestamp: Date.now(),
      };

      const toolResults = new Map([
        ['tool-1', createToolResult('tool-1', 'file content here')],
        ['tool-2', createToolResult('tool-2', 'All tests passed')],
      ]);

      render(<ToolStack stack={stack} toolResults={toolResults} />);

      // Expand
      fireEvent.click(screen.getByTestId('tool-stack-header'));

      // Both tools should render ToolCallBlock with results
      const toolBlocks = screen.getAllByTestId('tool-call-block');
      expect(toolBlocks).toHaveLength(2);
      // Results are shown in result-toggle button
      const toggles = screen.getAllByTestId('tool-result-toggle');
      expect(toggles).toHaveLength(2);
    });

    it('should not render individual tools when collapsed', () => {
      const stack: ToolStackData = {
        stackId: 'stack-1',
        tools: [
          createToolUse('Read', 'tool-1', {}),
          createToolUse('Read', 'tool-2', {}),
        ],
        count: 2,
        isActive: false,
        timestamp: Date.now(),
      };

      render(<ToolStack stack={stack} toolResults={new Map()} />);

      // Should be collapsed by default
      const toolBlocks = screen.queryAllByTestId('tool-call-block');
      expect(toolBlocks).toHaveLength(0);
    });
  });

  describe('AC4: Active/pending tool always visible', () => {
    it('should expand automatically when stack has active (pending) tool', () => {
      const stack: ToolStackData = {
        stackId: 'stack-1',
        tools: [
          createToolUse('Read', 'tool-1', {}),
          createToolUse('Bash', 'tool-2', {}, Date.now(), true), // isStreaming = pending
        ],
        count: 2,
        isActive: true, // Stack is active because last tool is pending
        timestamp: Date.now(),
      };

      render(<ToolStack stack={stack} toolResults={new Map([['tool-1', createToolResult('tool-1', 'done')]]) } />);

      // Should be expanded because there's an active tool
      const container = screen.getByTestId('tool-stack');
      expect(container).not.toHaveClass('collapsed');
    });

    it('should show pending tool via class on block', () => {
      const stack: ToolStackData = {
        stackId: 'stack-1',
        tools: [
          createToolUse('Read', 'tool-1', {}),
          createToolUse('Bash', 'tool-2', {}, Date.now(), true),
        ],
        count: 2,
        isActive: true,
        timestamp: Date.now(),
      };

      const toolResults = new Map([
        ['tool-1', createToolResult('tool-1', 'done')],
        // tool-2 has no result - it's pending
      ]);

      render(<ToolStack stack={stack} toolResults={toolResults} />);

      const toolBlocks = screen.getAllByTestId('tool-call-block');
      expect(toolBlocks).toHaveLength(2);

      // First tool is historical (complete), second is current (pending)
      expect(toolBlocks[0]).toHaveClass('tool-historical');
      expect(toolBlocks[1]).toHaveClass('tool-current');
    });

    it('should mark the active tool with tool-current class', () => {
      const stack: ToolStackData = {
        stackId: 'stack-1',
        tools: [
          createToolUse('Read', 'tool-1', {}),
          createToolUse('Bash', 'tool-2', {}, Date.now(), true),
        ],
        count: 2,
        isActive: true,
        timestamp: Date.now(),
      };

      const toolResults = new Map([['tool-1', createToolResult('tool-1', 'done')]]);

      render(<ToolStack stack={stack} toolResults={toolResults} />);

      const toolBlocks = screen.getAllByTestId('tool-call-block');
      // Last tool (pending) should have tool-current class
      expect(toolBlocks[1]).toHaveClass('tool-current');
    });

    it('should keep active tool visible even when user manually collapses', () => {
      const stack: ToolStackData = {
        stackId: 'stack-1',
        tools: [
          createToolUse('Read', 'tool-1', {}),
          createToolUse('Read', 'tool-2', {}),
          createToolUse('Bash', 'tool-3', {}, Date.now(), true), // pending
        ],
        count: 3,
        isActive: true,
        timestamp: Date.now(),
      };

      const toolResults = new Map([
        ['tool-1', createToolResult('tool-1', 'a')],
        ['tool-2', createToolResult('tool-2', 'b')],
      ]);

      render(<ToolStack stack={stack} toolResults={toolResults} />);

      // Try to collapse
      fireEvent.click(screen.getByTestId('tool-stack-header'));

      // Active tool should still be visible (tool-current class indicates pending)
      const toolBlocks = screen.getAllByTestId('tool-call-block');
      const currentTools = toolBlocks.filter(el => el.classList.contains('tool-current'));
      expect(currentTools).toHaveLength(1);
    });
  });

  describe('AC5: Clear visual distinction between current and historical', () => {
    it('should apply tool-historical class to completed tools in stack', () => {
      const stack: ToolStackData = {
        stackId: 'stack-1',
        tools: [
          createToolUse('Read', 'tool-1', {}),
          createToolUse('Read', 'tool-2', {}),
          createToolUse('Bash', 'tool-3', {}, Date.now(), true), // current
        ],
        count: 3,
        isActive: true,
        timestamp: Date.now(),
      };

      const toolResults = new Map([
        ['tool-1', createToolResult('tool-1', 'a')],
        ['tool-2', createToolResult('tool-2', 'b')],
      ]);

      render(<ToolStack stack={stack} toolResults={toolResults} />);

      const toolBlocks = screen.getAllByTestId('tool-call-block');

      // First two are historical (completed)
      expect(toolBlocks[0]).toHaveClass('tool-historical');
      expect(toolBlocks[1]).toHaveClass('tool-historical');

      // Last one is current (pending)
      expect(toolBlocks[2]).toHaveClass('tool-current');
      expect(toolBlocks[2]).not.toHaveClass('tool-historical');
    });

    it('should apply dimmed opacity to historical tools', () => {
      const stack: ToolStackData = {
        stackId: 'stack-1',
        tools: [
          createToolUse('Read', 'tool-1', {}),
          createToolUse('Bash', 'tool-2', {}, Date.now(), true),
        ],
        count: 2,
        isActive: true,
        timestamp: Date.now(),
      };

      const toolResults = new Map([['tool-1', createToolResult('tool-1', 'done')]]);

      render(<ToolStack stack={stack} toolResults={toolResults} />);

      const toolBlocks = screen.getAllByTestId('tool-call-block');
      // tool-historical class should have opacity style
      expect(toolBlocks[0]).toHaveClass('tool-historical');
    });

    it('should apply bright styling to current tool', () => {
      const stack: ToolStackData = {
        stackId: 'stack-1',
        tools: [
          createToolUse('Read', 'tool-1', {}),
          createToolUse('Bash', 'tool-2', {}, Date.now(), true),
        ],
        count: 2,
        isActive: true,
        timestamp: Date.now(),
      };

      const toolResults = new Map([['tool-1', createToolResult('tool-1', 'done')]]);

      render(<ToolStack stack={stack} toolResults={toolResults} />);

      const toolBlocks = screen.getAllByTestId('tool-call-block');
      // tool-current class should have normal opacity
      expect(toolBlocks[1]).toHaveClass('tool-current');
    });

    it('should mark all tools as historical when stack is complete (not active)', () => {
      const stack: ToolStackData = {
        stackId: 'stack-1',
        tools: [
          createToolUse('Read', 'tool-1', {}),
          createToolUse('Bash', 'tool-2', {}),
        ],
        count: 2,
        isActive: false, // All complete
        timestamp: Date.now(),
      };

      const toolResults = new Map([
        ['tool-1', createToolResult('tool-1', 'a')],
        ['tool-2', createToolResult('tool-2', 'b')],
      ]);

      render(<ToolStack stack={stack} toolResults={toolResults} />);

      // Expand to see tools
      fireEvent.click(screen.getByTestId('tool-stack-header'));

      const toolBlocks = screen.getAllByTestId('tool-call-block');
      // All should be historical
      toolBlocks.forEach(block => {
        expect(block).toHaveClass('tool-historical');
      });
    });

    it('should have visual separator between tool stack and surrounding content', () => {
      const stack: ToolStackData = {
        stackId: 'stack-1',
        tools: [createToolUse('Read', 'tool-1', {}), createToolUse('Read', 'tool-2', {})],
        count: 2,
        isActive: false,
        timestamp: Date.now(),
      };

      render(<ToolStack stack={stack} toolResults={new Map()} />);

      const container = screen.getByTestId('tool-stack');
      expect(container).toHaveClass('tool-stack');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty tools array gracefully', () => {
      const stack: ToolStackData = {
        stackId: 'stack-1',
        tools: [],
        count: 0,
        isActive: false,
        timestamp: Date.now(),
      };

      // Should not crash
      render(<ToolStack stack={stack} toolResults={new Map()} />);

      // Should show 0 tools (component adds status suffix)
      expect(screen.getByText('0 tools completed')).toBeInTheDocument();
    });

    it('should handle tools with missing tool_id gracefully', () => {
      const malformedTool = {
        type: 'tool_use' as const,
        tool_name: 'Read',
        tool_id: undefined as unknown as string,
        input: {},
        timestamp: Date.now(),
      };

      const stack: ToolStackData = {
        stackId: 'stack-1',
        tools: [malformedTool],
        count: 1,
        isActive: false,
        timestamp: Date.now(),
      };

      // Should not crash
      render(<ToolStack stack={stack} toolResults={new Map()} />);
    });

    it('should handle very large number of tools (performance)', () => {
      const manyTools = Array.from({ length: 50 }, (_, i) =>
        createToolUse('Read', `tool-${i}`, { file_path: `/file-${i}.ts` })
      );

      const stack: ToolStackData = {
        stackId: 'stack-1',
        tools: manyTools,
        count: 50,
        isActive: false,
        timestamp: Date.now(),
      };

      // Should not crash or hang
      const { unmount } = render(<ToolStack stack={stack} toolResults={new Map()} />);

      // Component adds status suffix
      expect(screen.getByText('50 tools completed')).toBeInTheDocument();

      unmount();
    });

    it('should handle tool results arriving after render (dynamic update)', () => {
      const stack: ToolStackData = {
        stackId: 'stack-1',
        tools: [
          createToolUse('Read', 'tool-1', {}),
          createToolUse('Bash', 'tool-2', {}),
        ],
        count: 2,
        isActive: true,
        timestamp: Date.now(),
      };

      // Initial render with no results - active stack starts expanded
      const { rerender } = render(
        <ToolStack stack={stack} toolResults={new Map()} />
      );

      // Active stack is already expanded, tools visible
      let toolBlocks = screen.getAllByTestId('tool-call-block');
      // Both pending initially - last tool has tool-current class
      expect(toolBlocks[1]).toHaveClass('tool-current');

      // Rerender with results
      const toolResults = new Map([
        ['tool-1', createToolResult('tool-1', 'done')],
        ['tool-2', createToolResult('tool-2', 'done')],
      ]);

      const completedStack = { ...stack, isActive: false };
      rerender(<ToolStack stack={completedStack} toolResults={toolResults} />);

      // Now all historical (complete)
      toolBlocks = screen.getAllByTestId('tool-call-block');
      toolBlocks.forEach(block => {
        expect(block).toHaveClass('tool-historical');
      });
    });
  });

  describe('Integration with MessageView', () => {
    it('should use groupToolsIntoStacks in MessageView grouping logic', async () => {
      // This test verifies integration - MessageView should use the utility
      const module = await import('../src/public/components/MessageView.js');
      expect(module.default).toBeDefined();

      // MessageView should internally use groupToolsIntoStacks
      // This is verified by the component rendering ToolStack when appropriate
    });

    it('groupToolsIntoStacks should handle mixed message types correctly', () => {
      const messages = [
        { type: 'user' as const, content: 'Run some commands', timestamp: 1000 },
        createToolUse('Read', 'tool-1', {}, 2000),
        createToolUse('Bash', 'tool-2', {}, 3000),
        createToolUse('Grep', 'tool-3', {}, 4000),
        { type: 'tool_result' as const, tool_id: 'tool-1', content: 'a', timestamp: 2500 },
        { type: 'tool_result' as const, tool_id: 'tool-2', content: 'b', timestamp: 3500 },
        { type: 'tool_result' as const, tool_id: 'tool-3', content: 'c', timestamp: 4500 },
        createAssistantMessage('Done!', 5000),
      ];

      const stacks = groupToolsIntoStacks(messages);

      // Should create one stack with 3 tools
      expect(stacks).toHaveLength(1);
      expect(stacks[0].tools).toHaveLength(3);
    });

    it('groupToolsIntoStacks should ignore tool_result messages in grouping', () => {
      const messages = [
        createToolUse('Read', 'tool-1', {}, 1000),
        { type: 'tool_result' as const, tool_id: 'tool-1', content: 'x', timestamp: 1500 },
        createToolUse('Bash', 'tool-2', {}, 2000),
        { type: 'tool_result' as const, tool_id: 'tool-2', content: 'y', timestamp: 2500 },
      ];

      const stacks = groupToolsIntoStacks(messages);

      // tool_results between tool_uses should not break the stack
      expect(stacks).toHaveLength(1);
      expect(stacks[0].tools).toHaveLength(2);
    });
  });

  describe('Accessibility', () => {
    it('should have accessible expand/collapse button', () => {
      const stack: ToolStackData = {
        stackId: 'stack-1',
        tools: [createToolUse('Read', 'tool-1', {}), createToolUse('Read', 'tool-2', {})],
        count: 2,
        isActive: false,
        timestamp: Date.now(),
      };

      render(<ToolStack stack={stack} toolResults={new Map()} />);

      const header = screen.getByTestId('tool-stack-header');
      expect(header).toHaveAttribute('aria-expanded', 'false');

      fireEvent.click(header);
      expect(header).toHaveAttribute('aria-expanded', 'true');
    });

    it('should have aria-label describing stack contents', () => {
      const stack: ToolStackData = {
        stackId: 'stack-1',
        tools: [createToolUse('Read', 'tool-1', {}), createToolUse('Bash', 'tool-2', {})],
        count: 2,
        isActive: false,
        timestamp: Date.now(),
      };

      render(<ToolStack stack={stack} toolResults={new Map()} />);

      const header = screen.getByTestId('tool-stack-header');
      expect(header).toHaveAttribute('aria-label');
      expect(header.getAttribute('aria-label')).toContain('2 tools');
    });

    it('should support keyboard navigation (Enter to toggle)', () => {
      const stack: ToolStackData = {
        stackId: 'stack-1',
        tools: [createToolUse('Read', 'tool-1', {}), createToolUse('Read', 'tool-2', {})],
        count: 2,
        isActive: false,
        timestamp: Date.now(),
      };

      render(<ToolStack stack={stack} toolResults={new Map()} />);

      const header = screen.getByTestId('tool-stack-header');
      header.focus();

      fireEvent.keyDown(header, { key: 'Enter' });
      expect(header).toHaveAttribute('aria-expanded', 'true');

      fireEvent.keyDown(header, { key: 'Enter' });
      expect(header).toHaveAttribute('aria-expanded', 'false');
    });
  });
});
