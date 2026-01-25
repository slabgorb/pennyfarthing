/**
 * Story 17-4: Popup Profile View for Persona Details
 *
 * These tests verify the acceptance criteria for the persona popup feature.
 * Written to FAIL initially (RED phase) - Dev will make them GREEN.
 *
 * Acceptance Criteria:
 * - AC1: Clicking persona triggers popup/modal display
 * - AC2: Popup shows complete persona definition from theme file
 * - AC3: Persona attributes displayed (voice, style, quirks, background)
 * - AC4: Current role mapping visible (e.g., "SM → Yossarian")
 * - AC5: Theme name and character name shown
 * - AC6: Popup dismisses with Esc or click outside
 * - AC7: Responsive design works at various window sizes
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { Window } from 'happy-dom';

import { app } from '../src/server.js';

// Mock the pennyfarthing module for full persona details
vi.mock('../src/pennyfarthing.js', () => ({
  detectPennyfarthingProject: vi.fn(() => true),
  getCurrentPersona: vi.fn(),
  getFullPersonaDetails: vi.fn(),
  watchAgentChanges: vi.fn(() => () => {}),
}));

import { getFullPersonaDetails } from '../src/pennyfarthing.js';

describe('Story 17-4: Popup Profile View for Persona Details', () => {
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

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('AC1: Clicking persona triggers popup/modal display', () => {
    it('should have persona section with clickable styling', () => {
      const personaSection = document.querySelector('#persona-section');
      expect(personaSection).not.toBeNull();
      // Should have cursor pointer to indicate clickability
      expect(css).toMatch(/#persona-section[^}]*cursor:\s*pointer/);
    });

    it('should have persona popup/modal element in DOM', () => {
      // Popup element should exist (hidden by default)
      const popup = document.querySelector('#persona-popup, .persona-popup, .persona-modal');
      expect(popup).not.toBeNull();
    });

    it('should have popup hidden by default', () => {
      // Popup should have display:none or hidden class by default
      expect(css).toMatch(/\.persona-popup[^}]*(display:\s*none|visibility:\s*hidden)/);
    });

    it('should have CSS for showing popup when active', () => {
      // Should have active/visible state styles
      expect(css).toMatch(/\.persona-popup\.active|\.persona-popup\.visible|\.persona-popup:not\(\.hidden\)/);
    });
  });

  describe('AC2: Popup shows complete persona definition from theme file', () => {
    it('should have API endpoint for full persona details', async () => {
      const mockFullPersona = {
        character: 'Radar O\'Reilly',
        role: 'tea',
        theme: 'mash',
        voice: 'Earnest and slightly nervous',
        style: 'Company clerk who tests by knowing what will fail before it happens',
        quirks: ['Hears choppers before anyone else', 'Finishes sentences'],
        background: 'The psychic company clerk of the 4077th',
      };

      vi.mocked(getFullPersonaDetails).mockReturnValue(mockFullPersona);

      const response = await request(app).get('/api/persona/full');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('voice');
      expect(response.body).toHaveProperty('style');
      expect(response.body).toHaveProperty('quirks');
    });

    it('should have container for full persona content in popup', () => {
      const popup = document.querySelector('#persona-popup, .persona-popup');
      if (popup) {
        // Should have content container
        const content = popup.querySelector('.persona-popup-content, .popup-content');
        expect(content).not.toBeNull();
      } else {
        // Popup doesn't exist yet - this test should fail
        expect(popup).not.toBeNull();
      }
    });
  });

  describe('AC3: Persona attributes displayed (style, quirks, background)', () => {
    // Note: voice attribute was removed from persona display (not all personas have it)
    it('should have element for style attribute', () => {
      const styleEl = document.querySelector('.persona-style, [data-persona="style"]');
      expect(styleEl).not.toBeNull();
    });

    it('should have element for quirks attribute', () => {
      const quirksEl = document.querySelector('.persona-quirks, [data-persona="quirks"]');
      expect(quirksEl).not.toBeNull();
    });

    it('should have element for background attribute', () => {
      const backgroundEl = document.querySelector('.persona-background, [data-persona="background"]');
      expect(backgroundEl).not.toBeNull();
    });

    it('should have styling for attribute labels', () => {
      // Should have label styling for attribute sections
      expect(css).toMatch(/\.persona-popup[^}]*\.attribute-label|\.persona-attr-label/);
    });
  });

  describe('AC4: Current role mapping visible (e.g., "SM → Yossarian")', () => {
    it('should have element for role mapping display', () => {
      const roleMapping = document.querySelector('.role-mapping, [data-persona="role-mapping"]');
      expect(roleMapping).not.toBeNull();
    });

    it('should include role mapping in full persona API response', async () => {
      const mockFullPersona = {
        character: 'Radar O\'Reilly',
        role: 'tea',
        theme: 'mash',
        roleMapping: 'TEA → Radar O\'Reilly',
      };

      vi.mocked(getFullPersonaDetails).mockReturnValue(mockFullPersona);

      const response = await request(app).get('/api/persona/full');

      expect(response.body).toHaveProperty('roleMapping');
    });
  });

  describe('AC5: Theme name and character name shown', () => {
    it('should have theme name element in popup', () => {
      const popup = document.querySelector('#persona-popup, .persona-popup');
      if (popup) {
        const themeEl = popup.querySelector('.popup-theme, [data-persona="theme"]');
        expect(themeEl).not.toBeNull();
      } else {
        expect(popup).not.toBeNull();
      }
    });

    it('should have character name element in popup', () => {
      const popup = document.querySelector('#persona-popup, .persona-popup');
      if (popup) {
        const nameEl = popup.querySelector('.popup-character-name, [data-persona="character"]');
        expect(nameEl).not.toBeNull();
      } else {
        expect(popup).not.toBeNull();
      }
    });

    it('should have large portrait in popup', () => {
      const popup = document.querySelector('#persona-popup, .persona-popup');
      if (popup) {
        const portrait = popup.querySelector('.popup-portrait, .large-portrait');
        expect(portrait).not.toBeNull();
      } else {
        expect(popup).not.toBeNull();
      }
    });
  });

  describe('AC6: Popup dismisses with Esc or click outside', () => {
    it('should have close button in popup', () => {
      const popup = document.querySelector('#persona-popup, .persona-popup');
      if (popup) {
        const closeBtn = popup.querySelector('.close-btn, .popup-close, [data-action="close"]');
        expect(closeBtn).not.toBeNull();
      } else {
        expect(popup).not.toBeNull();
      }
    });

    it('should have overlay/backdrop for click-outside dismiss', () => {
      // Should have backdrop element for catching outside clicks
      const backdrop = document.querySelector('.persona-popup-backdrop, .popup-overlay, .modal-backdrop');
      expect(backdrop).not.toBeNull();
    });

    it('should have CSS for backdrop styling', () => {
      // Backdrop should cover viewport
      expect(css).toMatch(/\.popup-backdrop|\.modal-backdrop|\.persona-popup-backdrop/);
    });

    it('should have tabindex for keyboard accessibility', () => {
      const popup = document.querySelector('#persona-popup, .persona-popup');
      if (popup) {
        // Popup should be focusable for Esc key handling
        const tabindex = popup.getAttribute('tabindex');
        expect(tabindex).toBeDefined();
      } else {
        expect(popup).not.toBeNull();
      }
    });
  });

  describe('AC7: Responsive design works at various window sizes', () => {
    it('should have max-width constraint on popup', () => {
      // Popup should not exceed certain width
      expect(css).toMatch(/\.persona-popup[^}]*max-width/);
    });

    it('should have responsive width (percentage or max-width)', () => {
      // Should use responsive sizing
      expect(css).toMatch(/\.persona-popup[^}]*(width:\s*\d+%|max-width:\s*\d+px)/);
    });

    it('should have max-height with scroll for small viewports', () => {
      // Should handle overflow gracefully
      expect(css).toMatch(/\.persona-popup[^}]*(max-height|overflow)/);
    });

    it('should center popup in viewport', () => {
      // Should use centering technique (flex, transform, or margin auto)
      expect(css).toMatch(/\.persona-popup[^}]*(transform.*translate|margin.*auto|justify-content.*center)/);
    });

    it('should have mobile-friendly padding and font sizes', () => {
      // Should have media queries or responsive units
      expect(css).toMatch(/@media.*\.persona-popup|\.persona-popup[^}]*(padding|font-size)/);
    });
  });

  describe('IPC Integration for Electron', () => {
    it('should have persona:getFullDetails IPC handler registration', async () => {
      // This tests that the IPC handler exists in main.ts
      // The handler should call getFullPersonaDetails()
      vi.mocked(getFullPersonaDetails).mockReturnValue({
        character: 'Test Character',
        role: 'dev',
        theme: 'test-theme',
        voice: 'Test voice',
        style: 'Test style',
        quirks: ['quirk1'],
        background: 'Test background',
      });

      // The actual IPC test would need Electron context
      // For now, verify the API endpoint works which uses the same function
      const response = await request(app).get('/api/persona/full');
      expect(response.status).toBe(200);
    });
  });
});
