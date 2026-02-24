import { Router } from 'express';
import { execFile } from 'child_process';
import { join } from 'path';

export function createDependenciesRouter(getProjectDir: () => string): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const projectDir = getProjectDir();

    const args = [
      '-m', 'pf.dependencies',
      'analyze',
      '--format', 'json',
      '--path', projectDir,
    ];

    const pythonPath = join(projectDir, 'pennyfarthing', 'pennyfarthing-dist');

    execFile('python3', args, {
      cwd: pythonPath,
      env: { ...process.env, PYTHONPATH: pythonPath },
      timeout: 30000,
    }, (err, stdout, stderr) => {
      if (err) {
        console.error('[Dependencies] Analysis failed:', stderr || err.message);
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
        console.error('[Dependencies] JSON parse failed:', parseErr);
        res.status(500).json({
          success: false,
          error: 'Failed to parse dependencies analysis output',
        });
      }
    });
  });

  return router;
}
