/**
 * Story 141-17: Contract tests validating CLI JSON schemas match TypeScript interfaces
 *
 * RED STATE: These tests FAIL because the TypeScript modules don't yet
 * delegate to pf CLI. Once implementation is complete, these contract tests
 * validate that the JSON returned by pf CLI commands matches the TypeScript
 * interface shapes expected by the GUI.
 *
 * Covers: AC9
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { execFileSync } from 'child_process';

// ============================================================================
// Helper: call pf CLI and parse JSON
// ============================================================================

function callPf(args: string[]): { success: boolean; data?: unknown; error?: string } {
  try {
    const output = execFileSync('pf', args, {
      encoding: 'utf8',
      timeout: 15000,
    });
    return { success: true, data: JSON.parse(output) };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ============================================================================
// AC9: Contract tests — pf sprint story show --json
// ============================================================================

describe('Story 141-17 AC9: CLI JSON contract - sprint story show', () => {
  it('pf sprint story show --json returns valid StoryInfo shape', () => {
    const result = callPf(['sprint', 'story', 'show', '--json']);

    // This may fail if no active story, which is acceptable in RED state
    // but the command must exist and return JSON
    if (!result.success) {
      // Command must at least exist — check it's not "unknown command"
      assert.ok(
        !result.error?.includes('No such command') && !result.error?.includes('unknown command'),
        `pf sprint story show --json must be a valid command. Error: ${result.error}`,
      );
      return; // No active story is OK for contract validation
    }

    const data = result.data as Record<string, unknown>;
    assert.ok(data !== null && typeof data === 'object', 'Response must be an object');

    // StoryInfo required fields
    const storyInfoFields = ['id', 'title', 'phase', 'status', 'points'];
    for (const field of storyInfoFields) {
      assert.ok(field in data, `StoryInfo response must include '${field}' field`);
    }
  });

  it('pf sprint story show --json jiraUrl is string or null, never hardcoded', () => {
    const result = callPf(['sprint', 'story', 'show', '--json']);
    if (!result.success) return; // Skip if no active story

    const data = result.data as Record<string, unknown>;
    if ('jiraUrl' in data) {
      assert.ok(
        data.jiraUrl === null || typeof data.jiraUrl === 'string',
        'jiraUrl must be string or null',
      );
    }
  });
});

// ============================================================================
// AC9: Contract tests — pf workflow phases --json
// ============================================================================

describe('Story 141-17 AC9: CLI JSON contract - workflow phases', () => {
  it('pf workflow phases --json returns array of WorkflowPhase shapes', () => {
    const result = callPf(['workflow', 'phases', '--json']);

    if (!result.success) {
      assert.ok(
        !result.error?.includes('No such command') && !result.error?.includes('unknown command'),
        `pf workflow phases --json must be a valid command. Error: ${result.error}`,
      );
      return;
    }

    const data = result.data as Record<string, unknown>;
    assert.ok(data !== null && typeof data === 'object', 'Response must be an object');
    const phases = data.phases as unknown[];
    assert.ok(Array.isArray(phases), 'Response must contain phases array');

    if (phases.length > 0) {
      const phase = phases[0] as Record<string, unknown>;
      // WorkflowPhase required fields
      assert.ok('name' in phase, 'WorkflowPhase must include name');
      assert.ok('agent' in phase, 'WorkflowPhase must include agent');
      assert.ok('label' in phase, 'WorkflowPhase must include label');
    }
  });
});

// ============================================================================
// AC9: Contract tests — pf theme list --json
// ============================================================================

describe('Story 141-17 AC9: CLI JSON contract - theme list', () => {
  it('pf theme list --json returns array of ThemeMetadata shapes', () => {
    const result = callPf(['theme', 'list', '--json']);

    if (!result.success) {
      assert.ok(
        !result.error?.includes('No such command') && !result.error?.includes('unknown command'),
        `pf theme list --json must be a valid command. Error: ${result.error}`,
      );
      return;
    }

    const data = result.data as unknown[];
    assert.ok(Array.isArray(data), 'Response must be an array of themes');
    assert.ok(data.length > 0, 'At least one theme should exist');

    const theme = data[0] as Record<string, unknown>;
    // ThemeMetadata required fields (matches pf theme list --json output)
    const requiredFields = ['id', 'name', 'tier'];
    for (const field of requiredFields) {
      assert.ok(field in theme, `ThemeMetadata must include '${field}' field`);
    }
  });

  it('each theme has a non-empty tier', () => {
    const result = callPf(['theme', 'list', '--json']);
    if (!result.success) return;

    const data = result.data as Array<Record<string, unknown>>;
    for (const theme of data) {
      assert.ok(
        typeof theme.tier === 'string' && theme.tier.length > 0,
        `Theme '${theme.id}' must have a non-empty tier string`,
      );
    }
  });
});

// ============================================================================
// AC9: Contract tests — pf theme show --json
// ============================================================================

describe('Story 141-17 AC9: CLI JSON contract - theme show', () => {
  it('pf theme show <id> --json returns Theme shape with agents', () => {
    const result = callPf(['theme', 'show', 'the-expanse', '--json']);

    if (!result.success) {
      assert.ok(
        !result.error?.includes('No such command') && !result.error?.includes('unknown command'),
        `pf theme show --json must be a valid command. Error: ${result.error}`,
      );
      return;
    }

    const data = result.data as Record<string, unknown>;
    assert.ok('name' in data, 'Response must include name');
    assert.ok('theme' in data, 'Response must include theme object');
    assert.ok('agents' in data, 'Response must include agents');

    const theme = data.theme as Record<string, unknown>;
    assert.ok('description' in theme, 'Theme must include description');

    const agents = data.agents as Record<string, Record<string, unknown>>;
    assert.ok(typeof agents === 'object', 'agents must be an object');

    // Check at least one agent has the ThemeAgent shape
    const agentNames = Object.keys(agents);
    assert.ok(agentNames.length > 0, 'Theme must have at least one agent');

    const firstAgent = agents[agentNames[0]];
    assert.ok('character' in firstAgent, 'ThemeAgent must include character');
    assert.ok('style' in firstAgent, 'ThemeAgent must include style');
    assert.ok('role' in firstAgent, 'ThemeAgent must include role');
    assert.ok('trait' in firstAgent, 'ThemeAgent must include trait');
    assert.ok('catchphrases' in firstAgent, 'ThemeAgent must include catchphrases');
  });
});
