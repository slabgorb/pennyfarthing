/**
 * Tests for Story 11-12: Spider chart report generator
 *
 * These tests verify:
 * AC1: generate-spider-report.ts mirrors generate-report.ts interface
 * AC2: Supports role, theme, and OCEAN filters
 * AC3: Comparison mode uses spider overlay charts
 * AC4: Output as markdown with embedded SVGs
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

// ============================================================================
// AC1: Generator Module Exists and Exports (mirrors generate-report.ts)
// ============================================================================

describe('AC1: Spider Report Generator Module Exists', () => {
  it('should export generateReport function', async () => {
    const module = await import('./generate-spider-report.js');
    assert.ok(
      typeof module.generateReport === 'function',
      'generateReport should be a function'
    );
  });

  it('should export filterByOcean function', async () => {
    const module = await import('./generate-spider-report.js');
    assert.ok(
      typeof module.filterByOcean === 'function',
      'filterByOcean should be a function'
    );
  });

  it('should export filterByRole function', async () => {
    const module = await import('./generate-spider-report.js');
    assert.ok(
      typeof module.filterByRole === 'function',
      'filterByRole should be a function'
    );
  });

  it('should export filterByTheme function', async () => {
    const module = await import('./generate-spider-report.js');
    assert.ok(
      typeof module.filterByTheme === 'function',
      'filterByTheme should be a function'
    );
  });

  it('should export compareCharacters function', async () => {
    const module = await import('./generate-spider-report.js');
    assert.ok(
      typeof module.compareCharacters === 'function',
      'compareCharacters should be a function'
    );
  });

  it('should export parseOceanFilter function', async () => {
    const module = await import('./generate-spider-report.js');
    assert.ok(
      typeof module.parseOceanFilter === 'function',
      'parseOceanFilter should be a function'
    );
  });
});

// ============================================================================
// AC2: OCEAN Filter Support (same as generate-report.ts)
// ============================================================================

describe('AC2: OCEAN Filter Parsing', () => {
  it('should parse "O>=4" into dimension O, operator >=, value 4', async () => {
    const { parseOceanFilter } = await import('./generate-spider-report.js');
    const filter = parseOceanFilter('O>=4');

    assert.strictEqual(filter.dimension, 'O');
    assert.strictEqual(filter.operator, '>=');
    assert.strictEqual(filter.value, 4);
  });

  it('should parse "A<=2" into dimension A, operator <=, value 2', async () => {
    const { parseOceanFilter } = await import('./generate-spider-report.js');
    const filter = parseOceanFilter('A<=2');

    assert.strictEqual(filter.dimension, 'A');
    assert.strictEqual(filter.operator, '<=');
    assert.strictEqual(filter.value, 2);
  });

  it('should parse "C=5" into dimension C, operator =, value 5', async () => {
    const { parseOceanFilter } = await import('./generate-spider-report.js');
    const filter = parseOceanFilter('C=5');

    assert.strictEqual(filter.dimension, 'C');
    assert.strictEqual(filter.operator, '=');
    assert.strictEqual(filter.value, 5);
  });

  it('should parse "N>3" into dimension N, operator >, value 3', async () => {
    const { parseOceanFilter } = await import('./generate-spider-report.js');
    const filter = parseOceanFilter('N>3');

    assert.strictEqual(filter.dimension, 'N');
    assert.strictEqual(filter.operator, '>');
    assert.strictEqual(filter.value, 3);
  });

  it('should parse "E<2" into dimension E, operator <, value 2', async () => {
    const { parseOceanFilter } = await import('./generate-spider-report.js');
    const filter = parseOceanFilter('E<2');

    assert.strictEqual(filter.dimension, 'E');
    assert.strictEqual(filter.operator, '<');
    assert.strictEqual(filter.value, 2);
  });

  it('should throw error for invalid dimension "X>=4"', async () => {
    const { parseOceanFilter } = await import('./generate-spider-report.js');

    assert.throws(
      () => parseOceanFilter('X>=4'),
      /invalid.*dimension/i,
      'Should throw for invalid OCEAN dimension'
    );
  });

  it('should throw error for invalid operator "O~4"', async () => {
    const { parseOceanFilter } = await import('./generate-spider-report.js');

    assert.throws(
      () => parseOceanFilter('O~4'),
      /invalid.*operator/i,
      'Should throw for invalid operator'
    );
  });

  it('should throw error for invalid value "O>=six"', async () => {
    const { parseOceanFilter } = await import('./generate-spider-report.js');

    assert.throws(
      () => parseOceanFilter('O>=six'),
      /invalid.*value/i,
      'Should throw for non-numeric value'
    );
  });
});

describe('AC2: OCEAN Filtering Results', () => {
  it('should return only characters with O >= 4 when filtering by "O>=4"', async () => {
    const { filterByOcean } = await import('./generate-spider-report.js');
    const results = filterByOcean('O>=4');

    assert.ok(Array.isArray(results), 'Should return array');
    assert.ok(results.length > 0, 'Should return at least one character');

    // Verify all returned characters have O >= 4
    for (const char of results) {
      assert.ok(
        char.ocean.O >= 4,
        `Character ${char.theme}:${char.agent} should have O >= 4, got ${char.ocean.O}`
      );
    }
  });

  it('should return only characters with A <= 2 when filtering by "A<=2"', async () => {
    const { filterByOcean } = await import('./generate-spider-report.js');
    const results = filterByOcean('A<=2');

    assert.ok(Array.isArray(results), 'Should return array');

    for (const char of results) {
      assert.ok(
        char.ocean.A <= 2,
        `Character ${char.theme}:${char.agent} should have A <= 2, got ${char.ocean.A}`
      );
    }
  });

  it('should return characters with exact match for "C=5"', async () => {
    const { filterByOcean } = await import('./generate-spider-report.js');
    const results = filterByOcean('C=5');

    for (const char of results) {
      assert.strictEqual(
        char.ocean.C,
        5,
        `Character ${char.theme}:${char.agent} should have C = 5`
      );
    }
  });
});

describe('AC2: Role Filter Support', () => {
  it('should return only reviewers when filtering by role "reviewer"', async () => {
    const { filterByRole } = await import('./generate-spider-report.js');
    const results = filterByRole('reviewer');

    assert.ok(Array.isArray(results), 'Should return array');
    assert.ok(results.length > 0, 'Should return at least one character');

    for (const char of results) {
      assert.strictEqual(
        char.agent,
        'reviewer',
        `Should only return reviewers, got ${char.agent}`
      );
    }
  });

  it('should return all agents for a role across all themes', async () => {
    const { filterByRole } = await import('./generate-spider-report.js');
    const results = filterByRole('sm');

    // Should have one SM per theme (63 themes)
    assert.ok(results.length >= 60, `Should have 60+ SMs, got ${results.length}`);
  });

  it('should throw error for invalid role', async () => {
    const { filterByRole } = await import('./generate-spider-report.js');

    assert.throws(
      () => filterByRole('invalid-role'),
      /invalid.*role/i,
      'Should throw for invalid role'
    );
  });
});

describe('AC2: Theme Filter Support', () => {
  it('should return all 11 agents for deadwood theme', async () => {
    const { filterByTheme } = await import('./generate-spider-report.js');
    const results = filterByTheme('deadwood');

    assert.ok(Array.isArray(results), 'Should return array');
    assert.strictEqual(results.length, 11, 'Should return exactly 11 agents');

    for (const char of results) {
      assert.strictEqual(
        char.theme,
        'deadwood',
        `Should only return deadwood characters, got ${char.theme}`
      );
    }
  });

  it('should return agents with character names from theme', async () => {
    const { filterByTheme } = await import('./generate-spider-report.js');
    const results = filterByTheme('deadwood');

    const sm = results.find((r) => r.agent === 'sm');
    assert.ok(sm, 'Should have an SM agent');
    assert.ok(sm.character, 'SM should have a character name');
    assert.ok(sm.character.length > 0, 'Character name should not be empty');
  });

  it('should throw error for non-existent theme', async () => {
    const { filterByTheme } = await import('./generate-spider-report.js');

    assert.throws(
      () => filterByTheme('nonexistent-theme'),
      /theme.*not found/i,
      'Should throw for non-existent theme'
    );
  });
});

describe('AC2: Combined Filters', () => {
  it('should support combining role and OCEAN filters', async () => {
    const { generateReport } = await import('./generate-spider-report.js');
    const results = generateReport({ role: 'reviewer', ocean: 'A<=2' });

    assert.ok(Array.isArray(results.characters), 'Should return characters array');

    for (const char of results.characters) {
      assert.strictEqual(char.agent, 'reviewer', 'Should be reviewer');
      assert.ok(char.ocean.A <= 2, `Should have A <= 2, got ${char.ocean.A}`);
    }
  });

  it('should support combining theme and OCEAN filters', async () => {
    const { generateReport } = await import('./generate-spider-report.js');
    const results = generateReport({ theme: 'deadwood', ocean: 'N>=4' });

    for (const char of results.characters) {
      assert.strictEqual(char.theme, 'deadwood', 'Should be deadwood');
      assert.ok(char.ocean.N >= 4, `Should have N >= 4, got ${char.ocean.N}`);
    }
  });
});

// ============================================================================
// AC3: Comparison Mode Uses Spider Overlay Charts
// ============================================================================

describe('AC3: Character Comparison with Spider Overlay', () => {
  it('should compare 2 characters using overlay chart', async () => {
    const { compareCharacters } = await import('./generate-spider-report.js');
    const result = compareCharacters(['deadwood:sm', 'firefly:sm']);

    assert.ok(result.characters, 'Should have characters array');
    assert.strictEqual(result.characters.length, 2, 'Should have 2 characters');
    assert.strictEqual(result.characters[0].theme, 'deadwood');
    assert.strictEqual(result.characters[1].theme, 'firefly');
  });

  it('should compare 3 characters using overlay chart', async () => {
    const { compareCharacters } = await import('./generate-spider-report.js');
    const result = compareCharacters(['deadwood:sm', 'firefly:sm', 'fargo:sm']);

    assert.strictEqual(result.characters.length, 3, 'Should have 3 characters');
  });

  it('should compare 4 characters using overlay chart', async () => {
    const { compareCharacters } = await import('./generate-spider-report.js');
    const result = compareCharacters([
      'deadwood:sm',
      'firefly:sm',
      'fargo:sm',
      'succession:sm',
    ]);

    assert.strictEqual(result.characters.length, 4, 'Should have 4 characters');
  });

  it('should include OCEAN scores for each compared character', async () => {
    const { compareCharacters } = await import('./generate-spider-report.js');
    const result = compareCharacters(['deadwood:sm', 'firefly:sm']);

    for (const char of result.characters) {
      assert.ok(char.ocean, 'Character should have OCEAN scores');
      assert.ok(typeof char.ocean.O === 'number', 'O should be a number');
      assert.ok(typeof char.ocean.C === 'number', 'C should be a number');
      assert.ok(typeof char.ocean.E === 'number', 'E should be a number');
      assert.ok(typeof char.ocean.A === 'number', 'A should be a number');
      assert.ok(typeof char.ocean.N === 'number', 'N should be a number');
    }
  });

  it('should include character name for each compared character', async () => {
    const { compareCharacters } = await import('./generate-spider-report.js');
    const result = compareCharacters(['deadwood:sm', 'firefly:sm']);

    for (const char of result.characters) {
      assert.ok(char.character, 'Character should have a name');
      assert.ok(char.character.length > 0, 'Character name should not be empty');
    }
  });

  it('should reject comparison with fewer than 2 characters', async () => {
    const { compareCharacters } = await import('./generate-spider-report.js');

    assert.throws(
      () => compareCharacters(['deadwood:sm']),
      /at least 2/i,
      'Should require at least 2 characters'
    );
  });

  it('should reject comparison with more than 4 characters', async () => {
    const { compareCharacters } = await import('./generate-spider-report.js');

    assert.throws(
      () =>
        compareCharacters([
          'deadwood:sm',
          'firefly:sm',
          'fargo:sm',
          'succession:sm',
          'breaking-bad:sm',
        ]),
      /at most 4/i,
      'Should allow at most 4 characters'
    );
  });

  it('should parse "theme:agent" format correctly', async () => {
    const { compareCharacters } = await import('./generate-spider-report.js');
    const result = compareCharacters(['deadwood:reviewer', 'firefly:tea']);

    assert.strictEqual(result.characters[0].theme, 'deadwood');
    assert.strictEqual(result.characters[0].agent, 'reviewer');
    assert.strictEqual(result.characters[1].theme, 'firefly');
    assert.strictEqual(result.characters[1].agent, 'tea');
  });

  it('should throw error for invalid theme:agent format', async () => {
    const { compareCharacters } = await import('./generate-spider-report.js');

    assert.throws(
      () => compareCharacters(['deadwood-sm', 'firefly:sm']),
      /invalid.*format/i,
      'Should throw for missing colon separator'
    );
  });

  it('should throw error for non-existent theme in comparison', async () => {
    const { compareCharacters } = await import('./generate-spider-report.js');

    assert.throws(
      () => compareCharacters(['nonexistent:sm', 'firefly:sm']),
      /theme.*not found/i,
      'Should throw for non-existent theme'
    );
  });

  it('should throw error for non-existent agent in comparison', async () => {
    const { compareCharacters } = await import('./generate-spider-report.js');

    assert.throws(
      () => compareCharacters(['deadwood:nonexistent', 'firefly:sm']),
      /agent.*not found/i,
      'Should throw for non-existent agent'
    );
  });

  it('should generate overlay spider chart in comparison markdown', async () => {
    const { compareCharacters } = await import('./generate-spider-report.js');
    const result = compareCharacters(['deadwood:sm', 'firefly:sm']);

    // Overlay spider charts are embedded as data URLs
    assert.ok(
      result.markdown.includes('data:image/svg+xml;base64,'),
      'Should embed spider chart as data URL'
    );
  });
});

// ============================================================================
// AC4: Markdown Output with Embedded Spider SVGs
// ============================================================================

describe('AC4: Markdown Output Format', () => {
  it('should output valid markdown string', async () => {
    const { generateReport } = await import('./generate-spider-report.js');
    const result = generateReport({ role: 'sm' });

    assert.ok(typeof result.markdown === 'string', 'Should have markdown property');
    assert.ok(result.markdown.length > 0, 'Markdown should not be empty');
  });

  it('should include markdown header', async () => {
    const { generateReport } = await import('./generate-spider-report.js');
    const result = generateReport({ role: 'sm' });

    assert.ok(result.markdown.includes('#'), 'Should have markdown header');
  });

  it('should embed spider chart SVGs as data URLs in markdown', async () => {
    const { generateReport } = await import('./generate-spider-report.js');
    const result = generateReport({ role: 'sm' });

    // Spider charts are embedded as base64 data URLs
    assert.ok(
      result.markdown.includes('data:image/svg+xml;base64,'),
      'Should embed SVGs as data URLs'
    );
  });

  it('should include character names in output', async () => {
    const { generateReport } = await import('./generate-spider-report.js');
    const result = generateReport({ theme: 'deadwood' });

    // Deadwood SM is Seth Bullock
    assert.ok(
      result.markdown.includes('Bullock') || result.markdown.includes('Seth'),
      'Should include character names'
    );
  });

  it('should include OCEAN scores table for filtered results', async () => {
    const { generateReport } = await import('./generate-spider-report.js');
    const result = generateReport({ ocean: 'O>=4' });

    // Should have a table with OCEAN scores
    assert.ok(
      result.markdown.includes('|') && result.markdown.includes('O'),
      'Should include OCEAN table'
    );
  });

  it('should format comparison with overlay spider chart and details table', async () => {
    const { compareCharacters } = await import('./generate-spider-report.js');
    const result = compareCharacters(['deadwood:sm', 'firefly:sm']);

    assert.ok(result.markdown, 'Should have markdown output');
    // Should have spider chart comparison title
    assert.ok(
      result.markdown.includes('Spider Chart Comparison'),
      'Should have comparison title'
    );
    // Should have character details section
    assert.ok(
      result.markdown.includes('Character Details'),
      'Should have character details section'
    );
  });

  it('should include spider chart title in report header', async () => {
    const { generateReport } = await import('./generate-spider-report.js');
    const result = generateReport({ role: 'sm' });

    assert.ok(
      result.markdown.includes('Spider Chart Report'),
      'Should reference spider charts in header'
    );
  });
});

// ============================================================================
// Integration: Full Report Generation
// ============================================================================

describe('Integration: Full Spider Report Pipeline', () => {
  it('should generate complete report with filter, characters, and markdown', async () => {
    const { generateReport } = await import('./generate-spider-report.js');
    const result = generateReport({ role: 'reviewer' });

    assert.ok(result.characters, 'Should have characters');
    assert.ok(result.markdown, 'Should have markdown');
    assert.ok(result.filter, 'Should echo back filter criteria');
    assert.strictEqual(result.filter.role, 'reviewer');
  });

  it('should generate report with multiple combined filters', async () => {
    const { generateReport } = await import('./generate-spider-report.js');
    const result = generateReport({
      role: 'sm',
      ocean: 'C>=4',
    });

    // All results should match both criteria
    for (const char of result.characters) {
      assert.strictEqual(char.agent, 'sm');
      assert.ok(char.ocean.C >= 4);
    }
  });

  it('should return results matching O=1 filter', async () => {
    const { generateReport } = await import('./generate-spider-report.js');
    const result = generateReport({
      ocean: 'O=1',
    });

    // This should return results that match O=1
    for (const char of result.characters) {
      assert.strictEqual(char.ocean.O, 1);
    }
  });

  it('should handle empty result set gracefully', async () => {
    const { generateReport } = await import('./generate-spider-report.js');
    // Very restrictive filter that likely returns nothing
    const result = generateReport({
      role: 'sm',
      ocean: 'O=1',
      theme: 'deadwood', // Valid theme for testing
    });

    assert.ok(Array.isArray(result.characters), 'Should return array even if empty');
    assert.ok(typeof result.markdown === 'string', 'Should return markdown even if empty');
  });
});
