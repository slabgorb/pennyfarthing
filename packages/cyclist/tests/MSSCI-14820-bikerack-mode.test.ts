/**
 * Story 101-1: isBikeRackMode() gate and bikerack.ts entry point
 * Jira: MSSCI-14820
 *
 * RED phase tests — these verify BikeRack mode detection, entry point behavior,
 * and WebSocket channel gating per ADR-0024 consistency rules.
 *
 * ACs covered:
 * - AC1: isBikeRackMode() exported from server.ts, checks IS_BIKERACK === '1' (Rule 1)
 * - AC2: No direct process.env.IS_BIKERACK checks outside isBikeRackMode() (Rule 1)
 * - AC3: bikerack.ts sets IS_BIKERACK=1 before any imports that check it (Rule 9)
 * - AC4: bikerack.ts does NOT go through main.ts (Rule 9)
 * - AC5: Port file written AFTER server.listen() callback (CE-3)
 * - AC6: Port file is .bikerack-port (shared with Cyclist)
 * - AC7: Default port 2898 with auto-increment on conflict (Rule 6)
 * - AC8: /ws/claude WebSocket skipped in BikeRack mode
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// ============================================================================
// Group 1: isBikeRackMode() gate function (AC1, AC2)
// ============================================================================

describe('isBikeRackMode()', () => {
  // After 124-4, isBikeRackMode lives in core's server module
  const originalEnv = process.env.IS_BIKERACK;

  afterEach(() => {
    // Restore original env
    if (originalEnv === undefined) {
      delete process.env.IS_BIKERACK;
    } else {
      process.env.IS_BIKERACK = originalEnv;
    }
  });

  it('should be exported from core server.ts', async () => {
    // AC1: isBikeRackMode() must be an exported function from core's server
    const serverModule = await import('../../core/src/server/server.js');
    expect(serverModule).toHaveProperty('isBikeRackMode');
    expect(typeof serverModule.isBikeRackMode).toBe('function');
  });

  it('should return true when IS_BIKERACK is "1"', async () => {
    // AC1: checks process.env.IS_BIKERACK === '1'
    process.env.IS_BIKERACK = '1';
    const { isBikeRackMode } = await import('../../core/src/server/server.js');
    expect(isBikeRackMode()).toBe(true);
  });

  it('should return false when IS_BIKERACK is not set', async () => {
    // AC1: negative case — undefined env var
    delete process.env.IS_BIKERACK;
    const { isBikeRackMode } = await import('../../core/src/server/server.js');
    expect(isBikeRackMode()).toBe(false);
  });

  it('should return false when IS_BIKERACK is "0"', async () => {
    // Edge case: explicitly set to non-"1" value
    process.env.IS_BIKERACK = '0';
    const { isBikeRackMode } = await import('../../core/src/server/server.js');
    expect(isBikeRackMode()).toBe(false);
  });

  it('should return false when IS_BIKERACK is empty string', async () => {
    // Edge case: empty string is not '1'
    process.env.IS_BIKERACK = '';
    const { isBikeRackMode } = await import('../../core/src/server/server.js');
    expect(isBikeRackMode()).toBe(false);
  });

  it('should return false when IS_BIKERACK is "true"', async () => {
    // Edge case: only '1' is valid, not 'true'
    process.env.IS_BIKERACK = 'true';
    const { isBikeRackMode } = await import('../../core/src/server/server.js');
    expect(isBikeRackMode()).toBe(false);
  });
});

// ============================================================================
// Group 2: No direct IS_BIKERACK checks outside isBikeRackMode() (AC2)
// ============================================================================

describe('Rule 1: Centralized mode detection', () => {
  it('should not have direct process.env.IS_BIKERACK checks in websocket.ts', () => {
    // AC2: No direct env var checks
    const websocketPath = join(__dirname, '..', 'src', 'websocket.ts');
    const content = readFileSync(websocketPath, 'utf-8');

    // Find all references to IS_BIKERACK
    const directChecks = content.match(/process\.env\.IS_BIKERACK/g) || [];
    // Should be zero — after 124-4, mode gating moved to bikerack server module
    expect(directChecks.length).toBe(0);
  });

  it('isBikeRackMode should be defined in core env.ts', () => {
    // After 124-4, isBikeRackMode lives in core's env.ts
    const envPath = join(__dirname, '..', '..', 'core', 'src', 'server', 'env.ts');
    const content = readFileSync(envPath, 'utf-8');

    expect(content).toMatch(/function\s+isBikeRackMode/);
  });
});

// ============================================================================
// Group 3: bikerack.ts entry point (AC3, AC4, AC5, AC6, AC7)
// ============================================================================

describe('bikerack entry point', () => {
  // After 124-5, entry point logic moved to @pennyfarthing/bikerack/src/entry.ts
  const ENTRY_PATH = join(__dirname, '..', '..', 'bikerack', 'src', 'entry.ts');

  it('should exist as a source file', () => {
    // AC3/AC4: entry.ts must exist as a separate entry point
    expect(existsSync(ENTRY_PATH)).toBe(true);
  });

  it('should NOT import from main.ts', () => {
    // AC4: entry.ts does NOT go through main.ts (Rule 9)
    const content = readFileSync(ENTRY_PATH, 'utf-8');

    expect(content).not.toMatch(/from\s+['"]\.\/main/);
    expect(content).not.toMatch(/require\s*\(\s*['"]\.\/main/);
  });

  it('should NOT import Electron modules', () => {
    // Rule 9: entry.ts is a Node.js CLI entry point, no Electron
    const content = readFileSync(ENTRY_PATH, 'utf-8');

    expect(content).not.toMatch(/from\s+['"]electron/);
    expect(content).not.toMatch(/require\s*\(\s*['"]electron/);
  });

  it('should NOT import dockview', () => {
    // Rule 7: No dockview dependency in BikeRack rendering path
    const content = readFileSync(ENTRY_PATH, 'utf-8');

    expect(content).not.toMatch(/from\s+['"]dockview/);
  });

  it('should use port 2898 as default', () => {
    // AC7: Default port 2898 (Rule 6)
    const content = readFileSync(ENTRY_PATH, 'utf-8');

    expect(content).toMatch(/2898/);
  });

  it('should use .bikerack-port (shared with Cyclist)', () => {
    // BikeRack and Cyclist share a single .bikerack-port file
    const content = readFileSync(ENTRY_PATH, 'utf-8');

    expect(content).toMatch(/\.bikerack-port/);
  });

  it('should import createTerminalServer from server', () => {
    // entry.ts reuses the shared server factory
    const content = readFileSync(ENTRY_PATH, 'utf-8');

    expect(content).toMatch(/import\s+.*createTerminalServer.*from\s+['"]\.\/server/);
  });

  it('should call findAvailablePort for port conflict resolution', () => {
    // AC7: auto-increment on conflict (Rule 6)
    const content = readFileSync(ENTRY_PATH, 'utf-8');

    expect(content).toMatch(/findAvailablePort/);
  });
});

// ============================================================================
// Group 4: WebSocket /ws/claude gating (AC8)
// ============================================================================

describe('/ws/claude WebSocket gating', () => {
  it('after 124-4, mode gating is handled by the bikerack server module', () => {
    // After 124-4, cyclist no longer gates /ws/claude via isBikeRackMode.
    // Mode detection moved to the bikerack server's setMode() architecture.
    // Cyclist's websocket.ts should NOT reference isBikeRackMode.
    const websocketPath = join(__dirname, '..', 'src', 'websocket.ts');
    const content = readFileSync(websocketPath, 'utf-8');

    expect(content).not.toMatch(/isBikeRackMode/);
  });

  it('isBikeRackMode should still exist in core for backward compat', () => {
    // The function still exists in core's env.ts for any consumers
    const envPath = join(__dirname, '..', '..', 'core', 'src', 'server', 'env.ts');
    const content = readFileSync(envPath, 'utf-8');

    expect(content).toMatch(/export\s+function\s+isBikeRackMode/);
  });
});
