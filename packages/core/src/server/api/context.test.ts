/**
 * Tests for context API route
 * Story 141-5: Core API route tests (agent-load through dependencies)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createContextRouter, getContextUsage, resolveContextScript } from './context.js';
import { getRoutePaths } from './__test-helpers.js';

describe('context API route', () => {
  it('createContextRouter is a function', () => {
    assert.strictEqual(typeof createContextRouter, 'function');
  });

  it('returns a router when called', () => {
    const router = createContextRouter(() => '/tmp/test');
    assert.ok(router);
    assert.strictEqual(typeof router, 'function');
  });

  it('registers GET / route', () => {
    const router = createContextRouter(() => '/tmp/test');
    assert.ok(getRoutePaths(router).includes('/'));
  });
});

describe('getContextUsage', () => {
  it('is a function', () => {
    assert.strictEqual(typeof getContextUsage, 'function');
  });

  it('returns ContextInfo shape for nonexistent project', () => {
    const result = getContextUsage('/nonexistent/project');
    assert.strictEqual(typeof result, 'object');
    assert.ok('percent' in result);
    assert.ok('tokens' in result);
    assert.ok('status' in result);
    assert.ok('error' in result);
    assert.ok('baseline' in result);
    assert.ok('usableTokens' in result);
    assert.ok('usablePercent' in result);
    assert.ok('available' in result);
  });

  it('returns error when context.py not found', () => {
    const result = getContextUsage('/nonexistent/project');
    assert.ok(result.error, 'Should have an error');
  });

  it('returns null numeric values when script not found', () => {
    const result = getContextUsage('/nonexistent/project');
    assert.strictEqual(result.percent, null);
    assert.strictEqual(result.tokens, null);
    assert.strictEqual(result.status, null);
    assert.strictEqual(result.baseline, null);
    assert.strictEqual(result.usableTokens, null);
    assert.strictEqual(result.usablePercent, null);
    assert.strictEqual(result.available, null);
  });
});

describe('resolveContextScript', () => {
  it('is a function', () => {
    assert.strictEqual(typeof resolveContextScript, 'function');
  });

  it('returns expected shape', () => {
    const result = resolveContextScript('/nonexistent');
    assert.ok('path' in result);
    assert.ok('isPython' in result);
    assert.ok('paths' in result);
    assert.ok(Array.isArray(result.paths));
  });

  it('returns a result for nonexistent project', () => {
    const result = resolveContextScript('/nonexistent');
    // In dev environment, resolvePennyfarthingDist() may find a real script
    // via node_modules. path is null only when no dist fallback exists.
    if (result.path === null) {
      assert.strictEqual(result.isPython, false);
    } else {
      assert.strictEqual(result.isPython, true);
      assert.ok(result.path.endsWith('.py'), 'Found path should be a python script');
    }
  });

  it('checks multiple candidate paths', () => {
    const result = resolveContextScript('/nonexistent');
    assert.ok(result.paths.length > 0);
    assert.ok(result.paths.some(p => p.includes('context_window.py') || p.includes('context.py')), 'Should check python paths');
    // Shell paths only added when no python match found first; in dev env
    // a dist fallback may match before shell candidates are enumerated
    if (!result.isPython) {
      assert.ok(result.paths.some(p => p.endsWith('check-context.sh')), 'Should check shell paths');
    }
  });
});
