/**
 * Tests for persona API route
 * Story 141-6: Core API route tests (evaluation through portrait)
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  createPersonaRouter,
  getPersonaClients,
  getStreamingState,
  setStreamingState,
  broadcastPersona,
} from './persona.js';
import { getRoutePaths } from './__test-helpers.js';

describe('persona API route', () => {
  it('createPersonaRouter is a function', () => {
    assert.strictEqual(typeof createPersonaRouter, 'function');
  });

  it('returns a router when called with getProjectDir', () => {
    const router = createPersonaRouter(() => '/tmp/test');
    assert.ok(router);
    assert.strictEqual(typeof router, 'function');
  });

  it('registers GET / and GET /full routes', () => {
    const router = createPersonaRouter(() => '/tmp/test');
    const paths = getRoutePaths(router);
    assert.ok(paths.includes('/'), 'Should have GET / route');
    assert.ok(paths.includes('/full'), 'Should have GET /full route');
  });
});

describe('persona utilities', () => {
  beforeEach(() => {
    getPersonaClients().clear();
    setStreamingState(false);
  });

  it('getPersonaClients returns a Set', () => {
    const clients = getPersonaClients();
    assert.ok(clients instanceof Set);
  });

  it('getStreamingState returns false initially', () => {
    assert.strictEqual(getStreamingState(), false);
  });

  it('setStreamingState updates state', () => {
    setStreamingState(true);
    assert.strictEqual(getStreamingState(), true);
  });

  it('broadcastPersona does not throw with no clients', () => {
    assert.doesNotThrow(() => {
      broadcastPersona({ character: 'test', role: 'dev' } as never);
    });
  });

  it('broadcastPersona sends to OPEN clients', () => {
    const clients = getPersonaClients();
    const sent: string[] = [];
    clients.add({ readyState: 1, send(d: string) { sent.push(d); } } as never);

    broadcastPersona({ character: 'test', role: 'dev' } as never);
    assert.strictEqual(sent.length, 1);
    const parsed = JSON.parse(sent[0]);
    assert.strictEqual(parsed.character, 'test');
    assert.strictEqual(typeof parsed.isStreaming, 'boolean');
  });

  it('broadcastPersona skips non-OPEN clients', () => {
    const clients = getPersonaClients();
    const sent: string[] = [];
    clients.add({ readyState: 3, send(d: string) { sent.push(d); } } as never);

    broadcastPersona({ character: 'test' } as never);
    assert.strictEqual(sent.length, 0);
  });
});
