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
import { getWorkoutForDate, workouts, type Workout } from './data/workouts'

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
  if (workout.format === 'amrap') {
    if (savedTimes.length > 0) {
      return savedTimes.map((round) =>
        Array.from(
          { length: workout.exercises.length },
          (_, exerciseIndex) => round[exerciseIndex] ?? 0,
        ),
      )
    }

    return [Array(workout.exercises.length).fill(0)]
  }

  return Array.from(
    { length: workout.rounds ?? 0 },
    (_, roundIndex) =>
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

function formatLapCount(count: number) {
  return `${count} ${count === 1 ? 'Lap' : 'Laps'}`
}

interface WorkoutOption {
  id: string
  label: string
}

function WorkoutSelector({
  options,
  selectedWorkoutId,
  onSelectWorkout,
}: {
  options: WorkoutOption[]
  selectedWorkoutId: string
  onSelectWorkout: (workoutId: string) => void
}) {
  return (
    <label className="workout-selector">
      <span>IronPAX Workout</span>
      <select
        aria-label="Select IronPAX workout"
        value={selectedWorkoutId}
        onChange={(event) => onSelectWorkout(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function WorkoutTracker({
  workout,
  workoutOptions,
  selectedWorkoutId,
  onSelectWorkout,
}: {
  workout: Workout
  workoutOptions: WorkoutOption[]
  selectedWorkoutId: string
  onSelectWorkout: (workoutId: string) => void
}) {
  const storageKey = `iron-pax-progress:${workout.id}`
  const isAmrap = workout.format === 'amrap'
  const totalRounds = workout.rounds ?? 0
  const timeCapMilliseconds = workout.timeCapMinutes
    ? workout.timeCapMinutes * 60 * 1000
    : undefined
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

  const applyIntervalToCurrentExercise = useCallback((intervalTime: number) => {
    if (intervalTime <= 0) return

    setExerciseTimes((times) =>
      times.map((round, roundIndex) =>
        round.map((exerciseTime, exerciseIndex) =>
          roundIndex === currentRound - 1 && exerciseIndex === currentExerciseIndex
            ? exerciseTime + intervalTime
            : exerciseTime,
        ),
      ),
    )
  }, [currentExerciseIndex, currentRound])

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

  const finalizeWorkout = useCallback(
    (finalTime = accumulatedTimeRef.current) => {
      setTime(finalTime)
      setIsRunning(false)
      if (requestRef.current !== undefined) cancelAnimationFrame(requestRef.current)
      void releaseWakeLock()
      setIsFinished(true)
    },
    [releaseWakeLock],
  )

  const startTimer = useCallback(() => {
    if (isFinished || isRunning) return

    const updateTime = () => {
      const elapsedTime = accumulatedTimeRef.current + Date.now() - startTimeRef.current

      if (timeCapMilliseconds !== undefined && elapsedTime >= timeCapMilliseconds) {
        const intervalTime = Math.max(0, timeCapMilliseconds - accumulatedTimeRef.current)
        accumulatedTimeRef.current = timeCapMilliseconds
        applyIntervalToCurrentExercise(intervalTime)
        finalizeWorkout(timeCapMilliseconds)
        return
      }

      setTime(elapsedTime)
      requestRef.current = requestAnimationFrame(updateTime)
    }

    setIsRunning(true)
    startTimeRef.current = Date.now()
    requestRef.current = requestAnimationFrame(updateTime)
    void requestWakeLock()
  }, [applyIntervalToCurrentExercise, finalizeWorkout, isFinished, isRunning, requestWakeLock, timeCapMilliseconds])

  const pauseTimer = useCallback(() => {
    if (!isRunning) return

    const intervalTime = Date.now() - startTimeRef.current
    accumulatedTimeRef.current += intervalTime
    setTime(accumulatedTimeRef.current)
    applyIntervalToCurrentExercise(intervalTime)
    setIsRunning(false)
    if (requestRef.current !== undefined) cancelAnimationFrame(requestRef.current)
    void releaseWakeLock()
  }, [applyIntervalToCurrentExercise, isRunning, releaseWakeLock])

  const recordActiveInterval = () => {
    if (!isRunning) return

    const now = Date.now()
    const intervalTime = now - startTimeRef.current
    accumulatedTimeRef.current += intervalTime
    startTimeRef.current = now
    setTime(accumulatedTimeRef.current)
    applyIntervalToCurrentExercise(intervalTime)
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
    } else if (isAmrap) {
      setCurrentRound((round) => round + 1)
      setCurrentExerciseIndex(0)
      setExerciseTimes((times) => [...times, Array(workout.exercises.length).fill(0)])
    } else if (currentRound < totalRounds) {
      setCurrentRound((round) => round + 1)
      setCurrentExerciseIndex(0)
    } else {
      finalizeWorkout()
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

  const handleFinishNow = () => {
    recordActiveInterval()
    finalizeWorkout()
  }

  const formattedTime = formatTime(time)
  const currentExercise = workout.exercises[currentExerciseIndex]
  const nextExercise = workout.exercises[currentExerciseIndex + 1]

  if (isFinished) {
    const completedRounds = isAmrap ? Math.max(currentRound - 1, 0) : totalRounds
    const completedExerciseTimes = isAmrap
      ? exerciseTimes.slice(0, completedRounds)
      : exerciseTimes
    const roundTimes = completedExerciseTimes.map((round) =>
      round.reduce((total, exerciseTime) => total + exerciseTime, 0),
    )
    const fastestRoundIndex = roundTimes.length > 0 ? roundTimes.indexOf(Math.min(...roundTimes)) : -1
    const slowestRoundIndex = roundTimes.length > 0 ? roundTimes.indexOf(Math.max(...roundTimes)) : -1
    const longestRoundTime = Math.max(...roundTimes, 1)
    const recordedSplitTime = roundTimes.reduce((total, roundTime) => total + roundTime, 0)
    const unallocatedTime = Math.max(0, time - recordedSplitTime)

    return (
      <main className="finish-screen results-screen">
        <header className="results-header">
          <WorkoutSelector
            options={workoutOptions}
            selectedWorkoutId={selectedWorkoutId}
            onSelectWorkout={onSelectWorkout}
          />
          <Trophy className="finish-trophy" aria-hidden="true" />
          <h1>WOD CRUSHED</h1>
          <p>
            {workout.athlete} &bull; {isAmrap ? formatLapCount(completedRounds) : `${totalRounds} Rounds`}
          </p>
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
            <span>{isAmrap ? 'Score' : 'Average Round'}</span>
            <strong>
              {isAmrap
                ? formatLapCount(completedRounds)
                : formatDuration(recordedSplitTime / Math.max(totalRounds, 1))}
            </strong>
          </article>
          {roundTimes.length > 0 && (
            <>
              <article>
                <span>{isAmrap ? 'Average Lap' : 'Fastest Round'}</span>
                <strong>
                  {isAmrap
                    ? formatDuration(recordedSplitTime / completedRounds)
                    : `R${fastestRoundIndex + 1} • ${formatDuration(roundTimes[fastestRoundIndex])}`}
                </strong>
              </article>
              <article>
                <span>{isAmrap ? 'Fastest Lap' : 'Slowest Round'}</span>
                <strong>
                  {isAmrap
                    ? `L${fastestRoundIndex + 1} • ${formatDuration(roundTimes[fastestRoundIndex])}`
                    : `R${slowestRoundIndex + 1} • ${formatDuration(roundTimes[slowestRoundIndex])}`}
                </strong>
              </article>
              {isAmrap && (
                <article>
                  <span>Slowest Lap</span>
                  <strong>L{slowestRoundIndex + 1} • {formatDuration(roundTimes[slowestRoundIndex])}</strong>
                </article>
              )}
            </>
          )}
        </section>

        {roundTimes.length > 0 && (
          <>
            <section className="round-chart" aria-labelledby="round-chart-title">
              <div className="results-section-heading">
                <div>
                  <span>{isAmrap ? 'Lap Comparison' : 'Round Comparison'}</span>
                  <h2 id="round-chart-title">Your pace at a glance</h2>
                </div>
              </div>
              <div className="chart-bars">
                {roundTimes.map((roundTime, roundIndex) => (
                  <div className="chart-row" key={roundIndex}>
                    <span>{isAmrap ? `L${roundIndex + 1}` : `R${roundIndex + 1}`}</span>
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
              {completedExerciseTimes.map((round, roundIndex) => (
                <article className="round-card" key={roundIndex}>
                  <header>
                    <h3>{isAmrap ? `Lap ${roundIndex + 1}` : `Round ${roundIndex + 1}`}</h3>
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
          </>
        )}

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
        <div className="app-title-group">
          <h1><Activity aria-hidden="true" /> {workout.athlete}</h1>
          <WorkoutSelector
            options={workoutOptions}
            selectedWorkoutId={selectedWorkoutId}
            onSelectWorkout={onSelectWorkout}
          />
        </div>
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
        <section
          className="round-status"
          aria-label={isAmrap ? `Current lap ${currentRound}` : `Round ${currentRound} of ${totalRounds}`}
        >
          <div>
            <span>{isAmrap ? 'Current Lap' : 'Current Round'}</span>
            <strong>
              {currentRound}
              {!isAmrap && <small> / {totalRounds}</small>}
            </strong>
          </div>
          {isAmrap ? (
            <div>
              <span>Completed Laps</span>
              <strong>{Math.max(currentRound - 1, 0)}</strong>
            </div>
          ) : (
            <div className="round-bars" aria-hidden="true">
              {Array.from({ length: totalRounds }, (_, index) => (
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
          )}
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
          ) : isAmrap ? (
            <strong className="next-round">
              Lap {currentRound + 1} {workout.exercises[0].name}
              <RotateCcw aria-hidden="true" />
            </strong>
          ) : currentRound < totalRounds ? (
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
        <button className="finish-button" onClick={handleFinishNow}>
          <Trophy aria-hidden="true" />
          <span>Finish Now</span>
        </button>
        <button className="next-button" onClick={handleNext}>
          <span>
            {!isAmrap &&
            currentExerciseIndex === workout.exercises.length - 1 &&
            currentRound === totalRounds
              ? 'Finish WOD'
              : isAmrap && currentExerciseIndex === workout.exercises.length - 1
                ? 'Complete Lap'
              : 'Next Move'}
          </span>
          {!isAmrap &&
          currentExerciseIndex === workout.exercises.length - 1 &&
          currentRound === totalRounds ? (
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
  const workoutOptions = workouts.map((workout, index) => ({
    id: workout.id,
    label: `IronPAX Week ${index} • ${workout.athlete}`,
  }))
  const [selectedWorkoutId, setSelectedWorkoutId] = useState(
    () => getWorkoutForDate(new Date())?.id ?? workouts.at(-1)?.id ?? '',
  )
  const workout = workouts.find((entry) => entry.id === selectedWorkoutId)

  if (!workout) {
    return (
      <main className="finish-screen">
        <Trophy className="finish-trophy" aria-hidden="true" />
        <h1>RECOVERY WEEK</h1>
        <p>No workout is scheduled for this week. Check back next Monday.</p>
      </main>
    )
  }

  return (
    <WorkoutTracker
      key={workout.id}
      workout={workout}
      workoutOptions={workoutOptions}
      selectedWorkoutId={selectedWorkoutId}
      onSelectWorkout={setSelectedWorkoutId}
    />
  )
}
