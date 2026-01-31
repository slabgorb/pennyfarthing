// Root React component for Cyclist
// Wires up the docking workspace with React components

import React, { useEffect, useState } from 'react';
import { DockingWorkspace, registerPanelComponent, PANEL_INVENTORY } from './components/DockingWorkspace';
import { FileTree, FileChange } from './components/FileTree';
import DiffViewer from './components/DiffViewer';
import MessageView from './components/MessageView';
import { useMessageStream } from './hooks/useMessageStream';
import { CommandPaletteProvider } from './components/CommandPalette';

// =============================================================================
// Panel Components - Wrappers that connect to data sources
// =============================================================================

// Changed Files Panel - Uses FileTree component
function ChangedPanel() {
  const [files, setFiles] = useState<FileChange[]>([]);

  useEffect(() => {
    // Listen for file change events from vanilla JS
    const handleDiffAdded = (e: CustomEvent) => {
      if (e.detail?.path) {
        setFiles(prev => {
          // Avoid duplicates
          if (prev.some(f => f.path === e.detail.path)) {
            return prev;
          }
          return [...prev, { path: e.detail.path, status: e.detail.status || 'modified' }];
        });
      }
    };

    window.addEventListener('cyclist:diff-added', handleDiffAdded as EventListener);
    return () => window.removeEventListener('cyclist:diff-added', handleDiffAdded as EventListener);
  }, []);

  return (
    <div className="panel-content changed-panel">
      <FileTree
        files={files}
        onFileClick={(file) => {
          // Dispatch event for vanilla JS to handle
          window.dispatchEvent(new CustomEvent('cyclist:file-selected', { detail: file }));
        }}
      />
    </div>
  );
}

// Diffs Panel - Uses DiffViewer component
function DiffsPanel() {
  const [diffs, setDiffs] = useState<Array<{
    filePath: string;
    oldContent: string;
    newContent: string;
    hunks: Array<{
      oldStart: number;
      oldCount: number;
      newStart: number;
      newCount: number;
      lines: Array<{ type: 'added' | 'removed' | 'unchanged'; content: string; oldLineNumber?: number; newLineNumber?: number }>;
    }>;
  }>>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [viewMode, setViewMode] = useState<'unified' | 'side-by-side'>('unified');

  useEffect(() => {
    const handleDiffAdded = (e: CustomEvent) => {
      if (e.detail?.path && e.detail?.content) {
        // Parse the raw diff content into structured hunks
        const rawContent = e.detail.content as string;
        const lines = rawContent.split('\n');
        const parsedLines = lines.map((line: string, idx: number) => {
          if (line.startsWith('+')) {
            return { type: 'added' as const, content: line.slice(1), newLineNumber: idx + 1 };
          } else if (line.startsWith('-')) {
            return { type: 'removed' as const, content: line.slice(1), oldLineNumber: idx + 1 };
          } else {
            return { type: 'unchanged' as const, content: line, oldLineNumber: idx + 1, newLineNumber: idx + 1 };
          }
        });

        setDiffs(prev => [...prev, {
          filePath: e.detail.path,
          oldContent: '',  // Not available from event
          newContent: rawContent,
          hunks: [{
            oldStart: 1,
            oldCount: lines.length,
            newStart: 1,
            newCount: lines.length,
            lines: parsedLines,
          }],
        }]);
      }
    };

    const handleClearDiffs = () => {
      setDiffs([]);
      setCurrentIndex(0);
    };

    window.addEventListener('cyclist:diff-content', handleDiffAdded as EventListener);
    window.addEventListener('cyclist:clear-diffs', handleClearDiffs);
    return () => {
      window.removeEventListener('cyclist:diff-content', handleDiffAdded as EventListener);
      window.removeEventListener('cyclist:clear-diffs', handleClearDiffs);
    };
  }, []);

  if (diffs.length === 0) {
    return <div className="panel-content diffs-panel empty">No diffs yet</div>;
  }

  const currentDiff = diffs[currentIndex];
  return (
    <div className="panel-content diffs-panel">
      <DiffViewer
        data={currentDiff}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />
    </div>
  );
}

// Debug Panel - Placeholder for span timeline
function DebugPanel() {
  return (
    <div className="panel-content debug-panel">
      <div className="debug-placeholder">
        OTEL Span Timeline - Coming Soon
      </div>
    </div>
  );
}

// Message Panel - Uses MessageView component
function MessagePanel() {
  const { messages, isStreaming, error } = useMessageStream();

  if (error) {
    return (
      <div className="panel-content message-panel error">
        <p>Failed to connect to message stream</p>
        <p className="error-details">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="panel-content message-panel">
      <MessageView messages={messages} />
      {isStreaming && <div className="streaming-indicator">Claude is thinking...</div>}
    </div>
  );
}

// Sprint Panel - Placeholder
function SprintPanel() {
  return (
    <div className="panel-content sprint-panel">
      <div className="sprint-placeholder">
        Sprint info will appear here
      </div>
    </div>
  );
}

// Progress Panel - Placeholder
function ProgressPanel() {
  return (
    <div className="panel-content progress-panel">
      <div className="progress-placeholder">
        Progress tracking will appear here
      </div>
    </div>
  );
}

// Background Panel - Placeholder
function BackgroundPanel() {
  return (
    <div className="panel-content background-panel">
      <div className="background-placeholder">
        Background tasks will appear here
      </div>
    </div>
  );
}

// Git Panel - Placeholder
function GitPanel() {
  return (
    <div className="panel-content git-panel">
      <div className="git-placeholder">
        Git status will appear here
      </div>
    </div>
  );
}

// Settings Panel - Placeholder
function SettingsPanel() {
  return (
    <div className="panel-content settings-panel">
      <div className="settings-placeholder">
        Settings will appear here
      </div>
    </div>
  );
}

// =============================================================================
// Register Panel Components
// =============================================================================

registerPanelComponent(PANEL_INVENTORY.CHANGED, ChangedPanel);
registerPanelComponent(PANEL_INVENTORY.DIFFS, DiffsPanel);
registerPanelComponent(PANEL_INVENTORY.DEBUG, DebugPanel);
registerPanelComponent(PANEL_INVENTORY.MESSAGE, MessagePanel);
registerPanelComponent(PANEL_INVENTORY.SPRINT, SprintPanel);
registerPanelComponent(PANEL_INVENTORY.PROGRESS, ProgressPanel);
registerPanelComponent(PANEL_INVENTORY.BACKGROUND, BackgroundPanel);
registerPanelComponent(PANEL_INVENTORY.GIT, GitPanel);
registerPanelComponent(PANEL_INVENTORY.SETTINGS, SettingsPanel);

// =============================================================================
// App Component
// =============================================================================

export default function App() {
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  return (
    <CommandPaletteProvider>
      <div className="cyclist-app">
        <DockingWorkspace
          leftCollapsed={leftCollapsed}
          rightCollapsed={rightCollapsed}
          onLeftCollapseChange={setLeftCollapsed}
          onRightCollapseChange={setRightCollapsed}
          onLayoutChange={(layout) => {
            console.log('Layout changed:', layout);
          }}
        />
      </div>
    </CommandPaletteProvider>
  );
}
