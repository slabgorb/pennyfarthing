/**
 * Workflow Permission Presets
 *
 * Story MSSCI-14326: Integrate workflow-permissions.ts schema into
 * workflow startup, show batch approval modal, store session grants.
 */

import { getGrants, addGrant } from './settings-store.js';

/**
 * Permission preset as defined in workflow YAML.
 * Mirrors WorkflowPermissionPreset from @pennyfarthing/core.
 */
export interface WorkflowPermissionPreset {
  tool: string;
  scope: string;
  reason: string;
}

export interface WorkflowDefinitionLike {
  name: string;
  type?: string;
  permissions?: WorkflowPermissionPreset[];
  [key: string]: unknown;
}

export interface WorkflowPresetCheckResult {
  allGranted: boolean;
  missing: WorkflowPermissionPreset[];
  granted: WorkflowPermissionPreset[];
}

export interface BatchPermissionRequest {
  type: 'batch-permission-request';
  workflowName: string;
  permissions: WorkflowPermissionPreset[];
}

export interface BatchRejectionResult {
  rejected: boolean;
  reason: string;
}

export interface BatchResponseResult {
  approved: boolean;
  grantScope?: string;
}

/**
 * Extract permission presets from a workflow definition.
 */
export function getWorkflowPermissionPresets(
  workflowDef: WorkflowDefinitionLike,
): WorkflowPermissionPreset[] {
  return workflowDef.permissions ?? [];
}

/**
 * Check workflow presets against current grants.
 * Uses exact tool+scope matching.
 */
export function checkWorkflowPresets(
  presets: WorkflowPermissionPreset[],
): WorkflowPresetCheckResult {
  const currentGrants = getGrants();
  const missing: WorkflowPermissionPreset[] = [];
  const granted: WorkflowPermissionPreset[] = [];

  for (const preset of presets) {
    const hasGrant = currentGrants.some(
      (g) => g.tool === preset.tool && g.scope === preset.scope,
    );
    if (hasGrant) {
      granted.push(preset);
    } else {
      missing.push(preset);
    }
  }

  return {
    allGranted: missing.length === 0,
    missing,
    granted,
  };
}

/**
 * Broadcast batch permission request to WebSocket clients.
 */
export function broadcastBatchPermissionRequest(
  permissions: WorkflowPermissionPreset[],
  clients: Set<{ readyState: number; send: (data: string) => void }>,
): void {
  const message = JSON.stringify({
    type: 'batch-permission-request',
    permissions,
  });
  for (const client of clients) {
    if (client.readyState === 1) {
      client.send(message);
    }
  }
}

/**
 * Format batch request payload for WebSocket broadcast.
 */
export function formatBatchRequest(
  permissions: WorkflowPermissionPreset[],
  workflowName: string,
): BatchPermissionRequest {
  return {
    type: 'batch-permission-request',
    workflowName,
    permissions,
  };
}

/**
 * Store approved permissions as grants.
 */
export function handleBatchApproval(
  permissions: WorkflowPermissionPreset[],
  grantScope: 'once' | 'session' | 'always',
): void {
  for (const perm of permissions) {
    addGrant({
      tool: perm.tool,
      scope: perm.scope,
      grant_type: grantScope,
      granted_at: new Date().toISOString(),
    });
  }
}

/**
 * Handle user rejection of batch permission request.
 */
export function handleBatchRejection(): BatchRejectionResult {
  return {
    rejected: true,
    reason: 'User denied workflow permission presets',
  };
}

/**
 * Parse batch permission response from WebSocket message.
 */
export function handleBatchWebSocketMessage(
  message: string,
): BatchResponseResult {
  const data = JSON.parse(message);
  return {
    approved: data.approved,
    grantScope: data.grantScope,
  };
}
