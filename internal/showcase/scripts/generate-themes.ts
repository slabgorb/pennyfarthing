#!/usr/bin/env npx tsx
/**
 * Generate themes.json for client-side queries
 *
 * This script is run as a prebuild step to generate the static JSON file
 * that the client-side code can fetch at runtime.
 *
 * Usage: npx tsx scripts/generate-themes.ts
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { generateThemesJson } from '../src/lib/loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OUTPUT_PATH = join(__dirname, '..', 'public', 'themes.json');

async function main() {
  // Ensure public directory exists
  const publicDir = dirname(OUTPUT_PATH);
  if (!existsSync(publicDir)) {
    mkdirSync(publicDir, { recursive: true });
  }

  console.log('Generating themes.json...');
  const json = await generateThemesJson();
  writeFileSync(OUTPUT_PATH, json);

  const themes = JSON.parse(json);
  console.log(`Generated themes.json with ${themes.length} themes (${json.length} bytes)`);
}

main().catch((err) => {
  console.error('Failed to generate themes.json:', err);
  process.exit(1);
});
