/**
 * MSSCI-14324: Wire grant persistence across all three scopes
 *
 * Tests the settings-store grant lifecycle WITHOUT mocking the store itself.
 * Verifies once/session/always grants behave correctly end-to-end.
 *
 * Acceptance Criteria:
 * - AC1: `once` grants are auto-revoked after a single use
 * - AC2: `session` grants are cleared when the session ends
 * - AC3: `always` grants persist to file (via callback)
 * - AC4: `always` grants are loaded from file on startup (initializeGrants)
 * - AC5: Glob pattern matching works for grant scopes
 * - AC6: All three grant scopes work end-to-end through the approval flow
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  addGrant,
  checkGrant,
  clearSessionGrants,
  clearAllGrants,
  getGrants,
  getSessionGrants,
  getPersistedGrants,
  initializeGrants,
  setGrantsPersistCallback,
  persistAlwaysGrant,
  removeGrant,
  GrantType,
} from '../src/settings-store.js';
import type { PermissionGrant } from '../src/settings-store.js';

/**
 * Helper to create a grant with defaults
 */
function makeGrant(
  overrides: Partial<PermissionGrant> & { tool: string; scope: string; grant_type: PermissionGrant['grant_type'] }
): PermissionGrant {
  return {
    granted_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('MSSCI-14324: Grant persistence across all three scopes', () => {
  beforeEach(() => {
    // Reset all grant state between tests
    clearAllGrants();
    // Reset persist callback
    setGrantsPersistCallback(() => true);
  });

  // ===========================================================================
  // AC1: `once` grants are auto-revoked after a single use
  // ===========================================================================

  describe('AC1: Once grants auto-revoke after single use', () => {
    it('should approve on first checkGrant call', () => {
      addGrant(makeGrant({ tool: 'Bash', scope: 'npm test', grant_type: 'once' }));

      expect(checkGrant('Bash', 'npm test')).toBe(true);
    });

    it('should deny on second checkGrant call (auto-revoked)', () => {
      addGrant(makeGrant({ tool: 'Bash', scope: 'npm test', grant_type: 'once' }));

      // First use — consumes the grant
      checkGrant('Bash', 'npm test');

      // Second use — grant should be gone
      expect(checkGrant('Bash', 'npm test')).toBe(false);
    });

    it('should remove once grant from session grants after use', () => {
      addGrant(makeGrant({ tool: 'Bash', scope: 'npm test', grant_type: 'once' }));
      expect(getSessionGrants()).toHaveLength(1);

      // Use it
      checkGrant('Bash', 'npm test');

      // Should be removed from session grants
      expect(getSessionGrants()).toHaveLength(0);
    });

    it('should not affect other once grants when one is consumed', () => {
      addGrant(makeGrant({ tool: 'Bash', scope: 'npm test', grant_type: 'once' }));
      addGrant(makeGrant({ tool: 'Bash', scope: 'npm install', grant_type: 'once' }));

      // Consume first grant
      checkGrant('Bash', 'npm test');

      // Second grant should still work
      expect(checkGrant('Bash', 'npm install')).toBe(true);
    });

    it('should auto-revoke once grants for non-Bash tools', () => {
      addGrant(makeGrant({ tool: 'Edit', scope: '/src/index.ts', grant_type: 'once' }));

      expect(checkGrant('Edit', '/src/index.ts')).toBe(true);
      expect(checkGrant('Edit', '/src/index.ts')).toBe(false);
    });
  });

  // ===========================================================================
  // AC2: `session` grants are cleared when the session ends
  // ===========================================================================

  describe('AC2: Session grants clear on session end', () => {
    it('should persist across multiple checkGrant calls within a session', () => {
      addGrant(makeGrant({ tool: 'Bash', scope: 'git status', grant_type: 'session' }));

      expect(checkGrant('Bash', 'git status')).toBe(true);
      expect(checkGrant('Bash', 'git status')).toBe(true);
      expect(checkGrant('Bash', 'git status')).toBe(true);
    });

    it('should be cleared by clearSessionGrants()', () => {
      addGrant(makeGrant({ tool: 'Bash', scope: 'git status', grant_type: 'session' }));

      expect(checkGrant('Bash', 'git status')).toBe(true);

      clearSessionGrants();

      expect(checkGrant('Bash', 'git status')).toBe(false);
    });

    it('should clear all session grants, not just one', () => {
      addGrant(makeGrant({ tool: 'Bash', scope: 'git *', grant_type: 'session' }));
      addGrant(makeGrant({ tool: 'Edit', scope: '/src/*', grant_type: 'session' }));
      addGrant(makeGrant({ tool: 'WebFetch', scope: '*.github.com', grant_type: 'session' }));

      expect(getSessionGrants()).toHaveLength(3);

      clearSessionGrants();

      expect(getSessionGrants()).toHaveLength(0);
      expect(checkGrant('Bash', 'git status')).toBe(false);
      expect(checkGrant('Edit', '/src/index.ts')).toBe(false);
    });

    it('should also clear once grants when session ends', () => {
      addGrant(makeGrant({ tool: 'Bash', scope: 'npm test', grant_type: 'once' }));
      addGrant(makeGrant({ tool: 'Bash', scope: 'npm install', grant_type: 'session' }));

      clearSessionGrants();

      expect(checkGrant('Bash', 'npm test')).toBe(false);
      expect(checkGrant('Bash', 'npm install')).toBe(false);
    });

    it('should NOT clear always grants when session ends', () => {
      addGrant(makeGrant({ tool: 'Bash', scope: 'git *', grant_type: 'always' }));
      addGrant(makeGrant({ tool: 'Bash', scope: 'npm test', grant_type: 'session' }));

      clearSessionGrants();

      // Always grant should survive session clear
      expect(checkGrant('Bash', 'git status')).toBe(true);
      // Session grant should be gone
      expect(checkGrant('Bash', 'npm test')).toBe(false);
    });
  });

  // ===========================================================================
  // AC3: `always` grants persist to file (via callback)
  // ===========================================================================

  describe('AC3: Always grants persist to file via callback', () => {
    it('should call persist callback when always grant is added', () => {
      const persistedData: PermissionGrant[][] = [];
      setGrantsPersistCallback((grants) => {
        persistedData.push([...grants]);
        return true;
      });

      addGrant(makeGrant({ tool: 'Bash', scope: 'git *', grant_type: 'always' }));

      expect(persistedData).toHaveLength(1);
      expect(persistedData[0]).toHaveLength(1);
      expect(persistedData[0][0].tool).toBe('Bash');
      expect(persistedData[0][0].scope).toBe('git *');
      expect(persistedData[0][0].grant_type).toBe('always');
    });

    it('should NOT call persist callback for once grants', () => {
      let callCount = 0;
      setGrantsPersistCallback(() => {
        callCount++;
        return true;
      });

      addGrant(makeGrant({ tool: 'Bash', scope: 'npm test', grant_type: 'once' }));

      expect(callCount).toBe(0);
    });

    it('should NOT call persist callback for session grants', () => {
      let callCount = 0;
      setGrantsPersistCallback(() => {
        callCount++;
        return true;
      });

      addGrant(makeGrant({ tool: 'Bash', scope: 'npm test', grant_type: 'session' }));

      expect(callCount).toBe(0);
    });

    it('should call persist callback when always grant is removed', () => {
      const persistedData: PermissionGrant[][] = [];
      setGrantsPersistCallback((grants) => {
        persistedData.push([...grants]);
        return true;
      });

      const grant = makeGrant({ tool: 'Bash', scope: 'git *', grant_type: 'always' });
      addGrant(grant);
      removeGrant(grant);

      // Should have been called twice: once on add, once on remove
      expect(persistedData).toHaveLength(2);
      // After removal, persisted grants should be empty
      expect(persistedData[1]).toHaveLength(0);
    });

    it('should store always grants in persisted storage, not session', () => {
      addGrant(makeGrant({ tool: 'Bash', scope: 'git *', grant_type: 'always' }));

      expect(getPersistedGrants()).toHaveLength(1);
      expect(getSessionGrants()).toHaveLength(0);
    });

    it('should not duplicate always grants with same tool and scope', () => {
      addGrant(makeGrant({ tool: 'Bash', scope: 'git *', grant_type: 'always' }));
      addGrant(makeGrant({ tool: 'Bash', scope: 'git *', grant_type: 'always' }));

      expect(getPersistedGrants()).toHaveLength(1);
    });
  });

  // ===========================================================================
  // AC4: `always` grants are loaded from file on startup
  // ===========================================================================

  describe('AC4: Always grants loaded on startup via initializeGrants', () => {
    it('should load always grants from pre-loaded array', () => {
      const grants: PermissionGrant[] = [
        makeGrant({ tool: 'Bash', scope: 'git *', grant_type: 'always' }),
        makeGrant({ tool: 'Edit', scope: '/src/*', grant_type: 'always' }),
      ];

      initializeGrants(grants);

      expect(getPersistedGrants()).toHaveLength(2);
      expect(checkGrant('Bash', 'git status')).toBe(true);
      expect(checkGrant('Edit', '/src/index.ts')).toBe(true);
    });

    it('should filter out non-always grants during initialization', () => {
      const grants: PermissionGrant[] = [
        makeGrant({ tool: 'Bash', scope: 'git *', grant_type: 'always' }),
        makeGrant({ tool: 'Bash', scope: 'npm test', grant_type: 'once' }),
        makeGrant({ tool: 'Bash', scope: 'npm install', grant_type: 'session' }),
      ];

      initializeGrants(grants);

      // Only the always grant should be loaded
      expect(getPersistedGrants()).toHaveLength(1);
      expect(getPersistedGrants()[0].scope).toBe('git *');
    });

    it('should replace existing persisted grants on re-initialization', () => {
      const initial: PermissionGrant[] = [
        makeGrant({ tool: 'Bash', scope: 'git *', grant_type: 'always' }),
      ];
      initializeGrants(initial);

      const replacement: PermissionGrant[] = [
        makeGrant({ tool: 'Edit', scope: '/src/*', grant_type: 'always' }),
      ];
      initializeGrants(replacement);

      expect(getPersistedGrants()).toHaveLength(1);
      expect(getPersistedGrants()[0].tool).toBe('Edit');
      // Old grant should be gone
      expect(checkGrant('Bash', 'git status')).toBe(false);
    });

    it('should handle empty grants array', () => {
      initializeGrants([]);

      expect(getPersistedGrants()).toHaveLength(0);
    });

    it('should make loaded grants available via checkGrant', () => {
      initializeGrants([
        makeGrant({ tool: 'Bash', scope: 'npm *', grant_type: 'always' }),
      ]);

      expect(checkGrant('Bash', 'npm test')).toBe(true);
      expect(checkGrant('Bash', 'npm install')).toBe(true);
      expect(checkGrant('Bash', 'yarn test')).toBe(false);
    });
  });

  // ===========================================================================
  // AC5: Glob pattern matching works for grant scopes
  // ===========================================================================

  describe('AC5: Glob pattern matching for grant scopes', () => {
    describe('Bash command patterns', () => {
      it('should match "npm *" against "npm test"', () => {
        addGrant(makeGrant({ tool: 'Bash', scope: 'npm *', grant_type: 'session' }));
        expect(checkGrant('Bash', 'npm test')).toBe(true);
      });

      it('should match "npm *" against "npm install express"', () => {
        addGrant(makeGrant({ tool: 'Bash', scope: 'npm *', grant_type: 'session' }));
        expect(checkGrant('Bash', 'npm install express')).toBe(true);
      });

      it('should NOT match "npm *" against "npx something"', () => {
        addGrant(makeGrant({ tool: 'Bash', scope: 'npm *', grant_type: 'session' }));
        expect(checkGrant('Bash', 'npx something')).toBe(false);
      });

      it('should match "git *" against "git status"', () => {
        addGrant(makeGrant({ tool: 'Bash', scope: 'git *', grant_type: 'session' }));
        expect(checkGrant('Bash', 'git status')).toBe(true);
      });

      it('should match "git *" against "git commit -m msg"', () => {
        addGrant(makeGrant({ tool: 'Bash', scope: 'git *', grant_type: 'session' }));
        expect(checkGrant('Bash', 'git commit -m "some message"')).toBe(true);
      });

      it('should match exact command without glob', () => {
        addGrant(makeGrant({ tool: 'Bash', scope: 'npm test', grant_type: 'session' }));
        expect(checkGrant('Bash', 'npm test')).toBe(true);
        expect(checkGrant('Bash', 'npm install')).toBe(false);
      });
    });

    describe('File path patterns', () => {
      it('should match "/src/*" against "/src/index.ts" for Edit tool', () => {
        addGrant(makeGrant({ tool: 'Edit', scope: '/src/*', grant_type: 'session' }));
        expect(checkGrant('Edit', '/src/index.ts')).toBe(true);
      });

      it('should match "/src/*" against "/src/deep/nested/file.ts" for Write tool', () => {
        addGrant(makeGrant({ tool: 'Write', scope: '/src/*', grant_type: 'session' }));
        expect(checkGrant('Write', '/src/deep/nested/file.ts')).toBe(true);
      });

      it('should NOT match "/src/*" against "/dist/index.js"', () => {
        addGrant(makeGrant({ tool: 'Edit', scope: '/src/*', grant_type: 'session' }));
        expect(checkGrant('Edit', '/dist/index.js')).toBe(false);
      });
    });

    describe('WebFetch domain patterns', () => {
      it('should match "*.github.com" against "https://api.github.com/repos"', () => {
        addGrant(makeGrant({ tool: 'WebFetch', scope: '*.github.com', grant_type: 'session' }));
        expect(checkGrant('WebFetch', 'https://api.github.com/repos')).toBe(true);
      });

      it('should match "*.github.com" against "https://github.com/repo"', () => {
        addGrant(makeGrant({ tool: 'WebFetch', scope: '*.github.com', grant_type: 'session' }));
        expect(checkGrant('WebFetch', 'https://github.com/repo')).toBe(true);
      });

      it('should NOT match "*.github.com" against "https://gitlab.com/repo"', () => {
        addGrant(makeGrant({ tool: 'WebFetch', scope: '*.github.com', grant_type: 'session' }));
        expect(checkGrant('WebFetch', 'https://gitlab.com/repo')).toBe(false);
      });

      it('should match exact domain without wildcard', () => {
        addGrant(makeGrant({ tool: 'WebFetch', scope: 'example.com', grant_type: 'session' }));
        expect(checkGrant('WebFetch', 'https://example.com/path')).toBe(true);
        expect(checkGrant('WebFetch', 'https://sub.example.com/path')).toBe(false);
      });
    });

    describe('Glob with all grant types', () => {
      it('should apply glob matching to once grants', () => {
        addGrant(makeGrant({ tool: 'Bash', scope: 'npm *', grant_type: 'once' }));
        expect(checkGrant('Bash', 'npm test')).toBe(true);
        // Once grant consumed — even different npm command should fail
        expect(checkGrant('Bash', 'npm install')).toBe(false);
      });

      it('should apply glob matching to always grants', () => {
        addGrant(makeGrant({ tool: 'Bash', scope: 'git *', grant_type: 'always' }));
        expect(checkGrant('Bash', 'git status')).toBe(true);
        expect(checkGrant('Bash', 'git commit -m "msg"')).toBe(true);
      });
    });
  });

  // ===========================================================================
  // AC6: All three grant scopes work end-to-end
  // ===========================================================================

  describe('AC6: End-to-end lifecycle for all three scopes', () => {
    it('should handle once → session → always grants concurrently', () => {
      addGrant(makeGrant({ tool: 'Bash', scope: 'npm test', grant_type: 'once' }));
      addGrant(makeGrant({ tool: 'Bash', scope: 'npm install', grant_type: 'session' }));
      addGrant(makeGrant({ tool: 'Bash', scope: 'git *', grant_type: 'always' }));

      // All three should work
      expect(checkGrant('Bash', 'npm test')).toBe(true);
      expect(checkGrant('Bash', 'npm install')).toBe(true);
      expect(checkGrant('Bash', 'git status')).toBe(true);

      // Once grant should now be consumed
      expect(checkGrant('Bash', 'npm test')).toBe(false);

      // Session and always should still work
      expect(checkGrant('Bash', 'npm install')).toBe(true);
      expect(checkGrant('Bash', 'git status')).toBe(true);

      // Clear session grants
      clearSessionGrants();

      // Only always should survive
      expect(checkGrant('Bash', 'npm install')).toBe(false);
      expect(checkGrant('Bash', 'git status')).toBe(true);
    });

    it('should persist always grants through full lifecycle', () => {
      const persisted: PermissionGrant[][] = [];
      setGrantsPersistCallback((grants) => {
        persisted.push([...grants]);
        return true;
      });

      // 1. Add always grant — triggers persist
      addGrant(makeGrant({ tool: 'Bash', scope: 'git *', grant_type: 'always' }));
      expect(persisted).toHaveLength(1);

      // 2. Clear session — always grant survives
      clearSessionGrants();
      expect(checkGrant('Bash', 'git status')).toBe(true);

      // 3. Simulate restart — re-initialize from persisted data
      const savedGrants = persisted[0];
      clearAllGrants();
      initializeGrants(savedGrants);

      // 4. Grant should be restored
      expect(checkGrant('Bash', 'git status')).toBe(true);
    });

    it('should correctly segregate grants into session vs persisted storage', () => {
      addGrant(makeGrant({ tool: 'Bash', scope: 'npm test', grant_type: 'once' }));
      addGrant(makeGrant({ tool: 'Bash', scope: 'npm install', grant_type: 'session' }));
      addGrant(makeGrant({ tool: 'Bash', scope: 'git *', grant_type: 'always' }));

      // once and session go to session storage
      expect(getSessionGrants()).toHaveLength(2);
      // always goes to persisted storage
      expect(getPersistedGrants()).toHaveLength(1);
      // getGrants returns all
      expect(getGrants()).toHaveLength(3);
    });

    it('should handle persistAlwaysGrant for explicit persistence', () => {
      const persisted: PermissionGrant[][] = [];
      setGrantsPersistCallback((grants) => {
        persisted.push([...grants]);
        return true;
      });

      const grant = makeGrant({ tool: 'Edit', scope: '/src/*', grant_type: 'always' });
      persistAlwaysGrant(grant);

      expect(persisted).toHaveLength(1);
      expect(checkGrant('Edit', '/src/index.ts')).toBe(true);
    });

    it('should not persist non-always grants via persistAlwaysGrant', () => {
      const persisted: PermissionGrant[][] = [];
      setGrantsPersistCallback((grants) => {
        persisted.push([...grants]);
        return true;
      });

      persistAlwaysGrant(makeGrant({ tool: 'Bash', scope: 'npm test', grant_type: 'once' }));
      persistAlwaysGrant(makeGrant({ tool: 'Bash', scope: 'npm install', grant_type: 'session' }));

      // Should not have persisted anything
      expect(persisted).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Edge cases
  // ===========================================================================

  describe('Edge cases', () => {
    it('should handle grants for tools with different cases (case-sensitive)', () => {
      addGrant(makeGrant({ tool: 'Bash', scope: 'npm test', grant_type: 'session' }));

      // Tool name is case-sensitive
      expect(checkGrant('Bash', 'npm test')).toBe(true);
      expect(checkGrant('bash', 'npm test')).toBe(false);
    });

    it('should not match empty scope', () => {
      addGrant(makeGrant({ tool: 'Bash', scope: '', grant_type: 'session' }));
      expect(checkGrant('Bash', 'npm test')).toBe(false);
    });

    it('should handle grants for unknown tool types', () => {
      const input = JSON.stringify({ question: 'Choose' });
      addGrant(makeGrant({ tool: 'AskUserQuestion', scope: input, grant_type: 'session' }));

      expect(checkGrant('AskUserQuestion', input)).toBe(true);
    });

    it('should handle clearAllGrants clearing both session and persisted', () => {
      addGrant(makeGrant({ tool: 'Bash', scope: 'npm test', grant_type: 'once' }));
      addGrant(makeGrant({ tool: 'Bash', scope: 'git *', grant_type: 'session' }));
      addGrant(makeGrant({ tool: 'Edit', scope: '/src/*', grant_type: 'always' }));

      clearAllGrants();

      expect(getGrants()).toHaveLength(0);
      expect(getSessionGrants()).toHaveLength(0);
      expect(getPersistedGrants()).toHaveLength(0);
    });
  });
});
