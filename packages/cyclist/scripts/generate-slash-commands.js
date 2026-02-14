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
 * Check if command file is deprecated (has deprecated: true in frontmatter)
 */
function isDeprecated(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return false;
  return /deprecated:\s*true/.test(match[1]);
}

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

    // Skip deprecated commands
    if (isDeprecated(content)) continue;

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
 * Generate the slash-commands.ts file content (TypeScript)
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
  ${commandsJson}
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
  return charBefore === ' ' || charBefore === '\\n' || charBefore === '\\t';
}
`;
}

// Main
const commands = scanCommands();
const content = generateContent(commands);
const outputPath = join(__dirname, '../../core/src/public/utils/slash-commands.ts');

writeFileSync(outputPath, content, 'utf8');

console.log(`Generated slash-commands.ts with ${commands.length} Pennyfarthing commands + ${BUILTIN_COMMANDS.length} built-in commands`);
