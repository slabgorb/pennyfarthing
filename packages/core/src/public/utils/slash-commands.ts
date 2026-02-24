/**
 * Slash Commands Module
 * Provides command definitions and filtering for tab completion (B-9.5)
 *
 * AUTO-GENERATED - Do not edit manually!
 * Run: npm run build:commands (or npm run build)
 * Source: pennyfarthing-dist/commands/*.md
 */

// ============================================================================
// Types
// ============================================================================

export interface SlashCommand {
  name: string;
  description: string;
}

export type CommandFrequency = Record<string, number>;

// ============================================================================
// Command Definitions
// ============================================================================

/**
 * Array of available slash commands with name and description
 * Generated from pennyfarthing-dist/commands/ at build time
 * Sorted alphabetically by name
 */
export const SLASH_COMMANDS: SlashCommand[] = [
  {
    "name": "/add",
    "description": "Add files to context"
  },
  {
    "name": "/bug",
    "description": "Report a bug"
  },
  {
    "name": "/clear",
    "description": "Clear conversation history"
  },
  {
    "name": "/compact",
    "description": "Toggle compact mode"
  },
  {
    "name": "/config",
    "description": "Show configuration"
  },
  {
    "name": "/cost",
    "description": "Show session cost"
  },
  {
    "name": "/doctor",
    "description": "Check system health"
  },
  {
    "name": "/help",
    "description": "Show available commands"
  },
  {
    "name": "/init",
    "description": "Initialize CLAUDE.md"
  },
  {
    "name": "/login",
    "description": "Authenticate with Anthropic"
  },
  {
    "name": "/logout",
    "description": "Clear authentication"
  },
  {
    "name": "/memory",
    "description": "Edit CLAUDE.md memory"
  },
  {
    "name": "/model",
    "description": "Switch Claude model"
  },
  {
    "name": "/permissions",
    "description": "View/edit permissions"
  },
  {
    "name": "/pf-architect",
    "description": "System Architect - Technical design and architecture"
  },
  {
    "name": "/pf-ba",
    "description": "Business Analyst - Requirements discovery and stakeholder analysis"
  },
  {
    "name": "/pf-benchmark",
    "description": "Compare an agent's performance against a stored baseline"
  },
  {
    "name": "/pf-benchmark-control",
    "description": "Create control baseline for a scenario (shortcut for /benchmark control <agent>)"
  },
  {
    "name": "/pf-brainstorming",
    "description": "Structured problem-solving brainstorm session"
  },
  {
    "name": "/pf-check",
    "description": "Run quality gates (lint, type check, tests) before handoff"
  },
  {
    "name": "/pf-chore",
    "description": "Quick commit for small changes without full git-cleanup ceremony"
  },
  {
    "name": "/pf-ci",
    "description": "Detect and run CI locally"
  },
  {
    "name": "/pf-dev",
    "description": "Developer - Feature implementation and coding"
  },
  {
    "name": "/pf-devops",
    "description": "DevOps Engineer - Infrastructure and deployment automation"
  },
  {
    "name": "/pf-docs",
    "description": "Domain documentation management"
  },
  {
    "name": "/pf-epic",
    "description": "Epic lifecycle - start epics for development and close completed epics"
  },
  {
    "name": "/pf-fix-blocker",
    "description": "Quick alias for /patch - fix blocking issue during story work"
  },
  {
    "name": "/pf-git",
    "description": "Repository operations - status, cleanup, branches, and release management"
  },
  {
    "name": "/pf-health-check",
    "description": "Check Pennyfarthing installation health and apply updates"
  },
  {
    "name": "/pf-help",
    "description": "Context-aware help for Pennyfarthing commands, agents, and workflows"
  },
  {
    "name": "/pf-job-fair",
    "description": "Discover which characters in a theme excel at each role"
  },
  {
    "name": "/pf-orchestrator",
    "description": "Orchestrator - Coordinator of all agents and meta operations"
  },
  {
    "name": "/pf-party-mode",
    "description": "Creative brainstorming and multi-agent discussion"
  },
  {
    "name": "/pf-patch",
    "description": "Interrupt-driven bug fix during active story work"
  },
  {
    "name": "/pf-pm",
    "description": "Product Manager - Strategic planning and prioritization"
  },
  {
    "name": "/pf-prime",
    "description": "Load essential project context at agent activation"
  },
  {
    "name": "/pf-retro",
    "description": "Facilitate a sprint retrospective"
  },
  {
    "name": "/pf-reviewer",
    "description": "Code Reviewer - Critical code review and quality enforcement"
  },
  {
    "name": "/pf-session",
    "description": "Session lifecycle - start new work and resume checkpoints"
  },
  {
    "name": "/pf-setup",
    "description": "/setup - Interactive Project Setup"
  },
  {
    "name": "/pf-sm",
    "description": "Scrum Master - Story coordination and sprint management"
  },
  {
    "name": "/pf-solo",
    "description": "Run a single agent on a scenario with absolute rubric scoring"
  },
  {
    "name": "/pf-sprint",
    "description": "Sprint status, backlog, and story management - check status, find work, archive completed stories"
  },
  {
    "name": "/pf-standalone",
    "description": "Wrap current changes into a standalone Jira story, branch, PR, and merge"
  },
  {
    "name": "/pf-tea",
    "description": "Test Engineer/Architect - Test strategy and TDD"
  },
  {
    "name": "/pf-tech-writer",
    "description": "Technical Writer - Documentation creation and maintenance"
  },
  {
    "name": "/pf-theme",
    "description": "Manage persona themes - list, show, set, create, or interactive wizard"
  },
  {
    "name": "/pf-ux-designer",
    "description": "UX Designer - User experience design and UI patterns"
  },
  {
    "name": "/pf-work",
    "description": "Resume work or start new - smart entry point that picks up where you left off"
  },
  {
    "name": "/pf-workflow",
    "description": "List available workflows, show current workflow details, and switch workflows mid-session. Use when checking available workflow types (TDD, trivial, agent-docs), viewing current workflow phase, switching to a different workflow pattern, or managing BikeLane stepped workflows."
  },
  {
    "name": "/pr-comments",
    "description": "View PR comments"
  },
  {
    "name": "/review",
    "description": "Start code review"
  },
  {
    "name": "/status",
    "description": "Show session status"
  },
  {
    "name": "/terminal-setup",
    "description": "Configure terminal"
  },
  {
    "name": "/vim",
    "description": "Toggle vim mode"
  }
].sort((a, b) => a.name.localeCompare(b.name));

// ============================================================================
// Command Frequency Tracking (localStorage)
// ============================================================================

const COMMAND_FREQUENCY_KEY = 'cyclist:command-frequency';

/**
 * Get command usage frequency map from localStorage
 */
export function getCommandFrequency(): CommandFrequency {
  if (typeof localStorage === 'undefined') return {};
  try {
    const stored = localStorage.getItem(COMMAND_FREQUENCY_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

/**
 * Track command usage - increment frequency counter
 */
export function trackCommandUsage(commandName: string): void {
  if (typeof localStorage === 'undefined') return;
  const freq = getCommandFrequency();
  freq[commandName] = (freq[commandName] || 0) + 1;
  localStorage.setItem(COMMAND_FREQUENCY_KEY, JSON.stringify(freq));
}

/**
 * Clear command frequency data
 */
export function clearCommandFrequency(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(COMMAND_FREQUENCY_KEY);
}

// ============================================================================
// Filtering Functions
// ============================================================================

/**
 * Filter commands by prefix (case-insensitive)
 * Sorted by usage frequency (most used first), then alphabetically
 */
export function filterCommands(prefix: string): SlashCommand[] {
  const search = prefix.toLowerCase();
  const freq = getCommandFrequency();

  return SLASH_COMMANDS
    .filter(cmd => cmd.name.toLowerCase().startsWith(search))
    .sort((a, b) => {
      const freqA = freq[a.name] || 0;
      const freqB = freq[b.name] || 0;
      // Sort by frequency descending, then alphabetically
      if (freqB !== freqA) return freqB - freqA;
      return a.name.localeCompare(b.name);
    });
}

// ============================================================================
// Trigger Detection
// ============================================================================

/**
 * Check if position in text is a valid completion trigger
 * Valid triggers: "/" at start of line or after whitespace
 */
export function isCompletionTrigger(text: string, position: number): boolean {
  // Support both: position AT the "/" or position AFTER the "/"
  let slashPos = position;
  if (text[position] !== '/') {
    slashPos = position - 1;
  }

  // "/" must be at slashPos
  if (slashPos < 0 || text[slashPos] !== '/') return false;

  // Valid at start of text
  if (slashPos === 0) return true;

  // Valid after whitespace
  const charBefore = text[slashPos - 1];
  return charBefore === ' ' || charBefore === '\n' || charBefore === '\t';
}
