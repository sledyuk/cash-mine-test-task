# Decisions: what the AI proposed and what was chosen

## Balance right after a claim

The AI was asked for options before choosing.

| # | Approach | Fixes "I claimed and nothing changed"? | Fixes "dropped, then jumped back"? |
|---|---|---|---|
| A | Show only the server snapshot; add a "claim submitted" banner | Partly: the number still looks claimable | Yes |
| B | Subtract locally on success, refetch, and trust whatever comes back | Yes | **No**: the refetch can return a snapshot from before the claim (they are recomputed every 15s) |
| C | **Local overlay reconciled by time:** count the claim locally until a snapshot with `asOf ≥ claim.createdAt` arrives, then hand over to the server | Yes | Yes |

**Chosen: C.** It is the only option that fixes both complaints, and it is a pure function, so it can be unit-tested. It was later extended after a manual test: claims that **settled** after the snapshot also leave "claiming" at once.

## Unknown claim outcome

| Approach | Problem |
|---|---|
| Show an error and let the user try again | The retry gets a new key, and a lost-but-created claim becomes a **double claim** |
| Retry automatically with a new key | Same double-claim risk |
| Keep the key in React state and retry with it | Lost on reload or tab close; another tab can still submit |
| **Save key + body before sending; replay the same request until a definitive answer; block new claims for that asset in every tab** | Chosen |

## Money representation

- Proposed: bigint units, or decimal.js.
- **Chosen: bigint.** It is exact, has no dependency and is about 60 lines that can be explained line by line. decimal.js would add precision and rounding settings to justify.

## Extras offered by the AI (multi-select)

| Option | Picked? | Why |
|---|---|---|
| Claim record + cross-tab lock | **Yes** | Directly prevents losing or doubling money |
| Failure simulator toggle | Partly | Kept as a small `?chaos=` switch in the client; the real test uses network-level faults in Playwright |
| Rate-limit-aware global queue | No | Scope. `retryAfterMs` is honoured per request instead |
| Property-based tests + failure matrix | No / partly | Table-driven unit tests instead of fast-check; the failure table went into NOTES.md |

## Hosting

The AI defaulted to Vercel (`vercel.json` with SPA rewrites), with `public/_redirects` so Netlify works too.
