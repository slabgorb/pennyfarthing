import type { SprintMessage } from '../../api/types'

export const sprintFixture: SprintMessage = {
  type: 'init',
  sprint: {
    number: 2632,
    name: 'Frontier Model Changes 2632',
    goal: 'Adopt frontier model changes',
    done: 8,
    remaining: 40,
    inProgress: 3,
    inReview: 2,
  },
  epics: [
    {
      id: '163',
      title: 'Web GUI Resurrection',
      jiraKey: 'PROJ-16300',
      status: 'in_progress',
      stories: [
        { id: '163-1', title: 'Frame static serving', points: 2, status: 'in_progress', jira: 'PROJ-16301' },
        { id: '163-2', title: 'Web scaffold', points: 2, status: 'backlog', jira: 'PROJ-16302' },
      ],
    },
  ],
  completedEpics: [],
}
