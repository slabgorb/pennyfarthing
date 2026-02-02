/**
 * Root React component for Cyclist
 * Story MSSCI-12717 - React Migration
 * Story MSSCI-12706 - Layout Persistence
 * Story MSSCI-12769 - Font Customization
 * Story MSSCI-12771 - Accessibility Compliance
 *
 * Renders the DockingWorkspace with all panels registered.
 * Persists layout changes to config.local.yaml.
 */

import React, { useEffect, useCallback } from 'react';
import {
  DockingWorkspace,
  registerPanelComponent,
  PANEL_INVENTORY,
} from './components/DockingWorkspace';
import { CommandPaletteProvider } from './components/CommandPalette';
import { useLayoutPersistence } from './hooks/useLayoutPersistence';
import { loadFontSettings, applyFontSettings } from './js/font-presets.js';

// Import all panel components
// Note: AC and BikeLane are now integrated into ProgressPanel (UX consolidation)
import {
  MessagePanel,
  SprintPanel,
  GitPanel,
  ProgressPanel,
  BackgroundPanel,
  ChangedPanel,
  DiffsPanel,
  DebugPanel,
  SettingsPanel,
} from './components/panels';

// =============================================================================
// Panel Registration
// =============================================================================

// Register all panels BEFORE render
// Center panel (sacred)
registerPanelComponent(PANEL_INVENTORY.MESSAGE, MessagePanel);

// Left sidebar panels
registerPanelComponent(PANEL_INVENTORY.CHANGED, ChangedPanel);
registerPanelComponent(PANEL_INVENTORY.DIFFS, DiffsPanel);
registerPanelComponent(PANEL_INVENTORY.DEBUG, DebugPanel);

// Right sidebar panels
// Note: AC and BikeLane are now internal tabs within ProgressPanel
registerPanelComponent(PANEL_INVENTORY.SPRINT, SprintPanel);
registerPanelComponent(PANEL_INVENTORY.PROGRESS, ProgressPanel);
registerPanelComponent(PANEL_INVENTORY.BACKGROUND, BackgroundPanel);
registerPanelComponent(PANEL_INVENTORY.GIT, GitPanel);
registerPanelComponent(PANEL_INVENTORY.SETTINGS, SettingsPanel);

// =============================================================================
// Skip Link Component
// =============================================================================

interface SkipLinkProps {
  href: string;
  children: React.ReactNode;
}

function SkipLink({ href, children }: SkipLinkProps): React.ReactElement {
  const handleClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const target = document.querySelector(href);
    if (target) {
      (target as HTMLElement).focus();
    }
  }, [href]);

  return (
    <a
      href={href}
      className="sr-only skip-link"
      onClick={handleClick}
      onFocus={(e) => e.currentTarget.classList.add('skip-link-visible')}
      onBlur={(e) => e.currentTarget.classList.remove('skip-link-visible')}
    >
      {children}
    </a>
  );
}

// =============================================================================
// Reduced Motion Hook
// =============================================================================

function useReducedMotion(): void {
  useEffect(() => {
    // Check for prefers-reduced-motion
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    const updateReducedMotion = (matches: boolean) => {
      if (matches) {
        document.documentElement.classList.add('reduced-motion');
      } else {
        document.documentElement.classList.remove('reduced-motion');
      }
    };

    // Set initial value
    updateReducedMotion(mediaQuery.matches);

    // Listen for changes
    const listener = (e: MediaQueryListEvent) => {
      updateReducedMotion(e.matches);
    };

    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, []);
}

// =============================================================================
// App Component
// =============================================================================

export default function App(): React.ReactElement {
  const { layout, isLoading, saveLayout } = useLayoutPersistence();

  // Set up reduced motion support
  useReducedMotion();

  // Load and apply font settings on startup (MSSCI-12769)
  useEffect(() => {
    loadFontSettings().then(settings => {
      applyFontSettings(settings);
    });
  }, []);

  return (
    <CommandPaletteProvider>
      <div className="cyclist-app">
        {/* Skip links for keyboard navigation (AC7) - always render first */}
        <SkipLink href="#main-content">Skip to main content</SkipLink>
        <SkipLink href="#message-input">Skip to input</SkipLink>
        <SkipLink href="#sidebar-nav">Skip to navigation</SkipLink>

        {/* Loading state */}
        {(isLoading || !layout) ? (
          <main id="main-content" tabIndex={-1}>
            <div className="cyclist-loading">
              <div className="loading-spinner" aria-label="Loading layout..." />
            </div>
          </main>
        ) : (
          /* Main content area */
          <main id="main-content" tabIndex={-1}>
            <DockingWorkspace
              initialLayout={layout}
              onLayoutChange={saveLayout}
            />
          </main>
        )}

        {/* Sidebar navigation target (for skip link) */}
        <nav id="sidebar-nav" tabIndex={-1} style={{ display: 'contents' }} aria-hidden="true" />

        {/* Message input target (for skip link) */}
        <div id="message-input" tabIndex={-1} style={{ display: 'contents' }} aria-hidden="true" />
      </div>
    </CommandPaletteProvider>
  );
}
