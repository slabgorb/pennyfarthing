/**
 * Pennyfarthing detection and persona resolution for server module.
 * Extracted from packages/cyclist/src/pennyfarthing.ts (Story 98-17).
 */

import { existsSync, readFileSync, readdirSync, statSync, watch, type FSWatcher } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';
import { resolvePennyfarthingDist } from '../shared/portrait-resolver.js';

// Electron adds resourcesPath to process; not in Node.js types
const electronResourcesPath = (process as unknown as { resourcesPath?: string }).resourcesPath;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_ROOT = join(__dirname, '..', '..', '..'); // packages/core/src/server -> pennyfarthing root

export interface Helper {
  name: string;
  style?: string;
}

export interface Persona {
  character: string;
  displayName: string;
  role: string;
  roleDescription: string;
  style: string;
  theme: string;
  slug: string;
  quote?: string;
  helper?: Helper;
  ocean?: {
    O: number;
    C: number;
    E: number;
    A: number;
    N: number;
  };
}

interface ThemeConfig {
  theme: string;
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function oceanSuffix(ocean: { O: number; C: number; E: number; A: number; N: number }): string {
  return `${ocean.O}${ocean.C}${ocean.E}${ocean.A}${ocean.N}`;
}

function generateSlug(shortName: string, ocean: { O: number; C: number; E: number; A: number; N: number }): string {
  return `${toSlug(shortName)}-${oceanSuffix(ocean)}`;
}

/**
 * Detects if a directory is a Pennyfarthing-enabled project
 */
export function detectPennyfarthingProject(projectDir: string): boolean {
  if (!projectDir) return false;

  const pennyfarthingDir = join(projectDir, '.pennyfarthing');
  if (existsSync(pennyfarthingDir)) {
    const configFile = join(pennyfarthingDir, 'config.local.yaml');
    if (existsSync(configFile)) return true;

    const pennyfarthingDirs = ['agents', 'guides', 'personas', 'scripts'];
    for (const dir of pennyfarthingDirs) {
      if (existsSync(join(pennyfarthingDir, dir))) return true;
    }
  }

  // Legacy: Check .claude directory
  const claudeDir = join(projectDir, '.claude');
  if (!existsSync(claudeDir)) return false;

  const personaConfig = join(claudeDir, 'persona-config.yaml');
  if (existsSync(personaConfig)) return true;

  const legacyDirs = ['agents', 'guides', 'personas', 'scripts'];
  for (const dir of legacyDirs) {
    if (existsSync(join(claudeDir, dir))) return true;
  }

  return false;
}

/**
 * Loads theme configuration from .pennyfarthing/config.local.yaml
 */
export function loadThemeConfig(projectDir: string): ThemeConfig | null {
  const configPath = join(projectDir, '.pennyfarthing', 'config.local.yaml');

  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const config = parseYaml(content) as { theme?: string | number };
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

function getCurrentAgent(projectDir: string, sessionId?: string): string | null {
  const agentsDir = join(projectDir, '.session', 'agents');

  if (!existsSync(agentsDir)) {
    return null;
  }

  if (sessionId) {
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

  try {
    const files = readdirSync(agentsDir);
    if (files.length === 0) return null;

    let mostRecent: { file: string; mtime: number } | null = null;
    for (const file of files) {
      const filePath = join(agentsDir, file);
      const stat = statSync(filePath);
      if (!mostRecent || stat.mtimeMs > mostRecent.mtime) {
        mostRecent = { file, mtime: stat.mtimeMs };
      }
    }

    if (!mostRecent) return null;
    return readFileSync(join(agentsDir, mostRecent.file), 'utf-8').trim();
  } catch {
    return null;
  }
}

function computeDisplayNames(agents: Record<string, { character: string }>): Map<string, string> {
  const displayNames = new Map<string, string>();
  const skipPrefixes = [
    'the', 'dr.', 'dr', 'captain', 'admiral', 'colonel', 'lieutenant', 'commander',
    'president', 'lord', 'lady', 'sir', 'professor', 'inspector', 'sergeant',
    'mr.', 'mr', 'mrs.', 'mrs', 'miss', 'ms.', 'ms', 'chief', 'major', 'general'
  ];
  const characters = Object.values(agents).map(a => a.character);

  function tokenize(name: string): string[] {
    const words = name.split(/\s+/).filter(w => w.length > 0);
    const filtered = words.filter(w => !skipPrefixes.includes(w.toLowerCase()));
    return filtered.length > 0 ? filtered : words;
  }

  function isUnique(candidate: string, exceptFor: string): boolean {
    const candidateLower = candidate.toLowerCase();
    for (const char of characters) {
      if (char === exceptFor) continue;
      const tokens = tokenize(char);
      if (tokens.some(t => t.toLowerCase() === candidateLower)) return false;
      if (char.toLowerCase().split(/\s+/).includes(candidateLower)) return false;
    }
    return true;
  }

  function findDisplayName(fullName: string): string {
    const tokens = tokenize(fullName);
    if (tokens.length === 1) return tokens[0];
    if (isUnique(tokens[0], fullName)) return tokens[0];
    const lastToken = tokens[tokens.length - 1];
    if (isUnique(lastToken, fullName)) return lastToken;
    if (tokens.length >= 2) {
      const firstLast = `${tokens[0]} ${lastToken}`;
      if (isUnique(firstLast, fullName)) return firstLast;
    }
    return fullName;
  }

  for (const char of characters) {
    displayNames.set(char, findDisplayName(char));
  }

  return displayNames;
}

export function selectCatchphrase(
  catchphrases: string[] | undefined | null,
  fallbackQuote: string | undefined | null
): string {
  if (!catchphrases || catchphrases.length === 0) return fallbackQuote ?? '';
  if (catchphrases.length === 1) return catchphrases[0];
  return catchphrases[Math.floor(Math.random() * catchphrases.length)];
}

/**
 * Gets the current persona data for the active agent
 */
export function getCurrentPersona(projectDir: string, sessionId?: string): Persona | null {
  if (!detectPennyfarthingProject(projectDir)) return null;

  const config = loadThemeConfig(projectDir);
  if (!config) return null;

  const themeFile = `${config.theme}.yaml`;
  let themePath: string | null = null;

  if (electronResourcesPath) {
    const bundledPath = join(electronResourcesPath, 'pennyfarthing-dist', 'personas', 'themes', themeFile);
    if (existsSync(bundledPath)) themePath = bundledPath;
  }

  if (!themePath) {
    const consumerPath = join(projectDir, '.pennyfarthing', 'personas', 'themes', themeFile);
    if (existsSync(consumerPath)) themePath = consumerPath;
  }

  if (!themePath) {
    const devPath = join(PACKAGE_ROOT, 'pennyfarthing-dist', 'personas', 'themes', themeFile);
    if (existsSync(devPath)) themePath = devPath;
  }

  if (!themePath) return null;

  const agents = loadThemeYaml(themePath);
  if (!agents) return null;

  let agentRole = getCurrentAgent(projectDir, sessionId);
  if (!agentRole) {
    if (agents['orchestrator']) {
      agentRole = 'orchestrator';
    } else {
      const availableRoles = Object.keys(agents);
      if (availableRoles.length === 0) return null;
      agentRole = availableRoles[0];
    }
  }

  const persona = agents[agentRole];
  if (!persona) return null;

  let displayName = (persona as { shortName?: string }).shortName;
  const shortName = displayName || persona.character.split(' ')[0];
  if (!displayName) {
    const displayNames = computeDisplayNames(agents);
    displayName = displayNames.get(persona.character) || persona.character;
  }

  const slug = persona.ocean ? generateSlug(shortName, persona.ocean) : agentRole;
  const helper = (persona as { helper?: Helper }).helper;
  const catchphrases = (persona as { catchphrases?: string[] }).catchphrases;
  const selectedQuote = selectCatchphrase(catchphrases, persona.quote);

  return {
    character: persona.character,
    displayName,
    role: agentRole,
    roleDescription: persona.role,
    style: persona.style,
    theme: config.theme,
    slug,
    quote: selectedQuote,
    helper: helper || undefined,
    ocean: persona.ocean,
  };
}

/**
 * Gets full persona details including voice, quirks, background for popup display
 */
export function getFullPersonaDetails(projectDir: string, sessionId?: string): unknown {
  if (!detectPennyfarthingProject(projectDir)) return null;
  const config = loadThemeConfig(projectDir);
  if (!config) return null;

  const themeFile = `${config.theme}.yaml`;
  let themePath: string | null = null;

  if (electronResourcesPath) {
    const bundledPath = join(electronResourcesPath, 'pennyfarthing-dist', 'personas', 'themes', themeFile);
    if (existsSync(bundledPath)) themePath = bundledPath;
  }
  if (!themePath) {
    const consumerPath = join(projectDir, '.pennyfarthing', 'personas', 'themes', themeFile);
    if (existsSync(consumerPath)) themePath = consumerPath;
  }
  if (!themePath) {
    const devPath = join(PACKAGE_ROOT, 'pennyfarthing-dist', 'personas', 'themes', themeFile);
    if (existsSync(devPath)) themePath = devPath;
  }
  if (!themePath) return null;

  let themeData: Record<string, unknown>;
  try {
    const content = readFileSync(themePath, 'utf-8');
    themeData = parseYaml(content) as Record<string, unknown>;
  } catch {
    return null;
  }

  const agents = themeData.agents as Record<string, Record<string, unknown>> | undefined;
  if (!agents) return null;

  let agentRole = getCurrentAgent(projectDir, sessionId);
  if (!agentRole) {
    if (agents['orchestrator']) agentRole = 'orchestrator';
    else {
      const availableRoles = Object.keys(agents);
      if (availableRoles.length === 0) return null;
      agentRole = availableRoles[0];
    }
  }

  const rawPersona = agents[agentRole];
  if (!rawPersona) return null;

  const basicPersona = getCurrentPersona(projectDir, sessionId);
  if (!basicPersona) return null;

  return {
    ...basicPersona,
    voice: rawPersona.voice as string | undefined,
    quirks: rawPersona.quirks as string[] | undefined,
    background: rawPersona.role as string | undefined,
    roleMapping: `${agentRole.toUpperCase()} → ${basicPersona.character}`,
    expertise: rawPersona.expertise as string | undefined,
    catchphrases: rawPersona.catchphrases as string[] | undefined,
    visual: rawPersona.visual as string | undefined,
  };
}

/**
 * Watches for agent changes and invokes callback when agent changes
 */
export function watchAgentChanges(
  projectDir: string,
  sessionId: string | undefined,
  callback: (agentRole: string) => void
): () => void {
  const agentsDir = join(projectDir, '.session', 'agents');

  if (!existsSync(agentsDir)) {
    return () => {};
  }

  let watcher: FSWatcher;

  if (sessionId) {
    const sessionFile = join(agentsDir, sessionId);
    watcher = watch(sessionFile, () => {
      try {
        const agentRole = readFileSync(sessionFile, 'utf-8').trim();
        callback(agentRole);
      } catch {
        // File might be deleted or unreadable
      }
    });
  } else {
    watcher = watch(agentsDir, { recursive: true }, () => {
      const agentRole = getCurrentAgent(projectDir);
      if (agentRole) {
        callback(agentRole);
      }
    });
  }

  return () => {
    watcher.close();
  };
}

/**
 * Resolve the framework package root using multi-strategy discovery.
 * Story 136-2 AC5: Replace hardcoded `join(__dirname, '..', '..', '..')`
 * with `resolvePennyfarthingDist()` from portrait-resolver.
 *
 * Falls back to __dirname traversal only when resolution returns null.
 */
export function resolvePackageRoot(): string {
  const distPath = resolvePennyfarthingDist();
  if (distPath) {
    return dirname(distPath);
  }
  // Fallback to __dirname traversal when resolution returns null
  return PACKAGE_ROOT;
}
