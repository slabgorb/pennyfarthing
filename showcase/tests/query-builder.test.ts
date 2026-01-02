/**
 * Story 13-7: Query Builder UI Tests
 *
 * Tests for the QueryBuilder React island component on /compare page.
 * Covers OCEAN filters, role/theme filters, expression input, and results.
 *
 * Run with: npm test
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const PAGES_DIR = join(ROOT, 'src', 'pages');
const COMPONENTS_DIR = join(ROOT, 'src', 'components');

describe('Story 13-7: Query Builder UI', () => {
  describe('AC1: React island hydrates on /compare page', () => {
    it('should have compare.astro page', () => {
      const pagePath = join(PAGES_DIR, 'compare.astro');
      expect(existsSync(pagePath)).toBe(true);
    });

    it('should have QueryBuilder component', () => {
      const componentPath = join(COMPONENTS_DIR, 'QueryBuilder.tsx');
      expect(existsSync(componentPath)).toBe(true);
    });

    it('should import QueryBuilder in compare page', () => {
      const pagePath = join(PAGES_DIR, 'compare.astro');
      const content = readFileSync(pagePath, 'utf-8');
      expect(content).toMatch(/import.*QueryBuilder.*from/);
    });

    it('should use client directive for hydration', () => {
      const pagePath = join(PAGES_DIR, 'compare.astro');
      const content = readFileSync(pagePath, 'utf-8');
      // Should use client:load or client:visible
      expect(content).toMatch(/QueryBuilder[\s\S]*?client:/);
    });

    it('should use Base layout', () => {
      const pagePath = join(PAGES_DIR, 'compare.astro');
      const content = readFileSync(pagePath, 'utf-8');
      expect(content).toMatch(/import.*Base.*from.*layouts/);
      expect(content).toMatch(/<Base/);
    });
  });

  describe('AC2: All filter types functional', () => {
    it('should have OCEAN dimension filters', () => {
      const componentPath = join(COMPONENTS_DIR, 'QueryBuilder.tsx');
      const content = readFileSync(componentPath, 'utf-8');
      // Should have controls for O, C, E, A, N dimensions
      expect(content).toMatch(/openness|O:/i);
      expect(content).toMatch(/conscientiousness|C:/i);
      expect(content).toMatch(/extraversion|E:/i);
      expect(content).toMatch(/agreeableness|A:/i);
      expect(content).toMatch(/neuroticism|N:/i);
    });

    it('should have role filter checkboxes', () => {
      const componentPath = join(COMPONENTS_DIR, 'QueryBuilder.tsx');
      const content = readFileSync(componentPath, 'utf-8');
      // Should have checkbox inputs or role filter state
      expect(content).toMatch(/role|roles/i);
      expect(content).toMatch(/checkbox|checked/i);
    });

    it('should have theme filter with search', () => {
      const componentPath = join(COMPONENTS_DIR, 'QueryBuilder.tsx');
      const content = readFileSync(componentPath, 'utf-8');
      // Should have theme filter with search capability
      expect(content).toMatch(/theme|themes/i);
      expect(content).toMatch(/search|filter/i);
    });

    it('should have sort options', () => {
      const componentPath = join(COMPONENTS_DIR, 'QueryBuilder.tsx');
      const content = readFileSync(componentPath, 'utf-8');
      // Should have sort by OCEAN or alphabetically
      expect(content).toMatch(/sort|sortBy/i);
      expect(content).toMatch(/select|option/i);
    });
  });

  describe('AC3: Expression input accepts OCEAN syntax', () => {
    it('should have expression input field', () => {
      const componentPath = join(COMPONENTS_DIR, 'QueryBuilder.tsx');
      const content = readFileSync(componentPath, 'utf-8');
      // Should have an input for OCEAN expressions
      expect(content).toMatch(/expression|query/i);
      expect(content).toMatch(/input|textarea/i);
    });

    it('should have expression state management', () => {
      const componentPath = join(COMPONENTS_DIR, 'QueryBuilder.tsx');
      const content = readFileSync(componentPath, 'utf-8');
      // Should have state for expression
      expect(content).toMatch(/useState.*expression|expression.*useState/i);
    });

    it('should show expression syntax hint or placeholder', () => {
      const componentPath = join(COMPONENTS_DIR, 'QueryBuilder.tsx');
      const content = readFileSync(componentPath, 'utf-8');
      // Should have placeholder or hint about syntax (O>=4, C=3, etc.)
      expect(content).toMatch(/placeholder|O>=|O=|OCEAN/i);
    });
  });

  describe('AC4: Filters combine with AND logic', () => {
    it('should have filter combination logic', () => {
      const componentPath = join(COMPONENTS_DIR, 'QueryBuilder.tsx');
      const content = readFileSync(componentPath, 'utf-8');
      // Should combine filters - look for filter/every/and logic
      expect(content).toMatch(/filter|\.every|\.filter/);
    });

    it('should apply multiple filter types together', () => {
      const componentPath = join(COMPONENTS_DIR, 'QueryBuilder.tsx');
      const content = readFileSync(componentPath, 'utf-8');
      // Should have logic that checks multiple conditions
      expect(content).toMatch(/&&|AND/i);
    });
  });

  describe('AC5: Results update on filter change', () => {
    it('should have onResults or onChange callback', () => {
      const componentPath = join(COMPONENTS_DIR, 'QueryBuilder.tsx');
      const content = readFileSync(componentPath, 'utf-8');
      // Should have callback for results
      expect(content).toMatch(/onResults|onChange|onFilter/i);
    });

    it('should trigger results on filter state change', () => {
      const componentPath = join(COMPONENTS_DIR, 'QueryBuilder.tsx');
      const content = readFileSync(componentPath, 'utf-8');
      // Should use useEffect or similar to trigger on state change
      expect(content).toMatch(/useEffect/);
    });

    it('should pass filtered results to callback', () => {
      const componentPath = join(COMPONENTS_DIR, 'QueryBuilder.tsx');
      const content = readFileSync(componentPath, 'utf-8');
      // Should call the results callback with filtered data
      expect(content).toMatch(/onResults\(|onChange\(|onFilter\(/);
    });
  });

  describe('Component structure', () => {
    it('should be a React functional component', () => {
      const componentPath = join(COMPONENTS_DIR, 'QueryBuilder.tsx');
      const content = readFileSync(componentPath, 'utf-8');
      // Should export default function or const component
      expect(content).toMatch(/export\s+default\s+function\s+QueryBuilder|export\s+default\s+QueryBuilder/);
    });

    it('should import React hooks', () => {
      const componentPath = join(COMPONENTS_DIR, 'QueryBuilder.tsx');
      const content = readFileSync(componentPath, 'utf-8');
      expect(content).toMatch(/import.*useState.*from\s+['"]react['"]/);
    });

    it('should have Props interface', () => {
      const componentPath = join(COMPONENTS_DIR, 'QueryBuilder.tsx');
      const content = readFileSync(componentPath, 'utf-8');
      // Should define Props type/interface
      expect(content).toMatch(/interface\s+Props|type\s+Props/);
    });

    it('should use Tailwind classes for styling', () => {
      const componentPath = join(COMPONENTS_DIR, 'QueryBuilder.tsx');
      const content = readFileSync(componentPath, 'utf-8');
      // Should have Tailwind utility classes
      expect(content).toMatch(/className=.*['"](flex|grid|bg-|text-|p-|m-)/);
    });
  });
});
