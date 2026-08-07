import { renderHook, act } from '@testing-library/react'
import { expect, test, vi, beforeEach } from 'vitest'

const sockets: MockSocket[] = []
class MockSocket {
  onMessage!: (d: unknown) => void
  onStatus!: (c: boolean) => void
  connect = vi.fn()
  close = vi.fn()
}
vi.mock('./ws', () => ({
  ChannelSocket: class {
    constructor(
      _ch: string,
      onMessage: (d: unknown) => void,
      onStatus: (c: boolean) => void,
    ) {
      const s = new MockSocket()
      s.onMessage = onMessage
      s.onStatus = onStatus
      sockets.push(s)
      return s
    }
  },
}))

import { useChannel } from './useChannel'

beforeEach(() => (sockets.length = 0))

test('exposes snapshot data, connected flag, and lastUpdated', () => {
  const { result } = renderHook(() => useChannel<{ type: string }>('sprint'))
  expect(result.current.data).toBeNull()
  expect(result.current.connected).toBe(false)

  act(() => sockets[0].onStatus(true))
  expect(result.current.connected).toBe(true)

  act(() => sockets[0].onMessage({ type: 'init' }))
  expect(result.current.data).toEqual({ type: 'init' })
  expect(result.current.lastUpdated).not.toBeNull()
})

test('keeps last snapshot when disconnected (stale, not blank)', () => {
  const { result } = renderHook(() => useChannel<{ type: string }>('git'))
  act(() => {
    sockets[0].onStatus(true)
    sockets[0].onMessage({ type: 'init' })
    sockets[0].onStatus(false)
  })
  expect(result.current.connected).toBe(false)
  expect(result.current.data).toEqual({ type: 'init' })
})

test('closes the socket on unmount', () => {
  const { unmount } = renderHook(() => useChannel('story'))
  unmount()
  expect(sockets[0].close).toHaveBeenCalled()
})
