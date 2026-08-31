import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

describe('App', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-01T12:00:00'))
  })

  it('shows the workout scheduled for the current week', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: /DJ KELLER/i })).toBeInTheDocument()
    expect(screen.getByText('Manmakers')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })
})
