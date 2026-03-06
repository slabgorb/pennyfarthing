/**
 * Pennyfarthing detection and persona resolution for server module.
 * Story 141-17: Refactored to use child_process subprocess delegation via pf CLI.
 */

import { existsSync, readFileSync, readdirSync, statSync, watch, type FSWatcher } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { resolvePennyfarthingDist } from '../shared/portrait-resolver.js';
import { callPf, PfCache, toSlug, oceanSuffix, generateSlug } from '../shared/pf-cli.js';

// Electron adds resourcesPath to process; not in Node.js types
const _electronResourcesPath = (process as unknown as { resourcesPath?: string }).resourcesPath;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_ROOT = join(__dirname, '..', '..', '..'); // packages/core/src/server -> pennyfarthing root

// Cache for CLI results with 30_000ms TTL fallback
const cache = new PfCache(30_000);

// Re-export slug utilities for consumers
export { toSlug, oceanSuffix, generateSlug };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Result helpers: { success: true, data } / { success: false, error }
// ---------------------------------------------------------------------------

function _personaSuccess(data: Persona): { success: true; data: Persona } {
  return { success: true, data };
}

function _personaFailure(error: string): { success: false; error: string } {
  return { success: false, error };
}

// ---------------------------------------------------------------------------
// Project detection (existsSync-based — no file parsing needed)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Theme config loading — simple regex extraction (no YAML parser)
// ---------------------------------------------------------------------------

/**
 * Loads theme configuration from .pennyfarthing/config.local.yaml
 */
export function loadThemeConfig(projectDir: string): ThemeConfig | null {
  const cached = cache.get<ThemeConfig>('themeConfig');
  if (cached) return cached;

  const configPath = join(projectDir, '.pennyfarthing', 'config.local.yaml');
  try {
    const content = readFileSync(configPath, 'utf-8');
    const match = content.match(/^theme:\s*(.+)$/m);
    if (!match) return null;
    const theme = match[1].trim().replace(/^['"]|['"]$/g, '');
    const config: ThemeConfig = { theme };
    cache.set('themeConfig', config);
    return config;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Theme YAML loading via pf CLI
// ---------------------------------------------------------------------------

/**
 * Loads and parses a theme YAML file via pf CLI subprocess
 */
export function loadThemeYaml(themePath: string): Record<string, Persona> | null {
  const themeName = basename(themePath, '.yaml');
  const r = callPf<{ agents?: Record<string, Persona> }>(['theme', 'show', themeName, '--json']);
  if (!r.success || !r.data?.agents) return null;
  return r.data.agents;
}

// ---------------------------------------------------------------------------
// Agent resolution
// ---------------------------------------------------------------------------

function getCurrentAgent(projectDir: string, sessionId?: string): string | null {
  if (sessionId) {
    const sessionFile = join(projectDir, '.session', 'agents', sessionId);
    try {
      return readFileSync(sessionFile, 'utf-8').trim();
    } catch {
      return null;
    }
  }

  // Fallback: find the most recently modified agent file in .session/agents/
  const agentsDir = join(projectDir, '.session', 'agents');
  if (existsSync(agentsDir)) {
    try {
      const files = readdirSync(agentsDir);
      let newest: { name: string; mtime: number } | null = null;
      for (const f of files) {
        const fp = join(agentsDir, f);
        const st = statSync(fp);
        if (!newest || st.mtimeMs > newest.mtime) {
          newest = { name: f, mtime: st.mtimeMs };
        }
      }
      if (newest) {
        const agent = readFileSync(join(agentsDir, newest.name), 'utf-8').trim();
        if (agent) return agent;
      }
    } catch {
      // fall through to pf CLI
    }
  }

  // Delegate to pf CLI for agent discovery
  const r = callPf<{ phase_owner?: string }>(['workflow', 'check', '--json'], projectDir);
  if (r.success && r.data?.phase_owner) {
    return r.data.phase_owner;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Display name computation (pure function)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Catchphrase selection (pure function)
// ---------------------------------------------------------------------------

export function selectCatchphrase(
  catchphrases: string[] | undefined | null,
  fallbackQuote: string | undefined | null
): string {
  if (!catchphrases || catchphrases.length === 0) return fallbackQuote ?? '';
  if (catchphrases.length === 1) return catchphrases[0];
  return catchphrases[Math.floor(Math.random() * catchphrases.length)];
}

// ---------------------------------------------------------------------------
// Persona resolution — delegates theme loading to pf CLI
// ---------------------------------------------------------------------------

/**
 * Gets the current persona data for the active agent
 */
export function getCurrentPersona(projectDir: string, sessionId?: string): Persona | null {
  if (!detectPennyfarthingProject(projectDir)) return null;

  const config = loadThemeConfig(projectDir);
  if (!config) return null;

  // Get theme data from CLI
  const cacheKey = `theme:${config.theme}`;
  let themeData = cache.get<{ agents: Record<string, Record<string, unknown>> }>(cacheKey);
  if (!themeData) {
    const r = callPf<{ agents: Record<string, Record<string, unknown>> }>(['theme', 'show', config.theme, '--json']);
    if (!r.success || !r.data?.agents) return null;
    themeData = r.data;
    cache.set(cacheKey, themeData);
  }

  const agents = themeData.agents;
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

  const character = (persona.character as string) || '';
  let displayName = persona.shortName as string | undefined;
  const shortName = displayName || character.split(' ')[0];
  if (!displayName) {
    const displayNames = computeDisplayNames(agents as unknown as Record<string, { character: string }>);
    displayName = displayNames.get(character) || character;
  }

  const ocean = persona.ocean as { O: number; C: number; E: number; A: number; N: number } | undefined;
  const slug = ocean ? generateSlug(shortName, ocean) : agentRole;
  const helper = persona.helper as Helper | undefined;
  const catchphrases = persona.catchphrases as string[] | undefined;
  const selectedQuote = selectCatchphrase(catchphrases, persona.quote as string);

  return {
    character,
    displayName,
    role: agentRole,
    roleDescription: (persona.role as string) || '',
    style: (persona.style as string) || '',
    theme: config.theme,
    slug,
    quote: selectedQuote,
    helper: helper || undefined,
    ocean,
  };
}

/**
 * Gets full persona details including voice, quirks, background for popup display
 */
export function getFullPersonaDetails(projectDir: string, sessionId?: string): unknown {
  if (!detectPennyfarthingProject(projectDir)) return null;

  const basicPersona = getCurrentPersona(projectDir, sessionId);
  if (!basicPersona) return null;

  const r = callPf<{ agents: Record<string, Record<string, unknown>> }>(['theme', 'show', basicPersona.theme, '--json']);
  if (!r.success || !r.data?.agents) return basicPersona;

  const rawPersona = r.data.agents[basicPersona.role];
  if (!rawPersona) return basicPersona;

  return {
    ...basicPersona,
    voice: rawPersona.voice as string | undefined,
    quirks: rawPersona.quirks as string[] | undefined,
    background: rawPersona.role as string | undefined,
    roleMapping: `${basicPersona.role.toUpperCase()} → ${basicPersona.character}`,
    expertise: rawPersona.expertise as string | undefined,
    catchphrases: rawPersona.catchphrases as string[] | undefined,
    visual: rawPersona.visual as string | undefined,
  };
}

// ---------------------------------------------------------------------------
// File watching — retained for cache invalidation
// ---------------------------------------------------------------------------

/**
 * Watches for agent changes and invokes callback when agent changes.
 * Cache is invalidated on file changes to ensure fresh CLI results.
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
      cache.invalidate();
      try {
        const agentRole = readFileSync(sessionFile, 'utf-8').trim();
        callback(agentRole);
      } catch {
        // File might be deleted or unreadable
      }
    });
  } else {
    watcher = watch(agentsDir, { recursive: true }, () => {
      cache.invalidate();
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
 */
export function resolvePackageRoot(): string {
  const distPath = resolvePennyfarthingDist();
  if (distPath) {
    return dirname(distPath);
  }
  return PACKAGE_ROOT;
}
