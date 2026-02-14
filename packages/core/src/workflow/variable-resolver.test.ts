/**
 * Tests for Story MSSCI-12081: Variable resolver with priority chain
 *
 * These tests define the contract for resolving {variable} placeholders
 * in step file content from multiple sources with priority ordering.
 *
 * Expected interface:
 * - resolveVariables(content: string, sources: VariableSource[]): ResolveResult
 * - resolveStepVariables(stepContent: string, options?): ResolveResult
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

// Import will fail until implementation exists - this confirms RED state
import {
  resolveVariables,
  resolveStepVariables,
  type VariableSource,
} from './variable-resolver.js';

describe('Variable Resolver (MSSCI-12081)', () => {

  describe('AC1: Resolves variables from workflow YAML', () => {

    it('should resolve a single variable from source', () => {
      const content = 'Write output to {output_file}.';
      const sources: VariableSource[] = [
        { name: 'workflow', priority: 1, values: { output_file: 'results.md' } }
      ];

      const result = resolveVariables(content, sources);

      assert.strictEqual(result.content, 'Write output to results.md.');
      assert.deepStrictEqual(result.resolved, ['output_file']);
      assert.deepStrictEqual(result.unresolved, []);
      assert.strictEqual(result.sources['output_file'], 'workflow');
    });

    it('should resolve multiple variables in one string', () => {
      const content = 'Project: {project_name} | Version: {version}';
      const sources: VariableSource[] = [
        { name: 'workflow', priority: 1, values: { project_name: 'pennyfarthing', version: '7.0.2' } }
      ];

      const result = resolveVariables(content, sources);

      assert.strictEqual(result.content, 'Project: pennyfarthing | Version: 7.0.2');
      assert.ok(result.resolved.includes('project_name'));
      assert.ok(result.resolved.includes('version'));
      assert.strictEqual(result.resolved.length, 2);
    });

    it('should resolve same variable appearing multiple times', () => {
      const content = '{name} is here. Hello, {name}!';
      const sources: VariableSource[] = [
        { name: 'workflow', priority: 1, values: { name: 'Sam' } }
      ];

      const result = resolveVariables(content, sources);

      assert.strictEqual(result.content, 'Sam is here. Hello, Sam!');
      // resolved should list variable once, not twice
      assert.deepStrictEqual(result.resolved, ['name']);
    });

    it('should handle content with no variables', () => {
      const content = 'This content has no variables at all.';
      const sources: VariableSource[] = [
        { name: 'workflow', priority: 1, values: { unused: 'value' } }
      ];

      const result = resolveVariables(content, sources);

      assert.strictEqual(result.content, content);
      assert.deepStrictEqual(result.resolved, []);
      assert.deepStrictEqual(result.unresolved, []);
    });

    it('should handle empty sources array', () => {
      const content = 'Value: {some_var}';
      const sources: VariableSource[] = [];

      const result = resolveVariables(content, sources);

      assert.strictEqual(result.content, 'Value: {some_var}');
      assert.deepStrictEqual(result.resolved, []);
      assert.deepStrictEqual(result.unresolved, ['some_var']);
    });

  });

  describe('AC2: Falls back through priority chain', () => {

    it('should resolve from highest priority source first', () => {
      const content = 'Theme: {theme}';
      const sources: VariableSource[] = [
        { name: 'workflow', priority: 1, values: { theme: 'west-wing' } },
        { name: 'session', priority: 2, values: { theme: 'star-trek' } },
        { name: 'config', priority: 3, values: { theme: 'discworld' } },
      ];

      const result = resolveVariables(content, sources);

      assert.strictEqual(result.content, 'Theme: west-wing');
      assert.strictEqual(result.sources['theme'], 'workflow');
    });

    it('should fall back to lower priority when higher priority lacks variable', () => {
      const content = 'Project: {project_root}';
      const sources: VariableSource[] = [
        { name: 'workflow', priority: 1, values: {} },
        { name: 'session', priority: 2, values: {} },
        { name: 'environment', priority: 4, values: { project_root: '/Users/keithavery/Projects/pennyfarthing' } },
      ];

      const result = resolveVariables(content, sources);

      assert.strictEqual(result.content, 'Project: /Users/keithavery/Projects/pennyfarthing');
      assert.strictEqual(result.sources['project_root'], 'environment');
    });

    it('should resolve different variables from different sources', () => {
      const content = '{story_id} in {project_root} with {theme}';
      const sources: VariableSource[] = [
        { name: 'workflow', priority: 1, values: { theme: 'west-wing' } },
        { name: 'session', priority: 2, values: { story_id: 'MSSCI-12081' } },
        { name: 'environment', priority: 4, values: { project_root: '/home/user/project' } },
      ];

      const result = resolveVariables(content, sources);

      assert.strictEqual(result.content, 'MSSCI-12081 in /home/user/project with west-wing');
      assert.strictEqual(result.sources['theme'], 'workflow');
      assert.strictEqual(result.sources['story_id'], 'session');
      assert.strictEqual(result.sources['project_root'], 'environment');
    });

    it('should respect priority ordering regardless of array order', () => {
      const content = 'Value: {key}';
      // Sources provided out of priority order
      const sources: VariableSource[] = [
        { name: 'config', priority: 3, values: { key: 'from-config' } },
        { name: 'workflow', priority: 1, values: { key: 'from-workflow' } },
        { name: 'defaults', priority: 5, values: { key: 'from-defaults' } },
        { name: 'session', priority: 2, values: { key: 'from-session' } },
      ];

      const result = resolveVariables(content, sources);

      assert.strictEqual(result.content, 'Value: from-workflow');
      assert.strictEqual(result.sources['key'], 'workflow');
    });

    it('should handle sources with same priority (first wins)', () => {
      const content = 'Value: {var}';
      const sources: VariableSource[] = [
        { name: 'source-a', priority: 1, values: { var: 'a-value' } },
        { name: 'source-b', priority: 1, values: { var: 'b-value' } },
      ];

      const result = resolveVariables(content, sources);

      // First source with matching priority wins
      assert.strictEqual(result.content, 'Value: a-value');
      assert.strictEqual(result.sources['var'], 'source-a');
    });

  });

  describe('AC3: Standard variables documented and working', () => {

    it('should resolve project_root from environment source', () => {
      const content = 'Root: {project_root}';
      const sources: VariableSource[] = [
        { name: 'environment', priority: 4, values: { project_root: '/abs/path/to/project' } },
      ];

      const result = resolveVariables(content, sources);

      assert.strictEqual(result.content, 'Root: /abs/path/to/project');
    });

    it('should resolve date variable with YYYY-MM-DD format', () => {
      const content = 'Today: {date}';
      const sources: VariableSource[] = [
        { name: 'system', priority: 4, values: { date: '2026-01-20' } },
      ];

      const result = resolveVariables(content, sources);

      assert.strictEqual(result.content, 'Today: 2026-01-20');
      // Verify date format matches pattern
      assert.match(result.content, /\d{4}-\d{2}-\d{2}/);
    });

    it('should resolve story_id from session source', () => {
      const content = 'Working on {story_id}';
      const sources: VariableSource[] = [
        { name: 'session', priority: 2, values: { story_id: 'MSSCI-12081' } },
      ];

      const result = resolveVariables(content, sources);

      assert.strictEqual(result.content, 'Working on MSSCI-12081');
    });

    it('should resolve output_file from workflow source', () => {
      const content = 'Write to {output_file}';
      const sources: VariableSource[] = [
        { name: 'workflow', priority: 1, values: { output_file: 'analysis-output.md' } },
      ];

      const result = resolveVariables(content, sources);

      assert.strictEqual(result.content, 'Write to analysis-output.md');
    });

    it('should resolve planning_artifacts from defaults', () => {
      const content = 'Artifacts in {planning_artifacts}';
      const sources: VariableSource[] = [
        { name: 'defaults', priority: 5, values: { planning_artifacts: 'planning-artifacts/' } },
      ];

      const result = resolveVariables(content, sources);

      assert.strictEqual(result.content, 'Artifacts in planning-artifacts/');
    });

    it('should resolve all standard variables together', () => {
      const content = `# Analysis for {story_id}

Project: {project_root}
Date: {date}
Output: {output_file}
Artifacts: {planning_artifacts}
`;

      const sources: VariableSource[] = [
        { name: 'workflow', priority: 1, values: { output_file: 'report.md' } },
        { name: 'session', priority: 2, values: { story_id: 'MSSCI-12081' } },
        { name: 'environment', priority: 4, values: {
          project_root: '/Users/keithavery/Projects/pennyfarthing',
          date: '2026-01-20'
        }},
        { name: 'defaults', priority: 5, values: { planning_artifacts: 'planning-artifacts/' } },
      ];

      const result = resolveVariables(content, sources);

      assert.ok(result.content.includes('MSSCI-12081'));
      assert.ok(result.content.includes('/Users/keithavery/Projects/pennyfarthing'));
      assert.ok(result.content.includes('2026-01-20'));
      assert.ok(result.content.includes('report.md'));
      assert.ok(result.content.includes('planning-artifacts/'));
      assert.strictEqual(result.resolved.length, 5);
    });

  });

  describe('AC4: Unresolved variables flagged with warning', () => {

    it('should leave unresolved variable as-is in content', () => {
      const content = 'Value: {missing_var}';
      const sources: VariableSource[] = [
        { name: 'workflow', priority: 1, values: { other_var: 'something' } },
      ];

      const result = resolveVariables(content, sources);

      assert.strictEqual(result.content, 'Value: {missing_var}');
    });

    it('should track unresolved variables in result', () => {
      const content = '{found} and {not_found} and {also_missing}';
      const sources: VariableSource[] = [
        { name: 'workflow', priority: 1, values: { found: 'yes' } },
      ];

      const result = resolveVariables(content, sources);

      assert.strictEqual(result.content, 'yes and {not_found} and {also_missing}');
      assert.deepStrictEqual(result.resolved, ['found']);
      assert.ok(result.unresolved.includes('not_found'));
      assert.ok(result.unresolved.includes('also_missing'));
      assert.strictEqual(result.unresolved.length, 2);
    });

    it('should not include unresolved variables in sources map', () => {
      const content = '{resolved_var} {unresolved_var}';
      const sources: VariableSource[] = [
        { name: 'workflow', priority: 1, values: { resolved_var: 'value' } },
      ];

      const result = resolveVariables(content, sources);

      assert.ok('resolved_var' in result.sources);
      assert.ok(!('unresolved_var' in result.sources));
    });

    it('should list each unresolved variable only once', () => {
      const content = '{missing} appears twice: {missing}';
      const sources: VariableSource[] = [];

      const result = resolveVariables(content, sources);

      assert.strictEqual(result.content, '{missing} appears twice: {missing}');
      assert.deepStrictEqual(result.unresolved, ['missing']);
    });

  });

  describe('Edge Cases', () => {

    it('should match valid variable names only (letters, numbers, underscores)', () => {
      const content = '{valid_name} {valid123} {_underscore_start}';
      const sources: VariableSource[] = [
        { name: 'test', priority: 1, values: {
          valid_name: 'a',
          valid123: 'b',
          _underscore_start: 'c'
        }},
      ];

      const result = resolveVariables(content, sources);

      assert.strictEqual(result.content, 'a b c');
    });

    it('should not match variables starting with numbers', () => {
      const content = '{123invalid} {9lives}';
      const sources: VariableSource[] = [
        { name: 'test', priority: 1, values: { '123invalid': 'no', '9lives': 'no' }},
      ];

      const result = resolveVariables(content, sources);

      // Should remain unchanged (invalid variable syntax)
      assert.strictEqual(result.content, '{123invalid} {9lives}');
      assert.deepStrictEqual(result.resolved, []);
      // These aren't variables, so they shouldn't be in unresolved either
      assert.deepStrictEqual(result.unresolved, []);
    });

    it('should not match nested variables', () => {
      const content = '{outer_{inner}}';
      const sources: VariableSource[] = [
        { name: 'test', priority: 1, values: { outer_inner: 'nested', inner: 'value' }},
      ];

      const result = resolveVariables(content, sources);

      // Nested syntax is not supported - should not parse as a variable
      assert.strictEqual(result.content, '{outer_{inner}}');
    });

    it('should handle empty string value as valid resolution', () => {
      const content = 'Value: [{empty_value}]';
      const sources: VariableSource[] = [
        { name: 'test', priority: 1, values: { empty_value: '' }},
      ];

      const result = resolveVariables(content, sources);

      assert.strictEqual(result.content, 'Value: []');
      assert.deepStrictEqual(result.resolved, ['empty_value']);
      assert.deepStrictEqual(result.unresolved, []);
    });

    it('should treat null value as unresolved', () => {
      const content = 'Value: {null_value}';
      const sources: VariableSource[] = [
        { name: 'test', priority: 1, values: { null_value: null as unknown as string }},
      ];

      const result = resolveVariables(content, sources);

      assert.strictEqual(result.content, 'Value: {null_value}');
      assert.deepStrictEqual(result.unresolved, ['null_value']);
    });

    it('should treat undefined value as unresolved', () => {
      const content = 'Value: {undefined_value}';
      const sources: VariableSource[] = [
        { name: 'test', priority: 1, values: { undefined_value: undefined as unknown as string }},
      ];

      const result = resolveVariables(content, sources);

      assert.strictEqual(result.content, 'Value: {undefined_value}');
      assert.deepStrictEqual(result.unresolved, ['undefined_value']);
    });

    it('should convert number values to strings', () => {
      const content = 'Count: {count} | Points: {points}';
      const sources: VariableSource[] = [
        { name: 'test', priority: 1, values: {
          count: 42 as unknown as string,
          points: 3.14 as unknown as string
        }},
      ];

      const result = resolveVariables(content, sources);

      assert.strictEqual(result.content, 'Count: 42 | Points: 3.14');
    });

    it('should convert boolean values to strings', () => {
      const content = 'Enabled: {enabled} | Debug: {debug}';
      const sources: VariableSource[] = [
        { name: 'test', priority: 1, values: {
          enabled: true as unknown as string,
          debug: false as unknown as string
        }},
      ];

      const result = resolveVariables(content, sources);

      assert.strictEqual(result.content, 'Enabled: true | Debug: false');
    });

    it('should handle curly braces that are not variables', () => {
      const content = 'JSON: { "key": "value" } and regex: [a-z]{3}';
      const sources: VariableSource[] = [];

      const result = resolveVariables(content, sources);

      // These aren't valid variable patterns - should remain unchanged
      assert.strictEqual(result.content, 'JSON: { "key": "value" } and regex: [a-z]{3}');
    });

    it('should handle special characters in variable values', () => {
      const content = 'Path: {path}';
      const sources: VariableSource[] = [
        { name: 'test', priority: 1, values: { path: '/home/user/Documents & Files/project' }},
      ];

      const result = resolveVariables(content, sources);

      assert.strictEqual(result.content, 'Path: /home/user/Documents & Files/project');
    });

    it('should handle multiline content', () => {
      const content = `Line 1: {var1}
Line 2: {var2}
Line 3: {var3}`;
      const sources: VariableSource[] = [
        { name: 'test', priority: 1, values: { var1: 'a', var2: 'b', var3: 'c' }},
      ];

      const result = resolveVariables(content, sources);

      assert.strictEqual(result.content, `Line 1: a
Line 2: b
Line 3: c`);
    });

    it('should handle variable in markdown code block', () => {
      const content = '```\nconfig: {config_path}\n```';
      const sources: VariableSource[] = [
        { name: 'test', priority: 1, values: { config_path: '/etc/app.yaml' }},
      ];

      const result = resolveVariables(content, sources);

      assert.strictEqual(result.content, '```\nconfig: /etc/app.yaml\n```');
    });

    it('should handle empty content', () => {
      const content = '';
      const sources: VariableSource[] = [
        { name: 'test', priority: 1, values: { unused: 'value' }},
      ];

      const result = resolveVariables(content, sources);

      assert.strictEqual(result.content, '');
      assert.deepStrictEqual(result.resolved, []);
      assert.deepStrictEqual(result.unresolved, []);
    });

  });

  describe('resolveStepVariables convenience function', () => {

    it('should build sources from workflow, session, and config', () => {
      const content = '{workflow_var} and {story_id} and {project_root}';

      const result = resolveStepVariables(content, {
        workflowVars: { workflow_var: 'from-workflow' },
        sessionVars: { story_id: 'MSSCI-12081' },
        projectRoot: '/Users/keithavery/Projects/pennyfarthing',
      });

      assert.strictEqual(result.content, 'from-workflow and MSSCI-12081 and /Users/keithavery/Projects/pennyfarthing');
    });

    it('should include system defaults (date, planning_artifacts)', () => {
      const content = 'Date: {date} | Artifacts: {planning_artifacts}';

      const result = resolveStepVariables(content, {});

      // Date should be current date in YYYY-MM-DD format
      assert.match(result.content, /Date: \d{4}-\d{2}-\d{2}/);
      // planning_artifacts should have default value
      assert.ok(result.content.includes('sprint/planning/'));
    });

    it('should work with no options provided', () => {
      const content = 'No variables here.';
      const result = resolveStepVariables(content);

      assert.strictEqual(result.content, 'No variables here.');
    });

    it('should allow workflow vars to override system defaults', () => {
      const content = 'Artifacts: {planning_artifacts}';

      const result = resolveStepVariables(content, {
        workflowVars: { planning_artifacts: 'custom-artifacts/' },
      });

      assert.strictEqual(result.content, 'Artifacts: custom-artifacts/');
    });

  });

});
