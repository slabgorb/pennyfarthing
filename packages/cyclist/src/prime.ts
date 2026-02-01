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

import { execSync } from 'child_process';
import type { SessionContextState } from './claude-service.js';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
 * Calls `python -m pennyfarthing_scripts.cli agent start <name> --quiet`
 * and returns the output, which includes:
 * - Agent definition
 * - Persona (character, style, traits)
 * - Behavior guide
 * - Sprint context
 * - Session context
 * - Sidecar memory
 *
 * @param agentName - Agent name (sm, tea, dev, reviewer, etc.)
 * @param projectDir - Project directory to run from
 * @returns Prime context string, or null if failed
 */
export function getPrimeContext(agentName: string, projectDir: string): string | null {
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

    // Call prime with --quiet to suppress headers (cleaner system prompt)
    const result = execSync(
      `python3 -m pennyfarthing_scripts.cli agent start "${agentName}" --quiet`,
      {
        cwd: projectDir,
        env,
        encoding: 'utf-8',
        timeout: 10000, // 10 second timeout
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );

    if (result && result.trim().length > 0) {
      console.log(`[prime] Got context for agent "${agentName}" (${result.length} chars)`);
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
 * Build the Python prime command string
 *
 * This is exported for testing - allows verification of command format
 * without actually executing the command.
 *
 * @param agentName - Agent name (sm, tea, dev, reviewer, etc.)
 * @param tier - Optional context tier (FULL, REFRESH, HANDOFF, MINIMAL)
 * @returns Command string for executing Python prime script
 */
export function buildPrimeCommand(agentName: string, tier?: ContextTier): string {
  let command = `python3 -m pennyfarthing_scripts.cli agent start "${agentName}" --quiet`;

  if (tier !== undefined) {
    command += ` --tier ${tier}`;
  }

  return command;
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

    // Build command with tier argument
    const command = buildPrimeCommand(agentName, tier);

    const result = execSync(command, {
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
