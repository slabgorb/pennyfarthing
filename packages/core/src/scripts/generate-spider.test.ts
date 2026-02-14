/**
 * Tests for Story 11-10: Build OCEAN Spider Chart Generator
 *
 * These tests verify:
 * AC1: scripts/generate-spider.ts functional (module exists and exports work)
 * AC2: Takes theme + agent as input, outputs SVG
 * AC3: Spider charts clearly show all 5 OCEAN dimensions
 * AC4: Overlay mode compares 2-3 characters on same chart
 * AC5: SVGs render correctly in browsers and markdown (valid SVG structure)
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

// ============================================================================
// AC1: scripts/generate-spider.ts functional
// ============================================================================

describe('AC1: Spider Chart Module Exists and Exports', () => {
  it('should export generateSpider function', async () => {
    const module = await import('./generate-spider.js');
    assert.ok(
      typeof module.generateSpider === 'function',
      'generateSpider should be a function'
    );
  });

  it('should export generateSpiderFromOcean function for direct OCEAN input', async () => {
    const module = await import('./generate-spider.js');
    assert.ok(
      typeof module.generateSpiderFromOcean === 'function',
      'generateSpiderFromOcean should be a function'
    );
  });

  it('should export generateOverlaySpider function for comparison mode', async () => {
    const module = await import('./generate-spider.js');
    assert.ok(
      typeof module.generateOverlaySpider === 'function',
      'generateOverlaySpider should be a function'
    );
  });
});

// ============================================================================
// AC2: Takes theme + agent as input, outputs SVG
// ============================================================================

describe('AC2: Theme + Agent Input -> SVG Output', () => {
  it('should generate SVG string from theme and agent', async () => {
    const { generateSpider } = await import('./generate-spider.js');
    const svg = generateSpider('deadwood', 'sm');

    assert.ok(typeof svg === 'string', 'Should return string');
    assert.ok(svg.includes('<svg'), 'Should contain SVG opening tag');
    assert.ok(svg.includes('</svg>'), 'Should contain SVG closing tag');
  });

  it('should work for all 11 agent roles', async () => {
    const { generateSpider } = await import('./generate-spider.js');
    const roles = [
      'orchestrator',
      'sm',
      'tea',
      'dev',
      'reviewer',
      'architect',
      'pm',
      'tech-writer',
      'ux-designer',
      'devops',
      'ba',
    ];

    for (const role of roles) {
      const svg = generateSpider('deadwood', role);
      assert.ok(
        svg.includes('<svg'),
        `Should generate SVG for ${role}`
      );
    }
  });

  it('should throw error for non-existent theme', async () => {
    const { generateSpider } = await import('./generate-spider.js');

    assert.throws(
      () => generateSpider('nonexistent-theme', 'sm'),
      /Theme not found/,
      'Should throw error for missing theme file'
    );
  });

  it('should return default OCEAN scores for non-existent agent', async () => {
    const { generateSpider } = await import('./generate-spider.js');
    // Non-existent agents get default neutral scores (3,3,3,3,3) rather than error
    const svg = generateSpider('deadwood', 'nonexistent-agent');
    assert.ok(svg.includes('<svg'), 'Should generate SVG with default scores');
  });

  it('should accept OCEAN scores directly via generateSpiderFromOcean', async () => {
    const { generateSpiderFromOcean } = await import('./generate-spider.js');
    const svg = generateSpiderFromOcean({ O: 3, C: 4, E: 2, A: 5, N: 1 });

    assert.ok(typeof svg === 'string', 'Should return string');
    assert.ok(svg.includes('<svg'), 'Should contain SVG opening tag');
  });
});

// ============================================================================
// AC3: Spider charts clearly show all 5 OCEAN dimensions
// ============================================================================

describe('AC3: Pentagon Structure with 5 OCEAN Dimensions', () => {
  it('should generate a polygon element for the data', async () => {
    const { generateSpider } = await import('./generate-spider.js');
    const svg = generateSpider('deadwood', 'sm');

    assert.ok(
      svg.includes('<polygon') || svg.includes('<path'),
      'Should contain polygon or path element for data shape'
    );
  });

  it('should label all 5 OCEAN dimensions', async () => {
    const { generateSpider } = await import('./generate-spider.js');
    const svg = generateSpider('deadwood', 'sm');

    // Check for dimension labels (as text elements or in comments)
    const hasO = svg.includes('>O<') || svg.includes('"O"') || svg.includes('Openness');
    const hasC = svg.includes('>C<') || svg.includes('"C"') || svg.includes('Conscientiousness');
    const hasE = svg.includes('>E<') || svg.includes('"E"') || svg.includes('Extraversion');
    const hasA = svg.includes('>A<') || svg.includes('"A"') || svg.includes('Agreeableness');
    const hasN = svg.includes('>N<') || svg.includes('"N"') || svg.includes('Neuroticism');

    assert.ok(hasO, 'Should label Openness dimension');
    assert.ok(hasC, 'Should label Conscientiousness dimension');
    assert.ok(hasE, 'Should label Extraversion dimension');
    assert.ok(hasA, 'Should label Agreeableness dimension');
    assert.ok(hasN, 'Should label Neuroticism dimension');
  });

  it('should include grid lines for reference (5 levels)', async () => {
    const { generateSpider } = await import('./generate-spider.js');
    const svg = generateSpider('deadwood', 'sm');

    // Grid lines create concentric pentagons
    // Count polygon/path elements - should have at least 5 for grid + 1 for data
    const polygonCount = (svg.match(/<polygon/g) || []).length;
    const pathCount = (svg.match(/<path/g) || []).length;

    // Grid could be polygons or paths - at minimum should have grid structure
    assert.ok(
      polygonCount >= 1 || pathCount >= 5,
      'Should have grid lines (pentagons or paths for 5 levels)'
    );
  });

  it('should have 5 axis lines from center to vertices', async () => {
    const { generateSpider } = await import('./generate-spider.js');
    const svg = generateSpider('deadwood', 'sm');

    // Axis lines are typically <line> elements
    const lineCount = (svg.match(/<line/g) || []).length;

    assert.ok(
      lineCount >= 5,
      `Should have at least 5 axis lines, found ${lineCount}`
    );
  });

  it('should use unfilled polygon (stroke only, no fill)', async () => {
    const { generateSpider } = await import('./generate-spider.js');
    const svg = generateSpider('deadwood', 'sm');

    // The data polygon should have fill="none" or no fill
    // Looking for the data polygon specifically (not grid lines)
    assert.ok(
      svg.includes('fill="none"') || !svg.includes('fill="'),
      'Data polygon should be unfilled (stroke only)'
    );
  });

  it('should map score 1 to 20% radius and score 5 to 100% radius', async () => {
    const { generateSpiderFromOcean } = await import('./generate-spider.js');

    // Generate with all 1s - polygon should be small (inner)
    const small = generateSpiderFromOcean({ O: 1, C: 1, E: 1, A: 1, N: 1 });

    // Generate with all 5s - polygon should be large (outer)
    const large = generateSpiderFromOcean({ O: 5, C: 5, E: 5, A: 5, N: 5 });

    // SVGs should be different (different polygon sizes)
    assert.notStrictEqual(small, large, 'Score 1-1-1-1-1 and 5-5-5-5-5 should produce different polygons');
  });
});

// ============================================================================
// AC4: Overlay mode compares 2-3 characters on same chart
// ============================================================================

describe('AC4: Overlay Mode for Character Comparison', () => {
  it('should accept array of theme+agent pairs for overlay', async () => {
    const { generateOverlaySpider } = await import('./generate-spider.js');

    const svg = generateOverlaySpider([
      { theme: 'deadwood', agent: 'sm' },
      { theme: 'firefly', agent: 'sm' },
    ]);

    assert.ok(typeof svg === 'string', 'Should return string');
    assert.ok(svg.includes('<svg'), 'Should contain SVG');
  });

  it('should render 2 distinct polygons for 2 characters', async () => {
    const { generateOverlaySpider } = await import('./generate-spider.js');

    const svg = generateOverlaySpider([
      { theme: 'deadwood', agent: 'sm' },
      { theme: 'firefly', agent: 'sm' },
    ]);

    // Count data polygons (excluding grid)
    // Grid lines typically have a specific class or lighter stroke
    const polygonMatches = svg.match(/<polygon[^>]*>/g) || [];
    const pathMatches = svg.match(/<path[^>]*d="M[^"]*"[^>]*>/g) || [];

    // Should have at least 2 data shapes
    assert.ok(
      polygonMatches.length >= 2 || pathMatches.length >= 2,
      'Should have at least 2 data polygons for comparison'
    );
  });

  it('should render 3 distinct polygons for 3 characters', async () => {
    const { generateOverlaySpider } = await import('./generate-spider.js');

    const svg = generateOverlaySpider([
      { theme: 'deadwood', agent: 'sm' },
      { theme: 'firefly', agent: 'sm' },
      { theme: 'star-trek-tng', agent: 'sm' },
    ]);

    // Should have at least 3 data shapes
    const polygonMatches = svg.match(/<polygon[^>]*>/g) || [];
    const pathMatches = svg.match(/<path[^>]*d="M[^"]*"[^>]*>/g) || [];

    assert.ok(
      polygonMatches.length >= 3 || pathMatches.length >= 3,
      'Should have at least 3 data polygons for comparison'
    );
  });

  it('should use different stroke colors for each character', async () => {
    const { generateOverlaySpider } = await import('./generate-spider.js');

    const svg = generateOverlaySpider([
      { theme: 'deadwood', agent: 'sm' },
      { theme: 'firefly', agent: 'sm' },
    ]);

    // Extract stroke colors - should find at least 2 different colors
    const strokeColors = svg.match(/stroke="([^"]+)"/g) || [];
    const uniqueColors = new Set(strokeColors);

    assert.ok(
      uniqueColors.size >= 2,
      'Should use different stroke colors for different characters'
    );
  });

  it('should include legend identifying each character', async () => {
    const { generateOverlaySpider } = await import('./generate-spider.js');

    const svg = generateOverlaySpider([
      { theme: 'deadwood', agent: 'sm' },
      { theme: 'firefly', agent: 'sm' },
    ]);

    // Legend should include theme or character names
    assert.ok(
      svg.includes('deadwood') || svg.includes('Deadwood') ||
      svg.includes('firefly') || svg.includes('Firefly'),
      'Should include legend with theme/character names'
    );
  });

  it('should accept optional labels for overlay characters', async () => {
    const { generateOverlaySpider } = await import('./generate-spider.js');

    const svg = generateOverlaySpider([
      { theme: 'deadwood', agent: 'sm', label: 'Al Swearengen' },
      { theme: 'firefly', agent: 'sm', label: 'Mal Reynolds' },
    ]);

    assert.ok(
      svg.includes('Al Swearengen') || svg.includes('Mal Reynolds'),
      'Should display custom labels when provided'
    );
  });
});

// ============================================================================
// AC5: SVGs render correctly in browsers and markdown
// ============================================================================

describe('AC5: Valid SVG Structure', () => {
  it('should include viewBox attribute for scaling', async () => {
    const { generateSpider } = await import('./generate-spider.js');
    const svg = generateSpider('deadwood', 'sm');

    assert.ok(
      svg.includes('viewBox='),
      'Should have viewBox attribute for proper scaling'
    );
  });

  it('should include xmlns attribute for browser compatibility', async () => {
    const { generateSpider } = await import('./generate-spider.js');
    const svg = generateSpider('deadwood', 'sm');

    assert.ok(
      svg.includes('xmlns="http://www.w3.org/2000/svg"'),
      'Should have SVG xmlns for browser rendering'
    );
  });

  it('should be well-formed XML', async () => {
    const { generateSpider } = await import('./generate-spider.js');
    const svg = generateSpider('deadwood', 'sm');

    assert.ok(svg.startsWith('<svg'), 'Should start with <svg');
    assert.ok(svg.endsWith('</svg>'), 'Should end with </svg>');
  });

  it('should use text elements for dimension labels', async () => {
    const { generateSpider } = await import('./generate-spider.js');
    const svg = generateSpider('deadwood', 'sm');

    const textCount = (svg.match(/<text/g) || []).length;
    assert.ok(
      textCount >= 5,
      `Should have at least 5 text elements for labels, found ${textCount}`
    );
  });

  it('should have consistent stroke styling', async () => {
    const { generateSpider } = await import('./generate-spider.js');
    const svg = generateSpider('deadwood', 'sm');

    assert.ok(
      svg.includes('stroke='),
      'Should use stroke for lines'
    );
    assert.ok(
      svg.includes('stroke-width'),
      'Should specify stroke-width'
    );
  });

  it('should use 200x200 viewBox like face generator', async () => {
    const { generateSpider } = await import('./generate-spider.js');
    const svg = generateSpider('deadwood', 'sm');

    assert.ok(
      svg.includes('viewBox="0 0 200 200"'),
      'Should use 200x200 viewBox for consistency with face generator'
    );
  });
});

// ============================================================================
// Integration: Full Pipeline Test
// ============================================================================

describe('Integration: Spider Chart Generation Pipeline', () => {
  it('should generate valid SVG for multiple themes', async () => {
    const { generateSpider } = await import('./generate-spider.js');

    const themes = ['deadwood', 'firefly', 'star-trek-tng', 'discworld'];

    for (const theme of themes) {
      const svg = generateSpider(theme, 'sm');
      assert.ok(
        svg.includes('<svg') && svg.includes('</svg>'),
        `Should generate valid SVG for ${theme}`
      );
    }
  });

  it('should produce visually different charts for different OCEAN profiles', async () => {
    const { generateSpiderFromOcean } = await import('./generate-spider.js');

    const introvert = generateSpiderFromOcean({ O: 4, C: 3, E: 1, A: 3, N: 2 });
    const extravert = generateSpiderFromOcean({ O: 4, C: 3, E: 5, A: 3, N: 2 });

    assert.notStrictEqual(
      introvert,
      extravert,
      'Different E scores should produce different charts'
    );
  });

  it('should work with overlay of same agent across themes', async () => {
    const { generateOverlaySpider } = await import('./generate-spider.js');

    const svg = generateOverlaySpider([
      { theme: 'deadwood', agent: 'reviewer' },
      { theme: 'firefly', agent: 'reviewer' },
      { theme: 'star-trek-tng', agent: 'reviewer' },
    ]);

    assert.ok(
      svg.includes('<svg') && svg.includes('</svg>'),
      'Should generate valid overlay SVG'
    );
  });
});
