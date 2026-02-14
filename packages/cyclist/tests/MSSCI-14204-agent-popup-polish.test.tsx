/**
 * MSSCI-14204: Agent Popup Visual Polish Tests
 *
 * Tests for fixing the panel detail popup size jumping and small images.
 * Story: MSSCI-14204 - Panel detail popup jumps in size and uses small images
 * Epic: epic-76 (Dockview Panel Migration)
 *
 * Bug observed:
 * - Dialog box jumps in size when hovering different panel names
 * - Content length variations cause layout shift
 * - Popup uses small/thumbnail images instead of larger detail images
 *
 * Acceptance Criteria:
 * - AC1: Popup maintains consistent size when hovering different panels
 * - AC2: No layout shift or jumping when moving mouse between panel names
 * - AC3: Panel preview images are larger/more detailed
 * - AC4: Smooth visual experience when browsing panel list
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';

import { AgentPopup } from '../src/public/components/AgentPopup';
import { ClaudeProvider } from '../src/public/contexts/ClaudeContext';

// ============================================================================
// Test Fixtures
// ============================================================================

// Agent with short content (minimal text)
const shortContentAgent = {
  role: 'dev',
  character: 'Alice',
  shortName: 'alice',
  style: 'Brief.',
  background: 'Developer.',
  quirks: [],
  slug: 'alice-33333',
  lift: 0.5,
};

// Agent with very long content (lots of text that could cause layout shift)
const longContentAgent = {
  role: 'pm',
  character: 'Bartholomew Fitzgerald Montgomery III',
  shortName: 'bart',
  style: 'Extremely verbose and detailed communication style with multiple clauses and extensive elaboration on every point made during discussions.',
  background: 'A seasoned product manager with decades of experience across multiple industries including fintech, healthcare, telecommunications, and enterprise software development who brings a wealth of knowledge.',
  quirks: [
    'Always uses exactly three examples',
    'References obscure historical figures',
    'Speaks in elaborate metaphors about sailing ships',
    'Never uses contractions in formal settings',
    'Prefers written communication over verbal',
  ],
  slug: 'bart-55555',
  lift: 1.2,
  ocean: { O: 5, C: 4, E: 4, A: 3, N: 2 },
};

// Agent with medium content
const mediumContentAgent = {
  role: 'tea',
  character: 'Sam Seaborn',
  shortName: 'sam',
  style: 'Precise and methodical testing approach.',
  background: 'Test engineer who believes every test matters.',
  quirks: ['Writes prose-like test names', 'Catches edge cases others miss'],
  slug: 'sam-44432',
  lift: 0.8,
};

const mockThemeData = {
  theme: 'west-wing',
  themeName: 'The West Wing',
  tier: 'S' as const,
  agents: [shortContentAgent, mediumContentAgent, longContentAgent],
};

// Mock fetch for theme data
const mockFetch = vi.fn();

// Wrapper component for tests that need ClaudeProvider
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <ClaudeProvider>{children}</ClaudeProvider>
);

// ============================================================================
// Setup & Teardown
// ============================================================================

beforeEach(() => {
  vi.clearAllMocks();

  // Mock fetch to return theme data
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(mockThemeData),
  });
  global.fetch = mockFetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================================
// AC1: Popup maintains consistent size when hovering different panels
// ============================================================================

describe('AC1: Popup maintains consistent size when hovering different panels', () => {
  it('should have a fixed min-height on the details panel to prevent shrinking', async () => {
    render(
      <TestWrapper>
        <AgentPopup
          isOpen={true}
          onClose={() => {}}
          currentRole="dev"
          currentTheme="west-wing"
        />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByTestId('agent-popup-details')).toBeInTheDocument();
    });

    const detailsPanel = screen.getByTestId('agent-popup-details');
    const styles = window.getComputedStyle(detailsPanel);

    // Details panel should have a minimum height to prevent shrinking
    // This ensures consistent popup size regardless of content length
    expect(styles.minHeight).not.toBe('');
    expect(parseInt(styles.minHeight)).toBeGreaterThanOrEqual(300);
  });

  it('should maintain the same dimensions when switching between agents with different content lengths', async () => {
    render(
      <TestWrapper>
        <AgentPopup
          isOpen={true}
          onClose={() => {}}
          currentRole="dev"
          currentTheme="west-wing"
        />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    const popup = screen.getByRole('dialog');
    const initialRect = popup.getBoundingClientRect();

    // Hover over agent with long content - use roster items to find the PM agent
    const rosterItems = screen.getAllByRole('option');
    const pmItem = rosterItems.find(item => item.textContent?.includes('Bartholomew'));

    expect(pmItem).toBeDefined();
    fireEvent.mouseEnter(pmItem!);

    // Wait for preview to update
    await waitFor(() => {
      expect(screen.getByTestId('popup-detail-style')).toBeInTheDocument();
    }, { timeout: 300 });

    const afterLongRect = popup.getBoundingClientRect();

    // Dimensions should remain the same (within 1px tolerance for subpixel rendering)
    expect(Math.abs(afterLongRect.height - initialRect.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(afterLongRect.width - initialRect.width)).toBeLessThanOrEqual(1);
  });

  it('should have overflow handling on the details panel instead of expanding', async () => {
    render(
      <TestWrapper>
        <AgentPopup
          isOpen={true}
          onClose={() => {}}
          currentRole="dev"
          currentTheme="west-wing"
        />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByTestId('agent-popup-details')).toBeInTheDocument();
    });

    const detailsPanel = screen.getByTestId('agent-popup-details');
    const styles = window.getComputedStyle(detailsPanel);

    // Should have overflow scroll or auto, not visible
    expect(['auto', 'scroll', 'hidden']).toContain(styles.overflowY);
    expect(styles.overflowY).not.toBe('visible');
  });
});

// ============================================================================
// AC2: No layout shift or jumping when moving mouse between panel names
// ============================================================================

describe('AC2: No layout shift or jumping when moving mouse between panel names', () => {
  it('should have a fixed max-height on the details panel to prevent growing', async () => {
    render(
      <TestWrapper>
        <AgentPopup
          isOpen={true}
          onClose={() => {}}
          currentRole="dev"
          currentTheme="west-wing"
        />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByTestId('agent-popup-details')).toBeInTheDocument();
    });

    const detailsPanel = screen.getByTestId('agent-popup-details');
    const styles = window.getComputedStyle(detailsPanel);

    // Details panel should have a max-height to prevent growing beyond container
    expect(styles.maxHeight).not.toBe('none');
  });

  it('should use CSS to constrain content areas to fixed heights', async () => {
    render(
      <TestWrapper>
        <AgentPopup
          isOpen={true}
          onClose={() => {}}
          currentRole="dev"
          currentTheme="west-wing"
        />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Check that text content areas have line-clamping or fixed height
    const styleDetail = screen.getByTestId('popup-detail-style');
    const backgroundDetail = screen.getByTestId('popup-detail-background');

    const styleStyles = window.getComputedStyle(styleDetail);
    const bgStyles = window.getComputedStyle(backgroundDetail);

    // Should either have max-height, or line-clamp, or overflow hidden
    const hasConstraint = (s: CSSStyleDeclaration) =>
      s.maxHeight !== 'none' ||
      s.overflow === 'hidden' ||
      (s as any).webkitLineClamp !== '';

    expect(hasConstraint(styleStyles) || hasConstraint(bgStyles)).toBe(true);
  });

  it('should truncate long quirks list instead of expanding the container', async () => {
    render(
      <TestWrapper>
        <AgentPopup
          isOpen={true}
          onClose={() => {}}
          currentRole="pm"
          currentTheme="west-wing"
        />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Hover over agent with many quirks - use the roster item instead of text match
    // because the text appears in both the roster and the details
    const rosterItems = screen.getAllByRole('option');
    const pmItem = rosterItems.find(item => item.textContent?.includes('Bartholomew'));

    expect(pmItem).toBeDefined();
    fireEvent.mouseEnter(pmItem!);

    await waitFor(() => {
      expect(screen.getByTestId('popup-detail-quirks')).toBeInTheDocument();
    }, { timeout: 300 });

    const quirksDetail = screen.getByTestId('popup-detail-quirks');
    const styles = window.getComputedStyle(quirksDetail);

    // Should have overflow or line-clamp to handle long lists
    expect(
      styles.overflow === 'hidden' ||
      styles.overflowY === 'auto' ||
      (styles as any).webkitLineClamp !== ''
    ).toBe(true);
  });
});

// ============================================================================
// AC3: Panel preview images are larger/more detailed
// ============================================================================

describe('AC3: Panel preview images are larger/more detailed', () => {
  it('should display portrait at 200x200 pixels or larger (not 120x120)', async () => {
    render(
      <TestWrapper>
        <AgentPopup
          isOpen={true}
          onClose={() => {}}
          currentRole="dev"
          currentTheme="west-wing"
        />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    const portraitContainer = screen.getByTestId('popup-portrait');
    const styles = window.getComputedStyle(portraitContainer);

    // Portrait should be at least 200x200 for better detail visibility
    const width = parseInt(styles.width);
    const height = parseInt(styles.height);

    expect(width).toBeGreaterThanOrEqual(200);
    expect(height).toBeGreaterThanOrEqual(200);
  });

  it('should load images from the large directory for higher resolution', async () => {
    render(
      <TestWrapper>
        <AgentPopup
          isOpen={true}
          onClose={() => {}}
          currentRole="dev"
          currentTheme="west-wing"
        />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    const portrait = screen.getByRole('img', { name: /alice/i });
    const src = portrait.getAttribute('src');

    // Should be using the large directory for images
    expect(src).toContain('/large/');
  });

  it('should maintain aspect ratio with object-fit cover for consistent display', async () => {
    render(
      <TestWrapper>
        <AgentPopup
          isOpen={true}
          onClose={() => {}}
          currentRole="dev"
          currentTheme="west-wing"
        />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    const portrait = screen.getByRole('img', { name: /alice/i });
    const styles = window.getComputedStyle(portrait);

    // Image should use object-fit cover for consistent aspect ratio
    expect(styles.objectFit).toBe('cover');
  });
});

// ============================================================================
// AC4: Smooth visual experience when browsing panel list
// ============================================================================

describe('AC4: Smooth visual experience when browsing panel list', () => {
  it('should have transition effects on content changes for smooth switching', async () => {
    render(
      <TestWrapper>
        <AgentPopup
          isOpen={true}
          onClose={() => {}}
          currentRole="dev"
          currentTheme="west-wing"
        />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByTestId('agent-popup-details')).toBeInTheDocument();
    });

    const detailsPanel = screen.getByTestId('agent-popup-details');
    const styles = window.getComputedStyle(detailsPanel);

    // Should have CSS transition for smooth content changes
    // Transition should be applied but not 'none' or '0s'
    expect(styles.transition).not.toBe('none');
    expect(styles.transition).not.toBe('all 0s ease 0s');
  });

  it('should have the portrait container maintain fixed dimensions during image load', async () => {
    render(
      <TestWrapper>
        <AgentPopup
          isOpen={true}
          onClose={() => {}}
          currentRole="dev"
          currentTheme="west-wing"
        />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    const portraitContainer = screen.getByTestId('popup-portrait');
    const styles = window.getComputedStyle(portraitContainer);

    // Container should have explicit width/height, not auto
    expect(styles.width).not.toBe('auto');
    expect(styles.height).not.toBe('auto');
    expect(parseInt(styles.width)).toBeGreaterThan(0);
    expect(parseInt(styles.height)).toBeGreaterThan(0);
  });

  it('should render placeholder during image loading to prevent layout shift', async () => {
    // Simulate slow image load by overriding the img element
    const originalImage = window.Image;

    render(
      <TestWrapper>
        <AgentPopup
          isOpen={true}
          onClose={() => {}}
          currentRole="dev"
          currentTheme="west-wing"
        />
      </TestWrapper>
    );

    const portraitContainer = await screen.findByTestId('popup-portrait');

    // Container should maintain its dimensions even before image loads
    const styles = window.getComputedStyle(portraitContainer);
    const width = parseInt(styles.width);
    const height = parseInt(styles.height);

    // Should be square and have consistent dimensions
    expect(Math.abs(width - height)).toBeLessThanOrEqual(1);
  });

  it('should not cause cumulative layout shift (CLS) when hovering multiple agents', async () => {
    const { container } = render(
      <TestWrapper>
        <AgentPopup
          isOpen={true}
          onClose={() => {}}
          currentRole="dev"
          currentTheme="west-wing"
        />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    const popup = screen.getByRole('dialog');
    const initialRect = popup.getBoundingClientRect();

    // Simulate hovering through all agents rapidly using roster items
    const rosterItems = screen.getAllByRole('option');

    for (const item of rosterItems) {
      fireEvent.mouseEnter(item);

      // Brief pause to allow state update
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });
    }

    const finalRect = popup.getBoundingClientRect();

    // After hovering all agents, popup dimensions should be unchanged
    expect(Math.abs(finalRect.height - initialRect.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(finalRect.width - initialRect.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(finalRect.top - initialRect.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(finalRect.left - initialRect.left)).toBeLessThanOrEqual(1);
  });
});

// ============================================================================
// Supporting Tests: Test data attributes exist for testing
// ============================================================================

describe('Test Infrastructure: Required data-testid attributes', () => {
  it('should have data-testid="agent-popup-details" on details panel', async () => {
    render(
      <TestWrapper>
        <AgentPopup
          isOpen={true}
          onClose={() => {}}
          currentRole="dev"
          currentTheme="west-wing"
        />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    expect(screen.getByTestId('agent-popup-details')).toBeInTheDocument();
  });

  it('should have data-testid="popup-portrait" on portrait container', async () => {
    render(
      <TestWrapper>
        <AgentPopup
          isOpen={true}
          onClose={() => {}}
          currentRole="dev"
          currentTheme="west-wing"
        />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    expect(screen.getByTestId('popup-portrait')).toBeInTheDocument();
  });

  it('should have data-testid attributes on detail sections', async () => {
    render(
      <TestWrapper>
        <AgentPopup
          isOpen={true}
          onClose={() => {}}
          currentRole="dev"
          currentTheme="west-wing"
        />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // These testids need to be added to the component for testing
    expect(screen.getByTestId('popup-detail-style')).toBeInTheDocument();
    expect(screen.getByTestId('popup-detail-background')).toBeInTheDocument();
  });
});
