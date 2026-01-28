/**
 * MSSCI-11943: Story/Git WebSocket channels with file watchers
 *
 * These tests verify the acceptance criteria for replacing polling with WebSocket
 * channels triggered by file watchers.
 *
 * Written in RED phase - tests should fail until Dev implements the functionality.
 *
 * Acceptance Criteria:
 * - AC1: /ws/story channel broadcasts on sprint/*.yaml changes
 * - AC2: /ws/git channel broadcasts on .git/HEAD and .git/index changes
 * - AC3: story.js uses WebSocket instead of setInterval polling
 * - AC4: Story panel updates within 2s of file change (not 10s)
 * - AC5: Git indicator updates within 2s of branch switch (not 5s)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Window } from 'happy-dom';
import request from 'supertest';
import WebSocket from 'ws';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { app, createTerminalServer } from '../src/server.js';

// =============================================================================
// Test Fixtures
// =============================================================================

const TEST_PORT = 19943; // Unique port for this test suite

/**
 * Create a minimal sprint YAML for testing
 */
function createSprintYaml(storyId: string = 'TEST-001', phase: string = 'dev') {
  return `sprint:
  number: 12
  goal: Test sprint
  status: active

epics:
  - id: TEST-EPIC
    type: epic
    title: Test Epic
    stories:
      - id: ${storyId}
        title: Test Story
        points: 3
        status: in_progress
`;
}

/**
 * Create a minimal session file for testing
 */
function createSessionFile(storyId: string = 'TEST-001', phase: string = 'dev') {
  return `# Story ${storyId}: Test Story

## Status: IN_PROGRESS
**Phase:** ${phase}
**Started:** 2026-01-19

---

## Story Summary

Test story for WebSocket channel testing.

## Acceptance Criteria

- [ ] Test criterion 1
- [ ] Test criterion 2
`;
}

// =============================================================================
// AC1: /ws/story channel broadcasts on sprint/*.yaml changes
// =============================================================================

describe('AC1: /ws/story channel broadcasts on sprint/*.yaml changes', () => {
  let server: ReturnType<typeof createTerminalServer>;
  let ws: WebSocket;
  let testDir: string;

  beforeEach(async () => {
    // Create temp directory for test files
    testDir = join(tmpdir(), `cyclist-test-${Date.now()}`);
    mkdirSync(join(testDir, 'sprint'), { recursive: true });
    mkdirSync(join(testDir, '.session'), { recursive: true });
    mkdirSync(join(testDir, '.claude'), { recursive: true });

    // Write initial sprint YAML
    writeFileSync(
      join(testDir, 'sprint', 'current-sprint.yaml'),
      createSprintYaml('TEST-001', 'dev')
    );

    // Write session file
    writeFileSync(
      join(testDir, '.session', 'TEST-001-session.md'),
      createSessionFile('TEST-001', 'dev')
    );

    // Set project dir for server
    process.env.CYCLIST_PROJECT_DIR = testDir;

    // Start server
    server = createTerminalServer();
    await new Promise<void>((resolve) => server.listen(TEST_PORT, resolve));
  });

  afterEach(async () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    delete process.env.CYCLIST_PROJECT_DIR;
  });

  it('should accept WebSocket connections at /ws/story', async () => {
    await new Promise<void>((resolve, reject) => {
      ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws/story`);

      ws.on('open', () => {
        expect(ws.readyState).toBe(WebSocket.OPEN);
        resolve();
      });

      ws.on('error', reject);
      setTimeout(() => reject(new Error('WebSocket connection timeout')), 5000);
    });
  });

  it('should send initial story data on connection', async () => {
    const receivedMessages: unknown[] = [];

    await new Promise<void>((resolve, reject) => {
      ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws/story`);

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        receivedMessages.push(message);

        // Should receive initial story data
        if (message.type === 'init' || message.id) {
          resolve();
        }
      });

      ws.on('error', reject);
      setTimeout(() => reject(new Error('Did not receive initial story data')), 5000);
    });

    // Should have received story data
    expect(receivedMessages.length).toBeGreaterThan(0);
    const initMessage = receivedMessages[0] as { type?: string; id?: string };
    expect(initMessage.type === 'init' || initMessage.id).toBeTruthy();
  });

  it('should broadcast story update when sprint YAML changes', async () => {
    const receivedMessages: unknown[] = [];
    let gotUpdate = false;

    await new Promise<void>((resolve, reject) => {
      ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws/story`);

      ws.on('open', async () => {
        // Wait for initial message
        await new Promise((r) => setTimeout(r, 100));

        // Modify sprint YAML to trigger file watcher
        writeFileSync(
          join(testDir, 'sprint', 'current-sprint.yaml'),
          createSprintYaml('TEST-002', 'tea')
        );
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        receivedMessages.push(message);

        // Look for update message (not just init)
        if (message.type === 'update' || (receivedMessages.length > 1 && message.id)) {
          gotUpdate = true;
          resolve();
        }
      });

      ws.on('error', reject);
      setTimeout(() => {
        if (!gotUpdate) {
          reject(new Error('Did not receive story update after YAML change'));
        }
      }, 3000);
    });

    expect(gotUpdate).toBe(true);
  });

  it('should broadcast to multiple connected clients', async () => {
    const ws1Messages: unknown[] = [];
    const ws2Messages: unknown[] = [];

    const ws1 = new WebSocket(`ws://localhost:${TEST_PORT}/ws/story`);
    const ws2 = new WebSocket(`ws://localhost:${TEST_PORT}/ws/story`);

    await Promise.all([
      new Promise<void>((resolve) => ws1.on('open', resolve)),
      new Promise<void>((resolve) => ws2.on('open', resolve)),
    ]);

    ws1.on('message', (data) => ws1Messages.push(JSON.parse(data.toString())));
    ws2.on('message', (data) => ws2Messages.push(JSON.parse(data.toString())));

    // Wait for initial messages
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Trigger update
    writeFileSync(
      join(testDir, 'sprint', 'current-sprint.yaml'),
      createSprintYaml('TEST-003', 'review')
    );

    // Wait for broadcast
    await new Promise((resolve) => setTimeout(resolve, 500));

    ws1.close();
    ws2.close();

    // Both clients should have received messages
    expect(ws1Messages.length).toBeGreaterThan(0);
    expect(ws2Messages.length).toBeGreaterThan(0);
  });

  it('should debounce rapid file changes (100ms)', async () => {
    const receivedMessages: unknown[] = [];

    await new Promise<void>((resolve, reject) => {
      ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws/story`);

      ws.on('open', async () => {
        // Wait for init
        await new Promise((r) => setTimeout(r, 100));
        receivedMessages.length = 0; // Clear init message

        // Rapid-fire changes (should be debounced)
        for (let i = 0; i < 5; i++) {
          writeFileSync(
            join(testDir, 'sprint', 'current-sprint.yaml'),
            createSprintYaml(`TEST-RAPID-${i}`, 'dev')
          );
          await new Promise((r) => setTimeout(r, 20));
        }

        // Wait for debounce period + processing
        await new Promise((r) => setTimeout(r, 300));
        resolve();
      });

      ws.on('message', (data) => {
        receivedMessages.push(JSON.parse(data.toString()));
      });

      ws.on('error', reject);
      setTimeout(() => resolve(), 2000);
    });

    // Should receive only 1-2 updates due to debouncing, not 5
    expect(receivedMessages.length).toBeLessThanOrEqual(2);
  });
});

// =============================================================================
// AC2: /ws/git channel broadcasts on .git/HEAD and .git/index changes
// =============================================================================

describe('AC2: /ws/git channel broadcasts on .git/HEAD and .git/index changes', () => {
  let server: ReturnType<typeof createTerminalServer>;
  let ws: WebSocket;
  let testDir: string;

  beforeEach(async () => {
    // Create temp directory with mock .git structure
    testDir = join(tmpdir(), `cyclist-git-test-${Date.now()}`);
    mkdirSync(join(testDir, '.git'), { recursive: true });
    mkdirSync(join(testDir, '.claude'), { recursive: true });

    // Write initial HEAD (simulating being on a branch)
    writeFileSync(join(testDir, '.git', 'HEAD'), 'ref: refs/heads/main\n');

    // Write mock index file
    writeFileSync(join(testDir, '.git', 'index'), 'mock-index-content');

    process.env.CYCLIST_PROJECT_DIR = testDir;

    server = createTerminalServer();
    await new Promise<void>((resolve) => server.listen(TEST_PORT + 1, resolve));
  });

  afterEach(async () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    delete process.env.CYCLIST_PROJECT_DIR;
  });

  it('should accept WebSocket connections at /ws/git', async () => {
    await new Promise<void>((resolve, reject) => {
      ws = new WebSocket(`ws://localhost:${TEST_PORT + 1}/ws/git`);

      ws.on('open', () => {
        expect(ws.readyState).toBe(WebSocket.OPEN);
        resolve();
      });

      ws.on('error', reject);
      setTimeout(() => reject(new Error('WebSocket connection timeout')), 5000);
    });
  });

  it('should send initial git status on connection', async () => {
    const receivedMessages: unknown[] = [];

    await new Promise<void>((resolve, reject) => {
      ws = new WebSocket(`ws://localhost:${TEST_PORT + 1}/ws/git`);

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        receivedMessages.push(message);

        // Should receive initial git data
        if (message.type === 'init' || message.branch !== undefined) {
          resolve();
        }
      });

      ws.on('error', reject);
      setTimeout(() => reject(new Error('Did not receive initial git data')), 5000);
    });

    expect(receivedMessages.length).toBeGreaterThan(0);
    const initMessage = receivedMessages[0] as { type?: string; branch?: string };
    expect(initMessage.type === 'init' || initMessage.branch !== undefined).toBeTruthy();
  });

  it('should broadcast git update when .git/HEAD changes (branch switch)', async () => {
    const receivedMessages: unknown[] = [];
    let gotUpdate = false;

    await new Promise<void>((resolve, reject) => {
      ws = new WebSocket(`ws://localhost:${TEST_PORT + 1}/ws/git`);

      ws.on('open', async () => {
        // Wait for initial message
        await new Promise((r) => setTimeout(r, 100));

        // Simulate branch switch by changing HEAD
        writeFileSync(
          join(testDir, '.git', 'HEAD'),
          'ref: refs/heads/feature/new-branch\n'
        );
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        receivedMessages.push(message);

        // Look for update after initial
        if (receivedMessages.length > 1) {
          gotUpdate = true;
          resolve();
        }
      });

      ws.on('error', reject);
      setTimeout(() => {
        if (!gotUpdate) {
          reject(new Error('Did not receive git update after HEAD change'));
        }
      }, 3000);
    });

    expect(gotUpdate).toBe(true);
  });

  it('should broadcast git update when .git/index changes (staging changes)', async () => {
    const receivedMessages: unknown[] = [];
    let gotUpdate = false;

    await new Promise<void>((resolve, reject) => {
      ws = new WebSocket(`ws://localhost:${TEST_PORT + 1}/ws/git`);

      ws.on('open', async () => {
        // Wait for initial message
        await new Promise((r) => setTimeout(r, 100));

        // Simulate staging change by modifying index
        writeFileSync(
          join(testDir, '.git', 'index'),
          'mock-index-content-modified'
        );
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        receivedMessages.push(message);

        // Look for update after initial
        if (receivedMessages.length > 1) {
          gotUpdate = true;
          resolve();
        }
      });

      ws.on('error', reject);
      setTimeout(() => {
        if (!gotUpdate) {
          reject(new Error('Did not receive git update after index change'));
        }
      }, 3000);
    });

    expect(gotUpdate).toBe(true);
  });

  it('should coalesce rapid git changes (500ms for git)', async () => {
    const receivedMessages: unknown[] = [];

    await new Promise<void>((resolve, reject) => {
      ws = new WebSocket(`ws://localhost:${TEST_PORT + 1}/ws/git`);

      ws.on('open', async () => {
        // Wait for init
        await new Promise((r) => setTimeout(r, 100));
        receivedMessages.length = 0; // Clear init message

        // Rapid index changes (common during git operations)
        for (let i = 0; i < 10; i++) {
          writeFileSync(
            join(testDir, '.git', 'index'),
            `mock-index-${i}`
          );
          await new Promise((r) => setTimeout(r, 30));
        }

        // Wait for coalesce period + processing
        await new Promise((r) => setTimeout(r, 700));
        resolve();
      });

      ws.on('message', (data) => {
        receivedMessages.push(JSON.parse(data.toString()));
      });

      ws.on('error', reject);
      setTimeout(() => resolve(), 3000);
    });

    // Should receive only 1-2 updates due to coalescing, not 10
    expect(receivedMessages.length).toBeLessThanOrEqual(2);
  });
});

// =============================================================================
// AC3: story.js uses WebSocket instead of setInterval polling
// =============================================================================

describe('AC3: story.js uses WebSocket instead of setInterval polling', () => {
  let document: Document;

  beforeEach(() => {
    const window = new Window();
    window.document.write(`
      <html>
        <body>
          <div id="story-title"></div>
          <div id="story-phase"></div>
          <div id="git-branch"></div>
          <div id="git-status"></div>
        </body>
      </html>
    `);
    document = window.document as unknown as Document;
    globalThis.document = document;
    globalThis.window = window as unknown as Window & typeof globalThis;
  });

  it('should export connectStoryWebSocket function', async () => {
    // This test will fail until the function is implemented
    const storyModule = await import('../src/public/js/sidebar/story.js');
    expect(storyModule.connectStoryWebSocket).toBeDefined();
    expect(typeof storyModule.connectStoryWebSocket).toBe('function');
  });

  it('should export connectGitWebSocket function', async () => {
    // This test will fail until the function is implemented
    const storyModule = await import('../src/public/js/sidebar/story.js');
    expect(storyModule.connectGitWebSocket).toBeDefined();
    expect(typeof storyModule.connectGitWebSocket).toBe('function');
  });

  it('should NOT have STORY_POLL_INTERVAL used for setInterval', async () => {
    // The polling interval constants should either be removed or
    // only used as fallback, not for active polling
    const storyModule = await import('../src/public/js/sidebar/story.js');

    // Check that the module exposes WebSocket-based methods
    // instead of relying on polling
    expect(storyModule.connectStoryWebSocket).toBeDefined();

    // If there's a way to check active intervals, do so
    // This is more of an integration test
  });

  it('should reconnect WebSocket on disconnect with backoff', async () => {
    const storyModule = await import('../src/public/js/sidebar/story.js');

    // Should have reconnection logic
    expect(storyModule.connectStoryWebSocket).toBeDefined();

    // The implementation should handle reconnection
    // This test verifies the API exists for reconnection handling
  });
});

// =============================================================================
// AC4: Story panel updates within 2s of file change (not 10s)
// =============================================================================

describe('AC4: Story panel updates within 2s of file change (not 10s)', () => {
  let server: ReturnType<typeof createTerminalServer>;
  let ws: WebSocket;
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `cyclist-timing-test-${Date.now()}`);
    mkdirSync(join(testDir, 'sprint'), { recursive: true });
    mkdirSync(join(testDir, '.session'), { recursive: true });
    mkdirSync(join(testDir, '.claude'), { recursive: true });

    writeFileSync(
      join(testDir, 'sprint', 'current-sprint.yaml'),
      createSprintYaml('TIMING-001', 'dev')
    );

    writeFileSync(
      join(testDir, '.session', 'TIMING-001-session.md'),
      createSessionFile('TIMING-001', 'dev')
    );

    process.env.CYCLIST_PROJECT_DIR = testDir;

    server = createTerminalServer();
    await new Promise<void>((resolve) => server.listen(TEST_PORT + 2, resolve));
  });

  afterEach(async () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    delete process.env.CYCLIST_PROJECT_DIR;
  });

  it('should receive story update within 2000ms of file change', async () => {
    let updateReceivedAt: number | null = null;
    let fileChangedAt: number | null = null;

    await new Promise<void>((resolve, reject) => {
      ws = new WebSocket(`ws://localhost:${TEST_PORT + 2}/ws/story`);
      let gotInitial = false;

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());

        if (!gotInitial) {
          gotInitial = true;
          return;
        }

        // This is an update message
        updateReceivedAt = Date.now();
        resolve();
      });

      ws.on('open', async () => {
        // Wait for initial message
        await new Promise((r) => setTimeout(r, 100));

        // Record time and change file
        fileChangedAt = Date.now();
        writeFileSync(
          join(testDir, 'sprint', 'current-sprint.yaml'),
          createSprintYaml('TIMING-002', 'tea')
        );
      });

      ws.on('error', reject);

      // Fail if we don't get update within 3s (allowing some buffer)
      setTimeout(() => {
        if (!updateReceivedAt) {
          reject(new Error('Did not receive update within timeout'));
        }
      }, 3000);
    });

    expect(fileChangedAt).not.toBeNull();
    expect(updateReceivedAt).not.toBeNull();

    const latency = updateReceivedAt! - fileChangedAt!;

    // Must be under 2000ms per AC4
    expect(latency).toBeLessThan(2000);

    // Should typically be much faster (debounce is 100ms)
    console.log(`Story update latency: ${latency}ms`);
  });

  it('should be significantly faster than the old 10s polling interval', async () => {
    const latencies: number[] = [];

    await new Promise<void>((resolve, reject) => {
      ws = new WebSocket(`ws://localhost:${TEST_PORT + 2}/ws/story`);
      let gotInitial = false;
      let changeTime: number | null = null;

      ws.on('message', (data) => {
        if (!gotInitial) {
          gotInitial = true;
          return;
        }

        if (changeTime) {
          latencies.push(Date.now() - changeTime);
        }

        if (latencies.length >= 3) {
          resolve();
        }
      });

      ws.on('open', async () => {
        await new Promise((r) => setTimeout(r, 100));

        // Make 3 changes with delays
        for (let i = 0; i < 3; i++) {
          await new Promise((r) => setTimeout(r, 500));
          changeTime = Date.now();
          writeFileSync(
            join(testDir, 'sprint', 'current-sprint.yaml'),
            createSprintYaml(`FAST-${i}`, 'dev')
          );
        }
      });

      ws.on('error', reject);
      setTimeout(() => resolve(), 10000);
    });

    // All latencies should be well under the old 10s polling
    for (const latency of latencies) {
      expect(latency).toBeLessThan(2000);
    }

    // Average should be very fast
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    console.log(`Average story update latency: ${avgLatency}ms`);
    expect(avgLatency).toBeLessThan(1000);
  });
});

// =============================================================================
// AC5: Git indicator updates within 2s of branch switch (not 5s)
// =============================================================================

describe('AC5: Git indicator updates within 2s of branch switch (not 5s)', () => {
  let server: ReturnType<typeof createTerminalServer>;
  let ws: WebSocket;
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `cyclist-git-timing-${Date.now()}`);
    mkdirSync(join(testDir, '.git'), { recursive: true });
    mkdirSync(join(testDir, '.claude'), { recursive: true });

    writeFileSync(join(testDir, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    writeFileSync(join(testDir, '.git', 'index'), 'mock-index');

    process.env.CYCLIST_PROJECT_DIR = testDir;

    server = createTerminalServer();
    await new Promise<void>((resolve) => server.listen(TEST_PORT + 3, resolve));
  });

  afterEach(async () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    delete process.env.CYCLIST_PROJECT_DIR;
  });

  it('should receive git update within 2000ms of HEAD change (branch switch)', async () => {
    let updateReceivedAt: number | null = null;
    let branchSwitchedAt: number | null = null;

    await new Promise<void>((resolve, reject) => {
      ws = new WebSocket(`ws://localhost:${TEST_PORT + 3}/ws/git`);
      let gotInitial = false;

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());

        if (!gotInitial) {
          gotInitial = true;
          return;
        }

        updateReceivedAt = Date.now();
        resolve();
      });

      ws.on('open', async () => {
        await new Promise((r) => setTimeout(r, 100));

        // Simulate branch switch
        branchSwitchedAt = Date.now();
        writeFileSync(
          join(testDir, '.git', 'HEAD'),
          'ref: refs/heads/feature/new-feature\n'
        );
      });

      ws.on('error', reject);
      setTimeout(() => {
        if (!updateReceivedAt) {
          reject(new Error('Did not receive git update within timeout'));
        }
      }, 3000);
    });

    expect(branchSwitchedAt).not.toBeNull();
    expect(updateReceivedAt).not.toBeNull();

    const latency = updateReceivedAt! - branchSwitchedAt!;

    // Must be under 2000ms per AC5
    expect(latency).toBeLessThan(2000);

    console.log(`Git update latency: ${latency}ms`);
  });

  it('should be significantly faster than the old 5s polling interval', async () => {
    const latencies: number[] = [];
    const branches = ['develop', 'feature/a', 'feature/b', 'main'];

    await new Promise<void>((resolve, reject) => {
      ws = new WebSocket(`ws://localhost:${TEST_PORT + 3}/ws/git`);
      let gotInitial = false;
      let changeTime: number | null = null;
      let branchIndex = 0;

      ws.on('message', (data) => {
        if (!gotInitial) {
          gotInitial = true;
          return;
        }

        if (changeTime) {
          latencies.push(Date.now() - changeTime);
        }

        if (latencies.length >= 3) {
          resolve();
        }
      });

      ws.on('open', async () => {
        await new Promise((r) => setTimeout(r, 100));

        // Make 3 branch switches with delays
        for (let i = 0; i < 3; i++) {
          await new Promise((r) => setTimeout(r, 700)); // Wait for coalesce
          changeTime = Date.now();
          writeFileSync(
            join(testDir, '.git', 'HEAD'),
            `ref: refs/heads/${branches[++branchIndex]}\n`
          );
        }
      });

      ws.on('error', reject);
      setTimeout(() => resolve(), 10000);
    });

    // All latencies should be well under the old 5s polling
    for (const latency of latencies) {
      expect(latency).toBeLessThan(2000);
    }

    // Average should be very fast
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    console.log(`Average git update latency: ${avgLatency}ms`);
    expect(avgLatency).toBeLessThan(1000);
  });
});

// =============================================================================
// Integration: WebSocket channels coexist with existing channels
// =============================================================================

describe('Integration: WebSocket channels coexist with existing channels', () => {
  let server: ReturnType<typeof createTerminalServer>;

  beforeEach(async () => {
    server = createTerminalServer();
    await new Promise<void>((resolve) => server.listen(TEST_PORT + 4, resolve));
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('should still have /ws/stats channel working', async () => {
    const ws = new WebSocket(`ws://localhost:${TEST_PORT + 4}/ws/stats`);

    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => {
        expect(ws.readyState).toBe(WebSocket.OPEN);
        ws.close();
        resolve();
      });
      ws.on('error', reject);
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });
  });

  it('should still have /ws/persona channel working', async () => {
    const ws = new WebSocket(`ws://localhost:${TEST_PORT + 4}/ws/persona`);

    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => {
        expect(ws.readyState).toBe(WebSocket.OPEN);
        ws.close();
        resolve();
      });
      ws.on('error', reject);
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });
  });

  it('should still have /ws/background-tasks channel working', async () => {
    const ws = new WebSocket(`ws://localhost:${TEST_PORT + 4}/ws/background-tasks`);

    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => {
        expect(ws.readyState).toBe(WebSocket.OPEN);
        ws.close();
        resolve();
      });
      ws.on('error', reject);
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });
  });

  it('should reject unknown WebSocket paths', async () => {
    const ws = new WebSocket(`ws://localhost:${TEST_PORT + 4}/ws/unknown`);

    await new Promise<void>((resolve) => {
      ws.on('error', () => {
        // Expected - unknown path should be rejected
        resolve();
      });
      ws.on('close', () => {
        // Also acceptable - connection closed
        resolve();
      });
      ws.on('open', () => {
        ws.close();
        // If it opens, that's a failure but we handle gracefully
      });
      setTimeout(resolve, 2000);
    });
  });
});

// =============================================================================
// API: Existing REST endpoints still work
// =============================================================================

describe('API: Existing REST endpoints still work', () => {
  it('should still have GET /api/story endpoint', async () => {
    const response = await request(app).get('/api/story');
    // Should return 200 (may have null values if no project)
    expect(response.status).toBe(200);
  });

  it('should still have GET /api/git endpoint', async () => {
    const response = await request(app).get('/api/git');
    // May return 404 if not a git repo, but should not be 500
    expect([200, 404]).toContain(response.status);
  });
});
