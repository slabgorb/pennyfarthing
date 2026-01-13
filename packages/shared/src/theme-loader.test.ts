import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  loadTheme,
  listThemes,
  getAgentPersona,
} from './theme-loader.js';

describe('theme-loader', () => {
  describe('loadTheme', () => {
    it('should load a valid theme by name', () => {
      const theme = loadTheme('shakespeare');

      assert.ok(theme !== null, 'Should find theme');
      assert.strictEqual(theme!.name, 'shakespeare');
      assert.ok('agents' in theme!, 'Should have agents');
    });

    it('should return null for invalid theme name', () => {
      const theme = loadTheme('nonexistent-theme-xyz');

      assert.strictEqual(theme, null);
    });

    it('should include all required agent personas', () => {
      const theme = loadTheme('shakespeare');

      assert.ok(theme !== null);
      const requiredAgents = ['sm', 'tea', 'dev', 'reviewer'];
      for (const agent of requiredAgents) {
        assert.ok(agent in theme!.agents, `Should have ${agent} persona`);
      }
    });

    it('should parse agent properties correctly', () => {
      const theme = loadTheme('shakespeare');

      assert.ok(theme !== null);
      const smAgent = theme!.agents['sm'];
      assert.ok('character' in smAgent, 'Agent should have character');
      assert.ok('style' in smAgent, 'Agent should have style');
      assert.ok('role' in smAgent, 'Agent should have role');
      assert.ok('quote' in smAgent, 'Agent should have quote');
    });
  });

  describe('listThemes', () => {
    it('should return array of theme names', () => {
      const themes = listThemes();

      assert.ok(Array.isArray(themes), 'Should return array');
      assert.ok(themes.length > 0, 'Should have at least one theme');
    });

    it('should include known themes', () => {
      const themes = listThemes();

      // These themes should exist based on project structure
      const knownThemes = ['shakespeare', 'norse-mythology', 'star-trek'];
      for (const known of knownThemes) {
        assert.ok(
          themes.some(t => t.includes(known.split('-')[0])),
          `Should include theme matching ${known}`
        );
      }
    });
  });

  describe('getAgentPersona', () => {
    it('should return agent persona for valid theme and agent', () => {
      const persona = getAgentPersona('shakespeare', 'sm');

      assert.ok(persona !== null, 'Should find persona');
      assert.ok('character' in persona!, 'Should have character');
    });

    it('should return null for invalid theme', () => {
      const persona = getAgentPersona('nonexistent', 'sm');

      assert.strictEqual(persona, null);
    });

    it('should return null for invalid agent', () => {
      const persona = getAgentPersona('shakespeare', 'nonexistent-agent');

      assert.strictEqual(persona, null);
    });

    it('should return correct character for known persona', () => {
      // We know shakespeare theme has specific characters
      const persona = getAgentPersona('shakespeare', 'sm');

      assert.ok(persona !== null);
      assert.ok(typeof persona!.character === 'string');
      assert.ok(persona!.character.length > 0);
    });
  });
});
