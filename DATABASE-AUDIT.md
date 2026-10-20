# Soccer Database Audit & Storage Report

**Environment:** MongoDB Atlas Cluster (`soccer` database)  
**Access Mode:** Read-only audit verification  

---

## Active Database

The API services and client views operate on the `soccer` database with normalized `soccer_*` collections.

---

## Document Statistics

| Entity | Document Count |
|---|---:|
| Total Leagues in `soccer_leagues` | 169 |
| Active Club Competitions | 125 |
| Active National / International Competitions | 44 |
| Competitions with Stored Matches | 167 |
| Dedicated Club Documents in `soccer_clubs` | 48 |
| Match Documents in `soccer_matches` | 753 |
| Play-by-Play Events in `soccer_match_events` | 20,048 |
| Standings Tables in `soccer_standings` | 24 |
| Ingestion Sync State Records | 674 |
| Healthy Sync States | 668 |
| Sync States with Errors | 6 |

---

## Key Technical Findings

1. **Normalized Storage Structure:** The active schema employs normalized collections (`soccer_matches`, `soccer_match_events`, and `soccer_leagues`), eliminating payload bloat and circular dependencies.
2. **Match Coverage & Club Catalog Fallback:** Match telemetry coverage is strong. For competitions where dedicated `soccer_clubs` documents are not yet fully ingested, the club service safely synthesizes basic club profiles from the `home` and `away` match participant snapshots to avoid empty client responses.
3. **Standings Tables:** Standings are available for premier leagues. Where historical or ongoing standings are unrecorded, the API returns a safe empty `children: []` array without throwing 500 errors.
4. **Listener Isolation:** Ingestion state and raw cache snapshots remain isolated from client-facing query paths.
5. **Index Health:** All unique compound indexes are provisioned on MongoDB Atlas via `npm run db:init-live`.

---

## Recommendations for Background Ingestion

* For each active league, ingest complete club profiles into `soccer_clubs` keyed by `source.provider + source.club_id`.
* Maintain club competition memberships across multi-tournament clubs using `$addToSet` on `league_slugs`.
* Ensure standings for group-based competitions (e.g. UEFA Champions League) populate distinct group records rather than a single monolithic table.
* Periodically audit the error logs for the 6 failing sync state records without purging valid snapshots.
