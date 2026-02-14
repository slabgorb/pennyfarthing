/**
 * Settings stubs for server module.
 * STUB: Will be replaced with real implementation from cyclist/src/settings.ts
 */

export interface PermissionGrant {
  tool: string;
  scope: string;
  grant_type: 'once' | 'session' | 'always';
  granted_at: string;
}

export function initializeSettings(_projectDir?: string): unknown {
  return {};
}

export function loadGrants(): PermissionGrant[] {
  return [];
}

export function saveGrants(_grants: PermissionGrant[]): boolean {
  return false;
}
