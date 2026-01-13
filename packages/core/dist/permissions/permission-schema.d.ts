/**
 * Permission Request Protocol Schema
 *
 * Story 33-1: Define structured format for permission requests
 *
 * This module provides:
 * - Type definitions for permission requests and grants
 * - Validation function for permission requests
 * - Grant creation from validated requests
 *
 * Schema (from epic-33-context.md):
 * ```yaml
 * permission_request:
 *   tool: string        # Tool name (e.g., "WebFetch", "Bash")
 *   reason: string      # Why access is needed
 *   scope: string       # What specifically (URL pattern, command type)
 *   grant_type: string  # "once" | "session" | "always"
 * ```
 */
/**
 * The three grant types with their semantics:
 * - once: Single use, cleared after tool call
 * - session: Valid until session ends
 * - always: Persisted across sessions (in settings.local.json)
 */
export type GrantType = 'once' | 'session' | 'always';
/**
 * A permission request from an agent
 */
export interface PermissionRequest {
    /** Tool name (e.g., "WebFetch", "Bash", "Read") */
    tool: string;
    /** Human-readable reason why access is needed */
    reason: string;
    /** Scope of access (URL pattern, command pattern, file pattern) */
    scope: string;
    /** How long the grant should last */
    grant_type: GrantType;
}
/**
 * An approved permission grant
 */
export interface PermissionGrant {
    /** Tool name this grant applies to */
    tool: string;
    /** Scope pattern this grant covers */
    scope: string;
    /** Grant duration type */
    grant_type: GrantType;
    /** ISO timestamp when grant was created */
    granted_at: string;
    /** For 'once' type: remaining uses (starts at 1) */
    uses_remaining?: number;
}
/**
 * Validation error with field and message
 */
export interface PermissionValidationError {
    field: string;
    message: string;
}
/**
 * Result of validating a permission request
 */
export interface PermissionValidationResult {
    valid: boolean;
    request?: PermissionRequest;
    errors?: PermissionValidationError[];
}
/**
 * Validates a permission request against the schema.
 *
 * Returns { valid: true, request } if valid.
 * Returns { valid: false, errors } if invalid.
 *
 * @param input - Raw input to validate
 * @returns Validation result with typed request or errors
 */
export declare function validatePermissionRequest(input: unknown): PermissionValidationResult;
/**
 * Creates a permission grant from a validated request.
 *
 * @param request - Validated permission request
 * @returns Permission grant with timestamp
 */
export declare function createGrant(request: PermissionRequest): PermissionGrant;
/** Valid grant type values */
export declare const VALID_GRANT_TYPES: readonly GrantType[];
//# sourceMappingURL=permission-schema.d.ts.map