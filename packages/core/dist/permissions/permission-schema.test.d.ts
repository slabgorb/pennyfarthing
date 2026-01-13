/**
 * Tests for Story 33-1: Permission Request Protocol
 *
 * These tests define the contract for permission request validation.
 * Dev will implement validatePermissionRequest() to pass these tests.
 *
 * Schema requirements (from epic-33-context.md):
 * - Required: tool (string), reason (string), scope (string), grant_type (string)
 * - grant_type must be one of: "once" | "session" | "always"
 *
 * Acceptance Criteria:
 * - AC1: Permission request schema defined (YAML structure with all fields)
 * - AC3: Supports tool name, reason, scope fields
 * - AC4: Defines grant types (once, session, always) with clear semantics
 *
 * Run with: npm test
 */
export interface PermissionValidationError {
    field: string;
    message: string;
}
export interface PermissionValidationResult {
    valid: boolean;
    request?: PermissionRequestType;
    errors?: PermissionValidationError[];
}
export interface PermissionRequestType {
    tool: string;
    reason: string;
    scope: string;
    grant_type: 'once' | 'session' | 'always';
}
export interface PermissionGrantType {
    tool: string;
    scope: string;
    grant_type: 'once' | 'session' | 'always';
    granted_at: string;
    uses_remaining?: number;
}
//# sourceMappingURL=permission-schema.test.d.ts.map