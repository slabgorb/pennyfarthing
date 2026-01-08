import { Router } from 'express';
import { execSync } from 'child_process';
import { detectPennyfarthingProject } from '../pennyfarthing.js';

// Git info interface
export interface GitInfo {
  branch: string;
  clean: boolean;
  ahead: number | null;
  behind: number | null;
}

// Get git status for project
export function getGitInfo(projectDir: string): GitInfo | null {
  try {
    // Get current branch
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: projectDir,
      encoding: 'utf-8',
    }).trim();

    // Check if clean (no uncommitted changes)
    const status = execSync('git status --porcelain', {
      cwd: projectDir,
      encoding: 'utf-8',
    });
    const clean = status.trim() === '';

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

  return router;
}
