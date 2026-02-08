/**
 * Story 83-3: DebugPanel tool launcher integration tests
 * AC7: DebugPanel launcher row has buttons for Complexity and Dependencies dialogs
 *
 * Tests that the DebugPanel has working launcher buttons for the new tools.
 * Pattern mirrors MSSCI-14443-tool-launcher.test.tsx.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import { DebugPanel } from '../src/public/components/panels/DebugPanel.js';

// --- Tests ---

describe('MSSCI-14468: DebugPanel Tool Launcher (Story 83-3)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
    ));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('AC7: Launcher row has buttons for both new dialogs', () => {
    it('should render Complexity button in tool launcher', () => {
      render(<DebugPanel />);
      const btn = screen.getByTestId('tool-launcher-complexity');
      expect(btn).toBeInTheDocument();
      expect(btn).toHaveTextContent('Complexity');
    });

    it('should render Dependencies button in tool launcher', () => {
      render(<DebugPanel />);
      const btn = screen.getByTestId('tool-launcher-dependencies');
      expect(btn).toBeInTheDocument();
      expect(btn).toHaveTextContent('Dependencies');
    });

    it('should have Complexity button enabled (not disabled)', () => {
      render(<DebugPanel />);
      const btn = screen.getByTestId('tool-launcher-complexity');
      expect(btn).not.toBeDisabled();
    });

    it('should have Dependencies button enabled (not disabled)', () => {
      render(<DebugPanel />);
      const btn = screen.getByTestId('tool-launcher-dependencies');
      expect(btn).not.toBeDisabled();
    });

    it('should open ComplexityDialog when Complexity button is clicked', () => {
      render(<DebugPanel />);
      const btn = screen.getByTestId('tool-launcher-complexity');
      fireEvent.click(btn);

      // ComplexityDialog should now be visible with its title
      expect(screen.getByText('Cyclomatic complexity analysis')).toBeInTheDocument();
    });

    it('should open DependenciesDialog when Dependencies button is clicked', () => {
      render(<DebugPanel />);
      const btn = screen.getByTestId('tool-launcher-dependencies');
      fireEvent.click(btn);

      // DependenciesDialog should now be visible with its title
      expect(screen.getByText('Package staleness and security analysis')).toBeInTheDocument();
    });

    it('should render both buttons in the tool-launcher container', () => {
      render(<DebugPanel />);
      const launcher = screen.getByTestId('tool-launcher');
      const complexityBtn = screen.getByTestId('tool-launcher-complexity');
      const depsBtn = screen.getByTestId('tool-launcher-dependencies');

      expect(launcher).toContainElement(complexityBtn);
      expect(launcher).toContainElement(depsBtn);
    });
  });
});
