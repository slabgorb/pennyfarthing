/**
 * 103-15: AuditLogPanel Tests
 *
 * Tests for the AuditLogPanel component with real-time WebSocket updates.
 * Story: MSSCI-14970 - AuditLogPanel (scrolling event log)
 * Epic: epic-103 (Cyclist Visual Terminal)
 *
 * Acceptance Criteria:
 * - AC1: Subscribes to WebSocket channel for real-time OTEL span events
 * - AC2: Renders scrolling audit log with timestamps, event types, and details
 * - AC3: Auto-scrolls to latest entry with manual scroll override detection
 * - AC4: Panel integrates with Cyclist dockview layout
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';

import { AuditLogPanel } from '../src/public/components/panels/AuditLogPanel';

// ============================================================================
// WebSocket Tracking
// ============================================================================

let spansWs: any = null;

// ============================================================================
// Test Fixtures
// ============================================================================

const mockToolEvent = (overrides: Record<string, unknown> = {}) => ({
  toolName: 'Read',
  input: '/path/to/file.ts',
  durationMs: 150,
  success: true,
  timestamp: 1707900000000,
  ...overrides,
});

const mockEntries = [
  mockToolEvent({
    toolName: 'Read',
    input: '/src/app.ts',
    timestamp: 1707900005000,
    filePath: '/src/app.ts',
    lineCount: 100,
    language: 'typescript',
  }),
  mockToolEvent({
    toolName: 'Bash',
    input: 'npm test',
    durationMs: 3500,
    success: false,
    error: 'Exit code 1',
    timestamp: 1707900000000,
    command: 'npm test',
    exitCode: 1,
  }),
];

const mockStats = {
  total: 42,
  byType: { Read: 20, Bash: 15, Write: 7 },
  successCount: 38,
  errorCount: 4,
};

const mockTypes = ['Read', 'Bash', 'Write', 'Edit', 'Glob', 'Grep'];

// ============================================================================
// Helpers
// ============================================================================

/** Wait for table entries to render by checking .tool-name cells (avoids dropdown ambiguity) */
async function waitForEntries() {
  await waitFor(() => {
    const toolCells = document.querySelectorAll('.tool-name');
    expect(toolCells.length).toBeGreaterThan(0);
  });
}

/** Get tool names from table rows (not from filter dropdown) */
function getTableToolNames(): string[] {
  const toolCells = document.querySelectorAll('.tool-name');
  return Array.from(toolCells).map(el => el.textContent || '');
}

/** Find a table row by tool name (uses .tool-name cell, not dropdown) */
function findRowByToolName(name: string): HTMLTableRowElement | null {
  const toolCells = document.querySelectorAll('.tool-name');
  for (const cell of toolCells) {
    if (cell.textContent === name) {
      return cell.closest('tr');
    }
  }
  return null;
}

// ============================================================================
// Setup & Teardown
// ============================================================================

function mockAuditLogFetch() {
  global.fetch = vi.fn((url: string | URL | Request, init?: RequestInit) => {
    const urlStr = url.toString();

    if (urlStr.includes('/api/audit-log/stats')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockStats),
      } as Response);
    }
    if (urlStr.includes('/api/audit-log/types')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ types: mockTypes }),
      } as Response);
    }
    if (urlStr.includes('/api/audit-log/export')) {
      return Promise.resolve({
        ok: true,
        blob: () => Promise.resolve(new Blob(['exported data'])),
      } as Response);
    }
    if (urlStr.includes('/api/audit-log') && init?.method === 'DELETE') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      } as Response);
    }
    if (urlStr.includes('/api/audit-log')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ entries: mockEntries }),
      } as Response);
    }
    return Promise.reject(new Error(`Unmocked URL: ${urlStr}`));
  }) as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  spansWs = null;

  mockAuditLogFetch();

  // Track WebSocket instances for /ws/spans
  const OriginalMockWebSocket = (window as any).WebSocket;
  (window as any).WebSocket = class extends OriginalMockWebSocket {
    constructor(url: string) {
      super(url);
      if (url.includes('/ws/spans')) {
        spansWs = this;
      }
    }
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================================
// AC1: Subscribes to WebSocket channel for real-time OTEL span events
// ============================================================================

describe('AC1: WebSocket subscription for real-time span events', () => {
  it('should connect to /ws/spans WebSocket on mount', async () => {
    render(<AuditLogPanel />);
    await waitFor(() => {
      expect(spansWs).not.toBeNull();
      expect(spansWs.url).toContain('/ws/spans');
    });
  });

  it('should add new entries when WebSocket sends span message', async () => {
    render(<AuditLogPanel />);
    await waitFor(() => expect(spansWs).not.toBeNull());
    await waitForEntries();

    // Send a new span via WebSocket
    spansWs.simulateMessage({
      type: 'span',
      span: mockToolEvent({ toolName: 'Grep', input: 'search pattern', timestamp: Date.now() }),
    });

    await waitFor(() => {
      expect(getTableToolNames()).toContain('Grep');
    });
  });

  it('should prepend new entries (newest first)', async () => {
    render(<AuditLogPanel />);
    await waitFor(() => expect(spansWs).not.toBeNull());
    await waitForEntries();

    // Send a new span — should appear before existing entries
    spansWs.simulateMessage({
      type: 'span',
      span: mockToolEvent({ toolName: 'Write', timestamp: Date.now() }),
    });

    await waitFor(() => {
      expect(getTableToolNames()[0]).toBe('Write');
    });
  });

  it('should cap entries at 200', async () => {
    // Pre-fill with 200 entries
    const manyEntries = Array.from({ length: 200 }, (_, i) =>
      mockToolEvent({ toolName: `Tool${i}`, timestamp: Date.now() - i * 1000 })
    );

    global.fetch = vi.fn((url: string) => {
      const urlStr = url.toString();
      if (urlStr.includes('/api/audit-log/stats'))
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockStats) } as Response);
      if (urlStr.includes('/api/audit-log/types'))
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ types: mockTypes }) } as Response);
      if (urlStr.includes('/api/audit-log'))
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ entries: manyEntries }) } as Response);
      return Promise.reject(new Error(`Unmocked: ${urlStr}`));
    }) as any;

    render(<AuditLogPanel />);
    await waitFor(() => expect(spansWs).not.toBeNull());

    await waitFor(() => {
      expect(screen.getByText('Tool0')).toBeInTheDocument();
    });

    // Send one more — should push out Tool199
    spansWs.simulateMessage({
      type: 'span',
      span: mockToolEvent({ toolName: 'NewTool', timestamp: Date.now() }),
    });

    await waitFor(() => {
      expect(screen.getByText('NewTool')).toBeInTheDocument();
      expect(screen.queryByText('Tool199')).not.toBeInTheDocument();
    });
  });

  it('should ignore non-span WebSocket messages', async () => {
    render(<AuditLogPanel />);
    await waitFor(() => expect(spansWs).not.toBeNull());

    await waitFor(() => {
      const rows = screen.getAllByRole('row');
      // header + 2 data rows
      expect(rows).toHaveLength(3);
    });

    // Send a non-span message
    spansWs.simulateMessage({ type: 'init', spans: [] });

    // Entry count should NOT change
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(3);
  });

  it('should close WebSocket on unmount', async () => {
    const { unmount } = render(<AuditLogPanel />);
    await waitFor(() => expect(spansWs).not.toBeNull());

    const closeSpy = vi.spyOn(spansWs, 'close');
    unmount();
    expect(closeSpy).toHaveBeenCalled();
  });
});

// ============================================================================
// AC2: Renders scrolling audit log with timestamps, event types, and details
// ============================================================================

describe('AC2: Renders audit log with timestamps, event types, and details', () => {
  it('should show loading state before data loads', () => {
    // Make fetch hang forever to keep loading state
    global.fetch = vi.fn(() => new Promise(() => {})) as any;

    render(<AuditLogPanel />);

    expect(document.querySelector('.audit-log-panel')).toBeInTheDocument();
    // Table should NOT be present during loading
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('should render entries table after data loads', async () => {
    render(<AuditLogPanel />);

    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
    });
  });

  it('should display table headers: Time, Tool, Input, Duration, Status', async () => {
    render(<AuditLogPanel />);

    await waitFor(() => {
      expect(screen.getByText('Time')).toBeInTheDocument();
      expect(screen.getByText('Tool')).toBeInTheDocument();
      expect(screen.getByText('Input')).toBeInTheDocument();
      expect(screen.getByText('Duration')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
    });
  });

  it('should display tool name for each entry', async () => {
    render(<AuditLogPanel />);
    await waitForEntries();

    const toolNames = getTableToolNames();
    expect(toolNames).toContain('Read');
    expect(toolNames).toContain('Bash');
  });

  it('should display formatted duration', async () => {
    render(<AuditLogPanel />);

    await waitFor(() => {
      // 150ms stays as "150ms"
      expect(screen.getByText('150ms')).toBeInTheDocument();
      // 3500ms formats to "3.5s"
      expect(screen.getByText('3.5s')).toBeInTheDocument();
    });
  });

  it('should display success indicator for successful entries', async () => {
    render(<AuditLogPanel />);

    await waitFor(() => {
      const successMarkers = document.querySelectorAll('.status-ok');
      expect(successMarkers.length).toBeGreaterThan(0);
    });
  });

  it('should display error indicator for failed entries', async () => {
    render(<AuditLogPanel />);

    await waitFor(() => {
      const errorMarkers = document.querySelectorAll('.status-err');
      expect(errorMarkers.length).toBeGreaterThan(0);
    });
  });

  it('should show stats bar with total, success, and error counts', async () => {
    render(<AuditLogPanel />);

    await waitFor(() => {
      const statsBar = document.querySelector('.audit-log-stats');
      expect(statsBar).not.toBeNull();
      expect(statsBar!.textContent).toContain('42');
      expect(statsBar!.textContent).toContain('38');
      expect(statsBar!.textContent).toContain('4');
    });
  });

  it('should show "No entries" placeholder when empty', async () => {
    global.fetch = vi.fn((url: string) => {
      const urlStr = url.toString();
      if (urlStr.includes('/api/audit-log/stats'))
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ total: 0, byType: {}, successCount: 0, errorCount: 0 }) } as Response);
      if (urlStr.includes('/api/audit-log/types'))
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ types: [] }) } as Response);
      if (urlStr.includes('/api/audit-log'))
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ entries: [] }) } as Response);
      return Promise.reject(new Error(`Unmocked: ${urlStr}`));
    }) as any;

    render(<AuditLogPanel />);

    await waitFor(() => {
      expect(screen.getByText('No entries')).toBeInTheDocument();
    });
  });

  it('should expand entry details on row click', async () => {
    render(<AuditLogPanel />);
    await waitForEntries();

    // Click on the Read entry row (using .tool-name selector to avoid dropdown)
    const readRow = findRowByToolName('Read');
    expect(readRow).not.toBeNull();
    fireEvent.click(readRow!);

    // Expanded detail should show enrichment fields unique to detail view
    await waitFor(() => {
      expect(screen.getByText('Language')).toBeInTheDocument();
      expect(screen.getByText('typescript')).toBeInTheDocument();
    });
  });

  it('should collapse expanded entry on second click', async () => {
    render(<AuditLogPanel />);
    await waitForEntries();

    const readRow = findRowByToolName('Read');
    expect(readRow).not.toBeNull();

    // Expand
    fireEvent.click(readRow!);
    await waitFor(() => {
      expect(document.querySelector('.expanded-detail')).toBeInTheDocument();
    });

    // Collapse
    fireEvent.click(readRow!);
    await waitFor(() => {
      expect(document.querySelector('.expanded-detail')).not.toBeInTheDocument();
    });
  });

  it('should display error state when API fails', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: false } as Response)
    ) as any;

    render(<AuditLogPanel />);

    await waitFor(() => {
      expect(screen.getByText(/Error:/)).toBeInTheDocument();
    });
  });
});

// ============================================================================
// AC3: Auto-scrolls to latest entry with manual scroll override detection
// ============================================================================

describe('AC3: Auto-scroll with manual scroll override', () => {
  it('should auto-scroll to show newest entry when new span arrives', async () => {
    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;

    render(<AuditLogPanel />);
    await waitFor(() => expect(spansWs).not.toBeNull());
    await waitForEntries();

    // Clear any calls from initial render
    scrollIntoViewMock.mockClear();

    // Send new span via WebSocket
    spansWs.simulateMessage({
      type: 'span',
      span: mockToolEvent({ toolName: 'Grep', timestamp: Date.now() }),
    });

    await waitFor(() => {
      expect(getTableToolNames()).toContain('Grep');
    });

    // Auto-scroll should have been triggered for the new entry
    expect(scrollIntoViewMock).toHaveBeenCalled();
  });

  it('should pause auto-scroll when user manually scrolls away', async () => {
    render(<AuditLogPanel />);
    await waitFor(() => expect(spansWs).not.toBeNull());
    await waitForEntries();

    // Find the scroll container
    const scrollArea = document.querySelector('.audit-log-entries');
    expect(scrollArea).not.toBeNull();

    // Simulate user scrolling away (manual override)
    fireEvent.scroll(scrollArea!, { target: { scrollTop: 500 } });

    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;

    // Send new span
    spansWs.simulateMessage({
      type: 'span',
      span: mockToolEvent({ toolName: 'Write', timestamp: Date.now() }),
    });

    await waitFor(() => {
      expect(getTableToolNames()).toContain('Write');
    });

    // Auto-scroll should NOT fire because user manually scrolled
    expect(scrollIntoViewMock).not.toHaveBeenCalled();
  });

  it('should resume auto-scroll when user scrolls back to top', async () => {
    render(<AuditLogPanel />);
    await waitFor(() => expect(spansWs).not.toBeNull());
    await waitForEntries();

    const scrollArea = document.querySelector('.audit-log-entries');
    expect(scrollArea).not.toBeNull();

    // Scroll away (manual override)
    fireEvent.scroll(scrollArea!, { target: { scrollTop: 500 } });

    // Scroll back to top (resume auto-scroll)
    fireEvent.scroll(scrollArea!, { target: { scrollTop: 0 } });

    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;

    // Send new span
    spansWs.simulateMessage({
      type: 'span',
      span: mockToolEvent({ toolName: 'Edit', timestamp: Date.now() }),
    });

    await waitFor(() => {
      expect(getTableToolNames()).toContain('Edit');
    });

    // Auto-scroll should be active again
    expect(scrollIntoViewMock).toHaveBeenCalled();
  });
});

// ============================================================================
// AC4: Panel integrates with Cyclist dockview layout
// ============================================================================

describe('AC4: Dockview layout integration', () => {
  it('should render without any props', async () => {
    render(<AuditLogPanel />);

    await waitFor(() => {
      expect(document.querySelector('.audit-log-panel')).toBeInTheDocument();
    });
  });

  it('should export AuditLogPanel as named export', () => {
    expect(AuditLogPanel).toBeDefined();
    expect(typeof AuditLogPanel).toBe('function');
  });

  it('should export as default export', async () => {
    const mod = await import('../src/public/components/panels/AuditLogPanel');
    expect(mod.default).toBeDefined();
    expect(mod.default).toBe(mod.AuditLogPanel);
  });

  it('should use full-height flex layout for dockview panel sizing', async () => {
    render(<AuditLogPanel />);

    await waitFor(() => {
      const panel = document.querySelector('.audit-log-panel');
      expect(panel).toHaveClass('flex', 'flex-col', 'h-full');
    });
  });

  it('should be registered in PANEL_INVENTORY as audit-log', async () => {
    const { PANEL_INVENTORY } = await import('../src/public/components/DockviewWorkspace');
    expect(PANEL_INVENTORY.AUDIT_LOG).toBe('audit-log');
  });
});
