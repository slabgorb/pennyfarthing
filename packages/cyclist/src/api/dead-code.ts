import { Router } from 'express';
import { execFile } from 'child_process';
import { join } from 'path';

function runDeadCodeCommand(
  command: 'stale' | 'exports',
  projectDir: string,
  days: string,
  repo: string | undefined,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const args = ['-m', 'pennyfarthing_scripts.deadcode', command, '--format', 'json'];

    if (command === 'stale') {
      args.push('--days', days);
    }

    if (repo) {
      args.push('--repo', repo);
    } else {
      args.push('--path', projectDir);
    }

    const pythonPath = join(projectDir, 'pennyfarthing');

    execFile('python3', args, {
      cwd: projectDir,
      env: { ...process.env, PYTHONPATH: pythonPath },
      timeout: 30000,
    }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error('Failed to parse dead code analysis output'));
      }
    });
  });
}

export function createDeadCodeRouter(getProjectDir: () => string): Router {
  const router = Router();

  // GET /api/dead-code?days=180&repo=pennyfarthing&layer=all|stale|exports
  router.get('/', async (req, res) => {
    const projectDir = getProjectDir();
    const days = String(req.query.days || '180');
    const repo = req.query.repo as string | undefined;
    const layer = String(req.query.layer || 'all');

    try {
      if (layer === 'stale' || layer === 'exports') {
        const data = await runDeadCodeCommand(layer, projectDir, days, repo);
        res.json(data);
      } else {
        // layer=all: run both and merge
        const [staleData, exportsData] = await Promise.all([
          runDeadCodeCommand('stale', projectDir, days, repo),
          runDeadCodeCommand('exports', projectDir, days, repo).catch(() => ({})),
        ]);
        res.json({
          success: true,
          ...staleData,
          unused_exports: (exportsData as Record<string, unknown>).unused_exports ?? [],
          unused_export_count: (exportsData as Record<string, unknown>).unused_export_count ?? 0,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[DeadCode] Analysis failed:', message);
      res.status(500).json({ success: false, error: message });
    }
  });

  return router;
}
