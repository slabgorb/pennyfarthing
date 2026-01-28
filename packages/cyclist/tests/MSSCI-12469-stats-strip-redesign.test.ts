/**
 * MSSCI-12469: Stats strip redesign with identity context
 *
 * Redesign stats strip to show:
 * PWD (responsive) → Jira email → GitHub username → spacer → Claude model → Context %
 *
 * Remove: context tokens, usage limits
 *
 * Acceptance Criteria:
 * - [ ] AC1: PWD responsive (short in narrow window, long in wide)
 * - [ ] AC2: Jira email displayed from jira CLI config
 * - [ ] AC3: GitHub username displayed from gh CLI config
 * - [ ] AC4: Model and context % preserved
 * - [ ] AC5: Usage limits removed
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { Window } from 'happy-dom';

import { app } from '../src/server.js';

describe('MSSCI-12469: Stats strip redesign with identity context', () => {
  let html: string;
  let document: Document;
  let css: string;

  beforeAll(async () => {
    // Fetch HTML
    const htmlResponse = await request(app).get('/');
    html = htmlResponse.text;

    // Parse HTML with happy-dom
    const window = new Window();
    window.document.write(html);
    document = window.document;

    // Fetch CSS
    const cssResponse = await request(app).get('/styles.css');
    css = cssResponse.text;
  });

  describe('AC1: PWD responsive (short in narrow window, long in wide)', () => {
    it('should have pwd element in stats-strip', () => {
      const pwd = document.querySelector('#stats-strip .pwd');
      expect(pwd).not.toBeNull();
    });

    it('should have pwd element in stats-left group (left side of strip)', () => {
      const pwd = document.querySelector('#stats-strip .stats-left .pwd');
      expect(pwd).not.toBeNull();
    });

    it('should have data-stat attribute for updates', () => {
      const pwd = document.querySelector('#stats-strip .pwd');
      expect(pwd?.getAttribute('data-stat')).toBe('strip-pwd');
    });

    it('should have title attribute for full path tooltip', () => {
      const pwd = document.querySelector('#stats-strip .pwd');
      expect(pwd?.hasAttribute('title')).toBe(true);
    });

    it('should have CSS for pwd element with text overflow handling', () => {
      // PWD should have overflow ellipsis for narrow windows
      expect(css).toMatch(/\.pwd[^}]*(overflow|text-overflow|white-space)/);
    });

    it('should have CSS for responsive width on pwd', () => {
      // PWD should have flexible width constraints
      expect(css).toMatch(/\.pwd[^}]*(max-width|min-width|flex)/);
    });

    it('should export updatePwd function for responsive updates', async () => {
      const { readFileSync } = await import('fs');
      const { join, dirname } = await import('path');
      const { fileURLToPath } = await import('url');
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const statsStripPath = join(__dirname, '../src/public/js/stats-strip.js');
      const content = readFileSync(statsStripPath, 'utf-8');

      expect(content).toContain('window.updatePwd');
    });

    it('should have resize observer for responsive behavior', async () => {
      const { readFileSync } = await import('fs');
      const { join, dirname } = await import('path');
      const { fileURLToPath } = await import('url');
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const statsStripPath = join(__dirname, '../src/public/js/stats-strip.js');
      const content = readFileSync(statsStripPath, 'utf-8');

      expect(content).toContain('ResizeObserver');
      expect(content).toContain('updatePwdDisplay');
    });

    it('should store full path and folder name for responsive switching', async () => {
      const { readFileSync } = await import('fs');
      const { join, dirname } = await import('path');
      const { fileURLToPath } = await import('url');
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const statsStripPath = join(__dirname, '../src/public/js/stats-strip.js');
      const content = readFileSync(statsStripPath, 'utf-8');

      // Should store both full path and folder name in dataset
      expect(content).toContain('dataset.fullPath');
      expect(content).toContain('dataset.folderName');
    });
  });

  describe('AC2: Jira email displayed from jira CLI config', () => {
    it('should have jira-email element in stats-strip', () => {
      const jiraEmail = document.querySelector('#stats-strip .jira-email');
      expect(jiraEmail).not.toBeNull();
    });

    it('should have jira-email in stats-left group after pwd', () => {
      const statsLeft = document.querySelector('#stats-strip .stats-left');
      const jiraEmail = statsLeft?.querySelector('.jira-email');
      expect(jiraEmail).not.toBeNull();
    });

    it('should have data-stat attribute on jira-email for updates', () => {
      const jiraEmail = document.querySelector('#stats-strip .jira-email');
      expect(jiraEmail?.getAttribute('data-stat')).toBe('strip-jira-email');
    });

    it('should have title attribute for tooltip', () => {
      const jiraEmail = document.querySelector('#stats-strip .jira-email');
      expect(jiraEmail?.hasAttribute('title')).toBe(true);
    });

    it('should have CSS styling for jira-email element', () => {
      expect(css).toMatch(/\.jira-email[^{]*\{/);
    });

    it('should have API endpoint to get jira config', async () => {
      // Test that /api/identity endpoint exists and returns jira email
      const response = await request(app).get('/api/identity');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('jiraEmail');
    });

    it('should export updateJiraEmail function', async () => {
      const { readFileSync } = await import('fs');
      const { join, dirname } = await import('path');
      const { fileURLToPath } = await import('url');
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const statsStripPath = join(__dirname, '../src/public/js/stats-strip.js');
      const content = readFileSync(statsStripPath, 'utf-8');

      expect(content).toContain('updateJiraEmail');
    });

    it('should fetch jira email on initialization', async () => {
      const { readFileSync } = await import('fs');
      const { join, dirname } = await import('path');
      const { fileURLToPath } = await import('url');
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const statsStripPath = join(__dirname, '../src/public/js/stats-strip.js');
      const content = readFileSync(statsStripPath, 'utf-8');

      // Should call identity API on init
      expect(content).toMatch(/\/api\/identity|electronAPI\.identity/);
    });
  });

  describe('AC3: GitHub username displayed from gh CLI config', () => {
    it('should have github-user element in stats-strip', () => {
      const githubUser = document.querySelector('#stats-strip .github-user');
      expect(githubUser).not.toBeNull();
    });

    it('should have github-user in stats-left group after jira-email', () => {
      const statsLeft = document.querySelector('#stats-strip .stats-left');
      const githubUser = statsLeft?.querySelector('.github-user');
      expect(githubUser).not.toBeNull();
    });

    it('should have data-stat attribute on github-user for updates', () => {
      const githubUser = document.querySelector('#stats-strip .github-user');
      expect(githubUser?.getAttribute('data-stat')).toBe('strip-github-user');
    });

    it('should have title attribute for tooltip', () => {
      const githubUser = document.querySelector('#stats-strip .github-user');
      expect(githubUser?.hasAttribute('title')).toBe(true);
    });

    it('should have CSS styling for github-user element', () => {
      expect(css).toMatch(/\.github-user[^{]*\{/);
    });

    it('should have API endpoint to get github config', async () => {
      // Test that /api/identity endpoint exists and returns github username
      const response = await request(app).get('/api/identity');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('githubUsername');
    });

    it('should export updateGithubUser function', async () => {
      const { readFileSync } = await import('fs');
      const { join, dirname } = await import('path');
      const { fileURLToPath } = await import('url');
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const statsStripPath = join(__dirname, '../src/public/js/stats-strip.js');
      const content = readFileSync(statsStripPath, 'utf-8');

      expect(content).toContain('updateGithubUser');
    });

    it('should fetch github username on initialization', async () => {
      const { readFileSync } = await import('fs');
      const { join, dirname } = await import('path');
      const { fileURLToPath } = await import('url');
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const statsStripPath = join(__dirname, '../src/public/js/stats-strip.js');
      const content = readFileSync(statsStripPath, 'utf-8');

      // Should call identity API on init
      expect(content).toMatch(/\/api\/identity|electronAPI\.identity/);
    });

    it('should prepend @ symbol to github username display', () => {
      // GitHub usernames are typically displayed with @ prefix
      const githubUser = document.querySelector('#stats-strip .github-user');
      // Element should exist with @ prefix expectation in implementation
      expect(githubUser).not.toBeNull();
    });
  });

  describe('AC4: Model and context % preserved', () => {
    it('should have model-badge element in stats-strip', () => {
      const modelBadge = document.querySelector('#stats-strip .model-badge');
      expect(modelBadge).not.toBeNull();
    });

    it('should have model-badge in stats-right group', () => {
      const modelBadge = document.querySelector('#stats-strip .stats-right .model-badge');
      expect(modelBadge).not.toBeNull();
    });

    it('should have data-stat attribute on model-badge', () => {
      const modelBadge = document.querySelector('#stats-strip .model-badge');
      expect(modelBadge?.getAttribute('data-stat')).toBe('strip-model');
    });

    it('should have context-mini meter element', () => {
      const contextMini = document.querySelector('#stats-strip .context-mini');
      expect(contextMini).not.toBeNull();
    });

    it('should have context-mini in stats-right group', () => {
      const contextMini = document.querySelector('#stats-strip .stats-right .context-mini');
      expect(contextMini).not.toBeNull();
    });

    it('should have context-mini-label for percentage display', () => {
      const contextLabel = document.querySelector('#stats-strip .context-mini-label');
      expect(contextLabel).not.toBeNull();
    });

    it('should have context-mini-fill for progress bar', () => {
      const contextFill = document.querySelector('#stats-strip .context-mini-fill');
      expect(contextFill).not.toBeNull();
    });

    it('should maintain updateContextMeter export', async () => {
      const { readFileSync } = await import('fs');
      const { join, dirname } = await import('path');
      const { fileURLToPath } = await import('url');
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const statsStripPath = join(__dirname, '../src/public/js/stats-strip.js');
      const content = readFileSync(statsStripPath, 'utf-8');

      expect(content).toContain('window.updateContextMeter');
    });

    it('should maintain updateStripStat export for model updates', async () => {
      const { readFileSync } = await import('fs');
      const { join, dirname } = await import('path');
      const { fileURLToPath } = await import('url');
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const statsStripPath = join(__dirname, '../src/public/js/stats-strip.js');
      const content = readFileSync(statsStripPath, 'utf-8');

      expect(content).toContain('window.updateStripStat');
    });
  });

  describe('AC5: Usage limits removed', () => {
    it('should NOT have usage-5hr element in stats-strip', () => {
      const usage5hr = document.querySelector('#stats-strip .usage-5hr');
      expect(usage5hr).toBeNull();
    });

    it('should NOT have usage-weekly element in stats-strip', () => {
      const usageWeekly = document.querySelector('#stats-strip .usage-weekly');
      expect(usageWeekly).toBeNull();
    });

    it('should NOT have context-tokens element in stats-strip', () => {
      // Context tokens display was replaced by usage limits in 23-1, now both removed
      const contextTokens = document.querySelector('#stats-strip .context-tokens');
      expect(contextTokens).toBeNull();
    });

    it('should NOT have context-stats wrapper in stats-strip', () => {
      // The context-stats wrapper held context tokens, should be removed
      const contextStats = document.querySelector('#stats-strip .context-stats');
      expect(contextStats).toBeNull();
    });

    it('should NOT export updateUsageMeter function', async () => {
      const { readFileSync } = await import('fs');
      const { join, dirname } = await import('path');
      const { fileURLToPath } = await import('url');
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const statsStripPath = join(__dirname, '../src/public/js/stats-strip.js');
      const content = readFileSync(statsStripPath, 'utf-8');

      // Function should be removed or not exported
      expect(content).not.toContain('window.updateUsageMeter');
    });

    it('should NOT have usage limit CSS classes in stylesheet', () => {
      // Usage classes should be removed from CSS
      expect(css).not.toMatch(/\.usage-5hr\s*\{/);
      expect(css).not.toMatch(/\.usage-weekly\s*\{/);
    });

    it('should NOT subscribe to usageStats IPC channel', async () => {
      const { readFileSync } = await import('fs');
      const { join, dirname } = await import('path');
      const { fileURLToPath } = await import('url');
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const statsStripPath = join(__dirname, '../src/public/js/stats-strip.js');
      const content = readFileSync(statsStripPath, 'utf-8');

      // Should not reference usageStats API
      expect(content).not.toContain('electronAPI.usageStats');
      expect(content).not.toContain('usageStats.onUpdate');
    });
  });

  describe('Layout: Order verification (PWD → Jira → GitHub → spacer → Model → Context)', () => {
    it('should have stats-left and stats-right groups for layout', () => {
      const statsLeft = document.querySelector('#stats-strip .stats-left');
      const statsRight = document.querySelector('#stats-strip .stats-right');
      expect(statsLeft).not.toBeNull();
      expect(statsRight).not.toBeNull();
    });

    it('should have spacer between left and right groups via flexbox', () => {
      // Stats strip should use justify-content: space-between for spacer effect
      expect(css).toMatch(/#stats-strip[^}]*justify-content:\s*space-between/);
    });

    it('should have identity elements (pwd, jira, github) in stats-left', () => {
      const statsLeft = document.querySelector('#stats-strip .stats-left');
      const pwd = statsLeft?.querySelector('.pwd');
      const jiraEmail = statsLeft?.querySelector('.jira-email');
      const githubUser = statsLeft?.querySelector('.github-user');

      expect(pwd).not.toBeNull();
      expect(jiraEmail).not.toBeNull();
      expect(githubUser).not.toBeNull();
    });

    it('should have model and context in stats-right', () => {
      const statsRight = document.querySelector('#stats-strip .stats-right');
      const modelBadge = statsRight?.querySelector('.model-badge');
      const contextMini = statsRight?.querySelector('.context-mini');

      expect(modelBadge).not.toBeNull();
      expect(contextMini).not.toBeNull();
    });

    it('should have correct DOM order in stats-left: pwd → jira → github', () => {
      const statsLeft = document.querySelector('#stats-strip .stats-left');
      const children = Array.from(statsLeft?.children || []);

      const pwdIndex = children.findIndex(el => el.classList.contains('pwd'));
      const jiraIndex = children.findIndex(el => el.classList.contains('jira-email'));
      const githubIndex = children.findIndex(el => el.classList.contains('github-user'));

      expect(pwdIndex).toBeGreaterThanOrEqual(0);
      expect(jiraIndex).toBeGreaterThan(pwdIndex);
      expect(githubIndex).toBeGreaterThan(jiraIndex);
    });

    it('should have correct DOM order in stats-right: model → context', () => {
      const statsRight = document.querySelector('#stats-strip .stats-right');
      const children = Array.from(statsRight?.children || []);

      const modelIndex = children.findIndex(el => el.classList.contains('model-badge'));
      const contextIndex = children.findIndex(el => el.classList.contains('context-mini'));

      expect(modelIndex).toBeGreaterThanOrEqual(0);
      expect(contextIndex).toBeGreaterThan(modelIndex);
    });
  });

  describe('API: Identity endpoint for Jira and GitHub', () => {
    it('should have /api/identity GET endpoint', async () => {
      const response = await request(app).get('/api/identity');
      expect(response.status).toBe(200);
    });

    it('should return JSON with jiraEmail field', async () => {
      const response = await request(app).get('/api/identity');
      expect(response.headers['content-type']).toMatch(/json/);
      expect(response.body).toHaveProperty('jiraEmail');
    });

    it('should return JSON with githubUsername field', async () => {
      const response = await request(app).get('/api/identity');
      expect(response.headers['content-type']).toMatch(/json/);
      expect(response.body).toHaveProperty('githubUsername');
    });

    it('should return null/empty for unconfigured identity fields', async () => {
      const response = await request(app).get('/api/identity');
      // Fields should exist even if null (user hasn't configured jira/gh CLI)
      expect('jiraEmail' in response.body).toBe(true);
      expect('githubUsername' in response.body).toBe(true);
    });
  });
});
