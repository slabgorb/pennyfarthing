import { Router } from 'express';
import { execFile } from 'child_process';
import { join } from 'path';

export function createComplexityRouter(getProjectDir: () => string): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const projectDir = getProjectDir();
    const top = req.query.top as string | undefined;

    const args = [
      '-m', 'pf.complexity',
      'analyze',
      '--format', 'json',
      '--path', projectDir,
    ];

    if (top) {
      args.push('--top', top);
    }

    const pythonPath = join(projectDir, 'pennyfarthing', 'pennyfarthing-dist');

    execFile('python3', args, {
      cwd: pythonPath,
      env: { ...process.env, PYTHONPATH: pythonPath },
      timeout: 30000,
    }, (err, stdout, stderr) => {
      if (err) {
        console.error('[Complexity] Analysis failed:', stderr || err.message);
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
        console.error('[Complexity] JSON parse failed:', parseErr);
        res.status(500).json({
          success: false,
          error: 'Failed to parse complexity analysis output',
        });
      }
    });
  });

  return router;
}
