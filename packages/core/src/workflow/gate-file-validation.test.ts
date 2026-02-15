/**
 * Tests for Story 107-2: Acyclic Validation and Depth Limit Enforcement
 *
 * Validates that gate files (XML-like format with nested <gate> elements)
 * are checked for:
 * 1. Maximum nesting depth (3 levels, where Level 0 = root)
 * 2. Cyclic gate name references (A → B → A)
 *
 * Both checks run at parse time on the gate file content string.
 *
 * ACs:
 * 1. Cycle detection via DFS on directed graph of gate name references
 * 2. Depth validation with max 3, error includes gate name and actual depth
 * 3. Validation runs at parse time (on content string, no file I/O)
 * 4. Specific, actionable error messages for both violation types
 * 5. Valid gate files continue to pass (no regressions)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  validateGateDepth,
  detectGateCycles,
  validateGateFile,
} from './gate-file-validation.js';

// ═══════════════════════════════════════════════════════════════════════════
// Helper: generate gate file content at various nesting depths
// ═══════════════════════════════════════════════════════════════════════════

function makeNestedGates(names: string[], includeBlocks = true): string {
  const indent = (level: number) => '  '.repeat(level);
  let content = '';
  for (let i = 0; i < names.length; i++) {
    content += `${indent(i)}<gate name="${names[i]}" model="haiku">\n`;
    if (includeBlocks) {
      content += `${indent(i + 1)}<purpose>Purpose of ${names[i]}</purpose>\n`;
      content += `${indent(i + 1)}<pass>Pass criteria for ${names[i]}</pass>\n`;
      content += `${indent(i + 1)}<fail>Fail criteria for ${names[i]}</fail>\n`;
    }
  }
  // Close tags in reverse order
  for (let i = names.length - 1; i >= 0; i--) {
    content += `${indent(i)}</gate>\n`;
  }
  return content;
}

// ═══════════════════════════════════════════════════════════════════════════
// AC2: Depth Validation — nesting depth counted and enforced (max 3)
// ═══════════════════════════════════════════════════════════════════════════

describe('Gate File Validation (107-2)', () => {

  describe('AC2: Depth limit enforcement', () => {

    it('should accept a single root gate (depth 0)', () => {
      const content = makeNestedGates(['root-gate']);
      const result = validateGateDepth(content);
      assert.strictEqual(result.valid, true, 'Single root gate should be valid');
      assert.strictEqual(result.depth, 0, 'Root gate should be depth 0');
    });

    it('should accept one level of nesting (depth 1)', () => {
      const content = makeNestedGates(['root', 'child-1']);
      const result = validateGateDepth(content);
      assert.strictEqual(result.valid, true, 'Depth 1 nesting should be valid');
      assert.strictEqual(result.depth, 1);
    });

    it('should accept two levels of nesting (depth 2)', () => {
      const content = makeNestedGates(['root', 'child', 'grandchild']);
      const result = validateGateDepth(content);
      assert.strictEqual(result.valid, true, 'Depth 2 nesting should be valid');
      assert.strictEqual(result.depth, 2);
    });

    it('should accept three levels of nesting (depth 3 — maximum allowed)', () => {
      const content = makeNestedGates(['root', 'child', 'grandchild', 'great-grandchild']);
      const result = validateGateDepth(content);
      assert.strictEqual(result.valid, true, 'Depth 3 is the maximum and should be valid');
      assert.strictEqual(result.depth, 3);
    });

    it('should reject four levels of nesting (depth 4 — exceeds limit)', () => {
      const content = makeNestedGates(['root', 'child', 'grandchild', 'great-grandchild', 'too-deep']);
      const result = validateGateDepth(content);
      assert.strictEqual(result.valid, false, 'Depth 4 should be rejected');
      assert.ok(result.errors && result.errors.length > 0, 'Should have errors');
      assert.strictEqual(result.errors![0].type, 'depth', 'Error type should be "depth"');
    });

    it('should reject five levels of nesting (depth 5)', () => {
      const content = makeNestedGates(['a', 'b', 'c', 'd', 'e', 'f']);
      const result = validateGateDepth(content);
      assert.strictEqual(result.valid, false, 'Depth 5 should be rejected');
    });

    it('should include gate name in depth error message', () => {
      const content = makeNestedGates(['root', 'child', 'grandchild', 'great-gc', 'too-deep']);
      const result = validateGateDepth(content);
      assert.strictEqual(result.valid, false);
      const error = result.errors![0];
      assert.ok(
        error.message.includes('too-deep'),
        `Error message should include the gate name "too-deep", got: "${error.message}"`
      );
    });

    it('should include actual depth in depth error message', () => {
      const content = makeNestedGates(['root', 'child', 'grandchild', 'great-gc', 'too-deep']);
      const result = validateGateDepth(content);
      assert.strictEqual(result.valid, false);
      const error = result.errors![0];
      assert.ok(
        error.message.includes('depth 4'),
        `Error message should include "depth 4", got: "${error.message}"`
      );
    });

    it('should include max depth in depth error message', () => {
      const content = makeNestedGates(['root', 'child', 'grandchild', 'great-gc', 'too-deep']);
      const result = validateGateDepth(content);
      assert.strictEqual(result.valid, false);
      const error = result.errors![0];
      assert.ok(
        error.message.includes('max 3'),
        `Error message should include "max 3", got: "${error.message}"`
      );
    });

    it('should match exact error format: "Gate depth limit exceeded: {name} at depth N (max 3)"', () => {
      const content = makeNestedGates(['root', 'child', 'grandchild', 'great-gc', 'overdeep']);
      const result = validateGateDepth(content);
      assert.strictEqual(result.valid, false);
      const error = result.errors![0];
      assert.strictEqual(
        error.message,
        'Gate depth limit exceeded: overdeep at depth 4 (max 3)',
        'Error message must match exact format from story spec'
      );
    });

    it('should report max nesting depth found in result', () => {
      const content = makeNestedGates(['root', 'child']);
      const result = validateGateDepth(content);
      assert.strictEqual(result.depth, 1, 'Should report depth 1 for root + one child');
    });

    it('should handle gate with multiple children at same level', () => {
      // root has two children side by side — depth is still 1
      const content = `<gate name="root" model="haiku">
  <purpose>Root purpose</purpose>
  <pass>Pass</pass>
  <fail>Fail</fail>
  <gate name="child-a" model="haiku">
    <purpose>A purpose</purpose>
    <pass>Pass</pass>
    <fail>Fail</fail>
  </gate>
  <gate name="child-b" model="haiku">
    <purpose>B purpose</purpose>
    <pass>Pass</pass>
    <fail>Fail</fail>
  </gate>
</gate>`;
      const result = validateGateDepth(content);
      assert.strictEqual(result.valid, true, 'Sibling gates should not increase depth');
      assert.strictEqual(result.depth, 1, 'Max depth with siblings at level 1 is 1');
    });

    it('should detect deepest branch when multiple branches exist', () => {
      // root → child-a (depth 1)
      // root → child-b → grandchild (depth 2)
      const content = `<gate name="root" model="haiku">
  <purpose>Root</purpose>
  <pass>Pass</pass>
  <fail>Fail</fail>
  <gate name="child-a" model="haiku">
    <purpose>A</purpose>
    <pass>Pass</pass>
    <fail>Fail</fail>
  </gate>
  <gate name="child-b" model="haiku">
    <purpose>B</purpose>
    <pass>Pass</pass>
    <fail>Fail</fail>
    <gate name="grandchild" model="haiku">
      <purpose>GC</purpose>
      <pass>Pass</pass>
      <fail>Fail</fail>
    </gate>
  </gate>
</gate>`;
      const result = validateGateDepth(content);
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.depth, 2, 'Should report max depth across all branches');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // AC1: Cycle Detection — DFS on directed graph of gate name references
  // ═══════════════════════════════════════════════════════════════════════

  describe('AC1: Cycle detection', () => {

    it('should accept acyclic gate hierarchy (no repeated names)', () => {
      const content = makeNestedGates(['root', 'child', 'grandchild']);
      const result = detectGateCycles(content);
      assert.strictEqual(result.valid, true, 'Acyclic gates should be valid');
    });

    it('should accept single root gate (no children, no cycles)', () => {
      const content = makeNestedGates(['root']);
      const result = detectGateCycles(content);
      assert.strictEqual(result.valid, true, 'Single gate cannot have cycles');
    });

    it('should detect direct self-reference cycle (A contains A)', () => {
      // Gate "check-a" nests a child also named "check-a" — cycle: check-a → check-a
      const content = `<gate name="check-a" model="haiku">
  <purpose>Purpose</purpose>
  <pass>Pass</pass>
  <fail>Fail</fail>
  <gate name="check-a" model="haiku">
    <purpose>Purpose</purpose>
    <pass>Pass</pass>
    <fail>Fail</fail>
  </gate>
</gate>`;
      const result = detectGateCycles(content);
      assert.strictEqual(result.valid, false, 'Self-referencing gate name should be a cycle');
      assert.ok(result.errors && result.errors.length > 0, 'Should have cycle errors');
      assert.strictEqual(result.errors![0].type, 'cycle', 'Error type should be "cycle"');
    });

    it('should detect indirect cycle (A → B → A)', () => {
      // root "gate-a" → child "gate-b" → grandchild "gate-a" — cycle: gate-a → gate-b → gate-a
      const content = `<gate name="gate-a" model="haiku">
  <purpose>Purpose</purpose>
  <pass>Pass</pass>
  <fail>Fail</fail>
  <gate name="gate-b" model="haiku">
    <purpose>Purpose</purpose>
    <pass>Pass</pass>
    <fail>Fail</fail>
    <gate name="gate-a" model="haiku">
      <purpose>Purpose</purpose>
      <pass>Pass</pass>
      <fail>Fail</fail>
    </gate>
  </gate>
</gate>`;
      const result = detectGateCycles(content);
      assert.strictEqual(result.valid, false, 'Indirect cycle A → B → A should be detected');
    });

    it('should detect longer cycle (A → B → C → A)', () => {
      const content = `<gate name="gate-a" model="haiku">
  <purpose>P</purpose><pass>P</pass><fail>F</fail>
  <gate name="gate-b" model="haiku">
    <purpose>P</purpose><pass>P</pass><fail>F</fail>
    <gate name="gate-c" model="haiku">
      <purpose>P</purpose><pass>P</pass><fail>F</fail>
      <gate name="gate-a" model="haiku">
        <purpose>P</purpose><pass>P</pass><fail>F</fail>
      </gate>
    </gate>
  </gate>
</gate>`;
      const result = detectGateCycles(content);
      assert.strictEqual(result.valid, false, 'Longer cycle A → B → C → A should be detected');
    });

    it('should include cycle path in error message format: "Cycle detected: A → B → A"', () => {
      const content = `<gate name="gate-a" model="haiku">
  <purpose>P</purpose><pass>P</pass><fail>F</fail>
  <gate name="gate-b" model="haiku">
    <purpose>P</purpose><pass>P</pass><fail>F</fail>
    <gate name="gate-a" model="haiku">
      <purpose>P</purpose><pass>P</pass><fail>F</fail>
    </gate>
  </gate>
</gate>`;
      const result = detectGateCycles(content);
      assert.strictEqual(result.valid, false);
      const error = result.errors![0];
      // Must match: "Cycle detected: gate-a → gate-b → gate-a"
      assert.ok(
        error.message.startsWith('Cycle detected:'),
        `Error message should start with "Cycle detected:", got: "${error.message}"`
      );
      assert.ok(
        error.message.includes('gate-a') && error.message.includes('gate-b'),
        `Error should include both gate names, got: "${error.message}"`
      );
    });

    it('should match exact cycle error format with arrow notation', () => {
      const content = `<gate name="alpha" model="haiku">
  <purpose>P</purpose><pass>P</pass><fail>F</fail>
  <gate name="beta" model="haiku">
    <purpose>P</purpose><pass>P</pass><fail>F</fail>
    <gate name="alpha" model="haiku">
      <purpose>P</purpose><pass>P</pass><fail>F</fail>
    </gate>
  </gate>
</gate>`;
      const result = detectGateCycles(content);
      assert.strictEqual(result.valid, false);
      const error = result.errors![0];
      assert.strictEqual(
        error.message,
        'Cycle detected: alpha \u2192 beta \u2192 alpha',
        'Error message must match exact format from story spec (using → arrow)'
      );
    });

    it('should accept sibling gates with same name (no nesting cycle)', () => {
      // Two siblings named "check" under root — NOT a cycle (they don't nest each other)
      const content = `<gate name="root" model="haiku">
  <purpose>Root</purpose>
  <pass>Pass</pass>
  <fail>Fail</fail>
  <gate name="check" model="haiku">
    <purpose>A</purpose>
    <pass>Pass</pass>
    <fail>Fail</fail>
  </gate>
  <gate name="check" model="haiku">
    <purpose>B</purpose>
    <pass>Pass</pass>
    <fail>Fail</fail>
  </gate>
</gate>`;
      const result = detectGateCycles(content);
      // Sibling duplicates are NOT cycles — a cycle requires ancestor-descendant name match
      assert.strictEqual(result.valid, true, 'Sibling gates with same name is not a cycle');
    });

    it('should detect cycle only on ancestor-descendant name match', () => {
      // root "shared-name" → child "unique" → grandchild "shared-name"
      // This IS a cycle: shared-name → unique → shared-name
      const content = `<gate name="shared-name" model="haiku">
  <purpose>P</purpose><pass>P</pass><fail>F</fail>
  <gate name="unique" model="haiku">
    <purpose>P</purpose><pass>P</pass><fail>F</fail>
    <gate name="shared-name" model="haiku">
      <purpose>P</purpose><pass>P</pass><fail>F</fail>
    </gate>
  </gate>
</gate>`;
      const result = detectGateCycles(content);
      assert.strictEqual(result.valid, false, 'Ancestor-descendant name match is a cycle');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // AC3: Parse-time execution — validates content string, no file I/O
  // ═══════════════════════════════════════════════════════════════════════

  describe('AC3: Parse-time validation (content string)', () => {

    it('should validate from string content (no file path needed)', () => {
      const content = makeNestedGates(['test-gate']);
      // The function accepts a string, not a file path
      const result = validateGateFile(content);
      assert.strictEqual(typeof result.valid, 'boolean', 'Should return validation result');
    });

    it('should handle empty content gracefully', () => {
      const result = validateGateFile('');
      // Empty content = no gates = should fail (no root gate found)
      assert.strictEqual(result.valid, false, 'Empty content should fail validation');
    });

    it('should handle content with no gate elements', () => {
      const result = validateGateFile('This is just plain text, no gates here.');
      assert.strictEqual(result.valid, false, 'Content without gates should fail');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // AC4: Error messages — specific and actionable
  // ═══════════════════════════════════════════════════════════════════════

  describe('AC4: Error messages', () => {

    it('depth error should follow format: "Gate depth limit exceeded: {name} at depth {N} (max 3)"', () => {
      const content = makeNestedGates(['root', 'a', 'b', 'c', 'violator']);
      const result = validateGateFile(content);
      assert.strictEqual(result.valid, false);
      const depthError = result.errors?.find(e => e.type === 'depth');
      assert.ok(depthError, 'Should have a depth error');
      assert.strictEqual(
        depthError!.message,
        'Gate depth limit exceeded: violator at depth 4 (max 3)'
      );
    });

    it('cycle error should follow format: "Cycle detected: {path}"', () => {
      const content = `<gate name="x" model="haiku">
  <purpose>P</purpose><pass>P</pass><fail>F</fail>
  <gate name="y" model="haiku">
    <purpose>P</purpose><pass>P</pass><fail>F</fail>
    <gate name="x" model="haiku">
      <purpose>P</purpose><pass>P</pass><fail>F</fail>
    </gate>
  </gate>
</gate>`;
      const result = validateGateFile(content);
      assert.strictEqual(result.valid, false);
      const cycleError = result.errors?.find(e => e.type === 'cycle');
      assert.ok(cycleError, 'Should have a cycle error');
      assert.strictEqual(
        cycleError!.message,
        'Cycle detected: x \u2192 y \u2192 x'
      );
    });

    it('should report both depth AND cycle errors when both present', () => {
      // 5 levels deep AND a cycle (name reuse)
      const content = `<gate name="root" model="haiku">
  <purpose>P</purpose><pass>P</pass><fail>F</fail>
  <gate name="a" model="haiku">
    <purpose>P</purpose><pass>P</pass><fail>F</fail>
    <gate name="b" model="haiku">
      <purpose>P</purpose><pass>P</pass><fail>F</fail>
      <gate name="c" model="haiku">
        <purpose>P</purpose><pass>P</pass><fail>F</fail>
        <gate name="root" model="haiku">
          <purpose>P</purpose><pass>P</pass><fail>F</fail>
        </gate>
      </gate>
    </gate>
  </gate>
</gate>`;
      const result = validateGateFile(content);
      assert.strictEqual(result.valid, false);
      const depthErrors = result.errors?.filter(e => e.type === 'depth') ?? [];
      const cycleErrors = result.errors?.filter(e => e.type === 'cycle') ?? [];
      assert.ok(depthErrors.length > 0, 'Should have depth errors');
      assert.ok(cycleErrors.length > 0, 'Should have cycle errors');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // AC5: No regressions — valid gate files still pass
  // ═══════════════════════════════════════════════════════════════════════

  describe('AC5: Valid gate files pass (no regressions)', () => {

    it('should accept minimal valid gate file', () => {
      const content = `<gate name="tests-pass" model="haiku">
  <purpose>Verify all tests pass</purpose>
  <pass>All tests green, report summary</pass>
  <fail>Report failing tests with details</fail>
</gate>`;
      const result = validateGateFile(content);
      assert.strictEqual(result.valid, true, 'Minimal valid gate should pass');
      assert.strictEqual(result.gate, 'tests-pass', 'Should extract root gate name');
    });

    it('should accept gate with one level of nesting', () => {
      const content = `<gate name="full-check" model="haiku">
  <purpose>Run full validation suite</purpose>
  <pass>All checks passed</pass>
  <fail>Report failures</fail>
  <gate name="lint-check" model="haiku">
    <purpose>Check lint rules</purpose>
    <pass>Lint clean</pass>
    <fail>Report lint errors</fail>
  </gate>
</gate>`;
      const result = validateGateFile(content);
      assert.strictEqual(result.valid, true, 'Valid nested gate should pass');
      assert.strictEqual(result.depth, 1);
    });

    it('should accept gate at max depth (3 levels) with unique names', () => {
      const content = makeNestedGates(['root', 'level-1', 'level-2', 'level-3']);
      const result = validateGateFile(content);
      assert.strictEqual(result.valid, true, 'Max depth with unique names should pass');
      assert.strictEqual(result.depth, 3);
      assert.strictEqual(result.gate, 'root');
    });

    it('should accept gate without model attribute', () => {
      const content = `<gate name="simple">
  <purpose>Simple gate</purpose>
  <pass>Pass</pass>
  <fail>Fail</fail>
</gate>`;
      const result = validateGateFile(content);
      assert.strictEqual(result.valid, true, 'Gate without model attribute should be valid');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Combined validateGateFile tests
  // ═══════════════════════════════════════════════════════════════════════

  describe('Combined validation (validateGateFile)', () => {

    it('should run both depth and cycle checks together', () => {
      // Valid file: 2 levels, no cycles
      const content = makeNestedGates(['outer', 'inner']);
      const result = validateGateFile(content);
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.depth, 1);
      assert.strictEqual(result.gate, 'outer');
    });

    it('should fail on depth violation even when no cycles', () => {
      const content = makeNestedGates(['a', 'b', 'c', 'd', 'e']);
      const result = validateGateFile(content);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors?.some(e => e.type === 'depth'));
    });

    it('should fail on cycle even when depth is within limits', () => {
      // Depth 2 (within limit) but has cycle: check → sub → check
      const content = `<gate name="check" model="haiku">
  <purpose>P</purpose><pass>P</pass><fail>F</fail>
  <gate name="sub" model="haiku">
    <purpose>P</purpose><pass>P</pass><fail>F</fail>
    <gate name="check" model="haiku">
      <purpose>P</purpose><pass>P</pass><fail>F</fail>
    </gate>
  </gate>
</gate>`;
      const result = validateGateFile(content);
      assert.strictEqual(result.valid, false, 'Cycle within depth limit should still fail');
      assert.ok(result.errors?.some(e => e.type === 'cycle'));
    });

    it('should report all errors at once (not stop at first)', () => {
      // Both depth violation AND cycle
      const content = `<gate name="root" model="haiku">
  <purpose>P</purpose><pass>P</pass><fail>F</fail>
  <gate name="a" model="haiku">
    <purpose>P</purpose><pass>P</pass><fail>F</fail>
    <gate name="b" model="haiku">
      <purpose>P</purpose><pass>P</pass><fail>F</fail>
      <gate name="c" model="haiku">
        <purpose>P</purpose><pass>P</pass><fail>F</fail>
        <gate name="root" model="haiku">
          <purpose>P</purpose><pass>P</pass><fail>F</fail>
        </gate>
      </gate>
    </gate>
  </gate>
</gate>`;
      const result = validateGateFile(content);
      assert.strictEqual(result.valid, false);
      assert.ok(
        result.errors && result.errors.length >= 2,
        `Should report multiple errors, got ${result.errors?.length ?? 0}`
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Edge Cases
  // ═══════════════════════════════════════════════════════════════════════

  describe('Edge cases', () => {

    it('should handle gate tags with extra whitespace', () => {
      const content = `<gate   name="spaced"   model="haiku" >
  <purpose>Purpose</purpose>
  <pass>Pass</pass>
  <fail>Fail</fail>
</gate>`;
      const result = validateGateFile(content);
      assert.strictEqual(result.valid, true, 'Extra whitespace in tag should be handled');
      assert.strictEqual(result.gate, 'spaced');
    });

    it('should handle gate name with hyphens and underscores', () => {
      const content = makeNestedGates(['my-gate_v2']);
      const result = validateGateFile(content);
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.gate, 'my-gate_v2');
    });

    it('should handle self-closing consideration (gate must have closing tag)', () => {
      // A gate without content between tags
      const content = `<gate name="empty-gate" model="haiku">
  <purpose>P</purpose>
  <pass>P</pass>
  <fail>F</fail>
</gate>`;
      const result = validateGateFile(content);
      assert.strictEqual(result.valid, true, 'Gate with required blocks but no children is valid');
    });

    it('should extract root gate name in result', () => {
      const content = makeNestedGates(['my-root-gate', 'child']);
      const result = validateGateFile(content);
      assert.strictEqual(result.gate, 'my-root-gate', 'Should extract root gate name');
    });

    it('should handle deeply nested content with mixed indentation', () => {
      const content = `<gate name="root" model="haiku">
<purpose>P</purpose>
    <pass>P</pass>
  <fail>F</fail>
    <gate name="child" model="haiku">
  <purpose>P</purpose>
      <pass>P</pass>
<fail>F</fail>
    </gate>
</gate>`;
      const result = validateGateFile(content);
      assert.strictEqual(result.valid, true, 'Mixed indentation should not affect parsing');
      assert.strictEqual(result.depth, 1);
    });

    it('should handle gate names in single quotes', () => {
      const content = `<gate name='single-quoted' model='haiku'>
  <purpose>P</purpose>
  <pass>P</pass>
  <fail>F</fail>
</gate>`;
      const result = validateGateFile(content);
      assert.strictEqual(result.valid, true, 'Single-quoted attributes should work');
      assert.strictEqual(result.gate, 'single-quoted');
    });
  });
});
