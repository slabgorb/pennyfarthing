/**
 * Tests for the CONTINUE marker type
 *
 * Story: MSSCI-12787 - Implement CYCLIST Marker Parsing and Action Buttons
 *
 * The CONTINUE marker signals a status update - the user can continue
 * or redirect. It has no value parameter.
 *
 * Format: <!-- CYCLIST:CONTINUE -->
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  detectMarkers,
  MARKER_TYPES,
  VALID_MARKER_TYPES,
  type MarkerType,
} from './index.js';

describe('CONTINUE marker type', () => {
  describe('type definition', () => {
    it('should include continue in MarkerType', () => {
      // This test verifies the type includes 'continue'
      const type: MarkerType = 'continue';
      assert.strictEqual(type, 'continue');
    });

    it('should have CONTINUE constant in MARKER_TYPES', () => {
      assert.strictEqual(MARKER_TYPES.CONTINUE, 'continue');
    });

    it('should include continue in VALID_MARKER_TYPES', () => {
      assert.ok(VALID_MARKER_TYPES.has('continue'), 'VALID_MARKER_TYPES should include continue');
    });
  });

  describe('detection', () => {
    it('should detect CONTINUE marker without value', () => {
      const text = '<!-- CYCLIST:CONTINUE -->';
      const result = detectMarkers(text);

      assert.ok(result !== null, 'Should detect CONTINUE marker');
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].type, 'continue');
      // CONTINUE has no value, should be empty string or null
      assert.ok(
        result[0].value === '' || result[0].value === null || result[0].value === undefined,
        'CONTINUE marker should have no value'
      );
    });

    it('should be case-insensitive for CONTINUE type', () => {
      const texts = [
        '<!-- CYCLIST:CONTINUE -->',
        '<!-- CYCLIST:continue -->',
        '<!-- CYCLIST:Continue -->',
      ];

      for (const text of texts) {
        const result = detectMarkers(text);
        assert.ok(result !== null, `Should detect marker in: ${text}`);
        assert.strictEqual(result[0].type, 'continue', 'Type should be normalized to lowercase');
      }
    });

    it('should detect CONTINUE alongside other markers', () => {
      const text = `
Some status update here.

<!-- CYCLIST:CONTINUE -->

Run \`/dev\` to continue
`;
      const result = detectMarkers(text);

      assert.ok(result !== null, 'Should detect CONTINUE marker');
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].type, 'continue');
    });

    it('should ignore CONTINUE inside code blocks', () => {
      const text = `
Regular text
\`\`\`
<!-- CYCLIST:CONTINUE -->
\`\`\`
More text
`;
      const result = detectMarkers(text);
      assert.strictEqual(result, null, 'Should not detect marker inside code block');
    });
  });
});
