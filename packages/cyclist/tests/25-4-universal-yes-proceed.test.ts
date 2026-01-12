/**
 * Story 25-4: Universal 'Yes, Proceed' Button
 *
 * Tests for detecting various confirmation question patterns
 * and showing consistent Yes/No buttons.
 */

import { describe, it, expect } from 'vitest';
import {
  getMessageView,
  createAssistantMessage,
} from './helpers/suggested-prompts-helpers.js';

describe('25-4: Universal Yes/Proceed Detection', () => {

  describe('AC1: Detects confirmation question patterns - Universal "shall I" verbs', () => {

    it('should detect "shall I claim" (not in hardcoded verb list)', async () => {
      const { detectQuestionPattern } = await getMessageView();

      const result = detectQuestionPattern('Shall I claim this story?');

      expect(result).not.toBeNull();
      expect(result.type).toBe('yesno');
    });

    it('should detect "shall I invoke" (not in hardcoded verb list)', async () => {
      const { detectQuestionPattern } = await getMessageView();

      const result = detectQuestionPattern('Shall I invoke /tea to begin the RED phase?');

      expect(result).not.toBeNull();
      expect(result.type).toBe('yesno');
    });

    it('should detect "shall I add" (not in hardcoded verb list)', async () => {
      const { detectQuestionPattern } = await getMessageView();

      const result = detectQuestionPattern('Shall I add the new component?');

      expect(result).not.toBeNull();
      expect(result.type).toBe('yesno');
    });

    it('should detect "shall I fix" (not in hardcoded verb list)', async () => {
      const { detectQuestionPattern } = await getMessageView();

      const result = detectQuestionPattern('Shall I fix the failing tests?');

      expect(result).not.toBeNull();
      expect(result.type).toBe('yesno');
    });

    it('should detect "shall I run" (not in hardcoded verb list)', async () => {
      const { detectQuestionPattern } = await getMessageView();

      const result = detectQuestionPattern('Shall I run the build?');

      expect(result).not.toBeNull();
      expect(result.type).toBe('yesno');
    });

    it('should detect "shall I create" (not in hardcoded verb list)', async () => {
      const { detectQuestionPattern } = await getMessageView();

      const result = detectQuestionPattern('Shall I create a new branch?');

      expect(result).not.toBeNull();
      expect(result.type).toBe('yesno');
    });

    it('should detect "shall I merge" (not in hardcoded verb list)', async () => {
      const { detectQuestionPattern } = await getMessageView();

      const result = detectQuestionPattern('Shall I merge the PR?');

      expect(result).not.toBeNull();
      expect(result.type).toBe('yesno');
    });

    it('should detect "shall I delete" (not in hardcoded verb list)', async () => {
      const { detectQuestionPattern } = await getMessageView();

      const result = detectQuestionPattern('Shall I delete the old files?');

      expect(result).not.toBeNull();
      expect(result.type).toBe('yesno');
    });

  });

  describe('AC1: Detects "ready to X" patterns beyond just "proceed"', () => {

    it('should detect "ready to continue"', async () => {
      const { detectQuestionPattern } = await getMessageView();

      const result = detectQuestionPattern('Ready to continue?');

      expect(result).not.toBeNull();
      expect(result.type).toBe('yesno');
    });

    it('should detect "ready to start"', async () => {
      const { detectQuestionPattern } = await getMessageView();

      const result = detectQuestionPattern('Ready to start?');

      expect(result).not.toBeNull();
      expect(result.type).toBe('yesno');
    });

    it('should detect "ready to begin"', async () => {
      const { detectQuestionPattern } = await getMessageView();

      const result = detectQuestionPattern('Ready to begin?');

      expect(result).not.toBeNull();
      expect(result.type).toBe('yesno');
    });

    it('should detect "ready to go"', async () => {
      const { detectQuestionPattern } = await getMessageView();

      const result = detectQuestionPattern('Ready to go?');

      expect(result).not.toBeNull();
      expect(result.type).toBe('yesno');
    });

  });

  describe('AC1: Detects additional confirmation patterns', () => {

    it('should detect "do you want me to" (distinct from "want me to")', async () => {
      const { detectQuestionPattern } = await getMessageView();

      const result = detectQuestionPattern('Do you want me to create the file?');

      expect(result).not.toBeNull();
      expect(result.type).toBe('yesno');
    });

    it('should NOT detect "can I" pattern (too broad, see line 125)', async () => {
      const { detectQuestionPattern } = await getMessageView();

      // "Can I" was intentionally excluded - causes false positives
      const result = detectQuestionPattern('Can I proceed with the deployment?');

      expect(result).toBeNull();
    });

    it('should detect "may I" pattern', async () => {
      const { detectQuestionPattern } = await getMessageView();

      const result = detectQuestionPattern('May I make these changes?');

      expect(result).not.toBeNull();
      expect(result.type).toBe('yesno');
    });

    it('should detect "is it okay to" pattern', async () => {
      const { detectQuestionPattern } = await getMessageView();

      const result = detectQuestionPattern('Is it okay to delete this file?');

      expect(result).not.toBeNull();
      expect(result.type).toBe('yesno');
    });

    it('should detect "is it ok if" pattern', async () => {
      const { detectQuestionPattern } = await getMessageView();

      const result = detectQuestionPattern('Is it ok if I refactor this function?');

      expect(result).not.toBeNull();
      expect(result.type).toBe('yesno');
    });

    it('should detect "are you ready for me to" pattern', async () => {
      const { detectQuestionPattern } = await getMessageView();

      const result = detectQuestionPattern('Are you ready for me to start the implementation?');

      expect(result).not.toBeNull();
      expect(result.type).toBe('yesno');
    });

  });

  describe('AC2: Shows Yes/No buttons with consistent labels', () => {

    it('should return consistent response labels for "shall I" patterns', async () => {
      const { detectQuestionPattern } = await getMessageView();

      const result = detectQuestionPattern('Shall I claim this story?');

      expect(result).not.toBeNull();
      expect(result.responses).toContain('Yes');
      expect(result.responses).toContain('No');
    });

    it('should return consistent response labels for "ready to" patterns', async () => {
      const { detectQuestionPattern } = await getMessageView();

      const result = detectQuestionPattern('Ready to continue?');

      expect(result).not.toBeNull();
      expect(result.responses).toContain('Yes');
      // Should NOT use "Hold on" - standardize to "No"
      expect(result.responses).not.toContain('Hold on');
    });

    it('should render buttons for confirmation patterns', async () => {
      const { renderQuickActions } = await getMessageView();

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
      const { detectQuestionPattern } = await getMessageView();

      const text = `I've analyzed the codebase and found the issue.

Shall I fix it now?`;

      const result = detectQuestionPattern(text);

      expect(result).not.toBeNull();
      expect(result.type).toBe('yesno');
    });

    it('should detect confirmation after explanation without options', async () => {
      const { detectQuestionPattern } = await getMessageView();

      const text = `The implementation is complete and all tests are passing.

Ready to proceed with the PR?`;

      const result = detectQuestionPattern(text);

      expect(result).not.toBeNull();
      expect(result.type).toBe('yesno');
    });

    // SKIPPED: Pattern-based detection disabled in favor of markers-only
    // See quick-actions-fix session for rationale
    it.skip('should work with processMessageForQuickActions for plain confirmations (pattern-based - disabled)', async () => {
      const { processMessageForQuickActions } = await getMessageView();

      const message = createAssistantMessage('I found the bug. Shall I fix it?');

      const result = processMessageForQuickActions(message);

      expect(result).not.toBeNull();
      expect(result.type).toBe('yesno');
    });

    it('should work with processMessageForQuickActions using CYCLIST markers', async () => {
      const { processMessageForQuickActions } = await getMessageView();

      // With markers-only detection, agents must emit explicit markers
      const message = createAssistantMessage('I found the bug. Shall I fix it?\n<!-- CYCLIST:QUESTION:yesno -->');

      const result = processMessageForQuickActions(message);

      expect(result).not.toBeNull();
      expect(result.type).toBe('yesno');
      expect(result.source).toBe('structured_marker');
    });

  });

  describe('Edge cases and false positive prevention', () => {

    it('should NOT detect "shall" in narrative context (not a question)', async () => {
      const { detectQuestionPattern } = await getMessageView();

      const result = detectQuestionPattern('We shall see how this works out.');

      expect(result).toBeNull();
    });

    it('should detect in last paragraph only', async () => {
      const { detectQuestionPattern } = await getMessageView();

      const text = `Shall I explain more about this?

Here is the implementation summary.`;

      const result = detectQuestionPattern(text);

      // Should NOT detect because "shall I" is in first paragraph, not last
      expect(result).toBeNull();
    });

    it('should handle confirmation at end of multi-paragraph message', async () => {
      const { detectQuestionPattern } = await getMessageView();

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
