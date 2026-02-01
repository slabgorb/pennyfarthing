/**
 * QuickActions Component
 *
 * Renders action buttons based on CYCLIST markers detected in assistant messages.
 * Supports handoff buttons, yes/no questions, open text input, choices, and continue.
 *
 * Story: MSSCI-12787 - Implement CYCLIST Marker Parsing and Action Buttons
 *
 * @see sprint/context/MSSCI-12787-reference/quick-actions.js.deleted
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useMarkerActions, useStrippedContent } from '../hooks/useMarkerActions';
import { stripMarkers } from '@pennyfarthing/shared';

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
  const [inputValue, setInputValue] = useState('');
  const [relayMode, setRelayMode] = useState(false);

  const actions = useMarkerActions(message.content);
  const strippedContent = useStrippedContent(message.content);

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

  const handleButtonClick = useCallback((response: string) => {
    setIsDisabled(true);
    sendMessage(response);
    onAction?.(response);
  }, [onAction]);

  const handleInputSubmit = useCallback(() => {
    if (!inputValue.trim()) return;
    setIsDisabled(true);
    sendMessage(inputValue);
    onAction?.(inputValue);
  }, [inputValue, onAction]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleInputSubmit();
    }
  }, [handleInputSubmit]);

  // No actions to render
  if (!actions) {
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
      {/* Display stripped message content */}
      {strippedContent && (
        <div className="quick-actions-content">
          {strippedContent}
        </div>
      )}

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

      {/* Open text input */}
      {actions.type === 'open' && (
        <div className="quick-actions-input">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isDisabled}
            placeholder="Type your response..."
          />
          <button
            className="quick-action-btn"
            onClick={handleInputSubmit}
            disabled={isDisabled || !inputValue.trim()}
          >
            Send
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

      {/* Continue button */}
      {actions.type === 'continue' && (
        <div className="quick-actions-buttons">
          <button
            className="quick-action-btn"
            onClick={() => handleButtonClick('Continue')}
            disabled={isDisabled}
          >
            Continue
          </button>
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
