/**
 * Permission Request Protocol Module
 *
 * Story 33-1: Permission Request Protocol
 *
 * Exports types and validation for the permission request system.
 */

export {
  // Types
  type GrantType,
  type PermissionRequest,
  type PermissionGrant,
  type PermissionValidationError,
  type PermissionValidationResult,

  // Functions
  validatePermissionRequest,
  createGrant,

  // Constants
  VALID_GRANT_TYPES,
} from './permission-schema.js';
