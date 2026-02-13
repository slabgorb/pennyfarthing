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

import React, { useEffect, useCallback, useState } from 'react';
import {
  DockviewWorkspace,
  registerPanelComponent,
  PANEL_INVENTORY,
} from './components/DockviewWorkspace';
import { CommandPaletteProvider } from './components/CommandPalette';
import { ClaudeProvider } from './contexts/ClaudeContext';
import ClaudeContext from './contexts/ClaudeContext';
import { MessageQueueProvider } from './contexts/MessageQueueContext';
import { useLayoutPersistence } from './hooks/useLayoutPersistence';
import { loadFontSettings, applyFontSettings } from './utils/font-presets';
import { loadPresetFromProject, applyPreset } from './utils/color-presets';
import { ErrorBoundary } from './components/ErrorBoundary';
import { StandalonePanel, getStandalonePanelName } from './components/StandalonePanel';
import { BikeRackWorkspace } from './components/BikeRackWorkspace';
import ApprovalModal, { useApprovalModal } from './components/ApprovalModal';
import { subscribeToPermissionRequests, sendPermissionResponse, createApprovalResponse } from './components/ApprovalModal';
import type { ApprovalRequest, GrantScope } from './components/ApprovalModal';

// Environment discriminator injected by server.ts (ADR-0024)
declare global {
  interface Window {
    __CYCLIST_MODE__?: 'cyclist' | 'bikerack';
  }
}

// Import all panel components
// Note: ProgressPanel split into Workflow/AC/Todo panels (MSSCI-14188)
import {
  MessagePanel,
  EnhancedSprintPanel,
  GitPanel,
  WorkflowPanel,
  ACPanel,
  TodoPanel,
  BackgroundPanel,
  ChangedPanel,
  DiffsPanel,
  DebugPanel,
  SettingsPanel,
  AuditLogPanel,
  TTYPanel,
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
registerPanelComponent(PANEL_INVENTORY.AUDIT_LOG, AuditLogPanel);
registerPanelComponent(PANEL_INVENTORY.TTY, TTYPanel);

// Right sidebar panels
// Note: ProgressPanel split into Workflow/AC/Todo panels (MSSCI-14188)
registerPanelComponent(PANEL_INVENTORY.SPRINT, EnhancedSprintPanel);
registerPanelComponent(PANEL_INVENTORY.WORKFLOW, WorkflowPanel);
registerPanelComponent(PANEL_INVENTORY.AC, ACPanel);
registerPanelComponent(PANEL_INVENTORY.TODO, TodoPanel);
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

// =============================================================================
// Root Error Fallback
// =============================================================================

/**
 * Root-level error fallback UI - shown when the entire app crashes
 */
function RootErrorFallback(): React.ReactElement {
  const handleReload = useCallback(() => {
    window.location.reload();
  }, []);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      backgroundColor: 'var(--bg-primary, #0a0a0f)',
      color: 'var(--text-primary, #e2e8f0)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '24px',
      textAlign: 'center',
    }}>
      <h1 style={{
        fontSize: '24px',
        fontWeight: 600,
        marginBottom: '16px',
        color: 'var(--status-error, #ef4444)',
      }}>
        Something went wrong
      </h1>
      <p style={{
        fontSize: '14px',
        color: 'var(--text-secondary, #94a3b8)',
        marginBottom: '24px',
        maxWidth: '400px',
      }}>
        Cyclist encountered an unexpected error. Check the console for details.
      </p>
      <button
        onClick={handleReload}
        style={{
          padding: '8px 16px',
          fontSize: '14px',
          backgroundColor: 'var(--accent-primary, #6366f1)',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
        }}
      >
        Reload Cyclist
      </button>
    </div>
  );
}

// =============================================================================
// App Component
// =============================================================================

export default function App(): React.ReactElement {
  // Detect route mode (computed before hooks, used after)
  const isBikeRackIndex = window.__CYCLIST_MODE__ === 'bikerack';
  const standalonePanelName = getStandalonePanelName();

  // --- All hooks called unconditionally (React rules of hooks) ---

  const layoutEndpoint = isBikeRackIndex ? '/api/settings/bikerack-layout' : '/api/settings/layout';
  const { layout, isLoading, saveLayout } = useLayoutPersistence(layoutEndpoint);

  // Set up reduced motion support
  useReducedMotion();

  // Load and apply font settings on startup (MSSCI-12769)
  useEffect(() => {
    loadFontSettings().then(settings => {
      applyFontSettings(settings);
    });
  }, []);

  // Load and apply color preset on startup
  useEffect(() => {
    loadPresetFromProject().then(presetId => {
      applyPreset(presetId);
    });
  }, []);

  // ApprovalModal state management (MSSCI-14322)
  const [requestQueue, setRequestQueue] = useState<ApprovalRequest[]>([]);
  const { request, isOpen, show, hide } = useApprovalModal();

  // Subscribe to permission requests via WebSocket
  useEffect(() => {
    const unsub = subscribeToPermissionRequests((incoming: ApprovalRequest) => {
      setRequestQueue((prev) => [...prev, incoming]);
    });
    return unsub;
  }, []);

  // Show the next queued request when the current one is resolved
  useEffect(() => {
    if (!isOpen && requestQueue.length > 0) {
      const [next, ...rest] = requestQueue;
      setRequestQueue(rest);
      show(next);
    }
  }, [isOpen, requestQueue, show]);

  const handleApprove = useCallback((grantScope: GrantScope) => {
    if (request) {
      const response = createApprovalResponse(request.toolId, true, grantScope);
      sendPermissionResponse(response);
    }
    hide();
  }, [request, hide]);

  const handleReject = useCallback(() => {
    if (request) {
      const response = createApprovalResponse(request.toolId, false);
      sendPermissionResponse(response);
    }
    hide();
  }, [request, hide]);

  // --- BikeRack routes (after all hooks) ---

  // BikeRack Dockview workspace (MSSCI-14877) — /bikerack renders Dockview layout
  // No-op ClaudeContext: BikeRack has no Claude CLI subprocess, skip WebSocket
  if (isBikeRackIndex) {
    if (isLoading) {
      return (
        <div className="cyclist-loading" style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="loading-spinner" aria-label="Loading layout..." />
        </div>
      );
    }
    const noop = () => () => {};
    return (
      <ClaudeContext.Provider value={{
        send: () => {}, abort: () => {}, clear: () => {},
        clearAndReload: () => {}, setMode: () => {},
        isConnected: false, mode: 'default',
        onMessage: noop, onComplete: noop, onError: noop,
        onUserMessage: noop, onClear: noop,
      }}>
        <BikeRackWorkspace
          initialLayout={layout ?? undefined}
          onLayoutChange={saveLayout}
        />
      </ClaudeContext.Provider>
    );
  }

  // BikeRack standalone panel routing (MSSCI-14821)
  // URL-based detection only (Rule 10) — ?panel=X renders single panel full-screen
  if (standalonePanelName) {
    return <StandalonePanel />;
  }

  return (
    <ErrorBoundary fallback={<RootErrorFallback />} panelName="App">
      <ClaudeProvider>
        <MessageQueueProvider>
          <CommandPaletteProvider>
            <div className="cyclist-app">
              {/* Skip links for keyboard navigation (AC7) - always render first */}
              <SkipLink href="#main-content">Skip to main content</SkipLink>
              <SkipLink href="#message-input">Skip to input</SkipLink>
              <SkipLink href="#sidebar-nav">Skip to navigation</SkipLink>

              {/* Loading state - only show while actually loading */}
              {isLoading ? (
                <main id="main-content" tabIndex={-1}>
                  <div className="cyclist-loading">
                    <div className="loading-spinner" aria-label="Loading layout..." />
                  </div>
                </main>
              ) : (
                /* Main content area - layout can be null for first-time users */
                <main id="main-content" tabIndex={-1}>
                  <DockviewWorkspace
                    initialLayout={layout ?? undefined}
                    onLayoutChange={saveLayout}
                  />
                </main>
              )}

              {/* Sidebar navigation target (for skip link) */}
              <nav id="sidebar-nav" tabIndex={-1} style={{ display: 'contents' }} aria-hidden="true" />

              {/* Message input target (for skip link) */}
              <div id="message-input" tabIndex={-1} style={{ display: 'contents' }} aria-hidden="true" />
            </div>

            {/* ApprovalModal - renders via Radix Portal outside the React tree (MSSCI-14322) */}
            <ApprovalModal
              isOpen={isOpen}
              toolName={request?.toolName ?? ''}
              toolId={request?.toolId ?? ''}
              input={request?.input ?? {}}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          </CommandPaletteProvider>
        </MessageQueueProvider>
      </ClaudeProvider>
    </ErrorBoundary>
  );
}
