import { Router } from 'express';
import { execFile } from 'child_process';
import { join } from 'path';

export function createDeadCodeRouter(getProjectDir: () => string): Router {
  const router = Router();

  // GET /api/dead-code?days=180&repo=pennyfarthing&layer=all
  router.get('/', (req, res) => {
    const projectDir = getProjectDir();
    const days = String(req.query.days || '180');
    const repo = req.query.repo as string | undefined;
    const layer = String(req.query.layer || 'all');

    const args = [
      '-m', 'pennyfarthing_scripts.deadcode',
      layer,
      '--format', 'json',
      '--days', days,
    ];

    if (repo) {
      args.push('--repo', repo);
    } else {
      args.push('--path', projectDir);
    }

    const pythonPath = join(projectDir, 'pennyfarthing');

    execFile('python3', args, {
      cwd: pythonPath,
      env: { ...process.env, PYTHONPATH: pythonPath },
      timeout: 30000,
    }, (err, stdout, stderr) => {
      if (err) {
        console.error('[DeadCode] Analysis failed:', stderr || err.message);
        res.status(500).json({ success: false, error: stderr || err.message });
        return;
      }

      try {
        const data = JSON.parse(stdout);
        res.json(data);
      } catch (parseErr) {
        console.error('[DeadCode] JSON parse failed:', parseErr);
        res.status(500).json({ success: false, error: 'Failed to parse dead code analysis output' });
      }
    });
  });

  return router;
}
