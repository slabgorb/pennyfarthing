#!/usr/bin/env node
// Fix execute permissions on shell scripts after npm install.
// npm may strip +x bits depending on platform/version.

const { readdirSync, chmodSync, statSync } = require('fs');
const { join } = require('path');

const scriptsDir = join(__dirname, '..', 'pennyfarthing-dist', 'scripts');

function fixPermissions(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      fixPermissions(full);
    } else if (entry.name.endsWith('.sh') && entry.name !== 'find-root.sh') {
      try {
        const stat = statSync(full);
        if ((stat.mode & 0o111) === 0) {
          chmodSync(full, 0o755);
        }
      } catch {
        // Skip files we can't chmod
      }
    }
  }
}

fixPermissions(scriptsDir);
