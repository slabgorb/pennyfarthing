import { useChannel } from '../api/useChannel'
import type { Epic, SprintMessage, Story } from '../api/types'
import { PanelShell } from '../components/PanelShell'

const STATUS_STYLES: Record<string, string> = {
  done: 'bg-emerald-900 text-emerald-300',
  completed: 'bg-emerald-900 text-emerald-300',
  in_progress: 'bg-amber-900 text-amber-300',
  in_review: 'bg-sky-900 text-sky-300',
  backlog: 'bg-zinc-800 text-zinc-400',
}

function CopyChip({ value }: { value: string }) {
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard.writeText(value)}
      title={`Copy ${value}`}
      className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-xs text-zinc-300 hover:bg-zinc-700 active:bg-zinc-600"
    >
      {value}
    </button>
  )
}

function StoryRow({ story }: { story: Story }) {
  const status = story.status ?? 'backlog'
  return (
    <li className="flex items-center gap-2 py-1">
      <CopyChip value={story.id} />
      {story.jira && <CopyChip value={story.jira} />}
      <span className="flex-1 truncate text-sm">{story.title}</span>
      {story.points != null && (
        <span className="text-xs text-zinc-500">{story.points}pt</span>
      )}
      <span
        className={`rounded px-1.5 py-0.5 text-xs ${STATUS_STYLES[status] ?? STATUS_STYLES.backlog}`}
      >
        {status}
      </span>
    </li>
  )
}

function EpicBlock({ epic }: { epic: Epic }) {
  return (
    <div className="pt-2">
      <h3 className="flex items-center gap-2 text-sm font-medium text-zinc-300">
        {epic.title}
        {epic.jiraKey && <CopyChip value={epic.jiraKey} />}
      </h3>
      <ul className="divide-y divide-zinc-800/60">
        {epic.stories.map((s) => (
          <StoryRow key={s.id} story={s} />
        ))}
      </ul>
    </div>
  )
}

export function SprintBoard() {
  const { data, connected, lastUpdated } = useChannel<SprintMessage>('sprint')
  const epics = data?.epics ?? []
  return (
    <PanelShell title="Sprint" connected={connected} lastUpdated={lastUpdated}>
      {data && (
        <div>
          <p className="text-sm text-zinc-300">
            {data.sprint.name}
            <span className="ml-2 text-xs text-zinc-500">
              done {data.sprint.done} · in&nbsp;progress {data.sprint.inProgress} ·
              review {data.sprint.inReview} · remaining {data.sprint.remaining}
            </span>
          </p>
          {epics.length === 0 ? (
            <p className="pt-2 text-sm text-zinc-500">No stories in this sprint.</p>
          ) : (
            epics.map((e) => <EpicBlock key={e.id} epic={e} />)
          )}
        </div>
      )}
    </PanelShell>
  )
}
