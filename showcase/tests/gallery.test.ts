/**
 * Story 13-4: Theme Gallery Page Tests
 *
 * Tests for the theme gallery page with cards, spider charts,
 * filtering, and responsive grid layout.
 *
 * Run with: npm test
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const PAGES_DIR = join(ROOT, 'src', 'pages');
const COMPONENTS_DIR = join(ROOT, 'src', 'components');

describe('Story 13-4: Theme Gallery Page', () => {
  describe('AC1: All themes displayed as cards', () => {
    it('should have themes/index.astro page', () => {
      const pagePath = join(PAGES_DIR, 'themes', 'index.astro');
      expect(existsSync(pagePath)).toBe(true);
    });

    it('should have ThemeCard component', () => {
      const componentPath = join(COMPONENTS_DIR, 'ThemeCard.astro');
      expect(existsSync(componentPath)).toBe(true);
    });

    it('should import and use loadThemes in gallery page', () => {
      const pagePath = join(PAGES_DIR, 'themes', 'index.astro');
      const content = readFileSync(pagePath, 'utf-8');
      expect(content).toMatch(/import.*loadThemes.*from/);
    });

    it('should render ThemeCard for each theme', () => {
      const pagePath = join(PAGES_DIR, 'themes', 'index.astro');
      const content = readFileSync(pagePath, 'utf-8');
      // Should have a map/loop rendering ThemeCard components
      expect(content).toMatch(/ThemeCard/);
      expect(content).toMatch(/\.map\s*\(/);
    });

    it('should display theme name in card', () => {
      const cardPath = join(COMPONENTS_DIR, 'ThemeCard.astro');
      const content = readFileSync(cardPath, 'utf-8');
      expect(content).toMatch(/metadata\.name/);
    });

    it('should display theme source in card', () => {
      const cardPath = join(COMPONENTS_DIR, 'ThemeCard.astro');
      const content = readFileSync(cardPath, 'utf-8');
      expect(content).toMatch(/metadata\.source/);
    });

    it('should link to theme detail page', () => {
      const cardPath = join(COMPONENTS_DIR, 'ThemeCard.astro');
      const content = readFileSync(cardPath, 'utf-8');
      // Should have a link to /themes/{id}
      expect(content).toMatch(/href=.*themes\//);
    });
  });

  describe('AC2: Team overlay spider visible on each card', () => {
    it('should have SpiderChart component', () => {
      const componentPath = join(COMPONENTS_DIR, 'SpiderChart.astro');
      expect(existsSync(componentPath)).toBe(true);
    });

    it('should render SVG in SpiderChart', () => {
      const chartPath = join(COMPONENTS_DIR, 'SpiderChart.astro');
      const content = readFileSync(chartPath, 'utf-8');
      expect(content).toMatch(/<svg/i);
    });

    it('should include SpiderChart in ThemeCard', () => {
      const cardPath = join(COMPONENTS_DIR, 'ThemeCard.astro');
      const content = readFileSync(cardPath, 'utf-8');
      expect(content).toMatch(/SpiderChart/);
    });

    it('should pass agents to SpiderChart', () => {
      const cardPath = join(COMPONENTS_DIR, 'ThemeCard.astro');
      const content = readFileSync(cardPath, 'utf-8');
      expect(content).toMatch(/agents/);
    });

    it('should calculate OCEAN averages for spider', () => {
      const chartPath = join(COMPONENTS_DIR, 'SpiderChart.astro');
      const content = readFileSync(chartPath, 'utf-8');
      // Should reference OCEAN properties or calculate averages
      expect(content).toMatch(/ocean|O:|C:|E:|A:|N:/i);
    });
  });

  describe('AC3: Filter by source type works', () => {
    it('should have ThemeFilter component', () => {
      const filterPath = join(COMPONENTS_DIR, 'ThemeFilter.tsx');
      expect(existsSync(filterPath)).toBe(true);
    });

    it('should be a React component with client directive', () => {
      const pagePath = join(PAGES_DIR, 'themes', 'index.astro');
      const content = readFileSync(pagePath, 'utf-8');
      // Should use client:load or client:visible for hydration
      expect(content).toMatch(/ThemeFilter[\s\S]*?client:/);
    });

    it('should have source type filter state', () => {
      const filterPath = join(COMPONENTS_DIR, 'ThemeFilter.tsx');
      const content = readFileSync(filterPath, 'utf-8');
      expect(content).toMatch(/sourceType|source/i);
    });

    it('should have filter callback prop', () => {
      const filterPath = join(COMPONENTS_DIR, 'ThemeFilter.tsx');
      const content = readFileSync(filterPath, 'utf-8');
      // Should accept onFilter or onChange callback
      expect(content).toMatch(/onFilter|onChange|setFilter/i);
    });
  });

  describe('AC4: Search by name works', () => {
    it('should have search input in filter', () => {
      const filterPath = join(COMPONENTS_DIR, 'ThemeFilter.tsx');
      const content = readFileSync(filterPath, 'utf-8');
      expect(content).toMatch(/search|input.*type=.*text/i);
    });

    it('should have search state', () => {
      const filterPath = join(COMPONENTS_DIR, 'ThemeFilter.tsx');
      const content = readFileSync(filterPath, 'utf-8');
      expect(content).toMatch(/search/i);
    });
  });

  describe('AC5: Responsive grid layout', () => {
    it('should have ThemeGrid component or grid in page', () => {
      const gridPath = join(COMPONENTS_DIR, 'ThemeGrid.astro');
      const pagePath = join(PAGES_DIR, 'themes', 'index.astro');

      const hasGridComponent = existsSync(gridPath);
      const pageContent = readFileSync(pagePath, 'utf-8');
      const hasGridInPage = /grid/.test(pageContent);

      expect(hasGridComponent || hasGridInPage).toBe(true);
    });

    it('should use Tailwind responsive grid classes', () => {
      const gridPath = join(COMPONENTS_DIR, 'ThemeGrid.astro');
      const pagePath = join(PAGES_DIR, 'themes', 'index.astro');

      let content = '';
      if (existsSync(gridPath)) {
        content = readFileSync(gridPath, 'utf-8');
      } else {
        content = readFileSync(pagePath, 'utf-8');
      }

      // Should have responsive grid classes
      expect(content).toMatch(/grid-cols-1|sm:grid-cols|lg:grid-cols|xl:grid-cols/);
    });

    it('should have gap spacing in grid', () => {
      const gridPath = join(COMPONENTS_DIR, 'ThemeGrid.astro');
      const pagePath = join(PAGES_DIR, 'themes', 'index.astro');

      let content = '';
      if (existsSync(gridPath)) {
        content = readFileSync(gridPath, 'utf-8');
      } else {
        content = readFileSync(pagePath, 'utf-8');
      }

      expect(content).toMatch(/gap-/);
    });
  });

  describe('Component integration', () => {
    it('should use Base layout in gallery page', () => {
      const pagePath = join(PAGES_DIR, 'themes', 'index.astro');
      const content = readFileSync(pagePath, 'utf-8');
      expect(content).toMatch(/import.*Base.*from.*layouts/);
      expect(content).toMatch(/<Base/);
    });

    it('should have page title for SEO', () => {
      const pagePath = join(PAGES_DIR, 'themes', 'index.astro');
      const content = readFileSync(pagePath, 'utf-8');
      expect(content).toMatch(/title=/);
    });

    it('should show character preview in card', () => {
      const cardPath = join(COMPONENTS_DIR, 'ThemeCard.astro');
      const content = readFileSync(cardPath, 'utf-8');
      // Should show SM, Dev, or Reviewer character names
      expect(content).toMatch(/character|sm|dev|reviewer/i);
    });
  });
});
