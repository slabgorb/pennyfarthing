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
// ============================================================================
// Validation
// ============================================================================
/**
 * Checks if a value is a non-empty string (after trimming whitespace).
 */
function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}
/**
 * Checks if a value is a valid grant type.
 */
function isValidGrantType(value) {
    return typeof value === 'string' && VALID_GRANT_TYPES.includes(value);
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
export function validatePermissionRequest(input) {
    const errors = [];
    // Ensure input is an object
    if (!input || typeof input !== 'object') {
        return {
            valid: false,
            errors: [{ field: 'input', message: 'Input must be an object' }]
        };
    }
    const obj = input;
    // Validate tool field
    if (!isNonEmptyString(obj.tool)) {
        errors.push({
            field: 'tool',
            message: 'tool is required and must be a non-empty string'
        });
    }
    // Validate reason field
    if (!isNonEmptyString(obj.reason)) {
        errors.push({
            field: 'reason',
            message: 'reason is required and must be a non-empty string'
        });
    }
    // Validate scope field
    if (!isNonEmptyString(obj.scope)) {
        errors.push({
            field: 'scope',
            message: 'scope is required and must be a non-empty string'
        });
    }
    // Validate grant_type field
    if (!isValidGrantType(obj.grant_type)) {
        errors.push({
            field: 'grant_type',
            message: 'grant_type is required and must be one of: once, session, always'
        });
    }
    // Return result
    if (errors.length > 0) {
        return { valid: false, errors };
    }
    return {
        valid: true,
        request: {
            tool: obj.tool,
            reason: obj.reason,
            scope: obj.scope,
            grant_type: obj.grant_type
        }
    };
}
/**
 * Creates a permission grant from a validated request.
 *
 * @param request - Validated permission request
 * @returns Permission grant with timestamp
 */
export function createGrant(request) {
    const grant = {
        tool: request.tool,
        scope: request.scope,
        grant_type: request.grant_type,
        granted_at: new Date().toISOString()
    };
    // Only 'once' grants have uses_remaining
    if (request.grant_type === 'once') {
        grant.uses_remaining = 1;
    }
    return grant;
}
// ============================================================================
// Constants
// ============================================================================
/** Valid grant type values */
export const VALID_GRANT_TYPES = ['once', 'session', 'always'];
//# sourceMappingURL=permission-schema.js.map