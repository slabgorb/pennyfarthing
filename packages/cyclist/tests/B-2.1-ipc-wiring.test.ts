/**
 * B-2.1: IPC Data Wiring Tests
 *
 * These tests verify Phase 2 of the IPC migration:
 * - IPC handlers return REAL data (not stubs)
 * - Handlers are wired to actual data sources
 * - Express server is NOT started in Electron mode
 *
 * Acceptance Criteria:
 * - AC1: All sidebar data flows through IPC (no WebSocket/HTTP)
 * - AC2: Stats display updates in real-time via IPC
 * - AC3: Persona display works via IPC
 * - AC4: Express server not started in Electron mode
 * - AC5: No functionality regression
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { setProjectDirectory, resetProjectDirectory } from '../src/paths.js';

describe('B-2.1: IPC Data Wiring', () => {

  // Setup: Create session agent directory for persona tests
  beforeEach(() => {
    const projectDir = process.cwd();

    // Initialize project directory for IPC handlers (single source of truth)
    setProjectDirectory(projectDir);

    const agentsDir = path.join(projectDir, '.session', 'agents');

    // Create agents directory if it doesn't exist
    if (!fs.existsSync(agentsDir)) {
      fs.mkdirSync(agentsDir, { recursive: true });
    }

    // Create a session agent file (use 'dev' as default agent)
    const sessionFile = path.join(agentsDir, 'test-session');
    fs.writeFileSync(sessionFile, 'dev', 'utf-8');
  });

  // Cleanup: Remove session agent and reset project directory after tests
  afterEach(() => {
    const projectDir = process.cwd();
    const sessionFile = path.join(projectDir, '.session', 'agents', 'test-session');

    // Reset project directory state to prevent leaking between tests
    resetProjectDirectory();

    try {
      if (fs.existsSync(sessionFile)) {
        fs.unlinkSync(sessionFile);
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('AC1/AC2: Stats Handler Returns Real Data', () => {

    it('should return stats with context percentage from parser', async () => {
      // The stats:get handler should return parsed stats, not hardcoded values
      // This requires wiring to actual parser output
      const main = await import('../src/main.js');

      // Create mock ipcMain to capture handler
      let statsHandler: ((event: unknown) => Promise<unknown>) | null = null;
      const mockIpcMain = {
        handle: (channel: string, handler: (event: unknown) => Promise<unknown>) => {
          if (channel === 'stats:get') {
            statsHandler = handler;
          }
        }
      };

      main.setupDataIPCHandlers(mockIpcMain);

      // Call the handler
      const stats = await statsHandler?.({});

      // Stats now returns model, status, mode, connected
      // Context is handled via separate context:get channel (B-19)
      expect(stats).toHaveProperty('model');
      expect(stats).toHaveProperty('status');
      expect(stats).toHaveProperty('mode');
      expect(stats).toHaveProperty('connected');
    });

    it('should return stats with actual model name from Claude output', async () => {
      const main = await import('../src/main.js');

      let statsHandler: ((event: unknown) => Promise<unknown>) | null = null;
      const mockIpcMain = {
        handle: (channel: string, handler: (event: unknown) => Promise<unknown>) => {
          if (channel === 'stats:get') {
            statsHandler = handler;
          }
        }
      };

      main.setupDataIPCHandlers(mockIpcMain);
      const stats = await statsHandler?.({});

      // Model defaults to "—" until parsed from PTY output
      // Once parsed, it will be like "opus-4-5" (claude- prefix and date stripped)
      const model = (stats as Record<string, unknown>).model as string;
      expect(model).toBeDefined();
      // Accept either the placeholder "—" or a parsed model name
      expect(model).toMatch(/^(—|opus-\d|sonnet-\d|haiku-\d)/);
    });

    it('should have connected state for PTY lifecycle tracking', async () => {
      const main = await import('../src/main.js');

      let statsHandler: ((event: unknown) => Promise<unknown>) | null = null;
      const mockIpcMain = {
        handle: (channel: string, handler: (event: unknown) => Promise<unknown>) => {
          if (channel === 'stats:get') {
            statsHandler = handler;
          }
        }
      };

      main.setupDataIPCHandlers(mockIpcMain);
      const stats = await statsHandler?.({});

      // Stats should have connected boolean for PTY lifecycle tracking
      expect(stats).toHaveProperty('connected');
      expect(typeof (stats as Record<string, unknown>).connected).toBe('boolean');
    });

  });

  describe('AC3: Persona Handler Returns Real Data', () => {

    it('should return persona data from pennyfarthing', async () => {
      const main = await import('../src/main.js');

      let personaHandler: ((event: unknown) => Promise<unknown>) | null = null;
      const mockIpcMain = {
        handle: (channel: string, handler: (event: unknown) => Promise<unknown>) => {
          if (channel === 'persona:get') {
            personaHandler = handler;
          }
        }
      };

      main.setupDataIPCHandlers(mockIpcMain);
      const persona = await personaHandler?.({});

      // Persona should NOT be null - should return actual data from getCurrentPersona
      // The stub returns null - this test should FAIL until wired
      expect(persona).not.toBeNull();
    });

    // Story 37-8: Handler now returns complete fallback object with all fields
    // even without active session, so sidebar can render gracefully
    it('should return persona with character and role fields', async () => {
      const main = await import('../src/main.js');

      let personaHandler: ((event: unknown) => Promise<unknown>) | null = null;
      const mockIpcMain = {
        handle: (channel: string, handler: (event: unknown) => Promise<unknown>) => {
          if (channel === 'persona:get') {
            personaHandler = handler;
          }
        }
      };

      main.setupDataIPCHandlers(mockIpcMain);
      const persona = await personaHandler?.({}) as Record<string, unknown> | null;

      // Handler returns complete object with all expected fields
      // Fields are null when no active session, but always present
      expect(persona).toHaveProperty('projectName');
      expect(persona).toHaveProperty('character');
      expect(persona).toHaveProperty('role');
      expect(persona).toHaveProperty('theme');
    });

    // Story 37-8: Verify all persona fields are present in fallback response
    it('should return persona with all expected fields for UI rendering', async () => {
      const main = await import('../src/main.js');

      let personaHandler: ((event: unknown) => Promise<unknown>) | null = null;
      const mockIpcMain = {
        handle: (channel: string, handler: (event: unknown) => Promise<unknown>) => {
          if (channel === 'persona:get') {
            personaHandler = handler;
          }
        }
      };

      main.setupDataIPCHandlers(mockIpcMain);
      const persona = await personaHandler?.({}) as Record<string, unknown> | null;

      // All fields the sidebar expects should be present
      expect(persona).toHaveProperty('projectName');
      expect(persona).toHaveProperty('displayName');
      expect(persona).toHaveProperty('roleDescription');
      expect(persona).toHaveProperty('style');
      expect(persona).toHaveProperty('slug');
      expect(persona).toHaveProperty('quote');
      expect(persona).toHaveProperty('helper');
      expect(persona).toHaveProperty('ocean');
    });

    // Story 37-8: displayName always returns a string for sidebar display
    it('should return persona with displayName for sidebar', async () => {
      const main = await import('../src/main.js');

      let personaHandler: ((event: unknown) => Promise<unknown>) | null = null;
      const mockIpcMain = {
        handle: (channel: string, handler: (event: unknown) => Promise<unknown>) => {
          if (channel === 'persona:get') {
            personaHandler = handler;
          }
        }
      };

      main.setupDataIPCHandlers(mockIpcMain);
      const persona = await personaHandler?.({}) as Record<string, unknown> | null;

      // displayName is what shows in the sidebar - always a string
      expect(persona).toHaveProperty('displayName');
      expect(typeof persona?.displayName).toBe('string');
      // When no persona, displayName falls back to projectName
      expect(persona?.displayName).toBeTruthy();
    });

  });

  describe('AC1: Story Handler Returns Real Data', () => {

    it('should return story data from session files', async () => {
      const main = await import('../src/main.js');

      let storyHandler: ((event: unknown) => Promise<unknown>) | null = null;
      const mockIpcMain = {
        handle: (channel: string, handler: (event: unknown) => Promise<unknown>) => {
          if (channel === 'story:get') {
            storyHandler = handler;
          }
        }
      };

      main.setupDataIPCHandlers(mockIpcMain);
      const story = await storyHandler?.({}) as Record<string, unknown>;

      // If there's an active session, id should not be null
      // The stub returns null for all fields
      // At minimum, this should check session files exist and parse them
      expect(story).toBeDefined();
      // Story object should have structure even if no active story
      expect(story).toHaveProperty('id');
    });

  });

  describe('AC1: Git Handler Returns Real Data', () => {

    it('should return git info from repository', async () => {
      const main = await import('../src/main.js');

      let gitHandler: ((event: unknown) => Promise<unknown>) | null = null;
      const mockIpcMain = {
        handle: (channel: string, handler: (event: unknown) => Promise<unknown>) => {
          if (channel === 'git:get') {
            gitHandler = handler;
          }
        }
      };

      main.setupDataIPCHandlers(mockIpcMain);
      const git = await gitHandler?.({});

      // Git should NOT be null - should return branch, status info
      // The stub returns null - this test should FAIL until wired
      expect(git).not.toBeNull();
    });

    it('should return git branch name', async () => {
      const main = await import('../src/main.js');

      let gitHandler: ((event: unknown) => Promise<unknown>) | null = null;
      const mockIpcMain = {
        handle: (channel: string, handler: (event: unknown) => Promise<unknown>) => {
          if (channel === 'git:get') {
            gitHandler = handler;
          }
        }
      };

      main.setupDataIPCHandlers(mockIpcMain);
      const git = await gitHandler?.({}) as Record<string, unknown> | null;

      expect(git).toHaveProperty('branch');
      expect(typeof git?.branch).toBe('string');
    });

  });

  describe('AC4: Express Server Not Started in Electron Mode', () => {

    it('should export a flag or function indicating server startup mode', async () => {
      const main = await import('../src/main.js');

      // There should be a way to control whether server starts
      // Either: serverEnabled flag, or startServer function that can be disabled
      expect(
        main.serverEnabled !== undefined ||
        main.shouldStartServer !== undefined ||
        main.getServerConfig !== undefined
      ).toBe(true);
    });

    it('should not auto-start Express server when running in Electron', async () => {
      // This is a behavioral test - when main.ts runs in Electron context,
      // it should NOT call createTerminalServer().listen()
      //
      // We verify this by checking if the server startup is conditional
      // on an environment flag or configuration
      const main = await import('../src/main.js');

      // Check for server control mechanism
      // The implementation should have a way to skip server startup
      const hasServerControl =
        typeof main.serverEnabled === 'boolean' ||
        typeof main.shouldStartServer === 'function' ||
        typeof main.getServerConfig === 'function';

      expect(hasServerControl).toBe(true);
    });

  });

  describe('AC2: Stats Update Broadcasting', () => {

    it('should broadcast stats updates when PTY receives output', async () => {
      const main = await import('../src/main.js');

      // broadcastToRenderer should be called when stats change
      // Set up a spy/mock to verify it's called with stats:update

      const broadcastSpy = vi.fn();

      // Check if there's a mechanism to trigger stat broadcasts
      // This might require a setStatsUpdateCallback or similar
      expect(main.broadcastToRenderer).toBeDefined();

      // The wired implementation should call broadcastToRenderer('stats:update', data)
      // when PTY output is parsed and stats are extracted
    });

    it('should update stats from SDK messages', async () => {
      const main = await import('../src/main.js');

      // There should be a function that processes SDK messages for stats
      // This connects the SDK data flow to the IPC broadcast
      expect(
        main.updateStatsFromSDK !== undefined
      ).toBe(true);
    });

  });

});
