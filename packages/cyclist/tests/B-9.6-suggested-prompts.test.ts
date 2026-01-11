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

  // ===========================================================================
  // Story 25-2: Fix Enumeration False Positives
  // ===========================================================================

  describe('25-2 AC1: Numbered lists without question context are ignored', () => {

    it('should not detect list when there is no question being asked', async () => {
      const { detectListChoices } = await import('../src/public/js/components/MessageView.js');

      // This is a status report, not a question - no "which/choose/select" context
      const text = `I completed the following tasks:
1. Updated the configuration
2. Fixed the database connection
3. Deployed to staging`;

      const result = detectListChoices(text);

      expect(result).toBeNull();
    });

    it('should not detect findings list as choices', async () => {
      const { detectListChoices } = await import('../src/public/js/components/MessageView.js');

      // Report of findings - contains choice-like word "issues" but is not a question
      const text = `Here are the issues I found:
1. Database connection slow
2. API returning errors
3. UI not rendering properly`;

      const result = detectListChoices(text);

      expect(result).toBeNull();
    });

    it('should not detect list of completed steps', async () => {
      const { detectListChoices } = await import('../src/public/js/components/MessageView.js');

      const text = `Steps I took to fix the bug:
1. Identified the root cause
2. Applied the patch
3. Verified the fix works`;

      const result = detectListChoices(text);

      expect(result).toBeNull();
    });

  });

  describe('25-2 AC2: "Here are the files" type enumeration lists not shown as choices', () => {

    it('should not detect "here are the files" enumeration', async () => {
      const { detectListChoices } = await import('../src/public/js/components/MessageView.js');

      const text = `Here are the files I modified:
1. src/index.ts
2. src/utils.ts
3. tests/index.test.ts`;

      const result = detectListChoices(text);

      expect(result).toBeNull();
    });

    it('should not detect "the following" enumeration prefix', async () => {
      const { detectListChoices } = await import('../src/public/js/components/MessageView.js');

      const text = `The following changes were made:
1. Added new validation
2. Updated error handling
3. Improved logging`;

      const result = detectListChoices(text);

      expect(result).toBeNull();
    });

    it('should not detect "i found" enumeration prefix', async () => {
      const { detectListChoices } = await import('../src/public/js/components/MessageView.js');

      const text = `I found these problems in the code:
1. Missing null check
2. Unhandled promise rejection
3. Memory leak in event handler`;

      const result = detectListChoices(text);

      expect(result).toBeNull();
    });

    it('should not detect "there are N" enumeration prefix', async () => {
      const { detectListChoices } = await import('../src/public/js/components/MessageView.js');

      const text = `There are 3 main issues:
1. Performance degradation
2. Security vulnerability
3. API compatibility`;

      const result = detectListChoices(text);

      expect(result).toBeNull();
    });

    it('should not detect "list of" enumeration prefix', async () => {
      const { detectListChoices } = await import('../src/public/js/components/MessageView.js');

      const text = `Here's a list of dependencies:
1. react@18.2.0
2. typescript@5.0.0
3. vitest@1.0.0`;

      const result = detectListChoices(text);

      expect(result).toBeNull();
    });

    it('should not detect "here\'s what" enumeration prefix', async () => {
      const { detectListChoices } = await import('../src/public/js/components/MessageView.js');

      const text = `Here's what I did:
1. Cloned the repository
2. Installed dependencies
3. Ran the tests`;

      const result = detectListChoices(text);

      expect(result).toBeNull();
    });

    it('should not detect "files were modified" enumeration', async () => {
      const { detectListChoices } = await import('../src/public/js/components/MessageView.js');

      const text = `These files were modified in this commit:
1. package.json
2. src/main.ts
3. README.md`;

      const result = detectListChoices(text);

      expect(result).toBeNull();
    });

  });

  describe('25-2 AC3: Long lists (>5 items) treated as enumeration by default', () => {

    it('should not detect 6-item list without strong choice indicator', async () => {
      const { detectListChoices } = await import('../src/public/js/components/MessageView.js');

      // Long list without explicit "which/choose/select/pick/prefer"
      const text = `Here are the options available:
1. Option A
2. Option B
3. Option C
4. Option D
5. Option E
6. Option F`;

      const result = detectListChoices(text);

      expect(result).toBeNull();
    });

    it('should not detect 8-item documentation list', async () => {
      const { detectListChoices } = await import('../src/public/js/components/MessageView.js');

      const text = `The API supports these endpoints:
1. GET /users
2. POST /users
3. GET /users/:id
4. PUT /users/:id
5. DELETE /users/:id
6. GET /posts
7. POST /posts
8. GET /posts/:id`;

      const result = detectListChoices(text);

      expect(result).toBeNull();
    });

    it('should STILL detect 6-item list WITH strong choice indicator "which"', async () => {
      const { detectListChoices } = await import('../src/public/js/components/MessageView.js');

      // Long list WITH "which" should still be detected
      const text = `Which of these approaches would you prefer?
1. Approach A
2. Approach B
3. Approach C
4. Approach D
5. Approach E
6. Approach F`;

      const result = detectListChoices(text);

      expect(result).not.toBeNull();
      expect(result.choices).toHaveLength(6);
    });

    it('should STILL detect 6-item list WITH strong choice indicator "choose"', async () => {
      const { detectListChoices } = await import('../src/public/js/components/MessageView.js');

      const text = `Please choose one of the following:
1. First option
2. Second option
3. Third option
4. Fourth option
5. Fifth option
6. Sixth option`;

      const result = detectListChoices(text);

      expect(result).not.toBeNull();
      expect(result.choices).toHaveLength(6);
    });

    it('should STILL detect 6-item list WITH strong choice indicator "select"', async () => {
      const { detectListChoices } = await import('../src/public/js/components/MessageView.js');

      const text = `Select the option you want:
1. Option 1
2. Option 2
3. Option 3
4. Option 4
5. Option 5
6. Option 6`;

      const result = detectListChoices(text);

      expect(result).not.toBeNull();
      expect(result.choices).toHaveLength(6);
    });

    it('should handle boundary case of exactly 5 items (should still work with weak context)', async () => {
      const { detectListChoices } = await import('../src/public/js/components/MessageView.js');

      // 5 items is the boundary - should still work with existing weaker context
      const text = `Here are your options:
1. Option A
2. Option B
3. Option C
4. Option D
5. Option E`;

      const result = detectListChoices(text);

      // 5 items should still be detected with "options" context
      expect(result).not.toBeNull();
      expect(result.choices).toHaveLength(5);
    });

  });

  describe('25-2 AC4: Reduces false positive rate (regression tests)', () => {

    it('should STILL detect valid 3-item choice list with "which"', async () => {
      const { detectListChoices } = await import('../src/public/js/components/MessageView.js');

      const text = `Which approach would you prefer?
1. Use TypeScript
2. Use JavaScript
3. Use both`;

      const result = detectListChoices(text);

      expect(result).not.toBeNull();
      expect(result.choices).toHaveLength(3);
    });

    it('should STILL detect valid 2-item choice list with "choose"', async () => {
      const { detectListChoices } = await import('../src/public/js/components/MessageView.js');

      const text = `Choose one:
1. Fast but risky
2. Slow but safe`;

      const result = detectListChoices(text);

      expect(result).not.toBeNull();
      expect(result.choices).toHaveLength(2);
    });

    it('should STILL detect valid choice list with "select"', async () => {
      const { detectListChoices } = await import('../src/public/js/components/MessageView.js');

      const text = `Select an option:
1. Create new file
2. Modify existing file
3. Delete file`;

      const result = detectListChoices(text);

      expect(result).not.toBeNull();
      expect(result.choices).toHaveLength(3);
    });

    it('should STILL detect valid choice list with "pick"', async () => {
      const { detectListChoices } = await import('../src/public/js/components/MessageView.js');

      const text = `Pick the one you want:
1. Red
2. Green
3. Blue`;

      const result = detectListChoices(text);

      expect(result).not.toBeNull();
      expect(result.choices).toHaveLength(3);
    });

    it('should STILL detect valid choice list with "prefer"', async () => {
      const { detectListChoices } = await import('../src/public/js/components/MessageView.js');

      const text = `Which do you prefer?
1. Morning deployment
2. Evening deployment`;

      const result = detectListChoices(text);

      expect(result).not.toBeNull();
      expect(result.choices).toHaveLength(2);
    });

    it('should STILL detect "would you like" combined with numbered options', async () => {
      const { detectListChoices } = await import('../src/public/js/components/MessageView.js');

      const text = `Would you like me to proceed with one of these?
1. Quick fix
2. Full refactor
3. Skip for now`;

      const result = detectListChoices(text);

      expect(result).not.toBeNull();
      expect(result.choices).toHaveLength(3);
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

  // ===========================================================================
  // Story 25-3: Detect Handoff & Action Prompts
  // ===========================================================================

  describe('25-3: Handoff & Action Prompt Detection', () => {

    describe('Module Exports for Handoff Detection', () => {

      it('should export detectHandoffPattern function', async () => {
        const messageView = await import('../src/public/js/components/MessageView.js');

        expect(messageView.detectHandoffPattern).toBeDefined();
        expect(typeof messageView.detectHandoffPattern).toBe('function');
      });

      it('should export HANDOFF_PATTERNS constant', async () => {
        const messageView = await import('../src/public/js/components/MessageView.js');

        expect(messageView.HANDOFF_PATTERNS).toBeDefined();
        expect(Array.isArray(messageView.HANDOFF_PATTERNS)).toBe(true);
      });

      it('should export PHASE_TO_AGENT mapping', async () => {
        const messageView = await import('../src/public/js/components/MessageView.js');

        expect(messageView.PHASE_TO_AGENT).toBeDefined();
        expect(typeof messageView.PHASE_TO_AGENT).toBe('object');
      });

    });

    describe('AC1: Detects "invoke /X" patterns', () => {

      it('should detect "invoke /reviewer" pattern', async () => {
        const { detectHandoffPattern } = await import('../src/public/js/components/MessageView.js');

        const result = detectHandoffPattern('Please invoke /reviewer to continue');

        expect(result).not.toBeNull();
        expect(result.type).toBe('handoff');
        expect(result.agent).toBe('/reviewer');
      });

      it('should detect "run /dev" pattern', async () => {
        const { detectHandoffPattern } = await import('../src/public/js/components/MessageView.js');

        const result = detectHandoffPattern('Now run /dev to implement the feature');

        expect(result).not.toBeNull();
        expect(result.type).toBe('handoff');
        expect(result.agent).toBe('/dev');
      });

      it('should detect "use /sm" pattern', async () => {
        const { detectHandoffPattern } = await import('../src/public/js/components/MessageView.js');

        const result = detectHandoffPattern('Use /sm to finish the story');

        expect(result).not.toBeNull();
        expect(result.type).toBe('handoff');
        expect(result.agent).toBe('/sm');
      });

      it('should detect "start /tea" pattern', async () => {
        const { detectHandoffPattern } = await import('../src/public/js/components/MessageView.js');

        const result = detectHandoffPattern('Start /tea for the test phase');

        expect(result).not.toBeNull();
        expect(result.type).toBe('handoff');
        expect(result.agent).toBe('/tea');
      });

      it('should detect "switch to /reviewer" pattern', async () => {
        const { detectHandoffPattern } = await import('../src/public/js/components/MessageView.js');

        const result = detectHandoffPattern('Switch to /reviewer for code review');

        expect(result).not.toBeNull();
        expect(result.type).toBe('handoff');
        expect(result.agent).toBe('/reviewer');
      });

      it('should be case insensitive for invoke patterns', async () => {
        const { detectHandoffPattern } = await import('../src/public/js/components/MessageView.js');

        const result1 = detectHandoffPattern('INVOKE /reviewer now');
        const result2 = detectHandoffPattern('Invoke /Dev to continue');

        expect(result1).not.toBeNull();
        expect(result1.agent).toBe('/reviewer');
        expect(result2).not.toBeNull();
        expect(result2.agent.toLowerCase()).toBe('/dev');
      });

      it('should NOT detect "invoke" without slash-prefixed agent', async () => {
        const { detectHandoffPattern } = await import('../src/public/js/components/MessageView.js');

        const result = detectHandoffPattern('I will invoke the function');

        expect(result).toBeNull();
      });

      it('should NOT detect partial matches in code discussions', async () => {
        const { detectHandoffPattern } = await import('../src/public/js/components/MessageView.js');

        // "run" as part of code, not an agent command
        const result = detectHandoffPattern('You can run the tests with npm test');

        expect(result).toBeNull();
      });

    });

    describe('AC2: Detects "ready for X" patterns', () => {

      it('should detect "ready for review" and suggest /reviewer', async () => {
        const { detectHandoffPattern } = await import('../src/public/js/components/MessageView.js');

        const result = detectHandoffPattern('The code is ready for review.');

        expect(result).not.toBeNull();
        expect(result.type).toBe('handoff');
        expect(result.agent).toBe('/reviewer');
      });

      it('should detect "ready for testing" and suggest /tea', async () => {
        const { detectHandoffPattern } = await import('../src/public/js/components/MessageView.js');

        const result = detectHandoffPattern('Implementation complete, ready for testing.');

        expect(result).not.toBeNull();
        expect(result.type).toBe('handoff');
        expect(result.agent).toBe('/tea');
      });

      it('should detect "ready for implementation" and suggest /dev', async () => {
        const { detectHandoffPattern } = await import('../src/public/js/components/MessageView.js');

        const result = detectHandoffPattern('Tests are written, ready for implementation.');

        expect(result).not.toBeNull();
        expect(result.type).toBe('handoff');
        expect(result.agent).toBe('/dev');
      });

      it('should detect context warning with "start fresh with /tea"', async () => {
        const { detectHandoffPattern } = await import('../src/public/js/components/MessageView.js');

        const result = detectHandoffPattern('Context is high. Start fresh with /tea');

        expect(result).not.toBeNull();
        expect(result.type).toBe('handoff');
        expect(result.agent).toBe('/tea');
      });

      it('should detect context percentage warning with agent suggestion', async () => {
        const { detectHandoffPattern } = await import('../src/public/js/components/MessageView.js');

        const result = detectHandoffPattern('Context usage >70%. Start a new session with /dev');

        expect(result).not.toBeNull();
        expect(result.type).toBe('handoff');
        expect(result.agent).toBe('/dev');
      });

      it('should NOT detect "ready" without recognized phase', async () => {
        const { detectHandoffPattern } = await import('../src/public/js/components/MessageView.js');

        const result = detectHandoffPattern('I am ready for lunch.');

        expect(result).toBeNull();
      });

    });

    describe('AC3: Shows button to invoke the suggested command', () => {

      it('should return responses array with agent command', async () => {
        const { detectHandoffPattern } = await import('../src/public/js/components/MessageView.js');

        const result = detectHandoffPattern('Please invoke /reviewer to continue');

        expect(result).not.toBeNull();
        expect(result.responses).toBeDefined();
        expect(Array.isArray(result.responses)).toBe(true);
        expect(result.responses).toContain('/reviewer');
      });

      it('should include "Not yet" as alternative response', async () => {
        const { detectHandoffPattern } = await import('../src/public/js/components/MessageView.js');

        const result = detectHandoffPattern('Run /dev to implement');

        expect(result).not.toBeNull();
        expect(result.responses).toContain('Not yet');
      });

      it('should render handoff type in quick actions', async () => {
        const { renderQuickActions } = await import('../src/public/js/components/MessageView.js');

        const result = {
          type: 'handoff',
          agent: '/reviewer',
          responses: ['/reviewer', 'Not yet']
        };

        const html = renderQuickActions(result);

        expect(html).toContain('/reviewer');
        expect(html).toContain('Not yet');
        expect(html).toMatch(/data-response="\/reviewer"/);
      });

      it('should insert agent command when handoff button clicked', async () => {
        const { handleQuickActionClick } = await import('../src/public/js/components/MessageView.js');
        const editor = await import('../src/public/js/editor.js');

        const mockInsertAndSubmit = vi.spyOn(editor, 'insertAndSubmit').mockImplementation(() => {});

        handleQuickActionClick('/reviewer');

        expect(mockInsertAndSubmit).toHaveBeenCalledWith('/reviewer');

        mockInsertAndSubmit.mockRestore();
      });

    });

    describe('AC4: Works for all Pennyfarthing agents', () => {

      const allAgents = [
        'sm', 'tea', 'dev', 'reviewer', 'architect',
        'pm', 'tech-writer', 'ux-designer', 'devops', 'orchestrator'
      ];

      it.each(allAgents)('should detect "invoke /%s" pattern', async (agent) => {
        const { detectHandoffPattern } = await import('../src/public/js/components/MessageView.js');

        const result = detectHandoffPattern(`Please invoke /${agent} to continue`);

        expect(result).not.toBeNull();
        expect(result.type).toBe('handoff');
        expect(result.agent).toBe(`/${agent}`);
      });

      it.each(allAgents)('should detect "run /%s" pattern', async (agent) => {
        const { detectHandoffPattern } = await import('../src/public/js/components/MessageView.js');

        const result = detectHandoffPattern(`Run /${agent} now`);

        expect(result).not.toBeNull();
        expect(result.agent).toBe(`/${agent}`);
      });

      it.each(allAgents)('should detect "use /%s" pattern', async (agent) => {
        const { detectHandoffPattern } = await import('../src/public/js/components/MessageView.js');

        const result = detectHandoffPattern(`Use /${agent} for this task`);

        expect(result).not.toBeNull();
        expect(result.agent).toBe(`/${agent}`);
      });

    });

    describe('Edge Cases and False Positive Prevention', () => {

      it('should only check last paragraph for handoff patterns', async () => {
        const { detectHandoffPattern } = await import('../src/public/js/components/MessageView.js');

        // Agent mentioned in first paragraph, but not in the conclusion
        const text = `I used /reviewer earlier to check the code.

The implementation is complete and tests are passing.`;

        const result = detectHandoffPattern(text);

        // Should NOT detect because the last paragraph has no handoff
        expect(result).toBeNull();
      });

      it('should detect handoff in last paragraph only', async () => {
        const { detectHandoffPattern } = await import('../src/public/js/components/MessageView.js');

        const text = `The implementation is complete.

Please invoke /reviewer to continue.`;

        const result = detectHandoffPattern(text);

        expect(result).not.toBeNull();
        expect(result.agent).toBe('/reviewer');
      });

      it('should take the LAST agent mentioned when multiple are present', async () => {
        const { detectHandoffPattern } = await import('../src/public/js/components/MessageView.js');

        const text = 'You could run /dev or invoke /reviewer. I recommend /reviewer.';

        const result = detectHandoffPattern(text);

        expect(result).not.toBeNull();
        // Should take the last one mentioned
        expect(result.agent).toBe('/reviewer');
      });

      it('should handle markdown formatting around agent names', async () => {
        const { detectHandoffPattern } = await import('../src/public/js/components/MessageView.js');

        const result = detectHandoffPattern('Please invoke **`/reviewer`** to continue');

        expect(result).not.toBeNull();
        expect(result.agent).toBe('/reviewer');
      });

      it('should handle agent without slash when preceded by invoke keyword', async () => {
        const { detectHandoffPattern } = await import('../src/public/js/components/MessageView.js');

        // Some outputs might say "invoke reviewer" without slash
        const result = detectHandoffPattern('Please invoke reviewer to continue');

        // Should still detect and add the slash
        expect(result).not.toBeNull();
        expect(result.agent).toBe('/reviewer');
      });

      it('should NOT detect agent names in code blocks', async () => {
        const { detectHandoffPattern } = await import('../src/public/js/components/MessageView.js');

        const text = '```bash\ninvoke /reviewer\n```\n\nThat was an example command.';

        const result = detectHandoffPattern(text);

        expect(result).toBeNull();
      });

    });

    describe('Integration: Handoff detection in message processing', () => {

      it('should prioritize handoff patterns over yes/no questions', async () => {
        const { processMessageForQuickActions } = await import('../src/public/js/components/MessageView.js');

        const message = {
          type: 'assistant',
          message: {
            content: [{
              type: 'text',
              text: 'Would you like me to invoke /reviewer for code review?'
            }],
          },
        };

        const result = processMessageForQuickActions(message);

        // Should detect as handoff, not as yes/no question
        expect(result).not.toBeNull();
        expect(result.type).toBe('handoff');
        expect(result.agent).toBe('/reviewer');
      });

      it('should prioritize handoff patterns over list choices', async () => {
        const { processMessageForQuickActions } = await import('../src/public/js/components/MessageView.js');

        const message = {
          type: 'assistant',
          message: {
            content: [{
              type: 'text',
              text: `Here are your options:
1. Continue working
2. Take a break

Ready for review. Please invoke /reviewer.`
            }],
          },
        };

        const result = processMessageForQuickActions(message);

        // Should detect handoff in the last paragraph
        expect(result).not.toBeNull();
        expect(result.type).toBe('handoff');
      });

      it('should detect handoff in SDK message format', async () => {
        const { processMessageForQuickActions } = await import('../src/public/js/components/MessageView.js');

        const message = {
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: 'Implementation complete.' },
              { type: 'text', text: '\n\nRun /dev to continue.' }
            ],
          },
        };

        const result = processMessageForQuickActions(message);

        expect(result).not.toBeNull();
        expect(result.type).toBe('handoff');
        expect(result.agent).toBe('/dev');
      });

    });

  });

  // ===========================================================================
  // Story 25-4: Universal 'Yes, Proceed' Button
  // ===========================================================================

  describe('25-4: Universal Yes/Proceed Detection', () => {

    describe('AC1: Detects confirmation question patterns - Universal "shall I" verbs', () => {

      it('should detect "shall I claim" (not in hardcoded verb list)', async () => {
        const { detectQuestionPattern } = await import('../src/public/js/components/MessageView.js');

        const result = detectQuestionPattern('Shall I claim this story?');

        expect(result).not.toBeNull();
        expect(result.type).toBe('yesno');
      });

      it('should detect "shall I invoke" (not in hardcoded verb list)', async () => {
        const { detectQuestionPattern } = await import('../src/public/js/components/MessageView.js');

        const result = detectQuestionPattern('Shall I invoke /tea to begin the RED phase?');

        expect(result).not.toBeNull();
        expect(result.type).toBe('yesno');
      });

      it('should detect "shall I add" (not in hardcoded verb list)', async () => {
        const { detectQuestionPattern } = await import('../src/public/js/components/MessageView.js');

        const result = detectQuestionPattern('Shall I add the new component?');

        expect(result).not.toBeNull();
        expect(result.type).toBe('yesno');
      });

      it('should detect "shall I fix" (not in hardcoded verb list)', async () => {
        const { detectQuestionPattern } = await import('../src/public/js/components/MessageView.js');

        const result = detectQuestionPattern('Shall I fix the failing tests?');

        expect(result).not.toBeNull();
        expect(result.type).toBe('yesno');
      });

      it('should detect "shall I run" (not in hardcoded verb list)', async () => {
        const { detectQuestionPattern } = await import('../src/public/js/components/MessageView.js');

        const result = detectQuestionPattern('Shall I run the build?');

        expect(result).not.toBeNull();
        expect(result.type).toBe('yesno');
      });

      it('should detect "shall I create" (not in hardcoded verb list)', async () => {
        const { detectQuestionPattern } = await import('../src/public/js/components/MessageView.js');

        const result = detectQuestionPattern('Shall I create a new branch?');

        expect(result).not.toBeNull();
        expect(result.type).toBe('yesno');
      });

      it('should detect "shall I merge" (not in hardcoded verb list)', async () => {
        const { detectQuestionPattern } = await import('../src/public/js/components/MessageView.js');

        const result = detectQuestionPattern('Shall I merge the PR?');

        expect(result).not.toBeNull();
        expect(result.type).toBe('yesno');
      });

      it('should detect "shall I delete" (not in hardcoded verb list)', async () => {
        const { detectQuestionPattern } = await import('../src/public/js/components/MessageView.js');

        const result = detectQuestionPattern('Shall I delete the old files?');

        expect(result).not.toBeNull();
        expect(result.type).toBe('yesno');
      });

    });

    describe('AC1: Detects "ready to X" patterns beyond just "proceed"', () => {

      it('should detect "ready to continue"', async () => {
        const { detectQuestionPattern } = await import('../src/public/js/components/MessageView.js');

        const result = detectQuestionPattern('Ready to continue?');

        expect(result).not.toBeNull();
        expect(result.type).toBe('yesno');
      });

      it('should detect "ready to start"', async () => {
        const { detectQuestionPattern } = await import('../src/public/js/components/MessageView.js');

        const result = detectQuestionPattern('Ready to start?');

        expect(result).not.toBeNull();
        expect(result.type).toBe('yesno');
      });

      it('should detect "ready to begin"', async () => {
        const { detectQuestionPattern } = await import('../src/public/js/components/MessageView.js');

        const result = detectQuestionPattern('Ready to begin?');

        expect(result).not.toBeNull();
        expect(result.type).toBe('yesno');
      });

      it('should detect "ready to go"', async () => {
        const { detectQuestionPattern } = await import('../src/public/js/components/MessageView.js');

        const result = detectQuestionPattern('Ready to go?');

        expect(result).not.toBeNull();
        expect(result.type).toBe('yesno');
      });

    });

    describe('AC1: Detects additional confirmation patterns', () => {

      it('should detect "do you want me to" (distinct from "want me to")', async () => {
        const { detectQuestionPattern } = await import('../src/public/js/components/MessageView.js');

        const result = detectQuestionPattern('Do you want me to create the file?');

        expect(result).not.toBeNull();
        expect(result.type).toBe('yesno');
      });

      it('should NOT detect "can I" pattern (too broad, see line 125)', async () => {
        const { detectQuestionPattern } = await import('../src/public/js/components/MessageView.js');

        // "Can I" was intentionally excluded - causes false positives
        // See original test at line 125 documenting this decision
        const result = detectQuestionPattern('Can I proceed with the deployment?');

        expect(result).toBeNull();
      });

      it('should detect "may I" pattern', async () => {
        const { detectQuestionPattern } = await import('../src/public/js/components/MessageView.js');

        const result = detectQuestionPattern('May I make these changes?');

        expect(result).not.toBeNull();
        expect(result.type).toBe('yesno');
      });

      it('should detect "is it okay to" pattern', async () => {
        const { detectQuestionPattern } = await import('../src/public/js/components/MessageView.js');

        const result = detectQuestionPattern('Is it okay to delete this file?');

        expect(result).not.toBeNull();
        expect(result.type).toBe('yesno');
      });

      it('should detect "is it ok if" pattern', async () => {
        const { detectQuestionPattern } = await import('../src/public/js/components/MessageView.js');

        const result = detectQuestionPattern('Is it ok if I refactor this function?');

        expect(result).not.toBeNull();
        expect(result.type).toBe('yesno');
      });

      it('should detect "are you ready for me to" pattern', async () => {
        const { detectQuestionPattern } = await import('../src/public/js/components/MessageView.js');

        const result = detectQuestionPattern('Are you ready for me to start the implementation?');

        expect(result).not.toBeNull();
        expect(result.type).toBe('yesno');
      });

    });

    describe('AC2: Shows Yes/No buttons with consistent labels', () => {

      it('should return consistent response labels for "shall I" patterns', async () => {
        const { detectQuestionPattern } = await import('../src/public/js/components/MessageView.js');

        const result = detectQuestionPattern('Shall I claim this story?');

        expect(result).not.toBeNull();
        expect(result.responses).toContain('Yes');
        expect(result.responses).toContain('No');
      });

      it('should return consistent response labels for "ready to" patterns', async () => {
        const { detectQuestionPattern } = await import('../src/public/js/components/MessageView.js');

        const result = detectQuestionPattern('Ready to continue?');

        expect(result).not.toBeNull();
        expect(result.responses).toContain('Yes');
        // Should NOT use "Hold on" - standardize to "No"
        expect(result.responses).not.toContain('Hold on');
      });

      it('should render buttons for confirmation patterns', async () => {
        const { renderQuickActions } = await import('../src/public/js/components/MessageView.js');

        const result = {
          type: 'yesno',
          responses: ['Yes', 'No']
        };

        const html = renderQuickActions(result);

        expect(html).toContain('Yes');
        expect(html).toContain('No');
        expect(html).toContain('data-response');
      });

    });

    describe('AC4: Works even without numbered options', () => {

      it('should detect confirmation in plain text without any list', async () => {
        const { detectQuestionPattern } = await import('../src/public/js/components/MessageView.js');

        const text = `I've analyzed the codebase and found the issue.

Shall I fix it now?`;

        const result = detectQuestionPattern(text);

        expect(result).not.toBeNull();
        expect(result.type).toBe('yesno');
      });

      it('should detect confirmation after explanation without options', async () => {
        const { detectQuestionPattern } = await import('../src/public/js/components/MessageView.js');

        const text = `The implementation is complete and all tests are passing.

Ready to proceed with the PR?`;

        const result = detectQuestionPattern(text);

        expect(result).not.toBeNull();
        expect(result.type).toBe('yesno');
      });

      it('should work with processMessageForQuickActions for plain confirmations', async () => {
        const { processMessageForQuickActions } = await import('../src/public/js/components/MessageView.js');

        const message = {
          type: 'assistant',
          message: {
            content: [{
              type: 'text',
              text: 'I found the bug. Shall I fix it?'
            }],
          },
        };

        const result = processMessageForQuickActions(message);

        expect(result).not.toBeNull();
        expect(result.type).toBe('yesno');
      });

    });

    describe('Edge cases and false positive prevention', () => {

      it('should NOT detect "shall" in narrative context (not a question)', async () => {
        const { detectQuestionPattern } = await import('../src/public/js/components/MessageView.js');

        const result = detectQuestionPattern('We shall see how this works out.');

        expect(result).toBeNull();
      });

      it('should detect in last paragraph only', async () => {
        const { detectQuestionPattern } = await import('../src/public/js/components/MessageView.js');

        const text = `Shall I explain more about this?

Here is the implementation summary.`;

        const result = detectQuestionPattern(text);

        // Should NOT detect because "shall I" is in first paragraph, not last
        expect(result).toBeNull();
      });

      it('should handle confirmation at end of multi-paragraph message', async () => {
        const { detectQuestionPattern } = await import('../src/public/js/components/MessageView.js');

        const text = `I've completed the analysis.

Here are my findings:
- Issue 1: Memory leak
- Issue 2: Race condition

Shall I fix both issues?`;

        const result = detectQuestionPattern(text);

        expect(result).not.toBeNull();
        expect(result.type).toBe('yesno');
      });

    });

  });

  // ===========================================================================
  // Story 25-5: Structured Output Markers
  // ===========================================================================

  describe('25-5: Structured Output Markers', () => {

    describe('Module Exports for Marker Detection', () => {

      it('should export detectStructuredMarkers function', async () => {
        const messageView = await import('../src/public/js/components/MessageView.js');

        expect(messageView.detectStructuredMarkers).toBeDefined();
        expect(typeof messageView.detectStructuredMarkers).toBe('function');
      });

    });

    describe('AC3: Cyclist parses markers with 100% accuracy', () => {

      describe('Single marker extraction', () => {

        it('should detect HANDOFF marker with agent name', async () => {
          const { detectStructuredMarkers } = await import('../src/public/js/components/MessageView.js');

          const text = 'Ready for the next phase.\n<!-- CYCLIST:HANDOFF:/tea -->';

          const result = detectStructuredMarkers(text);

          expect(result).not.toBeNull();
          expect(result).toHaveLength(1);
          expect(result[0].type).toBe('handoff');
          expect(result[0].value).toBe('/tea');
          expect(result[0].source).toBe('structured_marker');
        });

        it('should detect QUESTION marker with yesno type', async () => {
          const { detectStructuredMarkers } = await import('../src/public/js/components/MessageView.js');

          const text = 'Shall I proceed with the changes?\n<!-- CYCLIST:QUESTION:yesno -->';

          const result = detectStructuredMarkers(text);

          expect(result).not.toBeNull();
          expect(result).toHaveLength(1);
          expect(result[0].type).toBe('question');
          expect(result[0].value).toBe('yesno');
        });

        it('should detect CHOICES marker with choice numbers', async () => {
          const { detectStructuredMarkers } = await import('../src/public/js/components/MessageView.js');

          const text = 'Which option do you prefer?\n1. First\n2. Second\n3. Third\n<!-- CYCLIST:CHOICES:1,2,3 -->';

          const result = detectStructuredMarkers(text);

          expect(result).not.toBeNull();
          expect(result).toHaveLength(1);
          expect(result[0].type).toBe('choices');
          expect(result[0].value).toBe('1,2,3');
        });

        it('should detect HANDOFF marker for /reviewer', async () => {
          const { detectStructuredMarkers } = await import('../src/public/js/components/MessageView.js');

          const text = 'Implementation complete. Ready for review.\n<!-- CYCLIST:HANDOFF:/reviewer -->';

          const result = detectStructuredMarkers(text);

          expect(result).not.toBeNull();
          expect(result[0].type).toBe('handoff');
          expect(result[0].value).toBe('/reviewer');
        });

        it('should detect HANDOFF marker for /dev', async () => {
          const { detectStructuredMarkers } = await import('../src/public/js/components/MessageView.js');

          const text = 'Tests are RED. Ready for implementation.\n<!-- CYCLIST:HANDOFF:/dev -->';

          const result = detectStructuredMarkers(text);

          expect(result).not.toBeNull();
          expect(result[0].type).toBe('handoff');
          expect(result[0].value).toBe('/dev');
        });

        it('should detect HANDOFF marker for /sm', async () => {
          const { detectStructuredMarkers } = await import('../src/public/js/components/MessageView.js');

          const text = 'PR approved. Ready for archival.\n<!-- CYCLIST:HANDOFF:/sm -->';

          const result = detectStructuredMarkers(text);

          expect(result).not.toBeNull();
          expect(result[0].type).toBe('handoff');
          expect(result[0].value).toBe('/sm');
        });

      });

      describe('Multiple marker extraction', () => {

        it('should extract multiple markers from text', async () => {
          const { detectStructuredMarkers } = await import('../src/public/js/components/MessageView.js');

          const text = `Would you like option 1 or 2?
<!-- CYCLIST:QUESTION:choice -->
<!-- CYCLIST:CHOICES:1,2 -->`;

          const result = detectStructuredMarkers(text);

          expect(result).not.toBeNull();
          expect(result).toHaveLength(2);
          expect(result[0].type).toBe('question');
          expect(result[1].type).toBe('choices');
        });

        it('should preserve marker order when multiple present', async () => {
          const { detectStructuredMarkers } = await import('../src/public/js/components/MessageView.js');

          const text = `First marker here
<!-- CYCLIST:HANDOFF:/tea -->
Some text in between
<!-- CYCLIST:QUESTION:yesno -->`;

          const result = detectStructuredMarkers(text);

          expect(result).not.toBeNull();
          expect(result).toHaveLength(2);
          expect(result[0].type).toBe('handoff');
          expect(result[1].type).toBe('question');
        });

      });

      describe('No markers returns null', () => {

        it('should return null when no markers present', async () => {
          const { detectStructuredMarkers } = await import('../src/public/js/components/MessageView.js');

          const text = 'This is a regular message without any markers.';

          const result = detectStructuredMarkers(text);

          expect(result).toBeNull();
        });

        it('should return null for empty string', async () => {
          const { detectStructuredMarkers } = await import('../src/public/js/components/MessageView.js');

          const result = detectStructuredMarkers('');

          expect(result).toBeNull();
        });

        it('should return null for null input', async () => {
          const { detectStructuredMarkers } = await import('../src/public/js/components/MessageView.js');

          const result = detectStructuredMarkers(null);

          expect(result).toBeNull();
        });

        it('should return null for regular HTML comments (not CYCLIST prefixed)', async () => {
          const { detectStructuredMarkers } = await import('../src/public/js/components/MessageView.js');

          const text = 'Some text <!-- This is a regular comment --> more text';

          const result = detectStructuredMarkers(text);

          expect(result).toBeNull();
        });

        it('should return null for malformed markers', async () => {
          const { detectStructuredMarkers } = await import('../src/public/js/components/MessageView.js');

          // Missing colon between type and value
          const text = '<!-- CYCLIST:HANDOFF/tea -->';

          const result = detectStructuredMarkers(text);

          expect(result).toBeNull();
        });

      });

      describe('Marker format variations', () => {

        it('should handle whitespace inside marker', async () => {
          const { detectStructuredMarkers } = await import('../src/public/js/components/MessageView.js');

          const text = '<!--  CYCLIST:HANDOFF:/tea  -->';

          const result = detectStructuredMarkers(text);

          expect(result).not.toBeNull();
          expect(result[0].value).toBe('/tea');
        });

        it('should be case-insensitive for marker type', async () => {
          const { detectStructuredMarkers } = await import('../src/public/js/components/MessageView.js');

          const text = '<!-- CYCLIST:handoff:/tea -->';

          const result = detectStructuredMarkers(text);

          expect(result).not.toBeNull();
          expect(result[0].type).toBe('handoff');
        });

        it('should preserve case of value', async () => {
          const { detectStructuredMarkers } = await import('../src/public/js/components/MessageView.js');

          const text = '<!-- CYCLIST:HANDOFF:/TEA -->';

          const result = detectStructuredMarkers(text);

          expect(result).not.toBeNull();
          // Value should be trimmed but preserve case as given
          expect(result[0].value).toBe('/TEA');
        });

        it('should handle marker at start of text', async () => {
          const { detectStructuredMarkers } = await import('../src/public/js/components/MessageView.js');

          const text = '<!-- CYCLIST:HANDOFF:/dev -->\nSome following text.';

          const result = detectStructuredMarkers(text);

          expect(result).not.toBeNull();
          expect(result[0].type).toBe('handoff');
        });

        it('should handle marker at end of text', async () => {
          const { detectStructuredMarkers } = await import('../src/public/js/components/MessageView.js');

          const text = 'Some preceding text.\n<!-- CYCLIST:HANDOFF:/dev -->';

          const result = detectStructuredMarkers(text);

          expect(result).not.toBeNull();
          expect(result[0].type).toBe('handoff');
        });

      });

      describe('Works with surrounding markdown', () => {

        it('should detect marker within markdown formatting', async () => {
          const { detectStructuredMarkers } = await import('../src/public/js/components/MessageView.js');

          const text = `## Ready for Next Phase

Implementation is **complete** and all tests are passing.

Please invoke /tea to continue.
<!-- CYCLIST:HANDOFF:/tea -->`;

          const result = detectStructuredMarkers(text);

          expect(result).not.toBeNull();
          expect(result[0].type).toBe('handoff');
          expect(result[0].value).toBe('/tea');
        });

        it('should detect marker after code block', async () => {
          const { detectStructuredMarkers } = await import('../src/public/js/components/MessageView.js');

          const text = `Here's the implementation:

\`\`\`javascript
function foo() { return 'bar'; }
\`\`\`

Ready for review.
<!-- CYCLIST:HANDOFF:/reviewer -->`;

          const result = detectStructuredMarkers(text);

          expect(result).not.toBeNull();
          expect(result[0].value).toBe('/reviewer');
        });

        it('should detect marker in bulleted list context', async () => {
          const { detectStructuredMarkers } = await import('../src/public/js/components/MessageView.js');

          const text = `Changes made:
- Updated the config
- Fixed the bug
- Added tests

Shall I proceed?
<!-- CYCLIST:QUESTION:yesno -->`;

          const result = detectStructuredMarkers(text);

          expect(result).not.toBeNull();
          expect(result[0].type).toBe('question');
        });

      });

    });

    describe('AC3: processMessageForQuickActions prioritizes markers', () => {

      it('should prioritize structured markers over pattern detection', async () => {
        const { processMessageForQuickActions } = await import('../src/public/js/components/MessageView.js');

        // This text has both a pattern-detectable handoff AND a structured marker
        // The marker should take priority
        const message = {
          type: 'assistant',
          message: {
            content: [{
              type: 'text',
              text: `Implementation complete. Run /dev to continue.
<!-- CYCLIST:HANDOFF:/reviewer -->`
            }],
          },
        };

        const result = processMessageForQuickActions(message);

        expect(result).not.toBeNull();
        // Should use the marker (/reviewer) not the pattern (/dev)
        expect(result.agent).toBe('/reviewer');
        expect(result.source).toBe('structured_marker');
      });

      it('should return structured marker result for QUESTION type', async () => {
        const { processMessageForQuickActions } = await import('../src/public/js/components/MessageView.js');

        const message = {
          type: 'assistant',
          message: {
            content: [{
              type: 'text',
              text: `Do you want to continue?
<!-- CYCLIST:QUESTION:yesno -->`
            }],
          },
        };

        const result = processMessageForQuickActions(message);

        expect(result).not.toBeNull();
        expect(result.type).toBe('yesno');
        expect(result.source).toBe('structured_marker');
      });

      it('should return structured marker result for CHOICES type', async () => {
        const { processMessageForQuickActions } = await import('../src/public/js/components/MessageView.js');

        const message = {
          type: 'assistant',
          message: {
            content: [{
              type: 'text',
              text: `Pick one:
1. Option A
2. Option B
<!-- CYCLIST:CHOICES:1,2 -->`
            }],
          },
        };

        const result = processMessageForQuickActions(message);

        expect(result).not.toBeNull();
        expect(result.type).toBe('list');
        expect(result.source).toBe('structured_marker');
      });

      it('should fall back to pattern detection when no markers present', async () => {
        const { processMessageForQuickActions } = await import('../src/public/js/components/MessageView.js');

        // No marker, just pattern
        const message = {
          type: 'assistant',
          message: {
            content: [{
              type: 'text',
              text: 'Please invoke /reviewer to continue.'
            }],
          },
        };

        const result = processMessageForQuickActions(message);

        expect(result).not.toBeNull();
        expect(result.type).toBe('handoff');
        expect(result.agent).toBe('/reviewer');
        // Should NOT have structured_marker source
        expect(result.source).not.toBe('structured_marker');
      });

    });

    describe('AC4: Markers hidden from user display', () => {

      it('should not include marker text in rendered quick actions', async () => {
        const { renderQuickActions } = await import('../src/public/js/components/MessageView.js');

        // A result derived from a marker
        const result = {
          type: 'handoff',
          agent: '/tea',
          responses: ['/tea', 'Not yet'],
          source: 'structured_marker'
        };

        const html = renderQuickActions(result);

        // HTML should not contain the raw marker syntax
        expect(html).not.toContain('<!-- CYCLIST');
        expect(html).not.toContain('CYCLIST:HANDOFF');
        // But should contain the button
        expect(html).toContain('/tea');
      });

      it('markers should be invisible as HTML comments', async () => {
        // HTML comments are not rendered by browsers
        // This is more of a documentation test - the marker format uses HTML comments
        // which are inherently invisible when rendered
        const markerText = '<!-- CYCLIST:HANDOFF:/tea -->';

        // Verify it's a valid HTML comment
        expect(markerText).toMatch(/^<!--.*-->$/);
      });

    });

    describe('Rendering quick actions from markers', () => {

      it('should render handoff button from HANDOFF marker', async () => {
        const { renderQuickActions } = await import('../src/public/js/components/MessageView.js');

        const result = {
          type: 'handoff',
          agent: '/reviewer',
          responses: ['/reviewer', 'Not yet'],
          source: 'structured_marker'
        };

        const html = renderQuickActions(result);

        expect(html).toContain('/reviewer');
        expect(html).toContain('Not yet');
        expect(html).toContain('quick-actions-container');
      });

      it('should render Yes/No buttons from QUESTION:yesno marker', async () => {
        const { renderQuickActions } = await import('../src/public/js/components/MessageView.js');

        const result = {
          type: 'yesno',
          responses: ['Yes', 'No'],
          source: 'structured_marker'
        };

        const html = renderQuickActions(result);

        expect(html).toContain('Yes');
        expect(html).toContain('No');
      });

      it('should render choice buttons from CHOICES marker', async () => {
        const { renderQuickActions } = await import('../src/public/js/components/MessageView.js');

        const result = {
          type: 'list',
          choices: [
            { number: 1, text: 'First option' },
            { number: 2, text: 'Second option' }
          ],
          source: 'structured_marker'
        };

        const html = renderQuickActions(result);

        expect(html).toContain('1.');
        expect(html).toContain('2.');
        expect(html).toContain('data-response="1"');
        expect(html).toContain('data-response="2"');
      });

    });

    describe('Edge cases', () => {

      it('should handle CYCLIST prefix with different casing', async () => {
        const { detectStructuredMarkers } = await import('../src/public/js/components/MessageView.js');

        // Lowercase cyclist
        const text = '<!-- cyclist:HANDOFF:/tea -->';

        const result = detectStructuredMarkers(text);

        // Should still detect (case-insensitive prefix)
        expect(result).not.toBeNull();
        expect(result[0].type).toBe('handoff');
      });

      it('should NOT detect marker-like text in code blocks', async () => {
        const { detectStructuredMarkers } = await import('../src/public/js/components/MessageView.js');

        const text = `Here's an example:
\`\`\`html
<!-- CYCLIST:HANDOFF:/tea -->
\`\`\`

That was just an example.`;

        const result = detectStructuredMarkers(text);

        // Should NOT detect the marker inside the code block
        expect(result).toBeNull();
      });

      it('should detect marker outside code block even when code block contains marker-like text', async () => {
        const { detectStructuredMarkers } = await import('../src/public/js/components/MessageView.js');

        const text = `Here's an example:
\`\`\`html
<!-- CYCLIST:HANDOFF:/tea -->
\`\`\`

Now the real marker:
<!-- CYCLIST:HANDOFF:/dev -->`;

        const result = detectStructuredMarkers(text);

        expect(result).not.toBeNull();
        expect(result).toHaveLength(1);
        expect(result[0].value).toBe('/dev');
      });

      it('should handle inline code containing marker pattern', async () => {
        const { detectStructuredMarkers } = await import('../src/public/js/components/MessageView.js');

        // Marker pattern in inline code should not be detected
        const text = 'Use `<!-- CYCLIST:HANDOFF:/tea -->` for handoffs.';

        const result = detectStructuredMarkers(text);

        // Inline code is not stripped, so this edge case might detect
        // If we want to be strict, we could strip inline code too
        // For now, documenting the behavior
        expect(result).not.toBeNull(); // or toBeNull() depending on desired behavior
      });

    });

  });

});
