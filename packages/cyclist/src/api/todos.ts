/**
 * Todos API Router
 *
 * Provides HTTP API endpoint for todo list data.
 * In web mode, todos are limited since they come from Claude's message stream
 * which is only available in Electron mode. This endpoint returns empty array
 * in web mode to allow graceful degradation.
 *
 * GET /api/todos - Get current todos (empty in web mode)
 */

import { Router } from 'express';

// In-memory todos store for web mode
// In Electron mode, todos are managed by main.ts and accessed via IPC
// In web mode, this could be populated via WebSocket in the future
let webModeTodos: Array<{
  id: string;
  content: string;
  activeForm: string;
  status: 'pending' | 'in_progress' | 'completed';
  blockedBy?: string[];
  blocks?: string[];
}> = [];

/**
 * Update todos from external source (for future WebSocket integration)
 */
export function setWebModeTodos(todos: typeof webModeTodos): void {
  webModeTodos = todos;
}

/**
 * Get current web mode todos
 */
export function getWebModeTodos(): typeof webModeTodos {
  return webModeTodos;
}

/**
 * Create the todos router
 */
export function createTodosRouter(): Router {
  const router = Router();

  /**
   * GET / - Get current todos
   * Returns empty array in web mode (todos require Claude message stream)
   */
  router.get('/', (_req, res) => {
    // In web mode, return whatever todos we have (usually empty)
    // In the future, this could be populated via WebSocket from Claude stream
    res.json(webModeTodos);
  });

  return router;
}
