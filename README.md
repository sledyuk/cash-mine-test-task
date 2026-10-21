# CashMine payback (web)

React Native (Expo SDK 58) app for viewing payback balances and claiming them. It ships as a static web build designed for a ~390px phone screen.

**Live:** _link added after deploy_

## Run locally

```bash
npm install
npx expo start --web     # http://localhost:8081; paste your API token on first open
```

The token is entered in the app and stored only in your browser. It is never in the code, the repo or the build. The API base URL is set in `src/api/config.ts`.

```bash
npm test                 # unit tests: amounts, claim state machine, balance reconciliation, API client
npm run lint
npm run typecheck
npx expo export --platform web   # static build in dist/
```

End-to-end guard checks (real API, phone viewport, needs Chrome). Note: this creates test claims.

```bash
TOKEN=<your token> BASE=http://localhost:8081 npm run e2e
```

## What works

- **Token:** asked for on first open and checked against the API; you can change it any time.
- **Balances:** available, pending and claiming per asset; USD totals; snapshot freshness; refresh; loading, error/retry and stale states.
- **Claim:**
  - Pick a destination, enter an amount or tap Max, and validate against the API rules.
  - See the fee and the amount you'll receive, then review and confirm.
  - Follow the claim until it completes or fails.
- **Safe claims:**
  - The idempotency key is saved before sending.
  - Lost responses and timeouts are replayed with the same key.
  - Pending claims survive reloads.
  - A second claim is blocked across tabs while one is unresolved.
- **Balance after claim:** updates at once and never jumps back (see NOTES.md).
- **Activity:** paginated history of accruals, reversals and claims.
- **Test mode:** add `?chaos=lost-response,flaky,slow` to the URL to inject failures, or `?chaos=off` to switch it off.

Design decisions, the failure table, how AI was used, and known issues are in [NOTES.md](NOTES.md).

## Deploy

`vercel.json` builds with `expo export` and rewrites every route to `index.html`.

```bash
npx vercel --prod
```
