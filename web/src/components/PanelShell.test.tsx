import { render, screen } from '@testing-library/react'
import { PanelShell } from './PanelShell'

test('shows title and children when connected', () => {
  render(
    <PanelShell title="Sprint" connected={true} lastUpdated={Date.now()}>
      <div>body</div>
    </PanelShell>,
  )
  expect(screen.getByText('Sprint')).toBeInTheDocument()
  expect(screen.getByText('body')).toBeInTheDocument()
  expect(screen.queryByText(/stale/i)).not.toBeInTheDocument()
})

test('dims and labels stale content when disconnected', () => {
  render(
    <PanelShell title="Sprint" connected={false} lastUpdated={Date.now() - 60_000}>
      <div>body</div>
    </PanelShell>,
  )
  expect(screen.getByText(/stale/i)).toBeInTheDocument()
  expect(screen.getByTestId('panel-body')).toHaveClass('opacity-50')
})

test('shows waiting state when no data has ever arrived', () => {
  render(
    <PanelShell title="Sprint" connected={false} lastUpdated={null}>
      {null}
    </PanelShell>,
  )
  expect(screen.getByText(/waiting for frame/i)).toBeInTheDocument()
})
