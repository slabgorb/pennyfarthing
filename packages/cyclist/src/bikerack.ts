// BikeRack mode entry point (ADR-0024, Rule 9)
// Sets IS_BIKERACK=1 BEFORE any imports that check it
process.env.IS_BIKERACK = '1';

import { createTerminalServer, findAvailablePort } from './server.js';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';

const BIKERACK_PORT_FILE = '.bikerack-port';
const DEFAULT_PORT = 2898;

function getProjectDir(): string {
  return process.cwd();
}

function writePortFile(projectDir: string, port: number): void {
  writeFileSync(join(projectDir, BIKERACK_PORT_FILE), String(port));
}

function cleanupPortFile(projectDir: string): void {
  const portFilePath = join(projectDir, BIKERACK_PORT_FILE);
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

  server.listen(actualPort, () => {
    console.log(`BikeRack running at http://localhost:${actualPort}`);
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
