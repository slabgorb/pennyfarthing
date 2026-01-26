import { Router } from 'express';
import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import { detectPennyfarthingProject } from '../pennyfarthing.js';

// Git info interface
export interface GitInfo {
  branch: string;
  clean: boolean;
  ahead: number | null;
  behind: number | null;
}

// Extended git info with repo name for multi-repo display
export interface RepoGitInfo extends GitInfo {
  name: string;
  path: string;
}

// Repo config from pennyfarthing-settings.yaml
interface RepoConfig {
  name: string;
  path: string;
}

/**
 * Get repos from pennyfarthing-settings.yaml
 * Returns array of repo configs, falls back to single repo (current dir) if none configured
 */
export function getReposFromConfig(projectDir: string): RepoConfig[] {
  const configPath = join(projectDir, '.claude', 'project', 'pennyfarthing-settings.yaml');

  if (!existsSync(configPath)) {
    // No config - return current directory as single repo
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
    console.warn('[Git API] Failed to parse pennyfarthing-settings.yaml:', err);
    const dirName = projectDir.split('/').pop() || 'project';
    return [{ name: dirName, path: '.' }];
  }
}

/**
 * Get git status for all configured repos
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
    };
  });
}

// Get git status for project
export function getGitInfo(projectDir: string): GitInfo | null {
  try {
    // Get current branch
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: projectDir,
      encoding: 'utf-8',
    }).trim();

    // Check if clean using diff-index (faster, doesn't hold lock like --porcelain)
    let clean = true;
    try {
      execSync('git diff-index --quiet HEAD --', {
        cwd: projectDir,
        encoding: 'utf-8',
      });
      clean = true;
    } catch {
      // Exit code 1 means there are changes
      clean = false;
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

    return { branch, clean, ahead, behind };
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

// Create git API router
export function createGitRouter(getProjectDir: () => string): Router {
  const router = Router();

  // Git API - GET current git status
  router.get('/', (_req, res) => {
    const projectDir = getProjectDir();

    if (!detectPennyfarthingProject(projectDir)) {
      return res.status(404).json({ error: 'Not a Pennyfarthing project' });
    }

    const gitInfo = getGitInfo(projectDir);
    if (!gitInfo) {
      return res.status(404).json({ error: 'Not a git repository' });
    }

    res.json(gitInfo);
  });

  // Git API - GET status for all configured repos
  router.get('/all', (_req, res) => {
    const projectDir = getProjectDir();

    if (!detectPennyfarthingProject(projectDir)) {
      return res.status(404).json({ error: 'Not a Pennyfarthing project' });
    }

    const allReposInfo = getAllReposGitInfo(projectDir);
    res.json(allReposInfo);
  });

  return router;
}
