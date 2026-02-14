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
// Monospace Detection via OpenType `post` table
// =============================================================================

/**
 * Parse SFNT table directory to find a table's offset and length.
 * SFNT header: version(4) + numTables(2) + searchRange(2) + entrySelector(2) + rangeShift(2) = 12
 * Each table record: tag(4) + checksum(4) + offset(4) + length(4) = 16
 */
function findSfntTable(view: DataView, tag: string): { offset: number; length: number } | null {
  const numTables = view.getUint16(4);
  for (let i = 0; i < numTables; i++) {
    const recordOffset = 12 + i * 16;
    const tableTag = String.fromCharCode(
      view.getUint8(recordOffset),
      view.getUint8(recordOffset + 1),
      view.getUint8(recordOffset + 2),
      view.getUint8(recordOffset + 3),
    );
    if (tableTag === tag) {
      return {
        offset: view.getUint32(recordOffset + 8),
        length: view.getUint32(recordOffset + 12),
      };
    }
  }
  return null;
}

/**
 * Read `isFixedPitch` from the `post` table.
 * post layout: version(4) + italicAngle(4) + underlinePosition(2) + underlineThickness(2) = offset 12
 * isFixedPitch is uint32 at offset 12: 0 = proportional, non-zero = monospace.
 */
async function detectMonospaceFromBlob(fontData: { blob: () => Promise<Blob> }): Promise<boolean> {
  try {
    const blob = await fontData.blob();
    const buffer = await blob.arrayBuffer();
    const view = new DataView(buffer);

    const post = findSfntTable(view, 'post');
    if (post) {
      const isFixedPitch = view.getUint32(post.offset + 12);
      return isFixedPitch !== 0;
    }
    return false;
  } catch {
    return false;
  }
}

// =============================================================================
// System Font Discovery
// =============================================================================

interface FontDataEntry {
  family: string;
  fullName: string;
  postscriptName: string;
  style: string;
  blob: () => Promise<Blob>;
}

const FONT_CACHE_KEY = 'cyclist-system-fonts';

interface FontCacheData {
  fonts: SystemFont[];
  count: number; // number of font families — if it changes, fonts were installed/removed
}

function loadCachedFonts(): SystemFont[] | null {
  try {
    const raw = localStorage.getItem(FONT_CACHE_KEY);
    if (!raw) return null;
    const data: FontCacheData = JSON.parse(raw);
    if (data.fonts?.length > 0) return data.fonts;
    return null;
  } catch {
    return null;
  }
}

function saveCachedFonts(fonts: SystemFont[], count: number): void {
  try {
    const data: FontCacheData = { fonts, count };
    localStorage.setItem(FONT_CACHE_KEY, JSON.stringify(data));
  } catch {
    // localStorage full or unavailable — not critical
  }
}

let systemFontsPromise: Promise<SystemFont[]> | null = null;

async function getSystemFonts(): Promise<SystemFont[]> {
  if (systemFontsPromise) return systemFontsPromise;

  systemFontsPromise = (async () => {
    if (!('queryLocalFonts' in window)) {
      return [];
    }

    try {
      const fonts: FontDataEntry[] = await (window as unknown as { queryLocalFonts: () => Promise<FontDataEntry[]> }).queryLocalFonts();

      // Deduplicate by family name, keep one FontData per family for mono detection
      const familyMap = new Map<string, FontDataEntry>();
      for (const font of fonts) {
        if (!familyMap.has(font.family)) {
          familyMap.set(font.family, font);
        }
      }

      const familyCount = familyMap.size;

      // Check localStorage cache — reuse if font count hasn't changed
      const cached = loadCachedFonts();
      if (cached && cached.length > 0) {
        // Load raw cached data to check count
        try {
          const raw = localStorage.getItem(FONT_CACHE_KEY);
          if (raw) {
            const data: FontCacheData = JSON.parse(raw);
            if (data.count === familyCount) {
              return cached;
            }
          }
        } catch {
          // Fall through to re-detect
        }
      }

      // Detect monospace via post table in parallel
      const entries = Array.from(familyMap.entries());
      const monoResults = await Promise.all(
        entries.map(([, fontData]) => detectMonospaceFromBlob(fontData))
      );

      const result: SystemFont[] = entries.map(([family], i) => ({
        family,
        isMonospace: monoResults[i],
      }));

      result.sort((a, b) => a.family.localeCompare(b.family));
      saveCachedFonts(result, familyCount);
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

  // Filter system fonts: English-only (Latin names), monospace-only for code
  const filteredSystemFonts = useMemo(() => {
    let fonts = systemFonts;

    // Filter to fonts with Latin-script names (excludes CJK, Arabic, Devanagari, etc.)
    fonts = fonts.filter(f => /^[\x20-\x7E\u00C0-\u024F]+$/.test(f.family));

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
