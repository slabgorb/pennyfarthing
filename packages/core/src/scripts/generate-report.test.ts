/**
 * Tests for Story 11-7: Build slice/report generator
 * Updated for Story 141-8: Result objects instead of throws
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('AC1: Report Generator Module Exists', () => {
  it('should export generateReport function', async () => {
    const module = await import('./generate-report.js');
    assert.ok(typeof module.generateReport === 'function');
  });
  it('should export filterByOcean function', async () => {
    const module = await import('./generate-report.js');
    assert.ok(typeof module.filterByOcean === 'function');
  });
  it('should export filterByRole function', async () => {
    const module = await import('./generate-report.js');
    assert.ok(typeof module.filterByRole === 'function');
  });
  it('should export filterByTheme function', async () => {
    const module = await import('./generate-report.js');
    assert.ok(typeof module.filterByTheme === 'function');
  });
  it('should export compareCharacters function', async () => {
    const module = await import('./generate-report.js');
    assert.ok(typeof module.compareCharacters === 'function');
  });
  it('should export parseOceanFilter function', async () => {
    const module = await import('./generate-report.js');
    assert.ok(typeof module.parseOceanFilter === 'function');
  });
});

describe('AC2: OCEAN Filter Parsing', () => {
  it('should parse "O>=4"', async () => {
    const { parseOceanFilter } = await import('./generate-report.js');
    const result = parseOceanFilter('O>=4');
    assert.ok(result.success);
    assert.strictEqual(result.data!.dimension, 'O');
    assert.strictEqual(result.data!.operator, '>=');
    assert.strictEqual(result.data!.value, 4);
  });
  it('should parse "A<=2"', async () => {
    const { parseOceanFilter } = await import('./generate-report.js');
    const result = parseOceanFilter('A<=2');
    assert.ok(result.success);
    assert.strictEqual(result.data!.dimension, 'A');
    assert.strictEqual(result.data!.operator, '<=');
    assert.strictEqual(result.data!.value, 2);
  });
  it('should parse "C=5"', async () => {
    const { parseOceanFilter } = await import('./generate-report.js');
    const result = parseOceanFilter('C=5');
    assert.ok(result.success);
    assert.strictEqual(result.data!.dimension, 'C');
    assert.strictEqual(result.data!.operator, '=');
    assert.strictEqual(result.data!.value, 5);
  });
  it('should parse "N>3"', async () => {
    const { parseOceanFilter } = await import('./generate-report.js');
    const result = parseOceanFilter('N>3');
    assert.ok(result.success);
    assert.strictEqual(result.data!.dimension, 'N');
    assert.strictEqual(result.data!.operator, '>');
    assert.strictEqual(result.data!.value, 3);
  });
  it('should parse "E<2"', async () => {
    const { parseOceanFilter } = await import('./generate-report.js');
    const result = parseOceanFilter('E<2');
    assert.ok(result.success);
    assert.strictEqual(result.data!.dimension, 'E');
    assert.strictEqual(result.data!.operator, '<');
    assert.strictEqual(result.data!.value, 2);
  });
  it('should return error for invalid dimension "X>=4"', async () => {
    const { parseOceanFilter } = await import('./generate-report.js');
    const result = parseOceanFilter('X>=4');
    assert.strictEqual(result.success, false);
    assert.ok(result.error?.match(/invalid.*dimension/i));
  });
  it('should return error for invalid operator "O~4"', async () => {
    const { parseOceanFilter } = await import('./generate-report.js');
    const result = parseOceanFilter('O~4');
    assert.strictEqual(result.success, false);
    assert.ok(result.error?.match(/invalid.*operator/i));
  });
  it('should return error for invalid value "O>=six"', async () => {
    const { parseOceanFilter } = await import('./generate-report.js');
    const result = parseOceanFilter('O>=six');
    assert.strictEqual(result.success, false);
    assert.ok(result.error?.match(/invalid.*value/i));
  });
});

describe('AC2: OCEAN Filtering Results', () => {
  it('should return only characters with O >= 4', async () => {
    const { filterByOcean } = await import('./generate-report.js');
    const result = filterByOcean('O>=4');
    assert.ok(result.success);
    const chars = result.data!;
    assert.ok(chars.length > 0);
    for (const char of chars) {
      assert.ok(char.ocean.O >= 4, `${char.theme}:${char.agent} should have O >= 4, got ${char.ocean.O}`);
    }
  });
  it('should return only characters with A <= 2', async () => {
    const { filterByOcean } = await import('./generate-report.js');
    const result = filterByOcean('A<=2');
    assert.ok(result.success);
    for (const char of result.data!) {
      assert.ok(char.ocean.A <= 2, `${char.theme}:${char.agent} should have A <= 2, got ${char.ocean.A}`);
    }
  });
  it('should return characters with exact match for "C=5"', async () => {
    const { filterByOcean } = await import('./generate-report.js');
    const result = filterByOcean('C=5');
    assert.ok(result.success);
    for (const char of result.data!) {
      assert.strictEqual(char.ocean.C, 5);
    }
  });
});

describe('AC2: Role Filter Support', () => {
  it('should return only reviewers', async () => {
    const { filterByRole } = await import('./generate-report.js');
    const result = filterByRole('reviewer');
    assert.ok(result.success);
    const chars = result.data!;
    assert.ok(chars.length > 0);
    for (const char of chars) {
      assert.strictEqual(char.agent, 'reviewer');
    }
  });
  it('should return all agents for a role across all themes', async () => {
    const { filterByRole } = await import('./generate-report.js');
    const result = filterByRole('sm');
    assert.ok(result.success);
    assert.ok(result.data!.length >= 60, `Should have 60+ SMs, got ${result.data!.length}`);
  });
  it('should return error for invalid role', async () => {
    const { filterByRole } = await import('./generate-report.js');
    const result = filterByRole('invalid-role');
    assert.strictEqual(result.success, false);
    assert.ok(result.error?.match(/invalid.*role/i));
  });
});

describe('AC2: Theme Filter Support', () => {
  it('should return all 11 agents for deadwood theme', async () => {
    const { filterByTheme } = await import('./generate-report.js');
    const result = filterByTheme('deadwood');
    assert.ok(result.success);
    const chars = result.data!;
    assert.strictEqual(chars.length, 11);
    for (const char of chars) {
      assert.strictEqual(char.theme, 'deadwood');
    }
  });
  it('should return agents with character names from theme', async () => {
    const { filterByTheme } = await import('./generate-report.js');
    const result = filterByTheme('deadwood');
    assert.ok(result.success);
    const sm = result.data!.find((r) => r.agent === 'sm');
    assert.ok(sm);
    assert.ok(sm.character.length > 0);
  });
  it('should return error for non-existent theme', async () => {
    const { filterByTheme } = await import('./generate-report.js');
    const result = filterByTheme('nonexistent-theme');
    assert.strictEqual(result.success, false);
    assert.ok(result.error?.match(/theme.*not found/i));
  });
});

describe('AC2: Combined Filters', () => {
  it('should support combining role and OCEAN filters', async () => {
    const { generateReport } = await import('./generate-report.js');
    const result = generateReport({ role: 'reviewer', ocean: 'A<=2' });
    assert.ok(result.success);
    for (const char of result.data!.characters) {
      assert.strictEqual(char.agent, 'reviewer');
      assert.ok(char.ocean.A <= 2);
    }
  });
  it('should support combining theme and OCEAN filters', async () => {
    const { generateReport } = await import('./generate-report.js');
    const result = generateReport({ theme: 'deadwood', ocean: 'N>=4' });
    assert.ok(result.success);
    for (const char of result.data!.characters) {
      assert.strictEqual(char.theme, 'deadwood');
      assert.ok(char.ocean.N >= 4);
    }
  });
});

describe('AC3: Character Comparison Mode', () => {
  it('should compare 2 characters side-by-side', async () => {
    const { compareCharacters } = await import('./generate-report.js');
    const result = compareCharacters(['deadwood:sm', 'firefly:sm']);
    assert.ok(result.success);
    assert.strictEqual(result.data!.characters.length, 2);
    assert.strictEqual(result.data!.characters[0].theme, 'deadwood');
    assert.strictEqual(result.data!.characters[1].theme, 'firefly');
  });
  it('should compare 3 characters', async () => {
    const { compareCharacters } = await import('./generate-report.js');
    const result = compareCharacters(['deadwood:sm', 'firefly:sm', 'fargo:sm']);
    assert.ok(result.success);
    assert.strictEqual(result.data!.characters.length, 3);
  });
  it('should compare 4 characters', async () => {
    const { compareCharacters } = await import('./generate-report.js');
    const result = compareCharacters(['deadwood:sm', 'firefly:sm', 'fargo:sm', 'succession:sm']);
    assert.ok(result.success);
    assert.strictEqual(result.data!.characters.length, 4);
  });
  it('should include OCEAN scores for each compared character', async () => {
    const { compareCharacters } = await import('./generate-report.js');
    const result = compareCharacters(['deadwood:sm', 'firefly:sm']);
    assert.ok(result.success);
    for (const char of result.data!.characters) {
      assert.ok(typeof char.ocean.O === 'number');
      assert.ok(typeof char.ocean.C === 'number');
      assert.ok(typeof char.ocean.E === 'number');
      assert.ok(typeof char.ocean.A === 'number');
      assert.ok(typeof char.ocean.N === 'number');
    }
  });
  it('should include character name for each compared character', async () => {
    const { compareCharacters } = await import('./generate-report.js');
    const result = compareCharacters(['deadwood:sm', 'firefly:sm']);
    assert.ok(result.success);
    for (const char of result.data!.characters) {
      assert.ok(char.character.length > 0);
    }
  });
  it('should return error with fewer than 2 characters', async () => {
    const { compareCharacters } = await import('./generate-report.js');
    const result = compareCharacters(['deadwood:sm']);
    assert.strictEqual(result.success, false);
    assert.ok(result.error?.match(/at least 2/i));
  });
  it('should return error with more than 4 characters', async () => {
    const { compareCharacters } = await import('./generate-report.js');
    const result = compareCharacters(['deadwood:sm', 'firefly:sm', 'fargo:sm', 'succession:sm', 'breaking-bad:sm']);
    assert.strictEqual(result.success, false);
    assert.ok(result.error?.match(/at most 4/i));
  });
  it('should parse "theme:agent" format correctly', async () => {
    const { compareCharacters } = await import('./generate-report.js');
    const result = compareCharacters(['deadwood:reviewer', 'firefly:tea']);
    assert.ok(result.success);
    assert.strictEqual(result.data!.characters[0].theme, 'deadwood');
    assert.strictEqual(result.data!.characters[0].agent, 'reviewer');
    assert.strictEqual(result.data!.characters[1].theme, 'firefly');
    assert.strictEqual(result.data!.characters[1].agent, 'tea');
  });
  it('should return error for invalid theme:agent format', async () => {
    const { compareCharacters } = await import('./generate-report.js');
    const result = compareCharacters(['deadwood-sm', 'firefly:sm']);
    assert.strictEqual(result.success, false);
    assert.ok(result.error?.match(/invalid.*format/i));
  });
  it('should return error for non-existent theme in comparison', async () => {
    const { compareCharacters } = await import('./generate-report.js');
    const result = compareCharacters(['nonexistent:sm', 'firefly:sm']);
    assert.strictEqual(result.success, false);
    assert.ok(result.error?.match(/theme.*not found/i));
  });
  it('should return error for non-existent agent in comparison', async () => {
    const { compareCharacters } = await import('./generate-report.js');
    const result = compareCharacters(['deadwood:nonexistent', 'firefly:sm']);
    assert.strictEqual(result.success, false);
    assert.ok(result.error?.match(/agent.*not found/i));
  });
});

describe('AC4: Markdown Output Format', () => {
  it('should output valid markdown string', async () => {
    const { generateReport } = await import('./generate-report.js');
    const result = generateReport({ role: 'sm' });
    assert.ok(result.success);
    assert.ok(typeof result.data!.markdown === 'string');
    assert.ok(result.data!.markdown.length > 0);
  });
  it('should include markdown header', async () => {
    const { generateReport } = await import('./generate-report.js');
    const result = generateReport({ role: 'sm' });
    assert.ok(result.success);
    assert.ok(result.data!.markdown.includes('#'));
  });
  it('should embed SVG references in markdown', async () => {
    const { generateReport } = await import('./generate-report.js');
    const result = generateReport({ role: 'sm' });
    assert.ok(result.success);
    assert.ok(result.data!.markdown.includes('.svg') || result.data!.markdown.includes('<img'));
  });
  it('should include character names in output', async () => {
    const { generateReport } = await import('./generate-report.js');
    const result = generateReport({ theme: 'deadwood' });
    assert.ok(result.success);
    assert.ok(result.data!.markdown.includes('Bullock') || result.data!.markdown.includes('Seth'));
  });
  it('should include OCEAN scores table for filtered results', async () => {
    const { generateReport } = await import('./generate-report.js');
    const result = generateReport({ ocean: 'O>=4' });
    assert.ok(result.success);
    assert.ok(result.data!.markdown.includes('|') && result.data!.markdown.includes('O'));
  });
  it('should format comparison as side-by-side table', async () => {
    const { compareCharacters } = await import('./generate-report.js');
    const result = compareCharacters(['deadwood:sm', 'firefly:sm']);
    assert.ok(result.success);
    const md = result.data!.markdown;
    assert.ok(md.includes('|') && md.includes('deadwood') && md.includes('firefly'));
  });
  it('should include face SVG paths in comparison output', async () => {
    const { compareCharacters } = await import('./generate-report.js');
    const result = compareCharacters(['deadwood:sm', 'firefly:sm']);
    assert.ok(result.success);
    assert.ok(result.data!.markdown.includes('deadwood') && result.data!.markdown.includes('sm.svg'));
  });
});

describe('Integration: Full Report Pipeline', () => {
  it('should generate complete report with filter, characters, and markdown', async () => {
    const { generateReport } = await import('./generate-report.js');
    const result = generateReport({ role: 'reviewer' });
    assert.ok(result.success);
    assert.ok(result.data!.characters);
    assert.ok(result.data!.markdown);
    assert.ok(result.data!.filter);
    assert.strictEqual(result.data!.filter.role, 'reviewer');
  });
  it('should generate report with multiple combined filters', async () => {
    const { generateReport } = await import('./generate-report.js');
    const result = generateReport({ role: 'sm', ocean: 'C>=4' });
    assert.ok(result.success);
    for (const char of result.data!.characters) {
      assert.strictEqual(char.agent, 'sm');
      assert.ok(char.ocean.C >= 4);
    }
  });
  it('should return empty results for impossible filter combination', async () => {
    const { generateReport } = await import('./generate-report.js');
    const result = generateReport({ ocean: 'O=1' });
    assert.ok(result.success);
    for (const char of result.data!.characters) {
      assert.strictEqual(char.ocean.O, 1);
    }
  });
  it('should handle empty result set gracefully', async () => {
    const { generateReport } = await import('./generate-report.js');
    const result = generateReport({ role: 'sm', ocean: 'O=1', theme: 'deadwood' });
    assert.ok(result.success);
    assert.ok(Array.isArray(result.data!.characters));
    assert.ok(typeof result.data!.markdown === 'string');
  });
});
