/**
 * Story 98-20: Extract Electron shell to packages/electron with BikeShow entry point
 * Jira: MSSCI-15078
 *
 * RED phase tests — verify that the Electron shell has been properly extracted
 * from packages/cyclist into packages/electron with a BikeShow entry point.
 *
 * ACs covered:
 * - AC1: New packages/electron package created with clean Electron shell code
 * - AC2: BikeShow entry point (packages/electron/src/bikeshow.ts) created and functional
 * - AC3: packages/cyclist retains only React UI + web server bridge code
 * - AC4: IPC channels and menu builders in packages/electron are testable
 * - AC5: Build scripts functional for both packages
 * - AC9: No broken imports or circular dependencies
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const ELECTRON_PKG_DIR = join(__dirname, '..', '..', 'electron');
const CYCLIST_SRC_DIR = join(__dirname, '..', 'src');

// ============================================================================
// Group 1: packages/electron package structure (AC1)
// ============================================================================

describe('packages/electron package structure', () => {
  it('should have a packages/electron directory', () => {
    // AC1: New packages/electron package must exist
    expect(existsSync(ELECTRON_PKG_DIR)).toBe(true);
  });

  it('should have a valid package.json', () => {
    const pkgJsonPath = join(ELECTRON_PKG_DIR, 'package.json');
    expect(existsSync(pkgJsonPath)).toBe(true);

    const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
    expect(pkg.name).toBe('@pennyfarthing/electron');
  });

  it('should have type: module in package.json', () => {
    const pkg = JSON.parse(readFileSync(join(ELECTRON_PKG_DIR, 'package.json'), 'utf-8'));
    expect(pkg.type).toBe('module');
  });

  it('should depend on @pennyfarthing/core via workspace:*', () => {
    const pkg = JSON.parse(readFileSync(join(ELECTRON_PKG_DIR, 'package.json'), 'utf-8'));
    expect(pkg.dependencies?.['@pennyfarthing/core']).toBe('workspace:*');
  });

  it('should have electron as a devDependency', () => {
    const pkg = JSON.parse(readFileSync(join(ELECTRON_PKG_DIR, 'package.json'), 'utf-8'));
    expect(pkg.devDependencies).toHaveProperty('electron');
  });

  it('should have electron-builder as a devDependency', () => {
    const pkg = JSON.parse(readFileSync(join(ELECTRON_PKG_DIR, 'package.json'), 'utf-8'));
    expect(pkg.devDependencies).toHaveProperty('electron-builder');
  });

  it('should have a build script in package.json', () => {
    const pkg = JSON.parse(readFileSync(join(ELECTRON_PKG_DIR, 'package.json'), 'utf-8'));
    expect(pkg.scripts).toHaveProperty('build');
  });

  it('should have a tsconfig.json', () => {
    expect(existsSync(join(ELECTRON_PKG_DIR, 'tsconfig.json'))).toBe(true);
  });

  it('should have a tsconfig.preload.json for CommonJS preload compilation', () => {
    expect(existsSync(join(ELECTRON_PKG_DIR, 'tsconfig.preload.json'))).toBe(true);
  });
});

// ============================================================================
// Group 2: Source files exist in packages/electron (AC1, AC4)
// ============================================================================

describe('packages/electron source files', () => {
  it('should have src/main.ts (Electron main process)', () => {
    expect(existsSync(join(ELECTRON_PKG_DIR, 'src', 'main.ts'))).toBe(true);
  });

  it('should have src/preload.ts (Electron preload script)', () => {
    expect(existsSync(join(ELECTRON_PKG_DIR, 'src', 'preload.ts'))).toBe(true);
  });

  it('should have src/ipc-channels.ts (IPC channel definitions)', () => {
    expect(existsSync(join(ELECTRON_PKG_DIR, 'src', 'ipc-channels.ts'))).toBe(true);
  });

  it('should have src/menu-builder.ts (Electron menu builders)', () => {
    expect(existsSync(join(ELECTRON_PKG_DIR, 'src', 'menu-builder.ts'))).toBe(true);
  });

  it('should have src/bikeshow.ts (BikeShow entry point)', () => {
    expect(existsSync(join(ELECTRON_PKG_DIR, 'src', 'bikeshow.ts'))).toBe(true);
  });
});

// ============================================================================
// Group 3: BikeShow entry point (AC2)
// ============================================================================

describe('BikeShow entry point', () => {
  it('should exist at packages/electron/src/bikeshow.ts', () => {
    // AC2: BikeShow entry point created
    const bikeshowPath = join(ELECTRON_PKG_DIR, 'src', 'bikeshow.ts');
    expect(existsSync(bikeshowPath)).toBe(true);
  });

  it('should import from Electron (unlike bikerack which is Node-only)', () => {
    // AC2: BikeShow is the Electron entry point
    const bikeshowPath = join(ELECTRON_PKG_DIR, 'src', 'bikeshow.ts');
    const content = readFileSync(bikeshowPath, 'utf-8');
    expect(content).toMatch(/from\s+['"]electron/);
  });

  it('should import main process setup', () => {
    // AC2: BikeShow should wire up the main Electron process
    const bikeshowPath = join(ELECTRON_PKG_DIR, 'src', 'bikeshow.ts');
    const content = readFileSync(bikeshowPath, 'utf-8');
    // Should import from local main module
    expect(content).toMatch(/from\s+['"]\.\/main/);
  });

  it('should NOT import from cyclist package', () => {
    // AC2: BikeShow is self-contained in packages/electron
    const bikeshowPath = join(ELECTRON_PKG_DIR, 'src', 'bikeshow.ts');
    const content = readFileSync(bikeshowPath, 'utf-8');
    expect(content).not.toMatch(/from\s+['"]@pennyfarthing\/cyclist/);
    expect(content).not.toMatch(/from\s+['"]\.\.\/cyclist/);
  });
});

// ============================================================================
// Group 4: IPC channels in packages/electron (AC4)
// ============================================================================

describe('IPC channels in packages/electron', () => {
  it('should export IPC_DATA_CHANNELS', () => {
    const ipcPath = join(ELECTRON_PKG_DIR, 'src', 'ipc-channels.ts');
    const content = readFileSync(ipcPath, 'utf-8');
    expect(content).toMatch(/export\s+const\s+IPC_DATA_CHANNELS/);
  });

  it('should export IPC_CLAUDE_CHANNELS', () => {
    const ipcPath = join(ELECTRON_PKG_DIR, 'src', 'ipc-channels.ts');
    const content = readFileSync(ipcPath, 'utf-8');
    expect(content).toMatch(/export\s+const\s+IPC_CLAUDE_CHANNELS/);
  });

  it('should export IPC_SETTINGS_CHANNELS', () => {
    const ipcPath = join(ELECTRON_PKG_DIR, 'src', 'ipc-channels.ts');
    const content = readFileSync(ipcPath, 'utf-8');
    expect(content).toMatch(/export\s+const\s+IPC_SETTINGS_CHANNELS/);
  });

  it('should export IPC_AGENT_CHANNELS', () => {
    const ipcPath = join(ELECTRON_PKG_DIR, 'src', 'ipc-channels.ts');
    const content = readFileSync(ipcPath, 'utf-8');
    expect(content).toMatch(/export\s+const\s+IPC_AGENT_CHANNELS/);
  });

  it('should export IPC_LAYOUT_CHANNELS', () => {
    const ipcPath = join(ELECTRON_PKG_DIR, 'src', 'ipc-channels.ts');
    const content = readFileSync(ipcPath, 'utf-8');
    expect(content).toMatch(/export\s+const\s+IPC_LAYOUT_CHANNELS/);
  });

  it('should export IPC_AVATAR_CHANNELS', () => {
    const ipcPath = join(ELECTRON_PKG_DIR, 'src', 'ipc-channels.ts');
    const content = readFileSync(ipcPath, 'utf-8');
    expect(content).toMatch(/export\s+const\s+IPC_AVATAR_CHANNELS/);
  });

  it('should export all channel groups from cyclist original', () => {
    // Verify we haven't lost any IPC channel groups during extraction
    const ipcPath = join(ELECTRON_PKG_DIR, 'src', 'ipc-channels.ts');
    const content = readFileSync(ipcPath, 'utf-8');

    const expectedChannels = [
      'IPC_DATA_CHANNELS',
      'IPC_CLAUDE_CHANNELS',
      'IPC_AGENT_CHANNELS',
      'IPC_DIFF_CHANNELS',
      'IPC_SETTINGS_CHANNELS',
      'IPC_AUDIT_LOG_CHANNELS',
      'IPC_FILE_BROWSER_CHANNELS',
      'IPC_COMMAND_CHANNELS',
      'IPC_BACKGROUND_TASK_CHANNELS',
      'IPC_SKILL_CHANNELS',
      'IPC_CONTEXT_CLEAR_CHANNELS',
      'IPC_LAYOUT_CHANNELS',
      'IPC_AVATAR_CHANNELS',
    ];

    for (const channel of expectedChannels) {
      expect(content, `Missing export: ${channel}`).toMatch(
        new RegExp(`export\\s+const\\s+${channel}`)
      );
    }
  });
});

// ============================================================================
// Group 5: Menu builders in packages/electron (AC4)
// ============================================================================

describe('Menu builders in packages/electron', () => {
  it('should export buildAgentMenu', () => {
    const menuPath = join(ELECTRON_PKG_DIR, 'src', 'menu-builder.ts');
    const content = readFileSync(menuPath, 'utf-8');
    expect(content).toMatch(/export\s+function\s+buildAgentMenu/);
  });

  it('should export buildWorkflowMenu', () => {
    const menuPath = join(ELECTRON_PKG_DIR, 'src', 'menu-builder.ts');
    const content = readFileSync(menuPath, 'utf-8');
    expect(content).toMatch(/export\s+function\s+buildWorkflowMenu/);
  });

  it('should export buildViewMenu', () => {
    const menuPath = join(ELECTRON_PKG_DIR, 'src', 'menu-builder.ts');
    const content = readFileSync(menuPath, 'utf-8');
    expect(content).toMatch(/export\s+function\s+buildViewMenu/);
  });

  it('should export buildAppMenu', () => {
    const menuPath = join(ELECTRON_PKG_DIR, 'src', 'menu-builder.ts');
    const content = readFileSync(menuPath, 'utf-8');
    expect(content).toMatch(/export\s+function\s+buildAppMenu/);
  });

  it('should export buildToolsMenu', () => {
    const menuPath = join(ELECTRON_PKG_DIR, 'src', 'menu-builder.ts');
    const content = readFileSync(menuPath, 'utf-8');
    expect(content).toMatch(/export\s+function\s+buildToolsMenu/);
  });

  it('should export AGENT_DEFINITIONS constant', () => {
    const menuPath = join(ELECTRON_PKG_DIR, 'src', 'menu-builder.ts');
    const content = readFileSync(menuPath, 'utf-8');
    expect(content).toMatch(/export\s+const\s+AGENT_DEFINITIONS/);
  });

  it('should export WORKFLOW_DEFINITIONS constant', () => {
    const menuPath = join(ELECTRON_PKG_DIR, 'src', 'menu-builder.ts');
    const content = readFileSync(menuPath, 'utf-8');
    expect(content).toMatch(/export\s+const\s+WORKFLOW_DEFINITIONS/);
  });

  it('should import IPC channels from local ipc-channels (not cyclist)', () => {
    const menuPath = join(ELECTRON_PKG_DIR, 'src', 'menu-builder.ts');
    const content = readFileSync(menuPath, 'utf-8');
    // Should use local import, not cross-package
    expect(content).toMatch(/from\s+['"]\.\/ipc-channels/);
    expect(content).not.toMatch(/from\s+['"]@pennyfarthing\/cyclist/);
  });
});

// ============================================================================
// Group 6: Electron main.ts in packages/electron (AC1)
// ============================================================================

describe('Electron main.ts in packages/electron', () => {
  it('should import from electron module', () => {
    const mainPath = join(ELECTRON_PKG_DIR, 'src', 'main.ts');
    const content = readFileSync(mainPath, 'utf-8');
    // main.ts uses require('electron') at runtime (createRequire pattern)
    expect(content).toMatch(/require\(['"]electron['"]\)/);
  });

  it('should import IPC channels from local module', () => {
    const mainPath = join(ELECTRON_PKG_DIR, 'src', 'main.ts');
    const content = readFileSync(mainPath, 'utf-8');
    expect(content).toMatch(/from\s+['"]\.\/ipc-channels/);
  });

  it('should import menu builder from local module', () => {
    const mainPath = join(ELECTRON_PKG_DIR, 'src', 'main.ts');
    const content = readFileSync(mainPath, 'utf-8');
    expect(content).toMatch(/from\s+['"]\.\/menu-builder/);
  });

  it('should NOT import directly from @pennyfarthing/cyclist', () => {
    const mainPath = join(ELECTRON_PKG_DIR, 'src', 'main.ts');
    const content = readFileSync(mainPath, 'utf-8');
    expect(content).not.toMatch(/from\s+['"]@pennyfarthing\/cyclist['"]/);
  });
});

// ============================================================================
// Group 7: Cyclist cleanup — no Electron files remain (AC3)
// ============================================================================

describe('Cyclist cleanup', () => {
  it('should NOT have src/main.ts as an Electron entry point', () => {
    // AC3: After extraction, cyclist main.ts should not import electron
    // If main.ts still exists, it should not be an Electron entry point
    const mainPath = join(CYCLIST_SRC_DIR, 'main.ts');
    if (existsSync(mainPath)) {
      const content = readFileSync(mainPath, 'utf-8');
      // Should not import electron — that's now in packages/electron
      expect(content).not.toMatch(/from\s+['"]electron['"]/);
    }
    // If main.ts doesn't exist at all, that's also acceptable
  });

  it('should NOT have src/preload.ts', () => {
    // AC3: preload.ts is Electron-only, should be moved to packages/electron
    expect(existsSync(join(CYCLIST_SRC_DIR, 'preload.ts'))).toBe(false);
  });

  it('should NOT have tsconfig.preload.json', () => {
    // AC3: preload compilation config should move to packages/electron
    expect(existsSync(join(__dirname, '..', 'tsconfig.preload.json'))).toBe(false);
  });

  it('should still have src/server.ts (web server bridge)', () => {
    // AC3: cyclist retains web server bridge
    expect(existsSync(join(CYCLIST_SRC_DIR, 'server.ts'))).toBe(true);
  });

  it('should still have src/bikerack.ts (web entry point)', () => {
    // AC3: bikerack stays in cyclist (it's Node-only, not Electron)
    expect(existsSync(join(CYCLIST_SRC_DIR, 'bikerack.ts'))).toBe(true);
  });

  it('should NOT have electron as a devDependency in cyclist', () => {
    // AC3: Electron deps should move to packages/electron
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
    expect(pkg.devDependencies).not.toHaveProperty('electron');
  });

  it('should NOT have electron-builder as a devDependency in cyclist', () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
    expect(pkg.devDependencies).not.toHaveProperty('electron-builder');
  });

  it('should NOT have electron-reload as a devDependency in cyclist', () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
    expect(pkg.devDependencies).not.toHaveProperty('electron-reload');
  });

  it('should NOT have ipc-channels.ts in cyclist src', () => {
    // AC3: IPC channels are Electron-only, moved to packages/electron
    expect(existsSync(join(CYCLIST_SRC_DIR, 'ipc-channels.ts'))).toBe(false);
  });

  it('should NOT have menu-builder.ts in cyclist src', () => {
    // AC3: menu builders are Electron-only, moved to packages/electron
    expect(existsSync(join(CYCLIST_SRC_DIR, 'menu-builder.ts'))).toBe(false);
  });
});

// ============================================================================
// Group 8: Package.json cross-references (AC5, AC9)
// ============================================================================

describe('Package dependency wiring', () => {
  it('electron package.json should reference correct main entry', () => {
    const pkg = JSON.parse(readFileSync(join(ELECTRON_PKG_DIR, 'package.json'), 'utf-8'));
    // Main should point to compiled output
    expect(pkg.main).toMatch(/dist\//);
  });

  it('electron package.json should have electron-builder config', () => {
    const pkg = JSON.parse(readFileSync(join(ELECTRON_PKG_DIR, 'package.json'), 'utf-8'));
    expect(pkg.build).toBeDefined();
    expect(pkg.build.appId).toBeDefined();
  });

  it('cyclist package.json main should NOT reference main.ts/main.js', () => {
    // AC3: cyclist is no longer an Electron app, main should be server
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
    expect(pkg.main).not.toMatch(/main\.js$/);
  });
});

// ============================================================================
// Group 9: Preload script in packages/electron (AC1)
// ============================================================================

describe('Preload script in packages/electron', () => {
  it('should exist at src/preload.ts', () => {
    const preloadPath = join(ELECTRON_PKG_DIR, 'src', 'preload.ts');
    expect(existsSync(preloadPath)).toBe(true);
  });

  it('should use electron APIs (contextBridge, ipcRenderer)', () => {
    const preloadPath = join(ELECTRON_PKG_DIR, 'src', 'preload.ts');
    const content = readFileSync(preloadPath, 'utf-8');
    expect(content).toMatch(/require\(['"]electron['"]\)/);
    expect(content).toMatch(/contextBridge|ipcRenderer/);
  });

  it('should import IPC channels from local module', () => {
    const preloadPath = join(ELECTRON_PKG_DIR, 'src', 'preload.ts');
    const content = readFileSync(preloadPath, 'utf-8');
    expect(content).toMatch(/from\s+['"]\.\/ipc-channels/);
  });
});
