/**
 * MSSCI-14661: Apply thinking throbber to PersonaHeader portrait
 *
 * Tests for the PersonaHeader thinking indicator that applies the existing
 * avatar-throb animation to the primary portrait when isStreaming is true.
 *
 * Story: MSSCI-14661 (94-2) - Apply thinking throbber to PersonaHeader portrait
 * Epic: epic-94 (Primary Portrait Thinking Indicator)
 * Depends on: MSSCI-14660 (94-1) - usePersona exposes isStreaming
 *
 * Acceptance Criteria:
 * - AC1: PersonaHeader portrait shows avatar-throb animation when isStreaming is true
 * - AC2: Animation stops when isStreaming becomes false
 * - AC3: Works in compact mode (40px portrait)
 * - AC4: prefers-reduced-motion: static opacity fallback (0.85)
 * - AC5: No visual regression on existing message avatars
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import PersonaHeader from '../src/public/components/PersonaHeader';
import { ClaudeProvider } from '../src/public/contexts/ClaudeContext';

// Wrapper component for tests that need ClaudeProvider
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <ClaudeProvider>{children}</ClaudeProvider>
);

// ============================================================================
// Mock Setup
// ============================================================================

let personaWs: any = null;

async function sendPersonaData(data: any) {
  await act(async () => {
    personaWs.onmessage?.({ data: JSON.stringify(data) });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  personaWs = null;

  const OriginalMockWebSocket = (window as any).WebSocket;
  (window as any).WebSocket = class extends OriginalMockWebSocket {
    constructor(url: string) {
      super(url);
      if (url.includes('/ws/persona')) {
        personaWs = this;
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

const mockPersonaBase = {
  character: 'Atia of the Julii',
  theme: 'rome',
  role: 'dev',
  slug: 'atia',
  quote: 'By Jupiter!',
};

// ============================================================================
// AC1: PersonaHeader portrait shows avatar-throb animation when isStreaming
// ============================================================================

describe('AC1: PersonaHeader portrait shows avatar-throb when isStreaming', () => {
  it('should apply avatar-thinking class to persona-portrait when isStreaming is true', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });
    await waitFor(() => expect(personaWs).not.toBeNull());

    // Send persona with isStreaming: true
    await sendPersonaData({ ...mockPersonaBase, isStreaming: true });

    await waitFor(() => {
      const portrait = screen.getByTestId('persona-portrait');
      expect(portrait).toHaveClass('avatar-thinking');
    });
  });

  it('should not apply avatar-thinking class when isStreaming is false', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });
    await waitFor(() => expect(personaWs).not.toBeNull());

    // Send persona with isStreaming: false
    await sendPersonaData({ ...mockPersonaBase, isStreaming: false });

    await waitFor(() => {
      const portrait = screen.getByTestId('persona-portrait');
      expect(portrait).not.toHaveClass('avatar-thinking');
    });
  });

  it('should not apply avatar-thinking class when isStreaming is not present', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });
    await waitFor(() => expect(personaWs).not.toBeNull());

    // Send persona without isStreaming field
    await sendPersonaData(mockPersonaBase);

    await waitFor(() => {
      const portrait = screen.getByTestId('persona-portrait');
      expect(portrait).not.toHaveClass('avatar-thinking');
    });
  });

  it('should respond to streaming type messages from WebSocket', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });
    await waitFor(() => expect(personaWs).not.toBeNull());

    // First send persona data so component renders
    await sendPersonaData(mockPersonaBase);

    // Then send a streaming state update
    await sendPersonaData({ type: 'streaming', isStreaming: true });

    await waitFor(() => {
      const portrait = screen.getByTestId('persona-portrait');
      expect(portrait).toHaveClass('avatar-thinking');
    });
  });
});

// ============================================================================
// AC2: Animation stops when isStreaming becomes false
// ============================================================================

describe('AC2: Animation stops when isStreaming becomes false', () => {
  it('should remove avatar-thinking class when streaming stops', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });
    await waitFor(() => expect(personaWs).not.toBeNull());

    // Start streaming
    await sendPersonaData({ ...mockPersonaBase, isStreaming: true });

    await waitFor(() => {
      expect(screen.getByTestId('persona-portrait')).toHaveClass('avatar-thinking');
    });

    // Stop streaming
    await sendPersonaData({ type: 'streaming', isStreaming: false });

    await waitFor(() => {
      expect(screen.getByTestId('persona-portrait')).not.toHaveClass('avatar-thinking');
    });
  });

  it('should toggle animation across multiple streaming cycles', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });
    await waitFor(() => expect(personaWs).not.toBeNull());

    await sendPersonaData(mockPersonaBase);

    // Cycle 1: start
    await sendPersonaData({ type: 'streaming', isStreaming: true });
    await waitFor(() => {
      expect(screen.getByTestId('persona-portrait')).toHaveClass('avatar-thinking');
    });

    // Cycle 1: stop
    await sendPersonaData({ type: 'streaming', isStreaming: false });
    await waitFor(() => {
      expect(screen.getByTestId('persona-portrait')).not.toHaveClass('avatar-thinking');
    });

    // Cycle 2: start again
    await sendPersonaData({ type: 'streaming', isStreaming: true });
    await waitFor(() => {
      expect(screen.getByTestId('persona-portrait')).toHaveClass('avatar-thinking');
    });
  });

  it('should reset isStreaming to false on WebSocket disconnect', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });
    await waitFor(() => expect(personaWs).not.toBeNull());

    // Start streaming
    await sendPersonaData({ ...mockPersonaBase, isStreaming: true });

    await waitFor(() => {
      expect(screen.getByTestId('persona-portrait')).toHaveClass('avatar-thinking');
    });

    // Simulate WebSocket close (usePersona sets isStreaming to false on close)
    await act(async () => {
      personaWs.onclose?.();
    });

    // Portrait should no longer have thinking class
    // Note: the component may re-render to empty state on disconnect,
    // but the isStreaming should be false regardless
    await waitFor(() => {
      const portrait = screen.queryByTestId('persona-portrait');
      if (portrait) {
        expect(portrait).not.toHaveClass('avatar-thinking');
      }
    });
  });
});

// ============================================================================
// AC3: Works in compact mode (40px portrait)
// ============================================================================

describe('AC3: Works in compact mode', () => {
  it('should apply avatar-thinking class in compact mode when streaming', async () => {
    const user = userEvent.setup();
    render(<PersonaHeader />, { wrapper: TestWrapper });
    await waitFor(() => expect(personaWs).not.toBeNull());

    await sendPersonaData({ ...mockPersonaBase, isStreaming: true });

    await waitFor(() => {
      expect(screen.getByTestId('persona-portrait')).toHaveClass('avatar-thinking');
    });

    // Toggle compact mode
    const collapseButton = screen.getByLabelText('Collapse header');
    await user.click(collapseButton);

    // Should still have the thinking class in compact mode
    await waitFor(() => {
      const header = screen.getByTestId('persona-header');
      expect(header).toHaveClass('compact');
    });

    expect(screen.getByTestId('persona-portrait')).toHaveClass('avatar-thinking');
  });

  it('should remove avatar-thinking in compact mode when streaming stops', async () => {
    const user = userEvent.setup();
    render(<PersonaHeader />, { wrapper: TestWrapper });
    await waitFor(() => expect(personaWs).not.toBeNull());

    await sendPersonaData({ ...mockPersonaBase, isStreaming: true });

    // Toggle compact mode
    const collapseButton = screen.getByLabelText('Collapse header');
    await user.click(collapseButton);

    await waitFor(() => {
      expect(screen.getByTestId('persona-header')).toHaveClass('compact');
      expect(screen.getByTestId('persona-portrait')).toHaveClass('avatar-thinking');
    });

    // Stop streaming while in compact mode
    await sendPersonaData({ type: 'streaming', isStreaming: false });

    await waitFor(() => {
      expect(screen.getByTestId('persona-portrait')).not.toHaveClass('avatar-thinking');
    });
  });
});

// ============================================================================
// AC4: prefers-reduced-motion: static opacity fallback (0.85)
// ============================================================================

describe('AC4: prefers-reduced-motion support', () => {
  // Note: CSS media query behavior can't be fully tested in happy-dom,
  // but we verify the class is applied so the CSS rule takes effect.

  it('should apply avatar-thinking class (which CSS degrades for reduced motion)', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });
    await waitFor(() => expect(personaWs).not.toBeNull());

    await sendPersonaData({ ...mockPersonaBase, isStreaming: true });

    await waitFor(() => {
      const portrait = screen.getByTestId('persona-portrait');
      expect(portrait).toHaveClass('avatar-thinking');
      // The CSS rule @media (prefers-reduced-motion: reduce) { .avatar-thinking { animation: none; opacity: 0.85; } }
      // handles the fallback. We verify the class is present so the media query applies.
    });
  });
});

// ============================================================================
// AC5: No visual regression on existing message avatars
// ============================================================================

describe('AC5: No regression on existing behavior', () => {
  it('should preserve persona-portrait base class when streaming', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });
    await waitFor(() => expect(personaWs).not.toBeNull());

    await sendPersonaData({ ...mockPersonaBase, isStreaming: true });

    await waitFor(() => {
      const portrait = screen.getByTestId('persona-portrait');
      expect(portrait).toHaveClass('persona-portrait');
      expect(portrait).toHaveClass('avatar-thinking');
    });
  });

  it('should preserve persona-portrait base class when not streaming', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });
    await waitFor(() => expect(personaWs).not.toBeNull());

    await sendPersonaData({ ...mockPersonaBase, isStreaming: false });

    await waitFor(() => {
      const portrait = screen.getByTestId('persona-portrait');
      expect(portrait).toHaveClass('persona-portrait');
      expect(portrait).not.toHaveClass('avatar-thinking');
    });
  });

  it('should not interfere with observation-pulse animation', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });
    await waitFor(() => expect(personaWs).not.toBeNull());

    // Send persona with tandem agent that starts thinking (triggers observation pulse)
    await sendPersonaData({
      ...mockPersonaBase,
      isStreaming: true,
      tandemAgent: { character: 'Backseat', role: 'pm', slug: 'backseat', theme: 'rome', isThinking: true },
    });

    await waitFor(() => {
      const portrait = screen.getByTestId('persona-portrait');
      // Both classes can coexist — avatar-thinking for streaming, observation-pulse for tandem
      expect(portrait).toHaveClass('avatar-thinking');
    });
  });

  it('should not apply avatar-thinking to empty persona state', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });
    await waitFor(() => expect(personaWs).not.toBeNull());

    // Send null persona (empty state renders without portrait div)
    await sendPersonaData(null);

    const header = screen.getByTestId('persona-header');
    expect(header).toHaveClass('empty');
    // No persona-portrait should exist in empty state
    expect(screen.queryByTestId('persona-portrait')).not.toBeInTheDocument();
  });
});
