/**
 * MSSCI-12782: Debug Panel Formatting and Missing OTEL Data Tests
 *
 * Tests for the Debug panel bug fix covering two issues:
 * 1. Poor formatting - TOKEN STATS shows raw JSON blob instead of
 *    nicely formatted statistics. Should display as readable cards.
 * 2. Missing OTEL data - Debug panel was designed to show OTEL
 *    telemetry (tool calls, spans, timing) but only shows basic
 *    context usage stats.
 *
 * Acceptance Criteria:
 * - AC1: Token stats formatted as readable UI (cards/table, not raw JSON)
 * - AC2: OTEL spans/traces displayed (tool invocations, durations)
 * - AC3: Hierarchical view of agent activity (grouped tool calls)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';

// =============================================================================
// AC1: Token stats formatted as readable UI (not raw JSON)
// =============================================================================

describe('MSSCI-12782: AC1 - Token stats formatting', () => {

  const mockElectronAPI = {
    context: {
      get: vi.fn(),
      onUpdate: vi.fn(),
    },
    tokenStats: {
      get: vi.fn(),
      onUpdate: vi.fn(),
    },
    auditLog: {
      getEntries: vi.fn(),
      getTypes: vi.fn(),
      getStats: vi.fn(),
      clear: vi.fn(),
      export: vi.fn(),
      onEntry: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mockElectronAPI.context.get.mockResolvedValue({ percent: 25 });
    mockElectronAPI.auditLog.getEntries.mockResolvedValue([]);
    mockElectronAPI.auditLog.getStats.mockResolvedValue({
      total: 0, byType: {}, successCount: 0, errorCount: 0
    });
    (window as unknown as { electronAPI: typeof mockElectronAPI }).electronAPI = mockElectronAPI;
  });

  it('should render token stats as formatted cards, not raw JSON', async () => {
    mockElectronAPI.tokenStats.get.mockResolvedValue({
      inputTokens: 12500,
      outputTokens: 3200,
      cacheReadTokens: 8000,
      cacheCreationTokens: 1500,
      totalCostUsd: 0.0523,
    });

    const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
    render(React.createElement(DebugPanel));

    // Wait for token stats to load (async)
    await vi.waitFor(() => {
      expect(screen.getByTestId('token-stat-input')).toBeInTheDocument();
    });

    // Should NOT contain raw JSON-like content (no curly braces with key-value pairs)
    const debugPanel = screen.getByTestId('debug-panel');
    expect(debugPanel.textContent).not.toMatch(/\{\s*"inputTokens"/);
    expect(debugPanel.textContent).not.toMatch(/\{\s*"outputTokens"/);

    // Should contain formatted values (with commas for thousands)
    expect(debugPanel.textContent).toContain('12,500');
    expect(debugPanel.textContent).toContain('3,200');
  });

  it('should render each token type as a labeled stat card', async () => {
    mockElectronAPI.tokenStats.get.mockResolvedValue({
      inputTokens: 12500,
      outputTokens: 3200,
      cacheReadTokens: 8000,
      cacheCreationTokens: 1500,
    });

    const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
    render(React.createElement(DebugPanel));

    // Wait for token stats to load (async)
    await vi.waitFor(() => {
      expect(screen.getByTestId('token-stat-input')).toBeInTheDocument();
    });

    // Each stat should have a clear label
    expect(screen.getByText(/Input/i)).toBeInTheDocument();
    expect(screen.getByText(/Output/i)).toBeInTheDocument();
    expect(screen.getByText(/Cache Read/i)).toBeInTheDocument();
    expect(screen.getByText(/Cache Write/i)).toBeInTheDocument();
  });

  it('should render token stat cards with data-testid for each type', async () => {
    mockElectronAPI.tokenStats.get.mockResolvedValue({
      inputTokens: 12500,
      outputTokens: 3200,
      cacheReadTokens: 8000,
      cacheCreationTokens: 1500,
    });

    const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
    render(React.createElement(DebugPanel));

    // Wait for token stats to load (async)
    await vi.waitFor(() => {
      expect(screen.getByTestId('token-stat-input')).toBeInTheDocument();
    });

    // Each stat should have a testable element
    expect(screen.getByTestId('token-stat-output')).toBeInTheDocument();
    expect(screen.getByTestId('token-stat-cache-read')).toBeInTheDocument();
    expect(screen.getByTestId('token-stat-cache-write')).toBeInTheDocument();
  });

  it('should format cost with dollar sign and proper decimals', async () => {
    mockElectronAPI.tokenStats.get.mockResolvedValue({
      inputTokens: 12500,
      outputTokens: 3200,
      totalCostUsd: 0.0523,
    });

    const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
    render(React.createElement(DebugPanel));

    // Wait for token stats to load (async)
    await vi.waitFor(() => {
      expect(screen.getByTestId('token-stat-input')).toBeInTheDocument();
    });

    // Cost should be formatted as currency
    expect(screen.getByText(/\$0\.0523/)).toBeInTheDocument();
  });

  it('should hide zero-value stats gracefully', async () => {
    mockElectronAPI.tokenStats.get.mockResolvedValue({
      inputTokens: 12500,
      outputTokens: 0,  // Zero output
      cacheReadTokens: 8000,
      cacheCreationTokens: 0,  // Zero cache creation
    });

    const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
    render(React.createElement(DebugPanel));

    // Wait for token stats to load (async)
    await vi.waitFor(() => {
      expect(screen.getByTestId('token-stat-input')).toBeInTheDocument();
    });

    // Should show Input and Cache Read (non-zero)
    expect(screen.getByText(/Input/i)).toBeInTheDocument();
    expect(screen.getByText(/Cache Read/i)).toBeInTheDocument();

    // Output and Cache Write should either be hidden or show 0 gracefully
    // Not showing raw "outputTokens": 0 JSON
    const debugPanel = screen.getByTestId('debug-panel');
    expect(debugPanel.textContent).not.toMatch(/"outputTokens":\s*0/);
  });

});

// =============================================================================
// AC2: OTEL spans/traces displayed (tool invocations, durations)
// =============================================================================

describe('MSSCI-12782: AC2 - OTEL spans display', () => {

  const mockElectronAPI = {
    context: {
      get: vi.fn(),
      onUpdate: vi.fn(),
    },
    tokenStats: {
      get: vi.fn(),
      onUpdate: vi.fn(),
    },
    auditLog: {
      getEntries: vi.fn(),
      getTypes: vi.fn(),
      getStats: vi.fn(),
      clear: vi.fn(),
      export: vi.fn(),
      onEntry: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mockElectronAPI.context.get.mockResolvedValue({ percent: 25 });
    mockElectronAPI.tokenStats.get.mockResolvedValue({});
    (window as unknown as { electronAPI: typeof mockElectronAPI }).electronAPI = mockElectronAPI;
  });

  it('should render OTEL spans section in debug panel', async () => {
    mockElectronAPI.auditLog.getEntries.mockResolvedValue([
      {
        toolName: 'Read',
        input: '/path/to/file.ts',
        durationMs: 45,
        success: true,
        timestamp: Date.now() - 5000,
      },
    ]);
    mockElectronAPI.auditLog.getStats.mockResolvedValue({
      total: 1, byType: { Read: 1 }, successCount: 1, errorCount: 0
    });

    const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
    render(React.createElement(DebugPanel));

    await vi.waitFor(() => {
      expect(screen.getByTestId('otel-spans-section')).toBeInTheDocument();
    });
  });

  it('should display tool name for each span', async () => {
    mockElectronAPI.auditLog.getEntries.mockResolvedValue([
      {
        toolName: 'Read',
        input: '/path/to/file.ts',
        durationMs: 45,
        success: true,
        timestamp: Date.now() - 5000,
      },
      {
        toolName: 'Bash',
        input: 'npm test',
        durationMs: 1250,
        success: true,
        timestamp: Date.now() - 3000,
      },
    ]);
    mockElectronAPI.auditLog.getStats.mockResolvedValue({
      total: 2, byType: { Read: 1, Bash: 1 }, successCount: 2, errorCount: 0
    });

    const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
    render(React.createElement(DebugPanel));

    // Wait for spans to load (async)
    await vi.waitFor(() => {
      expect(screen.getByTestId('tool-group-Read')).toBeInTheDocument();
    });

    // Should show both tool names
    expect(screen.getByText('Read')).toBeInTheDocument();
    expect(screen.getByText('Bash')).toBeInTheDocument();
  });

  it('should display duration for each span', async () => {
    mockElectronAPI.auditLog.getEntries.mockResolvedValue([
      {
        toolName: 'Read',
        input: '/path/to/file.ts',
        durationMs: 45,
        success: true,
        timestamp: Date.now(),
      },
      {
        toolName: 'Bash',
        input: 'npm test',
        durationMs: 1250,
        success: true,
        timestamp: Date.now(),
      },
    ]);
    mockElectronAPI.auditLog.getStats.mockResolvedValue({
      total: 2, byType: { Read: 1, Bash: 1 }, successCount: 2, errorCount: 0
    });

    const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
    render(React.createElement(DebugPanel));

    // Wait for spans to load (async)
    await vi.waitFor(() => {
      expect(screen.getByTestId('tool-group-Read')).toBeInTheDocument();
    });

    // Should show durations (formatted) - use getAllByText since duration appears in header and items
    expect(screen.getAllByText(/45\s*ms/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1\.25\s*s/).length).toBeGreaterThan(0);
  });

  it('should show success/error status for each span', async () => {
    mockElectronAPI.auditLog.getEntries.mockResolvedValue([
      {
        toolName: 'Read',
        input: '/path/to/file.ts',
        durationMs: 45,
        success: true,
        timestamp: Date.now(),
      },
      {
        toolName: 'Bash',
        input: 'exit 1',
        durationMs: 100,
        success: false,
        error: 'Command failed',
        timestamp: Date.now(),
      },
    ]);
    mockElectronAPI.auditLog.getStats.mockResolvedValue({
      total: 2, byType: { Read: 1, Bash: 1 }, successCount: 1, errorCount: 1
    });

    const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
    render(React.createElement(DebugPanel));

    // Wait for spans to load (async)
    await vi.waitFor(() => {
      expect(screen.getByTestId('tool-group-Read')).toBeInTheDocument();
    });

    // Should have visual indicators for success/error
    // (these are in the collapsed view, need to expand to see all)
    expect(screen.getByTestId('span-status-success')).toBeInTheDocument();
    expect(screen.getByTestId('span-status-error')).toBeInTheDocument();
  });

  it('should show span input summary (truncated if long)', async () => {
    mockElectronAPI.auditLog.getEntries.mockResolvedValue([
      {
        toolName: 'Read',
        input: '/very/long/path/to/some/deeply/nested/directory/structure/file.ts',
        durationMs: 45,
        success: true,
        timestamp: Date.now(),
      },
    ]);
    mockElectronAPI.auditLog.getStats.mockResolvedValue({
      total: 1, byType: { Read: 1 }, successCount: 1, errorCount: 0
    });

    const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
    render(React.createElement(DebugPanel));

    // Wait for spans to load (async)
    await vi.waitFor(() => {
      expect(screen.getByTestId('tool-group-Read')).toBeInTheDocument();
    });

    // Should show file path (possibly truncated with ellipsis)
    const spanInput = screen.getByTestId('span-input-0');
    expect(spanInput.textContent).toContain('file.ts');
  });

  it('should subscribe to new spans via onEntry callback', async () => {
    let entryCallback: ((entry: unknown) => void) | null = null;

    mockElectronAPI.auditLog.getEntries.mockResolvedValue([]);
    mockElectronAPI.auditLog.getStats.mockResolvedValue({
      total: 0, byType: {}, successCount: 0, errorCount: 0
    });
    mockElectronAPI.auditLog.onEntry.mockImplementation((cb: (entry: unknown) => void) => {
      entryCallback = cb;
    });

    const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
    render(React.createElement(DebugPanel));

    await vi.waitFor(() => {
      expect(screen.getByTestId('otel-spans-section')).toBeInTheDocument();
    });

    // Initially no spans
    expect(screen.queryByText('Read')).not.toBeInTheDocument();

    // Simulate new span arriving
    if (entryCallback) {
      entryCallback({
        toolName: 'Read',
        input: '/new/file.ts',
        durationMs: 30,
        success: true,
        timestamp: Date.now(),
      });
    }

    // Should now show the new span
    await vi.waitFor(() => {
      expect(screen.getByText('Read')).toBeInTheDocument();
    });
  });

  it('should show span count in section header', async () => {
    mockElectronAPI.auditLog.getEntries.mockResolvedValue([
      { toolName: 'Read', durationMs: 45, success: true, timestamp: Date.now() },
      { toolName: 'Bash', durationMs: 100, success: true, timestamp: Date.now() },
      { toolName: 'Edit', durationMs: 30, success: true, timestamp: Date.now() },
    ]);
    mockElectronAPI.auditLog.getStats.mockResolvedValue({
      total: 3, byType: { Read: 1, Bash: 1, Edit: 1 }, successCount: 3, errorCount: 0
    });

    const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
    render(React.createElement(DebugPanel));

    // Wait for spans to load (async)
    await vi.waitFor(() => {
      expect(screen.getByTestId('tool-group-Read')).toBeInTheDocument();
    });

    // Should show count in header
    expect(screen.getByText(/3\s*(spans|tool calls)/i)).toBeInTheDocument();
  });

});

// =============================================================================
// AC3: Hierarchical view of agent activity
// =============================================================================

describe('MSSCI-12782: AC3 - Hierarchical activity view', () => {

  const mockElectronAPI = {
    context: {
      get: vi.fn(),
      onUpdate: vi.fn(),
    },
    tokenStats: {
      get: vi.fn(),
      onUpdate: vi.fn(),
    },
    auditLog: {
      getEntries: vi.fn(),
      getTypes: vi.fn(),
      getStats: vi.fn(),
      clear: vi.fn(),
      export: vi.fn(),
      onEntry: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mockElectronAPI.context.get.mockResolvedValue({ percent: 25 });
    mockElectronAPI.tokenStats.get.mockResolvedValue({});
    (window as unknown as { electronAPI: typeof mockElectronAPI }).electronAPI = mockElectronAPI;
  });

  it('should group spans by tool type', async () => {
    mockElectronAPI.auditLog.getEntries.mockResolvedValue([
      { toolName: 'Read', input: 'file1.ts', durationMs: 45, success: true, timestamp: Date.now() },
      { toolName: 'Read', input: 'file2.ts', durationMs: 30, success: true, timestamp: Date.now() },
      { toolName: 'Bash', input: 'npm test', durationMs: 1000, success: true, timestamp: Date.now() },
    ]);
    mockElectronAPI.auditLog.getStats.mockResolvedValue({
      total: 3, byType: { Read: 2, Bash: 1 }, successCount: 3, errorCount: 0
    });
    mockElectronAPI.auditLog.getTypes.mockResolvedValue(['Read', 'Bash']);

    const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
    render(React.createElement(DebugPanel));

    // Wait for spans to load (async)
    await vi.waitFor(() => {
      expect(screen.getByTestId('tool-group-Read')).toBeInTheDocument();
    });

    // Should have tool type groups with counts
    expect(screen.getByTestId('tool-group-Bash')).toBeInTheDocument();

    // Read group should show count of 2 in the count span
    const readGroup = screen.getByTestId('tool-group-Read');
    const countSpan = within(readGroup).getByText((content, element) => {
      return element?.classList.contains('tool-group-count') && content === '2';
    });
    expect(countSpan).toBeInTheDocument();
  });

  it('should allow expanding/collapsing tool groups', async () => {
    mockElectronAPI.auditLog.getEntries.mockResolvedValue([
      { toolName: 'Read', input: 'file1.ts', durationMs: 45, success: true, timestamp: Date.now() },
      { toolName: 'Read', input: 'file2.ts', durationMs: 30, success: true, timestamp: Date.now() },
    ]);
    mockElectronAPI.auditLog.getStats.mockResolvedValue({
      total: 2, byType: { Read: 2 }, successCount: 2, errorCount: 0
    });
    mockElectronAPI.auditLog.getTypes.mockResolvedValue(['Read']);

    const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
    render(React.createElement(DebugPanel));

    await vi.waitFor(() => {
      expect(screen.getByTestId('tool-group-Read')).toBeInTheDocument();
    });

    // Group should be collapsed by default
    expect(screen.getByTestId('tool-group-Read-items')).toHaveAttribute('aria-expanded', 'false');

    // Click to expand
    fireEvent.click(screen.getByTestId('tool-group-Read-toggle'));

    expect(screen.getByTestId('tool-group-Read-items')).toHaveAttribute('aria-expanded', 'true');

    // Should now see individual spans
    expect(screen.getByText('file1.ts')).toBeInTheDocument();
    expect(screen.getByText('file2.ts')).toBeInTheDocument();
  });

  it('should show summary stats per tool type', async () => {
    mockElectronAPI.auditLog.getEntries.mockResolvedValue([
      { toolName: 'Bash', input: 'cmd1', durationMs: 100, success: true, timestamp: Date.now() },
      { toolName: 'Bash', input: 'cmd2', durationMs: 200, success: true, timestamp: Date.now() },
      { toolName: 'Bash', input: 'cmd3', durationMs: 300, success: false, timestamp: Date.now() },
    ]);
    mockElectronAPI.auditLog.getStats.mockResolvedValue({
      total: 3, byType: { Bash: 3 }, successCount: 2, errorCount: 1
    });
    mockElectronAPI.auditLog.getTypes.mockResolvedValue(['Bash']);

    const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
    render(React.createElement(DebugPanel));

    await vi.waitFor(() => {
      expect(screen.getByTestId('tool-group-Bash')).toBeInTheDocument();
    });

    // Should show aggregate stats for Bash group
    const bashGroup = screen.getByTestId('tool-group-Bash');

    // Total duration (100+200+300 = 600ms)
    expect(within(bashGroup).getByText(/600\s*ms|0\.6\s*s/)).toBeInTheDocument();

    // Error count indicator
    expect(within(bashGroup).getByText(/1\s*error|1\s*failed/i)).toBeInTheDocument();
  });

  it('should show chronological list within expanded group', async () => {
    const now = Date.now();
    mockElectronAPI.auditLog.getEntries.mockResolvedValue([
      { toolName: 'Read', input: 'first.ts', durationMs: 45, success: true, timestamp: now - 2000 },
      { toolName: 'Read', input: 'second.ts', durationMs: 30, success: true, timestamp: now - 1000 },
      { toolName: 'Read', input: 'third.ts', durationMs: 20, success: true, timestamp: now },
    ]);
    mockElectronAPI.auditLog.getStats.mockResolvedValue({
      total: 3, byType: { Read: 3 }, successCount: 3, errorCount: 0
    });
    mockElectronAPI.auditLog.getTypes.mockResolvedValue(['Read']);

    const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
    render(React.createElement(DebugPanel));

    await vi.waitFor(() => {
      expect(screen.getByTestId('tool-group-Read')).toBeInTheDocument();
    });

    // Expand the group
    fireEvent.click(screen.getByTestId('tool-group-Read-toggle'));

    // Get the items container
    const itemsContainer = screen.getByTestId('tool-group-Read-items');
    const items = within(itemsContainer).getAllByTestId(/^span-item-/);

    // Should be in chronological order (most recent last)
    expect(items[0].textContent).toContain('first.ts');
    expect(items[1].textContent).toContain('second.ts');
    expect(items[2].textContent).toContain('third.ts');
  });

  it('should allow filtering by tool type', async () => {
    mockElectronAPI.auditLog.getEntries.mockResolvedValue([
      { toolName: 'Read', input: 'file.ts', durationMs: 45, success: true, timestamp: Date.now() },
      { toolName: 'Bash', input: 'npm test', durationMs: 1000, success: true, timestamp: Date.now() },
      { toolName: 'Edit', input: 'config.ts', durationMs: 30, success: true, timestamp: Date.now() },
    ]);
    mockElectronAPI.auditLog.getStats.mockResolvedValue({
      total: 3, byType: { Read: 1, Bash: 1, Edit: 1 }, successCount: 3, errorCount: 0
    });
    mockElectronAPI.auditLog.getTypes.mockResolvedValue(['Read', 'Bash', 'Edit']);

    const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
    render(React.createElement(DebugPanel));

    await vi.waitFor(() => {
      expect(screen.getByTestId('otel-filter')).toBeInTheDocument();
    });

    // Select "Bash" filter
    fireEvent.change(screen.getByTestId('otel-filter'), { target: { value: 'Bash' } });

    // Should only show Bash group
    expect(screen.getByTestId('tool-group-Bash')).toBeInTheDocument();
    expect(screen.queryByTestId('tool-group-Read')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tool-group-Edit')).not.toBeInTheDocument();
  });

  it('should show empty state when no spans', async () => {
    mockElectronAPI.auditLog.getEntries.mockResolvedValue([]);
    mockElectronAPI.auditLog.getStats.mockResolvedValue({
      total: 0, byType: {}, successCount: 0, errorCount: 0
    });
    mockElectronAPI.auditLog.getTypes.mockResolvedValue([]);

    const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
    render(React.createElement(DebugPanel));

    await vi.waitFor(() => {
      expect(screen.getByTestId('otel-spans-section')).toBeInTheDocument();
    });

    // Should show empty state message
    expect(screen.getByText(/no tool calls|no spans|no activity/i)).toBeInTheDocument();
  });

});

// =============================================================================
// Integration: Real-time span updates
// =============================================================================

describe('MSSCI-12782: Real-time span updates', () => {

  const mockElectronAPI = {
    context: {
      get: vi.fn(),
      onUpdate: vi.fn(),
    },
    tokenStats: {
      get: vi.fn(),
      onUpdate: vi.fn(),
    },
    auditLog: {
      getEntries: vi.fn(),
      getTypes: vi.fn(),
      getStats: vi.fn(),
      clear: vi.fn(),
      export: vi.fn(),
      onEntry: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mockElectronAPI.context.get.mockResolvedValue({ percent: 25 });
    mockElectronAPI.tokenStats.get.mockResolvedValue({});
    (window as unknown as { electronAPI: typeof mockElectronAPI }).electronAPI = mockElectronAPI;
  });

  it('should update span count when new span arrives', async () => {
    let entryCallback: ((entry: unknown) => void) | null = null;

    mockElectronAPI.auditLog.getEntries.mockResolvedValue([
      { toolName: 'Read', input: 'file.ts', durationMs: 45, success: true, timestamp: Date.now() },
    ]);
    mockElectronAPI.auditLog.getStats.mockResolvedValue({
      total: 1, byType: { Read: 1 }, successCount: 1, errorCount: 0
    });
    mockElectronAPI.auditLog.getTypes.mockResolvedValue(['Read']);
    mockElectronAPI.auditLog.onEntry.mockImplementation((cb: (entry: unknown) => void) => {
      entryCallback = cb;
    });

    const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
    render(React.createElement(DebugPanel));

    // Wait for initial spans to load (async)
    await vi.waitFor(() => {
      expect(screen.getByTestId('tool-group-Read')).toBeInTheDocument();
    });

    // Verify initial count
    expect(screen.getByText(/1\s*span/i)).toBeInTheDocument();

    // Simulate new span arriving
    if (entryCallback) {
      entryCallback({
        toolName: 'Bash',
        input: 'npm test',
        durationMs: 1000,
        success: true,
        timestamp: Date.now(),
      });
    }

    // Should update to show 2 spans
    await vi.waitFor(() => {
      expect(screen.getByText(/2\s*spans/i)).toBeInTheDocument();
    });
  });

  it('should add new tool group when new tool type appears', async () => {
    let entryCallback: ((entry: unknown) => void) | null = null;

    mockElectronAPI.auditLog.getEntries.mockResolvedValue([
      { toolName: 'Read', input: 'file.ts', durationMs: 45, success: true, timestamp: Date.now() },
    ]);
    mockElectronAPI.auditLog.getStats.mockResolvedValue({
      total: 1, byType: { Read: 1 }, successCount: 1, errorCount: 0
    });
    mockElectronAPI.auditLog.getTypes.mockResolvedValue(['Read']);
    mockElectronAPI.auditLog.onEntry.mockImplementation((cb: (entry: unknown) => void) => {
      entryCallback = cb;
    });

    const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
    render(React.createElement(DebugPanel));

    await vi.waitFor(() => {
      expect(screen.getByTestId('tool-group-Read')).toBeInTheDocument();
    });

    // Initially no Bash group
    expect(screen.queryByTestId('tool-group-Bash')).not.toBeInTheDocument();

    // Simulate new Bash span arriving
    if (entryCallback) {
      entryCallback({
        toolName: 'Bash',
        input: 'npm test',
        durationMs: 1000,
        success: true,
        timestamp: Date.now(),
      });
    }

    // Should now have Bash group
    await vi.waitFor(() => {
      expect(screen.getByTestId('tool-group-Bash')).toBeInTheDocument();
    });
  });

});
