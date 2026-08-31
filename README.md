# Iron Pax

A focused weekly workout tracker built with React, Vite, and TypeScript for
deployment on Vercel.

## Included

- React 19 and TypeScript
- Vite development and production builds
- Date-based weekly workout selection that keeps prior workouts in the dataset
- Timed round and exercise progression with refresh-safe local progress
- Screen wake lock support where available
- React Router with a not-found route
- ESLint
- Vitest and React Testing Library
- Vercel configuration with SPA route rewrites

## Requirements

- Node.js 22.12 or newer
- npm 10 or newer

## Local development

```sh
npm install
npm run dev
```

Vite prints the local URL when the development server starts.

## Quality checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Use `npm run test:watch` while developing. Use `npm run preview` after a build
to preview the production bundle locally.

## Environment variables

Create a local `.env.local` file for values that should not be committed.
Client-side variables must begin with `VITE_`:

```dotenv
VITE_API_URL=https://api.example.com
```

Access them with `import.meta.env.VITE_API_URL`. Values embedded in a browser
bundle are public, so never put secrets in `VITE_` variables.

Add the same variables to the Vercel project's environment-variable settings
for Preview and Production deployments.

## Deploy to Vercel

1. Push this repository to GitHub.
2. Import the repository from the
   [Vercel new project page](https://vercel.com/new).
3. Keep the detected Vite framework settings and deploy.

The committed `vercel.json` runs `npm run build`, publishes `dist`, and rewrites
requests to `index.html` so direct visits to client-side routes work.

Vercel creates Preview deployments for branches and pull requests, and a
Production deployment when the production branch is updated.

## Add the next weekly workout

Append a new record to `src/data/workouts.ts` with a unique ID and its Monday
`weekStart` date. The app automatically shows only the workout whose seven-day
window includes the current date. Older records stay in the dataset and keep
their own progress under a workout-specific local-storage key.
