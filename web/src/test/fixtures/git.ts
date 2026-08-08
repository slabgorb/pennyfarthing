import type { GitMessage } from '../../api/types'

export const gitFixture: GitMessage = {
  type: 'init',
  repos: [
    {
      name: 'orchestrator',
      path: '.',
      branch: 'main',
      clean: true,
      ahead: 0,
      behind: 0,
      developBehind: null,
      dirtyFiles: [],
      openPrs: [],
    },
    {
      name: 'pennyfarthing',
      path: 'pennyfarthing',
      branch: 'feat/163-2-web-scaffold',
      clean: false,
      ahead: 2,
      behind: 0,
      developBehind: 1,
      dirtyFiles: [{ path: 'web/src/App.tsx', status: 'M' }],
      openPrs: [{ number: 191, title: 'feat(web): scaffold', isDraft: false }],
    },
  ],
}
