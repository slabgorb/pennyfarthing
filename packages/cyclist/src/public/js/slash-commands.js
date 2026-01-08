/**
 * Slash Commands Module
 * Provides command definitions and filtering for tab completion (B-9.5)
 */

// ============================================================================
// Command Definitions
// ============================================================================

/**
 * Array of available slash commands with name and description
 * Sorted alphabetically by name
 */
export const SLASH_COMMANDS = [
  // Built-in Claude Code commands
  { name: '/add', description: 'Add files to context' },
  { name: '/architect', description: 'System architect agent' },
  { name: '/bug', description: 'Report a bug' },
  { name: '/clear', description: 'Clear conversation history' },
  { name: '/compact', description: 'Toggle compact mode' },
  { name: '/config', description: 'Show configuration' },
  { name: '/cost', description: 'Show session cost' },
  { name: '/dev', description: 'Developer agent' },
  { name: '/devops', description: 'DevOps engineer agent' },
  { name: '/doctor', description: 'Check system health' },
  { name: '/help', description: 'Show available commands' },
  { name: '/init', description: 'Initialize CLAUDE.md' },
  { name: '/login', description: 'Authenticate with Anthropic' },
  { name: '/logout', description: 'Clear authentication' },
  { name: '/memory', description: 'Edit CLAUDE.md memory' },
  { name: '/model', description: 'Switch Claude model' },
  { name: '/new-work', description: 'Start new work session' },
  { name: '/permissions', description: 'View/edit permissions' },
  { name: '/pr-comments', description: 'View PR comments' },
  { name: '/review', description: 'Start code review' },
  { name: '/reviewer', description: 'Code reviewer agent' },
  { name: '/sm', description: 'Scrum master agent' },
  { name: '/status', description: 'Show session status' },
  { name: '/tea', description: 'Test engineer agent' },
  { name: '/terminal-setup', description: 'Configure terminal' },
  { name: '/vim', description: 'Toggle vim mode' },
  { name: '/work', description: 'Resume current work' },
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
