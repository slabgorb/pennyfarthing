import { useConnectionStatus } from '../api/connection'

export function DisconnectBanner() {
  const connected = useConnectionStatus()
  if (connected) return null
  return (
    <div className="mb-3 rounded border border-red-800 bg-red-950 px-3 py-2 text-sm text-red-300">
      Frame disconnected — retrying…
    </div>
  )
}
