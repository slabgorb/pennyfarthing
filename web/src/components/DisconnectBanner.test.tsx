import { render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

let connected = true
vi.mock('../api/connection', () => ({ useConnectionStatus: () => connected }))

import { DisconnectBanner } from './DisconnectBanner'

test('renders nothing while connected', () => {
  connected = true
  const { container } = render(<DisconnectBanner />)
  expect(container).toBeEmptyDOMElement()
})

test('shows retry banner when any channel is down', () => {
  connected = false
  render(<DisconnectBanner />)
  expect(screen.getByText(/frame disconnected — retrying/i)).toBeInTheDocument()
})
