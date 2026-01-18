/**
 * Workflow Permission Presets
 *
 * Story MSSCI-11847: Permission Presets by Workflow
 *
 * This module provides permission checking for workflow presets.
 * Workflows can define required permissions that are checked at startup.
 */

import type { PermissionGrant } from '../permissions/permission-schema.js';

/**
 * A permission preset defined in a workflow YAML
 */
export interface WorkflowPermissionPreset {
  /** Tool name (e.g., "Bash", "Read", "WebFetch") */
  tool: string;
  /** Scope pattern for the permission */
  scope: string;
  /** Human-readable reason shown when prompting for permission */
  reason: string;
}

/**
 * Result of checking workflow permissions against cached grants
 */
export interface WorkflowPermissionCheckResult {
  /** True if all required permissions are already granted */
  allGranted: boolean;
  /** Permissions that need to be requested */
  missing: WorkflowPermissionPreset[];
  /** Permissions that are already granted */
  granted: WorkflowPermissionPreset[];
}

/**
 * Check if a permission preset is covered by a cached grant
 *
 * Matching requires:
 * - Same tool name (case-sensitive)
 * - Same scope pattern (exact match)
 *
 * @param preset - Permission preset from workflow
 * @param grant - Cached permission grant
 * @returns True if the grant covers the preset
 */
function isGranted(preset: WorkflowPermissionPreset, grant: PermissionGrant): boolean {
  return preset.tool === grant.tool && preset.scope === grant.scope;
}

/**
 * Check workflow permissions against cached grants
 *
 * For each permission preset defined in the workflow, checks if there's
 * a matching grant in the cache. Returns lists of granted and missing
 * permissions so the caller can prompt for missing ones.
 *
 * @param workflowPermissions - Permissions required by the workflow
 * @param cachedGrants - Currently cached permission grants
 * @returns Result indicating which permissions are granted vs missing
 *
 * @example
 * ```typescript
 * const result = checkWorkflowPermissions(workflow.permissions, grants);
 * if (!result.allGranted) {
 *   // Prompt user for result.missing permissions
 *   for (const perm of result.missing) {
 *     console.log(`Need permission: ${perm.tool} - ${perm.reason}`);
 *   }
 * }
 * ```
 */
export function checkWorkflowPermissions(
  workflowPermissions: WorkflowPermissionPreset[],
  cachedGrants: PermissionGrant[]
): WorkflowPermissionCheckResult {
  const missing: WorkflowPermissionPreset[] = [];
  const granted: WorkflowPermissionPreset[] = [];

  for (const preset of workflowPermissions) {
    // Check if any cached grant covers this preset
    const hasGrant = cachedGrants.some((grant) => isGranted(preset, grant));

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
