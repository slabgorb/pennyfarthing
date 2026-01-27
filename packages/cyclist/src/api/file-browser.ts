/**
 * File Browser API Router
 *
 * REST endpoints for file browser functionality in web mode.
 * Mirrors the IPC handlers from main.ts for browser compatibility.
 */

import { Router } from 'express';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { resolve, isAbsolute } from 'path';
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

  // Open file in user's editor ($EDITOR)
  // Story MSSCI-12467: DIFFS panel file opener
  router.post('/edit', (req, res) => {
    try {
      const projectDir = getProjectDir();
      const { path: filePath, lineNumber } = req.body;

      if (!filePath) {
        return res.status(400).json({ success: false, error: 'Missing path parameter' });
      }

      // Resolve path (absolute or relative to project)
      const absolutePath = isAbsolute(filePath) ? filePath : resolve(projectDir, filePath);

      // Verify file exists
      if (!existsSync(absolutePath)) {
        return res.status(404).json({ success: false, error: 'File not found' });
      }

      // Get editor from environment
      const editor = process.env.EDITOR || process.env.VISUAL || 'code';

      // Build command arguments based on editor
      let args: string[];
      if (editor.includes('code') || editor.includes('cursor')) {
        // VS Code / Cursor: --goto file:line
        args = lineNumber ? ['--goto', `${absolutePath}:${lineNumber}`] : [absolutePath];
      } else if (editor.includes('vim') || editor.includes('nvim') || editor.includes('nano')) {
        // Vim/Neovim/Nano: +line file
        args = lineNumber ? [`+${lineNumber}`, absolutePath] : [absolutePath];
      } else if (editor.includes('emacs')) {
        // Emacs: +line file
        args = lineNumber ? [`+${lineNumber}`, absolutePath] : [absolutePath];
      } else if (editor.includes('subl') || editor.includes('sublime')) {
        // Sublime: file:line
        args = lineNumber ? [`${absolutePath}:${lineNumber}`] : [absolutePath];
      } else {
        // Generic fallback
        args = [absolutePath];
      }

      console.log(`[FileBrowser API] Opening in editor: ${editor} ${args.join(' ')}`);

      // Spawn editor detached so it doesn't block the server
      const child = spawn(editor, args, {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();

      res.json({ success: true, editor, path: absolutePath });
    } catch (err) {
      console.error('[FileBrowser API] Error opening editor:', err);
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Failed to open editor'
      });
    }
  });

  return router;
}
