#!/usr/bin/env node
// Launch Cyclist with Playwright and stream console logs
// Run from: pennyfarthing-orchestrator/pennyfarthing/

import { _electron as electron } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectDir = process.argv[2] || path.resolve(__dirname, '../..');
const cyclistDir = path.resolve(__dirname, '../packages/cyclist');

console.log('🚴 Launching Cyclist with Playwright...');
console.log(`   Project: ${projectDir}`);
console.log(`   Cyclist: ${cyclistDir}`);
console.log('');

const app = await electron.launch({
  args: [path.join(cyclistDir, 'dist/main.js')],
  cwd: cyclistDir,
  env: {
    ...process.env,
    CYCLIST_PROJECT_DIR: projectDir,
    CYCLIST_VERBOSE: 'true',
  },
});

// Get the first window
const window = await app.firstWindow();
console.log('📺 Window opened:', await window.title());
console.log('');
console.log('=== Console Logs ===');

// Listen to console messages
window.on('console', msg => {
  const type = msg.type();
  const prefix = type === 'error' ? '❌' : type === 'warning' ? '⚠️' : '  ';
  console.log(`${prefix} [${type}] ${msg.text()}`);
});

// Listen to page errors
window.on('pageerror', error => {
  console.log('❌ [pageerror]', error.message);
});

// Keep running until interrupted
console.log('');
console.log('Press Ctrl+C to stop...');
console.log('');

// Handle shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down Cyclist...');
  await app.close();
  process.exit(0);
});

// Keep the script alive
await new Promise(() => {});
