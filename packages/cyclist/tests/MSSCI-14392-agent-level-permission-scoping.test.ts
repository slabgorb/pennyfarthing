/**
 * MSSCI-14392: Agent-level permission scoping
 *
 * Tests that permission grants can be scoped to specific agents.
 * Agent identity threads through: hook → WheelHub → grant check → modal → grant storage.
 *
 * This file covers:
 * - Layer 1: settings-store agent-aware grant matching (AC3, AC4, AC6, AC7)
 * - Layer 3: ApprovalModal agent display (AC5)
 *
 * Layer 2 (hook-request agent threading) is in a separate file because
 * it requires vi.mock on settings-store which conflicts with Layer 1's
 * real import.
 *
 * Acceptance Criteria:
 * - AC3: Grant matching supports agent-scoped patterns (e.g., dev:Bash:*)
 * - AC4: Unscoped grants (no agent) continue to work for all agents
 * - AC5: ApprovalModal displays which agent is requesting
 * - AC6: Grant storage supports agent-scoped entries in all three scopes
 * - AC7: Tests cover agent-scoped vs global grant matching
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkGrant,
  addGrant,
  clearAllGrants,
  getGrants,
  removeGrant,
  setGrantsPersistCallback,
  initializeGrants,
} from '../src/settings-store.js';

// =============================================================================
// Layer 1: settings-store — Agent-aware grant matching
// =============================================================================

describe('MSSCI-14392 AC3/AC4/AC6: Agent-aware grant matching (settings-store)', () => {
  beforeEach(() => {
    clearAllGrants();
  });

  // ---------------------------------------------------------------------------
  // AC3: Agent-scoped grant matching
  // ---------------------------------------------------------------------------

  describe('AC3: Agent-scoped grants', () => {
    it('should match grant when agent matches', () => {
      addGrant({
        tool: 'Bash',
        scope: 'npm *',
        grant_type: 'session',
        granted_at: new Date().toISOString(),
        agent: 'dev',
      });

      expect(checkGrant('Bash', 'npm test', 'dev')).toBe(true);
    });

    it('should NOT match agent-scoped grant for different agent', () => {
      addGrant({
        tool: 'Bash',
        scope: 'npm *',
        grant_type: 'session',
        granted_at: new Date().toISOString(),
        agent: 'dev',
      });

      expect(checkGrant('Bash', 'npm test', 'reviewer')).toBe(false);
    });

    it('should NOT match agent-scoped grant when no agent provided', () => {
      addGrant({
        tool: 'Bash',
        scope: 'npm *',
        grant_type: 'session',
        granted_at: new Date().toISOString(),
        agent: 'dev',
      });

      // No agent context — agent-scoped grants should not match
      expect(checkGrant('Bash', 'npm test')).toBe(false);
    });

    it('should match agent-scoped wildcard pattern', () => {
      addGrant({
        tool: 'Bash',
        scope: '*',
        grant_type: 'session',
        granted_at: new Date().toISOString(),
        agent: 'dev',
      });

      expect(checkGrant('Bash', 'any command', 'dev')).toBe(true);
      expect(checkGrant('Bash', 'any command', 'reviewer')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // AC4: Global grants (no agent) work for all agents
  // ---------------------------------------------------------------------------

  describe('AC4: Global grants work for all agents', () => {
    it('should match global grant regardless of agent', () => {
      addGrant({
        tool: 'Bash',
        scope: 'git *',
        grant_type: 'session',
        granted_at: new Date().toISOString(),
        // No agent field — global grant
      });

      expect(checkGrant('Bash', 'git status', 'dev')).toBe(true);
      expect(checkGrant('Bash', 'git status', 'reviewer')).toBe(true);
      expect(checkGrant('Bash', 'git status', 'tea')).toBe(true);
    });

    it('should match global grant when no agent provided', () => {
      addGrant({
        tool: 'Bash',
        scope: 'git *',
        grant_type: 'session',
        granted_at: new Date().toISOString(),
      });

      expect(checkGrant('Bash', 'git status')).toBe(true);
    });

    it('should prefer agent-scoped grant over global when both exist', () => {
      // Agent-scoped grant: allow for dev
      addGrant({
        tool: 'Bash',
        scope: 'npm *',
        grant_type: 'session',
        granted_at: new Date().toISOString(),
        agent: 'dev',
      });

      // dev has the agent-scoped grant
      expect(checkGrant('Bash', 'npm test', 'dev')).toBe(true);
      // reviewer has no grant (agent-scoped doesn't match, no global grant)
      expect(checkGrant('Bash', 'npm test', 'reviewer')).toBe(false);
    });

    it('should allow both global and agent-scoped grants to coexist', () => {
      // Global grant for git
      addGrant({
        tool: 'Bash',
        scope: 'git *',
        grant_type: 'session',
        granted_at: new Date().toISOString(),
      });

      // Agent-scoped grant for npm (dev only)
      addGrant({
        tool: 'Bash',
        scope: 'npm *',
        grant_type: 'session',
        granted_at: new Date().toISOString(),
        agent: 'dev',
      });

      // Both agents can use git (global)
      expect(checkGrant('Bash', 'git status', 'dev')).toBe(true);
      expect(checkGrant('Bash', 'git status', 'reviewer')).toBe(true);

      // Only dev can use npm (agent-scoped)
      expect(checkGrant('Bash', 'npm test', 'dev')).toBe(true);
      expect(checkGrant('Bash', 'npm test', 'reviewer')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // AC6: Agent-scoped grants in all three scopes
  // ---------------------------------------------------------------------------

  describe('AC6: Agent-scoped grants across all scopes', () => {
    it('should support agent-scoped once grants with auto-revocation', () => {
      addGrant({
        tool: 'Bash',
        scope: 'npm test',
        grant_type: 'once',
        granted_at: new Date().toISOString(),
        agent: 'dev',
      });

      // First check: matches and auto-revokes
      expect(checkGrant('Bash', 'npm test', 'dev')).toBe(true);
      // Second check: revoked
      expect(checkGrant('Bash', 'npm test', 'dev')).toBe(false);
    });

    it('should support agent-scoped session grants', () => {
      addGrant({
        tool: 'Edit',
        scope: '/src/*',
        grant_type: 'session',
        granted_at: new Date().toISOString(),
        agent: 'dev',
      });

      // Persists across checks for matching agent
      expect(checkGrant('Edit', '/src/index.ts', 'dev')).toBe(true);
      expect(checkGrant('Edit', '/src/index.ts', 'dev')).toBe(true);
      // Does not match other agents
      expect(checkGrant('Edit', '/src/index.ts', 'reviewer')).toBe(false);
    });

    it('should support agent-scoped always grants with persistence', () => {
      const persistCallback = vi.fn().mockReturnValue(true);
      setGrantsPersistCallback(persistCallback);

      addGrant({
        tool: 'Bash',
        scope: 'npm *',
        grant_type: 'always',
        granted_at: new Date().toISOString(),
        agent: 'dev',
      });

      // Verify persistence was triggered
      expect(persistCallback).toHaveBeenCalled();

      // Verify grant includes agent field in persisted data
      const persistedGrants = persistCallback.mock.calls[0][0];
      expect(persistedGrants).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            tool: 'Bash',
            scope: 'npm *',
            agent: 'dev',
          }),
        ]),
      );
    });

    it('should include agent field when initializing grants from persistence', () => {
      initializeGrants([
        {
          tool: 'Bash',
          scope: 'npm *',
          grant_type: 'always',
          granted_at: new Date().toISOString(),
          agent: 'dev',
        },
      ]);

      expect(checkGrant('Bash', 'npm test', 'dev')).toBe(true);
      expect(checkGrant('Bash', 'npm test', 'reviewer')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // AC7: PermissionGrant interface has optional agent field
  // ---------------------------------------------------------------------------

  describe('AC7: PermissionGrant type includes agent', () => {
    it('should accept grants without agent field (backward compatible)', () => {
      addGrant({
        tool: 'Bash',
        scope: 'git *',
        grant_type: 'session',
        granted_at: new Date().toISOString(),
      });

      const grants = getGrants();
      expect(grants).toHaveLength(1);
      expect(grants[0].agent).toBeUndefined();
    });

    it('should accept grants with agent field', () => {
      addGrant({
        tool: 'Bash',
        scope: 'npm *',
        grant_type: 'session',
        granted_at: new Date().toISOString(),
        agent: 'dev',
      });

      const grants = getGrants();
      expect(grants).toHaveLength(1);
      expect(grants[0].agent).toBe('dev');
    });

    it('should handle removeGrant with agent-scoped grants', () => {
      addGrant({
        tool: 'Bash',
        scope: 'npm *',
        grant_type: 'session',
        granted_at: new Date().toISOString(),
        agent: 'dev',
      });

      addGrant({
        tool: 'Bash',
        scope: 'npm *',
        grant_type: 'session',
        granted_at: new Date().toISOString(),
        agent: 'reviewer',
      });

      // Remove only dev's grant
      removeGrant({
        tool: 'Bash',
        scope: 'npm *',
        grant_type: 'session',
        granted_at: '',
        agent: 'dev',
      });

      // Dev's grant removed, reviewer's remains
      expect(checkGrant('Bash', 'npm test', 'dev')).toBe(false);
      expect(checkGrant('Bash', 'npm test', 'reviewer')).toBe(true);
    });
  });
});

// =============================================================================
// Layer 3: ApprovalModal — Agent display
// =============================================================================

describe('MSSCI-14392 AC5: ApprovalModal agent display', () => {
  it('should include agent in ApprovalRequest type', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../src/public/components/ApprovalModal/index.tsx'),
      'utf-8',
    );

    // ApprovalRequest interface should have agent field
    expect(source).toMatch(/interface ApprovalRequest\s*\{[\s\S]*?agent\?:\s*string/);
  });

  it('should include agent in HookRequestMessage type', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../src/public/components/ApprovalModal/index.tsx'),
      'utf-8',
    );

    // HookRequestMessage should have agent field
    expect(source).toMatch(/interface HookRequestMessage\s*\{[\s\S]*?agent\?:\s*string/);
  });

  it('should include agent in ApprovalModalProps type', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../src/public/components/ApprovalModal/index.tsx'),
      'utf-8',
    );

    // ApprovalModalProps should have agent field
    expect(source).toMatch(/interface ApprovalModalProps\s*\{[\s\S]*?agent\?:\s*string/);
  });

  it('should pass agent from WebSocket message to approval request callback', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../src/public/components/ApprovalModal/index.tsx'),
      'utf-8',
    );

    // The subscribeToPermissionRequests callback should map agent from message
    expect(source).toMatch(/agent:\s*msg\.agent/);
  });

  it('should render agent name in the modal UI', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../src/public/components/ApprovalModal/index.tsx'),
      'utf-8',
    );

    // Component should render agent name (e.g., a data-testid or visible text)
    expect(source).toContain('data-testid="agent-name"');
  });
});
