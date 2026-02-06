/**
 * Workflow Permission Presets
 *
 * Story MSSCI-14326: Integrate workflow-permissions.ts schema into
 * workflow startup, show batch approval modal, store session grants.
 *
 * STUB: All functions throw — implementation pending.
 */

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

export function getWorkflowPermissionPresets(
  _workflowDef: WorkflowDefinitionLike,
): WorkflowPermissionPreset[] {
  throw new Error('getWorkflowPermissionPresets not implemented');
}

export function checkWorkflowPresets(
  _presets: WorkflowPermissionPreset[],
): WorkflowPresetCheckResult {
  throw new Error('checkWorkflowPresets not implemented');
}

export function broadcastBatchPermissionRequest(
  _permissions: WorkflowPermissionPreset[],
  _clients: Set<unknown>,
): void {
  throw new Error('broadcastBatchPermissionRequest not implemented');
}

export function formatBatchRequest(
  _permissions: WorkflowPermissionPreset[],
  _workflowName: string,
): BatchPermissionRequest {
  throw new Error('formatBatchRequest not implemented');
}

export function handleBatchApproval(
  _permissions: WorkflowPermissionPreset[],
  _grantScope: 'once' | 'session' | 'always',
): void {
  throw new Error('handleBatchApproval not implemented');
}

export function handleBatchRejection(): BatchRejectionResult {
  throw new Error('handleBatchRejection not implemented');
}

export function handleBatchWebSocketMessage(
  _message: string,
): BatchResponseResult {
  throw new Error('handleBatchWebSocketMessage not implemented');
}
