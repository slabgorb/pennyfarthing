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
/**
 * Get current runtime mode information
 */
export declare function getModeInfo(): ModeInfo;
/**
 * Create mode API router
 */
export declare function createModeRouter(): Router;
//# sourceMappingURL=mode.d.ts.map