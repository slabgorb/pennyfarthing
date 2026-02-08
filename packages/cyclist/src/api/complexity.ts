import { Router } from 'express';

// Stub: Story 83-3 — Complexity API route
// Dev will implement the full execFile-based handler
export function createComplexityRouter(_getProjectDir: () => string): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.status(501).json({ success: false, error: 'Not implemented' });
  });

  return router;
}
