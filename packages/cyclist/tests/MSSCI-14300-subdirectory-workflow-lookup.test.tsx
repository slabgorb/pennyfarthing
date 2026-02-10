/**
 * MSSCI-14300: Subdirectory Workflow Lookup Tests
 *
 * Tests for adding subdirectory workflow lookup to getWorkflowPhases
 * and WorkflowPanel stepped workflow display.
 *
 * Story: MSSCI-14300 - Add subdirectory workflow lookup to getWorkflowPhases
 * Epic: MSSCI-14298 (Stepped Workflow Infrastructure)
 *
 * Acceptance Criteria:
 * - AC1: getWorkflowPhases finds subdirectory workflow definitions
 * - AC2: WorkflowPanel displays stepped workflow progress (step N of M)
 * - AC3: Existing flat-file workflow lookup still works
 * - AC4: All 16 subdirectory workflows discoverable by panel
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import React from 'react';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Extend expect with jest-dom matchers
expect.extend(matchers);

// ============================================================================
// Mock Setup
// ============================================================================

// Default mock data - stepped workflow with 5 steps
const mockSteppedStoryData = {
  story: {
    workflow: 'epics-and-stories',
    workflowPhases: [
      { name: 'step-01', agent: 'architect', label: 'Step 1', status: 'done' as const },
      { name: 'step-02', agent: 'architect', label: 'Step 2', status: 'done' as const },
      { name: 'step-03', agent: 'architect', label: 'Step 3', status: 'current' as const },
      { name: 'step-04', agent: 'architect', label: 'Step 4', status: 'pending' as const },
      { name: 'step-05', agent: 'architect', label: 'Step 5', status: 'pending' as const },
    ],
    // New field: workflowType distinguishes phased from stepped
    workflowType: 'stepped',
  },
  isLoading: false,
  error: null,
};

const mockPhasedStoryData = {
  story: {
    workflow: 'tdd',
    workflowPhases: [
      { name: 'setup', agent: 'sm', label: 'Setup', status: 'done' as const },
      { name: 'red', agent: 'tea', label: 'Red', status: 'current' as const },
      { name: 'green', agent: 'dev', label: 'Green', status: 'pending' as const },
      { name: 'review', agent: 'reviewer', label: 'Review', status: 'pending' as const },
    ],
    workflowType: 'phased',
  },
  isLoading: false,
  error: null,
};

let currentMockData = mockSteppedStoryData;

vi.mock('../src/public/hooks/useStory', () => ({
  useStory: vi.fn(() => currentMockData),
}));

vi.mock('../src/public/contexts/ClaudeContext', () => ({
  useClaudeContext: vi.fn(() => ({ send: vi.fn(), isConnected: true })),
}));

beforeEach(() => {
  currentMockData = mockSteppedStoryData;
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

// ============================================================================
// AC1: getWorkflowPhases finds subdirectory workflow definitions
// ============================================================================

describe('AC1: getWorkflowPhases finds subdirectory workflow definitions', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'pf-test-'));
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should find workflow.yaml inside a subdirectory', async () => {
    // Create subdirectory workflow structure:
    // .pennyfarthing/workflows/my-stepped-workflow/workflow.yaml
    // .pennyfarthing/workflows/my-stepped-workflow/steps/step-01-first.md
    const workflowDir = join(tempDir, '.pennyfarthing', 'workflows', 'my-stepped-workflow');
    const stepsDir = join(workflowDir, 'steps');
    mkdirSync(stepsDir, { recursive: true });

    writeFileSync(join(workflowDir, 'workflow.yaml'), `
workflow:
  name: my-stepped-workflow
  type: stepped
  agent: architect
  steps:
    path: ./steps/
    pattern: step-*.md
`);
    writeFileSync(join(stepsDir, 'step-01-first-step.md'), '# Step 1');
    writeFileSync(join(stepsDir, 'step-02-second-step.md'), '# Step 2');
    writeFileSync(join(stepsDir, 'step-03-third-step.md'), '# Step 3');

    const { getWorkflowPhases } = await import('../src/story-parser');
    const phases = getWorkflowPhases('my-stepped-workflow', tempDir);

    expect(phases).not.toBeNull();
    expect(phases).toHaveLength(3);
    expect(phases![0]).toEqual({ name: 'step-01', agent: 'architect', label: 'Step 1' });
    expect(phases![1]).toEqual({ name: 'step-02', agent: 'architect', label: 'Step 2' });
    expect(phases![2]).toEqual({ name: 'step-03', agent: 'architect', label: 'Step 3' });
  });

  it('should prefer flat-file over subdirectory when both exist', async () => {
    // Create both flat and subdirectory versions
    const workflowsDir = join(tempDir, '.pennyfarthing', 'workflows');
    mkdirSync(workflowsDir, { recursive: true });

    // Flat file with phases
    writeFileSync(join(workflowsDir, 'dual-workflow.yaml'), `
workflow:
  name: dual-workflow
  phases:
    - name: setup
      agent: sm
    - name: execute
      agent: dev
`);

    // Subdirectory version
    const subDir = join(workflowsDir, 'dual-workflow');
    const stepsDir = join(subDir, 'steps');
    mkdirSync(stepsDir, { recursive: true });
    writeFileSync(join(subDir, 'workflow.yaml'), `
workflow:
  name: dual-workflow
  type: stepped
  agent: architect
`);
    writeFileSync(join(stepsDir, 'step-01-only.md'), '# Step 1');

    const { getWorkflowPhases } = await import('../src/story-parser');
    const phases = getWorkflowPhases('dual-workflow', tempDir);

    // Flat file should win — it's checked first in search order
    expect(phases).not.toBeNull();
    expect(phases).toHaveLength(2);
    expect(phases![0].name).toBe('setup');
  });

  it('should return null for non-existent workflow', async () => {
    const { getWorkflowPhases } = await import('../src/story-parser');
    const phases = getWorkflowPhases('totally-fake-workflow', tempDir);

    expect(phases).toBeNull();
  });

  it('should extract agent from subdirectory workflow.yaml', async () => {
    const workflowDir = join(tempDir, '.pennyfarthing', 'workflows', 'agent-test');
    const stepsDir = join(workflowDir, 'steps');
    mkdirSync(stepsDir, { recursive: true });

    writeFileSync(join(workflowDir, 'workflow.yaml'), `
workflow:
  name: agent-test
  type: stepped
  agent: pm
  steps:
    path: ./steps/
`);
    writeFileSync(join(stepsDir, 'step-01-check.md'), '# Step 1');

    const { getWorkflowPhases } = await import('../src/story-parser');
    const phases = getWorkflowPhases('agent-test', tempDir);

    expect(phases).not.toBeNull();
    expect(phases![0].agent).toBe('pm');
  });

  it('should handle stepped workflow with no steps directory', async () => {
    const workflowDir = join(tempDir, '.pennyfarthing', 'workflows', 'no-steps');
    mkdirSync(workflowDir, { recursive: true });

    writeFileSync(join(workflowDir, 'workflow.yaml'), `
workflow:
  name: no-steps
  type: stepped
  agent: architect
`);

    const { getWorkflowPhases } = await import('../src/story-parser');
    const phases = getWorkflowPhases('no-steps', tempDir);

    expect(phases).toBeNull();
  });
});

// ============================================================================
// AC2: WorkflowPanel displays stepped workflow progress (step N of M)
// ============================================================================

describe('AC2: WorkflowPanel displays stepped workflow progress (step N of M)', () => {
  it('should render "Step N of M" for stepped workflows instead of phase arrows', async () => {
    currentMockData = mockSteppedStoryData;
    const { WorkflowPanel } = await import('../src/public/components/panels/WorkflowPanel');
    render(<WorkflowPanel />);

    // Stepped workflows should show "Step 3 of 5" (current step 3, total 5)
    expect(screen.getByText(/Step 3 of 5/)).toBeInTheDocument();
  });

  it('should NOT render arrow separators for stepped workflows', async () => {
    currentMockData = mockSteppedStoryData;
    const { WorkflowPanel } = await import('../src/public/components/panels/WorkflowPanel');
    const { container } = render(<WorkflowPanel />);

    // Stepped workflows should NOT use arrow separators between steps
    const arrows = container.querySelectorAll('.phase-arrow');
    expect(arrows.length).toBe(0);
  });

  it('should still render arrow separators for phased workflows', async () => {
    currentMockData = mockPhasedStoryData;
    const { WorkflowPanel } = await import('../src/public/components/panels/WorkflowPanel');
    const { container } = render(<WorkflowPanel />);

    // Phased workflows (TDD) should still use arrows
    const arrows = container.querySelectorAll('.phase-arrow');
    expect(arrows.length).toBe(3); // 4 phases = 3 arrows
  });

  it('should show step completion count for stepped workflows', async () => {
    currentMockData = mockSteppedStoryData;
    const { WorkflowPanel } = await import('../src/public/components/panels/WorkflowPanel');
    render(<WorkflowPanel />);

    // Should show how many steps are done (2 done out of 5)
    const panel = screen.getByTestId('workflow-panel');
    expect(panel).toHaveAttribute('data-testid', 'workflow-panel');

    // Should have a stepped progress indicator — either "2 complete" or "Step 3 of 5"
    const completionText = screen.queryByText(/2.*complete/i) || screen.queryByText(/Step 3 of 5/);
    expect(completionText).toBeInTheDocument();
  });

  it('should display workflow name badge for stepped workflows', async () => {
    currentMockData = mockSteppedStoryData;
    const { WorkflowPanel } = await import('../src/public/components/panels/WorkflowPanel');
    render(<WorkflowPanel />);

    // Should capitalize first letter: "Epics-and-stories"
    const badge = screen.getByText('Epics-and-stories');
    expect(badge).toBeInTheDocument();
    expect(badge.closest('[data-workflow-type]')).toHaveAttribute('data-workflow-type', 'epics-and-stories');
  });

  it('should indicate current step label for stepped workflows', async () => {
    currentMockData = mockSteppedStoryData;
    const { WorkflowPanel } = await import('../src/public/components/panels/WorkflowPanel');
    render(<WorkflowPanel />);

    // The current step label should be visible
    expect(screen.getByText('Step 3')).toBeInTheDocument();
  });

  it('should render stepped progress with a data attribute for test targeting', async () => {
    currentMockData = mockSteppedStoryData;
    const { WorkflowPanel } = await import('../src/public/components/panels/WorkflowPanel');
    const { container } = render(<WorkflowPanel />);

    // Should have a stepped-progress container distinct from phase-progress
    const steppedProgress = container.querySelector('.stepped-progress');
    expect(steppedProgress).toBeInTheDocument();
  });

  it('should show "Step 1 of N" when on first step', async () => {
    currentMockData = {
      story: {
        workflow: 'research',
        workflowPhases: [
          { name: 'step-01', agent: 'architect', label: 'Step 1', status: 'current' as const },
          { name: 'step-02', agent: 'architect', label: 'Step 2', status: 'pending' as const },
          { name: 'step-03', agent: 'architect', label: 'Step 3', status: 'pending' as const },
        ],
        workflowType: 'stepped',
      },
      isLoading: false,
      error: null,
    };
    const { WorkflowPanel } = await import('../src/public/components/panels/WorkflowPanel');
    render(<WorkflowPanel />);

    expect(screen.getByText(/Step 1 of 3/)).toBeInTheDocument();
  });

  it('should show all steps as done when workflow is complete', async () => {
    currentMockData = {
      story: {
        workflow: 'prd',
        workflowPhases: [
          { name: 'step-01', agent: 'pm', label: 'Step 1', status: 'done' as const },
          { name: 'step-02', agent: 'pm', label: 'Step 2', status: 'done' as const },
          { name: 'step-03', agent: 'pm', label: 'Step 3', status: 'done' as const },
        ],
        workflowType: 'stepped',
      },
      isLoading: false,
      error: null,
    };
    const { WorkflowPanel } = await import('../src/public/components/panels/WorkflowPanel');
    render(<WorkflowPanel />);

    // All steps done — should show completion state
    expect(screen.getByText(/3 of 3/)).toBeInTheDocument();
  });
});

// ============================================================================
// AC3: Existing flat-file workflow lookup still works
// ============================================================================

describe('AC3: Existing flat-file workflow lookup still works', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'pf-test-flat-'));
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should find flat-file workflow YAML (e.g., tdd.yaml)', async () => {
    const workflowsDir = join(tempDir, '.pennyfarthing', 'workflows');
    mkdirSync(workflowsDir, { recursive: true });

    writeFileSync(join(workflowsDir, 'tdd.yaml'), `
workflow:
  name: tdd
  phases:
    - name: setup
      agent: sm
      label: Setup
    - name: red
      agent: tea
      label: Red
    - name: green
      agent: dev
      label: Green
    - name: review
      agent: reviewer
      label: Review
    - name: finish
      agent: sm
      label: Finish
`);

    const { getWorkflowPhases } = await import('../src/story-parser');
    const phases = getWorkflowPhases('tdd', tempDir);

    expect(phases).not.toBeNull();
    expect(phases).toHaveLength(5);
    expect(phases![0]).toEqual({ name: 'setup', agent: 'sm', label: 'Setup' });
    expect(phases![1]).toEqual({ name: 'red', agent: 'tea', label: 'Red' });
  });

  it('should use phase name as label when label not provided', async () => {
    const workflowsDir = join(tempDir, '.pennyfarthing', 'workflows');
    mkdirSync(workflowsDir, { recursive: true });

    writeFileSync(join(workflowsDir, 'trivial.yaml'), `
workflow:
  name: trivial
  phases:
    - name: setup
      agent: sm
    - name: implement
      agent: dev
    - name: review
      agent: reviewer
`);

    const { getWorkflowPhases } = await import('../src/story-parser');
    const phases = getWorkflowPhases('trivial', tempDir);

    expect(phases).not.toBeNull();
    expect(phases![0].label).toBe('setup'); // Falls back to name
  });

  it('should check all three workflow directories for flat files', async () => {
    // Create workflow in pennyfarthing-dist (third search location)
    const distDir = join(tempDir, 'pennyfarthing-dist', 'workflows');
    mkdirSync(distDir, { recursive: true });

    writeFileSync(join(distDir, 'dist-only.yaml'), `
workflow:
  name: dist-only
  phases:
    - name: build
      agent: dev
`);

    const { getWorkflowPhases } = await import('../src/story-parser');
    const phases = getWorkflowPhases('dist-only', tempDir);

    expect(phases).not.toBeNull();
    expect(phases).toHaveLength(1);
    expect(phases![0].name).toBe('build');
  });

  it('should render phased workflow with arrow progress in WorkflowPanel', async () => {
    currentMockData = mockPhasedStoryData;
    const { WorkflowPanel } = await import('../src/public/components/panels/WorkflowPanel');
    const { container } = render(<WorkflowPanel />);

    // Phase labels visible
    expect(screen.getByText('Setup')).toBeInTheDocument();
    expect(screen.getByText('Red')).toBeInTheDocument();
    expect(screen.getByText('Green')).toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();

    // Arrow separators between phases
    const arrows = container.querySelectorAll('.phase-arrow');
    expect(arrows.length).toBe(3);
  });
});

// ============================================================================
// AC4: All subdirectory workflows discoverable by panel
// ============================================================================

describe('AC4: All subdirectory workflows discoverable by panel', () => {
  // These test against the real workflow directory structure
  // Go up to the pennyfarthing repo root where pennyfarthing-dist/workflows/ lives
  const realProjectDir = join(__dirname, '..', '..', '..');

  // Subdirectory workflows that have step files (steps/ directory with step-*.md)
  const WORKFLOWS_WITH_STEPS = [
    'epics-and-stories',
    'implementation-readiness',
    'interactive-debug',
    'product-brief',
    'project-context',
    'project-setup',
    'quick-dev',
    'sprint-planning',
    'ux-design',
  ];

  // Subdirectory workflows defined but without step files yet
  const WORKFLOWS_WITHOUT_STEPS = [
    'brainstorming',
    'code-review',
    'prd',
    'research',
    'retrospective',
  ];

  const ALL_SUBDIRECTORY_WORKFLOWS = [...WORKFLOWS_WITH_STEPS, ...WORKFLOWS_WITHOUT_STEPS];

  it('should discover all subdirectory workflows that have step files', async () => {
    const { getWorkflowPhases } = await import('../src/story-parser');

    const discovered: string[] = [];
    const failed: string[] = [];

    for (const name of WORKFLOWS_WITH_STEPS) {
      const phases = getWorkflowPhases(name, realProjectDir);
      if (phases && phases.length > 0) {
        discovered.push(name);
      } else {
        failed.push(name);
      }
    }

    expect(failed).toEqual([]);
    expect(discovered.length).toBe(WORKFLOWS_WITH_STEPS.length);
  });

  it('should return at least 1 step for each workflow with step files', async () => {
    const { getWorkflowPhases } = await import('../src/story-parser');

    for (const name of WORKFLOWS_WITH_STEPS) {
      const phases = getWorkflowPhases(name, realProjectDir);
      expect(phases, `Workflow "${name}" should have phases`).not.toBeNull();
      expect(phases!.length, `Workflow "${name}" should have at least 1 step`).toBeGreaterThanOrEqual(1);
    }
  });

  it('should return null for subdirectory workflows without step files', async () => {
    const { getWorkflowPhases } = await import('../src/story-parser');

    for (const name of WORKFLOWS_WITHOUT_STEPS) {
      const phases = getWorkflowPhases(name, realProjectDir);
      // These workflows are defined but have no step files — returns null
      expect(phases, `Workflow "${name}" should return null (no steps)`).toBeNull();
    }
  });

  it('should return phases with valid name/agent/label for each stepped workflow', async () => {
    const { getWorkflowPhases } = await import('../src/story-parser');

    for (const name of WORKFLOWS_WITH_STEPS) {
      const phases = getWorkflowPhases(name, realProjectDir);
      if (!phases) continue;

      for (const phase of phases) {
        expect(phase.name, `${name}: phase should have a name`).toBeTruthy();
        expect(phase.agent, `${name}: phase should have an agent`).toBeTruthy();
        expect(phase.label, `${name}: phase should have a label`).toBeTruthy();
        // step-NN or step-? (for non-standard filenames like step-01b-continue.md)
        expect(phase.name).toMatch(/^step-(\d+|\?)$/);
      }
    }
  });

  it('should also discover flat-file workflows (tdd, trivial, bdd, patch)', async () => {
    const { getWorkflowPhases } = await import('../src/story-parser');

    const flatWorkflows = ['tdd', 'trivial', 'bdd', 'patch'];
    for (const name of flatWorkflows) {
      const phases = getWorkflowPhases(name, realProjectDir);
      expect(phases, `Flat workflow "${name}" should be discoverable`).not.toBeNull();
      expect(phases!.length, `Flat workflow "${name}" should have phases`).toBeGreaterThanOrEqual(1);
    }
  });
});

// ============================================================================
// parseWorkflowProgress: Stepped workflow status resolution
// ============================================================================

describe('parseWorkflowProgress: stepped status resolution', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'pf-test-status-'));

    // Create a stepped workflow for status tests
    const workflowDir = join(tempDir, '.pennyfarthing', 'workflows', 'status-test');
    const stepsDir = join(workflowDir, 'steps');
    mkdirSync(stepsDir, { recursive: true });

    writeFileSync(join(workflowDir, 'workflow.yaml'), `
workflow:
  name: status-test
  type: stepped
  agent: architect
  steps:
    path: ./steps/
`);
    writeFileSync(join(stepsDir, 'step-01-first.md'), '# Step 1');
    writeFileSync(join(stepsDir, 'step-02-second.md'), '# Step 2');
    writeFileSync(join(stepsDir, 'step-03-third.md'), '# Step 3');
    writeFileSync(join(stepsDir, 'step-04-fourth.md'), '# Step 4');
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should mark steps before current as done, current as current, after as pending', async () => {
    const sessionContent = `
# Test Story

**Workflow:** status-test
**Phase:** red

## Workflow State
- **Current Step:** 3
- **Steps Completed:** [1, 2]
- **Status:** in_progress
`;

    const { parseWorkflowProgress } = await import('../src/story-parser');
    const phases = parseWorkflowProgress(sessionContent, tempDir);

    expect(phases).not.toBeNull();
    expect(phases).toHaveLength(4);
    expect(phases![0].status).toBe('done');    // Step 1 - in completed list
    expect(phases![1].status).toBe('done');    // Step 2 - in completed list
    expect(phases![2].status).toBe('current'); // Step 3 - current step
    expect(phases![3].status).toBe('pending'); // Step 4 - after current
  });

  it('should mark all steps as done when all completed', async () => {
    const sessionContent = `
# Test Story

**Workflow:** status-test
**Phase:** red

## Workflow State
- **Current Step:** 4
- **Steps Completed:** [1, 2, 3, 4]
- **Status:** completed
`;

    const { parseWorkflowProgress } = await import('../src/story-parser');
    const phases = parseWorkflowProgress(sessionContent, tempDir);

    expect(phases).not.toBeNull();
    expect(phases![0].status).toBe('done');
    expect(phases![1].status).toBe('done');
    expect(phases![2].status).toBe('done');
    expect(phases![3].status).toBe('done');
  });

  it('should mark first step as current when just started', async () => {
    const sessionContent = `
# Test Story

**Workflow:** status-test
**Phase:** red

## Workflow State
- **Current Step:** 1
- **Steps Completed:** []
- **Status:** in_progress
`;

    const { parseWorkflowProgress } = await import('../src/story-parser');
    const phases = parseWorkflowProgress(sessionContent, tempDir);

    expect(phases).not.toBeNull();
    expect(phases![0].status).toBe('current');
    expect(phases![1].status).toBe('pending');
    expect(phases![2].status).toBe('pending');
    expect(phases![3].status).toBe('pending');
  });

  it('should handle gaps in steps completed list', async () => {
    const sessionContent = `
# Test Story

**Workflow:** status-test
**Phase:** red

## Workflow State
- **Current Step:** 4
- **Steps Completed:** [1, 3]
- **Status:** in_progress
`;

    const { parseWorkflowProgress } = await import('../src/story-parser');
    const phases = parseWorkflowProgress(sessionContent, tempDir);

    expect(phases).not.toBeNull();
    expect(phases![0].status).toBe('done');    // Step 1 - explicitly completed
    expect(phases![1].status).toBe('done');    // Step 2 - implicitly done (before current)
    expect(phases![2].status).toBe('done');    // Step 3 - explicitly completed
    expect(phases![3].status).toBe('current'); // Step 4 - current step
  });
});
