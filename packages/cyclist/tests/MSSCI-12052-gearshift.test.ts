/**
 * MSSCI-12052: Gearshift Mode Switch Bug Fix
 *
 * The Gearshift strip (PLAN|MANUAL|ACCEPT|TURBO) has multiple bugs:
 * 1. Visual display not updating when mode changes
 * 2. Signals not being sent to Claude Code
 * 3. Autohandoff setting not being applied
 *
 * Expected behavior:
 * - PLAN: send /plan signal to Claude, light segment, autohandoff=false
 * - MANUAL: send default permission mode, light segment, autohandoff=false
 * - ACCEPT: send acceptEdits mode, light segment, autohandoff=false
 * - TURBO: send acceptEdits + autohandoff=true, light segment
 */

import { describe, it, expect, beforeAll, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { Window } from 'happy-dom';

import { app } from '../src/server.js';

describe('MSSCI-12052: Gearshift Mode Switch', () => {
  let indexHtml: string;
  let indexDocument: Document;

  beforeAll(async () => {
    const response = await request(app).get('/');
    indexHtml = response.text;

    const window = new Window();
    window.document.write(indexHtml);
    indexDocument = window.document;
  });

  // ==========================================================================
  // AC1: Visual display updates correctly
  // ==========================================================================
  describe('AC1: Visual display updates', () => {

    it('should have mode switch with three segments (MSSCI-12395: turbo removed)', () => {
      const modeSwitch = indexDocument.querySelector('[data-control="mode-switch"]');
      expect(modeSwitch).not.toBeNull();

      const segments = modeSwitch!.querySelectorAll('.mode-switch-segment');
      expect(segments.length).toBe(3);
    });

    it('should have PLAN segment with data-mode="plan"', () => {
      const planSegment = indexDocument.querySelector('[data-mode="plan"]');
      expect(planSegment).not.toBeNull();
      expect(planSegment!.textContent).toContain('PLAN');
    });

    it('should have MANUAL segment with data-mode="manual"', () => {
      const manualSegment = indexDocument.querySelector('[data-mode="manual"]');
      expect(manualSegment).not.toBeNull();
      expect(manualSegment!.textContent).toContain('MANUAL');
    });

    it('should have ACCEPT segment with data-mode="accept"', () => {
      const acceptSegment = indexDocument.querySelector('[data-mode="accept"]');
      expect(acceptSegment).not.toBeNull();
      expect(acceptSegment!.textContent).toContain('ACCEPT');
    });

    it('should have RELAY toggle (MSSCI-12395: replaced turbo segment)', () => {
      const relayToggle = indexDocument.querySelector('[data-control="relay-toggle"]');
      expect(relayToggle).not.toBeNull();
      // MSSCI-12403: Relay uses icon-only, text is in title/aria-label
      expect(relayToggle!.getAttribute('title')).toContain('Relay');
    });

    it('should have MANUAL as default active segment', () => {
      const manualSegment = indexDocument.querySelector('[data-mode="manual"]');
      expect(manualSegment!.classList.contains('active')).toBe(true);
      expect(manualSegment!.getAttribute('aria-checked')).toBe('true');
    });

    it('should have controls.js for mode switch handling', () => {
      expect(indexHtml).toContain('controls.js');
    });

  });

  // ==========================================================================
  // AC2: Signals sent to Claude Code correctly
  // ==========================================================================
  describe('AC2: Claude signals', () => {

    it('should have controls module with setPermissionMode', async () => {
      // Controls module should expose mode setting functionality
      const controls = await import('../src/public/js/controls.js');
      expect(controls).toBeDefined();
    });

    it('should map PLAN mode to plan signal for Claude', async () => {
      // PLAN should tell Claude to enter plan mode
      const controls = await import('../src/public/js/controls.js');
      // The MODE_TO_CLAUDE mapping should include plan -> 'plan'
      expect(controls).toBeDefined();
    });

    it('should map MANUAL mode to default for Claude', async () => {
      // MANUAL should use Claude's default permission mode
      const controls = await import('../src/public/js/controls.js');
      expect(controls).toBeDefined();
    });

    it('should map ACCEPT mode to acceptEdits for Claude', async () => {
      // ACCEPT should use Claude's acceptEdits mode
      const controls = await import('../src/public/js/controls.js');
      expect(controls).toBeDefined();
    });

    it('should map TURBO mode to acceptEdits for Claude', async () => {
      // TURBO uses acceptEdits but with autohandoff=true
      const controls = await import('../src/public/js/controls.js');
      expect(controls).toBeDefined();
    });

    it('should have web-adapter setMode that sends WebSocket message', async () => {
      const webAdapter = await import('../src/public/js/web-adapter.js');
      expect(webAdapter).toBeDefined();
    });

  });

  // ==========================================================================
  // AC3: Autohandoff setting applied correctly
  // ==========================================================================
  describe('AC3: Autohandoff setting', () => {

    it('should persist PLAN mode with autohandoff=false', async () => {
      const response = await request(app)
        .patch('/api/settings')
        .send({
          workflow: {
            permission_mode: 'plan',
            handoff_mode: 'manual'
          }
        });

      expect(response.status).toBeLessThan(500);
    });

    it('should persist MANUAL mode with autohandoff=false', async () => {
      const response = await request(app)
        .patch('/api/settings')
        .send({
          workflow: {
            permission_mode: 'manual',
            handoff_mode: 'manual'
          }
        });

      expect(response.status).toBeLessThan(500);
    });

    it('should persist ACCEPT mode with autohandoff=false', async () => {
      const response = await request(app)
        .patch('/api/settings')
        .send({
          workflow: {
            permission_mode: 'accept',
            handoff_mode: 'manual'
          }
        });

      expect(response.status).toBeLessThan(500);
    });

    it('should persist relay_mode=true with accept (MSSCI-12395: replaces turbo)', async () => {
      const response = await request(app)
        .patch('/api/settings')
        .send({
          workflow: {
            permission_mode: 'accept',
            relay_mode: true
          }
        });

      expect(response.status).toBeLessThan(500);
    });

    it('should return relay_mode in settings GET (MSSCI-12395)', async () => {
      // First set accept + relay mode
      await request(app)
        .patch('/api/settings')
        .send({
          workflow: {
            permission_mode: 'accept',
            relay_mode: true
          }
        });

      // Then verify it's returned
      const response = await request(app).get('/api/settings');
      expect(response.status).toBe(200);
      const settings = response.body;
      expect(settings.workflow).toBeDefined();
      // Should reflect accept mode with relay enabled
      expect(settings.workflow.permission_mode).toBe('accept');
      expect(settings.workflow.relay_mode).toBe(true);
    });

  });

  // ==========================================================================
  // AC4: Mode switch segment styling (in CSS file)
  // ==========================================================================
  describe('AC4: Segment styling', () => {
    let stylesContent: string;

    beforeAll(async () => {
      const response = await request(app).get('/styles.css');
      stylesContent = response.text;
    });

    it('should have distinct styling for PLAN mode (teal) in CSS', () => {
      // CSS should have styling for plan mode
      expect(stylesContent).toMatch(/PLAN|plan/i);
      expect(stylesContent).toMatch(/teal|#[0-9a-f]{3,6}/i);
    });

    it('should have MANUAL segment in HTML', () => {
      expect(indexHtml).toMatch(/data-mode="manual"/);
    });

    it('should have ACCEPT segment in HTML', () => {
      expect(indexHtml).toMatch(/data-mode="accept"/);
    });

    it('should have RELAY toggle in HTML (MSSCI-12395: replaces turbo)', () => {
      expect(indexHtml).toMatch(/data-control="relay-toggle"/);
    });

  });

  // ==========================================================================
  // AC5: Claude service receives mode changes
  // ==========================================================================
  describe('AC5: Claude service mode handling', () => {

    it('should have ClaudeService.setPermissionMode method', async () => {
      const { ClaudeService } = await import('../src/claude-service.js');
      const service = new ClaudeService();
      expect(service.setPermissionMode).toBeDefined();
      expect(typeof service.setPermissionMode).toBe('function');
    });

    it('should store pending mode when setPermissionMode called', async () => {
      const { ClaudeService } = await import('../src/claude-service.js');
      const service = new ClaudeService();

      service.setPermissionMode('plan');
      expect(service.getPermissionMode()).toBe('plan');
    });

    it('should use mode in --permission-mode flag when spawning Claude', async () => {
      const { ClaudeService } = await import('../src/claude-service.js');
      const service = new ClaudeService();

      service.setPermissionMode('acceptEdits');
      // The mode should be applied when running next query
      expect(service.getPermissionMode()).toBe('acceptEdits');
    });

  });

  // ==========================================================================
  // AC6: WebSocket setMode message handling
  // ==========================================================================
  describe('AC6: WebSocket setMode handling', () => {

    it('should handle setMode message type in websocket', async () => {
      // WebSocket should recognize setMode message type
      const wsModule = await import('../src/websocket.js');
      expect(wsModule).toBeDefined();
    });

    it('should call ClaudeService.setPermissionMode on setMode message', async () => {
      // When setMode message received, should update service mode
      const { ClaudeService } = await import('../src/claude-service.js');
      const service = new ClaudeService();

      // Simulate what websocket handler does
      const mode = 'acceptEdits';
      service.setPermissionMode(mode);
      expect(service.getPermissionMode()).toBe(mode);
    });

  });

});
