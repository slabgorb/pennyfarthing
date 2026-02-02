/**
 * ChangedPanel - Display changed files (FileTree wrapper)
 *
 * Story MSSCI-12717 - React Migration
 */

import React, { useState, useEffect, useCallback } from 'react';
import FileTree, { FileChange, FileStatus } from '../FileTree';

interface DiffData {
  path: string;
  original: string;
  modified: string;
  toolName: string;
  timestamp: number;
}

export function ChangedPanel(): React.ReactElement {
  const [files, setFiles] = useState<FileChange[]>([]);

  useEffect(() => {
    // Connect to diffs WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/diffs`);

    const handleDiff = (diff: DiffData) => {
      setFiles(prev => {
        // Determine status based on content
        let status: FileStatus = 'modified';
        if (!diff.original || diff.original.length === 0) {
          status = 'created';
        }
        // Note: deleted files would need special handling from the backend

        const newFile: FileChange = {
          path: diff.path,
          status,
        };

        // Update or add
        const existing = prev.findIndex(f => f.path === diff.path);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = newFile;
          return updated;
        }
        return [...prev, newFile];
      });
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'init' && data.diffs) {
          // Initial load of existing diffs
          for (const diff of data.diffs) {
            handleDiff(diff as DiffData);
          }
        } else if (data.type === 'diff' && data.diff) {
          // New diff update
          handleDiff(data.diff as DiffData);
        }
      } catch (err) {
        console.error('[ChangedPanel] Failed to parse WebSocket message:', err);
      }
    };

    return () => ws.close();
  }, []);

  const handleFileClick = useCallback((file: FileChange) => {
    // Open file in diff viewer - trigger event for DiffsPanel
    console.log('[ChangedPanel] File clicked:', file.path);
    // The diff data is already in state via onUpdate subscription
    // DiffsPanel will handle display via its own subscription
  }, []);

  return (
    <div className="changed-panel" data-testid="changed-panel">
      <FileTree files={files} onFileClick={handleFileClick} />
    </div>
  );
}

export default ChangedPanel;
