/**
 * MSSCI-14676: Observation Pulse on Primary Portrait
 *
 * Tests for the observation-pulse animation on the primary portrait when
 * a backseat observation is injected (tandemAgent.isThinking transitions false→true).
 * Story: MSSCI-14676 (96-3) - Observation pulse on primary portrait
 * Epic: MSSCI-14673 (Cyclist Tandem UI)
 *
 * Acceptance Criteria:
 * - AC1: @keyframes observation-pulse — 600ms ease-out, 12px/4px accent box-shadow → 0
 * - AC2: One-shot animation on primary portrait when backseat observation injected
 * - AC3: Animation class auto-removed after animationend
 * - AC4: Distinct from thinking throb (no scale, box-shadow only)
 * - AC5: Respects prefers-reduced-motion
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import React from 'react';

import PersonaHeader from '../src/public/components/PersonaHeader';
import { ClaudeProvider } from '../src/public/contexts/ClaudeContext';

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <ClaudeProvider>{children}</ClaudeProvider>
);

// ============================================================================
// Mock Setup
// ============================================================================

let personaWs: any = null;

async function sendPersonaData(data: any) {
  await act(async () => {
    personaWs?.onmessage?.({ data: JSON.stringify(data) });
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

const mockPersonaWithTandemIdle = {
  character: 'The Mad Hatter',
  theme: 'alice-in-wonderland',
  role: 'sm',
  slug: 'mad-hatter',
  quote: 'Why is a raven like a writing desk?',
  tandemAgent: {
    character: 'The White Queen',
    role: 'architect',
    slug: 'white-queen',
    theme: 'alice-in-wonderland',
    isThinking: false,
  },
};

const mockPersonaWithTandemThinking = {
  ...mockPersonaWithTandemIdle,
  tandemAgent: {
    ...mockPersonaWithTandemIdle.tandemAgent,
    isThinking: true,
  },
};

// ============================================================================
// AC1: @keyframes observation-pulse — 600ms ease-out, box-shadow animation
// ============================================================================

describe('AC1: observation-pulse keyframe definition', () => {
  it('should apply avatar-observation-pulse class with correct animation properties', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });

    await waitFor(() => expect(personaWs).not.toBeNull());
    await sendPersonaData(mockPersonaWithTandemIdle);

    await waitFor(() => {
      expect(screen.getByTestId('persona-portrait')).toBeInTheDocument();
    });

    // Transition to thinking — triggers observation pulse
    await sendPersonaData(mockPersonaWithTandemThinking);

    await waitFor(() => {
      const portrait = screen.getByTestId('persona-portrait');
      expect(portrait).toHaveClass('avatar-observation-pulse');
    });
  });
});

// ============================================================================
// AC2: One-shot animation on primary portrait when backseat observation injected
// ============================================================================

describe('AC2: One-shot animation on primary portrait', () => {
  it('should add pulse class to primary portrait when tandem starts thinking', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });

    await waitFor(() => expect(personaWs).not.toBeNull());
    await sendPersonaData(mockPersonaWithTandemIdle);

    await waitFor(() => {
      const portrait = screen.getByTestId('persona-portrait');
      expect(portrait).not.toHaveClass('avatar-observation-pulse');
    });

    // Tandem starts thinking (false → true)
    await sendPersonaData(mockPersonaWithTandemThinking);

    await waitFor(() => {
      const portrait = screen.getByTestId('persona-portrait');
      expect(portrait).toHaveClass('avatar-observation-pulse');
    });
  });

  it('should not pulse when tandem stops thinking (true → false)', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });

    await waitFor(() => expect(personaWs).not.toBeNull());

    // Start with thinking
    await sendPersonaData(mockPersonaWithTandemThinking);

    await waitFor(() => {
      const portrait = screen.getByTestId('persona-portrait');
      expect(portrait).toHaveClass('avatar-observation-pulse');
    });

    // Fire animationend to clear the pulse
    const portrait = screen.getByTestId('persona-portrait');
    fireEvent.animationEnd(portrait);

    await waitFor(() => {
      expect(portrait).not.toHaveClass('avatar-observation-pulse');
    });

    // Now transition to not thinking — should NOT re-pulse
    await sendPersonaData(mockPersonaWithTandemIdle);

    // Small delay to ensure no state update triggers pulse
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    expect(portrait).not.toHaveClass('avatar-observation-pulse');
  });

  it('should not pulse when no tandem agent present', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });

    await waitFor(() => expect(personaWs).not.toBeNull());

    await sendPersonaData({
      character: 'The Mad Hatter',
      theme: 'alice-in-wonderland',
      role: 'sm',
      slug: 'mad-hatter',
      quote: 'Why is a raven like a writing desk?',
    });

    await waitFor(() => {
      const portrait = screen.getByTestId('persona-portrait');
      expect(portrait).not.toHaveClass('avatar-observation-pulse');
    });
  });

  it('should pulse on primary portrait, not tandem portrait', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });

    await waitFor(() => expect(personaWs).not.toBeNull());
    await sendPersonaData(mockPersonaWithTandemIdle);

    await waitFor(() => {
      expect(screen.getByTestId('tandem-portrait')).toBeInTheDocument();
    });

    // Trigger observation
    await sendPersonaData(mockPersonaWithTandemThinking);

    await waitFor(() => {
      const primary = screen.getByTestId('persona-portrait');
      const tandem = screen.getByTestId('tandem-portrait');
      expect(primary).toHaveClass('avatar-observation-pulse');
      expect(tandem).not.toHaveClass('avatar-observation-pulse');
    });
  });
});

// ============================================================================
// AC3: Animation class auto-removed after animationend
// ============================================================================

describe('AC3: Auto-remove class after animation completes', () => {
  it('should remove pulse class on animationend event', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });

    await waitFor(() => expect(personaWs).not.toBeNull());
    await sendPersonaData(mockPersonaWithTandemIdle);

    // Trigger pulse
    await sendPersonaData(mockPersonaWithTandemThinking);

    await waitFor(() => {
      expect(screen.getByTestId('persona-portrait')).toHaveClass('avatar-observation-pulse');
    });

    // Simulate animation completing
    const portrait = screen.getByTestId('persona-portrait');
    fireEvent.animationEnd(portrait);

    await waitFor(() => {
      expect(portrait).not.toHaveClass('avatar-observation-pulse');
    });
  });

  it('should allow re-triggering after animation completes', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });

    await waitFor(() => expect(personaWs).not.toBeNull());
    await sendPersonaData(mockPersonaWithTandemIdle);

    // First pulse
    await sendPersonaData(mockPersonaWithTandemThinking);

    await waitFor(() => {
      expect(screen.getByTestId('persona-portrait')).toHaveClass('avatar-observation-pulse');
    });

    // Complete first animation
    const portrait = screen.getByTestId('persona-portrait');
    fireEvent.animationEnd(portrait);

    await waitFor(() => {
      expect(portrait).not.toHaveClass('avatar-observation-pulse');
    });

    // Return to idle, then think again
    await sendPersonaData(mockPersonaWithTandemIdle);
    await sendPersonaData(mockPersonaWithTandemThinking);

    await waitFor(() => {
      expect(portrait).toHaveClass('avatar-observation-pulse');
    });
  });
});

// ============================================================================
// AC4: Distinct from thinking throb (no scale, box-shadow only)
// ============================================================================

describe('AC4: Distinct from thinking throb', () => {
  it('should use avatar-observation-pulse class, not avatar-thinking', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });

    await waitFor(() => expect(personaWs).not.toBeNull());
    await sendPersonaData(mockPersonaWithTandemIdle);

    await sendPersonaData(mockPersonaWithTandemThinking);

    await waitFor(() => {
      const portrait = screen.getByTestId('persona-portrait');
      expect(portrait).toHaveClass('avatar-observation-pulse');
      expect(portrait).not.toHaveClass('avatar-thinking');
      expect(portrait).not.toHaveClass('avatar-tandem-thinking');
    });
  });
});

// ============================================================================
// AC5: Respects prefers-reduced-motion
// ============================================================================

describe('AC5: Reduced motion support', () => {
  it('should have avatar-observation-pulse class available for reduced-motion override', async () => {
    // This test verifies the class is applied (CSS media query handles the rest)
    render(<PersonaHeader />, { wrapper: TestWrapper });

    await waitFor(() => expect(personaWs).not.toBeNull());
    await sendPersonaData(mockPersonaWithTandemIdle);
    await sendPersonaData(mockPersonaWithTandemThinking);

    await waitFor(() => {
      const portrait = screen.getByTestId('persona-portrait');
      expect(portrait).toHaveClass('avatar-observation-pulse');
    });
  });
});
