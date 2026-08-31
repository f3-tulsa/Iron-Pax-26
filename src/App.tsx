import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Activity,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  RotateCcw,
  Trophy,
} from 'lucide-react'
import { getWorkoutForDate, type Workout } from './data/workouts'

interface SavedProgress {
  currentRound: number
  currentExerciseIndex: number
  elapsedMilliseconds: number
  isFinished: boolean
  exerciseTimes: number[][]
}

const initialProgress: SavedProgress = {
  currentRound: 1,
  currentExerciseIndex: 0,
  elapsedMilliseconds: 0,
  isFinished: false,
  exerciseTimes: [],
}

function formatTime(timeInMilliseconds: number) {
  const totalSeconds = Math.floor(timeInMilliseconds / 1000)
  return {
    minutes: String(Math.floor(totalSeconds / 60)).padStart(2, '0'),
    seconds: String(totalSeconds % 60).padStart(2, '0'),
    centiseconds: String(Math.floor((timeInMilliseconds % 1000) / 10)).padStart(2, '0'),
  }
}

function readProgress(storageKey: string): SavedProgress {
  const saved = localStorage.getItem(storageKey)
  if (!saved) return initialProgress

  try {
    return { ...initialProgress, ...(JSON.parse(saved) as Partial<SavedProgress>) }
  } catch {
    localStorage.removeItem(storageKey)
    return initialProgress
  }
}

function normalizeExerciseTimes(workout: Workout, savedTimes: number[][]) {
  return Array.from({ length: workout.rounds }, (_, roundIndex) =>
    Array.from(
      { length: workout.exercises.length },
      (_, exerciseIndex) => savedTimes[roundIndex]?.[exerciseIndex] ?? 0,
    ),
  )
}

function formatDuration(timeInMilliseconds: number) {
  const { minutes, seconds, centiseconds } = formatTime(timeInMilliseconds)
  return `${minutes}:${seconds}.${centiseconds}`
}

function WorkoutTracker({ workout }: { workout: Workout }) {
  const storageKey = `iron-pax-progress:${workout.id}`
  const [savedProgress] = useState(() => readProgress(storageKey))
  const [time, setTime] = useState(savedProgress.elapsedMilliseconds)
  const [isRunning, setIsRunning] = useState(false)
  const [isFinished, setIsFinished] = useState(savedProgress.isFinished)
  const [currentRound, setCurrentRound] = useState(savedProgress.currentRound)
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(
    savedProgress.currentExerciseIndex,
  )
  const [exerciseTimes, setExerciseTimes] = useState(() =>
    normalizeExerciseTimes(workout, savedProgress.exerciseTimes),
  )
  const requestRef = useRef<number | undefined>(undefined)
  const startTimeRef = useRef(0)
  const accumulatedTimeRef = useRef(savedProgress.elapsedMilliseconds)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)

  const requestWakeLock = useCallback(async () => {
    if (!('wakeLock' in navigator) || wakeLockRef.current) return

    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen')
    } catch (error) {
      console.warn('Screen wake lock could not be acquired.', error)
    }
  }, [])

  const releaseWakeLock = useCallback(async () => {
    if (!wakeLockRef.current) return

    await wakeLockRef.current.release()
    wakeLockRef.current = null
  }, [])

  const startTimer = useCallback(() => {
    if (isFinished || isRunning) return

    const updateTime = () => {
      setTime(accumulatedTimeRef.current + Date.now() - startTimeRef.current)
      requestRef.current = requestAnimationFrame(updateTime)
    }

    setIsRunning(true)
    startTimeRef.current = Date.now()
    requestRef.current = requestAnimationFrame(updateTime)
    void requestWakeLock()
  }, [isFinished, isRunning, requestWakeLock])

  const pauseTimer = useCallback(() => {
    if (!isRunning) return

    const intervalTime = Date.now() - startTimeRef.current
    accumulatedTimeRef.current += intervalTime
    setTime(accumulatedTimeRef.current)
    setExerciseTimes((times) =>
      times.map((round, roundIndex) =>
        round.map((exerciseTime, exerciseIndex) =>
          roundIndex === currentRound - 1 && exerciseIndex === currentExerciseIndex
            ? exerciseTime + intervalTime
            : exerciseTime,
        ),
      ),
    )
    setIsRunning(false)
    if (requestRef.current !== undefined) cancelAnimationFrame(requestRef.current)
    void releaseWakeLock()
  }, [currentExerciseIndex, currentRound, isRunning, releaseWakeLock])

  const recordActiveInterval = () => {
    if (!isRunning) return

    const now = Date.now()
    const intervalTime = now - startTimeRef.current
    accumulatedTimeRef.current += intervalTime
    startTimeRef.current = now
    setTime(accumulatedTimeRef.current)
    setExerciseTimes((times) =>
      times.map((round, roundIndex) =>
        round.map((exerciseTime, exerciseIndex) =>
          roundIndex === currentRound - 1 && exerciseIndex === currentExerciseIndex
            ? exerciseTime + intervalTime
            : exerciseTime,
        ),
      ),
    )
  }

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isRunning) {
        void requestWakeLock()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [isRunning, requestWakeLock])

  useEffect(() => {
    const uncommittedTime = isRunning ? time - accumulatedTimeRef.current : 0
    const persistedExerciseTimes =
      uncommittedTime > 0
        ? exerciseTimes.map((round, roundIndex) =>
            round.map((exerciseTime, exerciseIndex) =>
              roundIndex === currentRound - 1 && exerciseIndex === currentExerciseIndex
                ? exerciseTime + uncommittedTime
                : exerciseTime,
            ),
          )
        : exerciseTimes

    localStorage.setItem(
      storageKey,
      JSON.stringify({
        currentRound,
        currentExerciseIndex,
        elapsedMilliseconds: time,
        isFinished,
        exerciseTimes: persistedExerciseTimes,
      } satisfies SavedProgress),
    )
  }, [
    currentExerciseIndex,
    currentRound,
    exerciseTimes,
    isFinished,
    isRunning,
    storageKey,
    time,
  ])

  useEffect(
    () => () => {
      if (requestRef.current !== undefined) cancelAnimationFrame(requestRef.current)
      void releaseWakeLock()
    },
    [releaseWakeLock],
  )

  const resetWorkout = () => {
    if (!window.confirm('Are you sure you want to reset the entire workout?')) return

    if (requestRef.current !== undefined) cancelAnimationFrame(requestRef.current)
    accumulatedTimeRef.current = 0
    setTime(0)
    setIsRunning(false)
    setIsFinished(false)
    setCurrentRound(1)
    setCurrentExerciseIndex(0)
    setExerciseTimes(normalizeExerciseTimes(workout, []))
    localStorage.removeItem(storageKey)
    void releaseWakeLock()
  }

  const handleNext = () => {
    if (!isRunning && !isFinished && time === 0) startTimer()
    recordActiveInterval()

    if (currentExerciseIndex < workout.exercises.length - 1) {
      setCurrentExerciseIndex((index) => index + 1)
    } else if (currentRound < workout.rounds) {
      setCurrentRound((round) => round + 1)
      setCurrentExerciseIndex(0)
    } else {
      setIsRunning(false)
      if (requestRef.current !== undefined) cancelAnimationFrame(requestRef.current)
      void releaseWakeLock()
      setIsFinished(true)
    }
  }

  const handlePrevious = () => {
    recordActiveInterval()

    if (currentExerciseIndex > 0) {
      setCurrentExerciseIndex((index) => index - 1)
    } else if (currentRound > 1) {
      setCurrentRound((round) => round - 1)
      setCurrentExerciseIndex(workout.exercises.length - 1)
    }

    if (isFinished) {
      setIsFinished(false)
    }
  }

  const formattedTime = formatTime(time)
  const currentExercise = workout.exercises[currentExerciseIndex]
  const nextExercise = workout.exercises[currentExerciseIndex + 1]

  if (isFinished) {
    const roundTimes = exerciseTimes.map((round) =>
      round.reduce((total, exerciseTime) => total + exerciseTime, 0),
    )
    const fastestRoundIndex = roundTimes.indexOf(Math.min(...roundTimes))
    const slowestRoundIndex = roundTimes.indexOf(Math.max(...roundTimes))
    const longestRoundTime = Math.max(...roundTimes, 1)
    const recordedSplitTime = roundTimes.reduce((total, roundTime) => total + roundTime, 0)
    const unallocatedTime = Math.max(0, time - recordedSplitTime)

    return (
      <main className="finish-screen results-screen">
        <header className="results-header">
          <Trophy className="finish-trophy" aria-hidden="true" />
          <h1>WOD CRUSHED</h1>
          <p>{workout.athlete} &bull; {workout.rounds} Rounds</p>
        </header>

        <section className="final-time">
          <span>Final Time</span>
          <strong>
            {formattedTime.minutes}:{formattedTime.seconds}
            <small>.{formattedTime.centiseconds}</small>
          </strong>
        </section>

        <section className="result-highlights" aria-label="Workout highlights">
          <article>
            <span>Average Round</span>
            <strong>{formatDuration(recordedSplitTime / workout.rounds)}</strong>
          </article>
          <article>
            <span>Fastest Round</span>
            <strong>R{fastestRoundIndex + 1} &bull; {formatDuration(roundTimes[fastestRoundIndex])}</strong>
          </article>
          <article>
            <span>Slowest Round</span>
            <strong>R{slowestRoundIndex + 1} &bull; {formatDuration(roundTimes[slowestRoundIndex])}</strong>
          </article>
        </section>

        <section className="round-chart" aria-labelledby="round-chart-title">
          <div className="results-section-heading">
            <div>
              <span>Round Comparison</span>
              <h2 id="round-chart-title">Your pace at a glance</h2>
            </div>
          </div>
          <div className="chart-bars">
            {roundTimes.map((roundTime, roundIndex) => (
              <div className="chart-row" key={roundIndex}>
                <span>R{roundIndex + 1}</span>
                <div className="chart-track">
                  <i style={{ width: `${(roundTime / longestRoundTime) * 100}%` }} />
                </div>
                <strong>{formatDuration(roundTime)}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="round-breakdown" aria-labelledby="round-breakdown-title">
          <div className="results-section-heading">
            <div>
              <span>Detailed Splits</span>
              <h2 id="round-breakdown-title">Time by exercise</h2>
            </div>
          </div>
          {exerciseTimes.map((round, roundIndex) => (
            <article className="round-card" key={roundIndex}>
              <header>
                <h3>Round {roundIndex + 1}</h3>
                <strong>{formatDuration(roundTimes[roundIndex])}</strong>
              </header>
              <ol>
                {round.map((exerciseTime, exerciseIndex) => (
                  <li key={exerciseIndex}>
                    <span>
                      <b>{workout.exercises[exerciseIndex].name}</b>
                      <small>{workout.exercises[exerciseIndex].reps}</small>
                    </span>
                    <strong>{formatDuration(exerciseTime)}</strong>
                  </li>
                ))}
              </ol>
            </article>
          ))}
        </section>

        {unallocatedTime > 0 && (
          <p className="legacy-time">
            {formatDuration(unallocatedTime)} from earlier saved progress is included only in the
            final time.
          </p>
        )}

        <button className="reset-finish" onClick={resetWorkout}>
          <RotateCcw aria-hidden="true" />
          Reset Workout
        </button>
      </main>
    )
  }

  return (
    <div className="tracker-shell">
      <header className="app-header">
        <h1><Activity aria-hidden="true" /> {workout.athlete}</h1>
        <div className="header-actions">
          <button className="header-reset" onClick={resetWorkout} aria-label="Reset workout">
            <RotateCcw aria-hidden="true" />
          </button>
          <button
            className={`timer-toggle ${isRunning ? 'pause' : ''}`}
            onClick={isRunning ? pauseTimer : startTimer}
          >
            {isRunning ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
            {isRunning ? 'Pause' : time > 0 ? 'Resume' : 'Start'}
          </button>
        </div>
      </header>

      <main className="tracker-main">
        <section className="round-status" aria-label={`Round ${currentRound} of ${workout.rounds}`}>
          <div>
            <span>Current Round</span>
            <strong>{currentRound} <small>/ {workout.rounds}</small></strong>
          </div>
          <div className="round-bars" aria-hidden="true">
            {Array.from({ length: workout.rounds }, (_, index) => (
              <i
                className={
                  index + 1 < currentRound
                    ? 'complete'
                    : index + 1 === currentRound
                      ? 'current'
                      : ''
                }
                key={index}
              />
            ))}
          </div>
        </section>

        <output className={`stopwatch ${isRunning ? '' : 'stopped'}`} aria-live="off">
          {formattedTime.minutes}:{formattedTime.seconds}
          <small>.{formattedTime.centiseconds}</small>
        </output>

        <section className="current-exercise">
          <div className="exercise-progress">
            <i style={{ width: `${(currentExerciseIndex / workout.exercises.length) * 100}%` }} />
          </div>
          <p>Do This Now</p>
          <strong>{currentExercise.reps}</strong>
          <h2>{currentExercise.name}</h2>
          <span>{currentExercise.notes}</span>
        </section>

        <section className="next-exercise">
          <span>Up Next</span>
          {nextExercise ? (
            <strong>{nextExercise.reps} {nextExercise.name}</strong>
          ) : currentRound < workout.rounds ? (
            <strong className="next-round">
              Round {currentRound + 1} {workout.exercises[0].name}
              <RotateCcw aria-hidden="true" />
            </strong>
          ) : (
            <strong className="finish-line">Finish Line <Trophy aria-hidden="true" /></strong>
          )}
        </section>
      </main>

      <footer className="tracker-controls">
        <button
          className="previous-button"
          onClick={handlePrevious}
          disabled={currentRound === 1 && currentExerciseIndex === 0}
          aria-label="Previous exercise"
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        <button className="next-button" onClick={handleNext}>
          <span>
            {currentExerciseIndex === workout.exercises.length - 1 &&
            currentRound === workout.rounds
              ? 'Finish WOD'
              : 'Next Move'}
          </span>
          {currentExerciseIndex === workout.exercises.length - 1 &&
          currentRound === workout.rounds ? (
            <CheckCircle2 aria-hidden="true" />
          ) : (
            <ChevronRight aria-hidden="true" />
          )}
        </button>
      </footer>
    </div>
  )
}

export default function App() {
  const workout = getWorkoutForDate(new Date())

  if (!workout) {
    return (
      <main className="finish-screen">
        <Trophy className="finish-trophy" aria-hidden="true" />
        <h1>RECOVERY WEEK</h1>
        <p>No workout is scheduled for this week. Check back next Monday.</p>
      </main>
    )
  }

  return <WorkoutTracker workout={workout} />
}
