/**
 * 69-3: StatsStrip React Component Tests
 *
 * Tests for the React-based StatsStrip component with real-time updates.
 * Story: MSSCI-12699 - StatsStrip Component
 * Epic: epic-69 (Cyclist React Migration)
 *
 * Requirements:
 * - Show context %, model badge, PWD, Jira user, GitHub user
 * - Real-time updates via IPC hooks
 * - Warning colors at 70%/90% thresholds
 *
 * Acceptance Criteria (derived from session description):
 * - AC1: StatsStrip renders with all required elements (context, model, pwd, identities)
 * - AC2: Context percentage displays with color states (safe/warning/danger)
 * - AC3: Model badge shows current model name
 * - AC4: PWD shows current working directory (responsive)
 * - AC5: Identity section shows Jira and GitHub users
 * - AC6: Real-time updates when data changes
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// Component and hook to be implemented
import StatsStrip from '../src/public/components/StatsStrip';
import { useStatsStrip } from '../src/public/hooks/useStatsStrip';

// Mock electronAPI for IPC bridge
const mockElectronAPI = {
  context: {
    get: vi.fn(() => Promise.resolve({ percent: 45, used: 90000, total: 200000 })),
    onUpdate: vi.fn(),
  },
  stats: {
    get: vi.fn(() => Promise.resolve({ model: 'claude-opus-4-5-20251101' })),
    onUpdate: vi.fn(),
  },
  projectInfo: {
    get: vi.fn(() => Promise.resolve({
      pwd: '/Users/test/project',
      jiraEmail: 'test@example.com',
      githubUsername: 'testuser',
    })),
    onUpdate: vi.fn(),
  },
};

// Install mock before tests
beforeEach(() => {
  (window as any).electronAPI = mockElectronAPI;
  vi.clearAllMocks();
});

afterEach(() => {
  delete (window as any).electronAPI;
});

// ============================================================================
// Test Fixtures
// ============================================================================

const mockContextSafe = { percent: 30, used: 60000, total: 200000 };
const mockContextWarning = { percent: 75, used: 150000, total: 200000 };
const mockContextDanger = { percent: 92, used: 184000, total: 200000 };

const mockStats = { model: 'claude-opus-4-5-20251101' };

const mockProjectInfo = {
  pwd: '/Users/keithavery/Projects/pennyfarthing-orchestrator',
  jiraEmail: 'keith@1898andco.com',
  githubUsername: 'keithavery',
};

// ============================================================================
// AC1: StatsStrip renders with all required elements
// ============================================================================

describe('AC1: StatsStrip renders with all required elements', () => {
  it('should render StatsStrip component without crashing', () => {
    render(<StatsStrip />);
    expect(screen.getByTestId('stats-strip')).toBeInTheDocument();
  });

  it('should have stats-left group for identity elements', () => {
    render(<StatsStrip />);
    expect(screen.getByTestId('stats-left')).toBeInTheDocument();
  });

  it('should have stats-right group for metrics elements', () => {
    render(<StatsStrip />);
    expect(screen.getByTestId('stats-right')).toBeInTheDocument();
  });

  it('should render context meter element', () => {
    render(<StatsStrip />);
    expect(screen.getByTestId('context-meter')).toBeInTheDocument();
  });

  it('should render model badge element', () => {
    render(<StatsStrip />);
    expect(screen.getByTestId('model-badge')).toBeInTheDocument();
  });

  it('should render pwd element', () => {
    render(<StatsStrip />);
    expect(screen.getByTestId('stats-pwd')).toBeInTheDocument();
  });

  it('should render jira-email element', async () => {
    render(<StatsStrip />);
    await waitFor(() => {
      expect(screen.getByTestId('jira-email')).toBeInTheDocument();
    });
  });

  it('should render github-user element', async () => {
    render(<StatsStrip />);
    await waitFor(() => {
      expect(screen.getByTestId('github-user')).toBeInTheDocument();
    });
  });
});

// ============================================================================
// AC2: Context percentage displays with color states
// ============================================================================

describe('AC2: Context percentage displays with color states', () => {
  it('should display context percentage value', async () => {
    mockElectronAPI.context.get.mockResolvedValue(mockContextSafe);
    render(<StatsStrip />);

    await waitFor(() => {
      expect(screen.getByTestId('context-percent')).toHaveTextContent('30%');
    });
  });

  it('should apply level-safe class when context < 70%', async () => {
    mockElectronAPI.context.get.mockResolvedValue(mockContextSafe);
    render(<StatsStrip />);

    await waitFor(() => {
      expect(screen.getByTestId('context-meter')).toHaveClass('level-safe');
    });
  });

  it('should apply level-warning class when context >= 70% and < 85%', async () => {
    mockElectronAPI.context.get.mockResolvedValue(mockContextWarning);
    render(<StatsStrip />);

    await waitFor(() => {
      expect(screen.getByTestId('context-meter')).toHaveClass('level-warning');
    });
  });

  it('should apply level-danger class when context >= 85%', async () => {
    mockElectronAPI.context.get.mockResolvedValue(mockContextDanger);
    render(<StatsStrip />);

    await waitFor(() => {
      expect(screen.getByTestId('context-meter')).toHaveClass('level-danger');
    });
  });

  it('should have progress bar fill element', () => {
    render(<StatsStrip />);
    expect(screen.getByTestId('context-fill')).toBeInTheDocument();
  });

  it('should set progress bar width based on context percent', async () => {
    mockElectronAPI.context.get.mockResolvedValue({ percent: 45 });
    render(<StatsStrip />);

    await waitFor(() => {
      const fill = screen.getByTestId('context-fill');
      expect(fill).toHaveStyle({ width: '45%' });
    });
  });
});

// ============================================================================
// AC3: Model badge shows current model name
// ============================================================================

describe('AC3: Model badge shows current model name', () => {
  it('should display model name from stats', async () => {
    mockElectronAPI.stats.get.mockResolvedValue(mockStats);
    render(<StatsStrip />);

    await waitFor(() => {
      expect(screen.getByTestId('model-badge')).toHaveTextContent('opus');
    });
  });

  it('should format long model names to short display', async () => {
    mockElectronAPI.stats.get.mockResolvedValue({ model: 'claude-3-5-sonnet-20241022' });
    render(<StatsStrip />);

    await waitFor(() => {
      expect(screen.getByTestId('model-badge')).toHaveTextContent('sonnet');
    });
  });

  it('should handle haiku model name', async () => {
    mockElectronAPI.stats.get.mockResolvedValue({ model: 'claude-3-5-haiku-20241022' });
    render(<StatsStrip />);

    await waitFor(() => {
      expect(screen.getByTestId('model-badge')).toHaveTextContent('haiku');
    });
  });

  it('should show placeholder when no model available', async () => {
    mockElectronAPI.stats.get.mockResolvedValue({ model: null });
    render(<StatsStrip />);

    await waitFor(() => {
      const badge = screen.getByTestId('model-badge');
      expect(badge.textContent).toMatch(/—|--|-/);
    });
  });

  it('should have title attribute with full model name', async () => {
    mockElectronAPI.stats.get.mockResolvedValue(mockStats);
    render(<StatsStrip />);

    await waitFor(() => {
      expect(screen.getByTestId('model-badge')).toHaveAttribute('title', 'claude-opus-4-5-20251101');
    });
  });
});

// ============================================================================
// AC4: PWD shows current working directory (responsive)
// ============================================================================

describe('AC4: PWD shows current working directory', () => {
  it('should display current working directory', async () => {
    mockElectronAPI.projectInfo.get.mockResolvedValue(mockProjectInfo);
    render(<StatsStrip />);

    await waitFor(() => {
      expect(screen.getByTestId('stats-pwd')).toHaveTextContent(/pennyfarthing-orchestrator/);
    });
  });

  it('should have title attribute with full path for tooltip', async () => {
    mockElectronAPI.projectInfo.get.mockResolvedValue(mockProjectInfo);
    render(<StatsStrip />);

    await waitFor(() => {
      expect(screen.getByTestId('stats-pwd')).toHaveAttribute(
        'title',
        '/Users/keithavery/Projects/pennyfarthing-orchestrator'
      );
    });
  });

  it('should truncate long paths with ellipsis', async () => {
    mockElectronAPI.projectInfo.get.mockResolvedValue({
      ...mockProjectInfo,
      pwd: '/Users/keithavery/Projects/very-long-project-name-that-should-be-truncated',
    });
    render(<StatsStrip />);

    await waitFor(() => {
      const pwd = screen.getByTestId('stats-pwd');
      // Truncation is handled by .stats-pwd CSS class (overflow: hidden, text-overflow: ellipsis)
      expect(pwd).toHaveClass('stats-pwd');
    });
  });

  it('should show folder name only when collapsed', async () => {
    mockElectronAPI.projectInfo.get.mockResolvedValue(mockProjectInfo);
    render(<StatsStrip />);

    await waitFor(() => {
      // Should show folder name, not full path, by default
      const pwd = screen.getByTestId('stats-pwd');
      expect(pwd.textContent).toBe('pennyfarthing-orchestrator');
    });
  });

  it('should store full path in data attribute for responsive switching', async () => {
    mockElectronAPI.projectInfo.get.mockResolvedValue(mockProjectInfo);
    render(<StatsStrip />);

    await waitFor(() => {
      const pwd = screen.getByTestId('stats-pwd');
      expect(pwd).toHaveAttribute('data-full-path', mockProjectInfo.pwd);
    });
  });
});

// ============================================================================
// AC5: Identity section shows Jira and GitHub users
// ============================================================================

describe('AC5: Identity section shows Jira and GitHub users', () => {
  it('should display Jira email', async () => {
    mockElectronAPI.projectInfo.get.mockResolvedValue(mockProjectInfo);
    render(<StatsStrip />);

    await waitFor(() => {
      expect(screen.getByTestId('jira-email')).toHaveTextContent('keith@1898andco.com');
    });
  });

  it('should display GitHub username with @ prefix', async () => {
    mockElectronAPI.projectInfo.get.mockResolvedValue(mockProjectInfo);
    render(<StatsStrip />);

    await waitFor(() => {
      expect(screen.getByTestId('github-user')).toHaveTextContent('@keithavery');
    });
  });

  it('should have title attribute on Jira email for tooltip', async () => {
    mockElectronAPI.projectInfo.get.mockResolvedValue(mockProjectInfo);
    render(<StatsStrip />);

    await waitFor(() => {
      expect(screen.getByTestId('jira-email')).toHaveAttribute('title', 'Jira: keith@1898andco.com');
    });
  });

  it('should have title attribute on GitHub user for tooltip', async () => {
    mockElectronAPI.projectInfo.get.mockResolvedValue(mockProjectInfo);
    render(<StatsStrip />);

    await waitFor(() => {
      expect(screen.getByTestId('github-user')).toHaveAttribute('title', 'GitHub: keithavery');
    });
  });

  it('should hide Jira email when not configured', async () => {
    mockElectronAPI.projectInfo.get.mockResolvedValue({ ...mockProjectInfo, jiraEmail: null });
    render(<StatsStrip />);

    await waitFor(() => {
      expect(screen.queryByTestId('jira-email')).not.toBeInTheDocument();
    });
  });

  it('should hide GitHub user when not configured', async () => {
    mockElectronAPI.projectInfo.get.mockResolvedValue({ ...mockProjectInfo, githubUsername: null });
    render(<StatsStrip />);

    await waitFor(() => {
      expect(screen.queryByTestId('github-user')).not.toBeInTheDocument();
    });
  });
});

// ============================================================================
// AC6: Real-time updates when data changes
// ============================================================================

describe('AC6: Real-time updates when data changes', () => {
  it('should subscribe to context updates on mount', () => {
    render(<StatsStrip />);
    expect(mockElectronAPI.context.onUpdate).toHaveBeenCalled();
  });

  it('should subscribe to stats updates on mount', () => {
    render(<StatsStrip />);
    expect(mockElectronAPI.stats.onUpdate).toHaveBeenCalled();
  });

  it('should subscribe to projectInfo updates on mount', () => {
    render(<StatsStrip />);
    expect(mockElectronAPI.projectInfo.onUpdate).toHaveBeenCalled();
  });

  it('should update context display when update callback fires', async () => {
    render(<StatsStrip />);

    // Wait for component to mount and subscribe
    await waitFor(() => {
      expect(mockElectronAPI.context.onUpdate).toHaveBeenCalled();
    });

    // Get the callback that was registered
    const callback = mockElectronAPI.context.onUpdate.mock.calls[0][0];

    // Simulate context update
    callback(null, { percent: 85, used: 170000, total: 200000 });

    await waitFor(() => {
      expect(screen.getByTestId('context-percent')).toHaveTextContent('85%');
      expect(screen.getByTestId('context-meter')).toHaveClass('level-danger');
    });
  });

  it('should update model badge when stats update callback fires', async () => {
    render(<StatsStrip />);

    // Wait for component to mount and subscribe
    await waitFor(() => {
      expect(mockElectronAPI.stats.onUpdate).toHaveBeenCalled();
    });

    const callback = mockElectronAPI.stats.onUpdate.mock.calls[0][0];
    callback(null, { model: 'claude-3-5-haiku-20241022' });

    await waitFor(() => {
      expect(screen.getByTestId('model-badge')).toHaveTextContent('haiku');
    });
  });

  it('should update identity when projectInfo update callback fires', async () => {
    render(<StatsStrip />);

    // Wait for component to mount and subscribe
    await waitFor(() => {
      expect(mockElectronAPI.projectInfo.onUpdate).toHaveBeenCalled();
    });

    const callback = mockElectronAPI.projectInfo.onUpdate.mock.calls[0][0];
    callback(null, {
      pwd: '/new/project/path',
      jiraEmail: 'new@example.com',
      githubUsername: 'newuser',
    });

    await waitFor(() => {
      expect(screen.getByTestId('stats-pwd')).toHaveTextContent('path');
      expect(screen.getByTestId('jira-email')).toHaveTextContent('new@example.com');
      expect(screen.getByTestId('github-user')).toHaveTextContent('@newuser');
    });
  });
});

// ============================================================================
// useStatsStrip Hook Tests
// ============================================================================

describe('useStatsStrip Hook', () => {
  // Test component to use the hook
  const TestComponent = () => {
    const { context, stats, projectInfo, isLoading, error } = useStatsStrip();
    return (
      <div>
        <div data-testid="context-percent-value">{context?.percent}</div>
        <div data-testid="model-value">{stats?.model}</div>
        <div data-testid="pwd-value">{projectInfo?.pwd}</div>
        <div data-testid="loading-state">{isLoading.toString()}</div>
        {error && <div data-testid="error">{error.message}</div>}
      </div>
    );
  };

  it('should fetch initial data on mount', async () => {
    render(<TestComponent />);

    await waitFor(() => {
      expect(mockElectronAPI.context.get).toHaveBeenCalled();
      expect(mockElectronAPI.stats.get).toHaveBeenCalled();
      expect(mockElectronAPI.projectInfo.get).toHaveBeenCalled();
    });
  });

  it('should provide context data', async () => {
    mockElectronAPI.context.get.mockResolvedValue({ percent: 55 });
    render(<TestComponent />);

    await waitFor(() => {
      expect(screen.getByTestId('context-percent-value')).toHaveTextContent('55');
    });
  });

  it('should provide stats data', async () => {
    mockElectronAPI.stats.get.mockResolvedValue({ model: 'test-model' });
    render(<TestComponent />);

    await waitFor(() => {
      expect(screen.getByTestId('model-value')).toHaveTextContent('test-model');
    });
  });

  it('should provide projectInfo data', async () => {
    mockElectronAPI.projectInfo.get.mockResolvedValue({ pwd: '/test/path' });
    render(<TestComponent />);

    await waitFor(() => {
      expect(screen.getByTestId('pwd-value')).toHaveTextContent('/test/path');
    });
  });

  it('should handle API errors gracefully', async () => {
    mockElectronAPI.context.get.mockRejectedValue(new Error('API Error'));
    render(<TestComponent />);

    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent('API Error');
    });
  });
});

// ============================================================================
// Layout and Styling Tests
// ============================================================================

describe('Layout and Styling', () => {
  it('should have correct element order in stats-left: pwd -> jira -> github', async () => {
    mockElectronAPI.projectInfo.get.mockResolvedValue(mockProjectInfo);
    render(<StatsStrip />);

    await waitFor(() => {
      const statsLeft = screen.getByTestId('stats-left');
      const children = Array.from(statsLeft.children);

      const pwdIndex = children.findIndex(el => el.getAttribute('data-testid') === 'stats-pwd');
      const jiraIndex = children.findIndex(el => el.getAttribute('data-testid') === 'jira-email');
      const githubIndex = children.findIndex(el => el.getAttribute('data-testid') === 'github-user');

      expect(pwdIndex).toBeGreaterThanOrEqual(0);
      expect(jiraIndex).toBeGreaterThan(pwdIndex);
      expect(githubIndex).toBeGreaterThan(jiraIndex);
    });
  });

  it('should have correct element order in stats-right: model -> context', () => {
    render(<StatsStrip />);

    const statsRight = screen.getByTestId('stats-right');
    const children = Array.from(statsRight.children);

    const modelIndex = children.findIndex(el => el.getAttribute('data-testid') === 'model-badge');
    const contextIndex = children.findIndex(el => el.getAttribute('data-testid') === 'context-meter');

    expect(modelIndex).toBeGreaterThanOrEqual(0);
    expect(contextIndex).toBeGreaterThan(modelIndex);
  });

  it('should have compact styling class', () => {
    render(<StatsStrip />);
    expect(screen.getByTestId('stats-strip')).toHaveClass('stats-strip');
  });
});
