/**
 * MSSCI-15128: Tandem Mode Portrait — Branding Image Swap
 *
 * Tests for PersonaHeader branding image behavior when tandem mode is active.
 * Story: 86-17 - Tandem mode portrait: ImageMagick theme variations + swap indicator
 * Epic: epic-86 (Agent Collaboration — Tandem to Teams)
 *
 * Acceptance Criteria:
 * - AC4: Cyclist UI displays tandem portrait when tandem consultation is active
 * - AC5: Falls back to standard portrait when tandem mode is inactive
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
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
  character: 'Jack Torrance',
  theme: 'stephen-king',
  role: 'dev',
  slug: 'jack-44431',
  quote: 'All work and no play...',
};

const mockTandemAgent = {
  character: 'Andy Dufresne',
  role: 'architect',
  slug: 'andy-54342',
  theme: 'stephen-king',
  isThinking: false,
};

const mockPersonaWithTandem = {
  ...mockPersonaBase,
  tandemAgent: mockTandemAgent,
};

const mockPersonaWithoutTandem = {
  ...mockPersonaBase,
  tandemAgent: null,
};

// ============================================================================
// AC4: Cyclist UI displays tandem portrait when tandem consultation is active
// ============================================================================

describe('AC4: Branding image swaps to tandem variant when tandem is active', () => {
  it('should display tandem branding image when tandemAgent is present', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });

    await waitFor(() => expect(personaWs).not.toBeNull());

    await sendPersonaData(mockPersonaWithTandem);

    await waitFor(() => {
      const brandingImg = screen.getByAltText('Cyclist') as HTMLImageElement;
      expect(brandingImg.src).toContain('tandem');
    });
  });

  it('should include theme name in tandem branding image path', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });

    await waitFor(() => expect(personaWs).not.toBeNull());

    await sendPersonaData(mockPersonaWithTandem);

    await waitFor(() => {
      const brandingImg = screen.getByAltText('Cyclist') as HTMLImageElement;
      // Tandem branding should be theme-specific: /portraits/{theme}/medium/cyclist-tandem.png
      expect(brandingImg.src).toContain('stephen-king');
    });
  });

  it('should update branding when tandem agent activates mid-session', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });

    await waitFor(() => expect(personaWs).not.toBeNull());

    // Start without tandem
    await sendPersonaData(mockPersonaWithoutTandem);

    await waitFor(() => {
      const brandingImg = screen.getByAltText('Cyclist') as HTMLImageElement;
      expect(brandingImg.src).not.toContain('tandem');
    });

    // Activate tandem
    await sendPersonaData(mockPersonaWithTandem);

    await waitFor(() => {
      const brandingImg = screen.getByAltText('Cyclist') as HTMLImageElement;
      expect(brandingImg.src).toContain('tandem');
    });
  });

  it('should use tandem branding for any theme with tandem agent', async () => {
    const montyPythonPersona = {
      character: 'The Announcer',
      theme: 'monty-python',
      role: 'sm',
      slug: 'announcer-44441',
      tandemAgent: {
        character: 'The Architect',
        role: 'architect',
        slug: 'architect-33333',
        theme: 'monty-python',
        isThinking: false,
      },
    };

    render(<PersonaHeader />, { wrapper: TestWrapper });

    await waitFor(() => expect(personaWs).not.toBeNull());

    await sendPersonaData(montyPythonPersona);

    await waitFor(() => {
      const brandingImg = screen.getByAltText('Cyclist') as HTMLImageElement;
      expect(brandingImg.src).toContain('tandem');
      expect(brandingImg.src).toContain('monty-python');
    });
  });
});

// ============================================================================
// AC5: Falls back to standard portrait when tandem mode is inactive
// ============================================================================

describe('AC5: Branding falls back to standard when tandem is inactive', () => {
  it('should display standard cyclist branding when no tandem agent', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });

    await waitFor(() => expect(personaWs).not.toBeNull());

    await sendPersonaData(mockPersonaWithoutTandem);

    await waitFor(() => {
      const brandingImg = screen.getByAltText('Cyclist') as HTMLImageElement;
      // Standard branding: /images/cyclist-dark.png or /images/cyclist-light.png
      expect(brandingImg.src).toMatch(/cyclist-(dark|light)\.png/);
      expect(brandingImg.src).not.toContain('tandem');
    });
  });

  it('should revert to standard branding when tandem agent deactivates', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });

    await waitFor(() => expect(personaWs).not.toBeNull());

    // Start with tandem
    await sendPersonaData(mockPersonaWithTandem);

    await waitFor(() => {
      const brandingImg = screen.getByAltText('Cyclist') as HTMLImageElement;
      expect(brandingImg.src).toContain('tandem');
    });

    // Deactivate tandem
    await sendPersonaData(mockPersonaWithoutTandem);

    await waitFor(() => {
      const brandingImg = screen.getByAltText('Cyclist') as HTMLImageElement;
      expect(brandingImg.src).not.toContain('tandem');
      expect(brandingImg.src).toMatch(/cyclist-(dark|light)\.png/);
    });
  });

  it('should use standard branding when tandemAgent is undefined', async () => {
    const personaNoTandemField = {
      character: 'Jack Torrance',
      theme: 'stephen-king',
      role: 'dev',
      slug: 'jack-44431',
      // tandemAgent field absent entirely
    };

    render(<PersonaHeader />, { wrapper: TestWrapper });

    await waitFor(() => expect(personaWs).not.toBeNull());

    await sendPersonaData(personaNoTandemField);

    await waitFor(() => {
      const brandingImg = screen.getByAltText('Cyclist') as HTMLImageElement;
      expect(brandingImg.src).toMatch(/cyclist-(dark|light)\.png/);
      expect(brandingImg.src).not.toContain('tandem');
    });
  });

  it('should preserve dark/light mode when standard branding is shown', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });

    await waitFor(() => expect(personaWs).not.toBeNull());

    await sendPersonaData(mockPersonaWithoutTandem);

    await waitFor(() => {
      const brandingImg = screen.getByAltText('Cyclist') as HTMLImageElement;
      // Should still respect color scheme
      expect(brandingImg.src).toMatch(/cyclist-(dark|light)\.png/);
    });
  });
});
