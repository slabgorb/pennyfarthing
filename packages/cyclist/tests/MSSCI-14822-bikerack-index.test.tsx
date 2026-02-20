/**
 * MSSCI-14822: BikeRackIndex panel listing page
 *
 * RED phase tests — BikeRackIndex component that lists all available panels
 * with links to open each in standalone mode via ?panel=X.
 *
 * Story: MSSCI-14822 - BikeRackIndex panel listing page
 * Epic: 101 (BikeRack Mode)
 *
 * Acceptance Criteria:
 * - AC1: /bikerack URL renders the index page
 * - AC2: Lists all 12 panels with links (portrait extracted to anchor in 102-6)
 * - AC3: Links use ?panel=X format
 * - AC4: Styled with Tailwind dark mode, consistent with Cyclist
 * - AC5: pnpm build succeeds (verified separately)
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import React from 'react';
import * as fs from 'node:fs';
import * as path from 'node:path';

expect.extend(matchers);

// ============================================================================
// All 12 panels (portrait extracted to anchor in 102-6, settings added in 102-2, TTY removed in 98-15)
// ============================================================================

const ALL_PANELS = [
  'sprint',
  'git',
  'diffs',
  'todos',
  'workflow',
  'audit',
  'ac',
  'debug',
  'bikelane',
  'settings',
  'progress',
] as const;

// ============================================================================
// Mock Setup (same hooks as 101-2 tests for panel rendering)
// ============================================================================

vi.mock('../src/public/hooks/useStory', () => ({
  useStory: vi.fn(() => ({
    story: null,
    isLoading: false,
    error: null,
  })),
}));

vi.mock('../src/public/contexts/ClaudeContext', () => ({
  useClaudeContext: vi.fn(() => ({
    send: vi.fn(),
    isConnected: false,
  })),
  ClaudeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../src/public/hooks/useTodos', () => ({
  useTodos: vi.fn(() => ({
    todos: [],
    isLoading: false,
    error: null,
  })),
}));

vi.mock('../src/public/hooks/useGit', () => ({
  useGit: vi.fn(() => ({
    branches: [],
    isLoading: false,
    error: null,
  })),
}));

// ============================================================================
// URL helpers
// ============================================================================

function setLocation(pathname: string, search = ''): void {
  Object.defineProperty(window, 'location', {
    value: new URL(`http://localhost:2898${pathname}${search}`),
    writable: true,
    configurable: true,
  });
}

function clearLocation(): void {
  Object.defineProperty(window, 'location', {
    value: new URL('http://localhost:2898/'),
    writable: true,
    configurable: true,
  });
}

// ============================================================================
// Tests
// ============================================================================

beforeEach(() => {
  clearLocation();
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  clearLocation();
});

// ---------------------------------------------------------------------------
// AC1: /bikerack URL renders the index page
// ---------------------------------------------------------------------------

describe('AC1: /bikerack URL renders the index page', () => {
  it('should export BikeRackIndex as a named component', async () => {
    const mod = await import('../src/public/components/BikeRackIndex');
    expect(mod).toHaveProperty('BikeRackIndex');
    expect(typeof mod.BikeRackIndex).toBe('function');
  });

  it('should render without crashing', async () => {
    const { BikeRackIndex } = await import(
      '../src/public/components/BikeRackIndex'
    );

    const { container } = render(<BikeRackIndex />);
    expect(container.firstElementChild).toBeTruthy();
  });

  it('should display a heading or title indicating BikeRack', async () => {
    const { BikeRackIndex } = await import(
      '../src/public/components/BikeRackIndex'
    );

    render(<BikeRackIndex />);

    // Should have some heading or branding for BikeRack
    const heading = screen.getByRole('heading');
    expect(heading).toBeInTheDocument();
    expect(heading.textContent).toMatch(/bikerack/i);
  });

  it('App.tsx should detect /bikerack path and render BikeRackIndex', () => {
    // Verify App.tsx has been updated to handle /bikerack path routing
    const appPath = path.resolve(__dirname, '../src/public/App.tsx');
    const source = fs.readFileSync(appPath, 'utf-8');

    // App.tsx should import BikeRackIndex
    expect(source).toMatch(/BikeRackIndex/);
    // App.tsx should check for /bikerack path
    expect(source).toMatch(/bikerack/);
  });

  it('server.ts should have a /bikerack route', () => {
    // After 98-17, /bikerack route is in core's server.ts
    const serverPath = path.resolve(__dirname, '../../core/src/server/server.ts');
    const source = fs.readFileSync(serverPath, 'utf-8');

    expect(source).toMatch(/['"]\/bikerack['"]/);
  });
});

// ---------------------------------------------------------------------------
// AC2: Lists all 12 panels with links (portrait extracted in 102-6)
// ---------------------------------------------------------------------------

describe('AC2: Lists all 12 panels with links', () => {
  it('should render 12 panel links', async () => {
    const { BikeRackIndex } = await import(
      '../src/public/components/BikeRackIndex'
    );

    render(<BikeRackIndex />);

    // Each panel should have a link
    const links = screen.getAllByRole('link');
    // At least 12 links (one per panel — may have more if there's a header link etc)
    expect(links.length).toBeGreaterThanOrEqual(12);
  });

  it.each(ALL_PANELS)(
    'should include a link for the "%s" panel',
    async (panelName) => {
      const { BikeRackIndex } = await import(
        '../src/public/components/BikeRackIndex'
      );

      render(<BikeRackIndex />);

      // Each panel should be listed — look for text containing the panel name
      // Panel names may be displayed with friendly titles (e.g., "Sprint" for "sprint")
      const panelRegex = new RegExp(panelName, 'i');
      const allText = document.body.textContent || '';
      expect(allText).toMatch(panelRegex);
    },
  );

  it('should list exactly 12 unique panel entries', async () => {
    const { BikeRackIndex } = await import(
      '../src/public/components/BikeRackIndex'
    );

    render(<BikeRackIndex />);

    // Collect all links that point to ?panel= URLs
    const links = screen.getAllByRole('link');
    const panelLinks = links.filter((link) => {
      const href = link.getAttribute('href') || '';
      return href.includes('panel=');
    });

    // Should have exactly 12 panel links
    expect(panelLinks.length).toBe(12);

    // All should be unique
    const hrefs = panelLinks.map((l) => l.getAttribute('href'));
    const uniqueHrefs = new Set(hrefs);
    expect(uniqueHrefs.size).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// AC3: Links use ?panel=X format
// ---------------------------------------------------------------------------

describe('AC3: Links use ?panel=X format', () => {
  it.each(ALL_PANELS)(
    'should have a link with href containing "panel=%s"',
    async (panelName) => {
      const { BikeRackIndex } = await import(
        '../src/public/components/BikeRackIndex'
      );

      render(<BikeRackIndex />);

      const links = screen.getAllByRole('link');
      const matchingLink = links.find((link) => {
        const href = link.getAttribute('href') || '';
        return href.includes(`panel=${panelName}`);
      });

      expect(matchingLink).toBeTruthy();
    },
  );

  it('all panel links should use ?panel=X query parameter format', async () => {
    const { BikeRackIndex } = await import(
      '../src/public/components/BikeRackIndex'
    );

    render(<BikeRackIndex />);

    const links = screen.getAllByRole('link');
    const panelLinks = links.filter((link) => {
      const href = link.getAttribute('href') || '';
      return href.includes('panel=');
    });

    // Every panel link should match the ?panel=X pattern
    panelLinks.forEach((link) => {
      const href = link.getAttribute('href') || '';
      expect(href).toMatch(/[?&]panel=\w+/);
    });
  });
});

// ---------------------------------------------------------------------------
// AC4: Styled with Tailwind dark mode, consistent with Cyclist
// ---------------------------------------------------------------------------

describe('AC4: Styled with Tailwind dark mode', () => {
  it('BikeRackIndex.tsx should use Tailwind CSS classes', () => {
    const filePath = path.resolve(
      __dirname,
      '../src/public/components/BikeRackIndex.tsx',
    );
    const source = fs.readFileSync(filePath, 'utf-8');

    // Should use Tailwind utility classes — at minimum bg- and text- classes
    expect(source).toMatch(/className/);
    // Dark-mode aware: should have dark: prefix or dark-themed bg classes
    const hasDarkStyling =
      source.includes('dark:') ||
      source.includes('bg-slate-') ||
      source.includes('bg-gray-') ||
      source.includes('bg-zinc-') ||
      source.includes('bg-neutral-');
    expect(hasDarkStyling).toBe(true);
  });

  it('should not use inline styles for primary layout', () => {
    const filePath = path.resolve(
      __dirname,
      '../src/public/components/BikeRackIndex.tsx',
    );
    const source = fs.readFileSync(filePath, 'utf-8');

    // Tailwind should be the primary styling approach — minimal inline style= usage
    // Allow some inline styles but the component should primarily use className
    const classNameCount = (source.match(/className/g) || []).length;
    const inlineStyleCount = (source.match(/style={{/g) || []).length;

    // className usage should significantly exceed inline style usage
    expect(classNameCount).toBeGreaterThan(inlineStyleCount);
  });

  it('should render with dark-themed background', async () => {
    const { BikeRackIndex } = await import(
      '../src/public/components/BikeRackIndex'
    );

    const { container } = render(<BikeRackIndex />);
    const root = container.firstElementChild as HTMLElement;

    // Root element should have dark-themed classes
    const className = root?.className || '';
    const hasDarkBg =
      className.includes('bg-') ||
      className.includes('dark');
    expect(hasDarkBg).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Structural Rules (from ADR-0024)
// ---------------------------------------------------------------------------

describe('Structural: BikeRackIndex follows ADR-0024 rules', () => {
  it('should not import from dockview-react (Rule 7)', () => {
    const filePath = path.resolve(
      __dirname,
      '../src/public/components/BikeRackIndex.tsx',
    );
    const source = fs.readFileSync(filePath, 'utf-8');

    expect(source).not.toMatch(/from\s+['"]dockview-react['"]/);
    expect(source).not.toMatch(/import.*dockview/i);
  });

  it('should not pass BikeRack-specific props (Rule 2)', () => {
    const filePath = path.resolve(
      __dirname,
      '../src/public/components/BikeRackIndex.tsx',
    );
    const source = fs.readFileSync(filePath, 'utf-8');

    expect(source).not.toMatch(/isBikeRack/);
    expect(source).not.toMatch(/isStandalone/);
    expect(source).not.toMatch(/bikeRackMode/);
  });

  it('should not check process.env directly (Rule 10 — URL-based only)', () => {
    const filePath = path.resolve(
      __dirname,
      '../src/public/components/BikeRackIndex.tsx',
    );
    const source = fs.readFileSync(filePath, 'utf-8');

    expect(source).not.toMatch(/process\.env/);
  });
});
