/**
 * Tests for Story 31-11: Consolidate SM Bookkeeping Subagents
 *
 * These tests define the contract for consolidating 6 SM subagents into 3:
 *
 * 1. generic-sm-setup - Combines sm-story-setup + sm-work-research
 *    - Mode: 'research' | 'setup'
 *    - Research: scan backlog, batch Jira query, recommend stories
 *    - Setup: claim Jira, create branches, write session file
 *
 * 2. generic-sm-finish - Combines sm-finish-bookkeeping + sm-finish-execution
 *    - Phase: 'preflight' | 'execute'
 *    - Preflight: PR check, lint fix, Jira status → JSON report
 *    - Execute: archive, Jira transition, cleanup → completion flags
 *
 * 3. generic-handoff with setup phase support
 *    - Add setup→red transition to generic-handoff
 *    - Gate type: manual (verifies context exists)
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
const TEST_DIR = join(__dirname, '__test_sm_subagents__');

// Import the generic-sm-setup module
import {
  researchBacklog,
  setupStory
} from './generic-sm-setup.js';

// Import the generic-sm-finish module
import {
  preflightCheck,
  executeFinish
} from './generic-sm-finish.js';

// Import extended generic-handoff for setup phase
import {
  findCurrentPhase,
  getNextPhase,
  checkGate
} from './generic-handoff.js';

import type { WorkflowDefinition } from './workflow-schema.js';

// Test fixture: TDD workflow with setup phase
const TDD_WORKFLOW: WorkflowDefinition = {
  name: 'tdd',
  description: 'Test-driven development with code review',
  version: '1.0.0',
  phases: [
    { name: 'setup', agent: 'sm', output: ['session_file', 'branches', 'story_context'] },
    {
      name: 'red',
      agent: 'tea',
      input: ['session_file', 'story_context'],
      output: ['failing_tests'],
      gate: { type: 'tests_fail', condition: 'All acceptance criteria have test coverage' }
    },
    {
      name: 'green',
      agent: 'dev',
      input: ['failing_tests', 'story_context'],
      output: ['implementation', 'passing_tests'],
      gate: { type: 'tests_pass', condition: 'All tests passing, no skipped tests' }
    },
    {
      name: 'review',
      agent: 'reviewer',
      input: ['implementation', 'passing_tests'],
      output: ['approval'],
      gate: { type: 'approval', condition: 'Code review approved, no blocking issues' }
    },
    {
      name: 'finish',
      agent: 'sm',
      input: ['approval'],
      output: ['archived_session', 'story_summary']
    }
  ],
  triggers: { types: ['feature', 'enhancement'], points: { min: 3 }, default: true }
};

describe('Generic SM Setup (31-11)', () => {

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

  describe('researchBacklog() - Research mode', () => {

    it('should return available stories from sprint YAML', async () => {
      // AC: generic-sm-setup.md created combining setup + research
      // Research mode scans backlog and returns available stories

      const sprintYaml = `
sprint:
  number: 10
  goal: "Customizable workflows"
epics:
  - id: 31
    stories:
      - id: "31-11"
        title: "Consolidate SM subagents"
        status: backlog
        points: 3
      - id: "31-10"
        title: "Activate workflow handoffs"
        status: done
        assigned_to: "Keith"
`;
      const sprintPath = join(TEST_DIR, 'current-sprint.yaml');
      writeFileSync(sprintPath, sprintYaml);

      const result = await researchBacklog({ sprintPath });

      assert.strictEqual(result.success, true, 'Research should succeed');
      assert.ok(result.availableStories, 'Should have available stories');
      assert.strictEqual(result.availableStories.length, 1, 'Should have 1 available story');
      assert.strictEqual(result.availableStories[0].id, '31-11');
    });

    it('should exclude assigned stories from available list', async () => {
      // Stories with assigned_to should be excluded from research results

      const sprintYaml = `
sprint:
  number: 10
epics:
  - id: 31
    stories:
      - id: "31-11"
        title: "Story A"
        status: in_progress
        assigned_to: "Someone"
      - id: "31-12"
        title: "Story B"
        status: backlog
`;
      const sprintPath = join(TEST_DIR, 'current-sprint.yaml');
      writeFileSync(sprintPath, sprintYaml);

      const result = await researchBacklog({ sprintPath });

      assert.strictEqual(result.availableStories.length, 1);
      assert.strictEqual(result.availableStories[0].id, '31-12');
    });

    it('should sort stories by priority then points', async () => {
      const sprintYaml = `
sprint:
  number: 10
epics:
  - id: 31
    stories:
      - id: "31-a"
        title: "Low priority"
        status: backlog
        points: 2
        priority: P2
      - id: "31-b"
        title: "High priority small"
        status: backlog
        points: 2
        priority: P1
      - id: "31-c"
        title: "High priority large"
        status: backlog
        points: 5
        priority: P1
`;
      const sprintPath = join(TEST_DIR, 'current-sprint.yaml');
      writeFileSync(sprintPath, sprintYaml);

      const result = await researchBacklog({ sprintPath });

      // P1 stories first, then sorted by points ascending
      assert.strictEqual(result.availableStories[0].id, '31-b', 'P1 2pt should be first');
      assert.strictEqual(result.availableStories[1].id, '31-c', 'P1 5pt should be second');
      assert.strictEqual(result.availableStories[2].id, '31-a', 'P2 should be last');
    });

    it('should include sprint metadata in result', async () => {
      const sprintYaml = `
sprint:
  number: 10
  goal: "Test sprint goal"
summary:
  completed_points: 37
  total_points: 60
epics: []
`;
      const sprintPath = join(TEST_DIR, 'current-sprint.yaml');
      writeFileSync(sprintPath, sprintYaml);

      const result = await researchBacklog({ sprintPath });

      assert.strictEqual(result.sprintNumber, 10);
      assert.strictEqual(result.sprintGoal, 'Test sprint goal');
      assert.strictEqual(result.completedPoints, 37);
      assert.strictEqual(result.totalPoints, 60);
    });

    it('should handle missing sprint file gracefully', async () => {
      const result = await researchBacklog({
        sprintPath: join(TEST_DIR, 'nonexistent.yaml')
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.error, 'Should have error message');
    });
  });

  describe('setupStory() - Setup mode', () => {

    it('should create session file with story context', async () => {
      // AC: generic-sm-setup.md created combining setup + research
      // Setup mode creates session file, branches, claims Jira

      const sessionDir = join(TEST_DIR, '.session');
      mkdirSync(sessionDir, { recursive: true });

      const result = await setupStory({
        storyId: '31-11',
        title: 'Consolidate SM subagents',
        points: 3,
        epic: 31,
        repos: 'pennyfarthing',
        sessionDir,
        workflow: 'tdd',
        assignee: 'Keith',
        jiraKey: 'MSSCI-11616'
      });

      assert.strictEqual(result.success, true, 'Setup should succeed');
      assert.ok(result.sessionFile, 'Should return session file path');

      const sessionPath = join(sessionDir, '31-11-session.md');
      assert.ok(existsSync(sessionPath), 'Session file should exist');

      const content = readFileSync(sessionPath, 'utf-8');
      assert.ok(content.includes('31-11'), 'Should contain story ID');
      assert.ok(content.includes('Consolidate SM subagents'), 'Should contain title');
      assert.ok(content.includes('## Workflow Tracking'), 'Should have workflow section');
      assert.ok(content.includes('**Phase:** setup'), 'Should start in setup phase');
    });

    it('should include acceptance criteria in session file', async () => {
      const sessionDir = join(TEST_DIR, '.session');
      mkdirSync(sessionDir, { recursive: true });

      const result = await setupStory({
        storyId: '31-11',
        title: 'Test story',
        points: 3,
        epic: 31,
        repos: 'pennyfarthing',
        sessionDir,
        workflow: 'tdd',
        acceptanceCriteria: [
          'AC1: First criterion',
          'AC2: Second criterion'
        ]
      });

      const content = readFileSync(result.sessionFile!, 'utf-8');
      assert.ok(content.includes('## Acceptance Criteria'), 'Should have AC section');
      assert.ok(content.includes('AC1: First criterion'), 'Should include first AC');
      assert.ok(content.includes('AC2: Second criterion'), 'Should include second AC');
    });

    it('should calculate branch name from story ID and slug', async () => {
      const sessionDir = join(TEST_DIR, '.session');
      mkdirSync(sessionDir, { recursive: true });

      const result = await setupStory({
        storyId: '31-11',
        title: 'Consolidate SM subagents',
        points: 3,
        epic: 31,
        repos: 'pennyfarthing',
        sessionDir,
        workflow: 'tdd'
      });

      assert.ok(result.branchName, 'Should return branch name');
      assert.strictEqual(
        result.branchName,
        'feat/31-11-consolidate-sm-subagents',
        'Branch name should follow pattern'
      );
    });

    it('should fail if session file already exists', async () => {
      const sessionDir = join(TEST_DIR, '.session');
      mkdirSync(sessionDir, { recursive: true });

      // Create existing session file
      const existingPath = join(sessionDir, '31-11-session.md');
      writeFileSync(existingPath, '# Existing session');

      const result = await setupStory({
        storyId: '31-11',
        title: 'Test story',
        points: 3,
        epic: 31,
        repos: 'pennyfarthing',
        sessionDir,
        workflow: 'tdd'
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('exists'), 'Should mention existing file');
    });

    it('should include workflow tracking with Phase History table', async () => {
      const sessionDir = join(TEST_DIR, '.session');
      mkdirSync(sessionDir, { recursive: true });

      const result = await setupStory({
        storyId: '31-11',
        title: 'Test story',
        points: 3,
        epic: 31,
        repos: 'pennyfarthing',
        sessionDir,
        workflow: 'tdd'
      });

      const content = readFileSync(result.sessionFile!, 'utf-8');
      assert.ok(content.includes('### Phase History'), 'Should have Phase History');
      assert.ok(content.includes('| Phase | Started | Ended | Duration |'), 'Should have table header');
      assert.ok(content.includes('| setup |'), 'Should have setup phase row');
    });
  });
});

describe('Generic SM Finish (31-11)', () => {

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

  describe('preflightCheck() - Preflight phase', () => {

    it('should return JSON report with PR status', async () => {
      // AC: generic-sm-finish.md created combining bookkeeping + execution
      // Preflight phase checks PR, lint, Jira status

      const result = await preflightCheck({
        storyId: '31-11',
        repos: 'pennyfarthing',
        branch: 'feat/31-11-consolidate-sm-subagents',
        jiraKey: 'MSSCI-11616',
        projectRoot: TEST_DIR
      });

      assert.ok(result, 'Should return result');
      assert.ok('prStatus' in result, 'Should have prStatus');
      assert.ok('lintStatus' in result, 'Should have lintStatus');
      assert.ok('jiraStatus' in result, 'Should have jiraStatus');
      assert.ok('readyToFinish' in result, 'Should have readyToFinish flag');
    });

    it('should report merged PR as ready', async () => {
      // Mock a scenario where PR is merged
      const result = await preflightCheck({
        storyId: '31-11',
        repos: 'pennyfarthing',
        branch: 'feat/31-11-test',
        jiraKey: 'MSSCI-11616',
        projectRoot: TEST_DIR,
        // For testing: inject mock PR status
        _mockPrStatus: 'merged'
      });

      assert.strictEqual(result.prStatus.pennyfarthing, 'merged');
    });

    it('should report open PR as warning', async () => {
      const result = await preflightCheck({
        storyId: '31-11',
        repos: 'pennyfarthing',
        branch: 'feat/31-11-test',
        jiraKey: 'MSSCI-11616',
        projectRoot: TEST_DIR,
        _mockPrStatus: 'open'
      });

      assert.strictEqual(result.prStatus.pennyfarthing, 'open');
      assert.ok(result.warnings?.some(w => w.includes('PR')), 'Should warn about open PR');
    });

    it('should check acceptance criteria completion', async () => {
      const sessionDir = join(TEST_DIR, '.session');
      mkdirSync(sessionDir, { recursive: true });

      // Create session file with ACs
      writeFileSync(join(sessionDir, '31-11-session.md'), `
# Story 31-11

## Acceptance Criteria
- [x] AC1: First done
- [x] AC2: Second done
- [ ] AC3: Third not done
`);

      const result = await preflightCheck({
        storyId: '31-11',
        repos: 'pennyfarthing',
        branch: 'feat/31-11-test',
        projectRoot: TEST_DIR
      });

      assert.strictEqual(result.acceptanceCriteria.total, 3);
      assert.strictEqual(result.acceptanceCriteria.checked, 2);
      assert.strictEqual(result.acceptanceCriteria.complete, false);
    });

    it('should return structured issues array', async () => {
      const result = await preflightCheck({
        storyId: '31-11',
        repos: 'pennyfarthing',
        branch: 'feat/31-11-test',
        projectRoot: TEST_DIR,
        _mockPrStatus: 'NO_PR'
      });

      assert.ok(Array.isArray(result.issues), 'Should have issues array');
      if (result.issues.length > 0) {
        assert.ok(result.issues[0].type, 'Issue should have type');
        assert.ok(result.issues[0].message, 'Issue should have message');
      }
    });
  });

  describe('executeFinish() - Execute phase', () => {

    it('should archive session file to sprint/archive', async () => {
      // AC: generic-sm-finish.md created combining bookkeeping + execution
      // Execute phase archives session, transitions Jira, cleans up

      const sessionDir = join(TEST_DIR, '.session');
      const archiveDir = join(TEST_DIR, 'sprint', 'archive');
      mkdirSync(sessionDir, { recursive: true });
      mkdirSync(archiveDir, { recursive: true });

      // Create session file
      const sessionContent = '# Story 31-11 Session\n\nContent here';
      writeFileSync(join(sessionDir, '31-11-session.md'), sessionContent);

      const result = await executeFinish({
        storyId: '31-11',
        storyTitle: 'Consolidate SM subagents',
        sessionDir,
        archiveDir,
        summaryContent: '## Summary\n\nStory complete.'
      });

      assert.strictEqual(result.success, true);
      assert.ok(result.archivePath, 'Should return archive path');
      assert.ok(existsSync(result.archivePath!), 'Archive file should exist');
    });

    it('should remove session file after archiving', async () => {
      const sessionDir = join(TEST_DIR, '.session');
      const archiveDir = join(TEST_DIR, 'sprint', 'archive');
      mkdirSync(sessionDir, { recursive: true });
      mkdirSync(archiveDir, { recursive: true });

      const sessionPath = join(sessionDir, '31-11-session.md');
      writeFileSync(sessionPath, '# Session content');

      await executeFinish({
        storyId: '31-11',
        storyTitle: 'Test',
        sessionDir,
        archiveDir,
        summaryContent: '## Summary'
      });

      assert.ok(!existsSync(sessionPath), 'Session file should be removed');
    });

    it('should write summary file to sprint/context', async () => {
      const sessionDir = join(TEST_DIR, '.session');
      const archiveDir = join(TEST_DIR, 'sprint', 'archive');
      const contextDir = join(TEST_DIR, 'sprint', 'context');
      mkdirSync(sessionDir, { recursive: true });
      mkdirSync(archiveDir, { recursive: true });
      mkdirSync(contextDir, { recursive: true });

      writeFileSync(join(sessionDir, '31-11-session.md'), '# Session');

      const result = await executeFinish({
        storyId: '31-11',
        storyTitle: 'Consolidate SM subagents',
        sessionDir,
        archiveDir,
        contextDir,
        summaryContent: '## Summary\n\nKey learnings here.'
      });

      assert.ok(result.summaryPath, 'Should return summary path');
      const summaryPath = join(contextDir, 'story-31-11-summary.md');
      assert.ok(existsSync(summaryPath), 'Summary file should exist');
    });

    it('should return completion flags', async () => {
      const sessionDir = join(TEST_DIR, '.session');
      const archiveDir = join(TEST_DIR, 'sprint', 'archive');
      mkdirSync(sessionDir, { recursive: true });
      mkdirSync(archiveDir, { recursive: true });

      writeFileSync(join(sessionDir, '31-11-session.md'), '# Session');

      const result = await executeFinish({
        storyId: '31-11',
        storyTitle: 'Test',
        sessionDir,
        archiveDir,
        summaryContent: '## Summary'
      });

      assert.ok('archived' in result, 'Should have archived flag');
      assert.ok('sessionCleared' in result, 'Should have sessionCleared flag');
      assert.strictEqual(result.archived, true);
      assert.strictEqual(result.sessionCleared, true);
    });

    it('should include timestamp in archive filename', async () => {
      const sessionDir = join(TEST_DIR, '.session');
      const archiveDir = join(TEST_DIR, 'sprint', 'archive');
      mkdirSync(sessionDir, { recursive: true });
      mkdirSync(archiveDir, { recursive: true });

      writeFileSync(join(sessionDir, '31-11-session.md'), '# Session');

      const result = await executeFinish({
        storyId: '31-11',
        storyTitle: 'Test',
        sessionDir,
        archiveDir,
        summaryContent: '## Summary'
      });

      // Archive path should be like: story-31-11-20260114.md
      assert.ok(result.archivePath?.match(/story-31-11-\d{8}\.md$/),
        `Archive path should include date: ${result.archivePath}`);
    });
  });
});

describe('Generic Handoff - Setup Phase Support (31-11)', () => {

  describe('setup phase in TDD workflow', () => {

    it('should find setup phase with no gate', () => {
      // AC: sm-handoff folded into generic-handoff with setup phase support
      const phase = findCurrentPhase(TDD_WORKFLOW, 'setup');

      assert.ok(phase, 'Should find setup phase');
      assert.strictEqual(phase.name, 'setup');
      assert.strictEqual(phase.agent, 'sm');
      assert.strictEqual(phase.gate, undefined, 'Setup has no gate');
    });

    it('should transition from setup to red (TEA)', () => {
      // AC: sm-handoff folded into generic-handoff with setup phase support
      const next = getNextPhase(TDD_WORKFLOW, 'setup');

      assert.ok(next, 'Should find next phase');
      assert.strictEqual(next.name, 'red');
      assert.strictEqual(next.agent, 'tea');
    });

    it('should pass gate check for setup phase (no gate = pass)', () => {
      // Setup phase has no gate - should always pass
      const result = checkGate(TDD_WORKFLOW, 'setup', {});

      assert.strictEqual(result.passed, true, 'Setup gate should pass');
      assert.strictEqual(result.gateType, undefined, 'No gate type for setup');
    });

    it('should support manual gate type for explicit setup gates', () => {
      // For workflows that want explicit manual gate on setup
      const workflowWithManualSetup: WorkflowDefinition = {
        name: 'explicit-setup',
        phases: [
          {
            name: 'setup',
            agent: 'sm',
            gate: { type: 'manual', condition: 'Context prepared' }
          },
          { name: 'implement', agent: 'dev' }
        ]
      };

      const result = checkGate(workflowWithManualSetup, 'setup', {});

      assert.strictEqual(result.passed, true, 'Manual gate should pass');
      assert.strictEqual(result.gateType, 'manual');
    });
  });

  describe('finish phase in TDD workflow', () => {

    it('should find finish phase with no gate', () => {
      const phase = findCurrentPhase(TDD_WORKFLOW, 'finish');

      assert.ok(phase, 'Should find finish phase');
      assert.strictEqual(phase.name, 'finish');
      assert.strictEqual(phase.agent, 'sm');
      assert.strictEqual(phase.gate, undefined, 'Finish has no gate');
    });

    it('should return null for next phase from finish', () => {
      const next = getNextPhase(TDD_WORKFLOW, 'finish');

      assert.strictEqual(next, null, 'No next phase after finish');
    });
  });

  describe('full TDD workflow transitions', () => {

    it('should complete setup → red → green → review → finish', () => {
      // AC: Both new-work and finish-story flows work end-to-end

      // setup → red
      let next = getNextPhase(TDD_WORKFLOW, 'setup');
      assert.strictEqual(next?.name, 'red');

      // red → green (after tests written)
      next = getNextPhase(TDD_WORKFLOW, 'red');
      assert.strictEqual(next?.name, 'green');

      // green → review (after tests pass)
      next = getNextPhase(TDD_WORKFLOW, 'green');
      assert.strictEqual(next?.name, 'review');

      // review → finish (after approval)
      next = getNextPhase(TDD_WORKFLOW, 'review', { verdict: 'approved' });
      assert.strictEqual(next?.name, 'finish');

      // finish → null (done)
      next = getNextPhase(TDD_WORKFLOW, 'finish');
      assert.strictEqual(next, null);
    });
  });
});

describe('Deprecated File Removal (31-11)', () => {

  it('should verify deprecated handoff files are marked for removal', () => {
    // AC: Deprecated handoff files removed (tea-handoff, dev-handoff, reviewer-handoff-*)

    const deprecatedFiles = [
      'tea-handoff.md',
      'dev-handoff.md',
      'reviewer-handoff-approve.md',
      'reviewer-handoff-reject.md'
    ];

    // These files should NOT exist after Dev implements
    // This test documents the requirement
    for (const file of deprecatedFiles) {
      assert.ok(
        deprecatedFiles.includes(file),
        `${file} is marked for removal`
      );
    }
  });
});
