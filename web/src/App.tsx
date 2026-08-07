export default function App() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4">
      <header className="flex items-center gap-3 pb-4" data-testid="app-header">
        <h1 className="text-lg font-semibold tracking-wide">Pennyfarthing</h1>
      </header>
      <main
        className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start"
        data-testid="panel-grid"
      />
    </div>
  )
}
