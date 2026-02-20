import { Router } from 'express';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import type { ContextTier } from '../prime.js';

/**
 * Context usage information from check-context.sh
 */
export interface ContextInfo {
  percent: number | null;
  tokens: number | null;
  status: string | null;
  error: string | null;
  sessionId?: string;
  /** System prompt overhead (first turn tokens) */
  baseline: number | null;
  /** Tokens used by conversation (total - baseline) */
  usableTokens: number | null;
  /** Conversation usage as % of available capacity */
  usablePercent: number | null;
  /** Available capacity (max - baseline) */
  available: number | null;
  /** Current context tier (FULL, REFRESH, HANDOFF, MINIMAL) */
  tier?: ContextTier;
  /** Per-component token counts (MSSCI-12800) */
  tokenCounts?: Record<string, number>;
  /** Total tokens across all injected components (MSSCI-12800) */
  totalTokens?: number;
}

/**
 * Get context usage by running check-context.sh
 * @param projectDir - The project directory
 * @param sessionId - Optional session ID to check specific transcript
 * @returns Context usage info
 */
export function getContextUsage(projectDir: string, sessionId?: string): ContextInfo {
  // Find context.py (preferred) or legacy check-context.sh
  const pythonPaths = [
    join(projectDir, 'pennyfarthing-dist', 'pf', 'context.py'),
    join(projectDir, '.pennyfarthing', 'pf', 'context.py'),
    join(projectDir, 'pennyfarthing', 'pennyfarthing-dist', 'pf', 'context.py'),
  ];
  const shellPaths = [
    join(projectDir, 'pennyfarthing-dist', 'scripts', 'core', 'check-context.sh'),
    join(projectDir, '.pennyfarthing', 'scripts', 'core', 'check-context.sh'),
  ];

  let scriptPath: string | null = null;
  let isPython = false;
  for (const path of pythonPaths) {
    if (existsSync(path)) {
      scriptPath = path;
      isPython = true;
      break;
    }
  }
  if (!scriptPath) {
    for (const path of shellPaths) {
      if (existsSync(path)) {
        scriptPath = path;
        break;
      }
    }
  }

  if (!scriptPath) {
    return { percent: null, tokens: null, status: null, error: 'context.py not found', baseline: null, usableTokens: null, usablePercent: null, available: null };
  }

  try {
    // Build environment with optional SESSION_ID
    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      PROJECT_ROOT: projectDir,
    };
    if (sessionId) {
      env.SESSION_ID = sessionId;
    }

    const cmd = isPython
      ? `python3 "${scriptPath}"${sessionId ? ` --session ${sessionId}` : ''} --project-dir "${projectDir}"`
      : `"${scriptPath}"`;

    const output = execSync(cmd, {
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

    const result: ContextInfo = {
      percent: null,
      tokens: null,
      status: null,
      error: null,
      sessionId,
      baseline: null,
      usableTokens: null,
      usablePercent: null,
      available: null,
    };

    for (const line of output.split('\n')) {
      const [key, value] = line.split('=');
      if (key === 'CONTEXT_PERCENT') {
        result.percent = parseInt(value, 10);
      } else if (key === 'CONTEXT_TOKENS') {
        result.tokens = parseInt(value, 10);
      } else if (key === 'CONTEXT_STATUS') {
        result.status = value;
      } else if (key === 'CONTEXT_ERROR') {
        // Translate session_not_found to user-friendly message
        if (value === 'session_not_found') {
          result.error = `session transcript not found: ${sessionId}`;
        } else {
          result.error = value;
        }
      } else if (key === 'CONTEXT_BASELINE') {
        result.baseline = parseInt(value, 10);
      } else if (key === 'CONTEXT_USABLE_TOKENS') {
        result.usableTokens = parseInt(value, 10);
      } else if (key === 'CONTEXT_USABLE_PERCENT') {
        result.usablePercent = parseInt(value, 10);
      } else if (key === 'CONTEXT_AVAILABLE') {
        result.available = parseInt(value, 10);
      }
    }

    return result;
  } catch (err: unknown) {
    // execSync throws when script exits with non-zero code
    // The error may contain stdout/stderr with our structured output
    let errMsg = 'Failed to get context';

    if (err && typeof err === 'object') {
      const execErr = err as { message?: string; stdout?: Buffer | string; stderr?: Buffer | string };

      // Try to get output from the error object
      const stdout = execErr.stdout?.toString() || '';
      const stderr = execErr.stderr?.toString() || '';
      const combined = stdout + stderr + (execErr.message || '');

      // Check for session-specific errors
      if (sessionId && (combined.includes('session_not_found') || combined.includes('session transcript not found'))) {
        errMsg = `session transcript not found: ${sessionId}`;
      } else if (combined.includes('CONTEXT_ERROR=')) {
        // Parse the error from script output
        const match = combined.match(/CONTEXT_ERROR=(\w+)/);
        if (match) {
          errMsg = match[1] === 'session_not_found' ? `session transcript not found: ${sessionId}` : match[1];
        }
      } else {
        errMsg = execErr.message || 'Failed to get context';
      }
    }

    return {
      percent: null,
      tokens: null,
      status: null,
      error: errMsg,
      sessionId,
      baseline: null,
      usableTokens: null,
      usablePercent: null,
      available: null,
    };
  }
}

/**
 * Create context API router
 */
export function createContextRouter(getProjectDir: () => string): Router {
  const router = Router();

  // Context API - GET current context usage
  router.get('/', (_req, res) => {
    const projectDir = getProjectDir();
    const context = getContextUsage(projectDir);
    res.json(context);
  });

  return router;
}
