/**
 * Tests for Story 124-2: Move WebSocket and OTLP from Cyclist to BikeRack
 *
 * These tests verify that BikeRack contains the real WebSocket channel handlers
 * and OTLP receiver implementation (not just stubs), while core retains only
 * interface definitions and delegating stubs.
 *
 * AC1: All WebSocket channel handlers are in packages/bikerack/
 * AC2: Real OTLP receiver implementation is in packages/bikerack/
 * AC3: Core retains only interface stubs, not implementations
 * AC4: BikeRack can start its server and serve all WebSocket channels without Cyclist
 *
 * Run with: cd packages/bikerack && npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve paths relative to compiled test location (dist/) back to package root
const BIKERACK_ROOT = join(__dirname, '..');
const BIKERACK_SRC = join(BIKERACK_ROOT, 'src');
const CORE_SRC = join(BIKERACK_ROOT, '..', 'core', 'src', 'server');
const CYCLIST_SRC = join(BIKERACK_ROOT, '..', 'cyclist', 'src');

// =============================================================================
// AC1: All WebSocket channel handlers are in packages/bikerack/
// =============================================================================

describe('AC1: WebSocket channel handlers in packages/bikerack/', () => {

  const EXPECTED_CHANNELS = [
    '/ws/stats',
    '/ws/persona',
    '/ws/token-stats',
    '/ws/claude',
    '/ws/livereload',
    '/ws/story',
    '/ws/git',
    '/ws/bell',
    '/ws/spans',
    '/ws/welcome',
    '/ws/hooks',
    '/ws/settings',
    '/ws/context',
    '/ws/todos',
    '/ws/sprint',
    '/ws/diffs',
    '/ws/focus',
  ];

  it('should contain websocket.ts with real implementation (not a stub)', () => {
    const wsPath = join(BIKERACK_SRC, 'websocket.ts');
    assert.ok(existsSync(wsPath), 'Expected packages/bikerack/src/websocket.ts');
    const content = readFileSync(wsPath, 'utf-8');
    // Real implementation creates WebSocketServer instances — stubs don't
    assert.ok(
      content.includes('new WebSocketServer'),
      'websocket.ts should create WebSocketServer instances (currently a stub)'
    );
  });

  it('should export setupWebSocketServers function', () => {
    const wsPath = join(BIKERACK_SRC, 'websocket.ts');
    assert.ok(existsSync(wsPath), 'websocket.ts does not exist');
    const content = readFileSync(wsPath, 'utf-8');
    assert.ok(
      /export\s+function\s+setupWebSocketServers/.test(content),
      'websocket.ts should export setupWebSocketServers'
    );
  });

  it('should import WebSocketServer from ws', () => {
    const wsPath = join(BIKERACK_SRC, 'websocket.ts');
    assert.ok(existsSync(wsPath), 'websocket.ts does not exist');
    const content = readFileSync(wsPath, 'utf-8');
    assert.ok(
      content.includes("from 'ws'") || content.includes('from "ws"'),
      'websocket.ts should import from ws package'
    );
  });

  for (const channel of EXPECTED_CHANNELS) {
    it(`should handle WebSocket channel ${channel}`, () => {
      const wsPath = join(BIKERACK_SRC, 'websocket.ts');
      assert.ok(existsSync(wsPath), 'websocket.ts does not exist');
      const content = readFileSync(wsPath, 'utf-8');
      assert.ok(
        content.includes(`'${channel}'`) || content.includes(`"${channel}"`),
        `websocket.ts should handle channel ${channel}`
      );
    });
  }

  // Client getter exports — these allow API routes to broadcast to connected clients
  const CLIENT_GETTERS = [
    'getStoryClients',
    'getGitClients',
    'getSpansClients',
    'getSettingsClients',
    'getContextClients',
    'getTodosClients',
    'getSprintClients',
    'getClaudeClients',
    'getFocusClients',
  ];

  for (const getter of CLIENT_GETTERS) {
    it(`should export client getter: ${getter}`, () => {
      const wsPath = join(BIKERACK_SRC, 'websocket.ts');
      assert.ok(existsSync(wsPath), 'websocket.ts does not exist');
      const content = readFileSync(wsPath, 'utf-8');
      assert.ok(
        new RegExp(`export\\s+function\\s+${getter}`).test(content),
        `websocket.ts should export ${getter}`
      );
    });
  }

  // Broadcast functions — these push data to all connected WebSocket clients
  const BROADCAST_FUNCTIONS = [
    'broadcastClaudeMessage',
    'broadcastClaudeComplete',
    'broadcastClaudeError',
    'broadcastTodosUpdate',
    'broadcastSettingsUpdate',
    'broadcastContextUpdate',
    'broadcastFocusUpdate',
  ];

  for (const fn of BROADCAST_FUNCTIONS) {
    it(`should export broadcast function: ${fn}`, () => {
      const wsPath = join(BIKERACK_SRC, 'websocket.ts');
      assert.ok(existsSync(wsPath), 'websocket.ts does not exist');
      const content = readFileSync(wsPath, 'utf-8');
      assert.ok(
        new RegExp(`export\\s+function\\s+${fn}`).test(content),
        `websocket.ts should export ${fn}`
      );
    });
  }

  it('should handle HTTP upgrade event for WebSocket routing', () => {
    const wsPath = join(BIKERACK_SRC, 'websocket.ts');
    assert.ok(existsSync(wsPath), 'websocket.ts does not exist');
    const content = readFileSync(wsPath, 'utf-8');
    assert.ok(
      content.includes("'upgrade'") || content.includes('"upgrade"'),
      'websocket.ts should listen for HTTP upgrade events to route WebSocket connections'
    );
  });
});

// =============================================================================
// AC2: Real OTLP receiver implementation is in packages/bikerack/
// =============================================================================

describe('AC2: Real OTLP receiver implementation in packages/bikerack/', () => {

  it('should contain otlp-receiver.ts with real OTLP parsing', () => {
    const otlpPath = join(BIKERACK_SRC, 'otlp-receiver.ts');
    assert.ok(existsSync(otlpPath), 'Expected packages/bikerack/src/otlp-receiver.ts');
    const content = readFileSync(otlpPath, 'utf-8');
    // Real implementation has span correlation and file enrichment imports
    assert.ok(
      content.includes('span-correlation') || content.includes('spanCorrelation'),
      'otlp-receiver.ts should import span correlation (real implementation, not stub)'
    );
  });

  it('should import file enrichment modules', () => {
    const otlpPath = join(BIKERACK_SRC, 'otlp-receiver.ts');
    assert.ok(existsSync(otlpPath), 'otlp-receiver.ts does not exist');
    const content = readFileSync(otlpPath, 'utf-8');
    assert.ok(
      content.includes('file-enrichment') || content.includes('fileEnrichment'),
      'otlp-receiver.ts should import file enrichment for span processing'
    );
  });

  it('should import agent context aggregation', () => {
    const otlpPath = join(BIKERACK_SRC, 'otlp-receiver.ts');
    assert.ok(existsSync(otlpPath), 'otlp-receiver.ts does not exist');
    const content = readFileSync(otlpPath, 'utf-8');
    assert.ok(
      content.includes('agent-context') || content.includes('agentContext'),
      'otlp-receiver.ts should import agent context for per-agent token aggregation'
    );
  });

  it('should import story context aggregation', () => {
    const otlpPath = join(BIKERACK_SRC, 'otlp-receiver.ts');
    assert.ok(existsSync(otlpPath), 'otlp-receiver.ts does not exist');
    const content = readFileSync(otlpPath, 'utf-8');
    assert.ok(
      content.includes('story-context') || content.includes('storyContext'),
      'otlp-receiver.ts should import story context for per-story token aggregation'
    );
  });

  // Real implementation exports these functions (Cyclist's version)
  const REAL_OTLP_EXPORTS = [
    'parseOTLPMetrics',
    'parseOTLPLogs',
    'aggregateTokenStats',
    'getTokenStats',
    'resetTokenStats',
    'processLogEvents',
    'recordToolEvent',
    'getToolEvents',
    'getToolEventsFiltered',
    'getToolTypes',
    'getAuditLogStats',
    'exportAuditLogAsJSON',
    'exportAuditLogAsCSV',
    'resetEventStore',
    'trackBackgroundTask',
    'getBackgroundTasks',
    'getBackgroundTaskByToolId',
    'completeBackgroundTask',
    'addTokenStatsListener',
    'addToolEventListener',
    'getUserEmail',
    'setOtelDebug',
    'isOtelDebugEnabled',
  ];

  for (const fn of REAL_OTLP_EXPORTS) {
    it(`should export real implementation: ${fn}`, () => {
      const otlpPath = join(BIKERACK_SRC, 'otlp-receiver.ts');
      assert.ok(existsSync(otlpPath), 'otlp-receiver.ts does not exist');
      const content = readFileSync(otlpPath, 'utf-8');
      assert.ok(
        new RegExp(`export\\s+function\\s+${fn}`).test(content),
        `otlp-receiver.ts should export ${fn}`
      );
    });
  }

  // Supporting modules that must also live in BikeRack
  const SUPPORTING_MODULES = [
    { file: 'span-correlation.ts', desc: 'span correlation for OTLP trace processing' },
    { file: 'file-enrichment.ts', desc: 'file enrichment for Read/Edit/Write spans' },
    { file: 'enriched-span-exporter.ts', desc: 'enriched span export for debugging UI' },
  ];

  for (const mod of SUPPORTING_MODULES) {
    it(`should contain ${mod.file} — ${mod.desc}`, () => {
      assert.ok(
        existsSync(join(BIKERACK_SRC, mod.file)),
        `Expected packages/bikerack/src/${mod.file} — ${mod.desc}`
      );
    });
  }

  it('should export span correlation function: correlateSpan', () => {
    const scPath = join(BIKERACK_SRC, 'span-correlation.ts');
    assert.ok(existsSync(scPath), 'span-correlation.ts does not exist');
    const content = readFileSync(scPath, 'utf-8');
    assert.ok(
      /export\s+function\s+correlateSpan/.test(content),
      'span-correlation.ts should export correlateSpan'
    );
  });

  it('should export file enrichment functions', () => {
    const fePath = join(BIKERACK_SRC, 'file-enrichment.ts');
    assert.ok(existsSync(fePath), 'file-enrichment.ts does not exist');
    const content = readFileSync(fePath, 'utf-8');
    assert.ok(
      /export\s+(async\s+)?function\s+enrichReadSpan/.test(content),
      'file-enrichment.ts should export enrichReadSpan'
    );
  });
});

// =============================================================================
// AC3: Core retains only interface stubs, not implementations
// =============================================================================

describe('AC3: Core retains only interface stubs', () => {

  it('core websocket.ts should remain a stub (no WebSocketServer)', () => {
    const coreWsPath = join(CORE_SRC, 'websocket.ts');
    assert.ok(existsSync(coreWsPath), 'Expected core/src/server/websocket.ts');
    const content = readFileSync(coreWsPath, 'utf-8');
    assert.ok(
      !content.includes('new WebSocketServer'),
      'Core websocket.ts should NOT create WebSocketServer — it is a stub'
    );
  });

  it('core websocket.ts should have a no-op setupWebSocketServers', () => {
    const coreWsPath = join(CORE_SRC, 'websocket.ts');
    assert.ok(existsSync(coreWsPath), 'Expected core/src/server/websocket.ts');
    const content = readFileSync(coreWsPath, 'utf-8');
    // Stub should have underscore-prefixed params (unused) and empty body
    assert.ok(
      content.includes('_server') || content.includes('_getProjectDir'),
      'Core websocket.ts should be a no-op stub with unused parameters'
    );
  });

  it('core otlp-receiver.ts should retain OTLPProvider interface', () => {
    const coreOtlpPath = join(CORE_SRC, 'otlp-receiver.ts');
    assert.ok(existsSync(coreOtlpPath), 'Expected core/src/server/otlp-receiver.ts');
    const content = readFileSync(coreOtlpPath, 'utf-8');
    assert.ok(
      content.includes('export interface OTLPProvider'),
      'Core otlp-receiver.ts should retain OTLPProvider interface definition'
    );
  });

  it('core otlp-receiver.ts should use provider delegation pattern', () => {
    const coreOtlpPath = join(CORE_SRC, 'otlp-receiver.ts');
    assert.ok(existsSync(coreOtlpPath), 'Expected core/src/server/otlp-receiver.ts');
    const content = readFileSync(coreOtlpPath, 'utf-8');
    assert.ok(
      content.includes('_provider') && content.includes('setOTLPProvider'),
      'Core otlp-receiver.ts should delegate to provider, not implement directly'
    );
  });

  it('core otlp-receiver.ts should NOT import span-correlation', () => {
    const coreOtlpPath = join(CORE_SRC, 'otlp-receiver.ts');
    assert.ok(existsSync(coreOtlpPath), 'Expected core/src/server/otlp-receiver.ts');
    const content = readFileSync(coreOtlpPath, 'utf-8');
    assert.ok(
      !content.includes('span-correlation'),
      'Core otlp-receiver.ts should NOT import span-correlation — that belongs in BikeRack'
    );
  });

  it('core otlp-receiver.ts should NOT import file-enrichment', () => {
    const coreOtlpPath = join(CORE_SRC, 'otlp-receiver.ts');
    assert.ok(existsSync(coreOtlpPath), 'Expected core/src/server/otlp-receiver.ts');
    const content = readFileSync(coreOtlpPath, 'utf-8');
    assert.ok(
      !content.includes('file-enrichment'),
      'Core otlp-receiver.ts should NOT import file-enrichment — that belongs in BikeRack'
    );
  });
});

// =============================================================================
// AC4: BikeRack can start its server and serve WebSocket channels without Cyclist
// =============================================================================

describe('AC4: BikeRack server serves WebSocket channels without Cyclist', () => {

  it('server.ts should import setupWebSocketServers from local websocket module', () => {
    const serverPath = join(BIKERACK_SRC, 'server.ts');
    assert.ok(existsSync(serverPath), 'Expected packages/bikerack/src/server.ts');
    const content = readFileSync(serverPath, 'utf-8');
    assert.ok(
      content.includes("from './websocket.js'") || content.includes('from "./websocket.js"'),
      'server.ts should import setupWebSocketServers from local ./websocket.js'
    );
  });

  it('server.ts should call setupWebSocketServers in createTerminalServer', () => {
    const serverPath = join(BIKERACK_SRC, 'server.ts');
    assert.ok(existsSync(serverPath), 'Expected packages/bikerack/src/server.ts');
    const content = readFileSync(serverPath, 'utf-8');
    assert.ok(
      content.includes('setupWebSocketServers(server'),
      'server.ts should call setupWebSocketServers(server, ...) in createTerminalServer'
    );
  });

  it('server.ts should NOT import from @pennyfarthing/cyclist', () => {
    const serverPath = join(BIKERACK_SRC, 'server.ts');
    assert.ok(existsSync(serverPath), 'Expected packages/bikerack/src/server.ts');
    const content = readFileSync(serverPath, 'utf-8');
    assert.ok(
      !content.includes('@pennyfarthing/cyclist'),
      'server.ts should not depend on @pennyfarthing/cyclist — BikeRack is standalone'
    );
  });

  it('websocket.ts should NOT import from @pennyfarthing/cyclist', () => {
    const wsPath = join(BIKERACK_SRC, 'websocket.ts');
    assert.ok(existsSync(wsPath), 'Expected packages/bikerack/src/websocket.ts');
    const content = readFileSync(wsPath, 'utf-8');
    assert.ok(
      !content.includes('@pennyfarthing/cyclist'),
      'websocket.ts should not depend on @pennyfarthing/cyclist — BikeRack is standalone'
    );
  });

  it('otlp-receiver.ts should NOT import from @pennyfarthing/cyclist', () => {
    const otlpPath = join(BIKERACK_SRC, 'otlp-receiver.ts');
    assert.ok(existsSync(otlpPath), 'Expected packages/bikerack/src/otlp-receiver.ts');
    const content = readFileSync(otlpPath, 'utf-8');
    assert.ok(
      !content.includes('@pennyfarthing/cyclist'),
      'otlp-receiver.ts should not depend on @pennyfarthing/cyclist — BikeRack is standalone'
    );
  });

  it('BikeRack package.json should NOT depend on @pennyfarthing/cyclist', () => {
    const pkgPath = join(BIKERACK_ROOT, 'package.json');
    assert.ok(existsSync(pkgPath), 'Expected packages/bikerack/package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    const allDeps = [
      ...Object.keys(pkg.dependencies || {}),
      ...Object.keys(pkg.devDependencies || {}),
      ...Object.keys(pkg.peerDependencies || {}),
    ];
    assert.ok(
      !allDeps.includes('@pennyfarthing/cyclist'),
      'BikeRack should not depend on @pennyfarthing/cyclist'
    );
  });

  it('should export setOTLPProvider from server.ts for Cyclist to wire in', () => {
    const serverPath = join(BIKERACK_SRC, 'server.ts');
    assert.ok(existsSync(serverPath), 'Expected packages/bikerack/src/server.ts');
    const content = readFileSync(serverPath, 'utf-8');
    assert.ok(
      content.includes('setOTLPProvider'),
      'server.ts should re-export setOTLPProvider so Cyclist can wire its provider'
    );
  });
});
