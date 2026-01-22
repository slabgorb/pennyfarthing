/**
 * Slash Commands Module
 * Provides command definitions and filtering for tab completion (B-9.5)
 *
 * AUTO-GENERATED - Do not edit manually!
 * Run: npm run build:commands (or npm run build)
 * Source: pennyfarthing-dist/commands/*.md
 */

// ============================================================================
// Command Definitions
// ============================================================================

/**
 * Array of available slash commands with name and description
 * Generated from pennyfarthing-dist/commands/ at build time
 * Sorted alphabetically by name
 */
export const SLASH_COMMANDS = [
  {
    "name": "/add",
    "description": "Add files to context"
  },
  {
    "name": "/architect",
    "description": "System Architect - Technical design and architecture"
  },
  {
    "name": "/benchmark",
    "description": "Compare an agent's performance against a stored baseline"
  },
  {
    "name": "/benchmark-control",
    "description": "Create control baseline for a scenario (shortcut for /benchmark control <agent>)"
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
    "name": "/create-theme",
    "description": "Create a new custom persona theme"
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
    "name": "/job-fair",
    "description": "Discover which characters in a theme excel at each role"
  },
  {
    "name": "/list-themes",
    "description": "List all available persona themes"
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
    "description": "Merge develop to main and push (optional version bump)"
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
    "name": "/set-theme",
    "description": "Set the active persona theme"
  },
  {
    "name": "/show-theme",
    "description": "Show details of a theme including all agent personas"
  },
  {
    "name": "/sm",
    "description": "Scrum Master - Story coordination and sprint management"
  },
  {
    "name": "/solo",
    "description": "Run a single agent on a scenario with absolute rubric scoring"
  },
  {
    "name": "/sprint-planning",
    "description": "Facilitate sprint planning session"
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
    "name": "/theme-maker",
    "description": "Interactive wizard for creating custom persona themes"
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
// Filtering Functions
// ============================================================================

/**
 * Filter commands by prefix (case-insensitive)
 * @param {string} prefix - The prefix to filter by (e.g., "/dev", "/he")
 * @returns {Array} Matching commands sorted alphabetically
 */
export function filterCommands(prefix) {
  const search = prefix.toLowerCase();
  return SLASH_COMMANDS.filter(cmd =>
    cmd.name.toLowerCase().startsWith(search)
  );
}

// ============================================================================
// Trigger Detection
// ============================================================================

/**
 * Check if position in text is a valid completion trigger
 * Valid triggers: "/" at start of line or after whitespace
 * @param {string} text - The text content
 * @param {number} position - Position to check (either at "/" or just after)
 * @returns {boolean} True if this is a valid trigger position
 */
export function isCompletionTrigger(text, position) {
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
