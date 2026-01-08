#!/usr/bin/env node

// Pennyfarthing CLI entry point
try {
  await import('../dist/cli/index.js');
} catch (err) {
  if (err.code === 'ERR_MODULE_NOT_FOUND') {
    console.error('Error: Dependencies not installed.\n');
    console.error('Run: npm install');
    console.error('Then try again.\n');
    process.exit(1);
  }
  throw err;
}
