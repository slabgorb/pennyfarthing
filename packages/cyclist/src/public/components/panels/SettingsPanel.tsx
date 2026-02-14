/**
 * SettingsPanel - Settings/preferences panel
 *
 * Story MSSCI-12717 - React Migration
 * Updated to match actual config.local.yaml structure
 * Story MSSCI-12817 - Added Color Palette section with ThemePalette
 * Story MSSCI-12769 - Added Fonts section with FontPicker
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ThemePalette } from '../ThemePalette';
import { FontPicker, FontSizePicker } from '../FontPicker';
import {
  applyPreset,
  savePresetToProject,
  loadPresetFromProject,
  DEFAULT_PRESET,
} from '../../utils/color-presets';
import {
  loadFontSettings,
  saveFontSettings,
  applyFontSettings,
  DEFAULT_FONT_SETTINGS,
  FontSettings,
  FontSize,
} from '../../utils/font-presets';

interface Settings {
  workflow?: {
    permission_mode?: 'plan' | 'manual' | 'accept';
    bell_mode?: boolean;
    relay_mode?: boolean;
    handoff_mode?: string;
  };
  display?: {
    show_flow?: boolean;
    sidebar_width?: number;
  };
  pennyfarthing?: {
    theme?: string;
  };
}

interface ThemeMetadata {
  id: string;
  name: string;
  tier: string;
}

// Tier sort order: S=0, A=1, B=2, unranked=3
const TIER_ORDER: Record<string, number> = { S: 0, A: 1, B: 2 };


export function SettingsPanel(): React.ReactElement {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [themes, setThemes] = useState<ThemeMetadata[]>([]);
  const [saving, setSaving] = useState(false);
  const [colorPreset, setColorPreset] = useState<string>(DEFAULT_PRESET);
  const [fontSettings, setFontSettings] = useState<FontSettings>(DEFAULT_FONT_SETTINGS);

  useEffect(() => {
    // Load settings via REST
    async function loadSettings() {
      try {
        console.log('[SettingsPanel] Loading settings via REST');
        const response = await fetch('/api/settings');
        if (response.ok) {
          const data = await response.json();
          console.log('[SettingsPanel] Settings loaded:', data);
          setSettings(data as Settings);
        }
      } catch (err) {
        console.error('[SettingsPanel] Failed to load settings:', err);
      }
    }

    // Load theme metadata via REST
    async function loadThemes() {
      try {
        const response = await fetch('/api/settings/themes');
        if (response.ok) {
          const data = await response.json();
          setThemes((data.themes || []) as ThemeMetadata[]);
        }
      } catch (err) {
        console.error('[SettingsPanel] Failed to load themes:', err);
      }
    }

    loadSettings();
    loadThemes();

    // WebSocket subscription for real-time sync
    console.log('[SettingsPanel] Connecting to /ws/settings for real-time sync');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/settings`);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'init' || data.type === 'update') {
          console.log('[SettingsPanel] Settings update via WebSocket:', data.settings);
          setSettings(data.settings as Settings);
        }
      } catch (err) {
        console.error('[SettingsPanel] Failed to parse WebSocket message:', err);
      }
    };

    ws.onerror = (err) => {
      console.error('[SettingsPanel] WebSocket error:', err);
    };

    // Load color preset from project config
    loadPresetFromProject().then(presetId => {
      applyPreset(presetId);
      setColorPreset(presetId);
    });

    // Load font settings
    loadFontSettings().then(settings => {
      setFontSettings(settings);
      applyFontSettings(settings);
    });

    return () => ws.close();
  }, []);



  // Sort themes: by tier (S > A > B > U), then alphabetically by name
  const sortedThemes = useMemo(() => {
    return [...themes].sort((a, b) => {
      const tierDiff = (TIER_ORDER[a.tier] ?? 3) - (TIER_ORDER[b.tier] ?? 3);
      if (tierDiff !== 0) return tierDiff;
      return a.name.localeCompare(b.name);
    });
  }, [themes]);

  const handleThemeChange = useCallback(async (theme: string) => {
    if (!settings) return;

    setSaving(true);
    try {
      const updated = {
        ...settings,
        pennyfarthing: { ...settings.pennyfarthing, theme },
      };

      // Use REST API
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pennyfarthing: { theme } }),
      });
      setSettings(updated);
    } finally {
      setSaving(false);
    }
  }, [settings]);

  const handleToggle = useCallback(async (section: string, key: string, value: boolean) => {
    if (!settings) return;

    console.log(`[SettingsPanel] Toggle ${section}.${key} = ${value}`);
    setSaving(true);
    try {
      const updated = {
        ...settings,
        [section]: { ...(settings as Record<string, Record<string, unknown>>)[section], [key]: value },
      };

      // Use REST API
      console.log('[SettingsPanel] Saving via REST');
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [section]: { [key]: value } }),
      });
      console.log('[SettingsPanel] Save complete, updating local state');
      setSettings(updated);
    } finally {
      setSaving(false);
    }
  }, [settings]);

  const handleColorPresetChange = useCallback(async (presetId: string) => {
    setSaving(true);
    try {
      applyPreset(presetId);
      await savePresetToProject(presetId);
      setColorPreset(presetId);
    } finally {
      setSaving(false);
    }
  }, []);

  const handleFontChange = useCallback(async (
    type: 'ui' | 'code',
    presetId: string,
    customFamily?: string
  ) => {
    setSaving(true);
    try {
      const updated: FontSettings = {
        ...fontSettings,
        [type === 'ui' ? 'uiFont' : 'codeFont']: presetId,
        ...(presetId === 'custom' && customFamily
          ? { [type === 'ui' ? 'customUiFont' : 'customCodeFont']: customFamily }
          : {}),
      };
      applyFontSettings(updated);
      await saveFontSettings(updated);
      setFontSettings(updated);
    } finally {
      setSaving(false);
    }
  }, [fontSettings]);

  const handleFontSizeChange = useCallback(async (type: 'ui' | 'code', size: FontSize) => {
    setSaving(true);
    try {
      const updated: FontSettings = {
        ...fontSettings,
        [type === 'ui' ? 'uiFontSize' : 'codeFontSize']: size,
      };
      applyFontSettings(updated);
      await saveFontSettings(updated);
      setFontSettings(updated);
    } finally {
      setSaving(false);
    }
  }, [fontSettings]);

  if (!settings) {
    return (
      <div className="settings-panel loading" data-testid="settings-panel">
        <div className="space-y-4 p-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-6 w-48" />
        </div>
      </div>
    );
  }

  return (
    <div className="settings-panel" data-testid="settings-panel">
      <section className="settings-section">
        <h4>Theme</h4>
        <select
          value={settings.pennyfarthing?.theme || ''}
          onChange={(e) => handleThemeChange(e.target.value)}
          disabled={saving}
          className="theme-select"
        >
          {sortedThemes.map(theme => (
            <option key={theme.id} value={theme.id}>
              [{theme.tier || 'Unranked'}] {theme.name}
            </option>
          ))}
        </select>
      </section>

      <Separator className="my-2" />

      <section className="settings-section">
        <h4>Color Palette</h4>
        <ThemePalette
          currentPreset={colorPreset}
          onSelect={handleColorPresetChange}
        />
      </section>

      <Separator className="my-2" />

      <section className="settings-section">
        <h4>Fonts</h4>
        <div className="font-setting">
          <label>UI Font</label>
          <FontPicker
            type="ui"
            currentFont={fontSettings.uiFont}
            customFont={fontSettings.customUiFont}
            onSelect={(id, custom) => handleFontChange('ui', id, custom)}
          />
          <FontSizePicker
            currentSize={fontSettings.uiFontSize}
            onSelect={(size) => handleFontSizeChange('ui', size)}
          />
        </div>
        <div className="font-setting">
          <label>Code Font</label>
          <FontPicker
            type="code"
            currentFont={fontSettings.codeFont}
            customFont={fontSettings.customCodeFont}
            onSelect={(id, custom) => handleFontChange('code', id, custom)}
          />
          <FontSizePicker
            currentSize={fontSettings.codeFontSize}
            onSelect={(size) => handleFontSizeChange('code', size)}
          />
        </div>
      </section>

      <Separator className="my-2" />

      <section className="settings-section">
        <h4>Workflow</h4>
        {window.__CYCLIST_MODE__ === 'cyclist' && (
          <div className="toggle-setting">
            <Switch
              checked={settings.workflow?.bell_mode || false}
              onCheckedChange={(checked: boolean) => handleToggle('workflow', 'bell_mode', checked)}
              disabled={saving}
            />
            Bell Mode
            <span className="setting-description">Inject queued messages via PostToolUse hook instead of waiting</span>
          </div>
        )}
        <div className="toggle-setting">
          <Switch
            checked={settings.workflow?.relay_mode || false}
            onCheckedChange={(checked: boolean) => handleToggle('workflow', 'relay_mode', checked)}
            disabled={saving}
          />
          Relay Mode
          <span className="setting-description">Auto-handoff to next agent</span>
        </div>
      </section>

    </div>
  );
}

export default SettingsPanel;
