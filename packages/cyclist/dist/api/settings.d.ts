/**
 * Settings API Router (Story 35-1)
 *
 * Provides HTTP API endpoints for settings management:
 * - GET /api/settings - Get current settings
 * - PATCH /api/settings - Update partial settings
 * - GET /api/settings/themes - Get available themes metadata
 */
import { Router } from 'express';
/**
 * Error codes for settings API responses
 */
export type ErrorCode = 'VALIDATION_ERROR' | 'FILE_ERROR' | 'PERMISSION_ERROR' | 'UNKNOWN_ERROR';
/**
 * Error response structure for consistent API error handling
 * AC4: Consistent error handling with user feedback
 */
export interface ErrorResponse {
    error: boolean;
    code: ErrorCode;
    message: string;
}
/**
 * Create a consistent error response object
 * AC4: Helper for consistent error formatting
 */
export declare function createErrorResponse(code: ErrorCode, message: string): ErrorResponse;
/**
 * Create the settings router
 */
export declare function createSettingsRouter(): Router;
//# sourceMappingURL=settings.d.ts.map