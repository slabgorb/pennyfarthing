/**
 * MSSCI-12796: Tier Selection Logic Tests
 *
 * Tests for selectContextTier() function that determines which context tier
 * to inject based on session state. This is the decision engine for the
 * tiered context injection system (MSSCI-12793).
 *
 * Tier Decision Matrix:
 * | Condition                        | Tier     | Tokens |
 * |----------------------------------|----------|--------|
 * | No lastAgent (new session)       | FULL     | ~4000  |
 * | Different agent (handoff)        | HANDOFF  | ~700   |
 * | Same agent, turnCount > 3        | MINIMAL  | ~200   |
 * | Same agent, turnCount <= 3       | REFRESH  | ~600   |
 *
 * Acceptance Criteria:
 * - AC1: selectContextTier() function implemented
 * - AC2: Returns FULL when no lastAgent in session state
 * - AC3: Returns HANDOFF when current agent differs from lastAgent
 * - AC4: Returns MINIMAL when same agent and turnCount > 3
 * - AC5: Returns REFRESH for all other cases
 * - AC6: Unit tests cover all tier transition scenarios
 */

import { describe, it, expect } from 'vitest';

// AC1: Import the function and type - will fail until implemented
import { selectContextTier, ContextTier } from '../src/prime.js';
import type { SessionContextState } from '../src/claude-service.js';

describe('MSSCI-12796: Tier Selection Logic', () => {

  describe('AC1: selectContextTier() function exists', () => {

    it('should export selectContextTier function from prime module', () => {
      expect(typeof selectContextTier).toBe('function');
    });

    it('should export ContextTier type from prime module', () => {
      // Type check - these should all be valid ContextTier values
      const full: ContextTier = 'FULL';
      const refresh: ContextTier = 'REFRESH';
      const handoff: ContextTier = 'HANDOFF';
      const minimal: ContextTier = 'MINIMAL';

      expect([full, refresh, handoff, minimal]).toEqual([
        'FULL', 'REFRESH', 'HANDOFF', 'MINIMAL'
      ]);
    });

    it('should accept agentName and SessionContextState parameters', () => {
      const state: SessionContextState = {
        lastAgent: null,
        turnCount: 0,
        injectedComponents: [],
      };

      // Should not throw when called with valid parameters
      const result = selectContextTier('dev', state);
      expect(result).toBeDefined();
    });

  });

  describe('AC2: Returns FULL when no lastAgent', () => {

    it('should return FULL when lastAgent is null', () => {
      const state: SessionContextState = {
        lastAgent: null,
        turnCount: 0,
        injectedComponents: [],
      };

      expect(selectContextTier('dev', state)).toBe('FULL');
    });

    it('should return FULL when lastAgent is null regardless of turnCount', () => {
      const state: SessionContextState = {
        lastAgent: null,
        turnCount: 10, // Even with high turn count
        injectedComponents: ['persona', 'skills'],
      };

      expect(selectContextTier('tea', state)).toBe('FULL');
    });

    it('should return FULL for first turn of new session', () => {
      const state: SessionContextState = {
        lastAgent: null,
        turnCount: 0,
        injectedComponents: [],
      };

      // Different agents all get FULL on fresh session
      expect(selectContextTier('sm', state)).toBe('FULL');
      expect(selectContextTier('dev', state)).toBe('FULL');
      expect(selectContextTier('reviewer', state)).toBe('FULL');
    });

  });

  describe('AC3: Returns HANDOFF when agent changes', () => {

    it('should return HANDOFF when current agent differs from lastAgent', () => {
      const state: SessionContextState = {
        lastAgent: 'sm',
        turnCount: 1,
        injectedComponents: ['persona'],
      };

      expect(selectContextTier('dev', state)).toBe('HANDOFF');
    });

    it('should return HANDOFF on agent change regardless of turnCount', () => {
      const state: SessionContextState = {
        lastAgent: 'tea',
        turnCount: 10, // High turn count
        injectedComponents: ['persona', 'skills', 'guides'],
      };

      expect(selectContextTier('dev', state)).toBe('HANDOFF');
    });

    it('should return HANDOFF for various agent transitions', () => {
      const transitions = [
        { from: 'sm', to: 'tea' },
        { from: 'tea', to: 'dev' },
        { from: 'dev', to: 'reviewer' },
        { from: 'reviewer', to: 'sm' },
        { from: 'architect', to: 'pm' },
      ];

      for (const { from, to } of transitions) {
        const state: SessionContextState = {
          lastAgent: from,
          turnCount: 2,
          injectedComponents: [],
        };

        expect(selectContextTier(to, state)).toBe('HANDOFF');
      }
    });

    it('should be case-sensitive for agent names', () => {
      const state: SessionContextState = {
        lastAgent: 'dev',
        turnCount: 2,
        injectedComponents: [],
      };

      // Different case = different agent = HANDOFF
      expect(selectContextTier('Dev', state)).toBe('HANDOFF');
      expect(selectContextTier('DEV', state)).toBe('HANDOFF');
    });

  });

  describe('AC4: Returns MINIMAL when same agent and turnCount > 3', () => {

    it('should return MINIMAL when same agent and turnCount is 4', () => {
      const state: SessionContextState = {
        lastAgent: 'dev',
        turnCount: 4,
        injectedComponents: ['persona', 'skills'],
      };

      expect(selectContextTier('dev', state)).toBe('MINIMAL');
    });

    it('should return MINIMAL when same agent and turnCount is 5', () => {
      const state: SessionContextState = {
        lastAgent: 'dev',
        turnCount: 5,
        injectedComponents: ['persona', 'skills'],
      };

      expect(selectContextTier('dev', state)).toBe('MINIMAL');
    });

    it('should return MINIMAL for high turn counts', () => {
      const state: SessionContextState = {
        lastAgent: 'tea',
        turnCount: 100,
        injectedComponents: ['persona'],
      };

      expect(selectContextTier('tea', state)).toBe('MINIMAL');
    });

    it('should return MINIMAL for various agents at turn > 3', () => {
      const agents = ['sm', 'tea', 'dev', 'reviewer', 'architect', 'pm'];

      for (const agent of agents) {
        const state: SessionContextState = {
          lastAgent: agent,
          turnCount: 5,
          injectedComponents: [],
        };

        expect(selectContextTier(agent, state)).toBe('MINIMAL');
      }
    });

  });

  describe('AC5: Returns REFRESH for all other cases', () => {

    it('should return REFRESH when same agent and turnCount is 1', () => {
      const state: SessionContextState = {
        lastAgent: 'dev',
        turnCount: 1,
        injectedComponents: ['persona'],
      };

      expect(selectContextTier('dev', state)).toBe('REFRESH');
    });

    it('should return REFRESH when same agent and turnCount is 2', () => {
      const state: SessionContextState = {
        lastAgent: 'dev',
        turnCount: 2,
        injectedComponents: ['persona'],
      };

      expect(selectContextTier('dev', state)).toBe('REFRESH');
    });

    it('should return REFRESH when same agent and turnCount is 3', () => {
      const state: SessionContextState = {
        lastAgent: 'dev',
        turnCount: 3,
        injectedComponents: ['persona'],
      };

      expect(selectContextTier('dev', state)).toBe('REFRESH');
    });

    it('should return REFRESH for various agents at turn 1-3', () => {
      const agents = ['sm', 'tea', 'dev', 'reviewer'];

      for (const agent of agents) {
        for (const turnCount of [1, 2, 3]) {
          const state: SessionContextState = {
            lastAgent: agent,
            turnCount,
            injectedComponents: [],
          };

          expect(selectContextTier(agent, state)).toBe('REFRESH');
        }
      }
    });

  });

  describe('AC6: Edge cases and boundary conditions', () => {

    it('should handle turnCount exactly at boundary (3 = REFRESH, 4 = MINIMAL)', () => {
      const stateAt3: SessionContextState = {
        lastAgent: 'dev',
        turnCount: 3,
        injectedComponents: [],
      };

      const stateAt4: SessionContextState = {
        lastAgent: 'dev',
        turnCount: 4,
        injectedComponents: [],
      };

      expect(selectContextTier('dev', stateAt3)).toBe('REFRESH');
      expect(selectContextTier('dev', stateAt4)).toBe('MINIMAL');
    });

    it('should handle empty string lastAgent as truthy (not null)', () => {
      const state: SessionContextState = {
        lastAgent: '', // Empty string, but not null
        turnCount: 1,
        injectedComponents: [],
      };

      // Empty string !== 'dev', so should be HANDOFF
      expect(selectContextTier('dev', state)).toBe('HANDOFF');
    });

    it('should handle turnCount of 0 with valid lastAgent', () => {
      const state: SessionContextState = {
        lastAgent: 'dev',
        turnCount: 0,
        injectedComponents: [],
      };

      // Same agent, turn 0 <= 3 = REFRESH
      expect(selectContextTier('dev', state)).toBe('REFRESH');
    });

    it('should not be affected by injectedComponents', () => {
      const stateEmpty: SessionContextState = {
        lastAgent: 'dev',
        turnCount: 2,
        injectedComponents: [],
      };

      const stateFull: SessionContextState = {
        lastAgent: 'dev',
        turnCount: 2,
        injectedComponents: ['persona', 'skills', 'guides', 'sprint', 'session'],
      };

      // Both should return same tier - injectedComponents doesn't affect selection
      expect(selectContextTier('dev', stateEmpty)).toBe('REFRESH');
      expect(selectContextTier('dev', stateFull)).toBe('REFRESH');
    });

    it('should handle whitespace in agent names', () => {
      const state: SessionContextState = {
        lastAgent: 'dev',
        turnCount: 2,
        injectedComponents: [],
      };

      // Agent with trailing space is different agent
      expect(selectContextTier('dev ', state)).toBe('HANDOFF');
      expect(selectContextTier(' dev', state)).toBe('HANDOFF');
    });

    it('should prioritize conditions in correct order', () => {
      // Priority: 1) null lastAgent → FULL
      //          2) different agent → HANDOFF
      //          3) turnCount > 3 → MINIMAL
      //          4) else → REFRESH

      // Even with high turn count, null lastAgent = FULL
      expect(selectContextTier('dev', {
        lastAgent: null,
        turnCount: 100,
        injectedComponents: [],
      })).toBe('FULL');

      // Even with high turn count, different agent = HANDOFF
      expect(selectContextTier('tea', {
        lastAgent: 'dev',
        turnCount: 100,
        injectedComponents: [],
      })).toBe('HANDOFF');

      // Same agent, high turn count = MINIMAL
      expect(selectContextTier('dev', {
        lastAgent: 'dev',
        turnCount: 100,
        injectedComponents: [],
      })).toBe('MINIMAL');

      // Same agent, low turn count = REFRESH
      expect(selectContextTier('dev', {
        lastAgent: 'dev',
        turnCount: 1,
        injectedComponents: [],
      })).toBe('REFRESH');
    });

  });

  describe('Return type validation', () => {

    it('should always return a valid ContextTier value', () => {
      const validTiers = ['FULL', 'REFRESH', 'HANDOFF', 'MINIMAL'];

      const testCases: Array<{ agent: string; state: SessionContextState }> = [
        { agent: 'dev', state: { lastAgent: null, turnCount: 0, injectedComponents: [] } },
        { agent: 'dev', state: { lastAgent: 'sm', turnCount: 1, injectedComponents: [] } },
        { agent: 'dev', state: { lastAgent: 'dev', turnCount: 1, injectedComponents: [] } },
        { agent: 'dev', state: { lastAgent: 'dev', turnCount: 5, injectedComponents: [] } },
      ];

      for (const { agent, state } of testCases) {
        const result = selectContextTier(agent, state);
        expect(validTiers).toContain(result);
      }
    });

  });

});
