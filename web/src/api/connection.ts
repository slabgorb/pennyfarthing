import { useSyncExternalStore } from 'react'

// Registry of per-channel connection status; the app banner shows when any
// registered channel is down.
const status = new Map<string, boolean>()
const listeners = new Set<() => void>()

export function setChannelStatus(channel: string, connected: boolean): void {
  status.set(channel, connected)
  listeners.forEach((l) => l())
}

export function dropChannel(channel: string): void {
  status.delete(channel)
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function allConnected(): boolean {
  for (const connected of status.values()) if (!connected) return false
  return true
}

export function useConnectionStatus(): boolean {
  return useSyncExternalStore(subscribe, allConnected)
}
