// Shapes mirror pf/frame/ws_push.py fetchers verbatim. Do NOT add derived
// fields here — computation belongs in Frame routes (boundary rule).

export interface Story {
  id: string
  title: string
  points?: number
  status?: string
  jira?: string
}

export interface Epic {
  id: string
  title: string
  jiraKey: string
  status: string
  stories: Story[]
}

export interface SprintSummary {
  number: string | number
  name: string
  goal: string
  done: number
  remaining: number
  inProgress: number
  inReview: number
}

export interface SprintMessage {
  type: 'init' | 'update'
  sprint: SprintSummary
  epics: Epic[]
  completedEpics: Epic[]
}

export interface StoryMessage {
  type?: 'init' | 'update'
  id: string | null
  title: string | null
  phase: string | null
  workflow: string | null
}

export interface GitRepo {
  name: string
  path: string
  branch: string
  clean: boolean
  ahead: number | null
  behind: number | null
  developBehind: number | null
  dirtyFiles: { path?: string; status?: string }[]
  openPrs?: { number: number; title: string; isDraft: boolean }[]
}

export interface GitMessage {
  type: 'init' | 'update'
  repos: GitRepo[]
}

// fetch_persona returns the payload bare — no `type` field.
export interface PersonaPayload {
  character?: string
  role?: string
  roleDescription?: string
  quote?: string
  theme?: string
  trait?: string
  portraitPath?: string | null
}
