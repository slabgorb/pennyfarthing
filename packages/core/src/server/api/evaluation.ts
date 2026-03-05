import { Router } from 'express';
import {
  getEvaluation,
  getEvaluationResults,
  getEvaluationSummary,
  detectTrend,
  generateRecommendations,
  clearEvaluationResults,
} from '../agent-evaluation.js';

export function createEvaluationRouter(): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const evaluation = getEvaluation();
    res.json({ evaluation });
  });

  router.get('/results', (_req, res) => {
    const results = getEvaluationResults();
    res.json({ results });
  });

  router.get('/summary', (_req, res) => {
    const summary = getEvaluationSummary();
    res.json({ summary });
  });

  router.get('/trend', (req, res) => {
    const agentRole = (req.query.agent as string) ?? 'dev';
    const trend = detectTrend(agentRole);
    res.json({ trend });
  });

  router.get('/recommendations', (_req, res) => {
    const evaluation = getEvaluation();
    const recommendations = evaluation ? generateRecommendations(evaluation) : [];
    res.json({ recommendations });
  });

  router.delete('/', (_req, res) => {
    clearEvaluationResults();
    res.json({ success: true });
  });

  return router;
}
