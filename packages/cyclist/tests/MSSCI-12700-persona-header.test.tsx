/**
 * MSSCI-12700: PersonaHeader Component Tests
 *
 * Tests for the PersonaHeader component that displays current agent persona.
 * Story: MSSCI-12700 - PersonaHeader Component
 * Epic: epic-69 (Core Conversation Experience)
 *
 * Requirements:
 * - Display character name, theme, and role
 * - Update when persona changes
 * - Handle missing/undefined persona gracefully
 * - Accessible with proper ARIA labels
 *
 * Acceptance Criteria:
 * - AC1: PersonaHeader displays current agent character name
 * - AC2: PersonaHeader displays current theme name
 * - AC3: PersonaHeader displays agent role/title
 * - AC4: Component updates when persona changes
 * - AC5: Component handles missing/undefined persona gracefully
 * - AC6: Accessible with proper ARIA labels
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import React from 'react';

// Component and hook to be implemented
import PersonaHeader from '../src/public/components/PersonaHeader';
import { usePersona } from '../src/public/hooks/usePersona';
import { ClaudeProvider } from '../src/public/contexts/ClaudeContext';

// Wrapper component for tests that need ClaudeProvider
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <ClaudeProvider>{children}</ClaudeProvider>
);

// ============================================================================
// Mock Setup
// ============================================================================

// Track WebSocket instance for sending messages
let personaWs: any = null;

// Helper to send persona data via WebSocket
async function sendPersonaData(data: any) {
  await act(async () => {
    personaWs.onmessage?.({ data: JSON.stringify(data) });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  personaWs = null;

  // Override WebSocket mock to track instance
  const OriginalMockWebSocket = (window as any).WebSocket;
  (window as any).WebSocket = class extends OriginalMockWebSocket {
    constructor(url: string) {
      super(url);
      // Track persona WebSocket
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

const mockPersonaRome = {
  character: 'Atia of the Julii',
  theme: 'rome',
  role: 'Test Engineer',
};

const mockPersonaTrek = {
  character: 'Captain Picard',
  theme: 'star-trek-tng',
  role: 'Developer',
};

const mockPersonaMinimal = {
  character: 'Agent',
  theme: 'default',
  role: 'dev',
};

// ============================================================================
// AC1: PersonaHeader displays current agent character name
// ============================================================================

describe('AC1: PersonaHeader displays current agent character name', () => {
  it('should render PersonaHeader component without crashing', () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });
    expect(screen.getByTestId('persona-header')).toBeInTheDocument();
  });

  it('should display character name from persona data', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });

    await waitFor(() => expect(personaWs).not.toBeNull());

    await act(async () => {
      await sendPersonaData(mockPersonaRome);
    });

    await waitFor(() => {
      expect(screen.getByTestId('persona-character')).toHaveTextContent('Atia of the Julii');
    });
  });

  it('should render character name in prominent position', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });

    await waitFor(() => expect(personaWs).not.toBeNull());

    await sendPersonaData(mockPersonaRome);

    await waitFor(() => {
      const character = screen.getByTestId('persona-character');
      expect(character).toBeInTheDocument();
      expect(character.className).toMatch(/character|name|title/i);
    });
  });

  it('should wrap character name in tooltip trigger for hover tooltip', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });

    await waitFor(() => expect(personaWs).not.toBeNull());

    await sendPersonaData(mockPersonaRome);

    await waitFor(() => {
      const characterEl = screen.getByTestId('persona-character');
      // Radix TooltipTrigger adds data-state attribute to wrapped elements
      expect(characterEl).toHaveAttribute('data-state');
      // The element still displays the full character name
      expect(characterEl).toHaveTextContent('Atia of the Julii');
    });
  });
});

// ============================================================================
// AC2: PersonaHeader displays current theme name
// ============================================================================

describe('AC2: PersonaHeader displays current theme name', () => {
  it('should display humanized theme name from persona data', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });

    await waitFor(() => expect(personaWs).not.toBeNull());

    await sendPersonaData(mockPersonaRome);

    await waitFor(() => {
      // "rome" should be humanized to "Rome"
      expect(screen.getByTestId('persona-theme')).toHaveTextContent('Rome');
    });
  });

  it('should display formatted theme name for multi-word themes', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });

    await waitFor(() => expect(personaWs).not.toBeNull());

    await sendPersonaData(mockPersonaTrek);

    await waitFor(() => {
      // "star-trek-tng" should be humanized to "Star Trek Tng"
      const themeEl = screen.getByTestId('persona-theme');
      expect(themeEl.textContent).toMatch(/Star Trek Tng/i);
    });
  });

  it('should wrap theme name in tooltip trigger for hover tooltip', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });

    await waitFor(() => expect(personaWs).not.toBeNull());

    await sendPersonaData(mockPersonaRome);

    await waitFor(() => {
      const themeEl = screen.getByTestId('persona-theme');
      // Radix TooltipTrigger adds data-state attribute to wrapped elements
      expect(themeEl).toHaveAttribute('data-state');
      // The element still displays the humanized theme name
      expect(themeEl).toHaveTextContent('Rome');
    });
  });
});

// ============================================================================
// AC3: PersonaHeader displays agent role/title
// ============================================================================

describe('AC3: PersonaHeader displays agent role/title', () => {
  it('should display role from persona data', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });

    await waitFor(() => expect(personaWs).not.toBeNull());

    await sendPersonaData(mockPersonaRome);

    await waitFor(() => {
      expect(screen.getByTestId('persona-role')).toHaveTextContent('Test Engineer');
    });
  });

  it('should display short role identifiers correctly', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });

    await waitFor(() => expect(personaWs).not.toBeNull());

    await sendPersonaData(mockPersonaMinimal);

    await waitFor(() => {
      expect(screen.getByTestId('persona-role')).toHaveTextContent('DEV');
    });
  });

  it('should wrap role in tooltip trigger for hover tooltip', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });

    await waitFor(() => expect(personaWs).not.toBeNull());

    await sendPersonaData(mockPersonaRome);

    await waitFor(() => {
      const roleEl = screen.getByTestId('persona-role');
      // Radix TooltipTrigger adds data-state attribute to wrapped elements
      expect(roleEl).toHaveAttribute('data-state');
      // Roles without AGENT_ABBREV mapping display the full role name
      expect(roleEl).toHaveTextContent('Test Engineer');
    });
  });

  it('should apply role-specific styling class', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });

    await waitFor(() => expect(personaWs).not.toBeNull());

    await sendPersonaData(mockPersonaRome);

    await waitFor(() => {
      const roleEl = screen.getByTestId('persona-role');
      expect(roleEl.className).toMatch(/role|badge/i);
    });
  });
});

// ============================================================================
// AC4: Component updates when persona changes
// ============================================================================

describe('AC4: Component updates when persona changes', () => {
  it('should subscribe to persona updates on mount', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });
    await waitFor(() => {
      expect(personaWs).not.toBeNull();
    });
  });

  it('should update character when persona update callback fires', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });

    await waitFor(() => expect(personaWs).not.toBeNull());

    // Send initial persona
    await sendPersonaData(mockPersonaRome);

    await waitFor(() => {
      expect(screen.getByTestId('persona-character')).toHaveTextContent('Atia of the Julii');
    });

    // Send updated persona
    await sendPersonaData(mockPersonaTrek);

    await waitFor(() => {
      expect(screen.getByTestId('persona-character')).toHaveTextContent('Captain Picard');
    });
  });

  it('should update theme when persona update callback fires', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });

    await waitFor(() => expect(personaWs).not.toBeNull());

    await sendPersonaData(mockPersonaTrek);

    await waitFor(() => {
      // "star-trek-tng" should be humanized to "Star Trek Tng"
      expect(screen.getByTestId('persona-theme')).toHaveTextContent(/Star Trek Tng/i);
    });
  });

  it('should update role when persona update callback fires', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });

    await waitFor(() => expect(personaWs).not.toBeNull());

    await sendPersonaData(mockPersonaTrek);

    await waitFor(() => {
      expect(screen.getByTestId('persona-role')).toHaveTextContent('Developer');
    });
  });
});

// ============================================================================
// AC5: Component handles missing/undefined persona gracefully
// ============================================================================

describe('AC5: Component handles missing/undefined persona gracefully', () => {
  it('should render without crashing when persona is null', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });

    await waitFor(() => expect(personaWs).not.toBeNull());

    await sendPersonaData(null);

    // Should render empty state (header with 'empty' class)
    const header = screen.getByTestId('persona-header');
    expect(header).toBeInTheDocument();
    expect(header).toHaveClass('empty');
  });

  it('should render without crashing when persona is undefined', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });

    // Without sending any message, persona remains null
    // Should render empty state (header with 'empty' class)
    const header = screen.getByTestId('persona-header');
    expect(header).toBeInTheDocument();
    expect(header).toHaveClass('empty');
  });

  it('should show empty state when character is missing', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });

    await waitFor(() => expect(personaWs).not.toBeNull());

    await sendPersonaData({ theme: 'rome', role: 'dev', character: null });

    // Component hides when character is missing (empty state)
    await waitFor(() => {
      const header = screen.getByTestId('persona-header');
      expect(header).toHaveClass('empty');
    });
  });

  it('should show default theme when theme is missing', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });

    await waitFor(() => expect(personaWs).not.toBeNull());

    await sendPersonaData({ character: 'Test', role: 'dev', theme: null });

    await waitFor(() => {
      const theme = screen.getByTestId('persona-theme');
      expect(theme.textContent).toMatch(/default/i);
    });
  });

  it('should show default role when role is missing', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });

    await waitFor(() => expect(personaWs).not.toBeNull());

    await sendPersonaData({ character: 'Test', theme: 'rome', role: null });

    await waitFor(() => {
      const role = screen.getByTestId('persona-role');
      expect(role.textContent).toMatch(/agent/i);
    });
  });

  it('should handle API errors gracefully', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });

    // Should not crash, should show empty state even without WebSocket connection
    expect(screen.getByTestId('persona-header')).toBeInTheDocument();
  });
});

// ============================================================================
// AC6: Accessible with proper ARIA labels
// ============================================================================

describe('AC6: Accessible with proper ARIA labels', () => {
  it('should have aria-label on persona-header container when populated', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });

    await waitFor(() => expect(personaWs).not.toBeNull());

    await sendPersonaData(mockPersonaRome);

    await waitFor(() => {
      const header = screen.getByTestId('persona-header');
      expect(header).toHaveAttribute('aria-label');
    });
  });

  it('should have descriptive aria-label including persona info', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });

    await waitFor(() => expect(personaWs).not.toBeNull());

    await sendPersonaData(mockPersonaRome);

    await waitFor(() => {
      const header = screen.getByTestId('persona-header');
      const ariaLabel = header.getAttribute('aria-label');
      expect(ariaLabel).toMatch(/persona|agent|character/i);
    });
  });

  it('should have role attribute for semantic meaning when populated', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });

    await waitFor(() => expect(personaWs).not.toBeNull());

    await sendPersonaData(mockPersonaRome);

    await waitFor(() => {
      const header = screen.getByTestId('persona-header');
      expect(header).toHaveAttribute('role', 'button');
    });
  });

  it('should have aria-live for announcing updates to screen readers when populated', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });

    await waitFor(() => expect(personaWs).not.toBeNull());

    await sendPersonaData(mockPersonaRome);

    await waitFor(() => {
      const header = screen.getByTestId('persona-header');
      expect(header).toHaveAttribute('aria-live', 'polite');
    });
  });
});

// ============================================================================
// usePersona Hook Tests
// ============================================================================

describe('usePersona Hook', () => {
  const TestComponent = () => {
    const { persona, isLoading, error } = usePersona();
    return (
      <div>
        <div data-testid="character-value">{persona?.character}</div>
        <div data-testid="theme-value">{persona?.theme}</div>
        <div data-testid="role-value">{persona?.role}</div>
        <div data-testid="loading-state">{isLoading.toString()}</div>
        {error && <div data-testid="error">{error.message}</div>}
      </div>
    );
  };

  it('should fetch initial persona data on mount', async () => {
    render(<TestComponent />);

    await waitFor(() => {
      expect(personaWs).not.toBeNull();
    });
  });

  it('should provide persona character', async () => {
    render(<TestComponent />);

    await waitFor(() => expect(personaWs).not.toBeNull());

    await sendPersonaData(mockPersonaRome);

    await waitFor(() => {
      expect(screen.getByTestId('character-value')).toHaveTextContent('Atia of the Julii');
    });
  });

  it('should provide persona theme', async () => {
    render(<TestComponent />);

    await waitFor(() => expect(personaWs).not.toBeNull());

    await sendPersonaData(mockPersonaRome);

    await waitFor(() => {
      expect(screen.getByTestId('theme-value')).toHaveTextContent('rome');
    });
  });

  it('should provide persona role', async () => {
    render(<TestComponent />);

    await waitFor(() => expect(personaWs).not.toBeNull());

    await sendPersonaData(mockPersonaRome);

    await waitFor(() => {
      expect(screen.getByTestId('role-value')).toHaveTextContent('Test Engineer');
    });
  });

  it('should track loading state', async () => {
    render(<TestComponent />);

    // Initially loading
    expect(screen.getByTestId('loading-state')).toHaveTextContent('true');

    await waitFor(() => expect(personaWs).not.toBeNull());

    // Send persona data
    await sendPersonaData(mockPersonaRome);

    await waitFor(() => {
      expect(screen.getByTestId('loading-state')).toHaveTextContent('false');
    });
  });

  it('should handle API errors and expose error state', async () => {
    render(<TestComponent />);

    await waitFor(() => expect(personaWs).not.toBeNull());

    // Simulate WebSocket error
    personaWs.onerror?.(new Error('WebSocket connection failed'));

    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent('WebSocket connection failed');
    });
  });

  it('should subscribe to persona updates', async () => {
    render(<TestComponent />);
    await waitFor(() => {
      expect(personaWs).not.toBeNull();
    });
  });
});

// ============================================================================
// Layout Tests
// ============================================================================

describe('Layout and Structure', () => {
  it('should have persona-header as root element', () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });
    expect(screen.getByTestId('persona-header')).toBeInTheDocument();
  });

  it('should contain all three persona elements within header', async () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });

    await waitFor(() => expect(personaWs).not.toBeNull());

    await sendPersonaData(mockPersonaRome);

    await waitFor(() => {
      const header = screen.getByTestId('persona-header');
      expect(header.querySelector('[data-testid="persona-character"]')).toBeInTheDocument();
      expect(header.querySelector('[data-testid="persona-theme"]')).toBeInTheDocument();
      expect(header.querySelector('[data-testid="persona-role"]')).toBeInTheDocument();
    });
  });

  it('should apply persona-header class for styling', () => {
    render(<PersonaHeader />, { wrapper: TestWrapper });
    expect(screen.getByTestId('persona-header')).toHaveClass('persona-header');
  });
});
