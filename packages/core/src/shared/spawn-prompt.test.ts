import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  buildSpawnPrompt,
  estimateTokenCount,
  validateSpawnPrompt,
  CORE_AGENTS,
  type SpawnPromptConfig,
  type SpawnPromptResult,
  type SpawnPromptValidation,
} from './spawn-prompt.js';

describe('spawn-prompt', () => {
  // Helper: valid config for reuse across tests
  const validConfig: SpawnPromptConfig = {
    agent: 'dev',
    storyId: '86-8',
    task: 'Implement the buildSpawnPrompt function',
    phase: 'green',
    sessionFile: '.session/86-8-session.md',
  };

  // =========================================================================
  // AC1: Spawn prompt runs `pf agent start {agent}` for full Prime activation
  // =========================================================================
  describe('AC1: Prime activation command', () => {
    it('should include pf agent start command in the prompt', () => {
      const result: SpawnPromptResult = buildSpawnPrompt(validConfig);
      assert.strictEqual(result.success, true, 'Should succeed with valid config');
      assert.ok(result.prompt, 'Should have prompt text');
      assert.ok(
        result.prompt!.includes('pf agent start'),
        'Prompt must include pf agent start command',
      );
    });

    it('should include the specific agent name in the activation command', () => {
      const result = buildSpawnPrompt({ ...validConfig, agent: 'tea' });
      assert.strictEqual(result.success, true);
      assert.ok(
        result.prompt!.includes('pf agent start "tea"') ||
          result.prompt!.includes("pf agent start 'tea'") ||
          result.prompt!.includes('pf agent start tea'),
        `Prompt must reference the agent name in activation command, got: ${result.prompt}`,
      );
    });

    it('should place activation command prominently (not buried in middle)', () => {
      const result = buildSpawnPrompt(validConfig);
      assert.strictEqual(result.success, true);
      // Activation command should appear in the first half of the prompt
      const prompt = result.prompt!;
      const cmdIndex = prompt.indexOf('pf agent start');
      assert.ok(
        cmdIndex < prompt.length / 2,
        'Activation command should appear in the first half of the prompt',
      );
    });
  });

  // =========================================================================
  // AC2: Spawn prompt includes story ID, task assignment, phase context
  // =========================================================================
  describe('AC2: Required context in prompt', () => {
    it('should include the story ID in the prompt', () => {
      const result = buildSpawnPrompt(validConfig);
      assert.strictEqual(result.success, true);
      assert.ok(
        result.prompt!.includes('86-8'),
        'Prompt must include story ID',
      );
    });

    it('should include the task assignment in the prompt', () => {
      const result = buildSpawnPrompt(validConfig);
      assert.strictEqual(result.success, true);
      assert.ok(
        result.prompt!.includes('Implement the buildSpawnPrompt function'),
        'Prompt must include task description',
      );
    });

    it('should include the phase context in the prompt', () => {
      const result = buildSpawnPrompt(validConfig);
      assert.strictEqual(result.success, true);
      assert.ok(
        result.prompt!.includes('green'),
        'Prompt must include phase name',
      );
    });

    it('should include the session file path when provided', () => {
      const result = buildSpawnPrompt(validConfig);
      assert.strictEqual(result.success, true);
      assert.ok(
        result.prompt!.includes('.session/86-8-session.md'),
        'Prompt must include session file path when provided',
      );
    });

    it('should return error when agent is missing', () => {
      const result = buildSpawnPrompt({
        ...validConfig,
        agent: '',
      });
      assert.strictEqual(result.success, false);
      assert.ok(result.error, 'Should have error message');
    });

    it('should return error when storyId is missing', () => {
      const result = buildSpawnPrompt({
        ...validConfig,
        storyId: '',
      });
      assert.strictEqual(result.success, false);
      assert.ok(result.error, 'Should have error message');
    });

    it('should return error when task is missing', () => {
      const result = buildSpawnPrompt({
        ...validConfig,
        task: '',
      });
      assert.strictEqual(result.success, false);
      assert.ok(result.error, 'Should have error message');
    });
  });

  // =========================================================================
  // AC3: Teammates activate via Prime, not prompt injection
  // =========================================================================
  describe('AC3: No prompt injection of context', () => {
    it('should NOT contain inline persona definitions', () => {
      const result = buildSpawnPrompt(validConfig);
      assert.strictEqual(result.success, true);
      const prompt = result.prompt!.toLowerCase();
      // Should not embed persona XML tags or character definitions
      assert.ok(
        !prompt.includes('<persona'),
        'Prompt must NOT contain inline persona definitions',
      );
    });

    it('should NOT contain inline sidecar content', () => {
      const result = buildSpawnPrompt(validConfig);
      assert.strictEqual(result.success, true);
      const prompt = result.prompt!.toLowerCase();
      assert.ok(
        !prompt.includes('<pattern'),
        'Prompt must NOT contain inline sidecar patterns',
      );
      assert.ok(
        !prompt.includes('<gotcha'),
        'Prompt must NOT contain inline sidecar gotchas',
      );
    });

    it('should NOT contain inline agent behavior guide', () => {
      const result = buildSpawnPrompt(validConfig);
      assert.strictEqual(result.success, true);
      const prompt = result.prompt!;
      // The agent-behavior guide is large — prompt should NOT embed it
      assert.ok(
        !prompt.includes('<agent-exit-protocol>'),
        'Prompt must NOT contain inline agent behavior guide',
      );
    });

    it('should rely on pf agent start for context loading', () => {
      const result = buildSpawnPrompt(validConfig);
      assert.strictEqual(result.success, true);
      // Must have the activation command — that IS the context loading mechanism
      assert.ok(
        result.prompt!.includes('pf agent start'),
        'Must use pf agent start for context loading',
      );
    });
  });

  // =========================================================================
  // AC4: Spawn prompt stays under 500 tokens
  // =========================================================================
  describe('AC4: Token budget constraint', () => {
    it('should include token estimate in result', () => {
      const result = buildSpawnPrompt(validConfig);
      assert.strictEqual(result.success, true);
      assert.ok(
        typeof result.tokenEstimate === 'number',
        'Result must include token estimate',
      );
      assert.ok(result.tokenEstimate! > 0, 'Token estimate must be positive');
    });

    it('should generate prompt under 500 tokens', () => {
      const result = buildSpawnPrompt(validConfig);
      assert.strictEqual(result.success, true);
      assert.ok(
        result.tokenEstimate! <= 500,
        `Prompt must be under 500 tokens, got ${result.tokenEstimate}`,
      );
    });

    it('should stay under 500 tokens even with long task descriptions', () => {
      const longTask = 'Implement comprehensive error handling across all API endpoints including retry logic, circuit breakers, and graceful degradation with user-facing error messages that are helpful but not leaking implementation details';
      const result = buildSpawnPrompt({
        ...validConfig,
        task: longTask,
      });
      assert.strictEqual(result.success, true);
      assert.ok(
        result.tokenEstimate! <= 500,
        `Prompt with long task must still be under 500 tokens, got ${result.tokenEstimate}`,
      );
    });

    it('estimateTokenCount should return reasonable estimate for known text', () => {
      // "hello world" is 2 tokens in most tokenizers, ~11 chars / 4 ≈ 2-3
      const estimate = estimateTokenCount('hello world');
      assert.ok(estimate > 0, 'Should return positive number');
      assert.ok(estimate < 10, 'Should be reasonable for short text');
    });

    it('estimateTokenCount should return 0 for empty string', () => {
      assert.strictEqual(estimateTokenCount(''), 0);
    });
  });

  // =========================================================================
  // AC5: Works with all core agents
  // =========================================================================
  describe('AC5: All core agents supported', () => {
    const expectedAgents = [
      'sm', 'tea', 'dev', 'reviewer', 'architect',
      'pm', 'tech-writer', 'ux-designer', 'devops',
      'orchestrator', 'ba',
    ];

    it('should export CORE_AGENTS array with all core agents', () => {
      assert.ok(Array.isArray(CORE_AGENTS), 'CORE_AGENTS must be an array');
      for (const agent of expectedAgents) {
        assert.ok(
          CORE_AGENTS.includes(agent),
          `CORE_AGENTS must include "${agent}"`,
        );
      }
    });

    it('should have at least 10 core agents', () => {
      assert.ok(
        CORE_AGENTS.length >= 10,
        `Expected at least 10 core agents, got ${CORE_AGENTS.length}`,
      );
    });

    for (const agent of expectedAgents) {
      it(`should build prompt successfully for agent: ${agent}`, () => {
        const result = buildSpawnPrompt({
          ...validConfig,
          agent,
        });
        assert.strictEqual(
          result.success,
          true,
          `Should succeed for agent "${agent}", got error: ${result.error}`,
        );
        assert.ok(result.prompt, `Should produce prompt for agent "${agent}"`);
      });
    }

    it('should reject unknown agent names', () => {
      const result = buildSpawnPrompt({
        ...validConfig,
        agent: 'nonexistent-agent',
      });
      assert.strictEqual(result.success, false);
      assert.ok(
        result.error?.toLowerCase().includes('unknown') ||
          result.error?.toLowerCase().includes('invalid') ||
          result.error?.toLowerCase().includes('not'),
        `Should indicate unknown agent, got: ${result.error}`,
      );
    });
  });

  // =========================================================================
  // AC6: Teammate correctly reads session file and workflow state
  // =========================================================================
  describe('AC6: Session file and workflow state reference', () => {
    it('should instruct teammate to read the session file', () => {
      const result = buildSpawnPrompt(validConfig);
      assert.strictEqual(result.success, true);
      const prompt = result.prompt!.toLowerCase();
      assert.ok(
        prompt.includes('session') && prompt.includes('read'),
        'Prompt should instruct teammate to read the session file',
      );
    });

    it('should reference the workflow state', () => {
      const result = buildSpawnPrompt(validConfig);
      assert.strictEqual(result.success, true);
      const prompt = result.prompt!.toLowerCase();
      assert.ok(
        prompt.includes('workflow') || prompt.includes('phase'),
        'Prompt should reference workflow state or phase',
      );
    });

    it('should work without explicit sessionFile (uses convention)', () => {
      const config: SpawnPromptConfig = {
        agent: 'dev',
        storyId: '86-8',
        task: 'Implement feature',
        phase: 'green',
        // no sessionFile
      };
      const result = buildSpawnPrompt(config);
      assert.strictEqual(result.success, true);
      // Should derive session file path from storyId convention
      assert.ok(
        result.prompt!.includes('.session/86-8-session.md') ||
          result.prompt!.includes('session'),
        'Should reference session file even without explicit path',
      );
    });
  });

  // =========================================================================
  // validateSpawnPrompt
  // =========================================================================
  describe('validateSpawnPrompt', () => {
    it('should validate a well-formed prompt as valid', () => {
      const result = buildSpawnPrompt(validConfig);
      assert.strictEqual(result.success, true);
      const validation: SpawnPromptValidation = validateSpawnPrompt(result.prompt!);
      assert.strictEqual(validation.valid, true);
      assert.strictEqual(validation.errors.length, 0);
    });

    it('should reject prompt exceeding 500 tokens', () => {
      // Create an artificially long prompt (500 tokens ≈ 2000 chars)
      const longPrompt = 'x'.repeat(2500);
      const validation = validateSpawnPrompt(longPrompt);
      assert.strictEqual(validation.valid, false);
      assert.ok(validation.tokenCount > 500);
      assert.ok(
        validation.errors.some((e) => e.toLowerCase().includes('token')),
        'Should report token limit violation',
      );
    });

    it('should reject prompt missing activation command', () => {
      const badPrompt = 'Just do the task for story 86-8';
      const validation = validateSpawnPrompt(badPrompt);
      assert.strictEqual(validation.valid, false);
      assert.ok(
        validation.errors.some(
          (e) => e.toLowerCase().includes('activation') || e.toLowerCase().includes('pf agent'),
        ),
        'Should report missing activation command',
      );
    });
  });
});
