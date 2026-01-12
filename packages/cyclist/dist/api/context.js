import { Router } from 'express';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
/**
 * Get context usage by running check-context.sh
 * @param projectDir - The project directory
 * @param sessionId - Optional session ID to check specific transcript
 * @returns Context usage info
 */
export function getContextUsage(projectDir, sessionId) {
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
        // Build environment with optional SESSION_ID
        const env = {
            ...process.env,
            PROJECT_ROOT: projectDir,
        };
        if (sessionId) {
            env.SESSION_ID = sessionId;
        }
        const output = execSync(`"${scriptPath}"`, {
            encoding: 'utf-8',
            timeout: 5000,
            cwd: projectDir,
            env,
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
            sessionId,
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
                // Translate session_not_found to user-friendly message
                if (value === 'session_not_found') {
                    result.error = `session transcript not found: ${sessionId}`;
                }
                else {
                    result.error = value;
                }
            }
        }
        return result;
    }
    catch (err) {
        // execSync throws when script exits with non-zero code
        // The error may contain stdout/stderr with our structured output
        let errMsg = 'Failed to get context';
        if (err && typeof err === 'object') {
            const execErr = err;
            // Try to get output from the error object
            const stdout = execErr.stdout?.toString() || '';
            const stderr = execErr.stderr?.toString() || '';
            const combined = stdout + stderr + (execErr.message || '');
            // Check for session-specific errors
            if (sessionId && (combined.includes('session_not_found') || combined.includes('session transcript not found'))) {
                errMsg = `session transcript not found: ${sessionId}`;
            }
            else if (combined.includes('CONTEXT_ERROR=')) {
                // Parse the error from script output
                const match = combined.match(/CONTEXT_ERROR=(\w+)/);
                if (match) {
                    errMsg = match[1] === 'session_not_found' ? `session transcript not found: ${sessionId}` : match[1];
                }
            }
            else {
                errMsg = execErr.message || 'Failed to get context';
            }
        }
        return {
            percent: null,
            tokens: null,
            status: null,
            error: errMsg,
            sessionId,
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