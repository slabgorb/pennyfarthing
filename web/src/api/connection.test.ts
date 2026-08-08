import { renderHook, act } from '@testing-library/react'
import { expect, test, afterEach } from 'vitest'
import { setChannelStatus, dropChannel, useConnectionStatus } from './connection'

const TEST_CHANNELS = ['ch-a', 'ch-b', 'ch-c'] as const

afterEach(() => {
  for (const ch of TEST_CHANNELS) dropChannel(ch)
})

test('true when all registered channels are connected', () => {
  const { result } = renderHook(() => useConnectionStatus())
  act(() => {
    setChannelStatus('ch-a', true)
    setChannelStatus('ch-b', true)
  })
  expect(result.current).toBe(true)
})

test('false when any channel is disconnected', () => {
  const { result } = renderHook(() => useConnectionStatus())
  act(() => {
    setChannelStatus('ch-a', true)
    setChannelStatus('ch-b', false)
  })
  expect(result.current).toBe(false)
})

test('dropped channel no longer counts toward status', () => {
  const { result } = renderHook(() => useConnectionStatus())
  act(() => {
    setChannelStatus('ch-a', true)
    setChannelStatus('ch-b', false)
  })
  expect(result.current).toBe(false)
  act(() => dropChannel('ch-b'))
  expect(result.current).toBe(true)
})
