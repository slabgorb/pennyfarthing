/**
 * Tests for Story 98-18: Move React UI build and static assets into core
 *
 * Verifies that the Vite build pipeline, React source files, and static
 * asset output have been migrated from packages/cyclist/ to packages/core/.
 * The core server (98-17) already serves dist/public/ — these tests ensure
 * the build pipeline that PRODUCES those assets now lives in core.
 *
 * Test categories:
 * 1. AC1 — Vite build pipeline exists in core
 * 2. AC2 — Static assets build to core distribution
 * 3. AC3 — React builds independently from Electron
 * 4. AC4 — Core server serves migrated UI assets
 * 5. AC6 — Build integration end-to-end
 *
 * Run with: cd packages/core && npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Core package root: from dist/server/ (compiled) go up 2 levels
const coreRoot = join(__dirname, '..', '..');
const srcPublic = join(coreRoot, 'src', 'public');
const distPublic = join(coreRoot, 'dist', 'public');

// =============================================================================
// AC1: Vite build pipeline moved from Cyclist to Core
// =============================================================================

describe('AC1: Vite build pipeline in core', () => {
  it('vite.config.ts exists in core package root', () => {
    const configPath = join(coreRoot, 'vite.config.ts');
    assert.ok(
      existsSync(configPath),
      `Expected vite.config.ts at ${configPath}`
    );
  });

  it('package.json has build:react script', () => {
    const pkgPath = join(coreRoot, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    assert.ok(
      pkg.scripts?.['build:react'],
      'package.json should have a build:react script'
    );
  });

  it('package.json has vite as devDependency', () => {
    const pkgPath = join(coreRoot, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    assert.ok(
      pkg.devDependencies?.vite,
      'vite should be in devDependencies'
    );
  });

  it('package.json has @vitejs/plugin-react as devDependency', () => {
    const pkgPath = join(coreRoot, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    assert.ok(
      pkg.devDependencies?.['@vitejs/plugin-react'],
      '@vitejs/plugin-react should be in devDependencies'
    );
  });
});

// =============================================================================
// AC2: Static assets (HTML, CSS, JS) build to Core distribution
// =============================================================================

describe('AC2: Static assets build to core distribution', () => {
  it('src/public/index.html exists', () => {
    const htmlPath = join(srcPublic, 'index.html');
    assert.ok(
      existsSync(htmlPath),
      `Expected index.html at ${htmlPath}`
    );
  });

  it('src/public/index.tsx entry point exists', () => {
    const entryPath = join(srcPublic, 'index.tsx');
    assert.ok(
      existsSync(entryPath),
      `Expected index.tsx entry point at ${entryPath}`
    );
  });

  it('dist/public/js/react/react.js exists after build', () => {
    const jsPath = join(distPublic, 'js', 'react', 'react.js');
    assert.ok(
      existsSync(jsPath),
      `Expected built JS at ${jsPath} — run build:react first`
    );
  });

  it('dist/public/css/react.css exists after build', () => {
    const cssPath = join(distPublic, 'css', 'react.css');
    assert.ok(
      existsSync(cssPath),
      `Expected built CSS at ${cssPath} — run build:react first`
    );
  });
});

// =============================================================================
// AC3: React components build independently from Electron
// =============================================================================

describe('AC3: React builds independently from Electron', () => {
  it('vite.config.ts marks electron as external', () => {
    const configPath = join(coreRoot, 'vite.config.ts');
    assert.ok(existsSync(configPath), 'vite.config.ts must exist first');
    const config = readFileSync(configPath, 'utf8');
    assert.ok(
      config.includes('electron'),
      'vite.config.ts should externalize electron'
    );
    assert.ok(
      config.includes('external'),
      'vite.config.ts should have external config for electron'
    );
  });

  it('core package.json has no electron in dependencies', () => {
    const pkgPath = join(coreRoot, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    assert.ok(
      !pkg.dependencies?.electron,
      'electron should NOT be in core dependencies'
    );
  });

  it('core package.json has no electron in devDependencies', () => {
    const pkgPath = join(coreRoot, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    assert.ok(
      !pkg.devDependencies?.electron,
      'electron should NOT be in core devDependencies'
    );
  });
});

// =============================================================================
// AC4: Core standalone server serves migrated UI assets
// =============================================================================

describe('AC4: Core server serves migrated UI assets', () => {
  it('index.html references /css/react.css', () => {
    const htmlPath = join(srcPublic, 'index.html');
    assert.ok(existsSync(htmlPath), 'index.html must exist first');
    const html = readFileSync(htmlPath, 'utf8');
    assert.ok(
      html.includes('/css/react.css'),
      'index.html should link to /css/react.css'
    );
  });

  it('index.html references /js/react/react.js', () => {
    const htmlPath = join(srcPublic, 'index.html');
    assert.ok(existsSync(htmlPath), 'index.html must exist first');
    const html = readFileSync(htmlPath, 'utf8');
    assert.ok(
      html.includes('/js/react/react.js'),
      'index.html should load /js/react/react.js'
    );
  });

  it('index.html has react-root div for mounting', () => {
    const htmlPath = join(srcPublic, 'index.html');
    assert.ok(existsSync(htmlPath), 'index.html must exist first');
    const html = readFileSync(htmlPath, 'utf8');
    assert.ok(
      html.includes('id="react-root"'),
      'index.html should have a react-root div'
    );
  });

  it('paths.ts getPublicDir resolves to src/public when present', async () => {
    const { getPublicDir } = await import('./paths.js');
    const pubDir = getPublicDir();
    assert.ok(
      pubDir.endsWith('src/public'),
      `getPublicDir() should resolve to src/public, got: ${pubDir}`
    );
    assert.ok(
      existsSync(join(pubDir, 'index.html')),
      'publicDir should contain index.html'
    );
  });
});

// =============================================================================
// AC6: Build integration end-to-end
// =============================================================================

describe('AC6: Build integration end-to-end', () => {
  it('dist/public/ directory exists after build', () => {
    assert.ok(
      existsSync(distPublic),
      `Expected dist/public/ at ${distPublic} — run build:react first`
    );
  });

  it('dist/public/ has js/ subdirectory', () => {
    const jsDir = join(distPublic, 'js');
    assert.ok(
      existsSync(jsDir),
      `Expected js/ subdirectory in dist/public/`
    );
  });

  it('dist/public/ has css/ subdirectory', () => {
    const cssDir = join(distPublic, 'css');
    assert.ok(
      existsSync(cssDir),
      `Expected css/ subdirectory in dist/public/`
    );
  });

  it('postcss.config exists for Tailwind processing', () => {
    const postcssPath = join(coreRoot, 'postcss.config.js');
    const postcssPathMjs = join(coreRoot, 'postcss.config.mjs');
    assert.ok(
      existsSync(postcssPath) || existsSync(postcssPathMjs),
      'postcss.config.js or postcss.config.mjs should exist for Tailwind'
    );
  });

  it('build output JS is non-trivial (>10KB)', () => {
    const jsPath = join(distPublic, 'js', 'react', 'react.js');
    assert.ok(existsSync(jsPath), 'Built JS must exist first');
    const stats = readFileSync(jsPath);
    assert.ok(
      stats.length > 10240,
      `Built react.js should be >10KB, got ${stats.length} bytes`
    );
  });
});
