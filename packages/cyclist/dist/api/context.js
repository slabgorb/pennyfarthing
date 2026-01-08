import { Router } from 'express';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
/**
 * Get context usage by running check-context.sh
 * @param projectDir - The project directory
 * @returns Context usage info
 */
export function getContextUsage(projectDir) {
    // Find the check-context.sh script
    const possiblePaths = [
        join(projectDir, '.claude', 'scripts', 'check-context.sh'),
        join(projectDir, 'pennyfarthing-dist', 'scripts', 'check-context.sh'),
    ];
    let scriptPath = null;
    for (const path of possiblePaths) {
        if (existsSync(path)) {
            scriptPath = path;
            break;
        }
    }
    if (!scriptPath) {
        return { percent: null, tokens: null, status: null, error: 'check-context.sh not found' };
    }
    try {
        const output = execSync(`PROJECT_ROOT="${projectDir}" "${scriptPath}"`, {
            encoding: 'utf-8',
            timeout: 5000,
            cwd: projectDir,
        });
        // Parse the output which looks like:
        // CONTEXT_TOKENS=12345
        // CONTEXT_PERCENT=45
        // CONTEXT_STATUS=OK
        // HANDOFF_MODE=ask
        const result = {
            percent: null,
            tokens: null,
            status: null,
            error: null,
        };
        for (const line of output.split('\n')) {
            const [key, value] = line.split('=');
            if (key === 'CONTEXT_PERCENT') {
                result.percent = parseInt(value, 10);
            }
            else if (key === 'CONTEXT_TOKENS') {
                result.tokens = parseInt(value, 10);
            }
            else if (key === 'CONTEXT_STATUS') {
                result.status = value;
            }
            else if (key === 'CONTEXT_ERROR') {
                result.error = value;
            }
        }
        return result;
    }
    catch (err) {
        return {
            percent: null,
            tokens: null,
            status: null,
            error: err instanceof Error ? err.message : 'Failed to get context',
        };
    }
}
/**
 * Create context API router
 */
export function createContextRouter(getProjectDir) {
    const router = Router();
    // Context API - GET current context usage
    router.get('/', (_req, res) => {
        const projectDir = getProjectDir();
        const context = getContextUsage(projectDir);
        res.json(context);
    });
    return router;
}
//# sourceMappingURL=context.js.map