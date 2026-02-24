/**
 * Tests for Story 124-3: Introduce DataSource<T> and Refactor Panel Hooks
 *
 * RED phase: These tests define the DataSource<T> contract that must be
 * implemented. They should ALL FAIL until the implementation is written.
 *
 * AC1: @pennyfarthing/core exports a DataSource<T> typed provider interface
 * AC2: 11+ panel hooks consume DataSource<T> instead of direct WebSocket URLs
 * AC3: Interface supports parameterized queries for future multi-session composition
 * AC5: TypeScript enforces the contract at compile time
 * AC6: Mock providers can be created for testing
 *
 * Run with: cd packages/core && node --test dist/data-source.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve paths relative to compiled test location (dist/) back to source
const CORE_ROOT = join(__dirname, '..');
const CORE_SRC = join(CORE_ROOT, 'src');
const CYCLIST_HOOKS = join(CORE_ROOT, '..', 'cyclist', 'src', 'public', 'hooks');

// =============================================================================
// AC1: @pennyfarthing/core exports a DataSource<T> typed provider interface
// =============================================================================

describe('AC1: DataSource<T> interface exported from core', () => {

  it('should have a data-source module in core', () => {
    // The DataSource<T> interface should live in packages/core/src/public/data-source.ts
    const dataSourcePath = join(CORE_SRC, 'public', 'data-source.ts');
    assert.ok(
      existsSync(dataSourcePath),
      `DataSource module should exist at ${dataSourcePath}`
    );
  });

  it('should export the DataSource<T> interface', () => {
    const dataSourcePath = join(CORE_SRC, 'public', 'data-source.ts');
    const content = readFileSync(dataSourcePath, 'utf-8');
    assert.ok(
      /export\s+(interface|type)\s+DataSource\s*</.test(content),
      'DataSource<T> interface should be exported'
    );
  });

  it('should define subscribe method on DataSource<T>', () => {
    const dataSourcePath = join(CORE_SRC, 'public', 'data-source.ts');
    const content = readFileSync(dataSourcePath, 'utf-8');
    assert.ok(
      /subscribe\s*\(/.test(content),
      'DataSource<T> should have a subscribe method for receiving data updates'
    );
  });

  it('should define connect and disconnect lifecycle methods', () => {
    const dataSourcePath = join(CORE_SRC, 'public', 'data-source.ts');
    const content = readFileSync(dataSourcePath, 'utf-8');
    assert.ok(
      /connect\s*\(/.test(content),
      'DataSource<T> should have a connect() method'
    );
    assert.ok(
      /disconnect\s*\(/.test(content),
      'DataSource<T> should have a disconnect() method'
    );
  });

  it('should be re-exported from the core package barrel', () => {
    // Check that the public barrel file exports DataSource
    const barrelCandidates = [
      join(CORE_SRC, 'public', 'index.ts'),
      join(CORE_SRC, 'index.ts'),
    ];
    const barrel = barrelCandidates.find(p => existsSync(p));
    assert.ok(barrel, 'Core should have a barrel export file');

    const content = readFileSync(barrel!, 'utf-8');
    assert.ok(
      /data-source/.test(content),
      'Core barrel should re-export from data-source module'
    );
  });
});

// =============================================================================
// AC3: Interface supports parameterized queries
// =============================================================================

describe('AC3: Parameterized query support', () => {

  it('should support query parameters in the DataSource interface', () => {
    const dataSourcePath = join(CORE_SRC, 'public', 'data-source.ts');
    const content = readFileSync(dataSourcePath, 'utf-8');
    // The interface should accept params/query for multi-session composition
    assert.ok(
      /params|query|QueryParams|DataSourceOptions/.test(content),
      'DataSource<T> should support parameterized queries (params, query, or options)'
    );
  });

  it('should export a DataSourceOptions or QueryParams type', () => {
    const dataSourcePath = join(CORE_SRC, 'public', 'data-source.ts');
    const content = readFileSync(dataSourcePath, 'utf-8');
    assert.ok(
      /export\s+(interface|type)\s+(DataSourceOptions|QueryParams|DataSourceConfig)/.test(content),
      'Should export a configuration/params type for parameterized queries'
    );
  });
});

// =============================================================================
// AC5: TypeScript enforces the contract at compile time
// =============================================================================

describe('AC5: Compile-time contract enforcement', () => {

  it('should use generic type parameter T for data shape', () => {
    const dataSourcePath = join(CORE_SRC, 'public', 'data-source.ts');
    const content = readFileSync(dataSourcePath, 'utf-8');
    // T should appear in method signatures, not just the interface declaration
    assert.ok(
      /:\s*T[\s;,\)]|Promise<T|callback.*T[\s;,\)]/.test(content),
      'DataSource<T> should use T in method return types or callback signatures'
    );
  });

  it('should define error handling in the interface', () => {
    const dataSourcePath = join(CORE_SRC, 'public', 'data-source.ts');
    const content = readFileSync(dataSourcePath, 'utf-8');
    assert.ok(
      /onError|error.*callback|Error/.test(content),
      'DataSource<T> should define error handling (onError or error callback)'
    );
  });
});

// =============================================================================
// AC6: Mock providers can be created for testing
// =============================================================================

describe('AC6: Mock providers for testing', () => {

  it('should have a MockDataSource implementation', () => {
    // MockDataSource should be exported for test use
    const mockCandidates = [
      join(CORE_SRC, 'public', 'mock-data-source.ts'),
      join(CORE_SRC, 'public', 'data-source.ts'),  // might be in same file
      join(CORE_SRC, 'test-utils', 'mock-data-source.ts'),
    ];
    const hasMock = mockCandidates.some(p => {
      if (!existsSync(p)) return false;
      const content = readFileSync(p, 'utf-8');
      return /MockDataSource|class\s+Mock.*DataSource/.test(content);
    });
    assert.ok(hasMock, 'MockDataSource should exist in core for testing');
  });

  it('MockDataSource should implement DataSource<T> interface', () => {
    const mockCandidates = [
      join(CORE_SRC, 'public', 'mock-data-source.ts'),
      join(CORE_SRC, 'public', 'data-source.ts'),
      join(CORE_SRC, 'test-utils', 'mock-data-source.ts'),
    ];
    const mockFile = mockCandidates.find(p => {
      if (!existsSync(p)) return false;
      const content = readFileSync(p, 'utf-8');
      return /MockDataSource/.test(content);
    });
    assert.ok(mockFile, 'MockDataSource file should exist');

    const content = readFileSync(mockFile!, 'utf-8');
    assert.ok(
      /implements\s+DataSource\s*</.test(content),
      'MockDataSource should explicitly implement DataSource<T>'
    );
  });

  it('MockDataSource should allow emitting test data', () => {
    const mockCandidates = [
      join(CORE_SRC, 'public', 'mock-data-source.ts'),
      join(CORE_SRC, 'public', 'data-source.ts'),
      join(CORE_SRC, 'test-utils', 'mock-data-source.ts'),
    ];
    const mockFile = mockCandidates.find(p => {
      if (!existsSync(p)) return false;
      const content = readFileSync(p, 'utf-8');
      return /MockDataSource/.test(content);
    });
    assert.ok(mockFile, 'MockDataSource file should exist');

    const content = readFileSync(mockFile!, 'utf-8');
    assert.ok(
      /emit|push|send|next/.test(content),
      'MockDataSource should have a method to emit/push test data to subscribers'
    );
  });
});

// =============================================================================
// AC2: 11+ panel hooks consume DataSource<T> instead of direct WebSocket URLs
// =============================================================================

describe('AC2: Panel hooks consume DataSource<T>', () => {

  // These are the data hooks that currently use direct WebSocket connections
  const DATA_HOOKS = [
    'useSprint.ts',
    'useGitStatus.ts',
    'useDiffs.ts',
    'useStory.ts',
    'useTodos.ts',
    'usePersona.ts',
    'useCodeMarkers.ts',
    'useComplexity.ts',
    'useDeadCode.ts',
    'useDependencies.ts',
    'useHotspots.ts',
    'useHealthScore.ts',
    'useAgentLoad.ts',
    'useStatsStrip.ts',
  ];

  it('should have at least 11 data hooks that use DataSource', () => {
    let dataSourceHookCount = 0;
    for (const hookFile of DATA_HOOKS) {
      const hookPath = join(CYCLIST_HOOKS, hookFile);
      if (!existsSync(hookPath)) continue;
      const content = readFileSync(hookPath, 'utf-8');
      if (/DataSource|useDataSource|dataSource/.test(content)) {
        dataSourceHookCount++;
      }
    }
    assert.ok(
      dataSourceHookCount >= 11,
      `At least 11 hooks should consume DataSource<T>, found ${dataSourceHookCount}`
    );
  });

  it('should NOT have direct WebSocket instantiation in data hooks', () => {
    const violatingHooks: string[] = [];
    for (const hookFile of DATA_HOOKS) {
      const hookPath = join(CYCLIST_HOOKS, hookFile);
      if (!existsSync(hookPath)) continue;
      const content = readFileSync(hookPath, 'utf-8');
      // Check for direct `new WebSocket(` which should be replaced
      if (/new\s+WebSocket\s*\(/.test(content)) {
        violatingHooks.push(hookFile);
      }
    }
    assert.deepStrictEqual(
      violatingHooks,
      [],
      `These hooks still use direct WebSocket: ${violatingHooks.join(', ')}`
    );
  });

  // Spot-check the most important hooks individually
  for (const hookFile of ['useSprint.ts', 'useGitStatus.ts', 'useDiffs.ts', 'useStory.ts', 'useTodos.ts']) {
    it(`${hookFile} should import from DataSource, not WebSocket`, () => {
      const hookPath = join(CYCLIST_HOOKS, hookFile);
      assert.ok(existsSync(hookPath), `${hookFile} should exist`);
      const content = readFileSync(hookPath, 'utf-8');
      assert.ok(
        /DataSource|useDataSource/.test(content),
        `${hookFile} should reference DataSource`
      );
      assert.ok(
        !/new\s+WebSocket\s*\(/.test(content),
        `${hookFile} should not directly instantiate WebSocket`
      );
    });
  }
});
