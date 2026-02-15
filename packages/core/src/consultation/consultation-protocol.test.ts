/**
 * Tests for Story 86-2: Consultation Protocol Implementation
 *
 * RED state tests for the tandem consultation protocol.
 * Consultation is an active request/response mechanism where a leader agent
 * spawns a partner agent with a focused question and receives a structured recommendation.
 *
 * ACs covered:
 *   AC1: Consultation request format (context, question, options, code)
 *   AC2: Consultation response format (recommendation, rationale, watch-out-for, confidence)
 *   AC3: Leader spawns partner via Task tool with model: sonnet
 *   AC4: Partner prompt includes: agent definition, persona, consultation request
 *   AC5: Response parsed and available to leader for continued work
 *   AC6: Graceful degradation: partner failure → leader continues solo
 *   AC7: Token budget enforced via prompt instruction
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  formatConsultationRequest,
  parseConsultationResponse,
  validateConsultationRequest,
  validateConsultationResponse,
  buildPartnerPrompt,
  buildConsultationSpawnParams,
  executeConsultation,
} from './consultation-protocol.js';

import type {
  ConsultationRequest,
  ConsultationResponse,
  ConsultationAdapter,
  PartnerPromptParams,
} from './consultation-protocol.js';

// =============================================================================
// Test Fixtures
// =============================================================================

const VALID_REQUEST: ConsultationRequest = {
  leader: 'dev',
  leaderCharacter: 'Jack Torrance',
  partner: 'architect',
  context: 'Implementing consultation protocol for tandem agent communication',
  question: 'Should we use markdown or JSON for the consultation request format?',
  alternativesConsidered: [
    'Structured markdown with bold field labels',
    'JSON schema with typed fields',
    'YAML document format',
  ],
  relevantCode: 'See tandem-lifecycle.ts for existing backseat spawn pattern',
  tokenBudget: 1000,
};

const VALID_RESPONSE_MARKDOWN = `**Recommendation:** Use structured markdown with bold field labels
**Rationale:** Markdown is human-readable, consistent with existing session files, and parseable with regex
**Watch-Out-For:** Markdown parsing is fragile — multiline values need careful handling, and bold markers inside code blocks could cause false matches
**Confidence:** high
**Token Count:** 85`;

const VALID_RESPONSE: ConsultationResponse = {
  recommendation: 'Use structured markdown with bold field labels',
  rationale: 'Markdown is human-readable, consistent with existing session files, and parseable with regex',
  watchOutFor: 'Markdown parsing is fragile — multiline values need careful handling, and bold markers inside code blocks could cause false matches',
  confidence: 'high',
  tokenCount: 85,
};

const MOCK_AGENT_DEF = '# Architect Agent\n<role>System design</role>';
const MOCK_PERSONA = '<persona agent="architect">Andy Dufresne</persona>';

// =============================================================================
// AC1: Consultation request format defined
// =============================================================================

describe('86-2: Consultation Protocol', () => {

  describe('AC1: Consultation request format', () => {

    it('should format request with all required fields as markdown', () => {
      const result = formatConsultationRequest(VALID_REQUEST);

      assert.ok(result.includes('**Leader:**'), 'Must include Leader field');
      assert.ok(result.includes('**Partner:**'), 'Must include Partner field');
      assert.ok(result.includes('**Context:**'), 'Must include Context field');
      assert.ok(result.includes('**Question:**'), 'Must include Question field');
      assert.ok(result.includes('**Alternatives Considered:**'), 'Must include Alternatives field');
      assert.ok(result.includes('**Relevant Code/Files:**'), 'Must include Relevant Code field');
      assert.ok(result.includes('**Token Budget:**'), 'Must include Token Budget field');
    });

    it('should include leader character name in Leader field', () => {
      const result = formatConsultationRequest(VALID_REQUEST);

      assert.ok(result.includes('Jack Torrance'), 'Must include character name');
      assert.ok(result.includes('dev'), 'Must include agent name');
    });

    it('should list all alternatives considered', () => {
      const result = formatConsultationRequest(VALID_REQUEST);

      for (const alt of VALID_REQUEST.alternativesConsidered) {
        assert.ok(result.includes(alt), `Must include alternative: ${alt}`);
      }
    });

    it('should include token budget as number', () => {
      const result = formatConsultationRequest(VALID_REQUEST);

      assert.ok(result.includes('1000'), 'Must include numeric token budget');
    });

    it('should validate request with all fields present', () => {
      const result = validateConsultationRequest(VALID_REQUEST);

      assert.strictEqual(result.valid, true, 'Valid request should pass validation');
      assert.strictEqual(result.errors.length, 0, 'No errors for valid request');
    });

    it('should reject request with empty question', () => {
      const invalid: ConsultationRequest = {
        ...VALID_REQUEST,
        question: '',
      };

      const result = validateConsultationRequest(invalid);

      assert.strictEqual(result.valid, false, 'Empty question should fail');
      assert.ok(result.errors.some(e => e.includes('question')),
        'Error must mention question field');
    });

    it('should reject request with empty partner', () => {
      const invalid: ConsultationRequest = {
        ...VALID_REQUEST,
        partner: '',
      };

      const result = validateConsultationRequest(invalid);

      assert.strictEqual(result.valid, false, 'Empty partner should fail');
      assert.ok(result.errors.some(e => e.includes('partner')),
        'Error must mention partner field');
    });

    it('should reject request with zero token budget', () => {
      const invalid: ConsultationRequest = {
        ...VALID_REQUEST,
        tokenBudget: 0,
      };

      const result = validateConsultationRequest(invalid);

      assert.strictEqual(result.valid, false, 'Zero budget should fail');
      assert.ok(result.errors.some(e => e.includes('tokenBudget')),
        'Error must mention tokenBudget field');
    });

    it('should reject request with negative token budget', () => {
      const invalid: ConsultationRequest = {
        ...VALID_REQUEST,
        tokenBudget: -100,
      };

      const result = validateConsultationRequest(invalid);

      assert.strictEqual(result.valid, false, 'Negative budget should fail');
    });
  });

  // =============================================================================
  // AC2: Consultation response format defined
  // =============================================================================

  describe('AC2: Consultation response format', () => {

    it('should parse well-formed response markdown', () => {
      const result = parseConsultationResponse(VALID_RESPONSE_MARKDOWN);

      assert.ok(result, 'Should parse valid response');
      assert.strictEqual(result!.recommendation, VALID_RESPONSE.recommendation);
      assert.strictEqual(result!.rationale, VALID_RESPONSE.rationale);
      assert.strictEqual(result!.watchOutFor, VALID_RESPONSE.watchOutFor);
      assert.strictEqual(result!.confidence, VALID_RESPONSE.confidence);
      assert.strictEqual(result!.tokenCount, VALID_RESPONSE.tokenCount);
    });

    it('should return null for completely malformed response', () => {
      const result = parseConsultationResponse('This is just plain text with no structure');

      assert.strictEqual(result, null, 'Should return null for unparseable response');
    });

    it('should handle response with missing confidence gracefully', () => {
      const partial = `**Recommendation:** Do X
**Rationale:** Because Y
**Watch-Out-For:** Edge case Z
**Token Count:** 50`;

      const result = parseConsultationResponse(partial);

      // Should still parse but with undefined/default confidence
      assert.ok(result === null || result.confidence === undefined,
        'Missing confidence should result in null or undefined confidence');
    });

    it('should handle response with missing token count', () => {
      const noTokenCount = `**Recommendation:** Do X
**Rationale:** Because Y
**Watch-Out-For:** Edge case Z
**Confidence:** medium`;

      const result = parseConsultationResponse(noTokenCount);

      // Should still parse but tokenCount should be 0 or NaN
      if (result) {
        assert.ok(result.tokenCount === 0 || Number.isNaN(result.tokenCount),
          'Missing token count should default to 0 or NaN');
      }
    });

    it('should validate response with all fields present', () => {
      const result = validateConsultationResponse(VALID_RESPONSE);

      assert.strictEqual(result.valid, true, 'Valid response should pass');
      assert.strictEqual(result.errors.length, 0);
    });

    it('should reject response with empty recommendation', () => {
      const invalid: ConsultationResponse = {
        ...VALID_RESPONSE,
        recommendation: '',
      };

      const result = validateConsultationResponse(invalid);

      assert.strictEqual(result.valid, false, 'Empty recommendation should fail');
      assert.ok(result.errors.some(e => e.includes('recommendation')));
    });

    it('should reject response with invalid confidence level', () => {
      const invalid: ConsultationResponse = {
        ...VALID_RESPONSE,
        confidence: 'very-high' as 'high',
      };

      const result = validateConsultationResponse(invalid);

      assert.strictEqual(result.valid, false, 'Invalid confidence should fail');
      assert.ok(result.errors.some(e => e.includes('confidence')));
    });

    it('should parse response with extra whitespace and newlines', () => {
      const messy = `
  **Recommendation:**   Use option A
**Rationale:**   It is simpler

**Watch-Out-For:**  Performance in edge cases
  **Confidence:**  low
**Token Count:**   42
`;

      const result = parseConsultationResponse(messy);

      assert.ok(result, 'Should handle whitespace gracefully');
      assert.strictEqual(result!.recommendation.trim(), 'Use option A');
      assert.strictEqual(result!.confidence, 'low');
      assert.strictEqual(result!.tokenCount, 42);
    });
  });

  // =============================================================================
  // AC3: Leader spawns partner via Task tool with model: sonnet
  // =============================================================================

  describe('AC3: Spawn partner with sonnet model', () => {

    it('should return model as sonnet (not haiku)', () => {
      const params = buildConsultationSpawnParams(VALID_REQUEST);

      assert.strictEqual(params.model, 'sonnet',
        'Consultation uses sonnet per ADR-0012, not haiku (which is for backseat)');
    });

    it('should return correct partner name', () => {
      const params = buildConsultationSpawnParams(VALID_REQUEST);

      assert.strictEqual(params.partner, 'architect');
    });

    it('should use sonnet for different partner agents', () => {
      const teaRequest: ConsultationRequest = {
        ...VALID_REQUEST,
        partner: 'tea',
      };

      const params = buildConsultationSpawnParams(teaRequest);

      assert.strictEqual(params.model, 'sonnet',
        'All consultation partners use sonnet regardless of agent type');
      assert.strictEqual(params.partner, 'tea');
    });
  });

  // =============================================================================
  // AC4: Partner prompt includes agent definition, persona, request
  // =============================================================================

  describe('AC4: Partner prompt composition', () => {

    it('should include agent definition in prompt', () => {
      const params: PartnerPromptParams = {
        agentDefinition: MOCK_AGENT_DEF,
        personaBlock: MOCK_PERSONA,
        formattedRequest: '**Question:** test?',
        tokenBudget: 1000,
      };

      const prompt = buildPartnerPrompt(params);

      assert.ok(prompt.includes(MOCK_AGENT_DEF),
        'Prompt must include full agent definition');
    });

    it('should include persona block in prompt', () => {
      const params: PartnerPromptParams = {
        agentDefinition: MOCK_AGENT_DEF,
        personaBlock: MOCK_PERSONA,
        formattedRequest: '**Question:** test?',
        tokenBudget: 1000,
      };

      const prompt = buildPartnerPrompt(params);

      assert.ok(prompt.includes(MOCK_PERSONA),
        'Prompt must include persona block');
    });

    it('should include formatted consultation request in prompt', () => {
      const formattedRequest = '**Question:** Should we use X or Y?';
      const params: PartnerPromptParams = {
        agentDefinition: MOCK_AGENT_DEF,
        personaBlock: MOCK_PERSONA,
        formattedRequest,
        tokenBudget: 1000,
      };

      const prompt = buildPartnerPrompt(params);

      assert.ok(prompt.includes(formattedRequest),
        'Prompt must include formatted request');
    });

    it('should include token budget instruction in prompt', () => {
      const params: PartnerPromptParams = {
        agentDefinition: MOCK_AGENT_DEF,
        personaBlock: MOCK_PERSONA,
        formattedRequest: '**Question:** test?',
        tokenBudget: 500,
      };

      const prompt = buildPartnerPrompt(params);

      assert.ok(prompt.includes('500'),
        'Prompt must include token budget number');
      assert.ok(prompt.toLowerCase().includes('token'),
        'Prompt must reference tokens');
    });

    it('should include response format instructions in prompt', () => {
      const params: PartnerPromptParams = {
        agentDefinition: MOCK_AGENT_DEF,
        personaBlock: MOCK_PERSONA,
        formattedRequest: '**Question:** test?',
        tokenBudget: 1000,
      };

      const prompt = buildPartnerPrompt(params);

      assert.ok(prompt.includes('**Recommendation:**'),
        'Prompt must instruct partner on response format');
      assert.ok(prompt.includes('**Confidence:**'),
        'Prompt must include confidence field in instructions');
    });
  });

  // =============================================================================
  // AC5: Response parsed and available to leader
  // =============================================================================

  describe('AC5: Full consultation execution with response', () => {

    it('should execute consultation and return parsed response', async () => {
      const adapter: ConsultationAdapter = {
        spawn: async () => ({ responseText: VALID_RESPONSE_MARKDOWN }),
      };

      const result = await executeConsultation({
        request: VALID_REQUEST,
        agentDefinition: MOCK_AGENT_DEF,
        personaBlock: MOCK_PERSONA,
        adapter,
      });

      assert.strictEqual(result.success, true, 'Consultation should succeed');
      assert.ok(result.data, 'Should have parsed data');
      assert.strictEqual(result.data!.response.recommendation, VALID_RESPONSE.recommendation);
      assert.strictEqual(result.data!.response.confidence, 'high');
    });

    it('should pass model: sonnet to adapter', async () => {
      let spawnedModel = '';
      const adapter: ConsultationAdapter = {
        spawn: async (params) => {
          spawnedModel = params.model;
          return { responseText: VALID_RESPONSE_MARKDOWN };
        },
      };

      await executeConsultation({
        request: VALID_REQUEST,
        agentDefinition: MOCK_AGENT_DEF,
        personaBlock: MOCK_PERSONA,
        adapter,
      });

      assert.strictEqual(spawnedModel, 'sonnet',
        'Must spawn partner with sonnet model');
    });

    it('should pass complete prompt to adapter', async () => {
      let receivedPrompt = '';
      const adapter: ConsultationAdapter = {
        spawn: async (params) => {
          receivedPrompt = params.prompt;
          return { responseText: VALID_RESPONSE_MARKDOWN };
        },
      };

      await executeConsultation({
        request: VALID_REQUEST,
        agentDefinition: MOCK_AGENT_DEF,
        personaBlock: MOCK_PERSONA,
        adapter,
      });

      assert.ok(receivedPrompt.includes(MOCK_AGENT_DEF), 'Prompt must include agent def');
      assert.ok(receivedPrompt.includes(MOCK_PERSONA), 'Prompt must include persona');
      assert.ok(receivedPrompt.includes(VALID_REQUEST.question), 'Prompt must include question');
    });
  });

  // =============================================================================
  // AC6: Graceful degradation
  // =============================================================================

  describe('AC6: Graceful degradation on partner failure', () => {

    it('should return degraded result when partner spawn fails', async () => {
      const adapter: ConsultationAdapter = {
        spawn: async () => { throw new Error('Connection refused'); },
      };

      const result = await executeConsultation({
        request: VALID_REQUEST,
        agentDefinition: MOCK_AGENT_DEF,
        personaBlock: MOCK_PERSONA,
        adapter,
      });

      assert.strictEqual(result.success, false, 'Should fail gracefully');
      assert.strictEqual(result.degraded, true, 'Must flag as degraded');
      assert.ok(result.error, 'Must include error message');
    });

    it('should not throw when partner spawn fails', async () => {
      const adapter: ConsultationAdapter = {
        spawn: async () => { throw new Error('Timeout'); },
      };

      await assert.doesNotReject(
        () => executeConsultation({
          request: VALID_REQUEST,
          agentDefinition: MOCK_AGENT_DEF,
          personaBlock: MOCK_PERSONA,
          adapter,
        }),
        'Must not throw — leader must continue working'
      );
    });

    it('should return degraded result when response is unparseable', async () => {
      const adapter: ConsultationAdapter = {
        spawn: async () => ({ responseText: 'completely garbled nonsense' }),
      };

      const result = await executeConsultation({
        request: VALID_REQUEST,
        agentDefinition: MOCK_AGENT_DEF,
        personaBlock: MOCK_PERSONA,
        adapter,
      });

      assert.strictEqual(result.success, false, 'Unparseable response should fail');
      assert.strictEqual(result.degraded, true, 'Must flag as degraded');
    });

    it('should include error context in degraded result', async () => {
      const adapter: ConsultationAdapter = {
        spawn: async () => { throw new Error('Model rate limited'); },
      };

      const result = await executeConsultation({
        request: VALID_REQUEST,
        agentDefinition: MOCK_AGENT_DEF,
        personaBlock: MOCK_PERSONA,
        adapter,
      });

      assert.ok(result.error?.includes('rate limited'),
        'Error should preserve original failure message');
    });
  });

  // =============================================================================
  // AC7: Token budget enforced via prompt instruction
  // =============================================================================

  describe('AC7: Token budget enforcement', () => {

    it('should flag response as over-budget when tokenCount exceeds budget', async () => {
      const overBudgetResponse = `**Recommendation:** Do X
**Rationale:** Because Y
**Watch-Out-For:** Edge case Z
**Confidence:** high
**Token Count:** 2000`;

      const adapter: ConsultationAdapter = {
        spawn: async () => ({ responseText: overBudgetResponse }),
      };

      const requestWithSmallBudget: ConsultationRequest = {
        ...VALID_REQUEST,
        tokenBudget: 500,
      };

      const result = await executeConsultation({
        request: requestWithSmallBudget,
        agentDefinition: MOCK_AGENT_DEF,
        personaBlock: MOCK_PERSONA,
        adapter,
      });

      assert.strictEqual(result.success, true, 'Over-budget should still succeed');
      assert.strictEqual(result.data!.overBudget, true,
        'Must flag over-budget response');
    });

    it('should not flag response as over-budget when within limit', async () => {
      const adapter: ConsultationAdapter = {
        spawn: async () => ({ responseText: VALID_RESPONSE_MARKDOWN }),
      };

      const result = await executeConsultation({
        request: VALID_REQUEST, // budget is 1000, response is 85
        agentDefinition: MOCK_AGENT_DEF,
        personaBlock: MOCK_PERSONA,
        adapter,
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data!.overBudget, false,
        'Within-budget response should not be flagged');
    });

    it('should include token budget in partner prompt as hard instruction', () => {
      const params: PartnerPromptParams = {
        agentDefinition: MOCK_AGENT_DEF,
        personaBlock: MOCK_PERSONA,
        formattedRequest: '**Question:** test?',
        tokenBudget: 750,
      };

      const prompt = buildPartnerPrompt(params);

      assert.ok(prompt.includes('750'), 'Must include specific budget number');
      assert.ok(
        prompt.toLowerCase().includes('must not exceed') ||
        prompt.toLowerCase().includes('do not exceed') ||
        prompt.toLowerCase().includes('limit'),
        'Must include enforcement language'
      );
    });
  });

  // =============================================================================
  // Result format compliance (framework pattern)
  // =============================================================================

  describe('Result format compliance', () => {

    it('should return {success, data?, error?} from executeConsultation on success', async () => {
      const adapter: ConsultationAdapter = {
        spawn: async () => ({ responseText: VALID_RESPONSE_MARKDOWN }),
      };

      const result = await executeConsultation({
        request: VALID_REQUEST,
        agentDefinition: MOCK_AGENT_DEF,
        personaBlock: MOCK_PERSONA,
        adapter,
      });

      assert.ok('success' in result, 'Must have success field');
      assert.ok(typeof result.success === 'boolean', 'success must be boolean');
    });

    it('should return {success, data?, error?, degraded?} from executeConsultation on failure', async () => {
      const adapter: ConsultationAdapter = {
        spawn: async () => { throw new Error('fail'); },
      };

      const result = await executeConsultation({
        request: VALID_REQUEST,
        agentDefinition: MOCK_AGENT_DEF,
        personaBlock: MOCK_PERSONA,
        adapter,
      });

      assert.ok('success' in result, 'Must have success field');
      assert.ok('degraded' in result, 'Must have degraded field on failure');
    });
  });
});
