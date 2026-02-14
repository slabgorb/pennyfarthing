import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { ToolDialog } from './dialogs/ToolDialog';
import { ConfirmDialog, useConfirmDialog } from './ConfirmDialog';
import { useAgentLoad } from '../hooks/useAgentLoad.js';
import type { AgentLoadEntry } from '../hooks/useAgentLoad.js';
import { formatComponentName } from './panels/DebugPanel';

const SIDECAR_FILES = ['patterns.md', 'gotchas.md', 'decisions.md'] as const;

export interface AgentLoadDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AgentLoadDialog({ isOpen, onClose }: AgentLoadDialogProps): React.ReactElement {
  const { data, isLoading, error, refresh, pruneSidecar, pruneResult } = useAgentLoad();
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [pendingPrune, setPendingPrune] = useState<{ agent: string; file: string } | null>(null);

  const { confirm, dialogProps } = useConfirmDialog({
    title: 'Clear Sidecar',
    message: pendingPrune
      ? `Reset ${pendingPrune.file} for ${pendingPrune.agent}? This will replace the sidecar with its default template.`
      : '',
    confirmLabel: 'Confirm',
    isDanger: true,
  });

  useEffect(() => {
    if (isOpen) {
      refresh();
    }
  }, [isOpen, refresh]);

  const sortedAgents = useMemo(() => {
    if (!data) return [];
    return [...data.agents].sort((a, b) => (b.totalTokens ?? 0) - (a.totalTokens ?? 0));
  }, [data]);

  const maxTokens = useMemo(() => {
    if (!sortedAgents.length) return 0;
    return sortedAgents[0]?.totalTokens ?? 0;
  }, [sortedAgents]);

  const handleRowClick = (agent: string) => {
    setExpandedAgent((prev) => (prev === agent ? null : agent));
  };

  const handleClear = async (agent: string, file: string) => {
    setPendingPrune({ agent, file });
    const confirmed = await confirm();
    if (confirmed) {
      await pruneSidecar(agent, file);
    }
    setPendingPrune(null);
  };

  const renderAgentRow = (entry: AgentLoadEntry) => {
    const tokens = entry.totalTokens ?? 0;
    const progressValue = maxTokens > 0 ? (tokens / maxTokens) * 100 : 0;
    const isExpanded = expandedAgent === entry.agent;
    // Color by token threshold: <3k green, <5k orange, >=5k red
    const barColor = tokens >= 5000
      ? 'bg-[var(--status-error,#f14c4c)]'
      : tokens >= 3000
        ? 'bg-[var(--status-warning,#cca700)]'
        : 'bg-[var(--status-success,#4ec9b0)]';

    return (
      <Collapsible
        key={entry.agent}
        open={isExpanded}
        onOpenChange={() => handleRowClick(entry.agent)}
      >
        <CollapsibleTrigger asChild>
          <div
            className="px-4 py-2 cursor-pointer hover:bg-muted/50 rounded-md transition-colors"
            data-testid={`agent-row-${entry.agent}`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-sm font-medium">{entry.agent}</span>
              <span className="font-mono text-sm tabular-nums text-text-secondary">
                {tokens.toLocaleString()}
              </span>
            </div>
            <Progress
              value={progressValue}
              className="h-2.5 bg-[var(--border)]"
              indicatorClassName={barColor}
            />
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mx-4 mb-3 rounded-md bg-muted/30 p-3 space-y-1">
            {entry.components && entry.components.length > 0 ? (
              entry.components.map((comp) => (
                <div key={comp.name} className="flex items-center justify-between text-xs text-text-secondary">
                  <span>{formatComponentName(comp.name)}</span>
                  <span className="tabular-nums">{comp.tokens.toLocaleString()}</span>
                </div>
              ))
            ) : (
              <div className="text-xs text-text-secondary">No component breakdown available</div>
            )}
            <div className="pt-2 border-t border-muted/50 mt-2">
              <div className="text-xs font-medium mb-1.5 text-text-secondary">Sidecars</div>
              <div className="flex gap-2">
                {SIDECAR_FILES.map((file) => (
                  <Button
                    key={file}
                    variant="ghost"
                    size="sm"
                    className="text-xs h-6"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClear(entry.agent, file);
                    }}
                  >
                    Clear {file}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="space-y-3 p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} data-testid={`skeleton-${i}`} className="space-y-1.5 px-4">
              <div className="flex justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-16" />
              </div>
              <Skeleton className="h-2.5 w-full rounded-full" />
            </div>
          ))}
        </div>
      );
    }

    if (error) {
      return (
        <div className="p-4 space-y-3">
          <div className="p-4 rounded border border-[var(--status-error)]/20 bg-[var(--status-error)]/5 text-[var(--status-error)] text-sm">
            {error.message}
          </div>
          <div className="text-center">
            <Button variant="outline" size="sm" onClick={refresh}>
              Retry
            </Button>
          </div>
        </div>
      );
    }

    if (!data) return null;

    return (
      <div className="space-y-0.5">
        {pruneResult?.success && pruneResult.tokensFreed != null && (
          <div className="text-xs text-green-600 px-4 py-1">
            Freed {pruneResult.tokensFreed.toLocaleString()} tokens from {pruneResult.agent}/{pruneResult.file}
          </div>
        )}
        <div className="flex items-center justify-between px-4 py-2">
          <span data-testid="cached-at" className="text-xs text-[var(--text-muted)]">
            Cached: {new Date(data.cachedAt).toLocaleString()}
          </span>
          <Button variant="ghost" size="sm" className="text-xs h-6 text-[var(--text-muted)] hover:text-[var(--text-primary)]" onClick={refresh}>
            Refresh
          </Button>
        </div>
        {sortedAgents.map((entry) => renderAgentRow(entry))}
      </div>
    );
  };

  return (
    <>
      <ToolDialog
        open={isOpen}
        onOpenChange={(open) => { if (!open) onClose(); }}
        title="Agent Load Analysis"
        description="Token usage breakdown for all agents"
        className="max-w-2xl"
      >
        {renderContent()}
      </ToolDialog>
      <ConfirmDialog {...dialogProps} />
    </>
  );
}
