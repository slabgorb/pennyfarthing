/**
 * Prime Module - Get agent/persona context for system prompt
 *
 * Calls the Pennyfarthing prime script to get the full agent context
 * (agent definition, persona, behavior guide, sprint context, etc.)
 * which is then passed via --append-system-prompt to make personas
 * behave the same as in CLI mode.
 *
 * Also provides tier selection logic for the tiered context injection system
 * (MSSCI-12793) which reduces token overhead by selecting appropriate context
 * tiers based on session state.
 */

import { execFileSync } from 'child_process';
import type { SessionContextState } from './claude-service.js';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Known agent names — reject anything not on this list to prevent command injection (#890)
const VALID_AGENTS = [
  'sm', 'tea', 'dev', 'reviewer', 'architect', 'pm',
  'tech-writer', 'ux-designer', 'devops', 'orchestrator', 'ba',
];

function isValidAgentName(name: string): boolean {
  // Allow known agents, plus alphanumeric/hyphen names (for custom agents)
  return VALID_AGENTS.includes(name) || /^[a-zA-Z0-9][-a-zA-Z0-9]*$/.test(name);
}

/**
 * Find the Pennyfarthing scripts directory
 * Handles both dev mode and installed mode
 */
function findPennyfarthingScripts(projectDir: string): string | null {
  // 1. Check node_modules in project
  const nodeModulesPath = join(projectDir, 'node_modules', '@pennyfarthing', 'core', 'pennyfarthing_scripts');
  if (existsSync(nodeModulesPath)) {
    return dirname(nodeModulesPath); // Return package root
  }

  // 2. Check .pennyfarthing symlink (resolves to node_modules)
  const dotPennyfarthing = join(projectDir, '.pennyfarthing', 'scripts');
  if (existsSync(dotPennyfarthing)) {
    // Walk up from scripts to find package root
    const packageRoot = join(dotPennyfarthing, '..', '..');
    if (existsSync(join(packageRoot, 'pennyfarthing_scripts'))) {
      return packageRoot;
    }
  }

  // 3. Dev mode: Check relative to Cyclist source
  const devPath = join(__dirname, '..', '..', '..', 'pennyfarthing_scripts');
  if (existsSync(devPath)) {
    return join(__dirname, '..', '..', '..'); // Return package root
  }

  return null;
}

/**
 * Get the prime context for an agent
 *
 * Calls `pf agent start <name> --quiet` and returns the output, which includes:
 * - Agent definition
 * - Persona (character, style, traits)
 * - Behavior guide
 * - Sprint context
 * - Session context
 * - Sidecar memory
 *
 * Falls back to python3 -m invocation with PYTHONPATH if pf CLI is not installed.
 *
 * @param agentName - Agent name (sm, tea, dev, reviewer, etc.)
 * @param projectDir - Project directory to run from
 * @returns Prime context string, or null if failed
 */
export function getPrimeContext(agentName: string, projectDir: string): string | null {
  // Validate agent name to prevent command injection (#890)
  if (!isValidAgentName(agentName)) {
    console.error(`[prime] Invalid agent name rejected: "${agentName}"`);
    return null;
  }

  try {
    // Try pf CLI first (installed via uv tool install / pipx)
    const result = execFileSync(
      'pf',
      ['agent', 'start', agentName, '--quiet'],
      {
        cwd: projectDir,
        encoding: 'utf-8',
        timeout: 10000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );

    if (result && result.trim().length > 0) {
      console.log(`[prime] Got context for agent "${agentName}" (${result.length} chars)`);
      return result;
    }

    console.warn(`[prime] Empty output for agent "${agentName}"`);
    return null;
  } catch {
    // pf not available, fall back to python3 -m with PYTHONPATH
  }

  const packageRoot = findPennyfarthingScripts(projectDir);
  if (!packageRoot) {
    console.warn('[prime] Could not find pennyfarthing_scripts (pf CLI not installed, PYTHONPATH fallback failed)');
    return null;
  }

  try {
    const env = {
      ...process.env,
      PYTHONPATH: `${packageRoot}:${process.env.PYTHONPATH || ''}`,
    };

    const result = execFileSync(
      'python3',
      ['-m', 'pennyfarthing_scripts.cli', 'agent', 'start', agentName, '--quiet'],
      {
        cwd: projectDir,
        env,
        encoding: 'utf-8',
        timeout: 10000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );

    if (result && result.trim().length > 0) {
      console.log(`[prime] Got context for agent "${agentName}" (${result.length} chars, PYTHONPATH fallback)`);
      return result;
    }

    console.warn(`[prime] Empty output for agent "${agentName}"`);
    return null;
  } catch (error) {
    console.error(`[prime] Failed to get context for agent "${agentName}":`, error);
    return null;
  }
}

/**
 * Async version of getPrimeContext
 */
export async function getPrimeContextAsync(agentName: string, projectDir: string): Promise<string | null> {
  return new Promise((resolve) => {
    // Run in next tick to not block
    setImmediate(() => {
      resolve(getPrimeContext(agentName, projectDir));
    });
  });
}

// =============================================================================
// MSSCI-12796: Tiered Context Injection
// =============================================================================

// =============================================================================
// MSSCI-12800: Token Counting Types and Parsing
// =============================================================================

/**
 * A loaded context component with metadata
 */
export interface PrimeComponent {
  /** Component identifier (e.g., "agent_definition", "persona") */
  name: string;
  /** Estimated token count */
  tokens: number;
  /** Relative path to source file, if applicable */
  source?: string;
}

/**
 * Parsed result from prime JSON output
 */
export interface PrimeOutput {
  /** Context content string (assembled text for system prompt) */
  context?: string;
  /** Context tier used */
  tier?: ContextTier;
  /** Agent name */
  agentName?: string;
  /** Per-component token counts */
  tokenCounts?: Record<string, number>;
  /** Total tokens across all components */
  totalTokens?: number;
  /** Per-component metadata with source paths */
  components?: PrimeComponent[];
}

/**
 * Parse prime command output (JSON or plain text)
 *
 * Handles both JSON output (from --json flag) and plain text output.
 * For JSON output, extracts tier, token_counts, and total_tokens fields.
 *
 * @param output - Raw output from prime command
 * @returns Parsed prime output with token data if available
 */
export function parsePrimeOutput(output: string): PrimeOutput {
  // Try to parse as JSON first
  try {
    const trimmed = output.trim();
    if (trimmed.startsWith('{')) {
      const data = JSON.parse(trimmed);
      return {
        context: data.context ?? trimmed,
        tier: data.tier as ContextTier | undefined,
        agentName: data.agent_name,
        tokenCounts: data.token_counts,
        totalTokens: data.total_tokens,
        components: data.components as PrimeComponent[] | undefined,
      };
    }
  } catch {
    // Not JSON, fall through to plain text handling
  }

  // Plain text output - just return as context
  return {
    context: output,
  };
}

/**
 * Context tier for determining how much context to inject
 *
 * | Tier     | Tokens | When Used                              |
 * |----------|--------|----------------------------------------|
 * | FULL     | ~4000  | First turn of new session (no lastAgent) |
 * | REFRESH  | ~600   | Resumed session, same agent, turns 0-3 |
 * | HANDOFF  | ~700   | Resumed session, different agent       |
 * | MINIMAL  | ~200   | Deep conversation (turn > 3), same agent |
 */
export type ContextTier = 'FULL' | 'REFRESH' | 'HANDOFF' | 'MINIMAL';

/**
 * Select the appropriate context tier based on session state
 *
 * Decision logic (in priority order):
 * 1. No lastAgent (new session) → FULL
 * 2. Different agent (handoff) → HANDOFF
 * 3. Same agent, turnCount > 3 → MINIMAL
 * 4. Otherwise → REFRESH
 *
 * @param agentName - Current agent requesting context (e.g., 'dev', 'tea')
 * @param state - Current session context state from ClaudeService
 * @returns The appropriate context tier
 */
export function selectContextTier(
  agentName: string,
  state: SessionContextState
): ContextTier {
  // New session - need everything (explicitly check for null, not just falsy)
  if (state.lastAgent === null) return 'FULL';

  // Different agent - need agent def + persona
  if (state.lastAgent !== agentName) return 'HANDOFF';

  // Same agent, deep conversation - just workflow state
  if (state.turnCount > 3) return 'MINIMAL';

  // Same agent, early conversation - refresh dynamic state
  return 'REFRESH';
}

// =============================================================================
// MSSCI-12798: Tier Integration
// =============================================================================

/**
 * Build the prime command arguments array
 *
 * This is exported for testing - allows verification of command format
 * without actually executing the command.
 *
 * @param agentName - Agent name (sm, tea, dev, reviewer, etc.)
 * @param tier - Optional context tier (FULL, REFRESH, HANDOFF, MINIMAL)
 * @returns Arguments array for execFileSync (command is 'pf')
 */
export function buildPrimeCommand(agentName: string, tier?: ContextTier, json?: boolean): string[] {
  const args = ['agent', 'start', agentName, '--quiet'];

  if (tier !== undefined) {
    args.push('--tier', tier);
  }

  if (json) {
    args.push('--json');
  }

  return args;
}

/**
 * Get the prime context for an agent with tier support
 *
 * Like getPrimeContext but accepts a tier parameter to control
 * how much context is loaded. This is used by the tiered context
 * injection system (MSSCI-12793) to reduce token overhead.
 *
 * @param agentName - Agent name (sm, tea, dev, reviewer, etc.)
 * @param projectDir - Project directory to run from
 * @param tier - Context tier (FULL, REFRESH, HANDOFF, MINIMAL)
 * @returns Prime context string, or null if failed
 */
export function getPrimeContextWithTier(
  agentName: string,
  projectDir: string,
  tier: ContextTier
): string | null {
  // Validate agent name to prevent command injection (#890)
  if (!isValidAgentName(agentName)) {
    console.error(`[prime] Invalid agent name rejected: "${agentName}"`);
    return null;
  }

  const packageRoot = findPennyfarthingScripts(projectDir);
  if (!packageRoot) {
    console.warn('[prime] Could not find pennyfarthing_scripts');
    return null;
  }

  try {
    // Set PYTHONPATH so Python can find pennyfarthing_scripts
    const env = {
      ...process.env,
      PYTHONPATH: `${packageRoot}:${process.env.PYTHONPATH || ''}`,
    };

    // Build command args with tier argument
    const args = buildPrimeCommand(agentName, tier);

    const result = execFileSync('pf', args, {
      cwd: projectDir,
      env,
      encoding: 'utf-8',
      timeout: 10000, // 10 second timeout
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (result && result.trim().length > 0) {
      console.log(`[prime] Got context for agent "${agentName}" tier=${tier} (${result.length} chars)`);
      return result;
    }

    console.warn(`[prime] Empty output for agent "${agentName}" tier=${tier}`);
    return null;
  } catch (error) {
    console.error(`[prime] Failed to get context for agent "${agentName}" tier=${tier}:`, error);
    return null;
  }
}

/**
 * Get prime context as structured JSON output
 *
 * Runs prime with --json flag to get both the assembled context text
 * (for system prompt) and structured metadata (for DebugPanel display).
 *
 * @param agentName - Agent name (sm, tea, dev, reviewer, etc.)
 * @param projectDir - Project directory to run from
 * @param tier - Context tier (FULL, REFRESH, HANDOFF, MINIMAL)
 * @returns Parsed prime output with context + metadata, or null if failed
 */
export function getPrimeContextJson(
  agentName: string,
  projectDir: string,
  tier: ContextTier
): PrimeOutput | null {
  // Validate agent name to prevent command injection (#890)
  if (!isValidAgentName(agentName)) {
    console.error(`[prime] Invalid agent name rejected: "${agentName}"`);
    return null;
  }

  const packageRoot = findPennyfarthingScripts(projectDir);
  if (!packageRoot) {
    console.warn('[prime] Could not find pennyfarthing_scripts');
    return null;
  }

  try {
    const env = {
      ...process.env,
      PYTHONPATH: `${packageRoot}:${process.env.PYTHONPATH || ''}`,
    };

    const args = buildPrimeCommand(agentName, tier, true);

    const result = execFileSync('pf', args, {
      cwd: projectDir,
      env,
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (result && result.trim().length > 0) {
      const parsed = parsePrimeOutput(result);
      console.log(
        `[prime] Got JSON context for "${agentName}" tier=${tier} ` +
        `(${parsed.totalTokens ?? 0} tokens, ${parsed.components?.length ?? 0} components)`
      );
      return parsed;
    }

    console.warn(`[prime] Empty output for agent "${agentName}" tier=${tier}`);
    return null;
  } catch (error) {
    console.error(`[prime] Failed to get JSON context for "${agentName}" tier=${tier}:`, error);
    return null;
  }
}
