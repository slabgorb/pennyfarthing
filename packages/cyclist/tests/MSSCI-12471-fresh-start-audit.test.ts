/**
 * MSSCI-12471: Fresh start: Audit and fix stale data on load
 *
 * Tests for ensuring clean state on app start, Clear button, and TirePump.
 * Instead of wiping the message view, we show a system banner with the
 * Pennyfarthing logo announcing "Context cleared".
 *
 * Acceptance Criteria:
 * - AC1: SystemBanner component shows system-level messages with Pennyfarthing logo
 * - AC2: clearSession adds banner to message view instead of wiping it
 * - AC3: Stale sidebar data (tasks, background-tasks, bikelane) is cleared
 * - AC4: Non-stale data (story, git, persona) is preserved
 *
 * Written in RED phase - tests should fail until Dev implements the functionality.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// =============================================================================
// AC1: SystemBanner component shows system-level messages
// =============================================================================
describe('AC1: SystemBanner component', () => {

  describe('Component exports', () => {

    it('should export SystemBanner module', async () => {
      const systemBanner = await import('../src/public/js/components/SystemBanner.js');

      expect(systemBanner).toBeDefined();
    });

    it('should export createSystemBanner function', async () => {
      const { createSystemBanner } = await import('../src/public/js/components/SystemBanner.js');

      expect(createSystemBanner).toBeDefined();
      expect(typeof createSystemBanner).toBe('function');
    });

    it('should export BANNER_TYPES constant', async () => {
      const { BANNER_TYPES } = await import('../src/public/js/components/SystemBanner.js');

      expect(BANNER_TYPES).toBeDefined();
      expect(BANNER_TYPES.CONTEXT_CLEARED).toBe('context_cleared');
    });

  });

  describe('Banner creation', () => {

    it('should create a banner element with system-banner class', async () => {
      const { createSystemBanner, BANNER_TYPES } = await import('../src/public/js/components/SystemBanner.js');

      const banner = createSystemBanner(BANNER_TYPES.CONTEXT_CLEARED);

      expect(banner).toBeInstanceOf(HTMLElement);
      expect(banner.classList.contains('system-banner')).toBe(true);
    });

    it('should include Pennyfarthing logo in banner', async () => {
      const { createSystemBanner, BANNER_TYPES } = await import('../src/public/js/components/SystemBanner.js');

      const banner = createSystemBanner(BANNER_TYPES.CONTEXT_CLEARED);

      const logo = banner.querySelector('.system-banner-logo');
      expect(logo).not.toBeNull();
    });

    it('should display "Context cleared" message for CONTEXT_CLEARED type', async () => {
      const { createSystemBanner, BANNER_TYPES } = await import('../src/public/js/components/SystemBanner.js');

      const banner = createSystemBanner(BANNER_TYPES.CONTEXT_CLEARED);

      expect(banner.textContent).toContain('Context cleared');
    });

    it('should include timestamp in banner', async () => {
      const { createSystemBanner, BANNER_TYPES } = await import('../src/public/js/components/SystemBanner.js');

      const banner = createSystemBanner(BANNER_TYPES.CONTEXT_CLEARED);

      const timestamp = banner.querySelector('.system-banner-timestamp');
      expect(timestamp).not.toBeNull();
    });

    it('should apply context-cleared modifier class for CONTEXT_CLEARED type', async () => {
      const { createSystemBanner, BANNER_TYPES } = await import('../src/public/js/components/SystemBanner.js');

      const banner = createSystemBanner(BANNER_TYPES.CONTEXT_CLEARED);

      expect(banner.classList.contains('system-banner--context-cleared')).toBe(true);
    });

  });

  describe('Banner with custom message', () => {

    it('should accept optional custom message', async () => {
      const { createSystemBanner, BANNER_TYPES } = await import('../src/public/js/components/SystemBanner.js');

      const banner = createSystemBanner(BANNER_TYPES.CONTEXT_CLEARED, {
        message: 'Session reset by TirePump',
      });

      expect(banner.textContent).toContain('Session reset by TirePump');
    });

    it('should accept optional agent name for reload context', async () => {
      const { createSystemBanner, BANNER_TYPES } = await import('../src/public/js/components/SystemBanner.js');

      const banner = createSystemBanner(BANNER_TYPES.CONTEXT_CLEARED, {
        nextAgent: '/dev',
      });

      expect(banner.textContent).toContain('/dev');
    });

  });

});

// =============================================================================
// AC2: clearSession adds banner instead of wiping messages
// =============================================================================
describe('AC2: clearSession shows banner instead of wiping messages', () => {

  describe('controls.js clearSession behavior', () => {

    it('should export addSystemBanner function', async () => {
      const controls = await import('../src/public/js/controls.js');

      expect(controls.addSystemBanner).toBeDefined();
      expect(typeof controls.addSystemBanner).toBe('function');
    });

    it('should NOT clear message view innerHTML on clearSession', async () => {
      // Setup: create a mock message view with existing content
      const mockMessageView = document.createElement('div');
      mockMessageView.id = 'message-view';
      mockMessageView.innerHTML = '<div class="message">Previous message</div>';
      document.body.appendChild(mockMessageView);

      const controls = await import('../src/public/js/controls.js');

      // Mock the electronAPI
      (window as any).electronAPI = {
        claude: {
          clear: vi.fn().mockResolvedValue(undefined),
        },
      };

      // Trigger clearSession
      await controls.clearSessionWithBanner();

      // Message view should still have content
      expect(mockMessageView.innerHTML).not.toBe('');
      expect(mockMessageView.querySelector('.message')).not.toBeNull();

      // Cleanup
      document.body.removeChild(mockMessageView);
    });

    it('should add system banner to message view on clearSession', async () => {
      const mockMessageView = document.createElement('div');
      mockMessageView.id = 'message-view';
      mockMessageView.innerHTML = '<div class="message">Previous message</div>';
      document.body.appendChild(mockMessageView);

      const controls = await import('../src/public/js/controls.js');

      (window as any).electronAPI = {
        claude: {
          clear: vi.fn().mockResolvedValue(undefined),
        },
      };

      await controls.clearSessionWithBanner();

      // Should have added a system banner
      const banner = mockMessageView.querySelector('.system-banner');
      expect(banner).not.toBeNull();

      document.body.removeChild(mockMessageView);
    });

    it('should append banner after existing messages', async () => {
      const mockMessageView = document.createElement('div');
      mockMessageView.id = 'message-view';
      mockMessageView.innerHTML = '<div class="message">Previous message</div>';
      document.body.appendChild(mockMessageView);

      const controls = await import('../src/public/js/controls.js');

      (window as any).electronAPI = {
        claude: {
          clear: vi.fn().mockResolvedValue(undefined),
        },
      };

      await controls.clearSessionWithBanner();

      // Banner should be last child
      const lastChild = mockMessageView.lastElementChild;
      expect(lastChild?.classList.contains('system-banner')).toBe(true);

      document.body.removeChild(mockMessageView);
    });

  });

  describe('TirePump context clear shows banner', () => {

    it('should show banner when TirePump triggers context clear', async () => {
      const mockMessageView = document.createElement('div');
      mockMessageView.id = 'message-view';
      document.body.appendChild(mockMessageView);

      const controls = await import('../src/public/js/controls.js');

      // Simulate TirePump context clear
      await controls.handleTirePumpClear('/dev');

      const banner = mockMessageView.querySelector('.system-banner');
      expect(banner).not.toBeNull();
      expect(banner?.textContent).toContain('Context cleared');

      document.body.removeChild(mockMessageView);
    });

    it('should include next agent in TirePump banner', async () => {
      const mockMessageView = document.createElement('div');
      mockMessageView.id = 'message-view';
      document.body.appendChild(mockMessageView);

      const controls = await import('../src/public/js/controls.js');

      await controls.handleTirePumpClear('/reviewer');

      const banner = mockMessageView.querySelector('.system-banner');
      expect(banner?.textContent).toContain('/reviewer');

      document.body.removeChild(mockMessageView);
    });

  });

});

// =============================================================================
// AC3: Stale sidebar data is cleared
// =============================================================================
describe('AC3: Stale sidebar data is cleared', () => {

  describe('Tasks section clear', () => {

    it('should export clearTasks function from tasks module', async () => {
      const tasks = await import('../src/public/js/sidebar/tasks.js');

      expect(tasks.clearTasks).toBeDefined();
      expect(typeof tasks.clearTasks).toBe('function');
    });

    it('should clear todo items on clearTasks', async () => {
      const tasks = await import('../src/public/js/sidebar/tasks.js');

      // Setup mock DOM
      const mockSection = document.createElement('div');
      mockSection.id = 'tasks-section';
      mockSection.innerHTML = '<div class="todo-item">Task 1</div>';
      document.body.appendChild(mockSection);

      tasks.clearTasks();

      expect(mockSection.querySelector('.todo-item')).toBeNull();

      document.body.removeChild(mockSection);
    });

    it('should reset task count badge on clear', async () => {
      const tasks = await import('../src/public/js/sidebar/tasks.js');

      const mockBadge = document.createElement('span');
      mockBadge.id = 'tasks-count-badge';
      mockBadge.textContent = '5';
      document.body.appendChild(mockBadge);

      tasks.clearTasks();

      expect(mockBadge.textContent).toBe('0');

      document.body.removeChild(mockBadge);
    });

  });

  describe('Background tasks section clear', () => {

    it('should export clearBackgroundTasks function', async () => {
      const backgroundTasks = await import('../src/public/js/sidebar/background-tasks.js');

      expect(backgroundTasks.clearBackgroundTasks).toBeDefined();
      expect(typeof backgroundTasks.clearBackgroundTasks).toBe('function');
    });

    it('should clear all background task entries on clearBackgroundTasks', async () => {
      const backgroundTasks = await import('../src/public/js/sidebar/background-tasks.js');

      const mockSection = document.createElement('div');
      mockSection.id = 'background-tasks-section';
      mockSection.innerHTML = '<div class="background-task">Running task</div>';
      document.body.appendChild(mockSection);

      backgroundTasks.clearBackgroundTasks();

      expect(mockSection.querySelector('.background-task')).toBeNull();

      document.body.removeChild(mockSection);
    });

  });

  describe('BikeLane section clear', () => {

    it('should export clearBikeLane function from bikelane module', async () => {
      const bikelane = await import('../src/public/js/sidebar/bikelane.js');

      expect(bikelane.clearBikeLane).toBeDefined();
      expect(typeof bikelane.clearBikeLane).toBe('function');
    });

    it('should hide workflow section on clearBikeLane', async () => {
      const bikelane = await import('../src/public/js/sidebar/bikelane.js');

      const mockSection = document.createElement('div');
      mockSection.id = 'bikelane-section';
      mockSection.style.display = 'block';
      document.body.appendChild(mockSection);

      bikelane.clearBikeLane();

      expect(mockSection.style.display).toBe('none');

      document.body.removeChild(mockSection);
    });

    it('should reset workflow state on clearBikeLane', async () => {
      const bikelane = await import('../src/public/js/sidebar/bikelane.js');

      const mockWorkflowName = document.createElement('span');
      mockWorkflowName.id = 'workflow-name';
      mockWorkflowName.textContent = 'tdd';
      document.body.appendChild(mockWorkflowName);

      bikelane.clearBikeLane();

      expect(mockWorkflowName.textContent).toBe('');

      document.body.removeChild(mockWorkflowName);
    });

  });

  describe('clearSession triggers all stale data clears', () => {

    it('should call clearTasks on clearSession', async () => {
      const tasks = await import('../src/public/js/sidebar/tasks.js');
      const clearTasksSpy = vi.spyOn(tasks, 'clearTasks');

      const controls = await import('../src/public/js/controls.js');

      (window as any).electronAPI = {
        claude: {
          clear: vi.fn().mockResolvedValue(undefined),
        },
      };

      // Create minimal DOM
      const mockMessageView = document.createElement('div');
      mockMessageView.id = 'message-view';
      document.body.appendChild(mockMessageView);

      await controls.clearSessionWithBanner();

      expect(clearTasksSpy).toHaveBeenCalled();

      document.body.removeChild(mockMessageView);
    });

    it('should call clearBackgroundTasks on clearSession', async () => {
      const backgroundTasks = await import('../src/public/js/sidebar/background-tasks.js');
      const clearBgTasksSpy = vi.spyOn(backgroundTasks, 'clearBackgroundTasks');

      const controls = await import('../src/public/js/controls.js');

      (window as any).electronAPI = {
        claude: {
          clear: vi.fn().mockResolvedValue(undefined),
        },
      };

      const mockMessageView = document.createElement('div');
      mockMessageView.id = 'message-view';
      document.body.appendChild(mockMessageView);

      await controls.clearSessionWithBanner();

      expect(clearBgTasksSpy).toHaveBeenCalled();

      document.body.removeChild(mockMessageView);
    });

    it('should call clearBikeLane on clearSession', async () => {
      const bikelane = await import('../src/public/js/sidebar/bikelane.js');
      const clearBikeLaneSpy = vi.spyOn(bikelane, 'clearBikeLane');

      const controls = await import('../src/public/js/controls.js');

      (window as any).electronAPI = {
        claude: {
          clear: vi.fn().mockResolvedValue(undefined),
        },
      };

      const mockMessageView = document.createElement('div');
      mockMessageView.id = 'message-view';
      document.body.appendChild(mockMessageView);

      await controls.clearSessionWithBanner();

      expect(clearBikeLaneSpy).toHaveBeenCalled();

      document.body.removeChild(mockMessageView);
    });

  });

});

// =============================================================================
// AC4: Non-stale data is preserved
// =============================================================================
describe('AC4: Non-stale data is preserved', () => {

  describe('Story section preserved', () => {

    it('should NOT call clearStory on clearSession', async () => {
      const story = await import('../src/public/js/sidebar/story.js');

      // Verify there's no clearStory call or if there is, it's not called
      const controls = await import('../src/public/js/controls.js');

      (window as any).electronAPI = {
        claude: {
          clear: vi.fn().mockResolvedValue(undefined),
        },
      };

      const mockMessageView = document.createElement('div');
      mockMessageView.id = 'message-view';
      document.body.appendChild(mockMessageView);

      // Setup story section with content
      const mockStorySection = document.createElement('div');
      mockStorySection.id = 'story-section';
      mockStorySection.innerHTML = '<span id="story-id">MSSCI-12471</span>';
      document.body.appendChild(mockStorySection);

      await controls.clearSessionWithBanner();

      // Story section should still have content
      const storyId = document.getElementById('story-id');
      expect(storyId?.textContent).toBe('MSSCI-12471');

      document.body.removeChild(mockMessageView);
      document.body.removeChild(mockStorySection);
    });

  });

  describe('Git section preserved', () => {

    it('should NOT clear git status on clearSession', async () => {
      const controls = await import('../src/public/js/controls.js');

      (window as any).electronAPI = {
        claude: {
          clear: vi.fn().mockResolvedValue(undefined),
        },
      };

      const mockMessageView = document.createElement('div');
      mockMessageView.id = 'message-view';
      document.body.appendChild(mockMessageView);

      const mockGitSection = document.createElement('div');
      mockGitSection.id = 'git-section';
      mockGitSection.innerHTML = '<span id="git-branch">feat/MSSCI-12471</span>';
      document.body.appendChild(mockGitSection);

      await controls.clearSessionWithBanner();

      // Git section should still have content
      const gitBranch = document.getElementById('git-branch');
      expect(gitBranch?.textContent).toBe('feat/MSSCI-12471');

      document.body.removeChild(mockMessageView);
      document.body.removeChild(mockGitSection);
    });

  });

  describe('Acceptance criteria section preserved', () => {

    it('should NOT clear acceptance criteria on clearSession', async () => {
      const controls = await import('../src/public/js/controls.js');

      (window as any).electronAPI = {
        claude: {
          clear: vi.fn().mockResolvedValue(undefined),
        },
      };

      const mockMessageView = document.createElement('div');
      mockMessageView.id = 'message-view';
      document.body.appendChild(mockMessageView);

      const mockACSection = document.createElement('div');
      mockACSection.id = 'acceptance-criteria-section';
      mockACSection.innerHTML = '<div class="ac-item">AC1: System banner</div>';
      document.body.appendChild(mockACSection);

      await controls.clearSessionWithBanner();

      // AC section should still have content
      const acItem = mockACSection.querySelector('.ac-item');
      expect(acItem?.textContent).toContain('AC1');

      document.body.removeChild(mockMessageView);
      document.body.removeChild(mockACSection);
    });

  });

});

// =============================================================================
// Integration: Full clear flow
// =============================================================================
describe('Integration: Full clear flow', () => {

  it('should handle complete clear flow: add banner + clear stale + preserve non-stale', async () => {
    // Setup full DOM
    const mockMessageView = document.createElement('div');
    mockMessageView.id = 'message-view';
    mockMessageView.innerHTML = '<div class="message">Previous conversation</div>';

    const mockTasksSection = document.createElement('div');
    mockTasksSection.id = 'tasks-section';
    mockTasksSection.innerHTML = '<div class="todo-item">Old task</div>';

    const mockStorySection = document.createElement('div');
    mockStorySection.id = 'story-section';
    mockStorySection.innerHTML = '<span id="story-id">MSSCI-12471</span>';

    document.body.appendChild(mockMessageView);
    document.body.appendChild(mockTasksSection);
    document.body.appendChild(mockStorySection);

    const controls = await import('../src/public/js/controls.js');

    (window as any).electronAPI = {
      claude: {
        clear: vi.fn().mockResolvedValue(undefined),
      },
    };

    await controls.clearSessionWithBanner();

    // 1. Banner added
    expect(mockMessageView.querySelector('.system-banner')).not.toBeNull();

    // 2. Previous messages preserved
    expect(mockMessageView.querySelector('.message')).not.toBeNull();

    // 3. Stale data cleared
    expect(mockTasksSection.querySelector('.todo-item')).toBeNull();

    // 4. Non-stale data preserved
    expect(document.getElementById('story-id')?.textContent).toBe('MSSCI-12471');

    // Cleanup
    document.body.removeChild(mockMessageView);
    document.body.removeChild(mockTasksSection);
    document.body.removeChild(mockStorySection);
  });

});
