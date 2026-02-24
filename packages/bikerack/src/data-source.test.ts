/**
 * Tests for Story 124-3: WebSocketDataSource in BikeRack
 *
 * RED phase: These tests define the WebSocketDataSource<T> contract.
 * They should ALL FAIL until the implementation is written.
 *
 * AC4: WebSocketDataSource is implemented in packages/bikerack/ for live local data
 *
 * Run with: cd packages/bikerack && node --test dist/data-source.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve paths relative to compiled test location (dist/) back to source
const BIKERACK_ROOT = join(__dirname, '..');
const BIKERACK_SRC = join(BIKERACK_ROOT, 'src');
const CORE_SRC = join(BIKERACK_ROOT, '..', 'core', 'src');

// =============================================================================
// AC4: WebSocketDataSource is implemented in packages/bikerack/
// =============================================================================

describe('AC4: WebSocketDataSource in packages/bikerack/', () => {

  it('should have a WebSocketDataSource module', () => {
    const candidates = [
      join(BIKERACK_SRC, 'websocket-data-source.ts'),
      join(BIKERACK_SRC, 'data-source.ts'),
      join(BIKERACK_SRC, 'ws-data-source.ts'),
    ];
    const exists = candidates.some(p => existsSync(p));
    assert.ok(
      exists,
      `WebSocketDataSource module should exist in bikerack/src/ (checked: ${candidates.map(p => p.split('/').pop()).join(', ')})`
    );
  });

  it('should export WebSocketDataSource class', () => {
    const candidates = [
      join(BIKERACK_SRC, 'websocket-data-source.ts'),
      join(BIKERACK_SRC, 'data-source.ts'),
      join(BIKERACK_SRC, 'ws-data-source.ts'),
    ];
    const file = candidates.find(p => existsSync(p));
    assert.ok(file, 'WebSocketDataSource file should exist');

    const content = readFileSync(file!, 'utf-8');
    assert.ok(
      /export\s+class\s+WebSocketDataSource/.test(content),
      'WebSocketDataSource class should be exported'
    );
  });

  it('should implement DataSource<T> from core', () => {
    const candidates = [
      join(BIKERACK_SRC, 'websocket-data-source.ts'),
      join(BIKERACK_SRC, 'data-source.ts'),
      join(BIKERACK_SRC, 'ws-data-source.ts'),
    ];
    const file = candidates.find(p => existsSync(p));
    assert.ok(file, 'WebSocketDataSource file should exist');

    const content = readFileSync(file!, 'utf-8');
    assert.ok(
      /implements\s+DataSource\s*</.test(content),
      'WebSocketDataSource should implement DataSource<T> from core'
    );
  });

  it('should import DataSource from @pennyfarthing/core', () => {
    const candidates = [
      join(BIKERACK_SRC, 'websocket-data-source.ts'),
      join(BIKERACK_SRC, 'data-source.ts'),
      join(BIKERACK_SRC, 'ws-data-source.ts'),
    ];
    const file = candidates.find(p => existsSync(p));
    assert.ok(file, 'WebSocketDataSource file should exist');

    const content = readFileSync(file!, 'utf-8');
    assert.ok(
      /@pennyfarthing\/core/.test(content),
      'WebSocketDataSource should import from @pennyfarthing/core'
    );
  });

  it('should handle WebSocket URL construction', () => {
    const candidates = [
      join(BIKERACK_SRC, 'websocket-data-source.ts'),
      join(BIKERACK_SRC, 'data-source.ts'),
      join(BIKERACK_SRC, 'ws-data-source.ts'),
    ];
    const file = candidates.find(p => existsSync(p));
    assert.ok(file, 'WebSocketDataSource file should exist');

    const content = readFileSync(file!, 'utf-8');
    assert.ok(
      /url|endpoint|path|WebSocket/.test(content),
      'WebSocketDataSource should handle URL/endpoint configuration'
    );
  });

  it('should implement reconnection logic', () => {
    const candidates = [
      join(BIKERACK_SRC, 'websocket-data-source.ts'),
      join(BIKERACK_SRC, 'data-source.ts'),
      join(BIKERACK_SRC, 'ws-data-source.ts'),
    ];
    const file = candidates.find(p => existsSync(p));
    assert.ok(file, 'WebSocketDataSource file should exist');

    const content = readFileSync(file!, 'utf-8');
    assert.ok(
      /reconnect|retry|timeout|setTimeout/.test(content),
      'WebSocketDataSource should implement reconnection logic'
    );
  });

  it('should handle message parsing with generic type T', () => {
    const candidates = [
      join(BIKERACK_SRC, 'websocket-data-source.ts'),
      join(BIKERACK_SRC, 'data-source.ts'),
      join(BIKERACK_SRC, 'ws-data-source.ts'),
    ];
    const file = candidates.find(p => existsSync(p));
    assert.ok(file, 'WebSocketDataSource file should exist');

    const content = readFileSync(file!, 'utf-8');
    assert.ok(
      /JSON\.parse|transform|parse|deserialize/.test(content),
      'WebSocketDataSource should handle message parsing'
    );
  });

  it('should be listed in bikerack package.json exports or barrel', () => {
    const indexPath = join(BIKERACK_SRC, 'index.ts');
    if (existsSync(indexPath)) {
      const content = readFileSync(indexPath, 'utf-8');
      assert.ok(
        /WebSocketDataSource|websocket-data-source|data-source/.test(content),
        'BikeRack barrel should export WebSocketDataSource'
      );
    } else {
      // Check package.json exports field
      const pkgPath = join(BIKERACK_ROOT, 'package.json');
      assert.ok(existsSync(pkgPath), 'BikeRack package.json should exist');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      const exports = JSON.stringify(pkg.exports || {});
      assert.ok(
        /data-source/.test(exports),
        'BikeRack package.json exports should include data-source'
      );
    }
  });
});

// =============================================================================
// AC4 + AC1: Integration — BikeRack depends on Core's DataSource<T>
// =============================================================================

describe('AC4+AC1: BikeRack depends on Core DataSource interface', () => {

  it('bikerack package.json should depend on @pennyfarthing/core', () => {
    const pkgPath = join(BIKERACK_ROOT, 'package.json');
    assert.ok(existsSync(pkgPath), 'BikeRack package.json should exist');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    const deps = { ...pkg.dependencies, ...pkg.peerDependencies };
    assert.ok(
      '@pennyfarthing/core' in deps,
      'BikeRack should depend on @pennyfarthing/core'
    );
  });

  it('DataSource<T> in core should be the single interface definition', () => {
    // Verify core has the interface
    const coreDataSource = join(CORE_SRC, 'public', 'data-source.ts');
    assert.ok(
      existsSync(coreDataSource),
      'Core should define DataSource<T> at src/public/data-source.ts'
    );

    // Verify bikerack does NOT redefine the interface
    const candidates = [
      join(BIKERACK_SRC, 'websocket-data-source.ts'),
      join(BIKERACK_SRC, 'data-source.ts'),
      join(BIKERACK_SRC, 'ws-data-source.ts'),
    ];
    for (const file of candidates) {
      if (!existsSync(file)) continue;
      const content = readFileSync(file, 'utf-8');
      // It should implement, not redefine
      const definesInterface = /export\s+interface\s+DataSource\s*</.test(content);
      assert.ok(
        !definesInterface,
        `BikeRack should NOT redefine DataSource<T> — it should import from core`
      );
    }
  });
});
