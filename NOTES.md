# Notes

## Decisions

**1. How amounts are represented and calculated: `bigint` in the asset's smallest unit.**
API strings are parsed straight into integers (`"0.5"` ETH → `500000000000000000n`) and formatted back without passing through `Number`. ETH has 18 decimals (`"12.345678901234591676"`), and `parseFloat` changes that value, so a float-based Max would claim a different amount than the balance. The parser follows the API rules exactly (`"0.5"` and `"12"` pass; `".5"`, `"1."`, `"05"` and `"1e-3"` fail; at most `decimals` places). It also accepts a comma, because many phone keyboards only offer one. The amount sent is re-formatted into canonical form. USD values are `amount × price`, rounded half up to cents once at the end. Code: `src/money/amount.ts`.
_Alternatives:_ decimal.js works too, but it brings global precision and rounding settings I would have to justify. Plain numbers are wrong for 18 decimals.

**2. What the balance shows right after a claim: a local overlay, reconciled against the snapshot time.**
The two complaints describe two bugs. "Balance didn't change" happens when you wait for the server. "Dropped, then jumped back up" happens when you subtract locally and drop that change on the next fetch, which may still be an older snapshot. Displayed balances are a pure function, `reconcile(snapshot, localClaims)`. A claim moves from available to claiming at once and stays that way until a snapshot whose `asOf` is at or after `claim.createdAt` arrives; after that the server is the only truth. A claim that settles after the snapshot also leaves "claiming" at once, so "Completed" and "Claiming 830 USDT" never show side by side. The card says why: _"Includes your claim of 10 USDT, not yet in the server snapshot."_ Code: `src/claims/reconcile.ts`, tested in `src/claims/__tests__`.
_Alternatives:_ show only the server snapshot plus a banner (honest, but users claim again), or subtract optimistically and refetch (causes the jump).

**3. When a claim's result is unknown (timeout, 504, 5xx, dropped connection): "Confirming", and replay the same request.**
Before sending, the app saves a claim record with its Idempotency-Key and body to localStorage, scoped to the token. Any non-definitive failure puts the record in `unknown`. The user sees _"We're confirming your claim… it can never be submitted twice"_, the time until the next check, and a "Check now" button. The app retries with the **same key and same body** (backoff 2s → 30s, or `retryAfterMs`) until it gets a 201/200 or a definitive 4xx. A 200 with `Idempotent-Replayed: true` is shown as _"We found the claim you already submitted"_. While a record is unresolved, new claims for that asset are blocked in **every tab**: the check and the write happen under a Web Lock, and tabs sync through `storage` events. Records survive reloads and the app resumes them on open. Code: `src/claims/record.ts` (state machine), `journal.ts`, `runner.ts`.

**Other decisions**

- **Token:** entered at runtime, checked against `/v1/balances` (a 401 shows a clear message), and stored in localStorage. Switching tokens remounts the app with a fresh query cache, and claim records are keyed by a hash of the token, so one account's data never appears under another.
- **Base URL:** defined once, in `src/api/config.ts`.
- **Errors:** `ApiError` separates _rejected_ (4xx except 429: nothing happened) from _outcome unknown_ (5xx, 504, network, client timeout). Reads retry up to 3 times and honour `retryAfterMs`.
- **Total:** "Claimable now" is the USD value of available. "Total payback" adds pending and claiming, so the total doesn't drop while a claim is in flight.
- **Freshness:** shows both the snapshot age (`asOf`) and when the app last checked. Balances poll every 15s, matching how often the server recomputes them. Data older than 60s is flagged.
- **Destinations:** the user picks one; the live API returns two, not one as in the docs example.
- **Test mode:** `?chaos=lost-response,flaky,slow` injects failures on the client, so the unknown-outcome path can be shown live.

| Failure                             | Reads (balances, options, activity)         | Claim POST                                              |
| ----------------------------------- | ------------------------------------------- | ------------------------------------------------------- |
| 400 / 404 / 409                     | error shown, no retry                       | `rejected`: "Nothing was claimed", balances refreshed   |
| 401                                 | "Token not accepted" + Change token         | `rejected`                                              |
| 429                                 | wait `retryAfterMs`, retry                  | `unknown`, retry after `retryAfterMs` with the same key |
| 500 / 503 / 504 / network / timeout | retry with backoff, keep last data + banner | `unknown`, replay the same key and body                 |

## Working with AI

I used Claude Code (in the terminal) for the whole task. Summaries are in `ai-logs/`.

- **A prompt that didn't get what I wanted.** I asked "how do we make this stand out when 100+ people get it" and got a generic feature list. I re-prompted: _"analyze, check details, think in a different way"_. That produced the useful findings: the token's payload contains `"chaos":"normal"` (reviewers' tokens will likely fail more), only `Retry-After` and `Idempotent-Replayed` are exposed over CORS, the live API returns two destinations, and ETH has 18 decimals. See `ai-logs/claude-code/session-summary.md`, step 3.
- **AI output that was wrong or risky, and how I found out.** (a) The bootstrap step put the API token in an `EXPO_PUBLIC_*` env variable, which ends up inside the deployed bundle and breaks the task's main rule. I caught it when we read the task together and replaced it with runtime entry; a check now confirms that neither `dist/` nor git history contains the token. (b) The AI's own unit test expected a total of `$32,035.12`. Recomputing with Python's `Decimal` gave `$32,035.30`, so the code was right and the expected value was wrong. (c) While testing by hand I saw "Completed" next to "Claiming 830 USDT" and asked for a fix (decision 2). See `ai-logs/claude-code/session-summary.md`, steps 2, 4 and 6.
- **A time I disagreed with the AI.** It proposed seven extra features (a global rate-limit queue, property-based tests, a fault simulator and more) and recommended several. I kept only the claim record + cross-tab lock, because it protects money and the rest was scope. I also chose bigint over decimal.js. Its first end-to-end test asserted "exactly one POST per claim". The real API returned a 504 on a normal claim, so I changed the check to "one key and one body for every attempt, at most one claim created". See `ai-logs/claude-code/decisions.md`.

## Not done / known issues

- **Bootstrap date:** the empty Expo scaffold (router, lint, Jest, hosting config) was created the day before the slot. Those commits are dated 2026-10-20. All task code was written during the slot.
- **Old unknown claims:** an unknown claim is retried forever, with backoff capped at 30s. If the app is reopened hours later, the replay can create the claim then. Next: stop auto-replay after N minutes and ask the user.
- **Claims from elsewhere:** claim records live on this device only. Claims made elsewhere show up once the snapshot includes them.
- **Fee changes:** the fee is quoted from `claim-options` (refetched when the screen opens). If it changes before submit, the status screen shows the server's fee, but nothing warns the user beforehand.
- **Rate limits:** there is no shared request queue. Many concurrent pending claims each poll every 2s and could hit 429 (handled, but noisy).
- **Token storage:** localStorage can be read by an XSS attack; sessionStorage would be stricter, at the cost of re-entering the token.
- **Smaller gaps:** pull-to-refresh only works on native; web uses the Refresh button. Activity items don't link to claim status. Only tested on web, not on iOS or Android.
