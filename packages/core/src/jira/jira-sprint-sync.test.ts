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
  addJiraSprintIdToYaml
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
  // AC4: Local sprint number matches Jira sprint
  // ============================================
  describe('validateSprintAlignment() - AC4: Local sprint matches Jira', () => {

    it('should return aligned when sprint numbers match', async () => {
      const sprintYaml = `sprint:
  number: 11
  jira_sprint_id: 275
  status: active
`;
      const sprintPath = join(TEST_DIR, 'current-sprint.yaml');
      writeFileSync(sprintPath, sprintYaml);

      const result = await validateSprintAlignment({
        sprintPath,
        _mockJiraSprint: {
          id: 275,
          name: 'Sprint 11',
          state: 'active'
        }
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.aligned, true);
      assert.strictEqual(result.localNumber, 11);
      assert.strictEqual(result.jiraSprintId, 275);
    });

    it('should detect misalignment when sprint names differ', async () => {
      const sprintYaml = `sprint:
  number: 11
  jira_sprint_id: 275
  status: active
`;
      const sprintPath = join(TEST_DIR, 'current-sprint.yaml');
      writeFileSync(sprintPath, sprintYaml);

      const result = await validateSprintAlignment({
        sprintPath,
        _mockJiraSprint: {
          id: 275,
          name: 'Sprint 12', // Mismatch!
          state: 'active'
        }
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.aligned, false);
      assert.ok(result.warning?.includes('mismatch'), 'Should warn about mismatch');
    });

    it('should detect when Jira sprint is closed but local is active', async () => {
      const sprintYaml = `sprint:
  number: 11
  jira_sprint_id: 275
  status: active
`;
      const sprintPath = join(TEST_DIR, 'current-sprint.yaml');
      writeFileSync(sprintPath, sprintYaml);

      const result = await validateSprintAlignment({
        sprintPath,
        _mockJiraSprint: {
          id: 275,
          name: 'Sprint 11',
          state: 'closed' // Jira sprint closed!
        }
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.aligned, false);
      assert.ok(result.warning?.includes('closed'), 'Should warn about closed sprint');
    });

    it('should handle missing jira_sprint_id in YAML', async () => {
      const sprintYaml = `sprint:
  number: 11
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

    it('should extract sprint number from Jira sprint name', async () => {
      const sprintYaml = `sprint:
  number: 11
  jira_sprint_id: 275
  status: active
`;
      const sprintPath = join(TEST_DIR, 'current-sprint.yaml');
      writeFileSync(sprintPath, sprintYaml);

      const result = await validateSprintAlignment({
        sprintPath,
        _mockJiraSprint: {
          id: 275,
          name: 'MSSCI Sprint 11', // Different format but same number
          state: 'active'
        }
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.aligned, true);
      assert.strictEqual(result.extractedNumber, 11);
    });
  });

  // ============================================
  // Integration tests
  // ============================================
  describe('Integration: Full sprint sync workflow', () => {

    it('should sync sprint with Jira and update YAML', async () => {
      // Start with no jira_sprint_id
      const sprintYaml = `sprint:
  number: 11
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
          name: 'Sprint 11',
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
