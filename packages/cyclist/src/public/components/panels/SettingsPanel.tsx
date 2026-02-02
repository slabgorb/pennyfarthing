/**
 * SettingsPanel - Settings/preferences panel
 *
 * Story MSSCI-12717 - React Migration
 * Updated to match actual config.local.yaml structure
 * Story MSSCI-12817 - Added Color Palette section with ThemePalette
 * Story MSSCI-12769 - Added Fonts section with FontPicker
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ThemePalette } from '../ThemePalette';
import { FontPicker, FontSizePicker } from '../FontPicker';
import {
  applyPreset,
  savePresetToProject,
  loadPresetFromProject,
  DEFAULT_PRESET,
} from '../../js/color-presets.js';
import {
  loadFontSettings,
  saveFontSettings,
  applyFontSettings,
  DEFAULT_FONT_SETTINGS,
  FontSettings,
  FontSize,
} from '../../js/font-presets.js';

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
  notifications?: {
    phase_change?: boolean;
    sound?: boolean;
  };
  pennyfarthing?: {
    theme?: string;
  };
}

interface ThemeMetadata {
  id: string;
  name: string;
  tier: 'S' | 'A' | 'B' | 'U';
}

// Tier sort order: S=0, A=1, B=2, U=3
const TIER_ORDER: Record<string, number> = { S: 0, A: 1, B: 2, U: 3 };

export function SettingsPanel(): React.ReactElement {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [themes, setThemes] = useState<ThemeMetadata[]>([]);
  const [saving, setSaving] = useState(false);
  const [colorPreset, setColorPreset] = useState<string>(DEFAULT_PRESET);
  const [fontSettings, setFontSettings] = useState<FontSettings>(DEFAULT_FONT_SETTINGS);

  useEffect(() => {
    const api = window.electronAPI;

    // Load settings - try IPC first, then REST fallback
    async function loadSettings() {
      try {
        if (api?.settings?.get) {
          const data = await api.settings.get();
          setSettings(data as Settings);
        } else {
          // REST fallback for web mode
          const response = await fetch('/api/settings');
          if (response.ok) {
            const data = await response.json();
            setSettings(data as Settings);
          }
        }
      } catch (err) {
        console.error('[SettingsPanel] Failed to load settings:', err);
      }
    }

    // Load theme metadata - try IPC first, then REST fallback
    async function loadThemes() {
      try {
        if (api?.settings?.getThemeMetadata) {
          const data = await api.settings.getThemeMetadata();
          setThemes((data || []) as ThemeMetadata[]);
        } else {
          // REST fallback for web mode
          const response = await fetch('/api/settings/themes');
          if (response.ok) {
            const data = await response.json();
            setThemes((data || []) as ThemeMetadata[]);
          }
        }
      } catch (err) {
        console.error('[SettingsPanel] Failed to load themes:', err);
      }
    }

    loadSettings();
    loadThemes();

    // Subscribe to changes (Electron only - no WebSocket equivalent yet)
    if (api?.settings?.onChanged) {
      api.settings.onChanged((data) => {
        setSettings(data as Settings);
      });
    }

    // Load color preset from project config
    loadPresetFromProject().then(presetId => {
      setColorPreset(presetId);
    });

    // Load font settings
    loadFontSettings().then(settings => {
      setFontSettings(settings);
      applyFontSettings(settings);
    });
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

      const api = window.electronAPI;
      if (api?.settings?.save) {
        await api.settings.save(updated);
      } else {
        // REST fallback for web mode
        await fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pennyfarthing: { theme } }),
        });
      }
      setSettings(updated);
    } finally {
      setSaving(false);
    }
  }, [settings]);

  const handleToggle = useCallback(async (section: string, key: string, value: boolean) => {
    if (!settings) return;

    setSaving(true);
    try {
      const updated = {
        ...settings,
        [section]: { ...(settings as Record<string, Record<string, unknown>>)[section], [key]: value },
      };

      const api = window.electronAPI;
      if (api?.settings?.save) {
        await api.settings.save(updated);
      } else {
        // REST fallback for web mode
        await fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [section]: { [key]: value } }),
        });
      }
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
        <div className="spinner">Loading...</div>
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
              [{theme.tier}] {theme.name}
            </option>
          ))}
        </select>
      </section>

      <section className="settings-section">
        <h4>Color Palette</h4>
        <ThemePalette
          currentPreset={colorPreset}
          onSelect={handleColorPresetChange}
        />
      </section>

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

      <section className="settings-section">
        <h4>Workflow</h4>
        <label className="toggle-setting">
          <input
            type="checkbox"
            checked={settings.workflow?.bell_mode || false}
            onChange={(e) => handleToggle('workflow', 'bell_mode', e.target.checked)}
            disabled={saving}
          />
          Bell Mode
          <span className="setting-description">Inject queued messages via PostToolUse hook instead of waiting</span>
        </label>
        <label className="toggle-setting">
          <input
            type="checkbox"
            checked={settings.workflow?.relay_mode || false}
            onChange={(e) => handleToggle('workflow', 'relay_mode', e.target.checked)}
            disabled={saving}
          />
          Relay Mode
          <span className="setting-description">Auto-handoff to next agent</span>
        </label>
      </section>

      <section className="settings-section">
        <h4>Notifications</h4>
        <label className="toggle-setting">
          <input
            type="checkbox"
            checked={settings.notifications?.phase_change || false}
            onChange={(e) => handleToggle('notifications', 'phase_change', e.target.checked)}
            disabled={saving}
          />
          Phase change alerts
        </label>
        <label className="toggle-setting">
          <input
            type="checkbox"
            checked={settings.notifications?.sound || false}
            onChange={(e) => handleToggle('notifications', 'sound', e.target.checked)}
            disabled={saving}
          />
          Sound effects
        </label>
      </section>
    </div>
  );
}

export default SettingsPanel;
