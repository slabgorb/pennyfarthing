import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import type { SprintMessage } from '../api/types'
import { sprintFixture } from '../test/fixtures/sprint'

const channelState = {
  data: sprintFixture as SprintMessage | null,
  connected: true,
  lastUpdated: Date.now() as number | null,
}
vi.mock('../api/useChannel', () => ({ useChannel: () => channelState }))

import { SprintBoard } from './SprintBoard'

test('renders sprint header with points summary', () => {
  render(<SprintBoard />)
  expect(screen.getByText(/Frontier Model Changes 2632/)).toBeInTheDocument()
  expect(screen.getByText(/8/)).toBeInTheDocument() // done points
})

test('renders epics with their stories and status', () => {
  render(<SprintBoard />)
  expect(screen.getByText('Web GUI Resurrection')).toBeInTheDocument()
  expect(screen.getByText('Frame static serving')).toBeInTheDocument()
  expect(screen.getAllByText('in_progress').length).toBeGreaterThan(0)
})

test('click on a story id copies it to the clipboard', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.assign(navigator, { clipboard: { writeText } })
  render(<SprintBoard />)
  await userEvent.click(screen.getByRole('button', { name: '163-1' }))
  expect(writeText).toHaveBeenCalledWith('163-1')
})

test('empty sprint renders a friendly empty state', () => {
  channelState.data = { ...sprintFixture, epics: [], completedEpics: [] }
  render(<SprintBoard />)
  expect(screen.getByText(/no stories/i)).toBeInTheDocument()
  channelState.data = sprintFixture
})
