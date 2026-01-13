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
import { describe, it } from 'node:test';
import assert from 'node:assert';
// Import the validator function that Dev will implement
// This import will fail until Dev implements the module
import { validatePermissionRequest, } from './permission-schema.js';
describe('Permission Request Schema Validation (33-1)', () => {
    describe('Valid permission requests', () => {
        it('should accept a minimal valid permission request', () => {
            const request = {
                tool: 'WebFetch',
                reason: 'Need to fetch documentation from GitHub',
                scope: '*.github.com',
                grant_type: 'once'
            };
            const result = validatePermissionRequest(request);
            assert.strictEqual(result.valid, true, 'Minimal request should be valid');
            assert.strictEqual(result.request?.tool, 'WebFetch');
        });
        it('should accept permission request with grant_type "once"', () => {
            const request = {
                tool: 'Bash',
                reason: 'Run npm test command',
                scope: 'npm test',
                grant_type: 'once'
            };
            const result = validatePermissionRequest(request);
            assert.strictEqual(result.valid, true, 'Once grant should be valid');
            assert.strictEqual(result.request?.grant_type, 'once');
        });
        it('should accept permission request with grant_type "session"', () => {
            const request = {
                tool: 'WebFetch',
                reason: 'Research documentation throughout session',
                scope: '*.npmjs.com',
                grant_type: 'session'
            };
            const result = validatePermissionRequest(request);
            assert.strictEqual(result.valid, true, 'Session grant should be valid');
            assert.strictEqual(result.request?.grant_type, 'session');
        });
        it('should accept permission request with grant_type "always"', () => {
            const request = {
                tool: 'Bash',
                reason: 'Allow running tests',
                scope: 'npm test *',
                grant_type: 'always'
            };
            const result = validatePermissionRequest(request);
            assert.strictEqual(result.valid, true, 'Always grant should be valid');
            assert.strictEqual(result.request?.grant_type, 'always');
        });
        it('should accept common tool names', () => {
            const tools = ['WebFetch', 'Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep'];
            for (const tool of tools) {
                const request = {
                    tool,
                    reason: `Access ${tool} for operation`,
                    scope: '*',
                    grant_type: 'once'
                };
                const result = validatePermissionRequest(request);
                assert.strictEqual(result.valid, true, `${tool} should be valid tool name`);
            }
        });
    });
    describe('Required fields validation (AC1, AC3)', () => {
        it('should reject request missing tool', () => {
            const request = {
                reason: 'Need access',
                scope: '*',
                grant_type: 'once'
            };
            const result = validatePermissionRequest(request);
            assert.strictEqual(result.valid, false, 'Should reject request without tool');
            assert.ok(result.errors?.some(e => e.field === 'tool'), 'Should report missing tool');
        });
        it('should reject request missing reason', () => {
            const request = {
                tool: 'WebFetch',
                scope: '*',
                grant_type: 'once'
            };
            const result = validatePermissionRequest(request);
            assert.strictEqual(result.valid, false, 'Should reject request without reason');
            assert.ok(result.errors?.some(e => e.field === 'reason'), 'Should report missing reason');
        });
        it('should reject request missing scope', () => {
            const request = {
                tool: 'WebFetch',
                reason: 'Need access',
                grant_type: 'once'
            };
            const result = validatePermissionRequest(request);
            assert.strictEqual(result.valid, false, 'Should reject request without scope');
            assert.ok(result.errors?.some(e => e.field === 'scope'), 'Should report missing scope');
        });
        it('should reject request missing grant_type', () => {
            const request = {
                tool: 'WebFetch',
                reason: 'Need access',
                scope: '*'
            };
            const result = validatePermissionRequest(request);
            assert.strictEqual(result.valid, false, 'Should reject request without grant_type');
            assert.ok(result.errors?.some(e => e.field === 'grant_type'), 'Should report missing grant_type');
        });
        it('should reject completely empty request', () => {
            const request = {};
            const result = validatePermissionRequest(request);
            assert.strictEqual(result.valid, false, 'Empty request should be invalid');
            assert.ok(result.errors && result.errors.length >= 4, 'Should report all missing fields');
        });
    });
    describe('Grant type validation (AC4)', () => {
        it('should reject invalid grant_type value', () => {
            const request = {
                tool: 'WebFetch',
                reason: 'Need access',
                scope: '*',
                grant_type: 'forever' // Invalid - should be once/session/always
            };
            const result = validatePermissionRequest(request);
            assert.strictEqual(result.valid, false, 'Invalid grant_type should be rejected');
            assert.ok(result.errors?.some(e => e.field === 'grant_type' && e.message.includes('once')), 'Error should mention valid options');
        });
        it('should reject grant_type with wrong case', () => {
            const request = {
                tool: 'WebFetch',
                reason: 'Need access',
                scope: '*',
                grant_type: 'ONCE' // Should be lowercase
            };
            const result = validatePermissionRequest(request);
            assert.strictEqual(result.valid, false, 'Uppercase grant_type should be rejected');
        });
        it('should reject grant_type with extra whitespace', () => {
            const request = {
                tool: 'WebFetch',
                reason: 'Need access',
                scope: '*',
                grant_type: ' once ' // Has whitespace
            };
            const result = validatePermissionRequest(request);
            assert.strictEqual(result.valid, false, 'Grant type with whitespace should be rejected');
        });
    });
    describe('Type validation', () => {
        it('should reject non-string tool', () => {
            const request = {
                tool: 123,
                reason: 'Need access',
                scope: '*',
                grant_type: 'once'
            };
            const result = validatePermissionRequest(request);
            assert.strictEqual(result.valid, false, 'Non-string tool should be rejected');
        });
        it('should reject non-string reason', () => {
            const request = {
                tool: 'WebFetch',
                reason: ['need', 'access'],
                scope: '*',
                grant_type: 'once'
            };
            const result = validatePermissionRequest(request);
            assert.strictEqual(result.valid, false, 'Non-string reason should be rejected');
        });
        it('should reject non-string scope', () => {
            const request = {
                tool: 'WebFetch',
                reason: 'Need access',
                scope: { pattern: '*' },
                grant_type: 'once'
            };
            const result = validatePermissionRequest(request);
            assert.strictEqual(result.valid, false, 'Non-string scope should be rejected');
        });
        it('should reject null values', () => {
            const request = {
                tool: null,
                reason: 'Need access',
                scope: '*',
                grant_type: 'once'
            };
            const result = validatePermissionRequest(request);
            assert.strictEqual(result.valid, false, 'Null tool should be rejected');
        });
        it('should reject undefined values', () => {
            const request = {
                tool: undefined,
                reason: 'Need access',
                scope: '*',
                grant_type: 'once'
            };
            const result = validatePermissionRequest(request);
            assert.strictEqual(result.valid, false, 'Undefined tool should be rejected');
        });
    });
    describe('Empty string validation', () => {
        it('should reject empty string tool', () => {
            const request = {
                tool: '',
                reason: 'Need access',
                scope: '*',
                grant_type: 'once'
            };
            const result = validatePermissionRequest(request);
            assert.strictEqual(result.valid, false, 'Empty tool should be rejected');
        });
        it('should reject empty string reason', () => {
            const request = {
                tool: 'WebFetch',
                reason: '',
                scope: '*',
                grant_type: 'once'
            };
            const result = validatePermissionRequest(request);
            assert.strictEqual(result.valid, false, 'Empty reason should be rejected');
        });
        it('should reject empty string scope', () => {
            const request = {
                tool: 'WebFetch',
                reason: 'Need access',
                scope: '',
                grant_type: 'once'
            };
            const result = validatePermissionRequest(request);
            assert.strictEqual(result.valid, false, 'Empty scope should be rejected');
        });
        it('should reject whitespace-only strings', () => {
            const request = {
                tool: '   ',
                reason: 'Need access',
                scope: '*',
                grant_type: 'once'
            };
            const result = validatePermissionRequest(request);
            assert.strictEqual(result.valid, false, 'Whitespace-only tool should be rejected');
        });
    });
    describe('Error reporting', () => {
        it('should report multiple errors at once', () => {
            const request = {
                // missing tool
                reason: '', // empty reason
                // missing scope
                grant_type: 'invalid' // invalid grant_type
            };
            const result = validatePermissionRequest(request);
            assert.strictEqual(result.valid, false, 'Should be invalid');
            assert.ok(result.errors && result.errors.length >= 3, 'Should report multiple errors');
        });
        it('should include field name in error', () => {
            const request = {
                tool: 'WebFetch',
                reason: 'Need access',
                scope: '*',
                grant_type: 'invalid'
            };
            const result = validatePermissionRequest(request);
            assert.strictEqual(result.valid, false);
            const error = result.errors?.find(e => e.field === 'grant_type');
            assert.ok(error, 'Should have error for invalid grant_type');
            assert.ok(error?.field === 'grant_type', 'Error should identify field');
        });
        it('should include human-readable message', () => {
            const request = {
                reason: 'Need access',
                scope: '*',
                grant_type: 'once'
            };
            const result = validatePermissionRequest(request);
            assert.strictEqual(result.valid, false);
            const error = result.errors?.find(e => e.field === 'tool');
            assert.ok(error?.message, 'Error should have message');
            assert.ok(typeof error?.message === 'string', 'Message should be a string');
        });
    });
    describe('Validated request output', () => {
        it('should return validated request on success', () => {
            const request = {
                tool: 'WebFetch',
                reason: 'Need to fetch docs',
                scope: '*.github.com',
                grant_type: 'session'
            };
            const result = validatePermissionRequest(request);
            assert.strictEqual(result.valid, true);
            assert.ok(result.request, 'Should return validated request');
            assert.strictEqual(result.request?.tool, 'WebFetch');
            assert.strictEqual(result.request?.reason, 'Need to fetch docs');
            assert.strictEqual(result.request?.scope, '*.github.com');
            assert.strictEqual(result.request?.grant_type, 'session');
        });
        it('should not return request on failure', () => {
            const request = {
                tool: 'WebFetch'
                // missing required fields
            };
            const result = validatePermissionRequest(request);
            assert.strictEqual(result.valid, false);
            assert.strictEqual(result.request, undefined, 'Should not return request on failure');
        });
    });
});
describe('Permission Grant Structure (33-1)', () => {
    describe('Grant creation from request', () => {
        it('should create grant with timestamp for "once" type', async () => {
            const request = {
                tool: 'WebFetch',
                reason: 'Need to fetch docs',
                scope: '*.github.com',
                grant_type: 'once'
            };
            // This is a type-check test - Dev needs to implement createGrant
            // Import will fail until implemented
            const { createGrant } = await import('./permission-schema.js');
            const grant = createGrant(request);
            assert.ok(grant.granted_at, 'Grant should have timestamp');
            assert.strictEqual(grant.tool, 'WebFetch');
            assert.strictEqual(grant.grant_type, 'once');
            assert.strictEqual(grant.uses_remaining, 1, 'Once grant should have 1 use');
        });
        it('should create grant without use limit for "session" type', async () => {
            const request = {
                tool: 'Bash',
                reason: 'Run tests',
                scope: 'npm test',
                grant_type: 'session'
            };
            const { createGrant } = await import('./permission-schema.js');
            const grant = createGrant(request);
            assert.strictEqual(grant.grant_type, 'session');
            assert.strictEqual(grant.uses_remaining, undefined, 'Session grant should have unlimited uses');
        });
        it('should create grant without use limit for "always" type', async () => {
            const request = {
                tool: 'Bash',
                reason: 'Run tests',
                scope: 'npm test',
                grant_type: 'always'
            };
            const { createGrant } = await import('./permission-schema.js');
            const grant = createGrant(request);
            assert.strictEqual(grant.grant_type, 'always');
            assert.strictEqual(grant.uses_remaining, undefined, 'Always grant should have unlimited uses');
        });
    });
});
//# sourceMappingURL=permission-schema.test.js.map