/**
 * Spans API Router - Story MSSCI-11734
 *
 * REST API for enriched span data with filtering, pagination, and export.
 *
 * Endpoints:
 * - GET /api/spans - List all enriched spans (with filtering and pagination)
 * - GET /api/spans/export - Export spans as JSON with metadata
 * - GET /api/spans/summary - Get span statistics
 * - GET /api/spans/:spanId - Get single span details
 */

import { Router } from 'express';
import {
  getEnrichedSpans,
  filterSpans,
  formatSpanForExport,
  exportEnrichedSpans,
  type SpanFilter,
} from '../enriched-span-exporter.js';

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Parse and validate filter parameters from query string
 */
function parseFilters(query: Record<string, unknown>): SpanFilter | { error: string } {
  const filter: SpanFilter = {};

  // Parse tool types
  if (query.toolType) {
    const toolType = String(query.toolType);
    filter.toolTypes = toolType.split(',').map((t) => t.trim());
  }

  // Parse status
  if (query.status) {
    const status = String(query.status);
    if (status !== 'success' && status !== 'error') {
      return { error: `Invalid status value: ${status}. Must be 'success' or 'error'` };
    }
    filter.status = status;
  }

  // Parse time range
  if (query.startTime !== undefined) {
    const startTime = Number(query.startTime);
    if (isNaN(startTime)) {
      return { error: 'Invalid startTime: must be a number' };
    }
    filter.startTime = startTime;
  }

  if (query.endTime !== undefined) {
    const endTime = Number(query.endTime);
    if (isNaN(endTime)) {
      return { error: 'Invalid endTime: must be a number' };
    }
    filter.endTime = endTime;
  }

  return filter;
}

/**
 * Parse and validate pagination parameters
 */
function parsePagination(
  query: Record<string, unknown>
): { offset: number; limit: number } | { error: string } {
  let offset = 0;
  let limit = DEFAULT_LIMIT;

  if (query.offset !== undefined) {
    offset = Number(query.offset);
    if (isNaN(offset) || offset < 0) {
      return { error: 'Invalid offset: must be a non-negative number' };
    }
  }

  if (query.limit !== undefined) {
    limit = Number(query.limit);
    if (isNaN(limit) || limit < 1) {
      return { error: 'Invalid limit: must be a positive number' };
    }
    limit = Math.min(limit, MAX_LIMIT);
  }

  return { offset, limit };
}

// =============================================================================
// Router Factory
// =============================================================================

/**
 * Create spans API router
 */
export function createSpansRouter(): Router {
  const router = Router();

  /**
   * GET /api/spans
   *
   * Returns list of enriched spans with filtering and pagination.
   *
   * Query parameters:
   * - toolType: Filter by tool type(s), comma-separated (e.g., "Bash,Read")
   * - status: Filter by status ("success" or "error")
   * - startTime: Filter spans starting after this Unix timestamp (ms)
   * - endTime: Filter spans starting before this Unix timestamp (ms)
   * - offset: Pagination offset (default: 0)
   * - limit: Pagination limit (default: 100, max: 1000)
   */
  router.get('/', async (req, res) => {
    try {
      // Parse filters
      const filterResult = parseFilters(req.query as Record<string, unknown>);
      if ('error' in filterResult) {
        return res.status(400).json({ error: filterResult.error });
      }

      // Parse pagination
      const paginationResult = parsePagination(req.query as Record<string, unknown>);
      if ('error' in paginationResult) {
        return res.status(400).json({ error: paginationResult.error });
      }

      const { offset, limit } = paginationResult;

      // Get all spans
      const allSpans = await getEnrichedSpans();

      // Return 404 if no spans
      if (allSpans.length === 0) {
        return res.status(404).json({ error: 'No spans available' });
      }

      // Apply filters
      const filteredSpans = filterSpans(allSpans, filterResult);

      // Apply pagination
      const paginatedSpans = filteredSpans.slice(offset, offset + limit);

      // Format for response
      const formattedSpans = paginatedSpans.map(formatSpanForExport);

      res.json({
        spans: formattedSpans,
        total: filteredSpans.length,
        offset,
        limit,
      });
    } catch (error) {
      console.error('[Spans API] Error fetching spans:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * GET /api/spans/export
   *
   * Export enriched spans as JSON with metadata and summary.
   * Supports same filter parameters as GET /api/spans.
   * Add ?download=true to set Content-Disposition for file download.
   */
  router.get('/export', async (req, res) => {
    try {
      // Parse filters
      const filterResult = parseFilters(req.query as Record<string, unknown>);
      if ('error' in filterResult) {
        return res.status(400).json({ error: filterResult.error });
      }

      // Get all spans
      const allSpans = await getEnrichedSpans();

      // Export with filter
      const exported = exportEnrichedSpans(allSpans, filterResult);

      // Set download header if requested
      if (req.query.download === 'true') {
        const filename = `cyclist-spans-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      }

      res.json(exported);
    } catch (error) {
      console.error('[Spans API] Error exporting spans:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * GET /api/spans/summary
   *
   * Returns summary statistics for all spans.
   */
  router.get('/summary', async (req, res) => {
    try {
      // Get all spans
      const allSpans = await getEnrichedSpans();

      // Return 404 if no spans
      if (allSpans.length === 0) {
        return res.status(404).json({ error: 'No spans available' });
      }

      // Calculate statistics
      const byToolType: Record<string, number> = {};
      let totalDurationMs = 0;
      let successCount = 0;
      let errorCount = 0;
      let earliest = Infinity;
      let latest = 0;

      for (const span of allSpans) {
        byToolType[span.toolName] = (byToolType[span.toolName] || 0) + 1;
        totalDurationMs += span.durationMs;

        if (span.success) {
          successCount++;
        } else {
          errorCount++;
        }

        if (span.startTime < earliest) {
          earliest = span.startTime;
        }
        if (span.startTime > latest) {
          latest = span.startTime;
        }
      }

      res.json({
        totalSpans: allSpans.length,
        successCount,
        errorCount,
        totalDurationMs,
        byToolType,
        timeRange: {
          earliest: earliest === Infinity ? null : earliest,
          latest: latest === 0 ? null : latest,
        },
      });
    } catch (error) {
      console.error('[Spans API] Error getting summary:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * GET /api/spans/:spanId
   *
   * Returns a single span by ID with full enrichment data.
   */
  router.get('/:spanId', async (req, res) => {
    try {
      const { spanId } = req.params;

      // Get all spans
      const allSpans = await getEnrichedSpans();

      // Find the span
      const span = allSpans.find((s) => s.spanId === spanId);

      if (!span) {
        return res.status(404).json({ error: `Span not found: ${spanId}` });
      }

      // Format and return
      const formatted = formatSpanForExport(span);
      res.json(formatted);
    } catch (error) {
      console.error('[Spans API] Error fetching span:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
