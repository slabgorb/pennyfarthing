/**
 * MSSCI-12237: Story Status Tree View - Session File Watcher
 *
 * These tests verify the acceptance criteria for adding .session/ file watching
 * to Cyclist/WheelHub, enabling the VS Code extension to receive story updates
 * exclusively via WebSocket.
 *
 * Written in RED phase - tests should fail until Dev implements the functionality.
 *
 * Acceptance Criteria:
 * - AC1: Sidebar displays story title from WheelHub (not file watchers)
 * - AC2: "No active story" shown when no .session/*-session.md exists
 * - AC3: Story updates within 500ms of session file change
 * - AC4: No file watcher code remains in VS Code extension for session files
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import WebSocket from 'ws';
import { writeFileSync, mkdirSync, rmSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { createTerminalServer } from '../src/server.js';

// =============================================================================
// Test Fixtures
// =============================================================================

const TEST_PORT = 12237; // Unique port for this test suite

/**
 * Create a minimal session file for testing
 */
function createSessionFile(
  storyId: string = 'TEST-001',
  title: string = 'Test Story',
  phase: string = 'dev'
) {
  return `# Story ${storyId}: ${title}

## Story Details

| Field | Value |
|-------|-------|
| **ID** | ${storyId} |
| **Title** | ${title} |
| **Points** | 3 |
| **Phase** | ${phase} |

## Branch

\`feat/${storyId}-test-branch\`

## Acceptance Criteria

- [ ] AC1: Test criterion
`;
}

/**
 * Create a minimal sprint YAML for testing
 */
function createSprintYaml(storyId: string = 'TEST-001') {
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

// =============================================================================
// AC1 & AC3: Session file watcher broadcasts story updates
// =============================================================================

describe('AC1 & AC3: Session file watcher broadcasts story updates via /ws/story', () => {
  let server: ReturnType<typeof createTerminalServer>;
  let ws: WebSocket;
  let testDir: string;

  beforeEach(async () => {
    // Create temp directory with project structure
    testDir = join(tmpdir(), `cyclist-session-test-${Date.now()}`);
    mkdirSync(join(testDir, '.session'), { recursive: true });
    mkdirSync(join(testDir, 'sprint'), { recursive: true });
    mkdirSync(join(testDir, '.claude'), { recursive: true });

    // Write initial sprint YAML (required for getStoryInfo)
    writeFileSync(
      join(testDir, 'sprint', 'current-sprint.yaml'),
      createSprintYaml('TEST-001')
    );

    process.env.CYCLIST_PROJECT_DIR = testDir;

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

  it('should broadcast story update when session file is created', async () => {
    const receivedMessages: unknown[] = [];
    let gotStoryUpdate = false;

    await new Promise<void>((resolve, reject) => {
      ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws/story`);

      ws.on('open', async () => {
        // Wait for connection to stabilize
        await new Promise((r) => setTimeout(r, 100));

        // Create a new session file - should trigger broadcast
        writeFileSync(
          join(testDir, '.session', 'TEST-001-session.md'),
          createSessionFile('TEST-001', 'New Story Created', 'setup')
        );
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        receivedMessages.push(message);

        // Look for story data in the message
        if (message.id === 'TEST-001' || message.title?.includes('New Story')) {
          gotStoryUpdate = true;
          resolve();
        }
      });

      ws.on('error', reject);
      setTimeout(() => {
        if (!gotStoryUpdate) {
          reject(new Error('Did not receive story update after session file creation'));
        }
      }, 3000);
    });

    expect(gotStoryUpdate).toBe(true);

    // Verify the message contains expected story data
    const storyMessage = receivedMessages.find(
      (m: any) => m.id === 'TEST-001' || m.title?.includes('New Story')
    ) as any;
    expect(storyMessage).toBeDefined();
  });

  it('should broadcast story update when session file is modified', async () => {
    // Create initial session file
    writeFileSync(
      join(testDir, '.session', 'TEST-001-session.md'),
      createSessionFile('TEST-001', 'Initial Title', 'setup')
    );

    // Wait for initial file to be recognized
    await new Promise((r) => setTimeout(r, 200));

    const receivedMessages: unknown[] = [];
    let gotUpdate = false;

    await new Promise<void>((resolve, reject) => {
      ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws/story`);

      ws.on('open', async () => {
        // Wait for initial message
        await new Promise((r) => setTimeout(r, 100));
        receivedMessages.length = 0; // Clear initial message

        // Modify the session file - should trigger broadcast
        writeFileSync(
          join(testDir, '.session', 'TEST-001-session.md'),
          createSessionFile('TEST-001', 'Updated Title', 'dev')
        );
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        receivedMessages.push(message);

        // Look for the update (not initial)
        if (receivedMessages.length > 0) {
          gotUpdate = true;
          resolve();
        }
      });

      ws.on('error', reject);
      setTimeout(() => {
        if (!gotUpdate) {
          reject(new Error('Did not receive story update after session file modification'));
        }
      }, 3000);
    });

    expect(gotUpdate).toBe(true);
  });

  it('should broadcast null story when session file is deleted (AC2)', async () => {
    // Create initial session file
    writeFileSync(
      join(testDir, '.session', 'TEST-001-session.md'),
      createSessionFile('TEST-001', 'Story To Delete', 'dev')
    );

    // Wait for initial file to be recognized
    await new Promise((r) => setTimeout(r, 200));

    let gotNullStory = false;

    await new Promise<void>((resolve, reject) => {
      ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws/story`);

      ws.on('open', async () => {
        // Wait for initial message
        await new Promise((r) => setTimeout(r, 100));

        // Delete the session file - should broadcast null story
        unlinkSync(join(testDir, '.session', 'TEST-001-session.md'));
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());

        // Look for null/empty story indicator
        if (message.id === null || message.title === null || !message.id) {
          gotNullStory = true;
          resolve();
        }
      });

      ws.on('error', reject);
      setTimeout(() => {
        if (!gotNullStory) {
          reject(new Error('Did not receive null story after session file deletion'));
        }
      }, 3000);
    });

    expect(gotNullStory).toBe(true);
  });

  it('should update within 500ms of session file change (AC3)', async () => {
    // Create initial session file
    writeFileSync(
      join(testDir, '.session', 'TEST-001-session.md'),
      createSessionFile('TEST-001', 'Timing Test', 'setup')
    );

    await new Promise((r) => setTimeout(r, 200));

    let fileChangedAt: number | null = null;
    let updateReceivedAt: number | null = null;

    await new Promise<void>((resolve, reject) => {
      ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws/story`);
      let gotInitial = false;

      ws.on('message', (data) => {
        if (!gotInitial) {
          gotInitial = true;
          return;
        }

        // This is an update message
        updateReceivedAt = Date.now();
        resolve();
      });

      ws.on('open', async () => {
        await new Promise((r) => setTimeout(r, 100));

        // Record time and modify file
        fileChangedAt = Date.now();
        writeFileSync(
          join(testDir, '.session', 'TEST-001-session.md'),
          createSessionFile('TEST-001', 'Timing Test Updated', 'dev')
        );
      });

      ws.on('error', reject);
      setTimeout(() => {
        if (!updateReceivedAt) {
          reject(new Error('Did not receive update within timeout'));
        }
      }, 3000);
    });

    expect(fileChangedAt).not.toBeNull();
    expect(updateReceivedAt).not.toBeNull();

    const latency = updateReceivedAt! - fileChangedAt!;

    // Must be under 500ms per AC3
    expect(latency).toBeLessThan(500);
    console.log(`Session file update latency: ${latency}ms`);
  });

  it('should debounce rapid session file changes', async () => {
    // Create initial session file
    writeFileSync(
      join(testDir, '.session', 'TEST-001-session.md'),
      createSessionFile('TEST-001', 'Debounce Test', 'setup')
    );

    await new Promise((r) => setTimeout(r, 200));

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
            join(testDir, '.session', 'TEST-001-session.md'),
            createSessionFile('TEST-001', `Rapid Update ${i}`, 'dev')
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
    console.log(`Received ${receivedMessages.length} updates for 5 rapid changes (debounced)`);
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
    ws1Messages.length = 0;
    ws2Messages.length = 0;

    // Create session file to trigger update
    writeFileSync(
      join(testDir, '.session', 'TEST-001-session.md'),
      createSessionFile('TEST-001', 'Broadcast Test', 'dev')
    );

    // Wait for broadcast
    await new Promise((resolve) => setTimeout(resolve, 500));

    ws1.close();
    ws2.close();

    // Both clients should have received the update
    expect(ws1Messages.length).toBeGreaterThan(0);
    expect(ws2Messages.length).toBeGreaterThan(0);
  });

  it('should include story title in broadcast message (AC1)', async () => {
    let receivedStoryTitle: string | null = null;

    await new Promise<void>((resolve, reject) => {
      ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws/story`);

      ws.on('open', async () => {
        await new Promise((r) => setTimeout(r, 100));

        // Create session file with specific title
        writeFileSync(
          join(testDir, '.session', 'TEST-001-session.md'),
          createSessionFile('TEST-001', 'Story Status Tree View', 'setup')
        );
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.title) {
          receivedStoryTitle = message.title;
          resolve();
        }
      });

      ws.on('error', reject);
      setTimeout(() => {
        if (!receivedStoryTitle) {
          reject(new Error('Did not receive story with title'));
        }
      }, 3000);
    });

    expect(receivedStoryTitle).toBe('Story Status Tree View');
  });

  it('should include story phase in broadcast message', async () => {
    let receivedPhase: string | null = null;

    await new Promise<void>((resolve, reject) => {
      ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws/story`);

      ws.on('open', async () => {
        await new Promise((r) => setTimeout(r, 100));

        // Create session file with specific phase
        writeFileSync(
          join(testDir, '.session', 'TEST-001-session.md'),
          createSessionFile('TEST-001', 'Phase Test', 'review')
        );
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.phase) {
          receivedPhase = message.phase;
          resolve();
        }
      });

      ws.on('error', reject);
      setTimeout(() => {
        if (!receivedPhase) {
          reject(new Error('Did not receive story with phase'));
        }
      }, 3000);
    });

    expect(receivedPhase).toBe('review');
  });

  it('should include branch name in broadcast message', async () => {
    let receivedBranch: string | null = null;

    await new Promise<void>((resolve, reject) => {
      ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws/story`);

      ws.on('open', async () => {
        await new Promise((r) => setTimeout(r, 100));

        // Create session file
        writeFileSync(
          join(testDir, '.session', 'TEST-001-session.md'),
          createSessionFile('TEST-001', 'Branch Test', 'dev')
        );
      });

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.branch) {
          receivedBranch = message.branch;
          resolve();
        }
      });

      ws.on('error', reject);
      setTimeout(() => {
        if (!receivedBranch) {
          reject(new Error('Did not receive story with branch'));
        }
      }, 3000);
    });

    expect(receivedBranch).toContain('feat/TEST-001');
  });
});

// =============================================================================
// AC2: Empty state when no session file exists
// =============================================================================

describe('AC2: Empty state when no session file exists', () => {
  let server: ReturnType<typeof createTerminalServer>;
  let ws: WebSocket;
  let testDir: string;

  beforeEach(async () => {
    // Create temp directory WITHOUT session file
    testDir = join(tmpdir(), `cyclist-empty-test-${Date.now()}`);
    mkdirSync(join(testDir, '.session'), { recursive: true });
    mkdirSync(join(testDir, 'sprint'), { recursive: true });
    mkdirSync(join(testDir, '.claude'), { recursive: true });

    // Write sprint YAML but NO session file
    writeFileSync(
      join(testDir, 'sprint', 'current-sprint.yaml'),
      createSprintYaml('TEST-001')
    );

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

  it('should send null story data when no session file exists', async () => {
    let receivedInitialMessage = false;
    let storyIsNull = false;

    await new Promise<void>((resolve, reject) => {
      ws = new WebSocket(`ws://localhost:${TEST_PORT + 1}/ws/story`);

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        receivedInitialMessage = true;

        // Story should be null or have null id/title
        if (message.id === null || !message.id) {
          storyIsNull = true;
        }
        resolve();
      });

      ws.on('error', reject);
      setTimeout(() => {
        if (!receivedInitialMessage) {
          reject(new Error('Did not receive initial message'));
        }
      }, 3000);
    });

    expect(receivedInitialMessage).toBe(true);
    expect(storyIsNull).toBe(true);
  });

  it('should still include sprint data when no session file exists', async () => {
    let receivedSprint = false;

    await new Promise<void>((resolve, reject) => {
      ws = new WebSocket(`ws://localhost:${TEST_PORT + 1}/ws/story`);

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());

        // Sprint data should still be present
        if (message.sprint && message.sprint.number) {
          receivedSprint = true;
        }
        resolve();
      });

      ws.on('error', reject);
      setTimeout(() => resolve(), 3000);
    });

    expect(receivedSprint).toBe(true);
  });
});

// =============================================================================
// Integration: Session watcher coexists with sprint watcher
// =============================================================================

describe('Integration: Session watcher coexists with sprint watcher', () => {
  let server: ReturnType<typeof createTerminalServer>;
  let ws: WebSocket;
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `cyclist-integration-test-${Date.now()}`);
    mkdirSync(join(testDir, '.session'), { recursive: true });
    mkdirSync(join(testDir, 'sprint'), { recursive: true });
    mkdirSync(join(testDir, '.claude'), { recursive: true });

    writeFileSync(
      join(testDir, 'sprint', 'current-sprint.yaml'),
      createSprintYaml('TEST-001')
    );

    writeFileSync(
      join(testDir, '.session', 'TEST-001-session.md'),
      createSessionFile('TEST-001', 'Integration Test', 'dev')
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

  it('should receive updates from both session and sprint file changes', async () => {
    const receivedMessages: unknown[] = [];

    await new Promise<void>((resolve, reject) => {
      ws = new WebSocket(`ws://localhost:${TEST_PORT + 2}/ws/story`);

      ws.on('open', async () => {
        // Wait for init
        await new Promise((r) => setTimeout(r, 100));
        receivedMessages.length = 0;

        // Change session file
        writeFileSync(
          join(testDir, '.session', 'TEST-001-session.md'),
          createSessionFile('TEST-001', 'Session Update', 'review')
        );

        await new Promise((r) => setTimeout(r, 300));

        // Change sprint file
        writeFileSync(
          join(testDir, 'sprint', 'current-sprint.yaml'),
          createSprintYaml('TEST-002')
        );

        await new Promise((r) => setTimeout(r, 300));
        resolve();
      });

      ws.on('message', (data) => {
        receivedMessages.push(JSON.parse(data.toString()));
      });

      ws.on('error', reject);
      setTimeout(() => resolve(), 3000);
    });

    // Should have received updates from both file changes
    expect(receivedMessages.length).toBeGreaterThanOrEqual(2);
  });
});
