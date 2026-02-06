/**
 * AskUserQuestionBlock Component (Stub)
 *
 * Renders interactive buttons for AskUserQuestion tool_use messages.
 * Uses the existing Reflector QuickActions infrastructure.
 *
 * Story: MSSCI-14395 - Render AskUserQuestion tool via Reflector QuickActions
 *
 * TODO: Implement - this is a stub for TDD RED phase.
 */

import React from 'react';

interface AskUserQuestionToolUse {
  type: 'tool_use';
  tool_name: string;
  tool_id: string;
  input: {
    questions: Array<{
      question: string;
      header: string;
      options: Array<{ label: string; description: string }>;
      multiSelect: boolean;
    }>;
  };
  timestamp: number;
}

interface AskUserQuestionBlockProps {
  toolUse: AskUserQuestionToolUse;
}

export function AskUserQuestionBlock({ toolUse }: AskUserQuestionBlockProps): React.ReactElement {
  throw new Error('AskUserQuestionBlock not implemented');
}
