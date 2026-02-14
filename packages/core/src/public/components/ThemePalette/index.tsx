/**
 * ThemePalette Component
 *
 * A dropdown component for quick theme switching between color presets.
 * Story MSSCI-12768 - Color Palette System
 *
 * Features:
 * - Popover menu with presets grouped by variant (dark/light)
 * - Searchable preset list via Command input
 * - 4-swatch visual preview (bg, bgSecondary, text, accent)
 * - Keyboard navigation (handled by Popover + Command primitives)
 * - ARIA attributes for accessibility
 */

import React, { useMemo, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { getPresetIds, getPreset } from '../../utils/color-presets';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
  Command,
  CommandInput,
  CommandList,
  CommandGroup,
  CommandItem,
  CommandEmpty,
} from '@/components/ui/command';
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
// Helpers
// =============================================================================

interface GroupedPresets {
  dark: string[];
  light: string[];
}

function groupPresetsByVariant(): GroupedPresets {
  const ids = getPresetIds();
  const dark: string[] = [];
  const light: string[] = [];

  for (const id of ids) {
    const preset = getPreset(id);
    if (!preset) continue;
    if (preset.variant === 'light') {
      light.push(id);
    } else {
      dark.push(id);
    }
  }

  dark.sort((a, b) => (getPreset(a)?.name || '').localeCompare(getPreset(b)?.name || ''));
  light.sort((a, b) => (getPreset(a)?.name || '').localeCompare(getPreset(b)?.name || ''));

  return { dark, light };
}

// =============================================================================
// Swatch rendering
// =============================================================================

function PresetSwatches({ presetId }: { presetId: string }) {
  const preset = getPreset(presetId);
  if (!preset) return null;

  return (
    <div className="preset-swatches">
      <span
        className="preset-swatch"
        style={{ backgroundColor: preset.colors.bgPrimary }}
        title="Background"
      />
      <span
        className="preset-swatch"
        style={{ backgroundColor: preset.colors.bgSecondary }}
        title="Surface"
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
  );
}

// =============================================================================
// ThemePalette Component
// =============================================================================

export function ThemePalette({ currentPreset, onSelect, className = '' }: ThemePaletteProps) {
  const [open, setOpen] = useState(false);
  const grouped = useMemo(() => groupPresetsByVariant(), []);
  const currentPresetData = getPreset(currentPreset);

  const handleSelect = (presetId: string) => {
    onSelect?.(presetId);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn('theme-palette-button', className)}
          aria-label={`Select theme, current: ${currentPresetData?.name || currentPreset}`}
        >
          <span className="theme-palette-current">
            {currentPresetData && (
              <span
                className="preset-swatch"
                style={{ backgroundColor: currentPresetData.colors.bgPrimary }}
              />
            )}
            <span className="theme-palette-name">
              {currentPresetData?.name || currentPreset}
            </span>
          </span>
          <ChevronsUpDown className="theme-palette-chevron" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="theme-palette-popover p-0" align="start">
        <Command>
          <CommandInput placeholder="Search themes..." />
          <CommandList>
            <CommandEmpty>No theme found.</CommandEmpty>
            <CommandGroup heading={`Dark (${grouped.dark.length})`}>
              {grouped.dark.map((id) => {
                const preset = getPreset(id);
                if (!preset) return null;
                const isActive = id === currentPreset;
                return (
                  <CommandItem
                    key={id}
                    value={preset.name}
                    onSelect={() => handleSelect(id)}
                    data-preset-id={id}
                  >
                    <PresetSwatches presetId={id} />
                    <span className="preset-name">{preset.name}</span>
                    <Check
                      className={cn(
                        'preset-check-icon ml-auto',
                        isActive ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                  </CommandItem>
                );
              })}
            </CommandGroup>
            <CommandGroup heading={`Light (${grouped.light.length})`}>
              {grouped.light.map((id) => {
                const preset = getPreset(id);
                if (!preset) return null;
                const isActive = id === currentPreset;
                return (
                  <CommandItem
                    key={id}
                    value={preset.name}
                    onSelect={() => handleSelect(id)}
                    data-preset-id={id}
                  >
                    <PresetSwatches presetId={id} />
                    <span className="preset-name">{preset.name}</span>
                    <Check
                      className={cn(
                        'preset-check-icon ml-auto',
                        isActive ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
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

  const wrapper = document.createElement('div');
  wrapper.className = 'theme-palette';

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
    <span class="theme-palette-chevron" aria-hidden="true">&#x25BC;</span>
  `;

  const menu = document.createElement('div');
  menu.className = 'theme-palette-menu';
  menu.setAttribute('role', 'listbox');
  menu.setAttribute('aria-label', 'Available themes');

  const grouped = groupPresetsByVariant();

  const renderGroup = (ids: string[], label: string) => {
    const header = document.createElement('div');
    header.className = 'preset-group-header';
    header.setAttribute('role', 'presentation');
    header.textContent = `${label} (${ids.length})`;
    menu.appendChild(header);

    ids.forEach((id) => {
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
          <span class="preset-swatch" style="background-color: ${p.colors.bgSecondary}" title="Surface"></span>
          <span class="preset-swatch" style="background-color: ${p.colors.textPrimary}" title="Text"></span>
          <span class="preset-swatch" style="background-color: ${p.colors.accent}" title="Accent"></span>
        </div>
        <span class="preset-name">${p.name}</span>
        ${id === currentPreset ? '<span class="preset-check" aria-hidden="true">&#x2713;</span>' : ''}
      `;

      option.addEventListener('click', () => {
        onSelect?.(id);
        menu.classList.remove('open');
        button.setAttribute('aria-expanded', 'false');
      });

      menu.appendChild(option);
    });
  };

  renderGroup(grouped.dark, 'Dark');
  renderGroup(grouped.light, 'Light');

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
    const focusedIdx = options.findIndex((el) => el === document.activeElement);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = (focusedIdx + 1) % options.length;
      (options[nextIndex] as HTMLElement).focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = (focusedIdx - 1 + options.length) % options.length;
      (options[prevIndex] as HTMLElement).focus();
    }
  });

  wrapper.appendChild(button);
  wrapper.appendChild(menu);
  container.appendChild(wrapper);
}

export default ThemePalette;
