/**
 * TaskTracker - Shared task list with dependencies
 *
 * Story 86-12: Cyclist: Native team panel
 */

import React from 'react';
import type { TaskListItem } from '../../hooks/useTeamMembers';

export interface TaskTrackerProps {
  tasks: TaskListItem[];
}

// Stub — not implemented
export function TaskTracker({ tasks }: TaskTrackerProps): React.ReactElement {
  return <div data-testid="task-tracker" />;
}

export default TaskTracker;
