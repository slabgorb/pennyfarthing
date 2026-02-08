/**
 * MSSCI-14445: Hotspot client-side filter toggles
 *
 * Tests for "Code only" and "Include config" filter toggles in HotspotsDialog.
 * Filters apply post-fetch (no API changes needed).
 *
 * Story: MSSCI-14445 - Hotspot: expand artifact exclusions + client filters
 * Epic: epic-79 (Dialog Infrastructure + Hotspot Refactor)
 *
 * Acceptance Criteria:
 * - AC1: "Code only" toggle filters to source extensions (.ts, .tsx, .js, .jsx, .py, .md, .css, .scss, .html)
 * - AC2: "Include config" toggle shows config files (.json, .yaml, .yml, .toml, .env)
 * - AC3: Filters apply post-fetch (client-side only)
 * - AC4: Filters combine correctly (Code only + Include config)
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// Mock the useHotspots hook
vi.mock('../src/public/hooks/useHotspots', () => ({
  useHotspots: vi.fn(() => ({
    data: null,
    isLoading: false,
    error: null,
    refresh: vi.fn(),
  })),
}));

import { useHotspots } from '../src/public/hooks/useHotspots';

const mockUseHotspots = vi.mocked(useHotspots);

// Mixed file types for testing filters
const MIXED_HOTSPOT_DATA = {
  success: true,
  repo_name: 'pennyfarthing',
  time_window_days: 90,
  commit_count: 100,
  file_hotspots: [
    // Source files
    { path: 'src/app.ts', change_count: 10, bug_fix_count: 3, author_count: 2, churn: 500, hotspot_score: 75.0 },
    { path: 'src/Button.tsx', change_count: 8, bug_fix_count: 1, author_count: 2, churn: 200, hotspot_score: 55.0 },
    { path: 'lib/utils.js', change_count: 5, bug_fix_count: 0, author_count: 1, churn: 100, hotspot_score: 30.0 },
    { path: 'src/index.jsx', change_count: 4, bug_fix_count: 1, author_count: 1, churn: 80, hotspot_score: 25.0 },
    { path: 'scripts/build.py', change_count: 3, bug_fix_count: 0, author_count: 1, churn: 50, hotspot_score: 20.0 },
    { path: 'docs/guide.md', change_count: 6, bug_fix_count: 0, author_count: 2, churn: 300, hotspot_score: 40.0 },
    { path: 'src/styles.css', change_count: 4, bug_fix_count: 0, author_count: 1, churn: 150, hotspot_score: 28.0 },
    { path: 'src/theme.scss', change_count: 3, bug_fix_count: 0, author_count: 1, churn: 120, hotspot_score: 22.0 },
    { path: 'public/index.html', change_count: 2, bug_fix_count: 0, author_count: 1, churn: 40, hotspot_score: 15.0 },
    // Config files
    { path: 'tsconfig.json', change_count: 7, bug_fix_count: 2, author_count: 3, churn: 50, hotspot_score: 45.0 },
    { path: 'config/settings.yaml', change_count: 4, bug_fix_count: 1, author_count: 2, churn: 30, hotspot_score: 25.0 },
    { path: '.env', change_count: 3, bug_fix_count: 0, author_count: 1, churn: 20, hotspot_score: 18.0 },
    { path: 'pyproject.toml', change_count: 2, bug_fix_count: 0, author_count: 1, churn: 15, hotspot_score: 12.0 },
    { path: 'config/app.yml', change_count: 2, bug_fix_count: 0, author_count: 1, churn: 10, hotspot_score: 10.0 },
    // Other files (neither source nor config)
    { path: 'Makefile', change_count: 3, bug_fix_count: 0, author_count: 1, churn: 60, hotspot_score: 20.0 },
    { path: 'Dockerfile', change_count: 2, bug_fix_count: 0, author_count: 1, churn: 30, hotspot_score: 15.0 },
    { path: 'LICENSE', change_count: 1, bug_fix_count: 0, author_count: 1, churn: 5, hotspot_score: 5.0 },
  ],
  directory_hotspots: [
    { path: 'src', file_count: 5, total_changes: 29, total_bug_fixes: 5, avg_author_count: 1.4, hotspot_score: 41.0 },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseHotspots.mockReturnValue({
    data: MIXED_HOTSPOT_DATA as any,
    isLoading: false,
    error: null,
    refresh: vi.fn(),
  });
});

// ============================================================================
// AC1: "Code only" toggle
// ============================================================================

describe('AC1: "Code only" toggle filters to source extensions', () => {
  it('should render a "Code only" toggle/checkbox', async () => {
    const { HotspotsDialog } = await import('../src/public/components/dialogs/HotspotsDialog');

    render(<HotspotsDialog open={true} onOpenChange={() => {}} />);

    // Look for the toggle by label text
    const codeOnlyToggle = screen.getByLabelText(/code only/i);
    expect(codeOnlyToggle).toBeInTheDocument();
  });

  it('should show all files when "Code only" is off (default)', async () => {
    const { HotspotsDialog } = await import('../src/public/components/dialogs/HotspotsDialog');

    render(<HotspotsDialog open={true} onOpenChange={() => {}} />);

    // All files should be visible when no filter is active
    expect(screen.getByText('src/app.ts')).toBeInTheDocument();
    expect(screen.getByText('tsconfig.json')).toBeInTheDocument();
    expect(screen.getByText('Makefile')).toBeInTheDocument();
  });

  it('should filter to only source extensions when "Code only" is enabled', async () => {
    const user = userEvent.setup();
    const { HotspotsDialog } = await import('../src/public/components/dialogs/HotspotsDialog');

    render(<HotspotsDialog open={true} onOpenChange={() => {}} />);

    // Enable "Code only"
    const codeOnlyToggle = screen.getByLabelText(/code only/i);
    await user.click(codeOnlyToggle);

    // Source files should still be visible
    expect(screen.getByText('src/app.ts')).toBeInTheDocument();
    expect(screen.getByText('src/Button.tsx')).toBeInTheDocument();
    expect(screen.getByText('lib/utils.js')).toBeInTheDocument();
    expect(screen.getByText('src/index.jsx')).toBeInTheDocument();
    expect(screen.getByText('scripts/build.py')).toBeInTheDocument();
    expect(screen.getByText('docs/guide.md')).toBeInTheDocument();
    expect(screen.getByText('src/styles.css')).toBeInTheDocument();
    expect(screen.getByText('src/theme.scss')).toBeInTheDocument();
    expect(screen.getByText('public/index.html')).toBeInTheDocument();

    // Config and other files should be hidden
    expect(screen.queryByText('tsconfig.json')).not.toBeInTheDocument();
    expect(screen.queryByText('Makefile')).not.toBeInTheDocument();
    expect(screen.queryByText('Dockerfile')).not.toBeInTheDocument();
    expect(screen.queryByText('LICENSE')).not.toBeInTheDocument();
  });
});

// ============================================================================
// AC2: "Include config" toggle
// ============================================================================

describe('AC2: "Include config" toggle for config files', () => {
  it('should render an "Include config" toggle/checkbox', async () => {
    const { HotspotsDialog } = await import('../src/public/components/dialogs/HotspotsDialog');

    render(<HotspotsDialog open={true} onOpenChange={() => {}} />);

    const configToggle = screen.getByLabelText(/include config/i);
    expect(configToggle).toBeInTheDocument();
  });

  it('should include config files when "Include config" is checked with "Code only"', async () => {
    const user = userEvent.setup();
    const { HotspotsDialog } = await import('../src/public/components/dialogs/HotspotsDialog');

    render(<HotspotsDialog open={true} onOpenChange={() => {}} />);

    // Enable "Code only" first
    const codeOnlyToggle = screen.getByLabelText(/code only/i);
    await user.click(codeOnlyToggle);

    // Config files should be hidden
    expect(screen.queryByText('tsconfig.json')).not.toBeInTheDocument();

    // Now enable "Include config"
    const configToggle = screen.getByLabelText(/include config/i);
    await user.click(configToggle);

    // Source files still visible
    expect(screen.getByText('src/app.ts')).toBeInTheDocument();

    // Config files now visible
    expect(screen.getByText('tsconfig.json')).toBeInTheDocument();
    expect(screen.getByText('config/settings.yaml')).toBeInTheDocument();
    expect(screen.getByText('.env')).toBeInTheDocument();
    expect(screen.getByText('pyproject.toml')).toBeInTheDocument();
    expect(screen.getByText('config/app.yml')).toBeInTheDocument();

    // Other files (Makefile, Dockerfile, LICENSE) still hidden
    expect(screen.queryByText('Makefile')).not.toBeInTheDocument();
    expect(screen.queryByText('Dockerfile')).not.toBeInTheDocument();
  });
});

// ============================================================================
// AC3: Filters apply post-fetch (client-side only)
// ============================================================================

describe('AC3: Filters are client-side only (post-fetch)', () => {
  it('should not re-fetch data when toggling "Code only"', async () => {
    const mockRefresh = vi.fn();
    mockUseHotspots.mockReturnValue({
      data: MIXED_HOTSPOT_DATA as any,
      isLoading: false,
      error: null,
      refresh: mockRefresh,
    });

    const user = userEvent.setup();
    const { HotspotsDialog } = await import('../src/public/components/dialogs/HotspotsDialog');

    render(<HotspotsDialog open={true} onOpenChange={() => {}} />);

    const callCountBefore = mockUseHotspots.mock.calls.length;

    // Toggle "Code only"
    const codeOnlyToggle = screen.getByLabelText(/code only/i);
    await user.click(codeOnlyToggle);

    // useHotspots should not have been called with different params
    // (the hook args should remain the same — only local state changes)
    const callsAfter = mockUseHotspots.mock.calls;
    const lastCallBefore = callsAfter[callCountBefore - 1];
    const lastCallAfter = callsAfter[callsAfter.length - 1];

    // The hook parameters (days, includeOrchestrator) should not change
    expect(lastCallAfter?.[0]?.days).toEqual(lastCallBefore?.[0]?.days);
  });

  it('should not re-fetch data when toggling "Include config"', async () => {
    const mockRefresh = vi.fn();
    mockUseHotspots.mockReturnValue({
      data: MIXED_HOTSPOT_DATA as any,
      isLoading: false,
      error: null,
      refresh: mockRefresh,
    });

    const user = userEvent.setup();
    const { HotspotsDialog } = await import('../src/public/components/dialogs/HotspotsDialog');

    render(<HotspotsDialog open={true} onOpenChange={() => {}} />);

    // Enable code only first, then toggle config
    const codeOnlyToggle = screen.getByLabelText(/code only/i);
    await user.click(codeOnlyToggle);

    const callCountBefore = mockUseHotspots.mock.calls.length;

    const configToggle = screen.getByLabelText(/include config/i);
    await user.click(configToggle);

    const callsAfter = mockUseHotspots.mock.calls;
    const lastCallBefore = callsAfter[callCountBefore - 1];
    const lastCallAfter = callsAfter[callsAfter.length - 1];

    expect(lastCallAfter?.[0]?.days).toEqual(lastCallBefore?.[0]?.days);
  });
});

// ============================================================================
// AC4: Filter combinations
// ============================================================================

describe('AC4: Filter combinations work correctly', () => {
  it('should show everything when both filters are off', async () => {
    const { HotspotsDialog } = await import('../src/public/components/dialogs/HotspotsDialog');

    render(<HotspotsDialog open={true} onOpenChange={() => {}} />);

    // All types visible
    expect(screen.getByText('src/app.ts')).toBeInTheDocument();
    expect(screen.getByText('tsconfig.json')).toBeInTheDocument();
    expect(screen.getByText('Makefile')).toBeInTheDocument();
  });

  it('should disable "Include config" when "Code only" is off', async () => {
    const { HotspotsDialog } = await import('../src/public/components/dialogs/HotspotsDialog');

    render(<HotspotsDialog open={true} onOpenChange={() => {}} />);

    // "Include config" should be disabled when "Code only" is off
    // (it only makes sense as a modifier of the code-only filter)
    const configToggle = screen.getByLabelText(/include config/i);
    expect(configToggle).toBeDisabled();
  });

  it('should enable "Include config" when "Code only" is on', async () => {
    const user = userEvent.setup();
    const { HotspotsDialog } = await import('../src/public/components/dialogs/HotspotsDialog');

    render(<HotspotsDialog open={true} onOpenChange={() => {}} />);

    const codeOnlyToggle = screen.getByLabelText(/code only/i);
    await user.click(codeOnlyToggle);

    const configToggle = screen.getByLabelText(/include config/i);
    expect(configToggle).not.toBeDisabled();
  });

  it('should update summary counts when filters are active', async () => {
    const user = userEvent.setup();
    const { HotspotsDialog } = await import('../src/public/components/dialogs/HotspotsDialog');

    render(<HotspotsDialog open={true} onOpenChange={() => {}} />);

    // With all files: 17 files total
    expect(screen.getByText('17 files')).toBeInTheDocument();

    // Enable "Code only" — should show 9 source files
    const codeOnlyToggle = screen.getByLabelText(/code only/i);
    await user.click(codeOnlyToggle);
    expect(screen.getByText('9 files')).toBeInTheDocument();

    // Enable "Include config" — should show 9 source + 5 config = 14
    const configToggle = screen.getByLabelText(/include config/i);
    await user.click(configToggle);
    expect(screen.getByText('14 files')).toBeInTheDocument();
  });
});
