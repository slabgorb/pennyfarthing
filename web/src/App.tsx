import { SprintBoard } from './panels/SprintBoard'
import { WorkflowActivity } from './panels/WorkflowActivity'
import { GitStatus } from './panels/GitStatus'
import { HeaderControls } from './components/HeaderControls'
import { DisconnectBanner } from './components/DisconnectBanner'

export default function App() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4">
      <header className="flex items-center gap-3 pb-4" data-testid="app-header">
        <h1 className="text-lg font-semibold tracking-wide">Pennyfarthing</h1>
        <HeaderControls />
      </header>
      <DisconnectBanner />
      <main
        className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start"
        data-testid="panel-grid"
      >
        <SprintBoard />
        <WorkflowActivity />
        <GitStatus />
      </main>
    </div>
  )
}
