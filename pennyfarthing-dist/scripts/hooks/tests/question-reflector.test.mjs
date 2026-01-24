#!/usr/bin/env node
/**
 * question-reflector.test.mjs - Tests for question reflector enforcement hook
 *
 * Story: MSSCI-12393
 * TDD Phase: RED
 *
 * Run with: node --test pennyfarthing-dist/scripts/hooks/tests/question-reflector.test.mjs
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert';

// The module under test
import {
  detectQuestion,
  hasReflectorMarker,
  shouldSkipEnforcement,
  extractLastAssistantMessage,
  checkQuestionReflector,
  checkAskUserQuestion,
} from '../question-reflector-check.mjs';

// =============================================================================
// Test Fixtures
// =============================================================================

const MARKERS = {
  yesno: '<!-- CYCLIST:QUESTION:yesno -->',
  open: '<!-- CYCLIST:QUESTION:open -->',
  choices: '<!-- CYCLIST:CHOICES:option1,option2,option3 -->',
};

const CONFIG_MANUAL = {
  workflow: { permission_mode: 'manual' },
};

const CONFIG_ACCEPT = {
  workflow: { permission_mode: 'accept' },
};

const CONFIG_TURBO_LEGACY = {
  workflow: { permission_mode: 'turbo' },
};

const CONFIG_RELAY_ON = {
  workflow: { permission_mode: 'accept', relay_mode: true },
};

const CONFIG_RELAY_OFF = {
  workflow: { permission_mode: 'accept', relay_mode: false },
};

// =============================================================================
// Relay/Turbo Mode Bypass Tests
// =============================================================================

describe('shouldSkipEnforcement', () => {
  it('should skip enforcement when permission_mode is turbo (legacy)', () => {
    const result = shouldSkipEnforcement(CONFIG_TURBO_LEGACY);
    assert.strictEqual(result, true);
  });

  it('should skip enforcement when relay_mode is true', () => {
    const result = shouldSkipEnforcement(CONFIG_RELAY_ON);
    assert.strictEqual(result, true);
  });

  it('should NOT skip enforcement when relay_mode is false', () => {
    const result = shouldSkipEnforcement(CONFIG_RELAY_OFF);
    assert.strictEqual(result, false);
  });

  it('should NOT skip enforcement in manual mode without relay', () => {
    const result = shouldSkipEnforcement(CONFIG_MANUAL);
    assert.strictEqual(result, false);
  });

  it('should NOT skip enforcement in accept mode without relay', () => {
    const result = shouldSkipEnforcement(CONFIG_ACCEPT);
    assert.strictEqual(result, false);
  });
});

// =============================================================================
// Question Detection Tests - Direct Questions
// =============================================================================

describe('detectQuestion - direct questions', () => {
  it('should detect question mark at end of message', () => {
    const msg = 'What would you like me to do?';
    const result = detectQuestion(msg);
    assert.strictEqual(result.detected, true);
    assert.strictEqual(result.type, 'direct');
  });

  it('should detect question mark mid-message followed by new sentence', () => {
    const msg = 'What do you need? I can help with several things.';
    const result = detectQuestion(msg);
    assert.strictEqual(result.detected, true);
    assert.strictEqual(result.type, 'direct');
  });

  it('should detect question mark followed by newline and more content', () => {
    const msg = 'What do you need?\n\nHere are your options:';
    const result = detectQuestion(msg);
    assert.strictEqual(result.detected, true);
    assert.strictEqual(result.type, 'direct');
  });

  it('should detect multiple questions in message', () => {
    const msg = 'Should I proceed? Or would you prefer a different approach?';
    const result = detectQuestion(msg);
    assert.strictEqual(result.detected, true);
  });
});

// =============================================================================
// Question Detection Tests - Implicit Questions
// =============================================================================

describe('detectQuestion - implicit questions', () => {
  it('should detect "would you like"', () => {
    const msg = 'I can fix this. Would you like me to proceed.';
    const result = detectQuestion(msg);
    assert.strictEqual(result.detected, true);
    assert.strictEqual(result.type, 'implicit');
  });

  it('should detect "should I"', () => {
    const msg = 'The tests are passing. Should I commit the changes.';
    const result = detectQuestion(msg);
    assert.strictEqual(result.detected, true);
    assert.strictEqual(result.type, 'implicit');
  });

  it('should detect "do you want"', () => {
    const msg = 'Do you want me to run the full test suite.';
    const result = detectQuestion(msg);
    assert.strictEqual(result.detected, true);
    assert.strictEqual(result.type, 'implicit');
  });

  it('should detect "let me know if"', () => {
    const msg = 'I made the changes. Let me know if you need anything else.';
    const result = detectQuestion(msg);
    assert.strictEqual(result.detected, true);
    assert.strictEqual(result.type, 'implicit');
  });

  it('should detect "what do you think"', () => {
    const msg = 'Here is my proposed solution. What do you think.';
    const result = detectQuestion(msg);
    assert.strictEqual(result.detected, true);
    assert.strictEqual(result.type, 'implicit');
  });

  it('should detect "your preference"', () => {
    const msg = 'Both approaches work. Your preference on which to use.';
    const result = detectQuestion(msg);
    assert.strictEqual(result.detected, true);
    assert.strictEqual(result.type, 'implicit');
  });

  it('should detect "ready to proceed"', () => {
    const msg = 'Everything is set up. Ready to proceed with the deployment.';
    const result = detectQuestion(msg);
    assert.strictEqual(result.detected, true);
    assert.strictEqual(result.type, 'implicit');
  });
});

// =============================================================================
// Question Detection Tests - Choice Offerings
// =============================================================================

describe('detectQuestion - choice offerings', () => {
  it('should detect "option A" style choices', () => {
    const msg = 'We have two paths: Option A uses Redis, Option B uses memory.';
    const result = detectQuestion(msg);
    assert.strictEqual(result.detected, true);
    assert.strictEqual(result.type, 'choices');
  });

  it('should detect "we could either"', () => {
    const msg = 'We could either refactor now or defer to next sprint.';
    const result = detectQuestion(msg);
    assert.strictEqual(result.detected, true);
    assert.strictEqual(result.type, 'choices');
  });

  it('should detect "alternatively"', () => {
    const msg = 'I can add it inline. Alternatively, we create a helper function.';
    const result = detectQuestion(msg);
    assert.strictEqual(result.detected, true);
    assert.strictEqual(result.type, 'choices');
  });

  it('should detect "or would you prefer"', () => {
    const msg = 'I can use async/await, or would you prefer callbacks.';
    const result = detectQuestion(msg);
    assert.strictEqual(result.detected, true);
    assert.strictEqual(result.type, 'choices');
  });

  it('should detect "choose between"', () => {
    const msg = 'You can choose between TypeScript or JavaScript.';
    const result = detectQuestion(msg);
    assert.strictEqual(result.detected, true);
    assert.strictEqual(result.type, 'choices');
  });
});

// =============================================================================
// Marker Detection Tests
// =============================================================================

describe('hasReflectorMarker', () => {
  it('should detect QUESTION:yesno marker', () => {
    const msg = `${MARKERS.yesno}\nShould I proceed?`;
    const result = hasReflectorMarker(msg);
    assert.strictEqual(result, true);
  });

  it('should detect QUESTION:open marker', () => {
    const msg = `${MARKERS.open}\nWhat approach would you prefer?`;
    const result = hasReflectorMarker(msg);
    assert.strictEqual(result, true);
  });

  it('should detect CHOICES marker', () => {
    const msg = `${MARKERS.choices}\nOption 1 or Option 2?`;
    const result = hasReflectorMarker(msg);
    assert.strictEqual(result, true);
  });

  it('should detect marker with extra whitespace', () => {
    const msg = '<!--  CYCLIST:QUESTION:yesno  -->\nShould I proceed?';
    const result = hasReflectorMarker(msg);
    assert.strictEqual(result, true);
  });

  it('should return false when no marker present', () => {
    const msg = 'Should I proceed?';
    const result = hasReflectorMarker(msg);
    assert.strictEqual(result, false);
  });
});

// =============================================================================
// False Positive Prevention Tests - Code Blocks
// =============================================================================

describe('detectQuestion - code block immunity', () => {
  it('should NOT detect questions inside fenced code blocks', () => {
    const msg = `Here is the code:
\`\`\`javascript
// What should this function return?
function test() { return true; }
\`\`\`
The implementation is complete.`;
    const result = detectQuestion(msg);
    assert.strictEqual(result.detected, false);
  });

  it('should NOT detect questions inside inline code', () => {
    const msg = 'The function `shouldIProceed()` returns a boolean.';
    const result = detectQuestion(msg);
    assert.strictEqual(result.detected, false);
  });

  it('should detect questions OUTSIDE code blocks', () => {
    const msg = `Here is the code:
\`\`\`javascript
function test() { return true; }
\`\`\`
What do you think?`;
    const result = detectQuestion(msg);
    assert.strictEqual(result.detected, true);
  });

  it('should handle multiple code blocks correctly', () => {
    const msg = `First block:
\`\`\`
code here?
\`\`\`
Second block:
\`\`\`
more code?
\`\`\`
Done.`;
    const result = detectQuestion(msg);
    assert.strictEqual(result.detected, false);
  });
});

// =============================================================================
// False Positive Prevention Tests - Rhetorical Questions
// =============================================================================

describe('detectQuestion - rhetorical question immunity', () => {
  it('should NOT detect "the question was"', () => {
    const msg = 'The question was whether to use async or sync. I chose async.';
    const result = detectQuestion(msg);
    assert.strictEqual(result.detected, false);
  });

  it('should NOT detect "the question is"', () => {
    const msg = 'The question is rhetorical. Here is the answer.';
    const result = detectQuestion(msg);
    assert.strictEqual(result.detected, false);
  });

  it('should NOT detect "asked whether"', () => {
    const msg = 'You asked whether this was possible. Yes, it is.';
    const result = detectQuestion(msg);
    assert.strictEqual(result.detected, false);
  });

  it('should NOT detect "wondering if"', () => {
    const msg = 'I was wondering if this approach would work. It does.';
    const result = detectQuestion(msg);
    assert.strictEqual(result.detected, false);
  });
});

// =============================================================================
// No Question Tests
// =============================================================================

describe('detectQuestion - no question present', () => {
  it('should NOT detect statements without questions', () => {
    const msg = 'I have completed the implementation. All tests pass.';
    const result = detectQuestion(msg);
    assert.strictEqual(result.detected, false);
  });

  it('should NOT detect exclamations', () => {
    const msg = 'Done! The feature is ready.';
    const result = detectQuestion(msg);
    assert.strictEqual(result.detected, false);
  });

  it('should NOT detect periods only', () => {
    const msg = 'Task complete. Moving on to the next item.';
    const result = detectQuestion(msg);
    assert.strictEqual(result.detected, false);
  });
});

// =============================================================================
// Transcript Extraction Tests
// =============================================================================

describe('extractLastAssistantMessage', () => {
  it('should extract last assistant message from JSONL', () => {
    const transcript = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
      { role: 'user', content: 'Help me' },
      { role: 'assistant', content: 'What do you need?' },
    ];
    const result = extractLastAssistantMessage(transcript);
    assert.strictEqual(result, 'What do you need?');
  });

  it('should handle content as array of text blocks', () => {
    const transcript = [
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'First part. ' },
          { type: 'text', text: 'What do you think?' },
        ],
      },
    ];
    const result = extractLastAssistantMessage(transcript);
    assert.strictEqual(result, 'First part. What do you think?');
  });

  it('should return empty string when no assistant message', () => {
    const transcript = [{ role: 'user', content: 'Hello' }];
    const result = extractLastAssistantMessage(transcript);
    assert.strictEqual(result, '');
  });

  it('should skip tool_use content blocks', () => {
    const transcript = [
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Let me check.' },
          { type: 'tool_use', id: '123', name: 'Read' },
        ],
      },
    ];
    const result = extractLastAssistantMessage(transcript);
    assert.strictEqual(result, 'Let me check.');
  });
});

// =============================================================================
// Integration Tests - Full Hook Logic
// =============================================================================

describe('checkQuestionReflector - integration', () => {
  it('should return ok:true when no question detected', () => {
    const input = {
      transcript_path: '/tmp/test.jsonl',
      stop_hook_active: false,
    };
    const config = CONFIG_MANUAL;
    const lastMessage = 'Task complete. All done.';
    const result = checkQuestionReflector(input, config, lastMessage);
    assert.deepStrictEqual(result, { ok: true });
  });

  it('should return ok:true when question has marker', () => {
    const input = {
      transcript_path: '/tmp/test.jsonl',
      stop_hook_active: false,
    };
    const config = CONFIG_MANUAL;
    const lastMessage = `${MARKERS.yesno}\nShould I proceed?`;
    const result = checkQuestionReflector(input, config, lastMessage);
    assert.deepStrictEqual(result, { ok: true });
  });

  it('should return ok:true when in turbo mode (legacy)', () => {
    const input = {
      transcript_path: '/tmp/test.jsonl',
      stop_hook_active: false,
    };
    const config = CONFIG_TURBO_LEGACY;
    const lastMessage = 'What do you need?'; // No marker, but turbo mode
    const result = checkQuestionReflector(input, config, lastMessage);
    assert.deepStrictEqual(result, { ok: true });
  });

  it('should return ok:true when relay_mode is true', () => {
    const input = {
      transcript_path: '/tmp/test.jsonl',
      stop_hook_active: false,
    };
    const config = CONFIG_RELAY_ON;
    const lastMessage = 'What do you need?'; // No marker, but relay on
    const result = checkQuestionReflector(input, config, lastMessage);
    assert.deepStrictEqual(result, { ok: true });
  });

  it('should return ok:true when stop_hook_active is true', () => {
    const input = {
      transcript_path: '/tmp/test.jsonl',
      stop_hook_active: true, // Prevent infinite loops
    };
    const config = CONFIG_MANUAL;
    const lastMessage = 'What do you need?';
    const result = checkQuestionReflector(input, config, lastMessage);
    assert.deepStrictEqual(result, { ok: true });
  });

  it('should block when question detected without marker', () => {
    const input = {
      transcript_path: '/tmp/test.jsonl',
      stop_hook_active: false,
    };
    const config = CONFIG_MANUAL;
    const lastMessage = 'What do you need?';
    const result = checkQuestionReflector(input, config, lastMessage);
    assert.strictEqual(result.decision, 'block');
    assert.ok(result.reason.includes('CYCLIST:QUESTION'));
  });

  it('should include appropriate marker hint for direct questions', () => {
    const input = {
      transcript_path: '/tmp/test.jsonl',
      stop_hook_active: false,
    };
    const config = CONFIG_MANUAL;
    const lastMessage = 'Should I proceed?';
    const result = checkQuestionReflector(input, config, lastMessage);
    assert.strictEqual(result.decision, 'block');
    assert.ok(result.reason.includes('CYCLIST:QUESTION:yesno'));
  });

  it('should include appropriate marker hint for choices', () => {
    const input = {
      transcript_path: '/tmp/test.jsonl',
      stop_hook_active: false,
    };
    const config = CONFIG_MANUAL;
    const lastMessage = 'We could either use Option A or Option B.';
    const result = checkQuestionReflector(input, config, lastMessage);
    assert.strictEqual(result.decision, 'block');
    assert.ok(result.reason.includes('CYCLIST:CHOICES'));
  });
});

// =============================================================================
// AskUserQuestion PreToolUse Hook Tests
// =============================================================================

describe('checkAskUserQuestion - PreToolUse hook', () => {
  it('should return ok:true when relay_mode is true', () => {
    const input = {
      tool_name: 'AskUserQuestion',
      tool_input: { questions: [{ question: 'Which option?' }] },
    };
    const config = CONFIG_RELAY_ON;
    const result = checkAskUserQuestion(input, config);
    assert.deepStrictEqual(result, { ok: true });
  });

  it('should return ok:true when in turbo mode (legacy)', () => {
    const input = {
      tool_name: 'AskUserQuestion',
      tool_input: { questions: [{ question: 'Which option?' }] },
    };
    const config = CONFIG_TURBO_LEGACY;
    const result = checkAskUserQuestion(input, config);
    assert.deepStrictEqual(result, { ok: true });
  });

  it('should block AskUserQuestion without prior marker in transcript', () => {
    const input = {
      tool_name: 'AskUserQuestion',
      tool_input: { questions: [{ question: 'Which option?' }] },
    };
    const config = CONFIG_MANUAL;
    const transcriptWithoutMarker = 'Here are some choices.';
    const result = checkAskUserQuestion(input, config, transcriptWithoutMarker);
    assert.strictEqual(result.decision, 'block');
  });

  it('should allow AskUserQuestion when marker present in recent output', () => {
    const input = {
      tool_name: 'AskUserQuestion',
      tool_input: { questions: [{ question: 'Which option?' }] },
    };
    const config = CONFIG_MANUAL;
    const transcriptWithMarker = `${MARKERS.choices}\nHere are some choices.`;
    const result = checkAskUserQuestion(input, config, transcriptWithMarker);
    assert.deepStrictEqual(result, { ok: true });
  });
});
