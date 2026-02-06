/**
 * MSSCI-14326: Workflow permission presets
 *
 * Tests for integrating workflow-permissions.ts schema into workflow
 * startup, showing a batch approval modal, and storing approved
 * presets as session grants.
 *
 * Acceptance Criteria (derived from story description):
 * - AC1: Workflow startup extracts permission presets from definition
 * - AC2: Missing permissions trigger batch approval broadcast
 * - AC3: Batch approval modal shows all missing permissions
 * - AC4: Approved presets stored as session grants
 * - AC5: Workflow with all permissions granted auto-proceeds
 * - AC6: Workflow with no permissions defined auto-proceeds
 * - AC7: User rejection blocks workflow startup
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock settings-store before imports
vi.mock('../src/settings-store.js', () => ({
  checkGrant: vi.fn().mockReturnValue(false),
  isAllowlisted: vi.fn().mockReturnValue(false),
  addGrant: vi.fn(),
  getGrants: vi.fn().mockReturnValue([]),
  getSessionGrants: vi.fn().mockReturnValue([]),
  getPersistedGrants: vi.fn().mockReturnValue([]),
  GrantType: { ONCE: 'once', SESSION: 'session', ALWAYS: 'always' },
}));

import { addGrant, getGrants } from '../src/settings-store.js';
import type { PermissionGrant } from '../src/settings-store.js';

const mockAddGrant = vi.mocked(addGrant);
const mockGetGrants = vi.mocked(getGrants);

// =============================================================================
// Test Fixtures
// =============================================================================

const TDD_PERMISSIONS = [
  { tool: 'Bash', scope: 'npm test', reason: 'TDD workflow requires running tests' },
  { tool: 'Bash', scope: 'npm run build', reason: 'TDD workflow requires building' },
  { tool: 'Read', scope: 'src/**/*', reason: 'Read source files for test design' },
];

const SINGLE_PERMISSION = [
  { tool: 'Bash', scope: 'npm test', reason: 'Run tests' },
];

function makeGrant(tool: string, scope: string, grantType: 'once' | 'session' | 'always' = 'session'): PermissionGrant {
  return {
    tool,
    scope,
    grant_type: grantType,
    granted_at: new Date().toISOString(),
  };
}

// =============================================================================
// AC1: Workflow startup extracts permission presets from definition
// =============================================================================

describe('AC1: Workflow startup extracts permission presets', () => {
  it('should extract permissions array from workflow definition on startup', async () => {
    // Import the function that loads workflow permissions on startup
    const { getWorkflowPermissionPresets } = await import('../src/workflow-presets.js');

    const workflowDef = {
      name: 'tdd',
      type: 'phased' as const,
      phases: [{ name: 'setup', agent: 'sm' }],
      permissions: TDD_PERMISSIONS,
    };

    const presets = getWorkflowPermissionPresets(workflowDef);
    expect(presets).toHaveLength(3);
    expect(presets[0]).toEqual({ tool: 'Bash', scope: 'npm test', reason: 'TDD workflow requires running tests' });
  });

  it('should return empty array when workflow has no permissions', async () => {
    const { getWorkflowPermissionPresets } = await import('../src/workflow-presets.js');

    const workflowDef = {
      name: 'tdd',
      type: 'phased' as const,
      phases: [{ name: 'setup', agent: 'sm' }],
    };

    const presets = getWorkflowPermissionPresets(workflowDef);
    expect(presets).toEqual([]);
  });

  it('should return empty array when permissions is undefined', async () => {
    const { getWorkflowPermissionPresets } = await import('../src/workflow-presets.js');

    const workflowDef = {
      name: 'trivial',
      type: 'phased' as const,
      phases: [{ name: 'setup', agent: 'sm' }],
      permissions: undefined,
    };

    const presets = getWorkflowPermissionPresets(workflowDef);
    expect(presets).toEqual([]);
  });
});

// =============================================================================
// AC2: Missing permissions trigger batch approval broadcast
// =============================================================================

describe('AC2: Missing permissions trigger batch approval broadcast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetGrants.mockReturnValue([]);
  });

  it('should check workflow presets against current grants and identify missing', async () => {
    const { checkWorkflowPresets } = await import('../src/workflow-presets.js');

    const result = checkWorkflowPresets(TDD_PERMISSIONS);

    expect(result.allGranted).toBe(false);
    expect(result.missing).toHaveLength(3);
  });

  it('should broadcast batch-permission-request to WebSocket clients', async () => {
    const { broadcastBatchPermissionRequest } = await import('../src/workflow-presets.js');

    const mockWsSend = vi.fn();
    const mockWs = { readyState: 1, send: mockWsSend } as unknown;

    broadcastBatchPermissionRequest(TDD_PERMISSIONS, new Set([mockWs as WebSocket]));

    expect(mockWsSend).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(mockWsSend.mock.calls[0][0]);
    expect(sent.type).toBe('batch-permission-request');
    expect(sent.permissions).toHaveLength(3);
    expect(sent.permissions[0].tool).toBe('Bash');
    expect(sent.permissions[0].reason).toBe('TDD workflow requires running tests');
  });

  it('should not broadcast when all permissions are already granted', async () => {
    mockGetGrants.mockReturnValue([
      makeGrant('Bash', 'npm test'),
      makeGrant('Bash', 'npm run build'),
      makeGrant('Read', 'src/**/*'),
    ]);

    const { checkWorkflowPresets } = await import('../src/workflow-presets.js');
    const result = checkWorkflowPresets(TDD_PERMISSIONS);

    expect(result.allGranted).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it('should only include missing permissions in broadcast (not already-granted)', async () => {
    mockGetGrants.mockReturnValue([
      makeGrant('Bash', 'npm test'),
    ]);

    const { checkWorkflowPresets } = await import('../src/workflow-presets.js');
    const result = checkWorkflowPresets(TDD_PERMISSIONS);

    expect(result.allGranted).toBe(false);
    expect(result.missing).toHaveLength(2);
    expect(result.missing.map((m: { tool: string; scope: string }) => m.scope)).toEqual([
      'npm run build',
      'src/**/*',
    ]);
  });
});

// =============================================================================
// AC3: Batch approval modal shows all missing permissions
// =============================================================================

describe('AC3: Batch approval modal data structure', () => {
  it('should format batch request with tool, scope, and reason for each permission', async () => {
    const { formatBatchRequest } = await import('../src/workflow-presets.js');

    const request = formatBatchRequest(TDD_PERMISSIONS, 'tdd');

    expect(request.type).toBe('batch-permission-request');
    expect(request.workflowName).toBe('tdd');
    expect(request.permissions).toHaveLength(3);
    for (const perm of request.permissions) {
      expect(perm).toHaveProperty('tool');
      expect(perm).toHaveProperty('scope');
      expect(perm).toHaveProperty('reason');
    }
  });

  it('should include workflow name for modal header display', async () => {
    const { formatBatchRequest } = await import('../src/workflow-presets.js');

    const request = formatBatchRequest(SINGLE_PERMISSION, 'trivial');

    expect(request.workflowName).toBe('trivial');
  });
});

// =============================================================================
// AC4: Approved presets stored as session grants
// =============================================================================

describe('AC4: Approved presets stored as session grants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should store each approved permission as a session grant', async () => {
    const { handleBatchApproval } = await import('../src/workflow-presets.js');

    handleBatchApproval(TDD_PERMISSIONS, 'session');

    expect(mockAddGrant).toHaveBeenCalledTimes(3);
    for (let i = 0; i < TDD_PERMISSIONS.length; i++) {
      expect(mockAddGrant).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: TDD_PERMISSIONS[i].tool,
          scope: TDD_PERMISSIONS[i].scope,
          grant_type: 'session',
        })
      );
    }
  });

  it('should store as always grants when user selects always', async () => {
    const { handleBatchApproval } = await import('../src/workflow-presets.js');

    handleBatchApproval(SINGLE_PERMISSION, 'always');

    expect(mockAddGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: 'Bash',
        scope: 'npm test',
        grant_type: 'always',
      })
    );
  });

  it('should include granted_at timestamp for each grant', async () => {
    const { handleBatchApproval } = await import('../src/workflow-presets.js');

    handleBatchApproval(SINGLE_PERMISSION, 'session');

    expect(mockAddGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        granted_at: expect.any(String),
      })
    );
  });
});

// =============================================================================
// AC5: Workflow with all permissions granted auto-proceeds
// =============================================================================

describe('AC5: Workflow with all permissions granted auto-proceeds', () => {
  it('should return proceed=true when all presets have matching grants', async () => {
    mockGetGrants.mockReturnValue([
      makeGrant('Bash', 'npm test'),
      makeGrant('Bash', 'npm run build'),
      makeGrant('Read', 'src/**/*'),
    ]);

    const { checkWorkflowPresets } = await import('../src/workflow-presets.js');
    const result = checkWorkflowPresets(TDD_PERMISSIONS);

    expect(result.allGranted).toBe(true);
    expect(result.missing).toHaveLength(0);
    expect(result.granted).toHaveLength(3);
  });
});

// =============================================================================
// AC6: Workflow with no permissions defined auto-proceeds
// =============================================================================

describe('AC6: Workflow with no permissions defined auto-proceeds', () => {
  it('should return proceed=true for empty permissions array', async () => {
    const { checkWorkflowPresets } = await import('../src/workflow-presets.js');
    const result = checkWorkflowPresets([]);

    expect(result.allGranted).toBe(true);
    expect(result.missing).toHaveLength(0);
  });
});

// =============================================================================
// AC7: User rejection blocks workflow startup
// =============================================================================

describe('AC7: User rejection blocks workflow startup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return rejected=true when batch approval is rejected', async () => {
    const { handleBatchRejection } = await import('../src/workflow-presets.js');

    const result = handleBatchRejection();

    expect(result.rejected).toBe(true);
    expect(result.reason).toContain('permission');
  });

  it('should not store any grants on rejection', async () => {
    const { handleBatchRejection } = await import('../src/workflow-presets.js');

    handleBatchRejection();

    expect(mockAddGrant).not.toHaveBeenCalled();
  });
});

// =============================================================================
// AC: WebSocket batch response handling
// =============================================================================

describe('WebSocket batch response handling', () => {
  it('should handle batch-permission-response message type', async () => {
    const { handleBatchWebSocketMessage } = await import('../src/workflow-presets.js');

    const message = JSON.stringify({
      type: 'batch-permission-response',
      approved: true,
      grantScope: 'session',
    });

    const result = handleBatchWebSocketMessage(message);

    expect(result.approved).toBe(true);
    expect(result.grantScope).toBe('session');
  });

  it('should handle rejection in batch response', async () => {
    const { handleBatchWebSocketMessage } = await import('../src/workflow-presets.js');

    const message = JSON.stringify({
      type: 'batch-permission-response',
      approved: false,
    });

    const result = handleBatchWebSocketMessage(message);

    expect(result.approved).toBe(false);
  });
});
