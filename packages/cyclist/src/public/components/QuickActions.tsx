/**
 * QuickActions Component
 *
 * Renders action buttons based on CYCLIST markers detected in assistant messages.
 * Supports handoff buttons, yes/no questions, choices, and continue.
 *
 * For open questions with suggestions (<!-- CYCLIST:QUESTION:open:suggested text -->),
 * pre-fills the editor via 'cyclist:suggest-prompt' event instead of showing buttons.
 *
 * Story: MSSCI-12787 - Implement CYCLIST Marker Parsing and Action Buttons
 * Story: MSSCI-12771 - Accessibility Compliance (ARIA labels)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useMarkerActions } from '../hooks/useMarkerActions';

interface MessageData {
  type: 'user' | 'assistant' | 'tool_use' | 'tool_result';
  content?: string;
  timestamp: number;
}

interface ActionItem {
  label: string;
  command: string;
}

interface QuickActionsPropsWithMessage {
  message: MessageData;
  actions?: never;
  onAction?: (response: string) => void;
}

interface QuickActionsPropsWithActions {
  message?: never;
  actions: ActionItem[];
  onAction?: (response: string) => void;
}

type QuickActionsProps = QuickActionsPropsWithMessage | QuickActionsPropsWithActions;

/**
 * Send a message to Claude via electronAPI
 */
function sendMessage(text: string): void {
  console.log('[QuickActions] sendMessage called:', text, 'electronAPI available:', !!window.electronAPI?.claude?.send);
  if (window.electronAPI?.claude?.send) {
    window.electronAPI.claude.send(text, []);
  } else {
    console.warn('[QuickActions] electronAPI.claude.send not available');
  }
}

/**
 * Get relay mode setting from electronAPI
 */
async function getRelayMode(): Promise<boolean> {
  try {
    if (window.electronAPI?.settings?.get) {
      const settings = await window.electronAPI.settings.get();
      return settings?.workflow?.relay_mode ?? false;
    }
  } catch {
    // Ignore errors
  }
  return false;
}

export default function QuickActions(props: QuickActionsProps): React.ReactElement | null {
  const { onAction } = props;
  const [isDisabled, setIsDisabled] = useState(false);
  const [relayMode, setRelayMode] = useState(false);

  // Support both message-based and actions-based props
  const message = 'message' in props ? props.message : undefined;
  const directActions = 'actions' in props ? props.actions : undefined;

  const markerActions = useMarkerActions(message?.content);

  // Reset disabled state when message changes (new assistant response)
  useEffect(() => {
    setIsDisabled(false);
  }, [message?.timestamp]);

  // Check relay mode on mount
  useEffect(() => {
    getRelayMode().then(setRelayMode);
  }, []);

  // Clear QuickActions when user submits any message
  useEffect(() => {
    const handleUserSubmit = () => {
      setIsDisabled(true);
    };
    window.addEventListener('cyclist:user-submit', handleUserSubmit);
    return () => {
      window.removeEventListener('cyclist:user-submit', handleUserSubmit);
    };
  }, []);

  // Auto-execute handoff when relay mode is ON
  useEffect(() => {
    if (markerActions?.type === 'handoff' && relayMode && markerActions.value) {
      // Auto-execute after short delay
      const timer = setTimeout(() => {
        sendMessage(markerActions.value!);
        setIsDisabled(true);
        onAction?.(markerActions.value!);
      }, 100);
      return () => clearTimeout(timer);
    }

    if (markerActions?.type === 'invoke' && markerActions.value) {
      // INVOKE always auto-executes
      const timer = setTimeout(() => {
        sendMessage(markerActions.value!);
        setIsDisabled(true);
        onAction?.(markerActions.value!);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [markerActions, relayMode, onAction]);

  // Pre-fill editor with suggested prompt for open questions
  useEffect(() => {
    if (markerActions?.type === 'open' && markerActions.responses && markerActions.responses.length > 0) {
      const suggestion = markerActions.responses[0];
      window.dispatchEvent(new CustomEvent('cyclist:suggest-prompt', {
        detail: { prompt: suggestion }
      }));
    }
  }, [markerActions]);

  const handleButtonClick = useCallback((response: string) => {
    console.log('[QuickActions] Button clicked:', response);
    setIsDisabled(true);
    sendMessage(response);
    onAction?.(response);
  }, [onAction]);

  // If using direct actions prop (for accessibility testing), render those
  if (directActions && directActions.length > 0) {
    return (
      <div className="quick-actions">
        <div className="quick-actions-buttons">
          {directActions.map((action) => (
            <button
              type="button"
              key={action.command}
              className="quick-action-btn"
              onClick={() => handleButtonClick(action.command)}
              disabled={isDisabled}
              aria-label={`${action.label}: ${action.command}`}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // No marker actions to render
  if (!markerActions) {
    return null;
  }

  // Open questions - no buttons needed, editor is pre-filled via useEffect
  if (markerActions.type === 'open') {
    return null;
  }

  // Continue marker - suppress the generic Continue button entirely
  // Users can always type to continue; showing a disabled button is confusing
  if (markerActions.type === 'continue') {
    return null;
  }

  // Auto-execute types don't render buttons
  if (markerActions.type === 'invoke') {
    return (
      <div className="quick-actions">
        <span className="auto-invoke-status">Invoking {markerActions.value}...</span>
      </div>
    );
  }

  // Auto-executing handoff in relay mode
  if (markerActions.type === 'handoff' && relayMode) {
    return (
      <div className="quick-actions">
        <span className="auto-invoke-status">Handing off to {markerActions.value}...</span>
      </div>
    );
  }

  return (
    <div className="quick-actions">
      {/* Handoff buttons */}
      {markerActions.type === 'handoff' && markerActions.responses && (
        <div className="quick-actions-buttons">
          {markerActions.responses.map((response) => (
            <button
              type="button"
              key={response}
              className="quick-action-btn"
              onClick={() => handleButtonClick(response)}
              disabled={isDisabled}
              aria-label={`Continue with ${response}`}
            >
              {response}
            </button>
          ))}
        </div>
      )}

      {/* Yes/No buttons */}
      {markerActions.type === 'yesno' && (
        <div className="quick-actions-buttons">
          <button
            type="button"
            className="quick-action-btn"
            onClick={() => handleButtonClick('Yes')}
            disabled={isDisabled}
            aria-label="Answer Yes"
          >
            Yes
          </button>
          <button
            type="button"
            className="quick-action-btn"
            onClick={() => handleButtonClick('No')}
            disabled={isDisabled}
            aria-label="Answer No"
          >
            No
          </button>
        </div>
      )}

      {/* Choice buttons */}
      {markerActions.type === 'choices' && markerActions.choices && (
        <div className="quick-actions-buttons">
          {markerActions.choices.map((choice) => (
            <button
              type="button"
              key={choice.number}
              className="quick-action-btn"
              onClick={() => handleButtonClick(choice.text)}
              disabled={isDisabled}
              aria-label={`Choose option ${choice.number}: ${choice.text}`}
            >
              {choice.text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Type declaration for window.electronAPI
declare global {
  interface Window {
    electronAPI?: {
      claude?: {
        send: (text: string, images: unknown[]) => void;
        onMessage?: (callback: (message: unknown) => void) => () => void;
      };
      settings?: {
        get: () => Promise<{ workflow?: { relay_mode?: boolean } }>;
      };
    };
  }
}
