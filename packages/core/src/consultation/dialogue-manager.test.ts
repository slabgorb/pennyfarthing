/**
 * Tests for Story 86-3: Dialogue File Management
 *
 * RED state tests for the dialogue file persistence layer.
 * Dialogue files record all consultation exchanges between tandem agents,
 * following the format defined in ADR-0012 (lines 156-195).
 *
 * ACs covered:
 *   AC1: Dialogue file created at .session/{story-id}-dialogue.md on first consultation
 *   AC2: Each exchange appended with: timestamp, agents, question, response, outcome
 *   AC3: Outcome tracked: applied / deferred / rejected
 *   AC4: Summary section auto-generated: total exchanges, key decisions, time in tandem
 *   AC5: Dialogue file archived alongside session file on story completion
 *   AC6: Dialogue file readable by Reviewer for audit
 *
 * Run with: npm test
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  createDialogueContent,
  formatExchange,
  parseDialogueExchanges,
  generateSummary,
  appendExchangeToFile,
  updateOutcomeInFile,
  refreshSummary,
  archiveDialogue,
} from './dialogue-manager.js';

import type {
  DialogueHeader,
  DialogueExchange,
  Outcome,
} from './dialogue-manager.js';

// =============================================================================
// Test Fixtures
// =============================================================================

const VALID_HEADER: DialogueHeader = {
  storyId: '86-3',
  workflow: 'tdd-tandem',
  leader: 'dev',
  leaderCharacter: 'Jack Torrance',
  partner: 'architect',
  partnerCharacter: 'Andy Dufresne',
  startedAt: '2026-02-16T10:00:00Z',
};

const VALID_EXCHANGE: DialogueExchange = {
  number: 1,
  timestamp: '10:05',
  leader: 'dev',
  partner: 'architect',
  question: 'Should we use a class or functional approach for the dialogue manager?',
  recommendation: 'Use pure functions — they are easier to test and align with the existing consultation-protocol.ts pattern',
  confidence: 'high',
};

const SECOND_EXCHANGE: DialogueExchange = {
  number: 2,
  timestamp: '10:20',
  leader: 'dev',
  partner: 'architect',
  question: 'Should the shell wrapper call Node.js or use pure bash?',
  recommendation: 'Pure bash for the shell wrapper — keeps it dependency-free and consistent with other core scripts',
  confidence: 'medium',
  outcome: 'applied',
  outcomeNote: 'Implemented with sed/awk',
};

// =============================================================================
// Test Helpers
// =============================================================================

let tmpDir: string;

function setupTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dialogue-test-'));
  return dir;
}

function cleanupTmpDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

// =============================================================================
// AC1: Dialogue file created at .session/{story-id}-dialogue.md
// =============================================================================

describe('86-3: Dialogue File Management', () => {

  beforeEach(() => {
    tmpDir = setupTmpDir();
  });

  afterEach(() => {
    cleanupTmpDir(tmpDir);
  });

  describe('AC1: Dialogue file creation on first consultation', () => {

    it('should create initial dialogue content with correct header', () => {
      const content = createDialogueContent(VALID_HEADER);

      assert.ok(content.includes('# Tandem Dialogue: 86-3'),
        'Must include story ID in title');
      assert.ok(content.includes('**Workflow:** tdd-tandem'),
        'Must include workflow');
      assert.ok(content.includes('**Leader:** dev'),
        'Must include leader agent');
      assert.ok(content.includes('**Partner:** architect'),
        'Must include partner agent');
      assert.ok(content.includes('**Started:** 2026-02-16T10:00:00Z'),
        'Must include start timestamp');
    });

    it('should include character names when provided', () => {
      const content = createDialogueContent(VALID_HEADER);

      assert.ok(content.includes('Jack Torrance'),
        'Must include leader character');
      assert.ok(content.includes('Andy Dufresne'),
        'Must include partner character');
    });

    it('should handle missing character names gracefully', () => {
      const headerNoChars: DialogueHeader = {
        ...VALID_HEADER,
        leaderCharacter: undefined,
        partnerCharacter: undefined,
      };

      const content = createDialogueContent(headerNoChars);

      assert.ok(content.includes('**Leader:** dev'),
        'Must include leader without character');
      assert.ok(content.includes('**Partner:** architect'),
        'Must include partner without character');
    });

    it('should include empty summary section placeholder', () => {
      const content = createDialogueContent(VALID_HEADER);

      assert.ok(content.includes('## Summary'),
        'Must include Summary section');
      assert.ok(content.includes('**Total exchanges:** 0'),
        'Must include zero count initially');
    });

    it('should create file on first appendExchangeToFile when file missing', async () => {
      const dialoguePath = path.join(tmpDir, '86-3-dialogue.md');

      await appendExchangeToFile(dialoguePath, VALID_EXCHANGE, VALID_HEADER);

      assert.ok(fs.existsSync(dialoguePath),
        'File must be created automatically on first append');
    });

    it('should create file with header and first exchange', async () => {
      const dialoguePath = path.join(tmpDir, '86-3-dialogue.md');

      await appendExchangeToFile(dialoguePath, VALID_EXCHANGE, VALID_HEADER);

      const content = fs.readFileSync(dialoguePath, 'utf-8');
      assert.ok(content.includes('# Tandem Dialogue: 86-3'),
        'Must include header');
      assert.ok(content.includes('## Exchange 1'),
        'Must include first exchange');
    });
  });

  // =============================================================================
  // AC2: Each exchange appended with timestamp, agents, question, response, outcome
  // =============================================================================

  describe('AC2: Exchange format and appending', () => {

    it('should format exchange with timestamp and agent direction', () => {
      const formatted = formatExchange(VALID_EXCHANGE);

      assert.ok(formatted.includes('## Exchange 1'),
        'Must include exchange number');
      assert.ok(formatted.includes('**[10:05] dev → architect**'),
        'Must include timestamp and agent direction');
    });

    it('should include question as blockquote', () => {
      const formatted = formatExchange(VALID_EXCHANGE);

      assert.ok(formatted.includes('> Should we use a class or functional approach'),
        'Must include question as blockquote');
    });

    it('should include response from partner', () => {
      const formatted = formatExchange(VALID_EXCHANGE);

      assert.ok(formatted.includes('**[10:05] architect:**'),
        'Must include partner response header');
      assert.ok(formatted.includes('Use pure functions'),
        'Must include recommendation text');
    });

    it('should include confidence level', () => {
      const formatted = formatExchange(VALID_EXCHANGE);

      assert.ok(formatted.includes('high'),
        'Must include confidence level');
    });

    it('should include outcome when present', () => {
      const formatted = formatExchange(SECOND_EXCHANGE);

      assert.ok(formatted.includes('**Outcome:** applied'),
        'Must include outcome');
      assert.ok(formatted.includes('Implemented with sed/awk'),
        'Must include outcome note');
    });

    it('should show pending outcome when not yet decided', () => {
      const formatted = formatExchange(VALID_EXCHANGE);

      assert.ok(formatted.includes('**Outcome:** _pending_'),
        'Must show pending when no outcome set');
    });

    it('should append multiple exchanges sequentially', async () => {
      const dialoguePath = path.join(tmpDir, '86-3-dialogue.md');

      await appendExchangeToFile(dialoguePath, VALID_EXCHANGE, VALID_HEADER);
      await appendExchangeToFile(dialoguePath, SECOND_EXCHANGE);

      const content = fs.readFileSync(dialoguePath, 'utf-8');
      assert.ok(content.includes('## Exchange 1'), 'Must have exchange 1');
      assert.ok(content.includes('## Exchange 2'), 'Must have exchange 2');
    });

    it('should place exchanges before summary section', async () => {
      const dialoguePath = path.join(tmpDir, '86-3-dialogue.md');

      await appendExchangeToFile(dialoguePath, VALID_EXCHANGE, VALID_HEADER);

      const content = fs.readFileSync(dialoguePath, 'utf-8');
      const exchangeIdx = content.indexOf('## Exchange 1');
      const summaryIdx = content.indexOf('## Summary');
      assert.ok(exchangeIdx < summaryIdx,
        'Exchanges must appear before summary');
    });

    it('should separate exchanges with horizontal rules', () => {
      const formatted = formatExchange(VALID_EXCHANGE);

      assert.ok(formatted.includes('---'),
        'Must include separator');
    });
  });

  // =============================================================================
  // AC3: Outcome tracked: applied / deferred / rejected
  // =============================================================================

  describe('AC3: Outcome tracking', () => {

    it('should update outcome to applied', async () => {
      const dialoguePath = path.join(tmpDir, '86-3-dialogue.md');
      await appendExchangeToFile(dialoguePath, VALID_EXCHANGE, VALID_HEADER);

      const result = await updateOutcomeInFile(dialoguePath, 1, 'applied', 'Used pure functions');

      assert.strictEqual(result.success, true, 'Update should succeed');

      const content = fs.readFileSync(dialoguePath, 'utf-8');
      assert.ok(content.includes('**Outcome:** applied'),
        'Must update outcome to applied');
      assert.ok(content.includes('Used pure functions'),
        'Must include outcome note');
    });

    it('should update outcome to deferred', async () => {
      const dialoguePath = path.join(tmpDir, '86-3-dialogue.md');
      await appendExchangeToFile(dialoguePath, VALID_EXCHANGE, VALID_HEADER);

      await updateOutcomeInFile(dialoguePath, 1, 'deferred', 'Revisit in next phase');

      const content = fs.readFileSync(dialoguePath, 'utf-8');
      assert.ok(content.includes('**Outcome:** deferred'),
        'Must update outcome to deferred');
    });

    it('should update outcome to rejected', async () => {
      const dialoguePath = path.join(tmpDir, '86-3-dialogue.md');
      await appendExchangeToFile(dialoguePath, VALID_EXCHANGE, VALID_HEADER);

      await updateOutcomeInFile(dialoguePath, 1, 'rejected', 'Went with class approach instead');

      const content = fs.readFileSync(dialoguePath, 'utf-8');
      assert.ok(content.includes('**Outcome:** rejected'),
        'Must update outcome to rejected');
    });

    it('should update outcome without note', async () => {
      const dialoguePath = path.join(tmpDir, '86-3-dialogue.md');
      await appendExchangeToFile(dialoguePath, VALID_EXCHANGE, VALID_HEADER);

      const result = await updateOutcomeInFile(dialoguePath, 1, 'applied');

      assert.strictEqual(result.success, true);
      const content = fs.readFileSync(dialoguePath, 'utf-8');
      assert.ok(content.includes('**Outcome:** applied'),
        'Must update outcome without note');
    });

    it('should fail for non-existent exchange number', async () => {
      const dialoguePath = path.join(tmpDir, '86-3-dialogue.md');
      await appendExchangeToFile(dialoguePath, VALID_EXCHANGE, VALID_HEADER);

      const result = await updateOutcomeInFile(dialoguePath, 99, 'applied');

      assert.strictEqual(result.success, false, 'Should fail for missing exchange');
      assert.ok(result.error?.includes('99'), 'Error must mention exchange number');
    });

    it('should fail for non-existent file', async () => {
      const dialoguePath = path.join(tmpDir, 'nonexistent-dialogue.md');

      const result = await updateOutcomeInFile(dialoguePath, 1, 'applied');

      assert.strictEqual(result.success, false, 'Should fail for missing file');
    });
  });

  // =============================================================================
  // AC4: Summary auto-generated with total exchanges, key decisions, time
  // =============================================================================

  describe('AC4: Summary generation', () => {

    it('should generate summary with total exchange count', () => {
      const exchanges: DialogueExchange[] = [VALID_EXCHANGE, SECOND_EXCHANGE];
      const summary = generateSummary(exchanges, '2026-02-16T10:00:00Z');

      assert.ok(summary.includes('**Total exchanges:** 2'),
        'Must include exchange count');
    });

    it('should generate summary with key decisions from applied outcomes', () => {
      const exchanges: DialogueExchange[] = [
        { ...VALID_EXCHANGE, outcome: 'applied', outcomeNote: 'Went with pure functions' },
        { ...SECOND_EXCHANGE, outcome: 'applied', outcomeNote: 'Implemented with sed/awk' },
      ];
      const summary = generateSummary(exchanges, '2026-02-16T10:00:00Z');

      assert.ok(summary.includes('Went with pure functions'),
        'Must include first applied decision');
      assert.ok(summary.includes('Implemented with sed/awk'),
        'Must include second applied decision');
    });

    it('should not include rejected outcomes in key decisions', () => {
      const exchanges: DialogueExchange[] = [
        { ...VALID_EXCHANGE, outcome: 'rejected', outcomeNote: 'Did not adopt this' },
        { ...SECOND_EXCHANGE, outcome: 'applied', outcomeNote: 'Adopted this one' },
      ];
      const summary = generateSummary(exchanges, '2026-02-16T10:00:00Z');

      assert.ok(!summary.includes('Did not adopt this'),
        'Must not include rejected decisions');
      assert.ok(summary.includes('Adopted this one'),
        'Must include applied decisions');
    });

    it('should calculate time in tandem from exchanges', () => {
      const exchanges: DialogueExchange[] = [
        { ...VALID_EXCHANGE, timestamp: '10:05' },
        { ...SECOND_EXCHANGE, timestamp: '10:35' },
      ];
      const summary = generateSummary(exchanges, '2026-02-16T10:00:00Z');

      assert.ok(summary.includes('**Time in tandem:**'),
        'Must include time in tandem');
      // Time should span from first to last exchange: 30 min
      assert.ok(summary.includes('30m'),
        'Must calculate duration from exchange timestamps');
    });

    it('should handle single exchange for time calculation', () => {
      const exchanges: DialogueExchange[] = [VALID_EXCHANGE];
      const summary = generateSummary(exchanges, '2026-02-16T10:00:00Z');

      assert.ok(summary.includes('**Time in tandem:**'),
        'Must include time even for single exchange');
    });

    it('should handle exchanges with no applied outcomes', () => {
      const exchanges: DialogueExchange[] = [
        { ...VALID_EXCHANGE, outcome: 'deferred' },
      ];
      const summary = generateSummary(exchanges, '2026-02-16T10:00:00Z');

      assert.ok(summary.includes('**Key decisions:**'),
        'Must include key decisions heading');
      assert.ok(summary.includes('None'),
        'Must show None when no decisions applied');
    });

    it('should refresh summary in existing file', async () => {
      const dialoguePath = path.join(tmpDir, '86-3-dialogue.md');

      // Create file with exchange that has outcome
      const exchangeWithOutcome: DialogueExchange = {
        ...VALID_EXCHANGE,
        outcome: 'applied',
        outcomeNote: 'Adopted functional approach',
      };
      await appendExchangeToFile(dialoguePath, exchangeWithOutcome, VALID_HEADER);

      const result = await refreshSummary(dialoguePath);

      assert.strictEqual(result.success, true, 'Refresh should succeed');

      const content = fs.readFileSync(dialoguePath, 'utf-8');
      assert.ok(content.includes('**Total exchanges:** 1'),
        'Summary must show updated count');
      assert.ok(content.includes('Adopted functional approach'),
        'Summary must include applied decision');
    });
  });

  // =============================================================================
  // AC5: Dialogue file archived alongside session file on story completion
  // =============================================================================

  describe('AC5: Dialogue archival', () => {

    it('should copy dialogue to archive directory', async () => {
      const dialoguePath = path.join(tmpDir, '86-3-dialogue.md');
      const archiveDir = path.join(tmpDir, 'archive');
      fs.mkdirSync(archiveDir, { recursive: true });

      await appendExchangeToFile(dialoguePath, VALID_EXCHANGE, VALID_HEADER);

      const result = await archiveDialogue({
        dialoguePath,
        archiveDir,
        jiraKey: 'MSSCI-15200',
      });

      assert.strictEqual(result.success, true, 'Archive should succeed');
      const archivePath = path.join(archiveDir, 'MSSCI-15200-dialogue.md');
      assert.ok(fs.existsSync(archivePath),
        'Archived file must exist with Jira key prefix');
    });

    it('should use story ID when no Jira key provided', async () => {
      const dialoguePath = path.join(tmpDir, '86-3-dialogue.md');
      const archiveDir = path.join(tmpDir, 'archive');
      fs.mkdirSync(archiveDir, { recursive: true });

      await appendExchangeToFile(dialoguePath, VALID_EXCHANGE, VALID_HEADER);

      const result = await archiveDialogue({
        dialoguePath,
        archiveDir,
        storyId: '86-3',
      });

      assert.strictEqual(result.success, true);
      const archivePath = path.join(archiveDir, '86-3-dialogue.md');
      assert.ok(fs.existsSync(archivePath),
        'Archived file must exist with story ID prefix');
    });

    it('should preserve file content in archive', async () => {
      const dialoguePath = path.join(tmpDir, '86-3-dialogue.md');
      const archiveDir = path.join(tmpDir, 'archive');
      fs.mkdirSync(archiveDir, { recursive: true });

      await appendExchangeToFile(dialoguePath, VALID_EXCHANGE, VALID_HEADER);
      const original = fs.readFileSync(dialoguePath, 'utf-8');

      await archiveDialogue({ dialoguePath, archiveDir, jiraKey: 'MSSCI-15200' });

      const archived = fs.readFileSync(
        path.join(archiveDir, 'MSSCI-15200-dialogue.md'), 'utf-8');
      assert.strictEqual(archived, original,
        'Archived content must match original');
    });

    it('should create archive directory if it does not exist', async () => {
      const dialoguePath = path.join(tmpDir, '86-3-dialogue.md');
      const archiveDir = path.join(tmpDir, 'new-archive');

      await appendExchangeToFile(dialoguePath, VALID_EXCHANGE, VALID_HEADER);

      const result = await archiveDialogue({
        dialoguePath,
        archiveDir,
        jiraKey: 'MSSCI-15200',
      });

      assert.strictEqual(result.success, true);
      assert.ok(fs.existsSync(archiveDir), 'Archive dir must be created');
    });

    it('should fail gracefully when source file does not exist', async () => {
      const dialoguePath = path.join(tmpDir, 'nonexistent-dialogue.md');
      const archiveDir = path.join(tmpDir, 'archive');

      const result = await archiveDialogue({
        dialoguePath,
        archiveDir,
        jiraKey: 'MSSCI-15200',
      });

      assert.strictEqual(result.success, false, 'Should fail for missing source');
      assert.ok(result.error, 'Must include error message');
    });
  });

  // =============================================================================
  // AC6: Dialogue file readable by Reviewer for audit
  // =============================================================================

  describe('AC6: Readable format for audit', () => {

    it('should produce well-formed markdown', () => {
      const content = createDialogueContent(VALID_HEADER);

      // Check basic markdown structure
      assert.ok(content.startsWith('# Tandem Dialogue:'),
        'Must start with H1');
      assert.ok(content.includes('---'),
        'Must include horizontal rules');
      assert.ok(content.includes('## Summary'),
        'Must include H2 Summary');
    });

    it('should parse exchanges back from generated content', async () => {
      const dialoguePath = path.join(tmpDir, '86-3-dialogue.md');
      await appendExchangeToFile(dialoguePath, VALID_EXCHANGE, VALID_HEADER);
      await appendExchangeToFile(dialoguePath, SECOND_EXCHANGE);

      const content = fs.readFileSync(dialoguePath, 'utf-8');
      const parsed = parseDialogueExchanges(content);

      assert.strictEqual(parsed.length, 2, 'Must parse both exchanges');
      assert.strictEqual(parsed[0].number, 1);
      assert.strictEqual(parsed[1].number, 2);
    });

    it('should parse exchange fields correctly', async () => {
      const dialoguePath = path.join(tmpDir, '86-3-dialogue.md');
      await appendExchangeToFile(dialoguePath, SECOND_EXCHANGE, VALID_HEADER);

      const content = fs.readFileSync(dialoguePath, 'utf-8');
      const parsed = parseDialogueExchanges(content);

      assert.strictEqual(parsed.length, 1);
      assert.strictEqual(parsed[0].leader, 'dev');
      assert.strictEqual(parsed[0].partner, 'architect');
      assert.strictEqual(parsed[0].timestamp, '10:20');
      assert.strictEqual(parsed[0].outcome, 'applied');
    });

    it('should parse exchanges with pending outcome', async () => {
      const dialoguePath = path.join(tmpDir, '86-3-dialogue.md');
      await appendExchangeToFile(dialoguePath, VALID_EXCHANGE, VALID_HEADER);

      const content = fs.readFileSync(dialoguePath, 'utf-8');
      const parsed = parseDialogueExchanges(content);

      assert.strictEqual(parsed[0].outcome, undefined,
        'Pending outcome should parse as undefined');
    });

    it('should produce content that round-trips through parse', async () => {
      const dialoguePath = path.join(tmpDir, '86-3-dialogue.md');
      const exchangeWithOutcome: DialogueExchange = {
        ...VALID_EXCHANGE,
        outcome: 'applied',
        outcomeNote: 'Adopted this approach',
      };
      await appendExchangeToFile(dialoguePath, exchangeWithOutcome, VALID_HEADER);

      const content = fs.readFileSync(dialoguePath, 'utf-8');
      const parsed = parseDialogueExchanges(content);

      assert.strictEqual(parsed[0].question, VALID_EXCHANGE.question);
      assert.strictEqual(parsed[0].recommendation, VALID_EXCHANGE.recommendation);
      assert.strictEqual(parsed[0].outcome, 'applied');
      assert.strictEqual(parsed[0].outcomeNote, 'Adopted this approach');
    });
  });

  // =============================================================================
  // Result format compliance (framework pattern)
  // =============================================================================

  describe('Result format compliance', () => {

    it('should return {success, data?, error?} from appendExchangeToFile', async () => {
      const dialoguePath = path.join(tmpDir, '86-3-dialogue.md');

      const result = await appendExchangeToFile(dialoguePath, VALID_EXCHANGE, VALID_HEADER);

      assert.ok('success' in result, 'Must have success field');
      assert.strictEqual(typeof result.success, 'boolean');
    });

    it('should return {success, data?, error?} from updateOutcomeInFile', async () => {
      const dialoguePath = path.join(tmpDir, '86-3-dialogue.md');
      await appendExchangeToFile(dialoguePath, VALID_EXCHANGE, VALID_HEADER);

      const result = await updateOutcomeInFile(dialoguePath, 1, 'applied');

      assert.ok('success' in result, 'Must have success field');
      assert.strictEqual(typeof result.success, 'boolean');
    });

    it('should return {success, data?, error?} from refreshSummary', async () => {
      const dialoguePath = path.join(tmpDir, '86-3-dialogue.md');
      await appendExchangeToFile(dialoguePath, VALID_EXCHANGE, VALID_HEADER);

      const result = await refreshSummary(dialoguePath);

      assert.ok('success' in result, 'Must have success field');
      assert.strictEqual(typeof result.success, 'boolean');
    });

    it('should return {success, data?, error?} from archiveDialogue', async () => {
      const dialoguePath = path.join(tmpDir, '86-3-dialogue.md');
      const archiveDir = path.join(tmpDir, 'archive');
      await appendExchangeToFile(dialoguePath, VALID_EXCHANGE, VALID_HEADER);

      const result = await archiveDialogue({
        dialoguePath,
        archiveDir,
        jiraKey: 'MSSCI-15200',
      });

      assert.ok('success' in result, 'Must have success field');
      assert.strictEqual(typeof result.success, 'boolean');
    });
  });
});
