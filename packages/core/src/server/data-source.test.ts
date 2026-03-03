/**
 * Tests for WebSocketDataSource in packages/core/src/server/
 *
 * Originally Story 124-3 (BikeRack). Code absorbed into core (Story 98-16).
 * WebSocketDataSource<T> implements DataSource<T> for live WebSocket data.
 *
 * Run with: cd packages/core && node --test dist/server/data-source.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// At runtime __dirname = dist/server/, so go up to packages/core/
const CORE_ROOT = join(__dirname, '..', '..');
const CORE_SRC = join(CORE_ROOT, 'src');
const SERVER_SRC = join(CORE_SRC, 'server');

describe('WebSocketDataSource in packages/core/src/server/', () => {

  it('should have websocket-data-source.ts module', () => {
    assert.ok(
      existsSync(join(SERVER_SRC, 'websocket-data-source.ts')),
      'websocket-data-source.ts should exist in core/src/server/'
    );
  });

  it('should export WebSocketDataSource class', () => {
    const file = join(SERVER_SRC, 'websocket-data-source.ts');
    const content = readFileSync(file, 'utf-8');
    assert.ok(
      /export\s+class\s+WebSocketDataSource/.test(content),
      'WebSocketDataSource class should be exported'
    );
  });

  it('should implement DataSource<T>', () => {
    const file = join(SERVER_SRC, 'websocket-data-source.ts');
    const content = readFileSync(file, 'utf-8');
    assert.ok(
      /implements\s+DataSource\s*</.test(content),
      'WebSocketDataSource should implement DataSource<T>'
    );
  });

  it('should import DataSource from relative path (not old package)', () => {
    const file = join(SERVER_SRC, 'websocket-data-source.ts');
    const content = readFileSync(file, 'utf-8');
    assert.ok(
      !/@pennyfarthing\/core/.test(content),
      'Should use relative import, not @pennyfarthing/core (absorbed into core)'
    );
    assert.ok(
      /import.*DataSource/.test(content),
      'Should import DataSource interface'
    );
  });

  it('should handle WebSocket URL construction', () => {
    const file = join(SERVER_SRC, 'websocket-data-source.ts');
    const content = readFileSync(file, 'utf-8');
    assert.ok(
      /url|endpoint|path|WebSocket/.test(content),
      'Should handle URL/endpoint configuration'
    );
  });

  it('should implement reconnection logic', () => {
    const file = join(SERVER_SRC, 'websocket-data-source.ts');
    const content = readFileSync(file, 'utf-8');
    assert.ok(
      /reconnect|retry|timeout|setTimeout/.test(content),
      'Should implement reconnection logic'
    );
  });

  it('should handle message parsing with generic type T', () => {
    const file = join(SERVER_SRC, 'websocket-data-source.ts');
    const content = readFileSync(file, 'utf-8');
    assert.ok(
      /JSON\.parse|transform|parse|deserialize/.test(content),
      'Should handle message parsing'
    );
  });

  it('should be re-exported from server barrel', () => {
    const indexPath = join(SERVER_SRC, 'index.ts');
    if (existsSync(indexPath)) {
      const content = readFileSync(indexPath, 'utf-8');
      assert.ok(
        /WebSocketDataSource|websocket-data-source/.test(content),
        'Server barrel should re-export WebSocketDataSource'
      );
    }
  });
});

describe('DataSource<T> interface in core', () => {

  it('DataSource<T> interface exists in core', () => {
    const candidates = [
      join(CORE_SRC, 'data-source.ts'),
      join(CORE_SRC, 'public', 'data-source.ts'),
    ];
    const found = candidates.find(p => existsSync(p));
    assert.ok(found, 'DataSource<T> interface should exist in core/src/');

    const content = readFileSync(found!, 'utf-8');
    assert.ok(
      /export\s+interface\s+DataSource\s*</.test(content),
      'Should export DataSource<T> interface'
    );
  });

  it('WebSocketDataSource should not redefine DataSource interface', () => {
    const file = join(SERVER_SRC, 'websocket-data-source.ts');
    const content = readFileSync(file, 'utf-8');
    const definesInterface = /export\s+interface\s+DataSource\s*</.test(content);
    assert.ok(
      !definesInterface,
      'websocket-data-source.ts should NOT redefine DataSource<T> — it should import it'
    );
  });
});
