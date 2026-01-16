/**
 * Theme Metadata
 *
 * Handles loading and caching of Pennyfarthing theme metadata.
 * Extracted from main.ts for better maintainability.
 */
import * as fs from 'fs';
import { join } from 'path';
import { getProjectDirectory } from './paths.js';
/**
 * Category mapping for known themes (24-5)
 * Maps theme IDs or source patterns to categories
 */
export const CATEGORY_MAP = {
    // TV Series
    'star-trek-tos': 'TV Series',
    'star-trek-tng': 'TV Series',
    'star-trek-ds9': 'TV Series',
    'star-trek-voyager': 'TV Series',
    'breaking-bad': 'TV Series',
    'the-office': 'TV Series',
    'the-wire': 'TV Series',
    'game-of-thrones': 'TV Series',
    'ted-lasso': 'TV Series',
    'parks-and-recreation': 'TV Series',
    'friends': 'TV Series',
    'seinfeld': 'TV Series',
    'mad-men': 'TV Series',
    'the-sopranos': 'TV Series',
    'arrested-development': 'TV Series',
    'schitts-creek': 'TV Series',
    'brooklyn-nine-nine': 'TV Series',
    'firefly': 'TV Series',
    'battlestar-galactica': 'TV Series',
    'doctor-who': 'TV Series',
    'stranger-things': 'TV Series',
    'the-good-place': 'TV Series',
    'its-always-sunny': 'TV Series',
    'downton-abbey': 'TV Series',
    'the-crown': 'TV Series',
    'succession': 'TV Series',
    'the-simpsons': 'TV Series',
    'futurama': 'TV Series',
    'arcane': 'TV Series',
    'avatar-the-last-airbender': 'TV Series',
    'severance': 'TV Series',
    'the-west-wing': 'TV Series',
    'lost': 'TV Series',
    'the-x-files': 'TV Series',
    'twin-peaks': 'TV Series',
    'the-twilight-zone': 'TV Series',
    'mash': 'TV Series',
    'a-team': 'TV Series',
    // Literature
    'alice-in-wonderland': 'Literature',
    'lord-of-the-rings': 'Literature',
    'discworld': 'Literature',
    'hitchhikers-guide': 'Literature',
    'dune': 'Literature',
    'pride-and-prejudice': 'Literature',
    'sherlock-holmes': 'Literature',
    'harry-potter': 'Literature',
    'narnia': 'Literature',
    'foundation': 'Literature',
    'wheel-of-time': 'Literature',
    'stormlight-archive': 'Literature',
    'mistborn': 'Literature',
    'good-omens': 'Literature',
    'american-gods': 'Literature',
    'the-expanse': 'Literature',
    'enders-game': 'Literature',
    'three-body-problem': 'Literature',
    'hyperion': 'Literature',
    '1984': 'Literature',
    'brave-new-world': 'Literature',
    'frankenstein': 'Literature',
    'dracula': 'Literature',
    'moby-dick': 'Literature',
    'odyssey': 'Literature',
    'iliad': 'Literature',
    'don-quixote': 'Literature',
    'count-of-monte-cristo': 'Literature',
    'les-miserables': 'Literature',
    'great-gatsby': 'Literature',
    'winnie-the-pooh': 'Literature',
    'peter-pan': 'Literature',
    'wizard-of-oz': 'Literature',
    // Film
    'star-wars': 'Film',
    'matrix': 'Film',
    'inception': 'Film',
    'pulp-fiction': 'Film',
    'godfather': 'Film',
    'shawshank-redemption': 'Film',
    'fight-club': 'Film',
    'blade-runner': 'Film',
    'back-to-the-future': 'Film',
    'jurassic-park': 'Film',
    'indiana-jones': 'Film',
    'marvel-avengers': 'Film',
    'guardians-of-the-galaxy': 'Film',
    'pirates-of-the-caribbean': 'Film',
    'princess-bride': 'Film',
    'monty-python': 'Film',
    'ghostbusters': 'Film',
    'men-in-black': 'Film',
    'ocean-eleven': 'Film',
    'big-lebowski': 'Film',
    'grand-budapest-hotel': 'Film',
    'kill-bill': 'Film',
    'john-wick': 'Film',
    'die-hard': 'Film',
    'terminator': 'Film',
    'alien': 'Film',
    'predator': 'Film',
    'mad-max': 'Film',
    'studio-ghibli': 'Film',
    'pixar': 'Film',
    'disney-classics': 'Film',
    'interstellar': 'Film',
    'arrival': 'Film',
    'her': 'Film',
    'ex-machina': 'Film',
    // Mythology
    'greek-mythology': 'Mythology',
    'norse-mythology': 'Mythology',
    'egyptian-mythology': 'Mythology',
    'celtic-mythology': 'Mythology',
    'japanese-mythology': 'Mythology',
    'hindu-mythology': 'Mythology',
    'arthurian-legend': 'Mythology',
    // Games
    'zelda': 'Games',
    'mario': 'Games',
    'final-fantasy': 'Games',
    'mass-effect': 'Games',
    'bioshock': 'Games',
    'portal': 'Games',
    'half-life': 'Games',
    'halo': 'Games',
    'overwatch': 'Games',
    'world-of-warcraft': 'Games',
    'elder-scrolls': 'Games',
    'fallout': 'Games',
    'cyberpunk': 'Games',
    'witcher': 'Games',
    'red-dead-redemption': 'Games',
    'last-of-us': 'Games',
    'god-of-war': 'Games',
    'dark-souls': 'Games',
    'elden-ring': 'Games',
    'pokemon': 'Games',
    'animal-crossing': 'Games',
    'minecraft': 'Games',
    // History
    'ancient-rome': 'History',
    'ancient-greece': 'History',
    'ancient-egypt': 'History',
    'renaissance': 'History',
    'victorian-era': 'History',
    'wild-west': 'History',
    'world-war-2': 'History',
    'cold-war': 'History',
    'founding-fathers': 'History',
    // Music
    'classical-composers': 'Music',
    'jazz-legends': 'Music',
    'rock-legends': 'Music',
    'beatles': 'Music',
    'queen': 'Music',
    // Science
    'scientists': 'Science',
    'space-exploration': 'Science',
};
/**
 * Derive category from theme ID and source (24-5)
 * Uses CATEGORY_MAP for known themes, falls back to pattern matching
 */
export function deriveCategory(themeId, source) {
    // Check explicit mapping first
    if (CATEGORY_MAP[themeId]) {
        return CATEGORY_MAP[themeId];
    }
    // Pattern matching on source text
    const sourceLower = source.toLowerCase();
    if (sourceLower.includes('tv series') || sourceLower.includes('tv show') ||
        sourceLower.includes('amc') || sourceLower.includes('hbo') ||
        sourceLower.includes('netflix') || sourceLower.includes('bbc')) {
        return 'TV Series';
    }
    if (sourceLower.includes('film') || sourceLower.includes('movie') ||
        sourceLower.includes('cinema') || sourceLower.includes('disney') ||
        sourceLower.includes('pixar') || sourceLower.includes('studio ghibli')) {
        return 'Film';
    }
    if (sourceLower.includes('mythology') || sourceLower.includes('myth') ||
        sourceLower.includes('legend') || sourceLower.includes('folklore')) {
        return 'Mythology';
    }
    if (sourceLower.includes('novel') || sourceLower.includes('book') ||
        sourceLower.includes(' by ') || sourceLower.includes('author') ||
        sourceLower.includes('literary') || sourceLower.includes('classic')) {
        return 'Literature';
    }
    if (sourceLower.includes('game') || sourceLower.includes('video game') ||
        sourceLower.includes('nintendo') || sourceLower.includes('playstation') ||
        sourceLower.includes('xbox')) {
        return 'Games';
    }
    if (sourceLower.includes('history') || sourceLower.includes('historical') ||
        sourceLower.includes('century') || sourceLower.includes('ancient') ||
        sourceLower.includes('era')) {
        return 'History';
    }
    if (sourceLower.includes('music') || sourceLower.includes('composer') ||
        sourceLower.includes('band') || sourceLower.includes('musician')) {
        return 'Music';
    }
    return 'Other';
}
// Theme metadata cache
let themeMetadataCache = null;
/**
 * Get cached theme metadata
 */
export function getThemeMetadataCache() {
    return themeMetadataCache;
}
/**
 * Get available themes from pennyfarthing-dist/personas/themes (24-2)
 * Returns sorted list of theme names
 */
export async function getAvailableThemes() {
    const projectDir = getProjectDirectory();
    if (!projectDir) {
        return ['alice-in-wonderland']; // Default fallback
    }
    try {
        const themesDir = join(projectDir, 'pennyfarthing-dist', 'personas', 'themes');
        const files = fs.readdirSync(themesDir);
        return files
            .filter(f => f.endsWith('.yaml'))
            .map(f => f.replace('.yaml', ''))
            .sort();
    }
    catch (err) {
        console.error('Failed to read themes directory:', err);
        return ['alice-in-wonderland']; // Default fallback
    }
}
/**
 * Load theme metadata from YAML files (24-5)
 * Parses all theme files and extracts metadata for the browser
 */
export async function loadThemeMetadata() {
    // Return cache if available
    if (themeMetadataCache) {
        return themeMetadataCache;
    }
    const projectDir = getProjectDirectory();
    if (!projectDir) {
        themeMetadataCache = [];
        return themeMetadataCache;
    }
    const metadata = [];
    try {
        const themesDir = join(projectDir, 'pennyfarthing-dist', 'personas', 'themes');
        const files = fs.readdirSync(themesDir).filter(f => f.endsWith('.yaml')).sort();
        // Dynamic import of yaml (already available in project)
        const { default: yaml } = await import('yaml');
        for (const file of files) {
            try {
                const filePath = join(themesDir, file);
                const content = fs.readFileSync(filePath, 'utf-8');
                const parsed = yaml.parse(content);
                if (parsed?.theme) {
                    const themeId = file.replace('.yaml', '');
                    const theme = parsed.theme;
                    const agentCount = parsed.agents ? Object.keys(parsed.agents).length : 0;
                    metadata.push({
                        id: themeId,
                        name: theme.name || themeId,
                        description: theme.description || '',
                        source: theme.source || '',
                        tier: theme.tier || 'U',
                        category: deriveCategory(themeId, theme.source || ''),
                        agentCount,
                    });
                }
            }
            catch (fileErr) {
                console.error(`Failed to parse theme file ${file}:`, fileErr);
            }
        }
        // Cache the results
        themeMetadataCache = metadata;
        return metadata;
    }
    catch (err) {
        console.error('Failed to load theme metadata:', err);
        themeMetadataCache = [];
        return themeMetadataCache;
    }
}
// Theme metadata with agents cache (24-6)
let themeMetadataWithAgentsCache = null;
/**
 * Load theme metadata including agent character mappings (24-6)
 * Extended version of loadThemeMetadata for the preview panel
 */
export async function loadThemeMetadataWithAgents() {
    // Return cache if available
    if (themeMetadataWithAgentsCache) {
        return themeMetadataWithAgentsCache;
    }
    const projectDir = getProjectDirectory();
    if (!projectDir) {
        themeMetadataWithAgentsCache = [];
        return themeMetadataWithAgentsCache;
    }
    const metadata = [];
    try {
        const themesDir = join(projectDir, 'pennyfarthing-dist', 'personas', 'themes');
        const files = fs.readdirSync(themesDir).filter(f => f.endsWith('.yaml')).sort();
        // Dynamic import of yaml (already available in project)
        const { default: yaml } = await import('yaml');
        for (const file of files) {
            try {
                const filePath = join(themesDir, file);
                const content = fs.readFileSync(filePath, 'utf-8');
                const parsed = yaml.parse(content);
                if (parsed?.theme) {
                    const themeId = file.replace('.yaml', '');
                    const theme = parsed.theme;
                    const rawAgents = parsed.agents || {};
                    const agentCount = Object.keys(rawAgents).length;
                    // Extract agent data for preview panel
                    const agents = {};
                    const coreRoles = ['sm', 'tea', 'dev', 'reviewer', 'architect', 'pm', 'orchestrator', 'tech-writer', 'ux-designer', 'devops'];
                    for (const role of coreRoles) {
                        const rawAgent = rawAgents[role];
                        if (rawAgent) {
                            agents[role] = {
                                character: rawAgent.character || '',
                                quote: rawAgent.quote || '',
                                style: rawAgent.style || '',
                                role: rawAgent.role || '',
                            };
                        }
                    }
                    metadata.push({
                        id: themeId,
                        name: theme.name || themeId,
                        description: theme.description || '',
                        source: theme.source || '',
                        tier: theme.tier || 'U',
                        category: deriveCategory(themeId, theme.source || ''),
                        agentCount,
                        agents,
                    });
                }
            }
            catch (fileErr) {
                console.error(`Failed to parse theme file ${file}:`, fileErr);
            }
        }
        // Cache the results
        themeMetadataWithAgentsCache = metadata;
        return metadata;
    }
    catch (err) {
        console.error('Failed to load theme metadata with agents:', err);
        themeMetadataWithAgentsCache = [];
        return themeMetadataWithAgentsCache;
    }
}
//# sourceMappingURL=theme-metadata.js.map