/**
 * TeamRoster - Agent member list with portraits and status
 *
 * Story 86-12: Cyclist: Native team panel
 */

import React from 'react';
import type { TeamMember } from '../../hooks/useTeamMembers';

export interface TeamRosterProps {
  members: TeamMember[];
  onMemberClick?: (member: TeamMember) => void;
}

// Stub — not implemented
export function TeamRoster({ members, onMemberClick }: TeamRosterProps): React.ReactElement {
  return <div data-testid="team-roster" />;
}

export default TeamRoster;
