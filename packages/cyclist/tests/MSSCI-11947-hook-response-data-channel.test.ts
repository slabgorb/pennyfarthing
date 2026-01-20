/**
 * MSSCI-11947: Hook Response Data Channel
 *
 * Tests for extending the PreToolUse hook system to return structured data
 * for interactive tools like AskUserQuestion and ExitPlanMode.
 *
 * Written in RED phase - tests should fail until Dev implements functionality.
 *
 * Acceptance Criteria:
 * - AC1: /approval-request endpoint accepts and returns structured data payloads
 * - AC2: AskUserQuestion modal renders question options and captures user selection
 * - AC3: ExitPlanMode modal shows plan content and captures approval with optional feedback
 * - AC4: Hook response includes `data` field that Claude receives in tool result
 * - AC5: Existing allow/deny flows continue to work unchanged
 *
 * Architecture:
 * ```
 * Claude Code → Hook Script → Cyclist Server → Modal → User Response
 *                                                        ↓
 * Claude Code ← Hook Script ← {decision, data} ← ← ← ← ←┘
 * ```
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import request from 'supertest';
import { Window } from 'happy-dom';

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Factory for AskUserQuestion tool_use messages
 */
const createAskUserQuestionToolUse = (
  questions: Array<{
    question: string;
    header: string;
    options: Array<{ label: string; description: string }>;
    multiSelect: boolean;
  }>,
  toolId = `ask-${Date.now()}`
) => ({
  type: 'tool_use',
  tool_name: 'AskUserQuestion',
  tool_id: toolId,
  input: { questions },
});

/**
 * Factory for ExitPlanMode tool_use messages
 */
const createExitPlanModeToolUse = (
  allowedPrompts: Array<{ tool: string; prompt: string }> = [],
  toolId = `exitplan-${Date.now()}`
) => ({
  type: 'tool_use',
  tool_name: 'ExitPlanMode',
  tool_id: toolId,
  input: { allowedPrompts },
});

/**
 * Sample single-select question
 */
const singleSelectQuestion = {
  question: 'Which authentication method should we use?',
  header: 'Auth method',
  options: [
    { label: 'OAuth 2.0', description: 'Use OAuth for third-party auth' },
    { label: 'JWT', description: 'Use JWT tokens for auth' },
    { label: 'Session', description: 'Use traditional session cookies' },
  ],
  multiSelect: false,
};

/**
 * Sample multi-select question
 */
const multiSelectQuestion = {
  question: 'Which features do you want to enable?',
  header: 'Features',
  options: [
    { label: 'Dark mode', description: 'Enable dark mode support' },
    { label: 'Notifications', description: 'Enable push notifications' },
    { label: 'Analytics', description: 'Enable usage analytics' },
  ],
  multiSelect: true,
};

// =============================================================================
// AC1: /approval-request endpoint accepts and returns structured data payloads
// =============================================================================
describe('AC1: /approval-request endpoint accepts and returns structured data payloads', () => {
  beforeEach(async () => {
    vi.resetModules();
  });

  describe('Response schema extension', () => {
    it('should include optional data field in approval response', async () => {
      const main = await import('../src/main.js');

      // The ApprovalResponse type should now include data field
      expect(main.resolveHookApproval).toBeDefined();

      // Test that resolveHookApproval accepts data parameter
      const resolveParams = main.resolveHookApproval.length;
      // Should accept: toolId, approved, grantScope?, data?
      expect(resolveParams).toBeGreaterThanOrEqual(2);
    });

    it('should export resolveHookApprovalWithData function', async () => {
      const main = await import('../src/main.js');

      // New function that handles data passthrough
      expect(main.resolveHookApprovalWithData).toBeDefined();
      expect(typeof main.resolveHookApprovalWithData).toBe('function');
    });
  });

  describe('AskUserQuestion data handling', () => {
    it('should accept AskUserQuestion tool input in approval request', async () => {
      const main = await import('../src/main.js');
      const settingsStore = await import('../src/settings-store.js');

      settingsStore.setBashApprovalGate(true);

      const toolUse = createAskUserQuestionToolUse([singleSelectQuestion]);

      // Function should recognize AskUserQuestion tool
      expect(main.isInteractiveToolUse).toBeDefined();
      expect(main.isInteractiveToolUse(toolUse)).toBe(true);

      settingsStore.setBashApprovalGate(false);
    });

    it('should return user answers in data field for single-select question', async () => {
      const main = await import('../src/main.js');
      const settingsStore = await import('../src/settings-store.js');

      settingsStore.setBashApprovalGate(true);

      const toolId = 'ask-single-1';
      const toolUse = createAskUserQuestionToolUse([singleSelectQuestion], toolId);

      // Start approval flow
      const pendingPromise = main.processInteractiveToolUse(toolUse);

      // Simulate user selecting an option
      main.resolveHookApprovalWithData(toolId, true, undefined, {
        answers: { '0': 'OAuth 2.0' },
      });

      const result = await pendingPromise;

      expect(result.decision).toBe('allow');
      expect(result.data).toBeDefined();
      expect(result.data.answers).toBeDefined();
      expect(result.data.answers['0']).toBe('OAuth 2.0');

      settingsStore.setBashApprovalGate(false);
    });

    it('should return user answers in data field for multi-select question', async () => {
      const main = await import('../src/main.js');
      const settingsStore = await import('../src/settings-store.js');

      settingsStore.setBashApprovalGate(true);

      const toolId = 'ask-multi-1';
      const toolUse = createAskUserQuestionToolUse([multiSelectQuestion], toolId);

      // Start approval flow
      const pendingPromise = main.processInteractiveToolUse(toolUse);

      // Simulate user selecting multiple options
      main.resolveHookApprovalWithData(toolId, true, undefined, {
        answers: { '0': ['Dark mode', 'Notifications'] },
      });

      const result = await pendingPromise;

      expect(result.decision).toBe('allow');
      expect(result.data?.answers['0']).toEqual(['Dark mode', 'Notifications']);

      settingsStore.setBashApprovalGate(false);
    });

    it('should handle "Other" custom input in answers', async () => {
      const main = await import('../src/main.js');
      const settingsStore = await import('../src/settings-store.js');

      settingsStore.setBashApprovalGate(true);

      const toolId = 'ask-other-1';
      const toolUse = createAskUserQuestionToolUse([singleSelectQuestion], toolId);

      const pendingPromise = main.processInteractiveToolUse(toolUse);

      // User selected "Other" and typed custom input
      main.resolveHookApprovalWithData(toolId, true, undefined, {
        answers: { '0': 'Custom: Use API keys' },
      });

      const result = await pendingPromise;

      expect(result.data?.answers['0']).toBe('Custom: Use API keys');

      settingsStore.setBashApprovalGate(false);
    });
  });

  describe('ExitPlanMode data handling', () => {
    it('should accept ExitPlanMode tool input in approval request', async () => {
      const main = await import('../src/main.js');

      const toolUse = createExitPlanModeToolUse([
        { tool: 'Bash', prompt: 'run tests' },
      ]);

      expect(main.isInteractiveToolUse(toolUse)).toBe(true);
    });

    it('should return approval status and feedback in data field', async () => {
      const main = await import('../src/main.js');
      const settingsStore = await import('../src/settings-store.js');

      settingsStore.setBashApprovalGate(true);

      const toolId = 'exitplan-1';
      const toolUse = createExitPlanModeToolUse([], toolId);

      const pendingPromise = main.processInteractiveToolUse(toolUse);

      // User approves the plan with feedback
      main.resolveHookApprovalWithData(toolId, true, undefined, {
        approved: true,
        feedback: 'Looks good, proceed with implementation',
      });

      const result = await pendingPromise;

      expect(result.decision).toBe('allow');
      expect(result.data?.approved).toBe(true);
      expect(result.data?.feedback).toBe('Looks good, proceed with implementation');

      settingsStore.setBashApprovalGate(false);
    });

    it('should handle plan rejection with feedback', async () => {
      const main = await import('../src/main.js');
      const settingsStore = await import('../src/settings-store.js');

      settingsStore.setBashApprovalGate(true);

      const toolId = 'exitplan-reject-1';
      const toolUse = createExitPlanModeToolUse([], toolId);

      const pendingPromise = main.processInteractiveToolUse(toolUse);

      // User rejects the plan
      main.resolveHookApprovalWithData(toolId, false, undefined, {
        approved: false,
        feedback: 'Need to consider edge cases first',
      });

      const result = await pendingPromise;

      // Decision is 'deny' because user rejected, but data contains feedback
      expect(result.decision).toBe('deny');
      expect(result.data?.approved).toBe(false);
      expect(result.data?.feedback).toBe('Need to consider edge cases first');

      settingsStore.setBashApprovalGate(false);
    });
  });

  describe('Data serialization round-trip', () => {
    it('should preserve complex data structures through JSON serialization', async () => {
      const main = await import('../src/main.js');

      const complexData = {
        answers: {
          '0': 'Option A',
          '1': ['Feature 1', 'Feature 2'],
          '2': 'Custom input with special chars: <>&"',
        },
        metadata: {
          timestamp: Date.now(),
          source: 'test',
        },
      };

      // Serialize and deserialize
      const serialized = JSON.stringify(complexData);
      const deserialized = JSON.parse(serialized);

      expect(deserialized).toEqual(complexData);

      // The endpoint should handle this correctly
      expect(main.serializeApprovalData).toBeDefined();
      expect(main.deserializeApprovalData).toBeDefined();
    });

    it('should handle empty data gracefully', async () => {
      const main = await import('../src/main.js');
      const settingsStore = await import('../src/settings-store.js');

      settingsStore.setBashApprovalGate(true);

      const toolId = 'ask-empty-1';
      const toolUse = createAskUserQuestionToolUse([singleSelectQuestion], toolId);

      const pendingPromise = main.processInteractiveToolUse(toolUse);

      // User closes modal without selecting anything
      main.resolveHookApprovalWithData(toolId, false, undefined, {});

      const result = await pendingPromise;

      expect(result.decision).toBe('deny');
      // Empty data should still be an object, not undefined
      expect(result.data).toBeDefined();

      settingsStore.setBashApprovalGate(false);
    });
  });
});

// =============================================================================
// AC2: AskUserQuestion modal renders question options and captures user selection
// =============================================================================
describe('AC2: AskUserQuestion modal renders question options and captures user selection', () => {
  let html: string;
  let document: Document;

  beforeEach(async () => {
    vi.resetModules();

    // Load the HTML to check DOM structure
    const { app } = await import('../src/server.js');
    const htmlResponse = await request(app).get('/');
    html = htmlResponse.text;

    const window = new Window();
    window.document.write(html);
    document = window.document;
  });

  describe('Question rendering exports', () => {
    it('should export renderAskUserQuestionForm function', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      expect(approvalModal.renderAskUserQuestionForm).toBeDefined();
      expect(typeof approvalModal.renderAskUserQuestionForm).toBe('function');
    });

    it('should export getAskUserQuestionAnswers function', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      expect(approvalModal.getAskUserQuestionAnswers).toBeDefined();
      expect(typeof approvalModal.getAskUserQuestionAnswers).toBe('function');
    });
  });

  describe('Single-select question rendering', () => {
    it('should render radio buttons for single-select questions', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      const toolId = 'ask-radio-test';
      approvalModal.showPermissionModal('AskUserQuestion', toolId, {
        questions: [singleSelectQuestion],
      });

      // Should render radio inputs
      const formHtml = approvalModal.getRenderedFormHtml();
      expect(formHtml).toMatch(/type=["']radio["']/);

      approvalModal.hideApprovalModal();
    });

    it('should render option labels and descriptions', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      approvalModal.showPermissionModal('AskUserQuestion', 'test', {
        questions: [singleSelectQuestion],
      });

      const formHtml = approvalModal.getRenderedFormHtml();

      // Should show option labels
      expect(formHtml).toContain('OAuth 2.0');
      expect(formHtml).toContain('JWT');
      expect(formHtml).toContain('Session');

      // Should show descriptions
      expect(formHtml).toContain('Use OAuth for third-party auth');

      approvalModal.hideApprovalModal();
    });

    it('should render question header', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      approvalModal.showPermissionModal('AskUserQuestion', 'test', {
        questions: [singleSelectQuestion],
      });

      const formHtml = approvalModal.getRenderedFormHtml();
      expect(formHtml).toContain('Auth method');

      approvalModal.hideApprovalModal();
    });

    it('should render the full question text', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      approvalModal.showPermissionModal('AskUserQuestion', 'test', {
        questions: [singleSelectQuestion],
      });

      const formHtml = approvalModal.getRenderedFormHtml();
      expect(formHtml).toContain('Which authentication method should we use?');

      approvalModal.hideApprovalModal();
    });
  });

  describe('Multi-select question rendering', () => {
    it('should render checkboxes for multi-select questions', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      approvalModal.showPermissionModal('AskUserQuestion', 'test', {
        questions: [multiSelectQuestion],
      });

      const formHtml = approvalModal.getRenderedFormHtml();
      expect(formHtml).toMatch(/type=["']checkbox["']/);

      approvalModal.hideApprovalModal();
    });

    it('should allow selecting multiple checkboxes', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      approvalModal.showPermissionModal('AskUserQuestion', 'test', {
        questions: [multiSelectQuestion],
      });

      // Simulate selecting multiple options
      approvalModal.selectOption(0, 'Dark mode');
      approvalModal.selectOption(0, 'Notifications');

      const answers = approvalModal.getAskUserQuestionAnswers();
      expect(answers['0']).toEqual(['Dark mode', 'Notifications']);

      approvalModal.hideApprovalModal();
    });
  });

  describe('Other option handling', () => {
    it('should render "Other" option for each question', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      approvalModal.showPermissionModal('AskUserQuestion', 'test', {
        questions: [singleSelectQuestion],
      });

      const formHtml = approvalModal.getRenderedFormHtml();
      expect(formHtml).toContain('Other');

      approvalModal.hideApprovalModal();
    });

    it('should show text input when "Other" is selected', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      approvalModal.showPermissionModal('AskUserQuestion', 'test', {
        questions: [singleSelectQuestion],
      });

      // Select "Other" option
      approvalModal.selectOtherOption(0);

      // Text input should become visible
      expect(approvalModal.isOtherInputVisible(0)).toBe(true);

      approvalModal.hideApprovalModal();
    });

    it('should capture custom text input', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      approvalModal.showPermissionModal('AskUserQuestion', 'test', {
        questions: [singleSelectQuestion],
      });

      approvalModal.selectOtherOption(0);
      approvalModal.setOtherInput(0, 'Use API keys');

      const answers = approvalModal.getAskUserQuestionAnswers();
      expect(answers['0']).toBe('Use API keys');

      approvalModal.hideApprovalModal();
    });
  });

  describe('Multiple questions rendering', () => {
    it('should render multiple questions in sequence', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      approvalModal.showPermissionModal('AskUserQuestion', 'test', {
        questions: [singleSelectQuestion, multiSelectQuestion],
      });

      const formHtml = approvalModal.getRenderedFormHtml();

      // Should contain both questions
      expect(formHtml).toContain('Which authentication method');
      expect(formHtml).toContain('Which features do you want');

      approvalModal.hideApprovalModal();
    });

    it('should capture answers for all questions', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      approvalModal.showPermissionModal('AskUserQuestion', 'test', {
        questions: [singleSelectQuestion, multiSelectQuestion],
      });

      // Answer first question
      approvalModal.selectOption(0, 'JWT');

      // Answer second question
      approvalModal.selectOption(1, 'Dark mode');
      approvalModal.selectOption(1, 'Analytics');

      const answers = approvalModal.getAskUserQuestionAnswers();

      expect(answers['0']).toBe('JWT');
      expect(answers['1']).toEqual(['Dark mode', 'Analytics']);

      approvalModal.hideApprovalModal();
    });
  });

  describe('Form submission', () => {
    it('should call response callback with answers on submit', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      const mockCallback = vi.fn();
      approvalModal.setResponseCallback(mockCallback);

      approvalModal.showPermissionModal('AskUserQuestion', 'ask-submit-1', {
        questions: [singleSelectQuestion],
      });

      approvalModal.selectOption(0, 'OAuth 2.0');
      approvalModal.handleSubmitAskUserQuestion();

      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          toolId: 'ask-submit-1',
          approved: true,
          data: {
            answers: { '0': 'OAuth 2.0' },
          },
        })
      );
    });

    it('should include grantScope: "once" by default for AskUserQuestion', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      const mockCallback = vi.fn();
      approvalModal.setResponseCallback(mockCallback);

      approvalModal.showPermissionModal('AskUserQuestion', 'test', {
        questions: [singleSelectQuestion],
      });

      approvalModal.selectOption(0, 'JWT');
      approvalModal.handleSubmitAskUserQuestion();

      // AskUserQuestion responses are always one-time (no persistent grants)
      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          grantScope: 'once',
        })
      );
    });
  });
});

// =============================================================================
// AC3: ExitPlanMode modal shows plan content and captures approval with feedback
// =============================================================================
describe('AC3: ExitPlanMode modal shows plan content and captures approval with feedback', () => {
  beforeEach(async () => {
    vi.resetModules();
  });

  describe('ExitPlanMode rendering exports', () => {
    it('should export renderExitPlanModeForm function', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      expect(approvalModal.renderExitPlanModeForm).toBeDefined();
      expect(typeof approvalModal.renderExitPlanModeForm).toBe('function');
    });

    it('should export getExitPlanModeResponse function', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      expect(approvalModal.getExitPlanModeResponse).toBeDefined();
      expect(typeof approvalModal.getExitPlanModeResponse).toBe('function');
    });
  });

  describe('Plan display', () => {
    it('should show plan content in modal', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      approvalModal.showPermissionModal('ExitPlanMode', 'plan-1', {
        allowedPrompts: [
          { tool: 'Bash', prompt: 'run tests' },
          { tool: 'Bash', prompt: 'install dependencies' },
        ],
      });

      const formHtml = approvalModal.getRenderedFormHtml();

      // Should show requested permissions
      expect(formHtml).toContain('run tests');
      expect(formHtml).toContain('install dependencies');

      approvalModal.hideApprovalModal();
    });

    it('should display plan file path if provided', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      approvalModal.showPermissionModal('ExitPlanMode', 'plan-1', {
        allowedPrompts: [],
        planFilePath: '/path/to/.claude/plan.md',
      });

      const formHtml = approvalModal.getRenderedFormHtml();
      expect(formHtml).toContain('.claude/plan.md');

      approvalModal.hideApprovalModal();
    });
  });

  describe('Approve/Reject buttons', () => {
    it('should have Approve Plan button', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      approvalModal.showPermissionModal('ExitPlanMode', 'plan-1', {
        allowedPrompts: [],
      });

      expect(approvalModal.hasApprovePlanButton()).toBe(true);

      approvalModal.hideApprovalModal();
    });

    it('should have Reject Plan button', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      approvalModal.showPermissionModal('ExitPlanMode', 'plan-1', {
        allowedPrompts: [],
      });

      expect(approvalModal.hasRejectPlanButton()).toBe(true);

      approvalModal.hideApprovalModal();
    });
  });

  describe('Feedback textarea', () => {
    it('should have optional feedback textarea', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      approvalModal.showPermissionModal('ExitPlanMode', 'plan-1', {
        allowedPrompts: [],
      });

      const formHtml = approvalModal.getRenderedFormHtml();
      expect(formHtml).toMatch(/<textarea|feedback/i);

      approvalModal.hideApprovalModal();
    });

    it('should capture feedback text', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      approvalModal.showPermissionModal('ExitPlanMode', 'plan-1', {
        allowedPrompts: [],
      });

      approvalModal.setPlanFeedback('Consider adding error handling');

      const response = approvalModal.getExitPlanModeResponse();
      expect(response.feedback).toBe('Consider adding error handling');

      approvalModal.hideApprovalModal();
    });
  });

  describe('Approval flow', () => {
    it('should call response callback with approved=true on approve', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      const mockCallback = vi.fn();
      approvalModal.setResponseCallback(mockCallback);

      approvalModal.showPermissionModal('ExitPlanMode', 'plan-approve-1', {
        allowedPrompts: [],
      });

      approvalModal.handleApprovePlan();

      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          toolId: 'plan-approve-1',
          approved: true,
          data: expect.objectContaining({
            approved: true,
          }),
        })
      );
    });

    it('should call response callback with approved=false on reject', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      const mockCallback = vi.fn();
      approvalModal.setResponseCallback(mockCallback);

      approvalModal.showPermissionModal('ExitPlanMode', 'plan-reject-1', {
        allowedPrompts: [],
      });

      approvalModal.setPlanFeedback('Need to reconsider the approach');
      approvalModal.handleRejectPlan();

      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          toolId: 'plan-reject-1',
          approved: false,
          data: expect.objectContaining({
            approved: false,
            feedback: 'Need to reconsider the approach',
          }),
        })
      );
    });

    it('should include feedback in both approve and reject responses', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      const mockCallback = vi.fn();
      approvalModal.setResponseCallback(mockCallback);

      approvalModal.showPermissionModal('ExitPlanMode', 'plan-feedback-1', {
        allowedPrompts: [],
      });

      approvalModal.setPlanFeedback('Good plan, just one suggestion...');
      approvalModal.handleApprovePlan();

      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            feedback: 'Good plan, just one suggestion...',
          }),
        })
      );
    });
  });
});

// =============================================================================
// AC4: Hook response includes `data` field that Claude receives in tool result
// =============================================================================
describe('AC4: Hook response includes data field that Claude receives in tool result', () => {
  beforeEach(async () => {
    vi.resetModules();
  });

  describe('Hook output formatting', () => {
    it('should export formatHookResponseWithData function', async () => {
      // This would be in the hook script, but we test the server-side formatting
      const main = await import('../src/main.js');

      expect(main.formatHookResponseWithData).toBeDefined();
      expect(typeof main.formatHookResponseWithData).toBe('function');
    });

    it('should include updatedInput in hook response when data present', async () => {
      const main = await import('../src/main.js');

      const response = main.formatHookResponseWithData('allow', 'User approved', {
        answers: { '0': 'OAuth 2.0' },
      });

      expect(response.decision).toBe('allow');
      expect(response.reason).toBe('User approved');
      expect(response.data).toEqual({ answers: { '0': 'OAuth 2.0' } });
    });

    it('should omit data field when no data provided', async () => {
      const main = await import('../src/main.js');

      const response = main.formatHookResponseWithData('allow', 'User approved');

      expect(response.decision).toBe('allow');
      expect(response.data).toBeUndefined();
    });
  });

  describe('updatedInput schema for AskUserQuestion', () => {
    it('should format answers as updatedInput for hook', async () => {
      const main = await import('../src/main.js');

      const answers = { '0': 'OAuth 2.0', '1': ['Feature A', 'Feature B'] };
      const updatedInput = main.formatUpdatedInputForAskUserQuestion(answers);

      expect(updatedInput).toEqual({
        answers: {
          '0': 'OAuth 2.0',
          '1': ['Feature A', 'Feature B'],
        },
      });
    });
  });

  describe('updatedInput schema for ExitPlanMode', () => {
    it('should format plan response as updatedInput for hook', async () => {
      const main = await import('../src/main.js');

      const planResponse = {
        approved: true,
        feedback: 'Looks good',
      };
      const updatedInput = main.formatUpdatedInputForExitPlanMode(planResponse);

      expect(updatedInput).toEqual({
        approved: true,
        feedback: 'Looks good',
      });
    });
  });

  describe('End-to-end data flow', () => {
    it('should pass data from modal through server to hook response', async () => {
      const main = await import('../src/main.js');
      const settingsStore = await import('../src/settings-store.js');

      settingsStore.setBashApprovalGate(true);

      const toolId = 'e2e-data-flow';
      const toolUse = createAskUserQuestionToolUse([singleSelectQuestion], toolId);

      // Start the approval flow
      const responsePromise = main.processInteractiveToolUse(toolUse);

      // Simulate user answering via modal
      main.resolveHookApprovalWithData(toolId, true, 'once', {
        answers: { '0': 'JWT' },
      });

      const response = await responsePromise;

      // The response should have the data that the hook will forward to Claude
      expect(response.decision).toBe('allow');
      expect(response.data).toEqual({ answers: { '0': 'JWT' } });

      settingsStore.setBashApprovalGate(false);
    });
  });
});

// =============================================================================
// AC5: Existing allow/deny flows continue to work unchanged
// =============================================================================
describe('AC5: Existing allow/deny flows continue to work unchanged', () => {
  beforeEach(async () => {
    vi.resetModules();
  });

  describe('Bash approval backward compatibility', () => {
    it('should still use resolveHookApproval for Bash commands', async () => {
      const main = await import('../src/main.js');
      const settingsStore = await import('../src/settings-store.js');

      settingsStore.setBashApprovalGate(true);
      settingsStore.clearAllGrants();

      const toolId = 'bash-compat-1';

      // The old function should still work
      expect(main.resolveHookApproval).toBeDefined();

      settingsStore.setBashApprovalGate(false);
    });

    it('should not include data field for Bash allow responses', async () => {
      const main = await import('../src/main.js');
      const approvalGate = await import('../src/approval-gate.js');
      const settingsStore = await import('../src/settings-store.js');

      settingsStore.setBashApprovalGate(true);
      settingsStore.clearAllGrants();

      const toolId = 'bash-nodata-1';

      // Process a Bash command
      const pendingPromise = main.processToolUseWithApproval({
        type: 'tool_use',
        tool_name: 'Bash',
        tool_id: toolId,
        input: { command: 'npm test' },
      });

      // Resolve with old-style approval (no data)
      approvalGate.resolveApproval(toolId, true, 'once');

      const result = await pendingPromise;

      // Result should work but not have data field
      expect(result.approved).toBe(true);
      expect(result.data).toBeUndefined();

      settingsStore.setBashApprovalGate(false);
    });
  });

  describe('Grant creation backward compatibility', () => {
    it('should still create grants for Bash commands with grantScope', async () => {
      const main = await import('../src/main.js');
      const approvalGate = await import('../src/approval-gate.js');
      const settingsStore = await import('../src/settings-store.js');

      settingsStore.setBashApprovalGate(true);
      settingsStore.clearAllGrants();

      const toolId = 'bash-grant-1';

      const pendingPromise = main.processToolUseWithApproval({
        type: 'tool_use',
        tool_name: 'Bash',
        tool_id: toolId,
        input: { command: 'npm install' },
      });

      approvalGate.resolveApproval(toolId, true, 'session');
      await pendingPromise;

      const grants = settingsStore.getGrants();
      const sessionGrant = grants.find(g => g.grant_type === 'session');
      expect(sessionGrant).toBeDefined();

      settingsStore.setBashApprovalGate(false);
    });
  });

  describe('Rejection backward compatibility', () => {
    it('should still reject Bash commands without data field', async () => {
      const main = await import('../src/main.js');
      const approvalGate = await import('../src/approval-gate.js');
      const settingsStore = await import('../src/settings-store.js');

      settingsStore.setBashApprovalGate(true);
      settingsStore.clearAllGrants();

      const toolId = 'bash-reject-compat';

      const pendingPromise = main.processToolUseWithApproval({
        type: 'tool_use',
        tool_name: 'Bash',
        tool_id: toolId,
        input: { command: 'rm -rf /' },
      });

      approvalGate.resolveApproval(toolId, false);

      const result = await pendingPromise;

      expect(result.approved).toBe(false);
      expect(result.rejected).toBe(true);
      expect(result.data).toBeUndefined();

      settingsStore.setBashApprovalGate(false);
    });
  });

  describe('ApprovalModal backward compatibility', () => {
    it('should still export showApprovalModal for Bash commands', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      expect(approvalModal.showApprovalModal).toBeDefined();

      // Legacy function should still work
      approvalModal.showApprovalModal('npm test', 'legacy-bash-1');
      expect(approvalModal.isModalVisible()).toBe(true);
      expect(approvalModal.getDisplayedCommand()).toBe('npm test');

      approvalModal.hideApprovalModal();
    });

    it('should still export isBashCommand function', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      expect(approvalModal.isBashCommand).toBeDefined();

      const bashMsg = {
        type: 'tool_use',
        tool_name: 'Bash',
        tool_id: 'test',
        input: { command: 'ls' },
      };

      expect(approvalModal.isBashCommand(bashMsg)).toBe(true);
    });

    it('should still export getCommandSafetyLevel for Bash', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      expect(approvalModal.getCommandSafetyLevel('ls -la')).toBe('safe');
      expect(approvalModal.getCommandSafetyLevel('rm -rf /')).toBe('danger');
    });

    it('should still support all three grant scopes for Bash', async () => {
      const approvalModal = await import('../src/public/js/components/ApprovalModal.js');

      const mockCallback = vi.fn();
      approvalModal.setResponseCallback(mockCallback);

      // Test once scope
      approvalModal.showApprovalModal('npm test', 'once-test');
      approvalModal.handleAllowOnce();
      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({ grantScope: 'once' })
      );

      // Test session scope
      approvalModal.showApprovalModal('npm install', 'session-test');
      approvalModal.handleAllowSession();
      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({ grantScope: 'session' })
      );

      // Test always scope
      approvalModal.showApprovalModal('git status', 'always-test');
      approvalModal.handleAlwaysAllow();
      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({ grantScope: 'always' })
      );
    });
  });

  describe('Response schema backward compatibility', () => {
    it('should still return { decision, reason } for non-interactive tools', async () => {
      const main = await import('../src/main.js');
      const settingsStore = await import('../src/settings-store.js');

      // Gate disabled - should return simple response
      settingsStore.setBashApprovalGate(false);

      const response = main.formatHookResponseWithData('allow', 'Gate disabled');

      expect(response).toEqual({
        decision: 'allow',
        reason: 'Gate disabled',
      });
    });

    it('should handle legacy approval-gate.ts functions', async () => {
      const approvalGate = await import('../src/approval-gate.js');

      expect(approvalGate.interceptToolUse).toBeDefined();
      expect(approvalGate.resolveApproval).toBeDefined();
      expect(approvalGate.clearPendingApprovals).toBeDefined();
      expect(approvalGate.getQueueLength).toBeDefined();
    });
  });
});

// =============================================================================
// Integration: Full flow tests
// =============================================================================
describe('Integration: Full AskUserQuestion flow', () => {
  beforeEach(async () => {
    vi.resetModules();
  });

  it('should complete full flow: tool_use → modal → answer → hook response', async () => {
    const main = await import('../src/main.js');
    const approvalModal = await import('../src/public/js/components/ApprovalModal.js');
    const settingsStore = await import('../src/settings-store.js');

    settingsStore.setBashApprovalGate(true);

    const toolId = 'full-flow-ask';
    const questions = [singleSelectQuestion];

    // Step 1: Tool use arrives
    const responsePromise = main.processInteractiveToolUse(
      createAskUserQuestionToolUse(questions, toolId)
    );

    // Step 2: Modal would be shown (we simulate the answer)
    // In real flow, broadcastToRenderer triggers modal, user answers, callback fires

    // Step 3: User selects an answer
    main.resolveHookApprovalWithData(toolId, true, 'once', {
      answers: { '0': 'JWT' },
    });

    // Step 4: Response completes with data
    const response = await responsePromise;

    expect(response.decision).toBe('allow');
    expect(response.data).toEqual({ answers: { '0': 'JWT' } });

    settingsStore.setBashApprovalGate(false);
  });
});

describe('Integration: Full ExitPlanMode flow', () => {
  beforeEach(async () => {
    vi.resetModules();
  });

  it('should complete full flow: tool_use → modal → approve → hook response', async () => {
    const main = await import('../src/main.js');
    const settingsStore = await import('../src/settings-store.js');

    settingsStore.setBashApprovalGate(true);

    const toolId = 'full-flow-plan';
    const allowedPrompts = [{ tool: 'Bash', prompt: 'run tests' }];

    // Step 1: Tool use arrives
    const responsePromise = main.processInteractiveToolUse(
      createExitPlanModeToolUse(allowedPrompts, toolId)
    );

    // Step 2: User approves with feedback
    main.resolveHookApprovalWithData(toolId, true, 'once', {
      approved: true,
      feedback: 'Ship it!',
    });

    // Step 3: Response completes with data
    const response = await responsePromise;

    expect(response.decision).toBe('allow');
    expect(response.data).toEqual({
      approved: true,
      feedback: 'Ship it!',
    });

    settingsStore.setBashApprovalGate(false);
  });

  it('should handle plan rejection with feedback', async () => {
    const main = await import('../src/main.js');
    const settingsStore = await import('../src/settings-store.js');

    settingsStore.setBashApprovalGate(true);

    const toolId = 'full-flow-plan-reject';

    const responsePromise = main.processInteractiveToolUse(
      createExitPlanModeToolUse([], toolId)
    );

    main.resolveHookApprovalWithData(toolId, false, undefined, {
      approved: false,
      feedback: 'Please add error handling',
    });

    const response = await responsePromise;

    expect(response.decision).toBe('deny');
    expect(response.data).toEqual({
      approved: false,
      feedback: 'Please add error handling',
    });

    settingsStore.setBashApprovalGate(false);
  });
});
