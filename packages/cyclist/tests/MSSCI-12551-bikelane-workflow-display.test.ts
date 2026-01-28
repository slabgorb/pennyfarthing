/**
 * MSSCI-12551: BikeLane Workflow Display
 *
 * These tests verify the acceptance criteria for fixing workflow display.
 * Workflow steps should render in the bikelane panel, NOT the story panel.
 *
 * Written in RED phase - tests should fail until Dev implements the fix.
 *
 * Acceptance Criteria:
 * - AC1: Workflow steps render ONLY in bikelane panel (not story panel)
 * - AC2: Bikelane section VISIBLE when workflow is active
 * - AC3: Shows workflow type badge (TDD, trivial, etc)
 * - AC4: Shows phase progress with current phase highlighted
 * - AC5: Shows phase history timeline
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { Window } from 'happy-dom';
import request from 'supertest';

import { app } from '../src/server.js';

// Import modules to test
import * as storyModule from '../src/public/js/sidebar/story.js';
import * as bikelaneModule from '../src/public/js/sidebar/bikelane.js';

describe('MSSCI-12551: BikeLane Workflow Display', () => {
  let html: string;
  let document: Document;
  let window: Window;

  beforeAll(async () => {
    // Fetch HTML
    const htmlResponse = await request(app).get('/');
    html = htmlResponse.text;
  });

  beforeEach(() => {
    // Fresh DOM for each test
    window = new Window();
    window.document.write(html);
    document = window.document as unknown as Document;

    // Set up global document for module functions
    (global as any).document = document;
  });

  afterEach(() => {
    delete (global as any).document;
    vi.restoreAllMocks();
  });

  describe('AC1: Workflow steps render ONLY in bikelane panel (not story panel)', () => {
    const workflowData = [
      { agent: 'sm', status: 'done', label: 'SM' },
      { agent: 'tea', status: 'current', label: 'TEA' },
      { agent: 'dev', status: 'pending', label: 'Dev' },
      { agent: 'reviewer', status: 'pending', label: 'Rev' },
    ];

    it('should NOT have #workflow-progress element in story section', () => {
      // The workflow-progress element should be removed from story section
      const storySection = document.getElementById('story-section');
      const workflowProgress = storySection?.querySelector('#workflow-progress');

      expect(workflowProgress).toBeNull();
    });

    it('should NOT have updateWorkflowProgress function exported from story.js', () => {
      // The function should be removed from story module
      expect((storyModule as any).updateWorkflowProgress).toBeUndefined();
    });

    it('should NOT render workflow steps when story.update() is called', () => {
      const storyData = {
        id: 'MSSCI-12551',
        title: 'Test Story',
        workflow: workflowData,
      };

      // Call story update with workflow data
      storyModule.update(storyData);

      // The story section should NOT contain any workflow visualization
      const storySection = document.getElementById('story-section');
      const workflowSteps = storySection?.querySelectorAll('.workflow-step');

      expect(workflowSteps?.length ?? 0).toBe(0);
    });

    it('should NOT render workflow arrows in story section', () => {
      const storyData = {
        id: 'MSSCI-12551',
        title: 'Test Story',
        workflow: workflowData,
      };

      storyModule.update(storyData);

      const storySection = document.getElementById('story-section');
      const arrows = storySection?.querySelectorAll('.workflow-arrow');

      expect(arrows?.length ?? 0).toBe(0);
    });
  });

  describe('AC2: Bikelane section VISIBLE when workflow is active', () => {
    it('should show bikelane section when workflow data is provided', () => {
      const workflowData = {
        type: 'tdd',
        phases: [
          { agent: 'sm', status: 'done', label: 'SM', name: 'setup' },
          { agent: 'tea', status: 'current', label: 'TEA', name: 'red' },
        ],
      };

      bikelaneModule.update(workflowData);

      const bikelaneSection = document.getElementById('bikelane-section');

      // Section should be visible
      expect(bikelaneSection?.classList.contains('hidden')).toBe(false);
      expect(bikelaneSection?.style.display).not.toBe('none');
    });

    it('should hide bikelane section when workflow data is null', () => {
      bikelaneModule.update(null);

      const bikelaneSection = document.getElementById('bikelane-section');

      // Section should be hidden
      expect(
        bikelaneSection?.classList.contains('hidden') ||
        bikelaneSection?.style.display === 'none'
      ).toBe(true);
    });

    it('should hide bikelane section when workflow data is undefined', () => {
      bikelaneModule.update(undefined as any);

      const bikelaneSection = document.getElementById('bikelane-section');

      expect(
        bikelaneSection?.classList.contains('hidden') ||
        bikelaneSection?.style.display === 'none'
      ).toBe(true);
    });

    it('should remove "hidden" class when workflow becomes active', () => {
      const bikelaneSection = document.getElementById('bikelane-section');

      // Start hidden
      bikelaneSection?.classList.add('hidden');
      bikelaneSection!.style.display = 'none';

      // Update with workflow data
      const workflowData = {
        type: 'tdd',
        phases: [{ agent: 'sm', status: 'current', name: 'setup' }],
      };

      bikelaneModule.update(workflowData);

      expect(bikelaneSection?.classList.contains('hidden')).toBe(false);
    });
  });

  describe('AC3: Shows workflow type badge (TDD, trivial, etc)', () => {
    it('should display "TDD" badge for TDD workflow', () => {
      const workflowData = {
        type: 'tdd',
        phases: [],
      };

      bikelaneModule.update(workflowData);

      const badge = document.querySelector('.workflow-type-badge');

      expect(badge?.textContent).toBe('TDD');
    });

    it('should display "BDD" badge for BDD workflow', () => {
      const workflowData = {
        type: 'bdd',
        phases: [],
      };

      bikelaneModule.update(workflowData);

      const badge = document.querySelector('.workflow-type-badge');

      expect(badge?.textContent).toBe('BDD');
    });

    it('should display "Trivial" badge for trivial workflow', () => {
      const workflowData = {
        type: 'trivial',
        phases: [],
      };

      bikelaneModule.update(workflowData);

      const badge = document.querySelector('.workflow-type-badge');

      expect(badge?.textContent).toBe('Trivial');
    });

    it('should display capitalized badge for custom workflows', () => {
      const workflowData = {
        type: 'custom-flow',
        phases: [],
      };

      bikelaneModule.update(workflowData);

      const badge = document.querySelector('.workflow-type-badge');

      // Should capitalize first letter
      expect(badge?.textContent).toBe('Custom-flow');
    });

    it('should set data-workflow-type attribute on badge', () => {
      const workflowData = {
        type: 'tdd',
        phases: [],
      };

      bikelaneModule.update(workflowData);

      const badge = document.querySelector('.workflow-type-badge');

      expect(badge?.getAttribute('data-workflow-type')).toBe('tdd');
    });
  });

  describe('AC4: Shows phase progress with current phase highlighted', () => {
    const workflowData = {
      type: 'tdd',
      phases: [
        { agent: 'sm', status: 'done', label: 'SM', name: 'setup' },
        { agent: 'tea', status: 'current', label: 'TEA', name: 'red' },
        { agent: 'dev', status: 'pending', label: 'Dev', name: 'green' },
        { agent: 'reviewer', status: 'pending', label: 'Rev', name: 'review' },
      ],
    };

    it('should render all phases in bikelane phase-progress', () => {
      bikelaneModule.update(workflowData);

      const phaseProgress = document.querySelector('.phase-progress');
      const phaseSteps = phaseProgress?.querySelectorAll('.phase-step');

      expect(phaseSteps?.length).toBe(4);
    });

    it('should mark completed phases as "done"', () => {
      bikelaneModule.update(workflowData);

      const phaseProgress = document.querySelector('.phase-progress');
      const doneSteps = phaseProgress?.querySelectorAll('.phase-step.done');

      expect(doneSteps?.length).toBe(1);
    });

    it('should mark current phase distinctly', () => {
      bikelaneModule.update(workflowData);

      const phaseProgress = document.querySelector('.phase-progress');
      const currentStep = phaseProgress?.querySelector('.phase-step.current');

      expect(currentStep).not.toBeNull();
      expect(currentStep?.querySelector('.phase-label')?.textContent).toBe('TEA');
    });

    it('should mark pending phases as "pending"', () => {
      bikelaneModule.update(workflowData);

      const phaseProgress = document.querySelector('.phase-progress');
      const pendingSteps = phaseProgress?.querySelectorAll('.phase-step.pending');

      expect(pendingSteps?.length).toBe(2);
    });

    it('should display checkmark icon for done phases', () => {
      bikelaneModule.update(workflowData);

      const phaseProgress = document.querySelector('.phase-progress');
      const doneStep = phaseProgress?.querySelector('.phase-step.done .phase-icon');

      // Unicode checkmark: ✓ (U+2713)
      expect(doneStep?.textContent).toBe('\u2713');
    });

    it('should display filled circle for current phase', () => {
      bikelaneModule.update(workflowData);

      const phaseProgress = document.querySelector('.phase-progress');
      const currentStep = phaseProgress?.querySelector('.phase-step.current .phase-icon');

      // Unicode filled circle: ● (U+25CF)
      expect(currentStep?.textContent).toBe('\u25CF');
    });

    it('should display empty circle for pending phases', () => {
      bikelaneModule.update(workflowData);

      const phaseProgress = document.querySelector('.phase-progress');
      const pendingSteps = phaseProgress?.querySelectorAll('.phase-step.pending .phase-icon');

      // Unicode empty circle: ○ (U+25CB)
      expect(pendingSteps?.[0]?.textContent).toBe('\u25CB');
    });

    it('should render arrows between phases', () => {
      bikelaneModule.update(workflowData);

      const phaseProgress = document.querySelector('.phase-progress');
      const arrows = phaseProgress?.querySelectorAll('.phase-arrow');

      // 4 phases = 3 arrows between them
      expect(arrows?.length).toBe(3);
    });
  });

  describe('AC5: Shows phase history timeline', () => {
    const workflowData = {
      type: 'tdd',
      phases: [
        { agent: 'sm', status: 'done', name: 'setup' },
        { agent: 'tea', status: 'current', name: 'red' },
      ],
      phaseHistory: [
        { phase: 'setup', agent: 'sm', status: 'done', duration: '5m' },
        { phase: 'red', agent: 'tea', status: 'current' },
      ],
    };

    it('should render phase history items', () => {
      bikelaneModule.update(workflowData);

      const historyList = document.querySelector('.phase-history-list');
      const historyItems = historyList?.querySelectorAll('.phase-history-item');

      expect(historyItems?.length).toBe(2);
    });

    it('should display phase name in history', () => {
      bikelaneModule.update(workflowData);

      const historyList = document.querySelector('.phase-history-list');
      const firstItem = historyList?.querySelector('.phase-history-item');
      const phaseName = firstItem?.querySelector('.history-phase');

      expect(phaseName?.textContent).toBe('SETUP');
    });

    it('should display agent name in history', () => {
      bikelaneModule.update(workflowData);

      const historyList = document.querySelector('.phase-history-list');
      const firstItem = historyList?.querySelector('.phase-history-item');
      const agentName = firstItem?.querySelector('.history-agent');

      expect(agentName?.textContent).toBe('sm');
    });

    it('should display duration for completed phases', () => {
      bikelaneModule.update(workflowData);

      const historyList = document.querySelector('.phase-history-list');
      const doneItem = historyList?.querySelector('.phase-history-item.done');
      const duration = doneItem?.querySelector('.history-duration');

      expect(duration?.textContent).toBe('5m');
    });

    it('should display "in progress" for current phase', () => {
      bikelaneModule.update(workflowData);

      const historyList = document.querySelector('.phase-history-list');
      const currentItem = historyList?.querySelector('.phase-history-item.current');
      const duration = currentItem?.querySelector('.history-duration');

      // Should contain "in progress" text
      expect(duration?.textContent?.toLowerCase()).toContain('in progress');
    });

    it('should mark completed history items with checkmark', () => {
      bikelaneModule.update(workflowData);

      const historyList = document.querySelector('.phase-history-list');
      const doneItem = historyList?.querySelector('.phase-history-item.done .history-icon');

      expect(doneItem?.textContent).toBe('\u2713');
    });

    it('should mark current history item with arrow', () => {
      bikelaneModule.update(workflowData);

      const historyList = document.querySelector('.phase-history-list');
      const currentItem = historyList?.querySelector('.phase-history-item.current .history-icon');

      // Current phase uses arrow: → (U+2192)
      expect(currentItem?.textContent).toBe('\u2192');
    });
  });

  describe('Integration: story.update() should not affect bikelane', () => {
    it('should not duplicate workflow rendering', () => {
      const storyData = {
        id: 'MSSCI-12551',
        title: 'Test Story',
        workflow: [
          { agent: 'sm', status: 'done' },
          { agent: 'tea', status: 'current' },
        ],
      };

      const bikelaneData = {
        type: 'tdd',
        phases: [
          { agent: 'sm', status: 'done', name: 'setup' },
          { agent: 'tea', status: 'current', name: 'red' },
        ],
      };

      // Both modules receive data
      storyModule.update(storyData);
      bikelaneModule.update(bikelaneData);

      // Count all workflow-related elements on page
      const allWorkflowSteps = document.querySelectorAll('.workflow-step, .phase-step');

      // Should only have 2 from bikelane, not 4 (2 from story + 2 from bikelane)
      expect(allWorkflowSteps.length).toBe(2);
    });
  });
});
