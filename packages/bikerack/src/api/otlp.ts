import { Router } from 'express';
import {
  processOTLPLogs,
  processOTLPMetrics,
  processOTLPTraces,
} from '../otlp-receiver.js';

export function createOTLPRouter(): Router {
  const router = Router();

  // OTLP log ingestion endpoint
  router.post('/logs', (req, res) => {
    try {
      processOTLPLogs(req.body);
      res.json({ partialSuccess: {} });
    } catch (err) {
      console.error('[OTLP] Error processing logs:', err);
      res.status(500).json({ error: 'Failed to process logs' });
    }
  });

  // OTLP metrics ingestion endpoint
  router.post('/metrics', (req, res) => {
    try {
      processOTLPMetrics(req.body);
      res.json({ partialSuccess: {} });
    } catch (err) {
      console.error('[OTLP] Error processing metrics:', err);
      res.status(500).json({ error: 'Failed to process metrics' });
    }
  });

  // OTLP traces ingestion endpoint
  router.post('/traces', (req, res) => {
    try {
      processOTLPTraces(req.body);
      res.json({ partialSuccess: {} });
    } catch (err) {
      console.error('[OTLP] Error processing traces:', err);
      res.status(500).json({ error: 'Failed to process traces' });
    }
  });

  return router;
}
