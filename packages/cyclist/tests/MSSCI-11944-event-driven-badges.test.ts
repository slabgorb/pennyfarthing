/**
 * MSSCI-11944: Event-driven badge updates
 *
 * Tests for replacing 500ms setInterval badge polling with event-driven updates.
 *
 * Acceptance Criteria:
 * - AC1: PanelManager emits badge-changed event on count changes
 * - AC2: tab-bar.js subscribes to event instead of polling
 * - AC3: No 500ms setInterval in tab-bar.js
 * - AC4: Badges update immediately on change
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// File paths
// =============================================================================

const JS_DIR = path.join(__dirname, '../src/public/js');
const PANEL_MANAGER_PATH = path.join(JS_DIR, 'panel-manager.js');
const TAB_BAR_PATH = path.join(JS_DIR, 'tab-bar.js');

// =============================================================================
// Tests
// =============================================================================

describe('MSSCI-11944: Event-driven badge updates', () => {

  // ===========================================================================
  // AC1: PanelManager emits badge-changed event on count changes
  // ===========================================================================

  describe('AC1: PanelManager emits badge-changed event', () => {

    it('should have updateBadgeCount method in panel-manager.js', () => {
      const content = fs.readFileSync(PANEL_MANAGER_PATH, 'utf-8');

      // PanelManager must expose updateBadgeCount function
      expect(content).toMatch(/export\s+(function\s+)?updateBadgeCount|updateBadgeCount\s*[:(]/);
    });

    it('should emit badge-changed event when badge count changes', () => {
      const content = fs.readFileSync(PANEL_MANAGER_PATH, 'utf-8');

      // Must emit 'badge-changed' event
      expect(content).toContain("'badge-changed'");
    });

    it('should include panelId and count in badge-changed event data', () => {
      const content = fs.readFileSync(PANEL_MANAGER_PATH, 'utf-8');

      // Event emission should include both panelId and count
      // Looking for emit pattern like: emit('badge-changed', { panelId, count })
      expect(content).toMatch(/emit\s*\(\s*['"]badge-changed['"]\s*,\s*\{[^}]*panelId/);
      expect(content).toMatch(/emit\s*\(\s*['"]badge-changed['"]\s*,\s*\{[^}]*count/);
    });

    it('should store badge count per panel in PanelManager state', () => {
      const content = fs.readFileSync(PANEL_MANAGER_PATH, 'utf-8');

      // Should have badge count storage - either in panel object or separate map
      expect(content).toMatch(/badgeCount|badge.*count/i);
    });

    it('should only emit event when count actually changes', () => {
      const content = fs.readFileSync(PANEL_MANAGER_PATH, 'utf-8');

      // Should have comparison before emit to avoid unnecessary events
      // Look for pattern like: if (count !== oldCount) or if (panel.badgeCount !== count)
      expect(content).toMatch(/!==.*count|count.*!==|badgeCount\s*!==|!==\s*badgeCount/);
    });

    it('should export updateBadgeCount in default export', () => {
      const content = fs.readFileSync(PANEL_MANAGER_PATH, 'utf-8');

      // Default export object should include updateBadgeCount
      expect(content).toMatch(/export\s+default\s*\{[^}]*updateBadgeCount/s);
    });

  });

  // ===========================================================================
  // AC2: tab-bar.js subscribes to event instead of polling
  // ===========================================================================

  describe('AC2: tab-bar.js subscribes to badge-changed event', () => {

    it('should subscribe to badge-changed event from PanelManager', () => {
      const content = fs.readFileSync(TAB_BAR_PATH, 'utf-8');

      // Should have: PanelManager.on('badge-changed', ...)
      expect(content).toMatch(/PanelManager\.on\s*\(\s*['"]badge-changed['"]/);
    });

    it('should update badge DOM element on badge-changed event', () => {
      const content = fs.readFileSync(TAB_BAR_PATH, 'utf-8');

      // Should have handler that updates badge based on event data
      // Look for pattern using panelId from event to update specific badge
      expect(content).toMatch(/badge-changed.*panelId|panelId.*badge/s);
    });

    it('should handle badge-changed event in init function', () => {
      const content = fs.readFileSync(TAB_BAR_PATH, 'utf-8');

      // The badge-changed subscription should be in init() or at module level
      // Verify it's wired up during initialization
      expect(content).toMatch(/function\s+init[^}]*badge-changed|init.*\{[^}]*badge-changed/s);
    });

  });

  // ===========================================================================
  // AC3: No 500ms setInterval in tab-bar.js
  // ===========================================================================

  describe('AC3: No 500ms setInterval in tab-bar.js', () => {

    it('should NOT have setInterval for badge updates', () => {
      const content = fs.readFileSync(TAB_BAR_PATH, 'utf-8');

      // Must NOT have setInterval with 500ms for badges
      // The old code was: badgeUpdateInterval = setInterval(updateBadges, 500);
      expect(content).not.toMatch(/setInterval\s*\(\s*updateBadges/);
    });

    it('should NOT have badgeUpdateInterval variable used for polling', () => {
      const content = fs.readFileSync(TAB_BAR_PATH, 'utf-8');

      // The badgeUpdateInterval variable should be removed or unused
      // If variable exists, it should not be assigned a setInterval
      const hasBadgeUpdateInterval = content.includes('badgeUpdateInterval');
      if (hasBadgeUpdateInterval) {
        // If variable exists, ensure it's not used with setInterval
        expect(content).not.toMatch(/badgeUpdateInterval\s*=\s*setInterval/);
      }
      // If variable doesn't exist at all, that's fine too
    });

    it('should NOT poll badges at any fixed interval', () => {
      const content = fs.readFileSync(TAB_BAR_PATH, 'utf-8');

      // Should not have any setInterval with updateBadges or similar
      expect(content).not.toMatch(/setInterval\s*\([^)]*badge/i);
    });

    it('should NOT have clearInterval for badge polling in destroy()', () => {
      const content = fs.readFileSync(TAB_BAR_PATH, 'utf-8');

      // The destroy function should not need to clear badge interval
      // (since we're not polling anymore)
      // If clearInterval exists, it should be for something else, not badges
      const destroyMatch = content.match(/function\s+destroy[^}]*\}/s);
      if (destroyMatch) {
        const destroyContent = destroyMatch[0];
        // If destroy has clearInterval(badgeUpdateInterval), that's wrong
        expect(destroyContent).not.toMatch(/clearInterval\s*\(\s*badgeUpdateInterval/);
      }
    });

  });

  // ===========================================================================
  // AC4: Badges update immediately on change
  // ===========================================================================

  describe('AC4: Badges update immediately on change', () => {

    it('should update badge text immediately in event handler', () => {
      const content = fs.readFileSync(TAB_BAR_PATH, 'utf-8');

      // The badge-changed handler should update textContent directly
      expect(content).toMatch(/badge.*textContent|textContent.*count/i);
    });

    it('should trigger pulse animation on badge change', () => {
      const content = fs.readFileSync(TAB_BAR_PATH, 'utf-8');

      // Should add pulse class for visual feedback on change
      expect(content).toMatch(/pulse|classList.*add/);
    });

    it('should handle badge update for correct panel based on event panelId', () => {
      const content = fs.readFileSync(TAB_BAR_PATH, 'utf-8');

      // Should use panelId from event to find correct badge element
      // Pattern: getElementById(`${panelId}-tab-badge`) or similar
      expect(content).toMatch(/\$\{.*panelId.*\}.*badge|panelId.*tab-badge/);
    });

  });

  // ===========================================================================
  // Integration: Wire badge setters to PanelManager
  // ===========================================================================

  describe('Integration: Badge count flow', () => {

    it('should have panel-manager.js with documented badge event API', () => {
      const content = fs.readFileSync(PANEL_MANAGER_PATH, 'utf-8');

      // Should have JSDoc or comment explaining badge-changed event
      expect(content).toMatch(/badge.*changed|badge.*event|@param.*count/i);
    });

    it('should export updateBadgeCount for external callers', () => {
      const content = fs.readFileSync(PANEL_MANAGER_PATH, 'utf-8');

      // Must be exported (either named or in default export)
      expect(content).toMatch(/export\s+(function\s+)?updateBadgeCount|export\s+default\s*\{[^}]*updateBadgeCount/s);
    });

  });

});
