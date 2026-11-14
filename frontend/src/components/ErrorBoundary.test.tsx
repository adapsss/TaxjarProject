// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

afterEach(cleanup)

function Broken(): never {
  throw new Error('boom')
}

it('shows its children while they render', () => {
  render(
    <ErrorBoundary>
      <p>fine</p>
    </ErrorBoundary>,
  )
  expect(screen.getByText('fine')).toBeTruthy()
})

it('shows a way back instead of a blank page when a screen throws', () => {
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
  render(
    <ErrorBoundary>
      <Broken />
    </ErrorBoundary>,
  )
  expect(screen.getByRole('alert').textContent).toContain('Something went wrong on this screen')
  expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy()
  expect(logged).toHaveBeenCalled()
  logged.mockRestore()
})
