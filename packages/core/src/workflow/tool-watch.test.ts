/**
 * Tests for Story 95-5: Tool-watch Observation Scope
 *
 * RED state tests for tool call observation in the backseat agent.
 * These tests cover all acceptance criteria:
 *
 * AC1: Backseat receives tool call data (name, params, result) from primary agent
 * AC2: Data delivered within one tool-use cycle (processToolCall returns promptly)
 * AC3: Large results truncated to configurable max size
 * AC4: Truncation indicator included when results are truncated
 * AC5: Non-blocking to primary agent (hook execution remains fast)
 * AC6: Observations include analysis, not just raw tool call replay
 * AC7: Context accumulates across tool calls
 *
 * Run with: npm test
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Import the module under test (does not exist yet — will cause import failure)
import {
  processToolCall,
  readToolCalls,
  truncateResult,
  startToolWatcher,
  stopToolWatcher,
  type ToolWatchConfig,
} from './tool-watch.js';

// Import observation writer for integration tests
import {
  initObservationFile,
  parseObservationFile,
} from './observation-writer.js';

import type { ObservationWriterConfig } from './observation-writer.js';

// Get directory for test fixtures
const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DIR = join(__dirname, '__test_tool_watch__');
const SESSION_DIR = join(TEST_DIR, '.session');

// =============================================================================
// Test Fixtures
// =============================================================================

const DEFAULT_POLL_MS = 100; // Fast for testing

const DEFAULT_CONFIG: ToolWatchConfig = {
  sessionDir: SESSION_DIR,
  storyId: '95-5',
  agent: 'architect',
  persona: 'Will Bailey',
  phase: 'implement',
  pollIntervalMs: DEFAULT_POLL_MS,
  maxResultSize: 500,
};

const OBS_CONFIG: ObservationWriterConfig = {
  storyId: '95-5',
  agent: 'architect',
  persona: 'Will Bailey',
  phase: 'implement',
  sessionDir: SESSION_DIR,
};

function toolCallsPath(): string {
  return join(SESSION_DIR, `${DEFAULT_CONFIG.storyId}-tandem-toolcalls.jsonl`);
}

// =============================================================================
// Setup / Teardown
// =============================================================================

describe('95-5: Tool-watch Observation Scope', () => {

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
  // AC1: Backseat receives tool call data (name, params, result)
  // ===========================================================================

  describe('AC1: Receives tool call data', () => {

    it('should write tool call entry to JSONL transport file', () => {
      const result = processToolCall({
        sessionDir: SESSION_DIR,
        storyId: '95-5',
        toolName: 'Bash',
        params: { command: 'npm test' },
        toolResult: 'All 42 tests passed',
      });

      assert.ok(result.success, `processToolCall failed: ${result.error}`);
      assert.ok(existsSync(toolCallsPath()), 'JSONL transport file should be created');
    });

    it('should include tool name in the entry', () => {
      processToolCall({
        sessionDir: SESSION_DIR,
        storyId: '95-5',
        toolName: 'Read',
        params: { file_path: '/src/app.ts' },
        toolResult: 'file contents here',
      });

      const calls = readToolCalls(toolCallsPath());
      assert.ok(calls.success);
      assert.ok(calls.data);
      assert.ok(calls.data.length > 0);
      assert.strictEqual(calls.data[0].toolName, 'Read');
    });

    it('should include params in the entry', () => {
      processToolCall({
        sessionDir: SESSION_DIR,
        storyId: '95-5',
        toolName: 'Bash',
        params: { command: 'git status' },
        toolResult: 'nothing to commit',
      });

      const calls = readToolCalls(toolCallsPath());
      assert.ok(calls.success);
      assert.ok(calls.data);
      assert.deepStrictEqual(calls.data[0].params, { command: 'git status' });
    });

    it('should include result preview in the entry', () => {
      processToolCall({
        sessionDir: SESSION_DIR,
        storyId: '95-5',
        toolName: 'Bash',
        params: { command: 'npm test' },
        toolResult: 'All 42 tests passed',
      });

      const calls = readToolCalls(toolCallsPath());
      assert.ok(calls.success);
      assert.ok(calls.data);
      assert.ok(calls.data[0].resultPreview.includes('All 42 tests passed'));
    });

    it('should include timestamp in the entry', () => {
      processToolCall({
        sessionDir: SESSION_DIR,
        storyId: '95-5',
        toolName: 'Bash',
        params: { command: 'echo hi' },
        toolResult: 'hi',
      });

      const calls = readToolCalls(toolCallsPath());
      assert.ok(calls.success);
      assert.ok(calls.data);
      assert.ok(calls.data[0].timestamp, 'Entry should have a timestamp');
      // ISO timestamp format
      assert.ok(calls.data[0].timestamp.match(/^\d{4}-\d{2}-\d{2}T/), 'Timestamp should be ISO format');
    });

    it('should append multiple tool calls as separate JSONL lines', () => {
      processToolCall({
        sessionDir: SESSION_DIR,
        storyId: '95-5',
        toolName: 'Read',
        params: { file_path: '/a.ts' },
        toolResult: 'content a',
      });

      processToolCall({
        sessionDir: SESSION_DIR,
        storyId: '95-5',
        toolName: 'Edit',
        params: { file_path: '/a.ts', old_string: 'x', new_string: 'y' },
        toolResult: 'success',
      });

      processToolCall({
        sessionDir: SESSION_DIR,
        storyId: '95-5',
        toolName: 'Bash',
        params: { command: 'npm test' },
        toolResult: 'passed',
      });

      const calls = readToolCalls(toolCallsPath());
      assert.ok(calls.success);
      assert.ok(calls.data);
      assert.strictEqual(calls.data.length, 3, `Expected 3 entries, got ${calls.data.length}`);
    });

    it('should include result_size field with original byte count', () => {
      const bigResult = 'x'.repeat(2000);
      processToolCall({
        sessionDir: SESSION_DIR,
        storyId: '95-5',
        toolName: 'Bash',
        params: { command: 'cat big.txt' },
        toolResult: bigResult,
      });

      const calls = readToolCalls(toolCallsPath());
      assert.ok(calls.success);
      assert.ok(calls.data);
      assert.strictEqual(calls.data[0].resultSize, 2000, 'resultSize should reflect original length');
    });
  });

  // ===========================================================================
  // AC2: Data delivered within one tool-use cycle
  // ===========================================================================

  describe('AC2: Delivered within one tool-use cycle', () => {

    it('processToolCall should complete within 50ms', () => {
      const start = Date.now();
      const result = processToolCall({
        sessionDir: SESSION_DIR,
        storyId: '95-5',
        toolName: 'Bash',
        params: { command: 'npm test' },
        toolResult: 'All tests passed',
      });
      const elapsed = Date.now() - start;

      assert.ok(result.success);
      assert.ok(elapsed < 50, `processToolCall took ${elapsed}ms, expected < 50ms`);
    });

    it('processToolCall should be synchronous (file written immediately)', () => {
      processToolCall({
        sessionDir: SESSION_DIR,
        storyId: '95-5',
        toolName: 'Bash',
        params: { command: 'echo hello' },
        toolResult: 'hello',
      });

      // File should exist immediately — no async delay
      assert.ok(existsSync(toolCallsPath()), 'JSONL file should exist immediately after processToolCall');
      const content = readFileSync(toolCallsPath(), 'utf-8').trim();
      assert.ok(content.length > 0, 'File should have content immediately');
    });
  });

  // ===========================================================================
  // AC3: Large results truncated to configurable max size
  // ===========================================================================

  describe('AC3: Large results truncated', () => {

    it('should truncate results exceeding maxResultSize', () => {
      const bigResult = 'A'.repeat(1000);
      const truncated = truncateResult(bigResult, 500);

      assert.ok(truncated.length <= 600, `Truncated should be near max, got ${truncated.length}`);
      assert.ok(!truncated.includes('A'.repeat(1000)), 'Should not contain full original');
    });

    it('should not truncate results under maxResultSize', () => {
      const smallResult = 'small output';
      const truncated = truncateResult(smallResult, 500);

      assert.strictEqual(truncated, smallResult, 'Small results should pass through unchanged');
    });

    it('should respect custom maxResultSize', () => {
      const result = 'B'.repeat(200);
      const truncated100 = truncateResult(result, 100);
      const truncated300 = truncateResult(result, 300);

      assert.ok(truncated100.length < truncated300.length,
        'Smaller max should produce shorter output');
    });

    it('should use configurable maxResultSize in processToolCall', () => {
      const bigResult = 'C'.repeat(2000);
      processToolCall({
        sessionDir: SESSION_DIR,
        storyId: '95-5',
        toolName: 'Bash',
        params: { command: 'cat huge.log' },
        toolResult: bigResult,
        maxResultSize: 200,
      });

      const calls = readToolCalls(toolCallsPath());
      assert.ok(calls.success);
      assert.ok(calls.data);
      // Preview should be truncated to approximately 200 chars + indicator
      assert.ok(calls.data[0].resultPreview.length < 300,
        `Preview should be near maxResultSize, got ${calls.data[0].resultPreview.length}`);
    });

    it('should default maxResultSize to 500 when not specified', () => {
      const bigResult = 'D'.repeat(2000);
      processToolCall({
        sessionDir: SESSION_DIR,
        storyId: '95-5',
        toolName: 'Read',
        params: { file_path: '/big.txt' },
        toolResult: bigResult,
        // No maxResultSize — should use default 500
      });

      const calls = readToolCalls(toolCallsPath());
      assert.ok(calls.success);
      assert.ok(calls.data);
      assert.ok(calls.data[0].resultPreview.length < 600,
        `Default truncation to ~500, got ${calls.data[0].resultPreview.length}`);
    });
  });

  // ===========================================================================
  // AC4: Truncation indicator included
  // ===========================================================================

  describe('AC4: Truncation indicator', () => {

    it('should include truncation indicator when result is truncated', () => {
      const bigResult = 'E'.repeat(1000);
      const truncated = truncateResult(bigResult, 500);

      assert.ok(truncated.includes('[truncated from'),
        `Should include truncation indicator, got: "${truncated.slice(-60)}"`);
    });

    it('should include original size in truncation indicator', () => {
      const bigResult = 'F'.repeat(1234);
      const truncated = truncateResult(bigResult, 500);

      assert.ok(truncated.includes('1234'),
        `Should include original char count "1234", got: "${truncated.slice(-60)}"`);
    });

    it('should include "chars" in truncation indicator', () => {
      const bigResult = 'G'.repeat(800);
      const truncated = truncateResult(bigResult, 500);

      assert.ok(truncated.includes('chars'),
        `Should include "chars" in indicator, got: "${truncated.slice(-60)}"`);
    });

    it('should NOT include truncation indicator for small results', () => {
      const smallResult = 'small output';
      const truncated = truncateResult(smallResult, 500);

      assert.ok(!truncated.includes('[truncated'),
        'Small results should not have truncation indicator');
    });

    it('processToolCall should store truncation indicator in JSONL', () => {
      const bigResult = 'H'.repeat(2000);
      processToolCall({
        sessionDir: SESSION_DIR,
        storyId: '95-5',
        toolName: 'Bash',
        params: { command: 'cat huge.txt' },
        toolResult: bigResult,
        maxResultSize: 500,
      });

      const calls = readToolCalls(toolCallsPath());
      assert.ok(calls.success);
      assert.ok(calls.data);
      assert.ok(calls.data[0].resultPreview.includes('[truncated from'),
        'JSONL entry should contain truncation indicator');
    });
  });

  // ===========================================================================
  // AC5: Non-blocking to primary agent
  // ===========================================================================

  describe('AC5: Non-blocking', () => {

    it('processToolCall with large result should still complete within 50ms', () => {
      const bigResult = 'I'.repeat(100000); // 100KB
      const start = Date.now();
      const result = processToolCall({
        sessionDir: SESSION_DIR,
        storyId: '95-5',
        toolName: 'Read',
        params: { file_path: '/huge.ts' },
        toolResult: bigResult,
      });
      const elapsed = Date.now() - start;

      assert.ok(result.success);
      assert.ok(elapsed < 50, `processToolCall with large result took ${elapsed}ms, expected < 50ms`);
    });

    it('processToolCall should not throw on session dir missing', () => {
      const result = processToolCall({
        sessionDir: '/nonexistent/session/dir',
        storyId: '95-5',
        toolName: 'Bash',
        params: { command: 'echo hi' },
        toolResult: 'hi',
      });

      // Should return error result, not throw
      assert.strictEqual(result.success, false);
      assert.ok(result.error, 'Should have error message');
    });

    it('startToolWatcher should return handle immediately', async () => {
      // Create JSONL file first
      writeFileSync(toolCallsPath(), '');

      const start = Date.now();
      const result = await startToolWatcher({
        ...DEFAULT_CONFIG,
      });
      const elapsed = Date.now() - start;

      assert.ok(result.success, `startToolWatcher failed: ${result.error}`);
      assert.ok(result.data, 'Should return a handle');
      assert.ok(elapsed < 1000, `startToolWatcher took ${elapsed}ms, expected < 1000ms`);

      if (result.data) {
        await stopToolWatcher(result.data);
      }
    });
  });

  // ===========================================================================
  // AC6: Observations include analysis, not just raw tool call replay
  // ===========================================================================

  describe('AC6: Observations include analysis', () => {

    it('should write observations with tool-watch trigger type', async () => {
      const initResult = initObservationFile(OBS_CONFIG);
      assert.ok(initResult.success);
      assert.ok(initResult.data);

      // Write some tool calls to the JSONL file
      processToolCall({
        sessionDir: SESSION_DIR,
        storyId: '95-5',
        toolName: 'Bash',
        params: { command: 'npm test' },
        toolResult: 'All 42 tests passed',
      });

      // Start watcher with observation file
      const watchResult = await startToolWatcher({
        ...DEFAULT_CONFIG,
        observationFilePath: initResult.data.path,
      });
      assert.ok(watchResult.success);
      assert.ok(watchResult.data);

      // Wait for at least one poll cycle
      await new Promise(resolve => setTimeout(resolve, DEFAULT_POLL_MS * 3));

      await stopToolWatcher(watchResult.data);

      // Parse observation file
      const parsed = parseObservationFile(initResult.data.path);
      assert.ok(parsed.success);
      assert.ok(parsed.data);
      assert.ok(parsed.data.entries.length > 0, 'Should have at least one observation entry');

      const entry = parsed.data.entries[0];
      assert.strictEqual(entry.triggerType, 'tool-watch', 'Trigger type should be tool-watch');
    });

    it('should include tool name in trigger detail', async () => {
      const initResult = initObservationFile(OBS_CONFIG);
      assert.ok(initResult.success);
      assert.ok(initResult.data);

      processToolCall({
        sessionDir: SESSION_DIR,
        storyId: '95-5',
        toolName: 'Bash',
        params: { command: 'npm test -- --filter notification' },
        toolResult: 'Tests passed',
      });

      const watchResult = await startToolWatcher({
        ...DEFAULT_CONFIG,
        observationFilePath: initResult.data.path,
      });
      assert.ok(watchResult.success);
      assert.ok(watchResult.data);

      await new Promise(resolve => setTimeout(resolve, DEFAULT_POLL_MS * 3));
      await stopToolWatcher(watchResult.data);

      const parsed = parseObservationFile(initResult.data.path);
      assert.ok(parsed.success);
      assert.ok(parsed.data);
      assert.ok(parsed.data.entries.length > 0);

      const entry = parsed.data.entries[0];
      assert.ok(entry.triggerDetail.includes('Bash'),
        `Trigger detail should include tool name, got: "${entry.triggerDetail}"`);
    });

    it('observation text should not be identical to raw tool result', async () => {
      const initResult = initObservationFile(OBS_CONFIG);
      assert.ok(initResult.success);
      assert.ok(initResult.data);

      const rawResult = 'PASS src/components/Header.test.tsx\n  42 tests passed';
      processToolCall({
        sessionDir: SESSION_DIR,
        storyId: '95-5',
        toolName: 'Bash',
        params: { command: 'npm test' },
        toolResult: rawResult,
      });

      const watchResult = await startToolWatcher({
        ...DEFAULT_CONFIG,
        observationFilePath: initResult.data.path,
      });
      assert.ok(watchResult.success);
      assert.ok(watchResult.data);

      await new Promise(resolve => setTimeout(resolve, DEFAULT_POLL_MS * 3));
      await stopToolWatcher(watchResult.data);

      const parsed = parseObservationFile(initResult.data.path);
      assert.ok(parsed.success);
      assert.ok(parsed.data);
      assert.ok(parsed.data.entries.length > 0);

      // Observation should contain more than just the raw result — it should
      // be enriched (tool name + params summary + result analysis)
      const entry = parsed.data.entries[0];
      assert.ok(entry.observation.length > rawResult.length * 0.5,
        'Observation should contain substantive content beyond just the raw result');
      // Should not be an exact copy of the raw result
      assert.notStrictEqual(entry.observation, rawResult,
        'Observation should not be identical to raw tool result');
    });
  });

  // ===========================================================================
  // AC7: Context accumulates across tool calls
  // ===========================================================================

  describe('AC7: Context accumulates across tool calls', () => {

    it('should process multiple tool calls into multiple observations', async () => {
      const initResult = initObservationFile(OBS_CONFIG);
      assert.ok(initResult.success);
      assert.ok(initResult.data);

      // Write several tool calls
      processToolCall({
        sessionDir: SESSION_DIR,
        storyId: '95-5',
        toolName: 'Read',
        params: { file_path: '/src/app.ts' },
        toolResult: 'export const app = {};',
      });

      processToolCall({
        sessionDir: SESSION_DIR,
        storyId: '95-5',
        toolName: 'Edit',
        params: { file_path: '/src/app.ts', old_string: '{}', new_string: '{ name: "test" }' },
        toolResult: 'success',
      });

      processToolCall({
        sessionDir: SESSION_DIR,
        storyId: '95-5',
        toolName: 'Bash',
        params: { command: 'npm test' },
        toolResult: 'All tests passed',
      });

      const watchResult = await startToolWatcher({
        ...DEFAULT_CONFIG,
        observationFilePath: initResult.data.path,
      });
      assert.ok(watchResult.success);
      assert.ok(watchResult.data);

      // Wait long enough for watcher to process all entries
      await new Promise(resolve => setTimeout(resolve, DEFAULT_POLL_MS * 5));

      await stopToolWatcher(watchResult.data);

      const parsed = parseObservationFile(initResult.data.path);
      assert.ok(parsed.success);
      assert.ok(parsed.data);
      assert.ok(parsed.data.entries.length >= 1,
        `Should have at least 1 observation for 3 tool calls, got ${parsed.data.entries.length}`);
    });

    it('should track last-read position and not re-process old entries', async () => {
      const initResult = initObservationFile(OBS_CONFIG);
      assert.ok(initResult.success);
      assert.ok(initResult.data);

      // Write initial tool call
      processToolCall({
        sessionDir: SESSION_DIR,
        storyId: '95-5',
        toolName: 'Bash',
        params: { command: 'echo first' },
        toolResult: 'first',
      });

      const watchResult = await startToolWatcher({
        ...DEFAULT_CONFIG,
        observationFilePath: initResult.data.path,
      });
      assert.ok(watchResult.success);
      assert.ok(watchResult.data);

      // Wait for first batch to be processed
      await new Promise(resolve => setTimeout(resolve, DEFAULT_POLL_MS * 3));

      // Write a second tool call
      processToolCall({
        sessionDir: SESSION_DIR,
        storyId: '95-5',
        toolName: 'Bash',
        params: { command: 'echo second' },
        toolResult: 'second',
      });

      // Wait for second batch
      await new Promise(resolve => setTimeout(resolve, DEFAULT_POLL_MS * 3));

      await stopToolWatcher(watchResult.data);

      const parsed = parseObservationFile(initResult.data.path);
      assert.ok(parsed.success);
      assert.ok(parsed.data);

      // Count observations that mention "first"
      const firstObs = parsed.data.entries.filter(e =>
        e.triggerDetail.includes('first') || e.observation.includes('first')
      );

      // "first" should appear exactly once (not re-processed)
      assert.ok(firstObs.length <= 1,
        `"first" tool call should not be re-processed, appeared in ${firstObs.length} observations`);
    });

    it('should handle tool calls arriving while watcher is running', async () => {
      const initResult = initObservationFile(OBS_CONFIG);
      assert.ok(initResult.success);
      assert.ok(initResult.data);

      // Start watcher before any tool calls
      writeFileSync(toolCallsPath(), '');
      const watchResult = await startToolWatcher({
        ...DEFAULT_CONFIG,
        observationFilePath: initResult.data.path,
      });
      assert.ok(watchResult.success);
      assert.ok(watchResult.data);

      // Now write tool calls while watcher is running
      processToolCall({
        sessionDir: SESSION_DIR,
        storyId: '95-5',
        toolName: 'Glob',
        params: { pattern: '**/*.ts' },
        toolResult: 'src/app.ts\nsrc/main.ts',
      });

      await new Promise(resolve => setTimeout(resolve, DEFAULT_POLL_MS * 3));

      processToolCall({
        sessionDir: SESSION_DIR,
        storyId: '95-5',
        toolName: 'Read',
        params: { file_path: '/src/app.ts' },
        toolResult: 'export default {};',
      });

      await new Promise(resolve => setTimeout(resolve, DEFAULT_POLL_MS * 3));

      await stopToolWatcher(watchResult.data);

      const parsed = parseObservationFile(initResult.data.path);
      assert.ok(parsed.success);
      assert.ok(parsed.data);
      assert.ok(parsed.data.entries.length >= 1,
        'Should observe tool calls that arrive while watcher is running');
    });
  });

  // ===========================================================================
  // Result objects per framework pattern
  // ===========================================================================

  describe('Result objects', () => {

    it('processToolCall should return {success, error?}', () => {
      const result = processToolCall({
        sessionDir: SESSION_DIR,
        storyId: '95-5',
        toolName: 'Bash',
        params: { command: 'echo hi' },
        toolResult: 'hi',
      });

      assert.ok(typeof result === 'object');
      assert.ok('success' in result, 'Result must have success field');
    });

    it('readToolCalls should return {success, data?, error?}', () => {
      writeFileSync(toolCallsPath(), '');
      const result = readToolCalls(toolCallsPath());

      assert.ok(typeof result === 'object');
      assert.ok('success' in result, 'Result must have success field');
    });

    it('readToolCalls should return error for non-existent file', () => {
      const result = readToolCalls('/nonexistent/path/toolcalls.jsonl');
      assert.strictEqual(result.success, false);
      assert.ok(result.error, 'Should have error message');
    });

    it('startToolWatcher should return {success, data?: ToolWatchHandle, error?}', async () => {
      writeFileSync(toolCallsPath(), '');
      const result = await startToolWatcher(DEFAULT_CONFIG);

      assert.ok(typeof result === 'object');
      assert.ok('success' in result);
      if (result.success && result.data) {
        assert.ok(typeof result.data === 'object');
        await stopToolWatcher(result.data);
      }
    });

    it('stopToolWatcher should return {success, error?}', async () => {
      writeFileSync(toolCallsPath(), '');
      const watchResult = await startToolWatcher(DEFAULT_CONFIG);
      assert.ok(watchResult.success);
      assert.ok(watchResult.data);

      const stopResult = await stopToolWatcher(watchResult.data);
      assert.ok(typeof stopResult === 'object');
      assert.ok('success' in stopResult);
      assert.ok(stopResult.success);
    });
  });

  // ===========================================================================
  // Error resilience
  // ===========================================================================

  describe('Error resilience', () => {

    it('processToolCall should handle missing session dir gracefully', () => {
      const result = processToolCall({
        sessionDir: '/nonexistent/session/dir',
        storyId: '95-5',
        toolName: 'Bash',
        params: { command: 'echo hi' },
        toolResult: 'hi',
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    });

    it('watcher should continue polling after observation write error', async () => {
      // Write a tool call first
      processToolCall({
        sessionDir: SESSION_DIR,
        storyId: '95-5',
        toolName: 'Bash',
        params: { command: 'echo test' },
        toolResult: 'test',
      });

      // Start watcher with bad observation file path
      const watchResult = await startToolWatcher({
        ...DEFAULT_CONFIG,
        observationFilePath: '/nonexistent/obs.md',
      });
      assert.ok(watchResult.success, 'Watcher should start even with bad observation path');
      assert.ok(watchResult.data);

      // Wait for poll cycles — watcher should NOT crash
      await new Promise(resolve => setTimeout(resolve, DEFAULT_POLL_MS * 5));

      // Watcher should still be alive
      const stopResult = await stopToolWatcher(watchResult.data);
      assert.ok(stopResult.success, 'Should stop cleanly even after write errors');
    });

    it('stopToolWatcher should be idempotent', async () => {
      writeFileSync(toolCallsPath(), '');
      const watchResult = await startToolWatcher(DEFAULT_CONFIG);
      assert.ok(watchResult.success);
      assert.ok(watchResult.data);

      const stop1 = await stopToolWatcher(watchResult.data);
      assert.ok(stop1.success);

      const stop2 = await stopToolWatcher(watchResult.data);
      assert.ok(stop2.success, 'Second stop should also succeed (idempotent)');
    });

    it('readToolCalls should handle malformed JSONL lines gracefully', () => {
      writeFileSync(toolCallsPath(), 'not json\n{"toolName":"Bash"}\nalso not json\n');

      const result = readToolCalls(toolCallsPath());
      assert.ok(result.success, 'Should succeed even with malformed lines');
      assert.ok(result.data);
      // Should parse what it can and skip bad lines
      assert.ok(result.data.length >= 1, 'Should parse at least the valid line');
    });
  });

  // ===========================================================================
  // Edge cases
  // ===========================================================================

  describe('Edge cases', () => {

    it('should handle empty tool result', () => {
      const result = processToolCall({
        sessionDir: SESSION_DIR,
        storyId: '95-5',
        toolName: 'Edit',
        params: { file_path: '/a.ts', old_string: 'x', new_string: 'y' },
        toolResult: '',
      });

      assert.ok(result.success);
      const calls = readToolCalls(toolCallsPath());
      assert.ok(calls.success);
      assert.ok(calls.data);
      assert.strictEqual(calls.data[0].resultPreview, '');
    });

    it('should handle tool result with special characters', () => {
      const specialResult = 'Line 1\nLine 2\tTabbed\n"quoted" and {json: true}';
      const result = processToolCall({
        sessionDir: SESSION_DIR,
        storyId: '95-5',
        toolName: 'Bash',
        params: { command: 'cat special.txt' },
        toolResult: specialResult,
      });

      assert.ok(result.success);
      const calls = readToolCalls(toolCallsPath());
      assert.ok(calls.success);
      assert.ok(calls.data);
      // JSONL should properly escape special characters
      assert.ok(calls.data[0].resultPreview.includes('Line 1'));
    });

    it('should handle empty JSONL file', () => {
      writeFileSync(toolCallsPath(), '');
      const result = readToolCalls(toolCallsPath());

      assert.ok(result.success);
      assert.ok(result.data);
      assert.strictEqual(result.data.length, 0, 'Empty file should return empty array');
    });

    it('truncateResult should handle empty string', () => {
      const result = truncateResult('', 500);
      assert.strictEqual(result, '');
    });

    it('truncateResult should handle exactly maxResultSize chars', () => {
      const exact = 'J'.repeat(500);
      const result = truncateResult(exact, 500);
      // Exactly at limit — should not truncate
      assert.strictEqual(result, exact, 'Exactly at limit should not truncate');
    });
  });
});
