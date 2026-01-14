/**
 * 33-4: Spot Permission Grants
 *
 * Tests for three grant scopes: "once", "session", "always".
 * Written in RED phase - tests should fail until Dev implements functionality.
 *
 * Acceptance Criteria:
 * - AC1: Three grant scopes implemented (once, session, always)
 * - AC2: UI reflects scope selection (three buttons) - MANUAL TEST
 * - AC3: Session grants clear on exit (memory only)
 * - AC4: Persistent grants survive restart (settings.local.json)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// =============================================================================
// AC1: Three grant scopes implemented (once, session, always)
// =============================================================================
describe('AC1: Three grant scopes implemented', () => {
  beforeEach(async () => {
    vi.resetModules();
  });

  describe('PermissionGrant type', () => {
    it('should export PermissionGrant type with grant_type field', async () => {
      const settingsStore = await import('../src/settings-store.js');

      // Type should support grant_type: 'once' | 'session' | 'always'
      expect(settingsStore.GrantType).toBeDefined();
      expect(settingsStore.GrantType.ONCE).toBe('once');
      expect(settingsStore.GrantType.SESSION).toBe('session');
      expect(settingsStore.GrantType.ALWAYS).toBe('always');
    });

    it('should export addGrant function', async () => {
      const settingsStore = await import('../src/settings-store.js');
      expect(settingsStore.addGrant).toBeDefined();
      expect(typeof settingsStore.addGrant).toBe('function');
    });

    it('should export checkGrant function', async () => {
      const settingsStore = await import('../src/settings-store.js');
      expect(settingsStore.checkGrant).toBeDefined();
      expect(typeof settingsStore.checkGrant).toBe('function');
    });

    it('should export getGrants function', async () => {
      const settingsStore = await import('../src/settings-store.js');
      expect(settingsStore.getGrants).toBeDefined();
      expect(typeof settingsStore.getGrants).toBe('function');
    });

    it('should export removeGrant function', async () => {
      const settingsStore = await import('../src/settings-store.js');
      expect(settingsStore.removeGrant).toBeDefined();
      expect(typeof settingsStore.removeGrant).toBe('function');
    });
  });

  describe('addGrant function', () => {
    it('should add a grant with once scope', async () => {
      const settingsStore = await import('../src/settings-store.js');
      settingsStore.clearAllGrants();

      settingsStore.addGrant({
        tool: 'Bash',
        scope: 'git *',
        grant_type: 'once',
        granted_at: new Date().toISOString(),
      });

      const grants = settingsStore.getGrants();
      expect(grants.length).toBe(1);
      expect(grants[0].tool).toBe('Bash');
      expect(grants[0].scope).toBe('git *');
      expect(grants[0].grant_type).toBe('once');
    });

    it('should add a grant with session scope', async () => {
      const settingsStore = await import('../src/settings-store.js');
      settingsStore.clearAllGrants();

      settingsStore.addGrant({
        tool: 'Bash',
        scope: 'npm *',
        grant_type: 'session',
        granted_at: new Date().toISOString(),
      });

      const grants = settingsStore.getGrants();
      expect(grants.length).toBe(1);
      expect(grants[0].grant_type).toBe('session');
    });

    it('should add a grant with always scope', async () => {
      const settingsStore = await import('../src/settings-store.js');
      settingsStore.clearAllGrants();

      settingsStore.addGrant({
        tool: 'Bash',
        scope: 'just *',
        grant_type: 'always',
        granted_at: new Date().toISOString(),
      });

      const grants = settingsStore.getGrants();
      expect(grants.length).toBe(1);
      expect(grants[0].grant_type).toBe('always');
    });
  });

  describe('checkGrant function', () => {
    it('should return true when matching grant exists', async () => {
      const settingsStore = await import('../src/settings-store.js');
      settingsStore.clearAllGrants();

      settingsStore.addGrant({
        tool: 'Bash',
        scope: 'git *',
        grant_type: 'session',
        granted_at: new Date().toISOString(),
      });

      expect(settingsStore.checkGrant('Bash', 'git status')).toBe(true);
      expect(settingsStore.checkGrant('Bash', 'git commit')).toBe(true);
    });

    it('should return false when no matching grant exists', async () => {
      const settingsStore = await import('../src/settings-store.js');
      settingsStore.clearAllGrants();

      settingsStore.addGrant({
        tool: 'Bash',
        scope: 'git *',
        grant_type: 'session',
        granted_at: new Date().toISOString(),
      });

      expect(settingsStore.checkGrant('Bash', 'npm install')).toBe(false);
      expect(settingsStore.checkGrant('WebFetch', 'git status')).toBe(false);
    });

    it('should auto-revoke once grant after first check', async () => {
      const settingsStore = await import('../src/settings-store.js');
      settingsStore.clearAllGrants();

      settingsStore.addGrant({
        tool: 'Bash',
        scope: 'rm *',
        grant_type: 'once',
        granted_at: new Date().toISOString(),
      });

      // First check should return true and revoke
      expect(settingsStore.checkGrant('Bash', 'rm file.txt')).toBe(true);

      // Second check should return false (grant consumed)
      expect(settingsStore.checkGrant('Bash', 'rm other.txt')).toBe(false);
    });

    it('should NOT auto-revoke session grants', async () => {
      const settingsStore = await import('../src/settings-store.js');
      settingsStore.clearAllGrants();

      settingsStore.addGrant({
        tool: 'Bash',
        scope: 'npm *',
        grant_type: 'session',
        granted_at: new Date().toISOString(),
      });

      // Multiple checks should all return true
      expect(settingsStore.checkGrant('Bash', 'npm install')).toBe(true);
      expect(settingsStore.checkGrant('Bash', 'npm test')).toBe(true);
      expect(settingsStore.checkGrant('Bash', 'npm run build')).toBe(true);
    });

    it('should NOT auto-revoke always grants', async () => {
      const settingsStore = await import('../src/settings-store.js');
      settingsStore.clearAllGrants();

      settingsStore.addGrant({
        tool: 'Bash',
        scope: 'just *',
        grant_type: 'always',
        granted_at: new Date().toISOString(),
      });

      // Multiple checks should all return true
      expect(settingsStore.checkGrant('Bash', 'just test')).toBe(true);
      expect(settingsStore.checkGrant('Bash', 'just build')).toBe(true);
      expect(settingsStore.checkGrant('Bash', 'just dev')).toBe(true);
    });
  });
});

// =============================================================================
// AC2: UI reflects scope selection (three buttons)
// =============================================================================
describe('AC2: UI reflects scope selection (three buttons)', () => {
  describe('ApprovalModal buttons', () => {
    it('should have Allow Once button', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');
      expect(approvalModal.handleAllowOnce).toBeDefined();
      expect(typeof approvalModal.handleAllowOnce).toBe('function');
    });

    it('should have Allow Session button', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');
      expect(approvalModal.handleAllowSession).toBeDefined();
      expect(typeof approvalModal.handleAllowSession).toBe('function');
    });

    it('should return grantScope: once for Allow Once button', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      const mockSendResponse = vi.fn();
      approvalModal.setResponseCallback(mockSendResponse);

      const toolId = 'test-once-1';
      approvalModal.showApprovalModal('rm file.txt', toolId);
      approvalModal.handleAllowOnce();

      expect(mockSendResponse).toHaveBeenCalledWith({
        toolId: toolId,
        approved: true,
        grantScope: 'once',
      });
    });

    it('should return grantScope: session for Allow Session button', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      const mockSendResponse = vi.fn();
      approvalModal.setResponseCallback(mockSendResponse);

      const toolId = 'test-session-1';
      approvalModal.showApprovalModal('npm install', toolId);
      approvalModal.handleAllowSession();

      expect(mockSendResponse).toHaveBeenCalledWith({
        toolId: toolId,
        approved: true,
        grantScope: 'session',
      });
    });

    it('should return grantScope: always for Always Allow button', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      const mockSendResponse = vi.fn();
      approvalModal.setResponseCallback(mockSendResponse);

      const toolId = 'test-always-1';
      approvalModal.showApprovalModal('git status', toolId);
      approvalModal.handleAlwaysAllow();

      expect(mockSendResponse).toHaveBeenCalledWith({
        toolId: toolId,
        approved: true,
        grantScope: 'always',
      });
    });
  });

  describe('approval-gate resolveApproval', () => {
    it('should accept grantScope parameter', async () => {
      const approvalGate = await import('../src/approval-gate.js');

      // resolveApproval signature should be:
      // resolveApproval(toolId: string, approved: boolean, grantScope?: GrantScope)
      expect(approvalGate.resolveApproval.length).toBeGreaterThanOrEqual(2);
    });

    it('should add once grant when grantScope is once', async () => {
      const approvalGate = await import('../src/approval-gate.js');
      const settingsStore = await import('../src/settings-store.js');

      settingsStore.clearAllGrants();

      const toolId = 'test-once-grant';
      approvalGate.requestApproval('rm temp.txt', toolId);
      approvalGate.resolveApproval(toolId, true, 'once');

      // Should have added a once grant
      const grants = settingsStore.getGrants();
      const onceGrant = grants.find((g) => g.grant_type === 'once');
      expect(onceGrant).toBeDefined();
      expect(onceGrant?.scope).toBe('rm *');
    });

    it('should add session grant when grantScope is session', async () => {
      const approvalGate = await import('../src/approval-gate.js');
      const settingsStore = await import('../src/settings-store.js');

      settingsStore.clearAllGrants();

      const toolId = 'test-session-grant';
      approvalGate.requestApproval('npm install', toolId);
      approvalGate.resolveApproval(toolId, true, 'session');

      // Should have added a session grant
      const grants = settingsStore.getGrants();
      const sessionGrant = grants.find((g) => g.grant_type === 'session');
      expect(sessionGrant).toBeDefined();
      expect(sessionGrant?.scope).toBe('npm *');
    });

    it('should add always grant when grantScope is always', async () => {
      const approvalGate = await import('../src/approval-gate.js');
      const settingsStore = await import('../src/settings-store.js');

      settingsStore.clearAllGrants();

      const toolId = 'test-always-grant';
      approvalGate.requestApproval('just test', toolId);
      approvalGate.resolveApproval(toolId, true, 'always');

      // Should have added an always grant
      const grants = settingsStore.getGrants();
      const alwaysGrant = grants.find((g) => g.grant_type === 'always');
      expect(alwaysGrant).toBeDefined();
      expect(alwaysGrant?.scope).toBe('just *');
    });
  });
});

// =============================================================================
// AC3: Session grants clear on exit (memory only)
// =============================================================================
describe('AC3: Session grants clear on exit', () => {
  beforeEach(async () => {
    vi.resetModules();
  });

  it('should export clearSessionGrants function', async () => {
    const settingsStore = await import('../src/settings-store.js');
    expect(settingsStore.clearSessionGrants).toBeDefined();
    expect(typeof settingsStore.clearSessionGrants).toBe('function');
  });

  it('should clear only session grants, not always grants', async () => {
    const settingsStore = await import('../src/settings-store.js');
    settingsStore.clearAllGrants();

    // Add one session grant and one always grant
    settingsStore.addGrant({
      tool: 'Bash',
      scope: 'npm *',
      grant_type: 'session',
      granted_at: new Date().toISOString(),
    });

    settingsStore.addGrant({
      tool: 'Bash',
      scope: 'git *',
      grant_type: 'always',
      granted_at: new Date().toISOString(),
    });

    expect(settingsStore.getGrants().length).toBe(2);

    // Clear session grants
    settingsStore.clearSessionGrants();

    // Only always grant should remain
    const grants = settingsStore.getGrants();
    expect(grants.length).toBe(1);
    expect(grants[0].grant_type).toBe('always');
    expect(grants[0].scope).toBe('git *');
  });

  it('should clear once grants when clearing session grants', async () => {
    const settingsStore = await import('../src/settings-store.js');
    settingsStore.clearAllGrants();

    // Add one once grant
    settingsStore.addGrant({
      tool: 'Bash',
      scope: 'rm *',
      grant_type: 'once',
      granted_at: new Date().toISOString(),
    });

    expect(settingsStore.getGrants().length).toBe(1);

    // Clear session grants (should also clear once grants)
    settingsStore.clearSessionGrants();

    // No grants should remain
    expect(settingsStore.getGrants().length).toBe(0);
  });

  it('should store session grants in memory only (not file)', async () => {
    const settingsStore = await import('../src/settings-store.js');
    settingsStore.clearAllGrants();

    // Add session grant
    settingsStore.addGrant({
      tool: 'Bash',
      scope: 'npm *',
      grant_type: 'session',
      granted_at: new Date().toISOString(),
    });

    // getSessionGrants should only return in-memory grants
    expect(settingsStore.getSessionGrants).toBeDefined();
    const sessionGrants = settingsStore.getSessionGrants();
    expect(sessionGrants.length).toBe(1);
    expect(sessionGrants[0].grant_type).toBe('session');
  });
});

// =============================================================================
// AC4: Persistent grants survive restart (settings.local.json)
// =============================================================================
describe('AC4: Persistent grants survive restart', () => {
  beforeEach(async () => {
    vi.resetModules();
  });

  it('should export persistAlwaysGrant function', async () => {
    const settingsStore = await import('../src/settings-store.js');
    expect(settingsStore.persistAlwaysGrant).toBeDefined();
    expect(typeof settingsStore.persistAlwaysGrant).toBe('function');
  });

  it('should export loadPersistedGrants function', async () => {
    const settingsStore = await import('../src/settings-store.js');
    expect(settingsStore.loadPersistedGrants).toBeDefined();
    expect(typeof settingsStore.loadPersistedGrants).toBe('function');
  });

  it('should persist always grants to settings file', async () => {
    const settingsStore = await import('../src/settings-store.js');
    settingsStore.clearAllGrants();

    // Add always grant
    const grant = {
      tool: 'Bash',
      scope: 'git *',
      grant_type: 'always' as const,
      granted_at: new Date().toISOString(),
    };

    settingsStore.addGrant(grant);

    // persistAlwaysGrant should be called for always grants
    // This would write to .claude/settings.local.json
    const persisted = settingsStore.getPersistedGrants();
    expect(persisted.length).toBeGreaterThanOrEqual(1);
    expect(persisted.find((g) => g.scope === 'git *')).toBeDefined();
  });

  it('should NOT persist session grants to settings file', async () => {
    const settingsStore = await import('../src/settings-store.js');
    settingsStore.clearAllGrants();

    // Add session grant
    settingsStore.addGrant({
      tool: 'Bash',
      scope: 'npm *',
      grant_type: 'session',
      granted_at: new Date().toISOString(),
    });

    // Session grants should NOT be in persisted grants
    const persisted = settingsStore.getPersistedGrants();
    const sessionGrant = persisted.find((g) => g.scope === 'npm *');
    expect(sessionGrant).toBeUndefined();
  });

  it('should NOT persist once grants to settings file', async () => {
    const settingsStore = await import('../src/settings-store.js');
    settingsStore.clearAllGrants();

    // Add once grant
    settingsStore.addGrant({
      tool: 'Bash',
      scope: 'rm *',
      grant_type: 'once',
      granted_at: new Date().toISOString(),
    });

    // Once grants should NOT be in persisted grants
    const persisted = settingsStore.getPersistedGrants();
    const onceGrant = persisted.find((g) => g.scope === 'rm *');
    expect(onceGrant).toBeUndefined();
  });

  it('should load persisted grants on startup', async () => {
    const settingsStore = await import('../src/settings-store.js');

    // loadPersistedGrants should populate grants from file
    settingsStore.loadPersistedGrants();

    // Should have loaded any persisted always grants
    const grants = settingsStore.getGrants();
    const alwaysGrants = grants.filter((g) => g.grant_type === 'always');
    // At minimum, the function should work without error
    expect(Array.isArray(alwaysGrants)).toBe(true);
  });

  it('should merge persisted grants with session grants', async () => {
    const settingsStore = await import('../src/settings-store.js');
    settingsStore.clearAllGrants();

    // Load persisted grants first
    settingsStore.loadPersistedGrants();

    // Add a session grant
    settingsStore.addGrant({
      tool: 'Bash',
      scope: 'npm *',
      grant_type: 'session',
      granted_at: new Date().toISOString(),
    });

    // Should have both types available
    const grants = settingsStore.getGrants();
    const sessionGrants = grants.filter((g) => g.grant_type === 'session');
    expect(sessionGrants.length).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// Integration: approval-gate with grant scopes
// =============================================================================
describe('Integration: approval-gate with grant scopes', () => {
  beforeEach(async () => {
    vi.resetModules();
  });

  it('should skip approval for commands matching existing grants', async () => {
    const settingsStore = await import('../src/settings-store.js');
    const approvalGate = await import('../src/approval-gate.js');

    settingsStore.clearAllGrants();
    settingsStore.setBashApprovalGate(true);

    // Add session grant for npm
    settingsStore.addGrant({
      tool: 'Bash',
      scope: 'npm *',
      grant_type: 'session',
      granted_at: new Date().toISOString(),
    });

    // interceptBashToolUse should check grants
    const npmResult = approvalGate.interceptBashToolUse({
      type: 'tool_use',
      tool_name: 'Bash',
      tool_id: 'test-1',
      input: { command: 'npm install' },
    });

    // Should NOT require approval (grant exists)
    expect(npmResult.shouldApprove).toBe(false);

    // But git should still require approval
    const gitResult = approvalGate.interceptBashToolUse({
      type: 'tool_use',
      tool_name: 'Bash',
      tool_id: 'test-2',
      input: { command: 'git push' },
    });

    expect(gitResult.shouldApprove).toBe(true);

    // Cleanup
    settingsStore.setBashApprovalGate(false);
  });

  it('should consume once grant after command execution', async () => {
    const settingsStore = await import('../src/settings-store.js');
    const approvalGate = await import('../src/approval-gate.js');

    settingsStore.clearAllGrants();
    settingsStore.setBashApprovalGate(true);

    // Add once grant for rm
    settingsStore.addGrant({
      tool: 'Bash',
      scope: 'rm *',
      grant_type: 'once',
      granted_at: new Date().toISOString(),
    });

    // First check - should not require approval
    const firstResult = approvalGate.interceptBashToolUse({
      type: 'tool_use',
      tool_name: 'Bash',
      tool_id: 'test-once-1',
      input: { command: 'rm temp.txt' },
    });

    expect(firstResult.shouldApprove).toBe(false);

    // Second check - grant consumed, should require approval
    const secondResult = approvalGate.interceptBashToolUse({
      type: 'tool_use',
      tool_name: 'Bash',
      tool_id: 'test-once-2',
      input: { command: 'rm other.txt' },
    });

    expect(secondResult.shouldApprove).toBe(true);

    // Cleanup
    settingsStore.setBashApprovalGate(false);
  });
});
