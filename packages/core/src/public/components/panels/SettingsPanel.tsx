/**
 * SettingsPanel - Read-only settings display
 *
 * Story 122-1: Converted from interactive controls to read-only display.
 * Settings are changed via /pf-settings CLI, not through this panel.
 * Panel updates live via WebSocket when settings change.
 */

import React, { useState, useEffect } from 'react';

interface Settings {
  theme?: string;
  display?: {
    colorPreset?: string;
    fonts?: {
      uiFont?: string;
      uiFontSize?: string;
      codeFont?: string;
      codeFontSize?: string;
      customUiFont?: string;
      customCodeFont?: string;
    };
  };
  workflow?: {
    permission_mode?: string;
    bell_mode?: boolean;
    relay_mode?: boolean;
    git_monitor?: boolean;
    handoff_mode?: string;
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

  useEffect(() => {
    async function loadSettings() {
      try {
        const response = await fetch('/api/settings');
        if (response.ok) {
          const data = await response.json();
          setSettings(data as Settings);
        }
      } catch (err) {
        console.error('[SettingsPanel] Failed to load settings:', err);
      }
    }

    loadSettings();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/settings`);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'init' || data.type === 'update') {
          setSettings(data.settings as Settings);
        }
      } catch (err) {
        console.error('[SettingsPanel] Failed to parse WebSocket message:', err);
      }
    };

    return () => ws.close();
  }, []);

  if (!settings) {
    return (
      <div className="settings-panel loading" data-testid="settings-panel">
        <div className="space-y-4 p-2">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="settings-panel" data-testid="settings-panel">
      <section className="settings-section">
        <h4>Theme &amp; Display</h4>
        <div className="setting-row">
          <span className="setting-label">Theme</span>
          <span className="setting-value">{settings.pennyfarthing?.theme}</span>
        </div>
        <div className="setting-row">
          <span className="setting-label">Color Preset</span>
          <span className="setting-value">{settings.display?.colorPreset}</span>
        </div>
      </section>

      <section className="settings-section">
        <h4>Fonts</h4>
        <div className="setting-row">
          <span className="setting-label">UI Font</span>
          <span className="setting-value">{settings.display?.fonts?.uiFont}</span>
        </div>
        <div className="setting-row">
          <span className="setting-label">UI Font Size</span>
          <span className="setting-value">{settings.display?.fonts?.uiFontSize}</span>
        </div>
        <div className="setting-row">
          <span className="setting-label">Code Font</span>
          <span className="setting-value">{settings.display?.fonts?.codeFont}</span>
        </div>
        <div className="setting-row">
          <span className="setting-label">Code Font Size</span>
          <span className="setting-value">{settings.display?.fonts?.codeFontSize}</span>
        </div>
      </section>

      <section className="settings-section">
        <h4>Workflow</h4>
        <div className="setting-row">
          <span className="setting-label">Bell Mode</span>
          <span className="setting-value">{String(settings.workflow?.bell_mode)}</span>
        </div>
        <div className="setting-row">
          <span className="setting-label">Relay Mode</span>
          <span className="setting-value">{String(settings.workflow?.relay_mode)}</span>
        </div>
        <div className="setting-row">
          <span className="setting-label">Permission Mode</span>
          <span className="setting-value">{settings.workflow?.permission_mode}</span>
        </div>
        <div className="setting-row">
          <span className="setting-label">Git Monitor</span>
          <span className="setting-value">{String(settings.workflow?.git_monitor)}</span>
        </div>
      </section>

      <section className="settings-section">
        <h4>Notifications</h4>
        <div className="setting-row">
          <span className="setting-label">Phase Change</span>
          <span className="setting-value">{String(settings.notifications?.phase_change)}</span>
        </div>
        <div className="setting-row">
          <span className="setting-label">Sound</span>
          <span className="setting-value">{String(settings.notifications?.sound)}</span>
        </div>
      </section>
    </div>
  );
}

export default SettingsPanel;
