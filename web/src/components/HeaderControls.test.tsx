import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi, beforeEach } from 'vitest'

const getJSON = vi.fn()
const patchJSON = vi.fn().mockResolvedValue({ success: true })
vi.mock('../api/rest', () => ({
  getJSON: (p: string) => getJSON(p),
  patchJSON: (p: string, b: unknown) => patchJSON(p, b),
}))

import { HeaderControls } from './HeaderControls'

beforeEach(() => {
  getJSON.mockImplementation((path: string) => {
    if (path === '/api/settings/themes')
      return Promise.resolve({ themes: ['discworld', 'scifi'] })
    return Promise.resolve({ theme: 'discworld', bell_mode: false, relay_mode: true })
  })
  patchJSON.mockClear()
})

test('loads themes and current settings', async () => {
  render(<HeaderControls />)
  await waitFor(() =>
    expect(screen.getByLabelText(/theme/i)).toHaveValue('discworld'),
  )
  expect(screen.getByRole('option', { name: 'scifi' })).toBeInTheDocument()
})

test('changing theme PATCHes settings and refetches (no optimistic UI)', async () => {
  render(<HeaderControls />)
  await waitFor(() => expect(screen.getByLabelText(/theme/i)).toHaveValue('discworld'))
  await userEvent.selectOptions(screen.getByLabelText(/theme/i), 'scifi')
  expect(patchJSON).toHaveBeenCalledWith('/api/settings/', { theme: 'scifi' })
})

test('toggling bell mode PATCHes the flag', async () => {
  render(<HeaderControls />)
  await waitFor(() => expect(screen.getByLabelText(/bell/i)).not.toBeChecked())
  await userEvent.click(screen.getByLabelText(/bell/i))
  expect(patchJSON).toHaveBeenCalledWith('/api/settings/', { bell_mode: true })
})

test('failed PATCH surfaces an error message', async () => {
  patchJSON.mockRejectedValueOnce(new Error('PATCH /api/settings/ failed: 500'))
  render(<HeaderControls />)
  await waitFor(() => expect(screen.getByLabelText(/theme/i)).toHaveValue('discworld'))
  await userEvent.selectOptions(screen.getByLabelText(/theme/i), 'scifi')
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/500/))
})
