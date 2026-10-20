# Public Football Leagues & Clubs API Specification

This API provides access to real-time and scheduled soccer telemetry stored in MongoDB Atlas. None of the endpoints below execute synchronous third-party upstream network calls during client requests.

For platform architecture, service boundaries between the consumer API and background listeners, feature flags, and developer guidelines, refer to [BUSINESS-CONTEXT.md](BUSINESS-CONTEXT.md).

**Base Path:**
```text
/get/soccer
```

---

## 1. Service Metadata & Data Coverage

```http
GET /get/soccer/meta
```

Returns the running service version, capabilities, total document counts across core collections, number of active competitions with stored matches, and the timestamp of the latest successful sync. All metrics are computed dynamically from MongoDB.

---

## 2. League Catalog & Selection

```http
GET /get/soccer/leagues?kind=club&available=true
```

Returns registered competitions marked `active: true`.
* **Query Parameters:**
  * `kind`: `club` (default), `international`, or `all`.
  * `available`: When `true`, filters to competitions that have at least one match, club, or standing stored in the database.

Each league object exposes a `coverage` summary:

```json
{
  "matches": 15,
  "clubs": 29,
  "dedicatedClubs": 0,
  "standingsGroups": 0,
  "hasData": true
}
```

* `clubs`: Inferred participants from match snapshots.
* `dedicatedClubs`: Count of complete documents in the dedicated `soccer_clubs` collection.
* Clients use the `slug` (e.g. `eng.1`, `esp.1`, `uefa.champions`) for subsequent league requests.

---

## 3. Scoreboard

```http
GET /get/soccer/{league}/scoreboard?dates=YYYYMMDD
```

**Example:**
```http
GET /get/soccer/eng.1/scoreboard?dates=20260822
```

Returns an upstream-independent data structure containing `leagues[]` and `events[]`. Each event includes match status, clock/period, scoreline, home/away competitors, boxscore stats, venue details, broadcast info, and match metadata.

* If `dates` is omitted, the current UTC calendar date is used.
* Format must strictly be 8 digits (`YYYYMMDD`).

---

## 4. League Fixtures & Results

```http
GET /get/soccer/{league}/fixtures
```

Designed for schedule calendars and results listings spanning multiple dates.

| Parameter | Type | Description |
|---|---|---|
| `from` | string | Optional start date in `YYYYMMDD` format |
| `to` | string | Optional end date in `YYYYMMDD` format |
| `status` | string | `all` (default), `scheduled`, `live`, or `finished` |
| `page` | number | Page number (default: 1) |
| `limit` | number | Records per page (default: 100, max: 200) |

**Example:**
```http
GET /get/soccer/esp.1/fixtures?status=all&limit=100
```

---

## 5. Match Summary & Key Events

```http
GET /get/soccer/{league}/summary?event={eventId}
GET /get/soccer/{league}/events/{eventId}
```

Returns `header`, `boxscore`, `keyEvents`, `rosters`, `gameInfo`, `commentary`, `broadcasts`, `odds`, `leaders`, `news`, and `videos`. Unpopulated attributes resolve to empty arrays or `null`.

* Goal scorers are available via `keyEvents` where `scoringPlay: true`.
* When present, `athletesInvolved[]` contains athlete name, identifier, shirt number, and team.
* Data availability flags are indicated in `meta.dataAvailability`.

---

## 6. Play-by-Play & Match Timeline

```http
GET /get/soccer/{league}/events/{eventId}/plays?page=1&limit=100
```

Returns granular timeline items (kickoff, cards, substitutions, goals, VAR checks, penalties):

```json
{
  "count": 114,
  "pageIndex": 1,
  "pageSize": 100,
  "pageCount": 2,
  "items": []
}
```

* **Important Filter:** To receive a condensed timeline containing only scoring plays, cards, and substitutions without hundreds of passing actions:
  ```http
  GET /get/soccer/{league}/events/{eventId}/plays?important=true&limit=300
  ```

---

## 7. Club Profiles & Rosters

```http
GET /get/soccer/{league}/clubs
GET /get/soccer/{league}/clubs/{clubId}
```

* The clubs list endpoint excludes detailed rosters to preserve bandwidth.
* The single club endpoint returns the club profile, stadium, coach, and active roster.
* Fallback: If `soccer_clubs` lacks a dedicated document for a league, basic club info is synthesized from match home/away snapshots (`meta.matchSnapshotFallback: true`).

---

## 8. League Standings & Tables

```http
GET /get/soccer/{league}/standings
GET /get/soccer/{league}/standings?season=2026
```

* Standard leagues return a single group labeled `overall`.
* Multi-group tournaments (such as UEFA Champions League or World Cup) return distinct group objects in `children[]`.

---

## 9. HTTP Status Codes

| Code | Meaning |
|---|---|
| `200` | Successful request (events array may be empty if no fixtures exist) |
| `400` | Invalid query parameter, slug format, date, or pagination index |
| `404` | League, club, or match not found in storage |
| `429` | Rate limit threshold exceeded |
| `500` | Internal database read failure |

---

## 10. Machine-Readable Documentation & Discovery

| Endpoint | Purpose |
|---|---|
| `/api-docs/` | Interactive Swagger UI (OpenAPI specification) |
| `/openapi.json` | Raw OpenAPI 3.0 specification |
| `/service-info.json` | High-level platform telemetry, licensing, and endpoint manifest |
| `/ai-data-guide.md` | LLM and crawler grounding guide for attribution and freshness rules |

---

## 11. Caching & Data Freshness

During live matches, internal response caching is kept minimal (4-second `Cache-Control` header). True freshness depends on listener synchronization frequency and upstream provider telemetry availability.
