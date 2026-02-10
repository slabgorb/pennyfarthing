/**
 * Theme Schema Migration Tests - MSSCI-12478
 *
 * Tests for the migration script that consolidates quote into catchphrases.
 * RED STATE: These tests should FAIL until implementation is complete.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverAllThemeDirs } from './theme-loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('MSSCI-12478: Theme YAML Migration', () => {
  let allThemeFiles: Array<{ file: string; dir: string }>;

  before(() => {
    // Discover all theme directories (core + theme packages + custom)
    const themeDirs = discoverAllThemeDirs();
    const seen = new Set<string>();
    allThemeFiles = [];

    for (const dir of themeDirs) {
      if (!existsSync(dir)) continue;
      const files = readdirSync(dir).filter(f => f.endsWith('.yaml'));
      for (const file of files) {
        if (!seen.has(file)) {
          seen.add(file);
          allThemeFiles.push({ file, dir });
        }
      }
    }
  });

  describe('AC2: All themes updated', () => {
    it('should have themes across all discovered sources', () => {
      assert.ok(allThemeFiles.length > 0, 'Should discover at least one theme');
    });

    it('no theme file should contain quote: field under agents', () => {
      const themesWithQuote: string[] = [];

      for (const { file, dir } of allThemeFiles) {
        const content = readFileSync(join(dir, file), 'utf-8');
        // Check for quote: at 4-space indent (under agent definition)
        if (/^ {4}quote:/m.test(content)) {
          themesWithQuote.push(file);
        }
      }

      assert.strictEqual(
        themesWithQuote.length,
        0,
        `These themes still have quote field: ${themesWithQuote.slice(0, 5).join(', ')}${themesWithQuote.length > 5 ? ` and ${themesWithQuote.length - 5} more` : ''}`
      );
    });

    it('every theme should have catchphrases array for each agent', () => {
      const themesWithMissingCatchphrases: string[] = [];

      for (const { file, dir } of allThemeFiles) {
        // Skip control.yaml which is a special baseline theme
        if (file === 'control.yaml') continue;

        const content = readFileSync(join(dir, file), 'utf-8');
        // Count catchphrases section markers (10 agents expected)
        const catchphrasesMatches = content.match(/^ {4}catchphrases:/gm);

        if (!catchphrasesMatches || catchphrasesMatches.length < 10) {
          themesWithMissingCatchphrases.push(file);
        }
      }

      assert.strictEqual(
        themesWithMissingCatchphrases.length,
        0,
        `These themes have missing catchphrases: ${themesWithMissingCatchphrases.slice(0, 5).join(', ')}${themesWithMissingCatchphrases.length > 5 ? ` and ${themesWithMissingCatchphrases.length - 5} more` : ''}`
      );
    });
  });

  describe('AC1: Migration preserves original quote in catchphrases', () => {
    // These tests use resolveThemePath so they work regardless of which package
    // the theme lives in.
    it('the-expanse orchestrator catchphrases should contain original quote', () => {
      const themeDirs = discoverAllThemeDirs();
      let content: string | null = null;
      for (const dir of themeDirs) {
        const p = join(dir, 'the-expanse.yaml');
        if (existsSync(p)) { content = readFileSync(p, 'utf-8'); break; }
      }
      assert.ok(content, 'the-expanse.yaml should be discoverable');

      // Original quote was: "Doors and corners, kid. That's where they get you."
      // This should now be in the catchphrases array
      assert.ok(
        content!.includes("Doors and corners, kid. That's where they get you."),
        'Quote should still be present in file'
      );
      assert.ok(
        /catchphrases:[\s\S]*?Doors and corners/.test(content!),
        'Quote should be within catchphrases array, not as separate quote field'
      );
    });

    it('star-trek-tng picard catchphrases should contain original quote', () => {
      const themeDirs = discoverAllThemeDirs();
      let content: string | null = null;
      for (const dir of themeDirs) {
        const p = join(dir, 'star-trek-tng.yaml');
        if (existsSync(p)) { content = readFileSync(p, 'utf-8'); break; }
      }
      assert.ok(content, 'star-trek-tng.yaml should be discoverable');

      // Picard's famous quote should be in catchphrases
      assert.ok(
        /catchphrases:[\s\S]*?(Make it so|Engage)/.test(content!),
        'Picard quote should be within catchphrases array'
      );
    });
  });
});
