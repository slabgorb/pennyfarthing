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
import { existsSync, readFileSync, mkdirSync, rmSync, writeFileSync } from 'fs';
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
  const commandPath = join(distDir, 'commands', 'theme-maker.md');

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

  it('should reference mode selection options', () => {
    const content = readFileSync(commandPath, 'utf-8');
    assert.ok(
      content.toLowerCase().includes('ai-driven') ||
        content.toLowerCase().includes('ai driven'),
      'Should mention AI-Driven mode'
    );
    assert.ok(
      content.toLowerCase().includes('guided'),
      'Should mention Guided mode'
    );
    assert.ok(
      content.toLowerCase().includes('manual'),
      'Should mention Manual mode'
    );
  });

  it('should mention AskUserQuestion for mode selection', () => {
    const content = readFileSync(commandPath, 'utf-8');
    assert.ok(
      content.includes('AskUserQuestion'),
      'Should reference AskUserQuestion tool for user interaction'
    );
  });

  it('should reference pennyfarthing_version field', () => {
    const content = readFileSync(commandPath, 'utf-8');
    assert.ok(
      content.includes('pennyfarthing_version'),
      'Should mention pennyfarthing_version field for skeleton YAML'
    );
  });

  it('should reference theme directory path', () => {
    const content = readFileSync(commandPath, 'utf-8');
    assert.ok(
      content.includes('.claude/pennyfarthing/themes') ||
        content.includes('themes/'),
      'Should mention theme directory for output'
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
  const commandPath = join(distDir, 'commands', 'theme-maker.md');

  it('should have AI-Driven mode implementation section', () => {
    const content = readFileSync(commandPath, 'utf-8');
    // Look for a dedicated section header for AI-Driven mode
    assert.ok(
      content.includes('## AI-Driven Mode') ||
        content.includes('### AI-Driven Mode'),
      'Should have dedicated AI-Driven Mode section'
    );
  });

  it('should prompt for universe/concept description', () => {
    const content = readFileSync(commandPath, 'utf-8');
    assert.ok(
      content.toLowerCase().includes('universe') ||
        content.toLowerCase().includes('concept'),
      'Should mention universe/concept input'
    );
    assert.ok(
      content.toLowerCase().includes('describe') ||
        content.toLowerCase().includes('free-text') ||
        content.toLowerCase().includes('free text'),
      'Should indicate free-text description input'
    );
  });

  it('should reference all 10 agent types for generation', () => {
    const content = readFileSync(commandPath, 'utf-8');
    const requiredAgents = [
      'orchestrator',
      'sm',
      'tea',
      'dev',
      'reviewer',
      'architect',
      'pm',
      'tech-writer',
      'ux-designer',
      'devops'
    ];

    for (const agent of requiredAgents) {
      assert.ok(
        content.toLowerCase().includes(agent),
        `Should reference ${agent} agent`
      );
    }
  });

  it('should show preview before confirming', () => {
    const content = readFileSync(commandPath, 'utf-8');
    assert.ok(
      content.toLowerCase().includes('preview'),
      'Should mention preview functionality'
    );
  });

  it('should offer regenerate option', () => {
    const content = readFileSync(commandPath, 'utf-8');
    assert.ok(
      content.toLowerCase().includes('regenerate'),
      'Should mention regenerate option'
    );
  });

  it('should reference confirm/regenerate user choice', () => {
    const content = readFileSync(commandPath, 'utf-8');
    assert.ok(
      content.toLowerCase().includes('confirm'),
      'Should mention confirm option'
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
    'devops'
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
      delete (theme as any).agents;
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
  const commandPath = join(distDir, 'commands', 'theme-maker.md');

  /**
   * Helper to extract just the Guided Mode section from the command file.
   * Returns empty string if section doesn't exist.
   */
  function getGuidedModeSection(): string {
    const content = readFileSync(commandPath, 'utf-8');
    // Split on ## Guided Mode header and take everything until next ## header
    const match = content.match(/##\s*Guided Mode[\s\S]*?(?=\n##\s|$)/i);
    return match ? match[0] : '';
  }

  it('should have Guided mode implementation section', () => {
    const content = readFileSync(commandPath, 'utf-8');
    // Look for a dedicated section header for Guided mode
    assert.ok(
      content.includes('## Guided Mode') ||
        content.includes('### Guided Mode'),
      'Should have dedicated Guided Mode section'
    );
  });

  it('should present 3-4 character options per agent in Guided section', () => {
    const guidedSection = getGuidedModeSection();
    assert.ok(
      guidedSection.length > 0,
      'Guided Mode section must exist'
    );
    // Must mention presenting multiple options (3-4) for character selection
    assert.ok(
      guidedSection.includes('3-4') ||
        guidedSection.includes('3 to 4') ||
        guidedSection.toLowerCase().includes('three to four') ||
        (guidedSection.toLowerCase().includes('suggest') && guidedSection.toLowerCase().includes('option')),
      'Guided Mode should mention presenting 3-4 character options'
    );
  });

  it('should offer "Other" option for custom character names in Guided section', () => {
    const guidedSection = getGuidedModeSection();
    assert.ok(
      guidedSection.length > 0,
      'Guided Mode section must exist'
    );
    // Must mention "Other" option for custom input within Guided section
    assert.ok(
      guidedSection.includes('"Other"') ||
        guidedSection.includes('Other option') ||
        guidedSection.toLowerCase().includes('custom character'),
      'Guided Mode should mention "Other" option for custom character names'
    );
  });

  it('should generate style/trait/quote for selections in Guided section', () => {
    const guidedSection = getGuidedModeSection();
    assert.ok(
      guidedSection.length > 0,
      'Guided Mode section must exist'
    );
    const lowerSection = guidedSection.toLowerCase();
    // Must mention generating/filling style, trait, or quote for selected characters
    assert.ok(
      lowerSection.includes('generate') ||
        lowerSection.includes('fills in') ||
        lowerSection.includes('fill in') ||
        (lowerSection.includes('style') && lowerSection.includes('trait')),
      'Guided Mode should mention generating style/trait/quote for selections'
    );
  });

  it('should allow going back to change previous selections in Guided section', () => {
    const guidedSection = getGuidedModeSection();
    assert.ok(
      guidedSection.length > 0,
      'Guided Mode section must exist'
    );
    const lowerSection = guidedSection.toLowerCase();
    // Must mention ability to go back or change previous selections
    assert.ok(
      lowerSection.includes('go back') ||
        lowerSection.includes('previous') ||
        lowerSection.includes('change selection') ||
        lowerSection.includes('edit selection') ||
        lowerSection.includes('redo'),
      'Guided Mode should mention ability to go back and change previous selections'
    );
  });

  it('should use AskUserQuestion for character selection in Guided section', () => {
    const guidedSection = getGuidedModeSection();
    assert.ok(
      guidedSection.length > 0,
      'Guided Mode section must exist'
    );
    // Guided mode should use AskUserQuestion for user interaction
    assert.ok(
      guidedSection.includes('AskUserQuestion'),
      'Guided Mode should use AskUserQuestion tool for character selection'
    );
  });

  it('should iterate through agents for character selection', () => {
    const guidedSection = getGuidedModeSection();
    assert.ok(
      guidedSection.length > 0,
      'Guided Mode section must exist'
    );
    // Must reference iterating through each agent
    assert.ok(
      guidedSection.toLowerCase().includes('each agent') ||
        guidedSection.toLowerCase().includes('for each') ||
        guidedSection.toLowerCase().includes('per agent'),
      'Guided Mode should iterate through each agent for character selection'
    );
  });

  it('should show preview step in Guided section', () => {
    const guidedSection = getGuidedModeSection();
    assert.ok(
      guidedSection.length > 0,
      'Guided Mode section must exist'
    );
    // Must have preview step
    assert.ok(
      guidedSection.toLowerCase().includes('preview'),
      'Guided Mode should show preview before confirming theme'
    );
  });

  it('should have confirm step in Guided section', () => {
    const guidedSection = getGuidedModeSection();
    assert.ok(
      guidedSection.length > 0,
      'Guided Mode section must exist'
    );
    // Must have confirm step
    assert.ok(
      guidedSection.toLowerCase().includes('confirm'),
      'Guided Mode should have confirm step'
    );
  });
});
