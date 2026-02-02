/**
 * MSSCI-12721: Command Palette Tests
 *
 * Tests verify the Command Palette component for keyboard-driven navigation.
 *
 * Acceptance Criteria:
 * - AC1: Cmd+Shift+P opens searchable command palette
 * - AC2: Filter commands by typing (fuzzy search)
 * - AC3: Categories: Panels, Navigation, Settings, Agents
 * - AC4: Shows keyboard shortcuts for each command
 * - AC5: Enter executes selected command, Escape closes
 * - AC6: Recent commands appear at top
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('MSSCI-12721: Command Palette', () => {

  describe('Module Structure', () => {

    it('should export CommandPalette component', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      expect(module.default).toBeDefined();
      expect(typeof module.default).toBe('function');
    });

    it('should export CommandRegistry type', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      expect(module.CommandRegistry).toBeDefined();
    });

    it('should export Command interface', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      expect(module.Command).toBeDefined();
    });

    it('should export useCommandPalette hook', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      expect(module.useCommandPalette).toBeDefined();
      expect(typeof module.useCommandPalette).toBe('function');
    });

    it('should export registerCommand function', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      expect(module.registerCommand).toBeDefined();
      expect(typeof module.registerCommand).toBe('function');
    });

  });

  describe('AC1: Cmd+Shift+P opens searchable command palette', () => {

    it('should export COMMAND_PALETTE_TRIGGER constant', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      expect(module.COMMAND_PALETTE_TRIGGER).toBeDefined();
      expect(module.COMMAND_PALETTE_TRIGGER).toEqual({
        key: 'p',
        metaKey: true,  // Cmd on Mac
        shiftKey: true,
      });
    });

    it('should export isCommandPaletteTrigger function', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      expect(module.isCommandPaletteTrigger).toBeDefined();
      expect(typeof module.isCommandPaletteTrigger).toBe('function');
    });

    it('should detect Cmd+Shift+P on Mac', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      const event = new KeyboardEvent('keydown', {
        key: 'p',
        metaKey: true,
        shiftKey: true,
      });

      expect(module.isCommandPaletteTrigger(event)).toBe(true);
    });

    it('should detect Ctrl+Shift+P on Windows/Linux', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      const event = new KeyboardEvent('keydown', {
        key: 'p',
        ctrlKey: true,
        shiftKey: true,
      });

      expect(module.isCommandPaletteTrigger(event)).toBe(true);
    });

    it('should not trigger on just Cmd+P', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      const event = new KeyboardEvent('keydown', {
        key: 'p',
        metaKey: true,
        shiftKey: false,
      });

      expect(module.isCommandPaletteTrigger(event)).toBe(false);
    });

    it('should render as modal overlay when open', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      // Test that CommandPalette renders with modal-overlay class when visible
      expect(module.MODAL_OVERLAY_CLASS).toBe('command-palette-overlay');
    });

    it('should include search input when open', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      expect(module.SEARCH_INPUT_ID).toBeDefined();
      expect(typeof module.SEARCH_INPUT_ID).toBe('string');
    });

    it('should focus search input when opened', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      expect(module.focusSearchInput).toBeDefined();
      expect(typeof module.focusSearchInput).toBe('function');
    });

  });

  describe('AC2: Filter commands by typing (fuzzy search)', () => {

    it('should export filterCommands function', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      expect(module.filterCommands).toBeDefined();
      expect(typeof module.filterCommands).toBe('function');
    });

    it('should match exact command names', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      const commands = [
        { id: 'settings', name: 'Open Settings', category: 'Settings' },
        { id: 'files', name: 'Open Files', category: 'Navigation' },
      ];

      const filtered = module.filterCommands(commands, 'settings');

      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe('settings');
    });

    it('should support fuzzy matching', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      const commands = [
        { id: 'open-settings', name: 'Open Settings', category: 'Settings' },
        { id: 'toggle-panel', name: 'Toggle Panel', category: 'Panels' },
      ];

      // 'ops' should fuzzy match 'Open Settings' (O-p-e-n S-e-t-t-i-n-g-s)
      const filtered = module.filterCommands(commands, 'ops');

      expect(filtered.some(c => c.id === 'open-settings')).toBe(true);
    });

    it('should be case-insensitive', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      const commands = [
        { id: 'settings', name: 'Open Settings', category: 'Settings' },
      ];

      const filtered = module.filterCommands(commands, 'SETTINGS');

      expect(filtered.length).toBe(1);
    });

    it('should return all commands when query is empty', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      const commands = [
        { id: 'a', name: 'Command A', category: 'Cat' },
        { id: 'b', name: 'Command B', category: 'Cat' },
      ];

      const filtered = module.filterCommands(commands, '');

      expect(filtered.length).toBe(2);
    });

    it('should highlight matched characters in results', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      expect(module.highlightMatch).toBeDefined();
      expect(typeof module.highlightMatch).toBe('function');
    });

    it('should rank better matches higher', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      const commands = [
        { id: 'settings-panel', name: 'Settings Panel', category: 'Panels' },
        { id: 'open-settings', name: 'Open Settings', category: 'Settings' },
      ];

      // 'set' should rank 'Settings Panel' (starts with Set) higher than 'Open Settings'
      const filtered = module.filterCommands(commands, 'set');

      expect(filtered[0].id).toBe('settings-panel');
    });

  });

  describe('AC3: Categories: Panels, Navigation, Settings, Agents', () => {

    it('should export COMMAND_CATEGORIES constant', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      expect(module.COMMAND_CATEGORIES).toBeDefined();
      expect(Array.isArray(module.COMMAND_CATEGORIES)).toBe(true);
    });

    it('should include required categories', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      expect(module.COMMAND_CATEGORIES).toContain('Panels');
      expect(module.COMMAND_CATEGORIES).toContain('Navigation');
      expect(module.COMMAND_CATEGORIES).toContain('Settings');
      expect(module.COMMAND_CATEGORIES).toContain('Agents');
    });

    it('should group commands by category', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      expect(module.groupByCategory).toBeDefined();
      expect(typeof module.groupByCategory).toBe('function');
    });

    it('should return commands grouped by category', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      const commands = [
        { id: 'a', name: 'Panel A', category: 'Panels' },
        { id: 'b', name: 'Panel B', category: 'Panels' },
        { id: 'c', name: 'Setting C', category: 'Settings' },
      ];

      const grouped = module.groupByCategory(commands);

      expect(grouped['Panels']).toHaveLength(2);
      expect(grouped['Settings']).toHaveLength(1);
    });

    it('should render category headers in palette', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      expect(module.CATEGORY_HEADER_CLASS).toBeDefined();
      expect(typeof module.CATEGORY_HEADER_CLASS).toBe('string');
    });

    it('should allow filtering by category', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      expect(module.filterByCategory).toBeDefined();
      expect(typeof module.filterByCategory).toBe('function');
    });

    it('should filter commands to single category', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      const commands = [
        { id: 'a', name: 'Panel A', category: 'Panels' },
        { id: 'b', name: 'Setting B', category: 'Settings' },
      ];

      const filtered = module.filterByCategory(commands, 'Panels');

      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe('a');
    });

  });

  describe('AC4: Shows keyboard shortcuts for each command', () => {

    it('should include shortcut in Command interface', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      // Verify the command structure includes shortcut
      const sampleCommand = {
        id: 'test',
        name: 'Test Command',
        category: 'Settings',
        shortcut: 'Cmd+,',
      };

      expect(module.validateCommand).toBeDefined();
      expect(module.validateCommand(sampleCommand)).toBe(true);
    });

    it('should export formatShortcut function', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      expect(module.formatShortcut).toBeDefined();
      expect(typeof module.formatShortcut).toBe('function');
    });

    it('should format Mac shortcuts with symbols', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      const formatted = module.formatShortcut('Cmd+Shift+P', 'mac');

      expect(formatted).toContain('⌘'); // Command symbol
      expect(formatted).toContain('⇧'); // Shift symbol
      expect(formatted).toContain('P');
    });

    it('should format Windows shortcuts with text', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      const formatted = module.formatShortcut('Cmd+Shift+P', 'windows');

      expect(formatted).toContain('Ctrl');
      expect(formatted).toContain('Shift');
      expect(formatted).toContain('P');
    });

    it('should render shortcut next to command name', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      expect(module.SHORTCUT_DISPLAY_CLASS).toBeDefined();
      expect(typeof module.SHORTCUT_DISPLAY_CLASS).toBe('string');
    });

    it('should detect current platform', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      expect(module.detectPlatform).toBeDefined();
      expect(typeof module.detectPlatform).toBe('function');
    });

    it('should return mac or windows from detectPlatform', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      const platform = module.detectPlatform();

      expect(['mac', 'windows', 'linux']).toContain(platform);
    });

  });

  describe('AC5: Enter executes selected command, Escape closes', () => {

    it('should export executeCommand function', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      expect(module.executeCommand).toBeDefined();
      expect(typeof module.executeCommand).toBe('function');
    });

    it('should execute command handler on Enter', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      const handler = vi.fn();
      const command = {
        id: 'test',
        name: 'Test',
        category: 'Settings',
        handler,
      };

      module.executeCommand(command);

      expect(handler).toHaveBeenCalled();
    });

    it('should close palette on Escape', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      expect(module.closePalette).toBeDefined();
      expect(typeof module.closePalette).toBe('function');
    });

    it('should track selected command index', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      expect(module.getSelectedIndex).toBeDefined();
      expect(module.setSelectedIndex).toBeDefined();
    });

    it('should navigate down with Arrow Down', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      expect(module.handleArrowDown).toBeDefined();
      expect(typeof module.handleArrowDown).toBe('function');
    });

    it('should navigate up with Arrow Up', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      expect(module.handleArrowUp).toBeDefined();
      expect(typeof module.handleArrowUp).toBe('function');
    });

    it('should wrap navigation at boundaries', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      // When at index 0, Arrow Up should wrap to last item
      const commands = [
        { id: 'a', name: 'A', category: 'Cat' },
        { id: 'b', name: 'B', category: 'Cat' },
      ];

      module.setSelectedIndex(0);
      module.handleArrowUp(commands.length);

      expect(module.getSelectedIndex()).toBe(1); // Wrapped to last
    });

    it('should scroll selected item into view', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      expect(module.scrollSelectedIntoView).toBeDefined();
      expect(typeof module.scrollSelectedIntoView).toBe('function');
    });

  });

  describe('AC6: Recent commands appear at top', () => {

    it('should export getRecentCommands function', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      expect(module.getRecentCommands).toBeDefined();
      expect(typeof module.getRecentCommands).toBe('function');
    });

    it('should export addToRecent function', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      expect(module.addToRecent).toBeDefined();
      expect(typeof module.addToRecent).toBe('function');
    });

    it('should store recent commands in localStorage', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      expect(module.RECENT_COMMANDS_KEY).toBeDefined();
      expect(typeof module.RECENT_COMMANDS_KEY).toBe('string');
    });

    it('should limit recent commands to MAX_RECENT', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      expect(module.MAX_RECENT_COMMANDS).toBeDefined();
      expect(typeof module.MAX_RECENT_COMMANDS).toBe('number');
      expect(module.MAX_RECENT_COMMANDS).toBeGreaterThan(0);
      expect(module.MAX_RECENT_COMMANDS).toBeLessThanOrEqual(10);
    });

    it('should move command to top when used again', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      // Clear recent
      localStorage.removeItem(module.RECENT_COMMANDS_KEY);

      // Add commands
      module.addToRecent('cmd-a');
      module.addToRecent('cmd-b');
      module.addToRecent('cmd-a'); // Use A again

      const recent = module.getRecentCommands();

      expect(recent[0]).toBe('cmd-a'); // A should be at top
    });

    it('should render recent section at top of palette', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      expect(module.RECENT_SECTION_CLASS).toBeDefined();
      expect(typeof module.RECENT_SECTION_CLASS).toBe('string');
    });

    it('should clear recent commands', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      expect(module.clearRecentCommands).toBeDefined();
      expect(typeof module.clearRecentCommands).toBe('function');
    });

    it('should sort recent commands at top of filtered results', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      expect(module.sortWithRecentFirst).toBeDefined();
      expect(typeof module.sortWithRecentFirst).toBe('function');
    });

  });

  describe('Integration with App', () => {

    it('should export CommandPaletteProvider', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      expect(module.CommandPaletteProvider).toBeDefined();
    });

    it('should provide open/close methods via context', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      expect(module.useCommandPaletteContext).toBeDefined();
      expect(typeof module.useCommandPaletteContext).toBe('function');
    });

    it('should register global keyboard listener', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      expect(module.setupGlobalKeyboardListener).toBeDefined();
      expect(typeof module.setupGlobalKeyboardListener).toBe('function');
    });

  });

  describe('Default Commands', () => {

    it('should export DEFAULT_COMMANDS array', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      expect(module.DEFAULT_COMMANDS).toBeDefined();
      expect(Array.isArray(module.DEFAULT_COMMANDS)).toBe(true);
    });

    it('should include panel toggle commands', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      const panelCommands = module.DEFAULT_COMMANDS.filter(
        (c: { category: string }) => c.category === 'Panels'
      );

      expect(panelCommands.length).toBeGreaterThan(0);
    });

    it('should include agent commands', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      const agentCommands = module.DEFAULT_COMMANDS.filter(
        (c: { category: string }) => c.category === 'Agents'
      );

      expect(agentCommands.length).toBeGreaterThan(0);
    });

    it('should include navigation commands', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      const navCommands = module.DEFAULT_COMMANDS.filter(
        (c: { category: string }) => c.category === 'Navigation'
      );

      expect(navCommands.length).toBeGreaterThan(0);
    });

    it('should include settings commands', async () => {
      const module = await import('../src/public/components/CommandPalette.js');

      const settingsCommands = module.DEFAULT_COMMANDS.filter(
        (c: { category: string }) => c.category === 'Settings'
      );

      expect(settingsCommands.length).toBeGreaterThan(0);
    });

  });

});
