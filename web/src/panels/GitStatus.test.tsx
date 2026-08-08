import { render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import type { GitMessage } from '../api/types'
import { gitFixture } from '../test/fixtures/git'

const channelState = {
  data: gitFixture as GitMessage | null,
  connected: true,
  lastUpdated: Date.now() as number | null,
}
vi.mock('../api/useChannel', () => ({ useChannel: () => channelState }))

import { GitStatus } from './GitStatus'

test('renders each repo with branch and clean state', () => {
  render(<GitStatus />)
  expect(screen.getByText('orchestrator')).toBeInTheDocument()
  expect(screen.getByText('main')).toBeInTheDocument()
  expect(screen.getByText('feat/163-2-web-scaffold')).toBeInTheDocument()
  expect(screen.getByText(/1 dirty/)).toBeInTheDocument()
})

test('shows ahead count and open PRs', () => {
  render(<GitStatus />)
  expect(screen.getByText(/↑2/)).toBeInTheDocument()
  expect(screen.getByText(/#191/)).toBeInTheDocument()
  expect(screen.getByText(/feat\(web\): scaffold/)).toBeInTheDocument()
})
