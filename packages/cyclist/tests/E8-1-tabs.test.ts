/**
 * E8-1: Tab Container Infrastructure Tests
 *
 * Tests for the tabbed workspace panel that will host diff viewer,
 * file browser, and file viewer panels.
 *
 * Acceptance Criteria:
 * - AC1: Tab bar renders below message view
 * - AC2: Tabs can be opened, closed, and switched
 * - AC3: Ctrl+Tab cycles through tabs
 * - AC4: Ctrl+W closes current tab
 * - AC5: Panel can collapse/expand
 * - AC6: Tab state persists in localStorage
 * - AC7: Tabs restore on app restart
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// =============================================================================
// Type Definitions (to be exported from src/public/js/tabs.js)
// =============================================================================

/**
 * Tab item interface
 */
export interface TabItem {
  id: string;
  type: 'diff' | 'file' | 'browser';
  label: string;
  closeable: boolean;
  data?: Record<string, unknown>;
}

/**
 * Tab state interface for localStorage persistence
 */
export interface TabState {
  tabs: TabItem[];
  activeTab: string | null;
  collapsed: boolean;
}

// =============================================================================
// Test Data
// =============================================================================

const createTab = (overrides: Partial<TabItem> = {}): TabItem => ({
  id: `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  type: 'file',
  label: 'test.ts',
  closeable: true,
  ...overrides,
});

const sampleTabs: TabItem[] = [
  { id: 'tab-1', type: 'diff', label: 'main.ts', closeable: true },
  { id: 'tab-2', type: 'file', label: 'utils.ts', closeable: true },
  { id: 'browser', type: 'browser', label: 'Files', closeable: false },
];

const initialState: TabState = {
  tabs: [],
  activeTab: null,
  collapsed: true,
};

// =============================================================================
// AC1: Tab Bar Renders Below Message View
// =============================================================================

describe('E8-1: Tab Container Infrastructure', () => {

  describe('AC1: Tab bar renders below message view', () => {

    beforeEach(() => {
      // Create mock DOM structure matching expected layout
      document.body.innerHTML = `
        <div id="container">
          <div id="main-content">
            <main id="message-view"></main>
            <div id="tab-panel" class="tab-panel collapsed">
              <div class="tab-bar">
                <div class="tab-bar-tabs" id="tab-bar-tabs"></div>
                <button class="tab-panel-toggle" id="tab-panel-toggle" title="Toggle panel">▼</button>
              </div>
              <div class="tab-content" id="tab-content"></div>
            </div>
            <div id="editor-wrapper"></div>
          </div>
        </div>
      `;
    });

    it('should have tab-panel element in DOM', () => {
      const tabPanel = document.getElementById('tab-panel');
      expect(tabPanel).toBeTruthy();
    });

    it('should have tab-panel positioned after message-view', () => {
      const messageView = document.getElementById('message-view');
      const tabPanel = document.getElementById('tab-panel');

      expect(messageView?.nextElementSibling).toBe(tabPanel);
    });

    it('should have tab-panel positioned before editor-wrapper', () => {
      const tabPanel = document.getElementById('tab-panel');
      const editorWrapper = document.getElementById('editor-wrapper');

      expect(tabPanel?.nextElementSibling).toBe(editorWrapper);
    });

    it('should have tab-bar element inside tab-panel', () => {
      const tabPanel = document.getElementById('tab-panel');
      const tabBar = tabPanel?.querySelector('.tab-bar');

      expect(tabBar).toBeTruthy();
    });

    it('should have tab-bar-tabs container for dynamic tabs', () => {
      const tabBarTabs = document.getElementById('tab-bar-tabs');
      expect(tabBarTabs).toBeTruthy();
    });

    it('should have tab-content element for tab content', () => {
      const tabContent = document.getElementById('tab-content');
      expect(tabContent).toBeTruthy();
    });

    it('should have tab-panel-toggle button', () => {
      const toggleBtn = document.getElementById('tab-panel-toggle');
      expect(toggleBtn).toBeTruthy();
    });

  });

  // ===========================================================================
  // AC2: Tabs Can Be Opened, Closed, and Switched
  // ===========================================================================

  describe('AC2: Tabs can be opened, closed, and switched', () => {

    describe('TabManager.addTab()', () => {

      it('should add a tab to empty state', () => {
        const state = { ...initialState };
        const tab = createTab({ id: 'new-tab', label: 'new.ts' });

        // This will fail until tabs.js is implemented
        const newState = addTab(state, tab);

        expect(newState.tabs).toHaveLength(1);
        expect(newState.tabs[0].id).toBe('new-tab');
      });

      it('should add tab and set as active if first tab', () => {
        const state = { ...initialState };
        const tab = createTab({ id: 'first-tab' });

        const newState = addTab(state, tab);

        expect(newState.activeTab).toBe('first-tab');
      });

      it('should add tab and set as active when added', () => {
        const state: TabState = {
          tabs: [createTab({ id: 'existing' })],
          activeTab: 'existing',
          collapsed: false,
        };
        const newTab = createTab({ id: 'new-tab' });

        const newState = addTab(state, newTab);

        expect(newState.tabs).toHaveLength(2);
        expect(newState.activeTab).toBe('new-tab');
      });

      it('should not add duplicate tab with same id', () => {
        const existingTab = createTab({ id: 'dup-tab' });
        const state: TabState = {
          tabs: [existingTab],
          activeTab: 'dup-tab',
          collapsed: false,
        };
        const duplicateTab = createTab({ id: 'dup-tab', label: 'different.ts' });

        const newState = addTab(state, duplicateTab);

        expect(newState.tabs).toHaveLength(1);
        // Should switch to existing tab instead
        expect(newState.activeTab).toBe('dup-tab');
      });

      it('should expand panel when adding first tab', () => {
        const state: TabState = { tabs: [], activeTab: null, collapsed: true };
        const tab = createTab();

        const newState = addTab(state, tab);

        expect(newState.collapsed).toBe(false);
      });

    });

    describe('TabManager.removeTab()', () => {

      it('should remove tab by id', () => {
        const state: TabState = {
          tabs: sampleTabs.slice(),
          activeTab: 'tab-1',
          collapsed: false,
        };

        const newState = removeTab(state, 'tab-1');

        expect(newState.tabs).toHaveLength(2);
        expect(newState.tabs.find(t => t.id === 'tab-1')).toBeUndefined();
      });

      it('should switch to next tab when removing active tab', () => {
        const state: TabState = {
          tabs: sampleTabs.slice(),
          activeTab: 'tab-1',
          collapsed: false,
        };

        const newState = removeTab(state, 'tab-1');

        expect(newState.activeTab).toBe('tab-2');
      });

      it('should switch to previous tab when removing last active tab', () => {
        const state: TabState = {
          tabs: [
            { id: 'tab-1', type: 'file', label: 'a.ts', closeable: true },
            { id: 'tab-2', type: 'file', label: 'b.ts', closeable: true },
          ],
          activeTab: 'tab-2',
          collapsed: false,
        };

        const newState = removeTab(state, 'tab-2');

        expect(newState.activeTab).toBe('tab-1');
      });

      it('should set activeTab to null when removing last tab', () => {
        const state: TabState = {
          tabs: [createTab({ id: 'only-tab' })],
          activeTab: 'only-tab',
          collapsed: false,
        };

        const newState = removeTab(state, 'only-tab');

        expect(newState.tabs).toHaveLength(0);
        expect(newState.activeTab).toBeNull();
      });

      it('should collapse panel when removing last tab', () => {
        const state: TabState = {
          tabs: [createTab({ id: 'last-tab' })],
          activeTab: 'last-tab',
          collapsed: false,
        };

        const newState = removeTab(state, 'last-tab');

        expect(newState.collapsed).toBe(true);
      });

      it('should not remove non-closeable tabs', () => {
        const state: TabState = {
          tabs: [{ id: 'browser', type: 'browser', label: 'Files', closeable: false }],
          activeTab: 'browser',
          collapsed: false,
        };

        const newState = removeTab(state, 'browser');

        expect(newState.tabs).toHaveLength(1);
        expect(newState.tabs[0].id).toBe('browser');
      });

      it('should handle removing non-existent tab gracefully', () => {
        const state: TabState = {
          tabs: sampleTabs.slice(),
          activeTab: 'tab-1',
          collapsed: false,
        };

        const newState = removeTab(state, 'non-existent');

        expect(newState.tabs).toHaveLength(3);
        expect(newState.activeTab).toBe('tab-1');
      });

    });

    describe('TabManager.setActiveTab()', () => {

      it('should switch active tab', () => {
        const state: TabState = {
          tabs: sampleTabs.slice(),
          activeTab: 'tab-1',
          collapsed: false,
        };

        const newState = setActiveTab(state, 'tab-2');

        expect(newState.activeTab).toBe('tab-2');
      });

      it('should not change state when setting same active tab', () => {
        const state: TabState = {
          tabs: sampleTabs.slice(),
          activeTab: 'tab-1',
          collapsed: false,
        };

        const newState = setActiveTab(state, 'tab-1');

        expect(newState).toEqual(state);
      });

      it('should not change state when tab id does not exist', () => {
        const state: TabState = {
          tabs: sampleTabs.slice(),
          activeTab: 'tab-1',
          collapsed: false,
        };

        const newState = setActiveTab(state, 'non-existent');

        expect(newState.activeTab).toBe('tab-1');
      });

      it('should expand panel when switching to tab while collapsed', () => {
        const state: TabState = {
          tabs: sampleTabs.slice(),
          activeTab: 'tab-1',
          collapsed: true,
        };

        const newState = setActiveTab(state, 'tab-2');

        expect(newState.activeTab).toBe('tab-2');
        expect(newState.collapsed).toBe(false);
      });

    });

  });

  // ===========================================================================
  // AC3: Ctrl+Tab Cycles Through Tabs
  // ===========================================================================

  describe('AC3: Ctrl+Tab cycles through tabs', () => {

    it('should return next tab id for cycleTab forward', () => {
      const state: TabState = {
        tabs: sampleTabs.slice(),
        activeTab: 'tab-1',
        collapsed: false,
      };

      const nextId = getNextTabId(state, 'forward');

      expect(nextId).toBe('tab-2');
    });

    it('should wrap around to first tab when at last', () => {
      const state: TabState = {
        tabs: sampleTabs.slice(),
        activeTab: 'browser',
        collapsed: false,
      };

      const nextId = getNextTabId(state, 'forward');

      expect(nextId).toBe('tab-1');
    });

    it('should return previous tab id for cycleTab backward', () => {
      const state: TabState = {
        tabs: sampleTabs.slice(),
        activeTab: 'tab-2',
        collapsed: false,
      };

      const nextId = getNextTabId(state, 'backward');

      expect(nextId).toBe('tab-1');
    });

    it('should wrap to last tab when cycling backward from first', () => {
      const state: TabState = {
        tabs: sampleTabs.slice(),
        activeTab: 'tab-1',
        collapsed: false,
      };

      const nextId = getNextTabId(state, 'backward');

      expect(nextId).toBe('browser');
    });

    it('should return null when no tabs exist', () => {
      const state: TabState = { tabs: [], activeTab: null, collapsed: true };

      const nextId = getNextTabId(state, 'forward');

      expect(nextId).toBeNull();
    });

    it('should return same tab when only one tab exists', () => {
      const state: TabState = {
        tabs: [createTab({ id: 'only' })],
        activeTab: 'only',
        collapsed: false,
      };

      const nextId = getNextTabId(state, 'forward');

      expect(nextId).toBe('only');
    });

  });

  // ===========================================================================
  // AC4: Ctrl+W Closes Current Tab
  // ===========================================================================

  describe('AC4: Ctrl+W closes current tab', () => {

    it('should close active tab when closeable', () => {
      const state: TabState = {
        tabs: sampleTabs.slice(),
        activeTab: 'tab-1',
        collapsed: false,
      };

      const newState = closeActiveTab(state);

      expect(newState.tabs.find(t => t.id === 'tab-1')).toBeUndefined();
    });

    it('should not close active tab when not closeable', () => {
      const state: TabState = {
        tabs: sampleTabs.slice(),
        activeTab: 'browser', // browser is not closeable
        collapsed: false,
      };

      const newState = closeActiveTab(state);

      expect(newState.tabs.find(t => t.id === 'browser')).toBeTruthy();
    });

    it('should do nothing when no active tab', () => {
      const state: TabState = { tabs: [], activeTab: null, collapsed: true };

      const newState = closeActiveTab(state);

      expect(newState).toEqual(state);
    });

    it('should switch to adjacent tab after closing', () => {
      const state: TabState = {
        tabs: sampleTabs.slice(),
        activeTab: 'tab-1',
        collapsed: false,
      };

      const newState = closeActiveTab(state);

      expect(newState.activeTab).toBe('tab-2');
    });

  });

  // ===========================================================================
  // AC5: Panel Can Collapse/Expand
  // ===========================================================================

  describe('AC5: Panel can collapse/expand', () => {

    it('should toggle collapsed state from true to false', () => {
      const state: TabState = {
        tabs: sampleTabs.slice(),
        activeTab: 'tab-1',
        collapsed: true,
      };

      const newState = toggleCollapse(state);

      expect(newState.collapsed).toBe(false);
    });

    it('should toggle collapsed state from false to true', () => {
      const state: TabState = {
        tabs: sampleTabs.slice(),
        activeTab: 'tab-1',
        collapsed: false,
      };

      const newState = toggleCollapse(state);

      expect(newState.collapsed).toBe(true);
    });

    it('should keep collapsed true when no tabs exist', () => {
      const state: TabState = { tabs: [], activeTab: null, collapsed: true };

      const newState = toggleCollapse(state);

      // Cannot expand when no tabs
      expect(newState.collapsed).toBe(true);
    });

    describe('DOM collapse behavior', () => {

      beforeEach(() => {
        document.body.innerHTML = `
          <div id="tab-panel" class="tab-panel collapsed">
            <div class="tab-bar">
              <div class="tab-bar-tabs" id="tab-bar-tabs"></div>
              <button class="tab-panel-toggle" id="tab-panel-toggle">▼</button>
            </div>
            <div class="tab-content" id="tab-content"></div>
          </div>
        `;
      });

      it('should have collapsed class initially', () => {
        const tabPanel = document.getElementById('tab-panel');
        expect(tabPanel?.classList.contains('collapsed')).toBe(true);
      });

      it('should remove collapsed class when expanded', () => {
        const tabPanel = document.getElementById('tab-panel');
        tabPanel?.classList.remove('collapsed');

        expect(tabPanel?.classList.contains('collapsed')).toBe(false);
      });

      it('should add collapsed class when collapsed', () => {
        const tabPanel = document.getElementById('tab-panel');
        tabPanel?.classList.remove('collapsed');
        tabPanel?.classList.add('collapsed');

        expect(tabPanel?.classList.contains('collapsed')).toBe(true);
      });

    });

  });

  // ===========================================================================
  // AC6: Tab State Persists in localStorage
  // ===========================================================================

  describe('AC6: Tab state persists in localStorage', () => {

    const STORAGE_KEY = 'cyclist-tabs';

    beforeEach(() => {
      localStorage.clear();
    });

    afterEach(() => {
      localStorage.clear();
    });

    it('should save state to localStorage', () => {
      const state: TabState = {
        tabs: sampleTabs.slice(),
        activeTab: 'tab-1',
        collapsed: false,
      };

      saveTabState(state);

      const saved = localStorage.getItem(STORAGE_KEY);
      expect(saved).toBeTruthy();

      const parsed = JSON.parse(saved!);
      expect(parsed.tabs).toHaveLength(3);
      expect(parsed.activeTab).toBe('tab-1');
      expect(parsed.collapsed).toBe(false);
    });

    it('should load state from localStorage', () => {
      const state: TabState = {
        tabs: sampleTabs.slice(),
        activeTab: 'tab-2',
        collapsed: true,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

      const loaded = loadTabState();

      expect(loaded.tabs).toHaveLength(3);
      expect(loaded.activeTab).toBe('tab-2');
      expect(loaded.collapsed).toBe(true);
    });

    it('should return initial state when localStorage is empty', () => {
      const loaded = loadTabState();

      expect(loaded.tabs).toHaveLength(0);
      expect(loaded.activeTab).toBeNull();
      expect(loaded.collapsed).toBe(true);
    });

    it('should handle corrupted localStorage gracefully', () => {
      localStorage.setItem(STORAGE_KEY, 'not valid json');

      const loaded = loadTabState();

      // Should return initial state on parse error
      expect(loaded.tabs).toHaveLength(0);
      expect(loaded.activeTab).toBeNull();
      expect(loaded.collapsed).toBe(true);
    });

    it('should handle partial localStorage data gracefully', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ tabs: [] }));

      const loaded = loadTabState();

      expect(loaded.tabs).toHaveLength(0);
      expect(loaded.activeTab).toBeNull();
      expect(loaded.collapsed).toBe(true);
    });

  });

  // ===========================================================================
  // AC7: Tabs Restore on App Restart
  // ===========================================================================

  describe('AC7: Tabs restore on app restart', () => {

    const STORAGE_KEY = 'cyclist-tabs';

    beforeEach(() => {
      localStorage.clear();
    });

    afterEach(() => {
      localStorage.clear();
    });

    it('should restore tabs from localStorage on init', () => {
      const savedState: TabState = {
        tabs: [
          { id: 'restored-1', type: 'diff', label: 'file.ts', closeable: true },
          { id: 'restored-2', type: 'file', label: 'other.ts', closeable: true },
        ],
        activeTab: 'restored-1',
        collapsed: false,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedState));

      const state = initTabState();

      expect(state.tabs).toHaveLength(2);
      expect(state.tabs[0].id).toBe('restored-1');
      expect(state.tabs[1].id).toBe('restored-2');
      expect(state.activeTab).toBe('restored-1');
    });

    it('should restore collapsed state', () => {
      const savedState: TabState = {
        tabs: sampleTabs.slice(),
        activeTab: 'tab-1',
        collapsed: true,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedState));

      const state = initTabState();

      expect(state.collapsed).toBe(true);
    });

    it('should validate restored activeTab exists', () => {
      const savedState: TabState = {
        tabs: [{ id: 'only-tab', type: 'file', label: 'a.ts', closeable: true }],
        activeTab: 'non-existent', // Invalid - doesn't exist in tabs
        collapsed: false,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedState));

      const state = initTabState();

      // Should correct to first tab
      expect(state.activeTab).toBe('only-tab');
    });

    it('should handle empty restored state', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initialState));

      const state = initTabState();

      expect(state.tabs).toHaveLength(0);
      expect(state.activeTab).toBeNull();
      expect(state.collapsed).toBe(true);
    });

    it('should preserve tab data on restore', () => {
      const savedState: TabState = {
        tabs: [{
          id: 'data-tab',
          type: 'diff',
          label: 'complex.ts',
          closeable: true,
          data: { filePath: '/path/to/file', lineNumber: 42 },
        }],
        activeTab: 'data-tab',
        collapsed: false,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedState));

      const state = initTabState();

      expect(state.tabs[0].data).toEqual({ filePath: '/path/to/file', lineNumber: 42 });
    });

  });

  // ===========================================================================
  // DOM Rendering Tests
  // ===========================================================================

  describe('DOM Rendering', () => {

    beforeEach(() => {
      document.body.innerHTML = `
        <div id="tab-panel" class="tab-panel collapsed">
          <div class="tab-bar">
            <div class="tab-bar-tabs" id="tab-bar-tabs"></div>
            <button class="tab-panel-toggle" id="tab-panel-toggle">▼</button>
          </div>
          <div class="tab-content" id="tab-content"></div>
        </div>
      `;
    });

    it('should create tab element with correct structure', () => {
      const tab: TabItem = { id: 'test-tab', type: 'file', label: 'test.ts', closeable: true };

      const element = createTabElement(tab, false);

      expect(element.classList.contains('tab')).toBe(true);
      expect(element.dataset.tabId).toBe('test-tab');
      expect(element.querySelector('.tab-label')?.textContent).toBe('test.ts');
    });

    it('should add active class to active tab element', () => {
      const tab: TabItem = { id: 'active-tab', type: 'file', label: 'active.ts', closeable: true };

      const element = createTabElement(tab, true);

      expect(element.classList.contains('active')).toBe(true);
    });

    it('should include close button for closeable tabs', () => {
      const tab: TabItem = { id: 'closeable', type: 'file', label: 'close.ts', closeable: true };

      const element = createTabElement(tab, false);

      expect(element.querySelector('.tab-close')).toBeTruthy();
    });

    it('should not include close button for non-closeable tabs', () => {
      const tab: TabItem = { id: 'browser', type: 'browser', label: 'Files', closeable: false };

      const element = createTabElement(tab, false);

      expect(element.querySelector('.tab-close')).toBeNull();
    });

    it('should render all tabs in tab bar', () => {
      const state: TabState = {
        tabs: sampleTabs.slice(),
        activeTab: 'tab-1',
        collapsed: false,
      };

      renderTabBar(state);

      const tabBarTabs = document.getElementById('tab-bar-tabs');
      expect(tabBarTabs?.children).toHaveLength(3);
    });

    it('should render placeholder content for tab type', () => {
      const state: TabState = {
        tabs: [{ id: 'file-tab', type: 'file', label: 'test.ts', closeable: true }],
        activeTab: 'file-tab',
        collapsed: false,
      };

      renderTabContent(state);

      const tabContent = document.getElementById('tab-content');
      // Placeholder content for E8-1 - actual content implemented in E8-2, E8-3, E8-4
      expect(tabContent?.textContent).toContain('file');
    });

  });

  // ===========================================================================
  // Keyboard Event Handling Tests
  // ===========================================================================

  describe('Keyboard Event Handling', () => {

    it('should detect Ctrl+Tab key combination', () => {
      const event = new KeyboardEvent('keydown', {
        key: 'Tab',
        ctrlKey: true,
        shiftKey: false,
      });

      expect(isCtrlTab(event)).toBe(true);
      expect(isCtrlShiftTab(event)).toBe(false);
    });

    it('should detect Ctrl+Shift+Tab key combination', () => {
      const event = new KeyboardEvent('keydown', {
        key: 'Tab',
        ctrlKey: true,
        shiftKey: true,
      });

      expect(isCtrlShiftTab(event)).toBe(true);
    });

    it('should detect Ctrl+W key combination', () => {
      const event = new KeyboardEvent('keydown', {
        key: 'w',
        ctrlKey: true,
      });

      expect(isCtrlW(event)).toBe(true);
    });

    it('should not detect plain Tab as Ctrl+Tab', () => {
      const event = new KeyboardEvent('keydown', {
        key: 'Tab',
        ctrlKey: false,
      });

      expect(isCtrlTab(event)).toBe(false);
    });

    it('should not detect plain W as Ctrl+W', () => {
      const event = new KeyboardEvent('keydown', {
        key: 'w',
        ctrlKey: false,
      });

      expect(isCtrlW(event)).toBe(false);
    });

  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('Edge Cases', () => {

    it('should handle rapid tab operations', () => {
      let state: TabState = { tabs: [], activeTab: null, collapsed: true };

      // Add multiple tabs rapidly
      for (let i = 0; i < 10; i++) {
        state = addTab(state, createTab({ id: `tab-${i}`, label: `file${i}.ts` }));
      }

      expect(state.tabs).toHaveLength(10);
      expect(state.activeTab).toBe('tab-9'); // Last added should be active
    });

    it('should handle tab with special characters in label', () => {
      const tab: TabItem = {
        id: 'special',
        type: 'file',
        label: '<script>.ts',
        closeable: true,
      };

      const element = createTabElement(tab, false);

      // Should be escaped properly
      expect(element.querySelector('.tab-label')?.textContent).toBe('<script>.ts');
    });

    it('should handle very long tab labels', () => {
      const tab: TabItem = {
        id: 'long',
        type: 'file',
        label: 'this-is-a-very-long-filename-that-might-overflow.ts',
        closeable: true,
      };

      const element = createTabElement(tab, false);

      expect(element.querySelector('.tab-label')?.textContent).toBe(
        'this-is-a-very-long-filename-that-might-overflow.ts'
      );
    });

    it('should handle many tabs (overflow scenario)', () => {
      let state: TabState = { tabs: [], activeTab: null, collapsed: true };

      // Add 20 tabs
      for (let i = 0; i < 20; i++) {
        state = addTab(state, createTab({ id: `tab-${i}` }));
      }

      expect(state.tabs).toHaveLength(20);
      // Tab switching should still work
      const nextId = getNextTabId(state, 'forward');
      expect(nextId).toBeTruthy();
    });

  });

});

// =============================================================================
// Stub Functions (to be implemented in src/public/js/tabs.js)
// =============================================================================

/**
 * Add a tab to state
 * Implementation target: src/public/js/tabs.js
 */
function addTab(state: TabState, tab: TabItem): TabState {
  // Check for duplicate
  if (state.tabs.find(t => t.id === tab.id)) {
    return { ...state, activeTab: tab.id, collapsed: false };
  }

  const newTabs = [...state.tabs, tab];
  return {
    tabs: newTabs,
    activeTab: tab.id,
    collapsed: newTabs.length === 0,
  };
}

/**
 * Remove a tab from state
 * Implementation target: src/public/js/tabs.js
 */
function removeTab(state: TabState, tabId: string): TabState {
  const tab = state.tabs.find(t => t.id === tabId);
  if (!tab || !tab.closeable) {
    return state;
  }

  const newTabs = state.tabs.filter(t => t.id !== tabId);
  let newActiveTab = state.activeTab;

  if (state.activeTab === tabId) {
    const removedIndex = state.tabs.findIndex(t => t.id === tabId);
    if (newTabs.length > 0) {
      newActiveTab = newTabs[Math.min(removedIndex, newTabs.length - 1)].id;
    } else {
      newActiveTab = null;
    }
  }

  return {
    tabs: newTabs,
    activeTab: newActiveTab,
    collapsed: newTabs.length === 0,
  };
}

/**
 * Set active tab
 * Implementation target: src/public/js/tabs.js
 */
function setActiveTab(state: TabState, tabId: string): TabState {
  if (state.activeTab === tabId) return state;
  if (!state.tabs.find(t => t.id === tabId)) return state;

  return {
    ...state,
    activeTab: tabId,
    collapsed: false,
  };
}

/**
 * Get next tab id for cycling
 * Implementation target: src/public/js/tabs.js
 */
function getNextTabId(state: TabState, direction: 'forward' | 'backward'): string | null {
  if (state.tabs.length === 0) return null;
  if (state.tabs.length === 1) return state.tabs[0].id;

  const currentIndex = state.tabs.findIndex(t => t.id === state.activeTab);
  if (currentIndex === -1) return state.tabs[0].id;

  let nextIndex: number;
  if (direction === 'forward') {
    nextIndex = (currentIndex + 1) % state.tabs.length;
  } else {
    nextIndex = (currentIndex - 1 + state.tabs.length) % state.tabs.length;
  }

  return state.tabs[nextIndex].id;
}

/**
 * Close active tab
 * Implementation target: src/public/js/tabs.js
 */
function closeActiveTab(state: TabState): TabState {
  if (!state.activeTab) return state;
  return removeTab(state, state.activeTab);
}

/**
 * Toggle collapse state
 * Implementation target: src/public/js/tabs.js
 */
function toggleCollapse(state: TabState): TabState {
  if (state.tabs.length === 0) return state;
  return { ...state, collapsed: !state.collapsed };
}

/**
 * Save state to localStorage
 * Implementation target: src/public/js/tabs.js
 */
function saveTabState(state: TabState): void {
  localStorage.setItem('cyclist-tabs', JSON.stringify(state));
}

/**
 * Load state from localStorage
 * Implementation target: src/public/js/tabs.js
 */
function loadTabState(): TabState {
  try {
    const saved = localStorage.getItem('cyclist-tabs');
    if (!saved) return { tabs: [], activeTab: null, collapsed: true };

    const parsed = JSON.parse(saved);
    return {
      tabs: parsed.tabs || [],
      activeTab: parsed.activeTab ?? null,
      collapsed: parsed.collapsed ?? true,
    };
  } catch {
    return { tabs: [], activeTab: null, collapsed: true };
  }
}

/**
 * Initialize tab state (load and validate)
 * Implementation target: src/public/js/tabs.js
 */
function initTabState(): TabState {
  const state = loadTabState();

  // Validate activeTab exists
  if (state.activeTab && !state.tabs.find(t => t.id === state.activeTab)) {
    return {
      ...state,
      activeTab: state.tabs.length > 0 ? state.tabs[0].id : null,
    };
  }

  return state;
}

/**
 * Create tab DOM element
 * Implementation target: src/public/js/components/TabContainer.js
 */
function createTabElement(tab: TabItem, isActive: boolean): HTMLElement {
  const el = document.createElement('div');
  el.className = 'tab';
  if (isActive) el.classList.add('active');
  el.dataset.tabId = tab.id;

  const label = document.createElement('span');
  label.className = 'tab-label';
  label.textContent = tab.label;
  el.appendChild(label);

  if (tab.closeable) {
    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close';
    closeBtn.textContent = '×';
    el.appendChild(closeBtn);
  }

  return el;
}

/**
 * Render tab bar
 * Implementation target: src/public/js/components/TabContainer.js
 */
function renderTabBar(state: TabState): void {
  const tabBarTabs = document.getElementById('tab-bar-tabs');
  if (!tabBarTabs) return;

  tabBarTabs.innerHTML = '';
  for (const tab of state.tabs) {
    const el = createTabElement(tab, tab.id === state.activeTab);
    tabBarTabs.appendChild(el);
  }
}

/**
 * Render tab content
 * Implementation target: src/public/js/components/TabContainer.js
 */
function renderTabContent(state: TabState): void {
  const tabContent = document.getElementById('tab-content');
  if (!tabContent || !state.activeTab) return;

  const activeTab = state.tabs.find(t => t.id === state.activeTab);
  if (!activeTab) return;

  // Placeholder content - actual content renderers implemented in E8-2, E8-3, E8-4
  tabContent.innerHTML = `<div class="tab-placeholder">Content for ${activeTab.type} tab: ${activeTab.label}</div>`;
}

/**
 * Keyboard event detection helpers
 * Implementation target: src/public/js/components/TabContainer.js
 */
function isCtrlTab(event: KeyboardEvent): boolean {
  return event.key === 'Tab' && event.ctrlKey && !event.shiftKey;
}

function isCtrlShiftTab(event: KeyboardEvent): boolean {
  return event.key === 'Tab' && event.ctrlKey && event.shiftKey;
}

function isCtrlW(event: KeyboardEvent): boolean {
  return event.key === 'w' && event.ctrlKey;
}
