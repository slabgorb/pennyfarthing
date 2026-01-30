/**
 * E1-1: Project Setup Tests
 *
 * These tests verify the acceptance criteria for the project setup story.
 * They are written to FAIL initially (RED phase) and should pass after
 * Dev implements the server.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Window } from 'happy-dom';

// Import will fail until server.ts exists - that's expected (RED phase)
// @ts-expect-error - File doesn't exist yet
import { app } from '../src/server.js';

describe('E1-1: Project Setup', () => {

  describe('AC1: Express server runs on localhost:3000', () => {

    it('should export an Express app', () => {
      expect(app).toBeDefined();
      expect(typeof app.listen).toBe('function');
    });

    it('should respond to requests', async () => {
      const response = await request(app).get('/');
      expect(response.status).toBe(200);
    });

  });

  describe('AC2: HTML page loads with two-panel layout', () => {
    let html: string;
    let document: Document;

    beforeAll(async () => {
      const response = await request(app).get('/');
      html = response.text;

      // Parse HTML with happy-dom
      const window = new Window();
      window.document.write(html);
      document = window.document;
    });

    it('should return HTML content type', async () => {
      const response = await request(app).get('/');
      expect(response.headers['content-type']).toMatch(/html/);
    });

    it('should have a message view container element', () => {
      // E7-5: Renamed from #terminal to #message-view
      const messageView = document.querySelector('#message-view');
      expect(messageView).not.toBeNull();
    });

    // 68-6: Sidebar removed - content moved to dedicated tab panels
    it('should NOT have sidebar element (removed in 68-6)', () => {
      const sidebar = document.querySelector('#sidebar');
      expect(sidebar).toBeNull();
    });

    it('should have message view in container', () => {
      const container = document.querySelector('#container');
      const messageView = document.querySelector('#message-view');

      // Message view should exist within the container
      expect(container).not.toBeNull();
      expect(messageView).not.toBeNull();
      expect(container?.contains(messageView)).toBe(true);
    });

    // 68-6: Verify tab bar exists for panel navigation
    it('should have tab bar for panel navigation', () => {
      const tabBar = document.querySelector('#tab-bar');
      expect(tabBar).not.toBeNull();
    });

  });

  describe('AC3: Static files are served', () => {

    it('should serve CSS files from /styles.css', async () => {
      const response = await request(app).get('/styles.css');
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/css/);
    });

    it('should have dark theme styles', async () => {
      const response = await request(app).get('/styles.css');
      const css = response.text;

      // Should have dark background colors
      expect(css).toMatch(/background/i);
    });

  });

});
