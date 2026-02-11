import { Router } from 'express';
import { execFile } from 'child_process';
import { join } from 'path';

export function createHealthScoreRouter(getProjectDir: () => string): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const projectDir = getProjectDir();
    const args = ['-m', 'pennyfarthing_scripts.healthscore', 'analyze', '--format', 'json', '--no-cache'];
    const pythonPath = join(projectDir, 'pennyfarthing');

    console.log('[HealthScore] Starting analysis, cwd=%s, PYTHONPATH=%s', pythonPath, pythonPath);

    execFile('python3', args, {
      cwd: pythonPath,
      env: { ...process.env, PYTHONPATH: pythonPath },
      timeout: 60000,
    }, (err, stdout, stderr) => {
      // Always log stderr — it contains per-dimension probe logs
      if (stderr) {
        console.log('[HealthScore] Python stderr:\n%s', stderr);
      }

      if (err) {
        console.error('[HealthScore] Analysis failed:', err.message);
        res.status(500).json({
          success: false,
          error: stderr || err.message,
        });
        return;
      }

      try {
        const data = JSON.parse(stdout);
        const dims = data.dimensions || [];
        const scored = dims.filter((d: { score: number | null }) => d.score !== null).length;
        console.log('[HealthScore] Success: composite=%.1f, %d/%d dimensions scored',
          data.composite_score, scored, dims.length);
        res.json(data);
      } catch (parseErr) {
        console.error('[HealthScore] JSON parse failed:', parseErr);
        console.error('[HealthScore] Raw stdout: %s', stdout.slice(0, 500));
        res.status(500).json({
          success: false,
          error: 'Failed to parse health score output',
        });
      }
    });
  });

  return router;
}
