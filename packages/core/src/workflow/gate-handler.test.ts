/**
 * Tests for Story MSSCI-12085: Gate detection and approval flow
 *
 * Tests the unified gate detection system that combines three sources:
 * 1. Workflow YAML: gates.after_steps array
 * 2. Step-meta: gate: true field
 * 3. Content marker: <!-- GATE --> in step content
 *
 * Also tests gate prompt extraction and decision recording in session files.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

// These imports will fail until implementation exists - confirms RED state
import {
  type GateInfo as _GateInfo, // Used in test descriptions
  GateDecision,
  detectGate,
  extractGatePrompt,
  recordGateDecision,
  parseGateDecisions,
  formatGateDecisions,
} from './gate-handler.js';

// =============================================================================
// AC1: Gates detected from all three sources
// =============================================================================

describe('MSSCI-12085: Gate Detection and Approval Flow', () => {
  describe('AC1: Gates detected from all three sources', () => {

    describe('Workflow YAML gates.after_steps', () => {
      it('should detect gate when step number is in after_steps array', () => {
        const result = detectGate({
          stepNumber: 3,
          afterSteps: [1, 3, 7],
          stepMeta: { gate: false },
          stepContent: 'No marker here.',
        });

        assert.strictEqual(result.isGate, true);
        assert.strictEqual(result.source, 'workflow');
        assert.strictEqual(result.stepNumber, 3);
      });

      it('should not detect gate when step number is not in after_steps', () => {
        const result = detectGate({
          stepNumber: 2,
          afterSteps: [1, 3, 7],
          stepMeta: { gate: false },
          stepContent: 'No marker here.',
        });

        assert.strictEqual(result.isGate, false);
        assert.strictEqual(result.source, null);
      });

      it('should handle empty after_steps array', () => {
        const result = detectGate({
          stepNumber: 1,
          afterSteps: [],
          stepMeta: {},
          stepContent: 'Content.',
        });

        assert.strictEqual(result.isGate, false);
      });

      it('should handle undefined after_steps', () => {
        const result = detectGate({
          stepNumber: 1,
          afterSteps: undefined,
          stepMeta: {},
          stepContent: 'Content.',
        });

        assert.strictEqual(result.isGate, false);
      });
    });

    describe('Step-meta gate: true', () => {
      it('should detect gate from step-meta gate: true', () => {
        const result = detectGate({
          stepNumber: 2,
          afterSteps: [],
          stepMeta: { gate: true },
          stepContent: 'No marker.',
        });

        assert.strictEqual(result.isGate, true);
        assert.strictEqual(result.source, 'step-meta');
      });

      it('should not detect gate when step-meta gate: false', () => {
        const result = detectGate({
          stepNumber: 2,
          afterSteps: [],
          stepMeta: { gate: false },
          stepContent: 'No marker.',
        });

        assert.strictEqual(result.isGate, false);
      });

      it('should handle missing gate field in step-meta', () => {
        const result = detectGate({
          stepNumber: 2,
          afterSteps: [],
          stepMeta: { name: 'some-step' },
          stepContent: 'No marker.',
        });

        assert.strictEqual(result.isGate, false);
      });

      it('should handle undefined step-meta', () => {
        const result = detectGate({
          stepNumber: 2,
          afterSteps: [],
          stepMeta: undefined,
          stepContent: 'No marker.',
        });

        assert.strictEqual(result.isGate, false);
      });
    });

    describe('Content marker <!-- GATE -->', () => {
      it('should detect gate from <!-- GATE --> marker in content', () => {
        const result = detectGate({
          stepNumber: 4,
          afterSteps: [],
          stepMeta: {},
          stepContent: `## Instructions
Do the thing.

<!-- GATE -->
- [C] Continue
- [R] Revise
`,
        });

        assert.strictEqual(result.isGate, true);
        assert.strictEqual(result.source, 'marker');
      });

      it('should detect gate from marker at start of content', () => {
        const result = detectGate({
          stepNumber: 1,
          afterSteps: [],
          stepMeta: {},
          stepContent: `<!-- GATE -->
First line after marker.
`,
        });

        assert.strictEqual(result.isGate, true);
        assert.strictEqual(result.source, 'marker');
      });

      it('should detect gate from marker at end of content', () => {
        const result = detectGate({
          stepNumber: 1,
          afterSteps: [],
          stepMeta: {},
          stepContent: `Content here.
<!-- GATE -->`,
        });

        assert.strictEqual(result.isGate, true);
      });

      it('should detect gate from marker with surrounding whitespace', () => {
        const result = detectGate({
          stepNumber: 1,
          afterSteps: [],
          stepMeta: {},
          stepContent: `Content.

   <!-- GATE -->

More content.
`,
        });

        assert.strictEqual(result.isGate, true);
      });

      it('should not detect gate from similar but incorrect markers', () => {
        const result = detectGate({
          stepNumber: 1,
          afterSteps: [],
          stepMeta: {},
          stepContent: `<!-- NOT A GATE -->
<!-- GATES -->
<!-- gate -->
<!--GATE-->
`,
        });

        assert.strictEqual(result.isGate, false);
      });
    });

    describe('Combined sources (OR logic)', () => {
      it('should detect gate when workflow AND step-meta indicate gate', () => {
        const result = detectGate({
          stepNumber: 3,
          afterSteps: [3],
          stepMeta: { gate: true },
          stepContent: 'No marker.',
        });

        assert.strictEqual(result.isGate, true);
        // Should report first detected source (workflow takes priority)
        assert.strictEqual(result.source, 'workflow');
      });

      it('should detect gate when step-meta AND marker indicate gate', () => {
        const result = detectGate({
          stepNumber: 5,
          afterSteps: [],
          stepMeta: { gate: true },
          stepContent: '<!-- GATE -->',
        });

        assert.strictEqual(result.isGate, true);
        // step-meta takes priority over marker
        assert.strictEqual(result.source, 'step-meta');
      });

      it('should detect gate when all three sources indicate gate', () => {
        const result = detectGate({
          stepNumber: 7,
          afterSteps: [7],
          stepMeta: { gate: true },
          stepContent: '<!-- GATE -->',
        });

        assert.strictEqual(result.isGate, true);
        // Workflow has highest priority
        assert.strictEqual(result.source, 'workflow');
      });

      it('should not detect gate when no sources indicate gate', () => {
        const result = detectGate({
          stepNumber: 2,
          afterSteps: [1, 3],
          stepMeta: { gate: false },
          stepContent: 'Plain content.',
        });

        assert.strictEqual(result.isGate, false);
        assert.strictEqual(result.source, null);
      });
    });
  });

  // =============================================================================
  // AC2: Gate prompt displayed to user
  // =============================================================================

  describe('AC2: Gate prompt displayed to user', () => {

    it('should extract gate prompt from ## Gate Prompt section', () => {
      const content = `# Step 3: Review

## Instructions
Do the review.

## Gate Prompt
Please verify the architecture design is complete and aligns with requirements.

## Next Steps
Continue to implementation.
`;

      const prompt = extractGatePrompt(content);

      assert.strictEqual(
        prompt,
        'Please verify the architecture design is complete and aligns with requirements.'
      );
    });

    it('should extract gate prompt from step-meta gate_prompt field', () => {
      const content = 'Some content without a Gate Prompt section.';
      const meta = {
        number: 3,
        name: 'review',
        gate: true,
        gate_prompt: 'Confirm the design is ready for implementation.',
      };

      const prompt = extractGatePrompt(content, meta);

      assert.strictEqual(prompt, 'Confirm the design is ready for implementation.');
    });

    it('should prefer ## Gate Prompt section over meta gate_prompt', () => {
      const content = `## Gate Prompt
Section prompt takes priority.
`;
      const meta = {
        gate_prompt: 'Meta prompt should be ignored.',
      };

      const prompt = extractGatePrompt(content, meta);

      assert.strictEqual(prompt, 'Section prompt takes priority.');
    });

    it('should return default prompt when neither source present', () => {
      const content = 'Content with no gate prompt section.';
      const meta = { gate: true };

      const prompt = extractGatePrompt(content, meta);

      assert.strictEqual(
        prompt,
        'Review the output above. Continue to next step or revise?'
      );
    });

    it('should handle multi-line gate prompt section', () => {
      const content = `## Gate Prompt
This is a multi-line prompt.
It spans several lines.
All should be included.

## Next Section
`;

      const prompt = extractGatePrompt(content);

      assert.ok(prompt.includes('This is a multi-line prompt.'));
      assert.ok(prompt.includes('It spans several lines.'));
      assert.ok(prompt.includes('All should be included.'));
      // Should not include the next section
      assert.ok(!prompt.includes('Next Section'));
    });

    it('should trim whitespace from extracted prompt', () => {
      const content = `## Gate Prompt

   Prompt with extra whitespace.

## Next Section
`;

      const prompt = extractGatePrompt(content);

      assert.strictEqual(prompt, 'Prompt with extra whitespace.');
    });

    it('should handle empty Gate Prompt section', () => {
      const content = `## Gate Prompt

## Next Section
`;

      const prompt = extractGatePrompt(content);

      // Should return default since section is empty
      assert.strictEqual(
        prompt,
        'Review the output above. Continue to next step or revise?'
      );
    });
  });

  // =============================================================================
  // AC3: User choice recorded in session
  // =============================================================================

  describe('AC3: User choice recorded in session', () => {

    it('should record continue decision to session content', () => {
      const sessionContent = `# Story Test

## Story Overview
- **Epic:** Test

## Workflow State
- **Current Step:** 3

## Acceptance Criteria
- [ ] AC1
`;

      const decision: GateDecision = {
        step: 3,
        choice: 'continue',
        timestamp: '2026-01-21T10:30:00.000Z',
      };

      const result = recordGateDecision(sessionContent, decision);

      assert.ok(result.includes('## Gate Decisions'));
      assert.ok(result.includes('| 3 | continue |'));
      assert.ok(result.includes('2026-01-21T10:30:00.000Z'));
    });

    it('should record revise decision with notes', () => {
      const sessionContent = `# Story Test

## Workflow State
- **Current Step:** 5
`;

      const decision: GateDecision = {
        step: 5,
        choice: 'revise',
        timestamp: '2026-01-21T11:45:00.000Z',
        notes: 'Architecture needs rework',
      };

      const result = recordGateDecision(sessionContent, decision);

      assert.ok(result.includes('| 5 | revise |'));
      assert.ok(result.includes('Architecture needs rework'));
    });

    it('should append to existing Gate Decisions section', () => {
      const sessionContent = `# Story Test

## Gate Decisions
| Step | Choice | Time | Notes |
|------|--------|------|-------|
| 3 | continue | 2026-01-21T10:30:00.000Z | - |

## Workflow State
`;

      const decision: GateDecision = {
        step: 7,
        choice: 'continue',
        timestamp: '2026-01-21T14:00:00.000Z',
      };

      const result = recordGateDecision(sessionContent, decision);

      // Should have both decisions
      assert.ok(result.includes('| 3 | continue |'));
      assert.ok(result.includes('| 7 | continue |'));
    });

    it('should create Gate Decisions section if missing', () => {
      const sessionContent = `# Story Test

## Workflow State
- **Current Step:** 1
`;

      const decision: GateDecision = {
        step: 1,
        choice: 'continue',
        timestamp: '2026-01-21T09:00:00.000Z',
      };

      const result = recordGateDecision(sessionContent, decision);

      assert.ok(result.includes('## Gate Decisions'));
      assert.ok(result.includes('| Step | Choice | Time | Notes |'));
      assert.ok(result.includes('| 1 | continue |'));
    });

    it('should parse existing gate decisions from session', () => {
      const sessionContent = `# Story Test

## Gate Decisions
| Step | Choice | Time | Notes |
|------|--------|------|-------|
| 3 | continue | 2026-01-21T10:30:00.000Z | Reviewed and approved |
| 7 | revise | 2026-01-21T11:45:00.000Z | Needs changes |

## Next Section
`;

      const decisions = parseGateDecisions(sessionContent);

      assert.strictEqual(decisions.length, 2);
      assert.strictEqual(decisions[0].step, 3);
      assert.strictEqual(decisions[0].choice, 'continue');
      assert.strictEqual(decisions[0].notes, 'Reviewed and approved');
      assert.strictEqual(decisions[1].step, 7);
      assert.strictEqual(decisions[1].choice, 'revise');
    });

    it('should return empty array when no Gate Decisions section', () => {
      const sessionContent = `# Story Test

## Workflow State
- **Current Step:** 1
`;

      const decisions = parseGateDecisions(sessionContent);

      assert.deepStrictEqual(decisions, []);
    });

    it('should handle notes with pipe characters', () => {
      const decision: GateDecision = {
        step: 2,
        choice: 'continue',
        timestamp: '2026-01-21T10:00:00.000Z',
        notes: 'Option A | Option B were considered',
      };

      const formatted = formatGateDecisions([decision]);

      // Pipe in notes should be escaped or handled
      assert.ok(formatted.includes('| 2 | continue |'));
      // The implementation should handle this gracefully
    });
  });

  // =============================================================================
  // AC4: Continue proceeds to next step normally
  // =============================================================================

  describe('AC4: Continue proceeds to next step normally', () => {

    it('should return isGate: false when step has no gate', () => {
      const result = detectGate({
        stepNumber: 2,
        afterSteps: [1, 5],
        stepMeta: { gate: false },
        stepContent: 'No marker.',
      });

      assert.strictEqual(result.isGate, false);
      // No gate means continue normally
    });

    it('should include stepNumber in GateInfo for workflow tracking', () => {
      const result = detectGate({
        stepNumber: 4,
        afterSteps: [4],
        stepMeta: {},
        stepContent: '',
      });

      assert.strictEqual(result.stepNumber, 4);
    });

    it('should include prompt in GateInfo when gate detected', () => {
      const result = detectGate({
        stepNumber: 3,
        afterSteps: [3],
        stepMeta: { gate_prompt: 'Custom prompt here.' },
        stepContent: '',
      });

      assert.strictEqual(result.isGate, true);
      assert.strictEqual(result.prompt, 'Custom prompt here.');
    });

    it('should include default prompt when no custom prompt provided', () => {
      const result = detectGate({
        stepNumber: 3,
        afterSteps: [3],
        stepMeta: {},
        stepContent: 'No gate prompt section.',
      });

      assert.strictEqual(result.isGate, true);
      assert.strictEqual(
        result.prompt,
        'Review the output above. Continue to next step or revise?'
      );
    });
  });

  // =============================================================================
  // Edge Cases
  // =============================================================================

  describe('Edge Cases', () => {

    it('should handle step number 0', () => {
      const result = detectGate({
        stepNumber: 0,
        afterSteps: [0],
        stepMeta: {},
        stepContent: '',
      });

      assert.strictEqual(result.isGate, true);
      assert.strictEqual(result.stepNumber, 0);
    });

    it('should handle large step numbers', () => {
      const result = detectGate({
        stepNumber: 999,
        afterSteps: [999],
        stepMeta: {},
        stepContent: '',
      });

      assert.strictEqual(result.isGate, true);
      assert.strictEqual(result.stepNumber, 999);
    });

    it('should handle empty step content', () => {
      const result = detectGate({
        stepNumber: 1,
        afterSteps: [],
        stepMeta: {},
        stepContent: '',
      });

      assert.strictEqual(result.isGate, false);
    });

    it('should handle null/undefined in meta gracefully', () => {
      const result = detectGate({
        stepNumber: 1,
        afterSteps: [],
        // @ts-expect-error - testing runtime null handling
        stepMeta: null,
        stepContent: 'Content.',
      });

      assert.strictEqual(result.isGate, false);
    });

    it('should handle very long gate prompt', () => {
      const longPrompt = 'A'.repeat(10000);
      const content = `## Gate Prompt
${longPrompt}

## Next
`;

      const prompt = extractGatePrompt(content);

      assert.strictEqual(prompt.length, 10000);
    });

    it('should handle unicode in gate decisions', () => {
      const decision: GateDecision = {
        step: 1,
        choice: 'continue',
        timestamp: '2026-01-21T10:00:00.000Z',
        notes: '確認完了 ✓',
      };

      const formatted = formatGateDecisions([decision]);

      assert.ok(formatted.includes('確認完了'));
      assert.ok(formatted.includes('✓'));
    });

    it('should handle session content with Windows line endings', () => {
      const sessionContent = `# Story Test\r\n\r\n## Gate Decisions\r\n| Step | Choice | Time | Notes |\r\n|------|--------|------|-------|\r\n| 1 | continue | 2026-01-21T10:00:00.000Z | - |\r\n`;

      const decisions = parseGateDecisions(sessionContent);

      assert.strictEqual(decisions.length, 1);
      assert.strictEqual(decisions[0].step, 1);
    });

    it('should handle multiple Gate Prompt sections (use first)', () => {
      const content = `## Gate Prompt
First prompt.

## Some Section

## Gate Prompt
Second prompt should be ignored.
`;

      const prompt = extractGatePrompt(content);

      assert.strictEqual(prompt, 'First prompt.');
    });
  });
});
