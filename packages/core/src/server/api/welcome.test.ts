/**
 * Tests for welcome API (WebSocket broadcast utilities)
 * Story 141-7: Core API route tests (settings through welcome)
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { getWelcomeClients, broadcastWelcome } from './welcome.js';

describe('welcome API', () => {
  beforeEach(() => {
    getWelcomeClients().clear();
  });

  it('getWelcomeClients returns a Set', () => {
    const clients = getWelcomeClients();
    assert.ok(clients instanceof Set);
  });

  it('getWelcomeClients returns same instance across calls', () => {
    assert.strictEqual(getWelcomeClients(), getWelcomeClients());
  });

  it('broadcastWelcome is a function', () => {
    assert.strictEqual(typeof broadcastWelcome, 'function');
  });

  it('broadcastWelcome does not throw with no clients', () => {
    assert.doesNotThrow(() => broadcastWelcome({ project: 'test', theme: 'west-wing' }));
  });

  it('broadcastWelcome sends JSON to OPEN clients', () => {
    const clients = getWelcomeClients();
    const sent: string[] = [];
    const mockClient = { readyState: 1, send(d: string) { sent.push(d); } };
    clients.add(mockClient as any);

    broadcastWelcome({ project: 'my-project', theme: 'west-wing' });

    assert.strictEqual(sent.length, 1);
    const parsed = JSON.parse(sent[0]);
    assert.strictEqual(parsed.type, 'welcome');
    assert.strictEqual(parsed.project, 'my-project');
    assert.strictEqual(parsed.theme, 'west-wing');
    assert.strictEqual(parsed.showNudge, false);
    assert.strictEqual(typeof parsed.timestamp, 'number');
  });

  it('broadcastWelcome respects showNudge flag', () => {
    const clients = getWelcomeClients();
    const sent: string[] = [];
    clients.add({ readyState: 1, send(d: string) { sent.push(d); } } as any);

    broadcastWelcome({ project: 'p', theme: 't', showNudge: true });

    const parsed = JSON.parse(sent[0]);
    assert.strictEqual(parsed.showNudge, true);
  });

  it('broadcastWelcome skips non-OPEN clients', () => {
    const clients = getWelcomeClients();
    const sent: string[] = [];
    clients.add({ readyState: 3, send(d: string) { sent.push(d); } } as any);

    broadcastWelcome({ project: 'p', theme: 't' });
    assert.strictEqual(sent.length, 0);
  });

  it('broadcastWelcome sends to multiple OPEN clients', () => {
    const clients = getWelcomeClients();
    const sentA: string[] = [];
    const sentB: string[] = [];
    clients.add({ readyState: 1, send(d: string) { sentA.push(d); } } as any);
    clients.add({ readyState: 1, send(d: string) { sentB.push(d); } } as any);

    broadcastWelcome({ project: 'p', theme: 't' });
    assert.strictEqual(sentA.length, 1);
    assert.strictEqual(sentB.length, 1);
  });
});
