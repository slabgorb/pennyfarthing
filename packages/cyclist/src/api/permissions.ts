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

import { Router, Request, Response } from 'express';
import { getGrants, addGrant, removeGrant, type PermissionGrant, type GrantTypeValue } from '../settings-store.js';

const VALID_GRANT_TYPES = ['once', 'session', 'always'];

export function createPermissionsRouter(): Router {
  const router = Router();

  // GET / - List all active grants
  router.get('/', (_req: Request, res: Response) => {
    res.json({ grants: getGrants() });
  });

  // POST /grant - Add a permission grant
  router.post('/grant', (req: Request, res: Response) => {
    const { tool, scope, grant_type } = req.body;

    if (!tool || typeof tool !== 'string') {
      res.status(400).json({ error: 'Missing required field: tool' });
      return;
    }

    if (!scope || typeof scope !== 'string') {
      res.status(400).json({ error: 'Missing required field: scope' });
      return;
    }

    const grantType: GrantTypeValue = grant_type || 'session';

    if (!VALID_GRANT_TYPES.includes(grantType)) {
      res.status(400).json({ error: `Invalid grant_type: ${grantType}. Must be one of: ${VALID_GRANT_TYPES.join(', ')}` });
      return;
    }

    const grant: PermissionGrant = {
      tool,
      scope,
      grant_type: grantType,
      granted_at: new Date().toISOString(),
    };

    addGrant(grant);
    res.status(201).json({ grant });
  });

  // DELETE /revoke/:tool - Revoke grants for a tool
  router.delete('/revoke/:tool', (req: Request, res: Response) => {
    const { tool } = req.params;
    const scopeFilter = req.query.scope as string | undefined;

    const allGrants = getGrants();
    const toRemove = allGrants.filter(
      (g) => g.tool === tool && (!scopeFilter || g.scope === scopeFilter),
    );

    for (const grant of toRemove) {
      removeGrant(grant);
    }

    res.json({ removed: toRemove.length });
  });

  // GET /show/:tool - Show grants for a specific tool
  router.get('/show/:tool', (req: Request, res: Response) => {
    const { tool } = req.params;
    const grants = getGrants().filter((g) => g.tool === tool);
    res.json({ grants });
  });

  return router;
}
