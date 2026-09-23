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
  partialProgress: number
}

const initialProgress: SavedProgress = {
  currentRound: 1,
  currentExerciseIndex: 0,
  elapsedMilliseconds: 0,
  isFinished: false,
  exerciseTimes: [],
  partialProgress: 0,
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
  if (workout.format === 'amrap' || workout.format === 'progressive-amrap') {
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

function BrandCredit() {
  return (
    <div className="brand-credit">
      <p>
        Built by Dorothy &mdash;{' '}
        <a href="https://bsquaredsolutions.net/" target="_blank" rel="noopener noreferrer">
          B Squared Solutions
        </a>
      </p>
      <a
        className="brand-logo-link"
        href="https://bsquaredsolutions.net/"
        target="_blank"
        rel="noopener noreferrer"
      >
        <img
          className="brand-logo"
          src="/b-squared-solutions-logo.svg"
          alt="B Squared Solutions"
        />
      </a>
    </div>
  )
}

function formatLapCount(count: number) {
  return `${count} ${count === 1 ? 'Lap' : 'Laps'}`
}

function getCycleLabel(workout: Workout) {
  if (workout.roundLabel) return workout.roundLabel === 'round' ? 'Round' : 'Lap'
  return workout.format === 'amrap' ? 'Lap' : 'Round'
}

function getExerciseScoreTarget(workout: Workout, exerciseIndex: number, round: number) {
  const exercise = workout.exercises[exerciseIndex]
  if (exercise?.scoreTarget === undefined) return undefined
  if (!exercise.progressesByRound) return exercise.scoreTarget
  const step = workout.roundProgressionStep ?? 0
  return exercise.scoreTarget + Math.max(round - 1, 0) * step
}

function getExerciseDisplayReps(workout: Workout, exerciseIndex: number, round: number) {
  const exercise = workout.exercises[exerciseIndex]
  const target = getExerciseScoreTarget(workout, exerciseIndex, round)
  if (target === undefined || !exercise?.scoreUnit) return exercise?.reps ?? ''
  return `${target} ${exercise.scoreUnit}`
}

function getCompletedCyclesLabel(workout: Workout, count: number) {
  const cycleLabel = getCycleLabel(workout)
  return `${count} ${count === 1 ? cycleLabel : `${cycleLabel}s`}`
}

function getRoundScore(workout: Workout, round: number) {
  return workout.exercises.reduce(
    (total, _, exerciseIndex) => total + (getExerciseScoreTarget(workout, exerciseIndex, round) ?? 0),
    0,
  )
}

function getBankedScore(workout: Workout, currentRound: number, currentExerciseIndex: number) {
  const completedRoundsScore = Array.from({ length: Math.max(currentRound - 1, 0) }, (_, index) =>
    getRoundScore(workout, index + 1),
  ).reduce((total, roundScore) => total + roundScore, 0)

  const currentRoundScore = Array.from({ length: currentExerciseIndex }, (_, exerciseIndex) =>
    getExerciseScoreTarget(workout, exerciseIndex, currentRound) ?? 0,
  ).reduce((total, exerciseScore) => total + exerciseScore, 0)

  return completedRoundsScore + currentRoundScore
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
  const isRepeatingWorkout = workout.format === 'amrap' || workout.format === 'progressive-amrap'
  const isScoreWorkout = workout.format === 'progressive-amrap'
  const cycleLabel = getCycleLabel(workout)
  const cyclePrefix = cycleLabel[0]
  const totalRounds = workout.rounds ?? 0
  const timeCapMilliseconds = workout.timeCapMinutes
    ? workout.timeCapMinutes * 60 * 1000
    : undefined
  const [savedProgress] = useState(() => readProgress(storageKey))
  const [time, setTime] = useState(savedProgress.elapsedMilliseconds)
  const [isRunning, setIsRunning] = useState(false)
  const [isFinished, setIsFinished] = useState(savedProgress.isFinished)
  const [hasStartedWorkout, setHasStartedWorkout] = useState(
    savedProgress.elapsedMilliseconds > 0 ||
      savedProgress.currentRound > 1 ||
      savedProgress.currentExerciseIndex > 0 ||
      savedProgress.isFinished,
  )
  const [currentRound, setCurrentRound] = useState(savedProgress.currentRound)
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(
    savedProgress.currentExerciseIndex,
  )
  const [exerciseTimes, setExerciseTimes] = useState(() =>
    normalizeExerciseTimes(workout, savedProgress.exerciseTimes),
  )
  const [partialProgress, setPartialProgress] = useState(savedProgress.partialProgress)
  const [partialProgressInput, setPartialProgressInput] = useState(String(savedProgress.partialProgress))
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

    setHasStartedWorkout(true)
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
        partialProgress,
      } satisfies SavedProgress),
    )
  }, [
    currentExerciseIndex,
    currentRound,
    exerciseTimes,
    isFinished,
    isRunning,
    partialProgress,
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
    setHasStartedWorkout(false)
    setCurrentRound(1)
    setCurrentExerciseIndex(0)
    setExerciseTimes(normalizeExerciseTimes(workout, []))
    setPartialProgress(0)
    setPartialProgressInput('0')
    localStorage.removeItem(storageKey)
    void releaseWakeLock()
  }

  const handleNext = () => {
    if (!isRunning && !isFinished && time === 0) startTimer()
    recordActiveInterval()

    if (currentExerciseIndex < workout.exercises.length - 1) {
      setCurrentExerciseIndex((index) => index + 1)
      setPartialProgress(0)
      setPartialProgressInput('0')
    } else if (isRepeatingWorkout) {
      setCurrentRound((round) => round + 1)
      setCurrentExerciseIndex(0)
      setExerciseTimes((times) => [...times, Array(workout.exercises.length).fill(0)])
      setPartialProgress(0)
      setPartialProgressInput('0')
    } else if (currentRound < totalRounds) {
      setCurrentRound((round) => round + 1)
      setCurrentExerciseIndex(0)
      setPartialProgress(0)
      setPartialProgressInput('0')
    } else {
      finalizeWorkout()
    }
  }

  const handlePrevious = () => {
    recordActiveInterval()

    if (currentExerciseIndex > 0) {
      setCurrentExerciseIndex((index) => index - 1)
      setPartialProgress(0)
      setPartialProgressInput('0')
    } else if (currentRound > 1) {
      setCurrentRound((round) => round - 1)
      setCurrentExerciseIndex(workout.exercises.length - 1)
      setPartialProgress(0)
      setPartialProgressInput('0')
    }

    if (isFinished) {
      setIsFinished(false)
    }
  }

  const handleFinishNow = () => {
    if (isRunning) {
      const intervalTime = Date.now() - startTimeRef.current
      accumulatedTimeRef.current += intervalTime
      applyIntervalToCurrentExercise(intervalTime)
      setTime(accumulatedTimeRef.current)
      setIsRunning(false)
      if (requestRef.current !== undefined) cancelAnimationFrame(requestRef.current)
    }

    finalizeWorkout(accumulatedTimeRef.current)
  }

  const formattedTime = formatTime(time)
  const currentExercise = workout.exercises[currentExerciseIndex]
  const nextExercise = workout.exercises[currentExerciseIndex + 1]
  const currentExerciseReps = getExerciseDisplayReps(workout, currentExerciseIndex, currentRound)
  const nextExerciseReps = nextExercise
    ? getExerciseDisplayReps(workout, currentExerciseIndex + 1, currentRound)
    : getExerciseDisplayReps(workout, 0, currentRound + 1)
  const completedCycles = isRepeatingWorkout ? Math.max(currentRound - 1, 0) : totalRounds
  const bankedScore = isScoreWorkout ? getBankedScore(workout, currentRound, currentExerciseIndex) : 0
  const showCompactHeader = hasStartedWorkout && !isFinished

  if (isFinished) {
    const completedExerciseTimes = isRepeatingWorkout
      ? exerciseTimes.slice(0, completedCycles)
      : exerciseTimes
    const roundTimes = completedExerciseTimes.map((round) =>
      round.reduce((total, exerciseTime) => total + exerciseTime, 0),
    )
    const fastestRoundIndex = roundTimes.length > 0 ? roundTimes.indexOf(Math.min(...roundTimes)) : -1
    const slowestRoundIndex = roundTimes.length > 0 ? roundTimes.indexOf(Math.max(...roundTimes)) : -1
    const longestRoundTime = Math.max(...roundTimes, 1)
    const recordedSplitTime = roundTimes.reduce((total, roundTime) => total + roundTime, 0)
    const unallocatedTime = Math.max(0, time - recordedSplitTime)
    const partialTarget = getExerciseScoreTarget(workout, currentExerciseIndex, currentRound) ?? 0
    const partialUnit = currentExercise.scoreUnit ?? 'reps'
    const clampedPartialProgress = Math.min(Math.max(partialProgress, 0), partialTarget)
    const partialProgressHelpId = `partial-progress-help-${workout.id}`
    const totalScore = isScoreWorkout ? bankedScore + clampedPartialProgress : 0
    const currentRoundScore = bankedScore - getBankedScore(workout, currentRound, 0) + clampedPartialProgress
    const currentExerciseRecordedTime = exerciseTimes[currentRound - 1]?.[currentExerciseIndex] ?? 0
    const hasIncompleteRound = currentExerciseIndex > 0 || currentExerciseRecordedTime > 0
    const hasCompletedRoundsOnly = !hasIncompleteRound && completedCycles > 0
    const scoreContextRound = hasIncompleteRound ? currentRound : completedCycles || currentRound
    const scoreContextExercise = hasIncompleteRound
      ? currentExercise
      : workout.exercises[workout.exercises.length - 1]
    const scoreBreakdown = isScoreWorkout
      ? [
          ...Array.from({ length: completedCycles }, (_, index) => ({
            label: `Round ${index + 1}`,
            detail: `${getRoundScore(workout, index + 1)} points`,
            score: getRoundScore(workout, index + 1),
          })),
          ...(hasIncompleteRound
            ? [
                {
                  label: `Round ${currentRound}`,
                  detail: `${currentRoundScore} points`,
                  score: currentRoundScore,
                },
              ]
            : []),
        ]
      : []

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
            {workout.athlete} &bull;{' '}
            {isScoreWorkout
              ? getCompletedCyclesLabel(workout, completedCycles)
              : isAmrap
                ? formatLapCount(completedCycles)
                : `${totalRounds} Rounds`}
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
          {isScoreWorkout ? (
            <>
              <article>
                <span>Score</span>
                <strong>{totalScore}</strong>
              </article>
              <article>
                <span>Completed Rounds</span>
                <strong>{completedCycles}</strong>
              </article>
              <article>
                <span>{hasIncompleteRound || !hasCompletedRoundsOnly ? 'Stopped On' : 'Completed Through'}</span>
                <strong>
                  {hasIncompleteRound
                    ? `R${scoreContextRound} • ${scoreContextExercise.name}`
                    : hasCompletedRoundsOnly
                      ? `Round ${scoreContextRound}`
                      : `R${currentRound} • ${currentExercise.name}`}
                </strong>
              </article>
            </>
          ) : (
            <article>
              <span>{isAmrap ? 'Score' : 'Average Round'}</span>
              <strong>
                {isAmrap
                  ? formatLapCount(completedCycles)
                  : formatDuration(recordedSplitTime / Math.max(totalRounds, 1))}
              </strong>
            </article>
          )}
          {roundTimes.length > 0 && (
            <>
              {isRepeatingWorkout ? (
                <article>
                  <span>{`Average ${cycleLabel}`}</span>
                  <strong>
                    {formatDuration(recordedSplitTime / Math.max(completedCycles, 1))}
                  </strong>
                </article>
              ) : (
                <article>
                  <span>Fastest Round</span>
                  <strong>R{fastestRoundIndex + 1} • {formatDuration(roundTimes[fastestRoundIndex])}</strong>
                </article>
              )}
              <article>
                <span>{isRepeatingWorkout ? `Fastest ${cycleLabel}` : 'Slowest Round'}</span>
                <strong>
                  {isRepeatingWorkout
                    ? `${cyclePrefix}${fastestRoundIndex + 1} • ${formatDuration(roundTimes[fastestRoundIndex])}`
                    : `R${slowestRoundIndex + 1} • ${formatDuration(roundTimes[slowestRoundIndex])}`}
                </strong>
              </article>
              {isRepeatingWorkout && (
                <article>
                  <span>{`Slowest ${cycleLabel}`}</span>
                  <strong>{cyclePrefix}{slowestRoundIndex + 1} • {formatDuration(roundTimes[slowestRoundIndex])}</strong>
                </article>
              )}
            </>
          )}
        </section>

        {isScoreWorkout && hasIncompleteRound && (
          <>
            <section className="score-editor" aria-labelledby="score-editor-title">
              <div className="results-section-heading">
                <div>
                  <span>Final Progress</span>
                  <h2 id="score-editor-title">Stopped mid-move?</h2>
                </div>
              </div>
              <p>Enter the {partialUnit} you completed on {currentExercise.name} before the clock stopped.</p>
              <label className="score-editor-input">
                <span>{currentExercise.name}</span>
                <input
                  aria-label={`Completed ${partialUnit} on ${currentExercise.name}`}
                  aria-describedby={partialProgressHelpId}
                  type="number"
                  min="0"
                  max={partialTarget}
                  value={partialProgressInput}
                  onBlur={() => setPartialProgressInput(String(clampedPartialProgress))}
                  onChange={(event) => {
                    const nextValue = event.target.value
                    setPartialProgressInput(nextValue)
                    if (nextValue === '') {
                      setPartialProgress(0)
                      return
                    }

                    const parsedValue = Number(nextValue)
                    if (Number.isNaN(parsedValue)) return
                    setPartialProgress(Math.min(Math.max(parsedValue, 0), partialTarget))
                  }}
                />
                <small id={partialProgressHelpId}>of {partialTarget} {partialUnit}</small>
              </label>
            </section>

            <section className="round-breakdown" aria-labelledby="score-breakdown-title">
              <div className="results-section-heading">
                <div>
                  <span>Score Breakdown</span>
                  <h2 id="score-breakdown-title">Points by round</h2>
                </div>
              </div>
              {scoreBreakdown.map((round) => (
                <article className="round-card" key={round.label}>
                  <header>
                    <h3>{round.label}</h3>
                    <strong>{round.score}</strong>
                  </header>
                  <ol>
                    <li>
                      <span>
                        <b>{round.detail}</b>
                      </span>
                    </li>
                  </ol>
                </article>
              ))}
            </section>
          </>
        )}

        {roundTimes.length > 0 && (
          <>
            <section className="round-chart" aria-labelledby="round-chart-title">
              <div className="results-section-heading">
                <div>
                  <span>{isRepeatingWorkout ? `${cycleLabel} Comparison` : 'Round Comparison'}</span>
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
                    <h3>{`${cycleLabel} ${roundIndex + 1}`}</h3>
                    <strong>{formatDuration(roundTimes[roundIndex])}</strong>
                  </header>
                  <ol>
                    {round.map((exerciseTime, exerciseIndex) => (
                      <li key={exerciseIndex}>
                        <span>
                          <b>{workout.exercises[exerciseIndex].name}</b>
                          <small>{getExerciseDisplayReps(workout, exerciseIndex, roundIndex + 1)}</small>
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

        <button type="button" className="reset-finish" onClick={resetWorkout}>
          <RotateCcw aria-hidden="true" />
          Reset Workout
        </button>

        <BrandCredit />
      </main>
    )
  }

  return (
    <div className="tracker-shell">
      {!showCompactHeader && (
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
            <button type="button" className="header-reset" onClick={resetWorkout} aria-label="Reset workout">
              <RotateCcw aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`timer-toggle ${isRunning ? 'pause' : ''}`}
              onClick={isRunning ? pauseTimer : startTimer}
            >
              {isRunning ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
              {isRunning ? 'Pause' : time > 0 ? 'Resume' : 'Start'}
            </button>
          </div>
        </header>
      )}

      <main className="tracker-main">
        {showCompactHeader && (
          <div className="compact-workout-bar" role="toolbar" aria-label="Workout controls">
            <div className="compact-workout-meta">
              <span>Workout In Progress</span>
              <strong>{workout.athlete}</strong>
            </div>
            <div className="compact-workout-actions">
              <button
                type="button"
                className="header-reset compact-action"
                onClick={resetWorkout}
                aria-label="Reset workout"
              >
                <RotateCcw aria-hidden="true" />
              </button>
              <button
                type="button"
                className={`compact-timer-toggle ${isRunning ? 'pause' : ''}`}
                onClick={isRunning ? pauseTimer : startTimer}
                aria-label={isRunning ? 'Pause' : time > 0 ? 'Resume' : 'Start'}
              >
                {isRunning ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
                <span>{isRunning ? 'Pause' : time > 0 ? 'Resume' : 'Start'}</span>
              </button>
            </div>
          </div>
        )}

        <section
          className="round-status"
          aria-label={
            isRepeatingWorkout ? `Current ${cycleLabel.toLowerCase()} ${currentRound}` : `Round ${currentRound} of ${totalRounds}`
          }
        >
          <div>
            <span>{`Current ${cycleLabel}`}</span>
            <strong>
              {currentRound}
              {!isRepeatingWorkout && <small> / {totalRounds}</small>}
            </strong>
          </div>
          {isScoreWorkout ? (
            <div>
              <span>Banked Score</span>
              <strong>{bankedScore}</strong>
            </div>
          ) : isAmrap ? (
            <div>
              <span>Completed Laps</span>
              <strong>{completedCycles}</strong>
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
          <strong>{currentExerciseReps}</strong>
          <h2>{currentExercise.name}</h2>
          <span>{currentExercise.notes}</span>
        </section>

        <section className="next-exercise">
          <span>Up Next</span>
          {nextExercise ? (
            <strong>{nextExerciseReps} {nextExercise.name}</strong>
          ) : isRepeatingWorkout ? (
            <strong className="next-round">
              {cycleLabel} {currentRound + 1} {workout.exercises[0].name} • {nextExerciseReps}
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
          type="button"
          className="previous-button"
          onClick={handlePrevious}
          disabled={currentRound === 1 && currentExerciseIndex === 0}
          aria-label="Previous exercise"
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        <button type="button" className="finish-button" onClick={handleFinishNow}>
          <Trophy aria-hidden="true" />
          <span>Finish Now</span>
        </button>
        <button type="button" className="next-button" onClick={handleNext}>
          <span>
            {!isRepeatingWorkout &&
            currentExerciseIndex === workout.exercises.length - 1 &&
            currentRound === totalRounds
              ? 'Finish WOD'
              : isRepeatingWorkout && currentExerciseIndex === workout.exercises.length - 1
              ? `Complete ${cycleLabel}`
              : 'Next Move'}
          </span>
          {!isRepeatingWorkout &&
          currentExerciseIndex === workout.exercises.length - 1 &&
          currentRound === totalRounds ? (
            <CheckCircle2 aria-hidden="true" />
          ) : (
            <ChevronRight aria-hidden="true" />
          )}
        </button>
      </footer>

      <BrandCredit />
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
        <BrandCredit />
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
