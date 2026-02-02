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
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// Component and hook to be implemented
import PersonaHeader from '../src/public/components/PersonaHeader';
import { usePersona } from '../src/public/hooks/usePersona';

// ============================================================================
// Mock Setup
// ============================================================================

const mockElectronAPI = {
  persona: {
    get: vi.fn(() => Promise.resolve({
      character: 'Titus Pullo',
      theme: 'rome',
      role: 'Scrum Master',
    })),
    onUpdate: vi.fn(),
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
    render(<PersonaHeader />);
    expect(screen.getByTestId('persona-header')).toBeInTheDocument();
  });

  it('should display character name from persona data', async () => {
    mockElectronAPI.persona.get.mockResolvedValue(mockPersonaRome);
    render(<PersonaHeader />);

    await waitFor(() => {
      expect(screen.getByTestId('persona-character')).toHaveTextContent('Atia of the Julii');
    });
  });

  it('should render character name in prominent position', async () => {
    mockElectronAPI.persona.get.mockResolvedValue(mockPersonaRome);
    render(<PersonaHeader />);

    await waitFor(() => {
      const character = screen.getByTestId('persona-character');
      expect(character).toBeInTheDocument();
      expect(character.className).toMatch(/character|name|title/i);
    });
  });

  it('should have title attribute with full character name', async () => {
    mockElectronAPI.persona.get.mockResolvedValue(mockPersonaRome);
    render(<PersonaHeader />);

    await waitFor(() => {
      expect(screen.getByTestId('persona-character')).toHaveAttribute('title', 'Atia of the Julii');
    });
  });
});

// ============================================================================
// AC2: PersonaHeader displays current theme name
// ============================================================================

describe('AC2: PersonaHeader displays current theme name', () => {
  it('should display humanized theme name from persona data', async () => {
    mockElectronAPI.persona.get.mockResolvedValue(mockPersonaRome);
    render(<PersonaHeader />);

    await waitFor(() => {
      // "rome" should be humanized to "Rome"
      expect(screen.getByTestId('persona-theme')).toHaveTextContent('Rome');
    });
  });

  it('should display formatted theme name for multi-word themes', async () => {
    mockElectronAPI.persona.get.mockResolvedValue(mockPersonaTrek);
    render(<PersonaHeader />);

    await waitFor(() => {
      // "star-trek-tng" should be humanized to "Star Trek Tng"
      const themeEl = screen.getByTestId('persona-theme');
      expect(themeEl.textContent).toMatch(/Star Trek Tng/i);
    });
  });

  it('should have title attribute with theme name', async () => {
    mockElectronAPI.persona.get.mockResolvedValue(mockPersonaRome);
    render(<PersonaHeader />);

    await waitFor(() => {
      expect(screen.getByTestId('persona-theme')).toHaveAttribute('title', expect.stringContaining('rome'));
    });
  });
});

// ============================================================================
// AC3: PersonaHeader displays agent role/title
// ============================================================================

describe('AC3: PersonaHeader displays agent role/title', () => {
  it('should display role from persona data', async () => {
    mockElectronAPI.persona.get.mockResolvedValue(mockPersonaRome);
    render(<PersonaHeader />);

    await waitFor(() => {
      expect(screen.getByTestId('persona-role')).toHaveTextContent('Test Engineer');
    });
  });

  it('should display short role identifiers correctly', async () => {
    mockElectronAPI.persona.get.mockResolvedValue(mockPersonaMinimal);
    render(<PersonaHeader />);

    await waitFor(() => {
      expect(screen.getByTestId('persona-role')).toHaveTextContent('dev');
    });
  });

  it('should have title attribute with full role name', async () => {
    mockElectronAPI.persona.get.mockResolvedValue(mockPersonaRome);
    render(<PersonaHeader />);

    await waitFor(() => {
      expect(screen.getByTestId('persona-role')).toHaveAttribute('title', 'Test Engineer');
    });
  });

  it('should apply role-specific styling class', async () => {
    mockElectronAPI.persona.get.mockResolvedValue(mockPersonaRome);
    render(<PersonaHeader />);

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
  it('should subscribe to persona updates on mount', () => {
    render(<PersonaHeader />);
    expect(mockElectronAPI.persona.onUpdate).toHaveBeenCalled();
  });

  it('should update character when persona update callback fires', async () => {
    render(<PersonaHeader />);

    await waitFor(() => {
      expect(mockElectronAPI.persona.onUpdate).toHaveBeenCalled();
    });

    const callback = mockElectronAPI.persona.onUpdate.mock.calls[0][0];
    callback(null, mockPersonaTrek);

    await waitFor(() => {
      expect(screen.getByTestId('persona-character')).toHaveTextContent('Captain Picard');
    });
  });

  it('should update theme when persona update callback fires', async () => {
    render(<PersonaHeader />);

    await waitFor(() => {
      expect(mockElectronAPI.persona.onUpdate).toHaveBeenCalled();
    });

    const callback = mockElectronAPI.persona.onUpdate.mock.calls[0][0];
    callback(null, mockPersonaTrek);

    await waitFor(() => {
      // "star-trek-tng" should be humanized to "Star Trek Tng"
      expect(screen.getByTestId('persona-theme')).toHaveTextContent(/Star Trek Tng/i);
    });
  });

  it('should update role when persona update callback fires', async () => {
    render(<PersonaHeader />);

    await waitFor(() => {
      expect(mockElectronAPI.persona.onUpdate).toHaveBeenCalled();
    });

    const callback = mockElectronAPI.persona.onUpdate.mock.calls[0][0];
    callback(null, mockPersonaTrek);

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
    mockElectronAPI.persona.get.mockResolvedValue(null);
    render(<PersonaHeader />);

    // Should render empty state (header with 'empty' class)
    const header = screen.getByTestId('persona-header');
    expect(header).toBeInTheDocument();
    expect(header).toHaveClass('empty');
  });

  it('should render without crashing when persona is undefined', async () => {
    mockElectronAPI.persona.get.mockResolvedValue(undefined);
    render(<PersonaHeader />);

    // Should render empty state (header with 'empty' class)
    const header = screen.getByTestId('persona-header');
    expect(header).toBeInTheDocument();
    expect(header).toHaveClass('empty');
  });

  it('should show empty state when character is missing', async () => {
    mockElectronAPI.persona.get.mockResolvedValue({ theme: 'rome', role: 'dev' });
    render(<PersonaHeader />);

    // Component hides when character is missing (empty state)
    await waitFor(() => {
      const header = screen.getByTestId('persona-header');
      expect(header).toHaveClass('empty');
    });
  });

  it('should show default theme when theme is missing', async () => {
    mockElectronAPI.persona.get.mockResolvedValue({ character: 'Test', role: 'dev' });
    render(<PersonaHeader />);

    await waitFor(() => {
      const theme = screen.getByTestId('persona-theme');
      expect(theme.textContent).toMatch(/default/i);
    });
  });

  it('should show default role when role is missing', async () => {
    mockElectronAPI.persona.get.mockResolvedValue({ character: 'Test', theme: 'rome' });
    render(<PersonaHeader />);

    await waitFor(() => {
      const role = screen.getByTestId('persona-role');
      expect(role.textContent).toMatch(/agent/i);
    });
  });

  it('should handle API errors gracefully', async () => {
    mockElectronAPI.persona.get.mockRejectedValue(new Error('API Error'));
    render(<PersonaHeader />);

    // Should not crash, should show empty state
    expect(screen.getByTestId('persona-header')).toBeInTheDocument();
  });
});

// ============================================================================
// AC6: Accessible with proper ARIA labels
// ============================================================================

describe('AC6: Accessible with proper ARIA labels', () => {
  it('should have aria-label on persona-header container when populated', async () => {
    mockElectronAPI.persona.get.mockResolvedValue(mockPersonaRome);
    render(<PersonaHeader />);

    await waitFor(() => {
      const header = screen.getByTestId('persona-header');
      expect(header).toHaveAttribute('aria-label');
    });
  });

  it('should have descriptive aria-label including persona info', async () => {
    mockElectronAPI.persona.get.mockResolvedValue(mockPersonaRome);
    render(<PersonaHeader />);

    await waitFor(() => {
      const header = screen.getByTestId('persona-header');
      const ariaLabel = header.getAttribute('aria-label');
      expect(ariaLabel).toMatch(/persona|agent|character/i);
    });
  });

  it('should have role attribute for semantic meaning when populated', async () => {
    mockElectronAPI.persona.get.mockResolvedValue(mockPersonaRome);
    render(<PersonaHeader />);

    await waitFor(() => {
      const header = screen.getByTestId('persona-header');
      expect(header).toHaveAttribute('role', 'banner');
    });
  });

  it('should have aria-live for announcing updates to screen readers when populated', async () => {
    mockElectronAPI.persona.get.mockResolvedValue(mockPersonaRome);
    render(<PersonaHeader />);

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
      expect(mockElectronAPI.persona.get).toHaveBeenCalled();
    });
  });

  it('should provide persona character', async () => {
    mockElectronAPI.persona.get.mockResolvedValue(mockPersonaRome);
    render(<TestComponent />);

    await waitFor(() => {
      expect(screen.getByTestId('character-value')).toHaveTextContent('Atia of the Julii');
    });
  });

  it('should provide persona theme', async () => {
    mockElectronAPI.persona.get.mockResolvedValue(mockPersonaRome);
    render(<TestComponent />);

    await waitFor(() => {
      expect(screen.getByTestId('theme-value')).toHaveTextContent('rome');
    });
  });

  it('should provide persona role', async () => {
    mockElectronAPI.persona.get.mockResolvedValue(mockPersonaRome);
    render(<TestComponent />);

    await waitFor(() => {
      expect(screen.getByTestId('role-value')).toHaveTextContent('Test Engineer');
    });
  });

  it('should track loading state', async () => {
    let resolvePromise: (value: any) => void;
    mockElectronAPI.persona.get.mockImplementation(() => new Promise(resolve => {
      resolvePromise = resolve;
    }));

    render(<TestComponent />);

    expect(screen.getByTestId('loading-state')).toHaveTextContent('true');

    resolvePromise!(mockPersonaRome);

    await waitFor(() => {
      expect(screen.getByTestId('loading-state')).toHaveTextContent('false');
    });
  });

  it('should handle API errors and expose error state', async () => {
    mockElectronAPI.persona.get.mockRejectedValue(new Error('Persona API Error'));
    render(<TestComponent />);

    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent('Persona API Error');
    });
  });

  it('should subscribe to persona updates', () => {
    render(<TestComponent />);
    expect(mockElectronAPI.persona.onUpdate).toHaveBeenCalled();
  });
});

// ============================================================================
// Layout Tests
// ============================================================================

describe('Layout and Structure', () => {
  it('should have persona-header as root element', () => {
    render(<PersonaHeader />);
    expect(screen.getByTestId('persona-header')).toBeInTheDocument();
  });

  it('should contain all three persona elements within header', async () => {
    mockElectronAPI.persona.get.mockResolvedValue(mockPersonaRome);
    render(<PersonaHeader />);

    await waitFor(() => {
      const header = screen.getByTestId('persona-header');
      expect(header.querySelector('[data-testid="persona-character"]')).toBeInTheDocument();
      expect(header.querySelector('[data-testid="persona-theme"]')).toBeInTheDocument();
      expect(header.querySelector('[data-testid="persona-role"]')).toBeInTheDocument();
    });
  });

  it('should apply persona-header class for styling', () => {
    render(<PersonaHeader />);
    expect(screen.getByTestId('persona-header')).toHaveClass('persona-header');
  });
});
