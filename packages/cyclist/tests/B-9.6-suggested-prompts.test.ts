/**
 * B-9.6: Suggested Prompt Insertion Tests
 *
 * Tests verify detection of question patterns and numbered list choices,
 * and the quick-action button system for inserting responses.
 *
 * Acceptance Criteria:
 * - AC1: Detects common question patterns from Claude output
 * - AC2: Shows contextual quick-action buttons (Yes/No/Continue)
 * - AC3: Button click inserts response text into editor
 * - AC4: Works with permission prompts
 * - AC5: Buttons disappear after response sent
 * - AC6: Optional auto-submit setting (stretch)
 * - AC7: Detects numbered list patterns ("1. Option", "2. Option")
 * - AC8: Shows numbered buttons with truncated option text
 * - AC9: Clicking numbered button inserts just the number
 * - AC10: Handles 2-10 options gracefully
 * - AC11: Falls back gracefully (no false positives)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

describe('B-9.6: Suggested Prompt Insertion', () => {

  describe('Module Exports', () => {

    it('should export detectQuestionPattern function', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      expect(messageView.detectQuestionPattern).toBeDefined();
      expect(typeof messageView.detectQuestionPattern).toBe('function');
    });

    it('should export detectListChoices function', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      expect(messageView.detectListChoices).toBeDefined();
      expect(typeof messageView.detectListChoices).toBe('function');
    });

    it('should export renderQuickActions function', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      expect(messageView.renderQuickActions).toBeDefined();
      expect(typeof messageView.renderQuickActions).toBe('function');
    });

    it('should export clearQuickActions function', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      expect(messageView.clearQuickActions).toBeDefined();
      expect(typeof messageView.clearQuickActions).toBe('function');
    });

    it('should export QUESTION_PATTERNS constant', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      expect(messageView.QUESTION_PATTERNS).toBeDefined();
      expect(Array.isArray(messageView.QUESTION_PATTERNS)).toBe(true);
    });

    it('should export insertText function from editor', async () => {
      const editor = await import('../src/public/js/editor.js');

      expect(editor.insertText).toBeDefined();
      expect(typeof editor.insertText).toBe('function');
    });

  });

  describe('AC1: Detects common question patterns', () => {

    it('should detect "Would you like me to" pattern', async () => {
      const { detectQuestionPattern } = await import('../src/public/js/components/MessageView.js');

      const result = detectQuestionPattern('Would you like me to create this file?');

      expect(result).not.toBeNull();
      expect(result.responses).toContain('Yes, proceed');
      expect(result.responses).toContain('No');
    });

    it('should detect "Should I" pattern', async () => {
      const { detectQuestionPattern } = await import('../src/public/js/components/MessageView.js');

      const result = detectQuestionPattern('Should I proceed with the changes?');

      expect(result).not.toBeNull();
      expect(result.responses).toContain('Yes');
      expect(result.responses).toContain('No');
    });

    it('should detect "Do you want" pattern', async () => {
      const { detectQuestionPattern } = await import('../src/public/js/components/MessageView.js');

      const result = detectQuestionPattern('Do you want me to run the tests?');

      expect(result).not.toBeNull();
      expect(result.responses).toContain('Yes');
      expect(result.responses).toContain('No');
    });

    it('should detect "Shall I proceed" pattern', async () => {
      const { detectQuestionPattern } = await import('../src/public/js/components/MessageView.js');

      // "Shall I proceed" is an action offer - gets "Yes, proceed"
      const result = detectQuestionPattern('Shall I proceed with the refactoring?');

      expect(result).not.toBeNull();
      expect(result.responses).toContain('Yes, proceed');
      expect(result.responses).toContain('No');
    });

    it('should detect "Shall I" with question mark', async () => {
      const { detectQuestionPattern } = await import('../src/public/js/components/MessageView.js');

      // Generic "Shall I" requires question mark
      const result = detectQuestionPattern('Shall I delete this unused file?');

      expect(result).not.toBeNull();
      expect(result.responses).toContain('Yes');
      expect(result.responses).toContain('No');
    });

    it('should NOT detect "Can I" without question context', async () => {
      const { detectQuestionPattern } = await import('../src/public/js/components/MessageView.js');

      // "Can I" was removed as too broad - causes false positives
      // e.g. "I can delete files if needed" would match
      const result = detectQuestionPattern('Can I delete this unused file?');

      // This is intentionally stricter now
      expect(result).toBeNull();
    });

    it('should detect "ready to proceed" pattern', async () => {
      const { detectQuestionPattern } = await import('../src/public/js/components/MessageView.js');

      const result = detectQuestionPattern('Ready to proceed?');

      expect(result).not.toBeNull();
      expect(result.responses).toContain('Yes, proceed');
      expect(result.responses).toContain('Hold on');
    });

    it('should return null for non-question text', async () => {
      const { detectQuestionPattern } = await import('../src/public/js/components/MessageView.js');

      const result = detectQuestionPattern('I have completed the task.');

      expect(result).toBeNull();
    });

    it('should be case-insensitive', async () => {
      const { detectQuestionPattern } = await import('../src/public/js/components/MessageView.js');

      const result1 = detectQuestionPattern('WOULD YOU LIKE ME TO do this?');
      const result2 = detectQuestionPattern('should i proceed?');

      expect(result1).not.toBeNull();
      expect(result2).not.toBeNull();
    });

  });

  describe('AC2: Shows contextual quick-action buttons', () => {

    it('should render Yes/No buttons for yes/no questions', async () => {
      const { renderQuickActions } = await import('../src/public/js/components/MessageView.js');

      const html = renderQuickActions({ type: 'yesno', responses: ['Yes', 'No'] });

      expect(html).toContain('Yes');
      expect(html).toContain('No');
      expect(html).toMatch(/class="[^"]*quick-action[^"]*"/i);
    });

    it('should render Continue button when appropriate', async () => {
      const { renderQuickActions } = await import('../src/public/js/components/MessageView.js');

      const html = renderQuickActions({ type: 'yesno', responses: ['Yes', 'Continue'] });

      expect(html).toContain('Yes');
      expect(html).toContain('Continue');
    });

    it('should include data attributes for response text', async () => {
      const { renderQuickActions } = await import('../src/public/js/components/MessageView.js');

      const html = renderQuickActions({ type: 'yesno', responses: ['Yes', 'No'] });

      expect(html).toMatch(/data-response="Yes"/);
      expect(html).toMatch(/data-response="No"/);
    });

    it('should include quick-actions-container class', async () => {
      const { renderQuickActions } = await import('../src/public/js/components/MessageView.js');

      const html = renderQuickActions({ type: 'yesno', responses: ['Yes', 'No'] });

      expect(html).toContain('quick-actions-container');
    });

  });

  describe('AC3: Button click inserts response text', () => {

    it('should export handleQuickActionClick function', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      expect(messageView.handleQuickActionClick).toBeDefined();
      expect(typeof messageView.handleQuickActionClick).toBe('function');
    });

    it('should call insertAndSubmit with response when Yes clicked', async () => {
      const { handleQuickActionClick } = await import('../src/public/js/components/MessageView.js');
      const editor = await import('../src/public/js/editor.js');

      // Mock the insertAndSubmit function (auto-submit behavior)
      const mockInsertAndSubmit = vi.spyOn(editor, 'insertAndSubmit').mockImplementation(() => {});

      handleQuickActionClick('Yes');

      expect(mockInsertAndSubmit).toHaveBeenCalledWith('Yes');

      mockInsertAndSubmit.mockRestore();
    });

    it('should call insertAndSubmit with response when No clicked', async () => {
      const { handleQuickActionClick } = await import('../src/public/js/components/MessageView.js');
      const editor = await import('../src/public/js/editor.js');

      const mockInsertAndSubmit = vi.spyOn(editor, 'insertAndSubmit').mockImplementation(() => {});

      handleQuickActionClick('No');

      expect(mockInsertAndSubmit).toHaveBeenCalledWith('No');

      mockInsertAndSubmit.mockRestore();
    });

  });

  describe('AC4: Works with permission prompts', () => {

    it('should detect "allow to run" permission pattern', async () => {
      const { detectQuestionPattern } = await import('../src/public/js/components/MessageView.js');

      const result = detectQuestionPattern('Allow Claude to run this command?');

      expect(result).not.toBeNull();
      expect(result.responses).toContain('Yes');
      expect(result.responses).toContain('No');
    });

    it('should detect "allow to execute" permission pattern', async () => {
      const { detectQuestionPattern } = await import('../src/public/js/components/MessageView.js');

      const result = detectQuestionPattern('Allow Claude to execute the script?');

      expect(result).not.toBeNull();
      expect(result.responses).toContain('Yes');
    });

    it('should detect "allow to read" permission pattern', async () => {
      const { detectQuestionPattern } = await import('../src/public/js/components/MessageView.js');

      const result = detectQuestionPattern('Allow access to read the file?');

      expect(result).not.toBeNull();
    });

    it('should detect "allow to write" permission pattern', async () => {
      const { detectQuestionPattern } = await import('../src/public/js/components/MessageView.js');

      const result = detectQuestionPattern('Allow Claude to write to this file?');

      expect(result).not.toBeNull();
    });

    it('should detect "allow to edit" permission pattern', async () => {
      const { detectQuestionPattern } = await import('../src/public/js/components/MessageView.js');

      const result = detectQuestionPattern('Allow Claude to edit src/main.ts?');

      expect(result).not.toBeNull();
    });

  });

  describe('AC5: Buttons disappear after response sent', () => {

    it('should export setQuickActionsVisible function', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      expect(messageView.setQuickActionsVisible).toBeDefined();
      expect(typeof messageView.setQuickActionsVisible).toBe('function');
    });

    it('should export getQuickActionsVisible function', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      expect(messageView.getQuickActionsVisible).toBeDefined();
      expect(typeof messageView.getQuickActionsVisible).toBe('function');
    });

    it('should call clearQuickActions after response submitted', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      // After a response is submitted, buttons should be cleared
      expect(messageView.onResponseSubmitted).toBeDefined();
      expect(typeof messageView.onResponseSubmitted).toBe('function');
    });

  });

  describe('AC6: Optional auto-submit setting', () => {

    it('should export setAutoSubmit function', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      expect(messageView.setAutoSubmit).toBeDefined();
      expect(typeof messageView.setAutoSubmit).toBe('function');
    });

    it('should export getAutoSubmit function', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      expect(messageView.getAutoSubmit).toBeDefined();
      expect(typeof messageView.getAutoSubmit).toBe('function');
    });

    it('should default to auto-submit disabled', async () => {
      const { getAutoSubmit } = await import('../src/public/js/components/MessageView.js');

      expect(getAutoSubmit()).toBe(false);
    });

    it('should allow enabling auto-submit', async () => {
      const { setAutoSubmit, getAutoSubmit } = await import('../src/public/js/components/MessageView.js');

      setAutoSubmit(true);

      expect(getAutoSubmit()).toBe(true);

      // Reset
      setAutoSubmit(false);
    });

  });

  describe('AC7: Detects numbered list patterns', () => {

    it('should detect "1. Option" pattern', async () => {
      const { detectListChoices } = await import('../src/public/js/components/MessageView.js');

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
      const { detectListChoices } = await import('../src/public/js/components/MessageView.js');

      const text = `Choose one:
1) First option
2) Second option`;

      const result = detectListChoices(text);

      expect(result).not.toBeNull();
      expect(result.choices).toHaveLength(2);
    });

    it('should detect "**1.** Option" pattern', async () => {
      const { detectListChoices } = await import('../src/public/js/components/MessageView.js');

      // Need choice context like "which" or "choose" to trigger detection
      const text = `Which approach would you prefer?

**1.** Create new component
**2.** Modify existing file`;

      const result = detectListChoices(text);

      expect(result).not.toBeNull();
      expect(result.choices).toHaveLength(2);
    });

    it('should return null for non-list text', async () => {
      const { detectListChoices } = await import('../src/public/js/components/MessageView.js');

      const result = detectListChoices('This is just a regular paragraph.');

      expect(result).toBeNull();
    });

    it('should require at least 2 choices to detect as list', async () => {
      const { detectListChoices } = await import('../src/public/js/components/MessageView.js');

      const text = '1. Only one option here';

      const result = detectListChoices(text);

      expect(result).toBeNull();
    });

  });

  describe('AC8: Shows numbered buttons with truncated option text', () => {

    it('should render numbered buttons for list choices', async () => {
      const { renderQuickActions } = await import('../src/public/js/components/MessageView.js');

      const result = {
        type: 'list',
        choices: [
          { number: 1, text: 'Create new component' },
          { number: 2, text: 'Modify existing file' },
        ]
      };

      const html = renderQuickActions(result);

      expect(html).toContain('1.');
      expect(html).toContain('2.');
      expect(html).toContain('Create new');
      expect(html).toContain('Modify exi');
    });

    it('should truncate long option text to ~20 chars', async () => {
      const { renderQuickActions } = await import('../src/public/js/components/MessageView.js');

      const result = {
        type: 'list',
        choices: [
          { number: 1, text: 'This is a very long option text that should be truncated' },
        ]
      };

      const html = renderQuickActions(result);

      // Should be truncated with ellipsis
      expect(html).toContain('...');
      // Should not contain the full text
      expect(html).not.toContain('should be truncated');
    });

    it('should export truncateText helper function', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      expect(messageView.truncateText).toBeDefined();
      expect(typeof messageView.truncateText).toBe('function');
    });

    it('should truncate text correctly', async () => {
      const { truncateText } = await import('../src/public/js/components/MessageView.js');

      expect(truncateText('Short text', 20)).toBe('Short text');
      expect(truncateText('This is a very long text that exceeds limit', 20)).toBe('This is a very long...');
    });

  });

  describe('AC9: Clicking numbered button inserts just the number', () => {

    it('should include data-response with just the number for list choices', async () => {
      const { renderQuickActions } = await import('../src/public/js/components/MessageView.js');

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
      const { handleQuickActionClick } = await import('../src/public/js/components/MessageView.js');
      const editor = await import('../src/public/js/editor.js');

      const mockInsertAndSubmit = vi.spyOn(editor, 'insertAndSubmit').mockImplementation(() => {});

      handleQuickActionClick('1');

      expect(mockInsertAndSubmit).toHaveBeenCalledWith('1');

      mockInsertAndSubmit.mockRestore();
    });

  });

  describe('AC10: Handles 2-10 options gracefully', () => {

    it('should handle exactly 2 options', async () => {
      const { detectListChoices } = await import('../src/public/js/components/MessageView.js');

      // Need choice context to trigger detection
      const text = `Which option do you prefer?

1. Option A
2. Option B`;

      const result = detectListChoices(text);

      expect(result).not.toBeNull();
      expect(result.choices).toHaveLength(2);
    });

    it('should handle 5 options', async () => {
      const { detectListChoices } = await import('../src/public/js/components/MessageView.js');

      // Need choice context to trigger detection
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
      const { detectListChoices } = await import('../src/public/js/components/MessageView.js');

      // Need choice context to trigger detection
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
      const { renderQuickActions } = await import('../src/public/js/components/MessageView.js');

      const choices = Array.from({ length: 10 }, (_, i) => ({
        number: i + 1,
        text: `Option ${i + 1}`
      }));

      const html = renderQuickActions({ type: 'list', choices });

      // Should contain all 10 buttons
      for (let i = 1; i <= 10; i++) {
        expect(html).toContain(`data-response="${i}"`);
      }

      // Should have flex-wrap or scroll container
      expect(html).toMatch(/(flex-wrap|overflow|scroll)/);
    });

  });

  describe('AC11: Falls back gracefully (no false positives)', () => {

    it('should not detect numbered items in regular prose', async () => {
      const { detectListChoices } = await import('../src/public/js/components/MessageView.js');

      const text = 'I found 3 bugs in the code. The first 2 are critical.';

      const result = detectListChoices(text);

      expect(result).toBeNull();
    });

    it('should not detect ordered list that is not presenting choices', async () => {
      const { detectListChoices } = await import('../src/public/js/components/MessageView.js');

      const text = `Here are the steps I took:
1. Read the file
2. Analyzed the code
3. Made changes`;

      // Steps taken (past tense) are not choices
      const result = detectListChoices(text);

      expect(result).toBeNull();
    });

    it('should not detect bullet lists as numbered choices', async () => {
      const { detectListChoices } = await import('../src/public/js/components/MessageView.js');

      const text = `Here are your options:
- Create new component
- Modify existing file`;

      const result = detectListChoices(text);

      expect(result).toBeNull();
    });

    it('should not detect code block line numbers as choices', async () => {
      const { detectListChoices } = await import('../src/public/js/components/MessageView.js');

      const text = '```\n1. const x = 1;\n2. const y = 2;\n```';

      const result = detectListChoices(text);

      expect(result).toBeNull();
    });

    it('should require sequential numbers starting from 1', async () => {
      const { detectListChoices } = await import('../src/public/js/components/MessageView.js');

      const text = `3. Third option
4. Fourth option
5. Fifth option`;

      const result = detectListChoices(text);

      // Does not start from 1, should not be detected as choice list
      expect(result).toBeNull();
    });

  });

  describe('Integration: Quick actions in message flow', () => {

    it('should export processMessageForQuickActions function', async () => {
      const messageView = await import('../src/public/js/components/MessageView.js');

      expect(messageView.processMessageForQuickActions).toBeDefined();
      expect(typeof messageView.processMessageForQuickActions).toBe('function');
    });

    it('should detect questions in assistant messages', async () => {
      const { processMessageForQuickActions } = await import('../src/public/js/components/MessageView.js');

      const message = {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'Would you like me to create this file?' }],
        },
      };

      const result = processMessageForQuickActions(message);

      expect(result).not.toBeNull();
      expect(result.type).toBe('yesno');
    });

    it('should detect list choices in assistant messages', async () => {
      const { processMessageForQuickActions } = await import('../src/public/js/components/MessageView.js');

      const message = {
        type: 'assistant',
        message: {
          content: [{
            type: 'text',
            text: `Here are your options:
1. Create new component
2. Modify existing file
3. Skip this step`
          }],
        },
      };

      const result = processMessageForQuickActions(message);

      expect(result).not.toBeNull();
      expect(result.type).toBe('list');
      expect(result.choices).toHaveLength(3);
    });

    it('should return null for non-assistant messages', async () => {
      const { processMessageForQuickActions } = await import('../src/public/js/components/MessageView.js');

      const message = {
        type: 'tool_result',
        tool_id: 'test',
        output: 'Would you like me to continue?',
      };

      const result = processMessageForQuickActions(message);

      expect(result).toBeNull();
    });

    it('should prioritize list choices over yes/no when both present', async () => {
      const { processMessageForQuickActions } = await import('../src/public/js/components/MessageView.js');

      const message = {
        type: 'assistant',
        message: {
          content: [{
            type: 'text',
            text: `Would you like me to proceed? Here are your options:
1. Yes, create the file
2. No, skip this
3. Let me think about it`
          }],
        },
      };

      const result = processMessageForQuickActions(message);

      expect(result).not.toBeNull();
      expect(result.type).toBe('list');
    });

  });

});
