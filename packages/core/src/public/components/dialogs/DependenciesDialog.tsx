import React, { useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ToolDialog } from './ToolDialog';
import { useDependencies } from '../../hooks/useDependencies';

export interface DependenciesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function severityVariant(severity: string): 'destructive' | 'outline' | 'secondary' {
  if (severity === 'high' || severity === 'critical') return 'destructive';
  if (severity === 'moderate') return 'outline';
  return 'secondary';
}

export function DependenciesDialog({ open, onOpenChange }: DependenciesDialogProps): React.ReactElement {
  const { data, isLoading, error, refresh } = useDependencies({});

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="dependencies-panel loading" data-testid="dependencies-panel">
          <div className="space-y-3 p-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="dependencies-panel error" data-testid="dependencies-panel">
          <div className="error-message">Error: {error.message}</div>
          <Button variant="outline" size="sm" onClick={refresh}>Retry</Button>
        </div>
      );
    }

    if (!data) {
      return (
        <div className="dependencies-panel" data-testid="dependencies-panel">
          <p>Click <strong>Analyze</strong> to check dependencies</p>
        </div>
      );
    }

    return (
      <div className="dependencies-panel" data-testid="dependencies-panel">
        {data.outdated.length > 0 && (
          <div className="outdated-section" style={{ marginBottom: '16px' }}>
            <h4>Outdated Packages ({data.outdated.length})</h4>
            <table role="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th className="text-left" style={{ padding: '4px 8px' }}>Package</th>
                  <th className="text-left" style={{ padding: '4px 8px' }}>Current</th>
                  <th className="text-left" style={{ padding: '4px 8px' }}>Wanted</th>
                  <th className="text-left" style={{ padding: '4px 8px' }}>Latest</th>
                  <th className="text-left" style={{ padding: '4px 8px' }}>Type</th>
                </tr>
              </thead>
              <tbody>
                {data.outdated.map((pkg) => (
                  <tr key={pkg.name}>
                    <td style={{ padding: '4px 8px' }}>{pkg.name}</td>
                    <td style={{ padding: '4px 8px' }}>{pkg.current}</td>
                    <td style={{ padding: '4px 8px' }}>{pkg.wanted}</td>
                    <td style={{ padding: '4px 8px' }}>{pkg.latest}</td>
                    <td style={{ padding: '4px 8px' }}>{pkg.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data.advisories.length > 0 && (
          <div className="security-section">
            <h4>Security Advisories</h4>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {data.advisories.map((adv) => (
                <div key={adv.severity} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Badge variant={severityVariant(adv.severity)}>
                    {adv.severity}
                  </Badge>
                  <span>{adv.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.outdated.length === 0 && data.advisories.length === 0 && (
          <p>All dependencies are up to date with no known vulnerabilities.</p>
        )}
      </div>
    );
  };

  return (
    <ToolDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Dependencies"
      description="Package staleness and security analysis"
    >
      {renderContent()}
    </ToolDialog>
  );
}
