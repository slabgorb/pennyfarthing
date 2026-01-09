/**
 * Pennyfarthing Metadata Module
 *
 * Reads Pennyfarthing configuration and watches for agent changes.
 * Provides persona data for Cyclist UI integration.
 */
import { existsSync, readFileSync, readdirSync, statSync, watch } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
/**
 * Convert a name to a URL-safe slug (lowercase kebab-case)
 * Matches pennyfarthing showcase loader.ts logic
 */
function toSlug(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}
/**
 * Generate OCEAN suffix from scores (e.g., "54432" for O=5,C=4,E=4,A=3,N=2)
 * Matches pennyfarthing showcase loader.ts logic
 */
function oceanSuffix(ocean) {
    return `${ocean.O}${ocean.C}${ocean.E}${ocean.A}${ocean.N}`;
}
/**
 * Generate character slug from shortName and OCEAN scores
 * Format: {shortName-slug}-{OCEAN} (e.g., "yoda-54242")
 */
function generateSlug(shortName, ocean) {
    const baseSlug = toSlug(shortName);
    return `${baseSlug}-${oceanSuffix(ocean)}`;
}
/**
 * Detects if a directory is a Pennyfarthing-enabled project
 * Checks for Pennyfarthing-specific files, not just .claude/ directory
 * @param projectDir - The project directory to check
 * @returns true if Pennyfarthing is installed
 */
export function detectPennyfarthingProject(projectDir) {
    if (!projectDir)
        return false;
    const claudeDir = join(projectDir, '.claude');
    if (!existsSync(claudeDir))
        return false;
    // Check for Pennyfarthing-specific files
    // persona-config.yaml is the main indicator of Pennyfarthing installation
    const personaConfig = join(claudeDir, 'persona-config.yaml');
    if (existsSync(personaConfig))
        return true;
    // Also check for Pennyfarthing symlinks (agents, guides, personas, scripts)
    const pennyfarthingDirs = ['agents', 'guides', 'personas', 'scripts'];
    for (const dir of pennyfarthingDirs) {
        const dirPath = join(claudeDir, dir);
        if (existsSync(dirPath))
            return true;
    }
    return false;
}
/**
 * Loads theme configuration from persona-config.yaml
 * Prefers .local.yaml variant if it exists
 * @param projectDir - The project directory
 * @returns Theme config or null if not found/invalid
 */
export function loadThemeConfig(projectDir) {
    const localPath = join(projectDir, '.claude', 'persona-config.local.yaml');
    const defaultPath = join(projectDir, '.claude', 'persona-config.yaml');
    // Prefer local config
    const configPath = existsSync(localPath) ? localPath : defaultPath;
    if (!existsSync(configPath)) {
        return null;
    }
    try {
        const content = readFileSync(configPath, 'utf-8');
        const config = parseYaml(content);
        // Theme can be parsed as number (e.g., "1984"), coerce to string
        if (!config || config.theme === undefined || config.theme === null) {
            return null;
        }
        return { theme: String(config.theme) };
    }
    catch {
        return null;
    }
}
/**
 * Loads and parses a theme YAML file
 * @param themePath - Path to the theme YAML file
 * @returns Map of agent roles to Persona objects, or null if not found/invalid
 */
export function loadThemeYaml(themePath) {
    if (!existsSync(themePath)) {
        return null;
    }
    try {
        const content = readFileSync(themePath, 'utf-8');
        const theme = parseYaml(content);
        if (!theme || !theme.agents) {
            return null;
        }
        return theme.agents;
    }
    catch {
        return null;
    }
}
/**
 * Computes a display name map for all characters in a theme.
 * Finds the shortest unique identifier that distinguishes each character.
 *
 * Algorithm:
 * 1. Skip common prefixes/titles that don't help identification
 * 2. Try first word (most natural for single names: "Gandalf", "Socrates")
 * 3. If collision, try last word (surname: "Seaborn" vs "Lyman")
 * 4. If still collision, try first + last
 * 5. Fallback to full name
 *
 * @param agents - Map of agent roles to persona data
 * @returns Map of character full name to display name
 */
export function computeDisplayNames(agents) {
    const displayNames = new Map();
    // Common titles/prefixes to strip for comparison
    const skipPrefixes = [
        'the', 'dr.', 'dr', 'captain', 'admiral', 'colonel', 'lieutenant', 'commander',
        'president', 'lord', 'lady', 'sir', 'professor', 'inspector', 'sergeant',
        'mr.', 'mr', 'mrs.', 'mrs', 'miss', 'ms.', 'ms', 'chief', 'major', 'general'
    ];
    // Extract all character names
    const characters = Object.values(agents).map(a => a.character);
    /**
     * Tokenize a name into meaningful parts
     */
    function tokenize(name) {
        // Split on spaces, filter out common prefixes
        const words = name.split(/\s+/).filter(w => w.length > 0);
        const filtered = words.filter(w => !skipPrefixes.includes(w.toLowerCase()));
        return filtered.length > 0 ? filtered : words; // Fallback to all words if all filtered
    }
    /**
     * Check if a display name candidate is unique among all characters
     */
    function isUnique(candidate, exceptFor) {
        const candidateLower = candidate.toLowerCase();
        for (const char of characters) {
            if (char === exceptFor)
                continue;
            const tokens = tokenize(char);
            // Check if any token or combination matches the candidate
            if (tokens.some(t => t.toLowerCase() === candidateLower))
                return false;
            // Also check if full name contains it as a distinct part
            const charLower = char.toLowerCase();
            if (charLower.split(/\s+/).includes(candidateLower))
                return false;
        }
        return true;
    }
    /**
     * Find the best display name for a character
     */
    function findDisplayName(fullName) {
        const tokens = tokenize(fullName);
        // Single token? Use it
        if (tokens.length === 1) {
            return tokens[0];
        }
        // Strategy 1: Try first token (e.g., "Sam" from "Sam Seaborn")
        if (isUnique(tokens[0], fullName)) {
            return tokens[0];
        }
        // Strategy 2: Try last token (surname: "Seaborn" from "Sam Seaborn")
        const lastToken = tokens[tokens.length - 1];
        if (isUnique(lastToken, fullName)) {
            return lastToken;
        }
        // Strategy 3: Try first + last (e.g., "Leo McGarry" to distinguish from other McGarrys)
        if (tokens.length >= 2) {
            const firstLast = `${tokens[0]} ${lastToken}`;
            if (isUnique(firstLast, fullName)) {
                return firstLast;
            }
        }
        // Strategy 4: Use full name with common prefixes
        // This handles "The Situation Room" type names
        return fullName;
    }
    // Compute display name for each character
    for (const char of characters) {
        displayNames.set(char, findDisplayName(char));
    }
    return displayNames;
}
/**
 * Gets the current agent role from session files
 * @param projectDir - The project directory
 * @param sessionId - Optional session ID for session-specific lookup
 * @returns Agent role string or null if not found
 */
export function getCurrentAgent(projectDir, sessionId) {
    const agentsDir = join(projectDir, '.session', 'agents');
    if (!existsSync(agentsDir)) {
        return null;
    }
    if (sessionId) {
        // Session-specific lookup
        const sessionFile = join(agentsDir, sessionId);
        if (!existsSync(sessionFile)) {
            return null;
        }
        try {
            return readFileSync(sessionFile, 'utf-8').trim();
        }
        catch {
            return null;
        }
    }
    // Fallback: find most recently modified file
    try {
        const files = readdirSync(agentsDir);
        if (files.length === 0) {
            return null;
        }
        let mostRecent = null;
        for (const file of files) {
            const filePath = join(agentsDir, file);
            const stat = statSync(filePath);
            if (!mostRecent || stat.mtimeMs > mostRecent.mtime) {
                mostRecent = { file, mtime: stat.mtimeMs };
            }
        }
        if (!mostRecent) {
            return null;
        }
        return readFileSync(join(agentsDir, mostRecent.file), 'utf-8').trim();
    }
    catch {
        return null;
    }
}
/**
 * Gets the current persona data for the active agent
 * @param projectDir - The project directory
 * @param sessionId - Optional session ID for session-specific lookup
 * @returns Persona object or null if not available
 */
export function getCurrentPersona(projectDir, sessionId) {
    // Check if this is a Pennyfarthing project
    if (!detectPennyfarthingProject(projectDir)) {
        return null;
    }
    // Get theme configuration
    const config = loadThemeConfig(projectDir);
    if (!config) {
        return null;
    }
    // Find theme file path
    // Check multiple locations: .claude/personas/themes/, pennyfarthing-dist/personas/themes/
    const possiblePaths = [
        join(projectDir, '.claude', 'personas', 'themes', `${config.theme}.yaml`),
        join(projectDir, '.claude', 'pennyfarthing', 'themes', `${config.theme}.yaml`),
        join(projectDir, 'pennyfarthing-dist', 'personas', 'themes', `${config.theme}.yaml`),
    ];
    // Use CYCLIST_THEME_PATH env var if available
    const envThemePath = process.env.CYCLIST_THEME_PATH;
    if (envThemePath) {
        possiblePaths.unshift(envThemePath);
    }
    let themePath = null;
    for (const path of possiblePaths) {
        if (existsSync(path)) {
            themePath = path;
            break;
        }
    }
    if (!themePath) {
        return null;
    }
    // Load theme
    const agents = loadThemeYaml(themePath);
    if (!agents) {
        return null;
    }
    // Get current agent
    const agentRole = getCurrentAgent(projectDir, sessionId);
    if (!agentRole) {
        return null;
    }
    // Get persona for agent role
    const persona = agents[agentRole];
    if (!persona) {
        return null;
    }
    // Use shortName from YAML if available, otherwise compute dynamically as fallback
    let displayName = persona.shortName;
    const shortName = displayName || persona.character.split(' ')[0];
    if (!displayName) {
        const displayNames = computeDisplayNames(agents);
        displayName = displayNames.get(persona.character) || persona.character;
    }
    // Generate slug for portrait path (e.g., "yoda-54242")
    const slug = persona.ocean ? generateSlug(shortName, persona.ocean) : agentRole;
    // Extract helper info if available
    const helper = persona.helper;
    return {
        character: persona.character,
        displayName,
        role: agentRole, // Agent role like "sm", "dev"
        roleDescription: persona.role, // Character's role description from theme
        style: persona.style,
        theme: config.theme,
        slug, // Character slug for portrait path
        quote: persona.quote,
        helper: helper || undefined, // Helper/subagent info (e.g., "The Fellowship")
        ocean: persona.ocean,
    };
}
/**
 * Gets full persona details including voice, quirks, background for popup display
 * @param projectDir - The project directory
 * @param sessionId - Optional session ID for session-specific lookup
 * @returns FullPersonaDetails object or null if not available
 */
export function getFullPersonaDetails(projectDir, sessionId) {
    // Check if this is a Pennyfarthing project
    if (!detectPennyfarthingProject(projectDir)) {
        return null;
    }
    // Get theme configuration
    const config = loadThemeConfig(projectDir);
    if (!config) {
        return null;
    }
    // Find theme file path
    const possiblePaths = [
        join(projectDir, '.claude', 'personas', 'themes', `${config.theme}.yaml`),
        join(projectDir, '.claude', 'pennyfarthing', 'themes', `${config.theme}.yaml`),
        join(projectDir, 'pennyfarthing-dist', 'personas', 'themes', `${config.theme}.yaml`),
    ];
    const envThemePath = process.env.CYCLIST_THEME_PATH;
    if (envThemePath) {
        possiblePaths.unshift(envThemePath);
    }
    let themePath = null;
    for (const path of possiblePaths) {
        if (existsSync(path)) {
            themePath = path;
            break;
        }
    }
    if (!themePath) {
        return null;
    }
    // Load full theme YAML (not just the processed agents)
    let themeData;
    try {
        const content = readFileSync(themePath, 'utf-8');
        themeData = parseYaml(content);
    }
    catch {
        return null;
    }
    const agents = themeData.agents;
    if (!agents) {
        return null;
    }
    // Get current agent
    const agentRole = getCurrentAgent(projectDir, sessionId);
    if (!agentRole) {
        return null;
    }
    // Get raw persona data for agent role
    const rawPersona = agents[agentRole];
    if (!rawPersona) {
        return null;
    }
    // Get the basic persona first
    const basicPersona = getCurrentPersona(projectDir, sessionId);
    if (!basicPersona) {
        return null;
    }
    // Build role mapping string
    const roleMapping = `${agentRole.toUpperCase()} → ${basicPersona.character}`;
    // Extract additional fields from raw theme data
    const voice = rawPersona.voice;
    const quirks = rawPersona.quirks;
    const background = rawPersona.role; // "role" in theme is the character background
    const expertise = rawPersona.expertise;
    const catchphrases = rawPersona.catchphrases;
    const visual = rawPersona.visual;
    return {
        ...basicPersona,
        voice,
        quirks,
        background,
        roleMapping,
        expertise,
        catchphrases,
        visual,
    };
}
/**
 * Watches for agent changes and invokes callback when agent changes
 * @param projectDir - The project directory
 * @param sessionId - Optional session ID for session-specific watching
 * @param callback - Callback invoked with new agent role when change detected
 * @returns Cleanup function to stop watching
 */
export function watchAgentChanges(projectDir, sessionId, callback) {
    const agentsDir = join(projectDir, '.session', 'agents');
    if (!existsSync(agentsDir)) {
        // Return no-op cleanup if directory doesn't exist
        return () => { };
    }
    let watcher;
    if (sessionId) {
        // Watch specific session file
        const sessionFile = join(agentsDir, sessionId);
        watcher = watch(sessionFile, (_eventType, _filename) => {
            try {
                const agentRole = readFileSync(sessionFile, 'utf-8').trim();
                callback(agentRole);
            }
            catch {
                // File might be deleted or unreadable
            }
        });
    }
    else {
        // Watch entire agents directory
        watcher = watch(agentsDir, { recursive: true }, (_eventType, _filename) => {
            // Re-detect the most recent agent
            const agentRole = getCurrentAgent(projectDir);
            if (agentRole) {
                callback(agentRole);
            }
        });
    }
    // Return cleanup function
    return () => {
        watcher.close();
    };
}
//# sourceMappingURL=pennyfarthing.js.map