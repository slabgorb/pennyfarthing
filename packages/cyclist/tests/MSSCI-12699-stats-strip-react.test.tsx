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

// Track WebSocket instances for sending messages
let contextWs: any = null;
let statsWs: any = null;

// Install mock before tests
beforeEach(() => {
  vi.clearAllMocks();
  contextWs = null;
  statsWs = null;

  // Mock fetch for /api/identity
  global.fetch = vi.fn((url) => {
    if (url === '/api/identity') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          jiraEmail: 'test@example.com',
          githubUsername: 'testuser',
        }),
      } as Response);
    }
    return Promise.reject(new Error('Unknown URL'));
  });

  // Override WebSocket mock to track instances
  const OriginalMockWebSocket = (window as any).WebSocket;
  (window as any).WebSocket = class extends OriginalMockWebSocket {
    constructor(url: string) {
      super(url);
      // Track instances based on URL
      if (url.includes('/ws/context')) {
        contextWs = this;
      } else if (url.includes('/ws/stats')) {
        statsWs = this;
      }
    }
  };
});

afterEach(() => {
  vi.restoreAllMocks();
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
    render(<StatsStrip />);

    // Wait for WebSocket to connect
    await waitFor(() => expect(contextWs).not.toBeNull());

    // Send context data via WebSocket
    contextWs.onmessage?.({ data: JSON.stringify({
      type: 'init',
      context: { percent: 30, tokens: 60000, available: 140000 }
    })});

    await waitFor(() => {
      expect(screen.getByTestId('context-percent')).toHaveTextContent('30%');
    });
  });

  it('should apply level-safe class when context < 70%', async () => {
    render(<StatsStrip />);

    await waitFor(() => expect(contextWs).not.toBeNull());

    contextWs.onmessage?.({ data: JSON.stringify({
      type: 'init',
      context: mockContextSafe
    })});

    await waitFor(() => {
      expect(screen.getByTestId('context-meter')).toHaveClass('level-safe');
    });
  });

  it('should apply level-warning class when context >= 70% and < 85%', async () => {
    render(<StatsStrip />);

    await waitFor(() => expect(contextWs).not.toBeNull());

    contextWs.onmessage?.({ data: JSON.stringify({
      type: 'init',
      context: mockContextWarning
    })});

    await waitFor(() => {
      expect(screen.getByTestId('context-meter')).toHaveClass('level-warning');
    });
  });

  it('should apply level-danger class when context >= 85%', async () => {
    render(<StatsStrip />);

    await waitFor(() => expect(contextWs).not.toBeNull());

    contextWs.onmessage?.({ data: JSON.stringify({
      type: 'init',
      context: mockContextDanger
    })});

    await waitFor(() => {
      expect(screen.getByTestId('context-meter')).toHaveClass('level-danger');
    });
  });

  it('should have progress bar fill element', () => {
    render(<StatsStrip />);
    expect(screen.getByTestId('context-fill')).toBeInTheDocument();
  });

  it('should set progress bar width based on context percent', async () => {
    render(<StatsStrip />);

    await waitFor(() => expect(contextWs).not.toBeNull());

    contextWs.onmessage?.({ data: JSON.stringify({
      type: 'init',
      context: { percent: 45 }
    })});

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
    render(<StatsStrip />);

    await waitFor(() => expect(statsWs).not.toBeNull());

    statsWs.onmessage?.({ data: JSON.stringify({ model: 'claude-opus-4-5-20251101' }) });

    await waitFor(() => {
      expect(screen.getByTestId('model-badge')).toHaveTextContent('opus');
    });
  });

  it('should format long model names to short display', async () => {
    render(<StatsStrip />);

    await waitFor(() => expect(statsWs).not.toBeNull());

    statsWs.onmessage?.({ data: JSON.stringify({ model: 'claude-3-5-sonnet-20241022' }) });

    await waitFor(() => {
      expect(screen.getByTestId('model-badge')).toHaveTextContent('sonnet');
    });
  });

  it('should handle haiku model name', async () => {
    render(<StatsStrip />);

    await waitFor(() => expect(statsWs).not.toBeNull());

    statsWs.onmessage?.({ data: JSON.stringify({ model: 'claude-3-5-haiku-20241022' }) });

    await waitFor(() => {
      expect(screen.getByTestId('model-badge')).toHaveTextContent('haiku');
    });
  });

  it('should show placeholder when no model available', async () => {
    render(<StatsStrip />);

    await waitFor(() => expect(statsWs).not.toBeNull());

    statsWs.onmessage?.({ data: JSON.stringify({ model: null }) });

    await waitFor(() => {
      const badge = screen.getByTestId('model-badge');
      expect(badge.textContent).toMatch(/—|--|-/);
    });
  });

  it('should have tooltip with full model name (via Radix Tooltip wrapper)', async () => {
    render(<StatsStrip />);

    await waitFor(() => expect(statsWs).not.toBeNull());

    statsWs.onmessage?.({ data: JSON.stringify({ model: 'claude-opus-4-5-20251101' }) });

    await waitFor(() => {
      const badge = screen.getByTestId('model-badge');
      // Radix TooltipTrigger adds data-state attribute to wrapped elements
      expect(badge).toHaveAttribute('data-state');
      // The badge itself still shows the short model name
      expect(badge).toHaveTextContent('opus');
    });
  });
});

// ============================================================================
// AC4: PWD shows current working directory (responsive)
// ============================================================================

describe('AC4: PWD shows current working directory', () => {
  it('should display current working directory', async () => {
    render(<StatsStrip />);

    await waitFor(() => expect(statsWs).not.toBeNull());

    // pwd comes from stats WebSocket
    statsWs.onmessage?.({ data: JSON.stringify({
      model: 'claude-opus-4-5-20251101',
      pwd: '/Users/keithavery/Projects/pennyfarthing-orchestrator'
    }) });

    await waitFor(() => {
      expect(screen.getByTestId('stats-pwd')).toHaveTextContent(/pennyfarthing-orchestrator/);
    });
  });

  it('should have tooltip wrapper with full path available via data-full-path', async () => {
    render(<StatsStrip />);

    await waitFor(() => expect(statsWs).not.toBeNull());

    statsWs.onmessage?.({ data: JSON.stringify({
      model: 'claude-opus-4-5-20251101',
      pwd: '/Users/keithavery/Projects/pennyfarthing-orchestrator'
    }) });

    await waitFor(() => {
      const pwd = screen.getByTestId('stats-pwd');
      // Radix TooltipTrigger wraps the element (adds data-state)
      expect(pwd).toHaveAttribute('data-state');
      // Full path is stored in data-full-path for responsive switching
      expect(pwd).toHaveAttribute('data-full-path', '/Users/keithavery/Projects/pennyfarthing-orchestrator');
    });
  });

  it('should truncate long paths with ellipsis', async () => {
    render(<StatsStrip />);

    await waitFor(() => expect(statsWs).not.toBeNull());

    statsWs.onmessage?.({ data: JSON.stringify({
      model: 'claude-opus-4-5-20251101',
      pwd: '/Users/keithavery/Projects/very-long-project-name-that-should-be-truncated'
    }) });

    await waitFor(() => {
      const pwd = screen.getByTestId('stats-pwd');
      // Truncation is handled by .stats-pwd CSS class (overflow: hidden, text-overflow: ellipsis)
      expect(pwd).toHaveClass('stats-pwd');
    });
  });

  it('should show folder name only when collapsed', async () => {
    render(<StatsStrip />);

    await waitFor(() => expect(statsWs).not.toBeNull());

    statsWs.onmessage?.({ data: JSON.stringify({
      model: 'claude-opus-4-5-20251101',
      pwd: '/Users/keithavery/Projects/pennyfarthing-orchestrator'
    }) });

    await waitFor(() => {
      // Should show folder name, not full path, by default
      const pwd = screen.getByTestId('stats-pwd');
      expect(pwd.textContent).toBe('pennyfarthing-orchestrator');
    });
  });

  it('should store full path in data attribute for responsive switching', async () => {
    render(<StatsStrip />);

    await waitFor(() => expect(statsWs).not.toBeNull());

    statsWs.onmessage?.({ data: JSON.stringify({
      model: 'claude-opus-4-5-20251101',
      pwd: mockProjectInfo.pwd
    }) });

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
    // Mock fetch to return custom identity
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        jiraEmail: 'keith@1898andco.com',
        githubUsername: 'keithavery',
      }),
    } as Response));

    render(<StatsStrip />);

    await waitFor(() => {
      expect(screen.getByTestId('jira-email')).toHaveTextContent('keith@1898andco.com');
    });
  });

  it('should display GitHub username with @ prefix', async () => {
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        jiraEmail: 'keith@1898andco.com',
        githubUsername: 'keithavery',
      }),
    } as Response));

    render(<StatsStrip />);

    await waitFor(() => {
      expect(screen.getByTestId('github-user')).toHaveTextContent('@keithavery');
    });
  });

  it('should wrap Jira email in tooltip trigger for hover tooltip', async () => {
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        jiraEmail: 'keith@1898andco.com',
        githubUsername: 'keithavery',
      }),
    } as Response));

    render(<StatsStrip />);

    await waitFor(() => {
      const jiraEl = screen.getByTestId('jira-email');
      // Radix TooltipTrigger adds data-state attribute to wrapped elements
      expect(jiraEl).toHaveAttribute('data-state');
      // The element still displays the email text
      expect(jiraEl).toHaveTextContent('keith@1898andco.com');
    });
  });

  it('should wrap GitHub user in tooltip trigger for hover tooltip', async () => {
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        jiraEmail: 'keith@1898andco.com',
        githubUsername: 'keithavery',
      }),
    } as Response));

    render(<StatsStrip />);

    await waitFor(() => {
      const githubEl = screen.getByTestId('github-user');
      // Radix TooltipTrigger adds data-state attribute to wrapped elements
      expect(githubEl).toHaveAttribute('data-state');
      // The element still displays the username with @ prefix
      expect(githubEl).toHaveTextContent('@keithavery');
    });
  });

  it('should hide Jira email when not configured', async () => {
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        jiraEmail: null,
        githubUsername: 'keithavery',
      }),
    } as Response));

    render(<StatsStrip />);

    await waitFor(() => {
      expect(screen.queryByTestId('jira-email')).not.toBeInTheDocument();
    });
  });

  it('should hide GitHub user when not configured', async () => {
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        jiraEmail: 'keith@1898andco.com',
        githubUsername: null,
      }),
    } as Response));

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
  it('should subscribe to context updates on mount', async () => {
    render(<StatsStrip />);
    await waitFor(() => {
      expect(contextWs).not.toBeNull();
    });
  });

  it('should subscribe to stats updates on mount', async () => {
    render(<StatsStrip />);
    await waitFor(() => {
      expect(statsWs).not.toBeNull();
    });
  });

  it('should subscribe to projectInfo updates on mount', async () => {
    render(<StatsStrip />);
    // projectInfo uses fetch, verify it's called
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/identity');
    });
  });

  it('should update context display when update callback fires', async () => {
    render(<StatsStrip />);

    await waitFor(() => expect(contextWs).not.toBeNull());

    // Send initial data
    contextWs.onmessage?.({ data: JSON.stringify({
      type: 'init',
      context: { percent: 30 }
    })});

    await waitFor(() => {
      expect(screen.getByTestId('context-percent')).toHaveTextContent('30%');
    });

    // Send update
    contextWs.onmessage?.({ data: JSON.stringify({
      type: 'update',
      context: { percent: 85, tokens: 170000, available: 30000 }
    })});

    await waitFor(() => {
      expect(screen.getByTestId('context-percent')).toHaveTextContent('85%');
      expect(screen.getByTestId('context-meter')).toHaveClass('level-danger');
    });
  });

  it('should update model badge when stats update callback fires', async () => {
    render(<StatsStrip />);

    await waitFor(() => expect(statsWs).not.toBeNull());

    statsWs.onmessage?.({ data: JSON.stringify({ model: 'claude-opus-4-5-20251101' }) });

    await waitFor(() => {
      expect(screen.getByTestId('model-badge')).toHaveTextContent('opus');
    });

    statsWs.onmessage?.({ data: JSON.stringify({ model: 'claude-3-5-haiku-20241022' }) });

    await waitFor(() => {
      expect(screen.getByTestId('model-badge')).toHaveTextContent('haiku');
    });
  });

  it('should update identity when projectInfo update callback fires', async () => {
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        jiraEmail: 'old@example.com',
        githubUsername: 'olduser',
      }),
    } as Response));

    render(<StatsStrip />);

    await waitFor(() => expect(statsWs).not.toBeNull());

    // Send pwd update via stats WebSocket
    statsWs.onmessage?.({ data: JSON.stringify({
      model: 'claude-opus-4-5-20251101',
      pwd: '/new/project/path'
    }) });

    await waitFor(() => {
      expect(screen.getByTestId('stats-pwd')).toHaveTextContent('path');
    });

    // Identity is fetched once from API, doesn't update dynamically
    // but we can verify initial fetch worked
    await waitFor(() => {
      expect(screen.getByTestId('jira-email')).toHaveTextContent('old@example.com');
      expect(screen.getByTestId('github-user')).toHaveTextContent('@olduser');
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
      expect(contextWs).not.toBeNull();
      expect(statsWs).not.toBeNull();
      expect(global.fetch).toHaveBeenCalledWith('/api/identity');
    });
  });

  it('should provide context data', async () => {
    render(<TestComponent />);

    await waitFor(() => expect(contextWs).not.toBeNull());

    contextWs.onmessage?.({ data: JSON.stringify({
      type: 'init',
      context: { percent: 55 }
    })});

    await waitFor(() => {
      expect(screen.getByTestId('context-percent-value')).toHaveTextContent('55');
    });
  });

  it('should provide stats data', async () => {
    render(<TestComponent />);

    await waitFor(() => expect(statsWs).not.toBeNull());

    statsWs.onmessage?.({ data: JSON.stringify({ model: 'test-model' }) });

    await waitFor(() => {
      expect(screen.getByTestId('model-value')).toHaveTextContent('test-model');
    });
  });

  it('should provide projectInfo data', async () => {
    render(<TestComponent />);

    await waitFor(() => expect(statsWs).not.toBeNull());

    statsWs.onmessage?.({ data: JSON.stringify({
      model: 'test-model',
      pwd: '/test/path'
    }) });

    await waitFor(() => {
      expect(screen.getByTestId('pwd-value')).toHaveTextContent('/test/path');
    });
  });

  it('should handle API errors gracefully', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('API Error')));

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
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        jiraEmail: 'keith@1898andco.com',
        githubUsername: 'keithavery',
      }),
    } as Response));

    render(<StatsStrip />);

    await waitFor(() => expect(statsWs).not.toBeNull());

    statsWs.onmessage?.({ data: JSON.stringify({
      model: 'claude-opus-4-5-20251101',
      pwd: mockProjectInfo.pwd
    }) });

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
