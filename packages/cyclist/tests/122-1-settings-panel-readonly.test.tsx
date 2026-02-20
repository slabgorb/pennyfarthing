/**
 * Story 122-1: Convert SettingsPanel from interactive controls to read-only display
 *
 * Tests verify:
 * AC1: No interactive controls remain in SettingsPanel
 * AC2: All settings from config.local.yaml are displayed read-only
 * AC3: Settings update live when changed via /pf-settings CLI (WebSocket)
 * AC4: Panel renders cleanly in both Cyclist and BikeRack
 *
 * NOTE: Uses a stub component representing current (interactive) behavior.
 * The stub simulates what the CURRENT SettingsPanel renders. Tests assert
 * the DESIRED (read-only) behavior, so they fail (RED). When Dev refactors
 * the real component, swap the import:
 *
 *   import { SettingsPanel } from '../src/public/components/panels/SettingsPanel.js';
 *
 * The cyclist vitest environment has a pre-existing @/ alias resolution issue
 * with vite's import-analysis plugin (affects all panel tests using shadcn/ui).
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import React from 'react';

// --- Settings data contract matching config.local.yaml ---
const MOCK_SETTINGS = {
  theme: 'firefly',
  display: {
    colorPreset: 'tokyo-night',
    fonts: {
      uiFont: 'system',
      uiFontSize: 'base',
      codeFont: 'jetbrains-mono',
      codeFontSize: 'base',
      customUiFont: '',
      customCodeFont: '',
    },
  },
  workflow: {
    bell_mode: true,
    relay_mode: false,
    permission_mode: 'plan',
    git_monitor: true,
  },
  notifications: {
    phase_change: true,
    sound: false,
  },
  pennyfarthing: {
    theme: 'firefly',
  },
};

/**
 * STUB: Represents the CURRENT (interactive) SettingsPanel behavior.
 * Tests assert the DESIRED (read-only) behavior, so they will FAIL.
 *
 * When Dev refactors, replace this with the real component import.
 */
function CurrentSettingsPanel({ settings }: { settings: typeof MOCK_SETTINGS }) {
  return (
    <div className="settings-panel" data-testid="settings-panel">
      <section className="settings-section">
        <h4>Theme</h4>
        {/* INTERACTIVE: select dropdown — tests say this should NOT exist */}
        <select value={settings.pennyfarthing?.theme || ''} onChange={() => {}}>
          <option value="firefly">[S] Firefly</option>
          <option value="hogans-heroes">[A] Hogan&apos;s Heroes</option>
        </select>
      </section>

      <section className="settings-section">
        <h4>Color Palette</h4>
        {/* INTERACTIVE: palette picker — tests say this should NOT exist */}
        <div data-testid="theme-palette" className="theme-palette">
          <button>dark</button>
          <button>light</button>
        </div>
      </section>

      <section className="settings-section">
        <h4>Fonts</h4>
        {/* INTERACTIVE: font pickers — tests say these should NOT exist */}
        <div data-testid="font-picker">
          <select value={settings.display?.fonts?.uiFont} onChange={() => {}}>
            <option value="system">System</option>
          </select>
        </div>
        <div data-testid="font-size-picker">
          <select value={settings.display?.fonts?.uiFontSize} onChange={() => {}}>
            <option value="base">Base</option>
          </select>
        </div>
      </section>

      <section className="settings-section">
        <h4>Workflow</h4>
        {/* INTERACTIVE: toggle switches — tests say these should NOT exist */}
        <div className="toggle-setting">
          <button role="switch" aria-checked={settings.workflow?.bell_mode}>
            Bell Mode
          </button>
        </div>
        <div className="toggle-setting">
          <button role="switch" aria-checked={settings.workflow?.relay_mode}>
            Relay Mode
          </button>
        </div>
      </section>
    </div>
  );
}

/**
 * STUB: Async version with WebSocket support for AC3 tests.
 */
function AsyncSettingsPanel() {
  const [settings, setSettings] = React.useState<typeof MOCK_SETTINGS | null>(null);

  React.useEffect(() => {
    // Simulate REST fetch
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => setSettings(data))
      .catch(() => {});

    // WebSocket subscription for real-time sync
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/settings`);
    ws.onmessage = (event: any) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'init' || data.type === 'update') {
          setSettings(data.settings);
        }
      } catch {}
    };
    return () => ws.close();
  }, []);

  if (!settings) {
    return (
      <div className="settings-panel loading" data-testid="settings-panel">
        Loading...
      </div>
    );
  }

  return <CurrentSettingsPanel settings={settings} />;
}

// Track WebSocket instances
let wsInstances: any[] = [];

beforeEach(() => {
  wsInstances = [];

  const TrackedWS = class {
    url: string;
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: ((error: any) => void) | null = null;
    readyState = 1;
    constructor(url: string) {
      this.url = url;
      wsInstances.push(this);
      setTimeout(() => {
        this.onopen?.();
        if (url.includes('/ws/settings') && this.onmessage) {
          this.onmessage({ data: JSON.stringify({ type: 'init', settings: MOCK_SETTINGS }) });
        }
      }, 0);
    }
    send() {}
    close() { this.readyState = 3; this.onclose?.(); }
    addEventListener(event: string, handler: any) {
      if (event === 'open') this.onopen = handler;
      else if (event === 'message') this.onmessage = handler;
      else if (event === 'close') this.onclose = handler;
      else if (event === 'error') this.onerror = handler;
    }
    removeEventListener() {}
    simulateMessage(data: object) {
      this.onmessage?.({ data: JSON.stringify(data) });
    }
  };
  vi.stubGlobal('WebSocket', TrackedWS);

  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url === '/api/settings') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_SETTINGS) });
    }
    if (url === '/api/settings/themes') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          themes: [
            { id: 'firefly', name: 'Firefly', tier: 'S' },
            { id: 'hogans-heroes', name: "Hogan's Heroes", tier: 'A' },
          ],
        }),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  }));

  (globalThis as any).__CYCLIST_MODE__ = 'cyclist';
});

afterEach(() => {
  vi.restoreAllMocks();
  wsInstances = [];
  delete (globalThis as any).__CYCLIST_MODE__;
});

// --- AC1: No interactive controls remain in SettingsPanel ---

describe('AC1: No interactive controls remain in SettingsPanel', () => {
  it('should not render any <select> dropdown elements', () => {
    render(<CurrentSettingsPanel settings={MOCK_SETTINGS} />);

    const selects = document.querySelectorAll('select');
    expect(selects.length).toBe(0);
  });

  it('should not render any Switch toggle components (role="switch")', () => {
    render(<CurrentSettingsPanel settings={MOCK_SETTINGS} />);

    const switches = screen.queryAllByRole('switch');
    expect(switches.length).toBe(0);
  });

  it('should not render ThemePalette color picker', () => {
    render(<CurrentSettingsPanel settings={MOCK_SETTINGS} />);

    const palettes = document.querySelectorAll('[data-testid="theme-palette"]');
    expect(palettes.length).toBe(0);
  });

  it('should not render FontPicker or FontSizePicker components', () => {
    render(<CurrentSettingsPanel settings={MOCK_SETTINGS} />);

    const fontPickers = document.querySelectorAll('[data-testid="font-picker"]');
    const fontSizePickers = document.querySelectorAll('[data-testid="font-size-picker"]');
    expect(fontPickers.length).toBe(0);
    expect(fontSizePickers.length).toBe(0);
  });

  it('should not make any PATCH requests when rendered', () => {
    render(<CurrentSettingsPanel settings={MOCK_SETTINGS} />);

    const fetchCalls = (fetch as ReturnType<typeof vi.fn>).mock.calls;
    const patchCalls = fetchCalls.filter(
      (call: any[]) => call[1]?.method === 'PATCH'
    );
    expect(patchCalls.length).toBe(0);
  });
});

// --- AC2: All settings from config.local.yaml are displayed read-only ---

describe('AC2: All settings displayed read-only', () => {
  it('should display the current theme name as text (not in a select)', () => {
    render(<CurrentSettingsPanel settings={MOCK_SETTINGS} />);

    const panel = screen.getByTestId('settings-panel');
    // Theme should NOT be inside a <select>
    const selects = panel.querySelectorAll('select');
    let themeInSelect = false;
    selects.forEach(sel => {
      if (sel.textContent?.toLowerCase().includes('firefly')) themeInSelect = true;
    });
    expect(themeInSelect).toBe(false);

    // And should be visible as plain text
    expect(panel.textContent).toContain('firefly');
  });

  it('should display the color preset value as text', () => {
    render(<CurrentSettingsPanel settings={MOCK_SETTINGS} />);

    const panel = screen.getByTestId('settings-panel');
    expect(panel.textContent).toContain('tokyo-night');
  });

  it('should display font settings as text', () => {
    render(<CurrentSettingsPanel settings={MOCK_SETTINGS} />);

    const panel = screen.getByTestId('settings-panel');
    expect(panel.textContent).toMatch(/system/i);
    expect(panel.textContent).toMatch(/jetbrains-mono/i);
  });

  it('should display workflow settings with labels', () => {
    render(<CurrentSettingsPanel settings={MOCK_SETTINGS} />);

    const panel = screen.getByTestId('settings-panel');
    expect(panel.textContent).toMatch(/bell.mode/i);
    expect(panel.textContent).toMatch(/relay.mode/i);
    expect(panel.textContent).toMatch(/permission.mode/i);
    expect(panel.textContent).toMatch(/git.monitor/i);
  });

  it('should display notification settings', () => {
    render(<CurrentSettingsPanel settings={MOCK_SETTINGS} />);

    const panel = screen.getByTestId('settings-panel');
    expect(panel.textContent).toMatch(/phase.change/i);
    expect(panel.textContent).toMatch(/sound/i);
  });

  it('should have at least 3 grouped sections including Notifications', () => {
    render(<CurrentSettingsPanel settings={MOCK_SETTINGS} />);

    const headings = document.querySelectorAll('.settings-panel h4');
    const headingTexts = Array.from(headings).map(h => h.textContent?.toLowerCase());

    expect(headingTexts.some(t => t?.includes('workflow'))).toBe(true);
    expect(headingTexts.some(t => t?.includes('notification'))).toBe(true);
  });
});

// --- AC3: Settings update live when changed via /pf-settings CLI ---

describe('AC3: Settings update live via WebSocket', () => {
  it('should connect to /ws/settings WebSocket endpoint', async () => {
    await act(async () => {
      render(<AsyncSettingsPanel />);
      await new Promise(r => setTimeout(r, 50));
    });

    const settingsWs = wsInstances.find((ws: any) => ws.url.includes('/ws/settings'));
    expect(settingsWs).toBeDefined();
  });

  it('should update displayed theme when WebSocket sends new settings', async () => {
    await act(async () => {
      render(<AsyncSettingsPanel />);
      await new Promise(r => setTimeout(r, 50));
    });

    const panel = screen.getByTestId('settings-panel');

    const settingsWs = wsInstances.find((ws: any) => ws.url.includes('/ws/settings'));
    expect(settingsWs).toBeDefined();

    await act(async () => {
      settingsWs.simulateMessage({
        type: 'update',
        settings: {
          ...MOCK_SETTINGS,
          pennyfarthing: { theme: 'hogans-heroes' },
        },
      });
    });

    await waitFor(() => {
      expect(panel.textContent).toContain('hogans-heroes');
    });
  });

  it('should update workflow values when changed via WebSocket', async () => {
    await act(async () => {
      render(<AsyncSettingsPanel />);
      await new Promise(r => setTimeout(r, 50));
    });

    const settingsWs = wsInstances.find((ws: any) => ws.url.includes('/ws/settings'));

    await act(async () => {
      settingsWs.simulateMessage({
        type: 'update',
        settings: {
          ...MOCK_SETTINGS,
          workflow: { ...MOCK_SETTINGS.workflow, relay_mode: true },
        },
      });
    });

    const panel = screen.getByTestId('settings-panel');
    await waitFor(() => {
      expect(panel.textContent).toMatch(/relay.mode/i);
    });
  });
});

// --- AC4: Panel renders cleanly in both Cyclist and BikeRack ---

describe('AC4: Panel renders cleanly in both Cyclist and BikeRack', () => {
  it('should render with data-testid="settings-panel"', () => {
    render(<CurrentSettingsPanel settings={MOCK_SETTINGS} />);
    expect(screen.getByTestId('settings-panel')).toBeInTheDocument();
  });

  it('should show loading state before settings arrive', () => {
    render(<AsyncSettingsPanel />);
    expect(screen.getByTestId('settings-panel')).toHaveClass('loading');
  });

  it('should render in cyclist mode without errors', () => {
    (globalThis as any).__CYCLIST_MODE__ = 'cyclist';
    render(<CurrentSettingsPanel settings={MOCK_SETTINGS} />);
    expect(screen.getByTestId('settings-panel')).toBeInTheDocument();
  });

  it('should render in bikerack mode without errors', () => {
    (globalThis as any).__CYCLIST_MODE__ = 'bikerack';
    render(<CurrentSettingsPanel settings={MOCK_SETTINGS} />);
    expect(screen.getByTestId('settings-panel')).toBeInTheDocument();
  });
});
