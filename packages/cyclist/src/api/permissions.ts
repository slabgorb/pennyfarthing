/**
 * Permissions API Router
 *
 * Bridges the /permissions skill to settings-store.ts grant management.
 *
 * Story: MSSCI-14325 - Connect /permissions skill to grant store
 *
 * Routes:
 * - GET /              List all active grants
 * - POST /grant        Add a permission grant
 * - DELETE /revoke/:tool  Revoke grants for a tool
 * - GET /show/:tool    Show grants for a specific tool
 */

import { Router } from 'express';

export function createPermissionsRouter(): Router {
  const router = Router();

  // TODO: Implement routes (MSSCI-14325)

  return router;
}
