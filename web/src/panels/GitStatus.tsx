import { useChannel } from '../api/useChannel'
import type { GitMessage, GitRepo } from '../api/types'
import { PanelShell } from '../components/PanelShell'

function RepoRow({ repo }: { repo: GitRepo }) {
  const dirty = repo.dirtyFiles?.length ?? 0
  return (
    <div className="border-t border-zinc-800/60 py-2 first:border-t-0">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{repo.name}</span>
        <span className="font-mono text-xs text-zinc-400">{repo.branch}</span>
        <span className="flex-1" />
        {repo.ahead ? <span className="text-xs text-amber-400">↑{repo.ahead}</span> : null}
        {repo.behind ? <span className="text-xs text-sky-400">↓{repo.behind}</span> : null}
        <span
          className={`rounded px-1.5 py-0.5 text-xs ${
            repo.clean ? 'bg-emerald-900 text-emerald-300' : 'bg-amber-900 text-amber-300'
          }`}
        >
          {repo.clean ? 'clean' : `${dirty} dirty`}
        </span>
      </div>
      {(repo.openPrs?.length ?? 0) > 0 && (
        <ul className="pt-1">
          {repo.openPrs!.map((pr) => (
            <li key={pr.number} className="truncate text-xs text-zinc-400">
              <span className="font-mono">#{pr.number}</span> {pr.title}
              {pr.isDraft && <span className="ml-1 text-zinc-600">(draft)</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function GitStatus() {
  const { data, connected, lastUpdated } = useChannel<GitMessage>('git')
  return (
    <PanelShell title="Git" connected={connected} lastUpdated={lastUpdated}>
      {data && data.repos.map((r) => <RepoRow key={r.name} repo={r} />)}
    </PanelShell>
  )
}
