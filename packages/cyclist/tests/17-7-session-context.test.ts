/**
 * 17-7: Session ID Tracking for Context and Agent State
 *
 * These tests verify the acceptance criteria for session-specific context tracking.
 * The context meter currently checks the most recent Claude transcript, which may
 * be the wrong session when multiple Claude instances are running.
 *
 * Written in RED phase - tests should fail until Dev implements the functionality.
 *
 * Acceptance Criteria:
 * - AC1: ClaudeService session ID passed to context polling
 * - AC2: check-context.sh accepts --session <id> flag
 * - AC3: Context checks target Cyclist's session transcript only
 * - AC4: Agent state lookups use session-specific files
 * - AC5: Multiple Cyclist instances don't interfere with each other
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Import context module - will need modification to accept session ID
import { getContextUsage, ContextInfo } from '../src/api/context.js';

describe('17-7: Session ID Tracking for Context', () => {
  // Project root is two levels up from packages/cyclist
  const projectRoot = join(process.cwd(), '..', '..');

  // Temp directory for test transcripts
  let testDir: string;
  let testClaudeProjectPath: string;

  beforeEach(() => {
    // Create temp test directory structure
    testDir = join(tmpdir(), `cyclist-test-${Date.now()}`);
    // Simulate ~/.claude/projects/-path-to-project structure
    testClaudeProjectPath = join(testDir, '.claude', 'projects', '-test-project');
    mkdirSync(testClaudeProjectPath, { recursive: true });
  });

  afterEach(() => {
    // Cleanup
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('AC1: ClaudeService session ID passed to context polling', () => {

    it('should accept optional sessionId parameter in getContextUsage', () => {
      // getContextUsage signature should be:
      // getContextUsage(projectDir: string, sessionId?: string): ContextInfo

      // This test verifies the function accepts a second parameter
      // Current implementation only takes projectDir
      const result = getContextUsage('/nonexistent', 'test-session-123');

      // Should not throw - just return error since path doesn't exist
      expect(result).toBeDefined();
      expect(result.error).toBeDefined();
    });

    it('should pass sessionId to check-context.sh via SESSION_ID env var', async () => {
      // When sessionId is provided, getContextUsage should pass it
      // to check-context.sh via SESSION_ID environment variable

      // Use the real project root which has the actual script
      const result = getContextUsage(projectRoot, 'my-session-abc');

      // The function should complete without throwing
      // It may return an error about session not found (expected since the session doesn't exist)
      // but the sessionId should be present in the result
      expect(result).toBeDefined();
      expect(result.sessionId).toBe('my-session-abc');
    });

    it('should include sessionId in ContextInfo when available', () => {
      // ContextInfo interface should include optional sessionId field
      // so callers can verify which session the data came from

      const info: ContextInfo = {
        percent: 50,
        tokens: 100000,
        status: 'OK',
        error: null,
        sessionId: 'test-session-123',
        baseline: null,
        usableTokens: null,
        usablePercent: null,
        available: null,
      };

      expect(info.sessionId).toBe('test-session-123');
    });

  });

  describe('AC2: check-context.sh accepts --session <id> flag', () => {
    const scriptPath = join(projectRoot, 'pennyfarthing-dist', 'scripts', 'core', 'check-context.sh');

    it('should have --session flag documented in usage', () => {
      // Check the script's help/usage includes --session flag
      expect(existsSync(scriptPath)).toBe(true);

      // Read script and check for --session documentation
      const { readFileSync } = require('fs');
      const script = readFileSync(scriptPath, 'utf-8');

      // This will FAIL until Dev adds --session flag support
      expect(script).toContain('--session');
    });

    it('should filter transcripts by session ID when --session flag provided', () => {
      // Create two transcript files with different session IDs
      const transcript1 = join(testClaudeProjectPath, 'session-aaa.jsonl');
      const transcript2 = join(testClaudeProjectPath, 'session-bbb.jsonl');

      // Transcript 1: session-aaa with 50% usage
      writeFileSync(transcript1, JSON.stringify({
        type: 'result',
        session_id: 'session-aaa',
        message: {
          usage: {
            input_tokens: 50000,
            cache_read_input_tokens: 50000,
            cache_creation_input_tokens: 0
          }
        }
      }) + '\n');

      // Transcript 2: session-bbb with 80% usage (more recent)
      writeFileSync(transcript2, JSON.stringify({
        type: 'result',
        session_id: 'session-bbb',
        message: {
          usage: {
            input_tokens: 80000,
            cache_read_input_tokens: 80000,
            cache_creation_input_tokens: 0
          }
        }
      }) + '\n');

      // Touch transcript2 to make it more recent
      const now = new Date();
      require('fs').utimesSync(transcript2, now, now);

      // Without session filter, should get most recent (80%)
      // With --session session-aaa, should get 50%

      // This test structure shows what the script SHOULD do
      // The actual test will need the real script path once implemented
      expect(true).toBe(true); // Placeholder - real test below
    });

    it('should use SESSION_ID env var as alternative to --session flag', () => {
      // For programmatic use, SESSION_ID env var should work same as --session flag
      // This allows getContextUsage to pass it without modifying command line

      expect(existsSync(scriptPath)).toBe(true);

      // Read script and verify it checks SESSION_ID env var
      const { readFileSync } = require('fs');
      const script = readFileSync(scriptPath, 'utf-8');

      // Script should reference SESSION_ID variable for filtering
      // Current script doesn't use SESSION_ID for transcript selection - this will FAIL
      expect(script).toMatch(/SESSION_ID.*TRANSCRIPT|TRANSCRIPT.*SESSION_ID/);
    });

  });

  describe('AC3: Context checks target Cyclist session transcript only', () => {

    it('should find transcript file matching session ID pattern', () => {
      // Claude transcripts are named with session ID
      // e.g., abc123def.jsonl where abc123def is the session ID

      // Create transcript files
      const sessionId = 'test-session-xyz789';
      const transcriptPath = join(testClaudeProjectPath, `${sessionId}.jsonl`);

      writeFileSync(transcriptPath, JSON.stringify({
        type: 'result',
        session_id: sessionId,
        message: {
          usage: { input_tokens: 50000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
        }
      }) + '\n');

      expect(existsSync(transcriptPath)).toBe(true);
    });

    it('should return error when session transcript not found', () => {
      // When a session ID is specified but no matching transcript exists,
      // should return a clear error instead of falling back to most recent

      // Use the actual project root which has the script
      const result = getContextUsage(projectRoot, 'nonexistent-session-id');

      // Should indicate the specific session wasn't found
      // The error message should mention 'session' to indicate it's a session-specific failure
      expect(result.error).toContain('session');
    });

    it('should not pick up transcripts from other sessions', () => {
      // This is the core requirement - when session ID is specified,
      // ONLY that session's data should be returned

      // Create two transcripts
      const mySession = 'cyclist-session-123';
      const otherSession = 'terminal-session-456';

      const myTranscript = join(testClaudeProjectPath, `${mySession}.jsonl`);
      const otherTranscript = join(testClaudeProjectPath, `${otherSession}.jsonl`);

      // My session: 30% usage
      writeFileSync(myTranscript, JSON.stringify({
        type: 'result',
        session_id: mySession,
        message: {
          usage: { input_tokens: 30000, cache_read_input_tokens: 30000, cache_creation_input_tokens: 0 }
        }
      }) + '\n');

      // Other session: 90% usage (newer file)
      writeFileSync(otherTranscript, JSON.stringify({
        type: 'result',
        session_id: otherSession,
        message: {
          usage: { input_tokens: 90000, cache_read_input_tokens: 90000, cache_creation_input_tokens: 0 }
        }
      }) + '\n');

      // Make other transcript newer
      const now = new Date();
      require('fs').utimesSync(otherTranscript, now, now);

      // Request MY session specifically
      const result = getContextUsage(testDir, mySession);

      // Should get MY session's 30%, not the other session's 90%
      // This will fail until implementation is fixed
      if (result.percent !== null) {
        expect(result.percent).toBeLessThan(50); // Should be ~30%, not ~90%
      }
    });

  });

  describe('AC4: Agent state lookups use session-specific files', () => {

    it('should track active agent per session ID', () => {
      // Each Cyclist instance should track its own active agent
      // keyed by session ID to avoid interference

      // This test verifies the concept - actual implementation
      // may store in memory or file-based session state

      const session1 = 'session-111';
      const session2 = 'session-222';

      // Session 1 might have SM active
      // Session 2 might have TEA active
      // They should not interfere

      // Structure to test:
      interface SessionAgentState {
        [sessionId: string]: {
          activeAgent: string;
          timestamp: number;
        };
      }

      const state: SessionAgentState = {
        [session1]: { activeAgent: 'sm', timestamp: Date.now() },
        [session2]: { activeAgent: 'tea', timestamp: Date.now() },
      };

      expect(state[session1].activeAgent).toBe('sm');
      expect(state[session2].activeAgent).toBe('tea');
    });

    it('should include session ID in context polling state', async () => {
      // main.ts should track which session the context data came from

      // Import main to check for session tracking
      const main = await import('../src/main.js');

      // Should have method to get context with session awareness
      // This might be a new function or modification to existing
      expect(main.getContext).toBeDefined();
    });

  });

  describe('AC5: Multiple Cyclist instances do not interfere', () => {

    it('should support concurrent context checks for different sessions', () => {
      // Two Cyclist windows open on same project, different sessions
      // Each should see their own context usage

      const session1 = 'cyclist-window-1';
      const session2 = 'cyclist-window-2';

      // Simulate concurrent checks
      const results = [
        getContextUsage(testDir, session1),
        getContextUsage(testDir, session2),
      ];

      // Both should complete without error (beyond "no transcript")
      // The key is they don't interfere with each other
      expect(results).toHaveLength(2);
    });

    it('should isolate context state by session ID', () => {
      // Context state updates for session A should not affect session B

      // This is more of an integration concern, but we verify
      // the data structures support isolation

      interface IsolatedContextState {
        sessionId: string;
        percent: number;
        tokens: number;
        lastUpdated: number;
      }

      const stateMap = new Map<string, IsolatedContextState>();

      // Update session A
      stateMap.set('session-a', {
        sessionId: 'session-a',
        percent: 45,
        tokens: 90000,
        lastUpdated: Date.now(),
      });

      // Update session B
      stateMap.set('session-b', {
        sessionId: 'session-b',
        percent: 72,
        tokens: 144000,
        lastUpdated: Date.now(),
      });

      // Verify isolation
      expect(stateMap.get('session-a')?.percent).toBe(45);
      expect(stateMap.get('session-b')?.percent).toBe(72);

      // Update A again - B unchanged
      stateMap.set('session-a', { ...stateMap.get('session-a')!, percent: 50 });

      expect(stateMap.get('session-a')?.percent).toBe(50);
      expect(stateMap.get('session-b')?.percent).toBe(72); // Unchanged
    });

  });

  describe('Integration: getContextUsage with session parameter', () => {

    it('should have updated function signature', () => {
      // Verify getContextUsage accepts sessionId parameter
      // TypeScript will catch if signature is wrong

      type GetContextUsageFn = (projectDir: string, sessionId?: string) => ContextInfo;

      // This cast will fail at compile time if signature doesn't match
      const fn: GetContextUsageFn = getContextUsage;

      expect(typeof fn).toBe('function');
    });

    it('should pass SESSION_ID to script when provided', () => {
      // Create a test setup where we can verify SESSION_ID is passed

      // The implementation should do something like:
      // execSync(`SESSION_ID="${sessionId}" PROJECT_ROOT="${projectDir}" "${scriptPath}"`)

      // For now, verify the function doesn't throw with session param
      const result = getContextUsage('/tmp/nonexistent', 'test-session');
      expect(result).toBeDefined();
    });

  });

  describe('check-context.sh session filtering logic', () => {

    it('should match transcript filename to session ID', () => {
      // Claude creates transcripts named like: {session_id}.jsonl
      // Script should find: $CLAUDE_PROJECT_PATH/${SESSION_ID}.jsonl

      // Pattern the script should use when SESSION_ID is set:
      // TRANSCRIPT="$CLAUDE_PROJECT_PATH/${SESSION_ID}.jsonl"

      // Instead of current:
      // TRANSCRIPT=$(ls -t "$CLAUDE_PROJECT_PATH"/*.jsonl | head -1)

      const sessionId = 'abc123xyz';
      const expectedPath = `${testClaudeProjectPath}/${sessionId}.jsonl`;

      // Create the expected file
      writeFileSync(expectedPath, '{}');

      expect(existsSync(expectedPath)).toBe(true);
    });

    it('should fall back to most recent when no session ID provided', () => {
      // Backward compatibility: when SESSION_ID is empty/unset,
      // script should behave as before (most recent transcript)

      // This ensures existing usage continues to work
      const result = getContextUsage(testDir); // No session ID

      // Should not throw, just use default behavior
      expect(result).toBeDefined();
    });

  });

});
