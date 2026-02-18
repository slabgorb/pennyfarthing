/**
 * Project Info API - Expose project directory metadata to frontend
 * Story 110-6: Project directory indicator in TUI header
 */

import { Router } from 'express';
import { basename } from 'path';

export interface ProjectInfo {
  name: string;
  path: string;
}

export function createProjectInfoRouter(getProjectDir: () => string): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const projectDir = getProjectDir();
    res.json({
      name: basename(projectDir),
      path: projectDir,
    });
  });

  return router;
}
