import { useEffect, useState } from 'react'
import { getJSON } from '../api/rest'
import { useChannel } from '../api/useChannel'
import type { PersonaPayload, StoryMessage } from '../api/types'
import { PanelShell } from '../components/PanelShell'

interface WorkflowInfo {
  workflow: string | null
  phase: string | null
  phases: { name: string; agent: string }[]
}

export function WorkflowActivity() {
  const story = useChannel<StoryMessage>('story')
  const persona = useChannel<PersonaPayload>('persona')
  const [workflow, setWorkflow] = useState<WorkflowInfo | null>(null)
  const [workflowError, setWorkflowError] = useState<string | null>(null)

  const workflowName = story.data?.workflow ?? null
  useEffect(() => {
    if (!workflowName) {
      setWorkflow(null)
      return
    }
    let cancelled = false
    getJSON<WorkflowInfo>('/api/workflow/')
      .then((w) => !cancelled && (setWorkflow(w), setWorkflowError(null)))
      .catch((e: Error) => !cancelled && setWorkflowError(e.message))
    return () => {
      cancelled = true
    }
    // Refetch whenever the active workflow or phase changes.
  }, [workflowName, story.data?.phase])

  const connected = story.connected && persona.connected
  const lastUpdated = story.lastUpdated

  return (
    <PanelShell title="Workflow" connected={connected} lastUpdated={lastUpdated}>
      {story.data?.id == null ? (
        <p className="text-sm text-zinc-500">No active story.</p>
      ) : (
        <div className="space-y-3">
          <div>
            <p className="font-mono text-sm text-zinc-300">{story.data.id}</p>
            <p className="text-sm">{story.data.title}</p>
            <p className="text-xs text-zinc-500">workflow: {story.data.workflow}</p>
          </div>
          {workflowError && (
            <p className="text-xs text-red-400">workflow phases unavailable: {workflowError}</p>
          )}
          {workflow && (
            <ol className="flex flex-wrap gap-1">
              {workflow.phases.map((ph) => {
                const current = ph.name === story.data?.phase
                return (
                  <li
                    key={ph.name}
                    data-testid={`phase-${ph.name}`}
                    data-current={current}
                    className={`rounded px-2 py-1 text-xs ${
                      current
                        ? 'bg-amber-800 font-semibold text-amber-100'
                        : 'bg-zinc-800 text-zinc-400'
                    }`}
                  >
                    {ph.name} <span className="opacity-60">· {ph.agent}</span>
                  </li>
                )
              })}
            </ol>
          )}
          {persona.data?.character && (
            <div className="flex items-center gap-3 border-t border-zinc-800 pt-3">
              <img
                src="/api/persona/portrait"
                alt=""
                className="h-10 w-10 rounded-full object-cover"
                onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
              />
              <div>
                <p className="text-sm font-medium">{persona.data.character}</p>
                <p className="text-xs text-zinc-500">
                  {persona.data.role} — {persona.data.roleDescription}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </PanelShell>
  )
}
