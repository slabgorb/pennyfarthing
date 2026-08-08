import { render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import type { PersonaPayload, StoryMessage } from '../api/types'
import { personaFixture, storyFixture, workflowFixture } from '../test/fixtures/workflow'

const channels: Record<string, { data: unknown; connected: boolean; lastUpdated: number | null }> = {
  story: { data: storyFixture as StoryMessage, connected: true, lastUpdated: Date.now() },
  persona: { data: personaFixture as PersonaPayload, connected: true, lastUpdated: Date.now() },
}
vi.mock('../api/useChannel', () => ({ useChannel: (ch: string) => channels[ch] }))
vi.mock('../api/rest', () => ({ getJSON: vi.fn().mockResolvedValue(workflowFixture) }))

import { WorkflowActivity } from './WorkflowActivity'

test('shows active story, workflow, and persona', async () => {
  render(<WorkflowActivity />)
  expect(screen.getByText(/163-1/)).toBeInTheDocument()
  expect(screen.getByText(/Igor/)).toBeInTheDocument()
  await waitFor(() => expect(screen.getByText('green')).toBeInTheDocument())
})

test('highlights the current phase in the sequence', async () => {
  render(<WorkflowActivity />)
  await waitFor(() => {
    expect(screen.getByTestId('phase-red')).toHaveAttribute('data-current', 'true')
    expect(screen.getByTestId('phase-green')).toHaveAttribute('data-current', 'false')
  })
})

test('renders idle state when no story is active', () => {
  channels.story = {
    data: { type: 'init', id: null, title: null, phase: null, workflow: null },
    connected: true,
    lastUpdated: Date.now(),
  }
  render(<WorkflowActivity />)
  expect(screen.getByText(/no active story/i)).toBeInTheDocument()
  channels.story = { data: storyFixture, connected: true, lastUpdated: Date.now() }
})
