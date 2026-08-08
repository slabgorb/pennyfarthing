import type { PersonaPayload, StoryMessage } from '../../api/types'

export const storyFixture: StoryMessage = {
  type: 'init',
  id: '163-1',
  title: 'Frame static serving',
  phase: 'red',
  workflow: 'tdd',
}

export const personaFixture: PersonaPayload = {
  character: 'Igor',
  role: 'tea',
  roleDescription: 'Test Engineer',
  quote: 'We athk not why, marthter.',
  theme: 'discworld',
}

export interface WorkflowInfo {
  workflow: string | null
  phase: string | null
  phases: { name: string; agent: string }[]
}

export const workflowFixture: WorkflowInfo = {
  workflow: 'tdd',
  phase: 'red',
  phases: [
    { name: 'setup', agent: 'sm' },
    { name: 'red', agent: 'tea' },
    { name: 'green', agent: 'dev' },
    { name: 'review', agent: 'reviewer' },
    { name: 'finish', agent: 'sm' },
  ],
}
