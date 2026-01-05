#!/usr/bin/env node
/**
 * Verify visual prompts match character assignments after Job Fair optimization.
 * Checks for obvious mismatches between character names and visual descriptions.
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { parse } from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const THEMES_DIR = join(__dirname, '../pennyfarthing-dist/personas/themes');

// Keywords that should appear in visual description for certain characters
const CHARACTER_KEYWORDS = {
  // Breaking Bad
  'Jesse Pinkman': ['hoodie', 'beanie', 'young', 'twenties'],
  'Walter White': ['bald', 'pork pie', 'goatee', 'glasses'],
  'Gustavo Fring': ['polo', 'pollos', 'wire-rimmed', 'pleasant smile'],
  'Saul Goodman': ['colorful suit', 'comb-over', 'flashy', 'loud'],
  'Mike Ehrmantraut': ['mustache', 'older', 'sixties', 'weathered'],
  'Hank Schrader': ['dea', 'stocky', 'shaved head', 'goatee'],

  // Star Trek
  'Captain Kirk': ['captain', 'command', 'gold', 'decisive'],
  'Spock': ['vulcan', 'pointed ears', 'logical', 'eyebrow'],
  'McCoy': ['doctor', 'medical', 'blue', 'grumpy'],

  // Shakespeare
  'Prospero': ['magician', 'staff', 'robes', 'wizard'],
  'Hamlet': ['prince', 'skull', 'black', 'melancholy'],
  'Puck': ['sprite', 'fairy', 'mischievous', 'pointed ears'],

  // West Wing
  'President Bartlet': ['president', 'nobel', 'presidential', 'glasses'],
  'Leo McGarry': ['chief of staff', 'weathered', 'thinning', 'coffee'],
  'Josh Lyman': ['curly', 'tie askew', 'animated', 'expressive'],
  'Sam Seaborn': ['handsome', 'boyish', 'sharp suit', 'legal pad'],
};

function hasKeywordMatch(visual, keywords) {
  const lowerVisual = visual.toLowerCase();
  return keywords.some(kw => lowerVisual.includes(kw.toLowerCase()));
}

function main() {
  const themeFiles = readdirSync(THEMES_DIR).filter(f => f.endsWith('.yaml'));
  const issues = [];
  let checked = 0;

  for (const file of themeFiles) {
    const content = readFileSync(join(THEMES_DIR, file), 'utf8');
    const data = parse(content);
    const agents = data.agents || {};

    for (const [role, agent] of Object.entries(agents)) {
      if (!agent.visual || !agent.character) continue;

      const char = agent.character;
      if (CHARACTER_KEYWORDS[char]) {
        checked++;
        const hasMatch = hasKeywordMatch(agent.visual, CHARACTER_KEYWORDS[char]);
        if (!hasMatch) {
          issues.push({
            theme: file.replace('.yaml', ''),
            role,
            character: char,
            visual: agent.visual.substring(0, 80) + '...',
            expectedKeywords: CHARACTER_KEYWORDS[char]
          });
        }
      }
    }
  }

  console.log(`Checked ${checked} character-visual pairs with known keywords\n`);

  if (issues.length === 0) {
    console.log('✓ All visual descriptions match their character assignments!');
  } else {
    console.log(`Found ${issues.length} potential mismatches:\n`);
    for (const issue of issues) {
      console.log(`  ${issue.theme}/${issue.role}:`);
      console.log(`    Character: ${issue.character}`);
      console.log(`    Visual: ${issue.visual}`);
      console.log(`    Expected keywords: ${issue.expectedKeywords.join(', ')}\n`);
    }
  }
}

main();
