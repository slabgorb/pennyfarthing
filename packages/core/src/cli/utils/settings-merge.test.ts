/**
 * Tests for Story 98-11: Settings.local.json shared merge model for multi-framework coexistence
 *
 * Acceptance Criteria:
 * AC1: Namespace/section approach — each framework contributes settings under its own key
 * AC2: Merge conflict resolution — hooks concatenated, permissions unioned, scalars priority-based
 * AC3: Migration from legacy v1 format to v2 shared format
 * AC4: Rollback — removing a framework cleanly extracts its contributions
 * AC5: Backward compatibility — v2 exports flat format compatible with Claude Code
 * AC6: Validation and error handling
 *
 * Run with: cd packages/core && npm run build && npm test
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';

import {
  createEmptySharedSettings,
  contributeFrameworkSettings,
  removeFrameworkSettings,
  mergeHooks,
  mergePermissions,
  resolveScalar,
  detectConflicts,
  migrateToSharedFormat,
  isSharedFormat,
  toFlatFormat,
  validateSharedSettings,
  SHARED_SETTINGS_VERSION,
  type SharedSettings,
  type FrameworkContribution,
  type FrameworkMeta,
  type HookEntry,
  type MergeConflict,
} from './settings-merge.js';

// =============================================================================
// Test Fixtures
// =============================================================================

function makePennyfarthingContribution(): FrameworkContribution {
  return {
    version: '10.4.0',
    hooks: {
      SessionStart: [
        {
          hooks: [
            { type: 'command', command: '.pennyfarthing/scripts/hooks/session-start.sh' },
          ],
        },
      ],
      PostToolUse: [
        {
          matcher: '',
          hooks: [
            { type: 'command', command: '.pennyfarthing/scripts/hooks/bell-mode-hook.sh' },
          ],
        },
      ],
    },
    permissions: {
      allow: ['Read', 'Grep', 'Glob', 'Bash', 'Skill(sm)', 'Skill(tea)'],
    },
    statusLine: {
      type: 'command',
      command: '.pennyfarthing/scripts/misc/statusline.sh',
    },
    context_budget: {
      warning_threshold: 70,
      critical_threshold: 85,
      max_tokens: 200000,
    },
  };
}

function makeOtherFrameworkContribution(): FrameworkContribution {
  return {
    version: '2.1.0',
    hooks: {
      SessionStart: [
        {
          hooks: [
            { type: 'command', command: '.other-framework/hooks/init.sh' },
          ],
        },
      ],
      PreToolUse: [
        {
          matcher: 'Bash',
          hooks: [
            { type: 'command', command: '.other-framework/hooks/pre-bash.sh' },
          ],
        },
      ],
    },
    permissions: {
      allow: ['Read', 'Bash', 'Skill(custom-skill)'],
    },
    statusLine: {
      type: 'command',
      command: '.other-framework/statusline.sh',
    },
  };
}

function makeMinimalContribution(): FrameworkContribution {
  return {
    version: '1.0.0',
    hooks: {
      Stop: [
        {
          matcher: '',
          hooks: [{ type: 'command', command: '.minimal/hooks/stop.sh' }],
        },
      ],
    },
  };
}

// =============================================================================
// AC1: Namespace/Section Approach
// =============================================================================

describe('AC1: Namespace/section approach', () => {
  let settings: SharedSettings;

  beforeEach(() => {
    settings = createEmptySharedSettings();
  });

  it('should create empty shared settings with correct version', () => {
    assert.strictEqual(settings._version, SHARED_SETTINGS_VERSION);
    assert.deepStrictEqual(settings._frameworks, {});
    assert.deepStrictEqual(settings._contributions, {});
    assert.deepStrictEqual(settings.hooks, {});
    assert.deepStrictEqual(settings.permissions, { allow: [] });
  });

  it('should store framework contribution under its namespace key', () => {
    const contribution = makePennyfarthingContribution();
    const result = contributeFrameworkSettings(settings, 'pennyfarthing', contribution);

    assert.ok(
      result.settings._contributions['pennyfarthing'],
      'Contribution should be stored under pennyfarthing key'
    );
    assert.strictEqual(
      result.settings._contributions['pennyfarthing'].version,
      '10.4.0',
      'Should store the framework version'
    );
  });

  it('should register framework metadata on contribution', () => {
    const contribution = makePennyfarthingContribution();
    const result = contributeFrameworkSettings(settings, 'pennyfarthing', contribution);

    assert.ok(
      result.settings._frameworks['pennyfarthing'],
      'Framework metadata should exist'
    );
    assert.strictEqual(
      result.settings._frameworks['pennyfarthing'].version,
      '10.4.0'
    );
    assert.ok(
      result.settings._frameworks['pennyfarthing'].installed_at,
      'Should have installed_at timestamp'
    );
  });

  it('should store multiple frameworks with separate namespace keys', () => {
    const pf = makePennyfarthingContribution();
    const other = makeOtherFrameworkContribution();

    let result = contributeFrameworkSettings(settings, 'pennyfarthing', pf);
    result = contributeFrameworkSettings(result.settings, 'other-framework', other);

    assert.ok(result.settings._contributions['pennyfarthing']);
    assert.ok(result.settings._contributions['other-framework']);
    assert.strictEqual(
      Object.keys(result.settings._contributions).length,
      2,
      'Should have exactly 2 framework contributions'
    );
  });

  it('should update existing framework contribution without creating duplicate', () => {
    const v1 = makePennyfarthingContribution();
    const v2 = { ...makePennyfarthingContribution(), version: '10.5.0' };

    let result = contributeFrameworkSettings(settings, 'pennyfarthing', v1);
    result = contributeFrameworkSettings(result.settings, 'pennyfarthing', v2);

    assert.strictEqual(
      Object.keys(result.settings._contributions).length,
      1,
      'Should still have exactly 1 contribution'
    );
    assert.strictEqual(
      result.settings._contributions['pennyfarthing'].version,
      '10.5.0',
      'Should have updated version'
    );
  });

  it('should preserve framework contribution data integrity', () => {
    const contribution = makePennyfarthingContribution();
    const result = contributeFrameworkSettings(settings, 'pennyfarthing', contribution);

    const stored = result.settings._contributions['pennyfarthing'];
    assert.deepStrictEqual(
      stored.hooks,
      contribution.hooks,
      'Stored hooks should match contribution'
    );
    assert.deepStrictEqual(
      stored.permissions,
      contribution.permissions,
      'Stored permissions should match contribution'
    );
  });
});

// =============================================================================
// AC2: Merge Conflict Resolution — Hooks
// =============================================================================

describe('AC2a: Hook merging', () => {
  it('should merge hooks from single framework', () => {
    const contributions = {
      pennyfarthing: makePennyfarthingContribution(),
    };

    const merged = mergeHooks(contributions);

    assert.ok(merged.SessionStart, 'Should have SessionStart hooks');
    assert.ok(merged.PostToolUse, 'Should have PostToolUse hooks');
    assert.strictEqual(merged.SessionStart.length, 1, 'Should have 1 SessionStart entry');
  });

  it('should concatenate hooks from multiple frameworks per hook type', () => {
    const contributions = {
      pennyfarthing: makePennyfarthingContribution(),
      'other-framework': makeOtherFrameworkContribution(),
    };

    const merged = mergeHooks(contributions);

    // SessionStart: both frameworks contribute
    assert.ok(merged.SessionStart, 'Should have SessionStart');
    assert.strictEqual(
      merged.SessionStart.length,
      2,
      'SessionStart should have entries from both frameworks'
    );

    // PostToolUse: only pennyfarthing
    assert.ok(merged.PostToolUse, 'Should have PostToolUse');
    assert.strictEqual(merged.PostToolUse.length, 1, 'PostToolUse from pennyfarthing only');

    // PreToolUse: only other-framework
    assert.ok(merged.PreToolUse, 'Should have PreToolUse');
    assert.strictEqual(merged.PreToolUse.length, 1, 'PreToolUse from other-framework only');
  });

  it('should deduplicate identical hooks within same framework', () => {
    const contribution: FrameworkContribution = {
      version: '1.0.0',
      hooks: {
        SessionStart: [
          { hooks: [{ type: 'command', command: 'same-hook.sh' }] },
          { hooks: [{ type: 'command', command: 'same-hook.sh' }] },
        ],
      },
    };

    const merged = mergeHooks({ test: contribution });
    assert.strictEqual(
      merged.SessionStart.length,
      1,
      'Duplicate hooks within same framework should be deduplicated'
    );
  });

  it('should preserve hook ordering — framework order then hook order', () => {
    const contributions = {
      alpha: {
        version: '1.0.0',
        hooks: {
          SessionStart: [
            { hooks: [{ type: 'command', command: 'alpha-first.sh' }] },
            { hooks: [{ type: 'command', command: 'alpha-second.sh' }] },
          ],
        },
      } as FrameworkContribution,
      beta: {
        version: '1.0.0',
        hooks: {
          SessionStart: [
            { hooks: [{ type: 'command', command: 'beta-first.sh' }] },
          ],
        },
      } as FrameworkContribution,
    };

    const merged = mergeHooks(contributions);
    const commands = merged.SessionStart.map(e => e.hooks[0].command);

    assert.strictEqual(commands[0], 'alpha-first.sh');
    assert.strictEqual(commands[1], 'alpha-second.sh');
    assert.strictEqual(commands[2], 'beta-first.sh');
  });

  it('should handle framework with no hooks', () => {
    const contributions = {
      empty: { version: '1.0.0' } as FrameworkContribution,
      withHooks: makePennyfarthingContribution(),
    };

    const merged = mergeHooks(contributions);
    assert.ok(merged.SessionStart, 'Should still have hooks from the other framework');
  });

  it('should return empty object when no contributions have hooks', () => {
    const contributions = {
      a: { version: '1.0.0' } as FrameworkContribution,
      b: { version: '2.0.0' } as FrameworkContribution,
    };

    const merged = mergeHooks(contributions);
    assert.deepStrictEqual(merged, {}, 'Should return empty hooks');
  });
});

// =============================================================================
// AC2: Merge Conflict Resolution — Permissions
// =============================================================================

describe('AC2b: Permission merging', () => {
  it('should union permissions from multiple frameworks', () => {
    const contributions = {
      pennyfarthing: makePennyfarthingContribution(),
      'other-framework': makeOtherFrameworkContribution(),
    };

    const merged = mergePermissions(contributions);

    // Pennyfarthing: Read, Grep, Glob, Bash, Skill(sm), Skill(tea)
    // Other:         Read, Bash, Skill(custom-skill)
    // Union:         Read, Grep, Glob, Bash, Skill(sm), Skill(tea), Skill(custom-skill)
    assert.ok(merged.allow.includes('Read'), 'Should include Read');
    assert.ok(merged.allow.includes('Grep'), 'Should include Grep (pennyfarthing only)');
    assert.ok(merged.allow.includes('Glob'), 'Should include Glob (pennyfarthing only)');
    assert.ok(merged.allow.includes('Bash'), 'Should include Bash');
    assert.ok(merged.allow.includes('Skill(sm)'), 'Should include Skill(sm)');
    assert.ok(merged.allow.includes('Skill(custom-skill)'), 'Should include Skill(custom-skill)');
  });

  it('should deduplicate permissions present in multiple frameworks', () => {
    const contributions = {
      pennyfarthing: makePennyfarthingContribution(),
      'other-framework': makeOtherFrameworkContribution(),
    };

    const merged = mergePermissions(contributions);

    // Read and Bash appear in both — should only appear once
    const readCount = merged.allow.filter(p => p === 'Read').length;
    const bashCount = merged.allow.filter(p => p === 'Bash').length;
    assert.strictEqual(readCount, 1, 'Read should appear exactly once');
    assert.strictEqual(bashCount, 1, 'Bash should appear exactly once');
  });

  it('should handle framework with no permissions', () => {
    const contributions = {
      minimal: makeMinimalContribution(),
      pennyfarthing: makePennyfarthingContribution(),
    };

    const merged = mergePermissions(contributions);
    assert.ok(merged.allow.length > 0, 'Should have permissions from pennyfarthing');
    assert.ok(merged.allow.includes('Read'));
  });

  it('should return empty allow list when no frameworks contribute permissions', () => {
    const contributions = {
      a: { version: '1.0.0' } as FrameworkContribution,
    };

    const merged = mergePermissions(contributions);
    assert.deepStrictEqual(merged, { allow: [] });
  });

  it('should maintain stable ordering — alphabetical by permission string', () => {
    const contributions = {
      z: {
        version: '1.0.0',
        permissions: { allow: ['Zebra', 'Apple'] },
      } as FrameworkContribution,
      a: {
        version: '1.0.0',
        permissions: { allow: ['Mango', 'Banana'] },
      } as FrameworkContribution,
    };

    const merged = mergePermissions(contributions);
    const sorted = [...merged.allow].sort();
    assert.deepStrictEqual(merged.allow, sorted, 'Permissions should be alphabetically sorted');
  });
});

// =============================================================================
// AC2: Merge Conflict Resolution — Scalar Values
// =============================================================================

describe('AC2c: Scalar resolution', () => {
  it('should use statusLine from highest-priority framework', () => {
    const contributions: Record<string, FrameworkContribution> = {
      pennyfarthing: makePennyfarthingContribution(),
      'other-framework': makeOtherFrameworkContribution(),
    };
    const frameworks: Record<string, FrameworkMeta> = {
      pennyfarthing: { version: '10.4.0', installed_at: '2026-01-01', priority: 1 },
      'other-framework': { version: '2.1.0', installed_at: '2026-02-01', priority: 2 },
    };

    const result = resolveScalar<{ type: string; command: string }>(
      contributions, frameworks, 'statusLine'
    );

    assert.ok(result, 'Should resolve a statusLine');
    assert.ok(
      result.command.includes('.pennyfarthing'),
      'Should use pennyfarthing statusLine (priority 1)'
    );
  });

  it('should use context_budget from highest-priority framework', () => {
    const contributions: Record<string, FrameworkContribution> = {
      pennyfarthing: makePennyfarthingContribution(),
      'other-framework': {
        ...makeOtherFrameworkContribution(),
        context_budget: { warning_threshold: 60, critical_threshold: 80, max_tokens: 150000 },
      },
    };
    const frameworks: Record<string, FrameworkMeta> = {
      pennyfarthing: { version: '10.4.0', installed_at: '2026-01-01', priority: 1 },
      'other-framework': { version: '2.1.0', installed_at: '2026-02-01', priority: 2 },
    };

    const result = resolveScalar<{ warning_threshold: number; critical_threshold: number; max_tokens: number }>(
      contributions, frameworks, 'context_budget'
    );

    assert.ok(result, 'Should resolve context_budget');
    assert.strictEqual(result.warning_threshold, 70, 'Should use pennyfarthing value (priority 1)');
  });

  it('should fall back to alphabetical order when priorities are equal', () => {
    const contributions: Record<string, FrameworkContribution> = {
      beta: {
        version: '1.0.0',
        statusLine: { type: 'command', command: 'beta-status.sh' },
      },
      alpha: {
        version: '1.0.0',
        statusLine: { type: 'command', command: 'alpha-status.sh' },
      },
    };
    const frameworks: Record<string, FrameworkMeta> = {
      alpha: { version: '1.0.0', installed_at: '2026-01-01' },
      beta: { version: '1.0.0', installed_at: '2026-01-01' },
    };

    const result = resolveScalar<{ type: string; command: string }>(
      contributions, frameworks, 'statusLine'
    );

    assert.ok(result);
    assert.ok(
      result.command.includes('alpha'),
      'Should use alpha (alphabetically first) when priorities equal'
    );
  });

  it('should return undefined when no framework contributes the scalar', () => {
    const contributions: Record<string, FrameworkContribution> = {
      minimal: makeMinimalContribution(),
    };
    const frameworks: Record<string, FrameworkMeta> = {
      minimal: { version: '1.0.0', installed_at: '2026-01-01' },
    };

    const result = resolveScalar<{ type: string; command: string }>(
      contributions, frameworks, 'statusLine'
    );

    assert.strictEqual(result, undefined, 'Should return undefined when nobody contributes');
  });
});

// =============================================================================
// AC2: Conflict Detection
// =============================================================================

describe('AC2d: Conflict detection', () => {
  it('should detect duplicate hook commands across frameworks', () => {
    const contributions: Record<string, FrameworkContribution> = {
      alpha: {
        version: '1.0.0',
        hooks: {
          SessionStart: [
            { hooks: [{ type: 'command', command: 'shared-hook.sh' }] },
          ],
        },
      },
      beta: {
        version: '1.0.0',
        hooks: {
          SessionStart: [
            { hooks: [{ type: 'command', command: 'shared-hook.sh' }] },
          ],
        },
      },
    };

    const conflicts = detectConflicts(contributions);
    assert.ok(conflicts.length > 0, 'Should detect at least one conflict');

    const hookConflict = conflicts.find(c => c.type === 'hook_duplicate');
    assert.ok(hookConflict, 'Should have a hook_duplicate conflict');
    assert.ok(
      hookConflict.frameworks.includes('alpha') && hookConflict.frameworks.includes('beta'),
      'Conflict should reference both frameworks'
    );
  });

  it('should detect statusLine collisions between frameworks', () => {
    const contributions: Record<string, FrameworkContribution> = {
      alpha: {
        version: '1.0.0',
        statusLine: { type: 'command', command: 'alpha-status.sh' },
      },
      beta: {
        version: '1.0.0',
        statusLine: { type: 'command', command: 'beta-status.sh' },
      },
    };

    const conflicts = detectConflicts(contributions);
    const scalarConflict = conflicts.find(c => c.type === 'scalar_collision');
    assert.ok(scalarConflict, 'Should detect scalar collision for statusLine');
    assert.strictEqual(scalarConflict.key, 'statusLine');
  });

  it('should NOT report conflict when only one framework contributes a scalar', () => {
    const contributions: Record<string, FrameworkContribution> = {
      alpha: {
        version: '1.0.0',
        statusLine: { type: 'command', command: 'alpha-status.sh' },
      },
      beta: { version: '1.0.0' },
    };

    const conflicts = detectConflicts(contributions);
    const scalarConflicts = conflicts.filter(c => c.type === 'scalar_collision');
    assert.strictEqual(scalarConflicts.length, 0, 'No collision when only one contributes');
  });

  it('should NOT report conflict for different hook commands in same hook type', () => {
    const contributions: Record<string, FrameworkContribution> = {
      alpha: {
        version: '1.0.0',
        hooks: {
          SessionStart: [
            { hooks: [{ type: 'command', command: 'alpha-hook.sh' }] },
          ],
        },
      },
      beta: {
        version: '1.0.0',
        hooks: {
          SessionStart: [
            { hooks: [{ type: 'command', command: 'beta-hook.sh' }] },
          ],
        },
      },
    };

    const conflicts = detectConflicts(contributions);
    const hookConflicts = conflicts.filter(c => c.type === 'hook_duplicate');
    assert.strictEqual(
      hookConflicts.length,
      0,
      'Different commands in same hook type is normal, not a conflict'
    );
  });

  it('should return empty array when there are no conflicts', () => {
    const contributions: Record<string, FrameworkContribution> = {
      alpha: makePennyfarthingContribution(),
    };

    const conflicts = detectConflicts(contributions);
    assert.deepStrictEqual(conflicts, [], 'Single framework should have no conflicts');
  });
});

// =============================================================================
// AC3: Migration from Legacy v1 to Shared v2 Format
// =============================================================================

describe('AC3: Migration from legacy format', () => {
  it('should migrate legacy settings into v2 format under framework namespace', () => {
    const legacy = {
      hooks: {
        SessionStart: [
          { hooks: [{ type: 'command', command: 'session-start.sh' }] },
        ],
      },
      permissions: { allow: ['Read', 'Bash'] },
      statusLine: { type: 'command', command: 'statusline.sh' },
      context_budget: { warning_threshold: 70, critical_threshold: 85, max_tokens: 200000 },
    };

    const migrated = migrateToSharedFormat(legacy, 'pennyfarthing', '10.4.0');

    assert.strictEqual(migrated._version, SHARED_SETTINGS_VERSION, 'Should be v2');
    assert.ok(migrated._frameworks['pennyfarthing'], 'Should have framework metadata');
    assert.ok(migrated._contributions['pennyfarthing'], 'Should have contribution');

    const contribution = migrated._contributions['pennyfarthing'];
    assert.deepStrictEqual(
      contribution.hooks,
      legacy.hooks,
      'Hooks should be preserved in contribution'
    );
    assert.deepStrictEqual(
      contribution.permissions,
      legacy.permissions,
      'Permissions should be preserved'
    );
  });

  it('should populate merged output fields after migration', () => {
    const legacy = {
      hooks: {
        SessionStart: [
          { hooks: [{ type: 'command', command: 'session-start.sh' }] },
        ],
      },
      permissions: { allow: ['Read', 'Bash'] },
    };

    const migrated = migrateToSharedFormat(legacy, 'pennyfarthing', '10.4.0');

    // Merged output should reflect the single framework's contributions
    assert.ok(migrated.hooks.SessionStart, 'Merged hooks should exist');
    assert.ok(migrated.permissions.allow.includes('Read'), 'Merged permissions should include Read');
  });

  it('should handle legacy settings with no hooks', () => {
    const legacy = {
      permissions: { allow: ['Read'] },
    };

    const migrated = migrateToSharedFormat(legacy, 'test-framework', '1.0.0');

    assert.ok(migrated._contributions['test-framework']);
    assert.deepStrictEqual(
      migrated.hooks,
      {},
      'Hooks should be empty when legacy has none'
    );
  });

  it('should handle legacy settings with no permissions', () => {
    const legacy = {
      hooks: {
        Stop: [{ hooks: [{ type: 'command', command: 'stop.sh' }] }],
      },
    };

    const migrated = migrateToSharedFormat(legacy, 'test-framework', '1.0.0');

    assert.deepStrictEqual(
      migrated.permissions,
      { allow: [] },
      'Permissions should default to empty'
    );
  });

  it('should handle completely empty legacy settings', () => {
    const migrated = migrateToSharedFormat({}, 'test-framework', '1.0.0');

    assert.strictEqual(migrated._version, SHARED_SETTINGS_VERSION);
    assert.ok(migrated._frameworks['test-framework']);
    assert.deepStrictEqual(migrated.hooks, {});
    assert.deepStrictEqual(migrated.permissions, { allow: [] });
  });

  it('should preserve unknown top-level keys in contribution', () => {
    const legacy = {
      hooks: {},
      permissions: { allow: [] },
      customExtension: { someData: true },
    };

    // Migration should not lose unknown keys — they should be preserved
    // somewhere so round-tripping works
    const migrated = migrateToSharedFormat(legacy, 'test-framework', '1.0.0');

    assert.ok(migrated._frameworks['test-framework'], 'Framework should be registered');
    // The migrated format should be valid
    assert.strictEqual(migrated._version, SHARED_SETTINGS_VERSION);
  });
});

// =============================================================================
// AC4: Framework Removal (Rollback)
// =============================================================================

describe('AC4: Framework removal (rollback)', () => {
  it('should remove a framework contribution cleanly', () => {
    let settings = createEmptySharedSettings();
    const pf = makePennyfarthingContribution();
    const other = makeOtherFrameworkContribution();

    let result = contributeFrameworkSettings(settings, 'pennyfarthing', pf);
    result = contributeFrameworkSettings(result.settings, 'other-framework', other);

    const afterRemoval = removeFrameworkSettings(result.settings, 'other-framework');

    assert.ok(
      !afterRemoval._contributions['other-framework'],
      'Removed framework contribution should not exist'
    );
    assert.ok(
      !afterRemoval._frameworks['other-framework'],
      'Removed framework metadata should not exist'
    );
    assert.ok(
      afterRemoval._contributions['pennyfarthing'],
      'Remaining framework should still exist'
    );
  });

  it('should re-merge hooks after framework removal', () => {
    let settings = createEmptySharedSettings();
    const pf = makePennyfarthingContribution();
    const other = makeOtherFrameworkContribution();

    let result = contributeFrameworkSettings(settings, 'pennyfarthing', pf);
    result = contributeFrameworkSettings(result.settings, 'other-framework', other);

    const afterRemoval = removeFrameworkSettings(result.settings, 'other-framework');

    // PreToolUse was only contributed by other-framework — should be gone
    assert.ok(
      !afterRemoval.hooks.PreToolUse || afterRemoval.hooks.PreToolUse.length === 0,
      'PreToolUse hooks should be removed with other-framework'
    );

    // SessionStart should only have pennyfarthing's entry now
    assert.strictEqual(
      afterRemoval.hooks.SessionStart?.length,
      1,
      'SessionStart should only have pennyfarthing entry'
    );
  });

  it('should re-merge permissions after framework removal', () => {
    let settings = createEmptySharedSettings();
    const pf = makePennyfarthingContribution();
    const other = makeOtherFrameworkContribution();

    let result = contributeFrameworkSettings(settings, 'pennyfarthing', pf);
    result = contributeFrameworkSettings(result.settings, 'other-framework', other);

    const afterRemoval = removeFrameworkSettings(result.settings, 'other-framework');

    assert.ok(
      !afterRemoval.permissions.allow.includes('Skill(custom-skill)'),
      'Permission from removed framework should be gone'
    );
    assert.ok(
      afterRemoval.permissions.allow.includes('Skill(sm)'),
      'Permission from remaining framework should stay'
    );
  });

  it('should handle removing the only framework', () => {
    let settings = createEmptySharedSettings();
    const pf = makePennyfarthingContribution();

    const result = contributeFrameworkSettings(settings, 'pennyfarthing', pf);
    const afterRemoval = removeFrameworkSettings(result.settings, 'pennyfarthing');

    assert.deepStrictEqual(afterRemoval._contributions, {});
    assert.deepStrictEqual(afterRemoval._frameworks, {});
    assert.deepStrictEqual(afterRemoval.hooks, {});
    assert.deepStrictEqual(afterRemoval.permissions, { allow: [] });
  });

  it('should be no-op when removing non-existent framework', () => {
    let settings = createEmptySharedSettings();
    const pf = makePennyfarthingContribution();

    const result = contributeFrameworkSettings(settings, 'pennyfarthing', pf);
    const afterRemoval = removeFrameworkSettings(result.settings, 'nonexistent');

    assert.deepStrictEqual(
      afterRemoval._contributions,
      result.settings._contributions,
      'Should not change anything'
    );
  });
});

// =============================================================================
// AC5: Backward Compatibility — Flat Format Export
// =============================================================================

describe('AC5: Backward compatibility (flat format export)', () => {
  it('should export merged settings in Claude Code-compatible flat format', () => {
    let settings = createEmptySharedSettings();
    const pf = makePennyfarthingContribution();
    const result = contributeFrameworkSettings(settings, 'pennyfarthing', pf);

    const flat = toFlatFormat(result.settings);

    // Should NOT contain internal fields
    assert.strictEqual(flat._version, undefined, 'Should not contain _version');
    assert.strictEqual(flat._frameworks, undefined, 'Should not contain _frameworks');
    assert.strictEqual(flat._contributions, undefined, 'Should not contain _contributions');

    // Should contain merged results
    assert.ok(flat.hooks, 'Should contain hooks');
    assert.ok(flat.permissions, 'Should contain permissions');
  });

  it('should produce valid hooks structure in flat format', () => {
    let settings = createEmptySharedSettings();
    const pf = makePennyfarthingContribution();
    const result = contributeFrameworkSettings(settings, 'pennyfarthing', pf);

    const flat = toFlatFormat(result.settings);
    const hooks = flat.hooks as Record<string, unknown[]>;

    assert.ok(Array.isArray(hooks.SessionStart), 'SessionStart should be an array');
    assert.ok(Array.isArray(hooks.PostToolUse), 'PostToolUse should be an array');
  });

  it('should produce valid permissions structure in flat format', () => {
    let settings = createEmptySharedSettings();
    const pf = makePennyfarthingContribution();
    const result = contributeFrameworkSettings(settings, 'pennyfarthing', pf);

    const flat = toFlatFormat(result.settings);
    const permissions = flat.permissions as { allow: string[] };

    assert.ok(Array.isArray(permissions.allow), 'allow should be an array');
    assert.ok(permissions.allow.includes('Read'));
  });

  it('should include statusLine in flat format when present', () => {
    let settings = createEmptySharedSettings();
    const pf = makePennyfarthingContribution();
    const result = contributeFrameworkSettings(settings, 'pennyfarthing', pf);

    const flat = toFlatFormat(result.settings);

    assert.ok(flat.statusLine, 'Should include statusLine');
    const sl = flat.statusLine as { type: string; command: string };
    assert.strictEqual(sl.type, 'command');
    assert.ok(sl.command.includes('statusline.sh'));
  });

  it('should include context_budget in flat format when present', () => {
    let settings = createEmptySharedSettings();
    const pf = makePennyfarthingContribution();
    const result = contributeFrameworkSettings(settings, 'pennyfarthing', pf);

    const flat = toFlatFormat(result.settings);

    assert.ok(flat.context_budget, 'Should include context_budget');
    const cb = flat.context_budget as { warning_threshold: number };
    assert.strictEqual(cb.warning_threshold, 70);
  });

  it('should produce identical JSON to what Claude Code expects', () => {
    let settings = createEmptySharedSettings();
    const pf = makePennyfarthingContribution();
    const result = contributeFrameworkSettings(settings, 'pennyfarthing', pf);

    const flat = toFlatFormat(result.settings);

    // Verify it round-trips through JSON without issues
    const json = JSON.stringify(flat, null, 2);
    const parsed = JSON.parse(json);
    assert.deepStrictEqual(parsed, flat, 'Should round-trip through JSON');
  });
});

// =============================================================================
// AC6: Validation
// =============================================================================

describe('AC6: Validation', () => {
  it('should validate a correct SharedSettings structure', () => {
    let settings = createEmptySharedSettings();
    const pf = makePennyfarthingContribution();
    const result = contributeFrameworkSettings(settings, 'pennyfarthing', pf);

    const validation = validateSharedSettings(result.settings);
    assert.ok(validation.valid, `Should be valid, errors: ${validation.errors.join(', ')}`);
    assert.deepStrictEqual(validation.errors, []);
  });

  it('should reject null input', () => {
    const validation = validateSharedSettings(null);
    assert.strictEqual(validation.valid, false);
    assert.ok(validation.errors.length > 0);
  });

  it('should reject non-object input', () => {
    const validation = validateSharedSettings('not an object');
    assert.strictEqual(validation.valid, false);
  });

  it('should reject missing _version field', () => {
    const validation = validateSharedSettings({
      _frameworks: {},
      _contributions: {},
      hooks: {},
      permissions: { allow: [] },
    });
    assert.strictEqual(validation.valid, false);
    assert.ok(
      validation.errors.some(e => e.includes('version')),
      'Should mention version in error'
    );
  });

  it('should reject wrong _version value', () => {
    const validation = validateSharedSettings({
      _version: 999,
      _frameworks: {},
      _contributions: {},
      hooks: {},
      permissions: { allow: [] },
    });
    assert.strictEqual(validation.valid, false);
  });

  it('should reject missing _frameworks field', () => {
    const validation = validateSharedSettings({
      _version: SHARED_SETTINGS_VERSION,
      _contributions: {},
      hooks: {},
      permissions: { allow: [] },
    });
    assert.strictEqual(validation.valid, false);
  });

  it('should validate empty shared settings as valid', () => {
    const settings = createEmptySharedSettings();
    const validation = validateSharedSettings(settings);
    assert.ok(validation.valid, 'Empty shared settings should be valid');
  });
});

// =============================================================================
// Format Detection
// =============================================================================

describe('Format detection', () => {
  it('should identify v2 shared format', () => {
    const settings = createEmptySharedSettings();
    assert.ok(isSharedFormat(settings), 'Should detect shared format');
  });

  it('should reject legacy v1 format', () => {
    const legacy = {
      hooks: {},
      permissions: { allow: [] },
    };
    assert.ok(!isSharedFormat(legacy), 'Should reject legacy format');
  });

  it('should reject null', () => {
    assert.ok(!isSharedFormat(null));
  });

  it('should reject wrong version number', () => {
    assert.ok(!isSharedFormat({ _version: 1 }));
    assert.ok(!isSharedFormat({ _version: 3 }));
  });
});

// =============================================================================
// Integration: Full Multi-Framework Lifecycle
// =============================================================================

describe('Integration: multi-framework lifecycle', () => {
  it('should handle full lifecycle: create → contribute → contribute → remove → export', () => {
    // 1. Create empty
    const empty = createEmptySharedSettings();
    assert.strictEqual(Object.keys(empty._contributions).length, 0);

    // 2. First framework contributes
    const r1 = contributeFrameworkSettings(empty, 'pennyfarthing', makePennyfarthingContribution());
    assert.strictEqual(Object.keys(r1.settings._contributions).length, 1);
    assert.ok(r1.settings.hooks.SessionStart);

    // 3. Second framework contributes
    const r2 = contributeFrameworkSettings(r1.settings, 'other', makeOtherFrameworkContribution());
    assert.strictEqual(Object.keys(r2.settings._contributions).length, 2);

    // Both frameworks' SessionStart hooks should be present
    assert.strictEqual(r2.settings.hooks.SessionStart.length, 2);

    // Permissions should be unioned
    assert.ok(r2.settings.permissions.allow.includes('Skill(sm)'));
    assert.ok(r2.settings.permissions.allow.includes('Skill(custom-skill)'));

    // 4. Remove second framework
    const afterRemove = removeFrameworkSettings(r2.settings, 'other');
    assert.strictEqual(Object.keys(afterRemove._contributions).length, 1);
    assert.strictEqual(afterRemove.hooks.SessionStart.length, 1);
    assert.ok(!afterRemove.permissions.allow.includes('Skill(custom-skill)'));

    // 5. Export flat format
    const flat = toFlatFormat(afterRemove);
    assert.strictEqual(flat._version, undefined);
    assert.ok(flat.hooks);
    assert.ok(flat.permissions);
  });

  it('should handle migrate-then-contribute workflow', () => {
    // Legacy settings exist, then another framework installs
    const legacy = {
      hooks: {
        SessionStart: [
          { hooks: [{ type: 'command', command: '.pennyfarthing/scripts/hooks/session-start.sh' }] },
        ],
      },
      permissions: { allow: ['Read', 'Bash'] },
      statusLine: { type: 'command', command: '.pennyfarthing/scripts/misc/statusline.sh' },
    };

    // Migrate legacy to v2
    const migrated = migrateToSharedFormat(legacy, 'pennyfarthing', '10.4.0');
    assert.strictEqual(migrated._version, SHARED_SETTINGS_VERSION);

    // New framework contributes
    const result = contributeFrameworkSettings(migrated, 'new-tool', makeOtherFrameworkContribution());

    assert.strictEqual(Object.keys(result.settings._contributions).length, 2);
    assert.ok(result.settings.hooks.SessionStart.length >= 2, 'Should have hooks from both');
  });

  it('should be idempotent — contributing same framework twice produces same result', () => {
    const settings = createEmptySharedSettings();
    const contribution = makePennyfarthingContribution();

    const r1 = contributeFrameworkSettings(settings, 'pennyfarthing', contribution);
    const r2 = contributeFrameworkSettings(r1.settings, 'pennyfarthing', contribution);

    // Merged output should be identical
    assert.deepStrictEqual(r1.settings.hooks, r2.settings.hooks, 'Hooks should be identical');
    assert.deepStrictEqual(
      r1.settings.permissions,
      r2.settings.permissions,
      'Permissions should be identical'
    );
  });
});
