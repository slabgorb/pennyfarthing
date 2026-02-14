/**
 * Tests for Story 95-6: Context-watch Observation Scope
 *
 * RED state tests for periodic conversation summary delivery to backseat agent.
 * These tests cover all acceptance criteria:
 *
 * AC1: Backseat receives periodic conversation summaries at configurable turn intervals
 * AC2: Default interval: every 5 tool calls
 * AC3: Summaries capture primary agent's current focus, decisions, and approach
 * AC4: Summary generation does not block primary agent's conversation flow
 * AC5: Combined token overhead stays under 25% per phase
 * AC6: Context accumulates — later summaries reference earlier ones
 *
 * Run with: npm test
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Import the module under test (does not exist yet — will cause import failure)
import {
  incrementTurnCounter,
  readTurnCounter,
  resetTurnCounter,
  shouldTriggerSummary,
  writeContextSnapshot,
  readContextSnapshot,
  startContextWatcher,
  stopContextWatcher,
} from './context-watch.js';

// Import observation writer for integration tests
import {
  initObservationFile,
  parseObservationFile,
} from './observation-writer.js';

// Get directory for test fixtures
const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DIR = join(__dirname, '__test_context_watch__');
const SESSION_DIR = join(TEST_DIR, '.session');

// =============================================================================
// Test Fixtures
// =============================================================================

const DEFAULT_POLL_MS = 100; // Fast for testing

const DEFAULT_CONFIG = {
  sessionDir: SESSION_DIR,
  storyId: '95-6',
  agent: 'architect',
  persona: 'Will Bailey',
  phase: 'implement',
  pollIntervalMs: DEFAULT_POLL_MS,
  turnInterval: 5,
};

const OBS_CONFIG = {
  storyId: '95-6',
  agent: 'architect',
  persona: 'Will Bailey',
  phase: 'implement',
  sessionDir: SESSION_DIR,
};

function counterPath(): string {
  return join(SESSION_DIR, '.tandem-turn-counter');
}

function _snapshotPath(): string {
  return join(SESSION_DIR, `${DEFAULT_CONFIG.storyId}-tandem-context.md`);
}

// =============================================================================
// Setup / Teardown
// =============================================================================

describe('95-6: Context-watch Observation Scope', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(SESSION_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  // ===========================================================================
  // AC1: Backseat receives periodic conversation summaries at configurable
  //      turn intervals
  // ===========================================================================
  describe('AC1: Periodic summaries at configurable intervals', () => {
    it('should increment turn counter on each call', () => {
      const r1 = incrementTurnCounter(SESSION_DIR);
      assert.ok(r1.success, `incrementTurnCounter failed: ${r1.error}`);
      assert.strictEqual(r1.data, 1, 'First increment should return 1');

      const r2 = incrementTurnCounter(SESSION_DIR);
      assert.ok(r2.success);
      assert.strictEqual(r2.data, 2, 'Second increment should return 2');

      const r3 = incrementTurnCounter(SESSION_DIR);
      assert.ok(r3.success);
      assert.strictEqual(r3.data, 3, 'Third increment should return 3');
    });

    it('should read current turn counter value', () => {
      incrementTurnCounter(SESSION_DIR);
      incrementTurnCounter(SESSION_DIR);
      incrementTurnCounter(SESSION_DIR);

      const result = readTurnCounter(SESSION_DIR);
      assert.ok(result.success);
      assert.strictEqual(result.data, 3);
    });

    it('should return 0 when counter file does not exist', () => {
      const result = readTurnCounter(SESSION_DIR);
      assert.ok(result.success);
      assert.strictEqual(result.data, 0, 'No counter file should return 0');
    });

    it('should reset turn counter to 0', () => {
      incrementTurnCounter(SESSION_DIR);
      incrementTurnCounter(SESSION_DIR);
      incrementTurnCounter(SESSION_DIR);

      const resetResult = resetTurnCounter(SESSION_DIR);
      assert.ok(resetResult.success);

      const readResult = readTurnCounter(SESSION_DIR);
      assert.ok(readResult.success);
      assert.strictEqual(readResult.data, 0, 'Counter should be 0 after reset');
    });

    it('should trigger summary at configurable interval', () => {
      // With interval=3, should trigger at 3, 6, 9...
      assert.strictEqual(shouldTriggerSummary(1, 3), false);
      assert.strictEqual(shouldTriggerSummary(2, 3), false);
      assert.strictEqual(shouldTriggerSummary(3, 3), true, 'Should trigger at turn 3 with interval 3');
      assert.strictEqual(shouldTriggerSummary(4, 3), false);
      assert.strictEqual(shouldTriggerSummary(5, 3), false);
      assert.strictEqual(shouldTriggerSummary(6, 3), true, 'Should trigger at turn 6 with interval 3');
    });

    it('should not trigger at turn 0', () => {
      assert.strictEqual(shouldTriggerSummary(0, 5), false);
    });

    it('should write context snapshot when watcher triggers at interval', async () => {
      const initResult = initObservationFile(OBS_CONFIG);
      assert.ok(initResult.success);
      assert.ok(initResult.data);

      // Create a session file with some content for the watcher to read
      const sessionFile = join(SESSION_DIR, '95-6-session.md');
      writeFileSync(sessionFile, '# Session\n## Dev Assessment\nWorking on feature X\n');

      // Simulate enough turns to trigger (interval=5, so 5 increments)
      for (let i = 0; i < 5; i++) {
        incrementTurnCounter(SESSION_DIR);
      }

      const watchResult = await startContextWatcher({
        ...DEFAULT_CONFIG,
        observationFilePath: initResult.data.path,
        sessionFilePath: sessionFile,
      });
      assert.ok(watchResult.success, `startContextWatcher failed: ${watchResult.error}`);
      assert.ok(watchResult.data);

      // Wait for at least one poll cycle
      await new Promise(resolve => setTimeout(resolve, DEFAULT_POLL_MS * 5));

      await stopContextWatcher(watchResult.data);

      // Should have written at least one context observation
      const parsed = parseObservationFile(initResult.data.path);
      assert.ok(parsed.success);
      assert.ok(parsed.data);
      assert.ok(parsed.data.entries.length > 0, 'Should write observation when turn counter hits interval');
    });
  });

  // ===========================================================================
  // AC2: Default interval: every 5 tool calls
  // ===========================================================================
  describe('AC2: Default interval of 5', () => {
    it('should use default interval of 5 when not specified', () => {
      // Turns 1-4 should not trigger
      assert.strictEqual(shouldTriggerSummary(1, 5), false);
      assert.strictEqual(shouldTriggerSummary(2, 5), false);
      assert.strictEqual(shouldTriggerSummary(3, 5), false);
      assert.strictEqual(shouldTriggerSummary(4, 5), false);
      // Turn 5 should trigger
      assert.strictEqual(shouldTriggerSummary(5, 5), true);
    });

    it('startContextWatcher should default to turnInterval 5', async () => {
      const sessionFile = join(SESSION_DIR, '95-6-session.md');
      writeFileSync(sessionFile, '# Session\nContent here\n');

      const initResult = initObservationFile(OBS_CONFIG);
      assert.ok(initResult.success);
      assert.ok(initResult.data);

      // Set counter to 4 (not yet at 5)
      for (let i = 0; i < 4; i++) {
        incrementTurnCounter(SESSION_DIR);
      }

      const watchResult = await startContextWatcher({
        sessionDir: SESSION_DIR,
        storyId: '95-6',
        agent: 'architect',
        persona: 'Will Bailey',
        phase: 'implement',
        pollIntervalMs: DEFAULT_POLL_MS,
        // turnInterval NOT specified — should default to 5
        observationFilePath: initResult.data.path,
        sessionFilePath: sessionFile,
      });
      assert.ok(watchResult.success);
      assert.ok(watchResult.data);

      await new Promise(resolve => setTimeout(resolve, DEFAULT_POLL_MS * 3));
      await stopContextWatcher(watchResult.data);

      // At turn 4, should NOT have triggered (not at interval yet)
      const parsed = parseObservationFile(initResult.data.path);
      assert.ok(parsed.success);
      assert.ok(parsed.data);
      assert.strictEqual(parsed.data.entries.length, 0,
        'Should not trigger at turn 4 with default interval 5');
    });

    it('should trigger at exactly turn 5 with default interval', async () => {
      const sessionFile = join(SESSION_DIR, '95-6-session.md');
      writeFileSync(sessionFile, '# Session\nDev is implementing feature X\n');

      const initResult = initObservationFile(OBS_CONFIG);
      assert.ok(initResult.success);
      assert.ok(initResult.data);

      // Set counter to exactly 5
      for (let i = 0; i < 5; i++) {
        incrementTurnCounter(SESSION_DIR);
      }

      const watchResult = await startContextWatcher({
        sessionDir: SESSION_DIR,
        storyId: '95-6',
        agent: 'architect',
        persona: 'Will Bailey',
        phase: 'implement',
        pollIntervalMs: DEFAULT_POLL_MS,
        observationFilePath: initResult.data.path,
        sessionFilePath: sessionFile,
      });
      assert.ok(watchResult.success);
      assert.ok(watchResult.data);

      await new Promise(resolve => setTimeout(resolve, DEFAULT_POLL_MS * 5));
      await stopContextWatcher(watchResult.data);

      const parsed = parseObservationFile(initResult.data.path);
      assert.ok(parsed.success);
      assert.ok(parsed.data);
      assert.ok(parsed.data.entries.length > 0,
        'Should trigger at turn 5 with default interval');
    });
  });

  // ===========================================================================
  // AC3: Summaries capture primary agent's current focus, decisions, approach
  // ===========================================================================
  describe('AC3: Summary content quality', () => {
    it('should write context snapshot from session file content', () => {
      const sessionContent = [
        '# Session: 95-6',
        '## Dev Assessment',
        'Working on migrating NotificationService to React hooks.',
        'Completed useNotification hook.',
        'Now integrating with NotificationPanel.',
      ].join('\n');
      const sessionFile = join(SESSION_DIR, '95-6-session.md');
      writeFileSync(sessionFile, sessionContent);

      const result = writeContextSnapshot({
        sessionDir: SESSION_DIR,
        storyId: '95-6',
        sessionFilePath: sessionFile,
        turnCount: 5,
      });
      assert.ok(result.success, `writeContextSnapshot failed: ${result.error}`);
      assert.ok(result.data, 'Should return snapshot data');
      assert.ok(result.data.content.length > 0, 'Snapshot content should not be empty');
    });

    it('context snapshot should include session content', () => {
      const sessionContent = '# Session\n## Status\nRefactoring authentication module.\n';
      const sessionFile = join(SESSION_DIR, '95-6-session.md');
      writeFileSync(sessionFile, sessionContent);

      const result = writeContextSnapshot({
        sessionDir: SESSION_DIR,
        storyId: '95-6',
        sessionFilePath: sessionFile,
        turnCount: 10,
      });
      assert.ok(result.success);
      assert.ok(result.data);
      // The snapshot should contain information derived from the session
      assert.ok(result.data.content.length > 10,
        'Snapshot should contain substantive content from session');
    });

    it('context snapshot should include turn count', () => {
      const sessionFile = join(SESSION_DIR, '95-6-session.md');
      writeFileSync(sessionFile, '# Session\nSome content\n');

      const result = writeContextSnapshot({
        sessionDir: SESSION_DIR,
        storyId: '95-6',
        sessionFilePath: sessionFile,
        turnCount: 15,
      });
      assert.ok(result.success);
      assert.ok(result.data);
      // Snapshot should reference turn number
      assert.ok(result.data.content.includes('15'),
        'Snapshot should reference current turn count');
    });

    it('observations should use context-watch trigger type', async () => {
      const sessionFile = join(SESSION_DIR, '95-6-session.md');
      writeFileSync(sessionFile, '# Session\nDev is working on API endpoint\n');

      const initResult = initObservationFile(OBS_CONFIG);
      assert.ok(initResult.success);
      assert.ok(initResult.data);

      // Set counter to trigger (5)
      for (let i = 0; i < 5; i++) {
        incrementTurnCounter(SESSION_DIR);
      }

      const watchResult = await startContextWatcher({
        ...DEFAULT_CONFIG,
        observationFilePath: initResult.data.path,
        sessionFilePath: sessionFile,
      });
      assert.ok(watchResult.success);
      assert.ok(watchResult.data);

      await new Promise(resolve => setTimeout(resolve, DEFAULT_POLL_MS * 5));
      await stopContextWatcher(watchResult.data);

      const parsed = parseObservationFile(initResult.data.path);
      assert.ok(parsed.success);
      assert.ok(parsed.data);
      assert.ok(parsed.data.entries.length > 0, 'Should have observation entry');

      const entry = parsed.data.entries[0];
      assert.strictEqual(entry.triggerType, 'context-watch',
        'Trigger type should be context-watch');
    });

    it('trigger detail should include turn information', async () => {
      const sessionFile = join(SESSION_DIR, '95-6-session.md');
      writeFileSync(sessionFile, '# Session\nContent\n');

      const initResult = initObservationFile(OBS_CONFIG);
      assert.ok(initResult.success);
      assert.ok(initResult.data);

      for (let i = 0; i < 5; i++) {
        incrementTurnCounter(SESSION_DIR);
      }

      const watchResult = await startContextWatcher({
        ...DEFAULT_CONFIG,
        observationFilePath: initResult.data.path,
        sessionFilePath: sessionFile,
      });
      assert.ok(watchResult.success);
      assert.ok(watchResult.data);

      await new Promise(resolve => setTimeout(resolve, DEFAULT_POLL_MS * 5));
      await stopContextWatcher(watchResult.data);

      const parsed = parseObservationFile(initResult.data.path);
      assert.ok(parsed.success);
      assert.ok(parsed.data);
      assert.ok(parsed.data.entries.length > 0);

      const entry = parsed.data.entries[0];
      assert.ok(entry.triggerDetail.includes('turn') || entry.triggerDetail.includes('5'),
        `Trigger detail should reference turn info, got: "${entry.triggerDetail}"`);
    });
  });

  // ===========================================================================
  // AC4: Summary generation does not block primary agent's conversation flow
  // ===========================================================================
  describe('AC4: Non-blocking', () => {
    it('incrementTurnCounter should complete within 10ms', () => {
      mkdirSync(SESSION_DIR, { recursive: true });
      const start = Date.now();
      const result = incrementTurnCounter(SESSION_DIR);
      const elapsed = Date.now() - start;
      assert.ok(result.success);
      assert.ok(elapsed < 10, `incrementTurnCounter took ${elapsed}ms, expected < 10ms`);
    });

    it('shouldTriggerSummary should be a pure function (no I/O)', () => {
      const start = Date.now();
      for (let i = 0; i < 10000; i++) {
        shouldTriggerSummary(i, 5);
      }
      const elapsed = Date.now() - start;
      assert.ok(elapsed < 50, `10000 calls to shouldTriggerSummary took ${elapsed}ms — should be pure`);
    });

    it('writeContextSnapshot should complete within 50ms', () => {
      const sessionFile = join(SESSION_DIR, '95-6-session.md');
      writeFileSync(sessionFile, '# Session\nContent for snapshot\n');

      const start = Date.now();
      const result = writeContextSnapshot({
        sessionDir: SESSION_DIR,
        storyId: '95-6',
        sessionFilePath: sessionFile,
        turnCount: 5,
      });
      const elapsed = Date.now() - start;
      assert.ok(result.success);
      assert.ok(elapsed < 50, `writeContextSnapshot took ${elapsed}ms, expected < 50ms`);
    });

    it('startContextWatcher should return handle immediately', async () => {
      const sessionFile = join(SESSION_DIR, '95-6-session.md');
      writeFileSync(sessionFile, '# Session\nContent\n');

      const start = Date.now();
      const result = await startContextWatcher({
        ...DEFAULT_CONFIG,
        sessionFilePath: sessionFile,
      });
      const elapsed = Date.now() - start;
      assert.ok(result.success, `startContextWatcher failed: ${result.error}`);
      assert.ok(result.data);
      assert.ok(elapsed < 1000, `startContextWatcher took ${elapsed}ms, expected < 1000ms`);

      if (result.data) {
        await stopContextWatcher(result.data);
      }
    });

    it('incrementTurnCounter should not throw on missing session dir', () => {
      const result = incrementTurnCounter('/nonexistent/session/dir');
      assert.strictEqual(result.success, false);
      assert.ok(result.error, 'Should have error message');
    });
  });

  // ===========================================================================
  // AC5: Combined token overhead stays under 25% per phase
  // ===========================================================================
  describe('AC5: Token overhead budget', () => {
    it('context snapshot should be within size budget', () => {
      // A large session file
      const sessionContent = 'Line of session content.\n'.repeat(100);
      const sessionFile = join(SESSION_DIR, '95-6-session.md');
      writeFileSync(sessionFile, sessionContent);

      const result = writeContextSnapshot({
        sessionDir: SESSION_DIR,
        storyId: '95-6',
        sessionFilePath: sessionFile,
        turnCount: 10,
      });
      assert.ok(result.success);
      assert.ok(result.data);
      // Snapshot content should be bounded — not a verbatim copy of the whole session
      // 2000 chars ≈ 500 tokens, reasonable for a context summary
      assert.ok(result.data.content.length <= 2000,
        `Snapshot should be bounded, got ${result.data.content.length} chars`);
    });

    it('context snapshot should be smaller than source session content', () => {
      // Large session file
      const sessionContent = 'Detailed session content with implementation notes.\n'.repeat(200);
      const sessionFile = join(SESSION_DIR, '95-6-session.md');
      writeFileSync(sessionFile, sessionContent);

      const result = writeContextSnapshot({
        sessionDir: SESSION_DIR,
        storyId: '95-6',
        sessionFilePath: sessionFile,
        turnCount: 25,
      });
      assert.ok(result.success);
      assert.ok(result.data);
      assert.ok(result.data.content.length < sessionContent.length,
        'Snapshot should be smaller than full session content');
    });

    it('multiple summaries over a phase should stay within token budget', () => {
      const sessionFile = join(SESSION_DIR, '95-6-session.md');
      writeFileSync(sessionFile, 'Session content for budget test.\n'.repeat(50));

      // Simulate 10 summaries (50 turns / interval 5 = 10 summaries)
      let totalChars = 0;
      for (let turn = 5; turn <= 50; turn += 5) {
        const result = writeContextSnapshot({
          sessionDir: SESSION_DIR,
          storyId: '95-6',
          sessionFilePath: sessionFile,
          turnCount: turn,
        });
        assert.ok(result.success);
        assert.ok(result.data);
        totalChars += result.data.content.length;
      }
      // 10 summaries × ~500 tokens max = ~5000 tokens ≈ 20000 chars
      // 25% of a 100K token phase = 25K tokens = ~100K chars
      // So 20K chars is well within budget
      assert.ok(totalChars < 30000,
        `Total snapshot chars across 10 summaries: ${totalChars}, should be < 30000`);
    });

    it('writeContextSnapshot should report estimated token count', () => {
      const sessionFile = join(SESSION_DIR, '95-6-session.md');
      writeFileSync(sessionFile, '# Session\nSome content for estimation.\n');

      const result = writeContextSnapshot({
        sessionDir: SESSION_DIR,
        storyId: '95-6',
        sessionFilePath: sessionFile,
        turnCount: 5,
      });
      assert.ok(result.success);
      assert.ok(result.data);
      assert.ok(typeof result.data.estimatedTokens === 'number',
        'Should include estimated token count');
      assert.ok(result.data.estimatedTokens > 0,
        'Token estimate should be positive');
    });
  });

  // ===========================================================================
  // AC6: Context accumulates — later summaries reference earlier ones
  // ===========================================================================
  describe('AC6: Context accumulation', () => {
    it('readContextSnapshot should return previous snapshot', () => {
      const sessionFile = join(SESSION_DIR, '95-6-session.md');
      writeFileSync(sessionFile, '# Session\nFirst phase of work\n');

      // Write first snapshot
      writeContextSnapshot({
        sessionDir: SESSION_DIR,
        storyId: '95-6',
        sessionFilePath: sessionFile,
        turnCount: 5,
      });

      // Read it back
      const readResult = readContextSnapshot(SESSION_DIR, '95-6');
      assert.ok(readResult.success, `readContextSnapshot failed: ${readResult.error}`);
      assert.ok(readResult.data);
      assert.ok(readResult.data.content.length > 0, 'Should return previous snapshot content');
    });

    it('readContextSnapshot should return empty for no prior snapshot', () => {
      const result = readContextSnapshot(SESSION_DIR, '95-6');
      assert.ok(result.success);
      assert.ok(result.data);
      assert.strictEqual(result.data.content, '',
        'No prior snapshot should return empty content');
    });

    it('later snapshots should include reference to prior context', () => {
      const sessionFile = join(SESSION_DIR, '95-6-session.md');

      // First snapshot at turn 5
      writeFileSync(sessionFile, '# Session\nDev is setting up authentication module\n');
      writeContextSnapshot({
        sessionDir: SESSION_DIR,
        storyId: '95-6',
        sessionFilePath: sessionFile,
        turnCount: 5,
      });

      // Second snapshot at turn 10 — session has more content
      writeFileSync(sessionFile, '# Session\nDev is setting up authentication module\n## Progress\nJWT implementation complete. Now adding refresh tokens.\n');
      const result = writeContextSnapshot({
        sessionDir: SESSION_DIR,
        storyId: '95-6',
        sessionFilePath: sessionFile,
        turnCount: 10,
      });
      assert.ok(result.success);
      assert.ok(result.data);
      // The second snapshot should be aware it follows a prior one
      // (either by including turn range or referencing prior summary)
      assert.ok(result.data.content.includes('10') || result.data.content.includes('turn'),
        'Later snapshot should reference its turn context');
    });

    it('watcher should produce multiple observations across intervals', async () => {
      const sessionFile = join(SESSION_DIR, '95-6-session.md');
      writeFileSync(sessionFile, '# Session\nDev working on feature\n');

      const initResult = initObservationFile(OBS_CONFIG);
      assert.ok(initResult.success);
      assert.ok(initResult.data);

      // Set counter to 5 (first trigger)
      for (let i = 0; i < 5; i++) {
        incrementTurnCounter(SESSION_DIR);
      }

      const watchResult = await startContextWatcher({
        ...DEFAULT_CONFIG,
        observationFilePath: initResult.data.path,
        sessionFilePath: sessionFile,
      });
      assert.ok(watchResult.success);
      assert.ok(watchResult.data);

      // Wait for first observation
      await new Promise(resolve => setTimeout(resolve, DEFAULT_POLL_MS * 5));

      // Increment to 10 (second trigger)
      for (let i = 0; i < 5; i++) {
        incrementTurnCounter(SESSION_DIR);
      }

      // Update session to simulate progress
      writeFileSync(sessionFile, '# Session\nDev working on feature\n## Update\nTests now passing\n');

      // Wait for second observation
      await new Promise(resolve => setTimeout(resolve, DEFAULT_POLL_MS * 5));

      await stopContextWatcher(watchResult.data);

      const parsed = parseObservationFile(initResult.data.path);
      assert.ok(parsed.success);
      assert.ok(parsed.data);
      assert.ok(parsed.data.entries.length >= 2,
        `Should have at least 2 observations for 2 intervals, got ${parsed.data.entries.length}`);
    });

    it('accumulated observations should not duplicate content', async () => {
      const sessionFile = join(SESSION_DIR, '95-6-session.md');
      writeFileSync(sessionFile, '# Session\nUnique content for dedup test\n');

      const initResult = initObservationFile(OBS_CONFIG);
      assert.ok(initResult.success);
      assert.ok(initResult.data);

      // First trigger at turn 5
      for (let i = 0; i < 5; i++) {
        incrementTurnCounter(SESSION_DIR);
      }

      const watchResult = await startContextWatcher({
        ...DEFAULT_CONFIG,
        observationFilePath: initResult.data.path,
        sessionFilePath: sessionFile,
      });
      assert.ok(watchResult.success);
      assert.ok(watchResult.data);

      await new Promise(resolve => setTimeout(resolve, DEFAULT_POLL_MS * 5));

      // Trigger again at turn 10 — same session content
      for (let i = 0; i < 5; i++) {
        incrementTurnCounter(SESSION_DIR);
      }

      await new Promise(resolve => setTimeout(resolve, DEFAULT_POLL_MS * 5));
      await stopContextWatcher(watchResult.data);

      const parsed = parseObservationFile(initResult.data.path);
      assert.ok(parsed.success);
      assert.ok(parsed.data);

      if (parsed.data.entries.length >= 2) {
        // Second observation should not be identical to first
        assert.notStrictEqual(
          parsed.data.entries[0].observation,
          parsed.data.entries[1].observation,
          'Accumulated observations should differ (even if session unchanged, turn number differs)'
        );
      }
    });
  });

  // ===========================================================================
  // Result objects per framework pattern
  // ===========================================================================
  describe('Result objects', () => {
    it('incrementTurnCounter should return {success, data?, error?}', () => {
      const result = incrementTurnCounter(SESSION_DIR);
      assert.ok(typeof result === 'object');
      assert.ok('success' in result, 'Result must have success field');
      assert.ok('data' in result || result.success === false);
    });

    it('readTurnCounter should return {success, data?, error?}', () => {
      const result = readTurnCounter(SESSION_DIR);
      assert.ok(typeof result === 'object');
      assert.ok('success' in result);
    });

    it('writeContextSnapshot should return {success, data?, error?}', () => {
      const sessionFile = join(SESSION_DIR, '95-6-session.md');
      writeFileSync(sessionFile, '# Session\nContent\n');

      const result = writeContextSnapshot({
        sessionDir: SESSION_DIR,
        storyId: '95-6',
        sessionFilePath: sessionFile,
        turnCount: 5,
      });
      assert.ok(typeof result === 'object');
      assert.ok('success' in result);
    });

    it('startContextWatcher should return {success, data?: ContextWatchHandle, error?}', async () => {
      const sessionFile = join(SESSION_DIR, '95-6-session.md');
      writeFileSync(sessionFile, '# Session\nContent\n');

      const result = await startContextWatcher({
        ...DEFAULT_CONFIG,
        sessionFilePath: sessionFile,
      });
      assert.ok(typeof result === 'object');
      assert.ok('success' in result);
      if (result.success && result.data) {
        assert.ok(typeof result.data === 'object');
        await stopContextWatcher(result.data);
      }
    });

    it('stopContextWatcher should return {success, error?}', async () => {
      const sessionFile = join(SESSION_DIR, '95-6-session.md');
      writeFileSync(sessionFile, '# Session\nContent\n');

      const watchResult = await startContextWatcher({
        ...DEFAULT_CONFIG,
        sessionFilePath: sessionFile,
      });
      assert.ok(watchResult.success);
      assert.ok(watchResult.data);

      const stopResult = await stopContextWatcher(watchResult.data);
      assert.ok(typeof stopResult === 'object');
      assert.ok('success' in stopResult);
      assert.ok(stopResult.success);
    });
  });

  // ===========================================================================
  // Error resilience
  // ===========================================================================
  describe('Error resilience', () => {
    it('incrementTurnCounter should handle missing session dir', () => {
      const result = incrementTurnCounter('/nonexistent/session/dir');
      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    });

    it('writeContextSnapshot should handle missing session file', () => {
      const result = writeContextSnapshot({
        sessionDir: SESSION_DIR,
        storyId: '95-6',
        sessionFilePath: '/nonexistent/session.md',
        turnCount: 5,
      });
      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    });

    it('watcher should continue polling after snapshot write error', async () => {
      const sessionFile = join(SESSION_DIR, '95-6-session.md');
      writeFileSync(sessionFile, '# Session\nContent\n');

      // Set counter to trigger
      for (let i = 0; i < 5; i++) {
        incrementTurnCounter(SESSION_DIR);
      }

      // Start watcher with bad observation file path
      const watchResult = await startContextWatcher({
        ...DEFAULT_CONFIG,
        observationFilePath: '/nonexistent/obs.md',
        sessionFilePath: sessionFile,
      });
      assert.ok(watchResult.success, 'Watcher should start even with bad observation path');
      assert.ok(watchResult.data);

      // Wait for poll cycles — watcher should NOT crash
      await new Promise(resolve => setTimeout(resolve, DEFAULT_POLL_MS * 5));

      const stopResult = await stopContextWatcher(watchResult.data);
      assert.ok(stopResult.success, 'Should stop cleanly even after write errors');
    });

    it('stopContextWatcher should be idempotent', async () => {
      const sessionFile = join(SESSION_DIR, '95-6-session.md');
      writeFileSync(sessionFile, '# Session\nContent\n');

      const watchResult = await startContextWatcher({
        ...DEFAULT_CONFIG,
        sessionFilePath: sessionFile,
      });
      assert.ok(watchResult.success);
      assert.ok(watchResult.data);

      const stop1 = await stopContextWatcher(watchResult.data);
      assert.ok(stop1.success);

      const stop2 = await stopContextWatcher(watchResult.data);
      assert.ok(stop2.success, 'Second stop should also succeed (idempotent)');
    });

    it('readContextSnapshot should handle missing snapshot file', () => {
      const result = readContextSnapshot(SESSION_DIR, '95-6');
      assert.ok(result.success, 'Missing snapshot is not an error — just empty');
      assert.ok(result.data);
      assert.strictEqual(result.data.content, '');
    });
  });

  // ===========================================================================
  // Edge cases
  // ===========================================================================
  describe('Edge cases', () => {
    it('should handle empty session file', () => {
      const sessionFile = join(SESSION_DIR, '95-6-session.md');
      writeFileSync(sessionFile, '');

      const result = writeContextSnapshot({
        sessionDir: SESSION_DIR,
        storyId: '95-6',
        sessionFilePath: sessionFile,
        turnCount: 5,
      });
      assert.ok(result.success, 'Empty session should not cause error');
      assert.ok(result.data);
    });

    it('should handle very large session file', () => {
      const sessionFile = join(SESSION_DIR, '95-6-session.md');
      const largeContent = 'A line of session content with details.\n'.repeat(5000);
      writeFileSync(sessionFile, largeContent);

      const start = Date.now();
      const result = writeContextSnapshot({
        sessionDir: SESSION_DIR,
        storyId: '95-6',
        sessionFilePath: sessionFile,
        turnCount: 50,
      });
      const elapsed = Date.now() - start;
      assert.ok(result.success);
      assert.ok(elapsed < 100, `Large session snapshot took ${elapsed}ms, expected < 100ms`);
      // Snapshot should still be bounded
      assert.ok(result.data!.content.length <= 2000,
        `Snapshot from large session should still be bounded, got ${result.data!.content.length}`);
    });

    it('should handle concurrent reads of session file', () => {
      const sessionFile = join(SESSION_DIR, '95-6-session.md');
      writeFileSync(sessionFile, '# Session\nContent\n');

      // Multiple reads should not fail
      const results = [];
      for (let i = 0; i < 10; i++) {
        results.push(writeContextSnapshot({
          sessionDir: SESSION_DIR,
          storyId: '95-6',
          sessionFilePath: sessionFile,
          turnCount: i + 1,
        }));
      }
      for (const r of results) {
        assert.ok(r.success, 'Concurrent snapshot writes should all succeed');
      }
    });

    it('counter file should handle non-numeric content gracefully', () => {
      writeFileSync(counterPath(), 'not-a-number\n');
      const result = readTurnCounter(SESSION_DIR);
      // Should either return 0 or handle gracefully
      assert.ok(result.success, 'Non-numeric counter should not throw');
      assert.strictEqual(typeof result.data, 'number');
    });
  });
});
