import { useCallback, useEffect, useState } from 'react'
import { getJSON, patchJSON } from '../api/rest'

interface Settings {
  theme?: string
  bell_mode?: boolean
  relay_mode?: boolean
}

// No optimistic UI (spec): every change PATCHes, then re-reads the server's
// confirmed state.
export function HeaderControls() {
  const [themes, setThemes] = useState<string[]>([])
  const [settings, setSettings] = useState<Settings>({})
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    getJSON<Settings>('/api/settings/').then(setSettings).catch((e: Error) => setError(e.message))
  }, [])

  useEffect(() => {
    getJSON<{ themes: string[] }>('/api/settings/themes')
      .then((r) => setThemes(r.themes))
      .catch((e: Error) => setError(e.message))
    refresh()
  }, [refresh])

  const apply = (patch: Settings) => {
    setError(null)
    patchJSON('/api/settings/', patch)
      .then(refresh)
      .catch((e: Error) => setError(e.message))
  }

  return (
    <div className="ml-auto flex items-center gap-4 text-sm">
      <label className="flex items-center gap-2">
        <span className="text-zinc-400">Theme</span>
        <select
          aria-label="theme"
          value={settings.theme ?? ''}
          onChange={(e) => apply({ theme: e.target.value })}
          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1"
        >
          {themes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2">
        <span className="text-zinc-400">Bell</span>
        <input
          type="checkbox"
          aria-label="bell mode"
          checked={settings.bell_mode ?? false}
          onChange={(e) => apply({ bell_mode: e.target.checked })}
        />
      </label>
      <label className="flex items-center gap-2">
        <span className="text-zinc-400">Relay</span>
        <input
          type="checkbox"
          aria-label="relay mode"
          checked={settings.relay_mode ?? false}
          onChange={(e) => apply({ relay_mode: e.target.checked })}
        />
      </label>
      {error && (
        <span role="alert" className="text-xs text-red-400">
          {error}
        </span>
      )}
    </div>
  )
}
