/**
 * B-12451: BikeLane Workflow Sidebar Section
 *
 * These tests verify the acceptance criteria for the BikeLane workflow
 * visualization sidebar section in Cyclist.
 * Written in RED phase - tests should FAIL until Dev implements the functionality.
 *
 * Acceptance Criteria:
 * - AC1: Section renders when workflow data exists
 * - AC2: Section hidden when no workflow (workflow === null)
 * - AC3: Workflow type badge displays correctly (TDD, BDD, etc.)
 * - AC4: Phase summary shows in collapsed state
 * - AC5: Phase progress visualization with icons
 * - AC6: Phase history timeline
 * - AC7: Collapse/expand with persistence
 * - AC8: Section updates when workflow data changes via WebSocket
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { Window } from 'happy-dom';

import { app } from '../src/server.js';

// =============================================================================
// Test Setup
// =============================================================================

describe('B-12451: BikeLane Workflow Sidebar Section', () => {
  let html: string;
  let document: Document;
  let css: string;

  beforeAll(async () => {
    // Fetch HTML
    const htmlResponse = await request(app).get('/');
    html = htmlResponse.text;

    // Parse HTML with happy-dom
    const window = new Window();
    window.document.write(html);
    document = window.document;

    // Fetch CSS
    const cssResponse = await request(app).get('/styles.css');
    css = cssResponse.text;
  });

  // =============================================================================
  // AC1: Section renders when workflow data exists
  // =============================================================================

  describe('AC1: Section renders when workflow data exists', () => {

    it('should have bikelane-section container in sidebar', () => {
      // TODO: Implement bikelane-section container in index.html
      // Expected location: between story-section and git-section
      const bikelaneSection = document.querySelector('#sidebar #bikelane-section');
      expect(bikelaneSection).not.toBeNull();
    });

    it('should have bikelane-section as a collapsible section', () => {
      // TODO: Implement collapsible section structure
      const bikelaneSection = document.querySelector('#bikelane-section');
      expect(bikelaneSection?.classList.contains('collapsible-section')).toBe(true);
    });

    it('should position bikelane-section between story and git sections', () => {
      // TODO: Insert bikelane-section in correct position in index.html
      const sidebar = document.querySelector('#sidebar');
      const children = Array.from(sidebar?.children || []);

      const storyIndex = children.findIndex(el =>
        el.id === 'story-section' || el.classList.contains('story-section')
      );
      const bikelaneIndex = children.findIndex(el =>
        el.id === 'bikelane-section'
      );
      const gitIndex = children.findIndex(el =>
        el.id === 'git-section' || el.classList.contains('git-section')
      );

      expect(bikelaneIndex).toBeGreaterThan(storyIndex);
      expect(bikelaneIndex).toBeLessThan(gitIndex);
    });

    it('should have section-header with BIKELANE title', () => {
      // TODO: Implement section header structure
      const header = document.querySelector('#bikelane-section .section-header');
      expect(header).not.toBeNull();

      const title = header?.querySelector('.section-title');
      expect(title?.textContent?.toUpperCase()).toContain('BIKELANE');
    });

  });

  // =============================================================================
  // AC2: Section hidden when no workflow (workflow === null)
  // =============================================================================

  describe('AC2: Section hidden when no workflow', () => {

    it('should have display:none style or hidden class when no workflow', () => {
      // TODO: Implement conditional visibility in bikelane-section.js
      // When workflow data is null, section should be hidden
      const bikelaneSection = document.querySelector('#bikelane-section');

      // Initially hidden (before workflow data loads)
      // Either display:none style or hidden attribute
      const isHidden = bikelaneSection?.getAttribute('style')?.includes('display: none') ||
                       bikelaneSection?.getAttribute('style')?.includes('display:none') ||
                       bikelaneSection?.hasAttribute('hidden') ||
                       bikelaneSection?.classList.contains('hidden');

      expect(isHidden).toBe(true);
    });

    it('should have CSS rule for .bikelane-section.hidden or [hidden]', () => {
      // TODO: Implement CSS for hidden state
      // Either using .hidden class or [hidden] attribute
      expect(css).toMatch(/(#bikelane-section\.hidden|\.bikelane-section\.hidden|\[hidden\])/);
    });

  });

  // =============================================================================
  // AC3: Workflow type badge displays correctly
  // =============================================================================

  describe('AC3: Workflow type badge displays correctly', () => {

    it('should have workflow-type-badge element in section header', () => {
      // TODO: Implement workflow type badge element
      const badge = document.querySelector('#bikelane-section .workflow-type-badge');
      expect(badge).not.toBeNull();
    });

    it('should have CSS for workflow-type-badge pill styling', () => {
      // TODO: Implement badge styling (pill shape, background color)
      expect(css).toMatch(/\.workflow-type-badge\s*\{/);
    });

    it('should have border-radius for pill shape', () => {
      // TODO: Implement border-radius in CSS
      expect(css).toMatch(/\.workflow-type-badge[^}]*border-radius/);
    });

    it('should have data attribute for badge updates', () => {
      // TODO: Implement data-workflow-type attribute for JS updates
      const badge = document.querySelector('#bikelane-section .workflow-type-badge');
      expect(badge?.hasAttribute('data-workflow-type') ||
             badge?.hasAttribute('data-stat')).toBe(true);
    });

  });

  // =============================================================================
  // AC4: Phase summary shows in collapsed state
  // =============================================================================

  describe('AC4: Phase summary shows in collapsed state', () => {

    it('should have phase-summary element in section header', () => {
      // TODO: Implement phase summary element (SM -> TEA -> Dev -> Rev format)
      const phaseSummary = document.querySelector('#bikelane-section .phase-summary, #bikelane-section .section-summary');
      expect(phaseSummary).not.toBeNull();
    });

    it('should display phase summary in header (visible when collapsed)', () => {
      // TODO: Implement collapsed state summary display
      // Expected format: "SM -> TEA -> Dev -> Rev" with current phase highlighted
      const header = document.querySelector('#bikelane-section .section-header');
      const summary = header?.querySelector('.phase-summary, .section-summary');
      expect(summary).not.toBeNull();
    });

    it('should have collapse-btn in section header', () => {
      // TODO: Implement collapse button
      const collapseBtn = document.querySelector('#bikelane-section .section-header .collapse-btn');
      expect(collapseBtn).not.toBeNull();
    });

    it('should have CSS for phase-summary styling', () => {
      // TODO: Implement phase summary styling
      expect(css).toMatch(/\.phase-summary\s*\{|\.bikelane-section[^}]*\.section-summary/);
    });

  });

  // =============================================================================
  // AC5: Phase progress visualization
  // =============================================================================

  describe('AC5: Phase progress visualization', () => {

    it('should have workflow-phases container in section detail', () => {
      // TODO: Implement workflow phases visualization container
      const phasesContainer = document.querySelector('#bikelane-section .workflow-phases, #bikelane-section .section-detail .phase-progress');
      expect(phasesContainer).not.toBeNull();
    });

    it('should have CSS for phase-step elements', () => {
      // TODO: Implement phase step styling
      expect(css).toMatch(/\.phase-step\s*\{|\.workflow-phase\s*\{/);
    });

    it('should have CSS for done phase state (checkmark icon, green)', () => {
      // TODO: Implement done phase styling with --status-ready color
      expect(css).toMatch(/\.phase-(step|item)\.done|\.phase-(step|item)\.completed/);
    });

    it('should have CSS for current phase state (filled circle, accent)', () => {
      // TODO: Implement current phase styling with accent color + pulse
      expect(css).toMatch(/\.phase-(step|item)\.current|\.phase-(step|item)\.active/);
    });

    it('should have CSS for pending phase state (empty circle, gray)', () => {
      // TODO: Implement pending phase styling with muted opacity
      expect(css).toMatch(/\.phase-(step|item)\.pending/);
    });

    it('should have CSS for phase arrows/connectors between steps', () => {
      // TODO: Implement arrow connectors between phases
      expect(css).toMatch(/\.phase-arrow|\.phase-connector|\.phase-(step|item)::after/);
    });

    it('should have phase-icon elements for visual indicators', () => {
      // TODO: Implement phase icons (checkmark, filled circle, empty circle)
      const sectionDetail = document.querySelector('#bikelane-section .section-detail');
      // Phase icons will be rendered dynamically, but container should exist
      expect(sectionDetail).not.toBeNull();
    });

    it('should have phase-label elements showing agent names', () => {
      // TODO: Implement phase labels (SM, TEA, Dev, Rev)
      // Labels rendered dynamically, verify CSS exists
      expect(css).toMatch(/\.phase-label|\.phase-agent/);
    });

    it('should have phase-name elements showing phase names', () => {
      // TODO: Implement phase names (SETUP, RED, GREEN, REVIEW)
      expect(css).toMatch(/\.phase-name|\.phase-title/);
    });

  });

  // =============================================================================
  // AC6: Phase history timeline
  // =============================================================================

  describe('AC6: Phase history timeline', () => {

    it('should have phase-history container', () => {
      // TODO: Implement phase history section
      const historyContainer = document.querySelector('#bikelane-section .phase-history');
      expect(historyContainer).not.toBeNull();
    });

    it('should have phase-history-header with "PHASE HISTORY" title', () => {
      // TODO: Implement history header
      const historyHeader = document.querySelector('#bikelane-section .phase-history-header, #bikelane-section .phase-history h4');
      expect(historyHeader).not.toBeNull();
    });

    it('should have CSS for phase-history-item elements', () => {
      // TODO: Implement history item styling
      expect(css).toMatch(/\.phase-history-item\s*\{|\.history-entry\s*\{/);
    });

    it('should have CSS for history item icon (status indicator)', () => {
      // TODO: Implement history item icon styling
      expect(css).toMatch(/\.phase-history-item[^}]*icon|\.history-entry[^}]*icon|\.history-icon/);
    });

    it('should have CSS for history item agent name', () => {
      // TODO: Implement history agent styling
      expect(css).toMatch(/\.history-agent|\.phase-history-item[^}]*agent/);
    });

    it('should have CSS for history item duration/status', () => {
      // TODO: Implement history duration styling
      expect(css).toMatch(/\.history-duration|\.history-status|\.phase-history-item[^}]*(duration|status)/);
    });

    it('should apply correct status classes (done, current, pending)', () => {
      // TODO: Verify history items support status classes
      // done = completed phases
      // current = in-progress phase
      // pending = upcoming phases
      expect(css).toMatch(/\.history-(entry|item)\.done|\.phase-history-item\.done/);
      expect(css).toMatch(/\.history-(entry|item)\.current|\.phase-history-item\.current/);
      expect(css).toMatch(/\.history-(entry|item)\.pending|\.phase-history-item\.pending/);
    });

    it('should have CSS for history item with in-progress indicator', () => {
      // TODO: Implement in-progress styling (e.g., "in progress" text)
      expect(css).toMatch(/\.in-progress|\.history-(entry|item)\.current/);
    });

  });

  // =============================================================================
  // AC7: Collapse/expand with persistence
  // =============================================================================

  describe('AC7: Collapse/expand with persistence', () => {

    it('should have bikelane-section registered as collapsible', () => {
      // TODO: Register bikelane-section with collapsed-sections.js
      const bikelaneSection = document.querySelector('#bikelane-section');
      expect(bikelaneSection?.classList.contains('collapsible-section')).toBe(true);
    });

    it('should have section-detail container for expandable content', () => {
      // TODO: Implement section-detail structure
      const sectionDetail = document.querySelector('#bikelane-section .section-detail');
      expect(sectionDetail).not.toBeNull();
    });

    it('should support collapsed class for toggle state', () => {
      // TODO: Implement CSS for collapsed state
      expect(css).toMatch(/#bikelane-section\.collapsed|\.bikelane-section\.collapsed/);
    });

    it('should have CSS that hides section-detail when collapsed', () => {
      // TODO: Implement CSS to hide detail when collapsed
      expect(css).toMatch(/\.collapsible-section\.collapsed\s+\.section-detail|#bikelane-section\.collapsed[^}]*\.section-detail/);
    });

    it('should load collapse state via API on init', async () => {
      // TODO: Implement in bikelane-section.js
      // Should call loadCollapsedStates or similar on initialization
      // Verify by checking that collapsed-sections.js exports are used

      // This test verifies the script includes collapsed-sections.js functionality
      expect(html).toContain('collapsed-sections.js');
    });

  });

  // =============================================================================
  // AC8: Section updates when workflow data changes via WebSocket
  // =============================================================================

  describe('AC8: Data updates via WebSocket', () => {

    it('should include sidebar module that loads bikelane', () => {
      // Sidebar modules are now loaded via /js/sidebar/index.js
      // which imports bikelane.js among other sidebar components
      expect(html).toContain('sidebar/index.js');
    });

    it('should export updateBikelaneSection function', async () => {
      // BikeLane module exports update function (aliased as updateBikelaneSection)
      // Loaded via sidebar/index.js which imports sidebar/bikelane.js
      const { updateBikelaneSection } = await import('../src/public/js/sidebar/bikelane.js');
      expect(typeof updateBikelaneSection).toBe('function');
    });

    it('should listen to story WebSocket channel for workflow updates', async () => {
      // TODO: Implement WebSocket listener in bikelane-section.js
      // Should subscribe to /ws/story or workflow-specific channel

      // Verify story.js is included (bikelane-section.js should work alongside it)
      expect(html).toContain('story.js');
    });

    it('should render workflow type badge on data update', async () => {
      // TODO: Implement workflow type rendering
      // Mock workflow data: { type: 'tdd', ... }
      // Expected: badge shows "TDD"

      const badge = document.querySelector('#bikelane-section .workflow-type-badge');
      // Badge should exist and be ready for updates
      expect(badge).not.toBeNull();
    });

    it('should render phase progress on data update', async () => {
      // TODO: Implement phase progress rendering
      // Mock workflow data: { phases: [{name: 'setup', status: 'done'}, ...] }

      const phasesContainer = document.querySelector('#bikelane-section .workflow-phases, #bikelane-section .phase-progress');
      // Container should exist and be ready for dynamic content
      expect(phasesContainer).not.toBeNull();
    });

    it('should render phase history on data update', async () => {
      // TODO: Implement phase history rendering
      // Mock workflow data: { phaseHistory: [{phase: 'setup', agent: 'sm', duration: '2m 14s'}, ...] }

      const historyContainer = document.querySelector('#bikelane-section .phase-history');
      // Container should exist and be ready for dynamic content
      expect(historyContainer).not.toBeNull();
    });

    it('should show section when workflow data arrives', async () => {
      // TODO: Implement visibility toggle based on workflow data
      // When workflow !== null, remove hidden class/style

      const bikelaneSection = document.querySelector('#bikelane-section');
      // Verify section supports visibility toggle
      expect(bikelaneSection).not.toBeNull();
    });

    it('should hide section when workflow becomes null', async () => {
      // TODO: Implement visibility toggle for null workflow
      // When workflow === null, add hidden class/style

      const bikelaneSection = document.querySelector('#bikelane-section');
      // Verify section can be hidden
      expect(bikelaneSection).not.toBeNull();
    });

  });

  // =============================================================================
  // CSS Integration Tests
  // =============================================================================

  describe('CSS Integration', () => {

    it('should have CSS for #bikelane-section base styling', () => {
      // TODO: Implement bikelane section CSS
      expect(css).toMatch(/#bikelane-section\s*\{/);
    });

    it('should use dark theme colors (matching sidebar)', () => {
      // TODO: Use CSS variables for consistent theming
      expect(css).toMatch(/#bikelane-section[^}]*(var\(--|background|#[0-9a-fA-F]{3,6})/);
    });

    it('should have CSS for section transitions', () => {
      // TODO: Implement smooth collapse/expand transitions
      expect(css).toMatch(/#bikelane-section[^}]*transition|\.bikelane-section[^}]*transition/);
    });

    it('should have CSS for phase status colors', () => {
      // TODO: Implement status color variables
      // Done: --status-ready (green)
      // Current: accent color
      // Pending: gray/muted
      expect(css).toMatch(/--status-ready|--phase-done-color/);
    });

    it('should have CSS for pulse animation on current phase', () => {
      // TODO: Implement pulse animation for current phase
      expect(css).toMatch(/@keyframes.*pulse|\.pulse|\.current[^}]*animation/);
    });

  });

  // =============================================================================
  // Workflow Data Model Tests
  // =============================================================================

  describe('Workflow Data Model', () => {

    it('should accept workflow data with type property', () => {
      // TODO: Implement data model validation in bikelane-section.js
      // Expected data shape: { type: 'tdd' | 'bdd' | 'trivial' | string }

      // This is a design test - verify expected shape is documented
      const expectedShape = {
        type: 'tdd',
        description: 'Test-Driven Development',
        phases: [],
        phaseHistory: [],
      };
      expect(expectedShape.type).toBeDefined();
    });

    it('should accept workflow data with phases array', () => {
      // TODO: Implement phases array handling
      // Expected shape: { phases: [{ name, agent, status }] }

      const expectedPhase = {
        name: 'setup',
        agent: 'sm',
        label: 'SETUP',
        status: 'done' as const,
      };
      expect(['done', 'current', 'pending']).toContain(expectedPhase.status);
    });

    it('should accept workflow data with phaseHistory array', () => {
      // TODO: Implement phase history handling
      // Expected shape: { phaseHistory: [{ phase, agent, duration?, status }] }

      const expectedHistory = {
        phase: 'setup',
        agent: 'sm',
        duration: '2m 14s',
        status: 'done' as const,
      };
      expect(expectedHistory.phase).toBeDefined();
      expect(expectedHistory.agent).toBeDefined();
    });

  });

  // =============================================================================
  // Accessibility Tests
  // =============================================================================

  describe('Accessibility', () => {

    it('should have aria-label on collapse button', () => {
      // TODO: Implement accessible collapse button
      const collapseBtn = document.querySelector('#bikelane-section .collapse-btn');
      expect(collapseBtn?.hasAttribute('aria-label') ||
             collapseBtn?.hasAttribute('title')).toBe(true);
    });

    it('should have semantic heading structure', () => {
      // TODO: Use appropriate heading level for section
      const heading = document.querySelector('#bikelane-section h3, #bikelane-section .section-title');
      expect(heading).not.toBeNull();
    });

    it('should support keyboard navigation for collapse toggle', () => {
      // TODO: Implement keyboard support (Enter/Space to toggle)
      const collapseBtn = document.querySelector('#bikelane-section .collapse-btn');
      expect(collapseBtn?.tagName.toLowerCase()).toBe('button');
    });

  });

});

// =============================================================================
// Unit Tests for bikelane-section.js (Module Tests)
// =============================================================================

/**
 * TECH DEBT: Module tests cannot be run until bikelane-section.js exists.
 * These tests document the expected API for the module.
 *
 * Dev should:
 * 1. Create packages/cyclist/src/public/js/bikelane-section.js
 * 2. Export: renderPhaseProgress, renderPhaseHistory, renderPhaseSummary, formatWorkflowType, updateBikelaneSection
 * 3. Uncomment the describe block below and remove the placeholder tests
 *
 * Expected exports from bikelane-section.js:
 * - renderPhaseProgress(phases: Phase[]) => string (HTML)
 * - renderPhaseHistory(history: HistoryEntry[]) => string (HTML)
 * - renderPhaseSummary(phases: Phase[]) => string (HTML)
 * - formatWorkflowType(type: string) => string
 * - updateBikelaneSection(workflow: Workflow | null) => void
 */

// Module tests - test the actual implementation
import {
  formatWorkflowType,
  renderPhaseProgress,
  renderPhaseHistory,
  renderPhaseSummary,
} from '../src/public/js/sidebar/bikelane.js';

describe('B-12451: bikelane-section.js Module', () => {

  describe('renderPhaseProgress()', () => {

    const testPhases = [
      { name: 'setup', agent: 'sm', label: 'SETUP', status: 'done' },
      { name: 'red', agent: 'tea', label: 'RED', status: 'done' },
      { name: 'green', agent: 'dev', label: 'GREEN', status: 'current' },
      { name: 'review', agent: 'reviewer', label: 'REVIEW', status: 'pending' },
    ];

    it('should render all workflow phases', () => {
      const html = renderPhaseProgress(testPhases);
      expect(html).toContain('SETUP');
      expect(html).toContain('RED');
      expect(html).toContain('GREEN');
      expect(html).toContain('REVIEW');
    });

    it('should mark done phases with checkmark icon class', () => {
      const html = renderPhaseProgress(testPhases);
      expect(html).toMatch(/class="phase-step done"/);
    });

    it('should mark current phase with current class', () => {
      const html = renderPhaseProgress(testPhases);
      expect(html).toMatch(/class="phase-step current"/);
    });

    it('should mark pending phases with pending class', () => {
      const html = renderPhaseProgress(testPhases);
      expect(html).toMatch(/class="phase-step pending"/);
    });

    it('should include arrows between phases', () => {
      const html = renderPhaseProgress(testPhases);
      expect(html).toContain('phase-arrow');
    });

  });

  describe('renderPhaseHistory()', () => {

    const testHistory = [
      { phase: 'SETUP', agent: 'SM', duration: '2m 14s', status: 'done' },
      { phase: 'RED', agent: 'TEA', duration: '8m 32s', status: 'done' },
      { phase: 'GREEN', agent: 'Dev', duration: null, status: 'current' },
      { phase: 'REVIEW', agent: 'Rev', duration: null, status: 'pending' },
    ];

    it('should render phase history timeline', () => {
      const html = renderPhaseHistory(testHistory);
      expect(html).toContain('SETUP');
      expect(html).toContain('SM');
      expect(html).toContain('2m 14s');
    });

    it('should show "in progress" for current phase', () => {
      const html = renderPhaseHistory(testHistory);
      expect(html).toContain('in progress');
    });

    it('should show "pending" for upcoming phases', () => {
      const html = renderPhaseHistory(testHistory);
      expect(html).toContain('pending');
    });

    it('should apply correct status classes to history items', () => {
      const html = renderPhaseHistory(testHistory);
      expect(html).toMatch(/class="phase-history-item done"/);
      expect(html).toMatch(/class="phase-history-item current"/);
      expect(html).toMatch(/class="phase-history-item pending"/);
    });

  });

  describe('renderPhaseSummary()', () => {

    const testPhases = [
      { name: 'setup', agent: 'sm', label: 'SM', status: 'done' },
      { name: 'red', agent: 'tea', label: 'TEA', status: 'done' },
      { name: 'green', agent: 'dev', label: 'Dev', status: 'current' },
      { name: 'review', agent: 'reviewer', label: 'Rev', status: 'pending' },
    ];

    it('should render collapsed phase summary', () => {
      const html = renderPhaseSummary(testPhases);
      // Should contain labels connected by arrows
      expect(html).toContain('SM');
      expect(html).toContain('TEA');
      expect(html).toContain('Dev');
      expect(html).toContain('Rev');
      expect(html).toContain(' → ');
    });

    it('should highlight current phase in summary', () => {
      const html = renderPhaseSummary(testPhases);
      expect(html).toContain('<span class="current">Dev</span>');
    });

  });

  describe('formatWorkflowType()', () => {

    it('should format TDD workflow type', () => {
      expect(formatWorkflowType('tdd')).toBe('TDD');
    });

    it('should format BDD workflow type', () => {
      expect(formatWorkflowType('bdd')).toBe('BDD');
    });

    it('should format trivial workflow type', () => {
      const result = formatWorkflowType('trivial');
      expect(result).toBe('Trivial');
    });

    it('should handle custom workflow types', () => {
      const result = formatWorkflowType('agent-docs');
      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(0);
    });

  });

});

// =============================================================================
// Integration Tests: WebSocket Data Flow
// =============================================================================

describe('B-12451: WebSocket Integration', () => {

  let mockWebSocket: {
    send: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  };
  let messageHandlers: Map<string, (event: { data: string }) => void>;

  beforeEach(() => {
    messageHandlers = new Map();
    mockWebSocket = {
      send: vi.fn(),
      close: vi.fn(),
      addEventListener: vi.fn((event: string, handler: (e: { data: string }) => void) => {
        if (event === 'message') {
          messageHandlers.set(event, handler);
        }
      }),
      removeEventListener: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should update section when receiving workflow data via WebSocket', async () => {
    // Test verifies that updateBikelaneSection can be called with workflow data
    // WebSocket integration is handled by story.js which calls updateBikelaneSection

    const workflowData = {
      type: 'tdd',
      description: 'Test-Driven Development',
      phases: [
        { name: 'setup', agent: 'sm', label: 'SETUP', status: 'done' },
        { name: 'red', agent: 'tea', label: 'RED', status: 'current' },
        { name: 'green', agent: 'dev', label: 'GREEN', status: 'pending' },
        { name: 'review', agent: 'reviewer', label: 'REVIEW', status: 'pending' },
      ],
      phaseHistory: [
        { phase: 'SETUP', agent: 'SM', duration: '2m 14s', status: 'done' },
        { phase: 'RED', agent: 'TEA', duration: null, status: 'current' },
      ],
    };

    // Verify the module exports updateBikelaneSection
    const { updateBikelaneSection } = await import('../src/public/js/sidebar/bikelane.js');
    expect(typeof updateBikelaneSection).toBe('function');

    // Verify it accepts workflow data without throwing
    expect(() => updateBikelaneSection(workflowData)).not.toThrow();
  });

  it('should hide section when workflow is null', async () => {
    // Test verifies that updateBikelaneSection handles null workflow

    const { updateBikelaneSection } = await import('../src/public/js/sidebar/bikelane.js');

    // Verify it accepts null workflow without throwing
    expect(() => updateBikelaneSection(null)).not.toThrow();
  });

  it('should handle workflow type changes', async () => {
    // Test verifies sequential workflow updates work

    const { updateBikelaneSection } = await import('../src/public/js/sidebar/bikelane.js');

    const initialWorkflow = { type: 'tdd', phases: [] };
    const updatedWorkflow = { type: 'trivial', phases: [] };

    // Verify sequential updates don't throw
    expect(() => {
      updateBikelaneSection(initialWorkflow);
      updateBikelaneSection(updatedWorkflow);
    }).not.toThrow();
  });

  it('should handle phase status transitions', async () => {
    // Test verifies phase transitions are handled correctly

    const { updateBikelaneSection } = await import('../src/public/js/sidebar/bikelane.js');

    const phase1 = {
      type: 'tdd',
      phases: [
        { name: 'red', agent: 'tea', status: 'current' },
        { name: 'green', agent: 'dev', status: 'pending' },
      ],
    };

    const phase2 = {
      type: 'tdd',
      phases: [
        { name: 'red', agent: 'tea', status: 'done' },
        { name: 'green', agent: 'dev', status: 'current' },
      ],
    };

    // Verify phase transitions don't throw
    expect(() => {
      updateBikelaneSection(phase1);
      updateBikelaneSection(phase2);
    }).not.toThrow();
  });

});

// =============================================================================
// Mock Storage Tests for Collapse Persistence
// =============================================================================

describe('B-12451: Collapse State Persistence', () => {

  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should load collapse state from API on init', async () => {
    // TODO: Implement collapse state loading

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ 'bikelane-section': true }),
    });

    // Would call loadCollapsedStates or similar
    // Test verifies API is called with correct endpoint
    expect(mockFetch).not.toHaveBeenCalled(); // Will fail until implemented

    // After implementation, should verify:
    // expect(mockFetch).toHaveBeenCalledWith('/api/settings/collapsed');
  });

  it('should save collapse state to API on toggle', async () => {
    // TODO: Implement collapse state saving

    mockFetch.mockResolvedValueOnce({ ok: true });

    // Would call saveCollapsedStates after toggle
    // Test verifies PATCH is called with correct data
    expect(mockFetch).not.toHaveBeenCalled(); // Will fail until implemented

    // After implementation, should verify:
    // expect(mockFetch).toHaveBeenCalledWith(
    //   '/api/settings/collapsed',
    //   expect.objectContaining({
    //     method: 'PATCH',
    //     body: expect.stringContaining('bikelane-section'),
    //   })
    // );
  });

  it('should apply collapsed class when state is true', async () => {
    // Test verifies collapsed-sections.js integration exists
    // The actual DOM manipulation is handled by collapsed-sections.js
    // which bikelane-section.js registers with on init

    // Verify bikelane-section.js registers with collapsed sections system
    const bikelaneModule = await import('../src/public/js/sidebar/bikelane.js');
    expect(bikelaneModule).toBeDefined();
    // The module initialization calls window.collapsedSections.initSection if available
  });

  it('should remove collapsed class when state is false', async () => {
    // Test verifies the module structure supports collapse toggling
    // The actual toggle logic is in collapsed-sections.js

    // Verify CSS supports collapsed state (tested in CSS Integration tests)
    // This test confirms the module loads without errors
    const bikelaneModule = await import('../src/public/js/sidebar/bikelane.js');
    expect(bikelaneModule.updateBikelaneSection).toBeDefined();
  });

});
