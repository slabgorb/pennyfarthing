/**
 * Batch Chernoff Face Generator
 *
 * Story 11-4: Generate anchor theme faces + markdown report
 *
 * Generates 100 SVG faces for anchor themes and creates markdown indices.
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { generateFace } from './generate-face.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Navigate from dist/scripts/ to project root, then to output directory
const projectRoot = join(__dirname, '..', '..');
const facesDir = join(projectRoot, 'pennyfarthing-dist', 'personas', 'faces');

// 10 anchor themes with OCEAN data
const THEMES = [
  'deadwood',
  'firefly',
  'breaking-bad',
  'the-good-place',
  'star-trek-tng',
  'discworld',
  'fargo',
  'succession',
  'mass-effect',
  'software-pioneers',
];

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

function generateRoleGallery(): void {
  console.log('Generating role-gallery.md...');

  let md = `# Role Gallery

Each agent role across all 10 anchor themes. Compare how the same role varies by theme personality.

${LEGEND}`;

  for (const agent of AGENTS) {
    const agentName = AGENT_NAMES[agent];
    md += `## ${agentName}\n\n`;

    // First row: first 5 themes
    const row1Themes = THEMES.slice(0, 5);
    md += '| ' + row1Themes.map((t) => formatTheme(t)).join(' | ') + ' |\n';
    md += '|' + row1Themes.map(() => ':---:').join('|') + '|\n';
    md +=
      '| ' +
      row1Themes.map((t) => imgTag(`by-role/${agent}/${t}.svg`, formatTheme(t))).join(' | ') +
      ' |\n\n';

    // Second row: last 5 themes
    const row2Themes = THEMES.slice(5);
    md += '| ' + row2Themes.map((t) => formatTheme(t)).join(' | ') + ' |\n';
    md += '|' + row2Themes.map(() => ':---:').join('|') + '|\n';
    md +=
      '| ' +
      row2Themes.map((t) => imgTag(`by-role/${agent}/${t}.svg`, formatTheme(t))).join(' | ') +
      ' |\n\n';
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
