/**
 * Story 13-10: Benchmark Page Build Verification Tests (RED Phase)
 *
 * Tests that verify the /benchmarks page is pre-rendered at build time
 * with all required sections and data.
 *
 * Run with: npm test (after npm run build)
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const DOCS_ROOT = join(__dirname, '..', '..', 'docs', 'showcase');
const BENCHMARKS_PAGE = join(DOCS_ROOT, 'benchmarks', 'index.html');

describe('Story 13-10: Benchmark Page Build Output', () => {
  describe('AC1: /benchmarks page with pre-rendered reports', () => {
    it('should have benchmarks page source file', () => {
      const srcPath = join(__dirname, '..', 'src', 'pages', 'benchmarks', 'index.astro');
      expect(existsSync(srcPath)).toBe(true);
    });

    it('should generate benchmarks/index.html in docs/showcase/', () => {
      // This will fail until page is created and built
      expect(existsSync(BENCHMARKS_PAGE)).toBe(true);
    });

    it('should have navigation link to benchmarks page', () => {
      const indexPage = join(DOCS_ROOT, 'index.html');
      if (existsSync(indexPage)) {
        const html = readFileSync(indexPage, 'utf-8');
        expect(html).toContain('/benchmarks');
      }
    });
  });

  describe('AC2: Performance data displayed in tables/charts', () => {
    it('should contain scenario performance section', () => {
      if (!existsSync(BENCHMARKS_PAGE)) {
        expect(existsSync(BENCHMARKS_PAGE)).toBe(true);
        return;
      }
      const html = readFileSync(BENCHMARKS_PAGE, 'utf-8');
      // Should have scenario names in the output
      expect(html).toMatch(/scenario|Scenario/i);
    });

    it('should display performance scores', () => {
      if (!existsSync(BENCHMARKS_PAGE)) {
        expect(existsSync(BENCHMARKS_PAGE)).toBe(true);
        return;
      }
      const html = readFileSync(BENCHMARKS_PAGE, 'utf-8');
      // Should have numeric scores or mean values
      expect(html).toMatch(/mean|score|performance/i);
    });

    it('should have role-based leaderboard section', () => {
      if (!existsSync(BENCHMARKS_PAGE)) {
        expect(existsSync(BENCHMARKS_PAGE)).toBe(true);
        return;
      }
      const html = readFileSync(BENCHMARKS_PAGE, 'utf-8');
      // Should have role references (dev, tea, reviewer, sm, architect)
      expect(html).toMatch(/leaderboard|ranking|by role/i);
    });

    it('should display baseline comparison deltas', () => {
      if (!existsSync(BENCHMARKS_PAGE)) {
        expect(existsSync(BENCHMARKS_PAGE)).toBe(true);
        return;
      }
      const html = readFileSync(BENCHMARKS_PAGE, 'utf-8');
      // Should show comparison to control baseline
      expect(html).toMatch(/delta|baseline|control|vs\s+control/i);
    });
  });

  describe('AC3: OCEAN correlation insights shown', () => {
    it('should have OCEAN correlation section', () => {
      if (!existsSync(BENCHMARKS_PAGE)) {
        expect(existsSync(BENCHMARKS_PAGE)).toBe(true);
        return;
      }
      const html = readFileSync(BENCHMARKS_PAGE, 'utf-8');
      // Should reference OCEAN personality model
      expect(html).toMatch(/OCEAN|personality|correlation/i);
    });

    it('should mention OCEAN dimensions', () => {
      if (!existsSync(BENCHMARKS_PAGE)) {
        expect(existsSync(BENCHMARKS_PAGE)).toBe(true);
        return;
      }
      const html = readFileSync(BENCHMARKS_PAGE, 'utf-8');
      // At least mention what OCEAN stands for or show dimension names
      expect(html).toMatch(
        /Openness|Conscientiousness|Extraversion|Agreeableness|Neuroticism|O\s*C\s*E\s*A\s*N/i
      );
    });
  });

  describe('AC4: Links to methodology documentation', () => {
    it('should include link to methodology or documentation', () => {
      if (!existsSync(BENCHMARKS_PAGE)) {
        expect(existsSync(BENCHMARKS_PAGE)).toBe(true);
        return;
      }
      const html = readFileSync(BENCHMARKS_PAGE, 'utf-8');
      // Should have a link to methodology explanation
      expect(html).toMatch(/methodology|how.*work|learn more|documentation/i);
    });

    it('should explain scoring system', () => {
      if (!existsSync(BENCHMARKS_PAGE)) {
        expect(existsSync(BENCHMARKS_PAGE)).toBe(true);
        return;
      }
      const html = readFileSync(BENCHMARKS_PAGE, 'utf-8');
      // Should explain what scores mean
      expect(html).toMatch(/score.*out of|0-100|percentage|interpret/i);
    });
  });
});
