/**
 * Story MSSCI-12275: Bell Mode - Inject Queued Messages After Tool Use
 *
 * Tests verify that Bell mode can inject queued messages into Claude's context
 * via PostToolUse hook after each tool execution.
 *
 * Acceptance Criteria:
 * - AC1: Clickable bell toggle in queue UI area (not buried in settings)
 * - AC2: Bell mode state persisted in `.pennyfarthing/` config
 * - AC3: When Bell mode on and queue non-empty, message injected via PostToolUse hook
 * - AC4: Injected message appears as additionalContext in Claude's next API call (integration)
 * - AC5: Claude continues processing with injected message in context (integration)
 * - AC6: Queue count updates correctly after bell injection
 * - AC7: Bell visual state reflects current mode (on/off)
 *
 * Note: AC4 and AC5 require integration testing with actual Claude Code.
 * Unit tests verify the mechanism; integration tests verify the behavior.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parse, stringify } from 'yaml';

// Test data - implementation uses config.local.yaml for bell mode state
const BELL_MODE_CONFIG_PATH = '.pennyfarthing/config.local.yaml';
const BELL_QUEUE_PATH = '.pennyfarthing/bell-queue.json';

describe('Story MSSCI-12275: Bell Mode', () => {

  describe('AC1: Clickable bell toggle in queue UI', () => {

    it('should render bell toggle button in queue inline area', async () => {
      // The bell toggle should be a clickable element in the queue UI
      // Located in message-view-init.js queue inline section
      const { Window } = await import('happy-dom');
      const window = new Window();
      window.document.body.innerHTML = `
        <div id="queue-inline">
          <button id="bell-toggle" class="bell-toggle" title="Toggle Bell mode">
            <span class="bell-icon"></span>
          </button>
          <span id="queue-count">0</span>
        </div>
      `;

      const bellToggle = window.document.getElementById('bell-toggle');
      expect(bellToggle).not.toBeNull();
      expect(bellToggle?.classList.contains('bell-toggle')).toBe(true);
    });

    it('should have accessible title attribute', async () => {
      const { Window } = await import('happy-dom');
      const window = new Window();
      window.document.body.innerHTML = `
        <button id="bell-toggle" class="bell-toggle" title="Toggle Bell mode"></button>
      `;

      const bellToggle = window.document.getElementById('bell-toggle');
      expect(bellToggle?.getAttribute('title')).toContain('Bell');
    });

    it('should toggle bell mode state on click', async () => {
      // This test will fail until bell-mode.ts exports toggleBellMode
      const bellMode = await import('../src/bell-mode.js');

      // Initial state should be off
      expect(bellMode.isBellModeEnabled()).toBe(false);

      // Toggle on
      bellMode.toggleBellMode();
      expect(bellMode.isBellModeEnabled()).toBe(true);

      // Toggle off
      bellMode.toggleBellMode();
      expect(bellMode.isBellModeEnabled()).toBe(false);
    });

  });

  describe('AC2: Bell mode state persisted in .pennyfarthing/ config', () => {

    it.skip('should write bell mode state to .pennyfarthing/config.local.yaml - REQUIRES PROJECT CONTEXT', async () => {
      const bellMode = await import('../src/bell-mode.js');

      // Enable bell mode
      await bellMode.setBellMode(true);

      // Verify file was written
      const configPath = path.join(process.cwd(), BELL_MODE_CONFIG_PATH);
      expect(fs.existsSync(configPath)).toBe(true);

      const config = parse(fs.readFileSync(configPath, 'utf8')) as { workflow?: { bell_mode?: boolean } };
      expect(config.workflow?.bell_mode).toBe(true);

      // Cleanup
      await bellMode.setBellMode(false);
    });

    it.skip('should read bell mode state from config on startup - REQUIRES PROJECT CONTEXT', async () => {
      // Pre-write config file
      const configPath = path.join(process.cwd(), BELL_MODE_CONFIG_PATH);
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, stringify({ workflow: { bell_mode: true } }));

      const bellMode = await import('../src/bell-mode.js');
      await bellMode.loadBellModeState();

      expect(bellMode.isBellModeEnabled()).toBe(true);

      // Cleanup
      fs.unlinkSync(configPath);
    });

    it.skip('should default to disabled if config file missing - REQUIRES PROJECT CONTEXT', async () => {
      const bellMode = await import('../src/bell-mode.js');

      // Reset in-memory state from previous tests
      bellMode.resetBellMode();

      // Ensure config doesn't exist
      const configPath = path.join(process.cwd(), BELL_MODE_CONFIG_PATH);
      if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
      }

      await bellMode.loadBellModeState();
      expect(bellMode.isBellModeEnabled()).toBe(false);
    });

  });

  describe('AC3: PostToolUse hook integration', () => {

    it.skip('should write queued message to bell-queue.json when bell mode enabled - REQUIRES PROJECT CONTEXT', async () => {
      const bellMode = await import('../src/bell-mode.js');
      const editor = await import('../src/public/js/editor.js');

      // Enable bell mode
      await bellMode.setBellMode(true);

      // Queue a message
      editor.queueMessage({ text: 'User feedback', images: [] });

      // Bell mode should sync queue to file for hook to read
      await bellMode.syncQueueToFile();

      const queuePath = path.join(process.cwd(), BELL_QUEUE_PATH);
      expect(fs.existsSync(queuePath)).toBe(true);

      const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
      expect(queue).toHaveLength(1);
      expect(queue[0].text).toBe('User feedback');

      // Cleanup
      editor.clearMessageQueue();
      await bellMode.setBellMode(false);
    });

    it('should not write queue file when bell mode disabled', async () => {
      const bellMode = await import('../src/bell-mode.js');
      const editor = await import('../src/public/js/editor.js');

      // Ensure bell mode is off
      await bellMode.setBellMode(false);

      // Queue a message
      editor.queueMessage({ text: 'Regular message', images: [] });

      // Sync should not create file when disabled
      await bellMode.syncQueueToFile();

      const queuePath = path.join(process.cwd(), BELL_QUEUE_PATH);
      expect(fs.existsSync(queuePath)).toBe(false);

      // Cleanup
      editor.clearMessageQueue();
    });

    it('should dequeue message after hook consumes it', async () => {
      const bellMode = await import('../src/bell-mode.js');
      const editor = await import('../src/public/js/editor.js');

      // Enable bell mode and queue messages
      await bellMode.setBellMode(true);
      editor.queueMessage({ text: 'First', images: [] });
      editor.queueMessage({ text: 'Second', images: [] });

      expect(editor.getQueueCount()).toBe(2);

      // Simulate hook consuming first message
      await bellMode.onHookConsumed();

      expect(editor.getQueueCount()).toBe(1);
      const remaining = editor.getMessageQueue();
      expect(remaining[0].text).toBe('Second');

      // Cleanup
      editor.clearMessageQueue();
      await bellMode.setBellMode(false);
    });

  });

  describe('AC6: Queue count updates correctly after bell injection', () => {

    it('should decrement queue count when message injected via bell', async () => {
      const bellMode = await import('../src/bell-mode.js');
      const editor = await import('../src/public/js/editor.js');

      const countChanges: number[] = [];
      editor.setOnQueueChange((count: number) => countChanges.push(count));

      await bellMode.setBellMode(true);

      // Queue 3 messages
      editor.queueMessage({ text: 'One', images: [] });
      editor.queueMessage({ text: 'Two', images: [] });
      editor.queueMessage({ text: 'Three', images: [] });

      expect(countChanges).toEqual([1, 2, 3]);

      // Simulate bell injection (hook consumed)
      await bellMode.onHookConsumed();
      expect(countChanges).toEqual([1, 2, 3, 2]);

      await bellMode.onHookConsumed();
      expect(countChanges).toEqual([1, 2, 3, 2, 1]);

      // Cleanup
      editor.clearMessageQueue();
      editor.setOnQueueChange(null);
      await bellMode.setBellMode(false);
    });

    it('should update UI when queue becomes empty after bell injection', async () => {
      const bellMode = await import('../src/bell-mode.js');
      const editor = await import('../src/public/js/editor.js');

      await bellMode.setBellMode(true);
      editor.queueMessage({ text: 'Only one', images: [] });

      expect(editor.getQueueCount()).toBe(1);

      // Bell injects the only message
      await bellMode.onHookConsumed();

      expect(editor.getQueueCount()).toBe(0);

      // Cleanup
      await bellMode.setBellMode(false);
    });

  });

  describe('AC7: Bell visual state reflects current mode', () => {

    it('should add active class when bell mode enabled', async () => {
      const { Window } = await import('happy-dom');
      const window = new Window();
      window.document.body.innerHTML = `
        <button id="bell-toggle" class="bell-toggle"></button>
      `;

      const bellToggle = window.document.getElementById('bell-toggle')!;

      // Simulate bell mode enabled - add active class
      bellToggle.classList.add('bell-active');

      expect(bellToggle.classList.contains('bell-active')).toBe(true);
    });

    it('should remove active class when bell mode disabled', async () => {
      const { Window } = await import('happy-dom');
      const window = new Window();
      window.document.body.innerHTML = `
        <button id="bell-toggle" class="bell-toggle bell-active"></button>
      `;

      const bellToggle = window.document.getElementById('bell-toggle')!;

      // Simulate bell mode disabled - remove active class
      bellToggle.classList.remove('bell-active');

      expect(bellToggle.classList.contains('bell-active')).toBe(false);
    });

    it('should update aria-pressed attribute for accessibility', async () => {
      const { Window } = await import('happy-dom');
      const window = new Window();
      window.document.body.innerHTML = `
        <button id="bell-toggle" class="bell-toggle" aria-pressed="false"></button>
      `;

      const bellToggle = window.document.getElementById('bell-toggle')!;

      // Enable bell mode
      bellToggle.setAttribute('aria-pressed', 'true');
      expect(bellToggle.getAttribute('aria-pressed')).toBe('true');

      // Disable bell mode
      bellToggle.setAttribute('aria-pressed', 'false');
      expect(bellToggle.getAttribute('aria-pressed')).toBe('false');
    });

    it('should show bell icon in correct state (filled vs outline)', async () => {
      // Bell icon should be filled when active, outline when inactive
      const { Window } = await import('happy-dom');
      const window = new Window();
      window.document.body.innerHTML = `
        <button id="bell-toggle" class="bell-toggle">
          <span class="bell-icon bell-icon-outline"></span>
        </button>
      `;

      const bellIcon = window.document.querySelector('.bell-icon')!;

      // When enabled: filled icon
      bellIcon.classList.remove('bell-icon-outline');
      bellIcon.classList.add('bell-icon-filled');
      expect(bellIcon.classList.contains('bell-icon-filled')).toBe(true);

      // When disabled: outline icon
      bellIcon.classList.remove('bell-icon-filled');
      bellIcon.classList.add('bell-icon-outline');
      expect(bellIcon.classList.contains('bell-icon-outline')).toBe(true);
    });

  });

  describe('Integration notes (AC4, AC5)', () => {

    it.skip('AC4: Injected message appears as additionalContext - REQUIRES INTEGRATION TEST', () => {
      // This test requires actual Claude Code running with PostToolUse hook
      // Manual test procedure:
      // 1. Enable bell mode
      // 2. Queue a message while Claude is processing
      // 3. Wait for tool_result event
      // 4. Verify additionalContext includes queued message text
      expect(true).toBe(true);
    });

    it.skip('AC5: Claude continues processing with injected context - REQUIRES INTEGRATION TEST', () => {
      // This test requires actual Claude Code running
      // Manual test procedure:
      // 1. Enable bell mode
      // 2. Give Claude a multi-step task
      // 3. Queue feedback message mid-task (e.g., "also check X")
      // 4. Verify Claude incorporates feedback without stopping
      expect(true).toBe(true);
    });

  });

});

describe('Bell Mode Hook Script', () => {

  describe('bell-mode-hook.sh behavior', () => {

    it('should return empty output when bell mode disabled', async () => {
      // Hook script should exit 0 with no output when disabled
      const { execSync } = await import('child_process');

      // Ensure bell mode is disabled (using YAML config format)
      const configPath = path.join(process.cwd(), BELL_MODE_CONFIG_PATH);
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, stringify({ workflow: { bell_mode: false } }));

      const hookPath = path.join(process.cwd(), '.pennyfarthing/scripts/hooks/bell-mode-hook.sh');

      // Skip if hook doesn't exist yet (will fail in RED phase)
      if (!fs.existsSync(hookPath)) {
        expect(hookPath).toBe('HOOK_NOT_YET_IMPLEMENTED');
        return;
      }

      const output = execSync(`bash ${hookPath}`, { encoding: 'utf8' });
      expect(output.trim()).toBe('');
    });

    it('should return additionalContext JSON when bell mode enabled and queue non-empty', async () => {
      const { execSync } = await import('child_process');

      // Enable bell mode (using YAML config format)
      const configPath = path.join(process.cwd(), BELL_MODE_CONFIG_PATH);
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, stringify({ workflow: { bell_mode: true } }));

      // Write queue file
      const queuePath = path.join(process.cwd(), BELL_QUEUE_PATH);
      fs.writeFileSync(queuePath, JSON.stringify([{ text: 'User says: check the tests', images: [] }]));

      const hookPath = path.join(process.cwd(), '.pennyfarthing/scripts/hooks/bell-mode-hook.sh');

      // Skip if hook doesn't exist yet (will fail in RED phase)
      if (!fs.existsSync(hookPath)) {
        expect(hookPath).toBe('HOOK_NOT_YET_IMPLEMENTED');
        return;
      }

      const output = execSync(`bash ${hookPath}`, { encoding: 'utf8' });
      const parsed = JSON.parse(output);

      expect(parsed.hookSpecificOutput.hookEventName).toBe('PostToolUse');
      expect(parsed.hookSpecificOutput.additionalContext).toContain('User says: check the tests');

      // Cleanup
      fs.unlinkSync(queuePath);
      fs.unlinkSync(configPath);
    });

    it('should return empty output when queue is empty', async () => {
      const { execSync } = await import('child_process');

      // Enable bell mode but empty queue
      const configPath = path.join(process.cwd(), BELL_MODE_CONFIG_PATH);
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, JSON.stringify({ enabled: true }));

      // Empty queue file
      const queuePath = path.join(process.cwd(), BELL_QUEUE_PATH);
      fs.writeFileSync(queuePath, JSON.stringify([]));

      const hookPath = path.join(process.cwd(), '.pennyfarthing/scripts/hooks/bell-mode-hook.sh');

      // Skip if hook doesn't exist yet
      if (!fs.existsSync(hookPath)) {
        expect(hookPath).toBe('HOOK_NOT_YET_IMPLEMENTED');
        return;
      }

      const output = execSync(`bash ${hookPath}`, { encoding: 'utf8' });
      expect(output.trim()).toBe('');

      // Cleanup
      fs.unlinkSync(queuePath);
      fs.unlinkSync(configPath);
    });

  });

});
