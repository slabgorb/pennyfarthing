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

// Cache for helper lookups
const helperCache = new Map<string, Helper>();

// =============================================================================
// AC1: Parse subagent type from Task tool invocation
// =============================================================================

export function parseSubagentType(input: TaskInput): string | null {
  return input.subagent_type ?? null;
}

export function parseSubagentDescription(input: TaskInput): string | null {
  return input.description ?? null;
}

// =============================================================================
// AC2: Look up current agent's helper persona from theme
// =============================================================================

export async function getAgentHelper(agentRole: string): Promise<Helper | null> {
  // Check cache first
  const cacheKey = `agent:${agentRole}`;
  if (helperCache.has(cacheKey)) {
    return helperCache.get(cacheKey)!;
  }

  const api = window.electronAPI;
  if (!api?.theme?.getHelper) {
    return null;
  }

  try {
    const helper = await api.theme.getHelper(agentRole) as Helper | null;
    if (helper) {
      helperCache.set(cacheKey, helper);
    }
    return helper;
  } catch {
    return null;
  }
}

export async function getSubagentHelper(subagentType: string): Promise<Helper | null> {
  // Check cache first
  const cacheKey = `subagent:${subagentType}`;
  if (helperCache.has(cacheKey)) {
    return helperCache.get(cacheKey)!;
  }

  const api = window.electronAPI;
  if (!api?.theme?.getSubagentHelper) {
    return null;
  }

  try {
    const helper = await api.theme.getSubagentHelper(subagentType) as Helper | null;
    if (helper) {
      helperCache.set(cacheKey, helper);
    }
    return helper;
  } catch {
    return null;
  }
}

export function clearHelperCache(): void {
  helperCache.clear();
}

// =============================================================================
// AC3: Generate friendly message from subagent context
// =============================================================================

// Mapping of subagent types to human-friendly action descriptions
const SUBAGENT_TYPE_MESSAGES: Record<string, string> = {
  'testing-runner': 'Running tests',
  'Explore': 'Exploring codebase',
  'sm-setup': 'Setting up story',
  'sm-finish': 'Finishing story',
  'handoff': 'Handing off',
  'workflow-status-check': 'Checking workflow status',
  'general-purpose': 'Processing task',
  'Plan': 'Planning implementation',
  'Bash': 'Running commands',
};

export function generateFriendlyMessage(context: TaskInput): string {
  // If we have a description, include it
  const description = context.description;

  // If we have a known subagent type, use its friendly message
  const subagentType = context.subagent_type;
  if (subagentType && SUBAGENT_TYPE_MESSAGES[subagentType]) {
    const action = SUBAGENT_TYPE_MESSAGES[subagentType];
    if (description) {
      return `${action}: ${description}`;
    }
    return action;
  }

  // Fall back to description if available
  if (description) {
    return description;
  }

  // Default fallback
  return 'Working...';
}
