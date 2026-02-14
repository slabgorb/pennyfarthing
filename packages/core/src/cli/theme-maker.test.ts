/**
 * Tests for /theme-maker command
 *
 * Story 6-1: Command skeleton - basic structure and validation
 * Story 6-2: AI-Driven mode - universe input, agent generation, preview
 * Story 6-3: Guided mode - character options per agent, user picks
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { validateThemeName, getProjectCustomThemesDir, validateThemeSchema } from './utils/themes.js';
import { findMonorepoRoot } from './utils/files.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Find monorepo root by walking up from current directory
const projectRoot = findMonorepoRoot(__dirname);
const distDir = join(projectRoot, 'pennyfarthing-dist');

describe('/theme-maker Command File', () => {
  const commandPath = join(distDir, 'commands', 'pf-theme-maker.md');

  it('should have theme-maker.md command file', () => {
    assert.ok(
      existsSync(commandPath),
      `Missing command file: ${commandPath}`
    );
  });

  it('should have YAML frontmatter with description', () => {
    const content = readFileSync(commandPath, 'utf-8');
    assert.ok(
      content.startsWith('---'),
      'Command file should start with YAML frontmatter (---)'
    );
    assert.ok(
      content.includes('description:'),
      'Frontmatter should have description field'
    );
  });

  it('should be marked as deprecated', () => {
    const content = readFileSync(commandPath, 'utf-8');
    assert.ok(
      content.toLowerCase().includes('deprecated'),
      'Should be marked as deprecated'
    );
  });

  it('should redirect to /theme command', () => {
    const content = readFileSync(commandPath, 'utf-8');
    assert.ok(
      content.includes('redirect: theme') ||
        content.includes('/theme'),
      'Should redirect to /theme command'
    );
  });

  it('should reference the new /theme maker command', () => {
    const content = readFileSync(commandPath, 'utf-8');
    assert.ok(
      content.includes('/theme maker') ||
        content.includes('theme maker'),
      'Should mention new /theme maker command'
    );
  });

  it('should include command mapping table', () => {
    const content = readFileSync(commandPath, 'utf-8');
    assert.ok(
      content.includes('Old Command') ||
        content.includes('New Command') ||
        content.includes('|'),
      'Should include command mapping table'
    );
  });
});

describe('Theme Name Validation', () => {
  describe('rejects invalid names', () => {
    it('should reject empty name', () => {
      const result = validateThemeName('');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('required'));
    });

    it('should reject names with spaces', () => {
      const result = validateThemeName('my theme');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('space'));
    });

    it('should reject uppercase names', () => {
      const result = validateThemeName('MyTheme');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('lowercase'));
    });

    it('should reject names starting with number', () => {
      const result = validateThemeName('123theme');
      assert.strictEqual(result.valid, false);
      assert.ok(result.error?.includes('start with a letter'));
    });

    it('should reject names with special characters', () => {
      const result = validateThemeName('my_theme');
      assert.strictEqual(result.valid, false);
    });

    it('should reject names starting with hyphen', () => {
      const result = validateThemeName('-my-theme');
      assert.strictEqual(result.valid, false);
    });
  });

  describe('accepts valid names', () => {
    it('should accept simple lowercase name', () => {
      const result = validateThemeName('mytheme');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.error, undefined);
    });

    it('should accept hyphenated name', () => {
      const result = validateThemeName('my-custom-theme');
      assert.strictEqual(result.valid, true);
    });

    it('should accept name with numbers', () => {
      const result = validateThemeName('theme2025');
      assert.strictEqual(result.valid, true);
    });

    it('should accept single letter name', () => {
      const result = validateThemeName('x');
      assert.strictEqual(result.valid, true);
    });
  });
});

describe('Theme Directory Creation', () => {
  const testProjectRoot = join(__dirname, '..', '..', '.test-project');
  const expectedDir = join(testProjectRoot, '.claude', 'pennyfarthing', 'themes');

  it('should return correct custom themes directory path', () => {
    const themesDir = getProjectCustomThemesDir(testProjectRoot);
    assert.strictEqual(
      themesDir,
      expectedDir,
      `Expected ${expectedDir}, got ${themesDir}`
    );
  });
});

// ============================================================================
// Story 6-2: AI-Driven Mode Tests
// ============================================================================

describe('AI-Driven Mode - Command File (Story 6-2)', () => {
  const commandPath = join(distDir, 'commands', 'pf-theme-maker.md');

  // theme-maker.md is now a deprecated stub redirecting to /theme maker.
  // AI-Driven mode functionality has moved to the /theme command.
  // These tests verify the deprecated stub correctly redirects.

  it('should exist as deprecated stub', () => {
    assert.ok(
      existsSync(commandPath),
      `Missing command file: ${commandPath}`
    );
    const content = readFileSync(commandPath, 'utf-8');
    assert.ok(
      content.toLowerCase().includes('deprecated'),
      'Should be marked as deprecated'
    );
  });

  it('should redirect to /theme maker for AI-driven functionality', () => {
    const content = readFileSync(commandPath, 'utf-8');
    assert.ok(
      content.includes('/theme maker'),
      'Should redirect to /theme maker'
    );
  });

  it('should include mapping from old /theme-maker to new /theme maker', () => {
    const content = readFileSync(commandPath, 'utf-8');
    assert.ok(
      content.includes('/theme-maker') && content.includes('/theme maker'),
      'Should map old command to new command'
    );
  });

  it('should include mapping from old /create-theme to new /theme create', () => {
    const content = readFileSync(commandPath, 'utf-8');
    assert.ok(
      content.includes('/create-theme') && content.includes('/theme create'),
      'Should map old /create-theme to new /theme create'
    );
  });

  it('should include mapping from old /set-theme to new /theme set', () => {
    const content = readFileSync(commandPath, 'utf-8');
    assert.ok(
      content.includes('/set-theme') && content.includes('/theme set'),
      'Should map old /set-theme to new /theme set'
    );
  });

  it('should include mapping from old /show-theme to new /theme show', () => {
    const content = readFileSync(commandPath, 'utf-8');
    assert.ok(
      content.includes('/show-theme') && content.includes('/theme show'),
      'Should map old /show-theme to new /theme show'
    );
  });
});

describe('Theme Schema Validation (Story 6-2)', () => {
  // All 10 required agent types
  const REQUIRED_AGENTS = [
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
    'ba'
  ];

  // Theme type for testing - allows optional fields and deletions
  interface TestTheme {
    theme: {
      name?: string;
      description?: string;
      source?: string;
      default_emoji_use?: string;
    };
    agents: Record<string, {
      character?: string;
      style?: string;
      role?: string;
      quote?: string;
      emoji?: string;
      helper?: { name: string; style: string };
    }>;
  }

  // Minimal valid theme for testing
  const createValidTheme = (): TestTheme => ({
    theme: {
      name: 'Test Theme',
      description: 'A test theme'
    },
    agents: Object.fromEntries(
      REQUIRED_AGENTS.map(agent => [
        agent,
        {
          character: `Test ${agent}`,
          style: `Style for ${agent}`,
          role: `Role for ${agent}`,
          quote: `Quote for ${agent}`
        }
      ])
    )
  });

  describe('validates complete themes', () => {
    it('should accept a valid theme with all 10 agents', () => {
      const theme = createValidTheme();
      const result = validateThemeSchema(theme);
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.errors, undefined);
    });

    it('should accept theme with optional fields', () => {
      const theme = createValidTheme();
      theme.theme.source = 'Test source';
      theme.theme.default_emoji_use = 'minimal';
      theme.agents.sm.emoji = '☕';
      theme.agents.sm.helper = { name: 'Helper', style: 'Helpful' };
      const result = validateThemeSchema(theme);
      assert.strictEqual(result.valid, true);
    });
  });

  describe('rejects invalid themes', () => {
    it('should reject theme missing theme.name', () => {
      const theme = createValidTheme();
      delete theme.theme.name;
      const result = validateThemeSchema(theme);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors?.some(e => e.includes('name')));
    });

    it('should reject theme missing agents section', () => {
      const theme = createValidTheme();
      delete (theme as unknown as Record<string, unknown>).agents;
      const result = validateThemeSchema(theme);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors?.some(e => e.includes('agents')));
    });

    it('should reject theme missing required agent', () => {
      const theme = createValidTheme();
      delete theme.agents.tea;
      const result = validateThemeSchema(theme);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors?.some(e => e.includes('tea')));
    });

    it('should reject agent missing character field', () => {
      const theme = createValidTheme();
      delete theme.agents.dev.character;
      const result = validateThemeSchema(theme);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors?.some(e => e.includes('dev') && e.includes('character')));
    });

    it('should reject agent missing style field', () => {
      const theme = createValidTheme();
      delete theme.agents.reviewer.style;
      const result = validateThemeSchema(theme);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors?.some(e => e.includes('reviewer') && e.includes('style')));
    });

    it('should list all missing agents in errors', () => {
      const theme = createValidTheme();
      delete theme.agents.sm;
      delete theme.agents.tea;
      delete theme.agents.dev;
      const result = validateThemeSchema(theme);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors && result.errors.length >= 3, 'Should have at least 3 errors');
    });
  });

  describe('validates agent field requirements', () => {
    it('should require character and style for each agent', () => {
      // These are the minimum required fields per agent
      const theme = {
        theme: { name: 'Minimal', description: 'Minimal theme' },
        agents: Object.fromEntries(
          REQUIRED_AGENTS.map(agent => [
            agent,
            { character: 'Char', style: 'Style' }
          ])
        )
      };
      const result = validateThemeSchema(theme);
      assert.strictEqual(result.valid, true);
    });
  });
});

// ============================================================================
// Story 6-3: Guided Mode Tests
// ============================================================================

describe('Guided Mode - Command File (Story 6-3)', () => {
  const commandPath = join(distDir, 'commands', 'pf-theme-maker.md');

  // theme-maker.md is now a deprecated stub redirecting to /theme maker.
  // Guided mode functionality has moved to the /theme command.
  // These tests verify the deprecated stub contains correct redirects.

  it('should exist as deprecated stub file', () => {
    assert.ok(
      existsSync(commandPath),
      `Missing command file: ${commandPath}`
    );
  });

  it('should have deprecated: true in frontmatter', () => {
    const content = readFileSync(commandPath, 'utf-8');
    assert.ok(
      content.includes('deprecated: true'),
      'Frontmatter should mark file as deprecated: true'
    );
  });

  it('should have redirect field in frontmatter', () => {
    const content = readFileSync(commandPath, 'utf-8');
    assert.ok(
      content.includes('redirect: theme'),
      'Frontmatter should have redirect: theme'
    );
  });

  it('should have DEPRECATED in the title', () => {
    const content = readFileSync(commandPath, 'utf-8');
    assert.ok(
      content.includes('DEPRECATED'),
      'Title should include DEPRECATED marker'
    );
  });

  it('should mention consolidation into /theme', () => {
    const content = readFileSync(commandPath, 'utf-8');
    assert.ok(
      content.toLowerCase().includes('consolidated'),
      'Should mention consolidation into /theme'
    );
  });

  it('should include /list-themes to /theme list mapping', () => {
    const content = readFileSync(commandPath, 'utf-8');
    assert.ok(
      content.includes('/list-themes') && content.includes('/theme list'),
      'Should map old /list-themes to new /theme list'
    );
  });

  it('should include old and new command columns', () => {
    const content = readFileSync(commandPath, 'utf-8');
    assert.ok(
      content.includes('Old Command') && content.includes('New Command'),
      'Table should have Old Command and New Command columns'
    );
  });

  it('should include at least 4 command mappings', () => {
    const content = readFileSync(commandPath, 'utf-8');
    const mappingCount = [
      '/theme-maker',
      '/create-theme',
      '/set-theme',
      '/show-theme',
      '/list-themes'
    ].filter(cmd => content.includes(cmd)).length;
    assert.ok(
      mappingCount >= 4,
      `Should include at least 4 command mappings, found ${mappingCount}`
    );
  });

  it('should have YAML frontmatter', () => {
    const content = readFileSync(commandPath, 'utf-8');
    assert.ok(
      content.startsWith('---'),
      'Should start with YAML frontmatter'
    );
  });
});
