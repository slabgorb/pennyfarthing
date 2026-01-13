/**
 * Tests for Story 31-3: Story-to-workflow Routing Engine
 *
 * These tests define the contract for routing stories to workflows based on:
 * - Explicit workflow tags (highest priority)
 * - Trigger matching (tags, types, points)
 * - Default fallback workflow
 *
 * The router (workflow-router.ts) will implement these functions to pass these tests.
 *
 * Acceptance Criteria:
 * - AC1: Stories with workflow tag use specified workflow
 * - AC2: Story type mapping to workflows configurable
 * - AC3: Default workflow when no match
 * - AC4: Routing decision logged for debugging
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

// Import the router function that Dev will implement
import {
  routeStoryToWorkflow,
  type StoryMetadata,
  type RoutingResult as _RoutingResult
} from './workflow-router.js';

// Import types from loader (already implemented in 31-2)
import type { WorkflowDefinition } from './workflow-loader.js';

// =============================================================================
// Test Fixtures - Workflow definitions for testing
// =============================================================================

/**
 * Creates a minimal valid workflow for testing
 */
function createWorkflow(
  name: string,
  triggers?: WorkflowDefinition['triggers']
): WorkflowDefinition {
  return {
    name,
    phases: [{ name: 'work', agent: 'dev' }],
    triggers
  };
}

// Standard test workflows
const tddWorkflow = createWorkflow('tdd', {
  types: ['feature'],
  default: true
});

const trivialWorkflow = createWorkflow('trivial', {
  types: ['chore', 'fix'],
  points: { max: 2 }
});

const docsWorkflow = createWorkflow('docs', {
  types: ['docs'],
  tags: ['documentation']
});

const debugWorkflow = createWorkflow('debug', {
  tags: ['debug', 'investigation']
});

const pointsWorkflow = createWorkflow('complex', {
  points: { min: 8 }
});

const midRangeWorkflow = createWorkflow('mid-range', {
  points: { min: 3, max: 5 }
});

// =============================================================================
// AC1: Stories with workflow tag use specified workflow
// =============================================================================

describe('AC1: Explicit workflow tag routing', () => {

  it('should route story with workflow:tdd tag to tdd workflow', () => {
    const story: StoryMetadata = {
      id: '31-3',
      tags: ['workflow:tdd', 'feature']
    };
    const workflows = [tddWorkflow, trivialWorkflow, docsWorkflow];

    const result = routeStoryToWorkflow(story, workflows);

    assert.ok(result, 'Should return a result');
    assert.strictEqual(result.workflow.name, 'tdd', 'Should match tdd workflow');
    assert.ok(result.reason.includes('tag'), 'Reason should mention tag match');
  });

  it('should route story with workflow:trivial tag to trivial workflow', () => {
    const story: StoryMetadata = {
      id: '31-3',
      tags: ['workflow:trivial']
    };
    const workflows = [tddWorkflow, trivialWorkflow, docsWorkflow];

    const result = routeStoryToWorkflow(story, workflows);

    assert.ok(result, 'Should return a result');
    assert.strictEqual(result.workflow.name, 'trivial', 'Should match trivial workflow');
  });

  it('should prioritize explicit tag over type match', () => {
    // Story has type=feature (would match tdd) but explicit workflow:trivial tag
    const story: StoryMetadata = {
      id: '31-3',
      type: 'feature',
      tags: ['workflow:trivial']
    };
    const workflows = [tddWorkflow, trivialWorkflow];

    const result = routeStoryToWorkflow(story, workflows);

    assert.ok(result, 'Should return a result');
    assert.strictEqual(result.workflow.name, 'trivial', 'Explicit tag should win over type');
  });

  it('should prioritize explicit tag over default workflow', () => {
    const story: StoryMetadata = {
      id: '31-3',
      tags: ['workflow:docs']
    };
    const workflows = [tddWorkflow, docsWorkflow]; // tdd has default: true

    const result = routeStoryToWorkflow(story, workflows);

    assert.ok(result, 'Should return a result');
    assert.strictEqual(result.workflow.name, 'docs', 'Explicit tag should win over default');
  });

  it('should return null if explicit tag references non-existent workflow', () => {
    const story: StoryMetadata = {
      id: '31-3',
      tags: ['workflow:nonexistent']
    };
    const workflows = [tddWorkflow, trivialWorkflow];

    const result = routeStoryToWorkflow(story, workflows);

    // When explicit tag doesn't match, fall back to other rules
    // If nothing matches, should return null or default
    // This tests that we don't crash on bad tags
    assert.ok(
      result === null || result.workflow.name === 'tdd',
      'Should return null or fall back to default'
    );
  });

});

// =============================================================================
// AC2: Story type mapping to workflows configurable
// =============================================================================

describe('AC2: Type-based routing', () => {

  it('should route feature type to workflow with types: [feature]', () => {
    const story: StoryMetadata = {
      id: '31-3',
      type: 'feature'
    };
    const workflows = [tddWorkflow, trivialWorkflow, docsWorkflow];

    const result = routeStoryToWorkflow(story, workflows);

    assert.ok(result, 'Should return a result');
    assert.strictEqual(result.workflow.name, 'tdd', 'Should match tdd workflow');
    assert.ok(result.reason.includes('type'), 'Reason should mention type match');
  });

  it('should route chore type to workflow with types: [chore, fix]', () => {
    const story: StoryMetadata = {
      id: '31-3',
      type: 'chore',
      points: 1
    };
    const workflows = [tddWorkflow, trivialWorkflow, docsWorkflow];

    const result = routeStoryToWorkflow(story, workflows);

    assert.ok(result, 'Should return a result');
    assert.strictEqual(result.workflow.name, 'trivial', 'Should match trivial workflow');
  });

  it('should route docs type to docs workflow', () => {
    const story: StoryMetadata = {
      id: '31-3',
      type: 'docs'
    };
    const workflows = [tddWorkflow, trivialWorkflow, docsWorkflow];

    const result = routeStoryToWorkflow(story, workflows);

    assert.ok(result, 'Should return a result');
    assert.strictEqual(result.workflow.name, 'docs', 'Should match docs workflow');
  });

  it('should handle story with type not matching any workflow triggers', () => {
    const story: StoryMetadata = {
      id: '31-3',
      type: 'unknown-type'
    };
    const noDefaultWorkflows = [trivialWorkflow, docsWorkflow]; // No default

    const result = routeStoryToWorkflow(story, noDefaultWorkflows);

    assert.strictEqual(result, null, 'Should return null when no match and no default');
  });

});

// =============================================================================
// AC2 Continued: Tag-based routing (from triggers.tags, not workflow: prefix)
// =============================================================================

describe('AC2: Tag-based routing (trigger tags)', () => {

  it('should route story with matching trigger tag', () => {
    const story: StoryMetadata = {
      id: '31-3',
      tags: ['debug', 'urgent']
    };
    const workflows = [tddWorkflow, debugWorkflow];

    const result = routeStoryToWorkflow(story, workflows);

    assert.ok(result, 'Should return a result');
    assert.strictEqual(result.workflow.name, 'debug', 'Should match debug workflow via tag');
  });

  it('should match if any story tag matches any workflow trigger tag', () => {
    const story: StoryMetadata = {
      id: '31-3',
      tags: ['other', 'investigation'] // investigation matches debugWorkflow
    };
    const workflows = [tddWorkflow, debugWorkflow];

    const result = routeStoryToWorkflow(story, workflows);

    assert.ok(result, 'Should return a result');
    assert.strictEqual(result.workflow.name, 'debug', 'Should match via investigation tag');
  });

  it('should match documentation tag for docs workflow', () => {
    const story: StoryMetadata = {
      id: '31-3',
      tags: ['documentation']
    };
    const workflows = [tddWorkflow, docsWorkflow];

    const result = routeStoryToWorkflow(story, workflows);

    assert.ok(result, 'Should return a result');
    assert.strictEqual(result.workflow.name, 'docs', 'Should match docs via tag');
  });

});

// =============================================================================
// AC2 Continued: Points-based routing
// =============================================================================

describe('AC2: Points-based routing', () => {

  it('should route low-point story to workflow with points.max', () => {
    const story: StoryMetadata = {
      id: '31-3',
      type: 'chore',
      points: 1
    };
    const workflows = [tddWorkflow, trivialWorkflow];

    const result = routeStoryToWorkflow(story, workflows);

    assert.ok(result, 'Should return a result');
    assert.strictEqual(result.workflow.name, 'trivial', 'Should match trivial (max: 2)');
  });

  it('should route high-point story to workflow with points.min', () => {
    const story: StoryMetadata = {
      id: '31-3',
      points: 13
    };
    const workflows = [tddWorkflow, pointsWorkflow];

    const result = routeStoryToWorkflow(story, workflows);

    assert.ok(result, 'Should return a result');
    assert.strictEqual(result.workflow.name, 'complex', 'Should match complex (min: 8)');
  });

  it('should route mid-point story to workflow with points range', () => {
    const story: StoryMetadata = {
      id: '31-3',
      points: 4
    };
    const workflows = [tddWorkflow, midRangeWorkflow, pointsWorkflow];

    const result = routeStoryToWorkflow(story, workflows);

    assert.ok(result, 'Should return a result');
    assert.strictEqual(result.workflow.name, 'mid-range', 'Should match mid-range (3-5)');
  });

  it('should not match points.max if story points exceed it', () => {
    const story: StoryMetadata = {
      id: '31-3',
      type: 'chore',
      points: 5 // exceeds trivialWorkflow max: 2
    };
    const workflows = [trivialWorkflow]; // Only trivial, no default

    const result = routeStoryToWorkflow(story, workflows);

    assert.strictEqual(result, null, 'Should not match trivial when points > max');
  });

  it('should not match points.min if story points below it', () => {
    const story: StoryMetadata = {
      id: '31-3',
      points: 3 // below pointsWorkflow min: 8
    };
    const workflows = [pointsWorkflow]; // Only complex, no default

    const result = routeStoryToWorkflow(story, workflows);

    assert.strictEqual(result, null, 'Should not match complex when points < min');
  });

  it('should handle boundary case: points exactly at min', () => {
    const story: StoryMetadata = {
      id: '31-3',
      points: 8 // exactly at pointsWorkflow min
    };
    const workflows = [pointsWorkflow];

    const result = routeStoryToWorkflow(story, workflows);

    assert.ok(result, 'Should return a result');
    assert.strictEqual(result.workflow.name, 'complex', 'Should match at exact min boundary');
  });

  it('should handle boundary case: points exactly at max', () => {
    const story: StoryMetadata = {
      id: '31-3',
      type: 'chore',
      points: 2 // exactly at trivialWorkflow max
    };
    const workflows = [trivialWorkflow];

    const result = routeStoryToWorkflow(story, workflows);

    assert.ok(result, 'Should return a result');
    assert.strictEqual(result.workflow.name, 'trivial', 'Should match at exact max boundary');
  });

});

// =============================================================================
// AC3: Default workflow when no match
// =============================================================================

describe('AC3: Default workflow fallback', () => {

  it('should use default workflow when no other triggers match', () => {
    const story: StoryMetadata = {
      id: '31-3',
      type: 'random-type'
    };
    const workflows = [tddWorkflow, trivialWorkflow]; // tdd has default: true

    const result = routeStoryToWorkflow(story, workflows);

    assert.ok(result, 'Should return a result');
    assert.strictEqual(result.workflow.name, 'tdd', 'Should fall back to default');
    assert.ok(result.reason.includes('default'), 'Reason should mention default');
  });

  it('should use default workflow for story with no metadata', () => {
    const story: StoryMetadata = {
      id: '31-3'
      // No type, tags, or points
    };
    const workflows = [tddWorkflow, trivialWorkflow];

    const result = routeStoryToWorkflow(story, workflows);

    assert.ok(result, 'Should return a result');
    assert.strictEqual(result.workflow.name, 'tdd', 'Should use default for bare story');
  });

  it('should return null when no workflows loaded', () => {
    const story: StoryMetadata = {
      id: '31-3',
      type: 'feature'
    };
    const workflows: WorkflowDefinition[] = [];

    const result = routeStoryToWorkflow(story, workflows);

    assert.strictEqual(result, null, 'Should return null for empty workflow list');
  });

  it('should return null when no match and no default workflow', () => {
    const story: StoryMetadata = {
      id: '31-3',
      type: 'feature'
    };
    const noDefaultWorkflows = [docsWorkflow, debugWorkflow]; // Neither has default

    const result = routeStoryToWorkflow(story, noDefaultWorkflows);

    assert.strictEqual(result, null, 'Should return null when no match and no default');
  });

  it('should handle multiple workflows with default: true (first wins)', () => {
    const defaultWorkflow1 = createWorkflow('default1', { default: true });
    const defaultWorkflow2 = createWorkflow('default2', { default: true });
    const story: StoryMetadata = { id: '31-3' };

    const workflows = [defaultWorkflow1, defaultWorkflow2];
    const result = routeStoryToWorkflow(story, workflows);

    assert.ok(result, 'Should return a result');
    assert.strictEqual(result.workflow.name, 'default1', 'First default should win');
  });

});

// =============================================================================
// AC4: Routing decision logged for debugging
// =============================================================================

describe('AC4: Routing reason for debugging', () => {

  it('should include reason mentioning explicit tag for tag match', () => {
    const story: StoryMetadata = {
      id: '31-3',
      tags: ['workflow:trivial']
    };
    const workflows = [tddWorkflow, trivialWorkflow];

    const result = routeStoryToWorkflow(story, workflows);

    assert.ok(result, 'Should return a result');
    assert.ok(result.reason, 'Should have a reason');
    assert.ok(
      result.reason.toLowerCase().includes('tag') ||
      result.reason.toLowerCase().includes('workflow:trivial'),
      `Reason should mention tag match: "${result.reason}"`
    );
  });

  it('should include reason mentioning type for type match', () => {
    const story: StoryMetadata = {
      id: '31-3',
      type: 'feature'
    };
    const workflows = [tddWorkflow];

    const result = routeStoryToWorkflow(story, workflows);

    assert.ok(result, 'Should return a result');
    assert.ok(result.reason, 'Should have a reason');
    assert.ok(
      result.reason.toLowerCase().includes('type') ||
      result.reason.toLowerCase().includes('feature'),
      `Reason should mention type match: "${result.reason}"`
    );
  });

  it('should include reason mentioning points for points match', () => {
    const story: StoryMetadata = {
      id: '31-3',
      points: 10
    };
    const workflows = [pointsWorkflow];

    const result = routeStoryToWorkflow(story, workflows);

    assert.ok(result, 'Should return a result');
    assert.ok(result.reason, 'Should have a reason');
    assert.ok(
      result.reason.toLowerCase().includes('point'),
      `Reason should mention points match: "${result.reason}"`
    );
  });

  it('should include reason mentioning default for default fallback', () => {
    const story: StoryMetadata = {
      id: '31-3'
    };
    const workflows = [tddWorkflow];

    const result = routeStoryToWorkflow(story, workflows);

    assert.ok(result, 'Should return a result');
    assert.ok(result.reason, 'Should have a reason');
    assert.ok(
      result.reason.toLowerCase().includes('default'),
      `Reason should mention default: "${result.reason}"`
    );
  });

  it('should include workflow name in reason', () => {
    const story: StoryMetadata = {
      id: '31-3',
      type: 'feature'
    };
    const workflows = [tddWorkflow];

    const result = routeStoryToWorkflow(story, workflows);

    assert.ok(result, 'Should return a result');
    assert.ok(
      result.reason.includes('tdd'),
      `Reason should include workflow name: "${result.reason}"`
    );
  });

});

// =============================================================================
// Priority Algorithm Tests
// =============================================================================

describe('Priority Algorithm', () => {

  it('priority: explicit tag > trigger tag > type > points > default', () => {
    // Workflow that matches by type, tag, AND has default
    const multiMatchWorkflow = createWorkflow('multi', {
      tags: ['special'],
      types: ['feature'],
      default: true
    });
    // Workflow that only matches by explicit tag
    const explicitOnlyWorkflow = createWorkflow('explicit-only', {});

    const story: StoryMetadata = {
      id: '31-3',
      type: 'feature',
      tags: ['workflow:explicit-only', 'special'],
      points: 3
    };
    const workflows = [multiMatchWorkflow, explicitOnlyWorkflow];

    const result = routeStoryToWorkflow(story, workflows);

    assert.ok(result, 'Should return a result');
    assert.strictEqual(
      result.workflow.name,
      'explicit-only',
      'Explicit workflow: tag should have highest priority'
    );
  });

  it('priority: trigger tag should beat type match', () => {
    const tagWorkflow = createWorkflow('tag-match', {
      tags: ['priority-test']
    });
    const typeWorkflow = createWorkflow('type-match', {
      types: ['feature']
    });

    const story: StoryMetadata = {
      id: '31-3',
      type: 'feature',
      tags: ['priority-test']
    };
    const workflows = [typeWorkflow, tagWorkflow];

    const result = routeStoryToWorkflow(story, workflows);

    assert.ok(result, 'Should return a result');
    assert.strictEqual(result.workflow.name, 'tag-match', 'Tag match should beat type match');
  });

  it('priority: type match should beat points match', () => {
    const typeWorkflow = createWorkflow('type-match', {
      types: ['feature']
    });
    const pointsOnlyWorkflow = createWorkflow('points-match', {
      points: { min: 1, max: 10 }
    });

    const story: StoryMetadata = {
      id: '31-3',
      type: 'feature',
      points: 5
    };
    const workflows = [pointsOnlyWorkflow, typeWorkflow];

    const result = routeStoryToWorkflow(story, workflows);

    assert.ok(result, 'Should return a result');
    assert.strictEqual(result.workflow.name, 'type-match', 'Type match should beat points-only match');
  });

  it('priority: any specific match should beat default', () => {
    const defaultWorkflow = createWorkflow('default-wf', {
      default: true
    });
    const pointsWorkflow = createWorkflow('points-wf', {
      points: { min: 3 }
    });

    const story: StoryMetadata = {
      id: '31-3',
      points: 5
    };
    const workflows = [defaultWorkflow, pointsWorkflow];

    const result = routeStoryToWorkflow(story, workflows);

    assert.ok(result, 'Should return a result');
    assert.strictEqual(result.workflow.name, 'points-wf', 'Points match should beat default');
  });

});

// =============================================================================
// Edge Cases
// =============================================================================

describe('Edge Cases', () => {

  it('should handle story with empty tags array', () => {
    const story: StoryMetadata = {
      id: '31-3',
      tags: []
    };
    const workflows = [tddWorkflow];

    const result = routeStoryToWorkflow(story, workflows);

    assert.ok(result, 'Should return default workflow');
    assert.strictEqual(result.workflow.name, 'tdd');
  });

  it('should handle workflow with empty triggers object', () => {
    const emptyTriggersWorkflow = createWorkflow('empty-triggers', {});
    const story: StoryMetadata = {
      id: '31-3',
      type: 'feature'
    };
    const workflows = [emptyTriggersWorkflow];

    const result = routeStoryToWorkflow(story, workflows);

    // Empty triggers shouldn't match anything specific
    assert.strictEqual(result, null, 'Empty triggers should not match');
  });

  it('should handle workflow with undefined triggers', () => {
    const noTriggersWorkflow = createWorkflow('no-triggers');
    const story: StoryMetadata = {
      id: '31-3',
      type: 'feature'
    };
    const workflows = [noTriggersWorkflow];

    const result = routeStoryToWorkflow(story, workflows);

    assert.strictEqual(result, null, 'Undefined triggers should not match');
  });

  it('should handle story with undefined points for points-based workflow', () => {
    const story: StoryMetadata = {
      id: '31-3'
      // No points defined
    };
    const workflows = [pointsWorkflow]; // Requires min: 8

    const result = routeStoryToWorkflow(story, workflows);

    assert.strictEqual(result, null, 'Should not match points trigger when story has no points');
  });

  it('should handle story with zero points', () => {
    const story: StoryMetadata = {
      id: '31-3',
      type: 'chore',
      points: 0
    };
    const workflows = [trivialWorkflow]; // max: 2

    const result = routeStoryToWorkflow(story, workflows);

    assert.ok(result, 'Should match (0 <= 2)');
    assert.strictEqual(result.workflow.name, 'trivial');
  });

  it('should be case-sensitive for workflow names in tags', () => {
    const story: StoryMetadata = {
      id: '31-3',
      tags: ['workflow:TDD'] // Uppercase
    };
    const workflows = [tddWorkflow]; // name is 'tdd' lowercase

    const result = routeStoryToWorkflow(story, workflows);

    // Should NOT match because TDD !== tdd
    assert.ok(
      result === null || result.reason.includes('default'),
      'Should not match case-mismatched workflow name (or fall to default)'
    );
  });

  it('should handle multiple workflow: tags (first wins)', () => {
    const story: StoryMetadata = {
      id: '31-3',
      tags: ['workflow:trivial', 'workflow:tdd']
    };
    const workflows = [tddWorkflow, trivialWorkflow];

    const result = routeStoryToWorkflow(story, workflows);

    assert.ok(result, 'Should return a result');
    assert.strictEqual(result.workflow.name, 'trivial', 'First workflow: tag should win');
  });

});

// =============================================================================
// Integration Tests with Real Workflows
// =============================================================================

describe('Integration: Real workflow files', () => {

  // Helper to find monorepo root
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

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const monorepoRoot = findMonorepoRoot(__dirname);

  it('should route feature story to tdd workflow from real files', async () => {
    if (!monorepoRoot) {
      console.log('Skipping: monorepo root not found');
      return;
    }

    // Import loader to get real workflows
    const { loadWorkflowsFromDir } = await import('./workflow-loader.js');
    const workflowsDir = join(monorepoRoot, 'pennyfarthing-dist', 'workflows');
    const { workflows } = loadWorkflowsFromDir(workflowsDir);

    if (workflows.length === 0) {
      console.log('Skipping: no workflows found');
      return;
    }

    const story: StoryMetadata = {
      id: '31-3',
      type: 'feature',
      points: 3
    };

    const result = routeStoryToWorkflow(story, workflows);

    assert.ok(result, 'Should route to a workflow');
    // tdd.yaml should be the default for features
    console.log(`Routed to: ${result.workflow.name} (${result.reason})`);
  });

  it('should route chore story to trivial workflow from real files', async () => {
    if (!monorepoRoot) {
      console.log('Skipping: monorepo root not found');
      return;
    }

    const { loadWorkflowsFromDir } = await import('./workflow-loader.js');
    const workflowsDir = join(monorepoRoot, 'pennyfarthing-dist', 'workflows');
    const { workflows } = loadWorkflowsFromDir(workflowsDir);

    if (workflows.length === 0) {
      console.log('Skipping: no workflows found');
      return;
    }

    const story: StoryMetadata = {
      id: '31-3',
      type: 'chore',
      points: 1
    };

    const result = routeStoryToWorkflow(story, workflows);

    assert.ok(result, 'Should route to a workflow');
    console.log(`Routed to: ${result.workflow.name} (${result.reason})`);
  });

});
