# cash-mine

Expo (SDK 58) + React Native Web + Expo Router app, shipped as a static SPA that is laid out for phone-sized viewports.

## Stack

- Expo Router (file-based routes in `app/`), TypeScript strict
- TanStack Query + a small typed fetch client (`src/api`)
- ESLint (`eslint-config-expo` + Prettier), Jest (`jest-expo`)

```
app/             routes (_layout.tsx = providers + navigator)
src/api/         API client, env config, QueryClient factory
src/components/  shared UI (Screen = max-width mobile container)
src/hooks/       hooks (useApiQuery)
src/theme/       colors, spacing, typography, layout tokens
ai-logs/         AI conversation exports
```

## Setup

```bash
npm install
cp .env.example .env   # set EXPO_PUBLIC_API_URL / EXPO_PUBLIC_API_TOKEN
```

`EXPO_PUBLIC_*` values are inlined into the JS bundle at build time and are visible to anyone who loads the app. Don't put real secrets in them.

## Run

```bash
npx expo start --web    # dev server, http://localhost:8081
npm test                # jest
npm run lint            # eslint
npm run typecheck       # tsc --noEmit
npm run format          # prettier --write
```

## Build

```bash
npx expo export --platform web   # static SPA into dist/
npx expo serve                   # preview dist/ at http://localhost:8081
```

`expo serve` doesn't apply host rewrites, so deep links like `/foo` return 404 there. On the host they fall back to `index.html`.

## Deploy (Vercel)

`vercel.json` builds with `expo export`, serves `dist/` and rewrites every route to `index.html` (SPA fallback).

```bash
npm i -g vercel
vercel login
vercel link                                   # first time only
vercel env add EXPO_PUBLIC_API_URL production
vercel env add EXPO_PUBLIC_API_TOKEN production
vercel --prod
```

Other hosts work with the same `dist/` output:

- **Netlify**: `public/_redirects` is copied into `dist/` and handles the SPA fallback. Run `npx expo export --platform web && npx netlify-cli deploy --dir dist --prod`.
- **Cloudflare Pages**: no config needed, because Pages treats a site without a `404.html` as an SPA. Run `npx expo export --platform web && npx wrangler pages deploy dist`.
