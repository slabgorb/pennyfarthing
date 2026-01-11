/**
 * 20-1: Auto-configure OTEL for web mode
 *
 * Tests for automatic OTEL configuration when running Cyclist in web mode.
 * These tests verify the port file discovery pattern:
 * 1. Cyclist writes .cyclist-port file on server startup
 * 2. Hook reads file and sets OTEL env vars
 * 3. UI shows connection status indicator
 *
 * Written to FAIL initially (RED phase) - Dev will implement to make GREEN.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// Test directory for port file operations
const TEST_PROJECT_DIR = '/tmp/cyclist-test-20-1';
const PORT_FILE_NAME = '.cyclist-port';

describe('20-1: Auto-configure OTEL for web mode', () => {
  beforeEach(() => {
    // Create test directory
    if (!fs.existsSync(TEST_PROJECT_DIR)) {
      fs.mkdirSync(TEST_PROJECT_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(TEST_PROJECT_DIR)) {
      fs.rmSync(TEST_PROJECT_DIR, { recursive: true, force: true });
    }
  });

  describe('AC1: Port file discovery pattern', () => {
    describe('Port file writing (Cyclist server)', () => {
      it('should export writePortFile function from server module', async () => {
        // RED: Function doesn't exist yet
        const { writePortFile } = await import('../src/server.js');
        expect(writePortFile).toBeDefined();
        expect(typeof writePortFile).toBe('function');
      });

      it('should write port number to .cyclist-port file', async () => {
        // RED: Function doesn't exist yet
        const { writePortFile } = await import('../src/server.js');
        const testPort = 1898;

        writePortFile(TEST_PROJECT_DIR, testPort);

        const portFilePath = path.join(TEST_PROJECT_DIR, PORT_FILE_NAME);
        expect(fs.existsSync(portFilePath)).toBe(true);

        const content = fs.readFileSync(portFilePath, 'utf-8').trim();
        expect(content).toBe(String(testPort));
      });

      it('should overwrite existing port file with new port', async () => {
        // RED: Function doesn't exist yet
        const { writePortFile } = await import('../src/server.js');

        // Write initial port
        writePortFile(TEST_PROJECT_DIR, 1898);

        // Write new port (e.g., if previous instance crashed)
        writePortFile(TEST_PROJECT_DIR, 1899);

        const portFilePath = path.join(TEST_PROJECT_DIR, PORT_FILE_NAME);
        const content = fs.readFileSync(portFilePath, 'utf-8').trim();
        expect(content).toBe('1899');
      });
    });

    describe('Port file cleanup (Cyclist shutdown)', () => {
      it('should export cleanupPortFile function from server module', async () => {
        // RED: Function doesn't exist yet
        const { cleanupPortFile } = await import('../src/server.js');
        expect(cleanupPortFile).toBeDefined();
        expect(typeof cleanupPortFile).toBe('function');
      });

      it('should remove .cyclist-port file on cleanup', async () => {
        // RED: Function doesn't exist yet
        const { writePortFile, cleanupPortFile } = await import('../src/server.js');

        // First write a port file
        writePortFile(TEST_PROJECT_DIR, 1898);
        const portFilePath = path.join(TEST_PROJECT_DIR, PORT_FILE_NAME);
        expect(fs.existsSync(portFilePath)).toBe(true);

        // Now clean up
        cleanupPortFile(TEST_PROJECT_DIR);
        expect(fs.existsSync(portFilePath)).toBe(false);
      });

      it('should not throw if port file does not exist', async () => {
        // RED: Function doesn't exist yet
        const { cleanupPortFile } = await import('../src/server.js');

        // Clean up non-existent file should not throw
        expect(() => cleanupPortFile(TEST_PROJECT_DIR)).not.toThrow();
      });
    });

    describe('Port file reading (Hook)', () => {
      it('should export readPortFile function', async () => {
        // RED: Function doesn't exist yet
        const { readPortFile } = await import('../src/server.js');
        expect(readPortFile).toBeDefined();
        expect(typeof readPortFile).toBe('function');
      });

      it('should read port number from .cyclist-port file', async () => {
        // RED: Function doesn't exist yet
        const { readPortFile } = await import('../src/server.js');

        // Manually write port file for testing read
        const portFilePath = path.join(TEST_PROJECT_DIR, PORT_FILE_NAME);
        fs.writeFileSync(portFilePath, '1898');

        const port = readPortFile(TEST_PROJECT_DIR);
        expect(port).toBe(1898);
      });

      it('should return null if port file does not exist', async () => {
        // RED: Function doesn't exist yet
        const { readPortFile } = await import('../src/server.js');

        const port = readPortFile(TEST_PROJECT_DIR);
        expect(port).toBeNull();
      });

      it('should return null if port file is empty', async () => {
        // RED: Function doesn't exist yet
        const { readPortFile } = await import('../src/server.js');

        const portFilePath = path.join(TEST_PROJECT_DIR, PORT_FILE_NAME);
        fs.writeFileSync(portFilePath, '');

        const port = readPortFile(TEST_PROJECT_DIR);
        expect(port).toBeNull();
      });

      it('should return null if port file contains invalid content', async () => {
        // RED: Function doesn't exist yet
        const { readPortFile } = await import('../src/server.js');

        const portFilePath = path.join(TEST_PROJECT_DIR, PORT_FILE_NAME);
        fs.writeFileSync(portFilePath, 'not-a-port');

        const port = readPortFile(TEST_PROJECT_DIR);
        expect(port).toBeNull();
      });
    });

    describe('OTEL environment configuration', () => {
      it('should export getOtelConfig function', async () => {
        // RED: Function doesn't exist yet
        const { getOtelConfig } = await import('../src/server.js');
        expect(getOtelConfig).toBeDefined();
        expect(typeof getOtelConfig).toBe('function');
      });

      it('should return OTEL environment variables for valid port', async () => {
        // RED: Function doesn't exist yet
        const { getOtelConfig } = await import('../src/server.js');

        // Write a port file
        const portFilePath = path.join(TEST_PROJECT_DIR, PORT_FILE_NAME);
        fs.writeFileSync(portFilePath, '1898');

        const config = getOtelConfig(TEST_PROJECT_DIR);
        expect(config).not.toBeNull();
        expect(config?.OTEL_EXPORTER_OTLP_PROTOCOL).toBe('http/json');
        expect(config?.OTEL_EXPORTER_OTLP_ENDPOINT).toBe('http://localhost:1898');
      });

      it('should return null when no port file exists', async () => {
        // RED: Function doesn't exist yet
        const { getOtelConfig } = await import('../src/server.js');

        const config = getOtelConfig(TEST_PROJECT_DIR);
        expect(config).toBeNull();
      });
    });
  });

  describe('AC2: OTEL connection status indicator', () => {
    describe('Connection status types', () => {
      it('should export OtelConnectionStatus type with correct values', async () => {
        // RED: Type/enum doesn't exist yet
        const { OtelConnectionStatus } = await import('../src/otel-status.js');
        expect(OtelConnectionStatus).toBeDefined();
        expect(OtelConnectionStatus.CONNECTED).toBe('connected');
        expect(OtelConnectionStatus.WAITING).toBe('waiting');
        expect(OtelConnectionStatus.DISCONNECTED).toBe('disconnected');
      });
    });

    describe('Connection status determination', () => {
      it('should export getOtelConnectionStatus function', async () => {
        // RED: Function doesn't exist yet
        const { getOtelConnectionStatus } = await import('../src/otel-status.js');
        expect(getOtelConnectionStatus).toBeDefined();
        expect(typeof getOtelConnectionStatus).toBe('function');
      });

      it('should return DISCONNECTED when OTEL not configured', async () => {
        // RED: Function doesn't exist yet
        const { getOtelConnectionStatus, OtelConnectionStatus } = await import('../src/otel-status.js');

        const status = getOtelConnectionStatus({ hasOtelConfig: false, hasReceivedData: false });
        expect(status).toBe(OtelConnectionStatus.DISCONNECTED);
      });

      it('should return WAITING when OTEL configured but no data received', async () => {
        // RED: Function doesn't exist yet
        const { getOtelConnectionStatus, OtelConnectionStatus } = await import('../src/otel-status.js');

        const status = getOtelConnectionStatus({ hasOtelConfig: true, hasReceivedData: false });
        expect(status).toBe(OtelConnectionStatus.WAITING);
      });

      it('should return CONNECTED when OTEL configured and data received', async () => {
        // RED: Function doesn't exist yet
        const { getOtelConnectionStatus, OtelConnectionStatus } = await import('../src/otel-status.js');

        const status = getOtelConnectionStatus({ hasOtelConfig: true, hasReceivedData: true });
        expect(status).toBe(OtelConnectionStatus.CONNECTED);
      });
    });

    describe('Status indicator messaging', () => {
      it('should export getStatusMessage function', async () => {
        // RED: Function doesn't exist yet
        const { getStatusMessage } = await import('../src/otel-status.js');
        expect(getStatusMessage).toBeDefined();
        expect(typeof getStatusMessage).toBe('function');
      });

      it('should return setup instructions for DISCONNECTED status', async () => {
        // RED: Function doesn't exist yet
        const { getStatusMessage, OtelConnectionStatus } = await import('../src/otel-status.js');

        const message = getStatusMessage(OtelConnectionStatus.DISCONNECTED);
        expect(message).toContain('setup');
        expect(message.toLowerCase()).toContain('otel');
      });

      it('should return waiting message for WAITING status', async () => {
        // RED: Function doesn't exist yet
        const { getStatusMessage, OtelConnectionStatus } = await import('../src/otel-status.js');

        const message = getStatusMessage(OtelConnectionStatus.WAITING);
        expect(message.toLowerCase()).toContain('waiting');
      });

      it('should return connected message for CONNECTED status', async () => {
        // RED: Function doesn't exist yet
        const { getStatusMessage, OtelConnectionStatus } = await import('../src/otel-status.js');

        const message = getStatusMessage(OtelConnectionStatus.CONNECTED);
        expect(message.toLowerCase()).toContain('connected');
      });
    });
  });

  describe('Hook script behavior', () => {
    // Note: These tests verify the shell script exists and has correct structure
    // Actual env var setting is tested manually or in integration tests

    it('should have otel-auto-config.sh hook script', () => {
      // RED: Script doesn't exist yet
      const hookPath = path.resolve(__dirname, '../../../pennyfarthing-dist/scripts/hooks/otel-auto-config.sh');
      expect(fs.existsSync(hookPath)).toBe(true);
    });

    it('hook script should be executable', () => {
      // RED: Script doesn't exist yet
      const hookPath = path.resolve(__dirname, '../../../pennyfarthing-dist/scripts/hooks/otel-auto-config.sh');

      const stats = fs.statSync(hookPath);
      // Check for executable permission (user, group, or other)
      const isExecutable = (stats.mode & 0o111) !== 0;
      expect(isExecutable).toBe(true);
    });

    it('hook script should check for .cyclist-port file', () => {
      // RED: Script doesn't exist yet
      const hookPath = path.resolve(__dirname, '../../../pennyfarthing-dist/scripts/hooks/otel-auto-config.sh');

      const content = fs.readFileSync(hookPath, 'utf-8');
      expect(content).toContain('.cyclist-port');
    });

    it('hook script should set OTEL_EXPORTER_OTLP_ENDPOINT', () => {
      // RED: Script doesn't exist yet
      const hookPath = path.resolve(__dirname, '../../../pennyfarthing-dist/scripts/hooks/otel-auto-config.sh');

      const content = fs.readFileSync(hookPath, 'utf-8');
      expect(content).toContain('OTEL_EXPORTER_OTLP_ENDPOINT');
    });

    it('hook script should set OTEL_EXPORTER_OTLP_PROTOCOL', () => {
      // RED: Script doesn't exist yet
      const hookPath = path.resolve(__dirname, '../../../pennyfarthing-dist/scripts/hooks/otel-auto-config.sh');

      const content = fs.readFileSync(hookPath, 'utf-8');
      expect(content).toContain('OTEL_EXPORTER_OTLP_PROTOCOL');
    });
  });
});
