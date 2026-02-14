import { Router } from 'express';
import { getPrimeContextJson } from '../prime.js';
import type { PrimeOutput } from '../prime.js';

export function createAgentLoadRouter(getProjectDir: () => string): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json({ agents: [], summary: null });
  });

  router.get('/:agent', (req, res) => {
    const projectDir = getProjectDir();
    const agent = req.params.agent;
    const output: PrimeOutput | null = getPrimeContextJson(agent, projectDir, 'FULL');
    if (!output) {
      return res.json({ agent, context: null });
    }
    res.json({ agent, context: output });
  });

  return router;
}
