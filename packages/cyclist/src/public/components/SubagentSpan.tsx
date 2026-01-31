/**
 * SubagentSpan Component
 *
 * Collapsible container for subagent message groups.
 * Story MSSCI-12698 - MessageView Component with Streaming
 */

import React from 'react';

interface SubagentMessage {
  type: 'assistant' | 'tool_use' | 'tool_result';
  content?: string;
  parent_id: string;
  timestamp: number;
}

interface SubagentSpanProps {
  type: string;
  name: string;
  messages: SubagentMessage[];
  defaultCollapsed?: boolean;
}

export default function SubagentSpan({ type, name, messages, defaultCollapsed }: SubagentSpanProps): React.ReactElement {
  throw new Error('SubagentSpan not implemented');
}
