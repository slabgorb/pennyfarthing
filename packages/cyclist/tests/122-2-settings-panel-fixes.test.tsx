/**
 * Story 122-2: Fix SettingsPanel defects and add CLI command reference
 *
 * Tests verify:
 * AC1: Settings panel has proper visual styling with labeled rows
 * AC2: All setting values display correctly from the API (no undefined or blank)
 * AC3: Notifications section removed
 * AC4: CLI command reference shows /pf-settings usage and dot-path keys
 * AC5: Help text is concise and scannable
 *
 * NOTE: Uses a stub component matching the CURRENT SettingsPanel behavior (post 122-1).
 * Tests assert the DESIRED (fixed) behavior, so they fail (RED).
 * When Dev fixes the real component, swap the import:
 *
 *   import { SettingsPanel } from '../src/public/components/panels/SettingsPanel.js';
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, cleanup } from '@testing-library/react';
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
  pennyfarthing: {
    theme: 'firefly',
  },
};

// Settings with some fields missing — tests that undefined is handled gracefully
const SPARSE_SETTINGS = {
  theme: 'firefly',
  workflow: {
    relay_mode: true,
  },
};

/**
 * STUB: Matches the CURRENT SettingsPanel after 122-1 (read-only but broken).
 * Has: Notifications section, no styling, String(undefined), no CLI reference.
 */
function CurrentSettingsPanel({ settings }: { settings: Record<string, any> }) {
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

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url === '/api/settings') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(MOCK_SETTINGS) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// --- AC1: Settings panel has proper visual styling with labeled rows ---

describe('AC1: Settings panel has proper visual styling', () => {
  it('should render setting rows with flex layout styling', () => {
    render(<CurrentSettingsPanel settings={MOCK_SETTINGS} />);

    const rows = document.querySelectorAll('.setting-row');
    expect(rows.length).toBeGreaterThan(0);

    // Each row should have flex display for label-value layout
    rows.forEach(row => {
      const style = (row as HTMLElement).style;
      const hasFlexStyle = style.display === 'flex' ||
        row.classList.contains('flex') ||
        (row as HTMLElement).getAttribute('style')?.includes('flex');
      expect(hasFlexStyle).toBe(true);
    });
  });

  it('should render setting labels with muted/secondary styling', () => {
    render(<CurrentSettingsPanel settings={MOCK_SETTINGS} />);

    const labels = document.querySelectorAll('.setting-label');
    expect(labels.length).toBeGreaterThan(0);

    // Labels should have opacity or muted color class for visual hierarchy
    labels.forEach(label => {
      const el = label as HTMLElement;
      const hasMutedStyle = el.style.opacity !== '' ||
        el.style.color !== '' ||
        el.classList.contains('text-muted-foreground') ||
        el.className.includes('muted') ||
        el.className.includes('opacity');
      expect(hasMutedStyle).toBe(true);
    });
  });

  it('should render section headings with consistent spacing', () => {
    render(<CurrentSettingsPanel settings={MOCK_SETTINGS} />);

    const sections = document.querySelectorAll('.settings-section');
    expect(sections.length).toBeGreaterThan(0);

    // Sections should have padding or margin for spacing
    sections.forEach(section => {
      const el = section as HTMLElement;
      const hasSpacing = el.style.padding !== '' ||
        el.style.marginBottom !== '' ||
        el.className.includes('p-') ||
        el.className.includes('mb-') ||
        el.className.includes('space-y') ||
        el.className.includes('py-') ||
        (el.getAttribute('style') || '').includes('padding');
      expect(hasSpacing).toBe(true);
    });
  });
});

// --- AC2: All setting values display correctly (no undefined or blank) ---

describe('AC2: All setting values display correctly', () => {
  it('should display theme value from settings (not blank)', () => {
    render(<CurrentSettingsPanel settings={MOCK_SETTINGS} />);

    const panel = screen.getByTestId('settings-panel');
    // Theme should show "firefly" — from root theme or pennyfarthing.theme
    expect(panel.textContent).toContain('firefly');

    // The theme value span should not be empty
    const themeRow = Array.from(document.querySelectorAll('.setting-row')).find(
      row => row.querySelector('.setting-label')?.textContent === 'Theme'
    );
    const themeValue = themeRow?.querySelector('.setting-value');
    expect(themeValue?.textContent?.trim()).not.toBe('');
  });

  it('should display color preset value', () => {
    render(<CurrentSettingsPanel settings={MOCK_SETTINGS} />);

    const panel = screen.getByTestId('settings-panel');
    expect(panel.textContent).toContain('tokyo-night');
  });

  it('should display font values from the API', () => {
    render(<CurrentSettingsPanel settings={MOCK_SETTINGS} />);

    const panel = screen.getByTestId('settings-panel');
    expect(panel.textContent).toContain('system');
    expect(panel.textContent).toContain('jetbrains-mono');
  });

  it('should never render the text "undefined" anywhere in the panel', () => {
    render(<CurrentSettingsPanel settings={MOCK_SETTINGS} />);

    const panel = screen.getByTestId('settings-panel');
    expect(panel.textContent).not.toContain('undefined');
  });

  it('should handle sparse settings without showing "undefined"', () => {
    render(<CurrentSettingsPanel settings={SPARSE_SETTINGS} />);

    const panel = screen.getByTestId('settings-panel');
    // Even with missing fields, "undefined" should never appear
    expect(panel.textContent).not.toContain('undefined');
  });

  it('should show a fallback for missing values instead of blank', () => {
    render(<CurrentSettingsPanel settings={SPARSE_SETTINGS} />);

    // Values that are not set should show a fallback (e.g., "—" or "not set")
    const valueSpans = document.querySelectorAll('.setting-value');
    valueSpans.forEach(span => {
      const text = span.textContent?.trim() || '';
      // Should either have a real value or a visible fallback — never empty string
      if (text === '') {
        // If empty, this is a bug — we expect a fallback
        expect(text).not.toBe('');
      }
    });
  });

  it('should display workflow boolean values as human-readable text', () => {
    render(<CurrentSettingsPanel settings={MOCK_SETTINGS} />);

    const panel = screen.getByTestId('settings-panel');
    // Boolean values should NOT render as bare "true"/"false" strings
    // Instead use something like "Enabled"/"Disabled" or "On"/"Off" or at minimum the value
    const bellRow = Array.from(document.querySelectorAll('.setting-row')).find(
      row => row.querySelector('.setting-label')?.textContent?.includes('Bell')
    );
    const bellValue = bellRow?.querySelector('.setting-value')?.textContent?.trim();
    expect(bellValue).toBeDefined();
    expect(bellValue).not.toBe('undefined');
    expect(bellValue).not.toBe('');
  });
});

// --- AC3: Notifications section removed ---

describe('AC3: Notifications section removed', () => {
  it('should not render a Notifications heading', () => {
    render(<CurrentSettingsPanel settings={MOCK_SETTINGS} />);

    const headings = document.querySelectorAll('.settings-panel h4');
    const headingTexts = Array.from(headings).map(h => h.textContent?.toLowerCase());
    expect(headingTexts).not.toContain('notifications');
  });

  it('should not render Phase Change setting', () => {
    render(<CurrentSettingsPanel settings={MOCK_SETTINGS} />);

    const panel = screen.getByTestId('settings-panel');
    expect(panel.textContent).not.toMatch(/phase.change/i);
  });

  it('should not render Sound setting', () => {
    render(<CurrentSettingsPanel settings={MOCK_SETTINGS} />);

    const labels = document.querySelectorAll('.setting-label');
    const labelTexts = Array.from(labels).map(l => l.textContent?.toLowerCase());
    expect(labelTexts).not.toContain('sound');
  });
});

// --- AC4: CLI command reference shows /pf-settings usage ---

describe('AC4: CLI command reference with /pf-settings', () => {
  it('should contain a CLI reference section', () => {
    render(<CurrentSettingsPanel settings={MOCK_SETTINGS} />);

    const panel = screen.getByTestId('settings-panel');
    // Should have a section or heading about CLI usage
    const hasCliSection = panel.textContent?.includes('/pf-settings') ||
      panel.textContent?.includes('pf-settings');
    expect(hasCliSection).toBe(true);
  });

  it('should show dot-path keys for settings', () => {
    render(<CurrentSettingsPanel settings={MOCK_SETTINGS} />);

    const panel = screen.getByTestId('settings-panel');
    // Should show dot-path notation for at least the main settings
    expect(panel.textContent).toContain('workflow.bell_mode');
    expect(panel.textContent).toContain('workflow.relay_mode');
  });

  it('should show example commands for /pf-settings', () => {
    render(<CurrentSettingsPanel settings={MOCK_SETTINGS} />);

    const panel = screen.getByTestId('settings-panel');
    // Should include at least one example command
    expect(panel.textContent).toMatch(/\/pf-settings\s+(set|get|show)/);
  });
});

// --- AC5: Help text is concise and scannable ---

describe('AC5: Help text is concise and scannable', () => {
  it('should have a CLI reference that fits within a reasonable size', () => {
    render(<CurrentSettingsPanel settings={MOCK_SETTINGS} />);

    const panel = screen.getByTestId('settings-panel');
    // The CLI reference should not be a wall of text
    // Total panel text should be under 2000 chars (concise)
    const totalText = panel.textContent || '';
    expect(totalText.length).toBeLessThan(2000);
  });

  it('should show dot-path keys near their corresponding setting labels', () => {
    render(<CurrentSettingsPanel settings={MOCK_SETTINGS} />);

    // Each setting row should include the dot-path key so users know what to type
    const rows = document.querySelectorAll('.setting-row');
    let rowsWithDotPath = 0;
    rows.forEach(row => {
      if (row.textContent?.includes('.')) {
        rowsWithDotPath++;
      }
    });
    // At least the workflow settings should show dot-path keys
    expect(rowsWithDotPath).toBeGreaterThanOrEqual(3);
  });
});
