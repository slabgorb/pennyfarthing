/**
 * Relay Mode Auto-Handoff Tests
 *
 * Tests that HANDOFF markers auto-execute when relay_mode is enabled.
 * Uses dedicated mock setup to avoid module caching issues.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock controls module BEFORE importing quick-actions
const mockRelayModeEnabled = { value: false };
vi.mock('../src/public/js/controls.js', () => ({
  isRelayModeEnabled: () => mockRelayModeEnabled.value,
}));

// Mock insertAndSubmit to prevent actual execution
vi.mock('../src/public/js/editor.js', () => ({
  insertAndSubmit: vi.fn(),
}));

// Mock story.js for getAgentDisplayName
vi.mock('../src/public/js/story.js', () => ({
  getThemeAgents: () => null,
  loadThemeAgents: () => Promise.resolve(),
}));

// Import quick-actions AFTER mocks are set up
import { renderQuickActions } from '../src/public/js/components/message-view/quick-actions.js';

describe('Relay Mode Auto-Handoff', () => {

  beforeEach(() => {
    mockRelayModeEnabled.value = false;
    vi.clearAllMocks();
  });

  describe('HANDOFF marker rendering', () => {

    it('should render buttons when relay mode is OFF', () => {
      mockRelayModeEnabled.value = false;

      const result = {
        type: 'handoff',
        agent: '/tea',
        responses: ['/tea', 'Not yet'],
        source: 'structured_marker'
      };

      const html = renderQuickActions(result);

      // Should show buttons, not auto-invoke status
      expect(html).toContain('quick-action-btn');
      expect(html).toContain('Not yet');
      expect(html).not.toContain('auto-invoke-status');
      expect(html).not.toContain('Handing off');
    });

    it('should show auto-execute status when relay mode is ON', () => {
      mockRelayModeEnabled.value = true;

      const result = {
        type: 'handoff',
        agent: '/reviewer',
        responses: ['/reviewer', 'Not yet'],
        source: 'structured_marker'
      };

      const html = renderQuickActions(result);

      // Should show auto-invoke status, not buttons
      expect(html).toContain('auto-invoke-status');
      expect(html).toContain('Handing off to');
      expect(html).not.toContain('quick-action-btn');
      expect(html).not.toContain('Not yet');
    });

    it('should include agent display name in auto-execute message', () => {
      mockRelayModeEnabled.value = true;

      const result = {
        type: 'handoff',
        agent: '/dev',
        responses: ['/dev', 'Not yet'],
        source: 'structured_marker'
      };

      const html = renderQuickActions(result);

      // Should reference the agent being handed off to (uses friendly name fallback)
      expect(html).toContain('Handing off to');
      expect(html).toContain('Developer'); // FRIENDLY_ROLE_NAMES fallback
    });

  });

  describe('INVOKE marker (turbo mode) behavior unchanged', () => {

    it('should auto-execute INVOKE regardless of relay mode', () => {
      mockRelayModeEnabled.value = false;

      const result = {
        type: 'invoke',
        agent: '/tea',
        autoExecute: true,
        source: 'structured_marker'
      };

      const html = renderQuickActions(result);

      // INVOKE always auto-executes
      expect(html).toContain('auto-invoke-status');
      expect(html).toContain('Invoking');
    });

  });

});
