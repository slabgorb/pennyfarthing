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
export const CORE_AGENTS: readonly string[] = [
  'sm', 'tea', 'dev', 'reviewer', 'architect',
  'pm', 'tech-writer', 'ux-designer', 'devops',
  'orchestrator', 'ba',
] as const;

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

const TOKEN_LIMIT = 500;
const MAX_TASK_CHARS = 1200;

/**
 * Build a spawn prompt for teammate activation.
 */
export function buildSpawnPrompt(config: SpawnPromptConfig): SpawnPromptResult {
  const { agent, storyId, task, phase, sessionFile } = config;

  if (!agent) {
    return { success: false, error: 'agent is required' };
  }
  if (!storyId) {
    return { success: false, error: 'storyId is required' };
  }
  if (!task) {
    return { success: false, error: 'task is required' };
  }

  if (!CORE_AGENTS.includes(agent)) {
    return { success: false, error: `Unknown agent "${agent}". Valid agents: ${CORE_AGENTS.join(', ')}` };
  }

  const session = sessionFile || `.session/${storyId}-session.md`;
  const truncatedTask = task.length > MAX_TASK_CHARS
    ? task.slice(0, MAX_TASK_CHARS) + '...'
    : task;

  const prompt = [
    `**FIRST:** Run this command to activate:`,
    '```bash',
    `pf agent start "${agent}"`,
    '```',
    '',
    `**Story:** ${storyId}`,
    `**Phase:** ${phase}`,
    `**Task:** ${truncatedTask}`,
    '',
    `Read the session file at \`${session}\` for full workflow state and context.`,
  ].join('\n');

  const tokenEstimate = estimateTokenCount(prompt);

  return { success: true, prompt, tokenEstimate };
}

/**
 * Estimate token count for a text string.
 * Uses the ~4 chars per token heuristic.
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Validate a spawn prompt against constraints.
 */
export function validateSpawnPrompt(prompt: string): SpawnPromptValidation {
  const errors: string[] = [];
  const tokenCount = estimateTokenCount(prompt);

  if (tokenCount > TOKEN_LIMIT) {
    errors.push(`Prompt exceeds token limit: ${tokenCount} > ${TOKEN_LIMIT}`);
  }

  if (!prompt.includes('pf agent start')) {
    errors.push('Missing activation command (pf agent start)');
  }

  return {
    valid: errors.length === 0,
    tokenCount,
    errors,
  };
}
