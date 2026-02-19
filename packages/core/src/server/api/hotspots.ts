import { Router } from 'express';
import { execFile } from 'child_process';
import { join } from 'path';

// Create hotspots API router
export function createHotspotsRouter(getProjectDir: () => string): Router {
  const router = Router();

  // GET /api/hotspots?days=90&repo=pennyfarthing&skip_type=orchestrator
  router.get('/', (req, res) => {
    const projectDir = getProjectDir();
    const days = String(req.query.days || '90');
    const repo = req.query.repo as string | undefined;
    const skipType = req.query.skip_type;

    const args = [
      '-m', 'pf.hotspots',
      'analyze',
      '--format', 'json',
      '--days', days,
    ];

    if (repo) {
      args.push('--repo', repo);
    } else {
      args.push('--path', projectDir);
    }

    // Forward skip_type values to CLI
    if (skipType) {
      const types = Array.isArray(skipType) ? skipType : [skipType];
      for (const t of types) {
        args.push('--skip-type', String(t));
      }
    }

    // Find python in the project's pennyfarthing dir
    const pythonPath = join(projectDir, 'pennyfarthing', 'pennyfarthing-dist');

    execFile('python3', args, {
      cwd: pythonPath,
      env: { ...process.env, PYTHONPATH: pythonPath },
      timeout: 30000,
    }, (err, stdout, stderr) => {
      if (err) {
        console.error('[Hotspots] Analysis failed:', stderr || err.message);
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
        console.error('[Hotspots] JSON parse failed:', parseErr);
        res.status(500).json({
          success: false,
          error: 'Failed to parse hotspot analysis output',
        });
      }
    });
  });

  return router;
}
