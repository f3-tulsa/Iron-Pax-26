import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

describe('App', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-01T12:00:00'))
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('shows the workout scheduled for the current week', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: /DJ KELLER/i })).toBeInTheDocument()
    expect(screen.getByText('Manmakers')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('records only active time for each exercise', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    act(() => vi.advanceTimersByTime(1_200))
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    act(() => vi.advanceTimersByTime(5_000))
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
    act(() => vi.advanceTimersByTime(800))
    fireEvent.click(screen.getByRole('button', { name: /Next Move/i }))

    const saved = JSON.parse(localStorage.getItem('iron-pax-progress:dj-keller-2026-08-31')!)
    expect(saved.elapsedMilliseconds).toBe(2_000)
    expect(saved.exerciseTimes[0][0]).toBe(2_000)
    expect(saved.exerciseTimes[0][1]).toBe(0)
  })

  it('persists the current exercise split during an active interval', () => {
    let renderFrame: FrameRequestCallback = () => undefined
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        renderFrame = callback
        return 1
      }),
    )
    const { unmount } = render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    act(() => vi.advanceTimersByTime(1_500))
    act(() => renderFrame(0))
    unmount()

    const saved = JSON.parse(localStorage.getItem('iron-pax-progress:dj-keller-2026-08-31')!)
    expect(saved.elapsedMilliseconds).toBe(1_500)
    expect(saved.exerciseTimes[0][0]).toBe(1_500)
  })

  it('adds revisited time to the original exercise split', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    act(() => vi.advanceTimersByTime(1_000))
    fireEvent.click(screen.getByRole('button', { name: /Next Move/i }))
    act(() => vi.advanceTimersByTime(500))
    fireEvent.click(screen.getByRole('button', { name: 'Previous exercise' }))
    act(() => vi.advanceTimersByTime(1_000))
    fireEvent.click(screen.getByRole('button', { name: /Next Move/i }))

    const saved = JSON.parse(localStorage.getItem('iron-pax-progress:dj-keller-2026-08-31')!)
    expect(saved.exerciseTimes[0][0]).toBe(2_000)
    expect(saved.exerciseTimes[0][1]).toBe(500)
  })

  it('shows round and exercise analytics only after the workout finishes', () => {
    render(<App />)

    expect(screen.queryByText('Round Comparison')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    for (let exercise = 0; exercise < 20; exercise += 1) {
      act(() => vi.advanceTimersByTime(1_000))
      fireEvent.click(
        screen.getByRole('button', {
          name: exercise === 19 ? /Finish WOD/i : /Next Move/i,
        }),
      )
    }

    expect(screen.getByText('Round Comparison')).toBeInTheDocument()
    expect(screen.getByText('Final Time').parentElement).toHaveTextContent('00:20.00')
    expect(screen.getByText('Average Round').parentElement).toHaveTextContent('00:05.00')
    expect(screen.getByRole('heading', { name: 'Time by exercise' })).toBeInTheDocument()
    expect(screen.getAllByText('00:01.00').length).toBeGreaterThanOrEqual(20)
  })

  it('restores a completed analytics report from saved progress', () => {
    localStorage.setItem(
      'iron-pax-progress:dj-keller-2026-08-31',
      JSON.stringify({
        currentRound: 4,
        currentExerciseIndex: 4,
        elapsedMilliseconds: 20_000,
        isFinished: true,
        exerciseTimes: Array.from({ length: 4 }, () => Array(5).fill(1_000)),
      }),
    )

    render(<App />)

    expect(screen.getByText('Round Comparison')).toBeInTheDocument()
    expect(screen.getByText('Final Time').parentElement).toHaveTextContent('00:20.00')
    expect(screen.getAllByRole('heading', { name: /Round [1-4]/ })).toHaveLength(4)
  })
})
