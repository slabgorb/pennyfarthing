/**
 * Teams capability detection for Pennyfarthing.
 *
 * Detects whether the runtime environment supports Claude Code
 * native Agent Teams. Checks three conditions:
 * 1. CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS env var
 * 2. Interactive mode (not -p flag)
 * 3. teammateMode setting (in-process vs tmux)
 *
 * @module capabilities
 */

import { readFileSync } from 'node:fs';

/** Result of teammate mode detection */
export type TeammateMode = 'in-process' | 'tmux' | null;

/** Detailed capability detection result */
export interface TeamsCapabilityResult {
  /** Whether native teams are fully available */
  teamsAvailable: boolean;
  /** Whether the env var flag is set */
  envVarSet: boolean;
  /** Whether running in interactive mode (not -p) */
  isInteractive: boolean;
  /** Detected teammate mode setting */
  teammateMode: TeammateMode;
  /** Human-readable reason if teams are unavailable */
  reason?: string;
}

/** Standard result envelope */
export interface CapabilityResult {
  success: boolean;
  data?: TeamsCapabilityResult;
  error?: string;
}

/** Doctor check result (matches CheckResult interface) */
export interface CapabilityCheckResult {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  detail?: string;
}

/** Execution strategy for a workflow phase */
export interface PhaseExecutionStrategy {
  mode: 'team' | 'solo-tandem' | 'solo';
  degraded: boolean;
  reason?: string;
}

/**
 * Check if the CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS env var is set and truthy.
 */
export function isTeamsEnvVarSet(): boolean {
  const val = process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
  return val === 'true' || val === '1';
}

/**
 * Detect whether the current session is interactive (not -p mode).
 */
export function isInteractiveMode(): boolean {
  return !process.argv.includes('-p');
}

/**
 * Read the teammateMode setting from a JSON config file.
 *
 * @param configPath - Path to config file. If omitted, returns null.
 * @returns The teammate mode setting, or null if not configured
 */
export function getTeammateMode(configPath?: string): TeammateMode {
  if (!configPath) return null;
  try {
    const content = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content);
    const mode = config.teammateMode;
    if (mode === 'in-process' || mode === 'tmux') return mode;
    return null;
  } catch {
    return null;
  }
}

/**
 * Detect whether native Claude Code Agent Teams are available.
 *
 * Always returns `{success: true}` — the detection itself always succeeds.
 * The `teamsAvailable` flag within `data` indicates actual capability.
 *
 * @param configPath - Optional path to config file for teammateMode lookup
 * @returns CapabilityResult with detailed detection info
 */
export function detectTeamsCapability(configPath?: string): CapabilityResult {
  const envVarSet = isTeamsEnvVarSet();
  const interactive = isInteractiveMode();
  const teammateMode = getTeammateMode(configPath);
  const teamsAvailable = envVarSet && interactive;

  const reasons: string[] = [];
  if (!envVarSet) reasons.push('CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS not set');
  if (!interactive) reasons.push('not in interactive mode (-p flag detected)');

  return {
    success: true,
    data: {
      teamsAvailable,
      envVarSet,
      isInteractive: interactive,
      teammateMode,
      reason: teamsAvailable ? undefined : reasons.join('; '),
    },
  };
}

/**
 * Generate doctor check results for teams capability.
 * Returns CheckResult-compatible objects for integration with `pennyfarthing doctor`.
 *
 * @param configPath - Optional path to config file
 * @returns Array of check results
 */
export function checkTeamsCapability(configPath?: string): CapabilityCheckResult[] {
  const detection = detectTeamsCapability(configPath);
  const data = detection.data!;

  return [
    {
      name: 'Teams env var',
      status: data.envVarSet ? 'pass' : 'warn',
      detail: data.envVarSet
        ? 'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS is enabled'
        : 'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS not set (teams disabled)',
    },
    {
      name: 'Interactive mode',
      status: data.isInteractive ? 'pass' : 'warn',
      detail: data.isInteractive
        ? 'Running in interactive mode'
        : 'Running with -p flag (teams require interactive mode)',
    },
    {
      name: 'Teammate mode',
      status: data.teammateMode ? 'pass' : 'warn',
      detail: data.teammateMode
        ? `teammateMode: ${data.teammateMode}`
        : 'teammateMode not configured',
    },
  ];
}

/**
 * Determine whether a workflow phase should degrade from team mode to solo+tandem.
 *
 * @param phaseConfig - The phase configuration object (with optional team: block)
 * @param configPath - Optional path to config for capability detection
 * @returns Execution strategy recommendation
 */
export function resolvePhaseExecution(
  phaseConfig: { team?: Record<string, unknown> },
  configPath?: string,
): PhaseExecutionStrategy {
  if (!phaseConfig.team) {
    return { mode: 'solo', degraded: false };
  }

  const detection = detectTeamsCapability(configPath);
  const teamsAvailable = detection.data?.teamsAvailable ?? false;

  if (teamsAvailable) {
    return { mode: 'team', degraded: false };
  }

  return {
    mode: 'solo-tandem',
    degraded: true,
    reason: detection.data?.reason || 'Teams capability not available',
  };
}
