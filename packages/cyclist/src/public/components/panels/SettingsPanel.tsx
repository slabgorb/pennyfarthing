/**
 * SettingsPanel - Settings/preferences panel
 *
 * Story MSSCI-12717 - React Migration
 * Updated to match actual config.local.yaml structure
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';

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

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.settings) return;

    // Load settings
    api.settings.get?.().then(data => {
      setSettings(data as Settings);
    });

    // Load theme metadata (includes name, tier)
    api.settings.getThemeMetadata?.().then(data => {
      const themeData = (data || []) as ThemeMetadata[];
      setThemes(themeData);
    });

    // Subscribe to changes
    api.settings.onChanged?.((data) => {
      setSettings(data as Settings);
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
    const api = window.electronAPI;
    if (!api?.settings || !settings) return;

    setSaving(true);
    try {
      const updated = {
        ...settings,
        pennyfarthing: { ...settings.pennyfarthing, theme },
      };
      await api.settings.save?.(updated);
      setSettings(updated);
    } finally {
      setSaving(false);
    }
  }, [settings]);

  const handleToggle = useCallback(async (section: string, key: string, value: boolean) => {
    const api = window.electronAPI;
    if (!api?.settings || !settings) return;

    setSaving(true);
    try {
      const updated = {
        ...settings,
        [section]: { ...(settings as Record<string, Record<string, unknown>>)[section], [key]: value },
      };
      await api.settings.save?.(updated);
      setSettings(updated);
    } finally {
      setSaving(false);
    }
  }, [settings]);

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
