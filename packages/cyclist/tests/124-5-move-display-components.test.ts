/**
 * Story 124-5: Move Display Components and Update Entry Points
 *
 * Tests that BikeRackWorkspace, BikeRackIndex, and StandalonePanel move
 * from packages/core/ into packages/bikerack/, the entry point launcher
 * is self-contained in bikerack, and panel components remain shared in core.
 *
 * Story: MSSCI-15556 - Move Display Components and Update Entry Points
 * Epic: 124 (BikeRack Standalone Package Extraction)
 *
 * Acceptance Criteria:
 * - AC1: BikeRackWorkspace, BikeRackIndex, StandalonePanel are in packages/bikerack/
 * - AC2: Entry point expanded with full launcher (server start + CLI) and cleanup
 * - AC3: pf bikerack start works and launches the standalone BikeRack product
 * - AC4: Panel components remain in core (shared by BikeRack, Cyclist, BikeShop)
 * - AC5: Port 2898 convention preserved for BikeRack (vs 1898 for Cyclist)
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

// ============================================================================
// Paths
// ============================================================================

const PACKAGES_DIR = resolve(__dirname, '../../');
const BIKERACK_DIR = join(PACKAGES_DIR, 'bikerack');
const BIKERACK_SRC = join(BIKERACK_DIR, 'src');
const CORE_DIR = join(PACKAGES_DIR, 'core');
const CORE_SRC = join(CORE_DIR, 'src');
const CORE_COMPONENTS = join(CORE_SRC, 'public', 'components');
const CYCLIST_DIR = join(PACKAGES_DIR, 'cyclist');
const CYCLIST_SRC = join(CYCLIST_DIR, 'src');

// Display components that must move from core to bikerack
const DISPLAY_COMPONENTS = [
  'BikeRackWorkspace',
  'BikeRackIndex',
  'StandalonePanel',
];

// ============================================================================
// AC1: BikeRackWorkspace, BikeRackIndex, StandalonePanel are in packages/bikerack/
// ============================================================================

describe('AC1: Display components moved to packages/bikerack/', () => {
  for (const component of DISPLAY_COMPONENTS) {
    it(`should have ${component}.tsx in packages/bikerack/src/`, () => {
      // Component must exist somewhere under bikerack/src/
      const found = findFileRecursive(BIKERACK_SRC, `${component}.tsx`);
      expect(
        found,
        `${component}.tsx not found anywhere under packages/bikerack/src/`
      ).not.toBeNull();
    });
  }

  for (const component of DISPLAY_COMPONENTS) {
    it(`should NOT have ${component}.tsx in packages/core/src/public/components/`, () => {
      // Component must no longer exist in core's components directory
      expect(
        existsSync(join(CORE_COMPONENTS, `${component}.tsx`)),
        `${component}.tsx should not remain in packages/core/ after move`
      ).toBe(false);
    });
  }

  it('should export display components from bikerack package', () => {
    // React components are exported via _vite-index.ts (resolved by vite alias)
    // Server-only code is in index.ts (compiled by tsc) — Story 124-6
    const viteIndex = readFileSync(join(BIKERACK_SRC, '_vite-index.ts'), 'utf-8');
    for (const component of DISPLAY_COMPONENTS) {
      expect(
        viteIndex,
        `_vite-index.ts should export ${component}`
      ).toMatch(new RegExp(component));
    }
  });
});

// ============================================================================
// AC2: Entry point expanded with full launcher and cleanup
// ============================================================================

describe('AC2: Entry point launcher in packages/bikerack/', () => {
  it('should have a launcher entry point in bikerack/src/', () => {
    // BikeRack must have its own entry point (not rely on cyclist/src/bikerack.ts)
    const hasEntryPoint =
      existsSync(join(BIKERACK_SRC, 'entry.ts')) ||
      existsSync(join(BIKERACK_SRC, 'launcher.ts')) ||
      existsSync(join(BIKERACK_SRC, 'start.ts')) ||
      existsSync(join(BIKERACK_SRC, 'cli.ts'));
    expect(
      hasEntryPoint,
      'BikeRack must have a self-contained launcher entry point (entry.ts, launcher.ts, start.ts, or cli.ts)'
    ).toBe(true);
  });

  it('should handle port file writing in bikerack entry point', () => {
    // The entry point must write .bikerack-port for service discovery
    const entryContent = readBikerackEntryPoint();
    expect(
      entryContent,
      'Entry point must handle port file writing'
    ).toMatch(/bikerack-port|portFile|writePortFile|PORT_FILE/);
  });

  it('should handle process cleanup on SIGINT/SIGTERM', () => {
    // The entry point must clean up on termination signals
    const entryContent = readBikerackEntryPoint();
    expect(entryContent, 'Entry point must handle SIGINT').toMatch(/SIGINT/);
    expect(entryContent, 'Entry point must handle SIGTERM').toMatch(/SIGTERM/);
  });

  it('should handle server startup in bikerack entry point', () => {
    const entryContent = readBikerackEntryPoint();
    expect(
      entryContent,
      'Entry point must create/start the server'
    ).toMatch(/createTerminalServer|listen|server\.listen/);
  });

  it('should NOT have the launcher entry point in packages/cyclist/', () => {
    // After move, cyclist should not have bikerack.ts (or it should delegate)
    if (existsSync(join(CYCLIST_SRC, 'bikerack.ts'))) {
      const content = readFileSync(join(CYCLIST_SRC, 'bikerack.ts'), 'utf-8');
      // If file exists, it should just re-export or delegate to bikerack package
      // It should NOT contain the full launcher logic (server start, port file, signal handlers)
      const hasFullLauncher =
        content.includes('createTerminalServer') &&
        content.includes('SIGINT') &&
        content.includes('PORT_FILE');
      expect(
        hasFullLauncher,
        'Cyclist should not contain the full launcher logic — it belongs in bikerack'
      ).toBe(false);
    }
  });
});

// ============================================================================
// AC3: pf bikerack start works and launches the standalone BikeRack product
// ============================================================================

describe('AC3: pf bikerack start launches standalone BikeRack', () => {
  // pennyfarthing-dist is 3 levels up from packages/cyclist/tests/
  const PF_BIKERACK_DIR = resolve(
    __dirname,
    '../../../pennyfarthing-dist/src/pf/bikerack'
  );

  it('should have pf bikerack CLI command', () => {
    expect(existsSync(join(PF_BIKERACK_DIR, 'cli.py'))).toBe(true);
  });

  it('should have a launcher module in pf/bikerack/', () => {
    expect(existsSync(join(PF_BIKERACK_DIR, 'launcher.py'))).toBe(true);
  });

  it('should start bikerack package entry point, NOT cyclist/bikerack.ts', () => {
    const launcherPy = readFileSync(join(PF_BIKERACK_DIR, 'launcher.py'), 'utf-8');
    // After move, the Python launcher must start bikerack's own entry point
    // not packages/cyclist/dist/bikerack.js
    expect(
      launcherPy,
      'launcher.py should NOT reference cyclist/dist/bikerack.js'
    ).not.toMatch(/packages.*cyclist.*bikerack/);
  });

  it('should NOT set IS_BIKERACK env var in Python launcher', () => {
    const launcherPy = readFileSync(join(PF_BIKERACK_DIR, 'launcher.py'), 'utf-8');
    // IS_BIKERACK was removed in 124-4 — the launcher should not set it
    expect(
      launcherPy,
      'launcher.py should not set IS_BIKERACK (removed in 124-4)'
    ).not.toMatch(/IS_BIKERACK/);
  });

  it('should export bikerack entry point in package.json', () => {
    const pkg = JSON.parse(readFileSync(join(BIKERACK_DIR, 'package.json'), 'utf-8'));
    const exports = pkg.exports || {};
    // BikeRack should export a CLI/launcher entry point
    const hasLauncherExport =
      exports['./cli'] ||
      exports['./launcher'] ||
      exports['./start'] ||
      exports['./entry'];
    expect(
      hasLauncherExport,
      'package.json should export a launcher entry point (./cli, ./launcher, ./start, or ./entry)'
    ).toBeTruthy();
  });
});

// ============================================================================
// AC4: Panel components remain in core (shared)
// ============================================================================

describe('AC4: Panel components remain in packages/core/', () => {
  const CORE_PANELS = join(CORE_COMPONENTS, 'panels');

  const SHARED_PANELS = [
    'SprintPanel.tsx',
    'GitPanel.tsx',
    'DiffsPanel.tsx',
    'TodoPanel.tsx',
    'WorkflowPanel.tsx',
    'AuditLogPanel.tsx',
    'ACPanel.tsx',
    'DebugPanel.tsx',
    'BikeLanePanel.tsx',
    'SettingsPanel.tsx',
    'ProgressPanel.tsx',
  ];

  it('should have panels/ directory in packages/core/', () => {
    expect(existsSync(CORE_PANELS)).toBe(true);
  });

  for (const panel of SHARED_PANELS) {
    it(`should retain ${panel} in packages/core/`, () => {
      expect(existsSync(join(CORE_PANELS, panel))).toBe(true);
    });
  }

  it('should retain panel-registry.ts in packages/core/', () => {
    expect(existsSync(join(CORE_COMPONENTS, 'panel-registry.ts'))).toBe(true);
  });

  it('should NOT duplicate panel components in bikerack', () => {
    // Panels are shared — they must not be copied into bikerack
    const bikerackFiles = getAllTsxFiles(BIKERACK_SRC);
    const panelDuplicates = bikerackFiles.filter(f => {
      const name = f.split('/').pop() || '';
      return SHARED_PANELS.includes(name);
    });

    expect(
      panelDuplicates,
      `Panel components duplicated in bikerack: ${panelDuplicates.join(', ')}`
    ).toEqual([]);
  });
});

// ============================================================================
// AC5: Port 2898 convention preserved for BikeRack
// ============================================================================

describe('AC5: Port 2898 convention for BikeRack', () => {
  it('should use 2898 as default port in bikerack entry point', () => {
    const entryContent = readBikerackEntryPoint();
    expect(
      entryContent,
      'BikeRack entry point must use port 2898'
    ).toMatch(/2898/);
  });

  it('should support BIKERACK_PORT env var override', () => {
    const entryContent = readBikerackEntryPoint();
    expect(
      entryContent,
      'Must support BIKERACK_PORT env override'
    ).toMatch(/BIKERACK_PORT/);
  });

  it('should NOT use port 1898 as default in bikerack entry point', () => {
    const entryContent = readBikerackEntryPoint();
    // Port 1898 is for the internal server; 2898 is the BikeRack convention
    // Entry point must default to 2898, not 1898
    const defaultPort = entryContent.match(/DEFAULT_PORT\s*=\s*.*?(\d{4})/);
    if (defaultPort) {
      expect(
        defaultPort[1],
        'DEFAULT_PORT should be 2898, not 1898'
      ).toBe('2898');
    }
    // Also check parseInt fallback patterns
    const parsedPort = entryContent.match(/parseInt\(.*?['"](\d{4})['"]/);
    if (parsedPort) {
      expect(
        parsedPort[1],
        'Parsed port fallback should be 2898'
      ).toBe('2898');
    }
  });

  it('should preserve port 1898 as default in bikerack server.ts (internal)', () => {
    // server.ts uses 1898 as the internal server default — this must not change
    const serverTs = readFileSync(join(BIKERACK_SRC, 'server.ts'), 'utf-8');
    expect(serverTs).toMatch(/1898/);
  });
});

// ============================================================================
// Helpers
// ============================================================================

function getAllTsxFiles(dir: string): string[] {
  const files: string[] = [];
  if (!existsSync(dir)) return files;

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') {
      files.push(...getAllTsxFiles(fullPath));
    } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.test.tsx') && !entry.name.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

function findFileRecursive(dir: string, filename: string): string | null {
  if (!existsSync(dir)) return null;

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') {
      const found = findFileRecursive(fullPath, filename);
      if (found) return found;
    } else if (entry.isFile() && entry.name === filename) {
      return fullPath;
    }
  }
  return null;
}

/**
 * Read the bikerack entry point file.
 * Checks multiple possible names since the dev may choose any of:
 * entry.ts, launcher.ts, start.ts, cli.ts
 */
function readBikerackEntryPoint(): string {
  const candidates = ['entry.ts', 'launcher.ts', 'start.ts', 'cli.ts'];
  for (const name of candidates) {
    const path = join(BIKERACK_SRC, name);
    if (existsSync(path)) {
      return readFileSync(path, 'utf-8');
    }
  }
  // If none found, return empty — tests relying on content will fail with clear messages
  return '';
}
