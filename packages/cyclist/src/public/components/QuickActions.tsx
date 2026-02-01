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
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useMarkerActions } from '../hooks/useMarkerActions';

interface MessageData {
  type: 'user' | 'assistant' | 'tool_use' | 'tool_result';
  content?: string;
  timestamp: number;
}

interface QuickActionsProps {
  message: MessageData;
  onAction?: (response: string) => void;
}

/**
 * Send a message to Claude via electronAPI
 */
function sendMessage(text: string): void {
  if (window.electronAPI?.claude?.send) {
    window.electronAPI.claude.send(text, []);
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

export default function QuickActions({
  message,
  onAction,
}: QuickActionsProps): React.ReactElement | null {
  const [isDisabled, setIsDisabled] = useState(false);
  const [relayMode, setRelayMode] = useState(false);

  const actions = useMarkerActions(message.content);

  // Check relay mode on mount
  useEffect(() => {
    getRelayMode().then(setRelayMode);
  }, []);

  // Auto-execute handoff when relay mode is ON
  useEffect(() => {
    if (actions?.type === 'handoff' && relayMode && actions.value) {
      // Auto-execute after short delay
      const timer = setTimeout(() => {
        sendMessage(actions.value!);
        setIsDisabled(true);
        onAction?.(actions.value!);
      }, 100);
      return () => clearTimeout(timer);
    }

    if (actions?.type === 'invoke' && actions.value) {
      // INVOKE always auto-executes
      const timer = setTimeout(() => {
        sendMessage(actions.value!);
        setIsDisabled(true);
        onAction?.(actions.value!);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [actions, relayMode, onAction]);

  // Pre-fill editor with suggested prompt for open questions
  useEffect(() => {
    if (actions?.type === 'open' && actions.responses && actions.responses.length > 0) {
      const suggestion = actions.responses[0];
      window.dispatchEvent(new CustomEvent('cyclist:suggest-prompt', {
        detail: { prompt: suggestion }
      }));
    }
  }, [actions]);

  const handleButtonClick = useCallback((response: string) => {
    setIsDisabled(true);
    sendMessage(response);
    onAction?.(response);
  }, [onAction]);

  // No actions to render
  if (!actions) {
    return null;
  }

  // Open questions - no buttons needed, editor is pre-filled via useEffect
  if (actions.type === 'open') {
    return null;
  }

  // Continue marker - suppress the generic Continue button entirely
  // Users can always type to continue; showing a disabled button is confusing
  if (actions.type === 'continue') {
    return null;
  }

  // Auto-execute types don't render buttons
  if (actions.type === 'invoke') {
    return (
      <div className="quick-actions">
        <span className="auto-invoke-status">Invoking {actions.value}...</span>
      </div>
    );
  }

  // Auto-executing handoff in relay mode
  if (actions.type === 'handoff' && relayMode) {
    return (
      <div className="quick-actions">
        <span className="auto-invoke-status">Handing off to {actions.value}...</span>
      </div>
    );
  }

  return (
    <div className="quick-actions">
      {/* Handoff buttons */}
      {actions.type === 'handoff' && actions.responses && (
        <div className="quick-actions-buttons">
          {actions.responses.map((response) => (
            <button
              key={response}
              className="quick-action-btn"
              onClick={() => handleButtonClick(response)}
              disabled={isDisabled}
            >
              {response}
            </button>
          ))}
        </div>
      )}

      {/* Yes/No buttons */}
      {actions.type === 'yesno' && (
        <div className="quick-actions-buttons">
          <button
            className="quick-action-btn"
            onClick={() => handleButtonClick('Yes')}
            disabled={isDisabled}
          >
            Yes
          </button>
          <button
            className="quick-action-btn"
            onClick={() => handleButtonClick('No')}
            disabled={isDisabled}
          >
            No
          </button>
        </div>
      )}

      {/* Choice buttons */}
      {actions.type === 'choices' && actions.choices && (
        <div className="quick-actions-buttons">
          {actions.choices.map((choice) => (
            <button
              key={choice.number}
              className="quick-action-btn"
              onClick={() => handleButtonClick(choice.text)}
              disabled={isDisabled}
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
        onMessage?: (callback: (message: unknown) => void) => void;
        offMessage?: (callback: (message: unknown) => void) => void;
      };
      settings?: {
        get: () => Promise<{ workflow?: { relay_mode?: boolean } }>;
      };
    };
  }
}
