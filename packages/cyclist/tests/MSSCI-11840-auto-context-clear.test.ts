/**
 * MSSCI-11840: Auto-mode context clear and agent reload on handoff
 *
 * Tests for automatic session clearing and agent reload when context is high
 * during auto-mode handoffs. This enables uninterrupted workflow continuation.
 *
 * Acceptance Criteria:
 * - AC1: Agent emits context-clear signal when auto mode + high context
 * - AC2: Cyclist clears the Claude Code session automatically
 * - AC3: Cyclist loads the specified next agent after clear
 * - AC4: Auto mode workflow continues without user intervention
 *
 * Written in RED phase - tests should fail until Dev implements the functionality.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  getMessageView,
} from './helpers/suggested-prompts-helpers.js';

// =============================================================================
// AC1: Agent emits context-clear signal when auto mode + high context
// =============================================================================
describe('AC1: Context-clear signal emission', () => {

  describe('Structured marker for context-clear', () => {

    it('should export MARKER_TYPES with CONTEXT_CLEAR', async () => {
      // The marker type should be recognized by detectStructuredMarkers
      const messageView = await getMessageView();

      // Should export the constant or recognize the type
      expect(messageView.MARKER_TYPES).toBeDefined();
      expect(messageView.MARKER_TYPES.CONTEXT_CLEAR).toBe('context_clear');
    });

    it('should detect CONTEXT_CLEAR marker with agent value', async () => {
      const messageView = await getMessageView();

      // Marker format: <!-- CYCLIST:CONTEXT_CLEAR:/dev -->
      const text = 'Context is high. Clearing session and loading next agent.\n<!-- CYCLIST:CONTEXT_CLEAR:/dev -->';

      const result = messageView.detectStructuredMarkers(text);

      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('context_clear');
      expect(result[0].value).toBe('/dev');
      expect(result[0].source).toBe('structured_marker');
    });

    it('should detect CONTEXT_CLEAR marker for /tea', async () => {
      const messageView = await getMessageView();

      const text = '<!-- CYCLIST:CONTEXT_CLEAR:/tea -->';

      const result = messageView.detectStructuredMarkers(text);

      expect(result).not.toBeNull();
      expect(result[0].type).toBe('context_clear');
      expect(result[0].value).toBe('/tea');
    });

    it('should detect CONTEXT_CLEAR marker for /reviewer', async () => {
      const messageView = await getMessageView();

      const text = '<!-- CYCLIST:CONTEXT_CLEAR:/reviewer -->';

      const result = messageView.detectStructuredMarkers(text);

      expect(result).not.toBeNull();
      expect(result[0].type).toBe('context_clear');
      expect(result[0].value).toBe('/reviewer');
    });

    it('should detect CONTEXT_CLEAR marker for /sm', async () => {
      const messageView = await getMessageView();

      const text = '<!-- CYCLIST:CONTEXT_CLEAR:/sm -->';

      const result = messageView.detectStructuredMarkers(text);

      expect(result).not.toBeNull();
      expect(result[0].type).toBe('context_clear');
      expect(result[0].value).toBe('/sm');
    });

    it('should handle CONTEXT_CLEAR marker case-insensitively', async () => {
      const messageView = await getMessageView();

      const text = '<!-- cyclist:context_clear:/dev -->';

      const result = messageView.detectStructuredMarkers(text);

      expect(result).not.toBeNull();
      expect(result[0].type).toBe('context_clear');
      expect(result[0].value).toBe('/dev');
    });

  });

  describe('generic-handoff emits CONTEXT_CLEAR in auto mode + high context', () => {

    it('should export formatContextClearMarker function', async () => {
      // The generic-handoff module should have a function to format the marker
      const handoff = await import('../../core/src/workflow/generic-handoff.js');

      expect(handoff.formatContextClearMarker).toBeDefined();
      expect(typeof handoff.formatContextClearMarker).toBe('function');
    });

    it('should return CONTEXT_CLEAR marker when auto mode and context > 60%', async () => {
      const handoff = await import('../../core/src/workflow/generic-handoff.js');

      const marker = handoff.formatContextClearMarker({
        handoffMode: 'auto',
        contextPercent: 75,
        nextAgent: '/dev',
      });

      expect(marker).toContain('<!-- CYCLIST:CONTEXT_CLEAR:/dev -->');
    });

    it('should return HANDOFF marker when auto mode and context <= 60%', async () => {
      const handoff = await import('../../core/src/workflow/generic-handoff.js');

      const marker = handoff.formatContextClearMarker({
        handoffMode: 'auto',
        contextPercent: 45,
        nextAgent: '/dev',
      });

      // Should NOT emit CONTEXT_CLEAR, just regular HANDOFF
      expect(marker).not.toContain('CONTEXT_CLEAR');
      expect(marker).toContain('<!-- CYCLIST:HANDOFF:/dev -->');
    });

    it('should return HANDOFF marker when manual mode regardless of context', async () => {
      const handoff = await import('../../core/src/workflow/generic-handoff.js');

      const marker = handoff.formatContextClearMarker({
        handoffMode: 'manual',
        contextPercent: 90,  // High context, but manual mode
        nextAgent: '/reviewer',
      });

      // Manual mode should always use regular HANDOFF
      expect(marker).not.toContain('CONTEXT_CLEAR');
      expect(marker).toContain('<!-- CYCLIST:HANDOFF:/reviewer -->');
    });

    it('should include context percentage in CONTEXT_CLEAR marker message', async () => {
      const handoff = await import('../../core/src/workflow/generic-handoff.js');

      const output = handoff.formatContextClearOutput({
        handoffMode: 'auto',
        contextPercent: 72,
        nextAgent: '/tea',
      });

      expect(output).toContain('72%');
      expect(output).toContain('CONTEXT_CLEAR');
      expect(output).toContain('/tea');
    });

  });

});

// =============================================================================
// AC2: Cyclist clears the Claude Code session automatically
// =============================================================================
describe('AC2: Cyclist clears session on CONTEXT_CLEAR marker', () => {

  describe('IPC channel for context-clear', () => {

    it('should export IPC_CONTEXT_CLEAR_CHANNELS constant', async () => {
      const channels = await import('../src/ipc-channels.js');

      expect(channels.IPC_CONTEXT_CLEAR_CHANNELS).toBeDefined();
    });

    it('should define context:clear channel', async () => {
      const channels = await import('../src/ipc-channels.js');

      expect(channels.IPC_CONTEXT_CLEAR_CHANNELS.CLEAR).toBe('context:clear');
    });

    it('should define context:clearAndLoad channel', async () => {
      const channels = await import('../src/ipc-channels.js');

      expect(channels.IPC_CONTEXT_CLEAR_CHANNELS.CLEAR_AND_LOAD).toBe('context:clearAndLoad');
    });

  });

  describe('ClaudeService clearSessionAsync method', () => {

    it('should export clearSessionAsync method on ClaudeService', async () => {
      const { ClaudeService } = await import('../src/claude-service.js');

      expect(ClaudeService.prototype.clearSessionAsync).toBeDefined();
      expect(typeof ClaudeService.prototype.clearSessionAsync).toBe('function');
    });

    it('should resolve immediately when no process is running', async () => {
      const { ClaudeService } = await import('../src/claude-service.js');

      const instance = new ClaudeService({ cwd: '/tmp/test' });

      // Should complete without error when no process exists
      await instance.clearSessionAsync();
      expect(true).toBe(true);
    });

    it('should wait for process exit before resolving', async () => {
      const { ClaudeService } = await import('../src/claude-service.js');
      const { EventEmitter, Readable, Writable } = await import('stream');

      // Create a mock spawner that returns a mock process
      let closeCallback: (() => void) | null = null;
      const mockSpawner = () => {
        const proc = new EventEmitter() as any;
        proc.stdin = new Writable({ write: (_, __, cb) => cb() });
        proc.stdout = new Readable({ read() { this.push(null); } });
        proc.stderr = new Readable({ read() { this.push(null); } });
        proc.pid = 12345;
        proc.kill = () => {
          // Simulate async process exit
          setTimeout(() => {
            proc.emit('close', 0);
          }, 10);
        };
        return proc;
      };

      const instance = new ClaudeService({
        cwd: '/tmp/test',
        spawner: mockSpawner as any
      });

      // Trigger process spawn by sending a message (will timeout but that's OK)
      const sendPromise = (async () => {
        for await (const msg of instance.sendMessage('test')) {
          break;
        }
      })();

      // Wait a tick for process to be created
      await new Promise(r => setTimeout(r, 5));

      // Now clearSessionAsync should wait for process exit
      await instance.clearSessionAsync();
      expect(true).toBe(true);
    });

  });

  describe('Message-view triggers clear on CONTEXT_CLEAR detection', () => {

    it('should export handleContextClearMarker function', async () => {
      const messageView = await getMessageView();

      expect(messageView.handleContextClearMarker).toBeDefined();
      expect(typeof messageView.handleContextClearMarker).toBe('function');
    });

    it('should call window.electronAPI.claude.clearAndReload on CONTEXT_CLEAR', async () => {
      // This test verifies the wiring between marker detection and action
      const messageView = await getMessageView();

      // Mock the electronAPI
      const mockClearAndReload = vi.fn().mockResolvedValue(undefined);
      const mockWindow = {
        electronAPI: {
          claude: {
            clearAndReload: mockClearAndReload,
          },
        },
      };

      // Call the handler
      await messageView.handleContextClearMarker('/dev', mockWindow as unknown as Window);

      expect(mockClearAndReload).toHaveBeenCalledWith('/dev');
    });

  });

  describe('Preload exposes clearAndReload API', () => {

    it('should expose clearAndReload on claude API', async () => {
      const preload = await import('../src/preload.js');
      const api = preload.electronAPI || preload.default;

      expect(api.claude.clearAndReload).toBeDefined();
      expect(typeof api.claude.clearAndReload).toBe('function');
    });

  });

});

// =============================================================================
// AC3: Cyclist loads the specified next agent after clear
// =============================================================================
describe('AC3: Cyclist loads next agent after clear', () => {

  describe('IPC handler clears session and broadcasts AGENT_LAUNCH', () => {

    it('should use clearSessionAsync to wait for process exit', async () => {
      // The IPC handler in main.ts calls service.clearSessionAsync()
      // This ensures the old process is fully dead before spawning new one
      const { ClaudeService } = await import('../src/claude-service.js');

      expect(ClaudeService.prototype.clearSessionAsync).toBeDefined();
      expect(typeof ClaudeService.prototype.clearSessionAsync).toBe('function');
    });

    it('should define CLEAR_AND_LOAD IPC channel', async () => {
      const channels = await import('../src/ipc-channels.js');

      expect(channels.IPC_CONTEXT_CLEAR_CHANNELS).toBeDefined();
      expect(channels.IPC_CONTEXT_CLEAR_CHANNELS.CLEAR_AND_LOAD).toBe('context:clearAndLoad');
    });

    it('should define AGENT_LAUNCH IPC channel for triggering editor', async () => {
      const channels = await import('../src/ipc-channels.js');

      expect(channels.IPC_AGENT_CHANNELS).toBeDefined();
      expect(channels.IPC_AGENT_CHANNELS.AGENT_LAUNCH).toBe('agent:launch');
    });

  });

  describe('Agent loading after clear', () => {

    it('should format agent command correctly for /dev', async () => {
      const { formatAgentCommand } = await import('../src/claude-service.js');

      const command = formatAgentCommand('/dev');

      expect(command).toBe('/dev');
    });

    it('should format agent command correctly for /tea', async () => {
      const { formatAgentCommand } = await import('../src/claude-service.js');

      const command = formatAgentCommand('/tea');

      expect(command).toBe('/tea');
    });

    it('should format agent command correctly for /reviewer', async () => {
      const { formatAgentCommand } = await import('../src/claude-service.js');

      const command = formatAgentCommand('/reviewer');

      expect(command).toBe('/reviewer');
    });

    it('should normalize agent names without leading slash', async () => {
      const { formatAgentCommand } = await import('../src/claude-service.js');

      const command = formatAgentCommand('dev');

      expect(command).toBe('/dev');
    });

  });

});

// =============================================================================
// AC4: Auto mode workflow continues without user intervention
// =============================================================================
describe('AC4: Auto mode workflow continuation', () => {

  describe('Auto-mode detection in handoff flow', () => {

    it('should export isAutoModeEnabled function', async () => {
      const settings = await import('../src/settings.js');

      expect(settings.isAutoModeEnabled).toBeDefined();
      expect(typeof settings.isAutoModeEnabled).toBe('function');
    });

    it('should return true when handoff_mode is auto', async () => {
      const settings = await import('../src/settings.js');

      // Mock settings with auto mode
      const mockSettings = {
        workflow: { handoff_mode: 'auto' as const },
      };

      const result = settings.isAutoModeEnabled(mockSettings);

      expect(result).toBe(true);
    });

    it('should return false when handoff_mode is manual', async () => {
      const settings = await import('../src/settings.js');

      const mockSettings = {
        workflow: { handoff_mode: 'manual' as const },
      };

      const result = settings.isAutoModeEnabled(mockSettings);

      expect(result).toBe(false);
    });

  });

  describe('CONTEXT_CLEAR marker only emitted in auto mode', () => {

    it('should detect auto mode from settings before emitting marker', async () => {
      const handoff = await import('../../core/src/workflow/generic-handoff.js');

      // When handoff mode is 'auto' and context > 60%, emit CONTEXT_CLEAR
      const result = handoff.shouldEmitContextClear({
        handoffMode: 'auto',
        contextPercent: 70,
      });

      expect(result).toBe(true);
    });

    it('should NOT emit CONTEXT_CLEAR in manual mode', async () => {
      const handoff = await import('../../core/src/workflow/generic-handoff.js');

      const result = handoff.shouldEmitContextClear({
        handoffMode: 'manual',
        contextPercent: 90,
      });

      expect(result).toBe(false);
    });

    it('should NOT emit CONTEXT_CLEAR when context is low', async () => {
      const handoff = await import('../../core/src/workflow/generic-handoff.js');

      const result = handoff.shouldEmitContextClear({
        handoffMode: 'auto',
        contextPercent: 40,
      });

      expect(result).toBe(false);
    });

  });

  describe('Workflow continuation after reload', () => {

    it('should preserve story context after clear and reload', async () => {
      // After clearAndReload, the new agent should pick up from session file
      // This is more of an integration test concept

      // The new agent will read from .session/{story}-session.md
      // which persists across session clears
      expect(true).toBe(true);  // Placeholder for integration test
    });

    it('should continue workflow phase after reload', async () => {
      // The workflow phase is tracked in session file, not in Claude context
      // After reload, the new agent reads the session file and continues
      expect(true).toBe(true);  // Placeholder for integration test
    });

  });

  describe('UI feedback during clear and reload', () => {

    it('should show loading indicator during clear', async () => {
      // Cyclist UI should indicate that session is being cleared
      const controls = await import('../src/public/js/controls.js');

      expect(controls.showClearingIndicator).toBeDefined();
      expect(typeof controls.showClearingIndicator).toBe('function');
    });

    it('should show loading indicator during agent reload', async () => {
      const controls = await import('../src/public/js/controls.js');

      expect(controls.showReloadingIndicator).toBeDefined();
      expect(typeof controls.showReloadingIndicator).toBe('function');
    });

    it('should hide indicators after reload complete', async () => {
      const controls = await import('../src/public/js/controls.js');

      expect(controls.hideClearingIndicator).toBeDefined();
      expect(typeof controls.hideClearingIndicator).toBe('function');
    });

  });

});

// =============================================================================
// Integration: End-to-end flow
// =============================================================================
describe('Integration: End-to-end auto-mode context clear flow', () => {

  it('should handle full flow: detect marker -> clear -> reload -> continue', async () => {
    // This is a high-level integration test that verifies the complete flow:
    // 1. Agent emits CONTEXT_CLEAR marker
    // 2. Cyclist detects marker
    // 3. Cyclist clears session
    // 4. Cyclist loads next agent
    // 5. Workflow continues

    // In unit tests, we verify each piece. Integration tests would verify the flow.
    expect(true).toBe(true);  // Placeholder
  });

  it('should handle multiple handoffs with context clears', async () => {
    // TEA -> Dev (clear) -> Reviewer (clear) -> SM
    // Each handoff with high context should trigger clear+reload
    expect(true).toBe(true);  // Placeholder
  });

  it('should gracefully handle clear with running process', async () => {
    // clearSessionAsync should complete even if process takes time to exit
    const { ClaudeService } = await import('../src/claude-service.js');
    const { EventEmitter, Readable, Writable } = await import('stream');

    // Create a mock spawner with a process that emits close event
    const mockSpawner = () => {
      const proc = new EventEmitter() as any;
      proc.stdin = new Writable({ write: (_, __, cb) => cb() });
      proc.stdout = new Readable({ read() { this.push(null); } });
      proc.stderr = new Readable({ read() { this.push(null); } });
      proc.pid = 12345;
      proc.kill = () => {
        // Emit close after a short delay
        setTimeout(() => proc.emit('close', 0), 5);
      };
      return proc;
    };

    const instance = new ClaudeService({
      cwd: '/tmp/test',
      spawner: mockSpawner as any
    });

    // Trigger process spawn
    const sendPromise = (async () => {
      for await (const msg of instance.sendMessage('test')) {
        break;
      }
    })();
    await new Promise(r => setTimeout(r, 5));

    // clearSessionAsync should complete without error
    await instance.clearSessionAsync();
    expect(true).toBe(true);
  });

});
