/**
 * Theme Loader - Load and parse Pennyfarthing theme configurations
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { resolvePennyfarthingDist, getPortraitPaths } from './portrait-resolver.js';
/**
 * Simple YAML parser for theme files
 * Only handles the specific YAML structure we need
 */
function parseYaml(content) {
    const result = { theme: {}, agents: {} };
    const lines = content.split('\n');
    let currentSection = null;
    let currentAgent = null;
    let currentSubsection = null;
    for (const line of lines) {
        const trimmed = line.trimEnd();
        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith('#'))
            continue;
        // Count leading spaces to determine indent level
        const indent = line.length - line.trimStart().length;
        const key = trimmed.split(':')[0].trim();
        const value = trimmed.includes(':') ? trimmed.substring(trimmed.indexOf(':') + 1).trim() : '';
        if (indent === 0) {
            if (key === 'theme') {
                currentSection = 'theme';
                currentAgent = null;
            }
            else if (key === 'agents') {
                currentSection = 'agents';
                currentAgent = null;
            }
        }
        else if (indent === 2 && currentSection === 'theme') {
            if (key === 'name') {
                result.theme.name = value.replace(/^["']|["']$/g, '');
            }
            else if (key === 'description') {
                result.theme.description = value.replace(/^["']|["']$/g, '');
            }
        }
        else if (indent === 2 && currentSection === 'agents') {
            currentAgent = key;
            if (!result.agents[currentAgent]) {
                result.agents[currentAgent] = {};
            }
            currentSubsection = null;
        }
        else if (indent === 4 && currentSection === 'agents' && currentAgent) {
            const cleanValue = value.replace(/^["']|["']$/g, '');
            if (key === 'character') {
                result.agents[currentAgent].character = cleanValue;
            }
            else if (key === 'style') {
                result.agents[currentAgent].style = cleanValue;
            }
            else if (key === 'role') {
                result.agents[currentAgent].role = cleanValue;
            }
            else if (key === 'trait') {
                result.agents[currentAgent].trait = cleanValue;
            }
            else if (key === 'quote') {
                result.agents[currentAgent].quote = cleanValue;
            }
            else if (key === 'shortName') {
                result.agents[currentAgent].shortName = cleanValue;
            }
            else if (key === 'helper') {
                currentSubsection = 'helper';
                result.agents[currentAgent].helper = {};
            }
        }
        else if (indent === 6 && currentSubsection === 'helper' && currentAgent) {
            const cleanValue = value.replace(/^["']|["']$/g, '');
            if (key === 'name') {
                if (!result.agents[currentAgent].helper) {
                    result.agents[currentAgent].helper = {};
                }
                result.agents[currentAgent].helper.name = cleanValue;
            }
            else if (key === 'style') {
                if (!result.agents[currentAgent].helper) {
                    result.agents[currentAgent].helper = {};
                }
                result.agents[currentAgent].helper.style = cleanValue;
            }
        }
    }
    return result;
}
/**
 * Load a theme configuration by name
 * @param themeName - Name of the theme (e.g., 'shakespeare', 'norse-mythology')
 * @returns Parsed theme configuration or null if not found
 */
export function loadTheme(themeName) {
    const distPath = resolvePennyfarthingDist();
    if (!distPath) {
        return null;
    }
    const paths = getPortraitPaths(distPath);
    const themePath = join(paths.themesDir, 'themes', `${themeName}.yaml`);
    if (!existsSync(themePath)) {
        return null;
    }
    try {
        const content = readFileSync(themePath, 'utf-8');
        const raw = parseYaml(content);
        const agents = {};
        for (const [agentKey, agentData] of Object.entries(raw.agents || {})) {
            agents[agentKey] = {
                character: agentData.character || '',
                style: agentData.style || '',
                role: agentData.role || '',
                trait: agentData.trait || '',
                quote: agentData.quote || '',
                helper: agentData.helper?.name,
            };
        }
        return {
            name: themeName,
            description: raw.theme?.description || '',
            agents,
        };
    }
    catch {
        return null;
    }
}
/**
 * List all available themes
 * @returns Array of theme names
 */
export function listThemes() {
    const distPath = resolvePennyfarthingDist();
    if (!distPath) {
        return [];
    }
    const paths = getPortraitPaths(distPath);
    const themesDir = join(paths.themesDir, 'themes');
    if (!existsSync(themesDir)) {
        return [];
    }
    try {
        const files = readdirSync(themesDir);
        return files
            .filter(f => f.endsWith('.yaml'))
            .map(f => basename(f, '.yaml'));
    }
    catch {
        return [];
    }
}
/**
 * Get agent persona from a theme
 * @param themeName - Theme name
 * @param agentName - Agent name (e.g., 'sm', 'tea', 'dev')
 * @returns Agent persona or null if not found
 */
export function getAgentPersona(themeName, agentName) {
    const theme = loadTheme(themeName);
    if (!theme) {
        return null;
    }
    return theme.agents[agentName] || null;
}
//# sourceMappingURL=theme-loader.js.map