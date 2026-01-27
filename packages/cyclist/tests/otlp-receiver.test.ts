/**
 * E6-1: OTLP Collector Integration Tests
 *
 * These tests verify the acceptance criteria for OTLP metric collection.
 * They are written to FAIL initially (RED phase) and should pass after
 * Dev implements the otlp-receiver module.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

// Import will fail until otlp-receiver.ts exists - that's expected (RED phase)
// @ts-expect-error - File doesn't exist yet
import { parseOTLPMetrics, aggregateTokenStats, getTokenStats, resetTokenStats, setOtelDebug } from '../src/otlp-receiver.js';

import { app } from '../src/server.js';

// Sample OTLP payloads for testing (from story context)
const validTokenMetric = {
  resourceMetrics: [{
    scopeMetrics: [{
      metrics: [{
        name: 'claude_code.token.usage',
        sum: {
          dataPoints: [{
            asInt: 500,
            attributes: [
              { key: 'type', value: { stringValue: 'input' } }
            ]
          }]
        }
      }]
    }]
  }]
};

const multipleTokenTypes = {
  resourceMetrics: [{
    scopeMetrics: [{
      metrics: [{
        name: 'claude_code.token.usage',
        sum: {
          dataPoints: [
            { asInt: 1000, attributes: [{ key: 'type', value: { stringValue: 'input' } }] },
            { asInt: 500, attributes: [{ key: 'type', value: { stringValue: 'output' } }] },
            { asInt: 200, attributes: [{ key: 'type', value: { stringValue: 'cacheRead' } }] },
            { asInt: 50, attributes: [{ key: 'type', value: { stringValue: 'cacheCreation' } }] }
          ]
        }
      }]
    }]
  }]
};

const emptyPayload = {};

const malformedPayload = {
  resourceMetrics: [{ invalid: 'structure' }]
};

const nonTokenMetric = {
  resourceMetrics: [{
    scopeMetrics: [{
      metrics: [{
        name: 'some.other.metric',
        sum: {
          dataPoints: [{
            asInt: 999,
            attributes: []
          }]
        }
      }]
    }]
  }]
};

describe('E6-1: OTLP Collector Integration', () => {

  describe('AC1: POST /v1/metrics endpoint accepts OTLP JSON payloads', () => {

    it('should return 200 for valid OTLP payload', async () => {
      const response = await request(app)
        .post('/v1/metrics')
        .send(validTokenMetric)
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
    });

    it('should return 200 for empty payload (graceful handling)', async () => {
      const response = await request(app)
        .post('/v1/metrics')
        .send(emptyPayload)
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
    });

    it('should return 200 for malformed payload (graceful handling)', async () => {
      const response = await request(app)
        .post('/v1/metrics')
        .send(malformedPayload)
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
    });

  });

  describe('AC2: Parses claude_code.token.usage metrics correctly', () => {

    it('should parse valid OTLP JSON with token.usage metric', () => {
      const result = parseOTLPMetrics(validTokenMetric);

      expect(result).toBeDefined();
      expect(result.inputTokens).toBe(500);
    });

    it('should return empty stats for non-token metrics', () => {
      const result = parseOTLPMetrics(nonTokenMetric);

      // Should not extract anything from non-token metrics
      expect(result.inputTokens).toBeUndefined();
      expect(result.outputTokens).toBeUndefined();
    });

    it('should handle empty payload gracefully', () => {
      const result = parseOTLPMetrics(emptyPayload);

      // Should return empty object, not throw
      expect(result).toBeDefined();
    });

    it('should handle malformed payload gracefully', () => {
      const result = parseOTLPMetrics(malformedPayload);

      // Should return empty object, not throw
      expect(result).toBeDefined();
    });

  });

  describe('AC3: Extracts input/output/cache tokens by type attribute', () => {

    it('should extract input tokens from type=input attribute', () => {
      const result = parseOTLPMetrics(validTokenMetric);

      expect(result.inputTokens).toBe(500);
    });

    it('should extract output tokens from type=output attribute', () => {
      const outputMetric = {
        resourceMetrics: [{
          scopeMetrics: [{
            metrics: [{
              name: 'claude_code.token.usage',
              sum: {
                dataPoints: [{
                  asInt: 750,
                  attributes: [{ key: 'type', value: { stringValue: 'output' } }]
                }]
              }
            }]
          }]
        }]
      };

      const result = parseOTLPMetrics(outputMetric);
      expect(result.outputTokens).toBe(750);
    });

    it('should extract cacheRead tokens from type=cacheRead attribute', () => {
      const cacheReadMetric = {
        resourceMetrics: [{
          scopeMetrics: [{
            metrics: [{
              name: 'claude_code.token.usage',
              sum: {
                dataPoints: [{
                  asInt: 300,
                  attributes: [{ key: 'type', value: { stringValue: 'cacheRead' } }]
                }]
              }
            }]
          }]
        }]
      };

      const result = parseOTLPMetrics(cacheReadMetric);
      expect(result.cacheReadTokens).toBe(300);
    });

    it('should extract cacheCreation tokens from type=cacheCreation attribute', () => {
      const cacheCreationMetric = {
        resourceMetrics: [{
          scopeMetrics: [{
            metrics: [{
              name: 'claude_code.token.usage',
              sum: {
                dataPoints: [{
                  asInt: 100,
                  attributes: [{ key: 'type', value: { stringValue: 'cacheCreation' } }]
                }]
              }
            }]
          }]
        }]
      };

      const result = parseOTLPMetrics(cacheCreationMetric);
      expect(result.cacheCreationTokens).toBe(100);
    });

    it('should extract all token types from a single payload', () => {
      const result = parseOTLPMetrics(multipleTokenTypes);

      expect(result.inputTokens).toBe(1000);
      expect(result.outputTokens).toBe(500);
      expect(result.cacheReadTokens).toBe(200);
      expect(result.cacheCreationTokens).toBe(50);
    });

  });

  describe('AC4: Aggregates token counts across multiple requests', () => {

    beforeEach(() => {
      // Reset stats before each test
      resetTokenStats();
    });

    it('should add to running totals', () => {
      aggregateTokenStats({ inputTokens: 100 });
      aggregateTokenStats({ inputTokens: 200 });

      const stats = getTokenStats();
      expect(stats.inputTokens).toBe(300);
    });

    it('should handle partial updates (only some token types)', () => {
      aggregateTokenStats({ inputTokens: 100 });
      aggregateTokenStats({ outputTokens: 50 });

      const stats = getTokenStats();
      expect(stats.inputTokens).toBe(100);
      expect(stats.outputTokens).toBe(50);
    });

    it('should aggregate all token types correctly', () => {
      aggregateTokenStats({ inputTokens: 100, outputTokens: 50 });
      aggregateTokenStats({ cacheReadTokens: 25, cacheCreationTokens: 10 });
      aggregateTokenStats({ inputTokens: 100, outputTokens: 50 });

      const stats = getTokenStats();
      expect(stats.inputTokens).toBe(200);
      expect(stats.outputTokens).toBe(100);
      expect(stats.cacheReadTokens).toBe(25);
      expect(stats.cacheCreationTokens).toBe(10);
    });

    it('should reset stats correctly', () => {
      aggregateTokenStats({ inputTokens: 500 });
      resetTokenStats();

      const stats = getTokenStats();
      expect(stats.inputTokens).toBe(0);
      expect(stats.outputTokens).toBe(0);
      expect(stats.cacheReadTokens).toBe(0);
      expect(stats.cacheCreationTokens).toBe(0);
    });

    it('should track lastUpdated timestamp', () => {
      const before = Date.now();
      aggregateTokenStats({ inputTokens: 100 });
      const after = Date.now();

      const stats = getTokenStats();
      expect(stats.lastUpdated).toBeGreaterThanOrEqual(before);
      expect(stats.lastUpdated).toBeLessThanOrEqual(after);
    });

    it('should aggregate via HTTP endpoint', async () => {
      // Reset first
      resetTokenStats();

      // Send first request
      await request(app)
        .post('/v1/metrics')
        .send(validTokenMetric)
        .set('Content-Type', 'application/json');

      // Send second request
      await request(app)
        .post('/v1/metrics')
        .send(validTokenMetric)
        .set('Content-Type', 'application/json');

      const stats = getTokenStats();
      expect(stats.inputTokens).toBe(1000); // 500 + 500
    });

  });

  describe('AC5: Logs received metrics for debugging', () => {

    it('should log when metrics are received with debug enabled', async () => {
      // Enable OTEL debug mode to trigger console.log
      setOtelDebug(true);
      const consoleSpy = vi.spyOn(console, 'log');

      await request(app)
        .post('/v1/metrics')
        .send(validTokenMetric)
        .set('Content-Type', 'application/json');

      // Should have logged something about receiving metrics
      expect(consoleSpy).toHaveBeenCalled();
      const calls = consoleSpy.mock.calls.flat().join(' ');
      expect(calls).toMatch(/otlp|metrics|token/i);

      consoleSpy.mockRestore();
      setOtelDebug(false);
    });

  });

});
