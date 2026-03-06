/**
 * Tests for hook-request API route
 * Story 141-6: Core API route tests (evaluation through portrait)
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  createHookRequestRouter,
  classifyHookSeverity,
  getHookClients,
  resolveApproval,
} from './hook-request.js';
import { getRoutePaths, findRouteLayer, createMockJsonRes } from './__test-helpers.js';

describe('hook-request API route', () => {
  it('createHookRequestRouter is a function', () => {
    assert.strictEqual(typeof createHookRequestRouter, 'function');
  });

  it('returns a router when called', () => {
    const router = createHookRequestRouter();
    assert.ok(router);
    assert.strictEqual(typeof router, 'function');
  });

  it('registers POST / and GET /pending routes', () => {
    const router = createHookRequestRouter();
    const paths = getRoutePaths(router);
    assert.ok(paths.includes('/'), 'Should have POST / route');
    assert.ok(paths.includes('/pending'), 'Should have GET /pending route');
  });

  it('GET /pending returns { pending: [] } with no pending approvals', () => {
    const router = createHookRequestRouter();
    const layer = findRouteLayer(router, '/pending', 'get');
    const { res, getResult } = createMockJsonRes();
    layer.route.stack[0].handle({}, res, () => {});
    const result = getResult();
    assert.ok(result, 'Should call res.json');
    assert.ok(Array.isArray(result.pending), 'pending should be an array');
  });
});

describe('classifyHookSeverity', () => {
  it('is a function', () => {
    assert.strictEqual(typeof classifyHookSeverity, 'function');
  });

  it('classifies Read as safe', () => {
    const result = classifyHookSeverity('Read', {});
    assert.strictEqual(result.severity, 'safe');
  });

  it('classifies Grep as safe', () => {
    const result = classifyHookSeverity('Grep', {});
    assert.strictEqual(result.severity, 'safe');
  });

  it('classifies Glob as safe', () => {
    const result = classifyHookSeverity('Glob', {});
    assert.strictEqual(result.severity, 'safe');
  });

  it('classifies safe Bash commands as safe', () => {
    const result = classifyHookSeverity('Bash', { command: 'ls -la' });
    assert.strictEqual(result.severity, 'safe');
  });

  it('classifies git status as safe', () => {
    const result = classifyHookSeverity('Bash', { command: 'git status' });
    assert.strictEqual(result.severity, 'safe');
  });

  it('classifies rm -rf as destructive', () => {
    const result = classifyHookSeverity('Bash', { command: 'rm -rf /' });
    assert.strictEqual(result.severity, 'destructive');
    assert.ok(result.warning, 'Should have a warning');
  });

  it('classifies git reset --hard as destructive', () => {
    const result = classifyHookSeverity('Bash', { command: 'git reset --hard HEAD' });
    assert.strictEqual(result.severity, 'destructive');
  });

  it('classifies unknown tools as normal', () => {
    const result = classifyHookSeverity('UnknownTool', {});
    assert.strictEqual(result.severity, 'normal');
  });

  it('classifies Write as normal for non-dangerous paths', () => {
    const result = classifyHookSeverity('Write', { file_path: '/tmp/test.txt' });
    assert.strictEqual(result.severity, 'normal');
  });

  it('classifies normal Bash commands as normal', () => {
    const result = classifyHookSeverity('Bash', { command: 'npm install' });
    assert.strictEqual(result.severity, 'normal');
  });
});

describe('hook-request utilities', () => {
  beforeEach(() => {
    getHookClients().clear();
  });

  it('getHookClients returns a Set', () => {
    const clients = getHookClients();
    assert.ok(clients instanceof Set);
  });

  it('resolveApproval returns false for unknown toolId', () => {
    const result = resolveApproval('nonexistent-tool-id', true);
    assert.strictEqual(result, false);
  });
});
