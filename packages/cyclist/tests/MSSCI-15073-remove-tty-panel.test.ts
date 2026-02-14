/**
 * MSSCI-15073: Remove TTY panel and node-pty dependency
 *
 * Story 98-15: Remove the unused TTY panel from Cyclist and eliminate node-pty
 * Epic: 98 — Safe Install, Upgrade, and Namespace Isolation
 *
 * These tests verify the ABSENCE of TTY artifacts after removal.
 * In RED state, all tests fail because TTY is still present.
 * In GREEN state, all tests pass after Dev removes TTY.
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const CYCLIST_ROOT = join(__dirname, '..');
const SRC_ROOT = join(CYCLIST_ROOT, 'src');

// Helper: read file content as string
function readFile(relativePath: string): string {
  return readFileSync(join(CYCLIST_ROOT, relativePath), 'utf-8');
}

// =============================================================================
// AC1: TTYPanel component removed from panels/
// =============================================================================

describe('MSSCI-15073: Remove TTY panel', () => {
  describe('AC1: TTYPanel component removed', () => {
    it('should not have TTYPanel.tsx file', () => {
      const exists = existsSync(
        join(SRC_ROOT, 'public/components/panels/TTYPanel.tsx')
      );
      expect(exists).toBe(false);
    });

    it('should not have TTY panel test file', () => {
      const exists = existsSync(
        join(CYCLIST_ROOT, 'tests/MSSCI-14211-tty-panel.test.tsx')
      );
      expect(exists).toBe(false);
    });
  });

  // ===========================================================================
  // AC2: TTYPanel export removed from panels/index.ts
  // ===========================================================================

  describe('AC2: TTYPanel export removed from panels/index.ts', () => {
    it('should not export TTYPanel from panels index', () => {
      const content = readFile('src/public/components/panels/index.ts');
      expect(content).not.toMatch(/TTYPanel/);
    });
  });

  // ===========================================================================
  // AC3: TTYPanel menu item removed from menu-builder.ts
  // ===========================================================================

  describe('AC3: TTY removed from View menu panels', () => {
    it('should not have tty entry in VIEW_MENU_PANELS', () => {
      const content = readFile('src/menu-builder.ts');
      expect(content).not.toMatch(/['"]tty['"]/);
    });
  });

  // ===========================================================================
  // AC4: TTYPanel removed from panel registry in DockviewWorkspace.tsx
  // ===========================================================================

  describe('AC4: TTY removed from DockviewWorkspace', () => {
    it('should not have TTY in PANEL_INVENTORY', () => {
      const content = readFile('src/public/components/DockviewWorkspace.tsx');
      expect(content).not.toMatch(/TTY:\s*['"]tty['"]/);
    });

    it('should not have tty in LEFT_SIDEBAR_PANELS', () => {
      const content = readFile('src/public/components/DockviewWorkspace.tsx');
      // Match the LEFT_SIDEBAR_PANELS array and ensure it doesn't contain TTY
      const leftPanelsMatch = content.match(/LEFT_SIDEBAR_PANELS\s*=\s*\[([^\]]+)\]/);
      expect(leftPanelsMatch).toBeTruthy();
      expect(leftPanelsMatch![1]).not.toMatch(/TTY|tty/);
    });

    it('should not have tty in PANEL_TITLES', () => {
      const content = readFile('src/public/components/DockviewWorkspace.tsx');
      // Look for tty key in the PANEL_TITLES object
      expect(content).not.toMatch(/tty:\s*['"]Terminal['"]/);
    });

    it('should not have tty in panelDisplayNames', () => {
      const content = readFile('src/public/components/DockviewWorkspace.tsx');
      // There are two places: PANEL_TITLES and panelDisplayNames
      const ttyOccurrences = (content.match(/tty/gi) || []).length;
      expect(ttyOccurrences).toBe(0);
    });
  });

  // ===========================================================================
  // AC5: TTY references removed from App.tsx and StandalonePanel.tsx
  // ===========================================================================

  describe('AC5: TTY references removed from App.tsx and StandalonePanel.tsx', () => {
    it('should not import TTYPanel in App.tsx', () => {
      const content = readFile('src/public/App.tsx');
      expect(content).not.toMatch(/TTYPanel/);
    });

    it('should not register TTY panel in App.tsx', () => {
      const content = readFile('src/public/App.tsx');
      expect(content).not.toMatch(/PANEL_INVENTORY\.TTY/);
    });

    it('should not import TTYPanel in StandalonePanel.tsx', () => {
      const content = readFile('src/public/components/StandalonePanel.tsx');
      expect(content).not.toMatch(/TTYPanel/);
    });

    it('should not have tty in StandalonePanel PANEL_REGISTRY', () => {
      const content = readFile('src/public/components/StandalonePanel.tsx');
      expect(content).not.toMatch(/tty:\s*TTYPanel/);
    });

    it('should not have tty in BikeRackIndex PANELS', () => {
      const content = readFile('src/public/components/BikeRackIndex.tsx');
      expect(content).not.toMatch(/['"]tty['"]/);
    });

    it('should not have tty in SettingsPanel PANEL_DISPLAY_NAMES', () => {
      const content = readFile('src/public/components/panels/SettingsPanel.tsx');
      expect(content).not.toMatch(/tty:\s*['"]Terminal['"]/);
    });
  });

  // ===========================================================================
  // AC6: TTY-related CSS removed from dockview-theme.css
  // ===========================================================================

  describe('AC6: TTY-related CSS removed', () => {
    it('should not have .tty-panel CSS class', () => {
      const content = readFile('src/public/styles/dockview-theme.css');
      expect(content).not.toMatch(/\.tty-panel\b/);
    });

    it('should not have .tty-overlay CSS class', () => {
      const content = readFile('src/public/styles/dockview-theme.css');
      expect(content).not.toMatch(/\.tty-overlay\b/);
    });

    it('should not have .tty-terminal-container CSS class', () => {
      const content = readFile('src/public/styles/dockview-theme.css');
      expect(content).not.toMatch(/\.tty-terminal-container\b/);
    });

    it('should not have .tty-restart-button CSS class', () => {
      const content = readFile('src/public/styles/dockview-theme.css');
      expect(content).not.toMatch(/\.tty-restart-button\b/);
    });
  });

  // ===========================================================================
  // AC7: node-pty dependency removed from package.json
  // ===========================================================================

  describe('AC7: node-pty dependency removed', () => {
    it('should not have node-pty in dependencies', () => {
      const pkg = JSON.parse(readFile('package.json'));
      expect(pkg.dependencies).not.toHaveProperty('node-pty');
    });

    it('should not have xterm in dependencies', () => {
      const pkg = JSON.parse(readFile('package.json'));
      expect(pkg.dependencies).not.toHaveProperty('xterm');
    });

    it('should not have xterm-addon-fit in dependencies', () => {
      const pkg = JSON.parse(readFile('package.json'));
      expect(pkg.dependencies).not.toHaveProperty('xterm-addon-fit');
    });
  });

  // ===========================================================================
  // AC8: No lingering TTY/pty references in server code
  // ===========================================================================

  describe('AC8: PTY WebSocket handler removed from websocket.ts', () => {
    it('should not have ptyWss WebSocket server', () => {
      const content = readFile('src/websocket.ts');
      expect(content).not.toMatch(/ptyWss/);
    });

    it('should not import node-pty', () => {
      const content = readFile('src/websocket.ts');
      expect(content).not.toMatch(/node-pty/);
    });

    it('should not have /ws/pty route', () => {
      const content = readFile('src/websocket.ts');
      expect(content).not.toMatch(/ws\/pty/);
    });
  });

  // ===========================================================================
  // AC9: No lingering TTY references in source code (comprehensive)
  // ===========================================================================

  describe('AC9: No lingering TTY references in source tree', () => {
    it('should not reference TTYPanel anywhere in panel registration', () => {
      // This is a belt-and-suspenders check across all registration points
      const app = readFile('src/public/App.tsx');
      const index = readFile('src/public/components/panels/index.ts');
      const standalone = readFile('src/public/components/StandalonePanel.tsx');

      const combined = app + index + standalone;
      expect(combined).not.toMatch(/TTYPanel/);
    });
  });
});
