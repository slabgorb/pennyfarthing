/**
 * Editor Component
 *
 * React textarea editor with command history, tab completion, and message queue.
 * Story MSSCI-12717 - React Migration
 *
 * Features:
 * - Textarea with Enter=submit, Shift+Enter=newline
 * - Command history (Up/Down arrows)
 * - Tab completion popup for /commands
 * - Message queue indicator
 * - Image paste handling
 * - Mode toolbar (Plan/Manual/Accept)
 */

import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  KeyboardEvent,
  ClipboardEvent,
  ChangeEvent,
} from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useCommandHistory } from '../hooks/useCommandHistory';
import { useTabCompletion } from '../hooks/useTabCompletion';
import { useMessageQueueContext, QueuedMessage } from '../contexts/MessageQueueContext';
import { ModeSwitch, useModeSync, useModeSwitchShortcuts } from './ModeSwitch';
import { trackCommandUsage } from '../utils/slash-commands';

// =============================================================================
// Types
// =============================================================================

export interface PastedImage {
  dataUrl: string;
  mimeType: string;
  filename: string;
}

export interface EditorProps {
  onSubmit: (text: string, images: PastedImage[]) => void;
  isProcessing?: boolean;
  placeholder?: string;
  /** Callback to immediately inject a queued message (abort + send) */
  onInject?: (index: number) => Promise<boolean>;
}

// PermissionMode type moved to ModeSwitch component

// Supported image types for paste
const SUPPORTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const IMAGE_MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

// =============================================================================
// Completion Popup Component
// =============================================================================

interface CompletionPopupProps {
  commands: Array<{ name: string; description: string }>;
  selectedIndex: number;
  visible: boolean;
  onSelect: (index: number) => void;
}

function CompletionPopup({ commands, selectedIndex, visible, onSelect }: CompletionPopupProps) {
  if (!visible || commands.length === 0) return null;

  return (
    <div className="completion-popup" data-testid="completion-popup">
      {commands.map((cmd, index) => (
        <div
          key={cmd.name}
          className={`completion-item ${index === selectedIndex ? 'selected' : ''}`}
          onClick={() => onSelect(index)}
          data-testid={`completion-item-${index}`}
        >
          <span className="completion-name">{cmd.name}</span>
          <span className="completion-desc">{cmd.description}</span>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// Queue Display Component (MSSCI-12275)
// =============================================================================

interface QueueDisplayProps {
  queue: QueuedMessage[];
  bellMode: boolean;
  onRemove: (index: number) => void;
  onClear: () => void;
  /** Callback to immediately inject a queued message (abort + send) */
  onInject?: (index: number) => Promise<boolean>;
}

/**
 * Escape HTML for safe rendering
 */
function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function QueueDisplay({ queue, bellMode, onRemove, onClear, onInject }: QueueDisplayProps) {
  if (queue.length === 0) return null;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="queue-display" data-testid="queue-display">
        <div className="queue-header">
          <span className="queue-count">{queue.length} queued</span>
          {bellMode && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="secondary" className="queue-mode-badge bell-mode">🔔</Badge>
              </TooltipTrigger>
              <TooltipContent>Bell mode active - messages inject via hook</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                className="queue-clear-btn"
                onClick={onClear}
              >
                Clear
              </Button>
            </TooltipTrigger>
            <TooltipContent>Clear all queued messages</TooltipContent>
          </Tooltip>
        </div>
        <ul className="queue-list">
          {queue.map((msg, index) => {
            const truncated = msg.text.length > 60 ? msg.text.substring(0, 60) + '...' : msg.text;
            const hasImages = msg.images && msg.images.length > 0;

            return (
              <li key={index} className="queue-item" data-testid={`queue-item-${index}`}>
                <span className="queue-item-text">{escapeHtml(truncated)}</span>
                {hasImages && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="queue-image-indicator">
                        📎{msg.images.length}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>{`${msg.images.length} image(s) attached`}</TooltipContent>
                  </Tooltip>
                )}
                <div className="queue-item-actions">
                  {onInject && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          type="button"
                          className="queue-item-inject"
                          onClick={() => onInject(index)}
                        >
                          ▶
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Send now (abort current and send this message)</TooltipContent>
                    </Tooltip>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        className="queue-item-remove"
                        onClick={() => onRemove(index)}
                      >
                        ×
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Remove from queue</TooltipContent>
                  </Tooltip>
                </div>
              </li>
          );
        })}
        </ul>
      </div>
    </TooltipProvider>
  );
}

// =============================================================================
// Image Preview Component
// =============================================================================

interface ImagePreviewProps {
  images: PastedImage[];
  onRemove: (index: number) => void;
}

function ImagePreview({ images, onRemove }: ImagePreviewProps) {
  if (images.length === 0) return null;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="image-preview" data-testid="image-preview">
        {images.map((img, index) => (
          <div key={index} className="image-preview-item">
            <img src={img.dataUrl} alt={img.filename} />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  className="image-remove"
                  onClick={() => onRemove(index)}
                >
                  X
                </Button>
              </TooltipTrigger>
              <TooltipContent>Remove image</TooltipContent>
            </Tooltip>
          </div>
        ))}
      </div>
    </TooltipProvider>
  );
}

// =============================================================================
// Editor Component
// =============================================================================

export function Editor({ onSubmit, isProcessing = false, placeholder, onInject }: EditorProps): React.ReactElement {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState('');
  const [pendingImages, setPendingImages] = useState<PastedImage[]>([]);

  // Mode state synced with Claude backend
  const { mode, setMode } = useModeSync();

  // Register Cmd+1/2/3 shortcuts for mode switching
  useModeSwitchShortcuts(setMode);

  // Hooks
  const { addToHistory, navigateUp, navigateDown, resetNavigation } = useCommandHistory();
  const {
    state: completionState,
    showCompletion,
    hideCompletion,
    updateCompletion,
    navigateUp: completionUp,
    navigateDown: completionDown,
    selectCurrent,
    isVisible: isCompletionVisible,
  } = useTabCompletion();
  const {
    queue,
    queueCount: _queueCount,
    bellMode,
    queueMessage,
    removeFromQueue,
    clearQueue,
    setProcessing,
    resumeQueue,
  } = useMessageQueueContext();

  // Sync processing state
  useEffect(() => {
    setProcessing(isProcessing);
  }, [isProcessing, setProcessing]);

  // Mode initialization is now handled by useModeSync hook

  // Listen for suggested prompts from QuickActions
  useEffect(() => {
    const handleSuggestPrompt = (e: CustomEvent<{ prompt: string }>) => {
      setValue(e.detail.prompt);
      textareaRef.current?.focus();
    };
    window.addEventListener('cyclist:suggest-prompt', handleSuggestPrompt as EventListener);
    return () => {
      window.removeEventListener('cyclist:suggest-prompt', handleSuggestPrompt as EventListener);
    };
  }, []);

  // ==========================================================================
  // Image Handling
  // ==========================================================================

  const handleImagePaste = useCallback(async (clipboardData: DataTransfer): Promise<boolean> => {
    let imageFile: File | null = null;

    // Check clipboard items
    if (clipboardData.items) {
      for (const item of clipboardData.items) {
        if (item.type && SUPPORTED_IMAGE_TYPES.includes(item.type)) {
          imageFile = item.getAsFile();
          break;
        }
      }
    }

    // Fallback to files
    if (!imageFile && clipboardData.files?.length > 0) {
      for (const file of clipboardData.files) {
        if (file.type && SUPPORTED_IMAGE_TYPES.includes(file.type)) {
          imageFile = file;
          break;
        }
      }
    }

    if (!imageFile) return false;

    // Check size
    if (imageFile.size > IMAGE_MAX_SIZE_BYTES) {
      console.warn('Image too large:', imageFile.size);
      return false;
    }

    // Convert to data URL
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const filename = imageFile!.name || `Pasted Image.${imageFile!.type.split('/')[1] || 'png'}`;
        setPendingImages(prev => [...prev, {
          dataUrl,
          mimeType: imageFile!.type,
          filename,
        }]);
        resolve(true);
      };
      reader.onerror = () => resolve(false);
      reader.readAsDataURL(imageFile);
    });
  }, []);

  const removeImage = useCallback((index: number) => {
    setPendingImages(prev => prev.filter((_, i) => i !== index));
  }, []);

  // ==========================================================================
  // Slash Prefix Detection
  // ==========================================================================

  const getSlashPrefix = useCallback((): { prefix: string; start: number; end: number } | null => {
    if (!textareaRef.current) return null;
    const cursorPos = textareaRef.current.selectionStart;
    const text = value;

    // Find word start
    let wordStart = cursorPos;
    while (wordStart > 0 && text[wordStart - 1] !== ' ' && text[wordStart - 1] !== '\n') {
      wordStart--;
    }

    const word = text.substring(wordStart, cursorPos);
    if (word.startsWith('/')) {
      return { prefix: word, start: wordStart, end: cursorPos };
    }
    return null;
  }, [value]);

  const replaceSlashPrefix = useCallback((commandName: string) => {
    const prefixInfo = getSlashPrefix();
    if (!prefixInfo) {
      setValue(prev => prev + commandName);
      return;
    }

    const { start, end } = prefixInfo;
    setValue(prev => prev.substring(0, start) + commandName + prev.substring(end));

    // Move cursor after command
    setTimeout(() => {
      if (textareaRef.current) {
        const newPos = start + commandName.length;
        textareaRef.current.selectionStart = textareaRef.current.selectionEnd = newPos;
      }
    }, 0);
  }, [getSlashPrefix]);

  // ==========================================================================
  // Submit Logic
  // ==========================================================================

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed && pendingImages.length === 0) return;

    // If processing, queue the message
    if (isProcessing) {
      const queued = queueMessage({ text: trimmed, images: [...pendingImages] });
      if (queued) {
        setValue('');
        setPendingImages([]);
        textareaRef.current?.focus();
      }
      return;
    }

    // Add to history and submit
    addToHistory(trimmed);
    resetNavigation();

    // Track slash command usage for frequency sorting
    if (trimmed.startsWith('/')) {
      const command = trimmed.split(/\s/)[0]; // Extract "/command" from "/command args"
      trackCommandUsage(command);
    }

    // Resume queue if it was paused (e.g., after abort)
    resumeQueue();

    // Dispatch event to clear QuickActions (Reflector questions)
    window.dispatchEvent(new CustomEvent('cyclist:user-submit'));

    onSubmit(trimmed, pendingImages);
    setValue('');
    setPendingImages([]);
    textareaRef.current?.focus();
  }, [value, pendingImages, isProcessing, queueMessage, addToHistory, resetNavigation, resumeQueue, onSubmit]);

  // ==========================================================================
  // Event Handlers
  // ==========================================================================

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Mode shortcuts are now handled globally by useModeSwitchShortcuts

    // Tab - trigger or select completion
    if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
      if (isCompletionVisible) {
        e.preventDefault();
        const selected = selectCurrent();
        if (selected) replaceSlashPrefix(selected);
        return;
      }
      const prefixInfo = getSlashPrefix();
      if (prefixInfo) {
        e.preventDefault();
        showCompletion(prefixInfo.prefix);
        return;
      }
    }

    // Escape - close completion
    if (e.key === 'Escape') {
      if (isCompletionVisible) {
        e.preventDefault();
        hideCompletion();
        return;
      }
    }

    // Enter - submit or select completion
    if (e.key === 'Enter' && !e.shiftKey) {
      if (isCompletionVisible) {
        e.preventDefault();
        const selected = selectCurrent();
        if (selected) replaceSlashPrefix(selected);
        return;
      }
      e.preventDefault();
      handleSubmit();
      return;
    }

    // Up arrow - completion or history
    if (e.key === 'ArrowUp' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
      if (isCompletionVisible) {
        e.preventDefault();
        completionUp();
        return;
      }
      // Only navigate history if at start
      if (textareaRef.current?.selectionStart === 0) {
        const prev = navigateUp(value);
        if (prev !== null) {
          e.preventDefault();
          setValue(prev);
          return;
        }
      }
    }

    // Down arrow - completion or history
    if (e.key === 'ArrowDown' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
      if (isCompletionVisible) {
        e.preventDefault();
        completionDown();
        return;
      }
      // Only navigate history if at end
      if (textareaRef.current?.selectionEnd === value.length) {
        const next = navigateDown();
        if (next !== null) {
          e.preventDefault();
          setValue(next);
          return;
        }
      }
    }
  }, [
    isCompletionVisible, selectCurrent, replaceSlashPrefix,
    getSlashPrefix, showCompletion, hideCompletion, handleSubmit,
    completionUp, completionDown, navigateUp, navigateDown, value
  ]);

  const handleChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setValue(newValue);

    // Auto-show completion when "/" is typed at start
    if (newValue === '/' && !isCompletionVisible) {
      showCompletion('/');
      return;
    }

    // Update completion if visible
    if (isCompletionVisible) {
      const prefixInfo = getSlashPrefix();
      if (prefixInfo) {
        updateCompletion(prefixInfo.prefix);
      } else {
        hideCompletion();
      }
    }
  }, [isCompletionVisible, showCompletion, getSlashPrefix, updateCompletion, hideCompletion]);

  const handlePaste = useCallback(async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    // Check for image
    let hasImage = false;
    if (clipboardData.items) {
      for (const item of clipboardData.items) {
        if (item.type && SUPPORTED_IMAGE_TYPES.includes(item.type)) {
          hasImage = true;
          break;
        }
      }
    }
    if (!hasImage && clipboardData.files?.length > 0) {
      for (const file of clipboardData.files) {
        if (file.type && SUPPORTED_IMAGE_TYPES.includes(file.type)) {
          hasImage = true;
          break;
        }
      }
    }

    if (hasImage) {
      e.preventDefault();
      await handleImagePaste(clipboardData);
    }
  }, [handleImagePaste]);

  const handleCompletionSelect = useCallback((index: number) => {
    const cmd = completionState.commands[index];
    if (cmd) {
      replaceSlashPrefix(cmd.name);
      hideCompletion();
    }
  }, [completionState.commands, replaceSlashPrefix, hideCompletion]);

  // ==========================================================================
  // Render
  // ==========================================================================

  return (
    <div className="editor-container" data-testid="editor-container">
      <ModeSwitch
        mode={mode}
        onModeChange={setMode}
        className="editor-mode-switch"
      />
      <div className="editor-wrapper" id="editor-wrapper">
        <ImagePreview images={pendingImages} onRemove={removeImage} />

        <textarea
          ref={textareaRef}
          id="editor-textarea"
          className="editor-textarea"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={placeholder}
          spellCheck={false}
          autoFocus
          data-testid="editor-textarea"
        />

        <CompletionPopup
          commands={completionState.commands}
          selectedIndex={completionState.selectedIndex}
          visible={isCompletionVisible}
          onSelect={handleCompletionSelect}
        />
      </div>

      <QueueDisplay
        queue={queue}
        bellMode={bellMode}
        onRemove={removeFromQueue}
        onClear={clearQueue}
        onInject={onInject}
      />
    </div>
  );
}

export default Editor;
