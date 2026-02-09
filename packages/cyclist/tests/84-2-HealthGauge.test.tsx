/**
 * 84-2: HealthGauge Component Tests
 *
 * Tests for the radial gauge component that displays the health score
 * with green/yellow/red coloring and dimension breakdown.
 *
 * Story: MSSCI-14471 - Health score API + gauge component
 * Epic: epic-84 (Composite Health Score)
 *
 * Acceptance Criteria covered:
 * - AC4: Radial gauge component renders in DebugPanel header
 * - AC5: Green/yellow/red coloring based on score thresholds
 * - AC6: Tap/click gauge opens dimension breakdown view
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import '@testing-library/jest-dom/vitest';

// Component under test — to be implemented
import { HealthGauge } from '../src/public/components/HealthGauge';
import type { HealthGaugeProps } from '../src/public/components/HealthGauge';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const FULL_DIMENSIONS = [
  { name: 'churn', score: 54.8, weight: 0.15 },
  { name: 'todo_density', score: 74.0, weight: 0.15 },
  { name: 'complexity', score: 88.0, weight: 0.15 },
  { name: 'test_gaps', score: 75.0, weight: 0.15 },
  { name: 'dead_code', score: 95.0, weight: 0.10 },
  { name: 'deprecation_debt', score: 85.0, weight: 0.10 },
  { name: 'dependency_freshness', score: 68.0, weight: 0.10 },
  { name: 'agent_context_efficiency', score: 60.0, weight: 0.10 },
];

// ============================================================================
// AC4: Gauge renders and displays score
// ============================================================================

describe('AC4: HealthGauge renders in DebugPanel header', () => {
  it('should export HealthGauge as a named export', () => {
    expect(HealthGauge).toBeDefined();
    expect(typeof HealthGauge).toBe('function');
  });

  it('should render without crashing with valid data', () => {
    render(
      <HealthGauge
        score={72.3}
        dimensions={FULL_DIMENSIONS}
      />
    );
    expect(screen.getByTestId('health-gauge')).toBeInTheDocument();
  });

  it('should display the score value', () => {
    render(
      <HealthGauge
        score={72.3}
        dimensions={FULL_DIMENSIONS}
      />
    );
    expect(screen.getByText('72.3')).toBeInTheDocument();
  });

  it('should display the grade letter', () => {
    render(
      <HealthGauge
        score={72.3}
        dimensions={FULL_DIMENSIONS}
      />
    );
    // 72.3 = grade C (60-74 range)
    expect(screen.getByText('C')).toBeInTheDocument();
  });

  it('should render an SVG element for the gauge arc', () => {
    const { container } = render(
      <HealthGauge
        score={72.3}
        dimensions={FULL_DIMENSIONS}
      />
    );
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('should show "--" in gauge when score is null (no data)', () => {
    const { container } = render(
      <HealthGauge
        score={null}
        dimensions={[]}
      />
    );
    // The SVG text element shows "--" for the main score
    const svgText = container.querySelector('svg text');
    expect(svgText?.textContent).toBe('--');
  });

  it('should show dimension count when partial data available', () => {
    const partialDimensions = FULL_DIMENSIONS.slice(0, 4);
    render(
      <HealthGauge
        score={65.1}
        dimensions={partialDimensions}
        totalDimensions={8}
      />
    );
    // Should indicate 4 of 8 dimensions
    expect(screen.getByText('4 of 8 dimensions')).toBeInTheDocument();
  });
});

// ============================================================================
// AC5: Green/yellow/red coloring based on score thresholds
// ============================================================================

describe('AC5: Color bands by score', () => {
  it('should use green color for A grade (90-100)', () => {
    const { container } = render(
      <HealthGauge score={95} dimensions={FULL_DIMENSIONS} />
    );
    const gauge = container.querySelector('[data-testid="health-gauge"]');
    // The gauge or its arc should have green coloring
    expect(gauge?.getAttribute('data-grade')).toBe('A');
  });

  it('should use green-yellow color for B grade (75-89)', () => {
    const { container } = render(
      <HealthGauge score={82} dimensions={FULL_DIMENSIONS} />
    );
    const gauge = container.querySelector('[data-testid="health-gauge"]');
    expect(gauge?.getAttribute('data-grade')).toBe('B');
  });

  it('should use yellow color for C grade (60-74)', () => {
    const { container } = render(
      <HealthGauge score={67} dimensions={FULL_DIMENSIONS} />
    );
    const gauge = container.querySelector('[data-testid="health-gauge"]');
    expect(gauge?.getAttribute('data-grade')).toBe('C');
  });

  it('should use orange color for D grade (40-59)', () => {
    const { container } = render(
      <HealthGauge score={45} dimensions={FULL_DIMENSIONS} />
    );
    const gauge = container.querySelector('[data-testid="health-gauge"]');
    expect(gauge?.getAttribute('data-grade')).toBe('D');
  });

  it('should use red color for F grade (0-39)', () => {
    const { container } = render(
      <HealthGauge score={20} dimensions={FULL_DIMENSIONS} />
    );
    const gauge = container.querySelector('[data-testid="health-gauge"]');
    expect(gauge?.getAttribute('data-grade')).toBe('F');
  });

  it('should use grey/neutral for null score', () => {
    const { container } = render(
      <HealthGauge score={null} dimensions={[]} />
    );
    const gauge = container.querySelector('[data-testid="health-gauge"]');
    // No grade when score is null
    expect(gauge?.getAttribute('data-grade')).toBeNull();
  });

  // Boundary tests
  it('should grade 90 as A (boundary)', () => {
    const { container } = render(
      <HealthGauge score={90} dimensions={FULL_DIMENSIONS} />
    );
    expect(container.querySelector('[data-grade="A"]')).toBeInTheDocument();
  });

  it('should grade 89 as B (boundary)', () => {
    const { container } = render(
      <HealthGauge score={89} dimensions={FULL_DIMENSIONS} />
    );
    expect(container.querySelector('[data-grade="B"]')).toBeInTheDocument();
  });

  it('should grade 75 as B (boundary)', () => {
    const { container } = render(
      <HealthGauge score={75} dimensions={FULL_DIMENSIONS} />
    );
    expect(container.querySelector('[data-grade="B"]')).toBeInTheDocument();
  });

  it('should grade 74 as C (boundary)', () => {
    const { container } = render(
      <HealthGauge score={74} dimensions={FULL_DIMENSIONS} />
    );
    expect(container.querySelector('[data-grade="C"]')).toBeInTheDocument();
  });

  it('should grade 40 as D (boundary)', () => {
    const { container } = render(
      <HealthGauge score={40} dimensions={FULL_DIMENSIONS} />
    );
    expect(container.querySelector('[data-grade="D"]')).toBeInTheDocument();
  });

  it('should grade 39 as F (boundary)', () => {
    const { container } = render(
      <HealthGauge score={39} dimensions={FULL_DIMENSIONS} />
    );
    expect(container.querySelector('[data-grade="F"]')).toBeInTheDocument();
  });

  it('should handle score of 0', () => {
    const { container } = render(
      <HealthGauge score={0} dimensions={FULL_DIMENSIONS} />
    );
    expect(container.querySelector('[data-grade="F"]')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('should handle score of 100', () => {
    const { container } = render(
      <HealthGauge score={100} dimensions={FULL_DIMENSIONS} />
    );
    expect(container.querySelector('[data-grade="A"]')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
  });
});

// ============================================================================
// AC6: Tap/click opens dimension breakdown
// ============================================================================

describe('AC6: Dimension breakdown always visible with click-to-open dialogs', () => {
  it('should show dimension breakdown without clicking', () => {
    render(
      <HealthGauge
        score={72.3}
        dimensions={FULL_DIMENSIONS}
      />
    );

    // Breakdown is always visible
    expect(screen.getByTestId('dimension-breakdown')).toBeInTheDocument();
  });

  it('should list all 8 dimensions even before data arrives', () => {
    render(
      <HealthGauge
        score={null}
        dimensions={[]}
      />
    );

    // All 8 dimension rows should render with "--" scores
    expect(screen.getByText(/churn/i)).toBeInTheDocument();
    expect(screen.getByText(/todo/i)).toBeInTheDocument();
    expect(screen.getByText(/complexity/i)).toBeInTheDocument();
    expect(screen.getByText(/test/i)).toBeInTheDocument();
    expect(screen.getByText(/dead code/i)).toBeInTheDocument();
    expect(screen.getByText(/deprecation/i)).toBeInTheDocument();
    expect(screen.getByText(/dependency/i)).toBeInTheDocument();
    expect(screen.getByText(/agent context/i)).toBeInTheDocument();
  });

  it('should display each dimension score in the breakdown', () => {
    render(
      <HealthGauge
        score={72.3}
        dimensions={FULL_DIMENSIONS}
      />
    );

    // Score values should be visible
    expect(screen.getByText('54.8')).toBeInTheDocument();
    expect(screen.getByText('88.0')).toBeInTheDocument();
    expect(screen.getByText('95.0')).toBeInTheDocument();
  });

  it('should call onDimensionClick callback when a dimension is clicked', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onDimensionClick = vi.fn();

    render(
      <HealthGauge
        score={72.3}
        dimensions={FULL_DIMENSIONS}
        onDimensionClick={onDimensionClick}
      />
    );

    // Click a specific dimension — no need to expand first
    const churnItem = screen.getByTestId('dimension-churn');
    await user.click(churnItem);

    expect(onDimensionClick).toHaveBeenCalledWith('churn');
  });

  it('should show breakdown even when score is null', () => {
    render(
      <HealthGauge
        score={null}
        dimensions={[]}
      />
    );

    // Breakdown is always visible, showing all dimensions with "--"
    expect(screen.getByTestId('dimension-breakdown')).toBeInTheDocument();
  });
});
