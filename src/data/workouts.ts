export interface Exercise {
  name: string
  reps: string
  notes: string
}

export interface Workout {
  id: string
  weekStart: string
  athlete: string
  rounds: number
  exercises: Exercise[]
}

export const workouts: Workout[] = [
  {
    id: 'dj-keller-2026-08-31',
    weekStart: '2026-08-31',
    athlete: 'DJ KELLER',
    rounds: 4,
    exercises: [
      { name: 'Manmakers', reps: '5', notes: 'Coupon' },
      { name: 'BDE Sit-Ups', reps: '11', notes: 'Coupon' },
      { name: 'Thrusters', reps: '26', notes: 'Coupon' },
      { name: 'Lunges', reps: '31', notes: 'R+L = 1 rep' },
      { name: 'Run', reps: '141 yards', notes: '70.5y down & back' },
    ],
  },
]

export function getWorkoutForDate(date: Date): Workout | undefined {
  const day = new Date(date)
  day.setHours(0, 0, 0, 0)

  return [...workouts].reverse().find((workout) => {
    const start = new Date(`${workout.weekStart}T00:00:00`)
    const end = new Date(start)
    end.setDate(start.getDate() + 7)
    return day >= start && day < end
  })
}
