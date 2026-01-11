/**
 * B-9.6: Suggested Prompt Insertion - Integration Tests
 *
 * Tests for the processMessageForQuickActions function which integrates
 * all detection mechanisms (questions, lists, handoffs).
 */

import { describe, it, expect } from 'vitest';
import {
  getMessageView,
  createAssistantMessage,
  createToolResultMessage,
} from './helpers/suggested-prompts-helpers.js';

describe('B-9.6: Quick Actions Integration', () => {

  describe('processMessageForQuickActions function', () => {

    it('should export processMessageForQuickActions function', async () => {
      const messageView = await getMessageView();

      expect(messageView.processMessageForQuickActions).toBeDefined();
      expect(typeof messageView.processMessageForQuickActions).toBe('function');
    });

    it('should detect questions in assistant messages', async () => {
      const { processMessageForQuickActions } = await getMessageView();

      const message = createAssistantMessage('Would you like me to create this file?');

      const result = processMessageForQuickActions(message);

      expect(result).not.toBeNull();
      expect(result.type).toBe('yesno');
    });

    it('should detect list choices in assistant messages', async () => {
      const { processMessageForQuickActions } = await getMessageView();

      const message = createAssistantMessage(`Here are your options:
1. Create new component
2. Modify existing file
3. Skip this step`);

      const result = processMessageForQuickActions(message);

      expect(result).not.toBeNull();
      expect(result.type).toBe('list');
      expect(result.choices).toHaveLength(3);
    });

    it('should return null for non-assistant messages', async () => {
      const { processMessageForQuickActions } = await getMessageView();

      const message = createToolResultMessage('Would you like me to continue?');

      const result = processMessageForQuickActions(message);

      expect(result).toBeNull();
    });

    it('should prioritize list choices over yes/no when both present', async () => {
      const { processMessageForQuickActions } = await getMessageView();

      const message = createAssistantMessage(`Would you like me to proceed? Here are your options:
1. Yes, create the file
2. No, skip this
3. Let me think about it`);

      const result = processMessageForQuickActions(message);

      expect(result).not.toBeNull();
      expect(result.type).toBe('list');
    });

  });

  describe('Priority order: markers > handoff > list > question', () => {

    it('should prioritize structured markers over all patterns', async () => {
      const { processMessageForQuickActions } = await getMessageView();

      // Has pattern detection AND marker - marker wins
      const message = createAssistantMessage(`Run /dev to continue.
<!-- CYCLIST:HANDOFF:/reviewer -->`);

      const result = processMessageForQuickActions(message);

      expect(result).not.toBeNull();
      expect(result.agent).toBe('/reviewer');
      expect(result.source).toBe('structured_marker');
    });

    it('should prioritize handoff over list choices', async () => {
      const { processMessageForQuickActions } = await getMessageView();

      const message = createAssistantMessage(`Which option?
1. Option A
2. Option B

Please invoke /reviewer to continue.`);

      const result = processMessageForQuickActions(message);

      expect(result).not.toBeNull();
      expect(result.type).toBe('handoff');
    });

    it('should prioritize list choices over yes/no questions', async () => {
      const { processMessageForQuickActions } = await getMessageView();

      const message = createAssistantMessage(`Would you like to proceed?
1. Yes, go ahead
2. No, wait`);

      const result = processMessageForQuickActions(message);

      expect(result).not.toBeNull();
      expect(result.type).toBe('list');
    });

  });

  describe('Multi-content message handling', () => {

    it('should handle messages with multiple text content blocks', async () => {
      const { processMessageForQuickActions } = await getMessageView();

      const message = createAssistantMessage([
        'I analyzed the code.',
        '\n\nShall I fix the bug?'
      ]);

      const result = processMessageForQuickActions(message);

      expect(result).not.toBeNull();
      expect(result.type).toBe('yesno');
    });

    it('should concatenate content blocks for analysis', async () => {
      const { processMessageForQuickActions } = await getMessageView();

      const message = createAssistantMessage([
        'Here are the options:',
        '\n1. First',
        '\n2. Second'
      ]);

      const result = processMessageForQuickActions(message);

      expect(result).not.toBeNull();
      expect(result.type).toBe('list');
    });

  });

});
