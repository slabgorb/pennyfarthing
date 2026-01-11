import { Router } from 'express';
/**
 * Context usage information from check-context.sh
 */
export interface ContextInfo {
    percent: number | null;
    tokens: number | null;
    status: string | null;
    error: string | null;
    sessionId?: string;
}
/**
 * Get context usage by running check-context.sh
 * @param projectDir - The project directory
 * @param sessionId - Optional session ID to check specific transcript
 * @returns Context usage info
 */
export declare function getContextUsage(projectDir: string, sessionId?: string): ContextInfo;
/**
 * Create context API router
 */
export declare function createContextRouter(getProjectDir: () => string): Router;
//# sourceMappingURL=context.d.ts.map