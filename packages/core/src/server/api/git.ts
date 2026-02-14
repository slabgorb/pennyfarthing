import { Router } from 'express';
import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import { detectPennyfarthingProject } from '../pennyfarthing.js';

const execAsync = promisify(exec);

/**
 * Per-repo mutex to prevent concurrent git operations that cause lock conflicts
 * Maps repo path to a promise that resolves when the current operation completes
 */
const repoLocks = new Map<string, Promise<void>>();

/**
 * Per-repo git fetch cooldown to prevent frequent network calls during active sessions.
 * Maps repo path to the timestamp of the last successful git fetch.
 * Story 103-21
 */
const lastFetchTimes = new Map<string, number>();

/** Default cooldown between git fetch calls per repo (ms). */
export const GIT_FETCH_COOLDOWN_MS = 60_000;

/**
 * Acquire a lock for a repo, ensuring only one git operation runs at a time
 * Returns a release function to call when done
 */
async function acquireRepoLock(repoPath: string): Promise<() => void> {
  // Wait for any existing operation to complete
  const existingLock = repoLocks.get(repoPath);
  if (existingLock) {
    await existingLock;
  }

  // Create a new lock
  let releaseLock: () => void;
  const lockPromise = new Promise<void>(resolve => {
    releaseLock = resolve;
  });
  repoLocks.set(repoPath, lockPromise);

  return () => {
    releaseLock!();
    // Clean up the lock after a short delay to allow batched requests
    setTimeout(() => {
      if (repoLocks.get(repoPath) === lockPromise) {
        repoLocks.delete(repoPath);
      }
    }, 100);
  };
}

// Dirty file info
export interface DirtyFile {
  status: string;  // M, A, D, ?, etc.
  path: string;
}

// Git info interface
export interface GitInfo {
  branch: string;
  clean: boolean;
  ahead: number | null;
  behind: number | null;
  dirtyFiles: DirtyFile[];
  /** Commits that origin/develop has that local branch doesn't (needs pull/rebase) */
  developBehind: number | null;
}

// Extended git info with repo name for multi-repo display
export interface RepoGitInfo extends GitInfo {
  name: string;
  path: string;
}

// Repo config from repos.yaml
interface RepoConfig {
  name: string;
  path: string;
}

/**
 * Get repos from repos.yaml
 * Checks project root first, then .claude/project/ fallback.
 * Returns array of repo configs, falls back to single repo (current dir) if none configured.
 */
export function getReposFromConfig(projectDir: string): RepoConfig[] {
  // Check .pennyfarthing/ first (canonical runtime location), then project root fallback
  const candidates = [
    join(projectDir, '.pennyfarthing', 'repos.yaml'),
    join(projectDir, 'repos.yaml'),
  ];
  const configPath = candidates.find(p => existsSync(p));

  if (!configPath) {
    const dirName = projectDir.split('/').pop() || 'project';
    return [{ name: dirName, path: '.' }];
  }

  try {
    const configContent = readFileSync(configPath, 'utf-8');
    const config = parseYaml(configContent);

    if (!config?.repos || typeof config.repos !== 'object') {
      const dirName = projectDir.split('/').pop() || 'project';
      return [{ name: dirName, path: '.' }];
    }

    const repos: RepoConfig[] = [];
    for (const [name, repoConfig] of Object.entries(config.repos)) {
      const rc = repoConfig as Record<string, unknown> | null;
      repos.push({
        name,
        path: (rc?.path as string) || name,
      });
    }

    return repos.length > 0 ? repos : [{ name: projectDir.split('/').pop() || 'project', path: '.' }];
  } catch (err) {
    console.warn('[Git API] Failed to parse repos.yaml:', err);
    const dirName = projectDir.split('/').pop() || 'project';
    return [{ name: dirName, path: '.' }];
  }
}

/**
 * Get git status for all configured repos (sync - blocks event loop, use getAllReposGitInfoAsync when possible)
 */
export function getAllReposGitInfo(projectDir: string): RepoGitInfo[] {
  const repos = getReposFromConfig(projectDir);

  return repos.map(repo => {
    const repoPath = join(projectDir, repo.path);
    const gitInfo = getGitInfo(repoPath);

    return {
      name: repo.name,
      path: repo.path,
      branch: gitInfo?.branch || 'unknown',
      clean: gitInfo?.clean ?? true,
      ahead: gitInfo?.ahead ?? null,
      behind: gitInfo?.behind ?? null,
      developBehind: gitInfo?.developBehind ?? null,
      dirtyFiles: gitInfo?.dirtyFiles ?? [],
    };
  });
}

/**
 * Get git status for all configured repos (async - does not block event loop)
 */
export async function getAllReposGitInfoAsync(projectDir: string): Promise<RepoGitInfo[]> {
  const repos = getReposFromConfig(projectDir);

  const results = await Promise.all(repos.map(async repo => {
    const repoPath = join(projectDir, repo.path);
    const gitInfo = await getGitInfoAsync(repoPath);

    return {
      name: repo.name,
      path: repo.path,
      branch: gitInfo?.branch || 'unknown',
      clean: gitInfo?.clean ?? true,
      ahead: gitInfo?.ahead ?? null,
      behind: gitInfo?.behind ?? null,
      developBehind: gitInfo?.developBehind ?? null,
      dirtyFiles: gitInfo?.dirtyFiles ?? [],
    };
  }));

  return results;
}

// Get git status for project (sync - blocks event loop)
export function getGitInfo(projectDir: string): GitInfo | null {
  try {
    // Get current branch
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: projectDir,
      encoding: 'utf-8',
    }).trim();

    // Get dirty files using --porcelain for parseable output
    let dirtyFiles: DirtyFile[] = [];
    let clean = true;
    try {
      const statusOutput = execSync('git status --porcelain', {
        cwd: projectDir,
        encoding: 'utf-8',
      }).trim();

      if (statusOutput) {
        clean = false;
        dirtyFiles = statusOutput.split('\n').map(line => {
          const status = line.substring(0, 2).trim() || '?';
          const path = line.substring(3);
          return { status, path };
        });
      }
    } catch {
      // Fall back to diff-index check if porcelain fails
      try {
        execSync('git diff-index --quiet HEAD --', {
          cwd: projectDir,
          encoding: 'utf-8',
        });
        clean = true;
      } catch {
        clean = false;
      }
    }

    // Get ahead/behind counts (suppress stderr for branches without upstream)
    let ahead: number | null = null;
    let behind: number | null = null;
    try {
      const aheadOutput = execSync('git rev-list --count @{u}..HEAD', {
        cwd: projectDir,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      ahead = parseInt(aheadOutput.trim(), 10);

      const behindOutput = execSync('git rev-list --count HEAD..@{u}', {
        cwd: projectDir,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      behind = parseInt(behindOutput.trim(), 10);
    } catch {
      // No upstream configured - leave as null
    }

    // Get commits that origin/develop has that current branch doesn't
    let developBehind: number | null = null;
    try {
      const developBehindOutput = execSync('git rev-list --count HEAD..origin/develop', {
        cwd: projectDir,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      developBehind = parseInt(developBehindOutput.trim(), 10);
    } catch {
      // origin/develop doesn't exist - leave as null
    }

    return { branch, clean, ahead, behind, dirtyFiles, developBehind };
  } catch (error) {
    // Not a git repo or git command failed - return null gracefully
    // Handles: not a git repository, EPIPE, ENOENT, etc.
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode = (error as NodeJS.ErrnoException)?.code;

    // Log non-trivial errors for debugging but don't crash
    if (!errorMessage.includes('not a git repository')) {
      console.warn(`getGitInfo failed (${errorCode || 'unknown'}): ${errorMessage}`);
    }

    return null;
  }
}

/**
 * Get git status for project (async - does not block event loop)
 * This should be preferred over getGitInfo for WebSocket broadcasts and polling
 * Uses a per-repo mutex to prevent git lock conflicts from concurrent operations
 */
export async function getGitInfoAsync(projectDir: string): Promise<GitInfo | null> {
  // Acquire lock to prevent concurrent git operations on the same repo
  const releaseLock = await acquireRepoLock(projectDir);

  try {
    // Fetch latest refs from remote (quiet, no output)
    // Throttled: only fetch once per GIT_FETCH_COOLDOWN_MS per repo (Story 103-21)
    const now = Date.now();
    const lastFetch = lastFetchTimes.get(projectDir) ?? 0;
    if (now - lastFetch >= GIT_FETCH_COOLDOWN_MS) {
      try {
        await execAsync('git fetch --quiet', {
          cwd: projectDir,
          encoding: 'utf-8',
          timeout: 10000, // 10s timeout for network operation
        });
        lastFetchTimes.set(projectDir, Date.now());
      } catch {
        // Fetch failed (offline, no remote, etc.) - continue with local refs
      }
    }

    // Get current branch
    const { stdout: branchOutput } = await execAsync('git rev-parse --abbrev-ref HEAD', {
      cwd: projectDir,
      encoding: 'utf-8',
    });
    const branch = branchOutput.trim();

    // Get dirty files using --porcelain for parseable output
    let dirtyFiles: DirtyFile[] = [];
    let clean = true;
    try {
      const { stdout: statusOutput } = await execAsync('git status --porcelain', {
        cwd: projectDir,
        encoding: 'utf-8',
      });

      if (statusOutput.trim()) {
        clean = false;
        dirtyFiles = statusOutput.trim().split('\n').map(line => {
          const status = line.substring(0, 2).trim() || '?';
          const path = line.substring(3);
          return { status, path };
        });
      }
    } catch {
      // Fall back to diff-index check if porcelain fails
      try {
        await execAsync('git diff-index --quiet HEAD --', {
          cwd: projectDir,
          encoding: 'utf-8',
        });
        clean = true;
      } catch {
        clean = false;
      }
    }

    // Get ahead/behind counts vs tracking branch
    let ahead: number | null = null;
    let behind: number | null = null;
    try {
      const { stdout: aheadOutput } = await execAsync('git rev-list --count @{u}..HEAD', {
        cwd: projectDir,
        encoding: 'utf-8',
      });
      ahead = parseInt(aheadOutput.trim(), 10);

      const { stdout: behindOutput } = await execAsync('git rev-list --count HEAD..@{u}', {
        cwd: projectDir,
        encoding: 'utf-8',
      });
      behind = parseInt(behindOutput.trim(), 10);
    } catch {
      // No upstream configured - leave as null
    }

    // Get commits that origin/develop has that current branch doesn't
    // This alerts when develop has moved ahead (work done in another clone)
    let developBehind: number | null = null;
    try {
      const { stdout: developBehindOutput } = await execAsync(
        'git rev-list --count HEAD..origin/develop',
        { cwd: projectDir, encoding: 'utf-8' }
      );
      developBehind = parseInt(developBehindOutput.trim(), 10);
    } catch {
      // origin/develop doesn't exist or other error - leave as null
    }

    releaseLock();
    return { branch, clean, ahead, behind, dirtyFiles, developBehind };
  } catch (error) {
    releaseLock();
    // Not a git repo or git command failed - return null gracefully
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode = (error as NodeJS.ErrnoException)?.code;

    // Log non-trivial errors for debugging but don't crash
    if (!errorMessage.includes('not a git repository')) {
      console.warn(`getGitInfoAsync failed (${errorCode || 'unknown'}): ${errorMessage}`);
    }

    return null;
  }
}

/**
 * Reset the fetch cooldown for a repo, allowing the next getGitInfoAsync call
 * to perform a git fetch immediately. Used by force-refresh paths.
 * Story 103-21
 */
export function resetFetchCooldown(projectDir?: string): void {
  if (projectDir) {
    lastFetchTimes.delete(projectDir);
  } else {
    lastFetchTimes.clear();
  }
}

// Callback for forcing git refresh (set by websocket.ts)
let forceRefreshCallback: ((projectDir: string) => Promise<void>) | null = null;

export function setForceRefreshCallback(callback: (projectDir: string) => Promise<void>): void {
  forceRefreshCallback = callback;
}

// Create git API router
export function createGitRouter(getProjectDir: () => string): Router {
  const router = Router();

  // Git API - POST to force refresh (debugging/manual trigger)
  router.post('/refresh', async (_req, res) => {
    const projectDir = getProjectDir();
    console.log('[Git API] POST /refresh called, projectDir:', projectDir);

    if (!detectPennyfarthingProject(projectDir)) {
      console.log('[Git API] Not a Pennyfarthing project');
      return res.status(404).json({ error: 'Not a Pennyfarthing project' });
    }

    if (forceRefreshCallback) {
      console.log('[Git API] Calling forceRefreshCallback...');
      resetFetchCooldown(projectDir);
      await forceRefreshCallback(projectDir);
      console.log('[Git API] forceRefreshCallback complete');
      res.json({ success: true, message: 'Git cache refreshed and broadcast sent' });
    } else {
      console.log('[Git API] No forceRefreshCallback registered!');
      res.status(500).json({ error: 'Refresh callback not registered' });
    }
  });

  // Git API - GET current git status (async to avoid blocking event loop)
  router.get('/', async (_req, res) => {
    const projectDir = getProjectDir();

    if (!detectPennyfarthingProject(projectDir)) {
      return res.status(404).json({ error: 'Not a Pennyfarthing project' });
    }

    const gitInfo = await getGitInfoAsync(projectDir);
    if (!gitInfo) {
      return res.status(404).json({ error: 'Not a git repository' });
    }

    res.json(gitInfo);
  });

  // Git API - GET status for all configured repos (async to avoid blocking event loop)
  router.get('/all', async (_req, res) => {
    const projectDir = getProjectDir();

    if (!detectPennyfarthingProject(projectDir)) {
      return res.status(404).json({ error: 'Not a Pennyfarthing project' });
    }

    const allReposInfo = await getAllReposGitInfoAsync(projectDir);
    res.json(allReposInfo);
  });

  return router;
}
