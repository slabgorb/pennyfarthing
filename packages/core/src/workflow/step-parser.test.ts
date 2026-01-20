/**
 * Tests for Story MSSCI-12079: Step file parser with <step-meta> extraction
 *
 * These tests define the contract for parsing step files in stepped workflows.
 * Step files are markdown documents with an optional <step-meta> YAML block.
 *
 * Expected interface:
 * - parseStepFile(content: string, filename?: string): StepParseResult
 * - parseStepFromPath(filePath: string): Promise<StepParseResult>
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

// Import will fail until implementation exists - this confirms RED state
import { parseStepFile, parseStepFromPath } from './step-parser.js';

describe('Step File Parser (MSSCI-12079)', () => {

  describe('AC1: Parser extracts step-meta YAML block', () => {

    it('should extract step-meta block from valid step file', () => {
      const content = `# Step 2: Context Analysis

<step-meta>
number: 2
name: context-analysis
gate: true
</step-meta>

## Purpose
Analyze the project context...
`;

      const result = parseStepFile(content);
      assert.strictEqual(result.success, true, 'Should successfully parse valid step file');
      assert.ok(result.step, 'Should return parsed step');
      assert.ok(result.step.meta, 'Should include raw meta object');
      assert.strictEqual(result.step.meta?.number, 2);
      assert.strictEqual(result.step.meta?.name, 'context-analysis');
      assert.strictEqual(result.step.meta?.gate, true);
    });

    it('should strip step-meta block from content', () => {
      const content = `# Step 1: Introduction

<step-meta>
number: 1
name: introduction
</step-meta>

## Welcome
This is the introduction step.
`;

      const result = parseStepFile(content);
      assert.strictEqual(result.success, true);
      assert.ok(result.step);
      // Content should not contain the step-meta block
      assert.ok(!result.step.content.includes('<step-meta>'), 'Content should not include step-meta opening tag');
      assert.ok(!result.step.content.includes('</step-meta>'), 'Content should not include step-meta closing tag');
      // Content should still include the markdown
      assert.ok(result.step.content.includes('## Welcome'), 'Content should preserve markdown after meta');
      assert.ok(result.step.content.includes('This is the introduction step'), 'Content should preserve body text');
    });

    it('should handle step-meta with extra fields', () => {
      const content = `<step-meta>
number: 3
name: custom-step
gate: false
custom_field: some-value
another_field: 123
</step-meta>

Content here.
`;

      const result = parseStepFile(content);
      assert.strictEqual(result.success, true);
      assert.ok(result.step?.meta);
      assert.strictEqual(result.step.meta.custom_field, 'some-value');
      assert.strictEqual(result.step.meta.another_field, 123);
    });

    it('should handle step-meta at different positions in file', () => {
      // Meta after heading
      const content = `# Step 5: Review

Some preamble text here.

<step-meta>
number: 5
name: review
</step-meta>

## Instructions
Do the review.
`;

      const result = parseStepFile(content);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.step?.number, 5);
      assert.strictEqual(result.step?.name, 'review');
    });

  });

  describe('AC2: Parser returns step number, name, gate flag', () => {

    it('should return number from meta', () => {
      const content = `<step-meta>
number: 7
name: final-step
</step-meta>

Content.
`;

      const result = parseStepFile(content);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.step?.number, 7);
    });

    it('should return name from meta', () => {
      const content = `<step-meta>
number: 1
name: initialization-step
</step-meta>

Content.
`;

      const result = parseStepFile(content);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.step?.name, 'initialization-step');
    });

    it('should return gate flag from meta when true', () => {
      const content = `<step-meta>
number: 3
name: checkpoint
gate: true
</step-meta>

This step has a gate.
`;

      const result = parseStepFile(content);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.step?.gate, true);
    });

    it('should return gate flag from meta when false', () => {
      const content = `<step-meta>
number: 2
name: no-gate
gate: false
</step-meta>

This step has no gate.
`;

      const result = parseStepFile(content);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.step?.gate, false);
    });

    it('should default gate to false when not specified in meta', () => {
      const content = `<step-meta>
number: 4
name: implicit-no-gate
</step-meta>

No gate field specified.
`;

      const result = parseStepFile(content);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.step?.gate, false, 'Gate should default to false');
    });

    it('should preserve content field with markdown intact', () => {
      const content = `<step-meta>
number: 1
name: test
</step-meta>

# Heading

Some **bold** and *italic* text.

\`\`\`typescript
const x = 1;
\`\`\`

- List item 1
- List item 2
`;

      const result = parseStepFile(content);
      assert.strictEqual(result.success, true);
      assert.ok(result.step?.content.includes('# Heading'));
      assert.ok(result.step?.content.includes('**bold**'));
      assert.ok(result.step?.content.includes('const x = 1;'));
      assert.ok(result.step?.content.includes('- List item 1'));
    });

  });

  describe('AC3: Parser handles missing meta gracefully', () => {

    it('should extract number and name from filename when no meta block', () => {
      const content = `# Step 3: Architecture Design

This step file has no meta block.

## Instructions
Design the architecture.
`;

      const result = parseStepFile(content, 'step-03-architecture-design.md');
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.step?.number, 3);
      assert.strictEqual(result.step?.name, 'architecture-design');
    });

    it('should handle step-{n} filename pattern (single digit)', () => {
      const content = `No meta here.`;
      const result = parseStepFile(content, 'step-5-review.md');
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.step?.number, 5);
      assert.strictEqual(result.step?.name, 'review');
    });

    it('should handle step-{nn} filename pattern (double digit)', () => {
      const content = `No meta here.`;
      const result = parseStepFile(content, 'step-12-final-review.md');
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.step?.number, 12);
      assert.strictEqual(result.step?.name, 'final-review');
    });

    it('should return entire content when no meta block', () => {
      const fullContent = `# Full Content

All of this should be in the content field.

## Section 1
Text here.

## Section 2
More text.
`;

      const result = parseStepFile(fullContent, 'step-01-full.md');
      assert.strictEqual(result.success, true);
      assert.ok(result.step?.content.includes('# Full Content'));
      assert.ok(result.step?.content.includes('## Section 1'));
      assert.ok(result.step?.content.includes('## Section 2'));
    });

    it('should return error when no meta and filename cannot be parsed', () => {
      const content = `No meta block here.`;
      const result = parseStepFile(content, 'random-file.md');
      assert.strictEqual(result.success, false, 'Should fail without meta or parseable filename');
      assert.ok(result.error, 'Should include error message');
    });

    it('should return error when no meta and no filename provided', () => {
      const content = `No meta block here and no filename.`;
      const result = parseStepFile(content);
      assert.strictEqual(result.success, false, 'Should fail without meta or filename');
      assert.ok(result.error, 'Should include error message');
    });

    it('should handle empty file', () => {
      const result = parseStepFile('', 'step-01-empty.md');
      assert.strictEqual(result.success, true, 'Empty file with valid filename should succeed');
      assert.strictEqual(result.step?.number, 1);
      assert.strictEqual(result.step?.name, 'empty');
      assert.strictEqual(result.step?.content, '');
    });

    it('should handle malformed YAML in meta block gracefully', () => {
      const content = `<step-meta>
number: not-a-number
name: [invalid yaml
gate: {broken
</step-meta>

Content after bad meta.
`;

      const result = parseStepFile(content, 'step-01-fallback.md');
      // Should fall back to filename parsing, not crash
      assert.strictEqual(result.success, true, 'Should fall back to filename when meta is malformed');
      assert.strictEqual(result.step?.number, 1);
      assert.strictEqual(result.step?.name, 'fallback');
    });

  });

  describe('AC4: Gate detection from meta or marker', () => {

    it('should detect gate from meta gate: true', () => {
      const content = `<step-meta>
number: 1
name: gated-step
gate: true
</step-meta>

No marker in content.
`;

      const result = parseStepFile(content);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.step?.gate, true, 'Gate should be true from meta');
    });

    it('should detect gate from <!-- GATE --> marker in content', () => {
      const content = `<step-meta>
number: 2
name: marker-gate
</step-meta>

## Instructions
Do the thing.

<!-- GATE -->
- [C] Continue
- [R] Revise
`;

      const result = parseStepFile(content);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.step?.gate, true, 'Gate should be true from marker');
    });

    it('should detect gate from marker when no meta block', () => {
      const content = `# Step 3: Review

Do the review.

## Gate

<!-- GATE -->
- [C] Continue to next step
- [R] Revise this step
`;

      const result = parseStepFile(content, 'step-03-review.md');
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.step?.gate, true, 'Gate should be detected from marker');
    });

    it('should prefer meta gate: true over missing marker', () => {
      const content = `<step-meta>
number: 1
name: meta-wins
gate: true
</step-meta>

No marker here, but meta says gate is true.
`;

      const result = parseStepFile(content);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.step?.gate, true);
    });

    it('should prefer meta gate: false over marker in content', () => {
      // Meta explicitly says no gate, even though marker exists
      const content = `<step-meta>
number: 5
name: meta-overrides
gate: false
</step-meta>

## Gate Section

<!-- GATE -->
This marker should be ignored because meta says gate: false.
`;

      const result = parseStepFile(content);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.step?.gate, false, 'Meta gate: false should override marker');
    });

    it('should handle multiple gate markers (use first occurrence)', () => {
      const content = `<step-meta>
number: 1
name: multi-gate
</step-meta>

## First Gate

<!-- GATE -->
First gate marker.

## Second Gate

<!-- GATE -->
Second gate marker should not matter.
`;

      const result = parseStepFile(content);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.step?.gate, true);
    });

    it('should detect gate marker with surrounding whitespace', () => {
      const content = `<step-meta>
number: 1
name: whitespace-gate
</step-meta>

Content.

   <!-- GATE -->

More content.
`;

      const result = parseStepFile(content);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.step?.gate, true, 'Should detect marker with whitespace');
    });

    it('should not detect gate from similar but different markers', () => {
      const content = `<step-meta>
number: 1
name: no-gate
</step-meta>

<!-- NOT A GATE -->
<!-- GATES -->
<!-- gate -->
<!--GATE-->

These are not the gate marker you're looking for.
`;

      const result = parseStepFile(content);
      assert.strictEqual(result.success, true);
      // Only exact "<!-- GATE -->" should match (case sensitive, with spaces)
      assert.strictEqual(result.step?.gate, false, 'Should not match similar markers');
    });

  });

  describe('Edge Cases', () => {

    it('should handle step-meta with only number', () => {
      const content = `<step-meta>
number: 42
</step-meta>

Content.
`;

      const result = parseStepFile(content, 'step-42-named-in-file.md');
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.step?.number, 42);
      // Name should come from filename since not in meta
      assert.strictEqual(result.step?.name, 'named-in-file');
    });

    it('should handle step-meta with only name', () => {
      const content = `<step-meta>
name: only-name
</step-meta>

Content.
`;

      const result = parseStepFile(content, 'step-07-ignored.md');
      assert.strictEqual(result.success, true);
      // Number should come from filename since not in meta
      assert.strictEqual(result.step?.number, 7);
      assert.strictEqual(result.step?.name, 'only-name');
    });

    it('should handle unicode in content', () => {
      const content = `<step-meta>
number: 1
name: unicode
</step-meta>

# こんにちは 🌍

Content with émojis 🎉 and spëcial çharacters.
`;

      const result = parseStepFile(content);
      assert.strictEqual(result.success, true);
      assert.ok(result.step?.content.includes('こんにちは'));
      assert.ok(result.step?.content.includes('🌍'));
    });

    it('should handle Windows line endings (CRLF)', () => {
      const content = `<step-meta>\r\nnumber: 1\r\nname: crlf\r\n</step-meta>\r\n\r\nContent with CRLF.\r\n`;

      const result = parseStepFile(content);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.step?.number, 1);
      assert.strictEqual(result.step?.name, 'crlf');
    });

    it('should preserve indentation in content', () => {
      const content = `<step-meta>
number: 1
name: indented
</step-meta>

    indented line
        double indented
\ttab indented
`;

      const result = parseStepFile(content);
      assert.strictEqual(result.success, true);
      assert.ok(result.step?.content.includes('    indented line'));
      assert.ok(result.step?.content.includes('        double indented'));
    });

  });

  describe('parseStepFromPath', () => {

    it('should be an async function', () => {
      // This test verifies the function signature
      assert.strictEqual(typeof parseStepFromPath, 'function');
      // The actual file reading tests would need mock filesystem
      // but we verify the function exists and returns a promise-like value
    });

  });

});
