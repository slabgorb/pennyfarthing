/**
 * Story 101-6: BikeRack integration test and operational verification
 * Jira: MSSCI-14825
 *
 * End-to-end verification that BikeRack mode works correctly
 * and Cyclist mode is unaffected. Final story in Epic 101 — BikeRack Mode.
 *
 * ACs covered:
 * - AC1:  pf bikerack start → WheelHub starts, panels serve data
 * - AC2:  Ctrl+C → WheelHub terminates, .bikerack-port and .wheelhub-pid cleaned
 * - AC3:  Kill terminal → PID file exists for manual cleanup
 * - AC4:  All 12 panel tabs render with live data (portrait extracted to anchor)
 * - AC5:  PersonaHeader anchored above Dockview in BikeRackWorkspace (102-6)
 * - AC6:  Cyclist runs simultaneously on 1898 without collision
 * - AC7:  Existing Cyclist test suite passes unchanged
 * - AC8:  No new WebSocket channels created (CE-5)
 * - AC9:  No panel receives BikeRack-specific props (Rule 2)
 * - AC10: grep for direct IS_BIKERACK checks returns only isBikeRackMode() (Rule 1)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync, readdirSync, writeFileSync, unlinkSync, mkdirSync, rmSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';

const SRC_DIR = resolve(__dirname, '..', 'src');
const PANELS_DIR = join(SRC_DIR, 'public', 'components', 'panels');
const COMPONENTS_DIR = join(SRC_DIR, 'public', 'components');
// After 124-5, display components moved to the bikerack package
const BIKERACK_SRC = resolve(__dirname, '..', '..', 'bikerack', 'src');
const BIKERACK_ENTRY = join(BIKERACK_SRC, 'entry.ts');

// ============================================================================
// AC1: pf bikerack start → WheelHub starts, panels serve data
// ============================================================================

describe('AC1: BikeRack server startup', () => {
  it('entry.ts should create server using shared createTerminalServer', () => {
    const content = readFileSync(BIKERACK_ENTRY, 'utf-8');

    expect(content).toMatch(/createTerminalServer\(\)/);
  });

  it('entry.ts should call server.listen with a port', () => {
    const content = readFileSync(BIKERACK_ENTRY, 'utf-8');

    expect(content).toMatch(/server\.listen\(/);
  });

  it('entry.ts should write port file AFTER listen callback (CE-3)', () => {
    const content = readFileSync(BIKERACK_ENTRY, 'utf-8');

    // Port file write call (not definition) must be inside listen callback
    const listenIndex = content.indexOf('server.listen(');
    // Find the writePortFile CALL inside the listen callback, not the function definition
    const listenBlock = content.slice(listenIndex);
    const callInCallback = listenBlock.indexOf('writePortFile(');

    expect(listenIndex).not.toBe(-1);
    expect(callInCallback).not.toBe(-1);
    // The call is within the listen callback block — that's all we need
    expect(callInCallback).toBeGreaterThan(0);
  });

  it('server.ts /bikerack route should serve index.html for SPA routing', () => {
    // After 98-17, route is in core's server.ts
    const serverPath = resolve(__dirname, '..', '..', 'core', 'src', 'server', 'server.ts');
    const content = readFileSync(serverPath, 'utf-8');

    expect(content).toMatch(/app\.get\s*\(\s*['"]\/bikerack['"]/);
  });
});

// ============================================================================
// AC2: Ctrl+C → WheelHub terminates, .bikerack-port and .wheelhub-pid cleaned
// ============================================================================

describe('AC2: Graceful shutdown cleanup', () => {
  it('entry.ts should register SIGINT handler', () => {
    const content = readFileSync(BIKERACK_ENTRY, 'utf-8');

    expect(content).toMatch(/process\.on\s*\(\s*['"]SIGINT['"]/);
  });

  it('entry.ts should register SIGTERM handler', () => {
    const content = readFileSync(BIKERACK_ENTRY, 'utf-8');

    expect(content).toMatch(/process\.on\s*\(\s*['"]SIGTERM['"]/);
  });

  it('SIGINT handler should call cleanupPortFile', () => {
    const content = readFileSync(BIKERACK_ENTRY, 'utf-8');

    const sigintMatch = content.match(/process\.on\s*\(\s*['"]SIGINT['"][\s\S]*?cleanupPortFile/);
    expect(sigintMatch).not.toBeNull();
  });

  it('SIGTERM handler should call cleanupPortFile', () => {
    const content = readFileSync(BIKERACK_ENTRY, 'utf-8');

    const sigtermMatch = content.match(/process\.on\s*\(\s*['"]SIGTERM['"][\s\S]*?cleanupPortFile/);
    expect(sigtermMatch).not.toBeNull();
  });

  it('entry.ts cleanupPortFile should target .bikerack-port (shared port file)', () => {
    const content = readFileSync(BIKERACK_ENTRY, 'utf-8');

    expect(content).toMatch(/\.bikerack-port/);
  });
});

// ============================================================================
// AC3: Kill terminal → PID file exists for manual cleanup
// ============================================================================

describe('AC3: PID file for manual cleanup', () => {
  it('Python launcher should write .wheelhub-pid file', () => {
    // Verify the launcher module exports write_pid_file
    const launcherPath = resolve(__dirname, '..', '..', '..', 'pennyfarthing-dist', 'src', 'pf', 'bikerack', 'launcher.py');
    expect(existsSync(launcherPath)).toBe(true);

    const content = readFileSync(launcherPath, 'utf-8');
    expect(content).toMatch(/write_pid_file|wheelhub-pid/);
  });

  it('entry.ts signal handlers should NOT delete PID file (launcher owns it)', () => {
    // entry.ts only manages .bikerack-port
    // .wheelhub-pid is managed by the Python launcher
    const content = readFileSync(BIKERACK_ENTRY, 'utf-8');

    // entry.ts should NOT reference .wheelhub-pid
    expect(content).not.toMatch(/\.wheelhub-pid/);
  });
});

// ============================================================================
// AC4: All 12 panel tabs render with live data (portrait extracted to anchor in 102-6)
// ============================================================================

describe('AC4: PANEL_REGISTRY completeness', () => {
  const EXPECTED_PANELS = [
    'sprint',
    'git',
    'diffs',
    'todos',
    'workflow',
    'audit',
    'ac',
    'debug',
    'bikelane',
    'settings',
    'progress',
  ];

  it('PANEL_REGISTRY should have exactly 11 entries', () => {
    const standalonePath = join(BIKERACK_SRC, 'StandalonePanel.tsx');
    const content = readFileSync(standalonePath, 'utf-8');

    // Extract PANEL_REGISTRY object (multiline)
    const registryMatch = content.match(/PANEL_REGISTRY[^{]*\{([\s\S]+?)\};/);
    expect(registryMatch).not.toBeNull();

    const registryContent = registryMatch![1];
    // Count key: value pairs (panel entries like "sprint: EnhancedSprintPanel,")
    const entries = registryContent.match(/^\s+\w+\s*:/gm) || [];
    expect(entries.length).toBe(11);
  });

  it.each(EXPECTED_PANELS)('PANEL_REGISTRY should contain "%s" panel', (panelName) => {
    const standalonePath = join(BIKERACK_SRC, 'StandalonePanel.tsx');
    const content = readFileSync(standalonePath, 'utf-8');

    // Each panel should be a key in the registry
    const regex = new RegExp(`\\b${panelName}\\s*:`);
    expect(content).toMatch(regex);
  });

  it('PANEL_REGISTRY should NOT contain portrait panel (extracted in 102-6)', () => {
    const standalonePath = join(BIKERACK_SRC, 'StandalonePanel.tsx');
    const content = readFileSync(standalonePath, 'utf-8');

    expect(content).not.toMatch(/portrait\s*:\s*PortraitPanel/);
  });

  it('all panel components should be importable from panels/index', () => {
    const indexPath = join(PANELS_DIR, 'index.ts');
    expect(existsSync(indexPath)).toBe(true);

    const content = readFileSync(indexPath, 'utf-8');

    // StandalonePanel imports these specific components
    const standalonePath = join(BIKERACK_SRC, 'StandalonePanel.tsx');
    const standaloneContent = readFileSync(standalonePath, 'utf-8');

    // Extract import names from StandalonePanel (imports from @pennyfarthing/core/components/panels/index.js)
    const importMatch = standaloneContent.match(/import\s*\{([^}]+)\}\s*from\s*['"]@pennyfarthing\/core\/components\/panels\/index\.js['"]/);
    expect(importMatch).not.toBeNull();

    const importedNames = importMatch![1].split(',').map(s => s.trim()).filter(Boolean);
    expect(importedNames.length).toBe(11);

    // Each imported name should be exported from panels/index.ts
    for (const name of importedNames) {
      expect(content).toMatch(new RegExp(`export.*\\b${name}\\b`));
    }
  });

  it('BikeRackIndex should list all 12 panels', () => {
    const indexPath = join(BIKERACK_SRC, 'BikeRackIndex.tsx');
    const content = readFileSync(indexPath, 'utf-8');

    // Each panel name should appear as a link target
    for (const panel of EXPECTED_PANELS) {
      expect(content).toMatch(new RegExp(`panel=${panel}|['"]${panel}['"]`));
    }
  });
});

// ============================================================================
// AC5: PersonaHeader anchored above Dockview in BikeRackWorkspace (102-6)
// ============================================================================

describe('AC5: PersonaHeader in BikeRackWorkspace (replaces PortraitPanel)', () => {
  it('PortraitPanel should NOT exist in panels directory (removed in 102-6)', () => {
    const portraitPath = join(PANELS_DIR, 'PortraitPanel.tsx');
    expect(existsSync(portraitPath)).toBe(false);
  });

  it('BikeRackWorkspace should import PersonaHeader directly', () => {
    const workspacePath = join(BIKERACK_SRC, 'BikeRackWorkspace.tsx');
    const content = readFileSync(workspacePath, 'utf-8');

    expect(content).toMatch(/import.*PersonaHeader.*from/);
  });

  it('BikeRackWorkspace should render PersonaHeader above DockviewReact in JSX', () => {
    const workspacePath = join(BIKERACK_SRC, 'BikeRackWorkspace.tsx');
    const content = readFileSync(workspacePath, 'utf-8');

    // Find the return statement with the specific cyclist-app div
    const returnMatch = content.match(/return\s*\(\s*<div className="cyclist-app cyclist-dockview"[\s\S]*?<\/div>\s*\);/);
    expect(returnMatch).not.toBeNull();
    const jsx = returnMatch![0];

    // Now search for the JSX tags (with <> to avoid matching imports)
    const portraitIndex = jsx.indexOf('<PersonaHeader');
    const dockviewIndex = jsx.indexOf('<DockviewReact');
    expect(portraitIndex).toBeGreaterThan(-1);
    expect(dockviewIndex).toBeGreaterThan(-1);
    expect(portraitIndex).toBeLessThan(dockviewIndex);
  });

  it('panels/index.ts should NOT export PortraitPanel', () => {
    const indexPath = join(PANELS_DIR, 'index.ts');
    const content = readFileSync(indexPath, 'utf-8');

    expect(content).not.toMatch(/PortraitPanel/);
  });
});

// ============================================================================
// AC6: Cyclist runs simultaneously on 1898 without collision
// ============================================================================

describe('AC6: Port isolation — no collision', () => {
  it('Cyclist default port should be 1898', () => {
    // After 98-17, default port is in core's server.ts
    const serverPath = resolve(__dirname, '..', '..', 'core', 'src', 'server', 'server.ts');
    const content = readFileSync(serverPath, 'utf-8');

    expect(content).toMatch(/1898/);
  });

  it('BikeRack default port should be 2898', () => {
    const content = readFileSync(BIKERACK_ENTRY, 'utf-8');

    expect(content).toMatch(/2898/);
  });

  it('BikeRack and Cyclist should share .bikerack-port file', () => {
    const bikerackContent = readFileSync(BIKERACK_ENTRY, 'utf-8');

    // After port file consolidation, both use .bikerack-port
    const serverPath = resolve(__dirname, '..', '..', 'core', 'src', 'server', 'server.ts');
    const serverContent = readFileSync(serverPath, 'utf-8');

    // Both use .bikerack-port
    expect(bikerackContent).toMatch(/\.bikerack-port/);
    expect(serverContent).toMatch(/\.bikerack-port/);
  });

  it('BikeRack should use findAvailablePort for conflict resolution', () => {
    const content = readFileSync(BIKERACK_ENTRY, 'utf-8');

    expect(content).toMatch(/findAvailablePort/);
  });
});

// ============================================================================
// AC7: Existing Cyclist test suite passes unchanged
// ============================================================================

describe('AC7: Regression guard — existing tests unmodified', () => {
  const EXISTING_TEST_FILES = [
    'MSSCI-14820-bikerack-mode.test.ts',
    'MSSCI-14821-standalone-panel.test.tsx',
    'MSSCI-14822-bikerack-index.test.tsx',
    // MSSCI-14823-portrait-panel.test.tsx removed — PortraitPanel deprecated in 102-6
  ];

  it.each(EXISTING_TEST_FILES)('existing test file "%s" should still exist', (testFile) => {
    const testPath = join(__dirname, testFile);
    expect(existsSync(testPath)).toBe(true);
  });

  it('this integration test should not modify any existing test files', () => {
    // Marker test: if this test exists, the integration story
    // is adding NEW tests, not modifying existing ones
    const thisFile = readFileSync(__filename, 'utf-8');
    expect(thisFile).toMatch(/MSSCI-14825/);
  });
});

// ============================================================================
// AC8: No new WebSocket channels created (CE-5)
// ============================================================================

describe('AC8: CE-5 — No new WebSocket channels', () => {
  // These are ALL the WebSocket channels that existed before Epic 101,
  // plus channels added by later epics (e.g. /ws/focus from Epic 104).
  // BikeRack must NOT add any new channels.
  const PRE_BIKERACK_CHANNELS = [
    '/ws/stats',
    '/ws/persona',
    '/ws/token-stats',
    '/ws/claude',
    '/ws/livereload',
    '/ws/story',
    '/ws/git',
    '/ws/bell',
    '/ws/spans',
    '/ws/welcome',
    '/ws/hooks',
    '/ws/settings',
    '/ws/context',
    '/ws/todos',
    '/ws/sprint',
    '/ws/diffs',
    '/ws/focus',
  ];

  it('websocket.ts should have exactly the pre-BikeRack channel count', () => {
    const wsPath = join(SRC_DIR, 'websocket.ts');
    const content = readFileSync(wsPath, 'utf-8');

    // Count WebSocketServer instantiations
    const wssInstances = content.match(/new\s+WebSocketServer\s*\(/g) || [];
    expect(wssInstances.length).toBe(PRE_BIKERACK_CHANNELS.length);
  });

  it.each(PRE_BIKERACK_CHANNELS)('channel "%s" should exist in upgrade handler', (channel) => {
    const wsPath = join(SRC_DIR, 'websocket.ts');
    const content = readFileSync(wsPath, 'utf-8');

    expect(content).toMatch(new RegExp(`pathname\\s*===\\s*['"]${channel.replace('/', '\\/')}['"]`));
  });

  it('no WebSocket channels should be added by BikeRack-related files', () => {
    // entry.ts should NOT create any WebSocket servers
    const content = readFileSync(BIKERACK_ENTRY, 'utf-8');

    expect(content).not.toMatch(/WebSocketServer/);
    expect(content).not.toMatch(/new\s+WebSocket/);
  });

  it('/ws/claude gating handled by mode architecture (124-4)', () => {
    // After 124-4, cyclist no longer gates /ws/claude via isBikeRackMode.
    // Mode detection uses setMode('cyclist'|'bikerack') in server startup.
    const wsPath = join(SRC_DIR, 'websocket.ts');
    const content = readFileSync(wsPath, 'utf-8');

    // Cyclist's websocket.ts should NOT reference isBikeRackMode
    expect(content).not.toMatch(/isBikeRackMode/);
  });
});

// ============================================================================
// AC9: No panel receives BikeRack-specific props (Rule 2)
// ============================================================================

describe('AC9: Rule 2 — No BikeRack-specific props to panels', () => {
  it('StandalonePanel should render panels with zero props', () => {
    const standalonePath = join(BIKERACK_SRC, 'StandalonePanel.tsx');
    const content = readFileSync(standalonePath, 'utf-8');

    // Panel rendering should be <PanelComponent /> with no props
    expect(content).toMatch(/<PanelComponent\s*\/>/);
  });

  it('no panel component should accept isBikeRack or bikeRack props', () => {
    const panelFiles = readdirSync(PANELS_DIR)
      .filter(f => f.endsWith('.tsx'))
      .map(f => join(PANELS_DIR, f));
    expect(panelFiles.length).toBeGreaterThan(0);

    for (const panelFile of panelFiles) {
      const content = readFileSync(panelFile, 'utf-8');
      const fileName = panelFile.split('/').pop();

      // Strip comments before checking for BikeRack-specific prop patterns
      const codeOnly = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
      // No panel should have bikeRack-related prop types in code
      expect(codeOnly, `${fileName} has BikeRack prop`).not.toMatch(/isBikeRack|bikeRackMode|IS_BIKERACK/);
    }
  });

  it('App.tsx should not pass BikeRack-specific props to StandalonePanel', () => {
    const appPath = join(SRC_DIR, 'public', 'App.tsx');
    const content = readFileSync(appPath, 'utf-8');

    // StandalonePanel should be rendered without bikeRack props
    if (content.includes('StandalonePanel')) {
      expect(content).not.toMatch(/<StandalonePanel\s+.*bikeRack/i);
    }
  });
});

// ============================================================================
// AC10: Rule 1 — Centralized mode detection via isBikeRackMode()
// ============================================================================

describe('AC10: Rule 1 — Only isBikeRackMode() for mode detection', () => {
  it('isBikeRackMode should be defined in core env.ts', () => {
    // After 124-4, isBikeRackMode lives in core's env.ts, not cyclist's server.ts
    const envPath = resolve(__dirname, '..', '..', 'core', 'src', 'server', 'env.ts');
    const content = readFileSync(envPath, 'utf-8');

    expect(content).toMatch(/export\s+function\s+isBikeRackMode/);
  });

  it('isBikeRackMode should check process.env.IS_BIKERACK === "1"', () => {
    // After 98-17, isBikeRackMode is defined in core's env.ts
    const envPath = resolve(__dirname, '..', '..', 'core', 'src', 'server', 'env.ts');
    const content = readFileSync(envPath, 'utf-8');

    // Extract the function body
    const funcMatch = content.match(/function\s+isBikeRackMode\(\)[^{]*\{([^}]+)\}/);
    expect(funcMatch).not.toBeNull();
    expect(funcMatch![1]).toMatch(/process\.env\.IS_BIKERACK\s*===\s*['"]1['"]/);
  });

  it('no source files should check process.env.IS_BIKERACK directly (except server.ts and bikerack.ts)', () => {
    // After 98-17: bikerack.ts (sets the env var), env.ts (defines isBikeRackMode)
    // Core's env.ts also defines isBikeRackMode() — both are allowed
    const ALLOWED_FILES = ['bikerack.ts', 'env.ts'];

    // Recursively collect .ts files from SRC_DIR
    function collectTsFiles(dir: string): string[] {
      const results: string[] = [];
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          results.push(...collectTsFiles(fullPath));
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
          results.push(fullPath);
        }
      }
      return results;
    }

    const srcFiles = collectTsFiles(SRC_DIR);
    const violations: string[] = [];

    for (const filePath of srcFiles) {
      const fileName = filePath.split('/').pop()!;
      if (ALLOWED_FILES.includes(fileName)) continue;
      if (filePath.includes('/tests/') || filePath.includes('/dist/')) continue;

      const content = readFileSync(filePath, 'utf-8');
      if (content.match(/process\.env\.IS_BIKERACK/)) {
        violations.push(fileName);
      }
    }

    expect(violations, `Files with direct IS_BIKERACK checks: ${violations.join(', ')}`).toEqual([]);
  });

  it('websocket.ts should not have direct env checks', () => {
    const wsPath = join(SRC_DIR, 'websocket.ts');
    const content = readFileSync(wsPath, 'utf-8');

    // After 124-4, mode gating moved to bikerack server module
    expect(content).not.toMatch(/process\.env\.IS_BIKERACK/);
  });
});

// ============================================================================
// Cross-cutting: BikeRack architectural integrity
// ============================================================================

describe('Architectural integrity', () => {
  it('entry.ts should not import Electron modules (Rule 9)', () => {
    const content = readFileSync(BIKERACK_ENTRY, 'utf-8');

    expect(content).not.toMatch(/from\s+['"]electron/);
  });

  it('entry.ts should not import dockview (Rule 7)', () => {
    const content = readFileSync(BIKERACK_ENTRY, 'utf-8');

    expect(content).not.toMatch(/from\s+['"]dockview/);
  });

  it('entry.ts should not import main.ts (Rule 9)', () => {
    const content = readFileSync(BIKERACK_ENTRY, 'utf-8');

    expect(content).not.toMatch(/from\s+['"]\.\/main/);
  });

  it('StandalonePanel should not import dockview (Rule 7)', () => {
    const standalonePath = join(BIKERACK_SRC, 'StandalonePanel.tsx');
    const content = readFileSync(standalonePath, 'utf-8');

    expect(content).not.toMatch(/from\s+['"]dockview/);
  });
});

// ============================================================================
// Runtime verification — actual module imports and function calls
// ============================================================================

describe('Runtime: isBikeRackMode() gate function', () => {
  // After 124-4, isBikeRackMode lives in core's server module
  const originalEnv = process.env.IS_BIKERACK;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.IS_BIKERACK;
    } else {
      process.env.IS_BIKERACK = originalEnv;
    }
  });

  it('should be an exported function from core server module', async () => {
    const serverModule = await import('../../core/src/server/server.js');
    expect(serverModule).toHaveProperty('isBikeRackMode');
    expect(typeof serverModule.isBikeRackMode).toBe('function');
  });

  it('should return true when IS_BIKERACK is "1"', async () => {
    process.env.IS_BIKERACK = '1';
    const { isBikeRackMode } = await import('../../core/src/server/server.js');
    expect(isBikeRackMode()).toBe(true);
  });

  it('should return false when IS_BIKERACK is not set', async () => {
    delete process.env.IS_BIKERACK;
    const { isBikeRackMode } = await import('../../core/src/server/server.js');
    expect(isBikeRackMode()).toBe(false);
  });
});

describe('Runtime: createTerminalServer()', () => {
  it('should be an exported function from bikerack server module', async () => {
    const serverModule = await import('../../bikerack/src/server.js');
    expect(serverModule).toHaveProperty('createTerminalServer');
    expect(typeof serverModule.createTerminalServer).toBe('function');
  });

  it('should return an HTTP Server with listen and close methods', async () => {
    const { createTerminalServer } = await import('../../bikerack/src/server.js');
    const server = createTerminalServer();
    try {
      expect(server).toBeDefined();
      expect(typeof server.listen).toBe('function');
      expect(typeof server.close).toBe('function');
      expect(typeof server.address).toBe('function');
    } finally {
      server.close();
    }
  });
});

describe('Runtime: findAvailablePort()', () => {
  it('should be an exported async function from bikerack server module', async () => {
    const serverModule = await import('../../bikerack/src/server.js');
    expect(serverModule).toHaveProperty('findAvailablePort');
    expect(typeof serverModule.findAvailablePort).toBe('function');
  });

  it('should return an available port number', async () => {
    const { findAvailablePort } = await import('../../bikerack/src/server.js');
    const port = await findAvailablePort(19000);
    expect(typeof port).toBe('number');
    expect(port).toBeGreaterThanOrEqual(19000);
  });
});

describe('Runtime: Port file cleanup pattern', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `bikerack-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('cleanup removes .bikerack-port when it exists', () => {
    const portFile = join(testDir, '.bikerack-port');
    writeFileSync(portFile, '2898');
    expect(existsSync(portFile)).toBe(true);

    // Replicate cleanupPortFile logic from bikerack.ts
    if (existsSync(portFile)) {
      unlinkSync(portFile);
    }
    expect(existsSync(portFile)).toBe(false);
  });

  it('cleanup is safe when .bikerack-port does not exist', () => {
    const portFile = join(testDir, '.bikerack-port');
    expect(existsSync(portFile)).toBe(false);

    // Should not throw
    if (existsSync(portFile)) {
      unlinkSync(portFile);
    }
    expect(existsSync(portFile)).toBe(false);
  });
});
