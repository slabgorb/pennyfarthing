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

/**
 * Detect whether native Claude Code Agent Teams are available.
 *
 * Checks:
 * - CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS env var is truthy
 * - Running in interactive mode (not invoked with -p)
 * - teammateMode setting from config
 *
 * @param configPath - Optional path to config file for teammateMode lookup
 * @returns CapabilityResult with detailed detection info
 */
export function detectTeamsCapability(_configPath?: string): CapabilityResult {
  // STUB: Not implemented — tests should fail on assertions
  return { success: false, error: 'not implemented' };
}

/**
 * Check if the CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS env var is set and truthy.
 *
 * @returns true if the env var is set to a truthy value
 */
export function isTeamsEnvVarSet(): boolean {
  // STUB: Not implemented
  return false;
}

/**
 * Detect whether the current session is interactive (not -p mode).
 *
 * @returns true if running interactively
 */
export function isInteractiveMode(): boolean {
  // STUB: Not implemented
  return false;
}

/**
 * Read the teammateMode setting from Claude Code config.
 *
 * @param configPath - Optional path to settings file
 * @returns The teammate mode setting, or null if not configured
 */
export function getTeammateMode(_configPath?: string): TeammateMode {
  // STUB: Not implemented
  return null;
}

/**
 * Generate doctor check results for teams capability.
 * Returns CheckResult-compatible objects for integration with `pennyfarthing doctor`.
 *
 * @param configPath - Optional path to config file
 * @returns Array of check results
 */
export function checkTeamsCapability(_configPath?: string): CapabilityCheckResult[] {
  // STUB: Not implemented
  return [];
}

/**
 * Determine whether a workflow phase should degrade from team mode to solo+tandem.
 *
 * When teams are unavailable but a phase has a `team:` block configured,
 * this function returns the degraded execution strategy.
 *
 * @param phaseConfig - The phase configuration object (with optional team: block)
 * @param configPath - Optional path to config for capability detection
 * @returns Execution strategy recommendation
 */
export interface PhaseExecutionStrategy {
  mode: 'team' | 'solo-tandem' | 'solo';
  degraded: boolean;
  reason?: string;
}

export function resolvePhaseExecution(
  _phaseConfig: { team?: Record<string, unknown> },
  _configPath?: string,
): PhaseExecutionStrategy {
  // STUB: Not implemented
  return { mode: 'solo', degraded: false };
}
