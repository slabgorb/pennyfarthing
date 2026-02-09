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
    "name": "/architect",
    "description": "System Architect - Technical design and architecture"
  },
  {
    "name": "/brainstorming",
    "description": "Structured problem-solving brainstorm session"
  },
  {
    "name": "/bug",
    "description": "Report a bug"
  },
  {
    "name": "/check",
    "description": "Run quality gates (lint, type check, tests) before handoff"
  },
  {
    "name": "/chore",
    "description": "Quick commit for small changes without full git-cleanup ceremony"
  },
  {
    "name": "/clear",
    "description": "Clear conversation history"
  },
  {
    "name": "/close-epic",
    "description": "Close an epic - verify completion, update status, and archive context"
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
    "name": "/continue-session",
    "description": "Resume work from a saved checkpoint after context circuit breaker"
  },
  {
    "name": "/cost",
    "description": "Show session cost"
  },
  {
    "name": "/create-branches-from-story",
    "description": "Create feature branches in both repos from a story"
  },
  {
    "name": "/dev",
    "description": "Developer - Feature implementation and coding"
  },
  {
    "name": "/devops",
    "description": "DevOps Engineer - Infrastructure and deployment automation"
  },
  {
    "name": "/doctor",
    "description": "Check system health"
  },
  {
    "name": "/fix-blocker",
    "description": "Quick alias for /patch - fix blocking issue during story work"
  },
  {
    "name": "/git-cleanup",
    "description": "Clean up git repos by organizing changes into proper commits/branches by initiative"
  },
  {
    "name": "/health-check",
    "description": "Check Pennyfarthing installation health and apply updates"
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
    "name": "/new-work",
    "description": "Start the next available story from the sprint backlog"
  },
  {
    "name": "/orchestrator",
    "description": "Orchestrator - Coordinator of all agents and meta operations"
  },
  {
    "name": "/parallel-work",
    "description": "Start parallel work in a new worktree"
  },
  {
    "name": "/party-mode",
    "description": "Free-form creative brainstorming with all agents"
  },
  {
    "name": "/patch",
    "description": "Interrupt-driven bug fix during active story work"
  },
  {
    "name": "/permissions",
    "description": "View/edit permissions"
  },
  {
    "name": "/pm",
    "description": "Product Manager - Strategic planning and prioritization"
  },
  {
    "name": "/pr-comments",
    "description": "View PR comments"
  },
  {
    "name": "/prime",
    "description": "Load essential project context at agent activation"
  },
  {
    "name": "/release",
    "description": "Interactive stepped release with verification gates"
  },
  {
    "name": "/repo-status",
    "description": "Check git status of all project repos"
  },
  {
    "name": "/retro",
    "description": "Facilitate a sprint retrospective"
  },
  {
    "name": "/review",
    "description": "Start code review"
  },
  {
    "name": "/reviewer",
    "description": "Code Reviewer - Critical code review and quality enforcement"
  },
  {
    "name": "/run-ci",
    "description": "Detect and run CI locally"
  },
  {
    "name": "/setup",
    "description": "setup"
  },
  {
    "name": "/sm",
    "description": "Scrum Master - Story coordination and sprint management"
  },
  {
    "name": "/sprint",
    "description": "Sprint status, backlog, and story management - check status, find work, archive completed stories"
  },
  {
    "name": "/sprint-planning",
    "description": "Facilitate sprint planning session"
  },
  {
    "name": "/standalone",
    "description": "Wrap current changes into a standalone Jira story, branch, PR, and merge"
  },
  {
    "name": "/start-epic",
    "description": "Start an epic - move to current sprint and generate tech context"
  },
  {
    "name": "/status",
    "description": "Show session status"
  },
  {
    "name": "/sync-epic-to-jira",
    "description": "Sync Pennyfarthing epic to Jira MSSCI project using jira CLI"
  },
  {
    "name": "/sync-work-with-sprint",
    "description": "Sync Pennyfarthing work session with unified sprint status"
  },
  {
    "name": "/tea",
    "description": "Test Engineer/Architect - Test strategy and TDD"
  },
  {
    "name": "/tech-writer",
    "description": "Technical Writer - Documentation creation and maintenance"
  },
  {
    "name": "/terminal-setup",
    "description": "Configure terminal"
  },
  {
    "name": "/theme",
    "description": "Manage persona themes - list, show, set, create, or interactive wizard"
  },
  {
    "name": "/update-domain-docs",
    "description": "Update CLAUDE-*.md domain documentation files based on current codebase"
  },
  {
    "name": "/ux-designer",
    "description": "UX Designer - User experience design and UI patterns"
  },
  {
    "name": "/vim",
    "description": "Toggle vim mode"
  },
  {
    "name": "/work",
    "description": "Resume work or start new - smart entry point that picks up where you left off"
  },
  {
    "name": "/workflow",
    "description": "List available workflows, show current workflow details, and switch workflows mid-session. Use when checking available workflow types (TDD, trivial, agent-docs), viewing current workflow phase, switching to a different workflow pattern, or managing BikeLane stepped workflows."
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
