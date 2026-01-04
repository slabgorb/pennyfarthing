#!/usr/bin/env node
/**
 * add-short-names.mjs
 *
 * Pre-generates shortName field for all characters in theme YAML files.
 * Finds the shortest unique identifier that distinguishes each character.
 *
 * Usage:
 *   node add-short-names.mjs                    # Dry run - show what would change
 *   node add-short-names.mjs --write            # Actually write changes
 *   node add-short-names.mjs --theme discworld  # Only process one theme
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const themesDir = join(__dirname, '..', 'personas', 'themes');

// Common titles/prefixes to strip for comparison
const SKIP_PREFIXES = new Set([
  'the', 'dr.', 'dr', 'captain', 'admiral', 'colonel', 'lieutenant', 'commander',
  'president', 'lord', 'lady', 'sir', 'professor', 'inspector', 'sergeant',
  'mr.', 'mr', 'mrs.', 'mrs', 'miss', 'ms.', 'ms', 'chief', 'major', 'general',
  'king', 'queen', 'prince', 'princess', 'duke', 'earl', 'count', 'baron',
  'first', 'grand', 'arch', 'high',
  // Family/religious titles
  'uncle', 'aunt', 'brother', 'sister', 'father', 'mother', 'friar',
  // Role titles
  'avatar', 'agent', 'detective', 'officer', 'private', 'corporal',
  'chancellor', 'ambassador', 'senator', 'governor', 'minister',
  // Honorifics
  'master', 'young', 'old', 'elder', 'reverend', 'bishop', 'cardinal'
]);

// Words that make poor short names on their own (contextless or too generic)
const POOR_SHORT_NAMES = new Set([
  'big', 'little', 'old', 'young', 'true', 'false', 'good', 'bad',
  'thought', 'ministry', 'situation', 'room', 'place', 'house',
  'superintendent', 'commander', 'speaker', 'council',
  'mode', 'narrator', 'chronicler',
  // Avoid single/double initials
  'h.m.', 'j.f.', 'a.w.', 'e.b.', 'l.'
]);

// Names that should use the full form (iconic two-word names)
const USE_FULL_NAME = new Set([
  'big brother',
  'sun tzu'
]);

/**
 * Extract quoted nickname from character name if present
 * e.g., 'Colonel John "Hannibal" Smith' -> 'Hannibal'
 * Returns null if no nickname or if nickname is multi-word (like "Howling Mad")
 */
function extractNickname(name) {
  const match = name.match(/["']([^"']+)["']/);
  if (match) {
    const nickname = match[1].trim();
    // Only use single-word nicknames (skip descriptive like "Howling Mad")
    if (nickname && !nickname.includes(' ')) {
      return nickname;
    }
  }
  return null;
}

/**
 * Clean character name by removing parenthetical annotations and slash alternatives
 */
function cleanName(name) {
  // Remove parenthetical annotations like '(Season 1)', '(Architect)', '(DevOps)'
  let cleaned = name.replace(/\s*\([^)]+\)\s*/g, ' ').trim();
  // For slash alternatives like 'Commander/Captain John', take the last part
  // e.g., 'Commander/Captain' becomes just 'Captain', 'John Sheridan' stays
  cleaned = cleaned.replace(/\b\w+\/(\w+)\s/g, '$1 ');
  // Remove quoted nicknames like "Apollo" or 'Bones'
  cleaned = cleaned.replace(/\s*["'][^"']+["']\s*/g, ' ').trim();
  // Collapse multiple spaces
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned;
}

/**
 * Tokenize a name into meaningful parts
 */
function tokenize(name) {
  const cleaned = cleanName(name);
  const words = cleaned.split(/\s+/).filter(w => w.length > 0);

  // Filter out prefixes and single-letter initials (like R. or L.)
  const filtered = words.filter(w => {
    const lower = w.toLowerCase();
    if (SKIP_PREFIXES.has(lower)) return false;
    if (/^[A-Z]\.$/.test(w)) return false;  // Single initial like R.
    if (/^[IVXLCDM]+$/.test(w)) return false;  // Roman numerals
    return true;
  });

  return filtered.length > 0 ? filtered : words;
}

/**
 * Compute display name map for all characters in a theme
 */
function computeShortNames(agents) {
  const shortNames = new Map();
  const characters = Object.values(agents)
    .filter(a => a?.character)
    .map(a => a.character);

  /**
   * Check if a candidate is unique among all characters
   */
  function isUnique(candidate, exceptFor) {
    const candidateLower = candidate.toLowerCase();
    for (const char of characters) {
      if (char === exceptFor) continue;
      const tokens = tokenize(char);
      if (tokens.some(t => t.toLowerCase() === candidateLower)) return false;
    }
    return true;
  }

  /**
   * Check if a candidate would make a good short name
   */
  function isGoodShortName(candidate) {
    const lower = candidate.toLowerCase();
    return !POOR_SHORT_NAMES.has(lower) && candidate.length > 1;
  }

  /**
   * Find the best short name for a character
   */
  function findShortName(fullName) {
    const cleaned = cleanName(fullName);

    // Check if this is an iconic name that should stay full
    if (USE_FULL_NAME.has(cleaned.toLowerCase())) {
      return cleaned;
    }

    // Strategy 0: Prefer quoted nickname if present (e.g., "Hannibal", "Starbuck")
    const nickname = extractNickname(fullName);
    if (nickname && isGoodShortName(nickname)) {
      return nickname;
    }

    const tokens = tokenize(fullName);

    if (tokens.length === 0) {
      return cleaned;
    }

    if (tokens.length === 1) {
      return tokens[0];
    }

    // Strategy 1: First token (if good and unique)
    if (isGoodShortName(tokens[0]) && isUnique(tokens[0], fullName)) {
      return tokens[0];
    }

    // Strategy 2: Last token (surname, if good and unique)
    const lastToken = tokens[tokens.length - 1];
    if (isGoodShortName(lastToken) && isUnique(lastToken, fullName)) {
      return lastToken;
    }

    // Strategy 3: First + Last
    if (tokens.length >= 2) {
      const firstLast = `${tokens[0]} ${lastToken}`;
      if (isUnique(firstLast, fullName)) {
        return firstLast;
      }
    }

    // Fallback: cleaned full name
    return cleanName(fullName);
  }

  // Compute short name for each character
  for (const char of characters) {
    shortNames.set(char, findShortName(char));
  }

  return shortNames;
}

/**
 * Process a single theme file
 */
function processTheme(filename, dryRun = true) {
  const filepath = join(themesDir, filename);
  const content = readFileSync(filepath, 'utf-8');
  const theme = parseYaml(content);

  if (!theme?.agents) {
    console.log(`  Skipping ${filename} - no agents found`);
    return { changes: 0, filename };
  }

  const shortNames = computeShortNames(theme.agents);
  let changes = 0;

  for (const [role, agent] of Object.entries(theme.agents)) {
    if (!agent?.character) continue;

    const shortName = shortNames.get(agent.character);
    const existing = agent.shortName;

    if (shortName && shortName !== existing) {
      if (dryRun) {
        const existingNote = existing ? ` (was: "${existing}")` : '';
        console.log(`  ${role}: "${agent.character}" -> "${shortName}"${existingNote}`);
      }
      agent.shortName = shortName;
      changes++;
    }
  }

  if (!dryRun && changes > 0) {
    // Write back with yaml stringify
    const newContent = stringifyYaml(theme, { lineWidth: 0 });
    writeFileSync(filepath, newContent, 'utf-8');
    console.log(`  Wrote ${changes} changes to ${filename}`);
  }

  return { changes, filename };
}

// Main execution
const args = process.argv.slice(2);
const dryRun = !args.includes('--write');
const themeArg = args.find(a => a.startsWith('--theme='))?.split('=')[1];
const singleTheme = args.includes('--theme') ? args[args.indexOf('--theme') + 1] : themeArg;

console.log(dryRun ? '🔍 DRY RUN - No files will be modified\n' : '✏️ WRITING CHANGES\n');

let files = readdirSync(themesDir).filter(f => f.endsWith('.yaml'));
if (singleTheme) {
  files = files.filter(f => f === `${singleTheme}.yaml` || f === singleTheme);
}

let totalChanges = 0;
for (const file of files.sort()) {
  console.log(`\n📁 ${file}:`);
  const { changes } = processTheme(file, dryRun);
  totalChanges += changes;
  if (changes === 0) {
    console.log('  (no changes needed)');
  }
}

console.log(`\n${'='.repeat(50)}`);
console.log(`Total: ${totalChanges} changes across ${files.length} themes`);
if (dryRun && totalChanges > 0) {
  console.log('\nRun with --write to apply changes');
}
