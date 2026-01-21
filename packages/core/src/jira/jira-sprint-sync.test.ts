/**
 * Tests for Story 47-2: Sync sprint numbers with Jira sprint IDs
 *
 * These tests define the contract for syncing Pennyfarthing sprint numbers
 * with Jira sprint IDs, enabling bidirectional sprint tracking.
 *
 * Acceptance Criteria:
 * 1. Sprint YAML references Jira sprint ID (e.g., 275)
 * 2. Status check queries Jira sprint for membership
 * 3. Sprint velocity pulls from Jira sprint metrics
 * 4. Local sprint number matches Jira sprint
 *
 * Run with: npm test
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Get directory for test fixtures
const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DIR = join(__dirname, '__test_jira_sprint_sync__');

// Import the sprint sync functions (to be implemented)
import {
  getJiraSprintInfo,
  getSprintIssues,
  isStoryInJiraSprint,
  getSprintVelocityFromJira,
  validateSprintAlignment,
  addJiraSprintIdToYaml,
  // Story 47-3 imports
  getYamlStoryIds,
  findJiraOnlyStories,
  formatMissingStoriesReport,
  importMissingStoriesToYaml,
  SprintIssue
} from './jira-sprint-sync.js';

describe('Jira Sprint Sync (47-2)', () => {

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

  // ============================================
  // AC1: Sprint YAML references Jira sprint ID
  // ============================================
  describe('addJiraSprintIdToYaml() - AC1: Sprint YAML references Jira sprint ID', () => {

    it('should add jira_sprint_id field to sprint section', async () => {
      const sprintYaml = `sprint:
  number: 11
  goal: Complete Epic 31 workflow engine
  planned_start: 2026-01-15
  status: active
  velocity_target: 22
`;
      const sprintPath = join(TEST_DIR, 'current-sprint.yaml');
      writeFileSync(sprintPath, sprintYaml);

      const result = await addJiraSprintIdToYaml({
        sprintPath,
        jiraSprintId: 275
      });

      assert.strictEqual(result.success, true, 'Update should succeed');

      const updatedContent = readFileSync(sprintPath, 'utf-8');
      assert.ok(updatedContent.includes('jira_sprint_id: 275'),
        'YAML should contain jira_sprint_id field');
    });

    it('should preserve existing sprint fields when adding jira_sprint_id', async () => {
      const sprintYaml = `sprint:
  number: 11
  goal: Complete Epic 31 workflow engine
  planned_start: 2026-01-15
  status: active
  velocity_target: 22
`;
      const sprintPath = join(TEST_DIR, 'current-sprint.yaml');
      writeFileSync(sprintPath, sprintYaml);

      await addJiraSprintIdToYaml({
        sprintPath,
        jiraSprintId: 275
      });

      const updatedContent = readFileSync(sprintPath, 'utf-8');
      assert.ok(updatedContent.includes('number: 11'), 'Number should be preserved');
      assert.ok(updatedContent.includes('goal: Complete Epic 31'), 'Goal should be preserved');
      assert.ok(updatedContent.includes('velocity_target: 22'), 'Velocity target should be preserved');
    });

    it('should update existing jira_sprint_id if already present', async () => {
      const sprintYaml = `sprint:
  number: 11
  jira_sprint_id: 274
  goal: Old sprint
  status: active
`;
      const sprintPath = join(TEST_DIR, 'current-sprint.yaml');
      writeFileSync(sprintPath, sprintYaml);

      const result = await addJiraSprintIdToYaml({
        sprintPath,
        jiraSprintId: 275,
        force: true
      });

      assert.strictEqual(result.success, true);
      const updatedContent = readFileSync(sprintPath, 'utf-8');
      assert.ok(updatedContent.includes('jira_sprint_id: 275'),
        'Should have updated jira_sprint_id');
      assert.ok(!updatedContent.includes('jira_sprint_id: 274'),
        'Should not have old jira_sprint_id');
    });

    it('should fail if jira_sprint_id exists and force is false', async () => {
      const sprintYaml = `sprint:
  number: 11
  jira_sprint_id: 274
  status: active
`;
      const sprintPath = join(TEST_DIR, 'current-sprint.yaml');
      writeFileSync(sprintPath, sprintYaml);

      const result = await addJiraSprintIdToYaml({
        sprintPath,
        jiraSprintId: 275,
        force: false
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('already has'), 'Should mention existing ID');
    });

    it('should handle file not found gracefully', async () => {
      const result = await addJiraSprintIdToYaml({
        sprintPath: join(TEST_DIR, 'nonexistent.yaml'),
        jiraSprintId: 275
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('not found') || result.error?.includes('ENOENT'),
        'Should report file not found');
    });
  });

  // ============================================
  // AC2: Status check queries Jira sprint for membership
  // ============================================
  describe('getJiraSprintInfo() - AC2: Query Jira sprint for membership', () => {

    it('should return sprint details from Jira', async () => {
      const result = await getJiraSprintInfo({
        sprintId: 275,
        _mockResponse: {
          id: 275,
          name: 'Sprint 11',
          state: 'active',
          startDate: '2026-01-15',
          endDate: '2026-01-29'
        }
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.sprint?.id, 275);
      assert.strictEqual(result.sprint?.name, 'Sprint 11');
      assert.strictEqual(result.sprint?.state, 'active');
    });

    it('should return null for non-existent sprint', async () => {
      const result = await getJiraSprintInfo({
        sprintId: 99999,
        _mockResponse: null
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('not found'), 'Should indicate sprint not found');
    });

    it('should handle Jira API errors', async () => {
      const result = await getJiraSprintInfo({
        sprintId: 275,
        _mockError: 'Connection refused'
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.error, 'Should have error message');
    });
  });

  describe('getSprintIssues() - AC2: List issues in Jira sprint', () => {

    it('should return issues in the sprint', async () => {
      const result = await getSprintIssues({
        sprintId: 275,
        _mockResponse: [
          { key: 'MSSCI-11798', summary: 'Sprint sync story', status: 'In Progress' },
          { key: 'MSSCI-11750', summary: 'Another story', status: 'Done' }
        ]
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.issues?.length, 2);
      assert.strictEqual(result.issues?.[0].key, 'MSSCI-11798');
    });

    it('should filter by label when provided', async () => {
      const result = await getSprintIssues({
        sprintId: 275,
        label: 'pennyfarthing',
        _mockResponse: [
          { key: 'MSSCI-11798', summary: 'Pennyfarthing story', status: 'In Progress', labels: ['pennyfarthing'] }
        ]
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.issues?.length, 1);
    });

    it('should return empty array for sprint with no issues', async () => {
      const result = await getSprintIssues({
        sprintId: 275,
        _mockResponse: []
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.issues?.length, 0);
    });
  });

  describe('isStoryInJiraSprint() - AC2: Check sprint membership', () => {

    it('should return true if story is in the sprint', async () => {
      const result = await isStoryInJiraSprint({
        jiraKey: 'MSSCI-11798',
        sprintId: 275,
        _mockResponse: true
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.inSprint, true);
    });

    it('should return false if story is not in the sprint', async () => {
      const result = await isStoryInJiraSprint({
        jiraKey: 'MSSCI-11798',
        sprintId: 274, // Different sprint
        _mockResponse: false
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.inSprint, false);
    });

    it('should handle story not found in Jira', async () => {
      const result = await isStoryInJiraSprint({
        jiraKey: 'MSSCI-99999',
        sprintId: 275,
        _mockError: 'Issue not found'
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('not found'));
    });
  });

  // ============================================
  // AC3: Sprint velocity pulls from Jira sprint metrics
  // ============================================
  describe('getSprintVelocityFromJira() - AC3: Sprint velocity from Jira', () => {

    it('should return velocity metrics from Jira sprint', async () => {
      const result = await getSprintVelocityFromJira({
        sprintId: 275,
        _mockResponse: {
          totalPoints: 22,
          completedPoints: 15,
          remainingPoints: 7,
          issueCount: 8,
          completedCount: 5
        }
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.metrics?.totalPoints, 22);
      assert.strictEqual(result.metrics?.completedPoints, 15);
      assert.strictEqual(result.metrics?.remainingPoints, 7);
    });

    it('should calculate velocity percentage', async () => {
      const result = await getSprintVelocityFromJira({
        sprintId: 275,
        _mockResponse: {
          totalPoints: 20,
          completedPoints: 10,
          remainingPoints: 10
        }
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.metrics?.velocityPercentage, 50);
    });

    it('should handle sprint with no points', async () => {
      const result = await getSprintVelocityFromJira({
        sprintId: 275,
        _mockResponse: {
          totalPoints: 0,
          completedPoints: 0,
          remainingPoints: 0
        }
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.metrics?.totalPoints, 0);
      // Should not divide by zero
      assert.ok(result.metrics?.velocityPercentage === 0 || result.metrics?.velocityPercentage === null,
        'Should handle zero total gracefully');
    });

    it('should return issue breakdown by status', async () => {
      const result = await getSprintVelocityFromJira({
        sprintId: 275,
        _mockResponse: {
          totalPoints: 22,
          completedPoints: 15,
          remainingPoints: 7,
          byStatus: {
            'To Do': { count: 2, points: 3 },
            'In Progress': { count: 1, points: 4 },
            'Done': { count: 5, points: 15 }
          }
        }
      });

      assert.strictEqual(result.success, true);
      assert.ok(result.metrics?.byStatus, 'Should have status breakdown');
      assert.strictEqual(result.metrics?.byStatus?.Done?.points, 15);
    });
  });

  // ============================================
  // AC4: Local sprint name matches Jira sprint
  // ============================================
  describe('validateSprintAlignment() - AC4: Local sprint matches Jira', () => {

    it('should return aligned when sprint names match', async () => {
      const sprintYaml = `sprint:
  name: "TO Sprint 2604"
  jira_sprint_id: 275
  jira_sprint_name: "TO Sprint 2604"
  status: active
`;
      const sprintPath = join(TEST_DIR, 'current-sprint.yaml');
      writeFileSync(sprintPath, sprintYaml);

      const result = await validateSprintAlignment({
        sprintPath,
        _mockJiraSprint: {
          id: 275,
          name: 'TO Sprint 2604',
          state: 'active'
        }
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.aligned, true);
      assert.strictEqual(result.localSprintName, 'TO Sprint 2604');
      assert.strictEqual(result.jiraSprintId, 275);
    });

    it('should detect misalignment when sprint names differ', async () => {
      const sprintYaml = `sprint:
  name: "TO Sprint 2604"
  jira_sprint_id: 275
  jira_sprint_name: "TO Sprint 2604"
  status: active
`;
      const sprintPath = join(TEST_DIR, 'current-sprint.yaml');
      writeFileSync(sprintPath, sprintYaml);

      const result = await validateSprintAlignment({
        sprintPath,
        _mockJiraSprint: {
          id: 275,
          name: 'TO Sprint 2605', // Mismatch!
          state: 'active'
        }
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.aligned, false);
      assert.ok(result.warning?.includes('mismatch'), 'Should warn about mismatch');
    });

    it('should detect when Jira sprint is closed but local is active', async () => {
      const sprintYaml = `sprint:
  name: "TO Sprint 2604"
  jira_sprint_id: 275
  jira_sprint_name: "TO Sprint 2604"
  status: active
`;
      const sprintPath = join(TEST_DIR, 'current-sprint.yaml');
      writeFileSync(sprintPath, sprintYaml);

      const result = await validateSprintAlignment({
        sprintPath,
        _mockJiraSprint: {
          id: 275,
          name: 'TO Sprint 2604',
          state: 'closed' // Jira sprint closed!
        }
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.aligned, false);
      assert.ok(result.warning?.includes('closed'), 'Should warn about closed sprint');
    });

    it('should handle missing jira_sprint_id in YAML', async () => {
      const sprintYaml = `sprint:
  name: "TO Sprint 2604"
  status: active
`;
      const sprintPath = join(TEST_DIR, 'current-sprint.yaml');
      writeFileSync(sprintPath, sprintYaml);

      const result = await validateSprintAlignment({
        sprintPath,
        _mockJiraSprint: null
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('jira_sprint_id') || result.error?.includes('not configured'),
        'Should report missing jira_sprint_id');
    });

    it('should use jira_sprint_name for comparison if present', async () => {
      const sprintYaml = `sprint:
  name: "My Local Name"
  jira_sprint_id: 275
  jira_sprint_name: "TO Sprint 2604"
  status: active
`;
      const sprintPath = join(TEST_DIR, 'current-sprint.yaml');
      writeFileSync(sprintPath, sprintYaml);

      const result = await validateSprintAlignment({
        sprintPath,
        _mockJiraSprint: {
          id: 275,
          name: 'TO Sprint 2604',
          state: 'active'
        }
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.aligned, true);
      assert.strictEqual(result.jiraSprintName, 'TO Sprint 2604');
    });
  });

  // ============================================
  // Integration tests
  // ============================================
  describe('Integration: Full sprint sync workflow', () => {

    it('should sync sprint with Jira and update YAML', async () => {
      // Start with no jira_sprint_id
      const sprintYaml = `sprint:
  name: "TO Sprint 2604"
  goal: Test sprint
  status: active
`;
      const sprintPath = join(TEST_DIR, 'current-sprint.yaml');
      writeFileSync(sprintPath, sprintYaml);

      // Step 1: Add jira_sprint_id
      const addResult = await addJiraSprintIdToYaml({
        sprintPath,
        jiraSprintId: 275
      });
      assert.strictEqual(addResult.success, true);

      // Step 2: Validate alignment
      const validateResult = await validateSprintAlignment({
        sprintPath,
        _mockJiraSprint: {
          id: 275,
          name: 'TO Sprint 2604',
          state: 'active'
        }
      });
      assert.strictEqual(validateResult.success, true);
      assert.strictEqual(validateResult.aligned, true);

      // Step 3: Get velocity
      const velocityResult = await getSprintVelocityFromJira({
        sprintId: 275,
        _mockResponse: {
          totalPoints: 22,
          completedPoints: 10,
          remainingPoints: 12
        }
      });
      assert.strictEqual(velocityResult.success, true);
      assert.strictEqual(velocityResult.metrics?.totalPoints, 22);
    });

    it('should warn when story is not in Jira sprint', async () => {
      // This tests the SM setup flow integration
      const membershipResult = await isStoryInJiraSprint({
        jiraKey: 'MSSCI-11798',
        sprintId: 275,
        _mockResponse: false
      });

      assert.strictEqual(membershipResult.success, true);
      assert.strictEqual(membershipResult.inSprint, false);
      // In real implementation, this would trigger a warning in SM setup
    });
  });
});

// ============================================
// Story 47-3: Detect Jira-only stories missing from sprint YAML
// ============================================
//
// Acceptance Criteria:
// 1. Sync script queries Jira sprint for all pennyfarthing stories
// 2. Compares against sprint YAML story list
// 3. Reports stories in Jira but not in YAML
// 4. Optionally imports missing stories to YAML

describe('Jira-Only Story Detection (47-3)', () => {

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

  // ============================================
  // AC1 + AC2: Query Jira and compare against YAML
  // ============================================
  describe('getYamlStoryIds() - Extract story IDs from sprint YAML', () => {

    it('should extract all story IDs from sprint YAML', async () => {
      const sprintYaml = `sprint:
  number: 11
  status: active
epics:
  - id: epic-47
    title: Jira Sync
    stories:
      - id: "47-1"
        title: Auto-create Jira epic
        status: done
      - id: "47-2"
        title: Sync sprint numbers
        status: done
      - id: "47-3"
        title: Detect Jira-only stories
        status: in_progress
`;
      const sprintPath = join(TEST_DIR, 'current-sprint.yaml');
      writeFileSync(sprintPath, sprintYaml);

      const result = await getYamlStoryIds({ sprintPath });

      assert.strictEqual(result.success, true);
      assert.ok(result.storyIds, 'Should return storyIds array');
      assert.strictEqual(result.storyIds?.length, 3);
      assert.ok(result.storyIds?.includes('47-1'));
      assert.ok(result.storyIds?.includes('47-2'));
      assert.ok(result.storyIds?.includes('47-3'));
    });

    it('should extract stories from multiple epics', async () => {
      const sprintYaml = `sprint:
  number: 11
  status: active
epics:
  - id: epic-31
    title: Workflow Engine
    stories:
      - id: "31-1"
        status: done
      - id: "31-2"
        status: done
  - id: epic-47
    title: Jira Sync
    stories:
      - id: "47-1"
        status: done
`;
      const sprintPath = join(TEST_DIR, 'current-sprint.yaml');
      writeFileSync(sprintPath, sprintYaml);

      const result = await getYamlStoryIds({ sprintPath });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.storyIds?.length, 3);
      assert.ok(result.storyIds?.includes('31-1'));
      assert.ok(result.storyIds?.includes('31-2'));
      assert.ok(result.storyIds?.includes('47-1'));
    });

    it('should return empty array for YAML with no stories', async () => {
      const sprintYaml = `sprint:
  number: 11
  status: active
epics: []
`;
      const sprintPath = join(TEST_DIR, 'current-sprint.yaml');
      writeFileSync(sprintPath, sprintYaml);

      const result = await getYamlStoryIds({ sprintPath });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.storyIds?.length, 0);
    });

    it('should handle missing file gracefully', async () => {
      const result = await getYamlStoryIds({
        sprintPath: join(TEST_DIR, 'nonexistent.yaml')
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('not found') || result.error?.includes('ENOENT'));
    });
  });

  describe('findJiraOnlyStories() - Compare Jira issues with YAML stories', () => {

    it('should find stories in Jira but not in YAML', async () => {
      const jiraIssues: SprintIssue[] = [
        { key: 'MSSCI-11797', summary: '47-1: Auto-create Jira epic', status: 'Done' },
        { key: 'MSSCI-11798', summary: '47-2: Sync sprint numbers', status: 'Done' },
        { key: 'MSSCI-11800', summary: '47-4: Bidirectional sync', status: 'To Do' }  // Not in YAML!
      ];
      const yamlStoryIds = ['47-1', '47-2', '47-3'];

      const result = await findJiraOnlyStories({
        jiraIssues,
        yamlStoryIds
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.missingStories?.length, 1);
      assert.strictEqual(result.missingStories?.[0].key, 'MSSCI-11800');
      assert.strictEqual(result.missingStories?.[0].storyId, '47-4');
    });

    it('should return empty when all Jira stories are in YAML', async () => {
      const jiraIssues: SprintIssue[] = [
        { key: 'MSSCI-11797', summary: '47-1: Auto-create Jira epic', status: 'Done' },
        { key: 'MSSCI-11798', summary: '47-2: Sync sprint numbers', status: 'Done' }
      ];
      const yamlStoryIds = ['47-1', '47-2', '47-3'];

      const result = await findJiraOnlyStories({
        jiraIssues,
        yamlStoryIds
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.missingStories?.length, 0);
    });

    it('should extract story ID from Jira summary format', async () => {
      // Jira summaries often have format "47-1: Title" or "Story 47-1: Title"
      const jiraIssues: SprintIssue[] = [
        { key: 'MSSCI-100', summary: 'Story 31-5: New feature', status: 'In Progress' },
        { key: 'MSSCI-101', summary: '31-6: Another feature', status: 'To Do' }
      ];
      const yamlStoryIds = ['31-1', '31-2'];

      const result = await findJiraOnlyStories({
        jiraIssues,
        yamlStoryIds
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.missingStories?.length, 2);
      assert.strictEqual(result.missingStories?.[0].storyId, '31-5');
      assert.strictEqual(result.missingStories?.[1].storyId, '31-6');
    });

    it('should filter by pennyfarthing label when provided', async () => {
      const jiraIssues: SprintIssue[] = [
        { key: 'MSSCI-100', summary: '47-4: PF story', status: 'To Do', labels: ['pennyfarthing'] },
        { key: 'MSSCI-101', summary: 'OTHER-1: Not PF', status: 'To Do', labels: ['other-project'] }
      ];
      const yamlStoryIds = ['47-1'];

      const result = await findJiraOnlyStories({
        jiraIssues,
        yamlStoryIds,
        filterLabel: 'pennyfarthing'
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.missingStories?.length, 1);
      assert.strictEqual(result.missingStories?.[0].key, 'MSSCI-100');
    });
  });

  // ============================================
  // AC3: Report stories in Jira but not in YAML
  // ============================================
  describe('formatMissingStoriesReport() - Human-readable report', () => {

    it('should format missing stories as readable report', async () => {
      const missingStories = [
        { key: 'MSSCI-11800', summary: '47-4: Bidirectional sync', status: 'To Do', storyId: '47-4' },
        { key: 'MSSCI-11801', summary: '47-5: Retrofit epics', status: 'To Do', storyId: '47-5' }
      ];

      const result = await formatMissingStoriesReport({ missingStories });

      assert.strictEqual(result.success, true);
      assert.ok(result.report, 'Should have report string');
      assert.ok(result.report?.includes('MSSCI-11800'));
      assert.ok(result.report?.includes('47-4'));
      assert.ok(result.report?.includes('Bidirectional sync'));
      assert.ok(result.report?.includes('2 stories')); // Count in header
    });

    it('should return "no missing stories" message when empty', async () => {
      const result = await formatMissingStoriesReport({ missingStories: [] });

      assert.strictEqual(result.success, true);
      assert.ok(result.report?.toLowerCase().includes('no missing') ||
                result.report?.toLowerCase().includes('all synced') ||
                result.report?.includes('0 stories'));
    });

    it('should include Jira URL in report', async () => {
      const missingStories = [
        { key: 'MSSCI-11800', summary: '47-4: Test', status: 'To Do', storyId: '47-4' }
      ];

      const result = await formatMissingStoriesReport({
        missingStories,
        jiraBaseUrl: 'https://1898andco.atlassian.net'
      });

      assert.strictEqual(result.success, true);
      assert.ok(result.report?.includes('https://1898andco.atlassian.net/browse/MSSCI-11800'));
    });
  });

  // ============================================
  // AC4: Optionally import missing stories to YAML
  // ============================================
  describe('importMissingStoriesToYaml() - Add missing stories to sprint YAML', () => {

    it('should add missing story to existing epic in YAML', async () => {
      const sprintYaml = `sprint:
  number: 11
  status: active
epics:
  - id: epic-47
    title: Jira Sync
    stories:
      - id: "47-1"
        title: Auto-create Jira epic
        status: done
`;
      const sprintPath = join(TEST_DIR, 'current-sprint.yaml');
      writeFileSync(sprintPath, sprintYaml);

      const missingStories = [
        { key: 'MSSCI-11800', summary: '47-4: Bidirectional sync', status: 'To Do', storyId: '47-4', points: 4 }
      ];

      const result = await importMissingStoriesToYaml({
        sprintPath,
        missingStories,
        targetEpicId: 'epic-47'
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.importedCount, 1);

      // Verify the YAML was updated
      const updatedContent = readFileSync(sprintPath, 'utf-8');
      assert.ok(updatedContent.includes('47-4'));
      assert.ok(updatedContent.includes('Bidirectional sync'));
    });

    it('should preserve existing story order and add new at end', async () => {
      const sprintYaml = `sprint:
  number: 11
epics:
  - id: epic-47
    stories:
      - id: "47-1"
        status: done
      - id: "47-2"
        status: done
`;
      const sprintPath = join(TEST_DIR, 'current-sprint.yaml');
      writeFileSync(sprintPath, sprintYaml);

      const missingStories = [
        { key: 'MSSCI-11800', summary: '47-4: New story', status: 'To Do', storyId: '47-4' }
      ];

      const result = await importMissingStoriesToYaml({
        sprintPath,
        missingStories,
        targetEpicId: 'epic-47'
      });

      assert.strictEqual(result.success, true);

      const updatedContent = readFileSync(sprintPath, 'utf-8');
      const idx47_1 = updatedContent.indexOf('47-1');
      const idx47_2 = updatedContent.indexOf('47-2');
      const idx47_4 = updatedContent.indexOf('47-4');
      assert.ok(idx47_1 < idx47_2, '47-1 should come before 47-2');
      assert.ok(idx47_2 < idx47_4, '47-4 should come after 47-2');
    });

    it('should support dry-run mode that does not modify file', async () => {
      const sprintYaml = `sprint:
  number: 11
epics:
  - id: epic-47
    stories:
      - id: "47-1"
        status: done
`;
      const sprintPath = join(TEST_DIR, 'current-sprint.yaml');
      writeFileSync(sprintPath, sprintYaml);

      const missingStories = [
        { key: 'MSSCI-11800', summary: '47-4: New story', status: 'To Do', storyId: '47-4' }
      ];

      const result = await importMissingStoriesToYaml({
        sprintPath,
        missingStories,
        targetEpicId: 'epic-47',
        dryRun: true
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.importedCount, 1);
      assert.ok(result.wouldImport, 'Should indicate what would be imported');

      // File should NOT be modified
      const content = readFileSync(sprintPath, 'utf-8');
      assert.ok(!content.includes('47-4'), 'File should not contain 47-4 in dry-run');
    });

    it('should fail if target epic does not exist', async () => {
      const sprintYaml = `sprint:
  number: 11
epics:
  - id: epic-31
    stories:
      - id: "31-1"
        status: done
`;
      const sprintPath = join(TEST_DIR, 'current-sprint.yaml');
      writeFileSync(sprintPath, sprintYaml);

      const missingStories = [
        { key: 'MSSCI-11800', summary: '47-4: New story', status: 'To Do', storyId: '47-4' }
      ];

      const result = await importMissingStoriesToYaml({
        sprintPath,
        missingStories,
        targetEpicId: 'epic-47'  // Does not exist!
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('epic-47') || result.error?.includes('not found'));
    });

    it('should map Jira status to YAML status', async () => {
      const sprintYaml = `sprint:
  number: 11
epics:
  - id: epic-47
    stories:
      - id: "47-1"
        status: done
`;
      const sprintPath = join(TEST_DIR, 'current-sprint.yaml');
      writeFileSync(sprintPath, sprintYaml);

      const missingStories = [
        { key: 'MSSCI-100', summary: '47-2: Story', status: 'In Progress', storyId: '47-2' },
        { key: 'MSSCI-101', summary: '47-3: Story', status: 'Done', storyId: '47-3' },
        { key: 'MSSCI-102', summary: '47-4: Story', status: 'To Do', storyId: '47-4' }
      ];

      const result = await importMissingStoriesToYaml({
        sprintPath,
        missingStories,
        targetEpicId: 'epic-47'
      });

      assert.strictEqual(result.success, true);

      const content = readFileSync(sprintPath, 'utf-8');
      assert.ok(content.includes('status: in_progress') || content.includes('status: in-progress'));
      assert.ok(content.includes('status: done'));
      assert.ok(content.includes('status: backlog') || content.includes('status: todo'));
    });
  });

  // ============================================
  // Integration: Full detection flow
  // ============================================
  describe('Integration: Detect and report Jira-only stories', () => {

    it('should detect stories in Jira sprint but missing from YAML', async () => {
      // Setup: YAML with stories 47-1, 47-2, 47-3
      const sprintYaml = `sprint:
  number: 11
  jira_sprint_id: 275
  status: active
epics:
  - id: epic-47
    title: Jira Sync
    stories:
      - id: "47-1"
        title: Auto-create Jira epic
        jira: MSSCI-11797
        status: done
      - id: "47-2"
        title: Sync sprint numbers
        jira: MSSCI-11798
        status: done
      - id: "47-3"
        title: Detect Jira-only stories
        jira: MSSCI-11799
        status: in_progress
`;
      const sprintPath = join(TEST_DIR, 'current-sprint.yaml');
      writeFileSync(sprintPath, sprintYaml);

      // Step 1: Get YAML story IDs
      const yamlResult = await getYamlStoryIds({ sprintPath });
      assert.strictEqual(yamlResult.success, true);
      assert.strictEqual(yamlResult.storyIds?.length, 3);

      // Step 2: Mock Jira sprint issues (includes 47-4 and 47-5 not in YAML)
      const jiraIssues: SprintIssue[] = [
        { key: 'MSSCI-11797', summary: '47-1: Auto-create Jira epic', status: 'Done', labels: ['pennyfarthing'] },
        { key: 'MSSCI-11798', summary: '47-2: Sync sprint numbers', status: 'Done', labels: ['pennyfarthing'] },
        { key: 'MSSCI-11799', summary: '47-3: Detect Jira-only stories', status: 'In Progress', labels: ['pennyfarthing'] },
        { key: 'MSSCI-11800', summary: '47-4: Bidirectional sync', status: 'To Do', labels: ['pennyfarthing'] },
        { key: 'MSSCI-11801', summary: '47-5: Retrofit epics', status: 'To Do', labels: ['pennyfarthing'] }
      ];

      // Step 3: Find Jira-only stories
      const compareResult = await findJiraOnlyStories({
        jiraIssues,
        yamlStoryIds: yamlResult.storyIds!,
        filterLabel: 'pennyfarthing'
      });
      assert.strictEqual(compareResult.success, true);
      assert.strictEqual(compareResult.missingStories?.length, 2);

      // Step 4: Generate report
      const reportResult = await formatMissingStoriesReport({
        missingStories: compareResult.missingStories!,
        jiraBaseUrl: 'https://1898andco.atlassian.net'
      });
      assert.strictEqual(reportResult.success, true);
      assert.ok(reportResult.report?.includes('47-4'));
      assert.ok(reportResult.report?.includes('47-5'));
      assert.ok(reportResult.report?.includes('2 stories'));
    });
  });
});
