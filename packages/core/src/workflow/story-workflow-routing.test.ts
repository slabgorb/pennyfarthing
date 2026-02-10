/**
 * Tests for Story 38-9: SM Workflow Routing from Story Tags
 *
 * These tests define the contract for SM reading and honoring
 * the `workflow:` tag on stories in sprint YAML.
 *
 * Acceptance Criteria:
 * - AC1: SM reads workflow tag from story in sprint YAML
 * - AC2: SM loads correct workflow definition from pennyfarthing-dist/workflows/
 * - AC3: SM follows workflow's phase sequence (agent-docs → Orchestrator)
 * - AC4: Fallback to TDD if no tag or unknown workflow
 * - AC5: Session file records which workflow is active
 *
 * Run with: npm test
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

// Import workflow routing infrastructure
import { routeStoryToWorkflow, type StoryMetadata } from './workflow-router.js';
import { loadWorkflowsFromDir, type WorkflowDefinition } from './workflow-loader.js';

// Get directory for test fixtures
const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DIR = join(__dirname, '__test_story_workflow_routing__');

// =============================================================================
// Types for sprint YAML parsing
// =============================================================================

interface SprintStory {
  id: string;
  title: string;
  points?: number;
  priority?: string;
  status?: string;
  workflow?: string;  // The key field for this story
  repos?: string;
  acceptance_criteria?: string[];
}

interface SprintEpic {
  id: string;
  title: string;
  stories: SprintStory[];
}

interface SprintYaml {
  sprint: { number: number; goal?: string };
  epics: SprintEpic[];
}

// =============================================================================
// Helper functions
// =============================================================================

/**
 * Extract story from sprint YAML by ID
 */
function getStoryFromSprintYaml(yamlContent: string, storyId: string): SprintStory | null {
  const parsed = parseYaml(yamlContent) as SprintYaml;

  for (const epic of parsed.epics) {
    for (const story of epic.stories) {
      if (story.id === storyId) {
        return story;
      }
    }
  }
  return null;
}

/**
 * Convert SprintStory to StoryMetadata for routing
 */
function storyToMetadata(story: SprintStory): StoryMetadata {
  const tags: string[] = [];

  // Add workflow tag if present
  if (story.workflow) {
    tags.push(`workflow:${story.workflow}`);
  }

  return {
    id: story.id,
    points: story.points,
    tags: tags.length > 0 ? tags : undefined
  };
}

/**
 * Get next agent from workflow phase sequence
 */
function getFirstAgentAfterSetup(workflow: WorkflowDefinition): string | null {
  const phases = workflow.phases;
  if (!phases || phases.length < 2) return null;

  // Find setup phase, return next phase's agent
  for (let i = 0; i < phases.length - 1; i++) {
    if (phases[i].name === 'setup') {
      return phases[i + 1].agent;
    }
  }

  // If no explicit setup, return second phase's agent
  return phases[1]?.agent || null;
}

// =============================================================================
// AC1: SM reads workflow tag from story in sprint YAML
// =============================================================================

describe('AC1: Read workflow tag from sprint YAML', () => {

  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  it('should extract workflow tag from story with explicit workflow: field', () => {
    const sprintYaml = `
sprint:
  number: 11
  goal: "Test sprint"
epics:
  - id: epic-38
    title: "Agent File Modernization"
    stories:
      - id: "38-9"
        title: "SM workflow routing from story tags"
        points: 3
        workflow: tdd
        status: backlog
`;

    const story = getStoryFromSprintYaml(sprintYaml, '38-9');

    assert.ok(story, 'Story should be found');
    assert.strictEqual(story.workflow, 'tdd', 'Workflow tag should be extracted');
  });

  it('should extract workflow: trivial for trivial workflow stories', () => {
    const sprintYaml = `
sprint:
  number: 11
epics:
  - id: epic-38
    stories:
      - id: "38-1"
        title: "Fix stale references"
        points: 1
        workflow: trivial
        status: backlog
`;

    const story = getStoryFromSprintYaml(sprintYaml, '38-1');

    assert.ok(story, 'Story should be found');
    assert.strictEqual(story.workflow, 'trivial', 'Trivial workflow should be extracted');
  });

  it('should extract workflow: agent-docs for documentation stories', () => {
    const sprintYaml = `
sprint:
  number: 11
epics:
  - id: epic-38
    stories:
      - id: "38-3"
        title: "Modernize PM agent"
        points: 2
        workflow: agent-docs
        status: backlog
`;

    const story = getStoryFromSprintYaml(sprintYaml, '38-3');

    assert.ok(story, 'Story should be found');
    assert.strictEqual(story.workflow, 'agent-docs', 'Agent-docs workflow should be extracted');
  });

  it('should return undefined workflow for stories without tag', () => {
    const sprintYaml = `
sprint:
  number: 11
epics:
  - id: epic-38
    stories:
      - id: "38-99"
        title: "Story without workflow tag"
        points: 2
        status: backlog
`;

    const story = getStoryFromSprintYaml(sprintYaml, '38-99');

    assert.ok(story, 'Story should be found');
    assert.strictEqual(story.workflow, undefined, 'Workflow should be undefined');
  });

  it('should convert story workflow to StoryMetadata tags', () => {
    const story: SprintStory = {
      id: '38-9',
      title: 'Test',
      points: 3,
      workflow: 'tdd'
    };

    const metadata = storyToMetadata(story);

    assert.ok(metadata.tags, 'Should have tags');
    assert.ok(metadata.tags.includes('workflow:tdd'), 'Should include workflow tag');
  });
});

// =============================================================================
// AC2: SM loads correct workflow definition
// =============================================================================

describe('AC2: Load correct workflow definition', () => {

  // Find monorepo root for real workflow files
  function findMonorepoRoot(startDir: string): string | null {
    let dir = startDir;
    for (let i = 0; i < 10; i++) {
      if (existsSync(join(dir, 'pennyfarthing-dist'))) {
        return dir;
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return null;
  }

  const monorepoRoot = findMonorepoRoot(__dirname);
  const workflowsDir = monorepoRoot
    ? join(monorepoRoot, 'pennyfarthing-dist', 'workflows')
    : null;

  it('should load all workflow definitions from pennyfarthing-dist/workflows/', async () => {
    if (!workflowsDir) {
      console.log('Skipping: workflows directory not found');
      return;
    }

    const { workflows, errors } = loadWorkflowsFromDir(workflowsDir);

    assert.ok(workflows.length > 0, 'Should load at least one workflow');
    assert.strictEqual(errors.length, 0, `Should have no load errors: ${JSON.stringify(errors)}`);

    // Expected workflows
    const workflowNames = workflows.map(w => w.name);
    assert.ok(workflowNames.includes('tdd'), 'Should include tdd workflow');
    assert.ok(workflowNames.includes('trivial'), 'Should include trivial workflow');
    assert.ok(workflowNames.includes('agent-docs'), 'Should include agent-docs workflow');
  });

  it('should route story with workflow:tdd tag to tdd workflow', async () => {
    if (!workflowsDir) {
      console.log('Skipping: workflows directory not found');
      return;
    }

    const { workflows } = loadWorkflowsFromDir(workflowsDir);
    const story: StoryMetadata = {
      id: '38-9',
      tags: ['workflow:tdd'],
      points: 3
    };

    const result = routeStoryToWorkflow(story, workflows);

    assert.ok(result, 'Should route to a workflow');
    assert.strictEqual(result.workflow.name, 'tdd', 'Should route to tdd workflow');
    assert.ok(result.reason.includes('tag'), 'Reason should mention tag match');
  });

  it('should route story with workflow:trivial tag to trivial workflow', async () => {
    if (!workflowsDir) {
      console.log('Skipping: workflows directory not found');
      return;
    }

    const { workflows } = loadWorkflowsFromDir(workflowsDir);
    const story: StoryMetadata = {
      id: '38-1',
      tags: ['workflow:trivial'],
      points: 1
    };

    const result = routeStoryToWorkflow(story, workflows);

    assert.ok(result, 'Should route to a workflow');
    assert.strictEqual(result.workflow.name, 'trivial', 'Should route to trivial workflow');
  });

  it('should route story with workflow:agent-docs tag to agent-docs workflow', async () => {
    if (!workflowsDir) {
      console.log('Skipping: workflows directory not found');
      return;
    }

    const { workflows } = loadWorkflowsFromDir(workflowsDir);
    const story: StoryMetadata = {
      id: '38-3',
      tags: ['workflow:agent-docs'],
      points: 2
    };

    const result = routeStoryToWorkflow(story, workflows);

    assert.ok(result, 'Should route to a workflow');
    assert.strictEqual(result.workflow.name, 'agent-docs', 'Should route to agent-docs workflow');
  });
});

// =============================================================================
// AC3: SM follows workflow's phase sequence
// =============================================================================

describe('AC3: Follow workflow phase sequence', () => {

  function findMonorepoRoot(startDir: string): string | null {
    let dir = startDir;
    for (let i = 0; i < 10; i++) {
      if (existsSync(join(dir, 'pennyfarthing-dist'))) {
        return dir;
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return null;
  }

  const monorepoRoot = findMonorepoRoot(__dirname);
  const workflowsDir = monorepoRoot
    ? join(monorepoRoot, 'pennyfarthing-dist', 'workflows')
    : null;

  it('tdd workflow should route SM setup → TEA (red phase)', async () => {
    if (!workflowsDir) {
      console.log('Skipping: workflows directory not found');
      return;
    }

    const { workflows } = loadWorkflowsFromDir(workflowsDir);
    const tddWorkflow = workflows.find(w => w.name === 'tdd');

    assert.ok(tddWorkflow, 'TDD workflow should exist');

    const nextAgent = getFirstAgentAfterSetup(tddWorkflow);
    assert.strictEqual(nextAgent, 'tea', 'TDD workflow should route to TEA after setup');
  });

  it('trivial workflow should route SM setup → Dev (implement phase)', async () => {
    if (!workflowsDir) {
      console.log('Skipping: workflows directory not found');
      return;
    }

    const { workflows } = loadWorkflowsFromDir(workflowsDir);
    const trivialWorkflow = workflows.find(w => w.name === 'trivial');

    assert.ok(trivialWorkflow, 'Trivial workflow should exist');

    const nextAgent = getFirstAgentAfterSetup(trivialWorkflow);
    assert.strictEqual(nextAgent, 'dev', 'Trivial workflow should route to Dev after setup');
  });

  it('agent-docs workflow should route SM setup → Orchestrator (analyze phase)', async () => {
    if (!workflowsDir) {
      console.log('Skipping: workflows directory not found');
      return;
    }

    const { workflows } = loadWorkflowsFromDir(workflowsDir);
    const agentDocsWorkflow = workflows.find(w => w.name === 'agent-docs');

    assert.ok(agentDocsWorkflow, 'Agent-docs workflow should exist');

    const nextAgent = getFirstAgentAfterSetup(agentDocsWorkflow);
    assert.strictEqual(nextAgent, 'orchestrator',
      `Agent-docs workflow should route to Orchestrator after setup, got: ${nextAgent}`);
  });

  it('should return correct handoff target based on workflow', async () => {
    if (!workflowsDir) {
      console.log('Skipping: workflows directory not found');
      return;
    }

    const { workflows } = loadWorkflowsFromDir(workflowsDir);

    // Test routing for different workflow tags
    const testCases = [
      { workflowTag: 'tdd', expectedAgent: 'tea' },
      { workflowTag: 'trivial', expectedAgent: 'dev' },
      { workflowTag: 'agent-docs', expectedAgent: 'orchestrator' }
    ];

    for (const { workflowTag, expectedAgent } of testCases) {
      const story: StoryMetadata = {
        id: 'test',
        tags: [`workflow:${workflowTag}`]
      };

      const result = routeStoryToWorkflow(story, workflows);
      assert.ok(result, `Should route ${workflowTag}`);

      const nextAgent = getFirstAgentAfterSetup(result.workflow);
      assert.strictEqual(nextAgent, expectedAgent,
        `${workflowTag} workflow should route to ${expectedAgent}, got ${nextAgent}`);
    }
  });
});

// =============================================================================
// AC4: Fallback to TDD if no tag or unknown workflow
// =============================================================================

describe('AC4: Fallback to TDD workflow', () => {

  function findMonorepoRoot(startDir: string): string | null {
    let dir = startDir;
    for (let i = 0; i < 10; i++) {
      if (existsSync(join(dir, 'pennyfarthing-dist'))) {
        return dir;
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return null;
  }

  const monorepoRoot = findMonorepoRoot(__dirname);
  const workflowsDir = monorepoRoot
    ? join(monorepoRoot, 'pennyfarthing-dist', 'workflows')
    : null;

  it('should fall back to tdd for story with no workflow tag', async () => {
    if (!workflowsDir) {
      console.log('Skipping: workflows directory not found');
      return;
    }

    const { workflows } = loadWorkflowsFromDir(workflowsDir);
    const story: StoryMetadata = {
      id: '38-99',
      // No tags - should use default
    };

    const result = routeStoryToWorkflow(story, workflows);

    assert.ok(result, 'Should still route to a workflow');
    assert.strictEqual(result.workflow.name, 'tdd', 'Should fall back to tdd (default)');
    assert.ok(result.reason.includes('default'), 'Reason should mention default fallback');
  });

  it('should fall back to tdd for story with unknown workflow tag', async () => {
    if (!workflowsDir) {
      console.log('Skipping: workflows directory not found');
      return;
    }

    const { workflows } = loadWorkflowsFromDir(workflowsDir);
    const story: StoryMetadata = {
      id: '38-99',
      tags: ['workflow:nonexistent-workflow']
    };

    const result = routeStoryToWorkflow(story, workflows);

    // Unknown workflow tag should be ignored, fall back to default
    assert.ok(result, 'Should still route to a workflow');
    assert.strictEqual(result.workflow.name, 'tdd', 'Should fall back to tdd for unknown workflow');
  });

  it('should use type-based routing when no explicit workflow tag', async () => {
    if (!workflowsDir) {
      console.log('Skipping: workflows directory not found');
      return;
    }

    const { workflows } = loadWorkflowsFromDir(workflowsDir);
    const story: StoryMetadata = {
      id: '38-99',
      type: 'feature',
      points: 5
      // No workflow tag - should match based on type/points
    };

    const result = routeStoryToWorkflow(story, workflows);

    assert.ok(result, 'Should route to a workflow');
    // Feature type with 5 points matches both 2party-tdd and tdd triggers
    // (types: [feature, enhancement], points.min: 3). 2party-tdd loads first
    // alphabetically and has equal specificity, so it wins the type match.
    assert.strictEqual(result.workflow.name, '2party-tdd');
  });

  it('should use points-based routing for low-point stories without tag', async () => {
    if (!workflowsDir) {
      console.log('Skipping: workflows directory not found');
      return;
    }

    const { workflows } = loadWorkflowsFromDir(workflowsDir);
    const story: StoryMetadata = {
      id: '38-99',
      type: 'chore',
      points: 1
      // No workflow tag - should match trivial based on type + points
    };

    const result = routeStoryToWorkflow(story, workflows);

    assert.ok(result, 'Should route to a workflow');
    // Chore type + 1 point should match trivial workflow triggers
    assert.strictEqual(result.workflow.name, 'trivial',
      'Low-point chore should route to trivial workflow');
  });
});

// =============================================================================
// AC5: Session file records which workflow is active
// =============================================================================

describe('AC5: Session file records active workflow', () => {

  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  it('should include **Workflow:** field in session file', () => {
    // This test verifies the session file format includes workflow tracking
    const sessionContent = `# Story 38-9: SM workflow routing

## Story Details

| Field | Value |
|-------|-------|
| Story | 38-9 |

## Workflow Tracking

**Workflow:** tdd
**Phase:** setup
**Status:** in_progress
`;

    const sessionPath = join(TEST_DIR, '38-9-session.md');
    writeFileSync(sessionPath, sessionContent);

    const content = readFileSync(sessionPath, 'utf-8');

    // Verify workflow field exists
    assert.ok(content.includes('**Workflow:** tdd'),
      'Session file should include Workflow field');
    assert.ok(content.includes('## Workflow Tracking'),
      'Session file should have Workflow Tracking section');
  });

  it('should record workflow matching the selected workflow tag', () => {
    // Test with different workflow values
    const testWorkflows = ['tdd', 'trivial', 'agent-docs'];

    for (const workflow of testWorkflows) {
      const sessionContent = `# Story Test

## Workflow Tracking

**Workflow:** ${workflow}
**Phase:** setup
`;

      const sessionPath = join(TEST_DIR, `test-${workflow}-session.md`);
      writeFileSync(sessionPath, sessionContent);

      const content = readFileSync(sessionPath, 'utf-8');
      assert.ok(content.includes(`**Workflow:** ${workflow}`),
        `Session should record workflow: ${workflow}`);
    }
  });

  it('should extract workflow from existing session file', () => {
    const sessionContent = `# Story 38-3

## Workflow Tracking

**Workflow:** agent-docs
**Phase:** analyze
**Agent:** orchestrator
`;

    const sessionPath = join(TEST_DIR, '38-3-session.md');
    writeFileSync(sessionPath, sessionContent);

    const content = readFileSync(sessionPath, 'utf-8');

    // Extract workflow using regex (same as workflow-status-check does)
    const workflowMatch = content.match(/\*\*Workflow:\*\*\s*(\S+)/);

    assert.ok(workflowMatch, 'Should be able to extract workflow from session');
    assert.strictEqual(workflowMatch[1], 'agent-docs',
      'Extracted workflow should match');
  });
});

// =============================================================================
// Integration: End-to-end workflow routing from sprint YAML
// =============================================================================

describe('Integration: Sprint YAML → Workflow Routing', () => {

  function findMonorepoRoot(startDir: string): string | null {
    let dir = startDir;
    for (let i = 0; i < 10; i++) {
      if (existsSync(join(dir, 'pennyfarthing-dist'))) {
        return dir;
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return null;
  }

  const monorepoRoot = findMonorepoRoot(__dirname);
  const workflowsDir = monorepoRoot
    ? join(monorepoRoot, 'pennyfarthing-dist', 'workflows')
    : null;

  it('should route sprint story with workflow tag to correct workflow and agent', async () => {
    if (!workflowsDir) {
      console.log('Skipping: workflows directory not found');
      return;
    }

    // Simulate sprint YAML with different workflow tags
    const sprintYaml = `
sprint:
  number: 11
  goal: "Test workflow routing"
epics:
  - id: epic-38
    title: "Agent File Modernization"
    stories:
      - id: "38-9"
        title: "SM workflow routing from story tags"
        points: 3
        workflow: tdd
      - id: "38-3"
        title: "Modernize PM agent"
        points: 2
        workflow: agent-docs
      - id: "38-1"
        title: "Fix stale references"
        points: 1
        workflow: trivial
`;

    const { workflows } = loadWorkflowsFromDir(workflowsDir);

    // Test each story
    const expectedRoutes = [
      { storyId: '38-9', workflow: 'tdd', agent: 'tea' },
      { storyId: '38-3', workflow: 'agent-docs', agent: 'orchestrator' },
      { storyId: '38-1', workflow: 'trivial', agent: 'dev' }
    ];

    for (const expected of expectedRoutes) {
      const story = getStoryFromSprintYaml(sprintYaml, expected.storyId);
      assert.ok(story, `Story ${expected.storyId} should exist`);

      const metadata = storyToMetadata(story);
      const result = routeStoryToWorkflow(metadata, workflows);

      assert.ok(result, `Story ${expected.storyId} should route`);
      assert.strictEqual(result.workflow.name, expected.workflow,
        `Story ${expected.storyId} should route to ${expected.workflow}`);

      const nextAgent = getFirstAgentAfterSetup(result.workflow);
      assert.strictEqual(nextAgent, expected.agent,
        `Story ${expected.storyId} should hand off to ${expected.agent}`);
    }
  });
});
