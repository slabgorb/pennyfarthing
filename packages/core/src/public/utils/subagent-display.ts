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
  plural?: boolean;
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

// Theme data cache
let themeDataCache: { agents: Array<{ role: string; helper?: Helper }> } | null = null;

async function loadThemeData(): Promise<void> {
  if (themeDataCache) return;

  try {
    const response = await fetch('/api/theme-agents/full');
    if (response.ok) {
      themeDataCache = await response.json();
    }
  } catch {
    // Ignore errors, cache stays null
  }
}

export async function getAgentHelper(agentRole: string): Promise<Helper | null> {
  // Check cache first
  const cacheKey = `agent:${agentRole}`;
  if (helperCache.has(cacheKey)) {
    return helperCache.get(cacheKey)!;
  }

  try {
    // Load theme data if not cached
    await loadThemeData();

    if (themeDataCache?.agents) {
      const agent = themeDataCache.agents.find(a => a.role === agentRole);
      if (agent?.helper) {
        helperCache.set(cacheKey, agent.helper);
        return agent.helper;
      }
    }
    return null;
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

  try {
    // Load theme data if not cached
    await loadThemeData();

    // Subagent helpers may be defined differently - for now just return null
    // The theme data structure may need to be extended to support this
    return null;
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

export function generateFriendlyMessage(context: TaskInput, options?: { plural?: boolean }): string {
  const verb = options?.plural ? 'are' : 'is';
  // If we have a description, include it
  const description = context.description;

  // If we have a known subagent type, use its friendly message
  const subagentType = context.subagent_type;
  if (subagentType && SUBAGENT_TYPE_MESSAGES[subagentType]) {
    const action = SUBAGENT_TYPE_MESSAGES[subagentType];
    const lowerAction = action.charAt(0).toLowerCase() + action.slice(1);
    if (description) {
      return `${verb} ${lowerAction}: ${description}`;
    }
    return `${verb} ${lowerAction}`;
  }

  // Fall back to description if available
  if (description) {
    return description;
  }

  // Default fallback
  return 'Working...';
}
