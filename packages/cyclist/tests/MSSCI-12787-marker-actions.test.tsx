/**
 * MSSCI-12787: CYCLIST Marker Parsing and Action Buttons Tests
 *
 * Tests for the React components that parse CYCLIST markers from assistant
 * messages and render action buttons for the user.
 *
 * Story: MSSCI-12787 - Implement CYCLIST Marker Parsing and Action Buttons
 *
 * Critical Context:
 * - The reflector hook enforces markers but nothing reads them currently
 * - This ports functionality from deleted vanilla JS (quick-actions.js)
 * - Reference implementation: sprint/context/MSSCI-12787-reference/
 *
 * Marker Types:
 * - HANDOFF:/agent → Show handoff button (auto-execute if relay mode ON)
 * - QUESTION:yesno → Show Yes/No buttons
 * - QUESTION:open → Show text input
 * - CHOICES:a,b,c → Show choice buttons
 * - CONTINUE → Show Continue button
 *
 * Acceptance Criteria:
 * - AC1: Parse <!-- CYCLIST:HANDOFF:/agent --> → Show handoff button
 * - AC2: Parse <!-- CYCLIST:QUESTION:yesno --> → Show Yes/No buttons
 * - AC3: Parse <!-- CYCLIST:QUESTION:open --> → Show text input
 * - AC4: Parse <!-- CYCLIST:CHOICES:a,b,c --> → Show choice buttons
 * - AC5: Parse <!-- CYCLIST:CONTINUE --> → Show Continue button
 * - AC6: Wire button clicks to appropriate actions (send message, trigger handoff)
 * - AC7: Hide raw marker HTML from display
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// Components to be implemented
import QuickActions from '../src/public/components/QuickActions';
import { useMarkerActions } from '../src/public/hooks/useMarkerActions';

// Mock electronAPI
const mockElectronAPI = {
  claude: {
    send: vi.fn(),
    onMessage: vi.fn(),
    offMessage: vi.fn(),
  },
  settings: {
    get: vi.fn().mockResolvedValue({ workflow: { relay_mode: false } }),
  },
};

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

const messageWithHandoff = {
  type: 'assistant' as const,
  content: `The story is ready for development.

<!-- CYCLIST:HANDOFF:/dev -->

Run \`/dev\` to continue`,
  timestamp: Date.now(),
};

const messageWithYesNo = {
  type: 'assistant' as const,
  content: `Would you like me to proceed with the refactoring?

<!-- CYCLIST:QUESTION:yesno -->`,
  timestamp: Date.now(),
};

const messageWithOpenQuestion = {
  type: 'assistant' as const,
  content: `What name should I use for the new component?

<!-- CYCLIST:QUESTION:open -->`,
  timestamp: Date.now(),
};

const messageWithChoices = {
  type: 'assistant' as const,
  content: `Which approach would you prefer?

1. Option A - Quick fix
2. Option B - Full refactor
3. Option C - New implementation

<!-- CYCLIST:CHOICES:Option A,Option B,Option C -->`,
  timestamp: Date.now(),
};

const messageWithContinue = {
  type: 'assistant' as const,
  content: `I've completed the task.

<!-- CYCLIST:CONTINUE -->`,
  timestamp: Date.now(),
};

const messageWithNoMarker = {
  type: 'assistant' as const,
  content: 'Just a regular message without any markers.',
  timestamp: Date.now(),
};

const messageWithMarkerInCodeBlock = {
  type: 'assistant' as const,
  content: `Here's how markers work:

\`\`\`
<!-- CYCLIST:HANDOFF:/dev -->
\`\`\`

This is just documentation.`,
  timestamp: Date.now(),
};

// ============================================================================
// AC1: HANDOFF marker detection and button rendering
// ============================================================================

describe('AC1: HANDOFF marker → handoff button', () => {
  it('should detect HANDOFF marker in message content', () => {
    render(<QuickActions message={messageWithHandoff} />);

    // Should show a button for the handoff agent
    const button = screen.getByRole('button', { name: /dev/i });
    expect(button).toBeInTheDocument();
  });

  it('should display agent command as button label', () => {
    render(<QuickActions message={messageWithHandoff} />);

    const button = screen.getByRole('button');
    expect(button).toHaveTextContent(/dev/i);
  });

  it('should render "Not yet" alternative option', () => {
    render(<QuickActions message={messageWithHandoff} />);

    const notYetButton = screen.getByRole('button', { name: /not yet/i });
    expect(notYetButton).toBeInTheDocument();
  });

  it('should auto-execute handoff when relay mode is ON', async () => {
    mockElectronAPI.settings.get.mockResolvedValueOnce({
      workflow: { relay_mode: true },
    });

    render(<QuickActions message={messageWithHandoff} />);

    // When relay mode is on, handoff should auto-execute
    await waitFor(() => {
      expect(mockElectronAPI.claude.send).toHaveBeenCalledWith('/dev', []);
    });
  });

  it('should NOT auto-execute when relay mode is OFF', async () => {
    mockElectronAPI.settings.get.mockResolvedValueOnce({
      workflow: { relay_mode: false },
    });

    render(<QuickActions message={messageWithHandoff} />);

    // Wait a tick and verify no auto-send
    await new Promise(r => setTimeout(r, 200));
    expect(mockElectronAPI.claude.send).not.toHaveBeenCalled();
  });
});

// ============================================================================
// AC2: QUESTION:yesno marker → Yes/No buttons
// ============================================================================

describe('AC2: QUESTION:yesno → Yes/No buttons', () => {
  it('should detect QUESTION:yesno marker', () => {
    render(<QuickActions message={messageWithYesNo} />);

    expect(screen.getByRole('button', { name: /yes/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /no/i })).toBeInTheDocument();
  });

  it('should render exactly two buttons for yes/no', () => {
    render(<QuickActions message={messageWithYesNo} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
  });

  it('should send "Yes" when Yes button clicked', () => {
    render(<QuickActions message={messageWithYesNo} />);

    fireEvent.click(screen.getByRole('button', { name: /yes/i }));

    expect(mockElectronAPI.claude.send).toHaveBeenCalledWith('Yes', []);
  });

  it('should send "No" when No button clicked', () => {
    render(<QuickActions message={messageWithYesNo} />);

    fireEvent.click(screen.getByRole('button', { name: /no/i }));

    expect(mockElectronAPI.claude.send).toHaveBeenCalledWith('No', []);
  });
});

// ============================================================================
// AC3: QUESTION:open marker → text input
// ============================================================================

describe('AC3: QUESTION:open → text input', () => {
  it('should detect QUESTION:open marker', () => {
    render(<QuickActions message={messageWithOpenQuestion} />);

    const input = screen.getByRole('textbox');
    expect(input).toBeInTheDocument();
  });

  it('should render text input with submit button', () => {
    render(<QuickActions message={messageWithOpenQuestion} />);

    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit|send/i })).toBeInTheDocument();
  });

  it('should send user input when submitted', () => {
    render(<QuickActions message={messageWithOpenQuestion} />);

    const input = screen.getByRole('textbox');
    const submitBtn = screen.getByRole('button', { name: /submit|send/i });

    fireEvent.change(input, { target: { value: 'MyComponent' } });
    fireEvent.click(submitBtn);

    expect(mockElectronAPI.claude.send).toHaveBeenCalledWith('MyComponent', []);
  });

  it('should submit on Enter key', () => {
    render(<QuickActions message={messageWithOpenQuestion} />);

    const input = screen.getByRole('textbox');

    fireEvent.change(input, { target: { value: 'TestValue' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(mockElectronAPI.claude.send).toHaveBeenCalledWith('TestValue', []);
  });

  it('should not submit empty input', () => {
    render(<QuickActions message={messageWithOpenQuestion} />);

    const submitBtn = screen.getByRole('button', { name: /submit|send/i });
    fireEvent.click(submitBtn);

    expect(mockElectronAPI.claude.send).not.toHaveBeenCalled();
  });
});

// ============================================================================
// AC4: CHOICES marker → choice buttons
// ============================================================================

describe('AC4: CHOICES → choice buttons', () => {
  it('should detect CHOICES marker', () => {
    render(<QuickActions message={messageWithChoices} />);

    expect(screen.getByRole('button', { name: /option a/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /option b/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /option c/i })).toBeInTheDocument();
  });

  it('should render a button for each choice', () => {
    render(<QuickActions message={messageWithChoices} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);
  });

  it('should use choice text as button label', () => {
    render(<QuickActions message={messageWithChoices} />);

    expect(screen.getByText('Option A')).toBeInTheDocument();
    expect(screen.getByText('Option B')).toBeInTheDocument();
    expect(screen.getByText('Option C')).toBeInTheDocument();
  });

  it('should send choice when button clicked', () => {
    render(<QuickActions message={messageWithChoices} />);

    fireEvent.click(screen.getByRole('button', { name: /option b/i }));

    expect(mockElectronAPI.claude.send).toHaveBeenCalledWith('Option B', []);
  });

  it('should handle numeric choices format', () => {
    const numericChoicesMsg = {
      type: 'assistant' as const,
      content: `Pick one:
1. First
2. Second
<!-- CYCLIST:CHOICES:1,2 -->`,
      timestamp: Date.now(),
    };

    render(<QuickActions message={numericChoicesMsg} />);

    // Should extract text from numbered list
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================================
// AC5: CONTINUE marker → Continue button
// ============================================================================

describe('AC5: CONTINUE → Continue button', () => {
  it('should detect CONTINUE marker', () => {
    render(<QuickActions message={messageWithContinue} />);

    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
  });

  it('should render exactly one Continue button', () => {
    render(<QuickActions message={messageWithContinue} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
  });

  it('should send "Continue" when button clicked', () => {
    render(<QuickActions message={messageWithContinue} />);

    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(mockElectronAPI.claude.send).toHaveBeenCalledWith('Continue', []);
  });
});

// ============================================================================
// AC6: Button click actions
// ============================================================================

describe('AC6: Button click wiring', () => {
  it('should call claude.send with button value', () => {
    render(<QuickActions message={messageWithYesNo} />);

    fireEvent.click(screen.getByRole('button', { name: /yes/i }));

    expect(mockElectronAPI.claude.send).toHaveBeenCalledTimes(1);
  });

  it('should disable buttons after click to prevent double-send', () => {
    render(<QuickActions message={messageWithYesNo} />);

    const yesButton = screen.getByRole('button', { name: /yes/i });
    fireEvent.click(yesButton);

    expect(yesButton).toBeDisabled();
  });

  it('should trigger handoff for HANDOFF marker clicks', () => {
    render(<QuickActions message={messageWithHandoff} />);

    fireEvent.click(screen.getByRole('button', { name: /dev/i }));

    expect(mockElectronAPI.claude.send).toHaveBeenCalledWith('/dev', []);
  });

  it('should handle missing electronAPI gracefully', () => {
    delete (window as any).electronAPI;

    // Should not throw
    expect(() => {
      render(<QuickActions message={messageWithYesNo} />);
      fireEvent.click(screen.getByRole('button', { name: /yes/i }));
    }).not.toThrow();
  });
});

// ============================================================================
// AC7: Hide raw marker HTML from display
// ============================================================================

describe('AC7: Hide raw marker HTML', () => {
  it('should not render raw marker comment in visible text', () => {
    render(<QuickActions message={messageWithHandoff} />);

    expect(screen.queryByText(/CYCLIST:HANDOFF/)).not.toBeInTheDocument();
    expect(screen.queryByText('<!-- CYCLIST:HANDOFF:/dev -->')).not.toBeInTheDocument();
  });

  it('should display message content without markers', () => {
    render(<QuickActions message={messageWithHandoff} />);

    // Should show the human-readable fallback text
    expect(screen.getByText(/ready for development/i)).toBeInTheDocument();
  });

  it('should strip all marker types from display', () => {
    const allMarkersMsg = {
      type: 'assistant' as const,
      content: `Test <!-- CYCLIST:HANDOFF:/dev --> and <!-- CYCLIST:QUESTION:yesno --> and <!-- CYCLIST:CONTINUE -->`,
      timestamp: Date.now(),
    };

    render(<QuickActions message={allMarkersMsg} />);

    expect(screen.queryByText(/CYCLIST/)).not.toBeInTheDocument();
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge cases', () => {
  it('should render nothing when no marker detected', () => {
    render(<QuickActions message={messageWithNoMarker} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('should ignore markers inside code blocks', () => {
    render(<QuickActions message={messageWithMarkerInCodeBlock} />);

    // Should not show action buttons - marker is inside code block
    expect(screen.queryByRole('button', { name: /dev/i })).not.toBeInTheDocument();
  });

  it('should handle empty message content', () => {
    const emptyMsg = { type: 'assistant' as const, content: '', timestamp: Date.now() };

    expect(() => render(<QuickActions message={emptyMsg} />)).not.toThrow();
  });

  it('should handle null/undefined content', () => {
    const nullMsg = { type: 'assistant' as const, content: undefined, timestamp: Date.now() };

    expect(() => render(<QuickActions message={nullMsg as any} />)).not.toThrow();
  });

  it('should handle malformed marker gracefully', () => {
    const malformedMsg = {
      type: 'assistant' as const,
      content: '<!-- CYCLIST:INVALID:badvalue -->',
      timestamp: Date.now(),
    };

    expect(() => render(<QuickActions message={malformedMsg} />)).not.toThrow();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('should handle multiple markers - use primary (first) marker', () => {
    const multiMarkerMsg = {
      type: 'assistant' as const,
      content: `<!-- CYCLIST:QUESTION:yesno -->
<!-- CYCLIST:CONTINUE -->`,
      timestamp: Date.now(),
    };

    render(<QuickActions message={multiMarkerMsg} />);

    // Should use first marker (QUESTION:yesno)
    expect(screen.getByRole('button', { name: /yes/i })).toBeInTheDocument();
  });
});

// ============================================================================
// useMarkerActions Hook Tests
// ============================================================================

describe('useMarkerActions hook', () => {
  // Test component to exercise the hook
  function TestHookComponent({ content }: { content: string }) {
    const actions = useMarkerActions(content);
    return (
      <div data-testid="hook-result">
        <span data-testid="type">{actions?.type ?? 'none'}</span>
        <span data-testid="value">{actions?.value ?? 'none'}</span>
        <span data-testid="responses">{actions?.responses?.join(',') ?? 'none'}</span>
      </div>
    );
  }

  it('should return null for content without markers', () => {
    render(<TestHookComponent content="No markers here" />);

    expect(screen.getByTestId('type')).toHaveTextContent('none');
  });

  it('should detect handoff type', () => {
    render(<TestHookComponent content="<!-- CYCLIST:HANDOFF:/sm -->" />);

    expect(screen.getByTestId('type')).toHaveTextContent('handoff');
    expect(screen.getByTestId('value')).toHaveTextContent('/sm');
  });

  it('should detect question yesno type', () => {
    render(<TestHookComponent content="<!-- CYCLIST:QUESTION:yesno -->" />);

    expect(screen.getByTestId('type')).toHaveTextContent('yesno');
    expect(screen.getByTestId('responses')).toHaveTextContent('Yes,No');
  });

  it('should detect question open type', () => {
    render(<TestHookComponent content="<!-- CYCLIST:QUESTION:open -->" />);

    expect(screen.getByTestId('type')).toHaveTextContent('open');
  });

  it('should detect choices type and parse options', () => {
    render(<TestHookComponent content="<!-- CYCLIST:CHOICES:A,B,C -->" />);

    expect(screen.getByTestId('type')).toHaveTextContent('choices');
    expect(screen.getByTestId('responses')).toHaveTextContent('A,B,C');
  });

  it('should detect continue type', () => {
    render(<TestHookComponent content="<!-- CYCLIST:CONTINUE -->" />);

    expect(screen.getByTestId('type')).toHaveTextContent('continue');
    expect(screen.getByTestId('responses')).toHaveTextContent('Continue');
  });

  it('should be case-insensitive for marker type', () => {
    render(<TestHookComponent content="<!-- cyclist:handoff:/dev -->" />);

    expect(screen.getByTestId('type')).toHaveTextContent('handoff');
  });

  it('should strip code blocks before detection', () => {
    render(
      <TestHookComponent
        content={`\`\`\`
<!-- CYCLIST:HANDOFF:/dev -->
\`\`\``}
      />
    );

    expect(screen.getByTestId('type')).toHaveTextContent('none');
  });
});

// ============================================================================
// Integration with MessagePanel
// ============================================================================

describe('MessagePanel integration', () => {
  // Note: These tests verify the QuickActions component is properly
  // integrated into the message display flow

  it('should render QuickActions after last assistant message', async () => {
    // This test will be more comprehensive once wired into MessagePanel
    // For now, verify QuickActions can be used standalone
    const { container } = render(<QuickActions message={messageWithHandoff} />);

    expect(container.querySelector('.quick-actions')).toBeInTheDocument();
  });

  it('should apply quick-actions CSS class for styling', () => {
    const { container } = render(<QuickActions message={messageWithYesNo} />);

    expect(container.querySelector('.quick-actions')).toBeInTheDocument();
  });

  it('should position buttons at end of message', () => {
    const { container } = render(<QuickActions message={messageWithContinue} />);

    // QuickActions container should exist
    const quickActions = container.querySelector('.quick-actions');
    expect(quickActions).toBeInTheDocument();
  });
});
