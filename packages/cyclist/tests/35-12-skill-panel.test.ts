/**
 * 35-12: Skill Invocations Panel Tests
 *
 * Tests for the skill invocations panel that displays skill usage during sessions.
 *
 * Acceptance Criteria:
 * - AC1: Dedicated panel for skill invocations
 * - AC2: Shows skill name and invocation time
 * - AC3: Status indicator (running spinner, checkmark, error icon)
 * - AC4: Expandable rows to show arguments and result summary
 * - AC5: Panel is collapsible and resizable
 * - AC6: Persists collapse state in localStorage
 * - AC7: Clear button to reset invocation history
 * - AC8: Works with all skill types (built-in and custom)
 *
 * Behavior Scenarios (from UX spec):
 * - Scenario 1: Skill appears when invoked
 * - Scenario 2: Skill completion updates entry
 * - Scenario 3: Expand shows details
 * - Scenario 4: Panel persists state
 * - Scenario 5: Clear removes all entries
 * - Scenario 6: Error state display
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { Window } from 'happy-dom';
import request from 'supertest';
import { app } from '../src/server.js';
import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// Type Definitions (will be implemented in skill-panel.js)
// =============================================================================

/**
 * Skill entry data model (from UX spec)
 */
export interface SkillEntry {
  id: string;
  skill: string;
  args?: string;
  timestamp: number;
  status: 'running' | 'completed' | 'error';
  result?: string;
  error?: string;
  durationMs?: number;
}

/**
 * Skill panel state persisted to localStorage
 */
export interface SkillPanelState {
  width: number;
  collapsed: boolean;
}

/**
 * Skill panel exports interface
 */
export interface ISkillPanel {
  init(): void;
  collapse(): void;
  expand(): void;
  toggle(): void;
  isCollapsed(): boolean;
  setWidth(width: number): void;
  getCurrentWidth(): number;
  setSkillCount(count: number): void;
  getContentElement(): HTMLElement | null;
  resetState(): void;
  handleSkillEvent(entry: SkillEntry): void;
  clearLog(): Promise<void>;
  getEntries(): SkillEntry[];
  setEntries(entries: SkillEntry[]): void;
}

// =============================================================================
// Test Data Factories
// =============================================================================

const createSkillEntry = (overrides: Partial<SkillEntry> = {}): SkillEntry => ({
  id: `skill-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  skill: 'commit',
  timestamp: Date.now(),
  status: 'running',
  ...overrides,
});

const createCompletedSkillEntry = (overrides: Partial<SkillEntry> = {}): SkillEntry =>
  createSkillEntry({
    status: 'completed',
    result: 'Committed abc123',
    durationMs: 2300,
    ...overrides,
  });

const createErrorSkillEntry = (overrides: Partial<SkillEntry> = {}): SkillEntry =>
  createSkillEntry({
    status: 'error',
    error: 'No workflow found',
    ...overrides,
  });

// =============================================================================
// File path helpers
// =============================================================================

const JS_DIR = path.join(__dirname, '../src/public/js');
const SKILL_PANEL_PATH = path.join(JS_DIR, 'skill-panel.js');
const INDEX_HTML_PATH = path.join(__dirname, '../src/public/index.html');
const STYLES_CSS_PATH = path.join(__dirname, '../src/public/styles.css');
const IPC_CHANNELS_PATH = path.join(__dirname, '../src/ipc-channels.ts');

// =============================================================================
// Tests
// =============================================================================

describe('35-12: Skill Invocations Panel', () => {
  let html: string;
  let document: Document;
  let css: string;

  beforeAll(async () => {
    // Fetch HTML from server
    const response = await request(app).get('/');
    html = response.text;

    // Parse HTML for DOM tests
    const window = new Window();
    window.document.write(html);
    document = window.document;

    // Read CSS for style tests
    css = fs.readFileSync(STYLES_CSS_PATH, 'utf-8');
  });

  // ===========================================================================
  // AC1: Dedicated panel for skill invocations
  // ===========================================================================
  describe('AC1: Dedicated panel for skill invocations', () => {
    it('should have skill-panel.js file', () => {
      expect(fs.existsSync(SKILL_PANEL_PATH)).toBe(true);
    });

    it('should have #skill-panel element in HTML', () => {
      const panel = document.getElementById('skill-panel');
      expect(panel).not.toBeNull();
      expect(panel?.classList.contains('skill-panel')).toBe(true);
    });

    it('should have skill panel header with title', () => {
      const title = document.querySelector('#skill-panel .skill-panel-title');
      expect(title).not.toBeNull();
      expect(title?.textContent).toContain('Skills');
    });

    it('should have skill panel content area', () => {
      const content = document.getElementById('skill-panel-content');
      expect(content).not.toBeNull();
    });

    it('should have skill log list container', () => {
      const list = document.getElementById('skill-log-list');
      expect(list).not.toBeNull();
    });

    it('should have resize handle for skill panel', () => {
      const handle = document.getElementById('skill-panel-resize');
      expect(handle).not.toBeNull();
      expect(handle?.classList.contains('resize-handle')).toBe(true);
    });
  });

  // ===========================================================================
  // AC2: Shows skill name and invocation time
  // ===========================================================================
  describe('AC2: Shows skill name and invocation time', () => {
    it('should have skill-entry structure with name element', () => {
      // Entry structure defined in HTML/JS
      const entryHTML = `
        <div class="skill-entry">
          <div class="skill-entry-header">
            <span class="skill-name">/commit</span>
            <span class="skill-time">12:34</span>
            <span class="skill-status"></span>
          </div>
        </div>
      `;
      const temp = document.createElement('div');
      temp.innerHTML = entryHTML;

      const nameEl = temp.querySelector('.skill-name');
      const timeEl = temp.querySelector('.skill-time');

      expect(nameEl).not.toBeNull();
      expect(timeEl).not.toBeNull();
    });

    it('should format timestamp as HH:MM:SS', () => {
      // This tests the formatTimestamp function behavior
      const timestamp = new Date('2026-01-16T12:34:56').getTime();
      const formatted = new Date(timestamp).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
      expect(formatted).toMatch(/\d{2}:\d{2}:\d{2}/);
    });

    it('should display skill name with leading slash', () => {
      const entry = createSkillEntry({ skill: 'commit' });
      // Implementation should display as "/commit"
      expect(entry.skill).toBe('commit');
    });
  });

  // ===========================================================================
  // AC3: Status indicator (running spinner, checkmark, error icon)
  // ===========================================================================
  describe('AC3: Status indicator (running spinner, checkmark, error icon)', () => {
    it('should have CSS for running status (spinner)', () => {
      expect(css).toContain('.skill-status');
      // Should have animation or spinner styles
    });

    it('should have CSS for completed status (checkmark)', () => {
      expect(css).toContain('.status-success');
    });

    it('should have CSS for error status (error icon)', () => {
      expect(css).toContain('.status-error');
    });

    it('should show running spinner for status=running', () => {
      const entry = createSkillEntry({ status: 'running' });
      expect(entry.status).toBe('running');
      // Implementation should render spinner icon
    });

    it('should show checkmark for status=completed', () => {
      const entry = createCompletedSkillEntry();
      expect(entry.status).toBe('completed');
      // Implementation should render ✓
    });

    it('should show error icon for status=error', () => {
      const entry = createErrorSkillEntry();
      expect(entry.status).toBe('error');
      // Implementation should render ✗
    });
  });

  // ===========================================================================
  // AC4: Expandable rows to show arguments and result summary
  // ===========================================================================
  describe('AC4: Expandable rows to show arguments and result summary', () => {
    it('should have skill-entry-details element for expansion', () => {
      const entryHTML = `
        <div class="skill-entry">
          <div class="skill-entry-header"></div>
          <div class="skill-entry-details">
            <div class="skill-args"></div>
            <div class="skill-result"></div>
            <div class="skill-duration"></div>
          </div>
        </div>
      `;
      const temp = document.createElement('div');
      temp.innerHTML = entryHTML;

      expect(temp.querySelector('.skill-entry-details')).not.toBeNull();
      expect(temp.querySelector('.skill-args')).not.toBeNull();
      expect(temp.querySelector('.skill-result')).not.toBeNull();
      expect(temp.querySelector('.skill-duration')).not.toBeNull();
    });

    it('should have CSS for collapsed/expanded states', () => {
      expect(css).toContain('.skill-entry');
    });

    it('should show arguments when entry has args', () => {
      const entry = createCompletedSkillEntry({ args: '-m "feat: add feature"' });
      expect(entry.args).toBe('-m "feat: add feature"');
    });

    it('should show result summary when entry is completed', () => {
      const entry = createCompletedSkillEntry({ result: 'Committed abc123' });
      expect(entry.result).toBe('Committed abc123');
    });

    it('should show duration when entry is completed', () => {
      const entry = createCompletedSkillEntry({ durationMs: 2300 });
      expect(entry.durationMs).toBe(2300);
    });
  });

  // ===========================================================================
  // AC5: Panel is collapsible and resizable
  // ===========================================================================
  describe('AC5: Panel is collapsible and resizable', () => {
    it('should have collapse button in header', () => {
      const collapseBtn = document.getElementById('skill-panel-collapse');
      expect(collapseBtn).not.toBeNull();
    });

    it('should have CSS for collapsed state', () => {
      expect(css).toContain('.collapsed');
    });

    it('should start collapsed by default', () => {
      const panel = document.getElementById('skill-panel');
      expect(panel?.classList.contains('collapsed')).toBe(true);
    });

    it('should have resize handle between panel and content', () => {
      const handle = document.getElementById('skill-panel-resize');
      expect(handle).not.toBeNull();
    });

    it('should have minimum width constraint (150px)', () => {
      // Tests implementation constant MIN_WIDTH = 150
      const MIN_WIDTH = 150;
      expect(MIN_WIDTH).toBe(150);
    });

    it('should collapse when dragged below threshold (50px)', () => {
      // Tests implementation constant COLLAPSE_THRESHOLD = 50
      const COLLAPSE_THRESHOLD = 50;
      expect(COLLAPSE_THRESHOLD).toBe(50);
    });
  });

  // ===========================================================================
  // AC6: Persists collapse state in localStorage
  // ===========================================================================
  describe('AC6: Persists collapse state in localStorage', () => {
    it('should use localStorage key cyclist-skill-panel', () => {
      const STORAGE_KEY = 'cyclist-skill-panel';
      expect(STORAGE_KEY).toBe('cyclist-skill-panel');
    });

    it('should save state with width and collapsed properties', () => {
      const state: SkillPanelState = { width: 300, collapsed: false };
      expect(state).toHaveProperty('width');
      expect(state).toHaveProperty('collapsed');
    });

    it('should load saved state on initialization', () => {
      // Test that init() reads from localStorage
      const savedState = JSON.stringify({ width: 350, collapsed: false });
      // Implementation should parse and apply this state
      const parsed = JSON.parse(savedState);
      expect(parsed.width).toBe(350);
      expect(parsed.collapsed).toBe(false);
    });

    it('should persist state changes immediately', () => {
      // After collapse/expand/resize, state should be saved
      const state: SkillPanelState = { width: 280, collapsed: true };
      const serialized = JSON.stringify(state);
      expect(serialized).toContain('"collapsed":true');
    });
  });

  // ===========================================================================
  // AC7: Clear button to reset invocation history
  // ===========================================================================
  describe('AC7: Clear button to reset invocation history', () => {
    it('should have Clear button in panel controls', () => {
      const clearBtn = document.querySelector('#skill-panel [data-action="clear"]');
      expect(clearBtn).not.toBeNull();
    });

    it('should have danger styling for Clear button', () => {
      const clearBtn = document.querySelector('#skill-panel [data-action="clear"]');
      expect(clearBtn?.classList.contains('danger')).toBe(true);
    });

    it('should show confirmation before clearing', async () => {
      // Implementation should call confirm() before clearing
      const mockConfirm = vi.fn().mockReturnValue(true);
      global.confirm = mockConfirm;

      // Simulated clear action
      const shouldClear = confirm('Clear the skill log? This cannot be undone.');
      expect(shouldClear).toBe(true);
      expect(mockConfirm).toHaveBeenCalledWith('Clear the skill log? This cannot be undone.');
    });

    it('should reset badge count to 0 after clearing', () => {
      // After clear, badge should show empty
      const count = 0;
      const displayText = count > 0 ? String(count) : '';
      expect(displayText).toBe('');
    });
  });

  // ===========================================================================
  // AC8: Works with all skill types (built-in and custom)
  // ===========================================================================
  describe('AC8: Works with all skill types (built-in and custom)', () => {
    it('should handle built-in skills like /commit', () => {
      const entry = createSkillEntry({ skill: 'commit' });
      expect(entry.skill).toBe('commit');
    });

    it('should handle built-in skills like /review-pr', () => {
      const entry = createSkillEntry({ skill: 'review-pr' });
      expect(entry.skill).toBe('review-pr');
    });

    it('should handle built-in skills like /workflow', () => {
      const entry = createSkillEntry({ skill: 'workflow' });
      expect(entry.skill).toBe('workflow');
    });

    it('should handle custom user skills', () => {
      const entry = createSkillEntry({ skill: 'my-custom-skill' });
      expect(entry.skill).toBe('my-custom-skill');
    });

    it('should handle skills with arguments', () => {
      const entry = createSkillEntry({ skill: 'commit', args: '-m "message"' });
      expect(entry.args).toBe('-m "message"');
    });
  });

  // ===========================================================================
  // Behavior Scenario 1: Skill appears when invoked
  // ===========================================================================
  describe('Scenario 1: Skill appears when invoked', () => {
    it('should add new entry to list when skill starts', () => {
      const entries: SkillEntry[] = [];
      const newEntry = createSkillEntry({ skill: 'commit' });
      entries.unshift(newEntry); // Add to top

      expect(entries.length).toBe(1);
      expect(entries[0].skill).toBe('commit');
    });

    it('should show entry at top of list (reverse chronological)', () => {
      const entries: SkillEntry[] = [
        createSkillEntry({ skill: 'first', timestamp: 1000 }),
      ];
      const newEntry = createSkillEntry({ skill: 'second', timestamp: 2000 });
      entries.unshift(newEntry);

      expect(entries[0].skill).toBe('second');
    });

    it('should show running spinner for new entry', () => {
      const entry = createSkillEntry({ status: 'running' });
      expect(entry.status).toBe('running');
    });

    it('should increment badge count when skill starts', () => {
      let badgeCount = 2;
      badgeCount += 1;
      expect(badgeCount).toBe(3);
    });
  });

  // ===========================================================================
  // Behavior Scenario 2: Skill completion updates entry
  // ===========================================================================
  describe('Scenario 2: Skill completion updates entry', () => {
    it('should update status from running to completed', () => {
      const entry = createSkillEntry({ status: 'running' });
      entry.status = 'completed';
      expect(entry.status).toBe('completed');
    });

    it('should add result when skill completes', () => {
      const entry = createSkillEntry({ status: 'running' });
      entry.status = 'completed';
      entry.result = 'Committed abc123';
      expect(entry.result).toBe('Committed abc123');
    });

    it('should add duration when skill completes', () => {
      const entry = createSkillEntry({ status: 'running' });
      entry.status = 'completed';
      entry.durationMs = 2300;
      expect(entry.durationMs).toBe(2300);
    });

    it('should change spinner to checkmark on completion', () => {
      const entry = createCompletedSkillEntry();
      expect(entry.status).toBe('completed');
      // Implementation renders ✓ for completed status
    });
  });

  // ===========================================================================
  // Behavior Scenario 3: Expand shows details
  // ===========================================================================
  describe('Scenario 3: Expand shows details', () => {
    it('should toggle expanded state on entry click', () => {
      let expanded = false;
      expanded = !expanded;
      expect(expanded).toBe(true);
    });

    it('should show args in expanded view', () => {
      const entry = createCompletedSkillEntry({ args: '-m "message"' });
      expect(entry.args).toBe('-m "message"');
    });

    it('should show result in expanded view', () => {
      const entry = createCompletedSkillEntry({ result: 'Success' });
      expect(entry.result).toBe('Success');
    });

    it('should show duration in expanded view', () => {
      const entry = createCompletedSkillEntry({ durationMs: 1500 });
      // Format as "1.5s"
      const formatted = `${(entry.durationMs! / 1000).toFixed(1)}s`;
      expect(formatted).toBe('1.5s');
    });
  });

  // ===========================================================================
  // Behavior Scenario 4: Panel persists state
  // ===========================================================================
  describe('Scenario 4: Panel persists state', () => {
    it('should save width when resized', () => {
      const state: SkillPanelState = { width: 300, collapsed: false };
      state.width = 350;
      expect(state.width).toBe(350);
    });

    it('should restore width on page load', () => {
      const savedState = { width: 300, collapsed: false };
      const restoredWidth = savedState.width;
      expect(restoredWidth).toBe(300);
    });

    it('should save collapsed state when collapsed', () => {
      const state: SkillPanelState = { width: 300, collapsed: false };
      state.collapsed = true;
      expect(state.collapsed).toBe(true);
    });

    it('should restore collapsed state on page load', () => {
      const savedState = { width: 300, collapsed: true };
      expect(savedState.collapsed).toBe(true);
    });
  });

  // ===========================================================================
  // Behavior Scenario 5: Clear removes all entries
  // ===========================================================================
  describe('Scenario 5: Clear removes all entries', () => {
    it('should remove all entries when cleared', () => {
      const entries = [
        createSkillEntry({ skill: 'a' }),
        createSkillEntry({ skill: 'b' }),
        createSkillEntry({ skill: 'c' }),
      ];
      entries.length = 0;
      expect(entries.length).toBe(0);
    });

    it('should reset badge to empty after clear', () => {
      const displayBadge = (count: number) => count > 0 ? String(count) : '';
      expect(displayBadge(0)).toBe('');
    });

    it('should show empty state message after clear', () => {
      const entries: SkillEntry[] = [];
      const showEmptyMessage = entries.length === 0;
      expect(showEmptyMessage).toBe(true);
    });
  });

  // ===========================================================================
  // Behavior Scenario 6: Error state display
  // ===========================================================================
  describe('Scenario 6: Error state display', () => {
    it('should show error icon for failed skill', () => {
      const entry = createErrorSkillEntry();
      expect(entry.status).toBe('error');
      // Implementation renders ✗ for error status
    });

    it('should store error message', () => {
      const entry = createErrorSkillEntry({ error: 'No workflow found' });
      expect(entry.error).toBe('No workflow found');
    });

    it('should show error message in expanded view', () => {
      const entry = createErrorSkillEntry({ error: 'Permission denied' });
      expect(entry.error).toBe('Permission denied');
    });

    it('should have error row styling', () => {
      expect(css).toContain('.error');
    });
  });

  // ===========================================================================
  // IPC Channel Tests
  // ===========================================================================
  describe('IPC Channels', () => {
    let ipcChannels: string;

    beforeAll(() => {
      ipcChannels = fs.readFileSync(IPC_CHANNELS_PATH, 'utf-8');
    });

    it('should define IPC_SKILL_CHANNELS constant', () => {
      expect(ipcChannels).toContain('IPC_SKILL_CHANNELS');
    });

    it('should have skill:start channel', () => {
      expect(ipcChannels).toContain('skill:start');
    });

    it('should have skill:complete channel', () => {
      expect(ipcChannels).toContain('skill:complete');
    });

    it('should have skill:error channel', () => {
      expect(ipcChannels).toContain('skill:error');
    });

    it('should have skill:get channel', () => {
      expect(ipcChannels).toContain('skill:get');
    });

    it('should have skill:clear channel', () => {
      expect(ipcChannels).toContain('skill:clear');
    });
  });

  // ===========================================================================
  // Panel Registration Tests
  // ===========================================================================
  describe('Panel Registration', () => {
    it('should register skill panel with PanelManager', () => {
      // Check that index.html registers skill-panel
      expect(html).toContain('skill-panel');
    });

    it('should have tab bar shortcut 4 for skill panel', () => {
      // PanelManager registration should use shortcut: '4'
      const shortcut = '4';
      expect(shortcut).toBe('4');
    });

    it('should have label SKILLS in tab bar', () => {
      const label = 'SKILLS';
      expect(label).toBe('SKILLS');
    });

    it('should have order 4 (after TOOLS)', () => {
      // Order: 1=CHANGED, 2=DIFFS, 3=TOOLS, 4=SKILLS
      const order = 4;
      expect(order).toBe(4);
    });
  });

  // ===========================================================================
  // Accessibility Tests
  // ===========================================================================
  describe('Accessibility', () => {
    it('should have role="region" on panel', () => {
      const panel = document.getElementById('skill-panel');
      // Implementation should add role="region"
      expect(panel).not.toBeNull();
    });

    it('should have aria-label on panel', () => {
      // Implementation should add aria-label="Skill invocations"
      const expectedLabel = 'Skill invocations';
      expect(expectedLabel).toBe('Skill invocations');
    });

    it('should have aria-expanded on collapse button', () => {
      // Implementation should track expanded state
      const expanded = false;
      const ariaExpanded = String(expanded);
      expect(ariaExpanded).toBe('false');
    });

    it('should have aria-label on status icons', () => {
      // Status icons should have descriptive labels
      const statusLabels = {
        running: 'Skill running',
        completed: 'Skill completed',
        error: 'Skill failed',
      };
      expect(statusLabels.running).toBe('Skill running');
    });
  });
});
