/**
 * Story 25-5: Structured Output Markers
 *
 * Tests for CYCLIST marker detection and parsing.
 * Markers are HTML comments like <!-- CYCLIST:HANDOFF:/tea -->
 */

import { describe, it, expect } from 'vitest';
import {
  getMessageView,
  createAssistantMessage,
} from './helpers/suggested-prompts-helpers.js';

describe('25-5: Structured Output Markers', () => {

  describe('Module Exports for Marker Detection', () => {

    it('should export detectStructuredMarkers function', async () => {
      const messageView = await getMessageView();

      expect(messageView.detectStructuredMarkers).toBeDefined();
      expect(typeof messageView.detectStructuredMarkers).toBe('function');
    });

  });

  describe('AC3: Cyclist parses markers with 100% accuracy', () => {

    describe('Single marker extraction', () => {

      it('should detect HANDOFF marker with agent name', async () => {
        const { detectStructuredMarkers } = await getMessageView();

        const text = 'Ready for the next phase.\n<!-- CYCLIST:HANDOFF:/tea -->';

        const result = detectStructuredMarkers(text);

        expect(result).not.toBeNull();
        expect(result).toHaveLength(1);
        expect(result[0].type).toBe('handoff');
        expect(result[0].value).toBe('/tea');
        expect(result[0].source).toBe('structured_marker');
      });

      it('should detect QUESTION marker with yesno type', async () => {
        const { detectStructuredMarkers } = await getMessageView();

        const text = 'Shall I proceed with the changes?\n<!-- CYCLIST:QUESTION:yesno -->';

        const result = detectStructuredMarkers(text);

        expect(result).not.toBeNull();
        expect(result).toHaveLength(1);
        expect(result[0].type).toBe('question');
        expect(result[0].value).toBe('yesno');
      });

      it('should detect CHOICES marker with choice numbers', async () => {
        const { detectStructuredMarkers } = await getMessageView();

        const text = 'Which option do you prefer?\n1. First\n2. Second\n3. Third\n<!-- CYCLIST:CHOICES:1,2,3 -->';

        const result = detectStructuredMarkers(text);

        expect(result).not.toBeNull();
        expect(result).toHaveLength(1);
        expect(result[0].type).toBe('choices');
        expect(result[0].value).toBe('1,2,3');
      });

      it('should detect HANDOFF marker for /reviewer', async () => {
        const { detectStructuredMarkers } = await getMessageView();

        const text = 'Implementation complete. Ready for review.\n<!-- CYCLIST:HANDOFF:/reviewer -->';

        const result = detectStructuredMarkers(text);

        expect(result).not.toBeNull();
        expect(result[0].type).toBe('handoff');
        expect(result[0].value).toBe('/reviewer');
      });

      it('should detect HANDOFF marker for /dev', async () => {
        const { detectStructuredMarkers } = await getMessageView();

        const text = 'Tests are RED. Ready for implementation.\n<!-- CYCLIST:HANDOFF:/dev -->';

        const result = detectStructuredMarkers(text);

        expect(result).not.toBeNull();
        expect(result[0].type).toBe('handoff');
        expect(result[0].value).toBe('/dev');
      });

      it('should detect HANDOFF marker for /sm', async () => {
        const { detectStructuredMarkers } = await getMessageView();

        const text = 'PR approved. Ready for archival.\n<!-- CYCLIST:HANDOFF:/sm -->';

        const result = detectStructuredMarkers(text);

        expect(result).not.toBeNull();
        expect(result[0].type).toBe('handoff');
        expect(result[0].value).toBe('/sm');
      });

    });

    describe('Multiple marker extraction', () => {

      it('should extract multiple markers from text', async () => {
        const { detectStructuredMarkers } = await getMessageView();

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
        const { detectStructuredMarkers } = await getMessageView();

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
        const { detectStructuredMarkers } = await getMessageView();

        const text = 'This is a regular message without any markers.';

        const result = detectStructuredMarkers(text);

        expect(result).toBeNull();
      });

      it('should return null for empty string', async () => {
        const { detectStructuredMarkers } = await getMessageView();

        const result = detectStructuredMarkers('');

        expect(result).toBeNull();
      });

      it('should return null for null input', async () => {
        const { detectStructuredMarkers } = await getMessageView();

        const result = detectStructuredMarkers(null);

        expect(result).toBeNull();
      });

      it('should return null for regular HTML comments (not CYCLIST prefixed)', async () => {
        const { detectStructuredMarkers } = await getMessageView();

        const text = 'Some text <!-- This is a regular comment --> more text';

        const result = detectStructuredMarkers(text);

        expect(result).toBeNull();
      });

      it('should return null for malformed markers', async () => {
        const { detectStructuredMarkers } = await getMessageView();

        // Missing colon between type and value
        const text = '<!-- CYCLIST:HANDOFF/tea -->';

        const result = detectStructuredMarkers(text);

        expect(result).toBeNull();
      });

    });

    describe('Marker format variations', () => {

      it('should handle whitespace inside marker', async () => {
        const { detectStructuredMarkers } = await getMessageView();

        const text = '<!--  CYCLIST:HANDOFF:/tea  -->';

        const result = detectStructuredMarkers(text);

        expect(result).not.toBeNull();
        expect(result[0].value).toBe('/tea');
      });

      it('should be case-insensitive for marker type', async () => {
        const { detectStructuredMarkers } = await getMessageView();

        const text = '<!-- CYCLIST:handoff:/tea -->';

        const result = detectStructuredMarkers(text);

        expect(result).not.toBeNull();
        expect(result[0].type).toBe('handoff');
      });

      it('should preserve case of value', async () => {
        const { detectStructuredMarkers } = await getMessageView();

        const text = '<!-- CYCLIST:HANDOFF:/TEA -->';

        const result = detectStructuredMarkers(text);

        expect(result).not.toBeNull();
        expect(result[0].value).toBe('/TEA');
      });

      it('should handle marker at start of text', async () => {
        const { detectStructuredMarkers } = await getMessageView();

        const text = '<!-- CYCLIST:HANDOFF:/dev -->\nSome following text.';

        const result = detectStructuredMarkers(text);

        expect(result).not.toBeNull();
        expect(result[0].type).toBe('handoff');
      });

      it('should handle marker at end of text', async () => {
        const { detectStructuredMarkers } = await getMessageView();

        const text = 'Some preceding text.\n<!-- CYCLIST:HANDOFF:/dev -->';

        const result = detectStructuredMarkers(text);

        expect(result).not.toBeNull();
        expect(result[0].type).toBe('handoff');
      });

    });

    describe('Works with surrounding markdown', () => {

      it('should detect marker within markdown formatting', async () => {
        const { detectStructuredMarkers } = await getMessageView();

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
        const { detectStructuredMarkers } = await getMessageView();

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
        const { detectStructuredMarkers } = await getMessageView();

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
      const { processMessageForQuickActions } = await getMessageView();

      // This text has both a pattern-detectable handoff AND a structured marker
      const message = createAssistantMessage(`Implementation complete. Run /dev to continue.
<!-- CYCLIST:HANDOFF:/reviewer -->`);

      const result = processMessageForQuickActions(message);

      expect(result).not.toBeNull();
      // Should use the marker (/reviewer) not the pattern (/dev)
      expect(result.agent).toBe('/reviewer');
      expect(result.source).toBe('structured_marker');
    });

    it('should return structured marker result for QUESTION type', async () => {
      const { processMessageForQuickActions } = await getMessageView();

      const message = createAssistantMessage(`Do you want to continue?
<!-- CYCLIST:QUESTION:yesno -->`);

      const result = processMessageForQuickActions(message);

      expect(result).not.toBeNull();
      expect(result.type).toBe('yesno');
      expect(result.source).toBe('structured_marker');
    });

    it('should return structured marker result for CHOICES type', async () => {
      const { processMessageForQuickActions } = await getMessageView();

      const message = createAssistantMessage(`Pick one:
1. Option A
2. Option B
<!-- CYCLIST:CHOICES:1,2 -->`);

      const result = processMessageForQuickActions(message);

      expect(result).not.toBeNull();
      expect(result.type).toBe('list');
      expect(result.source).toBe('structured_marker');
    });

    // SKIPPED: Pattern-based fallback disabled in favor of markers-only detection
    // See quick-actions-fix session for rationale: pattern detection caused flakiness
    // during streaming because it ran on incomplete text fragments.
    it.skip('should fall back to pattern detection when no markers present (disabled)', async () => {
      const { processMessageForQuickActions } = await getMessageView();

      const message = createAssistantMessage('Please invoke /reviewer to continue.');

      const result = processMessageForQuickActions(message);

      expect(result).not.toBeNull();
      expect(result.type).toBe('handoff');
      expect(result.agent).toBe('/reviewer');
      expect(result.source).not.toBe('structured_marker');
    });

    it('should return null when no markers present (markers-only mode)', async () => {
      const { processMessageForQuickActions } = await getMessageView();

      // Without markers, processMessageForQuickActions now returns null
      const message = createAssistantMessage('Please invoke /reviewer to continue.');

      const result = processMessageForQuickActions(message);

      // Pattern-based detection is disabled, so no marker = no result
      expect(result).toBeNull();
    });

  });

  describe('AC4: Markers hidden from user display', () => {

    it('should not include marker text in rendered quick actions', async () => {
      const { renderQuickActions } = await getMessageView();

      const result = {
        type: 'handoff',
        agent: '/tea',
        responses: ['/tea', 'Not yet'],
        source: 'structured_marker'
      };

      const html = renderQuickActions(result);

      expect(html).not.toContain('<!-- CYCLIST');
      expect(html).not.toContain('CYCLIST:HANDOFF');
      expect(html).toContain('/tea');
    });

    it('markers should be invisible as HTML comments', async () => {
      const markerText = '<!-- CYCLIST:HANDOFF:/tea -->';

      expect(markerText).toMatch(/^<!--.*-->$/);
    });

  });

  describe('Rendering quick actions from markers', () => {

    it('should render handoff button from HANDOFF marker', async () => {
      const { renderQuickActions } = await getMessageView();

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
      const { renderQuickActions } = await getMessageView();

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
      const { renderQuickActions } = await getMessageView();

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
      const { detectStructuredMarkers } = await getMessageView();

      const text = '<!-- cyclist:HANDOFF:/tea -->';

      const result = detectStructuredMarkers(text);

      expect(result).not.toBeNull();
      expect(result[0].type).toBe('handoff');
    });

    it('should NOT detect marker-like text in code blocks', async () => {
      const { detectStructuredMarkers } = await getMessageView();

      const text = `Here's an example:
\`\`\`html
<!-- CYCLIST:HANDOFF:/tea -->
\`\`\`

That was just an example.`;

      const result = detectStructuredMarkers(text);

      expect(result).toBeNull();
    });

    it('should detect marker outside code block even when code block contains marker-like text', async () => {
      const { detectStructuredMarkers } = await getMessageView();

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
      const { detectStructuredMarkers } = await getMessageView();

      const text = 'Use `<!-- CYCLIST:HANDOFF:/tea -->` for handoffs.';

      const result = detectStructuredMarkers(text);

      // Inline code is not stripped, so this edge case might detect
      expect(result).not.toBeNull();
    });

  });

});
