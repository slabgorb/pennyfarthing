/**
 * MSSCI-14395: Render AskUserQuestion tool via Reflector QuickActions
 *
 * When Claude uses the AskUserQuestion tool, Cyclist should render interactive
 * buttons instead of a collapsed ToolCallBlock with raw JSON. Uses the existing
 * Reflector QuickActions infrastructure.
 *
 * Acceptance Criteria:
 * - AC1: AskUserQuestion tool_use renders interactive buttons instead of collapsed JSON
 * - AC2: Single-select questions show clickable option buttons
 * - AC3: Multi-select questions show checkboxes or toggleable buttons
 * - AC4: User selection is sent back to Claude via WebSocket as a message
 * - AC5: Existing Reflector marker QuickActions continue to work unchanged
 * - AC6: ToolCallBlock still renders normally for all other tool types
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Mock ClaudeContext so QuickActions can send messages
const mockSend = vi.fn();
vi.mock('../src/public/contexts/ClaudeContext', () => ({
  useClaudeContext: () => ({ send: mockSend }),
  ClaudeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock usePersona
vi.mock('../src/public/hooks/usePersona', () => ({
  usePersona: () => ({ persona: null }),
}));

// Mock useColorScheme
vi.mock('../src/public/hooks/useColorScheme', () => ({
  useColorScheme: () => 'dark',
}));

// Mock useStatsStrip
vi.mock('../src/public/hooks/useStatsStrip', () => ({
  useStatsStrip: () => ({ projectInfo: null }),
}));

// Helper: create an AskUserQuestion tool_use MessageData
function makeAskUserQuestionToolUse(
  questions: Array<{
    question: string;
    header: string;
    options: Array<{ label: string; description: string }>;
    multiSelect: boolean;
  }>,
  toolId = 'tool-ask-1'
) {
  return {
    type: 'tool_use' as const,
    tool_name: 'AskUserQuestion',
    tool_id: toolId,
    input: { questions },
    timestamp: Date.now(),
  };
}

// Helper: create a regular tool_use MessageData
function makeRegularToolUse(toolName: string, input: Record<string, unknown>, toolId = 'tool-reg-1') {
  return {
    type: 'tool_use' as const,
    tool_name: toolName,
    tool_id: toolId,
    input,
    timestamp: Date.now(),
  };
}

// Helper: create an agent message with reflector markers
function makeAgentMessage(content: string) {
  return {
    type: 'agent' as const,
    content,
    timestamp: Date.now(),
  };
}

describe('MSSCI-14395: Render AskUserQuestion tool via Reflector QuickActions', () => {

  beforeEach(() => {
    mockSend.mockClear();
  });

  // =========================================================================
  // AC1: AskUserQuestion tool_use renders interactive buttons instead of JSON
  // =========================================================================

  describe('AC1: AskUserQuestion renders interactive buttons', () => {

    it('should detect AskUserQuestion tool_use in MessageView', () => {
      // MessageView must have logic to identify AskUserQuestion tool_use messages
      // and render them differently from other tool_use messages
      const messageViewPath = join(__dirname, '../src/public/components/MessageView.tsx');
      const source = readFileSync(messageViewPath, 'utf-8');

      // MessageView should reference AskUserQuestion somewhere in its rendering logic
      expect(source).toMatch(/AskUserQuestion/);
    });

    it('should not render AskUserQuestion as a ToolCallBlock', () => {
      // When a tool_use has tool_name === 'AskUserQuestion', it should NOT
      // be rendered as a standard ToolCallBlock with collapsed JSON
      const messageViewPath = join(__dirname, '../src/public/components/MessageView.tsx');
      const source = readFileSync(messageViewPath, 'utf-8');

      // There should be a conditional that excludes AskUserQuestion from ToolCallBlock rendering
      // e.g., checking tool_name before rendering ToolCallBlock
      expect(source).toMatch(/tool_name.*===.*['"]AskUserQuestion['"]/);
    });

    it('should render question text prominently', async () => {
      // The question text from the AskUserQuestion input should be displayed
      // to the user, not hidden in collapsed JSON
      const { AskUserQuestionBlock } = await import('../src/public/components/AskUserQuestionBlock');

      const toolUse = makeAskUserQuestionToolUse([{
        question: 'Which library should we use for date formatting?',
        header: 'Library',
        options: [
          { label: 'date-fns', description: 'Lightweight and modular' },
          { label: 'dayjs', description: 'Tiny and immutable' },
        ],
        multiSelect: false,
      }]);

      render(<AskUserQuestionBlock toolUse={toolUse} />);

      expect(screen.getByText('Which library should we use for date formatting?')).toBeTruthy();
    });
  });

  // =========================================================================
  // AC2: Single-select questions show clickable option buttons
  // =========================================================================

  describe('AC2: Single-select questions show clickable option buttons', () => {

    it('should render a button for each option', async () => {
      const { AskUserQuestionBlock } = await import('../src/public/components/AskUserQuestionBlock');

      const toolUse = makeAskUserQuestionToolUse([{
        question: 'Which approach should we take?',
        header: 'Approach',
        options: [
          { label: 'Option A', description: 'Fast but risky' },
          { label: 'Option B', description: 'Slower but safer' },
          { label: 'Option C', description: 'Balanced approach' },
        ],
        multiSelect: false,
      }]);

      render(<AskUserQuestionBlock toolUse={toolUse} />);

      // Each option should have a clickable button
      expect(screen.getByText('Option A')).toBeTruthy();
      expect(screen.getByText('Option B')).toBeTruthy();
      expect(screen.getByText('Option C')).toBeTruthy();
    });

    it('should show option descriptions', async () => {
      const { AskUserQuestionBlock } = await import('../src/public/components/AskUserQuestionBlock');

      const toolUse = makeAskUserQuestionToolUse([{
        question: 'Which framework?',
        header: 'Framework',
        options: [
          { label: 'React', description: 'Component-based UI library' },
          { label: 'Vue', description: 'Progressive framework' },
        ],
        multiSelect: false,
      }]);

      render(<AskUserQuestionBlock toolUse={toolUse} />);

      expect(screen.getByText('Component-based UI library')).toBeTruthy();
      expect(screen.getByText('Progressive framework')).toBeTruthy();
    });

    it('should show header as a label/tag', async () => {
      const { AskUserQuestionBlock } = await import('../src/public/components/AskUserQuestionBlock');

      const toolUse = makeAskUserQuestionToolUse([{
        question: 'Which database?',
        header: 'Database',
        options: [
          { label: 'PostgreSQL', description: 'Relational' },
          { label: 'MongoDB', description: 'Document store' },
        ],
        multiSelect: false,
      }]);

      render(<AskUserQuestionBlock toolUse={toolUse} />);

      expect(screen.getByText('Database')).toBeTruthy();
    });

    it('should disable buttons after selection in single-select mode', async () => {
      const { AskUserQuestionBlock } = await import('../src/public/components/AskUserQuestionBlock');

      const toolUse = makeAskUserQuestionToolUse([{
        question: 'Pick one',
        header: 'Choice',
        options: [
          { label: 'Alpha', description: 'First' },
          { label: 'Beta', description: 'Second' },
        ],
        multiSelect: false,
      }]);

      render(<AskUserQuestionBlock toolUse={toolUse} />);

      const alphaButton = screen.getByText('Alpha').closest('button');
      expect(alphaButton).toBeTruthy();

      fireEvent.click(alphaButton!);

      // After clicking, all buttons should be disabled
      const allButtons = screen.getAllByRole('button');
      allButtons.forEach(btn => {
        expect(btn).toHaveAttribute('disabled');
      });
    });
  });

  // =========================================================================
  // AC3: Multi-select questions show toggleable buttons
  // =========================================================================

  describe('AC3: Multi-select questions show toggleable buttons', () => {

    it('should allow multiple selections when multiSelect is true', async () => {
      const { AskUserQuestionBlock } = await import('../src/public/components/AskUserQuestionBlock');

      const toolUse = makeAskUserQuestionToolUse([{
        question: 'Which features do you want?',
        header: 'Features',
        options: [
          { label: 'Auth', description: 'Authentication' },
          { label: 'Search', description: 'Full-text search' },
          { label: 'Export', description: 'Data export' },
        ],
        multiSelect: true,
      }]);

      render(<AskUserQuestionBlock toolUse={toolUse} />);

      // Click multiple options — they should toggle
      const authButton = screen.getByText('Auth').closest('button');
      const searchButton = screen.getByText('Search').closest('button');

      fireEvent.click(authButton!);
      fireEvent.click(searchButton!);

      // Both should show selected state (e.g., aria-pressed or visual indicator)
      expect(authButton).toHaveAttribute('aria-pressed', 'true');
      expect(searchButton).toHaveAttribute('aria-pressed', 'true');
    });

    it('should have a submit button for multi-select questions', async () => {
      const { AskUserQuestionBlock } = await import('../src/public/components/AskUserQuestionBlock');

      const toolUse = makeAskUserQuestionToolUse([{
        question: 'Select features',
        header: 'Features',
        options: [
          { label: 'A', description: 'Feature A' },
          { label: 'B', description: 'Feature B' },
        ],
        multiSelect: true,
      }]);

      render(<AskUserQuestionBlock toolUse={toolUse} />);

      // Multi-select needs a submit/confirm button to send all selections at once
      expect(screen.getByRole('button', { name: /submit|confirm|done/i })).toBeTruthy();
    });

    it('should toggle selection on repeated click', async () => {
      const { AskUserQuestionBlock } = await import('../src/public/components/AskUserQuestionBlock');

      const toolUse = makeAskUserQuestionToolUse([{
        question: 'Toggle test',
        header: 'Test',
        options: [
          { label: 'Toggle Me', description: 'Toggleable option' },
        ],
        multiSelect: true,
      }]);

      render(<AskUserQuestionBlock toolUse={toolUse} />);

      const button = screen.getByText('Toggle Me').closest('button');
      fireEvent.click(button!);
      expect(button).toHaveAttribute('aria-pressed', 'true');

      fireEvent.click(button!);
      expect(button).toHaveAttribute('aria-pressed', 'false');
    });
  });

  // =========================================================================
  // AC4: User selection is sent back to Claude via WebSocket
  // =========================================================================

  describe('AC4: User selection sent via WebSocket', () => {

    it('should send single-select choice as message to Claude', async () => {
      const { AskUserQuestionBlock } = await import('../src/public/components/AskUserQuestionBlock');

      const toolUse = makeAskUserQuestionToolUse([{
        question: 'Pick one',
        header: 'Choice',
        options: [
          { label: 'Alpha', description: 'First option' },
          { label: 'Beta', description: 'Second option' },
        ],
        multiSelect: false,
      }]);

      render(<AskUserQuestionBlock toolUse={toolUse} />);

      const betaButton = screen.getByText('Beta').closest('button');
      fireEvent.click(betaButton!);

      // Should send the selected option label via claudeSend
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith(expect.stringContaining('Beta'), expect.anything());
    });

    it('should send multi-select choices as message to Claude', async () => {
      const { AskUserQuestionBlock } = await import('../src/public/components/AskUserQuestionBlock');

      const toolUse = makeAskUserQuestionToolUse([{
        question: 'Select many',
        header: 'Multi',
        options: [
          { label: 'X', description: 'Option X' },
          { label: 'Y', description: 'Option Y' },
          { label: 'Z', description: 'Option Z' },
        ],
        multiSelect: true,
      }]);

      render(<AskUserQuestionBlock toolUse={toolUse} />);

      // Select X and Z
      fireEvent.click(screen.getByText('X').closest('button')!);
      fireEvent.click(screen.getByText('Z').closest('button')!);

      // Click submit
      const submitButton = screen.getByRole('button', { name: /submit|confirm|done/i });
      fireEvent.click(submitButton);

      // Should send both selections
      expect(mockSend).toHaveBeenCalledTimes(1);
      const sentText = mockSend.mock.calls[0][0];
      expect(sentText).toContain('X');
      expect(sentText).toContain('Z');
    });

    it('should not send message until user clicks (no auto-execute)', async () => {
      const { AskUserQuestionBlock } = await import('../src/public/components/AskUserQuestionBlock');

      const toolUse = makeAskUserQuestionToolUse([{
        question: 'Wait for click',
        header: 'Wait',
        options: [
          { label: 'Go', description: 'Proceed' },
        ],
        multiSelect: false,
      }]);

      render(<AskUserQuestionBlock toolUse={toolUse} />);

      // Should not auto-send anything
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // AC5: Existing Reflector marker QuickActions continue to work unchanged
  // =========================================================================

  describe('AC5: Existing Reflector markers still work', () => {

    it('should still render yes/no QuickActions from CYCLIST:QUESTION:yesno markers', async () => {
      const QuickActions = (await import('../src/public/components/QuickActions')).default;

      const message = makeAgentMessage(
        'Do you want to continue?\n<!-- CYCLIST:QUESTION:yesno -->'
      );

      render(<QuickActions message={message} />);

      expect(screen.getByText('Yes')).toBeTruthy();
      expect(screen.getByText('No')).toBeTruthy();
    });

    it('should still render choice buttons from CYCLIST:CHOICES markers', async () => {
      const QuickActions = (await import('../src/public/components/QuickActions')).default;

      const message = makeAgentMessage(
        'Pick a framework:\n1. React\n2. Vue\n<!-- CYCLIST:CHOICES:1,2 -->'
      );

      render(<QuickActions message={message} />);

      expect(screen.getByText('React')).toBeTruthy();
      expect(screen.getByText('Vue')).toBeTruthy();
    });

    it('should still render handoff buttons from CYCLIST:HANDOFF markers', async () => {
      const QuickActions = (await import('../src/public/components/QuickActions')).default;

      const message = makeAgentMessage(
        'Ready for dev.\n<!-- CYCLIST:HANDOFF:/dev -->'
      );

      render(<QuickActions message={message} />);

      expect(screen.getByText('/dev')).toBeTruthy();
    });
  });

  // =========================================================================
  // AC6: ToolCallBlock still renders normally for all other tool types
  // =========================================================================

  describe('AC6: Other tool types render as ToolCallBlock', () => {

    it('should render Bash tool_use as ToolCallBlock', () => {
      // MessageView should still render non-AskUserQuestion tool_use as ToolCallBlock
      const messageViewPath = join(__dirname, '../src/public/components/MessageView.tsx');
      const source = readFileSync(messageViewPath, 'utf-8');

      // ToolCallBlock import must still exist
      expect(source).toMatch(/import.*ToolCallBlock/);

      // The conditional should only intercept AskUserQuestion, not other tools
      // Verify ToolCallBlock is still used in the render path
      expect(source).toMatch(/<ToolCallBlock/);
    });

    it('should not intercept Read tool_use messages', async () => {
      // Verify the AskUserQuestionBlock component only handles AskUserQuestion
      const { isAskUserQuestion } = await import('../src/public/utils/askUserQuestion');

      const readToolUse = makeRegularToolUse('Read', { file_path: '/foo/bar.ts' });
      expect(isAskUserQuestion(readToolUse)).toBe(false);
    });

    it('should correctly identify AskUserQuestion tool_use', async () => {
      const { isAskUserQuestion } = await import('../src/public/utils/askUserQuestion');

      const askToolUse = makeAskUserQuestionToolUse([{
        question: 'Test?',
        header: 'Test',
        options: [{ label: 'Yes', description: 'Confirm' }],
        multiSelect: false,
      }]);
      expect(isAskUserQuestion(askToolUse)).toBe(true);
    });

    it('should handle multiple questions in one AskUserQuestion tool_use', async () => {
      const { AskUserQuestionBlock } = await import('../src/public/components/AskUserQuestionBlock');

      const toolUse = makeAskUserQuestionToolUse([
        {
          question: 'First question?',
          header: 'Q1',
          options: [
            { label: 'A1', description: 'Answer 1' },
            { label: 'A2', description: 'Answer 2' },
          ],
          multiSelect: false,
        },
        {
          question: 'Second question?',
          header: 'Q2',
          options: [
            { label: 'B1', description: 'Answer B1' },
            { label: 'B2', description: 'Answer B2' },
          ],
          multiSelect: false,
        },
      ]);

      render(<AskUserQuestionBlock toolUse={toolUse} />);

      // Both questions should be visible
      expect(screen.getByText('First question?')).toBeTruthy();
      expect(screen.getByText('Second question?')).toBeTruthy();

      // All options from both questions should be present
      expect(screen.getByText('A1')).toBeTruthy();
      expect(screen.getByText('B1')).toBeTruthy();
    });
  });
});
