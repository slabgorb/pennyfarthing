/**
 * Subagent Display Module
 *
 * Theme-aware subagent message display utilities.
 * Story MSSCI-12776 - Theme-Aware Subagent Display Messages
 *
 * Transforms raw subagent prompts into friendly, themed messages
 * using the current agent's Helper persona from the theme.
 */

// Types
export interface TaskInput {
  prompt?: string;
  description?: string;
  subagent_type?: string;
}

export interface Helper {
  name: string;
  style: string;
}

// AC1: Parse subagent type from Task tool invocation
export function parseSubagentType(input: TaskInput): string | null {
  throw new Error('parseSubagentType not implemented');
}

export function parseSubagentDescription(input: TaskInput): string | null {
  throw new Error('parseSubagentDescription not implemented');
}

// AC2: Look up current agent's helper persona from theme
export async function getAgentHelper(agentRole: string): Promise<Helper | null> {
  throw new Error('getAgentHelper not implemented');
}

export async function getSubagentHelper(subagentType: string): Promise<Helper | null> {
  throw new Error('getSubagentHelper not implemented');
}

export function clearHelperCache(): void {
  throw new Error('clearHelperCache not implemented');
}

// AC3: Generate friendly message from subagent context
export function generateFriendlyMessage(context: TaskInput): string {
  throw new Error('generateFriendlyMessage not implemented');
}
