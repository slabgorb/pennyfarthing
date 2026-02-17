/**
 * TeamPanel - Native team visualization panel
 *
 * Story 86-12: Cyclist: Native team panel
 *
 * Features:
 * - Team member roster with persona portraits and status
 * - Task list with completion progress and dependencies
 * - Message feed between agents
 * - Click agent to view output
 * - Hidden when native teams not active
 */

import React, { useState } from 'react';
import { useTeamMembers } from '../../hooks/useTeamMembers';
import { TeamRoster } from './TeamRoster';
import { TaskTracker } from './TaskTracker';
import { MessageFeed } from './MessageFeed';
import type { TeamMember } from '../../hooks/useTeamMembers';

export function TeamPanel(): React.ReactElement {
  const { isActive, teamName, members, tasks, messages, isLoading, error } = useTeamMembers();
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);

  return (
    <div data-testid="team-panel" className="team-panel">
      {isLoading && (
        <div data-testid="team-loading">Connecting to team...</div>
      )}

      {error && (
        <div data-testid="team-error">Connection failed — team data unavailable</div>
      )}

      {!isActive && (
        <div data-testid="team-empty-state">No active team</div>
      )}

      {teamName && (
        <div data-testid="team-name">{teamName}</div>
      )}

      <TeamRoster members={members} onMemberClick={setSelectedMember} />
      <TaskTracker tasks={tasks} />
      <MessageFeed messages={messages} />

      {selectedMember && (
        <div data-testid="agent-output-view">
          <div>{selectedMember.name}</div>
          <div>Role: {selectedMember.agentType}</div>
          <div>Status: {selectedMember.status}</div>
          <button
            data-testid="agent-output-close"
            onClick={() => setSelectedMember(null)}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}

export default TeamPanel;
