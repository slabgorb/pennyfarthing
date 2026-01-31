/**
 * SettingsPanel - Placeholder for settings/preferences
 *
 * Story MSSCI-12717 - React Migration
 */

import React, { useState, useEffect, useCallback } from 'react';

interface Settings {
  workflow?: {
    auto_handoff?: boolean;
    handoff_confirm?: boolean;
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

export function SettingsPanel(): React.ReactElement {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [themes, setThemes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.settings) return;

    // Load settings
    api.settings.get?.().then(data => {
      setSettings(data as Settings);
    });

    // Load available themes
    api.settings.getAvailableThemes?.().then(data => {
      setThemes(data);
    });

    // Subscribe to changes
    api.settings.onChanged?.((data) => {
      setSettings(data as Settings);
    });
  }, []);

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
        >
          {themes.map(theme => (
            <option key={theme} value={theme}>{theme}</option>
          ))}
        </select>
      </section>

      <section className="settings-section">
        <h4>Workflow</h4>
        <label className="toggle-setting">
          <input
            type="checkbox"
            checked={settings.workflow?.auto_handoff || false}
            onChange={(e) => handleToggle('workflow', 'auto_handoff', e.target.checked)}
            disabled={saving}
          />
          Auto handoff
        </label>
        <label className="toggle-setting">
          <input
            type="checkbox"
            checked={settings.workflow?.handoff_confirm || false}
            onChange={(e) => handleToggle('workflow', 'handoff_confirm', e.target.checked)}
            disabled={saving}
          />
          Confirm handoffs
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
