#!/usr/bin/env node
/**
 * Generate slash-commands.js from pennyfarthing-dist/commands/
 *
 * Scans command markdown files for YAML frontmatter descriptions
 * and generates the autocomplete list dynamically at build time.
 */

import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '../../..');

// Built-in Claude Code commands (not in pennyfarthing-dist)
const BUILTIN_COMMANDS = [
  { name: '/add', description: 'Add files to context' },
  { name: '/bug', description: 'Report a bug' },
  { name: '/clear', description: 'Clear conversation history' },
  { name: '/compact', description: 'Toggle compact mode' },
  { name: '/config', description: 'Show configuration' },
  { name: '/cost', description: 'Show session cost' },
  { name: '/doctor', description: 'Check system health' },
  { name: '/help', description: 'Show available commands' },
  { name: '/init', description: 'Initialize CLAUDE.md' },
  { name: '/login', description: 'Authenticate with Anthropic' },
  { name: '/logout', description: 'Clear authentication' },
  { name: '/memory', description: 'Edit CLAUDE.md memory' },
  { name: '/model', description: 'Switch Claude model' },
  { name: '/permissions', description: 'View/edit permissions' },
  { name: '/pr-comments', description: 'View PR comments' },
  { name: '/review', description: 'Start code review' },
  { name: '/status', description: 'Show session status' },
  { name: '/terminal-setup', description: 'Configure terminal' },
  { name: '/vim', description: 'Toggle vim mode' },
];

/**
 * Extract description from YAML frontmatter
 */
function extractDescription(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return null;

  const frontmatter = match[1];
  const descMatch = frontmatter.match(/description:\s*(.+)/);
  return descMatch ? descMatch[1].trim() : null;
}

/**
 * Scan pennyfarthing-dist/commands for command files
 */
function scanCommands() {
  const commandsDir = join(projectRoot, 'pennyfarthing-dist/commands');
  const files = readdirSync(commandsDir).filter(f => f.endsWith('.md'));

  const commands = [];

  for (const file of files) {
    const name = '/' + file.replace('.md', '');
    const content = readFileSync(join(commandsDir, file), 'utf8');
    const description = extractDescription(content);

    if (description) {
      commands.push({ name, description });
    } else {
      // Fallback description from filename
      const humanName = file.replace('.md', '').replace(/-/g, ' ');
      commands.push({ name, description: humanName });
    }
  }

  return commands;
}

/**
 * Generate the slash-commands.js file content
 */
function generateContent(commands) {
  // Merge built-in and scanned commands, dedupe by name
  const allCommands = [...BUILTIN_COMMANDS];
  const builtinNames = new Set(BUILTIN_COMMANDS.map(c => c.name));

  for (const cmd of commands) {
    if (!builtinNames.has(cmd.name)) {
      allCommands.push(cmd);
    }
  }

  // Sort alphabetically
  allCommands.sort((a, b) => a.name.localeCompare(b.name));

  const commandsJson = JSON.stringify(allCommands, null, 2)
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .trim();

  return `/**
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
  ${commandsJson}
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
  return charBefore === ' ' || charBefore === '\\n' || charBefore === '\\t';
}
`;
}

// Main
const commands = scanCommands();
const content = generateContent(commands);
const outputPath = join(__dirname, '../src/public/js/slash-commands.js');

writeFileSync(outputPath, content, 'utf8');

console.log(`Generated slash-commands.js with ${commands.length} Pennyfarthing commands + ${BUILTIN_COMMANDS.length} built-in commands`);
