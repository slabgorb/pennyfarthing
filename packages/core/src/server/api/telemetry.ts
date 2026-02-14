import { Router } from 'express';
import { getTDDMetrics } from '../tdd-metrics.js';
import { getSpanHierarchy } from '../span-hierarchy.js';
import { getTokenStatsByAgent } from '../agent-context.js';
import { getTokenStatsByStory } from '../story-context.js';

export function createTelemetryRouter(): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const metrics = getTDDMetrics();
    res.json({ metrics });
  });

  router.get('/tdd', (_req, res) => {
    const metrics = getTDDMetrics();
    res.json({ metrics });
  });

  router.get('/hierarchy', (_req, res) => {
    const hierarchy = getSpanHierarchy();
    res.json({ hierarchy });
  });

  router.get('/by-agent', (_req, res) => {
    const stats = getTokenStatsByAgent();
    res.json({ stats });
  });

  router.get('/by-story', (_req, res) => {
    const stats = getTokenStatsByStory();
    res.json({ stats });
  });

  return router;
}
