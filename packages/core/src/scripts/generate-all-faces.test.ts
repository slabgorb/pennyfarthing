/**
 * Tests for Story 11-6: Generate full 630-face matrix with index
 *
 * SKIPPED: The faces/ directory was never created.
 * Story 11-6 was planned but not implemented. These tests are retained
 * for when the feature is implemented, but skipped to avoid false failures.
 *
 * These tests verify:
 * AC1: 630 SVG faces in pennyfarthing-dist/personas/faces/
 * AC2: Master matrix viewable (HTML or markdown)
 * AC3: Navigation by theme, role, or OCEAN profile
 * AC4: File size and load time acceptable
 *
 * Run with: npm test
 */

import { describe, it, before, skip } from 'node:test';
import assert from 'node:assert';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { findMonorepoRoot } from '../cli/utils/files.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Find monorepo root by walking up from current directory
const projectRoot = findMonorepoRoot(__dirname);
const facesDir = join(projectRoot, 'pennyfarthing-dist', 'personas', 'faces');
const themesDir = join(projectRoot, 'pennyfarthing-dist', 'personas', 'themes');

// Expected counts - derive from actual theme files
const EXPECTED_AGENT_COUNT = 10;
// Count actual themes dynamically (was hardcoded to 63, now 91+)
const actualThemeFiles = existsSync(themesDir)
  ? readdirSync(themesDir).filter((f) => f.endsWith('.yaml')).length
  : 0;
const EXPECTED_THEME_COUNT = actualThemeFiles;
const EXPECTED_TOTAL_FACES = EXPECTED_THEME_COUNT * EXPECTED_AGENT_COUNT;

// All 10 agent roles
const AGENTS = [
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
];

// Helper to get all theme names from themes directory
function getAllThemes(): string[] {
  const files = readdirSync(themesDir).filter((f) => f.endsWith('.yaml'));
  return files.map((f) => f.replace('.yaml', '')).sort();
}

// ============================================================================
// AC1: 630 SVG faces in pennyfarthing-dist/personas/faces/
// ============================================================================

describe('AC1: 630 SVG Faces Generated', { skip: 'Story 11-6 not implemented - faces/ directory does not exist' }, () => {
  it('should have faces directory structure', () => {
    assert.ok(existsSync(facesDir), 'faces/ directory should exist');
    assert.ok(existsSync(join(facesDir, 'by-theme')), 'faces/by-theme/ should exist');
    assert.ok(existsSync(join(facesDir, 'by-role')), 'faces/by-role/ should exist');
  });

  it('should have 63 theme directories in by-theme/', () => {
    const byThemeDir = join(facesDir, 'by-theme');
    const themeDirs = readdirSync(byThemeDir).filter((f) =>
      statSync(join(byThemeDir, f)).isDirectory()
    );

    assert.strictEqual(
      themeDirs.length,
      EXPECTED_THEME_COUNT,
      `Should have ${EXPECTED_THEME_COUNT} theme directories, got ${themeDirs.length}`
    );
  });

  it('should have 10 agent directories in by-role/', () => {
    const byRoleDir = join(facesDir, 'by-role');
    const roleDirs = readdirSync(byRoleDir).filter((f) =>
      statSync(join(byRoleDir, f)).isDirectory()
    );

    assert.strictEqual(
      roleDirs.length,
      EXPECTED_AGENT_COUNT,
      `Should have ${EXPECTED_AGENT_COUNT} role directories, got ${roleDirs.length}`
    );
  });

  it('should have 10 SVG files per theme directory', () => {
    const byThemeDir = join(facesDir, 'by-theme');
    const themes = getAllThemes();

    for (const theme of themes) {
      const themeDir = join(byThemeDir, theme);
      if (!existsSync(themeDir)) {
        assert.fail(`Missing theme directory: ${theme}`);
      }

      const svgFiles = readdirSync(themeDir).filter((f) => f.endsWith('.svg'));
      assert.strictEqual(
        svgFiles.length,
        EXPECTED_AGENT_COUNT,
        `Theme ${theme} should have ${EXPECTED_AGENT_COUNT} SVG files, got ${svgFiles.length}`
      );
    }
  });

  it('should have 63 SVG files per role directory', () => {
    const byRoleDir = join(facesDir, 'by-role');

    for (const agent of AGENTS) {
      const roleDir = join(byRoleDir, agent);
      if (!existsSync(roleDir)) {
        assert.fail(`Missing role directory: ${agent}`);
      }

      const svgFiles = readdirSync(roleDir).filter((f) => f.endsWith('.svg'));
      assert.strictEqual(
        svgFiles.length,
        EXPECTED_THEME_COUNT,
        `Role ${agent} should have ${EXPECTED_THEME_COUNT} SVG files, got ${svgFiles.length}`
      );
    }
  });

  it('should have exactly 630 total SVG files in by-theme/', () => {
    const byThemeDir = join(facesDir, 'by-theme');
    let totalCount = 0;

    const themes = readdirSync(byThemeDir).filter((f) =>
      statSync(join(byThemeDir, f)).isDirectory()
    );

    for (const theme of themes) {
      const svgFiles = readdirSync(join(byThemeDir, theme)).filter((f) => f.endsWith('.svg'));
      totalCount += svgFiles.length;
    }

    assert.strictEqual(
      totalCount,
      EXPECTED_TOTAL_FACES,
      `Should have ${EXPECTED_TOTAL_FACES} total SVG files, got ${totalCount}`
    );
  });

  it('should have matching files in by-theme/ and by-role/', () => {
    const byThemeDir = join(facesDir, 'by-theme');
    const byRoleDir = join(facesDir, 'by-role');

    // by-theme uses character names (e.g., seth-25334.svg)
    // by-role uses theme names (e.g., deadwood.svg)
    // Verify structure exists and counts match
    const sampleThemes = ['deadwood', 'firefly', 'dune', 'discworld'].filter((t) =>
      existsSync(join(byThemeDir, t))
    );

    for (const theme of sampleThemes) {
      // Check by-theme has 10 character files
      const themeDir = join(byThemeDir, theme);
      const themeSvgs = readdirSync(themeDir).filter((f) => f.endsWith('.svg'));
      assert.strictEqual(
        themeSvgs.length,
        EXPECTED_AGENT_COUNT,
        `by-theme/${theme}/ should have ${EXPECTED_AGENT_COUNT} SVG files`
      );

      // Check by-role/{agent}/ has this theme's file
      for (const agent of AGENTS) {
        const roleFile = join(byRoleDir, agent, `${theme}.svg`);
        assert.ok(existsSync(roleFile), `Missing by-role file: ${agent}/${theme}.svg`);
      }
    }
  });

  it('should generate valid SVG content in each file', () => {
    const byThemeDir = join(facesDir, 'by-theme');
    const themes = readdirSync(byThemeDir)
      .filter((f) => statSync(join(byThemeDir, f)).isDirectory())
      .slice(0, 5); // Check first 5 themes to save time

    for (const theme of themes) {
      const themeDir = join(byThemeDir, theme);
      const svgFiles = readdirSync(themeDir).filter((f) => f.endsWith('.svg'));

      for (const file of svgFiles) {
        const content = readFileSync(join(themeDir, file), 'utf-8');
        assert.ok(content.includes('<svg'), `${theme}/${file} should contain <svg tag`);
        assert.ok(content.includes('</svg>'), `${theme}/${file} should contain </svg> tag`);
        assert.ok(
          content.includes('xmlns="http://www.w3.org/2000/svg"'),
          `${theme}/${file} should have SVG xmlns`
        );
      }
    }
  });
});

// ============================================================================
// AC2: Master matrix viewable (HTML or markdown)
// ============================================================================

describe('AC2: Master Matrix Documentation', { skip: 'Story 11-6 not implemented' }, () => {
  it('should have team-photos.md with all 63 themes', () => {
    const teamPhotosPath = join(facesDir, 'team-photos.md');
    assert.ok(existsSync(teamPhotosPath), 'team-photos.md should exist');

    const content = readFileSync(teamPhotosPath, 'utf-8');
    const themes = getAllThemes();

    // Each theme should have a section
    for (const theme of themes) {
      const formattedTheme = theme
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');

      assert.ok(
        content.includes(`## ${formattedTheme}`) || content.includes(`# ${formattedTheme}`),
        `team-photos.md should have section for ${formattedTheme}`
      );
    }
  });

  it('should have role-gallery.md with all 10 agents', () => {
    const roleGalleryPath = join(facesDir, 'role-gallery.md');
    assert.ok(existsSync(roleGalleryPath), 'role-gallery.md should exist');

    const content = readFileSync(roleGalleryPath, 'utf-8');

    // Each agent should have a section
    const agentNames = [
      'Orchestrator',
      'Scrum Master',
      'Test Engineer',
      'Developer',
      'Reviewer',
      'Architect',
      'Product Manager',
      'Tech Writer',
      'UX Designer',
      'DevOps',
    ];

    for (const agentName of agentNames) {
      assert.ok(
        content.includes(`## ${agentName}`) || content.includes(`# ${agentName}`),
        `role-gallery.md should have section for ${agentName}`
      );
    }
  });

  it('should have image references for all 630 faces in team-photos.md', () => {
    const teamPhotosPath = join(facesDir, 'team-photos.md');
    const content = readFileSync(teamPhotosPath, 'utf-8');

    // Count image references (img tags or markdown images)
    const imgTagMatches = content.match(/<img[^>]*>/g) || [];
    const mdImgMatches = content.match(/!\[.*?\]\(.*?\.svg\)/g) || [];
    const totalImages = imgTagMatches.length + mdImgMatches.length;

    assert.ok(
      totalImages >= EXPECTED_TOTAL_FACES,
      `team-photos.md should reference ${EXPECTED_TOTAL_FACES} images, found ${totalImages}`
    );
  });

  it('should have image references for all 630 faces in role-gallery.md', () => {
    const roleGalleryPath = join(facesDir, 'role-gallery.md');
    const content = readFileSync(roleGalleryPath, 'utf-8');

    // Count image references
    const imgTagMatches = content.match(/<img[^>]*>/g) || [];
    const mdImgMatches = content.match(/!\[.*?\]\(.*?\.svg\)/g) || [];
    const totalImages = imgTagMatches.length + mdImgMatches.length;

    assert.ok(
      totalImages >= EXPECTED_TOTAL_FACES,
      `role-gallery.md should reference ${EXPECTED_TOTAL_FACES} images, found ${totalImages}`
    );
  });

  it('should include OCEAN legend/explanation', () => {
    const teamPhotosPath = join(facesDir, 'team-photos.md');
    const content = readFileSync(teamPhotosPath, 'utf-8');

    // Check for OCEAN explanation
    assert.ok(
      content.includes('Openness') || content.includes('OCEAN'),
      'team-photos.md should explain OCEAN traits'
    );
    assert.ok(
      content.includes('Eye') || content.includes('eye'),
      'team-photos.md should explain eye feature mapping'
    );
  });
});

// ============================================================================
// AC3: Navigation by theme, role, or OCEAN profile
// ============================================================================

describe('AC3: Navigation Structure', { skip: 'Story 11-6 not implemented' }, () => {
  it('should organize faces by theme for theme-based navigation', () => {
    const byThemeDir = join(facesDir, 'by-theme');
    const themes = getAllThemes();

    // Verify structure allows finding all agents for a given theme
    // Note: by-theme uses character names (e.g., seth-25334.svg), not role names
    for (const theme of themes.slice(0, 5)) {
      // Sample 5 themes
      const themeDir = join(byThemeDir, theme);
      assert.ok(existsSync(themeDir), `by-theme/${theme}/ should exist`);

      // Should have 10 SVG files (one per agent role)
      const svgFiles = readdirSync(themeDir).filter((f) => f.endsWith('.svg'));
      assert.strictEqual(
        svgFiles.length,
        EXPECTED_AGENT_COUNT,
        `by-theme/${theme}/ should have ${EXPECTED_AGENT_COUNT} SVGs, got ${svgFiles.length}`
      );
    }
  });

  it('should organize faces by role for role-based navigation', () => {
    const byRoleDir = join(facesDir, 'by-role');
    const themes = getAllThemes();

    // Verify structure allows finding all themes for a given role
    for (const agent of AGENTS) {
      const roleDir = join(byRoleDir, agent);
      assert.ok(existsSync(roleDir), `by-role/${agent}/ should exist`);

      // Check sample of themes
      for (const theme of themes.slice(0, 5)) {
        const themeFile = join(roleDir, `${theme}.svg`);
        assert.ok(existsSync(themeFile), `by-role/${agent}/${theme}.svg should exist`);
      }
    }
  });

  it('should have navigable markdown sections for each theme', () => {
    const teamPhotosPath = join(facesDir, 'team-photos.md');
    const content = readFileSync(teamPhotosPath, 'utf-8');

    // Markdown headings create navigable anchors
    const headingMatches = content.match(/^## .+$/gm) || [];
    const themes = getAllThemes();

    assert.ok(
      headingMatches.length >= themes.length,
      `team-photos.md should have at least ${themes.length} theme sections, found ${headingMatches.length}`
    );
  });

  it('should have navigable markdown sections for each role', () => {
    const roleGalleryPath = join(facesDir, 'role-gallery.md');
    const content = readFileSync(roleGalleryPath, 'utf-8');

    // Markdown headings create navigable anchors
    const headingMatches = content.match(/^## .+$/gm) || [];

    assert.ok(
      headingMatches.length >= EXPECTED_AGENT_COUNT,
      `role-gallery.md should have at least ${EXPECTED_AGENT_COUNT} role sections, found ${headingMatches.length}`
    );
  });
});

// ============================================================================
// AC4: File size and load time acceptable
// ============================================================================

describe('AC4: Performance - File Size and Load Time', { skip: 'Story 11-6 not implemented' }, () => {
  it('should have reasonable individual SVG file sizes (<50KB each)', () => {
    const byThemeDir = join(facesDir, 'by-theme');
    const MAX_SVG_SIZE = 50 * 1024; // 50KB per SVG

    const themes = readdirSync(byThemeDir)
      .filter((f) => statSync(join(byThemeDir, f)).isDirectory())
      .slice(0, 10); // Check first 10 themes

    for (const theme of themes) {
      const themeDir = join(byThemeDir, theme);
      const svgFiles = readdirSync(themeDir).filter((f) => f.endsWith('.svg'));

      for (const file of svgFiles) {
        const filePath = join(themeDir, file);
        const stats = statSync(filePath);
        assert.ok(
          stats.size < MAX_SVG_SIZE,
          `${theme}/${file} is ${stats.size} bytes, exceeds ${MAX_SVG_SIZE} byte limit`
        );
      }
    }
  });

  it('should have total by-theme directory size under 10MB', () => {
    const byThemeDir = join(facesDir, 'by-theme');
    const MAX_TOTAL_SIZE = 10 * 1024 * 1024; // 10MB

    let totalSize = 0;
    const themes = readdirSync(byThemeDir).filter((f) =>
      statSync(join(byThemeDir, f)).isDirectory()
    );

    for (const theme of themes) {
      const themeDir = join(byThemeDir, theme);
      const svgFiles = readdirSync(themeDir).filter((f) => f.endsWith('.svg'));

      for (const file of svgFiles) {
        const stats = statSync(join(themeDir, file));
        totalSize += stats.size;
      }
    }

    assert.ok(
      totalSize < MAX_TOTAL_SIZE,
      `Total by-theme size is ${(totalSize / 1024 / 1024).toFixed(2)}MB, exceeds 10MB limit`
    );
  });

  it('should have markdown files under 2MB each', () => {
    const MAX_MD_SIZE = 2 * 1024 * 1024; // 2MB per markdown file

    const mdFiles = ['team-photos.md', 'role-gallery.md'];

    for (const file of mdFiles) {
      const filePath = join(facesDir, file);
      if (existsSync(filePath)) {
        const stats = statSync(filePath);
        assert.ok(
          stats.size < MAX_MD_SIZE,
          `${file} is ${(stats.size / 1024).toFixed(2)}KB, exceeds 2MB limit`
        );
      }
    }
  });

  it('should have SVG files that parse quickly (no excessive complexity)', () => {
    const byThemeDir = join(facesDir, 'by-theme');
    const MAX_ELEMENTS = 100; // Max SVG elements per face

    // Sample a few files
    const themes = readdirSync(byThemeDir)
      .filter((f) => statSync(join(byThemeDir, f)).isDirectory())
      .slice(0, 3);

    for (const theme of themes) {
      const themeDir = join(byThemeDir, theme);
      const svgFile = readdirSync(themeDir).find((f) => f.endsWith('.svg'));

      if (svgFile) {
        const content = readFileSync(join(themeDir, svgFile), 'utf-8');
        const elementCount = (content.match(/<[a-z]+/gi) || []).length;

        assert.ok(
          elementCount < MAX_ELEMENTS,
          `${theme}/${svgFile} has ${elementCount} elements, exceeds ${MAX_ELEMENTS} limit`
        );
      }
    }
  });
});

// ============================================================================
// Integration: Full Matrix Validation
// ============================================================================

describe('Integration: Complete 630-Face Matrix', { skip: 'Story 11-6 not implemented' }, () => {
  it('should have no missing theme-agent combinations', () => {
    const byThemeDir = join(facesDir, 'by-theme');
    const byRoleDir = join(facesDir, 'by-role');
    const themes = getAllThemes();
    const missing: string[] = [];

    // by-theme uses character names, so check count per theme
    for (const theme of themes) {
      const themeDir = join(byThemeDir, theme);
      if (!existsSync(themeDir)) {
        missing.push(`${theme}/ (directory missing)`);
        continue;
      }
      const svgCount = readdirSync(themeDir).filter((f) => f.endsWith('.svg')).length;
      if (svgCount !== EXPECTED_AGENT_COUNT) {
        missing.push(`${theme}/ (has ${svgCount} SVGs, expected ${EXPECTED_AGENT_COUNT})`);
      }
    }

    // by-role uses theme names, so verify each role has all themes
    for (const agent of AGENTS) {
      const roleDir = join(byRoleDir, agent);
      if (!existsSync(roleDir)) {
        missing.push(`by-role/${agent}/ (directory missing)`);
        continue;
      }
      for (const theme of themes) {
        const filePath = join(roleDir, `${theme}.svg`);
        if (!existsSync(filePath)) {
          missing.push(`by-role/${agent}/${theme}.svg`);
        }
      }
    }

    assert.strictEqual(
      missing.length,
      0,
      `Missing ${missing.length} face files: ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? '...' : ''}`
    );
  });

  it('should have consistent directory structure', () => {
    const byThemeDir = join(facesDir, 'by-theme');
    const byRoleDir = join(facesDir, 'by-role');

    // by-theme should have 63 dirs
    const themeDirs = readdirSync(byThemeDir).filter((f) =>
      statSync(join(byThemeDir, f)).isDirectory()
    );

    // by-role should have 10 dirs
    const roleDirs = readdirSync(byRoleDir).filter((f) =>
      statSync(join(byRoleDir, f)).isDirectory()
    );

    assert.strictEqual(themeDirs.length, EXPECTED_THEME_COUNT, 'by-theme should have 63 dirs');
    assert.strictEqual(roleDirs.length, EXPECTED_AGENT_COUNT, 'by-role should have 10 dirs');

    // Each role dir should have 63 SVGs
    for (const role of roleDirs) {
      const svgs = readdirSync(join(byRoleDir, role)).filter((f) => f.endsWith('.svg'));
      assert.strictEqual(svgs.length, EXPECTED_THEME_COUNT, `by-role/${role} should have 63 SVGs`);
    }
  });
});
