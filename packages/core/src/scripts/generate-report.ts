/**
 * OCEAN Face Report Generator
 *
 * Story 11-7: Build slice/report generator
 *
 * Generates filtered face reports and character comparisons with markdown output.
 * Supports filtering by role, theme, and OCEAN dimensions.
 */

import { readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';
import { findMonorepoRoot, getAllThemeDirs, resolveThemeFile } from '../cli/utils/files.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Find monorepo root by walking up from current directory
const projectRoot = findMonorepoRoot(__dirname);
const _facesDir = join(projectRoot, 'pennyfarthing-dist', 'personas', 'faces');

// ============================================================================
// Types
// ============================================================================

export interface OceanScores {
  O: number;
  C: number;
  E: number;
  A: number;
  N: number;
}

export interface CharacterInfo {
  theme: string;
  agent: string;
  character: string;
  ocean: OceanScores;
}

export interface OceanFilter {
  dimension: keyof OceanScores;
  operator: '>=' | '<=' | '=' | '>' | '<';
  value: number;
}

export interface ReportOptions {
  role?: string;
  theme?: string;
  ocean?: string;
}

export interface ReportResult {
  characters: CharacterInfo[];
  markdown: string;
  filter: ReportOptions;
}

export interface ComparisonResult {
  characters: CharacterInfo[];
  markdown: string;
}

export interface Result<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============================================================================
// Constants
// ============================================================================

const VALID_AGENTS = [
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

const AGENT_NAMES: Record<string, string> = {
  orchestrator: 'Orchestrator',
  sm: 'Scrum Master',
  tea: 'Test Engineer',
  dev: 'Developer',
  reviewer: 'Reviewer',
  architect: 'Architect',
  pm: 'Product Manager',
  'tech-writer': 'Tech Writer',
  'ux-designer': 'UX Designer',
  devops: 'DevOps',
  ba: 'Business Analyst',
};

const VALID_DIMENSIONS: (keyof OceanScores)[] = ['O', 'C', 'E', 'A', 'N'];
const VALID_OPERATORS = ['>=', '<=', '=', '>', '<'];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get all available themes from the themes directory
 */
function getAllThemes(): string[] {
  const themeSet = new Set<string>();
  for (const dir of getAllThemeDirs(projectRoot)) {
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.yaml'))) {
      themeSet.add(f.replace('.yaml', ''));
    }
  }
  return [...themeSet].sort();
}

/**
 * Load full theme data from YAML
 */
function loadThemeData(theme: string): Record<string, unknown> {
  const themePath = resolveThemeFile(projectRoot, theme);

  if (!themePath) {
    throw new Error(`Theme not found: ${theme}`);
  }

  const content = readFileSync(themePath, 'utf-8');
  return parseYaml(content) as Record<string, unknown>;
}

/**
 * Load a single character's info from a theme
 */
function loadCharacter(theme: string, agent: string): CharacterInfo {
  const data = loadThemeData(theme);
  const agents = data.agents as Record<string, Record<string, unknown>> | undefined;

  if (!agents) {
    throw new Error(`Theme ${theme} has no agents section`);
  }

  const agentData = agents[agent];
  if (!agentData) {
    throw new Error(`Agent not found: ${agent} in theme ${theme}`);
  }

  const ocean = agentData.ocean as OceanScores | undefined;
  if (!ocean) {
    throw new Error(`Agent ${agent} in theme ${theme} has no OCEAN scores`);
  }

  return {
    theme,
    agent,
    character: (agentData.character as string) || AGENT_NAMES[agent],
    ocean: {
      O: ocean.O,
      C: ocean.C,
      E: ocean.E,
      A: ocean.A,
      N: ocean.N,
    },
  };
}

/**
 * Load all characters from all themes
 */
function loadAllCharacters(): CharacterInfo[] {
  const characters: CharacterInfo[] = [];
  const themes = getAllThemes();

  for (const theme of themes) {
    for (const agent of VALID_AGENTS) {
      try {
        const char = loadCharacter(theme, agent);
        characters.push(char);
      } catch {
        // Skip characters without OCEAN scores
      }
    }
  }

  return characters;
}

/**
 * Apply OCEAN filter to a character
 */
function matchesOceanFilter(char: CharacterInfo, filter: OceanFilter): boolean {
  const score = char.ocean[filter.dimension];

  switch (filter.operator) {
    case '>=':
      return score >= filter.value;
    case '<=':
      return score <= filter.value;
    case '=':
      return score === filter.value;
    case '>':
      return score > filter.value;
    case '<':
      return score < filter.value;
    default:
      return false;
  }
}

/**
 * Format theme name for display
 */
function formatTheme(theme: string): string {
  return theme
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Get SVG path for a character's face
 */
function getFacePath(theme: string, agent: string): string {
  return `by-theme/${theme}/${agent}.svg`;
}

// ============================================================================
// Exported Functions
// ============================================================================

/**
 * Internal parse - throws on error (used by other internal functions)
 */
function parseOceanFilterInternal(expr: string): OceanFilter {
  // Match pattern: dimension (O|C|E|A|N), operator (>=|<=|=|>|<), value (number)
  const match = expr.match(/^([OCEAN])(>=|<=|=|>|<)(\d+)$/);

  if (!match) {
    // Try to determine what's wrong
    const dimMatch = expr.match(/^([A-Z])/);
    if (dimMatch && !VALID_DIMENSIONS.includes(dimMatch[1] as keyof OceanScores)) {
      throw new Error(`Invalid OCEAN dimension: ${dimMatch[1]}. Valid dimensions are O, C, E, A, N`);
    }

    // Check if we have a non-numeric value: valid dimension + valid operator + non-numeric value
    const valueMatch = expr.match(/^[OCEAN](>=|<=|=|>|<)(.+)$/);
    if (valueMatch && VALID_OPERATORS.includes(valueMatch[1])) {
      // We have a valid operator but non-numeric value
      if (isNaN(parseInt(valueMatch[2], 10))) {
        throw new Error(`Invalid value in filter: ${valueMatch[2]}. Must be a number`);
      }
    }

    // Check for invalid operator: after a valid dimension letter, capture non-digits until we hit a digit
    const opMatch = expr.match(/^[OCEAN]([^0-9]+)/);
    if (opMatch && !VALID_OPERATORS.includes(opMatch[1])) {
      throw new Error(`Invalid operator: ${opMatch[1]}. Valid operators are >=, <=, =, >, <`);
    }

    throw new Error(`Invalid OCEAN filter format: ${expr}. Expected format like "O>=4"`);
  }

  const dimension = match[1] as keyof OceanScores;
  const operator = match[2] as OceanFilter['operator'];
  const value = parseInt(match[3], 10);

  if (isNaN(value)) {
    throw new Error(`Invalid value in filter: ${match[3]}. Must be a number`);
  }

  return { dimension, operator, value };
}

/**
 * Parse an OCEAN filter expression like "O>=4" or "A<=2"
 */
export function parseOceanFilter(expr: string): Result<OceanFilter> {
  try {
    return { success: true, data: parseOceanFilterInternal(expr) };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

/**
 * Filter characters by OCEAN dimension expression
 */
export function filterByOcean(expression: string): Result<CharacterInfo[]> {
  try {
    const filter = parseOceanFilterInternal(expression);
    const allChars = loadAllCharacters();
    return { success: true, data: allChars.filter((char) => matchesOceanFilter(char, filter)) };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

/**
 * Filter characters by agent role
 */
export function filterByRole(role: string): Result<CharacterInfo[]> {
  if (!VALID_AGENTS.includes(role)) {
    return { success: false, error: `Invalid role: ${role}. Valid roles are: ${VALID_AGENTS.join(', ')}` };
  }

  const allChars = loadAllCharacters();
  return { success: true, data: allChars.filter((char) => char.agent === role) };
}

/**
 * Filter characters by theme (returns all 10 agents for that theme)
 */
export function filterByTheme(theme: string): Result<CharacterInfo[]> {
  const themes = getAllThemes();
  if (!themes.includes(theme)) {
    return { success: false, error: `Theme not found: ${theme}` };
  }

  const characters: CharacterInfo[] = [];
  for (const agent of VALID_AGENTS) {
    try {
      characters.push(loadCharacter(theme, agent));
    } catch {
      // Skip agents without OCEAN scores
    }
  }

  return { success: true, data: characters };
}

/**
 * Compare 2-4 characters side-by-side
 */
export function compareCharacters(specs: string[]): Result<ComparisonResult> {
  try {
    if (specs.length < 2) {
      return { success: false, error: 'Comparison requires at least 2 characters' };
    }

    if (specs.length > 4) {
      return { success: false, error: 'Comparison allows at most 4 characters' };
    }

    const characters: CharacterInfo[] = [];

    for (const spec of specs) {
      if (!spec.includes(':')) {
        return { success: false, error: `Invalid format: "${spec}". Expected "theme:agent" format` };
      }

      const [theme, agent] = spec.split(':');

      const themes = getAllThemes();
      if (!themes.includes(theme)) {
        return { success: false, error: `Theme not found: ${theme}` };
      }

      if (!VALID_AGENTS.includes(agent)) {
        return { success: false, error: `Agent not found: ${agent}. Valid agents are: ${VALID_AGENTS.join(', ')}` };
      }

      characters.push(loadCharacter(theme, agent));
    }

    const markdown = generateComparisonMarkdown(characters);
    return { success: true, data: { characters, markdown } };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

/**
 * Generate markdown for character comparison
 */
function generateComparisonMarkdown(characters: CharacterInfo[]): string {
  let md = '# Character Comparison\n\n';

  // Header row
  md += '| Attribute |';
  for (const char of characters) {
    md += ` ${formatTheme(char.theme)} |`;
  }
  md += '\n';

  // Separator
  md += '|:----------|';
  for (let i = 0; i < characters.length; i++) {
    md += ':----------|';
  }
  md += '\n';

  // Face images
  md += '| **Face** |';
  for (const char of characters) {
    const facePath = getFacePath(char.theme, char.agent);
    md += ` <img src="${facePath}" width="80" alt="${char.character}"> |`;
  }
  md += '\n';

  // Character name
  md += '| **Character** |';
  for (const char of characters) {
    md += ` ${char.character} |`;
  }
  md += '\n';

  // Agent role
  md += '| **Role** |';
  for (const char of characters) {
    md += ` ${AGENT_NAMES[char.agent]} |`;
  }
  md += '\n';

  // OCEAN scores
  for (const dim of VALID_DIMENSIONS) {
    md += `| **${dim}** |`;
    for (const char of characters) {
      md += ` ${char.ocean[dim]} |`;
    }
    md += '\n';
  }

  return md;
}

/**
 * Generate a filtered report with markdown output
 */
export function generateReport(options: ReportOptions): Result<ReportResult> {
  try {
    let characters = loadAllCharacters();

    // Apply filters
    if (options.theme) {
      const themes = getAllThemes();
      if (!themes.includes(options.theme)) {
        return { success: false, error: `Theme not found: ${options.theme}` };
      }
      characters = characters.filter((c) => c.theme === options.theme);
    }

    if (options.role) {
      if (!VALID_AGENTS.includes(options.role)) {
        return { success: false, error: `Invalid role: ${options.role}` };
      }
      characters = characters.filter((c) => c.agent === options.role);
    }

    if (options.ocean) {
      const filter = parseOceanFilterInternal(options.ocean);
      characters = characters.filter((c) => matchesOceanFilter(c, filter));
    }

    const markdown = generateReportMarkdown(characters, options);

    return {
      success: true,
      data: { characters, markdown, filter: options },
    };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

/**
 * Generate markdown for a filtered report
 */
function generateReportMarkdown(characters: CharacterInfo[], options: ReportOptions): string {
  let md = '# OCEAN Face Report\n\n';

  // Filter description
  md += '## Filters\n\n';
  if (options.role) {
    md += `- **Role:** ${AGENT_NAMES[options.role]}\n`;
  }
  if (options.theme) {
    md += `- **Theme:** ${formatTheme(options.theme)}\n`;
  }
  if (options.ocean) {
    md += `- **OCEAN:** ${options.ocean}\n`;
  }
  if (!options.role && !options.theme && !options.ocean) {
    md += '- *No filters applied*\n';
  }
  md += '\n';

  // Results
  md += `## Results (${characters.length} characters)\n\n`;

  if (characters.length === 0) {
    md += '*No characters match the specified filters.*\n';
    return md;
  }

  // Table
  md += '| Theme | Role | Character | Face | O | C | E | A | N |\n';
  md += '|:------|:-----|:----------|:----:|:-:|:-:|:-:|:-:|:-:|\n';

  for (const char of characters) {
    const facePath = getFacePath(char.theme, char.agent);
    md += `| ${formatTheme(char.theme)} `;
    md += `| ${AGENT_NAMES[char.agent]} `;
    md += `| ${char.character} `;
    md += `| <img src="${facePath}" width="40" alt="${char.character}"> `;
    md += `| ${char.ocean.O} `;
    md += `| ${char.ocean.C} `;
    md += `| ${char.ocean.E} `;
    md += `| ${char.ocean.A} `;
    md += `| ${char.ocean.N} |\n`;
  }

  return md;
}
