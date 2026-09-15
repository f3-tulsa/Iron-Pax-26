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
    expect(screen.getByRole('img', { name: 'B Squared Solutions' })).toHaveAttribute(
      'src',
      'https://i.ibb.co/3y2m4sVM/B2-S-Logo-Red-Black.png',
    )
  })

  it('shows the IronPAX week 1 workout on its scheduled week', () => {
    vi.setSystemTime(new Date('2026-09-08T12:00:00'))
    render(<App />)

    expect(screen.getByRole('heading', { name: /RUNNERS ARE PEOPLE TOO/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Thrusters' })).toBeInTheDocument()
    expect(screen.getByText('Completed Laps')).toBeInTheDocument()

    for (let exercise = 0; exercise < 5; exercise += 1) {
      fireEvent.click(screen.getByRole('button', { name: /Next Move/i }))
    }

    expect(screen.getByRole('heading', { name: 'Run' })).toBeInTheDocument()
    expect(screen.getByText('400 meters')).toBeInTheDocument()
    expect(screen.getByText('Measured lap')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Complete Lap/i })).toBeInTheDocument()
  })

  it('shows the IronPAX week 2 workout on its scheduled week', () => {
    vi.setSystemTime(new Date('2026-09-15T12:00:00'))
    render(<App />)

    expect(screen.getByRole('heading', { name: /RAISE THE FLAG/i })).toBeInTheDocument()
    expect(screen.getByText('Banked Score')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Run' })).toBeInTheDocument()
    expect(screen.getByText('100 yards')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Next Move/i }))

    expect(screen.getByRole('heading', { name: 'Bonnies' })).toBeInTheDocument()
    expect(screen.getByText('12 reps')).toBeInTheDocument()
    expect(screen.getByText('100')).toBeInTheDocument()
  })

  it('lets you switch to a different IronPAX workout from the selector', () => {
    render(<App />)

    fireEvent.change(screen.getByLabelText('Select IronPAX workout'), {
      target: { value: 'runners-are-people-too-2026-09-07' },
    })

    expect(screen.getByRole('heading', { name: /RUNNERS ARE PEOPLE TOO/i })).toBeInTheDocument()
    expect(screen.getByText('Completed Laps')).toBeInTheDocument()

    for (let exercise = 0; exercise < 5; exercise += 1) {
      fireEvent.click(screen.getByRole('button', { name: /Next Move/i }))
    }

    expect(screen.getByRole('heading', { name: 'Run' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Complete Lap/i })).toBeInTheDocument()
  })

  it('defaults to the latest workout when no week is currently scheduled', () => {
    vi.setSystemTime(new Date('2026-09-20T12:00:00'))
    render(<App />)

    expect(screen.getByRole('heading', { name: /RAISE THE FLAG/i })).toBeInTheDocument()
    expect(screen.getByDisplayValue('IronPAX Week 2 • RAISE THE FLAG')).toBeInTheDocument()
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

  it('shows analytics when finishing early with the finish button', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    act(() => vi.advanceTimersByTime(3_000))
    fireEvent.click(screen.getByRole('button', { name: /Finish Now/i }))

    expect(screen.getByText('Round Comparison')).toBeInTheDocument()
    expect(screen.getByText('Final Time').parentElement).toHaveTextContent('00:03.00')
  })

  it('lets you enter a partial score when finishing the progressive workout early', () => {
    vi.setSystemTime(new Date('2026-09-15T12:00:00'))
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /Next Move/i }))
    fireEvent.click(screen.getByRole('button', { name: /Finish Now/i }))

    expect(screen.getByText('Score').parentElement).toHaveTextContent('100')

    fireEvent.change(screen.getByLabelText('Completed reps on Bonnies'), {
      target: { value: '11' },
    })

    expect(screen.getByText('Score').parentElement).toHaveTextContent('111')
    expect(screen.getByRole('heading', { name: 'Points by round' })).toBeInTheDocument()
    expect(screen.getByText('111 points')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Completed reps on Bonnies'), {
      target: { value: '99' },
    })

    expect(screen.getByText('Score').parentElement).toHaveTextContent('112')
    fireEvent.blur(screen.getByLabelText('Completed reps on Bonnies'))
    expect(screen.getByDisplayValue('12')).toBeInTheDocument()
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

  it('restores a completed score report with partial progress for the progressive workout', () => {
    vi.setSystemTime(new Date('2026-09-15T12:00:00'))
    localStorage.setItem(
      'iron-pax-progress:raise-the-flag-2026-09-14',
      JSON.stringify({
        currentRound: 1,
        currentExerciseIndex: 1,
        elapsedMilliseconds: 3_000,
        isFinished: true,
        partialProgress: 11,
        exerciseTimes: [Array(8).fill(0)],
      }),
    )

    render(<App />)

    expect(screen.getByText('Score').parentElement).toHaveTextContent('111')
    expect(screen.getByText('Stopped On').parentElement).toHaveTextContent('R1 • Bonnies')
    expect(screen.getByDisplayValue('11')).toBeInTheDocument()
  })

  it('does not add an empty next-round score row after completing a full progressive round', () => {
    vi.setSystemTime(new Date('2026-09-15T12:00:00'))
    render(<App />)

    for (let exercise = 0; exercise < 8; exercise += 1) {
      fireEvent.click(
        screen.getByRole('button', {
          name: exercise === 7 ? /Complete Round/i : /Next Move/i,
        }),
      )
    }

    fireEvent.click(screen.getByRole('button', { name: /Finish Now/i }))

    expect(screen.getByText('Completed Through').parentElement).toHaveTextContent('Round 1')
    expect(screen.queryByRole('heading', { name: 'Stopped mid-move?' })).not.toBeInTheDocument()
    expect(screen.queryByText('Round 2')).not.toBeInTheDocument()
  })

  it('counts completed laps for the amrap workout when time expires mid-lap', () => {
    vi.setSystemTime(new Date('2026-09-08T12:00:00'))
    let renderFrame: FrameRequestCallback = () => undefined
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        renderFrame = callback
        return 1
      }),
    )
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Start' }))

    for (let exercise = 0; exercise < 6; exercise += 1) {
      act(() => vi.advanceTimersByTime(1_000))
      fireEvent.click(screen.getByRole('button', { name: exercise === 5 ? /Complete Lap/i : /Next Move/i }))
    }

    act(() => vi.advanceTimersByTime(2_695_000))
    act(() => renderFrame(0))

    expect(screen.getByText('Final Time').parentElement).toHaveTextContent('45:00.00')
    expect(screen.getByText('Score').parentElement).toHaveTextContent('1 Lap')
    expect(screen.queryByText('Lap 2')).not.toBeInTheDocument()
  })
})
