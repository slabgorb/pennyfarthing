/**
 * MSSCI-12782: Debug Panel Token Stats Formatting Tests
 *
 * Tests for the Debug panel token stats display:
 * - Token stats formatted as readable UI (cards/table, not raw JSON)
 *
 * Note: Tool call display was removed from DebugPanel in favor of the
 * AuditLogPanel which provides a more comprehensive view.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';

// =============================================================================
// AC1: Token stats formatted as readable UI (not raw JSON)
// =============================================================================

describe('MSSCI-12782: AC1 - Token stats formatting', () => {

  let contextWs: any;
  let tokenWs: any;
  let originalWebSocket: any;

  beforeEach(() => {
    vi.resetAllMocks();
    // Capture WebSocket instances when they're created
    originalWebSocket = (global as any).WebSocket;
    (global as any).WebSocket = class extends originalWebSocket {
      constructor(url: string) {
        super(url);
        if (url.includes('/ws/context')) {
          contextWs = this;
        } else if (url.includes('/ws/token-stats')) {
          tokenWs = this;
        }
      }
    };
  });

  afterEach(() => {
    (global as any).WebSocket = originalWebSocket;
  });

  it('should render token stats as formatted cards, not raw JSON', async () => {
    const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
    render(React.createElement(DebugPanel));

    // Send token stats via WebSocket
    tokenWs.onmessage({ data: JSON.stringify({
      inputTokens: 12500,
      outputTokens: 3200,
      cacheReadTokens: 8000,
      cacheCreationTokens: 1500,
      totalCostUsd: 0.0523,
    }) });

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
    const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
    render(React.createElement(DebugPanel));

    // Send token stats via WebSocket
    tokenWs.onmessage({ data: JSON.stringify({
      inputTokens: 12500,
      outputTokens: 3200,
      cacheReadTokens: 8000,
      cacheCreationTokens: 1500,
    }) });

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
    const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
    render(React.createElement(DebugPanel));

    // Send token stats via WebSocket
    tokenWs.onmessage({ data: JSON.stringify({
      inputTokens: 12500,
      outputTokens: 3200,
      cacheReadTokens: 8000,
      cacheCreationTokens: 1500,
    }) });

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
    const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
    render(React.createElement(DebugPanel));

    // Send token stats via WebSocket
    tokenWs.onmessage({ data: JSON.stringify({
      inputTokens: 12500,
      outputTokens: 3200,
      totalCostUsd: 0.0523,
    }) });

    // Wait for token stats to load (async)
    await vi.waitFor(() => {
      expect(screen.getByTestId('token-stat-input')).toBeInTheDocument();
    });

    // Cost should be formatted as currency
    expect(screen.getByText(/\$0\.0523/)).toBeInTheDocument();
  });

  it('should hide zero-value stats gracefully', async () => {
    const { DebugPanel } = await import('../src/public/components/panels/DebugPanel.js');
    render(React.createElement(DebugPanel));

    // Send token stats via WebSocket
    tokenWs.onmessage({ data: JSON.stringify({
      inputTokens: 12500,
      outputTokens: 0,  // Zero output
      cacheReadTokens: 8000,
      cacheCreationTokens: 0,  // Zero cache creation
    }) });

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
