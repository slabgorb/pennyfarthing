/**
 * Story 124-4 → Consolidation: Cyclist uses core's bikerack server
 *
 * After monorepo consolidation, bikerack source was absorbed into core.
 * Cyclist now imports from @pennyfarthing/core/bikerack/* backward-compat paths.
 *
 * Acceptance Criteria:
 * - AC1: Cyclist depends on @pennyfarthing/core (not @pennyfarthing/bikerack)
 * - AC2: Cyclist imports from @pennyfarthing/core/bikerack/* paths
 * - AC3: Cyclist wires ClaudeService and registers /ws/claude
 * - AC4: IS_BIKERACK env var is not used — mode set via setMode()
 * - AC5: ClaudeService stays in packages/cyclist/
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
const CORE_DIR = join(PACKAGES_DIR, 'core');
const CORE_SERVER_DIR = join(CORE_DIR, 'src', 'server');

// ============================================================================
// AC1: Cyclist depends on @pennyfarthing/core (not @pennyfarthing/bikerack)
// ============================================================================

describe('AC1: Cyclist depends on @pennyfarthing/core', () => {
  it('should list @pennyfarthing/core in dependencies', () => {
    const pkg = JSON.parse(readFileSync(join(CYCLIST_DIR, 'package.json'), 'utf-8'));
    expect(pkg.dependencies).toHaveProperty('@pennyfarthing/core');
  });

  it('should NOT list @pennyfarthing/bikerack in dependencies', () => {
    const pkg = JSON.parse(readFileSync(join(CYCLIST_DIR, 'package.json'), 'utf-8'));
    expect(pkg.dependencies).not.toHaveProperty('@pennyfarthing/bikerack');
  });
});

// ============================================================================
// AC2: Cyclist imports from @pennyfarthing/core/bikerack/* paths
// ============================================================================

describe('AC2: Cyclist uses core bikerack export paths', () => {
  it('should import from @pennyfarthing/core/bikerack/server in server.ts', () => {
    const serverTs = readFileSync(join(CYCLIST_SRC, 'server.ts'), 'utf-8');
    expect(serverTs).toMatch(/@pennyfarthing\/core\/bikerack\/server/);
  });

  it('should import from @pennyfarthing/core/bikerack/server in env.ts', () => {
    const envTs = readFileSync(join(CYCLIST_SRC, 'env.ts'), 'utf-8');
    expect(envTs).toMatch(/@pennyfarthing\/core\/bikerack\/server/);
  });

  it('should import from @pennyfarthing/core/bikerack/entry in bikerack.ts', () => {
    const bikerackTs = readFileSync(join(CYCLIST_SRC, 'bikerack.ts'), 'utf-8');
    expect(bikerackTs).toMatch(/@pennyfarthing\/core\/bikerack\/entry/);
  });

  it('should NOT import directly from @pennyfarthing/bikerack', () => {
    const srcFiles = getAllTsFiles(CYCLIST_SRC);
    const violations: string[] = [];

    for (const file of srcFiles) {
      const content = readFileSync(file, 'utf-8');
      if (content.match(/from\s+['"]@pennyfarthing\/bikerack\b/)) {
        violations.push(file.replace(CYCLIST_SRC + '/', ''));
      }
    }

    expect(
      violations,
      `Files still importing from @pennyfarthing/bikerack: ${violations.join(', ')}`
    ).toEqual([]);
  });
});

// ============================================================================
// AC3: Cyclist wires ClaudeService and registers /ws/claude
// ============================================================================

describe('AC3: ClaudeService registers /ws/claude', () => {
  it('should register /ws/claude channel in Cyclist websocket setup', () => {
    const websocketTs = readFileSync(join(CYCLIST_SRC, 'websocket.ts'), 'utf-8');
    expect(websocketTs).toMatch(/\/ws\/claude/);
  });

  it('claude-service.ts should remain in packages/cyclist/', () => {
    expect(existsSync(join(CYCLIST_SRC, 'claude-service.ts'))).toBe(true);
  });
});

// ============================================================================
// AC4: IS_BIKERACK env var is not used
// ============================================================================

describe('AC4: IS_BIKERACK env var removed', () => {
  it('should use getMode/setMode in core server env.ts', () => {
    const envTs = readFileSync(join(CORE_SERVER_DIR, 'env.ts'), 'utf-8');
    expect(envTs).toMatch(/getMode/);
    expect(envTs).toMatch(/setMode/);
    expect(envTs).not.toMatch(/IS_BIKERACK/);
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
});

// ============================================================================
// AC5: IDE control plane stays in Cyclist
// ============================================================================

describe('AC5: IDE control plane stays in Cyclist', () => {
  it('should contain claude-service.ts in packages/cyclist/src/', () => {
    expect(existsSync(join(CYCLIST_SRC, 'claude-service.ts'))).toBe(true);
  });

  it('should NOT have claude-service.ts in core/src/server/', () => {
    expect(existsSync(join(CORE_SERVER_DIR, 'claude-service.ts'))).toBe(false);
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
