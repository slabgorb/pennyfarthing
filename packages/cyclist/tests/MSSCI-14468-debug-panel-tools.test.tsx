/**
 * Story 83-3: DebugPanel tool dialog integration tests
 * AC7: Dimension rows in HealthGauge open corresponding tool dialogs
 *
 * Tests that clicking dimension rows in the DebugPanel opens the correct
 * analysis dialog (Complexity, Dependencies, etc.).
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import { DebugPanel } from '../src/public/components/panels/DebugPanel.js';

// --- Tests ---

describe('MSSCI-14468: DebugPanel Dimension-to-Dialog Integration (Story 83-3)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
    ));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('AC7: Dimension rows open corresponding tool dialogs', () => {
    it('should render complexity dimension row', () => {
      render(<DebugPanel />);
      const dim = screen.getByTestId('dimension-complexity');
      expect(dim).toBeInTheDocument();
    });

    it('should render dependency_freshness dimension row', () => {
      render(<DebugPanel />);
      const dim = screen.getByTestId('dimension-dependency_freshness');
      expect(dim).toBeInTheDocument();
    });

    it('should open ComplexityDialog when complexity dimension is clicked', () => {
      render(<DebugPanel />);
      const dim = screen.getByTestId('dimension-complexity');
      fireEvent.click(dim);

      expect(screen.getByText('Cyclomatic complexity analysis')).toBeInTheDocument();
    });

    it('should open DependenciesDialog when dependency_freshness dimension is clicked', () => {
      render(<DebugPanel />);
      const dim = screen.getByTestId('dimension-dependency_freshness');
      fireEvent.click(dim);

      expect(screen.getByText('Package staleness and security analysis')).toBeInTheDocument();
    });

    it('should render all 8 dimension rows in the breakdown', () => {
      render(<DebugPanel />);
      const breakdown = screen.getByTestId('dimension-breakdown');
      expect(breakdown).toBeInTheDocument();

      expect(screen.getByTestId('dimension-churn')).toBeInTheDocument();
      expect(screen.getByTestId('dimension-todo_density')).toBeInTheDocument();
      expect(screen.getByTestId('dimension-complexity')).toBeInTheDocument();
      expect(screen.getByTestId('dimension-test_gaps')).toBeInTheDocument();
      expect(screen.getByTestId('dimension-dead_code')).toBeInTheDocument();
      expect(screen.getByTestId('dimension-deprecation_debt')).toBeInTheDocument();
      expect(screen.getByTestId('dimension-dependency_freshness')).toBeInTheDocument();
      expect(screen.getByTestId('dimension-agent_context_efficiency')).toBeInTheDocument();
    });
  });
});
