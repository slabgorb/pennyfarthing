/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for bell API (WebSocket broadcast utilities)
 * Story 141-5: Core API route tests (agent-load through dependencies)
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { getBellClients, broadcastBellConsumed } from './bell.js';

describe('bell API', () => {
  beforeEach(() => {
    getBellClients().clear();
  });

  it('getBellClients returns a Set', () => {
    const clients = getBellClients();
    assert.ok(clients instanceof Set);
  });

  it('getBellClients returns same instance across calls', () => {
    assert.strictEqual(getBellClients(), getBellClients());
  });

  it('broadcastBellConsumed is a function', () => {
    assert.strictEqual(typeof broadcastBellConsumed, 'function');
  });

  it('broadcastBellConsumed does not throw with no clients', () => {
    assert.doesNotThrow(() => broadcastBellConsumed('test'));
  });

  it('broadcastBellConsumed sends JSON to OPEN clients', () => {
    const clients = getBellClients();
    const sent: string[] = [];
    const mockClient = { readyState: 1, send(d: string) { sent.push(d); } };
    clients.add(mockClient as any);

    broadcastBellConsumed('hello');

    assert.strictEqual(sent.length, 1);
    const parsed = JSON.parse(sent[0]);
    assert.strictEqual(parsed.type, 'bell-consumed');
    assert.strictEqual(parsed.text, 'hello');
    assert.strictEqual(typeof parsed.timestamp, 'number');
  });

  it('broadcastBellConsumed skips non-OPEN clients', () => {
    const clients = getBellClients();
    const sent: string[] = [];
    clients.add({ readyState: 3, send(d: string) { sent.push(d); } } as any);

    broadcastBellConsumed('should not arrive');
    assert.strictEqual(sent.length, 0);
  });

  it('broadcastBellConsumed sends to multiple OPEN clients', () => {
    const clients = getBellClients();
    const sentA: string[] = [];
    const sentB: string[] = [];
    clients.add({ readyState: 1, send(d: string) { sentA.push(d); } } as any);
    clients.add({ readyState: 1, send(d: string) { sentB.push(d); } } as any);

    broadcastBellConsumed('multi');
    assert.strictEqual(sentA.length, 1);
    assert.strictEqual(sentB.length, 1);
  });
});
