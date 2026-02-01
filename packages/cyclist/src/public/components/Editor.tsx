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
import { useCommandHistory } from '../hooks/useCommandHistory';
import { useTabCompletion } from '../hooks/useTabCompletion';
import { useMessageQueue, QueuedMessage } from '../hooks/useMessageQueue';

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
}

type PermissionMode = 'default' | 'plan' | 'acceptEdits' | 'dangerouslySkipPermissions';

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
// Queue Indicator Component
// =============================================================================

interface QueueIndicatorProps {
  count: number;
  onClear: () => void;
}

function QueueIndicator({ count, onClear }: QueueIndicatorProps) {
  if (count === 0) return null;

  return (
    <div className="queue-indicator" data-testid="queue-indicator">
      <span className="queue-count">{count} queued</span>
      <button
        type="button"
        className="queue-clear"
        onClick={onClear}
        title="Clear queue"
      >
        Clear
      </button>
    </div>
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
    <div className="image-preview" data-testid="image-preview">
      {images.map((img, index) => (
        <div key={index} className="image-preview-item">
          <img src={img.dataUrl} alt={img.filename} />
          <button
            type="button"
            className="image-remove"
            onClick={() => onRemove(index)}
            title="Remove image"
          >
            X
          </button>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// Mode Toolbar Component
// =============================================================================

interface ModeToolbarProps {
  mode: PermissionMode;
  onModeChange: (mode: PermissionMode) => void;
}

function ModeToolbar({ mode, onModeChange }: ModeToolbarProps) {
  return (
    <div className="mode-toolbar" data-testid="mode-toolbar">
      <button
        type="button"
        className={`mode-button ${mode === 'default' ? 'active' : ''}`}
        onClick={() => onModeChange('default')}
        title="Manual mode - ask for permission (Cmd+1)"
      >
        Manual
      </button>
      <button
        type="button"
        className={`mode-button ${mode === 'plan' ? 'active' : ''}`}
        onClick={() => onModeChange('plan')}
        title="Plan mode - read-only exploration (Cmd+2)"
      >
        Plan
      </button>
      <button
        type="button"
        className={`mode-button ${mode === 'acceptEdits' ? 'active' : ''}`}
        onClick={() => onModeChange('acceptEdits')}
        title="Auto-accept edits (Cmd+3)"
      >
        Accept
      </button>
    </div>
  );
}

// =============================================================================
// Editor Component
// =============================================================================

export function Editor({ onSubmit, isProcessing = false, placeholder }: EditorProps): React.ReactElement {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState('');
  const [pendingImages, setPendingImages] = useState<PastedImage[]>([]);
  const [mode, setMode] = useState<PermissionMode>('default');

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
  const { queue, queueCount, queueMessage, clearQueue, setProcessing } = useMessageQueue();

  // Sync processing state
  useEffect(() => {
    setProcessing(isProcessing);
  }, [isProcessing, setProcessing]);

  // Load initial mode from API
  useEffect(() => {
    window.electronAPI?.claude?.getMode?.().then(m => {
      if (m) setMode(m);
    });
  }, []);

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
    onSubmit(trimmed, pendingImages);
    setValue('');
    setPendingImages([]);
    textareaRef.current?.focus();
  }, [value, pendingImages, isProcessing, queueMessage, addToHistory, resetNavigation, onSubmit]);

  // ==========================================================================
  // Mode Change
  // ==========================================================================

  const handleModeChange = useCallback((newMode: PermissionMode) => {
    setMode(newMode);
    window.electronAPI?.claude?.setMode?.(newMode);
  }, []);

  // ==========================================================================
  // Event Handlers
  // ==========================================================================

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Mode shortcuts (Cmd+1/2/3)
    if (e.metaKey || e.ctrlKey) {
      if (e.key === '1') {
        e.preventDefault();
        handleModeChange('default');
        return;
      }
      if (e.key === '2') {
        e.preventDefault();
        handleModeChange('plan');
        return;
      }
      if (e.key === '3') {
        e.preventDefault();
        handleModeChange('acceptEdits');
        return;
      }
    }

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
    handleModeChange, isCompletionVisible, selectCurrent, replaceSlashPrefix,
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
      <ModeToolbar mode={mode} onModeChange={handleModeChange} />

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

      <QueueIndicator count={queueCount} onClear={clearQueue} />
    </div>
  );
}

export default Editor;
