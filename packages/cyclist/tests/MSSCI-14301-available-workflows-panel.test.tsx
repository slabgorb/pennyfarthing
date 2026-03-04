/**
 * MSSCI-14301: Show Available Applicable Workflows in WorkflowPanel
 *
 * Tests for workflow discovery and display in WorkflowPanel.
 * This story adds:
 * 1. Backend: getAvailableWorkflows() in story-parser.ts to enumerate all workflows
 * 2. Frontend: WorkflowPanel shows available workflows when no active workflow
 * 3. Data: useStory hook passes available workflows to the component
 *
 * Story: MSSCI-14301 - Show available applicable workflows in WorkflowPanel
 * Epic: MSSCI-14298 (Stepped Workflow Infrastructure)
 *
 * Acceptance Criteria:
 * - AC1: WorkflowPanel shows list of available workflows when no workflow is active
 * - AC2: Available workflows are filtered by applicability to current project context
 * - AC3: Each workflow entry shows name, type (stepped/phased), and description
 * - AC4: User can identify which workflows are startable from the panel
 * - AC5: List updates when project context changes
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
// Types for available workflows
// ============================================================================

/** Shape of a workflow summary returned by getAvailableWorkflows */
interface AvailableWorkflow {
  name: string;
  type: 'phased' | 'stepped';
  description: string;
  triggers?: {
    types?: string[];
    tags?: string[];
    points?: { min?: number; max?: number };
    default?: boolean;
  };
}

// ============================================================================
// Mock Setup
// ============================================================================

// Mock data: no active workflow, but available workflows present
const mockNoActiveWorkflow = {
  story: null,
  isLoading: false,
  error: null,
  availableWorkflows: [
    { name: 'tdd', type: 'phased' as const, description: 'Test-driven development with code review' },
    { name: 'trivial', type: 'phased' as const, description: 'Quick fixes without full TDD ceremony' },
    { name: 'architecture', type: 'stepped' as const, description: 'Collaborative architectural decision-making' },
    { name: 'research', type: 'stepped' as const, description: 'Structured research workflow' },
  ],
};

// Mock data: active workflow AND available workflows
const mockWithActiveWorkflow = {
  story: {
    id: 'MSSCI-14301',
    title: 'Show available workflows',
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
  availableWorkflows: [
    { name: 'tdd', type: 'phased' as const, description: 'Test-driven development with code review' },
    { name: 'trivial', type: 'phased' as const, description: 'Quick fixes without full TDD ceremony' },
  ],
};

// Mock data: loading state
const mockLoading = {
  story: null,
  isLoading: true,
  error: null,
  availableWorkflows: null,
};

let currentMockData: any = mockNoActiveWorkflow;

vi.mock('../src/public/hooks/useStory', () => ({
  useStory: vi.fn(() => currentMockData),
}));

const mockSend = vi.fn();
vi.mock('../src/public/contexts/ClaudeContext', () => ({
  useClaudeContext: vi.fn(() => ({
    send: mockSend,
    isConnected: true,
  })),
}));

beforeEach(() => {
  currentMockData = mockNoActiveWorkflow;
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

// ============================================================================
// AC1: WorkflowPanel shows list of available workflows when no workflow is active
// ============================================================================

describe('AC1: WorkflowPanel shows list of available workflows when no active workflow', () => {
  it('should show available workflows section when no story/workflow is active', async () => {
    currentMockData = mockNoActiveWorkflow;
    const { WorkflowPanel } = await import('../src/public/components/panels/WorkflowPanel');
    render(<WorkflowPanel />);

    // Should show an "Available Workflows" heading or section
    expect(screen.getByText(/available workflows/i)).toBeInTheDocument();
  });

  it('should list all available workflow names', async () => {
    currentMockData = mockNoActiveWorkflow;
    const { WorkflowPanel } = await import('../src/public/components/panels/WorkflowPanel');
    render(<WorkflowPanel />);

    expect(screen.getByText('tdd')).toBeInTheDocument();
    expect(screen.getByText('trivial')).toBeInTheDocument();
    expect(screen.getByText('architecture')).toBeInTheDocument();
    expect(screen.getByText('research')).toBeInTheDocument();
  });

  it('should not show "No active workflow" placeholder when available workflows exist', async () => {
    currentMockData = mockNoActiveWorkflow;
    const { WorkflowPanel } = await import('../src/public/components/panels/WorkflowPanel');
    render(<WorkflowPanel />);

    // The old placeholder should be replaced by the available workflows list
    expect(screen.queryByText('No active workflow')).not.toBeInTheDocument();
  });

  it('should still show "No active workflow" when no available workflows data', async () => {
    currentMockData = {
      story: null,
      isLoading: false,
      error: null,
      availableWorkflows: null,
    };
    const { WorkflowPanel } = await import('../src/public/components/panels/WorkflowPanel');
    render(<WorkflowPanel />);

    expect(screen.getByText('No active workflow')).toBeInTheDocument();
  });

  it('should show available workflows count', async () => {
    currentMockData = mockNoActiveWorkflow;
    const { WorkflowPanel } = await import('../src/public/components/panels/WorkflowPanel');
    render(<WorkflowPanel />);

    // Should indicate number of available workflows
    expect(screen.getByText(/4/)).toBeInTheDocument();
  });
});

// ============================================================================
// AC2: Available workflows are filtered by applicability to current project context
// ============================================================================

describe('AC2: Available workflows filtered by applicability', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'pf-test-avail-'));
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should discover phased workflows from flat YAML files', async () => {
    const workflowsDir = join(tempDir, '.pennyfarthing', 'workflows');
    mkdirSync(workflowsDir, { recursive: true });

    writeFileSync(join(workflowsDir, 'tdd.yaml'), `
workflow:
  name: tdd
  description: Test-driven development with code review
  phases:
    - name: setup
      agent: sm
    - name: red
      agent: tea
  triggers:
    types: [feature]
    default: true
`);

    writeFileSync(join(workflowsDir, 'trivial.yaml'), `
workflow:
  name: trivial
  description: Quick fixes
  phases:
    - name: setup
      agent: sm
    - name: implement
      agent: dev
  triggers:
    types: [chore, fix]
    points:
      max: 2
`);

    const { getAvailableWorkflows } = await import('@pennyfarthing/core/dist/server/story-parser.js');
    const workflows = getAvailableWorkflows(tempDir);

    expect(workflows).not.toBeNull();
    expect(workflows!.length).toBeGreaterThanOrEqual(2);

    const tdd = workflows!.find(w => w.name === 'tdd');
    expect(tdd).toBeDefined();
    expect(tdd!.type).toBe('phased');

    const trivial = workflows!.find(w => w.name === 'trivial');
    expect(trivial).toBeDefined();
    expect(trivial!.type).toBe('phased');
  });

  it('should discover stepped workflows from subdirectory workflow.yaml files', async () => {
    const workflowDir = join(tempDir, '.pennyfarthing', 'workflows', 'my-research');
    const stepsDir = join(workflowDir, 'steps');
    mkdirSync(stepsDir, { recursive: true });

    writeFileSync(join(workflowDir, 'workflow.yaml'), `
workflow:
  name: my-research
  description: Structured research process
  type: stepped
  agent: architect
  steps:
    path: ./steps/
    pattern: step-*.md
  triggers:
    types: [research]
    tags: [research, stepped]
`);
    writeFileSync(join(stepsDir, 'step-01-gather.md'), '# Step 1');
    writeFileSync(join(stepsDir, 'step-02-analyze.md'), '# Step 2');

    const { getAvailableWorkflows } = await import('@pennyfarthing/core/dist/server/story-parser.js');
    const workflows = getAvailableWorkflows(tempDir);

    const research = workflows!.find(w => w.name === 'my-research');
    expect(research).toBeDefined();
    expect(research!.type).toBe('stepped');
    expect(research!.description).toBe('Structured research process');
  });

  it('should include trigger metadata in workflow entries', async () => {
    const { getAvailableWorkflows } = await import('@pennyfarthing/core/dist/server/story-parser.js');
    const workflows = getAvailableWorkflows(tempDir);

    const tdd = workflows!.find(w => w.name === 'tdd');
    expect(tdd).toBeDefined();
    expect(tdd!.triggers).toBeDefined();
    expect(tdd!.triggers!.types).toContain('feature');
    expect(tdd!.triggers!.default).toBe(true);
  });

  it('should not include duplicate workflows from multiple search paths', async () => {
    // Create same workflow in both .pennyfarthing/workflows/ and pennyfarthing-dist/workflows/
    const distDir = join(tempDir, 'pennyfarthing-dist', 'workflows');
    mkdirSync(distDir, { recursive: true });

    writeFileSync(join(distDir, 'tdd.yaml'), `
workflow:
  name: tdd
  description: TDD from dist
  phases:
    - name: setup
      agent: sm
`);

    const { getAvailableWorkflows } = await import('@pennyfarthing/core/dist/server/story-parser.js');
    const workflows = getAvailableWorkflows(tempDir);

    // Should deduplicate by name — first found wins
    const tddWorkflows = workflows!.filter(w => w.name === 'tdd');
    expect(tddWorkflows.length).toBe(1);
  });

  it('should return empty array when no workflow directories exist', async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'pf-test-empty-'));
    try {
      const { getAvailableWorkflows } = await import('@pennyfarthing/core/dist/server/story-parser.js');
      const workflows = getAvailableWorkflows(emptyDir);

      expect(workflows).toEqual([]);
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it('should discover all real workflows from the project', async () => {
    // Test against actual workflow directory
    const realProjectDir = join(__dirname, '..', '..', '..');
    const { getAvailableWorkflows } = await import('@pennyfarthing/core/dist/server/story-parser.js');
    const workflows = getAvailableWorkflows(realProjectDir);

    expect(workflows).not.toBeNull();
    // Should find both flat and subdirectory workflows
    // We know there are at least: tdd, trivial, bdd, patch (flat) + architecture, epics-and-stories, etc. (subdir)
    expect(workflows!.length).toBeGreaterThanOrEqual(8);

    // Verify some known workflows exist
    const names = workflows!.map(w => w.name);
    expect(names).toContain('tdd');
    expect(names).toContain('trivial');
  });
});

// ============================================================================
// AC3: Each workflow entry shows name, type (stepped/phased), and description
// ============================================================================

describe('AC3: Each workflow entry shows name, type, and description', () => {
  it('should render workflow name for each entry', async () => {
    currentMockData = mockNoActiveWorkflow;
    const { WorkflowPanel } = await import('../src/public/components/panels/WorkflowPanel');
    render(<WorkflowPanel />);

    expect(screen.getByText('tdd')).toBeInTheDocument();
    expect(screen.getByText('trivial')).toBeInTheDocument();
    expect(screen.getByText('architecture')).toBeInTheDocument();
    expect(screen.getByText('research')).toBeInTheDocument();
  });

  it('should display type badge (phased/stepped) for each workflow', async () => {
    currentMockData = mockNoActiveWorkflow;
    const { WorkflowPanel } = await import('../src/public/components/panels/WorkflowPanel');
    const { container } = render(<WorkflowPanel />);

    // Should show type indicators for each workflow
    const typeIndicators = container.querySelectorAll('[data-workflow-entry-type]');
    expect(typeIndicators.length).toBe(4);

    // Check that types are correctly labeled
    const types = Array.from(typeIndicators).map(el => el.getAttribute('data-workflow-entry-type'));
    expect(types).toContain('phased');
    expect(types).toContain('stepped');
  });

  it('should show description text for each workflow', async () => {
    currentMockData = mockNoActiveWorkflow;
    const { WorkflowPanel } = await import('../src/public/components/panels/WorkflowPanel');
    render(<WorkflowPanel />);

    expect(screen.getByText('Test-driven development with code review')).toBeInTheDocument();
    expect(screen.getByText('Quick fixes without full TDD ceremony')).toBeInTheDocument();
    expect(screen.getByText('Collaborative architectural decision-making')).toBeInTheDocument();
    expect(screen.getByText('Structured research workflow')).toBeInTheDocument();
  });

  it('should render workflow entries as distinct list items', async () => {
    currentMockData = mockNoActiveWorkflow;
    const { WorkflowPanel } = await import('../src/public/components/panels/WorkflowPanel');
    const { container } = render(<WorkflowPanel />);

    // Each workflow should be a distinct entry element
    const entries = container.querySelectorAll('[data-testid="workflow-entry"]');
    expect(entries.length).toBe(4);
  });
});

// ============================================================================
// AC4: User can identify which workflows are startable from the panel
// ============================================================================

describe('AC4: User can identify startable workflows', () => {
  it('should visually distinguish phased vs stepped workflows', async () => {
    currentMockData = mockNoActiveWorkflow;
    const { WorkflowPanel } = await import('../src/public/components/panels/WorkflowPanel');
    const { container } = render(<WorkflowPanel />);

    // Phased workflows should have distinct styling from stepped
    const phasedEntries = container.querySelectorAll('[data-workflow-entry-type="phased"]');
    const steppedEntries = container.querySelectorAll('[data-workflow-entry-type="stepped"]');

    expect(phasedEntries.length).toBe(2); // tdd, trivial
    expect(steppedEntries.length).toBe(2); // architecture, research
  });

  it('should indicate how to start each workflow type', async () => {
    currentMockData = mockNoActiveWorkflow;
    const { WorkflowPanel } = await import('../src/public/components/panels/WorkflowPanel');
    render(<WorkflowPanel />);

    // Stepped workflows should indicate they can be started with /workflow start
    // Phased workflows are started via story assignment (SM)
    // There should be some indicator text
    const panel = screen.getByTestId('workflow-panel');
    expect(panel.textContent).toMatch(/phased|stepped/i);
  });

  it('should show workflow start commands for stepped workflows', async () => {
    currentMockData = {
      story: null,
      isLoading: false,
      error: null,
      availableWorkflows: [
        { name: 'architecture', type: 'stepped' as const, description: 'Architectural decisions' },
      ],
    };
    const { WorkflowPanel } = await import('../src/public/components/panels/WorkflowPanel');
    render(<WorkflowPanel />);

    // Stepped workflows should show the command to start them
    expect(screen.getByText(/\/workflow start/)).toBeInTheDocument();
  });
});

// ============================================================================
// AC5: List updates when project context changes
// ============================================================================

describe('AC5: List updates when project context changes', () => {
  it('should re-render when availableWorkflows data changes', async () => {
    // Start with one set of workflows
    currentMockData = {
      story: null,
      isLoading: false,
      error: null,
      availableWorkflows: [
        { name: 'tdd', type: 'phased' as const, description: 'TDD workflow' },
      ],
    };
    const { WorkflowPanel } = await import('../src/public/components/panels/WorkflowPanel');
    const { rerender } = render(<WorkflowPanel />);

    expect(screen.getByText('tdd')).toBeInTheDocument();
    expect(screen.queryByText('architecture')).not.toBeInTheDocument();

    // Update to include more workflows
    currentMockData = {
      story: null,
      isLoading: false,
      error: null,
      availableWorkflows: [
        { name: 'tdd', type: 'phased' as const, description: 'TDD workflow' },
        { name: 'architecture', type: 'stepped' as const, description: 'Architecture workflow' },
      ],
    };

    rerender(<WorkflowPanel />);
    expect(screen.getByText('architecture')).toBeInTheDocument();
  });

  it('should handle transition from loading to available workflows', async () => {
    currentMockData = mockLoading;
    const { WorkflowPanel } = await import('../src/public/components/panels/WorkflowPanel');
    const { rerender } = render(<WorkflowPanel />);

    // Loading state should show skeleton
    const panel = screen.getByTestId('workflow-panel');
    expect(panel.classList.contains('loading')).toBe(true);

    // Transition to loaded with available workflows
    currentMockData = mockNoActiveWorkflow;
    rerender(<WorkflowPanel />);

    expect(screen.getByText(/available workflows/i)).toBeInTheDocument();
  });

  it('should include availableWorkflows in the useStory hook return type', async () => {
    // This test validates the data contract between hook and component
    const { useStory } = await import('../src/public/hooks/useStory');
    const result = useStory();

    // The hook must return availableWorkflows (even if null initially)
    expect(result).toHaveProperty('availableWorkflows');
  });
});

// ============================================================================
// Backend: getAvailableWorkflows() function tests
// ============================================================================

describe('getAvailableWorkflows: Backend workflow enumeration', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'pf-test-enum-'));

    // Create a mix of flat and subdirectory workflows
    const workflowsDir = join(tempDir, '.pennyfarthing', 'workflows');
    mkdirSync(workflowsDir, { recursive: true });

    // Flat phased workflow
    writeFileSync(join(workflowsDir, 'tdd.yaml'), `
workflow:
  name: tdd
  description: Test-driven development with code review
  version: "1.0.0"
  phases:
    - name: setup
      agent: sm
    - name: red
      agent: tea
    - name: green
      agent: dev
    - name: review
      agent: reviewer
  triggers:
    types: [feature, enhancement]
    points:
      min: 3
    default: true
`);

    writeFileSync(join(workflowsDir, 'trivial.yaml'), `
workflow:
  name: trivial
  description: Quick fixes without full TDD ceremony
  phases:
    - name: setup
      agent: sm
    - name: implement
      agent: dev
  triggers:
    types: [chore, fix]
    points:
      max: 2
`);

    // Subdirectory stepped workflow
    const archDir = join(workflowsDir, 'architecture');
    const archSteps = join(archDir, 'steps');
    mkdirSync(archSteps, { recursive: true });

    writeFileSync(join(archDir, 'workflow.yaml'), `
workflow:
  name: architecture
  description: Collaborative architectural decision-making
  type: stepped
  agent: architect
  steps:
    path: ./steps/
    pattern: step-*.md
  triggers:
    types: [architecture, design]
    tags: [architecture, stepped]
`);
    writeFileSync(join(archSteps, 'step-01-gather.md'), '# Step 1');
    writeFileSync(join(archSteps, 'step-02-analyze.md'), '# Step 2');

    // Workflow with no description (edge case)
    writeFileSync(join(workflowsDir, 'minimal.yaml'), `
workflow:
  name: minimal
  phases:
    - name: do
      agent: dev
`);
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should return an array of AvailableWorkflow objects', async () => {
    const { getAvailableWorkflows } = await import('@pennyfarthing/core/dist/server/story-parser.js');
    const workflows = getAvailableWorkflows(tempDir);

    expect(Array.isArray(workflows)).toBe(true);
    expect(workflows!.length).toBeGreaterThanOrEqual(3);
  });

  it('should include name, type, and description for each workflow', async () => {
    const { getAvailableWorkflows } = await import('@pennyfarthing/core/dist/server/story-parser.js');
    const workflows = getAvailableWorkflows(tempDir);

    for (const wf of workflows!) {
      expect(wf).toHaveProperty('name');
      expect(wf).toHaveProperty('type');
      expect(wf).toHaveProperty('description');
      expect(typeof wf.name).toBe('string');
      expect(['phased', 'stepped']).toContain(wf.type);
      expect(typeof wf.description).toBe('string');
    }
  });

  it('should correctly identify phased vs stepped workflows', async () => {
    const { getAvailableWorkflows } = await import('@pennyfarthing/core/dist/server/story-parser.js');
    const workflows = getAvailableWorkflows(tempDir);

    const tdd = workflows!.find(w => w.name === 'tdd');
    expect(tdd!.type).toBe('phased');

    const arch = workflows!.find(w => w.name === 'architecture');
    expect(arch!.type).toBe('stepped');
  });

  it('should include trigger metadata when available', async () => {
    const { getAvailableWorkflows } = await import('@pennyfarthing/core/dist/server/story-parser.js');
    const workflows = getAvailableWorkflows(tempDir);

    const tdd = workflows!.find(w => w.name === 'tdd');
    expect(tdd!.triggers).toBeDefined();
    expect(tdd!.triggers!.types).toEqual(['feature', 'enhancement']);
    expect(tdd!.triggers!.points).toEqual({ min: 3 });
    expect(tdd!.triggers!.default).toBe(true);
  });

  it('should handle workflows without description gracefully', async () => {
    const { getAvailableWorkflows } = await import('@pennyfarthing/core/dist/server/story-parser.js');
    const workflows = getAvailableWorkflows(tempDir);

    const minimal = workflows!.find(w => w.name === 'minimal');
    expect(minimal).toBeDefined();
    expect(minimal!.description).toBe(''); // Empty string, not undefined
  });

  it('should handle malformed YAML files without crashing', async () => {
    const badDir = mkdtempSync(join(tmpdir(), 'pf-test-bad-'));
    const workflowsDir = join(badDir, '.pennyfarthing', 'workflows');
    mkdirSync(workflowsDir, { recursive: true });

    writeFileSync(join(workflowsDir, 'good.yaml'), `
workflow:
  name: good
  description: A good workflow
  phases:
    - name: do
      agent: dev
`);
    writeFileSync(join(workflowsDir, 'bad.yaml'), `
this is not valid yaml: [[[
`);

    try {
      const { getAvailableWorkflows } = await import('@pennyfarthing/core/dist/server/story-parser.js');
      const workflows = getAvailableWorkflows(badDir);

      // Should still return the good workflow, skipping the bad one
      expect(workflows!.length).toBeGreaterThanOrEqual(1);
      expect(workflows!.find(w => w.name === 'good')).toBeDefined();
    } finally {
      rmSync(badDir, { recursive: true, force: true });
    }
  });

  it('should search all three workflow directories', async () => {
    // Add workflow only in pennyfarthing-dist/workflows/
    const distDir = join(tempDir, 'pennyfarthing-dist', 'workflows');
    mkdirSync(distDir, { recursive: true });

    writeFileSync(join(distDir, 'dist-only-wf.yaml'), `
workflow:
  name: dist-only-wf
  description: Only in dist
  phases:
    - name: execute
      agent: dev
`);

    // Add workflow only in .claude/workflows/
    const claudeDir = join(tempDir, '.claude', 'workflows');
    mkdirSync(claudeDir, { recursive: true });

    writeFileSync(join(claudeDir, 'claude-only-wf.yaml'), `
workflow:
  name: claude-only-wf
  description: Only in claude dir
  phases:
    - name: execute
      agent: dev
`);

    const { getAvailableWorkflows } = await import('@pennyfarthing/core/dist/server/story-parser.js');
    const workflows = getAvailableWorkflows(tempDir);

    const names = workflows!.map(w => w.name);
    expect(names).toContain('dist-only-wf');
    expect(names).toContain('claude-only-wf');
  });
});

// ============================================================================
// WebSocket integration: StoryInfo includes availableWorkflows
// ============================================================================

describe('StoryInfo includes availableWorkflows field', () => {
  it('should have availableWorkflows in StoryInfo type', async () => {
    const { getStoryInfo } = await import('@pennyfarthing/core/dist/server/story-parser.js');
    const realProjectDir = join(__dirname, '..', '..', '..');
    const info = getStoryInfo(realProjectDir);

    // The StoryInfo object should now include availableWorkflows
    expect(info).toHaveProperty('availableWorkflows');
    expect(Array.isArray(info.availableWorkflows)).toBe(true);
  });

  it('should populate availableWorkflows with real workflow data', async () => {
    const { getStoryInfo } = await import('@pennyfarthing/core/dist/server/story-parser.js');
    const realProjectDir = join(__dirname, '..', '..', '..');
    const info = getStoryInfo(realProjectDir);

    // Should discover real workflows from the project
    expect(info.availableWorkflows!.length).toBeGreaterThanOrEqual(5);

    // Each entry should have the required fields
    for (const wf of info.availableWorkflows!) {
      expect(wf.name).toBeTruthy();
      expect(['phased', 'stepped']).toContain(wf.type);
    }
  });
});
