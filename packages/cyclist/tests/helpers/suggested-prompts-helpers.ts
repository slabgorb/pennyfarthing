/**
 * Shared test helpers for suggested prompts tests
 *
 * Eliminates repetitive imports and provides common test utilities
 */

import { vi } from 'vitest';

// Lazy-loaded module cache
let messageViewModule: typeof import('../../src/public/js/components/MessageView.js') | null = null;
let editorModule: typeof import('../../src/public/js/editor.js') | null = null;

/**
 * Get the MessageView module (cached after first import)
 */
export async function getMessageView() {
  if (!messageViewModule) {
    messageViewModule = await import('../../src/public/js/components/MessageView.js');
  }
  return messageViewModule;
}

/**
 * Get the editor module (cached after first import)
 */
export async function getEditor() {
  if (!editorModule) {
    editorModule = await import('../../src/public/js/editor.js');
  }
  return editorModule;
}

/**
 * Reset module cache (call in afterEach if needed)
 */
export function resetModuleCache() {
  messageViewModule = null;
  editorModule = null;
}

/**
 * Create a mock assistant message for testing processMessageForQuickActions
 */
export function createAssistantMessage(text: string | string[]) {
  const content = Array.isArray(text)
    ? text.map(t => ({ type: 'text' as const, text: t }))
    : [{ type: 'text' as const, text }];

  return {
    type: 'assistant' as const,
    message: { content },
  };
}

/**
 * Create a mock tool result message
 */
export function createToolResultMessage(output: string, toolId = 'test') {
  return {
    type: 'tool_result' as const,
    tool_id: toolId,
    output,
  };
}

/**
 * Mock insertAndSubmit and return the spy for assertions
 */
export async function mockInsertAndSubmit() {
  const editor = await getEditor();
  return vi.spyOn(editor, 'insertAndSubmit').mockImplementation(() => {});
}
