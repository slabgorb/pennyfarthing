/**
 * Tests for the marker detection module.
 *
 * These tests cover the shared marker parsing logic that will be used by
 * both Cyclist terminal and VS Code extension.
 *
 * @see docs/adr/0011-reflector-marker-consolidation.md
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  detectMarkers,
  stripMarkers,
  stripCodeBlocks,
  MARKER_PATTERN,
  MARKER_TYPES,
  VALID_MARKER_TYPES,
  type Marker,
  type MarkerType,
} from './index.js';

// =============================================================================
// Type Tests
// =============================================================================

describe('marker types', () => {
  describe('MarkerType', () => {
    it('should include handoff type', () => {
      const type: MarkerType = 'handoff';
      assert.strictEqual(type, 'handoff');
    });

    it('should include context_clear type', () => {
      const type: MarkerType = 'context_clear';
      assert.strictEqual(type, 'context_clear');
    });

    it('should include invoke type', () => {
      const type: MarkerType = 'invoke';
      assert.strictEqual(type, 'invoke');
    });

    it('should include question type', () => {
      const type: MarkerType = 'question';
      assert.strictEqual(type, 'question');
    });

    it('should include choices type', () => {
      const type: MarkerType = 'choices';
      assert.strictEqual(type, 'choices');
    });
  });

  describe('Marker interface', () => {
    it('should have type, value, and optional source fields', () => {
      const marker: Marker = {
        type: 'handoff',
        value: '/dev',
        source: 'structured_marker',
      };

      assert.strictEqual(marker.type, 'handoff');
      assert.strictEqual(marker.value, '/dev');
      assert.strictEqual(marker.source, 'structured_marker');
    });

    it('should allow source to be omitted', () => {
      const marker: Marker = {
        type: 'invoke',
        value: '/tea',
      };

      assert.strictEqual(marker.type, 'invoke');
      assert.strictEqual(marker.value, '/tea');
      assert.strictEqual(marker.source, undefined);
    });
  });
});

// =============================================================================
// Constants Tests
// =============================================================================

describe('marker constants', () => {
  describe('MARKER_PATTERN', () => {
    it('should be a global case-insensitive regex', () => {
      assert.ok(MARKER_PATTERN instanceof RegExp);
      assert.ok(MARKER_PATTERN.flags.includes('g'), 'Should have global flag');
      assert.ok(MARKER_PATTERN.flags.includes('i'), 'Should have case-insensitive flag');
    });

    it('should match basic CYCLIST marker format', () => {
      const text = '<!-- CYCLIST:HANDOFF:/dev -->';
      MARKER_PATTERN.lastIndex = 0;
      const match = MARKER_PATTERN.exec(text);

      assert.ok(match !== null, 'Should match basic marker');
      assert.strictEqual(match[1], 'HANDOFF');
      assert.strictEqual(match[2], '/dev');
    });

    it('should match with whitespace variations', () => {
      const text = '<!--  CYCLIST:HANDOFF:  /dev   -->';
      MARKER_PATTERN.lastIndex = 0;
      const match = MARKER_PATTERN.exec(text);

      assert.ok(match !== null, 'Should match with extra whitespace');
    });

    it('should match lowercase CYCLIST prefix', () => {
      const text = '<!-- cyclist:handoff:/dev -->';
      MARKER_PATTERN.lastIndex = 0;
      const match = MARKER_PATTERN.exec(text);

      assert.ok(match !== null, 'Should match lowercase prefix');
    });
  });

  describe('MARKER_TYPES', () => {
    it('should have HANDOFF constant', () => {
      assert.strictEqual(MARKER_TYPES.HANDOFF, 'handoff');
    });

    it('should have CONTEXT_CLEAR constant', () => {
      assert.strictEqual(MARKER_TYPES.CONTEXT_CLEAR, 'context_clear');
    });

    it('should have INVOKE constant', () => {
      assert.strictEqual(MARKER_TYPES.INVOKE, 'invoke');
    });

    it('should have QUESTION constant', () => {
      assert.strictEqual(MARKER_TYPES.QUESTION, 'question');
    });

    it('should have CHOICES constant', () => {
      assert.strictEqual(MARKER_TYPES.CHOICES, 'choices');
    });
  });

  describe('VALID_MARKER_TYPES', () => {
    it('should be a Set', () => {
      assert.ok(VALID_MARKER_TYPES instanceof Set);
    });

    it('should contain all 6 marker types', () => {
      assert.strictEqual(VALID_MARKER_TYPES.size, 6);
      assert.ok(VALID_MARKER_TYPES.has('handoff'));
      assert.ok(VALID_MARKER_TYPES.has('context_clear'));
      assert.ok(VALID_MARKER_TYPES.has('invoke'));
      assert.ok(VALID_MARKER_TYPES.has('question'));
      assert.ok(VALID_MARKER_TYPES.has('choices'));
      assert.ok(VALID_MARKER_TYPES.has('continue'));
    });

    it('should match MARKER_TYPES values', () => {
      // VALID_MARKER_TYPES should contain exactly the values from MARKER_TYPES
      const typeValues = Object.values(MARKER_TYPES);
      assert.strictEqual(VALID_MARKER_TYPES.size, typeValues.length);
      for (const value of typeValues) {
        assert.ok(VALID_MARKER_TYPES.has(value), `Should contain ${value}`);
      }
    });

    it('should not contain invalid types', () => {
      assert.ok(!VALID_MARKER_TYPES.has('invalid'));
      assert.ok(!VALID_MARKER_TYPES.has('HANDOFF')); // Case sensitive - lowercase only
      assert.ok(!VALID_MARKER_TYPES.has(''));
    });
  });
});

// =============================================================================
// Strip Functions Tests
// =============================================================================

describe('stripCodeBlocks', () => {
  it('should remove single code block', () => {
    const text = 'Before\n```javascript\nconst x = 1;\n```\nAfter';
    const result = stripCodeBlocks(text);

    assert.ok(!result.includes('```'), 'Should not contain code fence');
    assert.ok(!result.includes('const x = 1'), 'Should not contain code content');
    assert.ok(result.includes('Before'), 'Should preserve text before');
    assert.ok(result.includes('After'), 'Should preserve text after');
  });

  it('should remove multiple code blocks', () => {
    const text = '```js\ncode1\n```\ntext\n```ts\ncode2\n```';
    const result = stripCodeBlocks(text);

    assert.ok(!result.includes('code1'), 'Should remove first code block');
    assert.ok(!result.includes('code2'), 'Should remove second code block');
    assert.ok(result.includes('text'), 'Should preserve text between blocks');
  });

  it('should handle text without code blocks', () => {
    const text = 'Just regular text with no code';
    const result = stripCodeBlocks(text);

    assert.strictEqual(result, text);
  });

  it('should handle empty string', () => {
    const result = stripCodeBlocks('');
    assert.strictEqual(result, '');
  });

  it('should handle multiline code blocks', () => {
    const text = '```\nline1\nline2\nline3\n```';
    const result = stripCodeBlocks(text);

    assert.ok(!result.includes('line1'), 'Should remove multiline content');
    assert.ok(!result.includes('line2'), 'Should remove multiline content');
  });
});

describe('stripMarkers', () => {
  it('should remove HANDOFF marker', () => {
    const text = 'Some text <!-- CYCLIST:HANDOFF:/dev --> more text';
    const result = stripMarkers(text);

    assert.ok(!result.includes('CYCLIST'), 'Should remove marker');
    assert.ok(!result.includes('<!--'), 'Should remove HTML comment');
    assert.ok(result.includes('Some text'), 'Should preserve surrounding text');
    assert.ok(result.includes('more text'), 'Should preserve surrounding text');
  });

  it('should remove CONTEXT_CLEAR marker', () => {
    const text = '<!-- CYCLIST:CONTEXT_CLEAR:/sm -->';
    const result = stripMarkers(text);

    assert.strictEqual(result, '');
  });

  it('should remove multiple markers', () => {
    const text = '<!-- CYCLIST:QUESTION:yesno --> text <!-- CYCLIST:CHOICES:1,2,3 -->';
    const result = stripMarkers(text);

    assert.ok(!result.includes('QUESTION'), 'Should remove first marker');
    assert.ok(!result.includes('CHOICES'), 'Should remove second marker');
    assert.ok(result.includes('text'), 'Should preserve text between markers');
  });

  it('should handle text without markers', () => {
    const text = 'Regular text with no markers';
    const result = stripMarkers(text);

    assert.strictEqual(result, text);
  });

  it('should handle empty string', () => {
    const result = stripMarkers('');
    assert.strictEqual(result, '');
  });

  it('should handle null/undefined input', () => {
    // @ts-expect-error - testing runtime behavior with invalid input
    const result = stripMarkers(null);
    assert.strictEqual(result, '');
  });
});

// =============================================================================
// Detection Tests
// =============================================================================

describe('detectMarkers', () => {
  describe('input handling', () => {
    it('should return null for empty string', () => {
      const result = detectMarkers('');
      assert.strictEqual(result, null);
    });

    it('should return null for null input', () => {
      // @ts-expect-error - testing runtime behavior with invalid input
      const result = detectMarkers(null);
      assert.strictEqual(result, null);
    });

    it('should return null for undefined input', () => {
      // @ts-expect-error - testing runtime behavior with invalid input
      const result = detectMarkers(undefined);
      assert.strictEqual(result, null);
    });

    it('should return null for whitespace-only input', () => {
      const result = detectMarkers('   \n\t  ');
      assert.strictEqual(result, null);
    });

    it('should return null for text without markers', () => {
      const result = detectMarkers('Just regular text with no markers');
      assert.strictEqual(result, null);
    });
  });

  describe('marker type detection', () => {
    it('should detect HANDOFF marker', () => {
      const text = '<!-- CYCLIST:HANDOFF:/dev -->';
      const result = detectMarkers(text);

      assert.ok(result !== null, 'Should detect marker');
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].type, 'handoff');
      assert.strictEqual(result[0].value, '/dev');
    });

    it('should detect CONTEXT_CLEAR marker', () => {
      const text = '<!-- CYCLIST:CONTEXT_CLEAR:/reviewer -->';
      const result = detectMarkers(text);

      assert.ok(result !== null, 'Should detect marker');
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].type, 'context_clear');
      assert.strictEqual(result[0].value, '/reviewer');
    });

    it('should detect INVOKE marker', () => {
      const text = '<!-- CYCLIST:INVOKE:/tea -->';
      const result = detectMarkers(text);

      assert.ok(result !== null, 'Should detect marker');
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].type, 'invoke');
      assert.strictEqual(result[0].value, '/tea');
    });

    it('should detect QUESTION marker', () => {
      const text = '<!-- CYCLIST:QUESTION:yesno -->';
      const result = detectMarkers(text);

      assert.ok(result !== null, 'Should detect marker');
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].type, 'question');
      assert.strictEqual(result[0].value, 'yesno');
    });

    it('should detect CHOICES marker with numbers', () => {
      const text = '<!-- CYCLIST:CHOICES:1,2,3 -->';
      const result = detectMarkers(text);

      assert.ok(result !== null, 'Should detect marker');
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].type, 'choices');
      assert.strictEqual(result[0].value, '1,2,3');
    });

    it('should detect CHOICES marker with text labels', () => {
      const text = '<!-- CYCLIST:CHOICES:Option A,Option B,Option C -->';
      const result = detectMarkers(text);

      assert.ok(result !== null, 'Should detect marker');
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].type, 'choices');
      assert.strictEqual(result[0].value, 'Option A,Option B,Option C');
    });
  });

  describe('multiple markers', () => {
    it('should detect multiple markers in order', () => {
      const text = `
        <!-- CYCLIST:QUESTION:yesno -->
        Some text here
        <!-- CYCLIST:CHOICES:1,2 -->
      `;
      const result = detectMarkers(text);

      assert.ok(result !== null, 'Should detect markers');
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].type, 'question');
      assert.strictEqual(result[1].type, 'choices');
    });

    it('should preserve order of markers', () => {
      const text = '<!-- CYCLIST:HANDOFF:/a --><!-- CYCLIST:INVOKE:/b --><!-- CYCLIST:CONTEXT_CLEAR:/c -->';
      const result = detectMarkers(text);

      assert.ok(result !== null, 'Should detect markers');
      assert.strictEqual(result.length, 3);
      assert.strictEqual(result[0].value, '/a');
      assert.strictEqual(result[1].value, '/b');
      assert.strictEqual(result[2].value, '/c');
    });
  });

  describe('code block handling', () => {
    it('should ignore markers inside code blocks', () => {
      const text = `
        Regular text
        \`\`\`
        <!-- CYCLIST:HANDOFF:/dev -->
        \`\`\`
        More text
      `;
      const result = detectMarkers(text);

      assert.strictEqual(result, null, 'Should not detect marker inside code block');
    });

    it('should detect markers outside code blocks', () => {
      const text = `
        \`\`\`
        code here
        \`\`\`
        <!-- CYCLIST:HANDOFF:/dev -->
      `;
      const result = detectMarkers(text);

      assert.ok(result !== null, 'Should detect marker outside code block');
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].type, 'handoff');
    });

    it('should handle mixed code blocks and markers', () => {
      const text = `
        <!-- CYCLIST:INVOKE:/tea -->
        \`\`\`javascript
        <!-- CYCLIST:HANDOFF:/ignored -->
        \`\`\`
        <!-- CYCLIST:CONTEXT_CLEAR:/sm -->
      `;
      const result = detectMarkers(text);

      assert.ok(result !== null, 'Should detect markers');
      assert.strictEqual(result.length, 2, 'Should only detect markers outside code');
      assert.strictEqual(result[0].type, 'invoke');
      assert.strictEqual(result[1].type, 'context_clear');
    });
  });

  describe('case sensitivity', () => {
    it('should be case-insensitive for CYCLIST prefix', () => {
      const texts = [
        '<!-- CYCLIST:HANDOFF:/dev -->',
        '<!-- cyclist:HANDOFF:/dev -->',
        '<!-- Cyclist:HANDOFF:/dev -->',
        '<!-- CyCLiST:HANDOFF:/dev -->',
      ];

      for (const text of texts) {
        const result = detectMarkers(text);
        assert.ok(result !== null, `Should detect marker in: ${text}`);
        assert.strictEqual(result[0].type, 'handoff');
      }
    });

    it('should be case-insensitive for marker type', () => {
      const texts = [
        '<!-- CYCLIST:HANDOFF:/dev -->',
        '<!-- CYCLIST:handoff:/dev -->',
        '<!-- CYCLIST:Handoff:/dev -->',
        '<!-- CYCLIST:HaNdOfF:/dev -->',
      ];

      for (const text of texts) {
        const result = detectMarkers(text);
        assert.ok(result !== null, `Should detect marker in: ${text}`);
        assert.strictEqual(result[0].type, 'handoff', 'Type should be normalized to lowercase');
      }
    });

    it('should preserve value case', () => {
      const text = '<!-- CYCLIST:HANDOFF:/MyAgent -->';
      const result = detectMarkers(text);

      assert.ok(result !== null);
      assert.strictEqual(result[0].value, '/MyAgent', 'Value case should be preserved');
    });
  });

  describe('whitespace handling', () => {
    it('should handle whitespace inside marker', () => {
      const text = '<!--  CYCLIST:HANDOFF:  /dev   -->';
      const result = detectMarkers(text);

      assert.ok(result !== null, 'Should detect marker with whitespace');
      assert.strictEqual(result[0].value, '/dev', 'Value should be trimmed');
    });

    it('should handle newlines around marker', () => {
      const text = '\n\n<!-- CYCLIST:INVOKE:/tea -->\n\n';
      const result = detectMarkers(text);

      assert.ok(result !== null, 'Should detect marker with newlines');
      assert.strictEqual(result[0].type, 'invoke');
    });
  });

  describe('source field', () => {
    it('should set source to structured_marker', () => {
      const text = '<!-- CYCLIST:HANDOFF:/dev -->';
      const result = detectMarkers(text);

      assert.ok(result !== null);
      assert.strictEqual(result[0].source, 'structured_marker');
    });
  });

  describe('unknown marker types', () => {
    it('should skip unknown marker types', () => {
      const text = '<!-- CYCLIST:UNKNOWN_TYPE:value -->';
      const result = detectMarkers(text);

      assert.strictEqual(result, null, 'Should return null for unknown type');
    });

    it('should still detect valid markers alongside unknown ones', () => {
      const text = '<!-- CYCLIST:INVALID:x --> <!-- CYCLIST:HANDOFF:/dev -->';
      const result = detectMarkers(text);

      assert.ok(result !== null, 'Should detect valid marker');
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].type, 'handoff');
    });
  });
});
