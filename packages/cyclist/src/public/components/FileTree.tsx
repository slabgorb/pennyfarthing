/**
 * FileTree - Display modified files in a tree structure
 *
 * Story MSSCI-12710 - FileTree Component
 *
 * Features:
 * - Display modified files with paths and status indicators
 * - Group files by directory with collapsible sections
 * - Click to open file in DiffViewer
 * - Badge showing count of modified files
 * - Real-time updates as files change
 */

import React from 'react';

// =============================================================================
// Types
// =============================================================================

export type FileStatus = 'created' | 'modified' | 'deleted';

export interface FileChange {
  path: string;
  status: FileStatus;
}

export interface FileTreeProps {
  files: FileChange[];
  onFileClick?: (file: FileChange) => void;
}

// =============================================================================
// FileTree Component (stub - not yet implemented)
// =============================================================================

export function FileTree(_props: FileTreeProps): React.ReactElement {
  throw new Error('FileTree not implemented');
}

export default FileTree;
