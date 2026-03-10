/**
 * Story 141-17: story-parser subprocess delegation tests
 *
 * RED STATE: These tests FAIL because story-parser.ts still uses direct file
 * parsing (readFileSync, parseYaml, regex). After implementation, these modules
 * will delegate to `pf` CLI subprocess calls.
 *
 * Covers: AC1, AC2, AC3
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';

// ============================================================================
// AC1: Both core and cyclist story-parser.ts replaced with pf CLI subprocess calls
// ============================================================================

describe('Story 141-17 AC1: story-parser subprocess delegation', () => {
  describe('getStoryInfo delegates to pf CLI', () => {
    it('calls execFileSync with pf sprint story show --json', async () => {
      // After refactor, getStoryInfo should call:
      //   execFileSync('pf', ['sprint', 'story', 'show', '--json'], { cwd: projectDir })
      // and parse the JSON response into StoryInfo
      const storyParserSource = readFileSync(
        new URL('./story-parser.ts', import.meta.url).pathname.replace('/dist/', '/src/'),
        'utf8',
      );

      // Implementation must use execFileSync (subprocess), not readFileSync (direct parsing)
      assert.ok(
        storyParserSource.includes('execFileSync') || storyParserSource.includes('child_process'),
        'story-parser.ts must use child_process.execFileSync for pf CLI calls',
      );
    });

    it('does not import readFileSync for session/sprint parsing', async () => {
      const storyParserSource = readFileSync(
        new URL('./story-parser.ts', import.meta.url).pathname.replace('/dist/', '/src/'),
        'utf8',
      );

      // After refactor, story-parser should NOT use readFileSync for session or sprint data
      // (readFileSync may still be imported for other purposes, but direct YAML/session parsing must go)
      const hasDirectParsing =
        storyParserSource.includes('readFileSync') && storyParserSource.includes('parseYaml');
      assert.ok(
        !hasDirectParsing,
        'story-parser.ts must NOT use readFileSync + parseYaml for direct session/sprint file parsing',
      );
    });
  });

  describe('parseWorkflowPhases delegates to pf CLI', () => {
    it('calls pf workflow phases --json instead of reading YAML directly', async () => {
      const storyParserSource = readFileSync(
        new URL('./story-parser.ts', import.meta.url).pathname.replace('/dist/', '/src/'),
        'utf8',
      );

      // getWorkflowPhases should delegate to `pf workflow phases --json`
      // not read workflow YAML files directly
      const hasWorkflowFileParsing =
        storyParserSource.includes('readdirSync') && storyParserSource.includes('workflows');
      assert.ok(
        !hasWorkflowFileParsing,
        'story-parser.ts must NOT read workflow YAML files directly via readdirSync',
      );
    });
  });

  describe('cyclist story-parser.ts is deleted', () => {
    it('packages/cyclist/src/story-parser.ts should not exist', async () => {
      const { existsSync } = await import('fs');
      const cyclistStoryParser = new URL(
        '../../../../packages/cyclist/src/story-parser.ts',
        import.meta.url,
      ).pathname.replace('/dist/', '/src/');

      assert.ok(
        !existsSync(cyclistStoryParser),
        'packages/cyclist/src/story-parser.ts should be deleted (duplicate of core)',
      );
    });
  });

  describe('result objects returned, not thrown', () => {
    it('exported functions return {success, data?, error?} pattern', async () => {
      const storyParserSource = readFileSync(
        new URL('./story-parser.ts', import.meta.url).pathname.replace('/dist/', '/src/'),
        'utf8',
      );

      // After refactor, subprocess wrapper should use callPf which returns result objects
      assert.ok(
        storyParserSource.includes('success') && storyParserSource.includes('callPf'),
        'story-parser.ts should return result objects with success field via callPf',
      );
    });
  });
});

// ============================================================================
// AC2: No direct sprint YAML or session file parsing in TypeScript
// ============================================================================

describe('Story 141-17 AC2: No direct sprint/session file parsing', () => {
  it('no readFileSync calls for .yaml files in story-parser', async () => {
    const storyParserSource = readFileSync(
      new URL('./story-parser.ts', import.meta.url).pathname.replace('/dist/', '/src/'),
      'utf8',
    );

    // Match patterns like: readFileSync(path, 'utf8') where path involves .yaml or session
    const hasYamlReads = /readFileSync\s*\([^)]*\.(yaml|yml)/i.test(storyParserSource);
    assert.ok(!hasYamlReads, 'story-parser.ts must not read YAML files via readFileSync');
  });

  it('no regex-based session file format parsing', async () => {
    const storyParserSource = readFileSync(
      new URL('./story-parser.ts', import.meta.url).pathname.replace('/dist/', '/src/'),
      'utf8',
    );

    // The 13 regex patterns for session file parsing should be gone
    // Count regex patterns that match session file format markers
    const sessionRegexPatterns = (storyParserSource.match(/\*\*[A-Z][a-z]+:\*\*/g) || []).length;
    assert.ok(
      sessionRegexPatterns < 3,
      `story-parser.ts should not have session field regex patterns (found ${sessionRegexPatterns}, expected < 3)`,
    );
  });

  it('parseYaml import removed or unused for sprint data', async () => {
    const storyParserSource = readFileSync(
      new URL('./story-parser.ts', import.meta.url).pathname.replace('/dist/', '/src/'),
      'utf8',
    );

    const hasParseYaml = storyParserSource.includes("from 'yaml'") || storyParserSource.includes('parseYaml');
    assert.ok(!hasParseYaml, 'story-parser.ts should not import or use parseYaml');
  });

  it('statSync not used for file discovery', async () => {
    const storyParserSource = readFileSync(
      new URL('./story-parser.ts', import.meta.url).pathname.replace('/dist/', '/src/'),
      'utf8',
    );

    assert.ok(!storyParserSource.includes('statSync'), 'story-parser.ts should not use statSync');
  });
});

// ============================================================================
// AC3: Jira URL comes from config, not hardcoded
// ============================================================================

describe('Story 141-17 AC3: Jira URL from config', () => {
  it('JIRA_BASE_URL constant is removed', async () => {
    const storyParserSource = readFileSync(
      new URL('./story-parser.ts', import.meta.url).pathname.replace('/dist/', '/src/'),
      'utf8',
    );

    assert.ok(
      !storyParserSource.includes('JIRA_BASE_URL'),
      'story-parser.ts must not contain hardcoded JIRA_BASE_URL constant',
    );
  });

  it('no hardcoded atlassian.net URL', async () => {
    const storyParserSource = readFileSync(
      new URL('./story-parser.ts', import.meta.url).pathname.replace('/dist/', '/src/'),
      'utf8',
    );

    assert.ok(
      !storyParserSource.includes('atlassian.net'),
      'story-parser.ts must not contain hardcoded atlassian.net URL',
    );
  });

  it('generateJiraUrl function is removed', async () => {
    const storyParserSource = readFileSync(
      new URL('./story-parser.ts', import.meta.url).pathname.replace('/dist/', '/src/'),
      'utf8',
    );

    assert.ok(
      !storyParserSource.includes('generateJiraUrl'),
      'story-parser.ts must not contain generateJiraUrl function (Jira URL from CLI payload)',
    );
  });
});
