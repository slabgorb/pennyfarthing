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
import { generateSpider, generateTeamOverlay, ROLE_COLORS } from './generate-spider.js';
import { findMonorepoRoot } from '../cli/utils/files.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Find monorepo root by walking up from current directory
const projectRoot = findMonorepoRoot(__dirname);
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
  'ba',
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
  ba: 'Business Analyst',
};

// Cache for theme data to avoid repeated file reads
interface AgentData {
  character: string;
  shortName: string;
  slug: string;
}
const themeCache: Map<string, Record<string, AgentData>> = new Map();

// Convert name to URL-safe slug (lowercase kebab-case)
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Generate OCEAN suffix from scores
function oceanSuffix(ocean: { O: number; C: number; E: number; A: number; N: number }): string {
  return `${ocean.O}${ocean.C}${ocean.E}${ocean.A}${ocean.N}`;
}

// Load agent data for all agents in a theme
function getAgentData(theme: string): Record<string, AgentData> {
  if (themeCache.has(theme)) {
    return themeCache.get(theme)!;
  }

  const themePath = join(themesDir, `${theme}.yaml`);
  const content = readFileSync(themePath, 'utf-8');
  const data = parseYaml(content);

  const agents: Record<string, AgentData> = {};
  if (data?.agents) {
    for (const agent of AGENTS) {
      const agentInfo = data.agents[agent];
      if (agentInfo) {
        const character = agentInfo.character || AGENT_NAMES[agent];
        const shortName = agentInfo.shortName || character.split(' ')[0];
        const baseSlug = toSlug(shortName);
        const ocean = agentInfo.ocean || { O: 3, C: 3, E: 3, A: 3, N: 3 };
        const slug = `${baseSlug}-${oceanSuffix(ocean)}`;
        agents[agent] = { character, shortName, slug };
      } else {
        agents[agent] = {
          character: AGENT_NAMES[agent],
          shortName: AGENT_NAMES[agent],
          slug: agent,
        };
      }
    }
  }

  themeCache.set(theme, agents);
  return agents;
}

// Load character names for all agents in a theme (backward compat)
function getCharacterNames(theme: string): Record<string, string> {
  const agents = getAgentData(theme);
  const names: Record<string, string> = {};
  for (const agent of AGENTS) {
    names[agent] = agents[agent]?.character || AGENT_NAMES[agent];
  }
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
    const agentData = getAgentData(theme);
    for (const agent of AGENTS) {
      const svg = generateSpider(theme, agent);
      const slug = agentData[agent]?.slug || agent;

      // Write to by-theme directory using slug-based naming
      const themeFilePath = join(byThemeDir, theme, `${slug}.svg`);
      writeFileSync(themeFilePath, svg);

      // Write to by-role directory (keeps role-based for cross-theme comparison)
      const roleFilePath = join(byRoleDir, agent, `${theme}.svg`);
      writeFileSync(roleFilePath, svg);

      count++;
    }

    // Generate team overlay for this theme
    const teamOverlay = generateTeamOverlay(theme);
    const teamOverlayPath = join(byThemeDir, theme, 'team-overlay.svg');
    writeFileSync(teamOverlayPath, teamOverlay);
  }

  console.log(`Generated ${count} individual + ${THEMES.length} team overlay SVG files.`);
}

// Fixed image size for consistent display
const IMG_SIZE = 100;

function imgTag(src: string, alt: string): string {
  return `<img src="${src}" alt="${escapeForAttr(alt)}" width="${IMG_SIZE}" height="${IMG_SIZE}">`;
}

// Generate role color legend markdown (reserved for future use)
function _generateRoleColorLegend(): string {
  const roleOrder = [
    ['orchestrator', 'Orchestrator'],
    ['sm', 'Scrum Master'],
    ['tea', 'Test Engineer'],
    ['dev', 'Developer'],
    ['reviewer', 'Reviewer'],
    ['architect', 'Architect'],
    ['pm', 'Product Manager'],
    ['tech-writer', 'Tech Writer'],
    ['ux-designer', 'UX Designer'],
    ['devops', 'DevOps'],
  ];

  return roleOrder
    .map(([role, name]) => `| ![${role}](https://via.placeholder.com/12/${ROLE_COLORS[role].slice(1)}/000000?text=+) \`${ROLE_COLORS[role]}\` | ${name} |`)
    .join('\n');
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

## Role Colors

Each role has a consistent color across all charts. **Bold** = tactical (emphasized in overlays).

| Color | Role |
|:-----:|:-----|
| <span style="color:${ROLE_COLORS['orchestrator']}">${ROLE_COLORS['orchestrator']}</span> | Orchestrator |
| <span style="color:${ROLE_COLORS['sm']}">**${ROLE_COLORS['sm']}**</span> | **Scrum Master** |
| <span style="color:${ROLE_COLORS['tea']}">**${ROLE_COLORS['tea']}**</span> | **Test Engineer** |
| <span style="color:${ROLE_COLORS['dev']}">**${ROLE_COLORS['dev']}**</span> | **Developer** |
| <span style="color:${ROLE_COLORS['reviewer']}">**${ROLE_COLORS['reviewer']}**</span> | **Reviewer** |
| <span style="color:${ROLE_COLORS['architect']}">${ROLE_COLORS['architect']}</span> | Architect |
| <span style="color:${ROLE_COLORS['pm']}">${ROLE_COLORS['pm']}</span> | Product Manager |
| <span style="color:${ROLE_COLORS['tech-writer']}">${ROLE_COLORS['tech-writer']}</span> | Tech Writer |
| <span style="color:${ROLE_COLORS['ux-designer']}">${ROLE_COLORS['ux-designer']}</span> | UX Designer |
| <span style="color:${ROLE_COLORS['devops']}">${ROLE_COLORS['devops']}</span> | DevOps |

---

`;

// Generate image tag with character name caption (reserved for future use)
function _imgWithName(src: string, characterName: string, agentRole: string): string {
  const safeName = escapeForMarkdown(characterName);
  return `${imgTag(src, characterName)}<br/>**${safeName}**<br/><small>${agentRole}</small>`;
}

// Larger image size for team overlay
const OVERLAY_IMG_SIZE = 200;

function overlayImgTag(src: string, alt: string): string {
  return `<img src="${src}" alt="${escapeForAttr(alt)}" width="${OVERLAY_IMG_SIZE}" height="${OVERLAY_IMG_SIZE}">`;
}

function generateTeamPhotos(): void {
  console.log('Generating team-spiders.md...');

  let md = `# Team Spider Charts

OCEAN spider charts for each theme's agent team. Each theme shows a combined team overlay followed by individual role charts.

${LEGEND}`;

  for (const theme of THEMES) {
    const themeTitle = formatTheme(theme);
    const charNames = getCharacterNames(theme);
    md += `## ${themeTitle}\n\n`;

    // Team overlay at top
    md += `### Team Overview\n\n`;
    md += `${overlayImgTag(`by-theme/${theme}/team-overlay.svg`, `${themeTitle} Team Overlay`)}\n\n`;

    // Vertical list: one agent per row for easy comparison
    md += `### Individual Roles\n\n`;
    md += '| Role | Spider | Character |\n';
    md += '|:-----|:------:|:----------|\n';

    const agentData = getAgentData(theme);
    for (const agent of AGENTS) {
      const charName = escapeForMarkdown(charNames[agent]);
      const slug = agentData[agent]?.slug || agent;
      const imgSrc = `by-theme/${theme}/${slug}.svg`;
      md += `| ${AGENT_NAMES[agent]} | ${imgTag(imgSrc, charNames[agent])} | **${charName}** |\n`;
    }

    md += '\n';
  }

  writeFileSync(join(spidersDir, 'team-spiders.md'), md);
  console.log('Generated team-spiders.md');
}

// Generate image tag with character name for role gallery (reserved for future use)
function _imgWithCharacter(src: string, theme: string, agent: string): string {
  const charName = getCharacterName(theme, agent);
  const safeName = escapeForMarkdown(charName);
  return `${imgTag(src, charName)}<br/>**${safeName}**`;
}

function generateRoleGallery(): void {
  console.log('Generating role-spiders.md...');

  let md = `# Role Spider Gallery

Each agent role across all ${THEMES.length} themes. Vertical layout for easy visual comparison of how personality profiles vary.

${LEGEND}`;

  for (const agent of AGENTS) {
    const agentName = AGENT_NAMES[agent];
    md += `## ${agentName}\n\n`;

    // Vertical list: one theme per row for easy comparison
    md += '| Theme | Spider | Character |\n';
    md += '|:------|:------:|:----------|\n';

    for (const theme of THEMES) {
      const charName = escapeForMarkdown(getCharacterName(theme, agent));
      const imgSrc = `by-role/${agent}/${theme}.svg`;
      md += `| ${formatTheme(theme)} | ${imgTag(imgSrc, charName)} | **${charName}** |\n`;
    }

    md += '\n';
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
