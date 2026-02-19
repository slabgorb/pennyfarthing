/**
 * Code Markers API route — Story 80-3 (MSSCI-14456)
 *
 * GET /api/code-markers?repo=pennyfarthing&days=90&type=all|stale|deprecated
 * Thin wrapper calling Python codemarkers module via execFile.
 */
import { Router } from 'express';
import { execFile } from 'child_process';
import { join } from 'path';

export function createCodeMarkersRouter(getProjectDir: () => string): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const projectDir = getProjectDir();
    const days = String(req.query.days || '90');
    const repo = req.query.repo as string | undefined;
    const type = req.query.type as string | undefined;

    const args = [
      '-m', 'pf.codemarkers',
      'analyze',
      '--format', 'json',
      '--days', days,
    ];

    if (repo) {
      args.push('--repo', repo);
    } else {
      args.push('--path', projectDir);
    }

    if (type) {
      args.push('--type', type);
    }

    const pythonPath = join(projectDir, 'pennyfarthing', 'pennyfarthing-dist');

    execFile('python3', args, {
      cwd: pythonPath,
      env: { ...process.env, PYTHONPATH: pythonPath },
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    }, (err, stdout, stderr) => {
      if (err) {
        console.error('[CodeMarkers] Analysis failed:', stderr || err.message);
        res.status(500).json({
          success: false,
          error: stderr || err.message,
        });
        return;
      }

      try {
        const data = JSON.parse(stdout);
        res.json(data);
      } catch (parseErr) {
        console.error('[CodeMarkers] JSON parse failed:', parseErr);
        res.status(500).json({
          success: false,
          error: 'Failed to parse code markers analysis output',
        });
      }
    });
  });

  return router;
}
