/**
 * Pennyfarthing Metadata Module
 *
 * Reads Pennyfarthing configuration and watches for agent changes.
 * Provides persona data for Cyclist UI integration.
 */

import { existsSync, readFileSync, readdirSync, statSync, watch, FSWatcher } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// For dev mode: path to pennyfarthing-2 root relative to this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CYCLIST_ROOT = join(__dirname, '..', '..', '..'); // packages/cyclist/src -> pennyfarthing-2
import { parse as parseYaml } from 'yaml';

/**
 * Helper data structure for agent helpers/subagents
 */
export interface Helper {
  name: string;
  style?: string;
}

/**
 * Persona data structure for agent personas
 */
export interface Persona {
  character: string;
  displayName: string;  // Shortest unique identifier for this character
  role: string;         // Agent role like "sm", "dev", "tea"
  roleDescription: string;  // Character's role in the theme (e.g., "The conscience of the Pequod...")
  style: string;
  theme: string;
  slug: string;         // Character slug for portrait path (e.g., "yoda-54242")
  quote?: string;
  helper?: Helper;      // Helper/subagent info from theme (e.g., "The Fellowship")
  ocean?: {
    O: number;
    C: number;
    E: number;
    A: number;
    N: number;
  };
}

/**
 * Full persona details for popup display
 * Extends basic Persona with voice, quirks, background from theme file
 */
export interface FullPersonaDetails extends Persona {
  voice?: string;
  quirks?: string[];
  background?: string;
  roleMapping: string;  // e.g., "SM → Hawkeye Pierce"
  expertise?: string;
  catchphrases?: string[];
  visual?: string;
}

/**
 * Theme configuration from persona-config.yaml
 */
interface ThemeConfig {
  theme: string;
}

/**
 * Select a random catchphrase from an array, with fallback logic
 * Story MSSCI-12473: Random catchphrase on agent activation
 *
 * @param catchphrases - Array of catchphrases (may be undefined/null/empty)
 * @param fallbackQuote - Fallback quote to use if catchphrases unavailable
 * @returns Selected catchphrase, fallback quote, or empty string
 */
export function selectCatchphrase(
  catchphrases: string[] | undefined | null,
  fallbackQuote: string | undefined | null
): string {
  // AC3: Falls back to quote field if catchphrases missing or empty
  if (!catchphrases || catchphrases.length === 0) {
    return fallbackQuote ?? '';
  }

  // AC2: Falls back to first catchphrase if array has one item
  if (catchphrases.length === 1) {
    return catchphrases[0];
  }

  // AC1: Random catchphrase selected from array
  const randomIndex = Math.floor(Math.random() * catchphrases.length);
  return catchphrases[randomIndex];
}

/**
 * Convert a name to a URL-safe slug (lowercase kebab-case)
 * Matches pennyfarthing showcase loader.ts logic
 */
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Generate OCEAN suffix from scores (e.g., "54432" for O=5,C=4,E=4,A=3,N=2)
 * Matches pennyfarthing showcase loader.ts logic
 */
function oceanSuffix(ocean: { O: number; C: number; E: number; A: number; N: number }): string {
  return `${ocean.O}${ocean.C}${ocean.E}${ocean.A}${ocean.N}`;
}

/**
 * Generate character slug from shortName and OCEAN scores
 * Format: {shortName-slug}-{OCEAN} (e.g., "yoda-54242")
 */
function generateSlug(shortName: string, ocean: { O: number; C: number; E: number; A: number; N: number }): string {
  const baseSlug = toSlug(shortName);
  return `${baseSlug}-${oceanSuffix(ocean)}`;
}

/**
 * Detects if a directory is a Pennyfarthing-enabled project
 * Checks for Pennyfarthing-specific files, not just .claude/ directory
 * @param projectDir - The project directory to check
 * @returns true if Pennyfarthing is installed
 */
export function detectPennyfarthingProject(projectDir: string): boolean {
  if (!projectDir) return false;

  // Check for .pennyfarthing directory (new preferred location)
  const pennyfarthingDir = join(projectDir, '.pennyfarthing');
  if (existsSync(pennyfarthingDir)) {
    // Check for config file
    const configFile = join(pennyfarthingDir, 'config.local.yaml');
    if (existsSync(configFile)) return true;

    // Check for Pennyfarthing symlinks (agents, guides, personas, scripts)
    const pennyfarthingDirs = ['agents', 'guides', 'personas', 'scripts'];
    for (const dir of pennyfarthingDirs) {
      const dirPath = join(pennyfarthingDir, dir);
      if (existsSync(dirPath)) return true;
    }
  }

  // Legacy: Check .claude directory
  const claudeDir = join(projectDir, '.claude');
  if (!existsSync(claudeDir)) return false;

  // Check for Pennyfarthing-specific files
  // persona-config.yaml is the main indicator of Pennyfarthing installation
  const personaConfig = join(claudeDir, 'persona-config.yaml');
  if (existsSync(personaConfig)) return true;

  // Also check for Pennyfarthing symlinks (agents, guides, personas, scripts)
  const legacyDirs = ['agents', 'guides', 'personas', 'scripts'];
  for (const dir of legacyDirs) {
    const dirPath = join(claudeDir, dir);
    if (existsSync(dirPath)) return true;
  }

  return false;
}

/**
 * Loads theme configuration from .pennyfarthing/config.local.yaml
 * @param projectDir - The project directory
 * @returns Theme config or null if not found/invalid
 */
export function loadThemeConfig(projectDir: string): ThemeConfig | null {
  const configPath = join(projectDir, '.pennyfarthing', 'config.local.yaml');

  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const config = parseYaml(content) as { theme?: string | number };
    // Theme can be parsed as number (e.g., "1984"), coerce to string
    if (!config || config.theme === undefined || config.theme === null) {
      return null;
    }
    return { theme: String(config.theme) };
  } catch {
    return null;
  }
}

/**
 * Loads and parses a theme YAML file
 * @param themePath - Path to the theme YAML file
 * @returns Map of agent roles to Persona objects, or null if not found/invalid
 */
export function loadThemeYaml(themePath: string): Record<string, Persona> | null {
  if (!existsSync(themePath)) {
    return null;
  }

  try {
    const content = readFileSync(themePath, 'utf-8');
    const theme = parseYaml(content) as { agents?: Record<string, Persona> };
    if (!theme || !theme.agents) {
      return null;
    }
    return theme.agents;
  } catch {
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
export function computeDisplayNames(agents: Record<string, { character: string }>): Map<string, string> {
  const displayNames = new Map<string, string>();

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
  function tokenize(name: string): string[] {
    // Split on spaces, filter out common prefixes
    const words = name.split(/\s+/).filter(w => w.length > 0);
    const filtered = words.filter(w => !skipPrefixes.includes(w.toLowerCase()));
    return filtered.length > 0 ? filtered : words; // Fallback to all words if all filtered
  }

  /**
   * Check if a display name candidate is unique among all characters
   */
  function isUnique(candidate: string, exceptFor: string): boolean {
    const candidateLower = candidate.toLowerCase();
    for (const char of characters) {
      if (char === exceptFor) continue;
      const tokens = tokenize(char);
      // Check if any token or combination matches the candidate
      if (tokens.some(t => t.toLowerCase() === candidateLower)) return false;
      // Also check if full name contains it as a distinct part
      const charLower = char.toLowerCase();
      if (charLower.split(/\s+/).includes(candidateLower)) return false;
    }
    return true;
  }

  /**
   * Find the best display name for a character
   */
  function findDisplayName(fullName: string): string {
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
export function getCurrentAgent(projectDir: string, sessionId?: string): string | null {
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
    } catch {
      return null;
    }
  }

  // Fallback: find most recently modified file
  try {
    const files = readdirSync(agentsDir);
    if (files.length === 0) {
      return null;
    }

    let mostRecent: { file: string; mtime: number } | null = null;
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
  } catch {
    return null;
  }
}

/**
 * Gets the current persona data for the active agent
 * @param projectDir - The project directory
 * @param sessionId - Optional session ID for session-specific lookup
 * @returns Persona object or null if not available
 */
export function getCurrentPersona(projectDir: string, sessionId?: string): Persona | null {
  // Check if this is a Pennyfarthing project
  if (!detectPennyfarthingProject(projectDir)) {
    return null;
  }

  // Get theme configuration
  const config = loadThemeConfig(projectDir);
  if (!config) {
    return null;
  }

  // Find theme file path - three sources of truth:
  // 1. Packaged Electron app: Contents/Resources/pennyfarthing-dist
  // 2. Consumer project: .pennyfarthing/personas/themes (after pf setup)
  // 3. Dev/dogfooding: monorepo pennyfarthing-dist
  const themeFile = `${config.theme}.yaml`;

  let themePath: string | null = null;

  // Packaged app takes priority
  if (process.resourcesPath) {
    const bundledPath = join(process.resourcesPath, 'pennyfarthing-dist', 'personas', 'themes', themeFile);
    if (existsSync(bundledPath)) {
      themePath = bundledPath;
    }
  }

  // Consumer project fallback (.pennyfarthing/)
  if (!themePath) {
    const consumerPath = join(projectDir, '.pennyfarthing', 'personas', 'themes', themeFile);
    if (existsSync(consumerPath)) {
      themePath = consumerPath;
    }
  }

  // Dev/dogfooding fallback (pennyfarthing-dist/)
  if (!themePath) {
    const devPath = join(CYCLIST_ROOT, 'pennyfarthing-dist', 'personas', 'themes', themeFile);
    if (existsSync(devPath)) {
      themePath = devPath;
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

  // Get current agent (with fallback for standalone app)
  let agentRole = getCurrentAgent(projectDir, sessionId);
  if (!agentRole) {
    // Fallback: use 'orchestrator' or first available agent for standalone mode
    if (agents['orchestrator']) {
      agentRole = 'orchestrator';
    } else {
      const availableRoles = Object.keys(agents);
      if (availableRoles.length === 0) {
        return null;
      }
      agentRole = availableRoles[0];
    }
  }

  // Get persona for agent role
  const persona = agents[agentRole];
  if (!persona) {
    return null;
  }

  // Use shortName from YAML if available, otherwise compute dynamically as fallback
  let displayName = (persona as { shortName?: string }).shortName;
  const shortName = displayName || persona.character.split(' ')[0];
  if (!displayName) {
    const displayNames = computeDisplayNames(agents);
    displayName = displayNames.get(persona.character) || persona.character;
  }

  // Generate slug for portrait path (e.g., "yoda-54242")
  const slug = persona.ocean ? generateSlug(shortName, persona.ocean) : agentRole;

  // Extract helper info if available
  const helper = (persona as { helper?: Helper }).helper;

  // MSSCI-12473: Extract catchphrases and select random one, with fallback to quote
  const catchphrases = (persona as { catchphrases?: string[] }).catchphrases;
  const selectedQuote = selectCatchphrase(catchphrases, persona.quote);

  return {
    character: persona.character,
    displayName,
    role: agentRole,  // Agent role like "sm", "dev"
    roleDescription: persona.role,  // Character's role description from theme
    style: persona.style,
    theme: config.theme,
    slug,  // Character slug for portrait path
    quote: selectedQuote,  // MSSCI-12473: Random catchphrase or fallback quote
    helper: helper || undefined,  // Helper/subagent info (e.g., "The Fellowship")
    ocean: persona.ocean,
  };
}

/**
 * Gets full persona details including voice, quirks, background for popup display
 * @param projectDir - The project directory
 * @param sessionId - Optional session ID for session-specific lookup
 * @returns FullPersonaDetails object or null if not available
 */
export function getFullPersonaDetails(projectDir: string, sessionId?: string): FullPersonaDetails | null {
  // Check if this is a Pennyfarthing project
  if (!detectPennyfarthingProject(projectDir)) {
    return null;
  }

  // Get theme configuration
  const config = loadThemeConfig(projectDir);
  if (!config) {
    return null;
  }

  // Find theme file path - three sources of truth:
  // 1. Packaged Electron app: Contents/Resources/pennyfarthing-dist
  // 2. Consumer project: .pennyfarthing/personas/themes (after pf setup)
  // 3. Dev/dogfooding: monorepo pennyfarthing-dist
  const themeFile = `${config.theme}.yaml`;

  let themePath: string | null = null;

  // Packaged app takes priority
  if (process.resourcesPath) {
    const bundledPath = join(process.resourcesPath, 'pennyfarthing-dist', 'personas', 'themes', themeFile);
    if (existsSync(bundledPath)) {
      themePath = bundledPath;
    }
  }

  // Consumer project fallback (.pennyfarthing/)
  if (!themePath) {
    const consumerPath = join(projectDir, '.pennyfarthing', 'personas', 'themes', themeFile);
    if (existsSync(consumerPath)) {
      themePath = consumerPath;
    }
  }

  // Dev/dogfooding fallback (pennyfarthing-dist/)
  if (!themePath) {
    const devPath = join(CYCLIST_ROOT, 'pennyfarthing-dist', 'personas', 'themes', themeFile);
    if (existsSync(devPath)) {
      themePath = devPath;
    }
  }

  if (!themePath) {
    return null;
  }

  // Load full theme YAML (not just the processed agents)
  let themeData: Record<string, unknown>;
  try {
    const content = readFileSync(themePath, 'utf-8');
    themeData = parseYaml(content) as Record<string, unknown>;
  } catch {
    return null;
  }

  const agents = themeData.agents as Record<string, Record<string, unknown>> | undefined;
  if (!agents) {
    return null;
  }

  // Get current agent (with fallback for standalone app)
  let agentRole = getCurrentAgent(projectDir, sessionId);
  if (!agentRole) {
    // Fallback: use 'orchestrator' or first available agent for standalone mode
    if (agents['orchestrator']) {
      agentRole = 'orchestrator';
    } else {
      const availableRoles = Object.keys(agents);
      if (availableRoles.length === 0) {
        return null;
      }
      agentRole = availableRoles[0];
    }
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
  const voice = rawPersona.voice as string | undefined;
  const quirks = rawPersona.quirks as string[] | undefined;
  const background = rawPersona.role as string | undefined; // "role" in theme is the character background
  const expertise = rawPersona.expertise as string | undefined;
  const catchphrases = rawPersona.catchphrases as string[] | undefined;
  const visual = rawPersona.visual as string | undefined;

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
export function watchAgentChanges(
  projectDir: string,
  sessionId: string | undefined,
  callback: (agentRole: string) => void
): () => void {
  const agentsDir = join(projectDir, '.session', 'agents');

  if (!existsSync(agentsDir)) {
    // Return no-op cleanup if directory doesn't exist
    return () => {};
  }

  let watcher: FSWatcher;

  if (sessionId) {
    // Watch specific session file
    const sessionFile = join(agentsDir, sessionId);
    watcher = watch(sessionFile, (_eventType, _filename) => {
      try {
        const agentRole = readFileSync(sessionFile, 'utf-8').trim();
        callback(agentRole);
      } catch {
        // File might be deleted or unreadable
      }
    });
  } else {
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
