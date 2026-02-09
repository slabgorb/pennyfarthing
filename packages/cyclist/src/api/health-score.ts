import { Router } from 'express';
import { execFile } from 'child_process';
import { join } from 'path';

export function createHealthScoreRouter(getProjectDir: () => string): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const projectDir = getProjectDir();
    const args = ['-m', 'pennyfarthing_scripts.healthscore', 'analyze', '--format', 'json'];
    const pythonPath = join(projectDir, 'pennyfarthing');

    execFile('python3', args, {
      cwd: projectDir,
      env: { ...process.env, PYTHONPATH: pythonPath },
      timeout: 15000,
    }, (err, stdout, stderr) => {
      if (err) {
        console.error('[HealthScore] Analysis failed:', stderr || err.message);
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
        console.error('[HealthScore] JSON parse failed:', parseErr);
        res.status(500).json({
          success: false,
          error: 'Failed to parse health score output',
        });
      }
    });
  });

  return router;
}
