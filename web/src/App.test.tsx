import { render, screen } from '@testing-library/react'
import App from './App'

test('renders the app shell with header and panel grid', () => {
  render(<App />)
  expect(screen.getByText('Pennyfarthing')).toBeInTheDocument()
  expect(screen.getByTestId('panel-grid')).toBeInTheDocument()
})
