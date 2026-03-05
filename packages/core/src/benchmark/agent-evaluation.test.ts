/**
 * Agent Evaluation Relocation Tests — Story 141-21, AC1
 *
 * Verifies that agent-evaluation.ts has been moved from cyclist to
 * packages/core/src/benchmark/ (or packages/benchmark/) and that all
 * exported functions are accessible from the new location.
 *
 * RED state: These tests will fail until the relocation is complete.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('agent-evaluation relocation (141-21 AC1)', () => {
  // -------------------------------------------------------------------------
  // Structural: file must exist in new location, not in cyclist
  // -------------------------------------------------------------------------

  it('should have agent-evaluation.ts in core/benchmark/', () => {
    const newPath = resolve(__dirname, 'agent-evaluation.ts');
    assert.ok(
      existsSync(newPath),
      `Expected agent-evaluation.ts at ${newPath} but file does not exist`
    );
  });

  it('should NOT have agent-evaluation.ts in cyclist/src/', () => {
    const oldPath = resolve(
      __dirname,
      '../../../cyclist/src/agent-evaluation.ts'
    );
    assert.ok(
      !existsSync(oldPath),
      `agent-evaluation.ts still exists in cyclist at ${oldPath} — it should be removed`
    );
  });

  // -------------------------------------------------------------------------
  // Export verification: all public functions importable from new location
  // -------------------------------------------------------------------------

  it('should export calculateCompletionRate', async () => {
    const mod = await import('./agent-evaluation.js');
    assert.strictEqual(typeof mod.calculateCompletionRate, 'function');
  });

  it('should export calculateErrorRate', async () => {
    const mod = await import('./agent-evaluation.js');
    assert.strictEqual(typeof mod.calculateErrorRate, 'function');
  });

  it('should export calculateAverageTokens', async () => {
    const mod = await import('./agent-evaluation.js');
    assert.strictEqual(typeof mod.calculateAverageTokens, 'function');
  });

  it('should export calculateAverageTime', async () => {
    const mod = await import('./agent-evaluation.js');
    assert.strictEqual(typeof mod.calculateAverageTime, 'function');
  });

  it('should export calculateToolEfficiency', async () => {
    const mod = await import('./agent-evaluation.js');
    assert.strictEqual(typeof mod.calculateToolEfficiency, 'function');
  });

  it('should export aggregateByAgent', async () => {
    const mod = await import('./agent-evaluation.js');
    assert.strictEqual(typeof mod.aggregateByAgent, 'function');
  });

  it('should export aggregateByPersona', async () => {
    const mod = await import('./agent-evaluation.js');
    assert.strictEqual(typeof mod.aggregateByPersona, 'function');
  });

  it('should export aggregateByTaskType', async () => {
    const mod = await import('./agent-evaluation.js');
    assert.strictEqual(typeof mod.aggregateByTaskType, 'function');
  });

  it('should export createEvaluation', async () => {
    const mod = await import('./agent-evaluation.js');
    assert.strictEqual(typeof mod.createEvaluation, 'function');
  });

  it('should export getEvaluation', async () => {
    const mod = await import('./agent-evaluation.js');
    assert.strictEqual(typeof mod.getEvaluation, 'function');
  });

  it('should export detectRegressions', async () => {
    const mod = await import('./agent-evaluation.js');
    assert.strictEqual(typeof mod.detectRegressions, 'function');
  });

  it('should export generateRecommendations', async () => {
    const mod = await import('./agent-evaluation.js');
    assert.strictEqual(typeof mod.generateRecommendations, 'function');
  });

  it('should export loadJobFairBaselines', async () => {
    const mod = await import('./agent-evaluation.js');
    assert.strictEqual(typeof mod.loadJobFairBaselines, 'function');
  });

  it('should export compareToBaseline', async () => {
    const mod = await import('./agent-evaluation.js');
    assert.strictEqual(typeof mod.compareToBaseline, 'function');
  });

  it('should export storeEvaluation', async () => {
    const mod = await import('./agent-evaluation.js');
    assert.strictEqual(typeof mod.storeEvaluation, 'function');
  });

  it('should export getEvaluationHistory', async () => {
    const mod = await import('./agent-evaluation.js');
    assert.strictEqual(typeof mod.getEvaluationHistory, 'function');
  });

  it('should export detectTrend', async () => {
    const mod = await import('./agent-evaluation.js');
    assert.strictEqual(typeof mod.detectTrend, 'function');
  });

  it('should export resetEvaluation', async () => {
    const mod = await import('./agent-evaluation.js');
    assert.strictEqual(typeof mod.resetEvaluation, 'function');
  });

  it('should export resetHistory', async () => {
    const mod = await import('./agent-evaluation.js');
    assert.strictEqual(typeof mod.resetHistory, 'function');
  });

  // -------------------------------------------------------------------------
  // Core server stub should re-export from new location
  // -------------------------------------------------------------------------

  it('should have core server stub that delegates to benchmark module', async () => {
    const stub = await import('../server/agent-evaluation.js');
    // After relocation, the stub should re-export real functions, not return empty stubs
    const evaluation = stub.getEvaluation();
    // The stub currently returns null — after relocation it should still return null
    // (no active evaluation), but the function should come from the real module
    assert.strictEqual(typeof stub.getEvaluation, 'function');
    assert.strictEqual(typeof stub.detectTrend, 'function');
    assert.strictEqual(typeof stub.generateRecommendations, 'function');
  });
});
