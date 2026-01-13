/**
 * B-9.6: Suggested Prompt Insertion - List Choices Tests
 *
 * Tests for numbered list pattern detection and choice buttons.
 *
 * Acceptance Criteria covered:
 * - AC7: Detects numbered list patterns ("1. Option", "2. Option")
 * - AC8: Shows numbered buttons with truncated option text
 * - AC9: Clicking numbered button inserts just the number
 * - AC10: Handles 2-10 options gracefully
 * - AC11: Falls back gracefully (no false positives)
 */

import { describe, it, expect } from 'vitest';
import {
  getMessageView,
  mockInsertAndSubmit,
} from './helpers/suggested-prompts-helpers.js';

describe('B-9.6: List Choices Detection', () => {

  describe('AC7: Detects numbered list patterns', () => {

    it('should detect "1. Option" pattern', async () => {
      const { detectListChoices } = await getMessageView();

      const text = `Here are your options:
1. Create new component
2. Modify existing file
3. Skip this step`;

      const result = detectListChoices(text);

      expect(result).not.toBeNull();
      expect(result.choices).toHaveLength(3);
      expect(result.choices[0]).toEqual({ number: 1, text: 'Create new component' });
      expect(result.choices[1]).toEqual({ number: 2, text: 'Modify existing file' });
      expect(result.choices[2]).toEqual({ number: 3, text: 'Skip this step' });
    });

    it('should detect "1) Option" pattern', async () => {
      const { detectListChoices } = await getMessageView();

      const text = `Choose one:
1) First option
2) Second option`;

      const result = detectListChoices(text);

      expect(result).not.toBeNull();
      expect(result.choices).toHaveLength(2);
    });

    it('should detect "**1.** Option" pattern', async () => {
      const { detectListChoices } = await getMessageView();

      const text = `Which approach would you prefer?

**1.** Create new component
**2.** Modify existing file`;

      const result = detectListChoices(text);

      expect(result).not.toBeNull();
      expect(result.choices).toHaveLength(2);
    });

    it('should return null for non-list text', async () => {
      const { detectListChoices } = await getMessageView();

      const result = detectListChoices('This is just a regular paragraph.');

      expect(result).toBeNull();
    });

    it('should require at least 2 choices to detect as list', async () => {
      const { detectListChoices } = await getMessageView();

      const text = '1. Only one option here';

      const result = detectListChoices(text);

      expect(result).toBeNull();
    });

  });

  describe('AC8: Shows numbered buttons with truncated option text', () => {

    it('should render numbered buttons for list choices', async () => {
      const { renderQuickActions } = await getMessageView();

      const result = {
        type: 'list',
        choices: [
          { number: 1, text: 'Create new component' },
          { number: 2, text: 'Modify existing file' },
        ]
      };

      const html = renderQuickActions(result);

      // List buttons show just the text (no number prefix), number is in data-response
      expect(html).toContain('Create new component');
      expect(html).toContain('Modify existing file');
      expect(html).toContain('data-response="1"');
      expect(html).toContain('data-response="2"');
    });

    it('should truncate long option text to ~20 chars', async () => {
      const { renderQuickActions } = await getMessageView();

      const result = {
        type: 'list',
        choices: [
          { number: 1, text: 'This is a very long option text that should be truncated' },
        ]
      };

      const html = renderQuickActions(result);

      expect(html).toContain('...');
      expect(html).not.toContain('should be truncated');
    });

    it('should export truncateText helper function', async () => {
      const messageView = await getMessageView();

      expect(messageView.truncateText).toBeDefined();
      expect(typeof messageView.truncateText).toBe('function');
    });

    it('should truncate text correctly', async () => {
      const { truncateText } = await getMessageView();

      expect(truncateText('Short text', 20)).toBe('Short text');
      expect(truncateText('This is a very long text that exceeds limit', 20)).toBe('This is a very long...');
    });

  });

  describe('AC9: Clicking numbered button inserts just the number', () => {

    it('should include data-response with just the number for list choices', async () => {
      const { renderQuickActions } = await getMessageView();

      const result = {
        type: 'list',
        choices: [
          { number: 1, text: 'Create new component' },
          { number: 2, text: 'Modify existing file' },
        ]
      };

      const html = renderQuickActions(result);

      expect(html).toMatch(/data-response="1"/);
      expect(html).toMatch(/data-response="2"/);
    });

    it('should call insertAndSubmit with just the number when list button clicked', async () => {
      const { handleQuickActionClick } = await getMessageView();
      const mockFn = await mockInsertAndSubmit();

      handleQuickActionClick('1');

      expect(mockFn).toHaveBeenCalledWith('1');

      mockFn.mockRestore();
    });

  });

  describe('AC10: Handles 2-10 options gracefully', () => {

    it('should handle exactly 2 options', async () => {
      const { detectListChoices } = await getMessageView();

      const text = `Which option do you prefer?

1. Option A
2. Option B`;

      const result = detectListChoices(text);

      expect(result).not.toBeNull();
      expect(result.choices).toHaveLength(2);
    });

    it('should handle 5 options', async () => {
      const { detectListChoices } = await getMessageView();

      const text = `Select an option:

1. One
2. Two
3. Three
4. Four
5. Five`;

      const result = detectListChoices(text);

      expect(result).not.toBeNull();
      expect(result.choices).toHaveLength(5);
    });

    it('should handle 10 options', async () => {
      const { detectListChoices } = await getMessageView();

      const text = `Pick one of these options:

1. One
2. Two
3. Three
4. Four
5. Five
6. Six
7. Seven
8. Eight
9. Nine
10. Ten`;

      const result = detectListChoices(text);

      expect(result).not.toBeNull();
      expect(result.choices).toHaveLength(10);
    });

    it('should render buttons that wrap or scroll for many options', async () => {
      const { renderQuickActions } = await getMessageView();

      const choices = Array.from({ length: 10 }, (_, i) => ({
        number: i + 1,
        text: `Option ${i + 1}`
      }));

      const html = renderQuickActions({ type: 'list', choices });

      for (let i = 1; i <= 10; i++) {
        expect(html).toContain(`data-response="${i}"`);
      }

      expect(html).toMatch(/(flex-wrap|overflow|scroll)/);
    });

  });

  describe('AC11: Falls back gracefully (no false positives)', () => {

    it('should not detect numbered items in regular prose', async () => {
      const { detectListChoices } = await getMessageView();

      const text = 'I found 3 bugs in the code. The first 2 are critical.';

      const result = detectListChoices(text);

      expect(result).toBeNull();
    });

    it('should not detect ordered list that is not presenting choices', async () => {
      const { detectListChoices } = await getMessageView();

      const text = `Here are the steps I took:
1. Read the file
2. Analyzed the code
3. Made changes`;

      const result = detectListChoices(text);

      expect(result).toBeNull();
    });

    it('should not detect bullet lists as numbered choices', async () => {
      const { detectListChoices } = await getMessageView();

      const text = `Here are your options:
- Create new component
- Modify existing file`;

      const result = detectListChoices(text);

      expect(result).toBeNull();
    });

    it('should not detect code block line numbers as choices', async () => {
      const { detectListChoices } = await getMessageView();

      const text = '```\n1. const x = 1;\n2. const y = 2;\n```';

      const result = detectListChoices(text);

      expect(result).toBeNull();
    });

    it('should require sequential numbers starting from 1', async () => {
      const { detectListChoices } = await getMessageView();

      const text = `3. Third option
4. Fourth option
5. Fifth option`;

      const result = detectListChoices(text);

      expect(result).toBeNull();
    });

  });

});
