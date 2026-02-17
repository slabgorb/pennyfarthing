/**
 * useTeamMembers Hook
 *
 * React hook for subscribing to native team state.
 * Story 86-12: Cyclist: Native team panel
 *
 * Uses WebSocket channels:
 * - /ws/team — team lifecycle events (init, member_update, disbanded)
 * - /ws/tasks — task list changes (init, task_updated)
 * - /ws/messages — inter-agent messages (init, message)
 */

import { useState, useLayoutEffect, useRef, useCallback } from 'react';

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

interface TeamInitMessage {
  type: 'init';
  team: {
    id: string;
    lead: string;
    created: string;
    name?: string;
    members: TeamMember[];
  };
}

interface MemberUpdateMessage {
  type: 'member_update';
  member: TeamMember;
}

interface DisbandedMessage {
  type: 'disbanded';
}

type TeamWsMessage = TeamInitMessage | MemberUpdateMessage | DisbandedMessage;

interface TasksInitMessage {
  type: 'init';
  tasks: TaskListItem[];
}

interface TaskUpdatedMessage {
  type: 'task_updated';
  task: TaskListItem;
}

type TasksWsMessage = TasksInitMessage | TaskUpdatedMessage;

interface MessagesInitMessage {
  type: 'init';
  messages: TeamMessage[];
}

interface NewMessageMessage {
  type: 'message';
  msg: Partial<TeamMessage> & { from: string; content: string; timestamp: string };
}

type MessagesWsMessage = MessagesInitMessage | NewMessageMessage;

// =============================================================================
// WebSocket URL helper
// =============================================================================

function wsUrl(path: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${path}`;
}

// =============================================================================
// Hook
// =============================================================================

export function useTeamMembers(): TeamState {
  const [isActive, setIsActive] = useState(false);
  const [teamName, setTeamName] = useState<string | undefined>(undefined);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const teamWsRef = useRef<WebSocket | null>(null);
  const tasksWsRef = useRef<WebSocket | null>(null);
  const messagesWsRef = useRef<WebSocket | null>(null);
  const reconnectTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const mountedRef = useRef(true);

  // Create initial WebSocket connections synchronously during first render.
  // This ensures the WebSocket objects exist immediately (before any effects),
  // which is critical for tests using vi.useFakeTimers() where effect scheduling
  // depends on timer availability.
  const initializedRef = useRef(false);
  if (!initializedRef.current) {
    initializedRef.current = true;
    teamWsRef.current = new WebSocket(wsUrl('/ws/team'));
    tasksWsRef.current = new WebSocket(wsUrl('/ws/tasks'));
    messagesWsRef.current = new WebSocket(wsUrl('/ws/messages'));
  }

  // Reconnection helper — creates new WebSocket and wires handlers
  const connectTeam = useCallback(() => {
    const ws = new WebSocket(wsUrl('/ws/team'));
    teamWsRef.current = ws;
    wireTeamHandlers(ws);
  }, []);

  function wireTeamHandlers(ws: WebSocket) {
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as TeamWsMessage;
        switch (msg.type) {
          case 'init':
            setMembers(msg.team.members);
            setTeamName(msg.team.name);
            setIsActive(true);
            setIsLoading(false);
            setError(null);
            break;
          case 'member_update':
            setMembers(prev => prev.map(m =>
              m.name === msg.member.name ? { ...m, ...msg.member } : m
            ));
            break;
          case 'disbanded':
            setMembers([]);
            setTeamName(undefined);
            setIsActive(false);
            break;
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onerror = () => {
      setError(new Error('WebSocket connection failed'));
      setIsLoading(false);
    };

    ws.onclose = () => {
      if (mountedRef.current) {
        const timer = setTimeout(connectTeam, 2000);
        reconnectTimersRef.current.push(timer);
      }
    };
  }

  function wireTasksHandlers(ws: WebSocket) {
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as TasksWsMessage;
        switch (msg.type) {
          case 'init':
            setTasks(msg.tasks);
            break;
          case 'task_updated':
            setTasks(prev => prev.map(t =>
              t.id === msg.task.id ? { ...t, ...msg.task } : t
            ));
            break;
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      if (mountedRef.current) {
        const timer = setTimeout(() => {
          const newWs = new WebSocket(wsUrl('/ws/tasks'));
          tasksWsRef.current = newWs;
          wireTasksHandlers(newWs);
        }, 2000);
        reconnectTimersRef.current.push(timer);
      }
    };
  }

  function wireMessagesHandlers(ws: WebSocket) {
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as MessagesWsMessage;
        switch (msg.type) {
          case 'init':
            setMessages(msg.messages);
            break;
          case 'message':
            setMessages(prev => [...prev, {
              from: msg.msg.from,
              to: msg.msg.to,
              content: msg.msg.content,
              timestamp: msg.msg.timestamp,
              type: msg.msg.type ?? 'message',
            }]);
            break;
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      if (mountedRef.current) {
        const timer = setTimeout(() => {
          const newWs = new WebSocket(wsUrl('/ws/messages'));
          messagesWsRef.current = newWs;
          wireMessagesHandlers(newWs);
        }, 2000);
        reconnectTimersRef.current.push(timer);
      }
    };
  }

  // Wire up handlers in layout effect (synchronous, fires during commit)
  useLayoutEffect(() => {
    mountedRef.current = true;

    wireTeamHandlers(teamWsRef.current!);
    wireTasksHandlers(tasksWsRef.current!);
    wireMessagesHandlers(messagesWsRef.current!);

    return () => {
      mountedRef.current = false;
      reconnectTimersRef.current.forEach(t => clearTimeout(t));
      reconnectTimersRef.current = [];
      teamWsRef.current?.close();
      tasksWsRef.current?.close();
      messagesWsRef.current?.close();
    };
  }, []);

  return { isActive, teamName, members, tasks, messages, isLoading, error };
}
