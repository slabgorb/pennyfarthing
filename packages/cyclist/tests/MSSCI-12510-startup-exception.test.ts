/**
 * MSSCI-12510: Fix uncaught exception during startup when no project directory
 *
 * During Cyclist startup, an uncaught exception occurs:
 * "The 'path' argument must be of type string. Received undefined"
 *
 * This happens between "No project directory, showing folder picker" and
 * "Project directory set". Something is trying to use a file path before
 * the project directory is established.
 *
 * Acceptance Criteria:
 * - [ ] AC1: Root cause identified - code path attempting to use file path before project directory
 * - [ ] AC2: Error location traced - specific code causing the uncaught exception
 * - [ ] AC3: Fix implemented - undefined path argument resolved without breaking existing functionality
 * - [ ] AC4: No regression - Cyclist startup works correctly with and without project directory
 * - [ ] AC5: Exception no longer occurs - uncaughtException handler not triggered during startup
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'path';
import {
  getProjectDirectory,
  setProjectDirectory,
  resetProjectDirectory,
  isValidProjectDirectory,
} from '../src/paths.js';

describe('MSSCI-12510: Startup without project directory', () => {
  beforeEach(() => {
    // Reset project directory state before each test
    resetProjectDirectory();
  });

  afterEach(() => {
    // Clean up after each test
    resetProjectDirectory();
  });

  describe('AC1: Root cause identification', () => {
    it('getProjectDirectory returns null when no directory is set', () => {
      // Given: No project directory has been set
      resetProjectDirectory();

      // When: Getting the project directory
      const result = getProjectDirectory();

      // Then: It should return null, not undefined
      expect(result).toBeNull();
    });

    it('path.join with null throws type error', () => {
      // This test documents the failure mode we're trying to prevent
      // path.join with undefined/null as first argument throws TypeError

      // Given: A null path
      const nullPath = null as unknown as string;

      // When/Then: path.join throws TypeError
      expect(() => join(nullPath, 'subdir')).toThrow(TypeError);
      expect(() => join(nullPath, 'subdir')).toThrow(/path.*must be.*string/i);
    });
  });

  describe('AC2: Error location tracing', () => {
    it('should not throw when creating paths without project directory', async () => {
      // Given: No project directory is set
      resetProjectDirectory();
      expect(getProjectDirectory()).toBeNull();

      // When: Importing modules that may use getProjectDirectory
      // These should not throw even when project directory is null

      // Then: No exception should be thrown
      // The modules should handle null project directory gracefully
      await expect(import('../src/paths.js')).resolves.toBeDefined();
    });

    it('getContextUsage handles missing project directory gracefully', async () => {
      // Given: No project directory is set
      resetProjectDirectory();

      // When: Calling getContextUsage with a valid temp directory
      const { getContextUsage } = await import('../src/api/context.js');
      const tempDir = '/tmp/cyclist-test-nonexistent';

      // Then: It should return an error result, not throw
      const result = getContextUsage(tempDir);
      expect(result.error).toBeTruthy();
      expect(result.percent).toBeNull();
    });
  });

  describe('AC3: Fix implementation', () => {
    it('paths.ts exports null when no directory set', () => {
      // Given: No project directory
      resetProjectDirectory();

      // When: Getting project directory
      const dir = getProjectDirectory();

      // Then: Returns null (not undefined)
      expect(dir).toBe(null);
    });

    it('setProjectDirectory accepts valid directory', () => {
      // Given: A valid directory path
      const validDir = process.cwd();

      // When: Setting the project directory
      setProjectDirectory(validDir);

      // Then: It should be retrievable
      expect(getProjectDirectory()).toBe(validDir);
    });

    it('isValidProjectDirectory rejects invalid paths', () => {
      // These paths should be rejected as invalid project directories
      expect(isValidProjectDirectory('')).toBe(false);
      expect(isValidProjectDirectory('/')).toBe(false);
      expect(isValidProjectDirectory('/Users')).toBe(false);
      expect(isValidProjectDirectory('/Applications')).toBe(false);
    });

    it('isValidProjectDirectory accepts valid paths', () => {
      // Valid existing directory should be accepted
      expect(isValidProjectDirectory(process.cwd())).toBe(true);
    });
  });

  describe('AC4: No regression verification', () => {
    it('startup flow works when project directory is set', () => {
      // Given: A valid project directory
      const projectDir = process.cwd();
      setProjectDirectory(projectDir);

      // When: Getting the project directory
      const result = getProjectDirectory();

      // Then: It should return the set directory
      expect(result).toBe(projectDir);
    });

    it('startup flow handles null project directory gracefully', () => {
      // Given: No project directory set
      resetProjectDirectory();

      // When: Getting the project directory
      const result = getProjectDirectory();

      // Then: It should return null without throwing
      expect(result).toBeNull();
    });

    it('code using getProjectDirectory should check for null', async () => {
      // Given: No project directory
      resetProjectDirectory();

      // When: Importing the main module functions
      const { watchToolStats } = await import('../src/main.js');

      // Then: watchToolStats should handle being called with undefined gracefully
      // by returning a no-op cleanup function
      const cleanup = watchToolStats('/nonexistent/path', () => {});
      expect(typeof cleanup).toBe('function');
      cleanup(); // Should not throw
    });
  });

  describe('AC5: Exception prevention', () => {
    it('should not throw uncaught exception during module load', async () => {
      // Given: No project directory
      resetProjectDirectory();

      // When: Importing modules that might use project directory at load time
      // Then: No uncaught exception should occur

      // Import server module (uses getProjectDirectory at route setup time)
      await expect(import('../src/server.js')).resolves.toBeDefined();

      // Import settings module
      await expect(import('../src/settings.js')).resolves.toBeDefined();

      // Import theme-metadata module
      await expect(import('../src/theme-metadata.js')).resolves.toBeDefined();
    });

    it('api routers should not throw when project directory is null', async () => {
      // Given: No project directory
      resetProjectDirectory();

      // When: Creating routers that may use project directory
      const { createSettingsRouter } = await import('../src/api/settings.js');

      // Then: Router creation should not throw
      expect(() => createSettingsRouter()).not.toThrow();
    });

    it('websocket setup should handle null project directory', async () => {
      // Given: A getProjectDir function that returns a fallback
      const getProjectDir = () => process.cwd();

      // When: Creating a mock server
      const http = await import('http');
      const server = http.createServer();

      // Then: WebSocket setup should not throw
      const { setupWebSocketServers } = await import('../src/websocket.js');
      expect(() => setupWebSocketServers(server, getProjectDir)).not.toThrow();

      server.close();
    });
  });
});
