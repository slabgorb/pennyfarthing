/**
 * Tests for Story 47-1: Auto-create Jira epic on local epic creation
 *
 * These tests define the contract for automatically creating Jira epics
 * when SM setup detects an epic without a jira field in sprint YAML.
 *
 * Acceptance Criteria:
 * 1. SM setup detects new epic without jira field
 * 2. Automatically creates Jira epic with matching title/description
 * 3. Updates sprint YAML with new Jira key
 * 4. Epic number derived from Jira ticket number
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
const TEST_DIR = join(__dirname, '__test_jira_epic_creation__');

// Import the jira epic creation functions (to be implemented)
import {
  createEpicInJira,
  ensureEpicHasJiraKey,
  extractEpicNumberFromJiraKey,
  updateSprintYamlWithJiraKey
} from './jira-epic-creation.js';

describe('Jira Epic Creation (47-1)', () => {

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

  describe('createEpicInJira() - Create epic in Jira', () => {

    it('should create epic with title and description', async () => {
      // AC2: Automatically creates Jira epic with matching title/description
      const result = await createEpicInJira({
        title: 'Test Epic',
        description: 'This is a test epic for automated creation',
        labels: ['pennyfarthing'],
        // Mock mode for testing without real Jira
        _mockResponse: {
          key: 'MSSCI-12345',
          url: 'https://1898andco.atlassian.net/browse/MSSCI-12345'
        }
      });

      assert.strictEqual(result.success, true, 'Creation should succeed');
      assert.ok(result.jiraKey, 'Should return Jira key');
      assert.strictEqual(result.jiraKey, 'MSSCI-12345');
      assert.ok(result.url, 'Should return URL');
    });

    it('should format epic title with epic number prefix', async () => {
      // AC2: Epic title should include epic number for clarity
      const result = await createEpicInJira({
        epicNumber: 47,
        title: 'Jira-Pennyfarthing Sync Improvements',
        description: 'Improve sync between Jira and Pennyfarthing sprint YAML',
        labels: ['pennyfarthing'],
        _mockResponse: { key: 'MSSCI-11798' }
      });

      assert.strictEqual(result.success, true);
      // The formatted title should be passed to Jira
      assert.ok(result.formattedTitle?.includes('Epic 47'),
        'Title should include epic number');
    });

    it('should include pennyfarthing label by default', async () => {
      const result = await createEpicInJira({
        title: 'Test Epic',
        description: 'Test description',
        _mockResponse: { key: 'MSSCI-12345' }
      });

      assert.strictEqual(result.success, true);
      assert.ok(result.labels?.includes('pennyfarthing'),
        'Should include pennyfarthing label');
    });

    it('should handle Jira API errors gracefully', async () => {
      const result = await createEpicInJira({
        title: 'Test Epic',
        description: 'Test description',
        _mockError: 'Connection refused'
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.error, 'Should have error message');
      assert.ok(result.error?.includes('Connection'), 'Error should be descriptive');
    });

    it('should support dry-run mode', async () => {
      const result = await createEpicInJira({
        title: 'Dry Run Epic',
        description: 'This should not actually be created',
        dryRun: true
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.dryRun, true);
      assert.ok(!result.jiraKey, 'Should not have real Jira key in dry-run');
    });
  });

  describe('ensureEpicHasJiraKey() - Check and create if missing', () => {

    it('should return existing jira key without creating', async () => {
      // AC1: SM setup detects new epic without jira field
      // This tests the "has jira field" case
      const epic = {
        id: 'epic-35',
        title: 'Cyclist UI/UX Improvements',
        jira: 'MSSCI-11715'
      };

      const result = await ensureEpicHasJiraKey({
        epic,
        _mockResponse: { key: 'MSSCI-99999' } // Should not be used
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.jiraKey, 'MSSCI-11715', 'Should return existing key');
      assert.strictEqual(result.created, false, 'Should not have created new epic');
    });

    it('should create Jira epic when jira field is missing', async () => {
      // AC1: SM setup detects new epic without jira field
      // AC2: Automatically creates Jira epic
      const epic = {
        id: 'epic-48',
        title: 'New Feature Epic',
        // No jira field!
      };

      const result = await ensureEpicHasJiraKey({
        epic,
        _mockResponse: { key: 'MSSCI-11850' }
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.jiraKey, 'MSSCI-11850');
      assert.strictEqual(result.created, true, 'Should indicate epic was created');
    });

    it('should handle empty string jira field as missing', async () => {
      const epic = {
        id: 'epic-49',
        title: 'Empty Jira Field Epic',
        jira: '' // Empty string should be treated as missing
      };

      const result = await ensureEpicHasJiraKey({
        epic,
        _mockResponse: { key: 'MSSCI-11851' }
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.created, true, 'Empty jira field should trigger creation');
    });

    it('should handle null jira field as missing', async () => {
      const epic = {
        id: 'epic-50',
        title: 'Null Jira Field Epic',
        jira: null // Null should be treated as missing
      };

      const result = await ensureEpicHasJiraKey({
        epic,
        _mockResponse: { key: 'MSSCI-11852' }
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.created, true, 'Null jira field should trigger creation');
    });

    it('should extract epic number from id for title formatting', async () => {
      const epic = {
        id: 'epic-47', // Contains the epic number
        title: 'Jira-Pennyfarthing Sync Improvements'
      };

      const result = await ensureEpicHasJiraKey({
        epic,
        _mockResponse: { key: 'MSSCI-11853' }
      });

      assert.strictEqual(result.success, true);
      // Should have used epic number 47 in the title
      assert.ok(result.formattedTitle?.includes('47'),
        'Should extract and use epic number from id');
    });

    it('should use description from epic if available', async () => {
      const epic = {
        id: 'epic-51',
        title: 'Epic with Description',
        description: 'This is the epic description that should be used'
      };

      const result = await ensureEpicHasJiraKey({
        epic,
        _mockResponse: { key: 'MSSCI-11854' }
      });

      assert.strictEqual(result.success, true);
      assert.ok(result.description?.includes('epic description'),
        'Should use epic description');
    });
  });

  describe('extractEpicNumberFromJiraKey() - Derive epic number', () => {

    it('should extract number from Jira key', () => {
      // AC4: Epic number derived from Jira ticket number
      const epicNumber = extractEpicNumberFromJiraKey('MSSCI-11796');

      assert.strictEqual(epicNumber, 11796);
    });

    it('should handle different project prefixes', () => {
      const epicNumber = extractEpicNumberFromJiraKey('TEST-123');

      assert.strictEqual(epicNumber, 123);
    });

    it('should return null for invalid format', () => {
      const epicNumber = extractEpicNumberFromJiraKey('invalid-key');

      assert.strictEqual(epicNumber, null);
    });

    it('should return null for empty input', () => {
      const epicNumber = extractEpicNumberFromJiraKey('');

      assert.strictEqual(epicNumber, null);
    });

    it('should return null for null input', () => {
      const epicNumber = extractEpicNumberFromJiraKey(null as unknown as string);

      assert.strictEqual(epicNumber, null);
    });
  });

  describe('updateSprintYamlWithJiraKey() - Update YAML', () => {

    it('should add jira field to epic in sprint YAML', async () => {
      // AC3: Updates sprint YAML with new Jira key
      const sprintYaml = `sprint:
  number: 11
epics:
  - id: epic-47
    title: Jira-Pennyfarthing Sync Improvements
    points: 15
    status: in_progress
    stories:
      - id: 47-1
        title: Auto-create Jira epic
        status: backlog
`;
      const sprintPath = join(TEST_DIR, 'current-sprint.yaml');
      writeFileSync(sprintPath, sprintYaml);

      const result = await updateSprintYamlWithJiraKey({
        sprintPath,
        epicId: 'epic-47',
        jiraKey: 'MSSCI-11796'
      });

      assert.strictEqual(result.success, true, 'Update should succeed');

      // Verify the file was updated
      const updatedContent = readFileSync(sprintPath, 'utf-8');
      assert.ok(updatedContent.includes('jira: MSSCI-11796'),
        'YAML should contain new jira key');
    });

    it('should not modify other fields when adding jira key', async () => {
      const sprintYaml = `sprint:
  number: 11
epics:
  - id: epic-47
    title: Test Epic Title
    points: 15
    priority: P1
    status: in_progress
`;
      const sprintPath = join(TEST_DIR, 'current-sprint.yaml');
      writeFileSync(sprintPath, sprintYaml);

      await updateSprintYamlWithJiraKey({
        sprintPath,
        epicId: 'epic-47',
        jiraKey: 'MSSCI-11800'
      });

      const updatedContent = readFileSync(sprintPath, 'utf-8');
      assert.ok(updatedContent.includes('title: Test Epic Title'),
        'Title should be preserved');
      assert.ok(updatedContent.includes('points: 15'),
        'Points should be preserved');
      assert.ok(updatedContent.includes('priority: P1'),
        'Priority should be preserved');
    });

    it('should handle epic id without "epic-" prefix', async () => {
      // Epic IDs can be "47" or "epic-47"
      const sprintYaml = `sprint:
  number: 11
epics:
  - id: "47"
    title: Numeric ID Epic
    status: in_progress
`;
      const sprintPath = join(TEST_DIR, 'current-sprint.yaml');
      writeFileSync(sprintPath, sprintYaml);

      const result = await updateSprintYamlWithJiraKey({
        sprintPath,
        epicId: '47',
        jiraKey: 'MSSCI-11801'
      });

      assert.strictEqual(result.success, true);
      const updatedContent = readFileSync(sprintPath, 'utf-8');
      assert.ok(updatedContent.includes('jira: MSSCI-11801'));
    });

    it('should fail gracefully if epic not found', async () => {
      const sprintYaml = `sprint:
  number: 11
epics:
  - id: epic-35
    title: Different Epic
`;
      const sprintPath = join(TEST_DIR, 'current-sprint.yaml');
      writeFileSync(sprintPath, sprintYaml);

      const result = await updateSprintYamlWithJiraKey({
        sprintPath,
        epicId: 'epic-99', // Does not exist
        jiraKey: 'MSSCI-11802'
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('not found'), 'Should mention epic not found');
    });

    it('should not overwrite existing jira key unless forced', async () => {
      const sprintYaml = `sprint:
  number: 11
epics:
  - id: epic-47
    title: Epic with Existing Jira
    jira: MSSCI-11700
`;
      const sprintPath = join(TEST_DIR, 'current-sprint.yaml');
      writeFileSync(sprintPath, sprintYaml);

      const result = await updateSprintYamlWithJiraKey({
        sprintPath,
        epicId: 'epic-47',
        jiraKey: 'MSSCI-11803'
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('already has'),
        'Should not overwrite existing key');

      // Verify original key preserved
      const updatedContent = readFileSync(sprintPath, 'utf-8');
      assert.ok(updatedContent.includes('jira: MSSCI-11700'),
        'Original key should be preserved');
    });

    it('should overwrite existing jira key when force option is true', async () => {
      const sprintYaml = `sprint:
  number: 11
epics:
  - id: epic-47
    title: Epic with Existing Jira
    jira: MSSCI-11700
`;
      const sprintPath = join(TEST_DIR, 'current-sprint.yaml');
      writeFileSync(sprintPath, sprintYaml);

      const result = await updateSprintYamlWithJiraKey({
        sprintPath,
        epicId: 'epic-47',
        jiraKey: 'MSSCI-11804',
        force: true
      });

      assert.strictEqual(result.success, true);
      const updatedContent = readFileSync(sprintPath, 'utf-8');
      assert.ok(updatedContent.includes('jira: MSSCI-11804'),
        'Should have new key with force option');
    });
  });

  describe('SM Setup Integration', () => {

    it('should detect epic without jira during story setup', async () => {
      // AC1: SM setup detects new epic without jira field
      // This tests the integration point in generic-sm-setup

      const sprintYaml = `sprint:
  number: 11
epics:
  - id: epic-48
    title: New Epic Without Jira
    status: in_progress
    stories:
      - id: 48-1
        title: First Story
        status: backlog
        points: 3
`;
      const sprintPath = join(TEST_DIR, 'current-sprint.yaml');
      writeFileSync(sprintPath, sprintYaml);

      // Import the SM setup check function (to be added)
      // This would be called during MODE=setup before story setup
      const { checkEpicJiraRequired } = await import('./jira-epic-creation.js');

      const result = await checkEpicJiraRequired({
        storyId: '48-1',
        sprintPath
      });

      assert.strictEqual(result.epicNeedsJira, true,
        'Should detect epic needs Jira key');
      assert.strictEqual(result.epicId, 'epic-48');
      assert.strictEqual(result.epicTitle, 'New Epic Without Jira');
    });

    it('should not flag epic that already has jira key', async () => {
      const sprintYaml = `sprint:
  number: 11
epics:
  - id: epic-35
    title: Epic With Jira
    jira: MSSCI-11715
    stories:
      - id: 35-1
        title: Story in Epic With Jira
        status: backlog
`;
      const sprintPath = join(TEST_DIR, 'current-sprint.yaml');
      writeFileSync(sprintPath, sprintYaml);

      const { checkEpicJiraRequired } = await import('./jira-epic-creation.js');

      const result = await checkEpicJiraRequired({
        storyId: '35-1',
        sprintPath
      });

      assert.strictEqual(result.epicNeedsJira, false,
        'Should not flag epic that has jira key');
    });
  });
});
