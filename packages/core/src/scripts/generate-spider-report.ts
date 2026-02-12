/**
 * OCEAN Spider Chart Report Generator
 *
 * Story 11-12: Build spider chart report generator
 *
 * Generates filtered spider chart reports and character comparisons with markdown output.
 * Mirrors generate-report.ts interface but outputs spider charts instead of Chernoff faces.
 */

import { readdirSync, readFileSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';
import { generateSpider, generateOverlaySpider, CharacterSpec } from './generate-spider.js';
import { findMonorepoRoot, getAllThemeDirs, resolveThemeFile } from '../cli/utils/files.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Find monorepo root by walking up from current directory
const projectRoot = findMonorepoRoot(__dirname);

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
 * Convert SVG string to data URL for markdown embedding
 */
function svgToDataUrl(svg: string): string {
  const encoded = Buffer.from(svg).toString('base64');
  return `data:image/svg+xml;base64,${encoded}`;
}

// ============================================================================
// Exported Functions
// ============================================================================

/**
 * Parse an OCEAN filter expression like "O>=4" or "A<=2"
 */
export function parseOceanFilter(expr: string): OceanFilter {
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
 * Filter characters by OCEAN dimension expression
 */
export function filterByOcean(expression: string): CharacterInfo[] {
  const filter = parseOceanFilter(expression);
  const allChars = loadAllCharacters();

  return allChars.filter((char) => matchesOceanFilter(char, filter));
}

/**
 * Filter characters by agent role
 */
export function filterByRole(role: string): CharacterInfo[] {
  if (!VALID_AGENTS.includes(role)) {
    throw new Error(`Invalid role: ${role}. Valid roles are: ${VALID_AGENTS.join(', ')}`);
  }

  const allChars = loadAllCharacters();
  return allChars.filter((char) => char.agent === role);
}

/**
 * Filter characters by theme (returns all 10 agents for that theme)
 */
export function filterByTheme(theme: string): CharacterInfo[] {
  const themes = getAllThemes();
  if (!themes.includes(theme)) {
    throw new Error(`Theme not found: ${theme}`);
  }

  const characters: CharacterInfo[] = [];
  for (const agent of VALID_AGENTS) {
    try {
      characters.push(loadCharacter(theme, agent));
    } catch {
      // Skip agents without OCEAN scores
    }
  }

  return characters;
}

/**
 * Compare 2-4 characters using overlay spider chart
 */
export function compareCharacters(specs: string[]): ComparisonResult {
  if (specs.length < 2) {
    throw new Error('Comparison requires at least 2 characters');
  }

  if (specs.length > 4) {
    throw new Error('Comparison allows at most 4 characters');
  }

  const characters: CharacterInfo[] = [];
  const charSpecs: CharacterSpec[] = [];

  for (const spec of specs) {
    if (!spec.includes(':')) {
      throw new Error(`Invalid format: "${spec}". Expected "theme:agent" format`);
    }

    const [theme, agent] = spec.split(':');

    const themes = getAllThemes();
    if (!themes.includes(theme)) {
      throw new Error(`Theme not found: ${theme}`);
    }

    if (!VALID_AGENTS.includes(agent)) {
      throw new Error(`Agent not found: ${agent}. Valid agents are: ${VALID_AGENTS.join(', ')}`);
    }

    const char = loadCharacter(theme, agent);
    characters.push(char);
    charSpecs.push({
      theme,
      agent,
      label: `${char.character} (${formatTheme(theme)})`,
    });
  }

  // Generate comparison markdown with overlay spider chart
  const markdown = generateComparisonMarkdown(characters, charSpecs);

  return { characters, markdown };
}

/**
 * Generate markdown for character comparison using overlay spider chart
 */
function generateComparisonMarkdown(characters: CharacterInfo[], charSpecs: CharacterSpec[]): string {
  let md = '# Spider Chart Comparison\n\n';

  // Generate overlay spider chart
  const overlaySvg = generateOverlaySpider(charSpecs);
  const dataUrl = svgToDataUrl(overlaySvg);

  md += `<img src="${dataUrl}" width="300" alt="Character Comparison">\n\n`;

  // Character details table
  md += '## Character Details\n\n';
  md += '| Character | Theme | Role | O | C | E | A | N |\n';
  md += '|:----------|:------|:-----|:-:|:-:|:-:|:-:|:-:|\n';

  for (const char of characters) {
    md += `| ${char.character} `;
    md += `| ${formatTheme(char.theme)} `;
    md += `| ${AGENT_NAMES[char.agent]} `;
    md += `| ${char.ocean.O} `;
    md += `| ${char.ocean.C} `;
    md += `| ${char.ocean.E} `;
    md += `| ${char.ocean.A} `;
    md += `| ${char.ocean.N} |\n`;
  }

  return md;
}

/**
 * Generate a filtered report with markdown output
 */
export function generateReport(options: ReportOptions): ReportResult {
  let characters = loadAllCharacters();

  // Apply filters
  if (options.theme) {
    const themes = getAllThemes();
    if (!themes.includes(options.theme)) {
      throw new Error(`Theme not found: ${options.theme}`);
    }
    characters = characters.filter((c) => c.theme === options.theme);
  }

  if (options.role) {
    if (!VALID_AGENTS.includes(options.role)) {
      throw new Error(`Invalid role: ${options.role}`);
    }
    characters = characters.filter((c) => c.agent === options.role);
  }

  if (options.ocean) {
    const filter = parseOceanFilter(options.ocean);
    characters = characters.filter((c) => matchesOceanFilter(c, filter));
  }

  // Generate markdown
  const markdown = generateReportMarkdown(characters, options);

  return {
    characters,
    markdown,
    filter: options,
  };
}

/**
 * Generate markdown for a filtered report with spider charts
 */
function generateReportMarkdown(characters: CharacterInfo[], options: ReportOptions): string {
  let md = '# OCEAN Spider Chart Report\n\n';

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

  // Table with embedded spider charts
  md += '| Theme | Role | Character | Spider | O | C | E | A | N |\n';
  md += '|:------|:-----|:----------|:------:|:-:|:-:|:-:|:-:|:-:|\n';

  for (const char of characters) {
    const spiderSvg = generateSpider(char.theme, char.agent);
    const dataUrl = svgToDataUrl(spiderSvg);

    md += `| ${formatTheme(char.theme)} `;
    md += `| ${AGENT_NAMES[char.agent]} `;
    md += `| ${char.character} `;
    md += `| <img src="${dataUrl}" width="40" alt="${char.character}"> `;
    md += `| ${char.ocean.O} `;
    md += `| ${char.ocean.C} `;
    md += `| ${char.ocean.E} `;
    md += `| ${char.ocean.A} `;
    md += `| ${char.ocean.N} |\n`;
  }

  return md;
}
