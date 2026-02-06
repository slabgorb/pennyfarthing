/**
 * AskUserQuestionBlock Component
 *
 * Renders interactive buttons for AskUserQuestion tool_use messages.
 * Uses the existing ClaudeContext to send responses back via WebSocket.
 *
 * Story: MSSCI-14395 - Render AskUserQuestion tool via Reflector QuickActions
 */

import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useClaudeContext } from '../contexts/ClaudeContext';

interface QuestionOption {
  label: string;
  description: string;
}

interface Question {
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect: boolean;
}

interface AskUserQuestionToolUse {
  type: 'tool_use';
  tool_name: string;
  tool_id: string;
  input: {
    questions: Question[];
  };
  timestamp: number;
}

interface AskUserQuestionBlockProps {
  toolUse: AskUserQuestionToolUse;
}

function SingleSelectQuestion({ question, onSubmit, disabled }: {
  question: Question;
  onSubmit: (answer: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="ask-question-group">
      <Badge variant="secondary" className="ask-question-header">{question.header}</Badge>
      <p className="ask-question-text">{question.question}</p>
      <div className="ask-question-options">
        {question.options.map((opt) => (
          <Button
            key={opt.label}
            variant="secondary"
            size="sm"
            className="ask-question-option"
            onClick={() => onSubmit(opt.label)}
            disabled={disabled}
          >
            <span className="ask-option-label">{opt.label}</span>
            <span className="ask-option-desc">{opt.description}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}

function MultiSelectQuestion({ question, onSubmit, disabled }: {
  question: Question;
  onSubmit: (answers: string[]) => void;
  disabled: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleOption = useCallback((label: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  }, []);

  const handleSubmit = useCallback(() => {
    onSubmit(Array.from(selected));
  }, [selected, onSubmit]);

  return (
    <div className="ask-question-group">
      <Badge variant="secondary" className="ask-question-header">{question.header}</Badge>
      <p className="ask-question-text">{question.question}</p>
      <div className="ask-question-options">
        {question.options.map((opt) => (
          <Button
            key={opt.label}
            variant="secondary"
            size="sm"
            className="ask-question-option"
            onClick={() => toggleOption(opt.label)}
            disabled={disabled}
            aria-pressed={selected.has(opt.label)}
          >
            <span className="ask-option-label">{opt.label}</span>
            <span className="ask-option-desc">{opt.description}</span>
          </Button>
        ))}
      </div>
      <Button
        variant="default"
        size="sm"
        className="ask-question-submit"
        onClick={handleSubmit}
        disabled={disabled || selected.size === 0}
        aria-label="Confirm"
      >
        Confirm
      </Button>
    </div>
  );
}

export function AskUserQuestionBlock({ toolUse }: AskUserQuestionBlockProps): React.ReactElement {
  const { send } = useClaudeContext();
  const [isDisabled, setIsDisabled] = useState(false);
  const questions = toolUse.input?.questions || [];

  const handleSingleSelect = useCallback((answer: string) => {
    setIsDisabled(true);
    send(answer, []);
  }, [send]);

  const handleMultiSelect = useCallback((answers: string[]) => {
    setIsDisabled(true);
    send(answers.join(', '), []);
  }, [send]);

  return (
    <div className="ask-user-question-block">
      {questions.map((q, i) => (
        q.multiSelect ? (
          <MultiSelectQuestion
            key={i}
            question={q}
            onSubmit={handleMultiSelect}
            disabled={isDisabled}
          />
        ) : (
          <SingleSelectQuestion
            key={i}
            question={q}
            onSubmit={handleSingleSelect}
            disabled={isDisabled}
          />
        )
      ))}
    </div>
  );
}
