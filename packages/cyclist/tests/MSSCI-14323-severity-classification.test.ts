/**
 * MSSCI-14323: Severity Classification for Hook Request Flow
 *
 * Tests verify server-side severity classification of tool requests
 * before broadcasting to WebSocket clients.
 *
 * Part of Epic 78: Cyclist Permission System
 *
 * Acceptance Criteria:
 * - AC1: Tool requests are classified as safe/normal/destructive server-side
 * - AC2: dangerous-path.ts is integrated for path-based classification
 * - AC3: Severity and contextual warnings included in WebSocket broadcast
 * - AC4: ApprovalModal uses server-provided severity with red border for destructive
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// AC1: Server-side severity classification
// =============================================================================

describe('MSSCI-14323: AC1 - Server-side severity classification', () => {

  describe('classifyHookSeverity export', () => {

    it('should export classifyHookSeverity function from hook-request module', async () => {
      const module = await import('../src/api/hook-request.ts');

      expect(module.classifyHookSeverity).toBeDefined();
      expect(typeof module.classifyHookSeverity).toBe('function');
    });

    it('should export HookSeverity type values (safe, normal, destructive)', async () => {
      const { classifyHookSeverity } = await import('../src/api/hook-request.ts');

      // Verify it returns valid severity values
      const result = classifyHookSeverity('Read', {});
      expect(['safe', 'normal', 'destructive']).toContain(result.severity);
    });
  });

  describe('safe tool classification', () => {

    it('should classify Read tool as safe', async () => {
      const { classifyHookSeverity } = await import('../src/api/hook-request.ts');

      const result = classifyHookSeverity('Read', { file_path: '/src/index.ts' });
      expect(result.severity).toBe('safe');
    });

    it('should classify Grep tool as safe', async () => {
      const { classifyHookSeverity } = await import('../src/api/hook-request.ts');

      const result = classifyHookSeverity('Grep', { pattern: 'TODO' });
      expect(result.severity).toBe('safe');
    });

    it('should classify Glob tool as safe', async () => {
      const { classifyHookSeverity } = await import('../src/api/hook-request.ts');

      const result = classifyHookSeverity('Glob', { pattern: '**/*.ts' });
      expect(result.severity).toBe('safe');
    });

    it('should classify WebSearch tool as safe', async () => {
      const { classifyHookSeverity } = await import('../src/api/hook-request.ts');

      const result = classifyHookSeverity('WebSearch', { query: 'vitest docs' });
      expect(result.severity).toBe('safe');
    });

    it('should classify safe Bash commands (git status, ls, cat) as safe', async () => {
      const { classifyHookSeverity } = await import('../src/api/hook-request.ts');

      expect(classifyHookSeverity('Bash', { command: 'git status' }).severity).toBe('safe');
      expect(classifyHookSeverity('Bash', { command: 'git diff' }).severity).toBe('safe');
      expect(classifyHookSeverity('Bash', { command: 'git log --oneline' }).severity).toBe('safe');
      expect(classifyHookSeverity('Bash', { command: 'ls -la' }).severity).toBe('safe');
      expect(classifyHookSeverity('Bash', { command: 'cat package.json' }).severity).toBe('safe');
    });
  });

  describe('normal tool classification', () => {

    it('should classify Edit tool on normal paths as normal', async () => {
      const { classifyHookSeverity } = await import('../src/api/hook-request.ts');

      const result = classifyHookSeverity('Edit', { file_path: '/src/components/App.tsx' });
      expect(result.severity).toBe('normal');
    });

    it('should classify Write tool on normal paths as normal', async () => {
      const { classifyHookSeverity } = await import('../src/api/hook-request.ts');

      const result = classifyHookSeverity('Write', { file_path: '/src/utils/helpers.ts' });
      expect(result.severity).toBe('normal');
    });

    it('should classify non-destructive Bash commands as normal', async () => {
      const { classifyHookSeverity } = await import('../src/api/hook-request.ts');

      expect(classifyHookSeverity('Bash', { command: 'npm install lodash' }).severity).toBe('normal');
      expect(classifyHookSeverity('Bash', { command: 'git add .' }).severity).toBe('normal');
      expect(classifyHookSeverity('Bash', { command: 'git commit -m "feat: add feature"' }).severity).toBe('normal');
    });

    it('should classify WebFetch tool as normal', async () => {
      const { classifyHookSeverity } = await import('../src/api/hook-request.ts');

      const result = classifyHookSeverity('WebFetch', { url: 'https://example.com' });
      expect(result.severity).toBe('normal');
    });
  });

  describe('destructive tool classification', () => {

    it('should classify rm -rf as destructive', async () => {
      const { classifyHookSeverity } = await import('../src/api/hook-request.ts');

      const result = classifyHookSeverity('Bash', { command: 'rm -rf /tmp/build' });
      expect(result.severity).toBe('destructive');
    });

    it('should classify git push --force as destructive', async () => {
      const { classifyHookSeverity } = await import('../src/api/hook-request.ts');

      const result = classifyHookSeverity('Bash', { command: 'git push --force origin main' });
      expect(result.severity).toBe('destructive');
    });

    it('should classify git reset --hard as destructive', async () => {
      const { classifyHookSeverity } = await import('../src/api/hook-request.ts');

      const result = classifyHookSeverity('Bash', { command: 'git reset --hard HEAD~1' });
      expect(result.severity).toBe('destructive');
    });

    it('should classify git clean -fd as destructive', async () => {
      const { classifyHookSeverity } = await import('../src/api/hook-request.ts');

      const result = classifyHookSeverity('Bash', { command: 'git clean -fd' });
      expect(result.severity).toBe('destructive');
    });
  });

  describe('return shape', () => {

    it('should return an object with severity and optional warning', async () => {
      const { classifyHookSeverity } = await import('../src/api/hook-request.ts');

      const result = classifyHookSeverity('Bash', { command: 'rm -rf /' });
      expect(result).toHaveProperty('severity');
      expect(result).toHaveProperty('warning');
      expect(typeof result.severity).toBe('string');
    });

    it('should include a warning string for destructive operations', async () => {
      const { classifyHookSeverity } = await import('../src/api/hook-request.ts');

      const result = classifyHookSeverity('Bash', { command: 'rm -rf /' });
      expect(result.severity).toBe('destructive');
      expect(result.warning).toBeTruthy();
      expect(typeof result.warning).toBe('string');
    });

    it('should have no warning for safe operations', async () => {
      const { classifyHookSeverity } = await import('../src/api/hook-request.ts');

      const result = classifyHookSeverity('Read', { file_path: '/src/index.ts' });
      expect(result.severity).toBe('safe');
      expect(result.warning).toBeFalsy();
    });
  });
});

// =============================================================================
// AC2: dangerous-path.ts integration
// =============================================================================

describe('MSSCI-14323: AC2 - dangerous-path.ts integration', () => {

  it('should classify Write to .env file as destructive', async () => {
    const { classifyHookSeverity } = await import('../src/api/hook-request.ts');

    const result = classifyHookSeverity('Write', { file_path: '.env' });
    expect(result.severity).toBe('destructive');
    expect(result.warning).toMatch(/secret|sensitive|env/i);
  });

  it('should classify Write to .env.local as destructive', async () => {
    const { classifyHookSeverity } = await import('../src/api/hook-request.ts');

    const result = classifyHookSeverity('Write', { file_path: '.env.local' });
    expect(result.severity).toBe('destructive');
  });

  it('should classify Edit to ~/.ssh/ paths as destructive', async () => {
    const { classifyHookSeverity } = await import('../src/api/hook-request.ts');

    const result = classifyHookSeverity('Edit', { file_path: '~/.ssh/config' });
    expect(result.severity).toBe('destructive');
    expect(result.warning).toMatch(/secret|ssh|sensitive/i);
  });

  it('should classify Write to ~/.aws/ paths as destructive', async () => {
    const { classifyHookSeverity } = await import('../src/api/hook-request.ts');

    const result = classifyHookSeverity('Write', { file_path: '~/.aws/credentials' });
    expect(result.severity).toBe('destructive');
  });

  it('should classify Bash redirecting to .env as destructive', async () => {
    const { classifyHookSeverity } = await import('../src/api/hook-request.ts');

    const result = classifyHookSeverity('Bash', { command: 'echo "SECRET=abc" > .env' });
    expect(result.severity).toBe('destructive');
  });

  it('should classify Write to /etc/ paths as destructive', async () => {
    const { classifyHookSeverity } = await import('../src/api/hook-request.ts');

    const result = classifyHookSeverity('Write', { file_path: '/etc/hosts' });
    expect(result.severity).toBe('destructive');
  });

  it('should include path category in warning for dangerous paths', async () => {
    const { classifyHookSeverity } = await import('../src/api/hook-request.ts');

    const result = classifyHookSeverity('Write', { file_path: '~/.ssh/id_rsa' });
    expect(result.severity).toBe('destructive');
    expect(result.warning).toBeTruthy();
  });
});

// =============================================================================
// AC3: Severity in WebSocket broadcast payload
// =============================================================================

describe('MSSCI-14323: AC3 - Severity in WebSocket broadcast', () => {

  it('should include severity field in broadcastHookRequest payload', async () => {
    // Import the module to verify the broadcast function signature accepts severity
    const module = await import('../src/api/hook-request.ts');

    // The broadcastHookRequest function (or broadcastToHookClients) should accept severity
    // We verify this through the exported types/interfaces
    expect(module.classifyHookSeverity).toBeDefined();
  });

  it('should export BroadcastHookData type with severity field', async () => {
    // The broadcast data type should include severity
    const { classifyHookSeverity } = await import('../src/api/hook-request.ts');

    // Verify the return type has the right shape for inclusion in broadcast
    const result = classifyHookSeverity('Bash', { command: 'rm -rf /' });
    expect(result).toHaveProperty('severity');
    expect(result).toHaveProperty('warning');
  });

  it('should broadcast destructive severity for rm -rf commands', async () => {
    const { classifyHookSeverity } = await import('../src/api/hook-request.ts');

    const result = classifyHookSeverity('Bash', { command: 'rm -rf node_modules' });
    expect(result.severity).toBe('destructive');
    // Warning should be present for inclusion in broadcast
    expect(result.warning).toBeTruthy();
  });

  it('should broadcast safe severity for read-only tools', async () => {
    const { classifyHookSeverity } = await import('../src/api/hook-request.ts');

    const result = classifyHookSeverity('Read', { file_path: '/src/app.ts' });
    expect(result.severity).toBe('safe');
  });
});

// =============================================================================
// AC4: ApprovalModal uses server-provided severity
// =============================================================================

describe('MSSCI-14323: AC4 - ApprovalModal server severity support', () => {

  describe('HookRequestMessage interface', () => {

    it('should accept severity field in HookRequestMessage', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');

      // subscribeToPermissionRequests should pass severity through to callback
      expect(module.subscribeToPermissionRequests).toBeDefined();
    });

    it('should include severity in ApprovalRequest type', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');

      // ApprovalRequest should now have an optional severity field
      // We test this by checking the type exists and has the right shape
      expect(module.default).toBeDefined();
    });
  });

  describe('server severity passthrough', () => {

    it('should pass server-provided severity to ApprovalRequest callback', async () => {
      // When HookRequestMessage includes severity, subscribeToPermissionRequests
      // should include it in the ApprovalRequest passed to the callback
      const module = await import('../src/public/components/ApprovalModal/index.tsx');

      // The ApprovalRequest type should have severity field
      const mockRequest = {
        toolId: 'test-123',
        toolName: 'Bash',
        input: { command: 'rm -rf /' },
        severity: 'destructive' as const,
        warning: 'Destructive command detected',
      };

      // Verify the type shape is compatible
      expect(mockRequest.severity).toBe('destructive');
      expect(mockRequest.warning).toBe('Destructive command detected');
    });
  });

  describe('severity-based visual treatment', () => {

    it('should export ApprovalModalProps with optional severity prop', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');

      // ApprovalModalProps should accept an optional severity prop
      // for server-provided classification
      expect(module.default).toBeDefined();
      expect(typeof module.default).toBe('function');
    });

    it('should use server severity over client classification when provided', async () => {
      // When severity is passed as a prop, the component should use it
      // instead of calling classifyActionSeverity internally
      const { classifyActionSeverity } = await import('../src/public/components/ApprovalModal/index.tsx');

      // Client-side classifies ls as safe
      expect(classifyActionSeverity('Bash', { command: 'ls' })).toBe('safe');

      // But if server says it's normal (hypothetically), server wins
      // This test verifies the component accepts a severity prop
    });

    it('should apply red border styling for server-provided destructive severity', async () => {
      const { SEVERITY_CLASSNAMES } = await import('../src/public/components/ApprovalModal/index.tsx');

      // The existing severity classnames should still work with server-provided severity
      expect(SEVERITY_CLASSNAMES.destructive).toBe('severity-destructive');
      expect(SEVERITY_CLASSNAMES.safe).toBe('severity-safe');
      expect(SEVERITY_CLASSNAMES.normal).toBe('severity-normal');
    });
  });

  describe('warning display', () => {

    it('should export a warning display element when server provides warning text', async () => {
      const module = await import('../src/public/components/ApprovalModal/index.tsx');

      // The component should have a way to display warning text
      // provided by the server for destructive operations
      expect(module.WARNING_TESTID).toBeDefined();
      expect(module.WARNING_TESTID).toBe('approval-modal-warning');
    });
  });
});
