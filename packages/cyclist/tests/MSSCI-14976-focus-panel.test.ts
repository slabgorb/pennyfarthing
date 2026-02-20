/**
 * MSSCI-14976: WheelHub config file watch + panel focus broadcast
 *
 * Story 104-2, Epic 104: /bc CLI Panel Focus
 *
 * Acceptance Criteria:
 * - AC1: WheelHub watches config.local.yaml for `focus` key changes
 * - AC2: `/ws/focus` WebSocket endpoint exists with client set, upgrade route, connection handler
 * - AC3: On connect, client receives { type: 'init', focus: string | null }
 * - AC4: On focus change, clients receive { type: 'update', focus: string | null }
 * - AC5: Broadcast only fires when focus value actually changes (track lastKnownFocus)
 * - AC6: Extends existing settings watcher — no separate file watcher
 * - AC7: Focus reader function parses config.local.yaml and returns focus value or null
 *
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  getConfigFocus,
  shouldBroadcastFocus,
  createFocusMessage,
  isValidFocusPanel,
  VALID_FOCUS_PANELS,
  type FocusMessage,
} from '../src/focus.js';

// =============================================================================
// AC7: Focus reader function parses config.local.yaml and returns focus value
// =============================================================================

describe('AC7: getConfigFocus — reads focus from config.local.yaml', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'focus-test-'));
    mkdirSync(join(tmpDir, '.pennyfarthing'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should return null when focus key is not present in config', () => {
    writeFileSync(
      join(tmpDir, '.pennyfarthing', 'config.local.yaml'),
      'theme: fifth-element\n',
    );
    const result = getConfigFocus(tmpDir);
    expect(result).toBeNull();
  });

  it('should return null when focus is explicitly set to null', () => {
    writeFileSync(
      join(tmpDir, '.pennyfarthing', 'config.local.yaml'),
      'theme: fifth-element\nfocus: null\n',
    );
    const result = getConfigFocus(tmpDir);
    expect(result).toBeNull();
  });

  it('should return panel ID when focus is set to a valid panel', () => {
    writeFileSync(
      join(tmpDir, '.pennyfarthing', 'config.local.yaml'),
      'theme: fifth-element\nfocus: sprint\n',
    );
    const result = getConfigFocus(tmpDir);
    expect(result).toBe('sprint');
  });

  it('should return panel ID for each valid panel type', () => {
    for (const panel of VALID_FOCUS_PANELS) {
      writeFileSync(
        join(tmpDir, '.pennyfarthing', 'config.local.yaml'),
        `focus: ${panel}\n`,
      );
      const result = getConfigFocus(tmpDir);
      expect(result).toBe(panel);
    }
  });

  it('should return null when config.local.yaml does not exist', () => {
    // No config file written — should not throw, just return null
    const result = getConfigFocus(tmpDir);
    expect(result).toBeNull();
  });

  it('should return null when .pennyfarthing directory does not exist', () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'focus-empty-'));
    try {
      const result = getConfigFocus(emptyDir);
      expect(result).toBeNull();
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it('should handle malformed YAML gracefully and return null', () => {
    writeFileSync(
      join(tmpDir, '.pennyfarthing', 'config.local.yaml'),
      '{{{{not valid yaml',
    );
    const result = getConfigFocus(tmpDir);
    expect(result).toBeNull();
  });

  it('should return the raw string value even for unknown panel IDs', () => {
    // getConfigFocus reads whatever is there — validation is separate
    writeFileSync(
      join(tmpDir, '.pennyfarthing', 'config.local.yaml'),
      'focus: nonexistent-panel\n',
    );
    const result = getConfigFocus(tmpDir);
    expect(result).toBe('nonexistent-panel');
  });

  it('should ignore other config keys and only return focus', () => {
    writeFileSync(
      join(tmpDir, '.pennyfarthing', 'config.local.yaml'),
      'theme: fifth-element\nbell_mode: true\nfocus: git\nlayout: {}\n',
    );
    const result = getConfigFocus(tmpDir);
    expect(result).toBe('git');
  });
});

// =============================================================================
// AC5: Broadcast only fires when focus value actually changes
// =============================================================================

describe('AC5: shouldBroadcastFocus — change detection', () => {
  it('should return true when focus changes from null to a panel', () => {
    expect(shouldBroadcastFocus('sprint', null)).toBe(true);
  });

  it('should return true when focus changes from a panel to null', () => {
    expect(shouldBroadcastFocus(null, 'sprint')).toBe(true);
  });

  it('should return true when focus changes from one panel to another', () => {
    expect(shouldBroadcastFocus('git', 'sprint')).toBe(true);
  });

  it('should return false when focus has not changed (both null)', () => {
    expect(shouldBroadcastFocus(null, null)).toBe(false);
  });

  it('should return false when focus has not changed (same panel)', () => {
    expect(shouldBroadcastFocus('sprint', 'sprint')).toBe(false);
  });

  it('should return false for identical string values', () => {
    expect(shouldBroadcastFocus('debug', 'debug')).toBe(false);
  });
});

// =============================================================================
// AC3 & AC4: WebSocket message format — init and update
// =============================================================================

describe('AC3/AC4: createFocusMessage — WebSocket message format', () => {
  it('should create init message with null focus', () => {
    const msg = createFocusMessage('init', null);
    expect(msg).toEqual({ type: 'init', focus: null });
  });

  it('should create init message with panel focus', () => {
    const msg = createFocusMessage('init', 'sprint');
    expect(msg).toEqual({ type: 'init', focus: 'sprint' });
  });

  it('should create update message with null focus (reset)', () => {
    const msg = createFocusMessage('update', null);
    expect(msg).toEqual({ type: 'update', focus: null });
  });

  it('should create update message with panel focus', () => {
    const msg = createFocusMessage('update', 'git');
    expect(msg).toEqual({ type: 'update', focus: 'git' });
  });

  it('should have exactly two keys: type and focus', () => {
    const msg = createFocusMessage('init', 'sprint');
    expect(Object.keys(msg)).toHaveLength(2);
    expect(Object.keys(msg)).toContain('type');
    expect(Object.keys(msg)).toContain('focus');
  });

  it('should produce valid JSON for WebSocket transmission', () => {
    const msg = createFocusMessage('update', 'diffs');
    const json = JSON.stringify(msg);
    const parsed = JSON.parse(json) as FocusMessage;
    expect(parsed.type).toBe('update');
    expect(parsed.focus).toBe('diffs');
  });
});

// =============================================================================
// Panel ID validation
// =============================================================================

describe('isValidFocusPanel — panel ID validation', () => {
  it('should return true for all valid panel IDs', () => {
    for (const panel of VALID_FOCUS_PANELS) {
      expect(isValidFocusPanel(panel)).toBe(true);
    }
  });

  it('should return false for message panel (sacred center)', () => {
    expect(isValidFocusPanel('message')).toBe(false);
  });

  it('should return false for tty panel (Cyclist-only, not focusable)', () => {
    expect(isValidFocusPanel('tty')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isValidFocusPanel('')).toBe(false);
  });

  it('should return false for arbitrary string', () => {
    expect(isValidFocusPanel('nonexistent')).toBe(false);
  });

  it('should be case-sensitive', () => {
    expect(isValidFocusPanel('Sprint')).toBe(false);
    expect(isValidFocusPanel('GIT')).toBe(false);
  });
});

// =============================================================================
// AC2: WebSocket broadcast integration — /ws/focus channel behavior
// =============================================================================

describe('AC2: Focus WebSocket broadcast behavior', () => {
  it('should only broadcast to OPEN clients, skip CLOSED ones', () => {
    // Pattern from 75-6-panel-refresh.test.ts — inline broadcast logic test
    const clients: Array<{ send: (msg: string) => void; readyState: number }> = [
      { send: vi.fn(), readyState: 1 }, // OPEN
      { send: vi.fn(), readyState: 1 }, // OPEN
      { send: vi.fn(), readyState: 3 }, // CLOSED — should be skipped
    ];

    const OPEN = 1;
    const msg = createFocusMessage('update', 'sprint');
    const message = JSON.stringify(msg);

    for (const client of clients) {
      if (client.readyState === OPEN) {
        client.send(message);
      }
    }

    expect(clients[0].send).toHaveBeenCalledWith(message);
    expect(clients[1].send).toHaveBeenCalledWith(message);
    expect(clients[2].send).not.toHaveBeenCalled();
  });

  it('should send init message format on new client connection', () => {
    const msg = createFocusMessage('init', null);
    expect(msg.type).toBe('init');
    expect(msg).toHaveProperty('focus');
  });

  it('should send update message format on focus change', () => {
    const msg = createFocusMessage('update', 'git');
    expect(msg.type).toBe('update');
    expect(msg).toHaveProperty('focus');
  });
});

// =============================================================================
// AC1 & AC6: Config watcher integration
// =============================================================================

describe('AC1/AC6: Config watcher integration pattern', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'focus-watcher-'));
    mkdirSync(join(tmpDir, '.pennyfarthing'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should detect focus change when config file is rewritten', () => {
    // Write initial config with no focus
    writeFileSync(
      join(tmpDir, '.pennyfarthing', 'config.local.yaml'),
      'theme: fifth-element\n',
    );
    const before = getConfigFocus(tmpDir);
    expect(before).toBeNull();

    // Write updated config with focus
    writeFileSync(
      join(tmpDir, '.pennyfarthing', 'config.local.yaml'),
      'theme: fifth-element\nfocus: sprint\n',
    );
    const after = getConfigFocus(tmpDir);
    expect(after).toBe('sprint');

    // Change detection should flag this
    expect(shouldBroadcastFocus(after, before)).toBe(true);
  });

  it('should NOT broadcast when focus unchanged across config rewrites', () => {
    // Write config with focus
    writeFileSync(
      join(tmpDir, '.pennyfarthing', 'config.local.yaml'),
      'theme: fifth-element\nfocus: sprint\n',
    );
    const first = getConfigFocus(tmpDir);

    // Rewrite config — theme changes but focus stays same
    writeFileSync(
      join(tmpDir, '.pennyfarthing', 'config.local.yaml'),
      'theme: comedy\nfocus: sprint\n',
    );
    const second = getConfigFocus(tmpDir);

    expect(shouldBroadcastFocus(second, first)).toBe(false);
  });

  it('should detect focus reset (panel → null)', () => {
    writeFileSync(
      join(tmpDir, '.pennyfarthing', 'config.local.yaml'),
      'focus: git\n',
    );
    const before = getConfigFocus(tmpDir);

    writeFileSync(
      join(tmpDir, '.pennyfarthing', 'config.local.yaml'),
      'focus: null\n',
    );
    const after = getConfigFocus(tmpDir);

    expect(shouldBroadcastFocus(after, before)).toBe(true);
  });
});

// =============================================================================
// VALID_FOCUS_PANELS constant
// =============================================================================

describe('VALID_FOCUS_PANELS constant', () => {
  it('should contain all expected BikeRack panels', () => {
    const expected = [
      'sprint', 'git', 'diffs', 'todo', 'workflow',
      'audit-log', 'changed', 'ac', 'debug', 'settings',
    ];
    for (const panel of expected) {
      expect(VALID_FOCUS_PANELS).toContain(panel);
    }
  });

  it('should NOT contain message panel', () => {
    expect(VALID_FOCUS_PANELS).not.toContain('message');
  });

  it('should NOT contain tty panel', () => {
    expect(VALID_FOCUS_PANELS).not.toContain('tty');
  });

  it('should have exactly 11 panels', () => {
    expect(VALID_FOCUS_PANELS).toHaveLength(11);
  });
});
