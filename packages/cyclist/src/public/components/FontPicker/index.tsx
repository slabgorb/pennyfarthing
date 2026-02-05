/**
 * FontPicker Component
 *
 * Font selection with system font browser via queryLocalFonts() API.
 * Story MSSCI-12769 - Font Customization
 *
 * Features:
 * - shadcn Select-based dropdown with system font discovery
 * - Live font preview in each option
 * - Monospace detection for code font filtering
 * - Graceful fallback when queryLocalFonts() unavailable
 * - Font size picker (segmented control)
 * - ARIA accessibility via Radix Select
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  UI_FONT_PRESETS,
  CODE_FONT_PRESETS,
  FONT_SIZE_SCALE,
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

interface SystemFont {
  family: string;
  isMonospace: boolean;
}

// =============================================================================
// Monospace Detection
// =============================================================================

const monoCache = new Map<string, boolean>();

function detectMonospace(fontFamily: string): boolean {
  if (monoCache.has(fontFamily)) {
    return monoCache.get(fontFamily)!;
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    monoCache.set(fontFamily, false);
    return false;
  }

  ctx.font = `16px "${fontFamily}", monospace`;
  const wideChar = ctx.measureText('W').width;
  const narrowChar = ctx.measureText('i').width;
  const isMono = Math.abs(wideChar - narrowChar) < 1;

  monoCache.set(fontFamily, isMono);
  return isMono;
}

// =============================================================================
// System Font Discovery
// =============================================================================

let systemFontsCache: SystemFont[] | null = null;
let systemFontsPromise: Promise<SystemFont[]> | null = null;

async function getSystemFonts(): Promise<SystemFont[]> {
  if (systemFontsCache) return systemFontsCache;
  if (systemFontsPromise) return systemFontsPromise;

  systemFontsPromise = (async () => {
    if (!('queryLocalFonts' in window)) {
      return [];
    }

    try {
      const fonts = await (window as unknown as { queryLocalFonts: () => Promise<Array<{ family: string }>> }).queryLocalFonts();

      // Deduplicate by family name
      const families = new Set<string>();
      for (const font of fonts) {
        families.add(font.family);
      }

      const result: SystemFont[] = [];
      for (const family of families) {
        result.push({
          family,
          isMonospace: detectMonospace(family),
        });
      }

      result.sort((a, b) => a.family.localeCompare(b.family));
      systemFontsCache = result;
      return result;
    } catch {
      // Permission denied or API error
      return [];
    }
  })();

  return systemFontsPromise;
}

// Prefix for system font values to distinguish from preset IDs
const SYSTEM_FONT_PREFIX = 'system-font:';

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
  const [customValue, setCustomValue] = useState(customFont || '');
  const [systemFonts, setSystemFonts] = useState<SystemFont[]>([]);
  const [fontsLoaded, setFontsLoaded] = useState(false);

  const presets = type === 'ui' ? UI_FONT_PRESETS : CODE_FONT_PRESETS;
  const currentPreset = presets.find(p => p.id === currentFont);

  // Load system fonts eagerly
  useEffect(() => {
    if (!fontsLoaded) {
      getSystemFonts().then(fonts => {
        setSystemFonts(fonts);
        setFontsLoaded(true);
      });
    }
  }, [fontsLoaded]);

  // Filter system fonts for code type (monospace only)
  const filteredSystemFonts = useMemo(() => {
    let fonts = systemFonts;

    // For code fonts, only show monospace
    if (type === 'code') {
      fonts = fonts.filter(f => f.isMonospace);
    }

    return fonts;
  }, [systemFonts, type]);

  // Non-custom presets for display
  const displayPresets = useMemo(() => {
    return presets.filter(p => !p.isCustom);
  }, [presets]);

  // Update custom value when prop changes
  useEffect(() => {
    if (customFont !== undefined) {
      setCustomValue(customFont);
    }
  }, [customFont]);

  // Compute the Select value: for system fonts we encode as "system-font:FamilyName"
  const selectValue = useMemo(() => {
    if (currentFont === 'custom' && customValue) {
      // Check if this matches a system font
      const isSystemFont = systemFonts.some(f => f.family === customValue);
      if (isSystemFont) {
        return `${SYSTEM_FONT_PREFIX}${customValue}`;
      }
      return 'custom';
    }
    return currentFont;
  }, [currentFont, customValue, systemFonts]);

  const handleValueChange = useCallback(
    (value: string) => {
      if (value.startsWith(SYSTEM_FONT_PREFIX)) {
        const family = value.slice(SYSTEM_FONT_PREFIX.length);
        onSelect('custom', family);
      } else if (value === 'custom') {
        onSelect('custom');
      } else {
        onSelect(value);
      }
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

  const hasSystemFonts = systemFonts.length > 0;
  const showCustomInput = currentFont === 'custom' && !hasSystemFonts;

  return (
    <div className={`font-picker ${className}`}>
      <Select value={selectValue} onValueChange={handleValueChange}>
        <SelectTrigger
          className="font-picker-trigger"
          aria-label={`Select ${type} font`}
          style={{ fontFamily: currentPreset?.fontFamily || (customValue ? `"${customValue}"` : 'inherit') }}
        >
          <SelectValue placeholder="Select font..." />
        </SelectTrigger>
        <SelectContent className="max-h-[300px]">
          {/* Presets section */}
          {displayPresets.length > 0 && (
            <SelectGroup>
              <SelectLabel>Presets</SelectLabel>
              {displayPresets.map((preset) => (
                <SelectItem
                  key={preset.id}
                  value={preset.id}
                  style={{ fontFamily: preset.fontFamily || 'inherit' }}
                >
                  <span className="font-picker-item-content">
                    <span className="font-name">{preset.name}</span>
                    <span className="font-preview" style={{ fontFamily: preset.fontFamily }}>
                      Aa
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          )}

          {/* System fonts section */}
          {hasSystemFonts && filteredSystemFonts.length > 0 && (
            <SelectGroup>
              <SelectLabel>System Fonts ({filteredSystemFonts.length})</SelectLabel>
              {filteredSystemFonts.map((font) => (
                <SelectItem
                  key={font.family}
                  value={`${SYSTEM_FONT_PREFIX}${font.family}`}
                  style={{ fontFamily: `"${font.family}", inherit` }}
                >
                  <span className="font-picker-item-content">
                    <span className="font-name">{font.family}</span>
                    <span className="font-preview" style={{ fontFamily: `"${font.family}"` }}>
                      Aa
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          )}

          {/* Custom option (fallback when no system fonts) */}
          {!hasSystemFonts && fontsLoaded && (
            <SelectGroup>
              <SelectLabel>Custom</SelectLabel>
              <SelectItem value="custom">
                Custom...
              </SelectItem>
            </SelectGroup>
          )}
        </SelectContent>
      </Select>

      {showCustomInput && (
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
    <TooltipProvider delayDuration={300}>
    <div className={`font-size-picker ${className}`} role="group" aria-label="Font size">
      {SIZES.map((size) => (
        <Tooltip key={size}>
          <TooltipTrigger asChild>
            <Button
              variant={size === currentSize ? 'secondary' : 'ghost'}
              size="sm"
              className={`font-size-option ${size === currentSize ? 'active' : ''}`}
              data-size={size}
              onClick={() => onSelect(size)}
              aria-pressed={size === currentSize}
            >
              {size.toUpperCase()}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{`${FONT_SIZE_SCALE[size]} (${size})`}</TooltipContent>
        </Tooltip>
      ))}
    </div>
    </TooltipProvider>
  );
}

export default FontPicker;
