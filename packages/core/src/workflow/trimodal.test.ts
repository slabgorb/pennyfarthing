/**
 * Tri-Modal Support Tests for MSSCI-12086
 *
 * Tests for tri-modal workflow execution in BikePaths:
 * - Mode selection via --mode flag
 * - Steps path resolution based on mode
 * - Session state mode tracking
 * - Default mode behavior
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  parseTrimodalFlag,
  resolveStepsPath,
  validateMode,
  getDefaultMode,
} from './trimodal.js';
import { initWorkflowState, parseSessionState, formatWorkflowState, updateSessionContent } from './session-state.js';
import type { WorkflowDefinition, WorkflowModes } from './workflow-schema.js';

// ============================================================================
// AC1: Mode selectable via --mode create|validate|edit flag
// ============================================================================

describe('AC1: Mode flag parsing', () => {
  describe('parseTrimodalFlag', () => {
    it('should parse --mode create flag', () => {
      const result = parseTrimodalFlag(['--mode', 'create']);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.mode, 'create');
    });

    it('should parse --mode validate flag', () => {
      const result = parseTrimodalFlag(['--mode', 'validate']);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.mode, 'validate');
    });

    it('should parse --mode edit flag', () => {
      const result = parseTrimodalFlag(['--mode', 'edit']);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.mode, 'edit');
    });

    it('should handle --mode=create syntax', () => {
      const result = parseTrimodalFlag(['--mode=create']);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.mode, 'create');
    });

    it('should handle -m shorthand flag', () => {
      const result = parseTrimodalFlag(['-m', 'validate']);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.mode, 'validate');
    });

    it('should return undefined mode when no flag provided', () => {
      const result = parseTrimodalFlag([]);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.mode, undefined);
    });

    it('should return error for invalid mode value', () => {
      const result = parseTrimodalFlag(['--mode', 'invalid']);
      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('invalid'));
    });

    it('should return error for --mode without value', () => {
      const result = parseTrimodalFlag(['--mode']);
      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('requires'));
    });

    it('should handle mode flag among other arguments', () => {
      const result = parseTrimodalFlag(['workflow', 'start', 'architecture', '--mode', 'edit', '--verbose']);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.mode, 'edit');
    });
  });

  describe('validateMode', () => {
    const workflowWithAllModes: WorkflowDefinition = {
      name: 'test-workflow',
      type: 'stepped',
      steps: { path: './steps/', pattern: 'step-{nn}-*.md' },
      modes: {
        default: 'create',
        create: './steps/',
        validate: './steps-validate/',
        edit: './steps-edit/',
      },
    };

    const workflowWithPartialModes: WorkflowDefinition = {
      name: 'partial-workflow',
      type: 'stepped',
      steps: { path: './steps/', pattern: 'step-{nn}-*.md' },
      modes: {
        default: 'create',
        create: './steps/',
        // validate and edit not defined
      },
    };

    it('should accept create mode when workflow supports it', () => {
      const result = validateMode('create', workflowWithAllModes);
      assert.strictEqual(result.valid, true);
    });

    it('should accept validate mode when workflow supports it', () => {
      const result = validateMode('validate', workflowWithAllModes);
      assert.strictEqual(result.valid, true);
    });

    it('should accept edit mode when workflow supports it', () => {
      const result = validateMode('edit', workflowWithAllModes);
      assert.strictEqual(result.valid, true);
    });

    it('should reject mode not defined in workflow', () => {
      const result = validateMode('validate', workflowWithPartialModes);
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('validate'));
    });

    it('should accept any mode for workflow without modes config', () => {
      const workflowNoModes: WorkflowDefinition = {
        name: 'no-modes',
        type: 'stepped',
        steps: { path: './steps/', pattern: 'step-{nn}-*.md' },
      };
      // When workflow has no modes config, any mode should work (uses steps.path)
      const result = validateMode('create', workflowNoModes);
      assert.strictEqual(result.valid, true);
    });
  });
});

// ============================================================================
// AC2: Steps loaded from mode-specific directory
// ============================================================================

describe('AC2: Mode-specific steps path resolution', () => {
  describe('resolveStepsPath', () => {
    const trimodalWorkflow: WorkflowDefinition = {
      name: 'architecture',
      type: 'stepped',
      steps: { path: './steps/', pattern: 'step-{nn}-*.md' },
      modes: {
        default: 'create',
        create: './steps/',
        validate: './steps-validate/',
        edit: './steps-edit/',
      },
    };

    it('should resolve create mode to create path', () => {
      const result = resolveStepsPath(trimodalWorkflow, 'create');
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.path, './steps/');
    });

    it('should resolve validate mode to validate path', () => {
      const result = resolveStepsPath(trimodalWorkflow, 'validate');
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.path, './steps-validate/');
    });

    it('should resolve edit mode to edit path', () => {
      const result = resolveStepsPath(trimodalWorkflow, 'edit');
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.path, './steps-edit/');
    });

    it('should fall back to steps.path when no modes config', () => {
      const workflowNoModes: WorkflowDefinition = {
        name: 'simple',
        type: 'stepped',
        steps: { path: './default-steps/', pattern: 'step-{nn}-*.md' },
      };
      const result = resolveStepsPath(workflowNoModes, 'create');
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.path, './default-steps/');
    });

    it('should fall back to steps.path when mode path not defined', () => {
      const partialModes: WorkflowDefinition = {
        name: 'partial',
        type: 'stepped',
        steps: { path: './fallback/', pattern: 'step-{nn}-*.md' },
        modes: {
          default: 'create',
          create: './create-steps/',
          // validate not defined
        },
      };
      const result = resolveStepsPath(partialModes, 'validate');
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.path, './fallback/');
    });

    it('should return error for phased workflow (no steps)', () => {
      const phasedWorkflow: WorkflowDefinition = {
        name: 'tdd',
        type: 'phased',
        phases: [{ name: 'setup', agent: 'sm' }],
      };
      const result = resolveStepsPath(phasedWorkflow, 'create');
      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('stepped'));
    });

    it('should preserve pattern from workflow definition', () => {
      const result = resolveStepsPath(trimodalWorkflow, 'create');
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.pattern, 'step-{nn}-*.md');
    });
  });
});

// ============================================================================
// AC3: Mode tracked in session state
// ============================================================================

describe('AC3: Session state mode tracking', () => {
  describe('initWorkflowState with mode', () => {
    it('should initialize state with create mode', () => {
      const state = initWorkflowState('architecture', 'stepped', 'create');
      assert.strictEqual(state.name, 'architecture');
      assert.strictEqual(state.type, 'stepped');
      assert.strictEqual(state.mode, 'create');
    });

    it('should initialize state with validate mode', () => {
      const state = initWorkflowState('architecture', 'stepped', 'validate');
      assert.strictEqual(state.mode, 'validate');
    });

    it('should initialize state with edit mode', () => {
      const state = initWorkflowState('architecture', 'stepped', 'edit');
      assert.strictEqual(state.mode, 'edit');
    });

    it('should allow undefined mode for workflows without tri-modal', () => {
      const state = initWorkflowState('simple', 'stepped');
      assert.strictEqual(state.mode, undefined);
    });
  });

  describe('formatWorkflowState with mode', () => {
    it('should include mode in formatted output', () => {
      const state = initWorkflowState('architecture', 'stepped', 'validate');
      const formatted = formatWorkflowState(state);
      assert.ok(formatted.includes('**Mode:** validate'));
    });

    it('should omit mode line when mode is undefined', () => {
      const state = initWorkflowState('simple', 'stepped');
      const formatted = formatWorkflowState(state);
      assert.ok(!formatted.includes('**Mode:**'));
    });
  });

  describe('parseSessionState with mode', () => {
    it('should parse mode from session content', () => {
      const content = `
# Story

## Workflow State
- **Workflow Name:** architecture
- **Type:** stepped
- **Mode:** edit
- **Started:** 2026-01-21T10:00:00Z
- **Last Updated:** 2026-01-21T10:30:00Z
- **Current Step:** 3
- **Steps Completed:** [1, 2]
- **Status:** in_progress
`;
      const result = parseSessionState(content);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.state?.mode, 'edit');
    });

    it('should handle session without mode field', () => {
      const content = `
# Story

## Workflow State
- **Workflow Name:** simple
- **Type:** stepped
- **Started:** 2026-01-21T10:00:00Z
- **Last Updated:** 2026-01-21T10:30:00Z
- **Current Step:** 1
- **Steps Completed:** []
- **Status:** in_progress
`;
      const result = parseSessionState(content);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.state?.mode, undefined);
    });
  });

  describe('updateSessionContent preserves mode', () => {
    it('should preserve mode when updating session state', () => {
      const state = initWorkflowState('architecture', 'stepped', 'validate');
      state.currentStep = 2;
      state.stepsCompleted = [1];

      const content = '# Story\n\n## Overview\nSome content\n';
      const result = updateSessionContent(content, state);

      assert.strictEqual(result.success, true);
      assert.ok(result.content?.includes('**Mode:** validate'));
    });
  });
});

// ============================================================================
// AC4: Defaults to create mode when --mode not specified
// ============================================================================

describe('AC4: Default mode behavior', () => {
  describe('getDefaultMode', () => {
    it('should return workflow modes.default when defined', () => {
      const workflow: WorkflowDefinition = {
        name: 'test',
        type: 'stepped',
        steps: { path: './steps/', pattern: 'step-{nn}-*.md' },
        modes: {
          default: 'validate',
          create: './create/',
          validate: './validate/',
        },
      };
      const mode = getDefaultMode(workflow);
      assert.strictEqual(mode, 'validate');
    });

    it('should return create when modes.default is create', () => {
      const workflow: WorkflowDefinition = {
        name: 'test',
        type: 'stepped',
        steps: { path: './steps/', pattern: 'step-{nn}-*.md' },
        modes: {
          default: 'create',
          create: './create/',
        },
      };
      const mode = getDefaultMode(workflow);
      assert.strictEqual(mode, 'create');
    });

    it('should return create when no modes config exists', () => {
      const workflow: WorkflowDefinition = {
        name: 'simple',
        type: 'stepped',
        steps: { path: './steps/', pattern: 'step-{nn}-*.md' },
      };
      const mode = getDefaultMode(workflow);
      assert.strictEqual(mode, 'create');
    });

    it('should return undefined for phased workflows', () => {
      const workflow: WorkflowDefinition = {
        name: 'tdd',
        type: 'phased',
        phases: [{ name: 'setup', agent: 'sm' }],
      };
      const mode = getDefaultMode(workflow);
      assert.strictEqual(mode, undefined);
    });
  });

  describe('Integration: flag parsing with defaults', () => {
    const trimodalWorkflow: WorkflowDefinition = {
      name: 'architecture',
      type: 'stepped',
      steps: { path: './steps/', pattern: 'step-{nn}-*.md' },
      modes: {
        default: 'create',
        create: './steps/',
        validate: './steps-validate/',
        edit: './steps-edit/',
      },
    };

    it('should use create mode when no --mode flag and workflow defaults to create', () => {
      const parseResult = parseTrimodalFlag([]);
      const effectiveMode = parseResult.mode ?? getDefaultMode(trimodalWorkflow);
      assert.strictEqual(effectiveMode, 'create');
    });

    it('should use explicit mode when --mode flag provided', () => {
      const parseResult = parseTrimodalFlag(['--mode', 'edit']);
      const effectiveMode = parseResult.mode ?? getDefaultMode(trimodalWorkflow);
      assert.strictEqual(effectiveMode, 'edit');
    });

    it('should use workflow default mode when no flag and default is not create', () => {
      const validateDefaultWorkflow: WorkflowDefinition = {
        ...trimodalWorkflow,
        modes: { ...trimodalWorkflow.modes!, default: 'validate' },
      };
      const parseResult = parseTrimodalFlag([]);
      const effectiveMode = parseResult.mode ?? getDefaultMode(validateDefaultWorkflow);
      assert.strictEqual(effectiveMode, 'validate');
    });
  });
});

// ============================================================================
// Edge cases and error handling
// ============================================================================

describe('Edge cases', () => {
  it('should handle empty workflow modes object', () => {
    const workflow: WorkflowDefinition = {
      name: 'test',
      type: 'stepped',
      steps: { path: './steps/', pattern: 'step-{nn}-*.md' },
      modes: {} as WorkflowModes, // Empty modes object (technically invalid but defensive)
    };
    const result = resolveStepsPath(workflow, 'create');
    // Should fall back to steps.path
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.path, './steps/');
  });

  it('should handle case-sensitive mode values', () => {
    // Modes should be lowercase
    const result = parseTrimodalFlag(['--mode', 'Create']);
    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('Create'));
  });

  it('should preserve mode across session state round-trip', () => {
    // Create state with mode
    const original = initWorkflowState('arch', 'stepped', 'validate');

    // Format to markdown
    const formatted = formatWorkflowState(original);

    // Create session content
    const sessionContent = `# Story\n\n${formatted}\n`;

    // Parse it back
    const parsed = parseSessionState(sessionContent);

    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.state?.mode, 'validate');
    assert.strictEqual(parsed.state?.name, 'arch');
    assert.strictEqual(parsed.state?.type, 'stepped');
  });
});
