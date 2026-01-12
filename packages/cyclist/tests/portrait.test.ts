/**
 * E1-4: Character Portrait Display Tests
 *
 * These tests verify the acceptance criteria for the character portrait story.
 * Written in RED phase - tests should fail until Dev implements the functionality.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { Window } from 'happy-dom';
import { existsSync, mkdirSync, writeFileSync, unlinkSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { app } from '../src/server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('E1-4: Character Portrait Display', () => {
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

  describe('AC1: JPG image displays in portrait section', () => {
    it('should serve images from /images/ route', async () => {
      // Create test image directory and file
      const imagesDir = join(__dirname, '../src/public/images');
      const testImagePath = join(imagesDir, 'test-portrait.jpg');

      // Ensure images directory exists
      if (!existsSync(imagesDir)) {
        mkdirSync(imagesDir, { recursive: true });
      }

      // Create a minimal valid JPEG (1x1 pixel)
      // JPEG magic bytes + minimal valid structure
      const minimalJpeg = Buffer.from([
        0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
        0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
        0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
        0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
        0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
        0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
        0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
        0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
        0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00,
        0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
        0x09, 0x0A, 0x0B, 0xFF, 0xC4, 0x00, 0xB5, 0x10, 0x00, 0x02, 0x01, 0x03,
        0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7D,
        0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
        0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xA1, 0x08,
        0x23, 0x42, 0xB1, 0xC1, 0x15, 0x52, 0xD1, 0xF0, 0x24, 0x33, 0x62, 0x72,
        0x82, 0x09, 0x0A, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x25, 0x26, 0x27, 0x28,
        0x29, 0x2A, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3A, 0x43, 0x44, 0x45,
        0x46, 0x47, 0x48, 0x49, 0x4A, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
        0x5A, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6A, 0x73, 0x74, 0x75,
        0x76, 0x77, 0x78, 0x79, 0x7A, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
        0x8A, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9A, 0xA2, 0xA3,
        0xA4, 0xA5, 0xA6, 0xA7, 0xA8, 0xA9, 0xAA, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6,
        0xB7, 0xB8, 0xB9, 0xBA, 0xC2, 0xC3, 0xC4, 0xC5, 0xC6, 0xC7, 0xC8, 0xC9,
        0xCA, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7, 0xD8, 0xD9, 0xDA, 0xE1, 0xE2,
        0xE3, 0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEA, 0xF1, 0xF2, 0xF3, 0xF4,
        0xF5, 0xF6, 0xF7, 0xF8, 0xF9, 0xFA, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01,
        0x00, 0x00, 0x3F, 0x00, 0xFB, 0xD5, 0xDB, 0x20, 0xB8, 0xF9, 0xFF, 0xD9
      ]);

      writeFileSync(testImagePath, minimalJpeg);

      try {
        const response = await request(app).get('/images/test-portrait.jpg');
        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toMatch(/image\/jpeg/);
      } finally {
        // Cleanup
        unlinkSync(testImagePath);
      }
    });

    it('should have portrait container ready for image', () => {
      const portrait = document.querySelector('#portrait');
      expect(portrait).not.toBeNull();
    });

    it('should have img element or data-src attribute for portrait loading', () => {
      const portrait = document.querySelector('#portrait');
      // Should have either an img tag or a data-src for lazy loading
      const hasImg = portrait?.querySelector('img') !== null;
      const hasDataSrc = portrait?.hasAttribute('data-src') || portrait?.querySelector('[data-src]') !== null;
      expect(hasImg || hasDataSrc).toBe(true);
    });
  });

  describe('AC2: Image scales properly (contain/cover)', () => {
    it('should have object-fit styling for portrait images', () => {
      // CSS should have object-fit: cover or contain for portrait images
      expect(css).toMatch(/#portrait[^}]*object-fit\s*:\s*(cover|contain)/);
    });

    it('should have fixed 128x128 size for portrait container', () => {
      // Portrait is 128x128 for balanced display alongside identity info
      expect(css).toMatch(/#portrait[^}]*width:\s*128px/);
      expect(css).toMatch(/#portrait[^}]*height:\s*128px/);
    });

    it('should have overflow hidden to clip oversized images', () => {
      expect(css).toMatch(/#portrait[^}]*overflow\s*:\s*hidden/);
    });
  });

  describe('AC3: Fallback for missing image', () => {
    it('should have fallback placeholder element', () => {
      const portrait = document.querySelector('#portrait');
      const placeholder = portrait?.querySelector('.portrait-placeholder, .portrait-fallback');
      expect(placeholder).not.toBeNull();
    });

    it('should handle missing image gracefully via API', async () => {
      // Requesting non-existent image should return 404, not 500
      const response = await request(app).get('/images/nonexistent.jpg');
      expect(response.status).toBe(404);
    });

    it('should have onerror handler or CSS fallback for broken images', () => {
      const portrait = document.querySelector('#portrait');
      const img = portrait?.querySelector('img');

      if (img) {
        // If there's an img tag, it should have an onerror handler
        const hasOnerror = img.hasAttribute('onerror');
        // Or there should be a CSS fallback via ::before/background
        const hasCssFallback = css.match(/#portrait\s*(img)?[^}]*(::before|background)/);
        expect(hasOnerror || hasCssFallback).toBeTruthy();
      } else {
        // No img yet - placeholder is the fallback, which is fine
        const placeholder = portrait?.querySelector('.portrait-placeholder');
        expect(placeholder).not.toBeNull();
      }
    });
  });

  describe('AC4: Can swap portrait dynamically', () => {
    it('should have portrait API endpoint for setting portrait', async () => {
      const response = await request(app)
        .post('/api/portrait')
        .send({ src: '/images/test.jpg' });

      // Should accept the request (actual image loading is client-side)
      expect(response.status).toBe(200);
    });

    it('should have portrait API endpoint for getting current portrait', async () => {
      const response = await request(app).get('/api/portrait');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('src');
    });

    it('should include portrait.js or equivalent for client-side swapping', async () => {
      // HTML should include a script for portrait management
      const hasPortraitScript =
        html.includes('portrait.js') ||
        html.includes('portrait.ts') ||
        html.includes('data-portrait') ||
        html.includes('setPortrait');

      expect(hasPortraitScript).toBe(true);
    });

    it('should include portrait.js script', () => {
      // The HTML should include portrait.js which has portrait management functions
      expect(html.includes('portrait.js')).toBe(true);
    });
  });
});
