/**
 * Batch OCEAN Spider Chart Generator
 *
 * Generates SVG spider charts for all 630 characters (63 themes × 10 agents)
 * and creates markdown indices for navigation.
 *
 * Parallel to generate-all-faces.ts but produces spider charts instead of Chernoff faces.
 */

import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';
import { generateSpider } from './generate-spider.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Navigate from dist/scripts/ to project root, then to output directory
const projectRoot = join(__dirname, '..', '..');
const spidersDir = join(projectRoot, 'pennyfarthing-dist', 'personas', 'spiders');
const themesDir = join(projectRoot, 'pennyfarthing-dist', 'personas', 'themes');

// Dynamically load all themes from the themes directory
function getAllThemes(): string[] {
  const files = readdirSync(themesDir).filter((f) => f.endsWith('.yaml'));
  return files.map((f) => f.replace('.yaml', '')).sort();
}

const THEMES = getAllThemes();

// 10 agents per theme
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

// Human-readable agent names for markdown
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
};

// Cache for theme data to avoid repeated file reads
const themeCache: Map<string, Record<string, string>> = new Map();

// Load character names for all agents in a theme
function getCharacterNames(theme: string): Record<string, string> {
  if (themeCache.has(theme)) {
    return themeCache.get(theme)!;
  }

  const themePath = join(themesDir, `${theme}.yaml`);
  const content = readFileSync(themePath, 'utf-8');
  const data = parseYaml(content);

  const names: Record<string, string> = {};
  if (data?.agents) {
    for (const agent of AGENTS) {
      names[agent] = data.agents[agent]?.character || AGENT_NAMES[agent];
    }
  }

  themeCache.set(theme, names);
  return names;
}

// Get a specific character name
function getCharacterName(theme: string, agent: string): string {
  const names = getCharacterNames(theme);
  return names[agent] || AGENT_NAMES[agent];
}

// Escape quotes for use in HTML attributes
function escapeForAttr(str: string): string {
  return str.replace(/"/g, '&quot;');
}

// Escape quotes for use in markdown text
function escapeForMarkdown(str: string): string {
  return str.replace(/"/g, "'");
}

// Format theme name for display
function formatTheme(theme: string): string {
  return theme
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function generateSvgFiles(): void {
  console.log('Generating SVG files...');

  const byThemeDir = join(spidersDir, 'by-theme');
  const byRoleDir = join(spidersDir, 'by-role');

  // Create directory structure
  ensureDir(byThemeDir);
  ensureDir(byRoleDir);

  for (const theme of THEMES) {
    ensureDir(join(byThemeDir, theme));
  }

  for (const agent of AGENTS) {
    ensureDir(join(byRoleDir, agent));
  }

  // Generate spider charts
  let count = 0;
  for (const theme of THEMES) {
    for (const agent of AGENTS) {
      const svg = generateSpider(theme, agent);

      // Write to by-theme directory
      const themeFilePath = join(byThemeDir, theme, `${agent}.svg`);
      writeFileSync(themeFilePath, svg);

      // Write to by-role directory
      const roleFilePath = join(byRoleDir, agent, `${theme}.svg`);
      writeFileSync(roleFilePath, svg);

      count++;
    }
  }

  console.log(`Generated ${count} SVG files.`);
}

// Fixed image size for consistent display
const IMG_SIZE = 100;

function imgTag(src: string, alt: string): string {
  return `<img src="${src}" alt="${escapeForAttr(alt)}" width="${IMG_SIZE}" height="${IMG_SIZE}">`;
}

const LEGEND = `## Reading the Spider Charts

Each spider chart visualizes OCEAN personality scores on a pentagon:

| Vertex | Trait | Meaning |
|--------|-------|---------|
| **O** | Openness | Curiosity, creativity, willingness to try new things |
| **C** | Conscientiousness | Organization, discipline, goal-directed behavior |
| **E** | Extraversion | Sociability, assertiveness, positive emotions |
| **A** | Agreeableness | Cooperation, trust, helpfulness |
| **N** | Neuroticism | Emotional instability, anxiety, moodiness |

- Score 1 = 20% from center (inner ring)
- Score 5 = 100% from center (outer ring)
- Grid lines show levels 1-5

---

`;

// Generate image tag with character name caption
function imgWithName(src: string, characterName: string, agentRole: string): string {
  const safeName = escapeForMarkdown(characterName);
  return `${imgTag(src, characterName)}<br/>**${safeName}**<br/><small>${agentRole}</small>`;
}

function generateTeamPhotos(): void {
  console.log('Generating team-spiders.md...');

  let md = `# Team Spider Charts

OCEAN spider charts for each theme's agent team. Each chart shows the character's personality profile.

${LEGEND}`;

  for (const theme of THEMES) {
    const themeTitle = formatTheme(theme);
    const charNames = getCharacterNames(theme);
    md += `## ${themeTitle}\n\n`;

    // First row: orchestrator, sm, tea, dev, reviewer
    const row1Agents = AGENTS.slice(0, 5);
    md += '| ' + row1Agents.map((a) => AGENT_NAMES[a]).join(' | ') + ' |\n';
    md += '|' + row1Agents.map(() => ':---:').join('|') + '|\n';
    md +=
      '| ' +
      row1Agents
        .map((a) => imgWithName(`by-theme/${theme}/${a}.svg`, charNames[a], AGENT_NAMES[a]))
        .join(' | ') +
      ' |\n\n';

    // Second row: architect, pm, tech-writer, ux-designer, devops
    const row2Agents = AGENTS.slice(5);
    md += '| ' + row2Agents.map((a) => AGENT_NAMES[a]).join(' | ') + ' |\n';
    md += '|' + row2Agents.map(() => ':---:').join('|') + '|\n';
    md +=
      '| ' +
      row2Agents
        .map((a) => imgWithName(`by-theme/${theme}/${a}.svg`, charNames[a], AGENT_NAMES[a]))
        .join(' | ') +
      ' |\n\n';
  }

  writeFileSync(join(spidersDir, 'team-spiders.md'), md);
  console.log('Generated team-spiders.md');
}

// Chunk array into groups of specified size
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// Generate image tag with character name for role gallery
function imgWithCharacter(src: string, theme: string, agent: string): string {
  const charName = getCharacterName(theme, agent);
  const safeName = escapeForMarkdown(charName);
  return `${imgTag(src, charName)}<br/>**${safeName}**`;
}

function generateRoleGallery(): void {
  console.log('Generating role-spiders.md...');

  let md = `# Role Spider Gallery

Each agent role across all ${THEMES.length} themes. Compare how personality profiles vary by theme.

${LEGEND}`;

  // Chunk themes into rows of 6 for readable tables (slightly smaller than faces due to chart complexity)
  const ROW_SIZE = 6;

  for (const agent of AGENTS) {
    const agentName = AGENT_NAMES[agent];
    md += `## ${agentName}\n\n`;

    const themeChunks = chunkArray(THEMES, ROW_SIZE);

    for (const chunk of themeChunks) {
      md += '| ' + chunk.map((t) => formatTheme(t)).join(' | ') + ' |\n';
      md += '|' + chunk.map(() => ':---:').join('|') + '|\n';
      md +=
        '| ' +
        chunk.map((t) => imgWithCharacter(`by-role/${agent}/${t}.svg`, t, agent)).join(' | ') +
        ' |\n\n';
    }
  }

  writeFileSync(join(spidersDir, 'role-spiders.md'), md);
  console.log('Generated role-spiders.md');
}

// Main execution
console.log('=== Batch OCEAN Spider Chart Generator ===');
console.log(`Output directory: ${spidersDir}`);
console.log(`Themes: ${THEMES.length}`);
console.log(`Agents: ${AGENTS.length}`);
console.log(`Total spider charts: ${THEMES.length * AGENTS.length}`);
console.log('');

generateSvgFiles();
generateTeamPhotos();
generateRoleGallery();

console.log('');
console.log('Done!');
