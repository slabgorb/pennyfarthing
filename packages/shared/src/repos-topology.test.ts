/**
 * repos-topology.test.ts — Tests for repos.yaml topology schema validation
 *
 * Story 87-1: Extend repos.yaml schema with ownership and boundaries
 * RED STATE: These tests should FAIL until Dev implements validateReposTopology()
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { validateReposTopology, type ReposConfig } from './repos-topology.js';

// ── Fixtures ──────────────────────────────────────────────────────────

/** Minimal valid config with all topology fields */
const VALID_CONFIG: ReposConfig = {
  repos: {
    orchestrator: {
      path: '.',
      type: 'orchestrator',
      description: 'Sprint management and coordination',
      language: 'javascript',
      build_command: 'npm install',
      owns: ['sprint/**', 'docs/**', '.session/**'],
      never_edit: ['node_modules/**', '.pennyfarthing/**'],
      symlinks: {
        '.pennyfarthing/agents': 'pennyfarthing/pennyfarthing-dist/agents',
        '.pennyfarthing/scripts': 'pennyfarthing/pennyfarthing-dist/scripts',
      },
      ui_layer: 'none',
    },
    pennyfarthing: {
      path: 'pennyfarthing',
      type: 'framework',
      description: 'Pennyfarthing framework source',
      language: 'typescript',
      test_command: 'pnpm test',
      build_command: 'pnpm build',
      owns: ['pennyfarthing-dist/**', 'packages/**'],
      never_edit: ['node_modules/**', 'dist/**'],
      symlinks: {},
      ui_layer: 'react',
      components_path: 'packages/cyclist/src/components',
    },
  },
};

/** Config with only legacy fields (no topology) — backwards compatible */
const LEGACY_CONFIG: ReposConfig = {
  repos: {
    orchestrator: {
      path: '.',
      type: 'orchestrator',
      description: 'Sprint management',
      language: 'javascript',
      build_command: 'npm install',
    },
  },
};

// ── AC1: owns field ───────────────────────────────────────────────────

describe('AC1: owns field — glob patterns for directory ownership', () => {
  it('accepts valid owns array with glob patterns', () => {
    const result = validateReposTopology(VALID_CONFIG);
    assert.strictEqual(result.valid, true, `Expected valid but got errors: ${result.errors.join(', ')}`);
  });

  it('rejects owns when not an array', () => {
    const config = structuredClone(VALID_CONFIG);
    (config.repos.orchestrator as any).owns = 'sprint/**';
    const result = validateReposTopology(config);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('owns')), 'Should mention owns field');
  });

  it('rejects owns with non-string entries', () => {
    const config = structuredClone(VALID_CONFIG);
    (config.repos.orchestrator as any).owns = ['sprint/**', 42, null];
    const result = validateReposTopology(config);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('owns')), 'Should mention owns field');
  });
});

// ── AC2: never_edit field ─────────────────────────────────────────────

describe('AC2: never_edit field — off-limits paths', () => {
  it('accepts valid never_edit array', () => {
    const result = validateReposTopology(VALID_CONFIG);
    assert.strictEqual(result.valid, true, `Expected valid but got errors: ${result.errors.join(', ')}`);
  });

  it('rejects never_edit when not an array', () => {
    const config = structuredClone(VALID_CONFIG);
    (config.repos.orchestrator as any).never_edit = 'node_modules/**';
    const result = validateReposTopology(config);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('never_edit')), 'Should mention never_edit field');
  });

  it('rejects never_edit with non-string entries', () => {
    const config = structuredClone(VALID_CONFIG);
    (config.repos.pennyfarthing as any).never_edit = [123];
    const result = validateReposTopology(config);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('never_edit')), 'Should mention never_edit field');
  });
});

// ── AC3: symlinks mapping ─────────────────────────────────────────────

describe('AC3: symlinks field — mapping of symlink paths to sources', () => {
  it('accepts valid symlinks object', () => {
    const result = validateReposTopology(VALID_CONFIG);
    assert.strictEqual(result.valid, true, `Expected valid but got errors: ${result.errors.join(', ')}`);
  });

  it('accepts empty symlinks object', () => {
    const config = structuredClone(VALID_CONFIG);
    config.repos.orchestrator.symlinks = {};
    const result = validateReposTopology(config);
    assert.strictEqual(result.valid, true, `Expected valid but got errors: ${result.errors.join(', ')}`);
  });

  it('rejects symlinks when not an object', () => {
    const config = structuredClone(VALID_CONFIG);
    (config.repos.orchestrator as any).symlinks = ['.pennyfarthing/agents'];
    const result = validateReposTopology(config);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('symlinks')), 'Should mention symlinks field');
  });

  it('rejects symlinks with non-string values', () => {
    const config = structuredClone(VALID_CONFIG);
    (config.repos.orchestrator as any).symlinks = { '.pennyfarthing/agents': 42 };
    const result = validateReposTopology(config);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('symlinks')), 'Should mention symlinks field');
  });
});

// ── AC4: ui_layer field ───────────────────────────────────────────────

describe('AC4: ui_layer field — rendering context', () => {
  it('accepts react as ui_layer', () => {
    const config = structuredClone(VALID_CONFIG);
    config.repos.pennyfarthing.ui_layer = 'react';
    const result = validateReposTopology(config);
    assert.strictEqual(result.valid, true, `Expected valid but got errors: ${result.errors.join(', ')}`);
  });

  it('accepts cli as ui_layer', () => {
    const config = structuredClone(VALID_CONFIG);
    config.repos.pennyfarthing.ui_layer = 'cli';
    const result = validateReposTopology(config);
    assert.strictEqual(result.valid, true, `Expected valid but got errors: ${result.errors.join(', ')}`);
  });

  it('accepts none as ui_layer', () => {
    const config = structuredClone(VALID_CONFIG);
    config.repos.orchestrator.ui_layer = 'none';
    const result = validateReposTopology(config);
    assert.strictEqual(result.valid, true, `Expected valid but got errors: ${result.errors.join(', ')}`);
  });

  it('rejects invalid ui_layer value', () => {
    const config = structuredClone(VALID_CONFIG);
    (config.repos.orchestrator as any).ui_layer = 'angular';
    const result = validateReposTopology(config);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('ui_layer')), 'Should mention ui_layer field');
  });
});

// ── AC5: components_path field (optional) ─────────────────────────────

describe('AC5: components_path field — optional UI component location', () => {
  it('accepts config with components_path set', () => {
    const result = validateReposTopology(VALID_CONFIG);
    assert.strictEqual(result.valid, true, `Expected valid but got errors: ${result.errors.join(', ')}`);
    assert.strictEqual(VALID_CONFIG.repos.pennyfarthing.components_path, 'packages/cyclist/src/components');
  });

  it('accepts config without components_path (optional field)', () => {
    const config = structuredClone(VALID_CONFIG);
    delete config.repos.orchestrator.components_path;
    const result = validateReposTopology(config);
    assert.strictEqual(result.valid, true, `Expected valid but got errors: ${result.errors.join(', ')}`);
  });

  it('rejects components_path when not a string', () => {
    const config = structuredClone(VALID_CONFIG);
    (config.repos.pennyfarthing as any).components_path = ['src/components'];
    const result = validateReposTopology(config);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('components_path')), 'Should mention components_path field');
  });
});

// ── AC6: Schema validation ────────────────────────────────────────────

describe('AC6: Schema validation — structural correctness', () => {
  it('rejects null input', () => {
    const result = validateReposTopology(null);
    assert.strictEqual(result.valid, false);
  });

  it('rejects input without repos key', () => {
    const result = validateReposTopology({ notRepos: {} });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('repos')));
  });

  it('rejects repos that is not an object', () => {
    const result = validateReposTopology({ repos: 'bad' });
    assert.strictEqual(result.valid, false);
  });

  it('rejects repo entry without required path field', () => {
    const config = {
      repos: {
        myrepo: { type: 'app', description: 'test' },
      },
    };
    const result = validateReposTopology(config);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('path')));
  });

  it('rejects repo entry without required type field', () => {
    const config = {
      repos: {
        myrepo: { path: '.', description: 'test' },
      },
    };
    const result = validateReposTopology(config);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('type')));
  });

  it('rejects repo entry without required description field', () => {
    const config = {
      repos: {
        myrepo: { path: '.', type: 'app' },
      },
    };
    const result = validateReposTopology(config);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('description')));
  });

  it('validates a fully populated config', () => {
    const result = validateReposTopology(VALID_CONFIG);
    assert.strictEqual(result.valid, true, `Expected valid but got errors: ${result.errors.join(', ')}`);
  });
});

// ── AC7: Backwards compatibility ──────────────────────────────────────

describe('AC7: Backwards compatibility — legacy configs still valid', () => {
  it('accepts legacy config without any topology fields', () => {
    const result = validateReposTopology(LEGACY_CONFIG);
    assert.strictEqual(result.valid, true, `Legacy config should be valid. Errors: ${result.errors.join(', ')}`);
  });

  it('accepts config with only some topology fields set', () => {
    const config = structuredClone(LEGACY_CONFIG);
    config.repos.orchestrator.owns = ['sprint/**'];
    // No never_edit, symlinks, ui_layer, or components_path
    const result = validateReposTopology(config);
    assert.strictEqual(result.valid, true, `Partial topology should be valid. Errors: ${result.errors.join(', ')}`);
  });

  it('preserves existing fields alongside new topology fields', () => {
    const config = structuredClone(VALID_CONFIG);
    // Verify base fields still present
    assert.strictEqual(config.repos.orchestrator.path, '.');
    assert.strictEqual(config.repos.orchestrator.type, 'orchestrator');
    assert.strictEqual(config.repos.orchestrator.description, 'Sprint management and coordination');
    assert.strictEqual(config.repos.orchestrator.language, 'javascript');
    assert.strictEqual(config.repos.orchestrator.build_command, 'npm install');
    // And topology fields coexist
    assert.ok(Array.isArray(config.repos.orchestrator.owns));
    assert.ok(Array.isArray(config.repos.orchestrator.never_edit));
  });
});
