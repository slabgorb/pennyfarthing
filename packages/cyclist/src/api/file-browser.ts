/**
 * File Browser API Router
 *
 * REST endpoints for file browser functionality in web mode.
 * Mirrors the IPC handlers from main.ts for browser compatibility.
 */

import { Router } from 'express';
import { listDirectory, readFile } from '../file-browser.js';

export function createFileBrowserRouter(getProjectDir: () => string): Router {
  const router = Router();

  // List directory contents
  router.get('/', (req, res) => {
    try {
      const projectDir = getProjectDir();
      const requestedPath = (req.query.path as string) || '';
      const listing = listDirectory(requestedPath, projectDir);
      res.json(listing);
    } catch (err) {
      console.error('[FileBrowser API] Error listing directory:', err);
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Failed to list directory'
      });
    }
  });

  // Open/read a file
  router.post('/open', (req, res) => {
    try {
      const projectDir = getProjectDir();
      const { path: filePath } = req.body;

      if (!filePath) {
        return res.status(400).json({ error: 'Missing path parameter' });
      }

      const content = readFile(filePath, projectDir);
      res.json({ path: filePath, content });
    } catch (err) {
      console.error('[FileBrowser API] Error reading file:', err);
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Failed to read file'
      });
    }
  });

  return router;
}
