/**
 * Tests for Story 95-4: File-watch Observation Scope
 *
 * RED state tests for file change detection in the backseat agent.
 * These tests cover all acceptance criteria:
 *
 * AC1: Detect file create events in working tree
 * AC2: Detect file modify events in working tree
 * AC3: Detect file delete events in working tree
 * AC4: Detection within 5 seconds (poll interval ≤ 2s)
 * AC5: Non-blocking — functions return promptly, polling is async
 * AC6: Writes observations with file-watch trigger type via ObservationWriter
 * AC7: Context accumulation — tracks seen files, avoids redundant observations
 * AC8: Ignores non-source directories (.pennyfarthing/, .session/, node_modules/)
 * AC9: Error resilience — continues observing if a single write fails
 * AC10: Returns result objects ({success, error?}) per framework pattern
 *
 * Run with: npm test
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, rmSync, existsSync, writeFileSync, unlinkSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Import the module under test (does not exist yet — will cause import failure)
import {
  detectFileChanges,
  startFileWatcher,
  stopFileWatcher,
  createFileWatchScope,
  type FileChange,
  type FileWatchConfig,
  type FileWatchHandle,
  type FileWatchResult,
} from './file-watch.js';

// Import observation writer for integration tests
import {
  initObservationFile,
  parseObservationFile,
} from './observation-writer.js';

import type { ObservationWriterConfig } from './observation-writer.js';

// Get directory for test fixtures
const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DIR = join(__dirname, '__test_file_watch__');
const SESSION_DIR = join(TEST_DIR, '.session');
const WORK_DIR = join(TEST_DIR, 'workdir');

// =============================================================================
// Test Fixtures
// =============================================================================

const DEFAULT_POLL_MS = 100; // Fast for testing

const DEFAULT_CONFIG: FileWatchConfig = {
  workDir: WORK_DIR,
  sessionDir: SESSION_DIR,
  storyId: '95-4',
  agent: 'architect',
  persona: 'Will Bailey',
  phase: 'implement',
  pollIntervalMs: DEFAULT_POLL_MS,
  ignorePaths: ['.pennyfarthing/', '.session/', 'node_modules/'],
};

const OBS_CONFIG: ObservationWriterConfig = {
  storyId: '95-4',
  agent: 'architect',
  persona: 'Will Bailey',
  phase: 'implement',
  sessionDir: SESSION_DIR,
};

// =============================================================================
// Setup / Teardown
// =============================================================================

describe('95-4: File-watch Observation Scope', () => {

  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(SESSION_DIR, { recursive: true });
    mkdirSync(WORK_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  // ===========================================================================
  // AC1: Detect file create events
  // ===========================================================================

  describe('AC1: Detect file create events', () => {

    it('should detect a newly created file', async () => {
      // Baseline — no files yet
      const baseline = await detectFileChanges(DEFAULT_CONFIG);
      assert.ok(baseline.success);

      // Create a file
      writeFileSync(join(WORK_DIR, 'new-file.ts'), 'export const x = 1;');

      // Detect changes
      const result = await detectFileChanges(DEFAULT_CONFIG);
      assert.ok(result.success);
      assert.ok(result.data);
      assert.ok(result.data.length > 0, 'Should detect at least one change');

      const created = result.data.find((c: FileChange) => c.path.includes('new-file.ts'));
      assert.ok(created, 'Should find the created file');
      assert.strictEqual(created.event, 'create');
    });

    it('should detect multiple created files in a single poll', async () => {
      const baseline = await detectFileChanges(DEFAULT_CONFIG);
      assert.ok(baseline.success);

      writeFileSync(join(WORK_DIR, 'a.ts'), 'a');
      writeFileSync(join(WORK_DIR, 'b.ts'), 'b');
      writeFileSync(join(WORK_DIR, 'c.ts'), 'c');

      const result = await detectFileChanges(DEFAULT_CONFIG);
      assert.ok(result.success);
      assert.ok(result.data);
      assert.ok(result.data.length >= 3, `Expected ≥3 changes, got ${result.data.length}`);
    });

    it('should detect files created in subdirectories', async () => {
      const baseline = await detectFileChanges(DEFAULT_CONFIG);
      assert.ok(baseline.success);

      const subDir = join(WORK_DIR, 'src', 'components');
      mkdirSync(subDir, { recursive: true });
      writeFileSync(join(subDir, 'Widget.tsx'), 'export function Widget() {}');

      const result = await detectFileChanges(DEFAULT_CONFIG);
      assert.ok(result.success);
      assert.ok(result.data);

      const created = result.data.find((c: FileChange) => c.path.includes('Widget.tsx'));
      assert.ok(created, 'Should find file in subdirectory');
    });
  });

  // ===========================================================================
  // AC2: Detect file modify events
  // ===========================================================================

  describe('AC2: Detect file modify events', () => {

    it('should detect a modified file', async () => {
      // Create file first
      const filePath = join(WORK_DIR, 'existing.ts');
      writeFileSync(filePath, 'export const x = 1;');

      // Baseline with existing file
      const baseline = await detectFileChanges(DEFAULT_CONFIG);
      assert.ok(baseline.success);

      // Modify the file
      writeFileSync(filePath, 'export const x = 2;');

      const result = await detectFileChanges(DEFAULT_CONFIG);
      assert.ok(result.success);
      assert.ok(result.data);

      const modified = result.data.find((c: FileChange) => c.path.includes('existing.ts'));
      assert.ok(modified, 'Should find the modified file');
      assert.strictEqual(modified.event, 'modify');
    });
  });

  // ===========================================================================
  // AC3: Detect file delete events
  // ===========================================================================

  describe('AC3: Detect file delete events', () => {

    it('should detect a deleted file', async () => {
      // Create file first
      const filePath = join(WORK_DIR, 'to-delete.ts');
      writeFileSync(filePath, 'export const temp = true;');

      // Baseline
      const baseline = await detectFileChanges(DEFAULT_CONFIG);
      assert.ok(baseline.success);

      // Delete the file
      unlinkSync(filePath);

      const result = await detectFileChanges(DEFAULT_CONFIG);
      assert.ok(result.success);
      assert.ok(result.data);

      const deleted = result.data.find((c: FileChange) => c.path.includes('to-delete.ts'));
      assert.ok(deleted, 'Should find the deleted file');
      assert.strictEqual(deleted.event, 'delete');
    });
  });

  // ===========================================================================
  // AC4: Detection within 5 seconds (poll interval)
  // ===========================================================================

  describe('AC4: Detection within 5 seconds', () => {

    it('should accept poll interval ≤ 2000ms', () => {
      // Verify the config accepts a valid poll interval
      const config: FileWatchConfig = {
        ...DEFAULT_CONFIG,
        pollIntervalMs: 2000,
      };
      assert.strictEqual(config.pollIntervalMs, 2000);
    });

    it('should default poll interval to ≤ 2000ms when not specified', async () => {
      const configNoInterval: Omit<FileWatchConfig, 'pollIntervalMs'> & { pollIntervalMs?: number } = {
        workDir: WORK_DIR,
        sessionDir: SESSION_DIR,
        storyId: '95-4',
        agent: 'architect',
        persona: 'Will Bailey',
        phase: 'implement',
        ignorePaths: [],
      };

      // createFileWatchScope should use a default interval ≤ 2000ms
      const scope = createFileWatchScope(configNoInterval as FileWatchConfig);
      assert.ok(scope, 'Should create scope');
      assert.ok(scope.pollIntervalMs <= 2000, `Default poll interval should be ≤ 2000ms, got ${scope.pollIntervalMs}`);
    });
  });

  // ===========================================================================
  // AC5: Non-blocking — functions return promptly
  // ===========================================================================

  describe('AC5: Non-blocking', () => {

    it('detectFileChanges should resolve without long blocking', async () => {
      const start = Date.now();
      const result = await detectFileChanges(DEFAULT_CONFIG);
      const elapsed = Date.now() - start;

      assert.ok(result.success);
      // Single detection cycle should complete in < 5000ms
      assert.ok(elapsed < 5000, `detectFileChanges took ${elapsed}ms, expected < 5000ms`);
    });

    it('startFileWatcher should return handle immediately', async () => {
      const start = Date.now();
      const result = await startFileWatcher(DEFAULT_CONFIG);
      const elapsed = Date.now() - start;

      assert.ok(result.success);
      assert.ok(result.data, 'Should return a handle');
      // Start should be fast — sets up watcher, doesn't block
      assert.ok(elapsed < 1000, `startFileWatcher took ${elapsed}ms, expected < 1000ms`);

      // Cleanup
      if (result.data) {
        await stopFileWatcher(result.data);
      }
    });
  });

  // ===========================================================================
  // AC6: Writes observations with file-watch trigger type
  // ===========================================================================

  describe('AC6: Writes file-watch observations', () => {

    it('should write observation with file-watch trigger type on file create', async () => {
      // Init observation file
      const initResult = initObservationFile(OBS_CONFIG);
      assert.ok(initResult.success);
      assert.ok(initResult.data);

      // Start watcher
      const watchResult = await startFileWatcher({
        ...DEFAULT_CONFIG,
        observationFilePath: initResult.data.path,
      });
      assert.ok(watchResult.success);
      assert.ok(watchResult.data);

      // Create a file to trigger observation
      writeFileSync(join(WORK_DIR, 'trigger.ts'), 'export const trigger = true;');

      // Wait for at least one poll cycle
      await new Promise(resolve => setTimeout(resolve, DEFAULT_POLL_MS * 3));

      // Stop watcher
      await stopFileWatcher(watchResult.data);

      // Parse the observation file
      const parsed = parseObservationFile(initResult.data.path);
      assert.ok(parsed.success);
      assert.ok(parsed.data);
      assert.ok(parsed.data.entries.length > 0, 'Should have at least one observation entry');

      const entry = parsed.data.entries[0];
      assert.strictEqual(entry.triggerType, 'file-watch', 'Trigger type should be file-watch');
      assert.ok(entry.triggerDetail.includes('trigger.ts'), 'Trigger detail should mention the file');
    });

    it('should include event type (create/modify/delete) in trigger detail', async () => {
      const initResult = initObservationFile(OBS_CONFIG);
      assert.ok(initResult.success);
      assert.ok(initResult.data);

      const watchResult = await startFileWatcher({
        ...DEFAULT_CONFIG,
        observationFilePath: initResult.data.path,
      });
      assert.ok(watchResult.success);
      assert.ok(watchResult.data);

      // Create a file
      writeFileSync(join(WORK_DIR, 'event-type.ts'), 'content');

      await new Promise(resolve => setTimeout(resolve, DEFAULT_POLL_MS * 3));
      await stopFileWatcher(watchResult.data);

      const parsed = parseObservationFile(initResult.data.path);
      assert.ok(parsed.success);
      assert.ok(parsed.data);
      assert.ok(parsed.data.entries.length > 0);

      // Trigger detail should contain the event type
      const entry = parsed.data.entries[0];
      assert.ok(
        entry.triggerDetail.includes('create') ||
        entry.triggerDetail.includes('modify') ||
        entry.triggerDetail.includes('delete'),
        `Trigger detail should include event type, got: "${entry.triggerDetail}"`
      );
    });
  });

  // ===========================================================================
  // AC7: Context accumulation — no redundant observations
  // ===========================================================================

  describe('AC7: Context accumulation', () => {

    it('should not write duplicate observations for the same unchanged file', async () => {
      const initResult = initObservationFile(OBS_CONFIG);
      assert.ok(initResult.success);
      assert.ok(initResult.data);

      const watchResult = await startFileWatcher({
        ...DEFAULT_CONFIG,
        observationFilePath: initResult.data.path,
      });
      assert.ok(watchResult.success);
      assert.ok(watchResult.data);

      // Create a file
      writeFileSync(join(WORK_DIR, 'once.ts'), 'content');

      // Wait for multiple poll cycles
      await new Promise(resolve => setTimeout(resolve, DEFAULT_POLL_MS * 6));

      await stopFileWatcher(watchResult.data);

      const parsed = parseObservationFile(initResult.data.path);
      assert.ok(parsed.success);
      assert.ok(parsed.data);

      // File was created once and not modified again — should appear at most once
      const onceEntries = parsed.data.entries.filter(
        (e) => e.triggerDetail.includes('once.ts')
      );
      assert.strictEqual(onceEntries.length, 1, `File should appear exactly once, got ${onceEntries.length}`);
    });

    it('should write a new observation when a previously seen file changes again', async () => {
      const initResult = initObservationFile(OBS_CONFIG);
      assert.ok(initResult.success);
      assert.ok(initResult.data);

      const watchResult = await startFileWatcher({
        ...DEFAULT_CONFIG,
        observationFilePath: initResult.data.path,
      });
      assert.ok(watchResult.success);
      assert.ok(watchResult.data);

      const filePath = join(WORK_DIR, 'changing.ts');

      // Create file
      writeFileSync(filePath, 'version 1');
      await new Promise(resolve => setTimeout(resolve, DEFAULT_POLL_MS * 3));

      // Modify the same file
      writeFileSync(filePath, 'version 2');
      await new Promise(resolve => setTimeout(resolve, DEFAULT_POLL_MS * 3));

      await stopFileWatcher(watchResult.data);

      const parsed = parseObservationFile(initResult.data.path);
      assert.ok(parsed.success);
      assert.ok(parsed.data);

      const changingEntries = parsed.data.entries.filter(
        (e) => e.triggerDetail.includes('changing.ts')
      );
      // Should have at least 2 entries: create + modify
      assert.ok(changingEntries.length >= 2, `Expected ≥2 entries for file, got ${changingEntries.length}`);
    });
  });

  // ===========================================================================
  // AC8: Ignores non-source directories
  // ===========================================================================

  describe('AC8: Ignores non-source paths', () => {

    it('should ignore files in .pennyfarthing/ directory', async () => {
      const baseline = await detectFileChanges(DEFAULT_CONFIG);
      assert.ok(baseline.success);

      const ignoredDir = join(WORK_DIR, '.pennyfarthing');
      mkdirSync(ignoredDir, { recursive: true });
      writeFileSync(join(ignoredDir, 'config.yaml'), 'ignored: true');

      const result = await detectFileChanges(DEFAULT_CONFIG);
      assert.ok(result.success);

      const changes = result.data ?? [];
      const pfChanges = changes.filter((c: FileChange) => c.path.includes('.pennyfarthing'));
      assert.strictEqual(pfChanges.length, 0, 'Should not detect changes in .pennyfarthing/');
    });

    it('should ignore files in node_modules/ directory', async () => {
      const baseline = await detectFileChanges(DEFAULT_CONFIG);
      assert.ok(baseline.success);

      const ignoredDir = join(WORK_DIR, 'node_modules', 'some-pkg');
      mkdirSync(ignoredDir, { recursive: true });
      writeFileSync(join(ignoredDir, 'index.js'), 'module.exports = {}');

      const result = await detectFileChanges(DEFAULT_CONFIG);
      assert.ok(result.success);

      const changes = result.data ?? [];
      const nmChanges = changes.filter((c: FileChange) => c.path.includes('node_modules'));
      assert.strictEqual(nmChanges.length, 0, 'Should not detect changes in node_modules/');
    });

    it('should ignore files in .session/ directory', async () => {
      const baseline = await detectFileChanges(DEFAULT_CONFIG);
      assert.ok(baseline.success);

      writeFileSync(join(WORK_DIR, '.session', 'state.md'), '# state');

      const result = await detectFileChanges(DEFAULT_CONFIG);
      assert.ok(result.success);

      const changes = result.data ?? [];
      // Note: .session within WORK_DIR, not SESSION_DIR
      const sessionChanges = changes.filter((c: FileChange) => c.path.includes('.session'));
      assert.strictEqual(sessionChanges.length, 0, 'Should not detect changes in .session/');
    });

    it('should detect files in non-ignored directories', async () => {
      const baseline = await detectFileChanges(DEFAULT_CONFIG);
      assert.ok(baseline.success);

      const srcDir = join(WORK_DIR, 'src');
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(join(srcDir, 'app.ts'), 'export const app = true;');

      const result = await detectFileChanges(DEFAULT_CONFIG);
      assert.ok(result.success);
      assert.ok(result.data);
      assert.ok(result.data.length > 0, 'Should detect changes in src/');
    });
  });

  // ===========================================================================
  // AC9: Error resilience — continue if write fails
  // ===========================================================================

  describe('AC9: Error resilience', () => {

    it('should return error result for invalid work directory', async () => {
      const badConfig: FileWatchConfig = {
        ...DEFAULT_CONFIG,
        workDir: '/nonexistent/path/that/does/not/exist',
      };

      const result = await detectFileChanges(badConfig);
      // Should return error result, not throw
      assert.strictEqual(result.success, false);
      assert.ok(result.error, 'Should have error message');
    });

    it('startFileWatcher should continue polling after observation write error', async () => {
      // Use a non-existent observation file path to trigger write errors
      const watchResult = await startFileWatcher({
        ...DEFAULT_CONFIG,
        observationFilePath: '/nonexistent/obs.md',
      });
      assert.ok(watchResult.success, 'Watcher should start even with bad observation path');
      assert.ok(watchResult.data);

      // Create a file — should trigger detection but write will fail
      writeFileSync(join(WORK_DIR, 'resilient.ts'), 'content');

      // Wait for a few poll cycles — watcher should NOT crash
      await new Promise(resolve => setTimeout(resolve, DEFAULT_POLL_MS * 5));

      // Watcher should still be alive (stopFileWatcher should succeed)
      const stopResult = await stopFileWatcher(watchResult.data);
      assert.ok(stopResult.success, 'Should stop cleanly even after write errors');
    });
  });

  // ===========================================================================
  // AC10: Returns result objects per framework pattern
  // ===========================================================================

  describe('AC10: Result objects', () => {

    it('detectFileChanges should return {success, data?, error?}', async () => {
      const result = await detectFileChanges(DEFAULT_CONFIG);
      assert.ok(typeof result === 'object');
      assert.ok('success' in result, 'Result must have success field');
      if (result.success) {
        assert.ok('data' in result || result.data === undefined, 'Successful result may have data');
      } else {
        assert.ok('error' in result, 'Failed result must have error');
      }
    });

    it('startFileWatcher should return {success, data?: FileWatchHandle, error?}', async () => {
      const result = await startFileWatcher(DEFAULT_CONFIG);
      assert.ok(typeof result === 'object');
      assert.ok('success' in result);
      if (result.success && result.data) {
        assert.ok('handle' in result.data || 'stop' in result.data || typeof result.data === 'object',
          'Handle should be an object');
        await stopFileWatcher(result.data);
      }
    });

    it('stopFileWatcher should return {success, error?}', async () => {
      const watchResult = await startFileWatcher(DEFAULT_CONFIG);
      assert.ok(watchResult.success);
      assert.ok(watchResult.data);

      const stopResult = await stopFileWatcher(watchResult.data);
      assert.ok(typeof stopResult === 'object');
      assert.ok('success' in stopResult);
      assert.ok(stopResult.success);
    });
  });

  // ===========================================================================
  // Edge cases
  // ===========================================================================

  describe('Edge cases', () => {

    it('should handle empty working directory gracefully', async () => {
      const result = await detectFileChanges(DEFAULT_CONFIG);
      assert.ok(result.success);
      assert.ok(Array.isArray(result.data));
      assert.strictEqual(result.data.length, 0, 'No changes in empty directory');
    });

    it('should handle rapid successive file changes', async () => {
      const baseline = await detectFileChanges(DEFAULT_CONFIG);
      assert.ok(baseline.success);

      // Create many files rapidly
      for (let i = 0; i < 10; i++) {
        writeFileSync(join(WORK_DIR, `rapid-${i}.ts`), `content ${i}`);
      }

      const result = await detectFileChanges(DEFAULT_CONFIG);
      assert.ok(result.success);
      assert.ok(result.data);
      assert.strictEqual(result.data.length, 10, `Expected 10 changes, got ${result.data.length}`);
    });

    it('stopFileWatcher should be idempotent', async () => {
      const watchResult = await startFileWatcher(DEFAULT_CONFIG);
      assert.ok(watchResult.success);
      assert.ok(watchResult.data);

      // Stop twice — second should not throw
      const stop1 = await stopFileWatcher(watchResult.data);
      assert.ok(stop1.success);

      const stop2 = await stopFileWatcher(watchResult.data);
      assert.ok(stop2.success, 'Second stop should also succeed (idempotent)');
    });
  });
});
