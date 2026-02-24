import { Router } from 'express';
import {
  getAuditLog,
  getToolEventsFiltered,
  getToolTypes,
  getAuditLogStats,
  exportAuditLogAsJSON,
  exportAuditLogAsCSV,
  resetEventStore,
} from '../otlp-receiver.js';

export function createAuditLogRouter(): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const log = getAuditLog();
    res.json({ entries: log, total: log.length });
  });

  router.get('/events', (req, res) => {
    const events = getToolEventsFiltered(req.query);
    res.json({ events, total: events.length });
  });

  router.get('/types', (_req, res) => {
    res.json({ types: getToolTypes() });
  });

  router.get('/stats', (_req, res) => {
    res.json(getAuditLogStats());
  });

  router.get('/export/json', (_req, res) => {
    res.type('application/json').send(exportAuditLogAsJSON());
  });

  router.get('/export/csv', (_req, res) => {
    res.type('text/csv').send(exportAuditLogAsCSV());
  });

  router.delete('/', (_req, res) => {
    resetEventStore();
    res.json({ success: true });
  });

  return router;
}
