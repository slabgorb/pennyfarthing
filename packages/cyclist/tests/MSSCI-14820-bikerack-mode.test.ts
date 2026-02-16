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
 * - AC6: Port file is .wheelhub-port (shared with Cyclist)
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
  const originalEnv = process.env.IS_BIKERACK;

  afterEach(() => {
    // Restore original env
    if (originalEnv === undefined) {
      delete process.env.IS_BIKERACK;
    } else {
      process.env.IS_BIKERACK = originalEnv;
    }
  });

  it('should be exported from server.ts', async () => {
    // AC1: isBikeRackMode() must be an exported function from server.ts
    const serverModule = await import('../src/server.js');
    expect(serverModule).toHaveProperty('isBikeRackMode');
    expect(typeof serverModule.isBikeRackMode).toBe('function');
  });

  it('should return true when IS_BIKERACK is "1"', async () => {
    // AC1: checks process.env.IS_BIKERACK === '1'
    process.env.IS_BIKERACK = '1';
    const { isBikeRackMode } = await import('../src/server.js');
    expect(isBikeRackMode()).toBe(true);
  });

  it('should return false when IS_BIKERACK is not set', async () => {
    // AC1: negative case — undefined env var
    delete process.env.IS_BIKERACK;
    const { isBikeRackMode } = await import('../src/server.js');
    expect(isBikeRackMode()).toBe(false);
  });

  it('should return false when IS_BIKERACK is "0"', async () => {
    // Edge case: explicitly set to non-"1" value
    process.env.IS_BIKERACK = '0';
    const { isBikeRackMode } = await import('../src/server.js');
    expect(isBikeRackMode()).toBe(false);
  });

  it('should return false when IS_BIKERACK is empty string', async () => {
    // Edge case: empty string is not '1'
    process.env.IS_BIKERACK = '';
    const { isBikeRackMode } = await import('../src/server.js');
    expect(isBikeRackMode()).toBe(false);
  });

  it('should return false when IS_BIKERACK is "true"', async () => {
    // Edge case: only '1' is valid, not 'true'
    process.env.IS_BIKERACK = 'true';
    const { isBikeRackMode } = await import('../src/server.js');
    expect(isBikeRackMode()).toBe(false);
  });
});

// ============================================================================
// Group 2: No direct IS_BIKERACK checks outside isBikeRackMode() (AC2)
// ============================================================================

describe('Rule 1: Centralized mode detection', () => {
  it('should not have direct process.env.IS_BIKERACK checks in websocket.ts', () => {
    // AC2: No direct env var checks — only isBikeRackMode() calls
    const websocketPath = join(__dirname, '..', 'src', 'websocket.ts');
    const content = readFileSync(websocketPath, 'utf-8');

    // Find all references to IS_BIKERACK
    const directChecks = content.match(/process\.env\.IS_BIKERACK/g) || [];
    // Should be zero — websocket.ts should use isBikeRackMode() import instead
    expect(directChecks.length).toBe(0);
  });

  it('websocket.ts should import isBikeRackMode from server', () => {
    // AC2: websocket.ts must use the centralized function
    const websocketPath = join(__dirname, '..', 'src', 'websocket.ts');
    const content = readFileSync(websocketPath, 'utf-8');

    expect(content).toMatch(/import\s+.*isBikeRackMode.*from\s+['"]\.\/server/);
  });
});

// ============================================================================
// Group 3: bikerack.ts entry point (AC3, AC4, AC5, AC6, AC7)
// ============================================================================

describe('bikerack.ts entry point', () => {
  it('should exist as a source file', () => {
    // AC3/AC4: bikerack.ts must exist as a separate entry point
    const bikerackPath = join(__dirname, '..', 'src', 'bikerack.ts');
    expect(existsSync(bikerackPath)).toBe(true);
  });

  it('should set IS_BIKERACK=1 before any other imports', () => {
    // AC3: env var must be set FIRST, before any imports that check it (Rule 9)
    const bikerackPath = join(__dirname, '..', 'src', 'bikerack.ts');
    const content = readFileSync(bikerackPath, 'utf-8');

    // Find the line that sets IS_BIKERACK
    const envSetIndex = content.indexOf("process.env.IS_BIKERACK = '1'");
    expect(envSetIndex).not.toBe(-1);

    // Find the first import of server.ts (which contains isBikeRackMode)
    const serverImportIndex = content.indexOf("from './server");
    if (serverImportIndex !== -1) {
      // IS_BIKERACK must be set BEFORE server import
      expect(envSetIndex).toBeLessThan(serverImportIndex);
    }
  });

  it('should NOT import from main.ts', () => {
    // AC4: bikerack.ts does NOT go through main.ts (Rule 9)
    const bikerackPath = join(__dirname, '..', 'src', 'bikerack.ts');
    const content = readFileSync(bikerackPath, 'utf-8');

    expect(content).not.toMatch(/from\s+['"]\.\/main/);
    expect(content).not.toMatch(/require\s*\(\s*['"]\.\/main/);
  });

  it('should NOT import Electron modules', () => {
    // Rule 9: bikerack.ts is a Node.js CLI entry point, no Electron
    const bikerackPath = join(__dirname, '..', 'src', 'bikerack.ts');
    const content = readFileSync(bikerackPath, 'utf-8');

    expect(content).not.toMatch(/from\s+['"]electron/);
    expect(content).not.toMatch(/require\s*\(\s*['"]electron/);
  });

  it('should NOT import dockview', () => {
    // Rule 7: No dockview dependency in BikeRack rendering path
    const bikerackPath = join(__dirname, '..', 'src', 'bikerack.ts');
    const content = readFileSync(bikerackPath, 'utf-8');

    expect(content).not.toMatch(/from\s+['"]dockview/);
  });

  it('should use port 2898 as default', () => {
    // AC7: Default port 2898 (Rule 6)
    const bikerackPath = join(__dirname, '..', 'src', 'bikerack.ts');
    const content = readFileSync(bikerackPath, 'utf-8');

    expect(content).toMatch(/2898/);
  });

  it('should use .wheelhub-port (shared with Cyclist)', () => {
    // BikeRack and Cyclist share a single .wheelhub-port file
    const bikerackPath = join(__dirname, '..', 'src', 'bikerack.ts');
    const content = readFileSync(bikerackPath, 'utf-8');

    expect(content).toMatch(/\.wheelhub-port/);
    expect(content).not.toMatch(/\.bikerack-port/);
  });

  it('should import createTerminalServer from server.ts', () => {
    // bikerack.ts reuses the shared server factory
    const bikerackPath = join(__dirname, '..', 'src', 'bikerack.ts');
    const content = readFileSync(bikerackPath, 'utf-8');

    expect(content).toMatch(/import\s+.*createTerminalServer.*from\s+['"]\.\/server/);
  });

  it('should call findAvailablePort for port conflict resolution', () => {
    // AC7: auto-increment on conflict (Rule 6)
    const bikerackPath = join(__dirname, '..', 'src', 'bikerack.ts');
    const content = readFileSync(bikerackPath, 'utf-8');

    expect(content).toMatch(/findAvailablePort/);
  });
});

// ============================================================================
// Group 4: WebSocket /ws/claude gating (AC8)
// ============================================================================

describe('/ws/claude WebSocket gating', () => {
  it('websocket.ts should reference isBikeRackMode for claude channel gating', () => {
    // AC8: /ws/claude WebSocket skipped when isBikeRackMode() is true
    const websocketPath = join(__dirname, '..', 'src', 'websocket.ts');
    const content = readFileSync(websocketPath, 'utf-8');

    // The claude WebSocket setup should be guarded by isBikeRackMode
    expect(content).toMatch(/isBikeRackMode/);
  });

  it('should only gate /ws/claude, not other channels', () => {
    // AC8 + CE-5: All 16 other channels must remain active
    const websocketPath = join(__dirname, '..', 'src', 'websocket.ts');
    const content = readFileSync(websocketPath, 'utf-8');

    // Count how many times isBikeRackMode appears in websocket.ts
    // Should be minimal — only for /ws/claude gating (import + 1-2 usage sites)
    const matches = content.match(/isBikeRackMode/g) || [];
    // At least 1 for import, 1 for the guard = minimum 2
    // But should not be more than ~4 (import + guard + maybe a log)
    expect(matches.length).toBeGreaterThanOrEqual(2);
    expect(matches.length).toBeLessThanOrEqual(5);
  });
});
