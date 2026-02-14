/**
 * MSSCI-12798: TypeScript Tier Integration Tests
 *
 * Tests for integrating the tier selection into the message flow.
 * This wires selectContextTier() to getPrimeContext() and ensures
 * the tier is passed to the Python prime script.
 *
 * Dependencies (already implemented in previous stories):
 * - MSSCI-12795: SessionContextState interface in ClaudeService
 * - MSSCI-12796: selectContextTier() function in prime.ts
 * - MSSCI-12797: Python prime --tier argument support
 *
 * Acceptance Criteria:
 * - AC1: selectContextTier() called before getPrimeContext() in message flow
 * - AC2: Tier passed to Python prime script via --tier argument
 * - AC3: SessionContextState updated after successful message (turnCount, lastAgent)
 * - AC4: Tests verify tier selection integration
 * - AC5: Backward compatible (default to FULL tier if state unavailable)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Import the functions and types we're testing
import { selectContextTier, type ContextTier } from '../src/prime.js';
import type { SessionContextState } from '../src/claude-service.js';

describe('MSSCI-12798: TypeScript Tier Integration', () => {

  describe('AC1: getPrimeContext accepts tier parameter', () => {
    /**
     * The getPrimeContext function should accept an optional tier parameter.
     * This enables the caller to specify which tier of context to load.
     */

    it('should export getPrimeContextWithTier function that accepts tier', async () => {
      // This new function should exist and accept a tier parameter
      // Will fail until the function is implemented
      const { getPrimeContextWithTier } = await import('../src/prime.js');
      expect(typeof getPrimeContextWithTier).toBe('function');
    });

    it('should accept FULL tier', async () => {
      const { getPrimeContextWithTier } = await import('../src/prime.js');
      // Should not throw when called with FULL tier
      // Function exists but may return null if can't find scripts
      expect(() => getPrimeContextWithTier('dev', '/nonexistent', 'FULL')).not.toThrow();
    });

    it('should accept REFRESH tier', async () => {
      const { getPrimeContextWithTier } = await import('../src/prime.js');
      expect(() => getPrimeContextWithTier('dev', '/nonexistent', 'REFRESH')).not.toThrow();
    });

    it('should accept HANDOFF tier', async () => {
      const { getPrimeContextWithTier } = await import('../src/prime.js');
      expect(() => getPrimeContextWithTier('dev', '/nonexistent', 'HANDOFF')).not.toThrow();
    });

    it('should accept MINIMAL tier', async () => {
      const { getPrimeContextWithTier } = await import('../src/prime.js');
      expect(() => getPrimeContextWithTier('dev', '/nonexistent', 'MINIMAL')).not.toThrow();
    });
  });

  describe('AC2: Tier is included in Python command', () => {
    /**
     * When getPrimeContextWithTier is called with a tier, it should
     * build a command that includes --tier <TIER>.
     *
     * We test this by exporting a helper function that builds the command
     * without executing it, allowing us to verify the command format.
     */

    it('should export buildPrimeCommand helper for testing', async () => {
      const { buildPrimeCommand } = await import('../src/prime.js');
      expect(typeof buildPrimeCommand).toBe('function');
    });

    it('should include --tier FULL in args when FULL tier specified', async () => {
      const { buildPrimeCommand } = await import('../src/prime.js');
      const args = buildPrimeCommand('dev', 'FULL');
      expect(args).toContain('--tier');
      expect(args).toContain('FULL');
    });

    it('should include --tier REFRESH in args when REFRESH tier specified', async () => {
      const { buildPrimeCommand } = await import('../src/prime.js');
      const args = buildPrimeCommand('dev', 'REFRESH');
      expect(args).toContain('--tier');
      expect(args).toContain('REFRESH');
    });

    it('should include --tier HANDOFF in args when HANDOFF tier specified', async () => {
      const { buildPrimeCommand } = await import('../src/prime.js');
      const args = buildPrimeCommand('dev', 'HANDOFF');
      expect(args).toContain('--tier');
      expect(args).toContain('HANDOFF');
    });

    it('should include --tier MINIMAL in args when MINIMAL tier specified', async () => {
      const { buildPrimeCommand } = await import('../src/prime.js');
      const args = buildPrimeCommand('dev', 'MINIMAL');
      expect(args).toContain('--tier');
      expect(args).toContain('MINIMAL');
    });

    it('should place --tier after agent name and --quiet flag', async () => {
      const { buildPrimeCommand } = await import('../src/prime.js');
      const args = buildPrimeCommand('tea', 'HANDOFF');
      // Expected: ['agent', 'start', 'tea', '--quiet', '--tier', 'HANDOFF']
      const quietIdx = args.indexOf('--quiet');
      const tierIdx = args.indexOf('--tier');
      expect(tierIdx).toBeGreaterThan(quietIdx);
      expect(args).toContain('tea');
    });

    it('should not include --tier when tier is undefined', async () => {
      const { buildPrimeCommand } = await import('../src/prime.js');
      const args = buildPrimeCommand('dev', undefined);
      expect(args).not.toContain('--tier');
    });
  });

  describe('AC3: SessionContextState updated after successful message', () => {
    /**
     * After a successful message with context injection, the ClaudeService should:
     * - Update lastAgent to the current agent (via setLastAgent)
     * - Increment turnCount (already done in sendMessage on 'result' message)
     */

    it('should have setLastAgent method on ClaudeService', async () => {
      const { ClaudeService } = await import('../src/claude-service.js');
      const service = new ClaudeService();
      expect(typeof service.setLastAgent).toBe('function');
    });

    it('should update lastAgent when setLastAgent is called', async () => {
      const { ClaudeService } = await import('../src/claude-service.js');
      const service = new ClaudeService();

      const initialState = service.getContextState();
      expect(initialState.lastAgent).toBeNull();

      service.setLastAgent('dev');

      const updatedState = service.getContextState();
      expect(updatedState.lastAgent).toBe('dev');
    });

    it('should allow changing lastAgent to different agent', async () => {
      const { ClaudeService } = await import('../src/claude-service.js');
      const service = new ClaudeService();

      service.setLastAgent('sm');
      expect(service.getContextState().lastAgent).toBe('sm');

      service.setLastAgent('dev');
      expect(service.getContextState().lastAgent).toBe('dev');

      service.setLastAgent('tea');
      expect(service.getContextState().lastAgent).toBe('tea');
    });

    it('should reset lastAgent on resetSession', async () => {
      const { ClaudeService } = await import('../src/claude-service.js');
      const service = new ClaudeService();

      service.setLastAgent('dev');
      expect(service.getContextState().lastAgent).toBe('dev');

      service.resetSession();
      expect(service.getContextState().lastAgent).toBeNull();
    });

    it('should reset turnCount on resetSession', async () => {
      const { ClaudeService } = await import('../src/claude-service.js');
      const service = new ClaudeService();

      // Note: turnCount is incremented internally by sendMessage
      // Here we just verify resetSession resets it to 0
      service.resetSession();
      expect(service.getContextState().turnCount).toBe(0);
    });
  });

  describe('AC4: Integration of tier selection with prime context', () => {
    /**
     * End-to-end verification that tier selection integrates correctly
     * with the prime context loading. These tests verify the complete flow:
     * 1. selectContextTier() determines the tier
     * 2. getPrimeContextWithTier() is called with that tier
     * 3. The tier is passed to Python script
     */

    it('should use FULL tier for new session (lastAgent is null)', async () => {
      const state: SessionContextState = {
        lastAgent: null,
        turnCount: 0,
        injectedComponents: [],
      };

      const tier = selectContextTier('dev', state);
      expect(tier).toBe('FULL');

      // Verify the args would include --tier FULL
      const { buildPrimeCommand } = await import('../src/prime.js');
      const args = buildPrimeCommand('dev', tier);
      expect(args).toContain('--tier');
      expect(args).toContain('FULL');
    });

    it('should use HANDOFF tier when agent changes', async () => {
      const state: SessionContextState = {
        lastAgent: 'sm',
        turnCount: 1,
        injectedComponents: ['persona'],
      };

      const tier = selectContextTier('dev', state);
      expect(tier).toBe('HANDOFF');

      const { buildPrimeCommand } = await import('../src/prime.js');
      const args = buildPrimeCommand('dev', tier);
      expect(args).toContain('--tier');
      expect(args).toContain('HANDOFF');
    });

    it('should use MINIMAL tier for deep conversation with same agent', async () => {
      const state: SessionContextState = {
        lastAgent: 'dev',
        turnCount: 5,
        injectedComponents: ['persona', 'skills'],
      };

      const tier = selectContextTier('dev', state);
      expect(tier).toBe('MINIMAL');

      const { buildPrimeCommand } = await import('../src/prime.js');
      const args = buildPrimeCommand('dev', tier);
      expect(args).toContain('--tier');
      expect(args).toContain('MINIMAL');
    });

    it('should use REFRESH tier for early conversation with same agent', async () => {
      const state: SessionContextState = {
        lastAgent: 'dev',
        turnCount: 2,
        injectedComponents: ['persona'],
      };

      const tier = selectContextTier('dev', state);
      expect(tier).toBe('REFRESH');

      const { buildPrimeCommand } = await import('../src/prime.js');
      const args = buildPrimeCommand('dev', tier);
      expect(args).toContain('--tier');
      expect(args).toContain('REFRESH');
    });

    it('should handle workflow: new session → early turns → deep conversation', async () => {
      const { buildPrimeCommand } = await import('../src/prime.js');

      // Turn 0: New session
      let state: SessionContextState = {
        lastAgent: null,
        turnCount: 0,
        injectedComponents: [],
      };
      expect(selectContextTier('dev', state)).toBe('FULL');

      // Turn 1: Same agent, first turn after injection
      state = { lastAgent: 'dev', turnCount: 1, injectedComponents: ['persona'] };
      expect(selectContextTier('dev', state)).toBe('REFRESH');

      // Turn 3: Same agent, boundary
      state = { lastAgent: 'dev', turnCount: 3, injectedComponents: ['persona'] };
      expect(selectContextTier('dev', state)).toBe('REFRESH');

      // Turn 4: Same agent, deep conversation
      state = { lastAgent: 'dev', turnCount: 4, injectedComponents: ['persona'] };
      expect(selectContextTier('dev', state)).toBe('MINIMAL');
    });

    it('should handle workflow: agent handoff mid-conversation', async () => {
      // Deep in conversation with dev
      let state: SessionContextState = {
        lastAgent: 'dev',
        turnCount: 10,
        injectedComponents: ['persona', 'skills'],
      };
      expect(selectContextTier('dev', state)).toBe('MINIMAL');

      // Handoff to reviewer (different agent from lastAgent='dev')
      expect(selectContextTier('reviewer', state)).toBe('HANDOFF');

      // After handoff, reviewer continues - turnCount is still high
      // so should get MINIMAL (same agent, turnCount > 3)
      state = { lastAgent: 'reviewer', turnCount: 11, injectedComponents: [] };
      expect(selectContextTier('reviewer', state)).toBe('MINIMAL');
    });
  });

  describe('AC5: Backward compatible (default to FULL tier)', () => {
    /**
     * When tier is not specified:
     * - buildPrimeCommand should not include --tier (Python defaults to FULL)
     * - Original getPrimeContext function should continue to work unchanged
     */

    it('should not include --tier when tier is undefined', async () => {
      const { buildPrimeCommand } = await import('../src/prime.js');
      const args = buildPrimeCommand('dev', undefined);
      expect(args).not.toContain('--tier');
    });

    it('should keep original getPrimeContext function signature', async () => {
      const { getPrimeContext } = await import('../src/prime.js');
      expect(typeof getPrimeContext).toBe('function');
      // Original signature: (agentName: string, projectDir: string) => string | null
      // Should still work without tier parameter
    });

    it('should return valid tier when state has initial values', () => {
      const initialState: SessionContextState = {
        lastAgent: null,
        turnCount: 0,
        injectedComponents: [],
      };

      // Should return FULL for initial state (backward compatible behavior)
      const tier = selectContextTier('dev', initialState);
      expect(tier).toBe('FULL');
    });
  });

  describe('Edge cases and error handling', () => {

    it('should handle empty agent name in selectContextTier', () => {
      const state: SessionContextState = {
        lastAgent: 'dev',
        turnCount: 1,
        injectedComponents: [],
      };

      // Empty string is a different agent than 'dev' -> HANDOFF
      const tier = selectContextTier('', state);
      expect(tier).toBe('HANDOFF');
    });

    it('should handle agent name with different case', () => {
      const state: SessionContextState = {
        lastAgent: 'dev',
        turnCount: 2,
        injectedComponents: [],
      };

      // Case sensitive - 'Dev' != 'dev' -> HANDOFF
      expect(selectContextTier('Dev', state)).toBe('HANDOFF');
      expect(selectContextTier('DEV', state)).toBe('HANDOFF');
    });

    it('should handle turnCount at exact boundary', () => {
      // turnCount = 3 -> REFRESH (not > 3)
      let state: SessionContextState = {
        lastAgent: 'dev',
        turnCount: 3,
        injectedComponents: [],
      };
      expect(selectContextTier('dev', state)).toBe('REFRESH');

      // turnCount = 4 -> MINIMAL (> 3)
      state = { lastAgent: 'dev', turnCount: 4, injectedComponents: [] };
      expect(selectContextTier('dev', state)).toBe('MINIMAL');
    });

    it('should handle special characters in agent name', async () => {
      const { buildPrimeCommand } = await import('../src/prime.js');

      // Agent names are passed as separate args (safe from injection)
      const args = buildPrimeCommand('agent-with-dash', 'FULL');
      expect(args).toContain('agent-with-dash');
    });
  });
});

describe('MSSCI-12798: Type exports', () => {
  /**
   * Verify that ContextTier type is properly exported and usable
   */

  it('should export ContextTier type from prime module', async () => {
    // This test verifies the type can be imported
    const { selectContextTier } = await import('../src/prime.js');

    // Use the function to get a valid ContextTier
    const state: SessionContextState = { lastAgent: null, turnCount: 0, injectedComponents: [] };
    const tier: ContextTier = selectContextTier('dev', state);

    // Verify it's one of the valid values
    expect(['FULL', 'REFRESH', 'HANDOFF', 'MINIMAL']).toContain(tier);
  });
});
