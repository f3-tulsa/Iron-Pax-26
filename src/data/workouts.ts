export interface Exercise {
  name: string
  reps: string
  notes: string
  scoreTarget?: number
  scoreUnit?: 'reps' | 'yards'
  progressesByRound?: boolean
}

export interface Workout {
  id: string
  weekStart: string
  athlete: string
  format?: 'rounds' | 'amrap' | 'progressive-amrap'
  rounds?: number
  timeCapMinutes?: number
  roundLabel?: 'lap' | 'round'
  roundProgressionStep?: number
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
  {
    id: 'runners-are-people-too-2026-09-07',
    weekStart: '2026-09-07',
    athlete: 'RUNNERS ARE PEOPLE TOO',
    format: 'amrap',
    timeCapMinutes: 45,
    exercises: [
      { name: 'Thrusters', reps: '10', notes: 'Coupon' },
      { name: 'Bonnie Blairs', reps: '10', notes: 'Right + left = 1 rep' },
      { name: 'Jungle Boy Squats', reps: '10', notes: 'Bodyweight' },
      { name: 'Bonnie Blairs', reps: '10', notes: 'Right + left = 1 rep' },
      { name: 'Thrusters', reps: '10', notes: 'Coupon' },
      { name: 'Run', reps: '400 meters', notes: 'Measured lap' },
    ],
  },
  {
    id: 'raise-the-flag-2026-09-14',
    weekStart: '2026-09-14',
    athlete: 'RAISE THE FLAG',
    format: 'progressive-amrap',
    timeCapMinutes: 45,
    roundLabel: 'round',
    roundProgressionStep: 12,
    exercises: [
      { name: 'Run', reps: '100 yards', notes: 'Start at the goal line', scoreTarget: 100, scoreUnit: 'yards' },
      {
        name: 'Bonnies',
        reps: '12 reps',
        notes: '2-count • knee to ground each rep',
        scoreTarget: 12,
        scoreUnit: 'reps',
        progressesByRound: true,
      },
      { name: 'Bernie', reps: '100 yards', notes: 'Back to the start line', scoreTarget: 100, scoreUnit: 'yards' },
      {
        name: 'HR Muricans',
        reps: '12 reps',
        notes: 'Chest to ground • air gap below hands',
        scoreTarget: 12,
        scoreUnit: 'reps',
        progressesByRound: true,
      },
      {
        name: 'Jimothy Bear Crawl',
        reps: '25 yards',
        notes: 'Somersault into the WW1s • lunge walk optional',
        scoreTarget: 25,
        scoreUnit: 'yards',
      },
      {
        name: 'WW1s',
        reps: '12 reps',
        notes: 'Hands behind head at top • touch toes at bottom',
        scoreTarget: 12,
        scoreUnit: 'reps',
        progressesByRound: true,
      },
      {
        name: 'Crawl Bear',
        reps: '25 yards',
        notes: 'Back to the start line • reverse lunge walk optional',
        scoreTarget: 25,
        scoreUnit: 'yards',
      },
      {
        name: 'Burpees',
        reps: '12 reps',
        notes: 'Good pushup form • jump with hands above head',
        scoreTarget: 12,
        scoreUnit: 'reps',
        progressesByRound: true,
      },
    ],
  },
  {
    id: 'belle-ringer-2026-09-21',
    weekStart: '2026-09-21',
    athlete: 'BELLE RINGER',
    format: 'amrap',
    timeCapMinutes: 45,
    exercises: [
      {
        name: "We’re Not Worthy",
        reps: '5 Manmakers + 10',
        notes: 'Start/finish at center • rifle carry out, farmer carry back from Cone 2',
      },
      {
        name: 'Goblet Squats',
        reps: '5 Manmakers + 15',
        notes: 'Start/finish at center • rifle carry out, farmer carry back from Cone 3',
      },
      {
        name: 'Overhead Tricep Extensions',
        reps: '5 Manmakers + 20',
        notes: 'Start/finish at center • rifle carry out, farmer carry back from Cone 4',
      },
      {
        name: 'KB Swings',
        reps: '5 Manmakers + 25',
        notes: 'Start/finish at center • rifle carry out, farmer carry back from Cone 5',
      },
      {
        name: 'Curls',
        reps: '5 Manmakers + 30',
        notes: 'Start/finish at center • rifle carry out, farmer carry back from Cone 6',
      },
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
