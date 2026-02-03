/**
 * ThemePalette Component
 *
 * A dropdown component for quick theme switching between color presets.
 * Story MSSCI-12768 - Color Palette System
 *
 * Features:
 * - Dropdown menu with all 8 presets
 * - Color swatches for visual preview
 * - Keyboard navigation
 * - ARIA attributes for accessibility
 */

import React, { useState, useRef, useEffect, useCallback, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { COLOR_PRESETS, getPresetIds, getPreset, ColorPreset } from '../../utils/color-presets';
import './ThemePalette.css';

// =============================================================================
// Types
// =============================================================================

export interface ThemePaletteProps {
  currentPreset: string;
  onSelect?: (presetId: string) => void;
  className?: string;
}

export interface RenderThemePaletteOptions {
  currentPreset: string;
  onSelect?: (presetId: string) => void;
}

// =============================================================================
// ThemePalette Component
// =============================================================================

export function ThemePalette({ currentPreset, onSelect, className = '' }: ThemePaletteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const presetIds = getPresetIds();
  const currentPresetData = getPreset(currentPreset);

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

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
    if (!isOpen) {
      setFocusedIndex(presetIds.indexOf(currentPreset));
    }
  }, [isOpen, currentPreset, presetIds]);

  const handleSelect = useCallback(
    (presetId: string) => {
      onSelect?.(presetId);
      setIsOpen(false);
      buttonRef.current?.focus();
    },
    [onSelect]
  );

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setFocusedIndex((prev) => (prev + 1) % presetIds.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setFocusedIndex((prev) => (prev - 1 + presetIds.length) % presetIds.length);
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (focusedIndex >= 0) {
            handleSelect(presetIds[focusedIndex]);
          }
          break;
        case 'Home':
          e.preventDefault();
          setFocusedIndex(0);
          break;
        case 'End':
          e.preventDefault();
          setFocusedIndex(presetIds.length - 1);
          break;
      }
    },
    [isOpen, focusedIndex, presetIds, handleSelect]
  );

  return (
    <div className={`theme-palette ${className}`}>
      <button
        ref={buttonRef}
        className="theme-palette-button"
        onClick={handleToggle}
        aria-label={`Select theme, current: ${currentPresetData?.name || currentPreset}`}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className="theme-palette-current">
          {currentPresetData && (
            <span
              className="preset-swatch"
              style={{ backgroundColor: currentPresetData.colors.bgPrimary }}
            />
          )}
          <span className="theme-palette-name">{currentPresetData?.name || currentPreset}</span>
        </span>
        <span className="theme-palette-chevron" aria-hidden="true">
          ▼
        </span>
      </button>

      <div
        ref={menuRef}
        className={`theme-palette-menu ${isOpen ? 'open' : ''}`}
        role="listbox"
        aria-label="Available themes"
        onKeyDown={handleKeyDown}
      >
        {presetIds.map((id, index) => {
          const preset = getPreset(id);
          if (!preset) return null;

          const isActive = id === currentPreset;
          const isFocused = index === focusedIndex;

          return (
            <button
              key={id}
              ref={(el) => (optionRefs.current[index] = el)}
              className={`theme-palette-option ${isActive ? 'active' : ''} ${isFocused ? 'focused' : ''}`}
              role="option"
              aria-selected={isActive}
              data-preset-id={id}
              onClick={() => handleSelect(id)}
              tabIndex={isOpen ? 0 : -1}
            >
              <div className="preset-swatches">
                <span
                  className="preset-swatch"
                  style={{ backgroundColor: preset.colors.bgPrimary }}
                  title="Background"
                />
                <span
                  className="preset-swatch"
                  style={{ backgroundColor: preset.colors.textPrimary }}
                  title="Text"
                />
                <span
                  className="preset-swatch"
                  style={{ backgroundColor: preset.colors.accent }}
                  title="Accent"
                />
              </div>
              <span className="preset-name">{preset.name}</span>
              {isActive && (
                <span className="preset-check" aria-hidden="true">
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// Render Function (for vanilla JS usage)
// =============================================================================

export function renderThemePalette(
  container: HTMLElement,
  options: RenderThemePaletteOptions
): void {
  const { currentPreset, onSelect } = options;

  // Create wrapper element
  const wrapper = document.createElement('div');
  wrapper.className = 'theme-palette';

  // Create button
  const button = document.createElement('button');
  button.className = 'theme-palette-button';
  const preset = getPreset(currentPreset);
  button.setAttribute('aria-label', `Select theme, current: ${preset?.name || currentPreset}`);
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-haspopup', 'listbox');

  button.innerHTML = `
    <span class="theme-palette-current">
      ${preset ? `<span class="preset-swatch" style="background-color: ${preset.colors.bgPrimary}"></span>` : ''}
      <span class="theme-palette-name">${preset?.name || currentPreset}</span>
    </span>
    <span class="theme-palette-chevron" aria-hidden="true">▼</span>
  `;

  // Create menu
  const menu = document.createElement('div');
  menu.className = 'theme-palette-menu';
  menu.setAttribute('role', 'listbox');
  menu.setAttribute('aria-label', 'Available themes');

  const presetIds = getPresetIds();
  presetIds.forEach((id) => {
    const p = getPreset(id);
    if (!p) return;

    const option = document.createElement('button');
    option.className = `theme-palette-option ${id === currentPreset ? 'active' : ''}`;
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', id === currentPreset ? 'true' : 'false');
    option.setAttribute('data-preset-id', id);
    option.tabIndex = -1;

    option.innerHTML = `
      <div class="preset-swatches">
        <span class="preset-swatch" style="background-color: ${p.colors.bgPrimary}" title="Background"></span>
        <span class="preset-swatch" style="background-color: ${p.colors.textPrimary}" title="Text"></span>
        <span class="preset-swatch" style="background-color: ${p.colors.accent}" title="Accent"></span>
      </div>
      <span class="preset-name">${p.name}</span>
      ${id === currentPreset ? '<span class="preset-check" aria-hidden="true">✓</span>' : ''}
    `;

    option.addEventListener('click', () => {
      onSelect?.(id);
      menu.classList.remove('open');
      button.setAttribute('aria-expanded', 'false');
    });

    menu.appendChild(option);
  });

  // Toggle menu
  button.addEventListener('click', () => {
    const isOpen = menu.classList.toggle('open');
    button.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });

  // Close on click outside
  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target as Node)) {
      menu.classList.remove('open');
      button.setAttribute('aria-expanded', 'false');
    }
  });

  // Close on escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.classList.contains('open')) {
      menu.classList.remove('open');
      button.setAttribute('aria-expanded', 'false');
    }
  });

  // Keyboard navigation
  menu.addEventListener('keydown', (e) => {
    const options = Array.from(menu.querySelectorAll('.theme-palette-option'));
    const focusedIndex = options.findIndex((el) => el === document.activeElement);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = (focusedIndex + 1) % options.length;
      (options[nextIndex] as HTMLElement).focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = (focusedIndex - 1 + options.length) % options.length;
      (options[prevIndex] as HTMLElement).focus();
    }
  });

  wrapper.appendChild(button);
  wrapper.appendChild(menu);
  container.appendChild(wrapper);
}

export default ThemePalette;
