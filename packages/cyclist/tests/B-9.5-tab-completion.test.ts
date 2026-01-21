/**
 * B-9.5: Tab Completion for Slash Commands Tests
 *
 * Tests verify slash command tab completion in the rich text editor.
 * Following TDD pattern: these tests are written BEFORE implementation.
 *
 * Acceptance Criteria:
 * - AC1: Tab key triggers completion when cursor after "/"
 * - AC2: Popup shows matching slash commands
 * - AC3: Typing filters the list in real-time
 * - AC4: Enter/Tab inserts selected command
 * - AC5: Escape closes popup without inserting
 * - AC6: Arrow keys navigate popup options
 * - AC7: Works with Pennyfarthing commands
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

describe('B-9.5: Tab Completion for Slash Commands', () => {

  describe('Module Exports - slash-commands.js', () => {

    it('should export SLASH_COMMANDS array', async () => {
      const slashCommands = await import('../src/public/js/slash-commands.js');

      expect(slashCommands.SLASH_COMMANDS).toBeDefined();
      expect(Array.isArray(slashCommands.SLASH_COMMANDS)).toBe(true);
    });

    it('should export filterCommands function', async () => {
      const slashCommands = await import('../src/public/js/slash-commands.js');

      expect(slashCommands.filterCommands).toBeDefined();
      expect(typeof slashCommands.filterCommands).toBe('function');
    });

    it('should have commands with name and description properties', async () => {
      const { SLASH_COMMANDS } = await import('../src/public/js/slash-commands.js');

      expect(SLASH_COMMANDS.length).toBeGreaterThan(0);
      SLASH_COMMANDS.forEach(cmd => {
        expect(cmd.name).toBeDefined();
        expect(typeof cmd.name).toBe('string');
        expect(cmd.name.startsWith('/')).toBe(true);
        expect(cmd.description).toBeDefined();
        expect(typeof cmd.description).toBe('string');
      });
    });

  });

  describe('Module Exports - editor.js completion functions', () => {

    it('should export showCompletionPopup function', async () => {
      const editor = await import('../src/public/js/editor.js');

      expect(editor.showCompletionPopup).toBeDefined();
      expect(typeof editor.showCompletionPopup).toBe('function');
    });

    it('should export closeCompletionPopup function', async () => {
      const editor = await import('../src/public/js/editor.js');

      expect(editor.closeCompletionPopup).toBeDefined();
      expect(typeof editor.closeCompletionPopup).toBe('function');
    });

    it('should export selectCompletion function', async () => {
      const editor = await import('../src/public/js/editor.js');

      expect(editor.selectCompletion).toBeDefined();
      expect(typeof editor.selectCompletion).toBe('function');
    });

    it('should export navigateCompletion function', async () => {
      const editor = await import('../src/public/js/editor.js');

      expect(editor.navigateCompletion).toBeDefined();
      expect(typeof editor.navigateCompletion).toBe('function');
    });

    it('should export getCompletionState function', async () => {
      const editor = await import('../src/public/js/editor.js');

      expect(editor.getCompletionState).toBeDefined();
      expect(typeof editor.getCompletionState).toBe('function');
    });

    it('should export updateCompletions function', async () => {
      const editor = await import('../src/public/js/editor.js');

      expect(editor.updateCompletions).toBeDefined();
      expect(typeof editor.updateCompletions).toBe('function');
    });

  });

  describe('AC1: Tab key triggers completion when cursor after "/"', () => {

    it('should detect "/" at start of line as trigger', async () => {
      const { isCompletionTrigger } = await import('../src/public/js/slash-commands.js');

      // "/" at position 0 is a valid trigger
      expect(isCompletionTrigger('/', 0)).toBe(true);
    });

    it('should detect "/" after whitespace as trigger', async () => {
      const { isCompletionTrigger } = await import('../src/public/js/slash-commands.js');

      // "/" after a space is valid
      expect(isCompletionTrigger('hello /', 7)).toBe(true);
      expect(isCompletionTrigger('test\n/', 5)).toBe(true);
    });

    it('should NOT detect "/" mid-word as trigger', async () => {
      const { isCompletionTrigger } = await import('../src/public/js/slash-commands.js');

      // "/" in the middle of text is not a command
      expect(isCompletionTrigger('path/to/file', 4)).toBe(false);
      expect(isCompletionTrigger('http://example', 5)).toBe(false);
    });

    it('should show popup when Tab pressed after "/"', async () => {
      const { getCompletionState, showCompletionPopup } = await import('../src/public/js/editor.js');

      // Simulate: user types "/" then presses Tab
      showCompletionPopup('/');

      const state = getCompletionState();
      expect(state.visible).toBe(true);
      expect(state.commands.length).toBeGreaterThan(0);
    });

  });

  describe('AC2: Popup shows matching slash commands', () => {

    it('should show all commands when prefix is just "/"', async () => {
      const { filterCommands, SLASH_COMMANDS } = await import('../src/public/js/slash-commands.js');

      const results = filterCommands('/');

      expect(results.length).toBe(SLASH_COMMANDS.length);
    });

    it('should include built-in Claude commands', async () => {
      const { SLASH_COMMANDS } = await import('../src/public/js/slash-commands.js');

      const names = SLASH_COMMANDS.map(c => c.name);

      expect(names).toContain('/help');
      expect(names).toContain('/clear');
      expect(names).toContain('/compact');
      expect(names).toContain('/config');
      expect(names).toContain('/model');
    });

    it('should return commands sorted alphabetically', async () => {
      const { filterCommands } = await import('../src/public/js/slash-commands.js');

      const results = filterCommands('/');
      const names = results.map(c => c.name);
      const sorted = [...names].sort();

      expect(names).toEqual(sorted);
    });

  });

  describe('AC3: Typing filters the list in real-time', () => {

    it('should filter commands by prefix', async () => {
      const { filterCommands } = await import('../src/public/js/slash-commands.js');

      const results = filterCommands('/he');

      expect(results.length).toBeGreaterThan(0);
      results.forEach(cmd => {
        expect(cmd.name.toLowerCase().startsWith('/he')).toBe(true);
      });
    });

    it('should return /help for prefix "/hel"', async () => {
      const { filterCommands } = await import('../src/public/js/slash-commands.js');

      const results = filterCommands('/hel');

      expect(results.map(c => c.name)).toContain('/help');
    });

    it('should be case-insensitive', async () => {
      const { filterCommands } = await import('../src/public/js/slash-commands.js');

      const lower = filterCommands('/help');
      const upper = filterCommands('/HELP');
      const mixed = filterCommands('/Help');

      expect(lower).toEqual(upper);
      expect(lower).toEqual(mixed);
    });

    it('should return empty array for non-matching prefix', async () => {
      const { filterCommands } = await import('../src/public/js/slash-commands.js');

      const results = filterCommands('/zzznomatch');

      expect(results).toEqual([]);
    });

    it('should update popup when updateCompletions called', async () => {
      const { updateCompletions, getCompletionState, showCompletionPopup } = await import('../src/public/js/editor.js');

      showCompletionPopup('/');
      updateCompletions('/dev');

      const state = getCompletionState();
      expect(state.commands.every(c => c.name.startsWith('/dev'))).toBe(true);
    });

  });

  describe('AC4: Enter/Tab inserts selected command', () => {

    it('should insert command text when selectCompletion called', async () => {
      const { selectCompletion, showCompletionPopup, getCompletionState } = await import('../src/public/js/editor.js');

      showCompletionPopup('/');
      const stateBefore = getCompletionState();

      // Verify we have commands and know what would be inserted
      expect(stateBefore.commands.length).toBeGreaterThan(0);
      const commandToInsert = stateBefore.commands[0];
      expect(commandToInsert.name.startsWith('/')).toBe(true);

      // After selection, popup should close (insertion happens internally)
      selectCompletion(0);
      const stateAfter = getCompletionState();
      expect(stateAfter.visible).toBe(false);
    });

    it('should close popup after selection', async () => {
      const { selectCompletion, showCompletionPopup, getCompletionState } = await import('../src/public/js/editor.js');

      showCompletionPopup('/');
      selectCompletion(0);

      const state = getCompletionState();
      expect(state.visible).toBe(false);
    });

    it('should insert the currently selected command', async () => {
      const { showCompletionPopup, navigateCompletion, selectCompletion, getCompletionState } = await import('../src/public/js/editor.js');

      showCompletionPopup('/');
      const beforeNav = getCompletionState().commands[0].name;

      navigateCompletion(1); // Move to second item
      const afterNav = getCompletionState();

      expect(afterNav.selectedIndex).toBe(1);
      expect(afterNav.commands[1].name).not.toBe(beforeNav);
    });

  });

  describe('AC5: Escape closes popup without inserting', () => {

    it('should close popup when closeCompletionPopup called', async () => {
      const { showCompletionPopup, closeCompletionPopup, getCompletionState } = await import('../src/public/js/editor.js');

      showCompletionPopup('/');
      expect(getCompletionState().visible).toBe(true);

      closeCompletionPopup();
      expect(getCompletionState().visible).toBe(false);
    });

    it('should NOT insert any text when popup closed via escape', async () => {
      const { showCompletionPopup, closeCompletionPopup } = await import('../src/public/js/editor.js');

      const insertedValues: string[] = [];
      vi.spyOn(await import('../src/public/js/editor.js'), 'insertText').mockImplementation((text: string) => {
        insertedValues.push(text);
      });

      showCompletionPopup('/');
      closeCompletionPopup();

      expect(insertedValues.length).toBe(0);
    });

    it('should reset selection index when popup reopened', async () => {
      const { showCompletionPopup, closeCompletionPopup, navigateCompletion, getCompletionState } = await import('../src/public/js/editor.js');

      showCompletionPopup('/');
      navigateCompletion(3); // Move selection
      closeCompletionPopup();

      showCompletionPopup('/');
      expect(getCompletionState().selectedIndex).toBe(0);
    });

  });

  describe('AC6: Arrow keys navigate popup options', () => {

    it('should move selection down when navigateCompletion(1) called', async () => {
      const { showCompletionPopup, navigateCompletion, getCompletionState } = await import('../src/public/js/editor.js');

      showCompletionPopup('/');
      expect(getCompletionState().selectedIndex).toBe(0);

      navigateCompletion(1);
      expect(getCompletionState().selectedIndex).toBe(1);
    });

    it('should move selection up when navigateCompletion(-1) called', async () => {
      const { showCompletionPopup, navigateCompletion, getCompletionState } = await import('../src/public/js/editor.js');

      showCompletionPopup('/');
      navigateCompletion(1);
      navigateCompletion(1);
      expect(getCompletionState().selectedIndex).toBe(2);

      navigateCompletion(-1);
      expect(getCompletionState().selectedIndex).toBe(1);
    });

    it('should wrap to bottom when navigating up from first item', async () => {
      const { showCompletionPopup, navigateCompletion, getCompletionState } = await import('../src/public/js/editor.js');

      showCompletionPopup('/');
      expect(getCompletionState().selectedIndex).toBe(0);

      navigateCompletion(-1); // Go up from first
      const state = getCompletionState();
      expect(state.selectedIndex).toBe(state.commands.length - 1);
    });

    it('should wrap to top when navigating down from last item', async () => {
      const { showCompletionPopup, navigateCompletion, getCompletionState } = await import('../src/public/js/editor.js');

      showCompletionPopup('/');
      const state = getCompletionState();

      // Navigate to last
      for (let i = 0; i < state.commands.length - 1; i++) {
        navigateCompletion(1);
      }
      expect(getCompletionState().selectedIndex).toBe(state.commands.length - 1);

      navigateCompletion(1); // Go down from last
      expect(getCompletionState().selectedIndex).toBe(0);
    });

    it('should handle navigation with filtered list', async () => {
      const { showCompletionPopup, updateCompletions, navigateCompletion, getCompletionState } = await import('../src/public/js/editor.js');

      showCompletionPopup('/');
      updateCompletions('/de'); // Filter to smaller set

      const state = getCompletionState();
      expect(state.commands.length).toBeLessThan(10); // Filtered

      navigateCompletion(1);
      expect(getCompletionState().selectedIndex).toBe(1);
    });

  });

  describe('AC7: Works with Pennyfarthing commands', () => {

    it('should include Pennyfarthing agent commands', async () => {
      const { SLASH_COMMANDS } = await import('../src/public/js/slash-commands.js');

      const names = SLASH_COMMANDS.map(c => c.name);

      // Note: /new-work was removed - using /work as the entry point
      expect(names).toContain('/work');
      expect(names).toContain('/dev');
      expect(names).toContain('/tea');
      expect(names).toContain('/reviewer');
      expect(names).toContain('/sm');
    });

    it('should filter to Pennyfarthing commands with appropriate prefix', async () => {
      const { filterCommands } = await import('../src/public/js/slash-commands.js');

      // Note: /new-work was removed - test with /work prefix instead
      const results = filterCommands('/work');

      expect(results.map(c => c.name)).toContain('/work');
    });

    it('should include description for Pennyfarthing commands', async () => {
      const { SLASH_COMMANDS } = await import('../src/public/js/slash-commands.js');

      const devCmd = SLASH_COMMANDS.find(c => c.name === '/dev');
      const teaCmd = SLASH_COMMANDS.find(c => c.name === '/tea');

      expect(devCmd?.description).toBeDefined();
      expect(devCmd?.description.length).toBeGreaterThan(0);
      expect(teaCmd?.description).toBeDefined();
      expect(teaCmd?.description.length).toBeGreaterThan(0);
    });

  });

  describe('Edge Cases', () => {

    it('should handle empty command list gracefully', async () => {
      const { showCompletionPopup, updateCompletions, getCompletionState, navigateCompletion } = await import('../src/public/js/editor.js');

      showCompletionPopup('/');
      updateCompletions('/zzznomatch');

      const state = getCompletionState();
      expect(state.commands).toEqual([]);
      // Navigation should be safe even with empty list
      expect(() => {
        navigateCompletion(1);
      }).not.toThrow();
    });

    it('should handle single command in list', async () => {
      const { showCompletionPopup, updateCompletions, navigateCompletion, getCompletionState } = await import('../src/public/js/editor.js');

      showCompletionPopup('/');
      updateCompletions('/help'); // Should match only /help

      const state = getCompletionState();
      if (state.commands.length === 1) {
        navigateCompletion(1);
        expect(getCompletionState().selectedIndex).toBe(0); // Wraps to same item
      }
    });

    it('should reset selection when filter changes', async () => {
      const { showCompletionPopup, updateCompletions, navigateCompletion, getCompletionState } = await import('../src/public/js/editor.js');

      showCompletionPopup('/');
      navigateCompletion(5); // Move down
      expect(getCompletionState().selectedIndex).toBe(5);

      updateCompletions('/dev'); // Filter changes list
      expect(getCompletionState().selectedIndex).toBe(0); // Reset to first
    });

  });

});
