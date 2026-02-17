/**
 * TeamRoster - Agent member list with portraits and status
 *
 * Story 86-12: Cyclist: Native team panel
 */

import React, { useState } from 'react';
import type { TeamMember } from '../../hooks/useTeamMembers';

export interface TeamRosterProps {
  members: TeamMember[];
  onMemberClick?: (member: TeamMember) => void;
}

function MemberPortrait({ member }: { member: TeamMember }) {
  const [imgError, setImgError] = useState(false);
  const src = member.portrait
    ? `/portraits/${member.portrait.theme}/medium/${member.portrait.slug}.png`
    : '';

  return (
    <div data-testid="member-portrait">
      {!imgError && src ? (
        <img
          src={src}
          alt={member.name}
          onError={() => setImgError(true)}
        />
      ) : (
        <span>🤖</span>
      )}
    </div>
  );
}

export function TeamRoster({ members, onMemberClick }: TeamRosterProps): React.ReactElement {
  if (members.length === 0) {
    return (
      <div data-testid="team-roster">
        <div data-testid="roster-empty">No team members</div>
      </div>
    );
  }

  return (
    <div data-testid="team-roster">
      {members.map(member => (
        <div
          key={member.name}
          data-testid="team-member"
          role="button"
          onClick={() => onMemberClick?.(member)}
        >
          <MemberPortrait member={member} />
          <span>{member.name}</span>
          <span data-testid="member-role" title={member.agentType} className={`role-badge role-${member.agentType}`} />
          <span data-testid="member-status" data-status={member.status}>
            {member.status}
          </span>
          {member.currentTask && <span>{member.currentTask}</span>}
        </div>
      ))}
    </div>
  );
}

export default TeamRoster;
