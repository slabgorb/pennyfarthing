/**
 * Story 13-5: Theme Detail Page Tests
 *
 * Tests for the theme detail page with team spider chart,
 * agent grid with ProfileCards, and profile links.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { findMonorepoRoot } from '../cli/utils/files.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Find monorepo root by walking up from current directory
const projectRoot = findMonorepoRoot(__dirname);
const PAGES_DIR = join(projectRoot, 'internal', 'showcase', 'src', 'pages');
const COMPONENTS_DIR = join(projectRoot, 'internal', 'showcase', 'src', 'components');

describe('Story 13-5: Theme Detail Page', () => {
  describe('AC1: Theme detail pages generated for all themes', () => {
    it('should have dynamic [theme].astro route', () => {
      const pagePath = join(PAGES_DIR, 'themes', '[theme].astro');
      assert.ok(existsSync(pagePath), 'Dynamic theme page should exist');
    });

    it('should use getStaticPaths for dynamic routing', () => {
      const pagePath = join(PAGES_DIR, 'themes', '[theme].astro');
      assert.ok(existsSync(pagePath), 'Page file should exist');
      const content = readFileSync(pagePath, 'utf-8');
      assert.match(content, /getStaticPaths/, 'Should use getStaticPaths');
    });

    it('should import loadThemes for generating paths', () => {
      const pagePath = join(PAGES_DIR, 'themes', '[theme].astro');
      assert.ok(existsSync(pagePath), 'Page file should exist');
      const content = readFileSync(pagePath, 'utf-8');
      assert.match(content, /import.*loadThemes.*from/, 'Should import loadThemes');
    });

    it('should generate paths for all themes', () => {
      const pagePath = join(PAGES_DIR, 'themes', '[theme].astro');
      assert.ok(existsSync(pagePath), 'Page file should exist');
      const content = readFileSync(pagePath, 'utf-8');
      // Should map themes to params
      assert.match(content, /themes\.map|\.map.*params/, 'Should map themes to params');
    });

    it('should display theme name in header', () => {
      const pagePath = join(PAGES_DIR, 'themes', '[theme].astro');
      assert.ok(existsSync(pagePath), 'Page file should exist');
      const content = readFileSync(pagePath, 'utf-8');
      assert.match(content, /metadata\.name|theme\.metadata\.name/, 'Should display theme name');
    });

    it('should display theme description', () => {
      const pagePath = join(PAGES_DIR, 'themes', '[theme].astro');
      assert.ok(existsSync(pagePath), 'Page file should exist');
      const content = readFileSync(pagePath, 'utf-8');
      assert.match(content, /metadata\.description|theme\.metadata\.description/, 'Should display description');
    });

    it('should display theme source', () => {
      const pagePath = join(PAGES_DIR, 'themes', '[theme].astro');
      assert.ok(existsSync(pagePath), 'Page file should exist');
      const content = readFileSync(pagePath, 'utf-8');
      assert.match(content, /metadata\.source|theme\.metadata\.source/, 'Should display source');
    });
  });

  describe('AC2: Team overlay spider displayed prominently (300px+)', () => {
    it('should include SpiderChart in detail page', () => {
      const pagePath = join(PAGES_DIR, 'themes', '[theme].astro');
      assert.ok(existsSync(pagePath), 'Page file should exist');
      const content = readFileSync(pagePath, 'utf-8');
      assert.match(content, /SpiderChart/, 'Should include SpiderChart');
    });

    it('should import SpiderChart component', () => {
      const pagePath = join(PAGES_DIR, 'themes', '[theme].astro');
      assert.ok(existsSync(pagePath), 'Page file should exist');
      const content = readFileSync(pagePath, 'utf-8');
      assert.match(content, /import.*SpiderChart.*from/, 'Should import SpiderChart');
    });

    it('should pass size prop of at least 300 to team spider', () => {
      const pagePath = join(PAGES_DIR, 'themes', '[theme].astro');
      assert.ok(existsSync(pagePath), 'Page file should exist');
      const content = readFileSync(pagePath, 'utf-8');
      // Should have size={300} or larger
      const sizeMatch = content.match(/SpiderChart[\s\S]*?size=\{?(\d+)/);
      assert.ok(sizeMatch, 'Should have size prop on SpiderChart');
      if (sizeMatch) {
        assert.ok(parseInt(sizeMatch[1]) >= 300, 'Size should be at least 300');
      }
    });

    it('should pass all theme agents to team spider', () => {
      const pagePath = join(PAGES_DIR, 'themes', '[theme].astro');
      assert.ok(existsSync(pagePath), 'Page file should exist');
      const content = readFileSync(pagePath, 'utf-8');
      // Should pass theme.agents or agents array
      assert.match(content, /SpiderChart[\s\S]*?agents=\{.*agents/, 'Should pass agents to SpiderChart');
    });
  });

  describe('AC3: All 10 agents shown with face + spider + quote', () => {
    it('should have ProfileCard component', () => {
      const componentPath = join(COMPONENTS_DIR, 'ProfileCard.astro');
      assert.ok(existsSync(componentPath), 'ProfileCard component should exist');
    });

    it('should display character name in ProfileCard', () => {
      const cardPath = join(COMPONENTS_DIR, 'ProfileCard.astro');
      assert.ok(existsSync(cardPath), 'ProfileCard file should exist');
      const content = readFileSync(cardPath, 'utf-8');
      assert.match(content, /agent\.character|character/, 'Should display character name');
    });

    it('should display quote in ProfileCard', () => {
      const cardPath = join(COMPONENTS_DIR, 'ProfileCard.astro');
      assert.ok(existsSync(cardPath), 'ProfileCard file should exist');
      const content = readFileSync(cardPath, 'utf-8');
      assert.match(content, /agent\.quote|quote/, 'Should display quote');
    });

    it('should include SpiderChart in ProfileCard', () => {
      const cardPath = join(COMPONENTS_DIR, 'ProfileCard.astro');
      assert.ok(existsSync(cardPath), 'ProfileCard file should exist');
      const content = readFileSync(cardPath, 'utf-8');
      assert.match(content, /SpiderChart/, 'Should include SpiderChart');
    });

    it('should show agent emoji or face placeholder', () => {
      const cardPath = join(COMPONENTS_DIR, 'ProfileCard.astro');
      assert.ok(existsSync(cardPath), 'ProfileCard file should exist');
      const content = readFileSync(cardPath, 'utf-8');
      // Should have emoji, avatar, or face reference
      assert.match(content, /emoji|avatar|face|icon/i, 'Should show face or icon');
    });

    it('should have AgentGrid component for 2x5 layout', () => {
      const gridPath = join(COMPONENTS_DIR, 'AgentGrid.astro');
      assert.ok(existsSync(gridPath), 'AgentGrid component should exist');
    });

    it('should use responsive grid in AgentGrid', () => {
      const gridPath = join(COMPONENTS_DIR, 'AgentGrid.astro');
      assert.ok(existsSync(gridPath), 'AgentGrid file should exist');
      const content = readFileSync(gridPath, 'utf-8');
      // Should have grid-cols classes for responsive 2x5 layout
      assert.match(content, /grid-cols/, 'Should use grid-cols for layout');
    });

    it('should render ProfileCard for each agent in detail page', () => {
      const pagePath = join(PAGES_DIR, 'themes', '[theme].astro');
      assert.ok(existsSync(pagePath), 'Page file should exist');
      const content = readFileSync(pagePath, 'utf-8');
      // Should map agents to ProfileCard components
      assert.match(content, /ProfileCard/, 'Should use ProfileCard');
      assert.match(content, /\.map\s*\(/, 'Should map agents to components');
    });

    it('should include AgentGrid in detail page', () => {
      const pagePath = join(PAGES_DIR, 'themes', '[theme].astro');
      assert.ok(existsSync(pagePath), 'Page file should exist');
      const content = readFileSync(pagePath, 'utf-8');
      assert.match(content, /AgentGrid/, 'Should include AgentGrid');
    });
  });

  describe('AC4: Links to individual profile pages work', () => {
    it('should have link in ProfileCard', () => {
      const cardPath = join(COMPONENTS_DIR, 'ProfileCard.astro');
      assert.ok(existsSync(cardPath), 'ProfileCard file should exist');
      const content = readFileSync(cardPath, 'utf-8');
      assert.match(content, /<a\s|href=/, 'Should have anchor link');
    });

    it('should link to /characters/[theme]/[role] pattern', () => {
      const cardPath = join(COMPONENTS_DIR, 'ProfileCard.astro');
      assert.ok(existsSync(cardPath), 'ProfileCard file should exist');
      const content = readFileSync(cardPath, 'utf-8');
      // Should have href pointing to /characters/{theme}/{role}
      assert.match(content, /href=.*characters.*\//, 'Should link to characters path');
    });

    it('should pass themeId to ProfileCard', () => {
      const pagePath = join(PAGES_DIR, 'themes', '[theme].astro');
      assert.ok(existsSync(pagePath), 'Page file should exist');
      const content = readFileSync(pagePath, 'utf-8');
      // ProfileCard needs themeId for building profile links
      assert.match(content, /ProfileCard[\s\S]*?themeId=|theme\.id/, 'Should pass themeId to ProfileCard');
    });
  });

  describe('Component integration', () => {
    it('should use Base layout in detail page', () => {
      const pagePath = join(PAGES_DIR, 'themes', '[theme].astro');
      assert.ok(existsSync(pagePath), 'Page file should exist');
      const content = readFileSync(pagePath, 'utf-8');
      assert.match(content, /import.*Base.*from.*layouts/, 'Should import Base layout');
      assert.match(content, /<Base/, 'Should use Base component');
    });

    it('should have dynamic page title with theme name', () => {
      const pagePath = join(PAGES_DIR, 'themes', '[theme].astro');
      assert.ok(existsSync(pagePath), 'Page file should exist');
      const content = readFileSync(pagePath, 'utf-8');
      // Title should include theme name
      assert.match(content, /title=.*metadata\.name|title=.*theme/, 'Should have dynamic title');
    });

    it('should have Compare this team button', () => {
      const pagePath = join(PAGES_DIR, 'themes', '[theme].astro');
      assert.ok(existsSync(pagePath), 'Page file should exist');
      const content = readFileSync(pagePath, 'utf-8');
      // Should have compare button/link
      assert.match(content, /[Cc]ompare|compare/i, 'Should have compare button');
    });
  });
});
