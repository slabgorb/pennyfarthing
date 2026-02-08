/**
 * MSSCI-14443: Tool Launcher Row in DebugPanel
 *
 * Story 79-3: Add tool launcher row to DebugPanel
 *
 * Acceptance Criteria:
 * - AC1: Tools section exists below Token Stats with heading and separator
 * - AC2: Hotspots button opens HotspotsDialog
 * - AC3: Placeholder buttons for future tools (disabled)
 * - AC4: Consistent styling with existing DebugPanel sections
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock WebSocket to prevent connection attempts
class MockWebSocket {
  onmessage: ((event: MessageEvent) => void) | null = null;
  close = vi.fn();
  constructor() {}
}
vi.stubGlobal('WebSocket', MockWebSocket);

// Mock HotspotsDialog to avoid pulling in its full dependency tree
vi.mock('../src/public/components/dialogs/HotspotsDialog', () => ({
  HotspotsDialog: ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) => (
    open ? <div data-testid="hotspots-dialog">Hotspots Dialog</div> : null
  ),
}));

// Mock shadcn/ui components
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, disabled, onClick, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) => (
    <button disabled={disabled} onClick={onClick} {...props}>{children}</button>
  ),
  buttonVariants: () => '',
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement> & { variant?: string }) => (
    <span {...props}>{children}</span>
  ),
}));

vi.mock('@/components/ui/separator', () => ({
  Separator: (props: React.HTMLAttributes<HTMLDivElement>) => <hr {...props} />,
}));

import { DebugPanel } from '../src/public/components/panels/DebugPanel';

describe('MSSCI-14443: Tool Launcher Row', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('AC1: renders Tools section with heading', () => {
    render(<DebugPanel />);
    const headings = screen.getAllByRole('heading', { level: 4 });
    const toolsHeading = headings.find(h => h.textContent === 'Tools');
    expect(toolsHeading).toBeDefined();
  });

  it('AC1: renders tool-launcher container', () => {
    render(<DebugPanel />);
    expect(screen.getByTestId('tool-launcher')).toBeDefined();
  });

  it('AC2: Hotspots button opens HotspotsDialog on click', () => {
    render(<DebugPanel />);
    const hotspotsBtn = screen.getByTestId('tool-launcher-hotspots');
    expect(hotspotsBtn).toBeDefined();
    expect(hotspotsBtn.textContent).toBe('Hotspots');

    // Dialog should not be open initially
    expect(screen.queryByTestId('hotspots-dialog')).toBeNull();

    // Click to open
    fireEvent.click(hotspotsBtn);
    expect(screen.getByTestId('hotspots-dialog')).toBeDefined();
  });

  it('AC3: placeholder buttons are disabled', () => {
    render(<DebugPanel />);
    const deadCode = screen.getByTestId('tool-launcher-deadcode');
    const complexity = screen.getByTestId('tool-launcher-complexity');

    expect(deadCode).toHaveProperty('disabled', true);
    expect(complexity).toHaveProperty('disabled', true);
  });

  it('AC2: Hotspots button is not disabled', () => {
    render(<DebugPanel />);
    const hotspotsBtn = screen.getByTestId('tool-launcher-hotspots');
    expect(hotspotsBtn).toHaveProperty('disabled', false);
  });
});
