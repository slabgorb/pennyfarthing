/**
 * Tests for Story 124-1: Extract Server Engine into packages/bikerack/
 *
 * These tests verify the BikeRack package extraction from core and cyclist.
 * The package must:
 *
 * AC1: packages/bikerack/src/ contains Express app factory, route mounting,
 *      all 30+ API routers, OTLP receiver interface, file watchers,
 *      settings management, story-parser, sprint-data, env detection,
 *      paths resolution
 * AC2: packages/bikerack/ has its own package.json with @pennyfarthing/bikerack name
 * AC3: packages/bikerack/ builds independently via the monorepo build toolchain
 * AC4: No Electron dependency exists in packages/bikerack/package.json
 *
 * Reference: ADR-0030 "What moves where" section defines exact file mapping.
 *
 * Run with: cd packages/bikerack && npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve paths relative to compiled test location (dist/) back to package root
const BIKERACK_ROOT = join(__dirname, '..');
const BIKERACK_SRC = join(BIKERACK_ROOT, 'src');

// =============================================================================
// AC1: Server engine components exist in packages/bikerack/src/
// =============================================================================

describe('AC1: Server engine components in packages/bikerack/src/', () => {

  // --- Express app factory and route mounting ---

  it('should contain server.ts (Express app factory)', () => {
    assert.ok(
      existsSync(join(BIKERACK_SRC, 'server.ts')),
      'Expected packages/bikerack/src/server.ts — Express app factory and route mounting'
    );
  });

  it('should export createServer or createTerminalServer from server.ts', () => {
    const serverPath = join(BIKERACK_SRC, 'server.ts');
    assert.ok(existsSync(serverPath), 'server.ts does not exist');
    const content = readFileSync(serverPath, 'utf-8');
    assert.ok(
      /export\s+(?:function|const|async\s+function)\s+create(?:Terminal)?Server/.test(content) ||
      /export\s*\{[^}]*create(?:Terminal)?Server/.test(content),
      'server.ts should export a createServer or createTerminalServer function'
    );
  });

  // --- API routers ---

  it('should contain api/ directory', () => {
    assert.ok(
      existsSync(join(BIKERACK_SRC, 'api')),
      'Expected packages/bikerack/src/api/ directory for API routers'
    );
  });

  it('should contain 30+ API router files in api/', () => {
    const apiDir = join(BIKERACK_SRC, 'api');
    assert.ok(existsSync(apiDir), 'api/ directory does not exist');
    const routerFiles = readdirSync(apiDir).filter(
      f => f.endsWith('.ts') && f !== 'index.ts' && !f.endsWith('.test.ts')
    );
    assert.ok(
      routerFiles.length >= 30,
      `Expected 30+ API router files in api/, found ${routerFiles.length}: ${routerFiles.join(', ')}`
    );
  });

  it('should contain api/index.ts barrel export', () => {
    assert.ok(
      existsSync(join(BIKERACK_SRC, 'api', 'index.ts')),
      'Expected packages/bikerack/src/api/index.ts barrel export'
    );
  });

  // --- Key API routers (spot check critical ones) ---

  it('should contain api/stats.ts router', () => {
    assert.ok(
      existsSync(join(BIKERACK_SRC, 'api', 'stats.ts')),
      'Expected api/stats.ts — token/system statistics broadcast'
    );
  });

  it('should contain api/git.ts router', () => {
    assert.ok(
      existsSync(join(BIKERACK_SRC, 'api', 'git.ts')),
      'Expected api/git.ts — git repository info'
    );
  });

  it('should contain api/story.ts router', () => {
    assert.ok(
      existsSync(join(BIKERACK_SRC, 'api', 'story.ts')),
      'Expected api/story.ts — story/workflow info'
    );
  });

  it('should contain api/settings.ts router', () => {
    assert.ok(
      existsSync(join(BIKERACK_SRC, 'api', 'settings.ts')),
      'Expected api/settings.ts — settings API'
    );
  });

  it('should contain api/persona.ts router', () => {
    assert.ok(
      existsSync(join(BIKERACK_SRC, 'api', 'persona.ts')),
      'Expected api/persona.ts — persona streaming and state'
    );
  });

  // --- OTLP receiver interface ---

  it('should contain otlp-receiver.ts', () => {
    assert.ok(
      existsSync(join(BIKERACK_SRC, 'otlp-receiver.ts')),
      'Expected packages/bikerack/src/otlp-receiver.ts — OTLP receiver interface'
    );
  });

  // --- Settings management ---

  it('should contain settings.ts', () => {
    assert.ok(
      existsSync(join(BIKERACK_SRC, 'settings.ts')),
      'Expected packages/bikerack/src/settings.ts — settings initialization'
    );
  });

  it('should contain settings-store.ts', () => {
    assert.ok(
      existsSync(join(BIKERACK_SRC, 'settings-store.ts')),
      'Expected packages/bikerack/src/settings-store.ts — grant management and session state'
    );
  });

  // --- Story/sprint data ---

  it('should contain story-parser.ts', () => {
    assert.ok(
      existsSync(join(BIKERACK_SRC, 'story-parser.ts')),
      'Expected packages/bikerack/src/story-parser.ts — story/workflow parsing'
    );
  });

  it('should contain story-context.ts', () => {
    assert.ok(
      existsSync(join(BIKERACK_SRC, 'story-context.ts')),
      'Expected packages/bikerack/src/story-context.ts — story context wrapper'
    );
  });

  it('should contain agent-context.ts', () => {
    assert.ok(
      existsSync(join(BIKERACK_SRC, 'agent-context.ts')),
      'Expected packages/bikerack/src/agent-context.ts — agent context types'
    );
  });

  // --- Env detection ---

  it('should contain env.ts', () => {
    assert.ok(
      existsSync(join(BIKERACK_SRC, 'env.ts')),
      'Expected packages/bikerack/src/env.ts — environment/mode detection'
    );
  });

  // --- Paths resolution ---

  it('should contain paths.ts', () => {
    assert.ok(
      existsSync(join(BIKERACK_SRC, 'paths.ts')),
      'Expected packages/bikerack/src/paths.ts — project directory resolution'
    );
  });

  // --- Pennyfarthing detection ---

  it('should contain pennyfarthing.ts', () => {
    assert.ok(
      existsSync(join(BIKERACK_SRC, 'pennyfarthing.ts')),
      'Expected packages/bikerack/src/pennyfarthing.ts — project detection'
    );
  });
});

// =============================================================================
// AC2: package.json with @pennyfarthing/bikerack name
// =============================================================================

describe('AC2: package.json with @pennyfarthing/bikerack name', () => {

  it('should have package.json', () => {
    assert.ok(
      existsSync(join(BIKERACK_ROOT, 'package.json')),
      'Expected packages/bikerack/package.json to exist'
    );
  });

  it('should have name @pennyfarthing/bikerack', () => {
    const pkg = JSON.parse(readFileSync(join(BIKERACK_ROOT, 'package.json'), 'utf-8'));
    assert.strictEqual(pkg.name, '@pennyfarthing/bikerack');
  });

  it('should have type set to module', () => {
    const pkg = JSON.parse(readFileSync(join(BIKERACK_ROOT, 'package.json'), 'utf-8'));
    assert.strictEqual(pkg.type, 'module');
  });

  it('should declare express as a dependency', () => {
    const pkg = JSON.parse(readFileSync(join(BIKERACK_ROOT, 'package.json'), 'utf-8'));
    assert.ok(
      pkg.dependencies?.express,
      'Expected express in dependencies — BikeRack runs an Express server'
    );
  });

  it('should declare ws as a dependency', () => {
    const pkg = JSON.parse(readFileSync(join(BIKERACK_ROOT, 'package.json'), 'utf-8'));
    assert.ok(
      pkg.dependencies?.ws,
      'Expected ws in dependencies — BikeRack serves WebSocket channels'
    );
  });
});

// =============================================================================
// AC3: Builds independently via monorepo build toolchain
// =============================================================================

describe('AC3: Builds independently via monorepo build toolchain', () => {

  it('should have tsconfig.json', () => {
    assert.ok(
      existsSync(join(BIKERACK_ROOT, 'tsconfig.json')),
      'Expected packages/bikerack/tsconfig.json for TypeScript compilation'
    );
  });

  it('should extend the monorepo base tsconfig', () => {
    const tsconfig = JSON.parse(readFileSync(join(BIKERACK_ROOT, 'tsconfig.json'), 'utf-8'));
    assert.ok(
      tsconfig.extends?.includes('tsconfig.base.json'),
      'Expected tsconfig.json to extend ../../tsconfig.base.json'
    );
  });

  it('should have a build script in package.json', () => {
    const pkg = JSON.parse(readFileSync(join(BIKERACK_ROOT, 'package.json'), 'utf-8'));
    assert.ok(pkg.scripts?.build, 'Expected build script in package.json');
  });

  it('should produce dist/ output after build', () => {
    assert.ok(
      existsSync(join(BIKERACK_ROOT, 'dist')),
      'Expected packages/bikerack/dist/ to exist — run `npm run build` first'
    );
  });

  it('should produce compiled server.js in dist/', () => {
    assert.ok(
      existsSync(join(BIKERACK_ROOT, 'dist', 'server.js')),
      'Expected packages/bikerack/dist/server.js — compiled server module'
    );
  });

  it('should produce type declarations for server', () => {
    assert.ok(
      existsSync(join(BIKERACK_ROOT, 'dist', 'server.d.ts')),
      'Expected packages/bikerack/dist/server.d.ts — type declarations'
    );
  });

  it('should produce compiled index.js in dist/', () => {
    assert.ok(
      existsSync(join(BIKERACK_ROOT, 'dist', 'index.js')),
      'Expected packages/bikerack/dist/index.js — package entry point'
    );
  });
});

// =============================================================================
// AC4: No Electron dependency
// =============================================================================

describe('AC4: No Electron dependency in packages/bikerack/package.json', () => {

  it('should not have electron in dependencies', () => {
    const pkg = JSON.parse(readFileSync(join(BIKERACK_ROOT, 'package.json'), 'utf-8'));
    const deps = Object.keys(pkg.dependencies || {});
    assert.ok(
      !deps.some(d => d.includes('electron')),
      `Found electron-related package in dependencies: ${deps.filter(d => d.includes('electron')).join(', ')}`
    );
  });

  it('should not have electron in devDependencies', () => {
    const pkg = JSON.parse(readFileSync(join(BIKERACK_ROOT, 'package.json'), 'utf-8'));
    const deps = Object.keys(pkg.devDependencies || {});
    assert.ok(
      !deps.some(d => d.includes('electron')),
      `Found electron-related package in devDependencies: ${deps.filter(d => d.includes('electron')).join(', ')}`
    );
  });

  it('should not have node-pty in any dependency group', () => {
    const pkg = JSON.parse(readFileSync(join(BIKERACK_ROOT, 'package.json'), 'utf-8'));
    const allDeps = [
      ...Object.keys(pkg.dependencies || {}),
      ...Object.keys(pkg.devDependencies || {}),
      ...Object.keys(pkg.peerDependencies || {}),
    ];
    assert.ok(
      !allDeps.includes('node-pty'),
      'Found node-pty in dependencies — BikeRack must not require native modules'
    );
  });

  it('should not import from electron in any source file', () => {
    if (!existsSync(BIKERACK_SRC)) {
      assert.fail('packages/bikerack/src/ does not exist yet');
      return;
    }
    const checkDir = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          checkDir(fullPath);
        } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
          const content = readFileSync(fullPath, 'utf-8');
          assert.ok(
            !content.includes("from 'electron'") && !content.includes('from "electron"'),
            `${entry.name} imports from electron`
          );
        }
      }
    };
    checkDir(BIKERACK_SRC);
  });
});
