/**
 * E1-5: Stats Dashboard Tests
 *
 * These tests verify the acceptance criteria for the stats dashboard story.
 * Updated for B-22: Stats moved from sidebar to prompt bar stats-strip.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { Window } from 'happy-dom';

import { app } from '../src/server.js';

describe('E1-5: Stats Dashboard', () => {
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

  describe('AC1: Stats strip displays key metrics', () => {
    it('should have stats-strip container element', () => {
      const statsStrip = document.querySelector('#stats-strip');
      expect(statsStrip).not.toBeNull();
    });

    it('should display model metric', () => {
      const modelValue = document.querySelector('#stats-strip [data-stat="strip-model"]');
      expect(modelValue).not.toBeNull();
    });

    // 23-1: Token metrics replaced by usage limits display
    it('should display usage metrics', () => {
      const usage5hr = document.querySelector('#stats-strip [data-stat="strip-usage-5hr"]');
      const usageWeekly = document.querySelector('#stats-strip [data-stat="strip-usage-weekly"]');
      expect(usage5hr).not.toBeNull();
      expect(usageWeekly).not.toBeNull();
    });

    it('should display context meter', () => {
      const contextMeter = document.querySelector('#stats-strip .context-mini');
      expect(contextMeter).not.toBeNull();
    });
  });

  describe('AC2: Placeholder values and API', () => {
    it('should have GET /api/stats endpoint', async () => {
      const response = await request(app).get('/api/stats');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('model');
      expect(response.body).toHaveProperty('status');
    });

    it('should have POST /api/stats endpoint', async () => {
      const response = await request(app)
        .post('/api/stats')
        .send({ model: 'test-model', status: 'Ready' });
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should return updated stats after POST', async () => {
      await request(app)
        .post('/api/stats')
        .send({ model: 'updated-model' });

      const response = await request(app).get('/api/stats');
      expect(response.body.model).toBe('updated-model');
    });

    it('should have default placeholder values', async () => {
      const response = await request(app).get('/api/stats');
      // Check that values are defined (not undefined)
      expect(response.body.model).toBeDefined();
      expect(response.body.status).toBeDefined();
    });
  });

  describe('AC3: Clean typography and layout', () => {
    it('should have stats-strip with flexbox layout', () => {
      expect(css).toMatch(/#stats-strip[^}]*display:\s*flex/);
    });

    it('should have model badge with proper styling', () => {
      expect(css).toMatch(/\.model-badge[^}]*font-weight/);
    });

    // 23-1: Token stats replaced by usage limits
    it('should have usage stats with monospace font', () => {
      expect(css).toMatch(/(\.usage-5hr|\.usage-weekly)[^}]*font-family[^}]*mono/);
    });

    it('should have consistent spacing in stats strip', () => {
      expect(css).toMatch(/#stats-strip[^}]*(padding|gap)/);
    });
  });

  describe('AC4: Visual hierarchy clear', () => {
    it('should have context meter with color coding CSS', () => {
      // Context meter should have color classes for different states
      const hasLevelColors =
        css.includes('level-safe') ||
        css.includes('level-warning') ||
        css.includes('level-danger') ||
        css.includes('level-critical');
      expect(hasLevelColors).toBe(true);
    });

    it('should have model badge with accent color', () => {
      expect(css).toMatch(/\.model-badge[^}]*background/);
    });

    // Note: stats.js was consolidated into stats-strip.js per B-22
    it('should have stats-strip.js script included', () => {
      const hasStatsStripScript = html.includes('stats-strip.js');
      expect(hasStatsStripScript).toBe(true);
    });
  });

  describe('Stats module functionality', () => {
    it('should validate stats input on POST', async () => {
      // Sending invalid data should return 400
      const response = await request(app)
        .post('/api/stats')
        .send({ model: 12345 }); // model should be string
      expect(response.status).toBe(400);
    });

    it('should preserve unmodified stats on partial update', async () => {
      // Set initial state with unique values (note: context is handled by separate /api/context endpoint per B-19)
      const uniqueStatus = `Working-${Date.now()}`;
      await request(app)
        .post('/api/stats')
        .send({ model: 'test-model', status: uniqueStatus });

      // Update only model
      await request(app)
        .post('/api/stats')
        .send({ model: 'updated-model' });

      // Status should be preserved
      const response = await request(app).get('/api/stats');
      expect(response.body.model).toBe('updated-model');
      expect(response.body.status).toBe(uniqueStatus);
    });
  });
});
