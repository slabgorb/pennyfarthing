/**
 * FontPicker Component
 *
 * Font selection dropdown with preview and custom font input.
 * Story MSSCI-12769 - Font Customization
 *
 * Features:
 * - Dropdown with font previews
 * - Custom font family input
 * - Font size picker (segmented control)
 * - ARIA accessibility
 */

import React, { useState, useRef, useEffect, useCallback, KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  UI_FONT_PRESETS,
  CODE_FONT_PRESETS,
  FONT_SIZE_SCALE,
  FontPreset,
  FontSize,
} from '../../utils/font-presets';
import './FontPicker.css';

// =============================================================================
// Types
// =============================================================================

export interface FontPickerProps {
  type: 'ui' | 'code';
  currentFont: string;
  customFont?: string;
  onSelect: (presetId: string, customFamily?: string) => void;
  onCustomFontChange?: (family: string) => void;
  className?: string;
}

export interface FontSizePickerProps {
  currentSize: FontSize;
  onSelect: (size: FontSize) => void;
  className?: string;
}

// =============================================================================
// FontPicker Component
// =============================================================================

export function FontPicker({
  type,
  currentFont,
  customFont,
  onSelect,
  onCustomFontChange,
  className = '',
}: FontPickerProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [customValue, setCustomValue] = useState(customFont || '');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const presets = type === 'ui' ? UI_FONT_PRESETS : CODE_FONT_PRESETS;
  const currentPreset = presets.find(p => p.id === currentFont);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener('click', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  // Focus management
  useEffect(() => {
    if (isOpen && focusedIndex >= 0 && optionRefs.current[focusedIndex]) {
      optionRefs.current[focusedIndex]?.focus();
    }
  }, [focusedIndex, isOpen]);

  // Update custom value when prop changes
  useEffect(() => {
    if (customFont !== undefined) {
      setCustomValue(customFont);
    }
  }, [customFont]);

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
    if (!isOpen) {
      const currentIndex = presets.findIndex(p => p.id === currentFont);
      setFocusedIndex(currentIndex >= 0 ? currentIndex : 0);
    }
  }, [isOpen, currentFont, presets]);

  const handleSelect = useCallback(
    (presetId: string) => {
      onSelect(presetId);
      setIsOpen(false);
      buttonRef.current?.focus();
    },
    [onSelect]
  );

  const handleCustomChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setCustomValue(value);
      onCustomFontChange?.(value);
      if (currentFont === 'custom') {
        onSelect('custom', value);
      }
    },
    [currentFont, onSelect, onCustomFontChange]
  );

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setFocusedIndex((prev) => (prev + 1) % presets.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setFocusedIndex((prev) => (prev - 1 + presets.length) % presets.length);
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (focusedIndex >= 0) {
            handleSelect(presets[focusedIndex].id);
          }
          break;
        case 'Home':
          e.preventDefault();
          setFocusedIndex(0);
          break;
        case 'End':
          e.preventDefault();
          setFocusedIndex(presets.length - 1);
          break;
      }
    },
    [isOpen, focusedIndex, presets, handleSelect]
  );

  const getDisplayName = () => {
    if (currentPreset?.isCustom && customValue) {
      return customValue;
    }
    return currentPreset?.name || currentFont;
  };

  const getDisplayFont = () => {
    if (currentPreset?.isCustom && customValue) {
      return customValue;
    }
    return currentPreset?.fontFamily || 'inherit';
  };

  return (
    <div className={`font-picker ${className}`}>
      <button
        ref={buttonRef}
        className="font-picker-button"
        onClick={handleToggle}
        aria-label={`Select ${type} font, current: ${getDisplayName()}`}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        style={{ fontFamily: getDisplayFont() }}
      >
        <span className="font-picker-current">
          <span className="font-picker-name">{getDisplayName()}</span>
        </span>
        <span className="font-picker-chevron" aria-hidden="true">
          &#9660;
        </span>
      </button>

      <div
        ref={menuRef}
        className={`font-picker-menu ${isOpen ? 'open' : ''}`}
        role="listbox"
        aria-label={`Available ${type} fonts`}
        onKeyDown={handleKeyDown}
      >
        {presets.map((preset, index) => {
          const isActive = preset.id === currentFont;
          const isFocused = index === focusedIndex;

          return (
            <button
              key={preset.id}
              ref={(el) => (optionRefs.current[index] = el)}
              className={`font-picker-option ${isActive ? 'active' : ''} ${isFocused ? 'focused' : ''}`}
              role="option"
              aria-selected={isActive}
              data-font-id={preset.id}
              onClick={() => handleSelect(preset.id)}
              tabIndex={isOpen ? 0 : -1}
              style={{ fontFamily: preset.isCustom ? 'inherit' : preset.fontFamily }}
            >
              <span className="font-name">{preset.name}</span>
              {!preset.isCustom && (
                <span className="font-preview" style={{ fontFamily: preset.fontFamily }}>
                  Aa
                </span>
              )}
              {isActive && (
                <span className="font-check" aria-hidden="true">
                  &#10003;
                </span>
              )}
            </button>
          );
        })}
      </div>

      {currentFont === 'custom' && (
        <input
          type="text"
          className="font-picker-custom-input"
          value={customValue}
          onChange={handleCustomChange}
          placeholder="Enter font family..."
          aria-label="Custom font family"
        />
      )}
    </div>
  );
}

// =============================================================================
// FontSizePicker Component
// =============================================================================

const SIZES: FontSize[] = ['xs', 'sm', 'base', 'lg', 'xl'];

export function FontSizePicker({
  currentSize,
  onSelect,
  className = '',
}: FontSizePickerProps): React.ReactElement {
  return (
    <div className={`font-size-picker ${className}`} role="group" aria-label="Font size">
      {SIZES.map((size) => (
        <button
          key={size}
          className={`font-size-option ${size === currentSize ? 'active' : ''}`}
          data-size={size}
          onClick={() => onSelect(size)}
          aria-pressed={size === currentSize}
          title={`${FONT_SIZE_SCALE[size]} (${size})`}
        >
          {size.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

export default FontPicker;
