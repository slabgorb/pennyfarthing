/**
 * Audit Log API Router
 *
 * REST API for tool execution audit log with filtering, stats, and export.
 *
 * Endpoints:
 * - GET /api/audit-log - List all tool events (with filtering and pagination)
 * - GET /api/audit-log/types - Get unique tool types
 * - GET /api/audit-log/stats - Get audit log statistics
 * - GET /api/audit-log/export - Export as JSON or CSV
 * - DELETE /api/audit-log - Clear the audit log
 */

import { Router } from 'express';
import {
  getToolEventsFiltered,
  getToolTypes,
  getAuditLogStats,
  exportAuditLogAsJSON,
  exportAuditLogAsCSV,
  resetEventStore,
} from '../otlp-receiver.js';

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

// =============================================================================
// Router Factory
// =============================================================================

/**
 * Create audit log API router
 */
export function createAuditLogRouter(): Router {
  const router = Router();

  /**
   * GET /api/audit-log
   *
   * Returns list of tool events with filtering and pagination.
   *
   * Query parameters:
   * - toolType: Filter by tool type (e.g., "Bash", "Read")
   * - status: Filter by status ("success" or "error")
   * - offset: Pagination offset (default: 0)
   * - limit: Pagination limit (default: 100, max: 1000)
   */
  router.get('/', (req, res) => {
    try {
      const toolType = req.query.toolType as string | undefined;
      const status = req.query.status as string | undefined;

      // Get events (optionally filtered by tool type)
      let events = getToolEventsFiltered(toolType);

      // Filter by status if specified
      if (status === 'success') {
        events = events.filter(e => e.success);
      } else if (status === 'error') {
        events = events.filter(e => !e.success);
      }

      // Parse pagination
      let offset = 0;
      let limit = DEFAULT_LIMIT;

      if (req.query.offset !== undefined) {
        offset = Math.max(0, Number(req.query.offset) || 0);
      }
      if (req.query.limit !== undefined) {
        limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query.limit) || DEFAULT_LIMIT));
      }

      // Apply pagination (newest first)
      const sorted = [...events].reverse();
      const paginated = sorted.slice(offset, offset + limit);

      res.json({
        entries: paginated,
        total: events.length,
        offset,
        limit,
      });
    } catch (error) {
      console.error('[AuditLog API] Error fetching entries:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * GET /api/audit-log/types
   *
   * Returns list of unique tool types in the audit log.
   */
  router.get('/types', (_req, res) => {
    try {
      const types = getToolTypes();
      res.json({ types });
    } catch (error) {
      console.error('[AuditLog API] Error fetching types:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * GET /api/audit-log/stats
   *
   * Returns summary statistics for the audit log.
   */
  router.get('/stats', (_req, res) => {
    try {
      const stats = getAuditLogStats();
      res.json(stats);
    } catch (error) {
      console.error('[AuditLog API] Error fetching stats:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * GET /api/audit-log/export
   *
   * Export audit log as JSON or CSV.
   *
   * Query parameters:
   * - format: "json" (default) or "csv"
   * - toolType: Optional filter by tool type
   * - download: If "true", sets Content-Disposition header
   */
  router.get('/export', (req, res) => {
    try {
      const format = (req.query.format as string) || 'json';
      const toolType = req.query.toolType as string | undefined;
      const download = req.query.download === 'true';

      let content: string;
      let contentType: string;
      let extension: string;

      if (format === 'csv') {
        content = exportAuditLogAsCSV(toolType);
        contentType = 'text/csv';
        extension = 'csv';
      } else {
        content = exportAuditLogAsJSON(toolType);
        contentType = 'application/json';
        extension = 'json';
      }

      if (download) {
        const filename = `cyclist-audit-log-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`;
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      }

      res.setHeader('Content-Type', contentType);
      res.send(content);
    } catch (error) {
      console.error('[AuditLog API] Error exporting:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * DELETE /api/audit-log
   *
   * Clear the audit log.
   */
  router.delete('/', (_req, res) => {
    try {
      resetEventStore();
      res.json({ success: true });
    } catch (error) {
      console.error('[AuditLog API] Error clearing:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
