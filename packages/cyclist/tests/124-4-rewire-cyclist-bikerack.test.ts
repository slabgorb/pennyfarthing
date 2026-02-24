/**
 * Story 124-4: Rewire Cyclist to Depend on BikeRack
 *
 * Tests that Cyclist depends on @pennyfarthing/bikerack directly,
 * starts BikeRack's server engine, registers ClaudeService on top,
 * and removes the IS_BIKERACK environment variable gate.
 *
 * Story: MSSCI-15555 - Rewire Cyclist to Depend on BikeRack
 * Epic: 124 (BikeRack Standalone Package Extraction)
 *
 * Acceptance Criteria:
 * - AC1: packages/cyclist/package.json lists @pennyfarthing/bikerack as a dependency
 * - AC2: Cyclist starts BikeRack's server engine on launch
 * - AC3: Cyclist wires ClaudeService and registers /ws/claude channel on top of BikeRack's server
 * - AC4: IS_BIKERACK env var is removed — mode determined by entry point and service registration
 * - AC5: /ws/claude channel only exists when ClaudeService registers it (BikeRack never registers it)
 * - AC6: Cyclist IDE control plane remains in packages/cyclist/
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
const CYCLIST_DIR = join(PACKAGES_DIR, 'cyclist');
const CYCLIST_SRC = join(CYCLIST_DIR, 'src');
const BIKERACK_DIR = join(PACKAGES_DIR, 'bikerack');
const BIKERACK_SRC = join(BIKERACK_DIR, 'src');
const CORE_DIR = join(PACKAGES_DIR, 'core');
const CORE_SERVER_DIR = join(CORE_DIR, 'src', 'server');

// ============================================================================
// AC1: packages/cyclist/package.json lists @pennyfarthing/bikerack as a dependency
// ============================================================================

describe('AC1: Cyclist depends on @pennyfarthing/bikerack', () => {
  it('should list @pennyfarthing/bikerack in dependencies', () => {
    const pkg = JSON.parse(readFileSync(join(CYCLIST_DIR, 'package.json'), 'utf-8'));
    expect(pkg.dependencies).toHaveProperty('@pennyfarthing/bikerack');
  });

  it('should use workspace protocol for bikerack dependency', () => {
    const pkg = JSON.parse(readFileSync(join(CYCLIST_DIR, 'package.json'), 'utf-8'));
    expect(pkg.dependencies['@pennyfarthing/bikerack']).toBe('workspace:*');
  });
});

// ============================================================================
// AC2: Cyclist starts BikeRack's server engine on launch
// ============================================================================

describe('AC2: Cyclist starts BikeRack server engine', () => {
  it('should import server components from @pennyfarthing/bikerack', () => {
    const serverTs = readFileSync(join(CYCLIST_SRC, 'server.ts'), 'utf-8');
    // Cyclist's server.ts should import from bikerack, not core/server
    expect(serverTs).toMatch(/@pennyfarthing\/bikerack/);
  });

  it('should NOT import server components from @pennyfarthing/core/server', () => {
    const serverTs = readFileSync(join(CYCLIST_SRC, 'server.ts'), 'utf-8');
    // After rewire, cyclist should depend on bikerack directly, not core/server
    expect(serverTs).not.toMatch(/from\s+['"]@pennyfarthing\/core\/server['"]/);
  });

  it('should use BikeRack createTerminalServer or app export', () => {
    const serverTs = readFileSync(join(CYCLIST_SRC, 'server.ts'), 'utf-8');
    // Cyclist should use bikerack's server engine (app or createTerminalServer)
    expect(serverTs).toMatch(/@pennyfarthing\/bikerack/);
    // Must still export its own createTerminalServer that wraps bikerack's
    expect(serverTs).toMatch(/export\s+function\s+createTerminalServer/);
  });
});

// ============================================================================
// AC3: Cyclist wires ClaudeService and registers /ws/claude on BikeRack's server
// ============================================================================

describe('AC3: ClaudeService registers /ws/claude via service registration', () => {
  it('should NOT gate /ws/claude with isBikeRackMode() check', () => {
    const websocketTs = readFileSync(join(CYCLIST_SRC, 'websocket.ts'), 'utf-8');
    // The old pattern: `pathname === '/ws/claude' && !isBikeRackMode()`
    // After rewire: ClaudeService registers /ws/claude explicitly — no mode check
    expect(websocketTs).not.toMatch(/\/ws\/claude.*&&.*!isBikeRackMode/);
  });

  it('should register /ws/claude channel in Cyclist websocket setup', () => {
    const websocketTs = readFileSync(join(CYCLIST_SRC, 'websocket.ts'), 'utf-8');
    // Cyclist's websocket setup must still handle /ws/claude
    expect(websocketTs).toMatch(/\/ws\/claude/);
  });

  it('claude-service.ts should remain in packages/cyclist/', () => {
    expect(existsSync(join(CYCLIST_SRC, 'claude-service.ts'))).toBe(true);
  });
});

// ============================================================================
// AC4: IS_BIKERACK env var is removed
// ============================================================================

describe('AC4: IS_BIKERACK env var removed', () => {
  it('should NOT have isBikeRackMode function in bikerack/src/env.ts', () => {
    // After rewire, mode is determined by entry point, not env var
    if (existsSync(join(BIKERACK_SRC, 'env.ts'))) {
      const envTs = readFileSync(join(BIKERACK_SRC, 'env.ts'), 'utf-8');
      expect(envTs).not.toMatch(/IS_BIKERACK/);
    }
    // env.ts may be deleted entirely — that's also valid
  });

  it('should NOT have isBikeRackMode function in cyclist/src/env.ts', () => {
    if (existsSync(join(CYCLIST_SRC, 'env.ts'))) {
      const envTs = readFileSync(join(CYCLIST_SRC, 'env.ts'), 'utf-8');
      expect(envTs).not.toMatch(/IS_BIKERACK/);
    }
  });

  it('should NOT set IS_BIKERACK=1 in bikerack entry point', () => {
    const bikerackTs = readFileSync(join(CYCLIST_SRC, 'bikerack.ts'), 'utf-8');
    expect(bikerackTs).not.toMatch(/process\.env\.IS_BIKERACK/);
  });

  it('should NOT reference isBikeRackMode in cyclist source files', () => {
    const srcFiles = getAllTsFiles(CYCLIST_SRC);
    const violations: string[] = [];

    for (const file of srcFiles) {
      const content = readFileSync(file, 'utf-8');
      if (content.match(/isBikeRackMode/)) {
        violations.push(file.replace(CYCLIST_SRC + '/', ''));
      }
    }

    expect(
      violations,
      `Files still referencing isBikeRackMode: ${violations.join(', ')}`
    ).toEqual([]);
  });

  it('should NOT reference isBikeRackMode in bikerack source files', () => {
    const srcFiles = getAllTsFiles(BIKERACK_SRC);
    const violations: string[] = [];

    for (const file of srcFiles) {
      const content = readFileSync(file, 'utf-8');
      if (content.match(/isBikeRackMode/)) {
        violations.push(file.replace(BIKERACK_SRC + '/', ''));
      }
    }

    expect(
      violations,
      `Files still referencing isBikeRackMode: ${violations.join(', ')}`
    ).toEqual([]);
  });
});

// ============================================================================
// AC5: /ws/claude only exists when ClaudeService registers it
// ============================================================================

describe('AC5: BikeRack never registers /ws/claude', () => {
  it('should NOT reference /ws/claude in bikerack websocket.ts', () => {
    const websocketTs = readFileSync(join(BIKERACK_SRC, 'websocket.ts'), 'utf-8');
    // BikeRack should have no knowledge of /ws/claude — that's Cyclist's domain
    expect(websocketTs).not.toMatch(/\/ws\/claude/);
  });

  it('should NOT reference /ws/claude in bikerack server.ts', () => {
    const serverTs = readFileSync(join(BIKERACK_SRC, 'server.ts'), 'utf-8');
    expect(serverTs).not.toMatch(/\/ws\/claude/);
  });

  it('should NOT reference ClaudeService in bikerack source', () => {
    const srcFiles = getAllTsFiles(BIKERACK_SRC);
    const violations: string[] = [];

    for (const file of srcFiles) {
      const content = readFileSync(file, 'utf-8');
      if (content.match(/ClaudeService/i)) {
        violations.push(file.replace(BIKERACK_SRC + '/', ''));
      }
    }

    expect(
      violations,
      `BikeRack files referencing ClaudeService: ${violations.join(', ')}`
    ).toEqual([]);
  });

  it('should NOT import from claude-service module in bikerack source', () => {
    const srcFiles = getAllTsFiles(BIKERACK_SRC);
    const violations: string[] = [];

    for (const file of srcFiles) {
      const content = readFileSync(file, 'utf-8');
      if (content.match(/from\s+['"]\.\/claude-service/)) {
        violations.push(file.replace(BIKERACK_SRC + '/', ''));
      }
    }

    expect(
      violations,
      `BikeRack files importing from claude-service module: ${violations.join(', ')}`
    ).toEqual([]);
  });
});

// ============================================================================
// AC6: Cyclist IDE control plane remains in packages/cyclist/
// ============================================================================

describe('AC6: IDE control plane stays in Cyclist', () => {
  const controlPlaneModules = [
    'claude-service.ts',
  ];

  for (const module of controlPlaneModules) {
    it(`should contain ${module} in packages/cyclist/src/`, () => {
      expect(existsSync(join(CYCLIST_SRC, module))).toBe(true);
    });
  }

  it('should NOT have claude-service.ts in packages/bikerack/', () => {
    expect(existsSync(join(BIKERACK_SRC, 'claude-service.ts'))).toBe(false);
  });

  it('should contain dockview imports only in Cyclist (not BikeRack)', () => {
    const bikerackFiles = getAllTsFiles(BIKERACK_SRC);
    const violations: string[] = [];

    for (const file of bikerackFiles) {
      const content = readFileSync(file, 'utf-8');
      if (content.match(/dockview/)) {
        violations.push(file.replace(BIKERACK_SRC + '/', ''));
      }
    }

    expect(
      violations,
      `BikeRack files importing dockview: ${violations.join(', ')}`
    ).toEqual([]);
  });

  it('should NOT have bikerack depend on electron', () => {
    // Story 124-5 moved display components into bikerack, so dockview-react
    // is now a legitimate optional peer dependency. Electron must stay out.
    const pkg = JSON.parse(readFileSync(join(BIKERACK_DIR, 'package.json'), 'utf-8'));
    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };
    expect(allDeps).not.toHaveProperty('electron');
  });
});

// ============================================================================
// Helpers
// ============================================================================

function getAllTsFiles(dir: string): string[] {
  const files: string[] = [];
  if (!existsSync(dir)) return files;

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') {
      files.push(...getAllTsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}
