/**
 * 22-4: Dangerous Path Detection
 *
 * Tests for detecting and warning when Claude attempts to modify sensitive paths,
 * regardless of tool type (Write, Edit, Bash with redirect).
 *
 * Written in RED phase - tests should fail until Dev implements functionality.
 *
 * Acceptance Criteria:
 * - AC1: Sensitive path patterns defined and configurable
 * - AC2: Write/Edit to sensitive paths triggers warning
 * - AC3: Bash commands with redirects to sensitive paths detected
 * - AC4: User can approve or reject
 * - AC5: Allowlist persists for session
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { Window } from 'happy-dom';

import { app } from '../src/server.js';

// SDK message types matching claude-service.ts
interface SDKToolUseMessage {
  type: 'tool_use';
  tool_name: string;
  tool_id: string;
  input: {
    command?: string;
    file_path?: string;
    content?: string;
    old_string?: string;
    new_string?: string;
  };
}

// Factory functions for tool_use messages
const createWriteToolUse = (filePath: string, content = '', toolId?: string): SDKToolUseMessage => ({
  type: 'tool_use',
  tool_name: 'Write',
  tool_id: toolId ?? `tool-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  input: { file_path: filePath, content },
});

const createEditToolUse = (filePath: string, toolId?: string): SDKToolUseMessage => ({
  type: 'tool_use',
  tool_name: 'Edit',
  tool_id: toolId ?? `tool-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  input: { file_path: filePath, old_string: 'old', new_string: 'new' },
});

const createBashToolUse = (command: string, toolId?: string): SDKToolUseMessage => ({
  type: 'tool_use',
  tool_name: 'Bash',
  tool_id: toolId ?? `tool-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  input: { command },
});

const createReadToolUse = (filePath: string, toolId?: string): SDKToolUseMessage => ({
  type: 'tool_use',
  tool_name: 'Read',
  tool_id: toolId ?? `tool-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  input: { file_path: filePath },
});

describe('22-4: Dangerous Path Detection', () => {
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

  // ==========================================================================
  // AC1: Sensitive path patterns defined and configurable
  // ==========================================================================
  describe('AC1: Sensitive path patterns defined and configurable', () => {

    it('should export dangerous-path module', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');
      expect(dangerousPath).toBeDefined();
    });

    it('should export DANGEROUS_PATH_PATTERNS constant', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');
      expect(dangerousPath.DANGEROUS_PATH_PATTERNS).toBeDefined();
      expect(Array.isArray(dangerousPath.DANGEROUS_PATH_PATTERNS)).toBe(true);
    });

    it('should include .env patterns in dangerous paths', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');

      expect(dangerousPath.isDangerousPath('.env')).toBe(true);
      expect(dangerousPath.isDangerousPath('.env.local')).toBe(true);
      expect(dangerousPath.isDangerousPath('.env.production')).toBe(true);
      expect(dangerousPath.isDangerousPath('.env.development.local')).toBe(true);
    });

    it('should include .git/ patterns in dangerous paths', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');

      expect(dangerousPath.isDangerousPath('.git/config')).toBe(true);
      expect(dangerousPath.isDangerousPath('.git/hooks/pre-commit')).toBe(true);
      expect(dangerousPath.isDangerousPath('.git/objects/pack')).toBe(true);
    });

    it('should NOT flag .gitignore as dangerous (starts with .git but not .git/)', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');

      expect(dangerousPath.isDangerousPath('.gitignore')).toBe(false);
      expect(dangerousPath.isDangerousPath('.gitattributes')).toBe(false);
    });

    it('should include node_modules/ in dangerous paths', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');

      expect(dangerousPath.isDangerousPath('node_modules/lodash/index.js')).toBe(true);
      expect(dangerousPath.isDangerousPath('./node_modules/package.json')).toBe(true);
    });

    it('should include lockfiles in dangerous paths', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');

      expect(dangerousPath.isDangerousPath('package-lock.json')).toBe(true);
      expect(dangerousPath.isDangerousPath('pnpm-lock.yaml')).toBe(true);
      expect(dangerousPath.isDangerousPath('yarn.lock')).toBe(true);
    });

    it('should include SSH credential paths as dangerous', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');

      expect(dangerousPath.isDangerousPath('~/.ssh/id_rsa')).toBe(true);
      expect(dangerousPath.isDangerousPath('~/.ssh/id_ed25519')).toBe(true);
      expect(dangerousPath.isDangerousPath('~/.ssh/config')).toBe(true);
      expect(dangerousPath.isDangerousPath('~/.ssh/authorized_keys')).toBe(true);
    });

    it('should include AWS credential paths as dangerous', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');

      expect(dangerousPath.isDangerousPath('~/.aws/credentials')).toBe(true);
      expect(dangerousPath.isDangerousPath('~/.aws/config')).toBe(true);
    });

    it('should include system paths as dangerous', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');

      expect(dangerousPath.isDangerousPath('/etc/passwd')).toBe(true);
      expect(dangerousPath.isDangerousPath('/etc/hosts')).toBe(true);
      expect(dangerousPath.isDangerousPath('/usr/local/bin/script')).toBe(true);
      expect(dangerousPath.isDangerousPath('/var/log/syslog')).toBe(true);
      expect(dangerousPath.isDangerousPath('/System/Library/Preferences')).toBe(true);
    });

    it('should include ~/.config/ paths as dangerous', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');

      expect(dangerousPath.isDangerousPath('~/.config/gh/hosts.yml')).toBe(true);
      expect(dangerousPath.isDangerousPath('~/.config/gcloud/credentials.json')).toBe(true);
    });

    it('should NOT flag regular project files as dangerous', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');

      expect(dangerousPath.isDangerousPath('src/index.ts')).toBe(false);
      expect(dangerousPath.isDangerousPath('README.md')).toBe(false);
      expect(dangerousPath.isDangerousPath('package.json')).toBe(false);
      expect(dangerousPath.isDangerousPath('tests/my.test.ts')).toBe(false);
    });

    it('should export getPathCategory function to classify dangerous paths', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');
      expect(dangerousPath.getPathCategory).toBeDefined();
      expect(typeof dangerousPath.getPathCategory).toBe('function');
    });

    it('should categorize paths correctly', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');

      expect(dangerousPath.getPathCategory('.env')).toBe('secrets');
      expect(dangerousPath.getPathCategory('~/.ssh/id_rsa')).toBe('secrets');
      expect(dangerousPath.getPathCategory('~/.aws/credentials')).toBe('secrets');
      expect(dangerousPath.getPathCategory('.git/config')).toBe('git');
      expect(dangerousPath.getPathCategory('node_modules/lodash')).toBe('dependencies');
      expect(dangerousPath.getPathCategory('package-lock.json')).toBe('dependencies');
      expect(dangerousPath.getPathCategory('/etc/passwd')).toBe('system');
      expect(dangerousPath.getPathCategory('/usr/bin/node')).toBe('system');
    });

    it('should have settings-store exports for dangerous path gate', async () => {
      const settingsStore = await import('../src/settings-store.js');

      expect(settingsStore.getDangerousPathGate).toBeDefined();
      expect(typeof settingsStore.getDangerousPathGate).toBe('function');

      expect(settingsStore.setDangerousPathGate).toBeDefined();
      expect(typeof settingsStore.setDangerousPathGate).toBe('function');
    });

    it('should default dangerous path gate to true (enabled by default for safety)', async () => {
      const settingsStore = await import('../src/settings-store.js');
      // Unlike bash approval (opt-in), path protection should be on by default
      const isEnabled = settingsStore.getDangerousPathGate();
      expect(isEnabled).toBe(true);
    });

    it('should persist dangerous path gate setting', async () => {
      const settingsStore = await import('../src/settings-store.js');

      // Toggle off
      settingsStore.setDangerousPathGate(false);
      expect(settingsStore.getDangerousPathGate()).toBe(false);

      // Toggle back on
      settingsStore.setDangerousPathGate(true);
      expect(settingsStore.getDangerousPathGate()).toBe(true);
    });

  });

  // ==========================================================================
  // AC2: Write/Edit to sensitive paths triggers warning
  // ==========================================================================
  describe('AC2: Write/Edit to sensitive paths triggers warning', () => {

    it('should export interceptDangerousPath function', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');
      expect(dangerousPath.interceptDangerousPath).toBeDefined();
      expect(typeof dangerousPath.interceptDangerousPath).toBe('function');
    });

    it('should detect Write to .env as dangerous', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');

      const message = createWriteToolUse('.env', 'SECRET=value');
      const result = dangerousPath.interceptDangerousPath(message);

      expect(result.shouldApprove).toBe(true);
      expect(result.path).toBe('.env');
      expect(result.category).toBe('secrets');
    });

    it('should detect Edit to .git/config as dangerous', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');

      const message = createEditToolUse('.git/config');
      const result = dangerousPath.interceptDangerousPath(message);

      expect(result.shouldApprove).toBe(true);
      expect(result.path).toBe('.git/config');
      expect(result.category).toBe('git');
    });

    it('should detect Write to node_modules as dangerous', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');

      const message = createWriteToolUse('node_modules/lodash/custom.js', '// hack');
      const result = dangerousPath.interceptDangerousPath(message);

      expect(result.shouldApprove).toBe(true);
      expect(result.path).toBe('node_modules/lodash/custom.js');
      expect(result.category).toBe('dependencies');
    });

    it('should detect Edit to ~/.ssh/config as dangerous', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');

      const message = createEditToolUse('~/.ssh/config');
      const result = dangerousPath.interceptDangerousPath(message);

      expect(result.shouldApprove).toBe(true);
      expect(result.path).toBe('~/.ssh/config');
      expect(result.category).toBe('secrets');
    });

    it('should detect Write to /etc/hosts as dangerous', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');

      const message = createWriteToolUse('/etc/hosts', '127.0.0.1 evil.com');
      const result = dangerousPath.interceptDangerousPath(message);

      expect(result.shouldApprove).toBe(true);
      expect(result.path).toBe('/etc/hosts');
      expect(result.category).toBe('system');
    });

    it('should NOT flag Write to regular project file', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');

      const message = createWriteToolUse('src/index.ts', 'console.log("hello")');
      const result = dangerousPath.interceptDangerousPath(message);

      expect(result.shouldApprove).toBe(false);
    });

    it('should NOT flag Edit to README.md', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');

      const message = createEditToolUse('README.md');
      const result = dangerousPath.interceptDangerousPath(message);

      expect(result.shouldApprove).toBe(false);
    });

    it('should NOT flag Read tool for any path (read-only)', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');

      const message = createReadToolUse('.env');
      const result = dangerousPath.interceptDangerousPath(message);

      expect(result.shouldApprove).toBe(false);
    });

    it('should handle paths with ./ prefix', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');

      const message = createWriteToolUse('./node_modules/pkg/file.js');
      const result = dangerousPath.interceptDangerousPath(message);

      expect(result.shouldApprove).toBe(true);
      expect(result.category).toBe('dependencies');
    });

    it('should handle absolute paths', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');

      const message = createWriteToolUse('/home/user/project/.env');
      const result = dangerousPath.interceptDangerousPath(message);

      expect(result.shouldApprove).toBe(true);
      expect(result.category).toBe('secrets');
    });

    it('should NOT trigger when gate is disabled', async () => {
      const settingsStore = await import('../src/settings-store.js');
      const dangerousPath = await import('../src/dangerous-path.js');

      // Disable gate
      settingsStore.setDangerousPathGate(false);

      const message = createWriteToolUse('.env', 'SECRET=value');
      const result = dangerousPath.interceptDangerousPath(message);

      expect(result.shouldApprove).toBe(false);

      // Cleanup - re-enable
      settingsStore.setDangerousPathGate(true);
    });

  });

  // ==========================================================================
  // AC3: Bash commands with redirects to sensitive paths detected
  // ==========================================================================
  describe('AC3: Bash commands with redirects to sensitive paths detected', () => {

    it('should export extractBashTargetPaths function', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');
      expect(dangerousPath.extractBashTargetPaths).toBeDefined();
      expect(typeof dangerousPath.extractBashTargetPaths).toBe('function');
    });

    it('should extract paths from simple redirect (>)', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');

      const paths = dangerousPath.extractBashTargetPaths('echo "secret" > .env');
      expect(paths).toContain('.env');
    });

    it('should extract paths from append redirect (>>)', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');

      const paths = dangerousPath.extractBashTargetPaths('echo "more" >> .env.local');
      expect(paths).toContain('.env.local');
    });

    it('should extract paths from tee command', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');

      const paths = dangerousPath.extractBashTargetPaths('cat secrets | tee ~/.ssh/config');
      expect(paths).toContain('~/.ssh/config');
    });

    it('should extract paths from tee -a (append mode)', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');

      const paths = dangerousPath.extractBashTargetPaths('echo "host" | tee -a ~/.ssh/known_hosts');
      expect(paths).toContain('~/.ssh/known_hosts');
    });

    it('should extract multiple paths from complex command', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');

      const paths = dangerousPath.extractBashTargetPaths('cat file > .env && echo more >> .env.local');
      expect(paths).toContain('.env');
      expect(paths).toContain('.env.local');
    });

    it('should NOT extract paths from safe redirects', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');

      const paths = dangerousPath.extractBashTargetPaths('echo "hello" > output.txt');
      expect(paths).toContain('output.txt');

      // But the path itself is not dangerous
      expect(dangerousPath.isDangerousPath('output.txt')).toBe(false);
    });

    it('should detect Bash with redirect to .env as dangerous', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');

      const message = createBashToolUse('echo "API_KEY=secret" > .env');
      const result = dangerousPath.interceptDangerousPath(message);

      expect(result.shouldApprove).toBe(true);
      expect(result.path).toBe('.env');
      expect(result.category).toBe('secrets');
    });

    it('should detect Bash with redirect to ~/.ssh/ as dangerous', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');

      const message = createBashToolUse('cat key > ~/.ssh/id_rsa');
      const result = dangerousPath.interceptDangerousPath(message);

      expect(result.shouldApprove).toBe(true);
      expect(result.path).toBe('~/.ssh/id_rsa');
      expect(result.category).toBe('secrets');
    });

    it('should detect Bash with tee to system path as dangerous', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');

      const message = createBashToolUse('echo "evil" | sudo tee /etc/hosts');
      const result = dangerousPath.interceptDangerousPath(message);

      expect(result.shouldApprove).toBe(true);
      expect(result.path).toBe('/etc/hosts');
      expect(result.category).toBe('system');
    });

    it('should NOT flag Bash with redirect to safe path', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');

      const message = createBashToolUse('npm test > test-output.log');
      const result = dangerousPath.interceptDangerousPath(message);

      expect(result.shouldApprove).toBe(false);
    });

    it('should NOT flag Bash without redirects even with dangerous paths in command', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');

      // Reading .env is fine - we only care about writes
      const message = createBashToolUse('cat .env | grep API_KEY');
      const result = dangerousPath.interceptDangerousPath(message);

      expect(result.shouldApprove).toBe(false);
    });

    it('should handle paths with spaces in quotes', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');

      const paths = dangerousPath.extractBashTargetPaths('echo "x" > "node_modules/my package/file.js"');
      expect(paths.some(p => p.includes('node_modules'))).toBe(true);
    });

    it('should detect first dangerous path when multiple redirects exist', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');

      const message = createBashToolUse('echo a > safe.txt && echo b > .env');
      const result = dangerousPath.interceptDangerousPath(message);

      // Should flag the .env, even though safe.txt is first
      expect(result.shouldApprove).toBe(true);
      expect(result.path).toBe('.env');
    });

  });

  // ==========================================================================
  // AC4: User can approve or reject
  // ==========================================================================
  describe('AC4: User can approve or reject', () => {

    it('should have dangerous-path-modal container element in HTML', () => {
      const modal = document.querySelector('#dangerous-path-modal, .dangerous-path-modal');
      expect(modal).not.toBeNull();
    });

    it('should have modal hidden by default', () => {
      const modal = document.querySelector('#dangerous-path-modal, .dangerous-path-modal');
      const isHidden = modal?.classList.contains('hidden') ||
                       modal?.getAttribute('aria-hidden') === 'true' ||
                       modal?.hasAttribute('hidden');
      expect(isHidden).toBe(true);
    });

    it('should include DangerousPathModal.js script in HTML', () => {
      expect(html).toContain('DangerousPathModal.js');
    });

    it('should export showDangerousPathModal function', async () => {
      const pathModal = await import('../src/public/js/components/DangerousPathModal.js');
      expect(pathModal.showDangerousPathModal).toBeDefined();
      expect(typeof pathModal.showDangerousPathModal).toBe('function');
    });

    it('should export hideDangerousPathModal function', async () => {
      const pathModal = await import('../src/public/js/components/DangerousPathModal.js');
      expect(pathModal.hideDangerousPathModal).toBeDefined();
      expect(typeof pathModal.hideDangerousPathModal).toBe('function');
    });

    it('should have path:approval-request IPC channel for main → renderer', async () => {
      const preload = await import('../src/preload.js');
      expect(preload.electronAPI?.path?.onApprovalRequest).toBeDefined();
      expect(typeof preload.electronAPI?.path?.onApprovalRequest).toBe('function');
    });

    it('should have path:approval-response IPC channel for renderer → main', async () => {
      const preload = await import('../src/preload.js');
      expect(preload.electronAPI?.path?.sendApprovalResponse).toBeDefined();
      expect(typeof preload.electronAPI?.path?.sendApprovalResponse).toBe('function');
    });

    it('should show modal when path:approval-request received', async () => {
      const pathModal = await import('../src/public/js/components/DangerousPathModal.js');

      const path = '.env';
      const toolId = 'test-path-1';
      const category = 'secrets';

      pathModal.showDangerousPathModal(path, toolId, category);

      expect(pathModal.isModalVisible()).toBe(true);

      // Cleanup
      pathModal.hideDangerousPathModal();
    });

    it('should display path and category in modal', async () => {
      const pathModal = await import('../src/public/js/components/DangerousPathModal.js');

      pathModal.showDangerousPathModal('~/.ssh/id_rsa', 'tool-display', 'secrets');

      const displayedPath = pathModal.getDisplayedPath();
      expect(displayedPath).toContain('.ssh');
      expect(displayedPath).toContain('id_rsa');

      const displayedCategory = pathModal.getDisplayedCategory();
      expect(displayedCategory).toBe('secrets');

      pathModal.hideDangerousPathModal();
    });

    it('should have approve button in modal', () => {
      const approveBtn = document.querySelector(
        '#dangerous-path-modal .approve-btn, ' +
        '.dangerous-path-modal .approve-btn, ' +
        '#dangerous-path-modal [data-action="approve"]'
      );
      expect(approveBtn).not.toBeNull();
    });

    it('should have reject button in modal', () => {
      const rejectBtn = document.querySelector(
        '#dangerous-path-modal .reject-btn, ' +
        '.dangerous-path-modal .reject-btn, ' +
        '#dangerous-path-modal [data-action="reject"]'
      );
      expect(rejectBtn).not.toBeNull();
    });

    it('should have always-allow button in modal', () => {
      const alwaysAllowBtn = document.querySelector(
        '#dangerous-path-modal .always-allow-btn, ' +
        '.dangerous-path-modal .always-allow-btn, ' +
        '#dangerous-path-modal [data-action="always-allow"]'
      );
      expect(alwaysAllowBtn).not.toBeNull();
    });

    it('should export handleApprove function', async () => {
      const pathModal = await import('../src/public/js/components/DangerousPathModal.js');
      expect(pathModal.handleApprove).toBeDefined();
      expect(typeof pathModal.handleApprove).toBe('function');
    });

    it('should export handleReject function', async () => {
      const pathModal = await import('../src/public/js/components/DangerousPathModal.js');
      expect(pathModal.handleReject).toBeDefined();
      expect(typeof pathModal.handleReject).toBe('function');
    });

    it('should export handleAlwaysAllow function', async () => {
      const pathModal = await import('../src/public/js/components/DangerousPathModal.js');
      expect(pathModal.handleAlwaysAllow).toBeDefined();
      expect(typeof pathModal.handleAlwaysAllow).toBe('function');
    });

    it('should hide modal and send approved response when approve clicked', async () => {
      const pathModal = await import('../src/public/js/components/DangerousPathModal.js');

      const mockSendResponse = vi.fn();
      pathModal.setResponseCallback(mockSendResponse);

      const toolId = 'test-approve-path';
      pathModal.showDangerousPathModal('.env', toolId, 'secrets');
      pathModal.handleApprove();

      expect(pathModal.isModalVisible()).toBe(false);
      expect(mockSendResponse).toHaveBeenCalledWith({
        toolId: toolId,
        approved: true,
        alwaysAllow: false,
      });
    });

    it('should hide modal and send rejected response when reject clicked', async () => {
      const pathModal = await import('../src/public/js/components/DangerousPathModal.js');

      const mockSendResponse = vi.fn();
      pathModal.setResponseCallback(mockSendResponse);

      const toolId = 'test-reject-path';
      pathModal.showDangerousPathModal('.git/config', toolId, 'git');
      pathModal.handleReject();

      expect(pathModal.isModalVisible()).toBe(false);
      expect(mockSendResponse).toHaveBeenCalledWith({
        toolId: toolId,
        approved: false,
        alwaysAllow: false,
      });
    });

    it('should have keyboard shortcut Enter to approve', async () => {
      const pathModal = await import('../src/public/js/components/DangerousPathModal.js');

      const shortcuts = pathModal.getKeyboardShortcuts();
      expect(shortcuts.approve).toBe('Enter');
    });

    it('should have keyboard shortcut Escape to reject', async () => {
      const pathModal = await import('../src/public/js/components/DangerousPathModal.js');

      const shortcuts = pathModal.getKeyboardShortcuts();
      expect(shortcuts.reject).toBe('Escape');
    });

    it('should export requestPathApproval from dangerous-path module', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');
      expect(dangerousPath.requestPathApproval).toBeDefined();
      expect(typeof dangerousPath.requestPathApproval).toBe('function');
    });

    it('should export resolvePathApproval from dangerous-path module', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');
      expect(dangerousPath.resolvePathApproval).toBeDefined();
      expect(typeof dangerousPath.resolvePathApproval).toBe('function');
    });

    it('should return promise from requestPathApproval', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');

      const path = '.env';
      const toolId = 'test-promise-path';
      const category = 'secrets';

      const result = dangerousPath.requestPathApproval(path, toolId, category);
      expect(result).toBeInstanceOf(Promise);

      // Resolve for testing
      dangerousPath.resolvePathApproval(toolId, true);
      await expect(result).resolves.toBe(true);
    });

    it('should export createPathRejectionError for rejected paths', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');
      expect(dangerousPath.createPathRejectionError).toBeDefined();

      const toolId = 'test-rejection';
      const path = '.env';
      const error = dangerousPath.createPathRejectionError(toolId, path);

      expect(error.type).toBe('tool_result');
      expect(error.tool_id).toBe(toolId);
      expect(error.is_error).toBe(true);
      expect(error.output).toMatch(/rejected|denied|dangerous|sensitive/i);
    });

  });

  // ==========================================================================
  // AC5: Allowlist persists for session
  // ==========================================================================
  describe('AC5: Allowlist persists for session', () => {

    beforeEach(async () => {
      vi.resetModules();
    });

    it('should export getPathAllowlist from settings-store', async () => {
      const settingsStore = await import('../src/settings-store.js');
      expect(settingsStore.getPathAllowlist).toBeDefined();
      expect(typeof settingsStore.getPathAllowlist).toBe('function');
    });

    it('should export addToPathAllowlist from settings-store', async () => {
      const settingsStore = await import('../src/settings-store.js');
      expect(settingsStore.addToPathAllowlist).toBeDefined();
      expect(typeof settingsStore.addToPathAllowlist).toBe('function');
    });

    it('should export isPathAllowlisted from settings-store', async () => {
      const settingsStore = await import('../src/settings-store.js');
      expect(settingsStore.isPathAllowlisted).toBeDefined();
      expect(typeof settingsStore.isPathAllowlisted).toBe('function');
    });

    it('should export clearPathAllowlist from settings-store', async () => {
      const settingsStore = await import('../src/settings-store.js');
      expect(settingsStore.clearPathAllowlist).toBeDefined();
      expect(typeof settingsStore.clearPathAllowlist).toBe('function');
    });

    it('should add path to allowlist on always-allow', async () => {
      const settingsStore = await import('../src/settings-store.js');

      settingsStore.clearPathAllowlist();
      settingsStore.addToPathAllowlist('.env');

      const allowlist = settingsStore.getPathAllowlist();
      expect(allowlist).toContain('.env');
    });

    it('should match exact paths in allowlist', async () => {
      const settingsStore = await import('../src/settings-store.js');

      settingsStore.clearPathAllowlist();
      settingsStore.addToPathAllowlist('.env');

      expect(settingsStore.isPathAllowlisted('.env')).toBe(true);
      expect(settingsStore.isPathAllowlisted('.env.local')).toBe(false);
    });

    it('should support glob patterns in path allowlist', async () => {
      const settingsStore = await import('../src/settings-store.js');

      settingsStore.clearPathAllowlist();
      settingsStore.addToPathAllowlist('.env*');

      expect(settingsStore.isPathAllowlisted('.env')).toBe(true);
      expect(settingsStore.isPathAllowlisted('.env.local')).toBe(true);
      expect(settingsStore.isPathAllowlisted('.env.production')).toBe(true);
    });

    it('should support directory patterns in allowlist', async () => {
      const settingsStore = await import('../src/settings-store.js');

      settingsStore.clearPathAllowlist();
      settingsStore.addToPathAllowlist('node_modules/*');

      expect(settingsStore.isPathAllowlisted('node_modules/lodash')).toBe(true);
      expect(settingsStore.isPathAllowlisted('node_modules/react/index.js')).toBe(true);
    });

    it('should skip approval for allowlisted paths', async () => {
      const settingsStore = await import('../src/settings-store.js');
      const dangerousPath = await import('../src/dangerous-path.js');

      // Enable gate and add .env to allowlist
      settingsStore.setDangerousPathGate(true);
      settingsStore.clearPathAllowlist();
      settingsStore.addToPathAllowlist('.env');

      // .env should not require approval since it's allowlisted
      const message = createWriteToolUse('.env', 'content');
      const result = dangerousPath.interceptDangerousPath(message);

      expect(result.shouldApprove).toBe(false);

      // But .env.local (not allowlisted) should still require approval
      const otherMessage = createWriteToolUse('.env.local', 'content');
      const otherResult = dangerousPath.interceptDangerousPath(otherMessage);

      expect(otherResult.shouldApprove).toBe(true);

      // Cleanup
      settingsStore.clearPathAllowlist();
    });

    it('should return alwaysAllow: true in response when always-allow clicked', async () => {
      const pathModal = await import('../src/public/js/components/DangerousPathModal.js');

      const mockSendResponse = vi.fn();
      pathModal.setResponseCallback(mockSendResponse);

      const toolId = 'test-always-path';
      pathModal.showDangerousPathModal('.env', toolId, 'secrets');
      pathModal.handleAlwaysAllow();

      expect(mockSendResponse).toHaveBeenCalledWith({
        toolId: toolId,
        approved: true,
        alwaysAllow: true,
      });
    });

    it('should add to allowlist when resolvePathApproval called with alwaysAllow=true', async () => {
      const settingsStore = await import('../src/settings-store.js');
      const dangerousPath = await import('../src/dangerous-path.js');

      settingsStore.clearPathAllowlist();

      // Start approval request
      const toolId = 'test-always-resolve';
      dangerousPath.requestPathApproval('.git/config', toolId, 'git');

      // Resolve with alwaysAllow
      dangerousPath.resolvePathApproval(toolId, true, true);

      // Path should now be in allowlist
      expect(settingsStore.isPathAllowlisted('.git/config')).toBe(true);

      // Cleanup
      settingsStore.clearPathAllowlist();
    });

    it('should persist allowlist across multiple checks in same session', async () => {
      const settingsStore = await import('../src/settings-store.js');
      const dangerousPath = await import('../src/dangerous-path.js');

      settingsStore.setDangerousPathGate(true);
      settingsStore.clearPathAllowlist();

      // First time: should require approval
      const firstMsg = createWriteToolUse('.env');
      const firstResult = dangerousPath.interceptDangerousPath(firstMsg);
      expect(firstResult.shouldApprove).toBe(true);

      // User clicks "Always Allow"
      settingsStore.addToPathAllowlist('.env');

      // Second time: should NOT require approval
      const secondMsg = createWriteToolUse('.env');
      const secondResult = dangerousPath.interceptDangerousPath(secondMsg);
      expect(secondResult.shouldApprove).toBe(false);

      // Cleanup
      settingsStore.clearPathAllowlist();
    });

  });

  // ==========================================================================
  // Modal CSS Styling
  // ==========================================================================
  describe('Modal CSS Styling', () => {

    it('should have CSS for #dangerous-path-modal container', () => {
      expect(css).toMatch(/#dangerous-path-modal|\.dangerous-path-modal/);
    });

    it('should have modal overlay/backdrop styling', () => {
      expect(css).toMatch(/\.modal-overlay|\.modal-backdrop|#dangerous-path-modal[^}]*(position:\s*fixed)/);
    });

    it('should have CSS for path-display element', () => {
      expect(css).toMatch(/\.path-display/);
    });

    it('should have CSS for category indicator', () => {
      expect(css).toMatch(/\.category-indicator|\.path-category/);
    });

    it('should have danger styling for secrets category', () => {
      expect(css).toMatch(/\.(secrets|danger)[^}]*(color|background)/);
    });

    it('should have caution styling for dependencies category', () => {
      expect(css).toMatch(/\.(dependencies|caution|warning)[^}]*(color|background)/);
    });

    it('should have z-index to appear above all other content', () => {
      expect(css).toMatch(/#dangerous-path-modal[^}]*z-index:\s*\d{3,}/);
    });

  });

  // ==========================================================================
  // Integration: Main Process Path Gate
  // ==========================================================================
  describe('Integration: Main Process Path Gate', () => {

    it('should export dangerous-path module functions for main process', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');

      expect(dangerousPath.interceptDangerousPath).toBeDefined();
      expect(dangerousPath.requestPathApproval).toBeDefined();
      expect(dangerousPath.resolvePathApproval).toBeDefined();
      expect(dangerousPath.createPathRejectionError).toBeDefined();
    });

    it('should queue multiple path approval requests', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');
      expect(dangerousPath.getPathQueueLength).toBeDefined();

      // Start multiple approval requests
      dangerousPath.requestPathApproval('.env', 'tool-1', 'secrets');
      dangerousPath.requestPathApproval('.git/config', 'tool-2', 'git');

      expect(dangerousPath.getPathQueueLength()).toBeGreaterThanOrEqual(2);

      // Cleanup
      dangerousPath.resolvePathApproval('tool-1', true);
      dangerousPath.resolvePathApproval('tool-2', true);
    });

    it('should expose path approval toggle via IPC channel', async () => {
      const preload = await import('../src/preload.js');
      expect(preload.electronAPI?.settings?.getDangerousPathGate).toBeDefined();
      expect(preload.electronAPI?.settings?.setDangerousPathGate).toBeDefined();
    });

  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================
  describe('Edge Cases', () => {

    it('should handle empty file_path gracefully', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');

      const message = createWriteToolUse('', 'content');
      const result = dangerousPath.interceptDangerousPath(message);

      expect(result.shouldApprove).toBe(false);
    });

    it('should handle undefined file_path gracefully', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');

      const message = {
        type: 'tool_use' as const,
        tool_name: 'Write',
        tool_id: 'test-undefined',
        input: {},
      };
      const result = dangerousPath.interceptDangerousPath(message);

      expect(result.shouldApprove).toBe(false);
    });

    it('should handle paths with special characters', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');

      // Path with spaces
      expect(dangerousPath.isDangerousPath('node_modules/my package/file.js')).toBe(true);

      // Path with unicode
      expect(dangerousPath.isDangerousPath('.env.日本語')).toBe(true);
    });

    it('should normalize Windows-style paths', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');

      // Windows path with backslashes
      expect(dangerousPath.isDangerousPath('node_modules\\lodash\\index.js')).toBe(true);
    });

    it('should detect symlink paths that resolve to dangerous locations', async () => {
      // This is a design decision - symlinks could be checked but may be expensive
      // For MVP, literal path matching is acceptable
      const dangerousPath = await import('../src/dangerous-path.js');

      // If symlink checking is implemented:
      expect(dangerousPath.normalizePath).toBeDefined();
    });

    it('should handle very long paths', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');

      const longPath = 'node_modules/' + 'a'.repeat(1000) + '/file.js';
      expect(dangerousPath.isDangerousPath(longPath)).toBe(true);
    });

    it('should handle case sensitivity correctly', async () => {
      const dangerousPath = await import('../src/dangerous-path.js');

      // On case-insensitive filesystems (macOS/Windows), .ENV should match
      // On case-sensitive (Linux), it might not - implementation choice
      // For safety, recommend case-insensitive matching
      expect(dangerousPath.isDangerousPath('.ENV')).toBe(true);
      expect(dangerousPath.isDangerousPath('NODE_MODULES/pkg')).toBe(true);
    });

  });

});
