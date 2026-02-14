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

  router.get('/trend', (_req, res) => {
    const results = getEvaluationResults();
    const trend = detectTrend(results);
    res.json({ trend });
  });

  router.get('/recommendations', (_req, res) => {
    const results = getEvaluationResults();
    const recommendations = generateRecommendations(results);
    res.json({ recommendations });
  });

  router.delete('/', (_req, res) => {
    clearEvaluationResults();
    res.json({ success: true });
  });

  return router;
}
