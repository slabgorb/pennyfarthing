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

    // SKIPPED: Pattern-based detection disabled in favor of markers-only
    // See quick-actions-fix session for rationale
    it.skip('should detect questions in assistant messages (pattern-based - disabled)', async () => {
      const { processMessageForQuickActions } = await getMessageView();

      const message = createAssistantMessage('Would you like me to create this file?');

      const result = processMessageForQuickActions(message);

      expect(result).not.toBeNull();
      expect(result.type).toBe('yesno');
    });

    // SKIPPED: Pattern-based detection disabled in favor of markers-only
    it.skip('should detect list choices in assistant messages (pattern-based - disabled)', async () => {
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

    // SKIPPED: Pattern-based detection disabled in favor of markers-only
    it.skip('should prioritize list choices over yes/no when both present (pattern-based - disabled)', async () => {
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

  describe('Priority order: markers-only (pattern detection disabled)', () => {

    it('should detect structured markers in messages', async () => {
      const { processMessageForQuickActions } = await getMessageView();

      // Marker detection still works - this is the only detection now
      const message = createAssistantMessage(`Run /dev to continue.
<!-- CYCLIST:HANDOFF:/reviewer -->`);

      const result = processMessageForQuickActions(message);

      expect(result).not.toBeNull();
      expect(result.agent).toBe('/reviewer');
      expect(result.source).toBe('structured_marker');
    });

    // SKIPPED: Pattern-based detection disabled - no longer have handoff vs list priority
    it.skip('should prioritize handoff over list choices (pattern-based - disabled)', async () => {
      const { processMessageForQuickActions } = await getMessageView();

      const message = createAssistantMessage(`Which option?
1. Option A
2. Option B

Please invoke /reviewer to continue.`);

      const result = processMessageForQuickActions(message);

      expect(result).not.toBeNull();
      expect(result.type).toBe('handoff');
    });

    // SKIPPED: Pattern-based detection disabled
    it.skip('should prioritize list choices over yes/no questions (pattern-based - disabled)', async () => {
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

    // SKIPPED: Pattern-based detection disabled in favor of markers-only
    it.skip('should handle messages with multiple text content blocks (pattern-based - disabled)', async () => {
      const { processMessageForQuickActions } = await getMessageView();

      const message = createAssistantMessage([
        'I analyzed the code.',
        '\n\nShall I fix the bug?'
      ]);

      const result = processMessageForQuickActions(message);

      expect(result).not.toBeNull();
      expect(result.type).toBe('yesno');
    });

    // SKIPPED: Pattern-based detection disabled in favor of markers-only
    it.skip('should concatenate content blocks for analysis (pattern-based - disabled)', async () => {
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

    it('should handle multi-content messages with markers', async () => {
      const { processMessageForQuickActions } = await getMessageView();

      const message = createAssistantMessage([
        'Implementation complete.',
        '\n\n<!-- CYCLIST:HANDOFF:/reviewer -->'
      ]);

      const result = processMessageForQuickActions(message);

      expect(result).not.toBeNull();
      expect(result.type).toBe('handoff');
      expect(result.agent).toBe('/reviewer');
    });

  });

});
