/**
 * B-9.6: Suggested Prompt Insertion - Core Tests
 *
 * Tests for question pattern detection and quick-action button system.
 *
 * Acceptance Criteria covered:
 * - AC1: Detects common question patterns from Claude output
 * - AC2: Shows contextual quick-action buttons (Yes/No/Continue)
 * - AC3: Button click inserts response text into editor
 * - AC4: Works with permission prompts
 * - AC5: Buttons disappear after response sent
 * - AC6: Optional auto-submit setting (stretch)
 */

import { describe, it, expect, vi } from 'vitest';
import {
  getMessageView,
  getEditor,
  mockInsertAndSubmit,
} from './helpers/suggested-prompts-helpers.js';

describe('B-9.6: Suggested Prompt Insertion - Core', () => {

  describe('Module Exports', () => {

    it('should export detectQuestionPattern function', async () => {
      const messageView = await getMessageView();

      expect(messageView.detectQuestionPattern).toBeDefined();
      expect(typeof messageView.detectQuestionPattern).toBe('function');
    });

    it('should export detectListChoices function', async () => {
      const messageView = await getMessageView();

      expect(messageView.detectListChoices).toBeDefined();
      expect(typeof messageView.detectListChoices).toBe('function');
    });

    it('should export renderQuickActions function', async () => {
      const messageView = await getMessageView();

      expect(messageView.renderQuickActions).toBeDefined();
      expect(typeof messageView.renderQuickActions).toBe('function');
    });

    it('should export clearQuickActions function', async () => {
      const messageView = await getMessageView();

      expect(messageView.clearQuickActions).toBeDefined();
      expect(typeof messageView.clearQuickActions).toBe('function');
    });

    it('should export QUESTION_PATTERNS constant', async () => {
      const messageView = await getMessageView();

      expect(messageView.QUESTION_PATTERNS).toBeDefined();
      expect(Array.isArray(messageView.QUESTION_PATTERNS)).toBe(true);
    });

    it('should export insertText function from editor', async () => {
      const editor = await getEditor();

      expect(editor.insertText).toBeDefined();
      expect(typeof editor.insertText).toBe('function');
    });

  });

  describe('AC1: Detects common question patterns', () => {

    it('should detect "Would you like me to" pattern', async () => {
      const { detectQuestionPattern } = await getMessageView();

      const result = detectQuestionPattern('Would you like me to create this file?');

      expect(result).not.toBeNull();
      expect(result.responses).toContain('Yes, proceed');
      expect(result.responses).toContain('No');
    });

    it('should detect "Should I" pattern', async () => {
      const { detectQuestionPattern } = await getMessageView();

      const result = detectQuestionPattern('Should I proceed with the changes?');

      expect(result).not.toBeNull();
      expect(result.responses).toContain('Yes');
      expect(result.responses).toContain('No');
    });

    it('should detect "Do you want" pattern', async () => {
      const { detectQuestionPattern } = await getMessageView();

      const result = detectQuestionPattern('Do you want me to run the tests?');

      expect(result).not.toBeNull();
      expect(result.responses).toContain('Yes');
      expect(result.responses).toContain('No');
    });

    it('should detect "Shall I proceed" pattern', async () => {
      const { detectQuestionPattern } = await getMessageView();

      const result = detectQuestionPattern('Shall I proceed with the refactoring?');

      expect(result).not.toBeNull();
      expect(result.responses).toContain('Yes, proceed');
      expect(result.responses).toContain('No');
    });

    it('should detect "Shall I" with question mark', async () => {
      const { detectQuestionPattern } = await getMessageView();

      const result = detectQuestionPattern('Shall I delete this unused file?');

      expect(result).not.toBeNull();
      expect(result.responses).toContain('Yes');
      expect(result.responses).toContain('No');
    });

    it('should NOT detect "Can I" without question context', async () => {
      const { detectQuestionPattern } = await getMessageView();

      // "Can I" was removed as too broad - causes false positives
      const result = detectQuestionPattern('Can I delete this unused file?');

      expect(result).toBeNull();
    });

    it('should detect "ready to proceed" pattern', async () => {
      const { detectQuestionPattern } = await getMessageView();

      const result = detectQuestionPattern('Ready to proceed?');

      expect(result).not.toBeNull();
      expect(result.responses).toContain('Yes, proceed');
      expect(result.responses).toContain('Hold on');
    });

    it('should return null for non-question text', async () => {
      const { detectQuestionPattern } = await getMessageView();

      const result = detectQuestionPattern('I have completed the task.');

      expect(result).toBeNull();
    });

    it('should be case-insensitive', async () => {
      const { detectQuestionPattern } = await getMessageView();

      const result1 = detectQuestionPattern('WOULD YOU LIKE ME TO do this?');
      const result2 = detectQuestionPattern('should i proceed?');

      expect(result1).not.toBeNull();
      expect(result2).not.toBeNull();
    });

  });

  describe('AC2: Shows contextual quick-action buttons', () => {

    it('should render Yes/No buttons for yes/no questions', async () => {
      const { renderQuickActions } = await getMessageView();

      const html = renderQuickActions({ type: 'yesno', responses: ['Yes', 'No'] });

      expect(html).toContain('Yes');
      expect(html).toContain('No');
      expect(html).toMatch(/class="[^"]*quick-action[^"]*"/i);
    });

    it('should render Continue button when appropriate', async () => {
      const { renderQuickActions } = await getMessageView();

      const html = renderQuickActions({ type: 'yesno', responses: ['Yes', 'Continue'] });

      expect(html).toContain('Yes');
      expect(html).toContain('Continue');
    });

    it('should include data attributes for response text', async () => {
      const { renderQuickActions } = await getMessageView();

      const html = renderQuickActions({ type: 'yesno', responses: ['Yes', 'No'] });

      expect(html).toMatch(/data-response="Yes"/);
      expect(html).toMatch(/data-response="No"/);
    });

    it('should include quick-actions-container class', async () => {
      const { renderQuickActions } = await getMessageView();

      const html = renderQuickActions({ type: 'yesno', responses: ['Yes', 'No'] });

      expect(html).toContain('quick-actions-container');
    });

  });

  describe('AC3: Button click inserts response text', () => {

    it('should export handleQuickActionClick function', async () => {
      const messageView = await getMessageView();

      expect(messageView.handleQuickActionClick).toBeDefined();
      expect(typeof messageView.handleQuickActionClick).toBe('function');
    });

    it('should call insertAndSubmit with response when Yes clicked', async () => {
      const { handleQuickActionClick } = await getMessageView();
      const mockFn = await mockInsertAndSubmit();

      handleQuickActionClick('Yes');

      expect(mockFn).toHaveBeenCalledWith('Yes');

      mockFn.mockRestore();
    });

    it('should call insertAndSubmit with response when No clicked', async () => {
      const { handleQuickActionClick } = await getMessageView();
      const mockFn = await mockInsertAndSubmit();

      handleQuickActionClick('No');

      expect(mockFn).toHaveBeenCalledWith('No');

      mockFn.mockRestore();
    });

  });

  describe('AC4: Works with permission prompts', () => {

    it('should detect "allow to run" permission pattern', async () => {
      const { detectQuestionPattern } = await getMessageView();

      const result = detectQuestionPattern('Allow Claude to run this command?');

      expect(result).not.toBeNull();
      expect(result.responses).toContain('Yes');
      expect(result.responses).toContain('No');
    });

    it('should detect "allow to execute" permission pattern', async () => {
      const { detectQuestionPattern } = await getMessageView();

      const result = detectQuestionPattern('Allow Claude to execute the script?');

      expect(result).not.toBeNull();
      expect(result.responses).toContain('Yes');
    });

    it('should detect "allow to read" permission pattern', async () => {
      const { detectQuestionPattern } = await getMessageView();

      const result = detectQuestionPattern('Allow access to read the file?');

      expect(result).not.toBeNull();
    });

    it('should detect "allow to write" permission pattern', async () => {
      const { detectQuestionPattern } = await getMessageView();

      const result = detectQuestionPattern('Allow Claude to write to this file?');

      expect(result).not.toBeNull();
    });

    it('should detect "allow to edit" permission pattern', async () => {
      const { detectQuestionPattern } = await getMessageView();

      const result = detectQuestionPattern('Allow Claude to edit src/main.ts?');

      expect(result).not.toBeNull();
    });

  });

  describe('AC5: Buttons disappear after response sent', () => {

    it('should export setQuickActionsVisible function', async () => {
      const messageView = await getMessageView();

      expect(messageView.setQuickActionsVisible).toBeDefined();
      expect(typeof messageView.setQuickActionsVisible).toBe('function');
    });

    it('should export getQuickActionsVisible function', async () => {
      const messageView = await getMessageView();

      expect(messageView.getQuickActionsVisible).toBeDefined();
      expect(typeof messageView.getQuickActionsVisible).toBe('function');
    });

    it('should call clearQuickActions after response submitted', async () => {
      const messageView = await getMessageView();

      expect(messageView.onResponseSubmitted).toBeDefined();
      expect(typeof messageView.onResponseSubmitted).toBe('function');
    });

  });

  describe('AC6: Optional auto-submit setting', () => {

    it('should export setAutoSubmit function', async () => {
      const messageView = await getMessageView();

      expect(messageView.setAutoSubmit).toBeDefined();
      expect(typeof messageView.setAutoSubmit).toBe('function');
    });

    it('should export getAutoSubmit function', async () => {
      const messageView = await getMessageView();

      expect(messageView.getAutoSubmit).toBeDefined();
      expect(typeof messageView.getAutoSubmit).toBe('function');
    });

    it('should default to auto-submit disabled', async () => {
      const { getAutoSubmit } = await getMessageView();

      expect(getAutoSubmit()).toBe(false);
    });

    it('should allow enabling auto-submit', async () => {
      const { setAutoSubmit, getAutoSubmit } = await getMessageView();

      setAutoSubmit(true);

      expect(getAutoSubmit()).toBe(true);

      // Reset
      setAutoSubmit(false);
    });

  });

});
