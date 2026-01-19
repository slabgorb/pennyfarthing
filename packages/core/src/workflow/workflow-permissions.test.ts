/**
 * Tests for Story MSSCI-11847: Permission Presets by Workflow
 *
 * These tests define the contract for workflow permission presets.
 *
 * Acceptance Criteria:
 * - AC1: Workflow schema supports permissions field
 * - AC2: Workflow start checks required permissions
 * - AC3: Prompts for missing permissions
 * - AC4: Cached grants skip prompts
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { validateWorkflow } from './workflow-schema.js';
import {
  checkWorkflowPermissions,
  type WorkflowPermissionPreset,
} from './workflow-permissions.js';
import type { PermissionGrant } from '../permissions/permission-schema.js';

describe('Workflow Permission Presets (MSSCI-11847)', () => {
  describe('AC1: Workflow schema supports permissions field', () => {
    it('should accept a workflow with permissions array', () => {
      const workflow = {
        workflow: {
          name: 'tdd-with-permissions',
          phases: [{ name: 'setup', agent: 'sm' }],
          permissions: [
            {
              tool: 'Bash',
              scope: 'npm test|npm run build',
              reason: 'TDD workflow requires test commands',
            },
          ],
        },
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, true, 'Workflow with permissions should be valid');
      assert.ok(result.workflow?.permissions, 'Permissions should be present');
      assert.strictEqual(result.workflow?.permissions?.length, 1);
      assert.strictEqual(result.workflow?.permissions?.[0].tool, 'Bash');
    });

    it('should accept a workflow with multiple permissions', () => {
      const workflow = {
        workflow: {
          name: 'full-permissions',
          phases: [{ name: 'setup', agent: 'sm' }],
          permissions: [
            {
              tool: 'Bash',
              scope: 'git *',
              reason: 'Git operations',
            },
            {
              tool: 'Read',
              scope: 'src/**/*',
              reason: 'Read source files',
            },
            {
              tool: 'WebFetch',
              scope: '*.github.com',
              reason: 'Fetch GitHub API',
            },
          ],
        },
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, true, 'Workflow with multiple permissions should be valid');
      assert.strictEqual(result.workflow?.permissions?.length, 3);
    });

    it('should accept a workflow without permissions (optional field)', () => {
      const workflow = {
        workflow: {
          name: 'no-permissions',
          phases: [{ name: 'setup', agent: 'sm' }],
        },
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, true, 'Workflow without permissions should be valid');
      assert.strictEqual(result.workflow?.permissions, undefined);
    });

    it('should reject invalid permission object (missing tool)', () => {
      const workflow = {
        workflow: {
          name: 'invalid-permission',
          phases: [{ name: 'setup', agent: 'sm' }],
          permissions: [
            {
              scope: 'npm test',
              reason: 'Test commands',
              // missing 'tool' field
            },
          ],
        },
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, false, 'Permission without tool should be invalid');
      assert.ok(
        result.errors?.some((e) => e.field.includes('permissions') && e.message.includes('tool')),
        'Should have error about missing tool'
      );
    });

    it('should reject invalid permission object (missing scope)', () => {
      const workflow = {
        workflow: {
          name: 'invalid-permission',
          phases: [{ name: 'setup', agent: 'sm' }],
          permissions: [
            {
              tool: 'Bash',
              reason: 'Test commands',
              // missing 'scope' field
            },
          ],
        },
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, false, 'Permission without scope should be invalid');
      assert.ok(
        result.errors?.some((e) => e.field.includes('permissions') && e.message.includes('scope')),
        'Should have error about missing scope'
      );
    });

    it('should reject invalid permission object (missing reason)', () => {
      const workflow = {
        workflow: {
          name: 'invalid-permission',
          phases: [{ name: 'setup', agent: 'sm' }],
          permissions: [
            {
              tool: 'Bash',
              scope: 'npm test',
              // missing 'reason' field
            },
          ],
        },
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, false, 'Permission without reason should be invalid');
      assert.ok(
        result.errors?.some((e) => e.field.includes('permissions') && e.message.includes('reason')),
        'Should have error about missing reason'
      );
    });

    it('should reject permissions that is not an array', () => {
      const workflow = {
        workflow: {
          name: 'invalid-permissions',
          phases: [{ name: 'setup', agent: 'sm' }],
          permissions: 'not-an-array',
        },
      };

      const result = validateWorkflow(workflow);
      assert.strictEqual(result.valid, false, 'Permissions must be an array');
      assert.ok(
        result.errors?.some((e) => e.field.includes('permissions') && e.message.includes('array')),
        'Should have error about permissions not being array'
      );
    });
  });

  describe('AC2: Workflow start checks required permissions', () => {
    const workflowPermissions: WorkflowPermissionPreset[] = [
      { tool: 'Bash', scope: 'npm test', reason: 'Run tests' },
      { tool: 'Read', scope: 'src/**/*', reason: 'Read source' },
    ];

    it('should identify all permissions as missing when no grants exist', () => {
      const grants: PermissionGrant[] = [];

      const result = checkWorkflowPermissions(workflowPermissions, grants);

      assert.strictEqual(result.allGranted, false);
      assert.strictEqual(result.missing.length, 2);
      assert.strictEqual(result.granted.length, 0);
    });

    it('should identify some permissions as missing when partial grants exist', () => {
      const grants: PermissionGrant[] = [
        {
          tool: 'Bash',
          scope: 'npm test',
          grant_type: 'session',
          granted_at: new Date().toISOString(),
        },
      ];

      const result = checkWorkflowPermissions(workflowPermissions, grants);

      assert.strictEqual(result.allGranted, false);
      assert.strictEqual(result.missing.length, 1);
      assert.strictEqual(result.missing[0].tool, 'Read');
      assert.strictEqual(result.granted.length, 1);
      assert.strictEqual(result.granted[0].tool, 'Bash');
    });

    it('should identify all permissions as granted when full grants exist', () => {
      const grants: PermissionGrant[] = [
        {
          tool: 'Bash',
          scope: 'npm test',
          grant_type: 'session',
          granted_at: new Date().toISOString(),
        },
        {
          tool: 'Read',
          scope: 'src/**/*',
          grant_type: 'always',
          granted_at: new Date().toISOString(),
        },
      ];

      const result = checkWorkflowPermissions(workflowPermissions, grants);

      assert.strictEqual(result.allGranted, true);
      assert.strictEqual(result.missing.length, 0);
      assert.strictEqual(result.granted.length, 2);
    });
  });

  describe('AC3: Prompts for missing permissions', () => {
    it('should return missing permissions with reasons for prompting', () => {
      const workflowPermissions: WorkflowPermissionPreset[] = [
        { tool: 'Bash', scope: 'npm test', reason: 'TDD requires running tests' },
      ];
      const grants: PermissionGrant[] = [];

      const result = checkWorkflowPermissions(workflowPermissions, grants);

      assert.strictEqual(result.missing.length, 1);
      assert.strictEqual(result.missing[0].tool, 'Bash');
      assert.strictEqual(result.missing[0].scope, 'npm test');
      assert.strictEqual(result.missing[0].reason, 'TDD requires running tests');
    });

    it('should preserve reason field for UI prompt display', () => {
      const workflowPermissions: WorkflowPermissionPreset[] = [
        { tool: 'WebFetch', scope: '*.npmjs.org', reason: 'Check npm registry for package info' },
      ];
      const grants: PermissionGrant[] = [];

      const result = checkWorkflowPermissions(workflowPermissions, grants);

      // The reason should be preserved so the UI can show "Why: Check npm registry..."
      assert.ok(result.missing[0].reason.includes('npm registry'));
    });
  });

  describe('AC4: Cached grants skip prompts', () => {
    it('should recognize session grants as valid', () => {
      const workflowPermissions: WorkflowPermissionPreset[] = [
        { tool: 'Bash', scope: 'npm test', reason: 'Run tests' },
      ];
      const grants: PermissionGrant[] = [
        {
          tool: 'Bash',
          scope: 'npm test',
          grant_type: 'session',
          granted_at: new Date().toISOString(),
        },
      ];

      const result = checkWorkflowPermissions(workflowPermissions, grants);

      assert.strictEqual(result.allGranted, true);
      assert.strictEqual(result.missing.length, 0);
    });

    it('should recognize always grants as valid', () => {
      const workflowPermissions: WorkflowPermissionPreset[] = [
        { tool: 'Read', scope: 'src/**/*', reason: 'Read source' },
      ];
      const grants: PermissionGrant[] = [
        {
          tool: 'Read',
          scope: 'src/**/*',
          grant_type: 'always',
          granted_at: new Date().toISOString(),
        },
      ];

      const result = checkWorkflowPermissions(workflowPermissions, grants);

      assert.strictEqual(result.allGranted, true);
    });

    it('should match grants by tool and scope pattern', () => {
      const workflowPermissions: WorkflowPermissionPreset[] = [
        { tool: 'Bash', scope: 'git *', reason: 'Git operations' },
      ];

      // Grant with exact same scope should match
      const grantsExact: PermissionGrant[] = [
        {
          tool: 'Bash',
          scope: 'git *',
          grant_type: 'session',
          granted_at: new Date().toISOString(),
        },
      ];

      const resultExact = checkWorkflowPermissions(workflowPermissions, grantsExact);
      assert.strictEqual(resultExact.allGranted, true, 'Exact scope match should be granted');

      // Grant with different scope should NOT match
      const grantsDifferent: PermissionGrant[] = [
        {
          tool: 'Bash',
          scope: 'npm *',
          grant_type: 'session',
          granted_at: new Date().toISOString(),
        },
      ];

      const resultDifferent = checkWorkflowPermissions(workflowPermissions, grantsDifferent);
      assert.strictEqual(resultDifferent.allGranted, false, 'Different scope should not match');
    });

    it('should not match grants with different tool name', () => {
      const workflowPermissions: WorkflowPermissionPreset[] = [
        { tool: 'Bash', scope: 'npm test', reason: 'Run tests' },
      ];
      const grants: PermissionGrant[] = [
        {
          tool: 'Read', // Different tool
          scope: 'npm test',
          grant_type: 'session',
          granted_at: new Date().toISOString(),
        },
      ];

      const result = checkWorkflowPermissions(workflowPermissions, grants);

      assert.strictEqual(result.allGranted, false);
      assert.strictEqual(result.missing.length, 1);
    });

    it('should handle empty workflow permissions (no permissions required)', () => {
      const workflowPermissions: WorkflowPermissionPreset[] = [];
      const grants: PermissionGrant[] = [];

      const result = checkWorkflowPermissions(workflowPermissions, grants);

      assert.strictEqual(result.allGranted, true, 'Empty permissions means all granted');
      assert.strictEqual(result.missing.length, 0);
    });
  });
});
