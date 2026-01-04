/**
 * Story 13-2: Base Layout and Navigation Tests
 *
 * These tests verify the site shell components:
 * - Base.astro layout with SEO meta tags
 * - Header with navigation links
 * - Footer with project links
 * - Mobile menu (React island)
 *
 * Run with: npm test
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'src');

describe('Story 13-2: Base Layout and Navigation', () => {
  describe('AC1: Base layout applied to all pages', () => {
    it('should have Base.astro layout file', () => {
      const layoutPath = join(SRC, 'layouts/Base.astro');
      expect(existsSync(layoutPath)).toBe(true);
    });

    it('should have Base layout with <slot /> for content', () => {
      const layoutPath = join(SRC, 'layouts/Base.astro');
      if (!existsSync(layoutPath)) {
        expect.fail('Base.astro does not exist');
      }
      const content = readFileSync(layoutPath, 'utf-8');
      expect(content).toContain('<slot');
    });

    it('should have index.astro using Base layout', () => {
      const indexPath = join(SRC, 'pages/index.astro');
      const content = readFileSync(indexPath, 'utf-8');
      // Should import and use Base layout
      expect(content).toMatch(/import.*Base.*from.*layouts\/Base/);
      expect(content).toContain('<Base');
    });

    it('should have Base layout importing global.css', () => {
      const layoutPath = join(SRC, 'layouts/Base.astro');
      if (!existsSync(layoutPath)) {
        expect.fail('Base.astro does not exist');
      }
      const content = readFileSync(layoutPath, 'utf-8');
      expect(content).toMatch(/import.*global\.css/);
    });
  });

  describe('AC2: Navigation works on desktop and mobile', () => {
    it('should have Header component', () => {
      const headerPath = join(SRC, 'components/Header.astro');
      expect(existsSync(headerPath)).toBe(true);
    });

    it('should have Footer component', () => {
      const footerPath = join(SRC, 'components/Footer.astro');
      expect(existsSync(footerPath)).toBe(true);
    });

    it('should have navigation with required links', () => {
      // Check Header or Nav component for navigation links
      const headerPath = join(SRC, 'components/Header.astro');
      if (!existsSync(headerPath)) {
        expect.fail('Header.astro does not exist');
      }
      const content = readFileSync(headerPath, 'utf-8');

      // Required navigation links per spec
      const requiredLinks = ['Themes', 'Compare', 'Benchmarks', 'Favorites'];
      for (const link of requiredLinks) {
        expect(content.toLowerCase()).toContain(link.toLowerCase());
      }
    });

    it('should have MobileMenu React component', () => {
      const mobilePath = join(SRC, 'components/MobileMenu.tsx');
      expect(existsSync(mobilePath)).toBe(true);
    });

    it('should have MobileMenu with toggle functionality', () => {
      const mobilePath = join(SRC, 'components/MobileMenu.tsx');
      if (!existsSync(mobilePath)) {
        expect.fail('MobileMenu.tsx does not exist');
      }
      const content = readFileSync(mobilePath, 'utf-8');
      // Should have state for open/close toggle
      expect(content).toMatch(/useState/);
      // Should have click handler or toggle
      expect(content).toMatch(/onClick|toggle|setIsOpen|setOpen/i);
    });

    it('should include Header and Footer in Base layout', () => {
      const layoutPath = join(SRC, 'layouts/Base.astro');
      if (!existsSync(layoutPath)) {
        expect.fail('Base.astro does not exist');
      }
      const content = readFileSync(layoutPath, 'utf-8');
      expect(content).toContain('<Header');
      expect(content).toContain('<Footer');
    });
  });

  describe('AC3: Consistent styling with Tailwind', () => {
    it('should have Header using Tailwind classes', () => {
      const headerPath = join(SRC, 'components/Header.astro');
      if (!existsSync(headerPath)) {
        expect.fail('Header.astro does not exist');
      }
      const content = readFileSync(headerPath, 'utf-8');
      // Should have Tailwind utility classes
      expect(content).toMatch(/class=["'][^"']*\b(flex|bg-|text-|p-|m-|w-|h-)/);
    });

    it('should have Footer using Tailwind classes', () => {
      const footerPath = join(SRC, 'components/Footer.astro');
      if (!existsSync(footerPath)) {
        expect.fail('Footer.astro does not exist');
      }
      const content = readFileSync(footerPath, 'utf-8');
      // Should have Tailwind utility classes
      expect(content).toMatch(/class=["'][^"']*\b(flex|bg-|text-|p-|m-|w-|h-)/);
    });

    it('should have responsive classes for mobile breakpoints', () => {
      const headerPath = join(SRC, 'components/Header.astro');
      if (!existsSync(headerPath)) {
        expect.fail('Header.astro does not exist');
      }
      const content = readFileSync(headerPath, 'utf-8');
      // Should have responsive prefixes (sm:, md:, lg:, hidden, block)
      expect(content).toMatch(/\b(sm:|md:|lg:|xl:|hidden|block)/);
    });
  });

  describe('AC4: SEO meta tags in place', () => {
    it('should have meta description tag', () => {
      const layoutPath = join(SRC, 'layouts/Base.astro');
      if (!existsSync(layoutPath)) {
        expect.fail('Base.astro does not exist');
      }
      const content = readFileSync(layoutPath, 'utf-8');
      expect(content).toMatch(/<meta\s+name=["']description["']/);
    });

    it('should have Open Graph title tag', () => {
      const layoutPath = join(SRC, 'layouts/Base.astro');
      if (!existsSync(layoutPath)) {
        expect.fail('Base.astro does not exist');
      }
      const content = readFileSync(layoutPath, 'utf-8');
      expect(content).toMatch(/<meta\s+property=["']og:title["']/);
    });

    it('should have Open Graph description tag', () => {
      const layoutPath = join(SRC, 'layouts/Base.astro');
      if (!existsSync(layoutPath)) {
        expect.fail('Base.astro does not exist');
      }
      const content = readFileSync(layoutPath, 'utf-8');
      expect(content).toMatch(/<meta\s+property=["']og:description["']/);
    });

    it('should have Open Graph type tag', () => {
      const layoutPath = join(SRC, 'layouts/Base.astro');
      if (!existsSync(layoutPath)) {
        expect.fail('Base.astro does not exist');
      }
      const content = readFileSync(layoutPath, 'utf-8');
      expect(content).toMatch(/<meta\s+property=["']og:type["']/);
    });

    it('should have canonical link', () => {
      const layoutPath = join(SRC, 'layouts/Base.astro');
      if (!existsSync(layoutPath)) {
        expect.fail('Base.astro does not exist');
      }
      const content = readFileSync(layoutPath, 'utf-8');
      expect(content).toMatch(/<link\s+rel=["']canonical["']/);
    });

    it('should have configurable title', () => {
      const layoutPath = join(SRC, 'layouts/Base.astro');
      if (!existsSync(layoutPath)) {
        expect.fail('Base.astro does not exist');
      }
      const content = readFileSync(layoutPath, 'utf-8');
      // Should accept title as prop or have dynamic title
      expect(content).toMatch(/title|<title>/i);
    });
  });
});
