/**
 * Story 25-3: Detect Handoff & Action Prompts
 *
 * Tests for detecting agent handoff patterns like "invoke /reviewer"
 * and showing appropriate quick-action buttons.
 */

import { describe, it, expect } from 'vitest';
import {
  getMessageView,
  createAssistantMessage,
  mockInsertAndSubmit,
} from './helpers/suggested-prompts-helpers.js';

describe('25-3: Handoff & Action Prompt Detection', () => {

  describe('Module Exports for Handoff Detection', () => {

    it('should export detectHandoffPattern function', async () => {
      const messageView = await getMessageView();

      expect(messageView.detectHandoffPattern).toBeDefined();
      expect(typeof messageView.detectHandoffPattern).toBe('function');
    });

    it('should export HANDOFF_PATTERNS constant', async () => {
      const messageView = await getMessageView();

      expect(messageView.HANDOFF_PATTERNS).toBeDefined();
      expect(Array.isArray(messageView.HANDOFF_PATTERNS)).toBe(true);
    });

    it('should export PHASE_TO_AGENT mapping', async () => {
      const messageView = await getMessageView();

      expect(messageView.PHASE_TO_AGENT).toBeDefined();
      expect(typeof messageView.PHASE_TO_AGENT).toBe('object');
    });

  });

  describe('AC1: Detects "invoke /X" patterns', () => {

    it('should detect "invoke /reviewer" pattern', async () => {
      const { detectHandoffPattern } = await getMessageView();

      const result = detectHandoffPattern('Please invoke /reviewer to continue');

      expect(result).not.toBeNull();
      expect(result.type).toBe('handoff');
      expect(result.agent).toBe('/reviewer');
    });

    it('should detect "run /dev" pattern', async () => {
      const { detectHandoffPattern } = await getMessageView();

      const result = detectHandoffPattern('Now run /dev to implement the feature');

      expect(result).not.toBeNull();
      expect(result.type).toBe('handoff');
      expect(result.agent).toBe('/dev');
    });

    it('should detect "use /sm" pattern', async () => {
      const { detectHandoffPattern } = await getMessageView();

      const result = detectHandoffPattern('Use /sm to finish the story');

      expect(result).not.toBeNull();
      expect(result.type).toBe('handoff');
      expect(result.agent).toBe('/sm');
    });

    it('should detect "start /tea" pattern', async () => {
      const { detectHandoffPattern } = await getMessageView();

      const result = detectHandoffPattern('Start /tea for the test phase');

      expect(result).not.toBeNull();
      expect(result.type).toBe('handoff');
      expect(result.agent).toBe('/tea');
    });

    it('should detect "switch to /reviewer" pattern', async () => {
      const { detectHandoffPattern } = await getMessageView();

      const result = detectHandoffPattern('Switch to /reviewer for code review');

      expect(result).not.toBeNull();
      expect(result.type).toBe('handoff');
      expect(result.agent).toBe('/reviewer');
    });

    it('should be case insensitive for invoke patterns', async () => {
      const { detectHandoffPattern } = await getMessageView();

      const result1 = detectHandoffPattern('INVOKE /reviewer now');
      const result2 = detectHandoffPattern('Invoke /Dev to continue');

      expect(result1).not.toBeNull();
      expect(result1.agent).toBe('/reviewer');
      expect(result2).not.toBeNull();
      expect(result2.agent.toLowerCase()).toBe('/dev');
    });

    it('should NOT detect "invoke" without slash-prefixed agent', async () => {
      const { detectHandoffPattern } = await getMessageView();

      const result = detectHandoffPattern('I will invoke the function');

      expect(result).toBeNull();
    });

    it('should NOT detect partial matches in code discussions', async () => {
      const { detectHandoffPattern } = await getMessageView();

      const result = detectHandoffPattern('You can run the tests with npm test');

      expect(result).toBeNull();
    });

  });

  describe('AC2: Detects "ready for X" patterns', () => {

    it('should detect "ready for review" and suggest /reviewer', async () => {
      const { detectHandoffPattern } = await getMessageView();

      const result = detectHandoffPattern('The code is ready for review.');

      expect(result).not.toBeNull();
      expect(result.type).toBe('handoff');
      expect(result.agent).toBe('/reviewer');
    });

    it('should detect "ready for testing" and suggest /tea', async () => {
      const { detectHandoffPattern } = await getMessageView();

      const result = detectHandoffPattern('Implementation complete, ready for testing.');

      expect(result).not.toBeNull();
      expect(result.type).toBe('handoff');
      expect(result.agent).toBe('/tea');
    });

    it('should detect "ready for implementation" and suggest /dev', async () => {
      const { detectHandoffPattern } = await getMessageView();

      const result = detectHandoffPattern('Tests are written, ready for implementation.');

      expect(result).not.toBeNull();
      expect(result.type).toBe('handoff');
      expect(result.agent).toBe('/dev');
    });

    it('should detect context warning with "start fresh with /tea"', async () => {
      const { detectHandoffPattern } = await getMessageView();

      const result = detectHandoffPattern('Context is high. Start fresh with /tea');

      expect(result).not.toBeNull();
      expect(result.type).toBe('handoff');
      expect(result.agent).toBe('/tea');
    });

    it('should detect context percentage warning with agent suggestion', async () => {
      const { detectHandoffPattern } = await getMessageView();

      const result = detectHandoffPattern('Context usage >70%. Start a new session with /dev');

      expect(result).not.toBeNull();
      expect(result.type).toBe('handoff');
      expect(result.agent).toBe('/dev');
    });

    it('should NOT detect "ready" without recognized phase', async () => {
      const { detectHandoffPattern } = await getMessageView();

      const result = detectHandoffPattern('I am ready for lunch.');

      expect(result).toBeNull();
    });

  });

  describe('AC3: Shows button to invoke the suggested command', () => {

    it('should return responses array with agent command', async () => {
      const { detectHandoffPattern } = await getMessageView();

      const result = detectHandoffPattern('Please invoke /reviewer to continue');

      expect(result).not.toBeNull();
      expect(result.responses).toBeDefined();
      expect(Array.isArray(result.responses)).toBe(true);
      expect(result.responses).toContain('/reviewer');
    });

    it('should include "Not yet" as alternative response', async () => {
      const { detectHandoffPattern } = await getMessageView();

      const result = detectHandoffPattern('Run /dev to implement');

      expect(result).not.toBeNull();
      expect(result.responses).toContain('Not yet');
    });

    it('should render handoff type in quick actions', async () => {
      const { renderQuickActions } = await getMessageView();

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
      const { handleQuickActionClick } = await getMessageView();
      const mockFn = await mockInsertAndSubmit();

      handleQuickActionClick('/reviewer');

      expect(mockFn).toHaveBeenCalledWith('/reviewer');

      mockFn.mockRestore();
    });

  });

  describe('AC4: Works for all Pennyfarthing agents', () => {

    const allAgents = [
      'sm', 'tea', 'dev', 'reviewer', 'architect',
      'pm', 'tech-writer', 'ux-designer', 'devops', 'orchestrator'
    ];

    it.each(allAgents)('should detect "invoke /%s" pattern', async (agent) => {
      const { detectHandoffPattern } = await getMessageView();

      const result = detectHandoffPattern(`Please invoke /${agent} to continue`);

      expect(result).not.toBeNull();
      expect(result.type).toBe('handoff');
      expect(result.agent).toBe(`/${agent}`);
    });

    it.each(allAgents)('should detect "run /%s" pattern', async (agent) => {
      const { detectHandoffPattern } = await getMessageView();

      const result = detectHandoffPattern(`Run /${agent} now`);

      expect(result).not.toBeNull();
      expect(result.agent).toBe(`/${agent}`);
    });

    it.each(allAgents)('should detect "use /%s" pattern', async (agent) => {
      const { detectHandoffPattern } = await getMessageView();

      const result = detectHandoffPattern(`Use /${agent} for this task`);

      expect(result).not.toBeNull();
      expect(result.agent).toBe(`/${agent}`);
    });

  });

  describe('Edge Cases and False Positive Prevention', () => {

    it('should only check last paragraph for handoff patterns', async () => {
      const { detectHandoffPattern } = await getMessageView();

      const text = `I used /reviewer earlier to check the code.

The implementation is complete and tests are passing.`;

      const result = detectHandoffPattern(text);

      expect(result).toBeNull();
    });

    it('should detect handoff in last paragraph only', async () => {
      const { detectHandoffPattern } = await getMessageView();

      const text = `The implementation is complete.

Please invoke /reviewer to continue.`;

      const result = detectHandoffPattern(text);

      expect(result).not.toBeNull();
      expect(result.agent).toBe('/reviewer');
    });

    it('should take the LAST agent mentioned when multiple are present', async () => {
      const { detectHandoffPattern } = await getMessageView();

      const text = 'You could run /dev or invoke /reviewer. I recommend /reviewer.';

      const result = detectHandoffPattern(text);

      expect(result).not.toBeNull();
      expect(result.agent).toBe('/reviewer');
    });

    it('should handle markdown formatting around agent names', async () => {
      const { detectHandoffPattern } = await getMessageView();

      const result = detectHandoffPattern('Please invoke **`/reviewer`** to continue');

      expect(result).not.toBeNull();
      expect(result.agent).toBe('/reviewer');
    });

    it('should handle agent without slash when preceded by invoke keyword', async () => {
      const { detectHandoffPattern } = await getMessageView();

      const result = detectHandoffPattern('Please invoke reviewer to continue');

      expect(result).not.toBeNull();
      expect(result.agent).toBe('/reviewer');
    });

    it('should NOT detect agent names in code blocks', async () => {
      const { detectHandoffPattern } = await getMessageView();

      const text = '```bash\ninvoke /reviewer\n```\n\nThat was an example command.';

      const result = detectHandoffPattern(text);

      expect(result).toBeNull();
    });

  });

  describe('Integration: Handoff detection in message processing', () => {

    it('should prioritize handoff patterns over yes/no questions', async () => {
      const { processMessageForQuickActions } = await getMessageView();

      const message = createAssistantMessage('Would you like me to invoke /reviewer for code review?');

      const result = processMessageForQuickActions(message);

      expect(result).not.toBeNull();
      expect(result.type).toBe('handoff');
      expect(result.agent).toBe('/reviewer');
    });

    it('should prioritize handoff patterns over list choices', async () => {
      const { processMessageForQuickActions } = await getMessageView();

      const message = createAssistantMessage(`Here are your options:
1. Continue working
2. Take a break

Ready for review. Please invoke /reviewer.`);

      const result = processMessageForQuickActions(message);

      expect(result).not.toBeNull();
      expect(result.type).toBe('handoff');
    });

    it('should detect handoff in SDK message format', async () => {
      const { processMessageForQuickActions } = await getMessageView();

      const message = createAssistantMessage([
        'Implementation complete.',
        '\n\nRun /dev to continue.'
      ]);

      const result = processMessageForQuickActions(message);

      expect(result).not.toBeNull();
      expect(result.type).toBe('handoff');
      expect(result.agent).toBe('/dev');
    });

  });

});
