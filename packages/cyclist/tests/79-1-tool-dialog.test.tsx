/**
 * 79-1: ToolDialog Shared Component Tests
 *
 * Tests for the shared ToolDialog component that wraps shadcn Dialog
 * with standardized sizing, header, footer, and close behavior.
 *
 * Story: MSSCI-14441 - Create ToolDialog shared component
 * Epic: epic-79 (Dialog Infrastructure + Hotspot Refactor)
 *
 * Acceptance Criteria:
 * - AC1: ToolDialog.tsx component created at components/dialogs/ToolDialog.tsx
 * - AC2: Wraps shadcn Dialog with max-w-5xl sizing
 * - AC3: Standard header with title and close button
 * - AC4: Standard footer area
 * - AC5: All observatory tools can use this as a wrapper
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// Component to be implemented
import { ToolDialog } from '../src/public/components/dialogs/ToolDialog';
import type { ToolDialogProps } from '../src/public/components/dialogs/ToolDialog';

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================================
// AC1: Component exists and renders
// ============================================================================

describe('AC1: ToolDialog component exists', () => {
  it('should export ToolDialog as a named export', () => {
    expect(ToolDialog).toBeDefined();
    expect(typeof ToolDialog).toBe('function');
  });

  it('should render without crashing when open', () => {
    render(
      <ToolDialog open={true} onOpenChange={() => {}} title="Test">
        <p>Content</p>
      </ToolDialog>
    );
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('should not render content when closed', () => {
    render(
      <ToolDialog open={false} onOpenChange={() => {}} title="Test">
        <p>Hidden content</p>
      </ToolDialog>
    );
    expect(screen.queryByText('Hidden content')).not.toBeInTheDocument();
  });
});

// ============================================================================
// AC2: Wraps shadcn Dialog with max-w-5xl sizing
// ============================================================================

describe('AC2: max-w-5xl sizing', () => {
  it('should apply max-w-5xl class to the dialog content', () => {
    render(
      <ToolDialog open={true} onOpenChange={() => {}} title="Sized Dialog">
        <p>Sized content</p>
      </ToolDialog>
    );
    // The dialog content container should have max-w-5xl
    const dialogContent = screen.getByRole('dialog');
    expect(dialogContent.className).toMatch(/max-w-5xl/);
  });

  it('should allow additional className to be passed', () => {
    render(
      <ToolDialog
        open={true}
        onOpenChange={() => {}}
        title="Custom Class"
        className="custom-test-class"
      >
        <p>Custom</p>
      </ToolDialog>
    );
    const dialogContent = screen.getByRole('dialog');
    expect(dialogContent.className).toMatch(/custom-test-class/);
  });
});

// ============================================================================
// AC3: Standard header with title and close button
// ============================================================================

describe('AC3: Standard header with title and close button', () => {
  it('should render the title text', () => {
    render(
      <ToolDialog open={true} onOpenChange={() => {}} title="Hotspots">
        <p>Body</p>
      </ToolDialog>
    );
    expect(screen.getByText('Hotspots')).toBeInTheDocument();
  });

  it('should render a close button', () => {
    render(
      <ToolDialog open={true} onOpenChange={() => {}} title="Close Test">
        <p>Body</p>
      </ToolDialog>
    );
    // shadcn Dialog includes a close button with sr-only "Close" text
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
  });

  it('should call onOpenChange(false) when close button is clicked', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <ToolDialog open={true} onOpenChange={onOpenChange} title="Close Click">
        <p>Body</p>
      </ToolDialog>
    );
    const closeButton = screen.getByRole('button', { name: /close/i });
    await user.click(closeButton);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('should render optional description when provided', () => {
    render(
      <ToolDialog
        open={true}
        onOpenChange={() => {}}
        title="With Description"
        description="Analyze code hotspots across repos"
      >
        <p>Body</p>
      </ToolDialog>
    );
    expect(screen.getByText('Analyze code hotspots across repos')).toBeInTheDocument();
  });
});

// ============================================================================
// AC4: Standard footer area
// ============================================================================

describe('AC4: Standard footer area', () => {
  it('should render footer content when footer prop is provided', () => {
    render(
      <ToolDialog
        open={true}
        onOpenChange={() => {}}
        title="Footer Test"
        footer={<button>Save</button>}
      >
        <p>Body</p>
      </ToolDialog>
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('should not render footer section when footer prop is omitted', () => {
    const { container } = render(
      <ToolDialog open={true} onOpenChange={() => {}} title="No Footer">
        <p>Body only</p>
      </ToolDialog>
    );
    // Body should render but no footer buttons (other than close)
    expect(screen.getByText('Body only')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  it('should render multiple footer actions', () => {
    render(
      <ToolDialog
        open={true}
        onOpenChange={() => {}}
        title="Multi Footer"
        footer={
          <>
            <button>Cancel</button>
            <button>Apply</button>
          </>
        }
      >
        <p>Body</p>
      </ToolDialog>
    );
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument();
  });
});

// ============================================================================
// AC5: Usable as a wrapper by observatory tools
// ============================================================================

describe('AC5: Wrapper for observatory tools', () => {
  it('should render arbitrary children as dialog body', () => {
    render(
      <ToolDialog open={true} onOpenChange={() => {}} title="Hotspots">
        <div data-testid="hotspots-table">
          <table>
            <tbody>
              <tr><td>src/index.ts</td><td>42</td></tr>
            </tbody>
          </table>
        </div>
      </ToolDialog>
    );
    expect(screen.getByTestId('hotspots-table')).toBeInTheDocument();
    expect(screen.getByText('src/index.ts')).toBeInTheDocument();
  });

  it('should render complex nested content', () => {
    render(
      <ToolDialog open={true} onOpenChange={() => {}} title="Complex Tool">
        <div>
          <h3>Section 1</h3>
          <ul>
            <li>Item A</li>
            <li>Item B</li>
          </ul>
        </div>
        <div>
          <h3>Section 2</h3>
          <p>Details here</p>
        </div>
      </ToolDialog>
    );
    expect(screen.getByText('Section 1')).toBeInTheDocument();
    expect(screen.getByText('Section 2')).toBeInTheDocument();
    expect(screen.getByText('Item A')).toBeInTheDocument();
    expect(screen.getByText('Details here')).toBeInTheDocument();
  });

  it('should support both title and description for tool context', () => {
    render(
      <ToolDialog
        open={true}
        onOpenChange={() => {}}
        title="Code Hotspots"
        description="Files ranked by change frequency × complexity"
        footer={<button>Export CSV</button>}
      >
        <p>Hotspot data table</p>
      </ToolDialog>
    );
    expect(screen.getByText('Code Hotspots')).toBeInTheDocument();
    expect(screen.getByText('Files ranked by change frequency × complexity')).toBeInTheDocument();
    expect(screen.getByText('Hotspot data table')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeInTheDocument();
  });
});
