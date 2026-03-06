/**
 * ControlBar Component
 *
 * Provides Stop, Reset, Bell Mode, Relay Mode, and Agent Quick Picker controls.
 * Story MSSCI-12729 - Stop/Reset Controls and Escape Key
 * Story MSSCI-12275 - Bell Mode toggle
 * Story MSSCI-12395 - Relay Mode toggle
 * Story MSSCI-14762 - Quick agent picker in control bar
 *
 * Features:
 * - Stop button visible only when Claude is running
 * - Reset button always visible
 * - Agent quick picker (lightweight dropdown for rapid agent switching)
 * - Bell mode toggle (inject queued messages via PostToolUse hook)
 * - Relay mode toggle (auto-handoff to next agent)
 * - Escape key handler for stopping (single press = interrupt, double = force kill)
 * - Visual feedback for "Stopping..." state
 */

import React, { useEffect, useRef, useCallback, useState, FocusEvent } from 'react';
import { BellRing, Zap, RotateCcw, UserCog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useClaudeContext } from '../contexts/ClaudeContext';

// =============================================================================
// Focus Tracking Hook
// =============================================================================

function useFocusTracking() {
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const handleFocus = useCallback((id: string) => (_e: FocusEvent<HTMLButtonElement>) => {
    setFocusedId(id);
  }, []);

  const handleBlur = useCallback(() => {
    setFocusedId(null);
  }, []);

  const isFocused = useCallback((id: string) => focusedId === id, [focusedId]);

  return { handleFocus, handleBlur, isFocused };
}

// =============================================================================
// Agent Quick Picker
// =============================================================================

interface ThemeAgent {
  role: string;
  character: string;
  slug: string;
}

interface ThemeData {
  agents: ThemeAgent[];
}

function AgentQuickPicker({ currentAgent, onAgentSwitch }: { currentAgent: string | null; onAgentSwitch?: (role: string) => void }): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const [agents, setAgents] = useState<ThemeAgent[]>([]);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Fetch agent list on mount
  useEffect(() => {
    fetch('/api/theme-agents/full')
      .then(res => res.ok ? res.json() : null)
      .then((data: ThemeData | null) => {
        if (data?.agents) {
          setAgents(data.agents);
        }
      })
      .catch(() => {});
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen]);

  const handleAgentClick = useCallback((agent: ThemeAgent) => {
    if (agent.role === currentAgent) return;
    onAgentSwitch?.(agent.role);
    setIsOpen(false);
  }, [currentAgent, onAgentSwitch]);

  return (
    <div className="agent-quick-picker-wrapper" ref={pickerRef}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            type="button"
            className={`btn-toggle agent-picker-toggle ${isOpen ? 'active' : ''}`}
            data-testid="agent-quick-picker"
            onClick={() => setIsOpen(prev => !prev)}
            aria-label="Switch agent"
            aria-expanded={isOpen}
            aria-haspopup="listbox"
          >
            <UserCog className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Switch Agent</TooltipContent>
      </Tooltip>

      {isOpen && (
        <div
          className="agent-quick-picker-dropdown"
          data-testid="agent-quick-picker-dropdown"
          role="listbox"
          aria-label="Available agents"
        >
          {agents.map(agent => {
            const isCurrent = agent.role === currentAgent;
            return (
              <div
                key={agent.role}
                className={`agent-quick-picker-option ${isCurrent ? 'current' : ''}`}
                data-testid={`agent-option-${agent.role}`}
                role="option"
                aria-selected={isCurrent}
                aria-label={`${agent.role} (${agent.character})`}
                title={agent.character}
                onClick={() => handleAgentClick(agent)}
              >
                <span className="agent-option-role">{agent.role}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Types
// =============================================================================

export interface ControlBarProps {
  /** Whether Claude is currently running */
  isRunning: boolean;
  /** Whether stop is in progress */
  isStopping?: boolean;
  /** Called when stop button clicked or Escape pressed */
  onStop: () => void;
  /** Called on double Escape for force kill */
  onForceStop?: () => void;
  /** Called when reset button clicked */
  onReset: () => void;
  /** Bell mode state (inject queued messages via hook) */
  bellMode?: boolean;
  /** Relay mode state (auto-handoff to next agent) */
  relayMode?: boolean;
  /** Called when bell mode toggle clicked */
  onBellModeChange?: (enabled: boolean) => void;
  /** Called when relay mode toggle clicked */
  onRelayModeChange?: (enabled: boolean) => void;
  /** Context percentage for TirePump visibility */
  contextPercent?: number;
  /** Current agent slug for TirePump reload */
  currentAgent?: string | null;
  /** Called when TirePump button clicked */
  onTirePump?: () => void;
  /** Called when agent is selected from quick picker */
  onAgentSwitch?: (role: string) => void;
}

// =============================================================================
// ControlBar Component
// =============================================================================

export function ControlBar({
  isRunning,
  isStopping = false,
  onStop,
  onForceStop,
  onReset,
  bellMode = false,
  relayMode = false,
  onBellModeChange,
  onRelayModeChange,
  contextPercent = 0,
  currentAgent = null,
  onTirePump,
  onAgentSwitch,
}: ControlBarProps): React.ReactElement {
  const lastEscapeTime = useRef<number>(0);
  const DOUBLE_PRESS_THRESHOLD = 500; // ms
  const { handleFocus, handleBlur, isFocused } = useFocusTracking();

  // Global Escape key handler
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Only handle Escape
      if (event.key !== 'Escape' && event.keyCode !== 27) {
        return;
      }

      // Don't handle if not running
      if (!isRunning) {
        return;
      }

      // Check for double press
      const now = Date.now();
      const timeSinceLastEscape = now - lastEscapeTime.current;

      if (timeSinceLastEscape < DOUBLE_PRESS_THRESHOLD && onForceStop) {
        // Double Escape - force kill
        onForceStop();
      } else {
        // Single Escape - normal stop
        onStop();
      }

      lastEscapeTime.current = now;
    },
    [isRunning, onStop, onForceStop]
  );

  // Register global keydown listener
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="control-bar" data-testid="control-bar">
        {/* Mode toggles - Agent Picker, Bell, and Relay */}
        <div className="control-bar-toggles">
          {/* Agent Quick Picker */}
          <AgentQuickPicker currentAgent={currentAgent} onAgentSwitch={onAgentSwitch} />

          {/* Bell Mode Toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                type="button"
                className={`btn-toggle bell-toggle ${bellMode ? 'active' : ''}`}
                data-testid="bell-mode-toggle"
                onClick={() => onBellModeChange?.(!bellMode)}
                aria-pressed={bellMode}
                aria-label="Bell mode - inject queued messages via hook"
              >
                <BellRing className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Bell Mode: Inject queued messages during tool use (Cmd+B)</TooltipContent>
          </Tooltip>

          {/* Relay Mode Toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                type="button"
                className={`btn-toggle relay-toggle ${relayMode ? 'active' : ''}`}
                data-testid="relay-toggle"
                onClick={() => onRelayModeChange?.(!relayMode)}
                aria-pressed={relayMode}
                aria-label="Relay mode - auto-handoff to next agent"
              >
                <Zap className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Relay Mode: Auto-handoff to next agent (Cmd+4)</TooltipContent>
          </Tooltip>

          {/* TirePump Button - always visible, warning style at 70%+ */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                type="button"
                className={`btn-toggle pump-toggle ${contextPercent >= 70 ? 'warning' : ''}`}
                data-testid="pump-toggle"
                onClick={onTirePump}
                disabled={!currentAgent}
                aria-label="TirePump: Clear context and reload agent"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{currentAgent ? `TirePump: Clear context (${contextPercent}%) and reload ${currentAgent}` : 'TirePump: No agent loaded'}</TooltipContent>
          </Tooltip>
        </div>

      {/* Stop button - always visible, disabled when not running */}
      <Button
        variant="destructive"
        type="button"
        className={`btn-stop danger ${isStopping ? 'stopping' : ''} ${isRunning && !isStopping ? 'throbbing' : ''} ${isFocused('stop') ? 'focused focus-visible' : ''}`}
        data-testid="stop-button"
        onClick={onStop}
        disabled={!isRunning || isStopping}
        aria-busy={isStopping}
        aria-label="Stop Claude"
        onFocus={handleFocus('stop')}
        onBlur={handleBlur}
      >
        <span data-icon="stop" className="icon" />
        {isStopping ? (
          <>
            <span className="spinner" data-loading />
            Stopping...
          </>
        ) : (
          'Stop'
        )}
      </Button>

      {/* Reset button - always visible */}
      <Button
        variant="outline"
        type="button"
        className={`btn-reset ${isFocused('reset') ? 'focused focus-visible' : ''}`}
        data-testid="reset-button"
        onClick={onReset}
        aria-label="Reset session"
        onFocus={handleFocus('reset')}
        onBlur={handleBlur}
      >
        Reset
      </Button>
      </div>
    </TooltipProvider>
  );
}

// =============================================================================
// useControlBar Hook
// =============================================================================

interface UseControlBarResult {
  /** Whether Claude is currently running */
  isRunning: boolean;
  /** Whether stop is in progress */
  isStopping: boolean;
  /** Bell mode state */
  bellMode: boolean;
  /** Relay mode state */
  relayMode: boolean;
  /** Context percentage for TirePump */
  contextPercent: number;
  /** Current agent slug for TirePump */
  currentAgent: string | null;
  /** Handle stop action */
  handleStop: () => void;
  /** Handle force stop action (SIGKILL) */
  handleForceStop: () => void;
  /** Handle reset action */
  handleReset: () => void;
  /** Handle bell mode toggle */
  handleBellModeChange: (enabled: boolean) => void;
  /** Handle relay mode toggle */
  handleRelayModeChange: (enabled: boolean) => void;
  /** Handle TirePump action */
  handleTirePump: () => void;
  /** Handle agent switch from quick picker */
  handleAgentSwitch: (role: string) => void;
}

export function useControlBar(): UseControlBarResult {
  const [isRunning, setIsRunning] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [bellMode, setBellMode] = useState(false);
  const [relayMode, setRelayMode] = useState(false);
  const [contextPercent, setContextPercent] = useState(0);
  const [currentAgent, setCurrentAgent] = useState<string | null>(null);

  // Claude context for WebSocket communication
  const { abort, clear, clearAndReload, send, onMessage, onComplete, onError, isConnected } = useClaudeContext();

  // Load initial settings and listen for changes (using REST/WebSocket, not IPC)
  useEffect(() => {
    // Handle settings update from any source
    function handleSettingsUpdate(settings: Record<string, unknown>) {
      const workflow = settings?.workflow as Record<string, unknown> | undefined;
      const newBellMode = !!workflow?.bell_mode;
      const newRelayMode = !!workflow?.relay_mode;
      console.log('[ControlBar] Settings updated:', { bellMode: newBellMode, relayMode: newRelayMode });
      setBellMode(newBellMode);
      setRelayMode(newRelayMode);
    }

    // Load initial settings via REST
    async function loadSettings() {
      try {
        console.log('[ControlBar] Loading settings via REST');
        const response = await fetch('/api/settings');
        if (response.ok) {
          const settings = await response.json();
          handleSettingsUpdate(settings);
        }
      } catch (err) {
        console.error('[ControlBar] Failed to load settings:', err);
      }
    }

    console.log('[ControlBar] useEffect mount - loading settings');
    loadSettings();

    // WebSocket subscription for real-time sync
    console.log('[ControlBar] Connecting to /ws/settings for real-time sync');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/settings`);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'init' || data.type === 'update') {
          handleSettingsUpdate(data.settings);
        }
      } catch (err) {
        console.error('[ControlBar] Failed to parse WebSocket message:', err);
      }
    };

    ws.onerror = (err) => {
      console.error('[ControlBar] WebSocket error:', err);
    };

    return () => {
      ws.close();
    };
  }, []);

  // Subscribe to context WebSocket for TirePump visibility
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/context`);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'init' || data.type === 'update') {
          const percent = data.context?.percent ?? 0;
          setContextPercent(percent);
        }
      } catch (err) {
        console.error('[ControlBar] Failed to parse context message:', err);
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  // Subscribe to persona WebSocket for current agent
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/persona`);

    ws.onmessage = (event) => {
      try {
        const persona = JSON.parse(event.data);
        // slug is the agent role (dev, sm, tea, reviewer, etc.)
        setCurrentAgent(persona?.slug ?? null);
      } catch (err) {
        console.error('[ControlBar] Failed to parse persona message:', err);
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  // Listen for Claude running state changes via WebSocket context
  useEffect(() => {
    if (!isConnected) return;

    // Track when Claude starts/completes
    const handleMessage = () => {
      setIsRunning(true);
      setIsStopping(false);
    };

    const handleComplete = () => {
      setIsRunning(false);
      setIsStopping(false);
    };

    const handleError = () => {
      setIsRunning(false);
      setIsStopping(false);
    };

    // Subscribe to events via context
    const cleanupMessage = onMessage(handleMessage);
    const cleanupComplete = onComplete(handleComplete);
    const cleanupError = onError(handleError);

    return () => {
      cleanupMessage();
      cleanupComplete();
      cleanupError();
    };
  }, [isConnected, onMessage, onComplete, onError]);

  const handleStop = useCallback(() => {
    setIsStopping(true);
    try {
      // Use abort() via WebSocket
      abort();
    } catch (err) {
      console.error('[ControlBar] Stop failed:', err);
    }
  }, [abort]);

  const handleForceStop = useCallback(() => {
    setIsStopping(true);
    try {
      abort();
    } catch (err) {
      console.error('[ControlBar] Force stop failed:', err);
    }
  }, [abort]);

  const handleReset = useCallback(() => {
    try {
      clear();
      setIsRunning(false);
      setIsStopping(false);
    } catch (err) {
      console.error('[ControlBar] Reset failed:', err);
    }
  }, [clear]);

  const handleBellModeChange = useCallback(async (enabled: boolean) => {
    try {
      // Use REST API for settings
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow: { bell_mode: enabled } }),
      });
      setBellMode(enabled);
      console.log('[ControlBar] Bell mode set to:', enabled);
    } catch (err) {
      console.error('[ControlBar] Failed to toggle bell mode:', err);
    }
  }, []);

  const handleRelayModeChange = useCallback(async (enabled: boolean) => {
    try {
      // Use REST API for settings
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow: { relay_mode: enabled } }),
      });
      setRelayMode(enabled);
      console.log('[ControlBar] Relay mode set to:', enabled);
    } catch (err) {
      console.error('[ControlBar] Failed to toggle relay mode:', err);
    }
  }, []);

  // TirePump: Clear context and reload current agent
  const handleTirePump = useCallback(() => {
    if (!currentAgent) {
      console.warn('[ControlBar] Cannot TirePump: no current agent');
      return;
    }
    try {
      console.log('[ControlBar] TirePump: clearing context and reloading agent:', currentAgent);
      clearAndReload(currentAgent);
      // Reset local state since session is being cleared
      setIsRunning(false);
      setIsStopping(false);
      setContextPercent(0);
    } catch (err) {
      console.error('[ControlBar] TirePump failed:', err);
    }
  }, [currentAgent, clearAndReload]);

  // Agent quick picker: send /{role} command
  const handleAgentSwitch = useCallback((role: string) => {
    send(`/${role}`);
  }, [send]);

  return {
    isRunning,
    isStopping,
    bellMode,
    relayMode,
    contextPercent,
    currentAgent,
    handleStop,
    handleForceStop,
    handleReset,
    handleBellModeChange,
    handleRelayModeChange,
    handleTirePump,
    handleAgentSwitch,
  };
}

export default ControlBar;
