/**
 * useTeamMembers Hook
 *
 * React hook for subscribing to native team state.
 * Story 86-12: Cyclist: Native team panel
 *
 * Uses WebSocket channels:
 * - /ws/team — team lifecycle events
 * - /ws/tasks — task list changes
 * - /ws/messages — inter-agent messages
 */

// =============================================================================
// Types
// =============================================================================

export interface TeamMember {
  name: string;
  agentType: string;
  status: 'idle' | 'working' | 'blocked';
  portrait?: { theme: string; slug: string };
  currentTask?: string;
  taskProgress?: number;
}

export interface TaskListItem {
  id: string;
  title: string;
  owner?: string;
  status: 'pending' | 'in_progress' | 'completed';
  blockedBy?: string[];
}

export interface TeamMessage {
  from: string;
  to?: string;
  content: string;
  timestamp: string;
  type: 'message' | 'broadcast' | 'shutdown_request' | 'shutdown_response';
}

export interface TeamState {
  isActive: boolean;
  teamName?: string;
  members: TeamMember[];
  tasks: TaskListItem[];
  messages: TeamMessage[];
  isLoading: boolean;
  error: Error | null;
}

// =============================================================================
// Hook (stub — not implemented)
// =============================================================================

export function useTeamMembers(): TeamState {
  return {
    isActive: false,
    members: [],
    tasks: [],
    messages: [],
    isLoading: false,
    error: null,
  };
}
