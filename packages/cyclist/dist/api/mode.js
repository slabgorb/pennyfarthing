import { Router } from 'express';
// Track when the server started
const startTime = new Date().toISOString();
// Detect if running in Electron
let electronVersion = null;
const versions = process.versions;
if (versions.electron) {
    electronVersion = versions.electron;
}
/**
 * Get current runtime mode information
 */
export function getModeInfo() {
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
export function createModeRouter() {
    const router = Router();
    // GET /api/mode - return runtime mode info
    router.get('/', (_req, res) => {
        const info = getModeInfo();
        res.json(info);
    });
    return router;
}
//# sourceMappingURL=mode.js.map