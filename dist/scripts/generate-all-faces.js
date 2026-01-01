/**
 * Batch Chernoff Face Generator
 *
 * Story 11-4: Generate anchor theme faces + markdown report
 * Story 11-6: Generate full 630-face matrix with index
 *
 * Generates SVG faces for all themes and creates markdown indices.
 */
import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';
import { generateFace } from './generate-face.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Navigate from dist/scripts/ to project root, then to output directory
const projectRoot = join(__dirname, '..', '..');
const facesDir = join(projectRoot, 'pennyfarthing-dist', 'personas', 'faces');
const themesDir = join(projectRoot, 'pennyfarthing-dist', 'personas', 'themes');
// Dynamically load all themes from the themes directory
function getAllThemes() {
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
// Human-readable agent names for markdown (fallback when character name not available)
const AGENT_NAMES = {
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
const themeCache = new Map();
// Load character names for all agents in a theme
function getCharacterNames(theme) {
    if (themeCache.has(theme)) {
        return themeCache.get(theme);
    }
    const themePath = join(themesDir, `${theme}.yaml`);
    const content = readFileSync(themePath, 'utf-8');
    const data = parseYaml(content);
    const names = {};
    if (data?.agents) {
        for (const agent of AGENTS) {
            names[agent] = data.agents[agent]?.character || AGENT_NAMES[agent];
        }
    }
    themeCache.set(theme, names);
    return names;
}
// Get a specific character name
function getCharacterName(theme, agent) {
    const names = getCharacterNames(theme);
    return names[agent] || AGENT_NAMES[agent];
}
// Escape quotes for use in HTML attributes
function escapeForAttr(str) {
    return str.replace(/"/g, '&quot;');
}
// Escape quotes for use in markdown text (replace with single quotes)
function escapeForMarkdown(str) {
    return str.replace(/"/g, "'");
}
// Format theme name for display
function formatTheme(theme) {
    return theme
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}
function ensureDir(dir) {
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
}
function generateSvgFiles() {
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
function imgTag(src, alt) {
    return `<img src="${src}" alt="${escapeForAttr(alt)}" width="${IMG_SIZE}" height="${IMG_SIZE}">`;
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
// Generate image tag with character name caption
function imgWithName(src, characterName, agentRole) {
    const safeName = escapeForMarkdown(characterName);
    return `${imgTag(src, characterName)}<br/>**${safeName}**<br/><small>${agentRole}</small>`;
}
function generateTeamPhotos() {
    console.log('Generating team-photos.md...');
    let md = `# Team Photos

Chernoff faces for each theme's agent team. Vertical layout for easy visual comparison.

${LEGEND}`;
    for (const theme of THEMES) {
        const themeTitle = formatTheme(theme);
        const charNames = getCharacterNames(theme);
        md += `## ${themeTitle}\n\n`;
        // Vertical list: one agent per row for easy comparison
        md += '| Role | Face | Character |\n';
        md += '|:-----|:----:|:----------|\n';
        for (const agent of AGENTS) {
            const charName = escapeForMarkdown(charNames[agent]);
            const imgSrc = `by-theme/${theme}/${agent}.svg`;
            md += `| ${AGENT_NAMES[agent]} | ${imgTag(imgSrc, charNames[agent])} | **${charName}** |\n`;
        }
        md += '\n';
    }
    writeFileSync(join(facesDir, 'team-photos.md'), md);
    console.log('Generated team-photos.md');
}
// Generate image tag with character name for role gallery (theme name in header, character name below)
function imgWithCharacter(src, theme, agent) {
    const charName = getCharacterName(theme, agent);
    const safeName = escapeForMarkdown(charName);
    return `${imgTag(src, charName)}<br/>**${safeName}**`;
}
function generateRoleGallery() {
    console.log('Generating role-gallery.md...');
    let md = `# Role Gallery

Each agent role across all ${THEMES.length} themes. Vertical layout for easy visual comparison of how personality profiles vary.

${LEGEND}`;
    for (const agent of AGENTS) {
        const agentName = AGENT_NAMES[agent];
        md += `## ${agentName}\n\n`;
        // Vertical list: one theme per row for easy comparison
        md += '| Theme | Face | Character |\n';
        md += '|:------|:----:|:----------|\n';
        for (const theme of THEMES) {
            const charName = escapeForMarkdown(getCharacterName(theme, agent));
            const imgSrc = `by-role/${agent}/${theme}.svg`;
            md += `| ${formatTheme(theme)} | ${imgTag(imgSrc, charName)} | **${charName}** |\n`;
        }
        md += '\n';
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
//# sourceMappingURL=generate-all-faces.js.map