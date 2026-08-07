import { useEffect, useState } from 'react'
import { ChannelSocket } from './ws'
import { dropChannel, setChannelStatus } from './connection'

export interface ChannelState<T> {
  data: T | null
  connected: boolean
  lastUpdated: number | null
}

// Every Frame WS message is a full snapshot (init on connect, update on
// 5s polls) — replace wholesale, never merge. Reconnect re-snapshot is
// server behavior (send_initial_data on connect).
export function useChannel<T>(channel: string): ChannelState<T> {
  const [state, setState] = useState<ChannelState<T>>({
    data: null,
    connected: false,
    lastUpdated: null,
  })

  useEffect(() => {
    const sock = new ChannelSocket<T>(
      channel,
      (data) => setState((s) => ({ ...s, data, lastUpdated: Date.now() })),
      (connected) => {
        setChannelStatus(channel, connected)
        setState((s) => ({ ...s, connected }))
      },
    )
    sock.connect()
    return () => {
      sock.close()
      dropChannel(channel)
    }
  }, [channel])

  return state
}
