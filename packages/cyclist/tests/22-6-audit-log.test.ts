/**
 * 22-6: Tool Execution Audit Log
 *
 * Tests for the audit log feature that records all tool executions with metadata,
 * provides a log viewer accessible from menu, filtering, and export functionality.
 *
 * Acceptance Criteria:
 * - AC1: All tool executions logged with metadata
 * - AC2: Log viewer accessible from menu
 * - AC3: Filter by tool type
 * - AC4: Export to JSON
 * - AC5: Log clears on session reset
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { Window } from 'happy-dom';

import { app } from '../src/server.js';

describe('22-6: Tool Execution Audit Log', () => {
  let html: string;
  let document: Document;
  let css: string;

  beforeAll(async () => {
    // Fetch HTML
    const htmlResponse = await request(app).get('/');
    html = htmlResponse.text;

    // Parse HTML with happy-dom
    const window = new Window();
    window.document.write(html);
    document = window.document;

    // Fetch CSS
    const cssResponse = await request(app).get('/styles.css');
    css = cssResponse.text;
  });

  // ==========================================================================
  // AC1: All tool executions logged with metadata
  // ==========================================================================
  describe('AC1: All tool executions logged with metadata', () => {

    it('should export getToolEvents function from otlp-receiver', async () => {
      const receiver = await import('../src/otlp-receiver.js');
      expect(receiver.getToolEvents).toBeDefined();
      expect(typeof receiver.getToolEvents).toBe('function');
    });

    it('should export getToolEventsFiltered function from otlp-receiver', async () => {
      const receiver = await import('../src/otlp-receiver.js');
      expect(receiver.getToolEventsFiltered).toBeDefined();
      expect(typeof receiver.getToolEventsFiltered).toBe('function');
    });

    it('should export getToolTypes function from otlp-receiver', async () => {
      const receiver = await import('../src/otlp-receiver.js');
      expect(receiver.getToolTypes).toBeDefined();
      expect(typeof receiver.getToolTypes).toBe('function');
    });

    it('should export getAuditLogStats function from otlp-receiver', async () => {
      const receiver = await import('../src/otlp-receiver.js');
      expect(receiver.getAuditLogStats).toBeDefined();
      expect(typeof receiver.getAuditLogStats).toBe('function');
    });

    it('should return empty array when no events recorded', async () => {
      const receiver = await import('../src/otlp-receiver.js');
      receiver.resetEventStore();
      const events = receiver.getToolEvents();
      expect(Array.isArray(events)).toBe(true);
    });

    it('should return stats with expected structure', async () => {
      const receiver = await import('../src/otlp-receiver.js');
      receiver.resetEventStore();
      const stats = receiver.getAuditLogStats();

      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('byType');
      expect(stats).toHaveProperty('successCount');
      expect(stats).toHaveProperty('errorCount');
      expect(typeof stats.total).toBe('number');
      expect(typeof stats.byType).toBe('object');
    });

  });

  // ==========================================================================
  // AC2: Log viewer accessible from menu
  // ==========================================================================
  describe('AC2: Log viewer accessible from menu', () => {

    it('should have audit-log-modal container element in HTML', () => {
      const modal = document.querySelector('#audit-log-modal, .audit-log-modal');
      expect(modal).not.toBeNull();
    });

    it('should have modal hidden by default', () => {
      const modal = document.querySelector('#audit-log-modal, .audit-log-modal');
      const isHidden = modal?.classList.contains('hidden') ||
                       modal?.getAttribute('aria-hidden') === 'true' ||
                       modal?.hasAttribute('hidden');
      expect(isHidden).toBe(true);
    });

    it('should include AuditLogViewer.js script in HTML', () => {
      expect(html).toContain('AuditLogViewer.js');
    });

    it('should export showAuditLogModal function', async () => {
      const viewer = await import('../src/public/js/components/AuditLogViewer.js');
      expect(viewer.showAuditLogModal).toBeDefined();
      expect(typeof viewer.showAuditLogModal).toBe('function');
    });

    it('should export hideAuditLogModal function', async () => {
      const viewer = await import('../src/public/js/components/AuditLogViewer.js');
      expect(viewer.hideAuditLogModal).toBeDefined();
      expect(typeof viewer.hideAuditLogModal).toBe('function');
    });

    it('should export isModalVisible function', async () => {
      const viewer = await import('../src/public/js/components/AuditLogViewer.js');
      expect(viewer.isModalVisible).toBeDefined();
      expect(typeof viewer.isModalVisible).toBe('function');
    });

    it('should have auditLog IPC API in preload', async () => {
      const preload = await import('../src/preload.js');
      expect(preload.electronAPI?.auditLog).toBeDefined();
    });

    it('should have auditLog.getEntries IPC method', async () => {
      const preload = await import('../src/preload.js');
      expect(preload.electronAPI?.auditLog?.getEntries).toBeDefined();
      expect(typeof preload.electronAPI?.auditLog?.getEntries).toBe('function');
    });

    it('should have auditLog.getTypes IPC method', async () => {
      const preload = await import('../src/preload.js');
      expect(preload.electronAPI?.auditLog?.getTypes).toBeDefined();
      expect(typeof preload.electronAPI?.auditLog?.getTypes).toBe('function');
    });

    it('should have auditLog.onShow IPC subscription', async () => {
      const preload = await import('../src/preload.js');
      expect(preload.electronAPI?.auditLog?.onShow).toBeDefined();
      expect(typeof preload.electronAPI?.auditLog?.onShow).toBe('function');
    });

    it('should have close button in modal', () => {
      const closeBtn = document.querySelector(
        '#audit-log-modal .close-btn, ' +
        '.audit-log-modal .close-btn, ' +
        '#audit-log-modal [data-action="close"]'
      );
      expect(closeBtn).not.toBeNull();
    });

    it('should have table structure for log entries', () => {
      const table = document.querySelector('#audit-log-modal table, .audit-log-table');
      expect(table).not.toBeNull();
    });

    it('should have table header with expected columns', () => {
      const headers = document.querySelectorAll('#audit-log-modal th, .audit-log-table th');
      expect(headers.length).toBeGreaterThanOrEqual(4);
    });

  });

  // ==========================================================================
  // AC3: Filter by tool type
  // ==========================================================================
  describe('AC3: Filter by tool type', () => {

    it('should have filter dropdown in modal', () => {
      const filter = document.querySelector(
        '#audit-log-filter, ' +
        '#audit-log-modal select, ' +
        '.audit-log-modal select'
      );
      expect(filter).not.toBeNull();
    });

    it('should export setFilter function', async () => {
      const viewer = await import('../src/public/js/components/AuditLogViewer.js');
      expect(viewer.setFilter).toBeDefined();
      expect(typeof viewer.setFilter).toBe('function');
    });

    it('should export getFilter function', async () => {
      const viewer = await import('../src/public/js/components/AuditLogViewer.js');
      expect(viewer.getFilter).toBeDefined();
      expect(typeof viewer.getFilter).toBe('function');
    });

    it('should filter events by tool type correctly', async () => {
      const receiver = await import('../src/otlp-receiver.js');
      receiver.resetEventStore();

      // Filter on empty data
      const filtered = receiver.getToolEventsFiltered('Bash');
      expect(Array.isArray(filtered)).toBe(true);
    });

    it('should return all events when no filter specified', async () => {
      const receiver = await import('../src/otlp-receiver.js');
      receiver.resetEventStore();

      const all = receiver.getToolEventsFiltered();
      const unfiltered = receiver.getToolEvents();
      expect(all.length).toBe(unfiltered.length);
    });

    it('should return unique tool types from getToolTypes', async () => {
      const receiver = await import('../src/otlp-receiver.js');
      receiver.resetEventStore();

      const types = receiver.getToolTypes();
      expect(Array.isArray(types)).toBe(true);
      // Types should be unique
      expect(new Set(types).size).toBe(types.length);
    });

  });

  // ==========================================================================
  // AC4: Export to JSON
  // ==========================================================================
  describe('AC4: Export to JSON', () => {

    it('should have export JSON button in modal', () => {
      const exportBtn = document.querySelector(
        '#audit-log-modal [data-action="export-json"]'
      );
      expect(exportBtn).not.toBeNull();
    });

    it('should have export CSV button in modal', () => {
      const exportBtn = document.querySelector(
        '#audit-log-modal [data-action="export-csv"]'
      );
      expect(exportBtn).not.toBeNull();
    });

    it('should export exportJSON function', async () => {
      const viewer = await import('../src/public/js/components/AuditLogViewer.js');
      expect(viewer.exportJSON).toBeDefined();
      expect(typeof viewer.exportJSON).toBe('function');
    });

    it('should export exportCSV function', async () => {
      const viewer = await import('../src/public/js/components/AuditLogViewer.js');
      expect(viewer.exportCSV).toBeDefined();
      expect(typeof viewer.exportCSV).toBe('function');
    });

    it('should export exportAuditLogAsJSON from otlp-receiver', async () => {
      const receiver = await import('../src/otlp-receiver.js');
      expect(receiver.exportAuditLogAsJSON).toBeDefined();
      expect(typeof receiver.exportAuditLogAsJSON).toBe('function');
    });

    it('should export exportAuditLogAsCSV from otlp-receiver', async () => {
      const receiver = await import('../src/otlp-receiver.js');
      expect(receiver.exportAuditLogAsCSV).toBeDefined();
      expect(typeof receiver.exportAuditLogAsCSV).toBe('function');
    });

    it('should return valid JSON string from exportAuditLogAsJSON', async () => {
      const receiver = await import('../src/otlp-receiver.js');
      receiver.resetEventStore();

      const jsonStr = receiver.exportAuditLogAsJSON();
      expect(typeof jsonStr).toBe('string');

      // Should be parseable
      const parsed = JSON.parse(jsonStr);
      expect(Array.isArray(parsed)).toBe(true);
    });

    it('should return valid CSV string from exportAuditLogAsCSV', async () => {
      const receiver = await import('../src/otlp-receiver.js');
      receiver.resetEventStore();

      const csvStr = receiver.exportAuditLogAsCSV();
      expect(typeof csvStr).toBe('string');

      // Should have header row
      expect(csvStr).toContain('timestamp');
      expect(csvStr).toContain('toolName');
    });

    it('should have auditLog.export IPC method', async () => {
      const preload = await import('../src/preload.js');
      expect(preload.electronAPI?.auditLog?.export).toBeDefined();
      expect(typeof preload.electronAPI?.auditLog?.export).toBe('function');
    });

  });

  // ==========================================================================
  // AC5: Log clears on session reset
  // ==========================================================================
  describe('AC5: Log clears on session reset', () => {

    it('should have clear button in modal', () => {
      const clearBtn = document.querySelector(
        '#audit-log-modal [data-action="clear"]'
      );
      expect(clearBtn).not.toBeNull();
    });

    it('should export clearLog function', async () => {
      const viewer = await import('../src/public/js/components/AuditLogViewer.js');
      expect(viewer.clearLog).toBeDefined();
      expect(typeof viewer.clearLog).toBe('function');
    });

    it('should export resetEventStore from otlp-receiver', async () => {
      const receiver = await import('../src/otlp-receiver.js');
      expect(receiver.resetEventStore).toBeDefined();
      expect(typeof receiver.resetEventStore).toBe('function');
    });

    it('should clear all events when resetEventStore called', async () => {
      const receiver = await import('../src/otlp-receiver.js');

      // Reset and verify empty
      receiver.resetEventStore();
      const events = receiver.getToolEvents();
      expect(events.length).toBe(0);
    });

    it('should have auditLog.clear IPC method', async () => {
      const preload = await import('../src/preload.js');
      expect(preload.electronAPI?.auditLog?.clear).toBeDefined();
      expect(typeof preload.electronAPI?.auditLog?.clear).toBe('function');
    });

    it('should reset stats when events cleared', async () => {
      const receiver = await import('../src/otlp-receiver.js');

      receiver.resetEventStore();
      const stats = receiver.getAuditLogStats();

      expect(stats.total).toBe(0);
      expect(stats.successCount).toBe(0);
      expect(stats.errorCount).toBe(0);
    });

  });

  // ==========================================================================
  // Modal CSS Styling
  // ==========================================================================
  describe('Modal CSS Styling', () => {

    it('should have CSS for .audit-log-modal container', () => {
      expect(css).toMatch(/\.audit-log-modal|#audit-log-modal/);
    });

    it('should have modal overlay styling', () => {
      expect(css).toMatch(/\.audit-log-modal[^}]*\.modal-overlay|\.modal-overlay/);
    });

    it('should have table styling for audit log', () => {
      expect(css).toMatch(/\.audit-log-table/);
    });

    it('should have tool-badge styling for tool types', () => {
      expect(css).toMatch(/\.tool-badge/);
    });

    it('should have status-success styling', () => {
      expect(css).toMatch(/\.status-success/);
    });

    it('should have status-error styling', () => {
      expect(css).toMatch(/\.status-error/);
    });

    it('should have hidden class support', () => {
      expect(css).toMatch(/\.audit-log-modal\.hidden/);
    });

  });

  // ==========================================================================
  // IPC Channel Integration
  // ==========================================================================
  describe('IPC Channel Integration', () => {

    it('should export IPC_AUDIT_LOG_CHANNELS from main', async () => {
      const main = await import('../src/main.js');
      expect(main.IPC_AUDIT_LOG_CHANNELS).toBeDefined();
    });

    it('should have GET_ENTRIES channel defined', async () => {
      const main = await import('../src/main.js');
      expect(main.IPC_AUDIT_LOG_CHANNELS.GET_ENTRIES).toBe('auditLog:getEntries');
    });

    it('should have GET_TYPES channel defined', async () => {
      const main = await import('../src/main.js');
      expect(main.IPC_AUDIT_LOG_CHANNELS.GET_TYPES).toBe('auditLog:getTypes');
    });

    it('should have EXPORT channel defined', async () => {
      const main = await import('../src/main.js');
      expect(main.IPC_AUDIT_LOG_CHANNELS.EXPORT).toBe('auditLog:export');
    });

    it('should have CLEAR channel defined', async () => {
      const main = await import('../src/main.js');
      expect(main.IPC_AUDIT_LOG_CHANNELS.CLEAR).toBe('auditLog:clear');
    });

    it('should export setupAuditLogIPCHandlers function', async () => {
      const main = await import('../src/main.js');
      expect(main.setupAuditLogIPCHandlers).toBeDefined();
      expect(typeof main.setupAuditLogIPCHandlers).toBe('function');
    });

    it('should export buildToolsMenu function', async () => {
      const main = await import('../src/main.js');
      expect(main.buildToolsMenu).toBeDefined();
      expect(typeof main.buildToolsMenu).toBe('function');
    });

    it('should have Tools menu with Execution Log item', async () => {
      const main = await import('../src/main.js');
      const toolsMenu = main.buildToolsMenu();

      expect(toolsMenu.label).toBe('Tools');
      expect(toolsMenu.submenu).toBeDefined();
      expect(Array.isArray(toolsMenu.submenu)).toBe(true);

      // Should have Execution Log item
      const execLogItem = toolsMenu.submenu.find(
        (item: { label?: string }) => item.label === 'Execution Log'
      );
      expect(execLogItem).toBeDefined();
    });

  });

  // ==========================================================================
  // Component State Management
  // ==========================================================================
  describe('Component State Management', () => {

    it('should export setEntries for testing', async () => {
      const viewer = await import('../src/public/js/components/AuditLogViewer.js');
      expect(viewer.setEntries).toBeDefined();
      expect(typeof viewer.setEntries).toBe('function');
    });

    it('should export getEntries for testing', async () => {
      const viewer = await import('../src/public/js/components/AuditLogViewer.js');
      expect(viewer.getEntries).toBeDefined();
      expect(typeof viewer.getEntries).toBe('function');
    });

    it('should export refreshAuditLog function', async () => {
      const viewer = await import('../src/public/js/components/AuditLogViewer.js');
      expect(viewer.refreshAuditLog).toBeDefined();
      expect(typeof viewer.refreshAuditLog).toBe('function');
    });

    it('should track modal visibility state', async () => {
      const viewer = await import('../src/public/js/components/AuditLogViewer.js');

      // Modal should start hidden
      expect(viewer.isModalVisible()).toBe(false);
    });

  });

});
