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

  // Open file in GUI editor
  // Story MSSCI-12467: DIFFS panel file opener
  // Preference: Windsurf → VS Code → Notepad (ignores $EDITOR which may be terminal-based)
  router.post('/edit', async (req, res) => {
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

      // GUI editor preference order (ignores $EDITOR which may be vim/nano)
      const editorCandidates = ['windsurf', 'code', 'notepad'];

      // Find first available editor
      let editor: string | null = null;
      for (const candidate of editorCandidates) {
        try {
          const { execSync } = await import('child_process');
          // Check if command exists (works on macOS/Linux with 'which', Windows with 'where')
          const whichCmd = process.platform === 'win32' ? 'where' : 'which';
          execSync(`${whichCmd} ${candidate}`, { stdio: 'ignore' });
          editor = candidate;
          break;
        } catch {
          // Command not found, try next
        }
      }

      if (!editor) {
        return res.status(500).json({
          success: false,
          error: 'No GUI editor found. Install Windsurf, VS Code, or Notepad.'
        });
      }

      // Build command arguments (all these editors use similar syntax)
      let args: string[];
      if (editor === 'windsurf' || editor === 'code') {
        // Windsurf / VS Code: --goto file:line
        args = lineNumber ? ['--goto', `${absolutePath}:${lineNumber}`] : [absolutePath];
      } else {
        // Notepad: just the file path
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
