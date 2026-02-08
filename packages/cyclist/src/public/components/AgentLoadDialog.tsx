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

    return (
      <Collapsible
        key={entry.agent}
        open={isExpanded}
        onOpenChange={() => handleRowClick(entry.agent)}
      >
        <CollapsibleTrigger asChild>
          <div
            className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50 rounded"
            data-testid={`agent-row-${entry.agent}`}
          >
            <span className="w-24 font-mono text-sm shrink-0">{entry.agent}</span>
            <span className="w-16 text-right text-sm tabular-nums shrink-0">
              {tokens.toLocaleString()}
            </span>
            <Progress value={progressValue} className="flex-1" />
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="ml-6 pl-3 border-l border-muted py-2 space-y-1">
            {entry.components && entry.components.length > 0 ? (
              entry.components.map((comp) => (
                <div key={comp.name} className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{formatComponentName(comp.name)}</span>
                  <span className="tabular-nums">{comp.tokens.toLocaleString()}</span>
                </div>
              ))
            ) : (
              <div className="text-xs text-muted-foreground">No component breakdown available</div>
            )}
            <div className="pt-2 border-t border-muted mt-2">
              <div className="text-xs font-medium mb-1">Sidecars</div>
              <div className="flex gap-2">
                {SIDECAR_FILES.map((file) => (
                  <Button
                    key={file}
                    variant="outline"
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
        <div className="space-y-3 p-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} data-testid={`skeleton-${i}`} className="flex items-center gap-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-2 flex-1" />
            </div>
          ))}
        </div>
      );
    }

    if (error) {
      return (
        <div className="p-4 text-center space-y-2">
          <div className="text-sm text-destructive">{error.message}</div>
          <Button variant="outline" size="sm" onClick={refresh}>
            Retry
          </Button>
        </div>
      );
    }

    if (!data) return null;

    return (
      <div className="space-y-1">
        {pruneResult?.success && pruneResult.tokensFreed != null && (
          <div className="text-xs text-green-600 px-3 py-1">
            Freed {pruneResult.tokensFreed.toLocaleString()} tokens from {pruneResult.agent}/{pruneResult.file}
          </div>
        )}
        <div data-testid="cached-at" className="text-xs text-muted-foreground px-3">
          Cached: {new Date(data.cachedAt).toLocaleString()}
        </div>
        {sortedAgents.map(renderAgentRow)}
        <div className="flex items-center gap-3 px-3 py-2 border-t border-muted font-medium">
          <span className="w-24 text-sm">Total</span>
          <span className="w-16 text-right text-sm tabular-nums">
            {data.totalAcrossAllAgents.toLocaleString()}
          </span>
        </div>
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
        className="max-w-lg"
      >
        {renderContent()}
      </ToolDialog>
      <ConfirmDialog {...dialogProps} />
    </>
  );
}
