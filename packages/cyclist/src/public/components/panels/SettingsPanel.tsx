/**
 * SettingsPanel - Settings/preferences panel
 *
 * Story MSSCI-12717 - React Migration
 * Updated to match actual config.local.yaml structure
 * Story MSSCI-12817 - Added Color Palette section with ThemePalette
 * Story MSSCI-12769 - Added Fonts section with FontPicker
 * Story MSSCI-14243 - Added Panel Visibility section
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import {
  PANEL_INVENTORY,
  getDockviewApi,
  restorePanel,
} from '../DockviewWorkspace';

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

// Panel display names for the visibility toggles
const PANEL_DISPLAY_NAMES: Record<string, string> = {
  changed: 'Changed Files',
  diffs: 'Diffs',
  debug: 'Debug',
  'audit-log': 'Audit Log',
  tty: 'Terminal',
  message: 'Message',
  sprint: 'Sprint',
  workflow: 'Workflow',
  ac: 'AC',
  todo: 'Todo',
  background: 'Background',
  git: 'Git',
  settings: 'Settings',
};

// Panels that cannot be hidden
const PROTECTED_PANELS = new Set<string>();

export function SettingsPanel(): React.ReactElement {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [themes, setThemes] = useState<ThemeMetadata[]>([]);
  const [saving, setSaving] = useState(false);
  const [colorPreset, setColorPreset] = useState<string>(DEFAULT_PRESET);
  const [fontSettings, setFontSettings] = useState<FontSettings>(DEFAULT_FONT_SETTINGS);
  const [panelVisibility, setPanelVisibility] = useState<Record<string, boolean>>({});
  const pendingToggles = useRef<Record<string, number>>({});

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
          setThemes((data || []) as ThemeMetadata[]);
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

  // Track panel visibility from Dockview API
  useEffect(() => {
    const updatePanelVisibility = () => {
      const api = getDockviewApi();
      if (!api) return;

      const visibility: Record<string, boolean> = {};
      const allPanelIds = Object.values(PANEL_INVENTORY);
      const now = Date.now();

      for (const panelId of allPanelIds) {
        // Skip panels with pending toggles (wait for Dockview to catch up)
        const pendingUntil = pendingToggles.current[panelId];
        if (pendingUntil && now < pendingUntil) {
          continue; // Keep current state, don't overwrite
        }
        // Clear expired pending toggle
        if (pendingUntil) {
          delete pendingToggles.current[panelId];
        }
        // Panel is visible if it exists in the Dockview
        visibility[panelId] = api.getPanel(panelId) !== undefined;
      }

      setPanelVisibility(prev => ({ ...prev, ...visibility }));
    };

    // Initial update
    updatePanelVisibility();

    // Poll for changes (Dockview API events are subscribed in DockviewWorkspace)
    const interval = setInterval(updatePanelVisibility, 500);

    return () => clearInterval(interval);
  }, []);

  // Handle panel visibility toggle
  const handlePanelToggle = useCallback((panelId: string, visible: boolean) => {
    const api = getDockviewApi();
    if (!api) return;

    // Mark this panel as having a pending toggle for 1 second
    // This prevents the polling interval from overwriting the state
    // before Dockview has finished adding/removing the panel
    pendingToggles.current[panelId] = Date.now() + 1000;

    if (visible) {
      // Show panel by restoring it
      restorePanel(panelId);
    } else {
      // Hide panel by removing it
      const panel = api.getPanel(panelId);
      if (panel) {
        panel.api.close();
      }
    }

    // Update local state immediately for responsive UI
    setPanelVisibility(prev => ({ ...prev, [panelId]: visible }));
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
        <div className="toggle-setting">
          <Switch
            checked={settings.workflow?.bell_mode || false}
            onCheckedChange={(checked: boolean) => handleToggle('workflow', 'bell_mode', checked)}
            disabled={saving}
          />
          Bell Mode
          <span className="setting-description">Inject queued messages via PostToolUse hook instead of waiting</span>
        </div>
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

      <Separator className="my-2" />

      <section className="settings-section">
        <h4>Panel Visibility</h4>
        <div className="panel-visibility-list">
          {Object.values(PANEL_INVENTORY).map((panelId) => {
            const isProtected = PROTECTED_PANELS.has(panelId);
            const isVisible = panelVisibility[panelId] ?? true;
            const displayName = PANEL_DISPLAY_NAMES[panelId] || panelId;

            return (
              <div key={panelId} className="toggle-setting">
                <Switch
                  checked={isVisible}
                  onCheckedChange={(checked: boolean) => handlePanelToggle(panelId, checked)}
                  disabled={isProtected}
                />
                {displayName}
                {isProtected && (
                  <span className="setting-description">(always visible)</span>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export default SettingsPanel;
