import { Router } from 'express';
import {
  getEnrichedSpans,
  clearEnrichedSpans,
  filterSpans,
  type SpanFilter,
} from '../enriched-span-exporter.js';

export function createSpansRouter(): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    try {
      const spans = await getEnrichedSpans();
      res.json({ spans, total: spans.length });
    } catch (err) {
      console.error('[Spans] Error fetching spans:', err);
      res.status(500).json({ error: 'Failed to fetch spans' });
    }
  });

  router.get('/filter', async (req, res) => {
    try {
      const spans = await getEnrichedSpans();
      const filter: SpanFilter = req.query as unknown as SpanFilter;
      const filtered = filterSpans(spans, filter);
      res.json({ spans: filtered, total: filtered.length });
    } catch (err) {
      console.error('[Spans] Error filtering spans:', err);
      res.status(500).json({ error: 'Failed to filter spans' });
    }
  });

  router.delete('/', (_req, res) => {
    clearEnrichedSpans();
    res.json({ success: true });
  });

  return router;
}
