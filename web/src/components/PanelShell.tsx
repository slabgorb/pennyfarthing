import type { ReactNode } from 'react'

interface Props {
  title: string
  connected: boolean
  lastUpdated: number | null
  children: ReactNode
}

export function PanelShell({ title, connected, lastUpdated, children }: Props) {
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900">
      <header className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="flex items-center gap-2 text-xs text-zinc-400">
          {!connected && lastUpdated !== null && (
            <span>stale · {new Date(lastUpdated).toLocaleTimeString()}</span>
          )}
          <span
            aria-label={connected ? 'connected' : 'disconnected'}
            className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-red-500'}`}
          />
        </span>
      </header>
      <div
        data-testid="panel-body"
        className={`p-3 ${!connected && lastUpdated !== null ? 'opacity-50' : ''}`}
      >
        {lastUpdated === null ? (
          <p className="text-sm text-zinc-500">Waiting for Frame…</p>
        ) : (
          children
        )}
      </div>
    </section>
  )
}
