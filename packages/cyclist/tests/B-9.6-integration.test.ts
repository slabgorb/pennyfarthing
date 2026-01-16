/**
 * B-9.6: Suggested Prompt Insertion - Integration Tests
 *
 * Tests for the processMessageForQuickActions function which integrates
 * all detection mechanisms.
 *
 * DETECTION STRATEGY (Story 25-5):
 * Quick actions use structured CYCLIST markers ONLY for 100% reliable detection.
 * Pattern-based detection (heuristics for questions/lists) was intentionally
 * removed in favor of explicit markers that agents emit.
 *
 * Marker format: <!-- CYCLIST:TYPE:value -->
 * Types:
 *   - HANDOFF:/agent - Agent handoff suggestion
 *   - QUESTION:yesno - Yes/No question
 *   - QUESTION:choice - Multiple choice with CHOICES marker
 *   - CHOICES:1,2,3 - List of choice numbers
 *
 * This approach eliminates false positives from pattern matching while
 * ensuring agents have full control over when quick actions appear.
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

    it('should return null for non-assistant messages', async () => {
      const { processMessageForQuickActions } = await getMessageView();

      const message = createToolResultMessage('Would you like me to continue?');

      const result = processMessageForQuickActions(message);

      expect(result).toBeNull();
    });

    it('should return null for assistant messages without markers', async () => {
      const { processMessageForQuickActions } = await getMessageView();

      // Plain question without marker - should NOT trigger quick actions
      const message = createAssistantMessage('Would you like me to create this file?');

      const result = processMessageForQuickActions(message);

      expect(result).toBeNull();
    });

    it('should return null for numbered lists without markers', async () => {
      const { processMessageForQuickActions } = await getMessageView();

      // Numbered list without marker - should NOT trigger quick actions
      const message = createAssistantMessage(`Here are your options:
1. Create new component
2. Modify existing file
3. Skip this step`);

      const result = processMessageForQuickActions(message);

      expect(result).toBeNull();
    });

  });

  describe('Structured marker detection', () => {

    it('should detect HANDOFF markers', async () => {
      const { processMessageForQuickActions } = await getMessageView();

      const message = createAssistantMessage(`Implementation complete. Run /reviewer to continue.
<!-- CYCLIST:HANDOFF:/reviewer -->`);

      const result = processMessageForQuickActions(message);

      expect(result).not.toBeNull();
      expect(result.type).toBe('handoff');
      expect(result.agent).toBe('/reviewer');
      expect(result.source).toBe('structured_marker');
      expect(result.confidence).toBe(1.0);
    });

    it('should detect QUESTION:yesno markers', async () => {
      const { processMessageForQuickActions } = await getMessageView();

      const message = createAssistantMessage(`Would you like me to create this file?
<!-- CYCLIST:QUESTION:yesno -->`);

      const result = processMessageForQuickActions(message);

      expect(result).not.toBeNull();
      expect(result.type).toBe('yesno');
      expect(result.responses).toEqual(['Yes', 'No']);
      expect(result.source).toBe('structured_marker');
    });

    it('should detect CHOICES markers with option extraction', async () => {
      const { processMessageForQuickActions } = await getMessageView();

      const message = createAssistantMessage(`Which approach would you prefer?

1. Create new component
2. Modify existing file
3. Skip this step

<!-- CYCLIST:CHOICES:1,2,3 -->`);

      const result = processMessageForQuickActions(message);

      expect(result).not.toBeNull();
      expect(result.type).toBe('list');
      expect(result.choices).toHaveLength(3);
      expect(result.choices[0].number).toBe(1);
      expect(result.choices[0].text).toBe('Create new component');
      expect(result.source).toBe('structured_marker');
    });

  });

  describe('Multi-content message handling', () => {

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

    it('should concatenate content blocks for marker detection', async () => {
      const { processMessageForQuickActions } = await getMessageView();

      const message = createAssistantMessage([
        'Here are the options:',
        '\n1. First option',
        '\n2. Second option',
        '\n<!-- CYCLIST:CHOICES:1,2 -->'
      ]);

      const result = processMessageForQuickActions(message);

      expect(result).not.toBeNull();
      expect(result.type).toBe('list');
      expect(result.choices).toHaveLength(2);
    });

  });

  describe('Marker edge cases', () => {

    it('should ignore markers inside code blocks', async () => {
      const { processMessageForQuickActions } = await getMessageView();

      const message = createAssistantMessage(`Here's an example of the marker format:

\`\`\`html
<!-- CYCLIST:HANDOFF:/reviewer -->
\`\`\`

This is just documentation.`);

      const result = processMessageForQuickActions(message);

      expect(result).toBeNull();
    });

    it('should handle case-insensitive marker prefix', async () => {
      const { processMessageForQuickActions } = await getMessageView();

      const message = createAssistantMessage(`Done!
<!-- cyclist:handoff:/dev -->`);

      const result = processMessageForQuickActions(message);

      expect(result).not.toBeNull();
      expect(result.type).toBe('handoff');
      expect(result.agent).toBe('/dev');
    });

  });

});
