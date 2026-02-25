// BikeRack standalone entry point (Story 124-5)
// Self-contained launcher: starts server, writes port file, handles cleanup.
// Mode is 'bikerack' by default — no env var needed.

import { createTerminalServer, findAvailablePort } from './server.js';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';

const PORT_FILE = '.bikerack-port';
const DEFAULT_PORT = parseInt(process.env.BIKERACK_PORT || '2898', 10);

function getProjectDir(): string {
  return process.env.CYCLIST_PROJECT_DIR || process.cwd();
}

function writePortFile(projectDir: string, port: number): void {
  writeFileSync(join(projectDir, PORT_FILE), String(port));
}

function cleanupPortFile(projectDir: string): void {
  const portFilePath = join(projectDir, PORT_FILE);
  if (existsSync(portFilePath)) {
    unlinkSync(portFilePath);
  }
}

(async () => {
  const server = createTerminalServer();
  const projectDir = getProjectDir();
  const actualPort = await findAvailablePort(DEFAULT_PORT);

  if (actualPort !== DEFAULT_PORT) {
    console.log(`Port ${DEFAULT_PORT} in use, using ${actualPort} instead`);
  }

  server.listen(actualPort, '127.0.0.1', () => {
    console.log(`BikeRack running at http://127.0.0.1:${actualPort}`);
    // Write port file AFTER listen() callback (CE-3)
    writePortFile(projectDir, actualPort);
    console.log(`[BikeRack] Wrote .bikerack-port to ${projectDir}`);
  });

  process.on('SIGINT', () => {
    cleanupPortFile(projectDir);
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    cleanupPortFile(projectDir);
    process.exit(0);
  });
})();
