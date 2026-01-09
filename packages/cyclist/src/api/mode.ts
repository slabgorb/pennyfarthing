import { Router } from 'express';

/**
 * Runtime mode information for Cyclist
 */
export interface ModeInfo {
  mode: 'electron' | 'web' | 'unknown';
  version: string;
  nodeVersion: string;
  platform: string;
  arch: string;
  pid: number;
  uptime: number;
  startTime: string;
}

// Track when the server started
const startTime = new Date().toISOString();

// Detect if running in Electron
let electronVersion: string | null = null;
const versions = process.versions as Record<string, string>;
if (versions.electron) {
  electronVersion = versions.electron;
}

/**
 * Get current runtime mode information
 */
export function getModeInfo(): ModeInfo {
  const mode = electronVersion ? 'electron' : 'web';

  return {
    mode,
    version: electronVersion || 'N/A',
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    pid: process.pid,
    uptime: process.uptime(),
    startTime,
  };
}

/**
 * Create mode API router
 */
export function createModeRouter(): Router {
  const router = Router();

  // GET /api/mode - return runtime mode info
  router.get('/', (_req, res) => {
    const info = getModeInfo();
    res.json(info);
  });

  return router;
}
