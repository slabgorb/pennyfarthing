import { Router } from 'express';
import { execSync } from 'child_process';
import { detectPennyfarthingProject } from '../pennyfarthing.js';
// Get git status for project
export function getGitInfo(projectDir) {
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
        }
        catch {
            // Exit code 1 means there are changes
            clean = false;
        }
        // Get ahead/behind counts (suppress stderr for branches without upstream)
        let ahead = null;
        let behind = null;
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
        }
        catch {
            // No upstream configured - leave as null
        }
        return { branch, clean, ahead, behind };
    }
    catch (error) {
        // Not a git repo or git command failed - return null gracefully
        // Handles: not a git repository, EPIPE, ENOENT, etc.
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorCode = error?.code;
        // Log non-trivial errors for debugging but don't crash
        if (!errorMessage.includes('not a git repository')) {
            console.warn(`getGitInfo failed (${errorCode || 'unknown'}): ${errorMessage}`);
        }
        return null;
    }
}
// Create git API router
export function createGitRouter(getProjectDir) {
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
//# sourceMappingURL=git.js.map