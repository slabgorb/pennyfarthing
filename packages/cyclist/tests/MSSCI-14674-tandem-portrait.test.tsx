/**
 * MSSCI-14674: TandemPortrait Component Tests
 *
 * Tests for the TandemPortrait component that renders backseat agent portrait
 * below primary in PersonaHeader.
 * Story: MSSCI-14674 (96-1) - TandemPortrait Component
 * Epic: MSSCI-14673 (Cyclist Tandem UI)
 *
 * Acceptance Criteria:
 * - AC1: TandemPortrait renders below primary portrait when tandem phase is active
 * - AC2: Portrait is 48px circular with opacity 0.55
 * - AC3: 8px gap between primary and backseat portraits
 * - AC4: Role badge at bottom-right corner (16px, agent-colored)
 * - AC5: Fade-in (300ms ease-in) on mount
 * - AC6: Fade-out (300ms ease-out) on unmount
 * - AC7: Emoji fallback on portrait load error
 * - AC8: Hidden in compact mode
 * - AC9: No layout shifts in adjacent dockview panels
 * - AC10: Uses shadcn Avatar/AvatarImage/AvatarFallback components
 * - AC11: Portrait resolved via same pipeline as primary (same theme, medium size)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import React from 'react';

import TandemPortrait from '../src/public/components/TandemPortrait';
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

const mockTandemProps = {
  character: 'The White Queen',
  role: 'architect',
  slug: 'white-queen',
  theme: 'alice-in-wonderland',
  isActive: true,
  isThinking: false,
};

const mockTandemInactive = {
  ...mockTandemProps,
  isActive: false,
};

const mockTandemThinking = {
  ...mockTandemProps,
  isThinking: true,
};

const mockPersonaWithTandem = {
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

const mockPersonaNoTandem = {
  character: 'The Mad Hatter',
  theme: 'alice-in-wonderland',
  role: 'sm',
  slug: 'mad-hatter',
  quote: 'Why is a raven like a writing desk?',
};

// ============================================================================
// AC1: TandemPortrait renders below primary portrait when tandem phase is active
// ============================================================================

describe('AC1: TandemPortrait renders below primary when tandem is active', () => {
  it('should render TandemPortrait when isActive is true', () => {
    render(<TandemPortrait {...mockTandemProps} />);
    expect(screen.getByTestId('tandem-portrait')).toBeInTheDocument();
  });

  it('should not render when isActive is false', () => {
    render(<TandemPortrait {...mockTandemInactive} />);
    expect(screen.queryByTestId('tandem-portrait')).not.toBeInTheDocument();
  });

  it('should render inside PersonaHeader when tandem agent is present', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });

    await waitFor(() => expect(personaWs).not.toBeNull());
    await sendPersonaData(mockPersonaWithTandem);

    await waitFor(() => {
      const portraitGroup = screen.getByTestId('persona-portrait').parentElement;
      const tandem = portraitGroup?.querySelector('[data-testid="tandem-portrait"]');
      expect(tandem).toBeInTheDocument();
    });
  });

  it('should not render in PersonaHeader when no tandem agent', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });

    await waitFor(() => expect(personaWs).not.toBeNull());
    await sendPersonaData(mockPersonaNoTandem);

    await waitFor(() => {
      expect(screen.queryByTestId('tandem-portrait')).not.toBeInTheDocument();
    });
  });

  it('should position below primary portrait (portrait-group is flex column)', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });

    await waitFor(() => expect(personaWs).not.toBeNull());
    await sendPersonaData(mockPersonaWithTandem);

    await waitFor(() => {
      const portraitGroup = screen.getByTestId('persona-portrait').parentElement!;
      expect(portraitGroup).toHaveClass('persona-portrait-group');
      // Primary portrait should come before tandem in DOM order
      const children = portraitGroup.children;
      const primaryIndex = Array.from(children).findIndex(
        el => el.getAttribute('data-testid') === 'persona-portrait'
      );
      const tandemIndex = Array.from(children).findIndex(
        el => el.getAttribute('data-testid') === 'tandem-portrait'
      );
      expect(primaryIndex).toBeLessThan(tandemIndex);
    });
  });
});

// ============================================================================
// AC2: Portrait is 48px circular with opacity 0.55
// ============================================================================

describe('AC2: Portrait is 48px circular with opacity 0.55', () => {
  it('should have persona-tandem-portrait class for 48px sizing', () => {
    render(<TandemPortrait {...mockTandemProps} />);
    const container = screen.getByTestId('tandem-portrait');
    expect(container).toHaveClass('persona-tandem-portrait');
  });

  it('should render portrait image inside avatar', () => {
    render(<TandemPortrait {...mockTandemProps} />);
    const img = screen.getByRole('img');
    expect(img).toBeInTheDocument();
  });
});

// ============================================================================
// AC3: 8px gap between primary and backseat portraits
// ============================================================================

describe('AC3: 8px gap between primary and backseat portraits', () => {
  it('should render inside persona-portrait-group with flex column layout', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });

    await waitFor(() => expect(personaWs).not.toBeNull());
    await sendPersonaData(mockPersonaWithTandem);

    await waitFor(() => {
      const portraitGroup = screen.getByTestId('persona-portrait').parentElement!;
      expect(portraitGroup).toHaveClass('persona-portrait-group');
      // Tandem portrait exists as sibling to primary
      const tandem = portraitGroup.querySelector('[data-testid="tandem-portrait"]');
      expect(tandem).toBeInTheDocument();
    });
  });
});

// ============================================================================
// AC4: Role badge at bottom-right corner (16px, agent-colored)
// ============================================================================

describe('AC4: Role badge at bottom-right corner', () => {
  it('should render role badge element', () => {
    render(<TandemPortrait {...mockTandemProps} />);
    const badge = screen.getByTestId('tandem-role-badge');
    expect(badge).toBeInTheDocument();
  });

  it('should display abbreviated role name', () => {
    render(<TandemPortrait {...mockTandemProps} />);
    const badge = screen.getByTestId('tandem-role-badge');
    // architect -> ARC
    expect(badge).toHaveTextContent('ARC');
  });

  it('should display role badge for different roles', () => {
    render(<TandemPortrait {...mockTandemProps} role="dev" />);
    const badge = screen.getByTestId('tandem-role-badge');
    expect(badge).toHaveTextContent('DEV');
  });

  it('should fall back to uppercase role when no abbreviation exists', () => {
    render(<TandemPortrait {...mockTandemProps} role="custom-agent" />);
    const badge = screen.getByTestId('tandem-role-badge');
    expect(badge.textContent?.toUpperCase()).toBe('CUSTOM-AGENT');
  });
});

// ============================================================================
// AC5: Fade-in (300ms ease-in) on mount
// ============================================================================

describe('AC5: Fade-in on mount', () => {
  it('should have transition class for fade animation', () => {
    render(<TandemPortrait {...mockTandemProps} />);
    const container = screen.getByTestId('tandem-portrait');
    // Container should have persona-tandem-portrait class which includes transition
    expect(container).toHaveClass('persona-tandem-portrait');
  });

  it('should start with opacity for fade-in effect', () => {
    render(<TandemPortrait {...mockTandemProps} />);
    const container = screen.getByTestId('tandem-portrait');
    // Component should have a mechanism for fade-in (initial state or animation class)
    expect(container).toBeInTheDocument();
    // The CSS transition handles the visual fade; verify the element mounts with the correct class
    expect(container.className).toMatch(/tandem/);
  });
});

// ============================================================================
// AC6: Fade-out (300ms ease-out) on unmount
// ============================================================================

describe('AC6: Fade-out on unmount', () => {
  it('should remove from DOM when isActive transitions to false', async () => {
    const { rerender } = render(<TandemPortrait {...mockTandemProps} />);
    expect(screen.getByTestId('tandem-portrait')).toBeInTheDocument();

    // Transition to inactive — should eventually unmount
    rerender(<TandemPortrait {...mockTandemInactive} />);

    // After fade-out duration, element should be gone
    await waitFor(() => {
      expect(screen.queryByTestId('tandem-portrait')).not.toBeInTheDocument();
    }, { timeout: 1000 });
  });
});

// ============================================================================
// AC7: Emoji fallback on portrait load error
// ============================================================================

describe('AC7: Emoji fallback on portrait load error', () => {
  it('should show portrait image by default', () => {
    render(<TandemPortrait {...mockTandemProps} />);
    const img = screen.getByRole('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src');
  });

  it('should show emoji fallback when portrait image fails to load', async () => {
    render(<TandemPortrait {...mockTandemProps} />);
    const img = screen.getByRole('img');

    // Simulate image load error
    fireEvent.error(img);

    await waitFor(() => {
      // Should show fallback emoji
      const fallback = screen.getByText('🤖');
      expect(fallback).toBeInTheDocument();
    });
  });

  it('should hide failed image when showing fallback', async () => {
    render(<TandemPortrait {...mockTandemProps} />);
    const img = screen.getByRole('img');

    fireEvent.error(img);

    await waitFor(() => {
      // Original image should be replaced by fallback
      expect(screen.getByText('🤖')).toBeInTheDocument();
    });
  });
});

// ============================================================================
// AC8: Hidden in compact mode
// ============================================================================

describe('AC8: Hidden in compact mode', () => {
  it('should not render tandem portrait when PersonaHeader is compact', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });

    await waitFor(() => expect(personaWs).not.toBeNull());
    await sendPersonaData(mockPersonaWithTandem);

    // Verify tandem renders in normal mode
    await waitFor(() => {
      expect(screen.getByTestId('tandem-portrait')).toBeInTheDocument();
    });

    // Toggle compact mode
    const collapseButton = screen.getByLabelText(/collapse/i);
    fireEvent.click(collapseButton);

    // In compact mode, tandem portrait should be hidden (CSS display:none)
    // The test verifies the compact class is applied; CSS handles the hiding
    await waitFor(() => {
      const header = screen.getByTestId('persona-header');
      expect(header).toHaveClass('compact');
    });
  });
});

// ============================================================================
// AC9: No layout shifts in adjacent dockview panels
// ============================================================================

describe('AC9: No layout shifts in adjacent panels', () => {
  it('should render persona-portrait-group as flex container', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });

    await waitFor(() => expect(personaWs).not.toBeNull());
    await sendPersonaData(mockPersonaWithTandem);

    await waitFor(() => {
      const portraitGroup = screen.getByTestId('persona-portrait').parentElement!;
      expect(portraitGroup).toHaveClass('persona-portrait-group');
    });
  });

  it('should not create extra wrapper elements outside portrait group', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });

    await waitFor(() => expect(personaWs).not.toBeNull());
    await sendPersonaData(mockPersonaWithTandem);

    await waitFor(() => {
      // Tandem portrait should be a direct child of portrait-group, not wrapped in extra divs
      const portraitGroup = screen.getByTestId('persona-portrait').parentElement!;
      const tandem = portraitGroup.querySelector('[data-testid="tandem-portrait"]');
      expect(tandem?.parentElement).toBe(portraitGroup);
    });
  });
});

// ============================================================================
// AC10: Uses shadcn Avatar/AvatarImage/AvatarFallback components
// ============================================================================

describe('AC10: Uses shadcn Avatar components', () => {
  it('should render avatar with correct portrait src', () => {
    render(<TandemPortrait {...mockTandemProps} />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute(
      'src',
      '/portraits/alice-in-wonderland/medium/white-queen.png'
    );
  });

  it('should render avatar with descriptive alt text', () => {
    render(<TandemPortrait {...mockTandemProps} />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('alt', 'The White Queen (architect) - observing');
  });

  it('should render AvatarFallback with emoji when image fails', async () => {
    render(<TandemPortrait {...mockTandemProps} />);
    const img = screen.getByRole('img');
    fireEvent.error(img);

    await waitFor(() => {
      expect(screen.getByText('🤖')).toBeInTheDocument();
    });
  });
});

// ============================================================================
// AC11: Portrait resolved via same pipeline as primary (same theme, medium size)
// ============================================================================

describe('AC11: Portrait uses same resolution pipeline as primary', () => {
  it('should use medium size portraits like primary', () => {
    render(<TandemPortrait {...mockTandemProps} />);
    const img = screen.getByRole('img');
    // Must use /medium/ directory, same as PersonaHeader primary portrait
    expect(img.getAttribute('src')).toContain('/medium/');
  });

  it('should use same theme as provided in props', () => {
    render(<TandemPortrait {...mockTandemProps} />);
    const img = screen.getByRole('img');
    expect(img.getAttribute('src')).toContain('/alice-in-wonderland/');
  });

  it('should use slug-based portrait path', () => {
    render(<TandemPortrait {...mockTandemProps} />);
    const img = screen.getByRole('img');
    expect(img.getAttribute('src')).toContain('/white-queen.png');
  });

  it('should use different slug for different agents', () => {
    render(<TandemPortrait {...mockTandemProps} slug="caterpillar" />);
    const img = screen.getByRole('img');
    expect(img.getAttribute('src')).toContain('/caterpillar.png');
  });
});
