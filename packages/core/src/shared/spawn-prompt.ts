/**
 * Spawn prompt builder for native Agent Teams.
 *
 * Generates lightweight spawn prompts for teammate activation.
 * Prompts invoke `pf agent start {agent}` for full Prime activation,
 * keeping the prompt under 500 tokens. Teammates get persona, sidecars,
 * and session context from Prime — not from prompt injection.
 *
 * @module spawn-prompt
 */

/** Valid core agent names */
export const CORE_AGENTS: readonly string[] = [];

/** Configuration for building a spawn prompt */
export interface SpawnPromptConfig {
  agent: string;
  storyId: string;
  task: string;
  phase: string;
  sessionFile?: string;
}

/** Result of spawn prompt generation */
export interface SpawnPromptResult {
  success: boolean;
  prompt?: string;
  tokenEstimate?: number;
  error?: string;
}

/** Result of spawn prompt validation */
export interface SpawnPromptValidation {
  valid: boolean;
  tokenCount: number;
  errors: string[];
}

/**
 * Build a spawn prompt for teammate activation.
 */
export function buildSpawnPrompt(_config: SpawnPromptConfig): SpawnPromptResult {
  return { success: false, error: 'not implemented' };
}

/**
 * Estimate token count for a text string.
 * Uses the ~4 chars per token heuristic.
 */
export function estimateTokenCount(_text: string): number {
  return 0;
}

/**
 * Validate a spawn prompt against constraints.
 */
export function validateSpawnPrompt(_prompt: string): SpawnPromptValidation {
  return { valid: false, tokenCount: 0, errors: ['not implemented'] };
}
