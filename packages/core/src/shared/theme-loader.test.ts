/**
 * Theme Schema Consolidation Tests - MSSCI-12478
 *
 * Tests for consolidating quote field into catchphrases array.
 * RED STATE: These tests should FAIL until implementation is complete.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { loadTheme } from './theme-loader.js';

describe('MSSCI-12478: Theme Schema Consolidation', () => {

  describe('AC3: quote field removed from schema', () => {
    it('ThemeAgent interface should have catchphrases array, not quote string', () => {
      // Load any theme and check the agent structure
      const theme = loadTheme('the-expanse');
      assert.ok(theme !== null, 'Theme should load');

      const agent = theme!.agents['sm'];
      assert.ok(agent !== undefined, 'SM agent should exist');

      // Should have catchphrases array
      assert.ok('catchphrases' in agent, 'Agent should have catchphrases property');
      assert.ok(Array.isArray(agent.catchphrases), 'catchphrases should be an array');

      // Should NOT have quote field (removed from schema)
      assert.ok(!('quote' in agent), 'Agent should NOT have quote property after migration');
    });

    it('catchphrases array should contain at least one entry', () => {
      const theme = loadTheme('the-expanse');
      assert.ok(theme !== null, 'Theme should load');

      const agent = theme!.agents['tea'];

      assert.ok(agent.catchphrases !== undefined, 'catchphrases should be defined');
      assert.ok(agent.catchphrases.length > 0, 'catchphrases should have at least one entry');
    });
  });

  describe('AC1: Migration script merges quote into catchphrases', () => {
    it('original quote should be present in catchphrases array', () => {
      // The Investigator's quote was "Doors and corners, kid. That's where they get you."
      // After migration, this should be in the catchphrases array
      const theme = loadTheme('the-expanse');
      assert.ok(theme !== null, 'Theme should load');

      const agent = theme!.agents['orchestrator'];

      assert.ok(
        agent.catchphrases.includes("Doors and corners, kid. That's where they get you."),
        'Original quote should be in catchphrases array'
      );
    });

    it('catchphrases should not have duplicates after migration', () => {
      const theme = loadTheme('the-expanse');
      assert.ok(theme !== null, 'Theme should load');

      const agent = theme!.agents['sm'];

      // Check for duplicates
      const uniqueCatchphrases = [...new Set(agent.catchphrases)];
      assert.strictEqual(
        agent.catchphrases.length,
        uniqueCatchphrases.length,
        'catchphrases should have no duplicates'
      );
    });
  });

  describe('AC4: Theme validation updated', () => {
    it('should parse catchphrases array from YAML', () => {
      const theme = loadTheme('star-trek-tng');
      assert.ok(theme !== null, 'Theme should load');

      // Every agent should have catchphrases parsed
      for (const [agentName, agent] of Object.entries(theme!.agents)) {
        assert.ok(agent.catchphrases !== undefined, `Agent ${agentName} should have catchphrases`);
        assert.ok(Array.isArray(agent.catchphrases), `Agent ${agentName} catchphrases should be array`);
      }
    });
  });
});
