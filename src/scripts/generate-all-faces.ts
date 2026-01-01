/**
 * Batch Chernoff Face Generator
 *
 * Story 11-4: Generate anchor theme faces + markdown report
 * Story 11-6: Generate full 630-face matrix with index
 *
 * Generates SVG faces for all themes and creates markdown indices.
 */

import { writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { generateFace } from './generate-face.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Navigate from dist/scripts/ to project root, then to output directory
const projectRoot = join(__dirname, '..', '..');
const facesDir = join(projectRoot, 'pennyfarthing-dist', 'personas', 'faces');
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

  const byThemeDir = join(facesDir, 'by-theme');
  const byRoleDir = join(facesDir, 'by-role');

  // Create directory structure
  ensureDir(byThemeDir);
  ensureDir(byRoleDir);

  for (const theme of THEMES) {
    ensureDir(join(byThemeDir, theme));
  }

  for (const agent of AGENTS) {
    ensureDir(join(byRoleDir, agent));
  }

  // Generate faces
  let count = 0;
  for (const theme of THEMES) {
    for (const agent of AGENTS) {
      const svg = generateFace(theme, agent);

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
const IMG_SIZE = 80;

function imgTag(src: string, alt: string): string {
  return `<img src="${src}" alt="${alt}" width="${IMG_SIZE}" height="${IMG_SIZE}">`;
}

const LEGEND = `## Reading the Faces

Each face visualizes OCEAN personality scores through facial features:

| Trait | Feature | Low (1) | High (5) |
|-------|---------|---------|----------|
| **O**penness | Eye size | Small eyes | Large eyes |
| **C**onscientiousness | Face shape | Wide & round | Narrow & angular |
| **E**xtraversion | Mouth | Small frown | Wide smile |
| **A**greeableness | Eyebrows | Angled down (stern) | Arched up (friendly) |
| **N**euroticism | Line weight | Thin strokes | Thick strokes |

Background colors indicate agent role.

---

`;

function generateTeamPhotos(): void {
  console.log('Generating team-photos.md...');

  let md = `# Team Photos

Chernoff faces for each theme's agent team.

${LEGEND}`;

  for (const theme of THEMES) {
    const themeTitle = formatTheme(theme);
    md += `## ${themeTitle}\n\n`;

    // First row: orchestrator, sm, tea, dev, reviewer
    const row1Agents = AGENTS.slice(0, 5);
    md += '| ' + row1Agents.map((a) => AGENT_NAMES[a]).join(' | ') + ' |\n';
    md += '|' + row1Agents.map(() => ':---:').join('|') + '|\n';
    md +=
      '| ' +
      row1Agents.map((a) => imgTag(`by-theme/${theme}/${a}.svg`, AGENT_NAMES[a])).join(' | ') +
      ' |\n\n';

    // Second row: architect, pm, tech-writer, ux-designer, devops
    const row2Agents = AGENTS.slice(5);
    md += '| ' + row2Agents.map((a) => AGENT_NAMES[a]).join(' | ') + ' |\n';
    md += '|' + row2Agents.map(() => ':---:').join('|') + '|\n';
    md +=
      '| ' +
      row2Agents.map((a) => imgTag(`by-theme/${theme}/${a}.svg`, AGENT_NAMES[a])).join(' | ') +
      ' |\n\n';
  }

  writeFileSync(join(facesDir, 'team-photos.md'), md);
  console.log('Generated team-photos.md');
}

// Chunk array into groups of specified size
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function generateRoleGallery(): void {
  console.log('Generating role-gallery.md...');

  let md = `# Role Gallery

Each agent role across all ${THEMES.length} themes. Compare how the same role varies by theme personality.

${LEGEND}`;

  // Chunk themes into rows of 7 for readable tables
  const ROW_SIZE = 7;

  for (const agent of AGENTS) {
    const agentName = AGENT_NAMES[agent];
    md += `## ${agentName}\n\n`;

    const themeChunks = chunkArray(THEMES, ROW_SIZE);

    for (const chunk of themeChunks) {
      md += '| ' + chunk.map((t) => formatTheme(t)).join(' | ') + ' |\n';
      md += '|' + chunk.map(() => ':---:').join('|') + '|\n';
      md +=
        '| ' +
        chunk.map((t) => imgTag(`by-role/${agent}/${t}.svg`, formatTheme(t))).join(' | ') +
        ' |\n\n';
    }
  }

  writeFileSync(join(facesDir, 'role-gallery.md'), md);
  console.log('Generated role-gallery.md');
}

// Main execution
console.log('=== Batch Chernoff Face Generator ===');
console.log(`Output directory: ${facesDir}`);
console.log(`Themes: ${THEMES.length}`);
console.log(`Agents: ${AGENTS.length}`);
console.log(`Total faces: ${THEMES.length * AGENTS.length}`);
console.log('');

generateSvgFiles();
generateTeamPhotos();
generateRoleGallery();

console.log('');
console.log('Done!');
