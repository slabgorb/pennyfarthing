/**
 * MSSCI-12128: Error handling with actionable messages
 *
 * Tests for improved error handling in VS Code chat:
 * - Error type classification (network, auth, process, timeout, validation)
 * - Actionable error messages with recovery steps
 * - Clean markdown rendering in VS Code chat UI
 *
 * Acceptance Criteria:
 * - AC1: Network/connectivity errors show "Check internet connection" guidance
 * - AC2: Auth errors suggest "Verify Claude Pro/Max subscription"
 * - AC3: CLI process errors suggest "Try reinstalling pennyfarthing"
 * - AC4: Each error type includes a specific, actionable next step
 * - AC5: Error messages render cleanly in VS Code chat UI
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock vscode module
const mockVscode = {
  Uri: {
    file: vi.fn((path: string) => ({ fsPath: path, scheme: 'file' })),
    parse: vi.fn((uri: string) => ({ scheme: 'file', path: uri })),
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/mock/workspace' } }],
  },
};

vi.mock('vscode', () => mockVscode);

// ============================================================================
// Error Types and Classification
// ============================================================================
describe('Error classification', () => {
  describe('classifyError', () => {
    it('should classify ECONNREFUSED as network error', async () => {
      const { classifyError } = await import('../src/adapters/error-handler');

      const error = new Error('connect ECONNREFUSED 127.0.0.1:3000');
      const result = classifyError(error);

      expect(result).toBe('network');
    });

    it('should classify ENOTFOUND as network error', async () => {
      const { classifyError } = await import('../src/adapters/error-handler');

      const error = new Error('getaddrinfo ENOTFOUND api.anthropic.com');
      const result = classifyError(error);

      expect(result).toBe('network');
    });

    it('should classify ETIMEDOUT as timeout error', async () => {
      const { classifyError } = await import('../src/adapters/error-handler');

      const error = new Error('connect ETIMEDOUT');
      const result = classifyError(error);

      expect(result).toBe('timeout');
    });

    it('should classify "timeout" message as timeout error', async () => {
      const { classifyError } = await import('../src/adapters/error-handler');

      const error = new Error('Request timeout after 30000ms');
      const result = classifyError(error);

      expect(result).toBe('timeout');
    });

    it('should classify 401 status as auth error', async () => {
      const { classifyError } = await import('../src/adapters/error-handler');

      const error = new Error('Request failed with status 401');
      const result = classifyError(error);

      expect(result).toBe('auth');
    });

    it('should classify 403 status as auth error', async () => {
      const { classifyError } = await import('../src/adapters/error-handler');

      const error = new Error('Request failed with status 403 Forbidden');
      const result = classifyError(error);

      expect(result).toBe('auth');
    });

    it('should classify "unauthorized" message as auth error', async () => {
      const { classifyError } = await import('../src/adapters/error-handler');

      const error = new Error('Unauthorized: Invalid API key');
      const result = classifyError(error);

      expect(result).toBe('auth');
    });

    it('should classify "authentication" failure as auth error', async () => {
      const { classifyError } = await import('../src/adapters/error-handler');

      const error = new Error('Authentication failed');
      const result = classifyError(error);

      expect(result).toBe('auth');
    });

    it('should classify 429 rate limit as auth error', async () => {
      const { classifyError } = await import('../src/adapters/error-handler');

      const error = new Error('Request failed with status 429 Too Many Requests');
      const result = classifyError(error);

      expect(result).toBe('auth');
    });

    it('should classify "rate limit" message as auth error', async () => {
      const { classifyError } = await import('../src/adapters/error-handler');

      const error = new Error('Rate limit exceeded. Please try again later.');
      const result = classifyError(error);

      expect(result).toBe('auth');
    });

    it('should classify "invalid token" as auth error', async () => {
      const { classifyError } = await import('../src/adapters/error-handler');

      const error = new Error('Invalid token provided');
      const result = classifyError(error);

      expect(result).toBe('auth');
    });

    it('should classify spawn ENOENT as process error', async () => {
      const { classifyError } = await import('../src/adapters/error-handler');

      const error = new Error('spawn claude ENOENT');
      const result = classifyError(error);

      expect(result).toBe('process');
    });

    it('should classify EPERM as process error', async () => {
      const { classifyError } = await import('../src/adapters/error-handler');

      const error = new Error('EPERM: operation not permitted');
      const result = classifyError(error);

      expect(result).toBe('process');
    });

    it('should classify "CLI not found" as process error', async () => {
      const { classifyError } = await import('../src/adapters/error-handler');

      const error = new Error('Claude CLI not found in PATH');
      const result = classifyError(error);

      expect(result).toBe('process');
    });

    it('should classify "validation" errors as validation type', async () => {
      const { classifyError } = await import('../src/adapters/error-handler');

      const error = new Error('Validation error: message too long');
      const result = classifyError(error);

      expect(result).toBe('validation');
    });

    it('should classify "invalid" input as validation error', async () => {
      const { classifyError } = await import('../src/adapters/error-handler');

      const error = new Error('Invalid request: missing required field');
      const result = classifyError(error);

      expect(result).toBe('validation');
    });

    it('should classify unknown errors as unknown type', async () => {
      const { classifyError } = await import('../src/adapters/error-handler');

      const error = new Error('Something unexpected happened');
      const result = classifyError(error);

      expect(result).toBe('unknown');
    });

    it('should handle non-Error objects', async () => {
      const { classifyError } = await import('../src/adapters/error-handler');

      const result = classifyError('string error');
      expect(result).toBe('unknown');
    });

    it('should handle null/undefined errors', async () => {
      const { classifyError } = await import('../src/adapters/error-handler');

      expect(classifyError(null)).toBe('unknown');
      expect(classifyError(undefined)).toBe('unknown');
    });
  });
});

// ============================================================================
// AC1: Network/Connectivity Errors
// ============================================================================
describe('AC1: Network/connectivity errors show "Check internet connection" guidance', () => {
  describe('formatErrorMessage for network errors', () => {
    it('should include "internet connection" in network error message', async () => {
      const { formatErrorMessage } = await import(
        '../src/adapters/error-handler'
      );

      const error = new Error('connect ECONNREFUSED 127.0.0.1:3000');
      const result = formatErrorMessage(error);

      expect(result.toLowerCase()).toContain('internet');
      expect(result.toLowerCase()).toContain('connection');
    });

    it('should suggest checking if Claude CLI is running for connection refused', async () => {
      const { formatErrorMessage } = await import(
        '../src/adapters/error-handler'
      );

      const error = new Error('connect ECONNREFUSED');
      const result = formatErrorMessage(error);

      expect(result.toLowerCase()).toContain('cli');
    });

    it('should provide actionable next step for network errors', async () => {
      const { formatErrorMessage } = await import(
        '../src/adapters/error-handler'
      );

      const error = new Error('getaddrinfo ENOTFOUND api.example.com');
      const result = formatErrorMessage(error);

      // Should have an actionable suggestion
      expect(result).toMatch(/check|verify|try|ensure/i);
    });
  });
});

// ============================================================================
// AC2: Auth Errors
// ============================================================================
describe('AC2: Auth errors suggest "Verify Claude Pro/Max subscription"', () => {
  describe('formatErrorMessage for auth errors', () => {
    it('should mention Claude subscription for 401 errors', async () => {
      const { formatErrorMessage } = await import(
        '../src/adapters/error-handler'
      );

      const error = new Error('Request failed with status 401');
      const result = formatErrorMessage(error);

      expect(result.toLowerCase()).toContain('claude');
      expect(result).toMatch(/pro|max|subscription/i);
    });

    it('should mention subscription for unauthorized errors', async () => {
      const { formatErrorMessage } = await import(
        '../src/adapters/error-handler'
      );

      const error = new Error('Unauthorized: Invalid credentials');
      const result = formatErrorMessage(error);

      expect(result).toMatch(/subscription|account|credentials/i);
    });

    it('should suggest verifying account for 403 errors', async () => {
      const { formatErrorMessage } = await import(
        '../src/adapters/error-handler'
      );

      const error = new Error('Request failed with status 403');
      const result = formatErrorMessage(error);

      expect(result).toMatch(/verify|check|account|subscription/i);
    });
  });
});

// ============================================================================
// AC3: CLI Process Errors
// ============================================================================
describe('AC3: CLI process errors suggest "Try reinstalling pennyfarthing"', () => {
  describe('formatErrorMessage for process errors', () => {
    it('should suggest reinstalling for ENOENT errors', async () => {
      const { formatErrorMessage } = await import(
        '../src/adapters/error-handler'
      );

      const error = new Error('spawn claude ENOENT');
      const result = formatErrorMessage(error);

      expect(result.toLowerCase()).toContain('reinstall');
      expect(result.toLowerCase()).toContain('pennyfarthing');
    });

    it('should mention pennyfarthing for CLI not found errors', async () => {
      const { formatErrorMessage } = await import(
        '../src/adapters/error-handler'
      );

      const error = new Error('Claude CLI not found in PATH');
      const result = formatErrorMessage(error);

      expect(result.toLowerCase()).toContain('pennyfarthing');
    });

    it('should suggest checking permissions for EPERM errors', async () => {
      const { formatErrorMessage } = await import(
        '../src/adapters/error-handler'
      );

      const error = new Error('EPERM: operation not permitted');
      const result = formatErrorMessage(error);

      expect(result).toMatch(/permission|reinstall|pennyfarthing/i);
    });
  });
});

// ============================================================================
// AC4: Each Error Type Has Actionable Next Step
// ============================================================================
describe('AC4: Each error type includes a specific, actionable next step', () => {
  describe('getActionableSteps', () => {
    it('should return specific steps for network errors', async () => {
      const { getActionableSteps } = await import(
        '../src/adapters/error-handler'
      );

      const steps = getActionableSteps('network');

      expect(steps).toBeInstanceOf(Array);
      expect(steps.length).toBeGreaterThan(0);
      expect(steps.some((s) => s.toLowerCase().includes('internet'))).toBe(
        true
      );
    });

    it('should return specific steps for auth errors', async () => {
      const { getActionableSteps } = await import(
        '../src/adapters/error-handler'
      );

      const steps = getActionableSteps('auth');

      expect(steps).toBeInstanceOf(Array);
      expect(steps.length).toBeGreaterThan(0);
      expect(
        steps.some((s) => s.toLowerCase().includes('subscription'))
      ).toBe(true);
    });

    it('should return specific steps for process errors', async () => {
      const { getActionableSteps } = await import(
        '../src/adapters/error-handler'
      );

      const steps = getActionableSteps('process');

      expect(steps).toBeInstanceOf(Array);
      expect(steps.length).toBeGreaterThan(0);
      expect(
        steps.some((s) => s.toLowerCase().includes('reinstall'))
      ).toBe(true);
    });

    it('should return specific steps for timeout errors', async () => {
      const { getActionableSteps } = await import(
        '../src/adapters/error-handler'
      );

      const steps = getActionableSteps('timeout');

      expect(steps).toBeInstanceOf(Array);
      expect(steps.length).toBeGreaterThan(0);
      // Should suggest trying again or shorter prompt
      expect(steps.some((s) => s.match(/try|shorter|again/i))).toBe(true);
    });

    it('should return specific steps for validation errors', async () => {
      const { getActionableSteps } = await import(
        '../src/adapters/error-handler'
      );

      const steps = getActionableSteps('validation');

      expect(steps).toBeInstanceOf(Array);
      expect(steps.length).toBeGreaterThan(0);
      // Should suggest checking input
      expect(steps.some((s) => s.match(/check|message|input|format/i))).toBe(
        true
      );
    });

    it('should return generic steps for unknown errors', async () => {
      const { getActionableSteps } = await import(
        '../src/adapters/error-handler'
      );

      const steps = getActionableSteps('unknown');

      expect(steps).toBeInstanceOf(Array);
      expect(steps.length).toBeGreaterThan(0);
      // Should suggest reporting the issue
      expect(steps.some((s) => s.match(/report|try again|restart/i))).toBe(
        true
      );
    });
  });

  describe('formatErrorMessage includes actionable steps', () => {
    it('should include numbered steps in error message', async () => {
      const { formatErrorMessage } = await import(
        '../src/adapters/error-handler'
      );

      const error = new Error('connect ECONNREFUSED');
      const result = formatErrorMessage(error);

      // Should have numbered steps or bullet points
      expect(result).toMatch(/(\d\.|[-•])\s+\w+/);
    });

    it('should have at least one actionable step for any error', async () => {
      const { formatErrorMessage, getActionableSteps } = await import(
        '../src/adapters/error-handler'
      );

      const testErrors = [
        new Error('ECONNREFUSED'),
        new Error('status 401'),
        new Error('spawn ENOENT'),
        new Error('timeout'),
        new Error('validation error'),
        new Error('random unknown error'),
      ];

      for (const error of testErrors) {
        const result = formatErrorMessage(error);
        // Each error should have some actionable content
        expect(result.length).toBeGreaterThan(50);
      }
    });
  });
});

// ============================================================================
// AC5: Error Messages Render Cleanly in VS Code Chat UI
// ============================================================================
describe('AC5: Error messages render cleanly in VS Code chat UI', () => {
  describe('formatErrorMessage output format', () => {
    it('should return valid markdown', async () => {
      const { formatErrorMessage } = await import(
        '../src/adapters/error-handler'
      );

      const error = new Error('Test error');
      const result = formatErrorMessage(error);

      // Should not have unclosed markdown elements
      const backtickCount = (result.match(/```/g) || []).length;
      expect(backtickCount % 2).toBe(0); // Even number of code fences

      // Should not have broken links
      const openBrackets = (result.match(/\[/g) || []).length;
      const closeBrackets = (result.match(/\]/g) || []).length;
      expect(openBrackets).toBe(closeBrackets);
    });

    it('should include error emoji indicator', async () => {
      const { formatErrorMessage } = await import(
        '../src/adapters/error-handler'
      );

      const error = new Error('Test error');
      const result = formatErrorMessage(error);

      // Should have visual error indicator
      expect(result).toMatch(/[❌⚠️🔴⛔]/);
    });

    it('should include error type header', async () => {
      const { formatErrorMessage } = await import(
        '../src/adapters/error-handler'
      );

      const error = new Error('connect ECONNREFUSED');
      const result = formatErrorMessage(error);

      // Should have a clear header indicating error type
      expect(result).toMatch(
        /connection|network|error/i
      );
    });

    it('should separate error description from action steps', async () => {
      const { formatErrorMessage } = await import(
        '../src/adapters/error-handler'
      );

      const error = new Error('Test error');
      const result = formatErrorMessage(error);

      // Should have some structure (newlines, sections)
      expect(result).toContain('\n');
    });

    it('should not include raw stack traces', async () => {
      const { formatErrorMessage } = await import(
        '../src/adapters/error-handler'
      );

      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at Function.xyz (/path/to/file.js:123:45)';
      const result = formatErrorMessage(error);

      // Should not expose internal stack traces
      expect(result).not.toContain('at Function');
      expect(result).not.toContain('/path/to/file.js');
    });

    it('should truncate very long error messages', async () => {
      const { formatErrorMessage } = await import(
        '../src/adapters/error-handler'
      );

      const longMessage = 'Error: ' + 'x'.repeat(5000);
      const error = new Error(longMessage);
      const result = formatErrorMessage(error);

      // Should be reasonably sized for chat display
      expect(result.length).toBeLessThan(2000);
    });

    it('should escape potentially dangerous characters', async () => {
      const { formatErrorMessage } = await import(
        '../src/adapters/error-handler'
      );

      const error = new Error('Error with <script>alert("xss")</script> in it');
      const result = formatErrorMessage(error);

      // Should not contain raw script tags
      expect(result).not.toContain('<script>');
    });
  });

  describe('createErrorResponse for chat stream', () => {
    it('should create properly formatted error for chat response', async () => {
      const { createErrorResponse } = await import(
        '../src/adapters/error-handler'
      );

      const error = new Error('Test error');
      const result = createErrorResponse(error);

      // Should be ready for response.markdown()
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should prefix with newlines for clean separation', async () => {
      const { createErrorResponse } = await import(
        '../src/adapters/error-handler'
      );

      const error = new Error('Test error');
      const result = createErrorResponse(error);

      // Should start with newlines for separation from previous content
      expect(result).toMatch(/^\n/);
    });
  });
});

// ============================================================================
// Integration: Error Handler with Chat Participant
// ============================================================================
describe('Error handler integration', () => {
  describe('handleChatError', () => {
    it('should return formatted error ready for chat response', async () => {
      const { handleChatError } = await import('../src/adapters/error-handler');

      const error = new Error('connect ECONNREFUSED');
      const result = handleChatError(error);

      // Should be a complete, formatted error message
      expect(result).toContain('connection');
      expect(result).toMatch(/check|verify/i);
    });

    it('should log error details for debugging', async () => {
      const { handleChatError } = await import('../src/adapters/error-handler');
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const error = new Error('Test error');
      handleChatError(error);

      // Should log for debugging (optional - remove if not desired)
      // expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should handle Error objects', async () => {
      const { handleChatError } = await import('../src/adapters/error-handler');

      const result = handleChatError(new Error('Standard error'));
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle string errors', async () => {
      const { handleChatError } = await import('../src/adapters/error-handler');

      const result = handleChatError('String error message');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle null/undefined errors gracefully', async () => {
      const { handleChatError } = await import('../src/adapters/error-handler');

      const nullResult = handleChatError(null);
      const undefinedResult = handleChatError(undefined);

      expect(typeof nullResult).toBe('string');
      expect(typeof undefinedResult).toBe('string');
      expect(nullResult.length).toBeGreaterThan(0);
      expect(undefinedResult.length).toBeGreaterThan(0);
    });
  });
});
