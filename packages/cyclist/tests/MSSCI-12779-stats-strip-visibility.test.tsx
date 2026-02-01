/**
 * MSSCI-12779: Stats Strip Not Visible
 *
 * Bug: The stats strip component is not displaying in the Cyclist UI.
 * Root cause: StatsStrip component exists but is not imported/rendered in MessagePanel.
 *
 * Acceptance Criteria:
 * - AC1: Stats strip component is visible in the Cyclist UI
 * - AC2: Stats are properly rendered and updated
 *
 * Written in RED phase - tests should fail until Dev implements the fix.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';

// Mock window.electronAPI before importing components
const mockElectronAPI = {
  claude: {
    onMessage: vi.fn(),
    onComplete: vi.fn(),
    onError: vi.fn(),
    send: vi.fn(),
  },
  ipc: {
    on: vi.fn(),
    off: vi.fn(),
    invoke: vi.fn(),
  },
  settings: {
    get: vi.fn().mockResolvedValue({}),
    getSync: vi.fn().mockReturnValue({}),
    onChange: vi.fn(),
  },
};

// @ts-expect-error - mock window.electronAPI
global.window = { ...global.window, electronAPI: mockElectronAPI };

// Mock IPC hooks that StatsStrip depends on
vi.mock('../src/public/hooks/useIpc', () => ({
  useIpcData: vi.fn().mockReturnValue({ data: null, isLoading: false }),
  useIpcInvoke: vi.fn().mockReturnValue({ invoke: vi.fn(), data: null }),
}));

// Mock the useStatsStrip hook
vi.mock('../src/public/hooks/useStatsStrip', () => ({
  useStatsStrip: vi.fn().mockReturnValue({
    context: { percent: 45 },
    stats: { model: 'claude-opus-4-5-20251101' },
    projectInfo: {
      pwd: '/Users/test/project',
      jiraEmail: 'test@example.com',
      githubUsername: 'testuser',
    },
  }),
}));

// Mock useControlBar hook
vi.mock('../src/public/components/ControlBar', () => ({
  ControlBar: () => <div data-testid="control-bar">ControlBar</div>,
  useControlBar: vi.fn().mockReturnValue({
    isRunning: false,
    isStopping: false,
    handleStop: vi.fn(),
    handleForceStop: vi.fn(),
    handleReset: vi.fn(),
  }),
}));

// Mock other dependencies
vi.mock('../src/public/components/MessageView', () => ({
  default: () => <div data-testid="message-view">MessageView</div>,
}));

vi.mock('../src/public/components/Editor', () => ({
  default: ({ onSubmit }: { onSubmit: (text: string, images: unknown[]) => void }) => (
    <div data-testid="editor">
      <button onClick={() => onSubmit('test', [])}>Submit</button>
    </div>
  ),
}));

vi.mock('../src/public/components/PersonaHeader', () => ({
  default: () => <div data-testid="persona-header">PersonaHeader</div>,
}));

describe('MSSCI-12779: Stats Strip Not Visible', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('AC1: Stats strip component is visible in the Cyclist UI', () => {
    it('should render StatsStrip component in MessagePanel', async () => {
      // Import dynamically after mocks are set up
      const { MessagePanel } = await import('../src/public/components/panels/MessagePanel');

      render(<MessagePanel />);

      // The stats strip should be rendered and visible
      const statsStrip = screen.queryByTestId('stats-strip');
      expect(statsStrip).not.toBeNull();
      expect(statsStrip).toBeInTheDocument();
    });

    it('should position StatsStrip below the editor section', async () => {
      const { MessagePanel } = await import('../src/public/components/panels/MessagePanel');

      const { container } = render(<MessagePanel />);

      // Get the panel structure
      const messagePanel = container.querySelector('.message-panel');
      expect(messagePanel).not.toBeNull();

      // StatsStrip should come after the editor section in DOM order
      const children = Array.from(messagePanel?.children || []);
      const editorIndex = children.findIndex(
        (el) => el.classList.contains('message-panel-editor')
      );
      const statsStripIndex = children.findIndex(
        (el) =>
          el.classList.contains('stats-strip') ||
          (el as HTMLElement).dataset?.testid === 'stats-strip'
      );

      expect(editorIndex).toBeGreaterThanOrEqual(0);
      expect(statsStripIndex).toBeGreaterThan(editorIndex);
    });

    it('should have stats-strip class for styling', async () => {
      const { MessagePanel } = await import('../src/public/components/panels/MessagePanel');

      render(<MessagePanel />);

      const statsStrip = screen.queryByTestId('stats-strip');
      expect(statsStrip).toHaveClass('stats-strip');
    });
  });

  describe('AC2: Stats are properly rendered and updated', () => {
    it('should display context percentage', async () => {
      const { MessagePanel } = await import('../src/public/components/panels/MessagePanel');

      render(<MessagePanel />);

      // Context percentage should be visible (45% from mock)
      const contextPercent = screen.queryByTestId('context-percent');
      expect(contextPercent).not.toBeNull();
      expect(contextPercent).toHaveTextContent('45%');
    });

    it('should display model badge', async () => {
      const { MessagePanel } = await import('../src/public/components/panels/MessagePanel');

      render(<MessagePanel />);

      // Model badge should show shortened model name
      const modelBadge = screen.queryByTestId('model-badge');
      expect(modelBadge).not.toBeNull();
      expect(modelBadge).toHaveTextContent('opus');
    });

    it('should display PWD folder name', async () => {
      const { MessagePanel } = await import('../src/public/components/panels/MessagePanel');

      render(<MessagePanel />);

      // PWD should show folder name
      const pwd = screen.queryByTestId('stats-pwd');
      expect(pwd).not.toBeNull();
      expect(pwd).toHaveTextContent('project');
    });

    it('should display Jira email when configured', async () => {
      const { MessagePanel } = await import('../src/public/components/panels/MessagePanel');

      render(<MessagePanel />);

      // Jira email should be visible
      const jiraEmail = screen.queryByTestId('jira-email');
      expect(jiraEmail).not.toBeNull();
      expect(jiraEmail).toHaveTextContent('test@example.com');
    });

    it('should display GitHub username when configured', async () => {
      const { MessagePanel } = await import('../src/public/components/panels/MessagePanel');

      render(<MessagePanel />);

      // GitHub username should be visible with @ prefix
      const githubUser = screen.queryByTestId('github-user');
      expect(githubUser).not.toBeNull();
      expect(githubUser).toHaveTextContent('@testuser');
    });

    it('should have context meter with appropriate level class', async () => {
      const { MessagePanel } = await import('../src/public/components/panels/MessagePanel');

      render(<MessagePanel />);

      // Context meter should have level-safe class (45% < 70%)
      const contextMeter = screen.queryByTestId('context-meter');
      expect(contextMeter).not.toBeNull();
      expect(contextMeter).toHaveClass('level-safe');
    });
  });

  describe('StatsStrip component import', () => {
    it('should import StatsStrip in MessagePanel', async () => {
      // This test verifies the fix is in place - StatsStrip must be imported
      const messagePanelSource = await import(
        '../src/public/components/panels/MessagePanel?raw'
      );
      const source =
        typeof messagePanelSource.default === 'string'
          ? messagePanelSource.default
          : '';

      // Check that StatsStrip is imported
      expect(source).toMatch(/import.*StatsStrip/);
    });

    it('should render StatsStrip JSX element in MessagePanel', async () => {
      const messagePanelSource = await import(
        '../src/public/components/panels/MessagePanel?raw'
      );
      const source =
        typeof messagePanelSource.default === 'string'
          ? messagePanelSource.default
          : '';

      // Check that <StatsStrip is used in the JSX
      expect(source).toMatch(/<StatsStrip/);
    });
  });
});
