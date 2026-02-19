/**
 * Tests for MSSCI-14698: Version sentinel file and auto-update detection
 *
 * Story 98-1: Add .pennyfarthing/.installed-version sentinel file written by
 * init.ts and update.ts. In prime (pf agent start), compare sentinel against
 * package version. If mismatch, run pennyfarthing update --auto.
 *
 * Acceptance Criteria:
 * - AC1: init.ts writes .pennyfarthing/.installed-version with current package version
 * - AC2: update.ts writes .pennyfarthing/.installed-version after successful update
 * - AC5: Sentinel file format is plain text (single version string, no JSON)
 *
 * (AC3, AC4, AC6 tested in Python: pf/tests/test_version_sentinel.py)
 *
 * Run with: cd packages/core && pnpm build && pnpm test
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Import the sentinel helper (to be implemented)
import {
  writeVersionSentinel,
  readVersionSentinel,
  SENTINEL_FILENAME,
} from '../utils/version-sentinel.js';

// ─── Helpers ───────────────────────────────────────────────────────

function createTestDir(): string {
  const dir = join(
    tmpdir(),
    `pf-sentinel-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('MSSCI-14698: Version sentinel file', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDir();
    mkdirSync(join(testDir, '.pennyfarthing'), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  // ─── AC5: Sentinel file format ─────────────────────────────────

  describe('Sentinel file format (AC5)', () => {
    it('should be plain text with a single version string', () => {
      writeVersionSentinel(testDir, '10.3.1');

      const sentinelPath = join(testDir, '.pennyfarthing', SENTINEL_FILENAME);
      assert.ok(existsSync(sentinelPath), 'Sentinel file should exist');

      const content = readFileSync(sentinelPath, 'utf8');

      // Must be plain text, not JSON
      assert.throws(
        () => JSON.parse(content),
        'Sentinel should NOT be valid JSON — it should be a plain version string'
      );
    });

    it('should contain only the version string with trailing newline', () => {
      writeVersionSentinel(testDir, '10.3.1');

      const sentinelPath = join(testDir, '.pennyfarthing', SENTINEL_FILENAME);
      const content = readFileSync(sentinelPath, 'utf8');

      assert.strictEqual(
        content,
        '10.3.1\n',
        'Sentinel should be version string followed by newline'
      );
    });

    it('should use .installed-version as filename', () => {
      assert.strictEqual(
        SENTINEL_FILENAME,
        '.installed-version',
        'Sentinel filename must be .installed-version'
      );
    });
  });

  // ─── AC1: init.ts writes sentinel ──────────────────────────────

  describe('writeVersionSentinel (used by init.ts) (AC1)', () => {
    it('should create sentinel file in .pennyfarthing/', () => {
      writeVersionSentinel(testDir, '10.3.1');

      const sentinelPath = join(testDir, '.pennyfarthing', SENTINEL_FILENAME);
      assert.ok(
        existsSync(sentinelPath),
        'Sentinel file should be created at .pennyfarthing/.installed-version'
      );
    });

    it('should write the exact version passed', () => {
      writeVersionSentinel(testDir, '10.3.1');

      const version = readVersionSentinel(testDir);
      assert.strictEqual(version, '10.3.1');
    });

    it('should create .pennyfarthing/ directory if it does not exist', () => {
      const bareDir = createTestDir();
      // No .pennyfarthing/ exists

      writeVersionSentinel(bareDir, '10.3.1');

      const sentinelPath = join(bareDir, '.pennyfarthing', SENTINEL_FILENAME);
      assert.ok(existsSync(sentinelPath), 'Should create directory and file');

      rmSync(bareDir, { recursive: true, force: true });
    });

    it('should not write sentinel in dry-run mode', () => {
      writeVersionSentinel(testDir, '10.3.1', { dryRun: true });

      const sentinelPath = join(testDir, '.pennyfarthing', SENTINEL_FILENAME);
      assert.ok(
        !existsSync(sentinelPath),
        'Sentinel should NOT be created in dry-run mode'
      );
    });
  });

  // ─── AC2: update.ts writes sentinel ────────────────────────────

  describe('writeVersionSentinel (used by update.ts) (AC2)', () => {
    it('should overwrite existing sentinel with new version', () => {
      // Simulate old version
      writeVersionSentinel(testDir, '10.2.0');
      assert.strictEqual(readVersionSentinel(testDir), '10.2.0');

      // Update to new version
      writeVersionSentinel(testDir, '10.3.1');
      assert.strictEqual(
        readVersionSentinel(testDir),
        '10.3.1',
        'Sentinel should be updated to new version'
      );
    });
  });

  // ─── readVersionSentinel ───────────────────────────────────────

  describe('readVersionSentinel', () => {
    it('should return null when sentinel file does not exist', () => {
      const version = readVersionSentinel(testDir);
      assert.strictEqual(
        version,
        null,
        'Should return null for missing sentinel'
      );
    });

    it('should trim whitespace from version string', () => {
      // Manually write a sentinel with extra whitespace
      const sentinelPath = join(testDir, '.pennyfarthing', SENTINEL_FILENAME);
      writeFileSync(sentinelPath, '  10.3.1  \n', 'utf8');

      const version = readVersionSentinel(testDir);
      assert.strictEqual(version, '10.3.1', 'Should trim whitespace');
    });

    it('should return null for empty sentinel file', () => {
      const sentinelPath = join(testDir, '.pennyfarthing', SENTINEL_FILENAME);
      writeFileSync(sentinelPath, '', 'utf8');

      const version = readVersionSentinel(testDir);
      assert.strictEqual(
        version,
        null,
        'Should return null for empty sentinel'
      );
    });
  });
});
