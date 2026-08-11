const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000]

export type SocketFactory = (url: string) => WebSocket

export class ChannelSocket<T = unknown> {
  #ws: WebSocket | null = null
  #attempts = 0
  #stopped = false
  #timer: ReturnType<typeof setTimeout> | null = null
  #channel: string
  #onMessage: (data: T) => void
  #onStatus: (connected: boolean) => void
  #makeSocket: SocketFactory

  constructor(
    channel: string,
    onMessage: (data: T) => void,
    onStatus: (connected: boolean) => void,
    makeSocket: SocketFactory = (url) => new WebSocket(url),
  ) {
    this.#channel = channel
    this.#onMessage = onMessage
    this.#onStatus = onStatus
    this.#makeSocket = makeSocket
  }

  connect(): void {
    if (this.#stopped) return
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = this.#makeSocket(`${proto}://${location.host}/ws/${this.#channel}`)
    this.#ws = ws
    ws.onopen = () => {
      this.#attempts = 0
      this.#onStatus(true)
    }
    ws.onmessage = (ev) => this.#onMessage(JSON.parse(ev.data) as T)
    ws.onclose = () => {
      if (this.#stopped) return
      this.#onStatus(false)
      this.#scheduleReconnect()
    }
    ws.onerror = () => ws.close()
  }

  #scheduleReconnect(): void {
    if (this.#stopped) return
    const delay = BACKOFF_MS[Math.min(this.#attempts, BACKOFF_MS.length - 1)]
    this.#attempts += 1
    this.#timer = setTimeout(() => this.connect(), delay)
  }

  close(): void {
    this.#stopped = true
    if (this.#timer) clearTimeout(this.#timer)
    this.#ws?.close()
  }
}
