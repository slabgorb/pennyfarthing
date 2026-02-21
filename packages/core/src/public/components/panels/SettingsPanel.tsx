/**
 * SettingsPanel - Read-only settings display with CLI reference
 *
 * Story 122-1: Converted from interactive controls to read-only display.
 * Story 122-2: Added styling, fixed undefined values, removed Notifications, added CLI reference.
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
  pennyfarthing?: {
    theme?: string;
  };
}

const DEFAULTS: Record<string, string> = {
  'theme': 'firefly',
  'display.colorPreset': 'tokyo-night',
  'display.fonts.uiFont': 'system',
  'display.fonts.uiFontSize': 'base',
  'display.fonts.codeFont': 'jetbrains-mono',
  'display.fonts.codeFontSize': 'base',
  'workflow.bell_mode': 'false',
  'workflow.relay_mode': 'false',
  'workflow.permission_mode': 'plan',
  'workflow.git_monitor': 'false',
};

function formatValue(val: unknown): string {
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  return String(val);
}

const sectionStyle: React.CSSProperties = { padding: '8px 0' };
const rowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '2px 0' };
const labelStyle: React.CSSProperties = { opacity: 0.7 };

function SettingRow({ label, dotPath, value }: { label: string; dotPath: string; value: unknown }) {
  const isSet = value !== undefined && value !== null && value !== '';
  const displayText = isSet ? formatValue(value) : DEFAULTS[dotPath] ?? '\u2014';
  const isDefault = !isSet && dotPath in DEFAULTS;

  return (
    <div className="setting-row" style={rowStyle}>
      <span className="setting-label" style={labelStyle}>{label} <span style={{ fontSize: '0.8em', opacity: 0.6 }}>{dotPath}</span></span>
      <span className="setting-value" style={isDefault ? { fontStyle: 'italic', opacity: 0.6 } : undefined}>
        {displayText}
      </span>
    </div>
  );
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

  const theme = settings.theme || settings.pennyfarthing?.theme;

  return (
    <div className="settings-panel" data-testid="settings-panel">
      <section className="settings-section" style={sectionStyle}>
        <h4>Theme &amp; Display</h4>
        <SettingRow label="Theme" dotPath="theme" value={theme} />
        <SettingRow label="Color Preset" dotPath="display.colorPreset" value={settings.display?.colorPreset} />
      </section>

      <section className="settings-section" style={sectionStyle}>
        <h4>Fonts</h4>
        <SettingRow label="UI Font" dotPath="display.fonts.uiFont"
          value={settings.display?.fonts?.uiFont === 'custom'
            ? settings.display?.fonts?.customUiFont
            : settings.display?.fonts?.uiFont} />
        <SettingRow label="UI Font Size" dotPath="display.fonts.uiFontSize" value={settings.display?.fonts?.uiFontSize} />
        <SettingRow label="Code Font" dotPath="display.fonts.codeFont"
          value={settings.display?.fonts?.codeFont === 'custom'
            ? settings.display?.fonts?.customCodeFont
            : settings.display?.fonts?.codeFont} />
        <SettingRow label="Code Font Size" dotPath="display.fonts.codeFontSize" value={settings.display?.fonts?.codeFontSize} />
      </section>

      <section className="settings-section" style={sectionStyle}>
        <h4>Workflow</h4>
        <SettingRow label="Bell Mode" dotPath="workflow.bell_mode" value={settings.workflow?.bell_mode} />
        <SettingRow label="Relay Mode" dotPath="workflow.relay_mode" value={settings.workflow?.relay_mode} />
        <SettingRow label="Permission Mode" dotPath="workflow.permission_mode" value={settings.workflow?.permission_mode} />
        <SettingRow label="Git Monitor" dotPath="workflow.git_monitor" value={settings.workflow?.git_monitor} />
      </section>

      <section className="settings-section" style={sectionStyle}>
        <h4>CLI Reference</h4>
        <div style={{ fontSize: '0.85em', opacity: 0.8 }}>
          <div>/pf-settings show</div>
          <div>/pf-settings get &lt;key&gt;</div>
          <div>/pf-settings set &lt;key&gt; &lt;value&gt;</div>
        </div>
      </section>
    </div>
  );
}

export default SettingsPanel;
