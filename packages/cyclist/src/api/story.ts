import { Router } from 'express';
import { getStoryInfo } from '../story-parser.js';

// Create story API router
export function createStoryRouter(getProjectDir: () => string): Router {
  const router = Router();

  // Story API - GET current story info
  // Returns graceful empty response (id: null) when no session exists
  router.get('/', (_req, res) => {
    const projectDir = getProjectDir();
    const storyInfo = getStoryInfo(projectDir);
    res.json(storyInfo);
  });

  return router;
}
