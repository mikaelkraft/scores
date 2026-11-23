# NorraScore Architecture & Engineering Invariants

Consult this reference when modifying fixture ingestion, live scores, telemetry, H2H, predictions, tier gates, or frontend rendering.

## 1. Multi-Provider Data Routing
Each upstream provider owns the layer where it is strongest:
- **Live scores & full world fixtures (100+ leagues)**: `LiveScore + ESPN` merged into `services/dailyBoardCache.js` (RAM snapshot).
- **Play-by-play, boxscore stats & confirmed lineups**: `ESPN -> SportScore -> LiveScore`. Keep specific shot/xG regexes (`shotsInsideBox`, `shotsOutsideBox`, `expectedGoalsOnTarget`) ordered ahead of broad `totalShots`/`expectedGoals` in `services/sportScoreService.js`.
- **Historical H2H & Last-5 form**: `MongoDB -> SportScore (verified 24h slug resolver) -> ESPN seasonseries -> TheSportsDB (canonical club-name helper)` via `services/h2hAggregatorService.js` and `services/sportScoreService.js`. Both `/api/v1/football/predictions-context/:eventId` and `/api/v1/football/h2h/:team1Id/:team2Id` must enrich whenever local DB has `< 8` meetings.
- **League standings & table context**: Match clubs by `source_id` first, then `areTeamNamesMatching`, then already-fetched `espnSummary.standings.groups` (zero extra per-match HTTP calls).

## 2. Live Status, Ordering & Slug Integrity
- **Canonical slug protection**: Strip opaque numeric provider UIDs (`s:\d+~l:\d+~e:\d+`, `ls:\d+`) before tier matching in `resolveLeagueSlug`. Treat `other`, `w.other`, `international`, `all`, and `*.lower` as weak slugs that can never overwrite a canonical `.1`/`.2`/cup slug during live merges.
- **Premature FT protection & revival**: Inside the `< 102m` impossible-FT window, protect live matches from mid-game provider hiccups and revive prematurely finalized matches when the live feed reports a concrete active clock. Keep DB extra-time auto-finalize at `160m`.
- **Stuck `90+` reconciliation**: Full live snapshots reconcile `>= 85'`/`90+` matches that exit `/live` to `FT` in `dailyBoardCache`.
- **WAT (`UTC+1`) Daily Board Schedule**: Full-day fixture discovery runs at `00:05`, `09:00`, and `14:00 WAT`; live polling runs actively inside `[kickoff - 5m, kickoff + 135m]` and backs off to a 5-minute heartbeat when idle.
- **Stable live ordering**: Within each league, live matches stay pinned to their first-seen `state.liveOrderSlots` index until `FT`, with deterministic kickoff + alphabetical tie-breakers.

## 3. Predictions & Norra AI Training Accuracy
- Keep `recomputeAnalyticsFromFormattedRecent` synchronized whenever `extractTeamForm` fields change so ESPN `lastFiveGames` and form-string fallbacks populate PPG, goal averages, BTTS, Over 1.5/2.5, Clean Sheet, and Failed-to-Score rates accurately.
- Keep `computeEnrichedPredictionModel` live-aware: adjust 1X2, Double Chance, BTTS, and Over 2.5 using live scoreline + remaining-time Poisson probabilities, and flag sparse cold-start samples explicitly.

## 4. Commercial API Tiers, Master Key & Atlas M0 Hygiene
- **Norra Master Key**: `rateLimitPerMinute <= 0` (and `admin`/`internal` plans) means **∞ Unlimited** and bypasses rate limits and league locks (`middleware/apiKeyAuth.js`, `index.js`). Display `∞ Unlimited` in Admin UI.
- **Tier parity**: Keep `PLAN_LIMITS` in `middleware/apiKeyAuth.js`, route middleware (`optionalApiKeyAuth`, `enforceLeaguePlan`, `requireFeature`), and `public/pricing/index.html` aligned 1-to-1.
- **MongoDB Atlas M0 (512 MB cap)**: Preserve daily `pruneOldTelemetryStorage()` in `index.js` and never store unbounded raw telemetry blobs that threaten the 512 MB limit.

## 5. Frontend UX & Shell Parity
- **Unified shell**: Keep `public/sw.js` Network-First for `.css`/`.js`. Sync header/footer logos, uploaded favicon, social icons, partner row (respecting blank `partnerSectionTitle`), and admin-editable `footerSettings` across all pages via `public/shared-shell.js` and `public/app.js`.
- **Telemetry drawer**: Keep `#drawer-tab-info` and `#drawer-tab-predictions` as sibling tabs, use non-blocking two-stage hydration (`summary + plays` first, then `predictions-context`), keep `.drawer-tabs` touch-fluid (`touch-action: pan-x`, no `scroll-snap-type`), and retain the 450ms `modalClosedAt` ghost-click shield on `#fixtures-list`.
