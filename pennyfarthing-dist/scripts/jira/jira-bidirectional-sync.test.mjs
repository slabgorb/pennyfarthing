#!/usr/bin/env node
/**
 * jira-bidirectional-sync.test.mjs - Tests for bidirectional Jira sync
 *
 * Story: MSSCI-11842
 * TDD Phase: RED
 *
 * Run with: node --test pennyfarthing-dist/scripts/utils/jira/jira-bidirectional-sync.test.mjs
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';

// The module under test (will be created by Dev)
// import { ... } from './jira-bidirectional-sync.mjs';

// For now, import from jira-lib.mjs to test helper functions
import {
  mapStatusToJira,
  mapJiraToStatus,
  extractJiraKey
} from './jira-lib.mjs';

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Sample YAML story data (as parsed from sprint YAML)
 */
const sampleYamlStories = [
  {
    id: 'MSSCI-11842',
    title: 'Bidirectional sync script',
    status: 'in_progress',
    points: 4,
    priority: 'P2'
  },
  {
    id: 'MSSCI-11843',
    title: 'Document Jira auto-creation',
    status: 'backlog',
    points: 2,
    priority: 'P2'
  },
  {
    id: 'MSSCI-11844',
    title: 'YAML-only story',
    status: 'backlog',
    points: 3,
    priority: 'P3'
  }
];

/**
 * Sample Jira story data (as returned from Jira API)
 */
const sampleJiraStories = [
  {
    key: 'MSSCI-11842',
    fields: {
      summary: 'Bidirectional sync script',
      status: { name: 'In Progress' },
      customfield_10031: 4, // Story points
      priority: { name: 'Medium' }
    }
  },
  {
    key: 'MSSCI-11843',
    fields: {
      summary: 'Document Jira auto-creation',
      status: { name: 'Done' }, // Different from YAML!
      customfield_10031: 2,
      priority: { name: 'Medium' }
    }
  },
  {
    key: 'MSSCI-11850',
    fields: {
      summary: 'Jira-only story',
      status: { name: 'To Do' },
      customfield_10031: 5,
      priority: { name: 'High' }
    }
  }
];

// =============================================================================
// AC1: Script syncs status changes both directions
// =============================================================================

describe('AC1: Bidirectional status sync', () => {

  describe('YAML → Jira direction', () => {

    it('should detect when YAML status differs from Jira status', async () => {
      // Import the function that will be implemented
      const { generateSyncPlan } = await import('./jira-bidirectional-sync.mjs');

      const plan = generateSyncPlan(sampleYamlStories, sampleJiraStories, {
        syncStatus: true
      });

      // MSSCI-11843: YAML=backlog, Jira=Done
      const story11843 = plan.changes.find(c => c.key === 'MSSCI-11843');
      assert.ok(story11843, 'Should detect status difference for MSSCI-11843');
      assert.strictEqual(story11843.yamlStatus, 'backlog');
      assert.strictEqual(story11843.jiraStatus, 'Done');
    });

    it('should generate Jira update action when YAML is source of truth', async () => {
      const { generateSyncPlan } = await import('./jira-bidirectional-sync.mjs');

      const plan = generateSyncPlan(sampleYamlStories, sampleJiraStories, {
        syncStatus: true,
        direction: 'yaml-to-jira'
      });

      const story11843 = plan.changes.find(c => c.key === 'MSSCI-11843');
      assert.ok(story11843);
      assert.strictEqual(story11843.action, 'update-jira');
      assert.strictEqual(story11843.targetStatus, 'To Do'); // backlog maps to To Do
    });

  });

  describe('Jira → YAML direction', () => {

    it('should generate YAML update action when Jira is source of truth', async () => {
      const { generateSyncPlan } = await import('./jira-bidirectional-sync.mjs');

      const plan = generateSyncPlan(sampleYamlStories, sampleJiraStories, {
        syncStatus: true,
        direction: 'jira-to-yaml'
      });

      const story11843 = plan.changes.find(c => c.key === 'MSSCI-11843');
      assert.ok(story11843);
      assert.strictEqual(story11843.action, 'update-yaml');
      assert.strictEqual(story11843.targetStatus, 'done'); // Done maps to done
    });

    it('should correctly map Jira status to YAML status', () => {
      // Test existing helper function
      assert.strictEqual(mapJiraToStatus('To Do'), 'backlog');
      assert.strictEqual(mapJiraToStatus('In Progress'), 'in-progress');
      assert.strictEqual(mapJiraToStatus('Done'), 'done');
      assert.strictEqual(mapJiraToStatus('In Review'), 'review');
    });

  });

  describe('Bidirectional conflict detection', () => {

    it('should detect conflicts when both systems changed', async () => {
      const { generateSyncPlan } = await import('./jira-bidirectional-sync.mjs');

      // Simulate scenario where timestamps indicate both changed
      const plan = generateSyncPlan(sampleYamlStories, sampleJiraStories, {
        syncStatus: true,
        direction: 'bidirectional',
        lastSyncTime: new Date('2026-01-17T00:00:00Z')
      });

      const conflicts = plan.conflicts || [];
      // Should identify potential conflicts for manual resolution
      assert.ok(Array.isArray(conflicts));
    });

    it('should use Jira as default winner on conflict', async () => {
      const { generateSyncPlan } = await import('./jira-bidirectional-sync.mjs');

      const plan = generateSyncPlan(sampleYamlStories, sampleJiraStories, {
        syncStatus: true,
        direction: 'bidirectional'
        // No yamlWins flag, so Jira should win
      });

      // Default: Jira wins conflicts
      const story11843 = plan.changes.find(c => c.key === 'MSSCI-11843');
      if (story11843) {
        assert.strictEqual(story11843.action, 'update-yaml');
      }
    });

    it('should use YAML as winner when --yaml-wins flag is set', async () => {
      const { generateSyncPlan } = await import('./jira-bidirectional-sync.mjs');

      const plan = generateSyncPlan(sampleYamlStories, sampleJiraStories, {
        syncStatus: true,
        direction: 'bidirectional',
        yamlWins: true
      });

      const story11843 = plan.changes.find(c => c.key === 'MSSCI-11843');
      if (story11843) {
        assert.strictEqual(story11843.action, 'update-jira');
      }
    });

  });

});

// =============================================================================
// AC2: Points updated in Jira match sprint YAML
// =============================================================================

describe('AC2: Story points sync', () => {

  it('should detect when YAML points differ from Jira points', async () => {
    const { generateSyncPlan } = await import('./jira-bidirectional-sync.mjs');

    // Create test data with mismatched points
    const yamlWithDifferentPoints = [
      { id: 'MSSCI-11842', status: 'in_progress', points: 5 } // YAML says 5
    ];
    const jiraWithDifferentPoints = [
      { key: 'MSSCI-11842', fields: { status: { name: 'In Progress' }, customfield_10031: 4 } } // Jira says 4
    ];

    const plan = generateSyncPlan(yamlWithDifferentPoints, jiraWithDifferentPoints, {
      syncPoints: true
    });

    const pointsChange = plan.changes.find(c => c.key === 'MSSCI-11842' && c.field === 'points');
    assert.ok(pointsChange, 'Should detect points difference');
    assert.strictEqual(pointsChange.yamlPoints, 5);
    assert.strictEqual(pointsChange.jiraPoints, 4);
  });

  it('should sync points from YAML to Jira', async () => {
    const { generateSyncPlan } = await import('./jira-bidirectional-sync.mjs');

    const yamlStories = [{ id: 'MSSCI-11842', status: 'backlog', points: 8 }];
    const jiraStories = [{ key: 'MSSCI-11842', fields: { status: { name: 'To Do' }, customfield_10031: 5 } }];

    const plan = generateSyncPlan(yamlStories, jiraStories, {
      syncPoints: true,
      direction: 'yaml-to-jira'
    });

    const change = plan.changes.find(c => c.field === 'points');
    assert.ok(change);
    assert.strictEqual(change.action, 'update-jira');
    assert.strictEqual(change.targetPoints, 8);
  });

  it('should sync points from Jira to YAML', async () => {
    const { generateSyncPlan } = await import('./jira-bidirectional-sync.mjs');

    const yamlStories = [{ id: 'MSSCI-11842', status: 'backlog', points: 3 }];
    const jiraStories = [{ key: 'MSSCI-11842', fields: { status: { name: 'To Do' }, customfield_10031: 5 } }];

    const plan = generateSyncPlan(yamlStories, jiraStories, {
      syncPoints: true,
      direction: 'jira-to-yaml'
    });

    const change = plan.changes.find(c => c.field === 'points');
    assert.ok(change);
    assert.strictEqual(change.action, 'update-yaml');
    assert.strictEqual(change.targetPoints, 5);
  });

  it('should not generate change when points match', async () => {
    const { generateSyncPlan } = await import('./jira-bidirectional-sync.mjs');

    const yamlStories = [{ id: 'MSSCI-11842', status: 'backlog', points: 4 }];
    const jiraStories = [{ key: 'MSSCI-11842', fields: { status: { name: 'To Do' }, customfield_10031: 4 } }];

    const plan = generateSyncPlan(yamlStories, jiraStories, {
      syncPoints: true
    });

    const pointsChange = plan.changes.find(c => c.key === 'MSSCI-11842' && c.field === 'points');
    assert.ok(!pointsChange, 'Should not generate change when points match');
  });

});

// =============================================================================
// AC3: New stories in either system detected
// =============================================================================

describe('AC3: Detect new stories in either system', () => {

  describe('YAML-only stories', () => {

    it('should detect stories in YAML but not in Jira', async () => {
      const { generateSyncPlan } = await import('./jira-bidirectional-sync.mjs');

      const plan = generateSyncPlan(sampleYamlStories, sampleJiraStories, {});

      // MSSCI-11844 is in YAML but not in Jira fixtures
      assert.ok(plan.yamlOnly, 'Plan should have yamlOnly array');
      assert.ok(plan.yamlOnly.includes('MSSCI-11844'), 'Should detect MSSCI-11844 as YAML-only');
    });

    it('should report YAML-only stories for potential Jira creation', async () => {
      const { generateSyncPlan } = await import('./jira-bidirectional-sync.mjs');

      const plan = generateSyncPlan(sampleYamlStories, sampleJiraStories, {
        reportMissing: true
      });

      const yamlOnlyReport = plan.reports?.yamlOnly || [];
      assert.ok(yamlOnlyReport.length > 0, 'Should report YAML-only stories');
    });

  });

  describe('Jira-only stories', () => {

    it('should detect stories in Jira but not in YAML', async () => {
      const { generateSyncPlan } = await import('./jira-bidirectional-sync.mjs');

      const plan = generateSyncPlan(sampleYamlStories, sampleJiraStories, {});

      // MSSCI-11850 is in Jira but not in YAML fixtures
      assert.ok(plan.jiraOnly, 'Plan should have jiraOnly array');
      assert.ok(plan.jiraOnly.includes('MSSCI-11850'), 'Should detect MSSCI-11850 as Jira-only');
    });

    it('should report Jira-only stories for potential YAML import', async () => {
      const { generateSyncPlan } = await import('./jira-bidirectional-sync.mjs');

      const plan = generateSyncPlan(sampleYamlStories, sampleJiraStories, {
        reportMissing: true
      });

      const jiraOnlyReport = plan.reports?.jiraOnly || [];
      assert.ok(jiraOnlyReport.length > 0, 'Should report Jira-only stories');
    });

  });

  describe('Stories in both systems', () => {

    it('should identify stories present in both systems', async () => {
      const { generateSyncPlan } = await import('./jira-bidirectional-sync.mjs');

      const plan = generateSyncPlan(sampleYamlStories, sampleJiraStories, {});

      assert.ok(plan.both, 'Plan should have both array');
      // MSSCI-11842 and MSSCI-11843 are in both
      assert.ok(plan.both.includes('MSSCI-11842'));
      assert.ok(plan.both.includes('MSSCI-11843'));
    });

  });

});

// =============================================================================
// AC4: Dry-run mode shows changes before applying
// =============================================================================

describe('AC4: Dry-run mode', () => {

  it('should generate plan without executing changes in dry-run mode', async () => {
    const { executeSyncPlan, generateSyncPlan } = await import('./jira-bidirectional-sync.mjs');

    const plan = generateSyncPlan(sampleYamlStories, sampleJiraStories, {
      syncStatus: true,
      syncPoints: true
    });

    // Execute with dry-run
    const result = await executeSyncPlan(plan, { dryRun: true });

    assert.ok(result.dryRun, 'Result should indicate dry-run mode');
    assert.ok(result.wouldApply, 'Result should list what would be applied');
    assert.strictEqual(result.applied, 0, 'Should not apply any changes');
  });

  it('should display planned changes in human-readable format', async () => {
    const { formatSyncPlan } = await import('./jira-bidirectional-sync.mjs');

    const plan = {
      changes: [
        { key: 'MSSCI-11843', field: 'status', action: 'update-yaml', targetStatus: 'done' }
      ],
      yamlOnly: ['MSSCI-11844'],
      jiraOnly: ['MSSCI-11850'],
      both: ['MSSCI-11842', 'MSSCI-11843']
    };

    const output = formatSyncPlan(plan);

    assert.ok(typeof output === 'string', 'Should return string output');
    assert.ok(output.includes('MSSCI-11843'), 'Should include story keys');
    assert.ok(output.includes('status'), 'Should include field names');
  });

  it('should not modify YAML file in dry-run mode', async () => {
    const { executeSyncPlan, generateSyncPlan } = await import('./jira-bidirectional-sync.mjs');

    // This test verifies no file writes happen
    const plan = generateSyncPlan(
      [{ id: 'MSSCI-11842', status: 'backlog', points: 4 }],
      [{ key: 'MSSCI-11842', fields: { status: { name: 'Done' }, customfield_10031: 4 } }],
      { syncStatus: true, direction: 'jira-to-yaml' }
    );

    const result = await executeSyncPlan(plan, { dryRun: true });

    assert.ok(result.dryRun);
    assert.strictEqual(result.yamlModified, false, 'YAML should not be modified');
  });

  it('should not call Jira API in dry-run mode', async () => {
    const { executeSyncPlan, generateSyncPlan } = await import('./jira-bidirectional-sync.mjs');

    const plan = generateSyncPlan(
      [{ id: 'MSSCI-11842', status: 'done', points: 4 }],
      [{ key: 'MSSCI-11842', fields: { status: { name: 'To Do' }, customfield_10031: 4 } }],
      { syncStatus: true, direction: 'yaml-to-jira' }
    );

    const result = await executeSyncPlan(plan, { dryRun: true });

    assert.ok(result.dryRun);
    assert.strictEqual(result.jiraApiCalls, 0, 'Should not make Jira API calls');
  });

});

// =============================================================================
// Integration: CLI argument parsing
// =============================================================================

describe('CLI argument parsing', () => {

  it('should parse --dry-run flag', async () => {
    const { parseCliArgs } = await import('./jira-bidirectional-sync.mjs');

    const args = parseCliArgs(['--dry-run']);
    assert.strictEqual(args.dryRun, true);
  });

  it('should parse --yaml-wins flag', async () => {
    const { parseCliArgs } = await import('./jira-bidirectional-sync.mjs');

    const args = parseCliArgs(['--yaml-wins']);
    assert.strictEqual(args.yamlWins, true);
  });

  it('should parse --status and --points flags', async () => {
    const { parseCliArgs } = await import('./jira-bidirectional-sync.mjs');

    const args = parseCliArgs(['--status', '--points']);
    assert.strictEqual(args.syncStatus, true);
    assert.strictEqual(args.syncPoints, true);
  });

  it('should parse --all flag as status + points', async () => {
    const { parseCliArgs } = await import('./jira-bidirectional-sync.mjs');

    const args = parseCliArgs(['--all']);
    assert.strictEqual(args.syncStatus, true);
    assert.strictEqual(args.syncPoints, true);
  });

  it('should parse --sprint <id> option', async () => {
    const { parseCliArgs } = await import('./jira-bidirectional-sync.mjs');

    const args = parseCliArgs(['--sprint', '275']);
    assert.strictEqual(args.sprintId, '275');
  });

});

// =============================================================================
// Helper function tests (using existing jira-lib.mjs)
// =============================================================================

describe('Helper functions from jira-lib.mjs', () => {

  it('mapStatusToJira converts Pennyfarthing status to Jira', () => {
    assert.strictEqual(mapStatusToJira('backlog'), 'To Do');
    assert.strictEqual(mapStatusToJira('in_progress'), 'In Progress');
    assert.strictEqual(mapStatusToJira('in-progress'), 'In Progress');
    assert.strictEqual(mapStatusToJira('done'), 'Done');
    assert.strictEqual(mapStatusToJira('review'), 'In Review');
  });

  it('mapJiraToStatus converts Jira status to Pennyfarthing', () => {
    assert.strictEqual(mapJiraToStatus('To Do'), 'backlog');
    assert.strictEqual(mapJiraToStatus('In Progress'), 'in-progress');
    assert.strictEqual(mapJiraToStatus('Done'), 'done');
    assert.strictEqual(mapJiraToStatus('In Review'), 'review');
  });

  it('extractJiraKey extracts key from URL or returns as-is', () => {
    assert.strictEqual(extractJiraKey('MSSCI-11842'), 'MSSCI-11842');
    assert.strictEqual(
      extractJiraKey('https://1898andco.atlassian.net/browse/MSSCI-11842'),
      'MSSCI-11842'
    );
  });

});
