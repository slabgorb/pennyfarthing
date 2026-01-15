import { Router } from 'express';
import {
  parseOTLPMetrics,
  aggregateTokenStats,
  parseOTLPLogs,
  processLogEvents,
} from '../otlp-receiver.js';

// Create OTLP API router for OpenTelemetry metrics/logs
export function createOTLPRouter(): Router {
  const router = Router();

  // OTLP Metrics Receiver - POST endpoint for OpenTelemetry metrics
  router.post('/metrics', (req, res) => {
    try {
      const parsed = parseOTLPMetrics(req.body);
      aggregateTokenStats(parsed);

      // Log received metrics for debugging (AC5)
      if (Object.keys(parsed).length > 0) {
        console.log('[OTLP] Received token metrics:', parsed);
      }

      res.status(200).send();
    } catch (error) {
      // Gracefully handle errors - still return 200 per OTLP spec
      console.error('[OTLP] Error processing metrics:', error);
      res.status(200).send();
    }
  });

  // OTLP Logs/Events Receiver - POST endpoint for OpenTelemetry events
  // Story 19-1: Parse tool and prompt events from Claude Code
  router.post('/logs', (req, res) => {
    try {
      // Parse OTLP logs payload into raw events
      const rawEvents = parseOTLPLogs(req.body);


      // Process and store tool/prompt events
      if (rawEvents.length > 0) {
        processLogEvents(rawEvents);
        console.log(`[OTLP] Processed ${rawEvents.length} log event(s)`);
      }

      res.status(200).send();
    } catch (error) {
      // Gracefully handle errors - still return 200 per OTLP spec
      console.error('[OTLP] Error processing logs:', error);
      res.status(200).send();
    }
  });

  return router;
}
