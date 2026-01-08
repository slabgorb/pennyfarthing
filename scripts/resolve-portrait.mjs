#!/usr/bin/env node
/**
 * CLI wrapper for portrait resolver
 * Usage: resolve-portrait.mjs <theme> <agent>
 * Returns the portrait path or empty string if not found
 */

import { resolvePortraitPath } from '../packages/shared/dist/portrait-resolver.js';

const [,, theme, agent] = process.argv;

if (!theme || !agent) {
  process.exit(1);
}

const path = resolvePortraitPath(theme, agent);
if (path) {
  console.log(path);
}
