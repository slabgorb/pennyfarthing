import { expect, test, vi, beforeEach, afterEach } from 'vitest'
import { ChannelSocket } from './ws'

class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  closed = false
  url: string
  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }
  close() {
    this.closed = true
    this.onclose?.()
  }
}

beforeEach(() => {
  FakeWebSocket.instances = []
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

function make(onMessage = vi.fn(), onStatus = vi.fn()) {
  const sock = new ChannelSocket(
    'sprint',
    onMessage,
    onStatus,
    (url) => new FakeWebSocket(url) as unknown as WebSocket,
  )
  return { sock, onMessage, onStatus }
}

test('connects to /ws/{channel} and reports connected on open', () => {
  const { sock, onStatus } = make()
  sock.connect()
  const ws = FakeWebSocket.instances[0]
  expect(ws.url).toContain('/ws/sprint')
  ws.onopen?.()
  expect(onStatus).toHaveBeenCalledWith(true)
})

test('parses JSON messages into the callback', () => {
  const { sock, onMessage } = make()
  sock.connect()
  FakeWebSocket.instances[0].onmessage?.({ data: '{"type":"init","x":1}' })
  expect(onMessage).toHaveBeenCalledWith({ type: 'init', x: 1 })
})

test('reconnects with backoff after close', () => {
  const { sock, onStatus } = make()
  sock.connect()
  FakeWebSocket.instances[0].onclose?.()
  expect(onStatus).toHaveBeenCalledWith(false)
  expect(FakeWebSocket.instances).toHaveLength(1)
  vi.advanceTimersByTime(1000)
  expect(FakeWebSocket.instances).toHaveLength(2)
  // second failure backs off longer
  FakeWebSocket.instances[1].onclose?.()
  vi.advanceTimersByTime(1000)
  expect(FakeWebSocket.instances).toHaveLength(2)
  vi.advanceTimersByTime(1000)
  expect(FakeWebSocket.instances).toHaveLength(3)
})

test('close() stops reconnecting', () => {
  const { sock } = make()
  sock.connect()
  sock.close()
  vi.advanceTimersByTime(60000)
  expect(FakeWebSocket.instances).toHaveLength(1)
})
