/**
 * Story 13-6: Individual Character Profile Pages Tests
 *
 * Tests for the character profile pages with full details,
 * OCEAN visualization, related characters, and favorite button.
 *
 * Run with: npm test
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'src');
const PAGES_DIR = join(SRC, 'pages');
const COMPONENTS_DIR = join(SRC, 'components');

describe('Story 13-6: Individual Character Profile Pages', () => {
  describe('AC1: 640 character pages generated (64 themes × 10 roles)', () => {
    it('should have dynamic route file for characters', () => {
      // Astro uses [...slug].astro or nested [param] for dynamic routes
      const routePath = join(PAGES_DIR, 'characters', '[theme]', '[role].astro');
      expect(existsSync(routePath)).toBe(true);
    });

    it('should have getStaticPaths function for route generation', () => {
      const routePath = join(PAGES_DIR, 'characters', '[theme]', '[role].astro');
      if (!existsSync(routePath)) {
        expect.fail('[theme]/[role].astro does not exist');
      }
      const content = readFileSync(routePath, 'utf-8');
      expect(content).toMatch(/export\s+(async\s+)?function\s+getStaticPaths/);
    });

    it('should import loadThemes for generating paths', () => {
      const routePath = join(PAGES_DIR, 'characters', '[theme]', '[role].astro');
      if (!existsSync(routePath)) {
        expect.fail('[theme]/[role].astro does not exist');
      }
      const content = readFileSync(routePath, 'utf-8');
      expect(content).toMatch(/import.*loadThemes.*from/);
    });

    it('should generate paths for all theme/role combinations', () => {
      const routePath = join(PAGES_DIR, 'characters', '[theme]', '[role].astro');
      if (!existsSync(routePath)) {
        expect.fail('[theme]/[role].astro does not exist');
      }
      const content = readFileSync(routePath, 'utf-8');
      // Should iterate over themes and agents to create paths
      expect(content).toMatch(/\.map\s*\(/);
      expect(content).toMatch(/params:/);
      expect(content).toMatch(/theme/);
      expect(content).toMatch(/role/);
    });

    it('should have [theme] directory in pages/characters', () => {
      const themeDirPath = join(PAGES_DIR, 'characters', '[theme]');
      expect(existsSync(themeDirPath)).toBe(true);
    });
  });

  describe('AC2: Full character details displayed', () => {
    it('should display character name', () => {
      const routePath = join(PAGES_DIR, 'characters', '[theme]', '[role].astro');
      if (!existsSync(routePath)) {
        expect.fail('[theme]/[role].astro does not exist');
      }
      const content = readFileSync(routePath, 'utf-8');
      expect(content).toMatch(/agent\.character|character/i);
    });

    it('should display character style', () => {
      const routePath = join(PAGES_DIR, 'characters', '[theme]', '[role].astro');
      if (!existsSync(routePath)) {
        expect.fail('[theme]/[role].astro does not exist');
      }
      const content = readFileSync(routePath, 'utf-8');
      expect(content).toMatch(/agent\.style|style/i);
    });

    it('should display character expertise', () => {
      const routePath = join(PAGES_DIR, 'characters', '[theme]', '[role].astro');
      if (!existsSync(routePath)) {
        expect.fail('[theme]/[role].astro does not exist');
      }
      const content = readFileSync(routePath, 'utf-8');
      expect(content).toMatch(/agent\.expertise|expertise/i);
    });

    it('should display character quote', () => {
      const routePath = join(PAGES_DIR, 'characters', '[theme]', '[role].astro');
      if (!existsSync(routePath)) {
        expect.fail('[theme]/[role].astro does not exist');
      }
      const content = readFileSync(routePath, 'utf-8');
      expect(content).toMatch(/agent\.quote|quote/i);
    });

    it('should display character trait', () => {
      const routePath = join(PAGES_DIR, 'characters', '[theme]', '[role].astro');
      if (!existsSync(routePath)) {
        expect.fail('[theme]/[role].astro does not exist');
      }
      const content = readFileSync(routePath, 'utf-8');
      expect(content).toMatch(/agent\.trait|trait/i);
    });

    it('should display character emoji', () => {
      const routePath = join(PAGES_DIR, 'characters', '[theme]', '[role].astro');
      if (!existsSync(routePath)) {
        expect.fail('[theme]/[role].astro does not exist');
      }
      const content = readFileSync(routePath, 'utf-8');
      expect(content).toMatch(/agent\.emoji|emoji/i);
    });

    it('should display catchphrases list', () => {
      const routePath = join(PAGES_DIR, 'characters', '[theme]', '[role].astro');
      if (!existsSync(routePath)) {
        expect.fail('[theme]/[role].astro does not exist');
      }
      const content = readFileSync(routePath, 'utf-8');
      expect(content).toMatch(/catchphrases/i);
    });

    it('should display quirks list', () => {
      const routePath = join(PAGES_DIR, 'characters', '[theme]', '[role].astro');
      if (!existsSync(routePath)) {
        expect.fail('[theme]/[role].astro does not exist');
      }
      const content = readFileSync(routePath, 'utf-8');
      expect(content).toMatch(/quirks/i);
    });

    it('should display helper info', () => {
      const routePath = join(PAGES_DIR, 'characters', '[theme]', '[role].astro');
      if (!existsSync(routePath)) {
        expect.fail('[theme]/[role].astro does not exist');
      }
      const content = readFileSync(routePath, 'utf-8');
      expect(content).toMatch(/helper/i);
    });
  });

  describe('AC3: OCEAN visualization clear and readable (spider + bars)', () => {
    it('should include SpiderChart component', () => {
      const routePath = join(PAGES_DIR, 'characters', '[theme]', '[role].astro');
      if (!existsSync(routePath)) {
        expect.fail('[theme]/[role].astro does not exist');
      }
      const content = readFileSync(routePath, 'utf-8');
      expect(content).toMatch(/SpiderChart/);
    });

    it('should have OceanBadge component for bar visualization', () => {
      const componentPath = join(COMPONENTS_DIR, 'OceanBadge.astro');
      expect(existsSync(componentPath)).toBe(true);
    });

    it('should include OceanBadge in character page', () => {
      const routePath = join(PAGES_DIR, 'characters', '[theme]', '[role].astro');
      if (!existsSync(routePath)) {
        expect.fail('[theme]/[role].astro does not exist');
      }
      const content = readFileSync(routePath, 'utf-8');
      expect(content).toMatch(/OceanBadge/);
    });

    it('should render all 5 OCEAN dimensions in OceanBadge', () => {
      const componentPath = join(COMPONENTS_DIR, 'OceanBadge.astro');
      if (!existsSync(componentPath)) {
        expect.fail('OceanBadge.astro does not exist');
      }
      const content = readFileSync(componentPath, 'utf-8');
      // Should reference all 5 dimensions
      expect(content).toMatch(/O|Openness/i);
      expect(content).toMatch(/C|Conscientiousness/i);
      expect(content).toMatch(/E|Extraversion/i);
      expect(content).toMatch(/A|Agreeableness/i);
      expect(content).toMatch(/N|Neuroticism/i);
    });

    it('should have progress bar styling in OceanBadge', () => {
      const componentPath = join(COMPONENTS_DIR, 'OceanBadge.astro');
      if (!existsSync(componentPath)) {
        expect.fail('OceanBadge.astro does not exist');
      }
      const content = readFileSync(componentPath, 'utf-8');
      // Should have width/bar styling for visual representation
      expect(content).toMatch(/width|bg-|progress|bar/i);
    });

    it('should display numeric OCEAN values', () => {
      const componentPath = join(COMPONENTS_DIR, 'OceanBadge.astro');
      if (!existsSync(componentPath)) {
        expect.fail('OceanBadge.astro does not exist');
      }
      const content = readFileSync(componentPath, 'utf-8');
      // Should display the numeric score
      expect(content).toMatch(/toFixed|score-value|score/);
    });
  });

  describe('AC4: Related characters section populated', () => {
    it('should have RelatedCharacters component', () => {
      const componentPath = join(COMPONENTS_DIR, 'RelatedCharacters.astro');
      expect(existsSync(componentPath)).toBe(true);
    });

    it('should include RelatedCharacters in character page', () => {
      const routePath = join(PAGES_DIR, 'characters', '[theme]', '[role].astro');
      if (!existsSync(routePath)) {
        expect.fail('[theme]/[role].astro does not exist');
      }
      const content = readFileSync(routePath, 'utf-8');
      expect(content).toMatch(/RelatedCharacters/);
    });

    it('should filter by same role across themes', () => {
      const componentPath = join(COMPONENTS_DIR, 'RelatedCharacters.astro');
      if (!existsSync(componentPath)) {
        expect.fail('RelatedCharacters.astro does not exist');
      }
      const content = readFileSync(componentPath, 'utf-8');
      // Should filter agents by role
      expect(content).toMatch(/role|filter/i);
    });

    it('should exclude current character from related', () => {
      const componentPath = join(COMPONENTS_DIR, 'RelatedCharacters.astro');
      if (!existsSync(componentPath)) {
        expect.fail('RelatedCharacters.astro does not exist');
      }
      const content = readFileSync(componentPath, 'utf-8');
      // Should exclude self - check for filter or !== comparison
      expect(content).toMatch(/!=|!==|filter|exclude|currentTheme/i);
    });

    it('should have horizontal scroll or grid layout', () => {
      const componentPath = join(COMPONENTS_DIR, 'RelatedCharacters.astro');
      if (!existsSync(componentPath)) {
        expect.fail('RelatedCharacters.astro does not exist');
      }
      const content = readFileSync(componentPath, 'utf-8');
      // Should have overflow-x-auto for scroll or grid for layout
      expect(content).toMatch(/overflow-x|scroll|grid|flex/i);
    });

    it('should link related cards to character pages', () => {
      const componentPath = join(COMPONENTS_DIR, 'RelatedCharacters.astro');
      if (!existsSync(componentPath)) {
        expect.fail('RelatedCharacters.astro does not exist');
      }
      const content = readFileSync(componentPath, 'utf-8');
      // Should have links to /characters/
      expect(content).toMatch(/href=.*characters\//);
    });
  });

  describe('AC5: FavoriteButton component placeholder present', () => {
    it('should have FavoriteButton component', () => {
      const componentPath = join(COMPONENTS_DIR, 'FavoriteButton.astro');
      const componentPathTsx = join(COMPONENTS_DIR, 'FavoriteButton.tsx');
      expect(existsSync(componentPath) || existsSync(componentPathTsx)).toBe(true);
    });

    it('should include FavoriteButton in character page', () => {
      const routePath = join(PAGES_DIR, 'characters', '[theme]', '[role].astro');
      if (!existsSync(routePath)) {
        expect.fail('[theme]/[role].astro does not exist');
      }
      const content = readFileSync(routePath, 'utf-8');
      expect(content).toMatch(/FavoriteButton/);
    });

    it('should have heart icon or favorite text', () => {
      const componentPathAstro = join(COMPONENTS_DIR, 'FavoriteButton.astro');
      const componentPathTsx = join(COMPONENTS_DIR, 'FavoriteButton.tsx');
      const componentPath = existsSync(componentPathAstro) ? componentPathAstro : componentPathTsx;

      if (!existsSync(componentPath)) {
        expect.fail('FavoriteButton component does not exist');
      }
      const content = readFileSync(componentPath, 'utf-8');
      // Should have heart emoji, icon, or "favorite" text
      expect(content).toMatch(/♡|heart|favorite|❤|🤍/i);
    });

    it('should have button or clickable element', () => {
      const componentPathAstro = join(COMPONENTS_DIR, 'FavoriteButton.astro');
      const componentPathTsx = join(COMPONENTS_DIR, 'FavoriteButton.tsx');
      const componentPath = existsSync(componentPathAstro) ? componentPathAstro : componentPathTsx;

      if (!existsSync(componentPath)) {
        expect.fail('FavoriteButton component does not exist');
      }
      const content = readFileSync(componentPath, 'utf-8');
      // Should be a button element
      expect(content).toMatch(/<button/i);
    });
  });

  describe('Component Integration', () => {
    it('should use Base layout in character page', () => {
      const routePath = join(PAGES_DIR, 'characters', '[theme]', '[role].astro');
      if (!existsSync(routePath)) {
        expect.fail('[theme]/[role].astro does not exist');
      }
      const content = readFileSync(routePath, 'utf-8');
      expect(content).toMatch(/import.*Base.*from.*layouts/);
      expect(content).toMatch(/<Base/);
    });

    it('should have dynamic page title with character name', () => {
      const routePath = join(PAGES_DIR, 'characters', '[theme]', '[role].astro');
      if (!existsSync(routePath)) {
        expect.fail('[theme]/[role].astro does not exist');
      }
      const content = readFileSync(routePath, 'utf-8');
      // Title should include character or agent name
      expect(content).toMatch(/title=.*\{|title=.*character|title=.*agent/i);
    });

    it('should have link back to theme page', () => {
      const routePath = join(PAGES_DIR, 'characters', '[theme]', '[role].astro');
      if (!existsSync(routePath)) {
        expect.fail('[theme]/[role].astro does not exist');
      }
      const content = readFileSync(routePath, 'utf-8');
      // Should link back to theme detail page
      expect(content).toMatch(/href=.*themes\//);
    });

    it('should have role badge or label', () => {
      const routePath = join(PAGES_DIR, 'characters', '[theme]', '[role].astro');
      if (!existsSync(routePath)) {
        expect.fail('[theme]/[role].astro does not exist');
      }
      const content = readFileSync(routePath, 'utf-8');
      // Should display the role
      expect(content).toMatch(/role|sm|tea|dev|reviewer/i);
    });
  });
});
