/**
 * ProjectInfoBar Component
 *
 * Slim info bar displaying the project directory name.
 * Sits between PersonaHeader and Dockview tabs in BikeRack mode.
 * Story 110-6: Project directory indicator in TUI header
 */

import React, { useState, useEffect } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ProjectInfo {
  name: string;
  path: string;
}

export default function ProjectInfoBar(): React.ReactElement {
  const [info, setInfo] = useState<ProjectInfo | null>(null);

  useEffect(() => {
    fetch('/api/project-info')
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) setInfo(data); })
      .catch(() => {});
  }, []);

  if (!info) {
    return <div className="project-info-bar" data-testid="project-info-bar" />;
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="project-info-bar" data-testid="project-info-bar">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="project-info-dir" data-testid="project-info-dir">
              {info.name}
            </span>
          </TooltipTrigger>
          <TooltipContent>{info.path}</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
