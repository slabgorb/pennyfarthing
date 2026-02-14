/**
 * Shared Message Types
 *
 * Consolidated MessageData and related types used across Cyclist components.
 * Previously duplicated in MessagePanel, MessageView, Message, QuickActions,
 * SubagentSpan, and useMessageStream.
 */

/**
 * Valid message types in the conversation.
 */
export type MessageType =
  | 'user'
  | 'agent'
  | 'tool_use'
  | 'tool_result'
  | 'bell_injected'
  | 'context_cleared';

/**
 * Core message data structure used throughout Cyclist.
 */
export interface MessageData {
  type: MessageType;
  content?: string;
  timestamp: number;
  isStreaming?: boolean;
  tool_name?: string;
  tool_id?: string;
  input?: Record<string, unknown>;
  parent_id?: string;
  subagent_type?: string;
  subagent_name?: string;
  /** Whether this tool result represents an error (MSSCI-13402) */
  is_error?: boolean;
  /** Duration in milliseconds for tool execution (MSSCI-13402) */
  durationMs?: number;
  /** Number of images attached to user message */
  imageCount?: number;
  /** Agent identity captured at message creation time */
  agentSlug?: string;
  agentTheme?: string;
  agentCharacter?: string;
}

/**
 * Subagent message - same as MessageData but parent_id is required.
 */
export interface SubagentMessage extends Omit<MessageData, 'parent_id'> {
  parent_id: string;
}
