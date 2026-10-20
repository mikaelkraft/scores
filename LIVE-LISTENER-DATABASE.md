# Live Football Listener Database Contract

This document defines the storage schema and synchronization contract for background listener services populating MongoDB for Scores by Norra AI (`scores.mynorra.xyz`).

The web application and consumer API read exclusively from MongoDB Atlas. The listener service is responsible for ingesting upstream provider telemetry, normalizing payloads, and updating MongoDB. No client request ever initiates an external third-party API call.

For business context, ownership boundaries, and operational guidelines, refer to [BUSINESS-CONTEXT.md](BUSINESS-CONTEXT.md).

---

## Collections Overview

| Collection | Stored Entity | Upsert Key |
|---|---|---|
| `soccer_leagues` | Selectable leagues and active competitions | `slug` |
| `soccer_clubs` | Club metadata, stadiums, and rosters | `source.provider + source.club_id` |
| `soccer_matches` | Schedules, scores, statuses, stats, and summaries | `source.provider + league_slug + source.event_id` |
| `soccer_match_events` | Granular play-by-play match events | `source.provider + league_slug + event_id + source.event_key` |
| `soccer_standings` | League tables and tournament group standings | `league_slug + season_year + group_id` |
| `soccer_sync_states` | Ingestion cursors, polling leases, and errors | `provider + league_slug + resource_type + resource_key` |

---

## Initializing Collections & Indexes

Ensure `MONGODB_URL` is configured in your environment, then execute:

```bash
npm run db:init-live
```

This operation is idempotent: it provisions all necessary collections and unique indexes without modifying or overwriting existing data.

---

## 1. League Registration (`soccer_leagues`)

A competition must be marked `active: true` in `soccer_leagues` before the API exposes it to users.

```javascript
await db.collection('soccer_leagues').updateOne(
  { slug: 'eng.1' },
  {
    $set: {
      name: 'English Premier League',
      abbreviation: 'Premier League',
      country: 'England',
      kind: 'club',
      logo: 'https://example.com/premier-league.png',
      active: true,
      sort_order: 10,
      source: { provider: 'upstream', source_id: '700' },
      season: {
        year: 2026,
        display_name: '2026-27 English Premier League',
        current: true,
        type_id: '1',
        type_name: 'Regular Season'
      },
      last_synced_at: new Date(),
      updated_at: new Date()
    },
    $setOnInsert: { created_at: new Date() }
  },
  { upsert: true }
);
```

**Common League Slugs:**
```text
eng.1, esp.1, ger.1, ita.1, fra.1, uefa.champions, uefa.europa, conmebol.libertadores
```

---

## 2. Club Registration (`soccer_clubs`)

Clubs can participate in multiple competitions (e.g., Premier League and UEFA Champions League). All relevant competition slugs are tracked in `league_slugs`.

```json
{
  "source": {
    "provider": "upstream",
    "club_id": "CLUB_ID",
    "uid": "SOURCE_CLUB_UID"
  },
  "league_slugs": ["eng.1", "uefa.champions"],
  "slug": "arsenal",
  "name": "Arsenal",
  "display_name": "Arsenal",
  "short_display_name": "Arsenal",
  "abbreviation": "ARS",
  "country": "England",
  "city": "London",
  "logo": "https://example.com/arsenal.png",
  "logos": [],
  "color": "c60b1e",
  "alternate_color": "FFFFFF",
  "active": true,
  "roster": [],
  "coach": null,
  "last_synced_at": "2026-08-22T14:00:00.000Z"
}
```

*Listeners should use `$addToSet` on `league_slugs` to prevent overwriting cross-competition memberships.*

---

## 3. Match Telemetry (`soccer_matches`)

Each fixture corresponds to a single document in `soccer_matches`, serving both live scoreboards and detailed match summaries.

```json
{
  "source": {
    "provider": "upstream",
    "event_id": "EVENT_ID",
    "competition_id": "COMPETITION_ID",
    "uid": "SOURCE_EVENT_UID",
    "modified_at": "2026-08-22T14:08:00.000Z"
  },
  "league_slug": "eng.1",
  "scoreboard_date": "20260822",
  "date": "2026-08-22T14:00:00.000Z",
  "name": "Arsenal vs Chelsea",
  "short_name": "ARS vs CHE",
  "season": {
    "year": 2026,
    "type_id": "1",
    "slug": "regular-season",
    "name": "2026-27 English Premier League"
  },
  "status": {
    "state": "in",
    "name": "STATUS_IN_PROGRESS",
    "description": "In Progress",
    "detail": "45'",
    "short_detail": "45'",
    "clock": "45'",
    "clock_seconds": 2700,
    "period": 1,
    "completed": false,
    "suspended": false
  },
  "home": {
    "source_id": "HOME_CLUB_ID",
    "uid": "HOME_CLUB_UID",
    "name": "Arsenal",
    "display_name": "Arsenal",
    "abbreviation": "ARS",
    "logo": "https://example.com/arsenal.png",
    "score": 1,
    "aggregate_score": 1,
    "shootout_score": 0,
    "winner": false,
    "advance": false,
    "form": "WWWDW",
    "stats": {
      "possessionPct": 58.4,
      "totalShots": 6,
      "shotsOnTarget": 3,
      "wonCorners": 4,
      "foulsCommitted": 5
    }
  },
  "away": {
    "source_id": "AWAY_CLUB_ID",
    "uid": "AWAY_CLUB_UID",
    "name": "Chelsea",
    "display_name": "Chelsea",
    "abbreviation": "CHE",
    "logo": "https://example.com/chelsea.png",
    "score": 0,
    "winner": false,
    "form": "DWLWW",
    "stats": { "possessionPct": 41.6, "totalShots": 3 }
  },
  "venue": {
    "source_id": "VENUE_ID",
    "name": "Emirates Stadium",
    "city": "London",
    "country": "England"
  },
  "attendance": 60200,
  "note": "English Premier League",
  "play_by_play_available": true,
  "broadcasts": [],
  "odds": [],
  "key_events": [],
  "lineups": [],
  "officials": [],
  "commentary": [],
  "last_synced_at": "2026-08-22T14:45:00.000Z"
}
```

**Key Data Invariants:**
* `scoreboard_date` must always be formatted as a string `YYYYMMDD`.
* Scores must be stored as numbers or omitted if unscheduled.
* Two-leg ties and shootouts must populate `aggregate_score` and `shootout_score`.
* Timestamps must be valid ISO 8601 UTC dates.
* In case of upstream sync timeouts, the listener must retain the latest valid snapshot rather than writing an empty object.

---

## 4. Play-by-Play Timeline (`soccer_match_events`)

Granular timeline events are written as discrete documents in `soccer_match_events`:

```json
{
  "source": {
    "provider": "upstream",
    "event_key": "SOURCE_PLAY_ID",
    "modified_at": "2026-08-22T14:23:00.000Z"
  },
  "league_slug": "eng.1",
  "event_id": "EVENT_ID",
  "competition_id": "COMPETITION_ID",
  "sequence": 14,
  "event_type": {
    "id": "16",
    "name": "goal",
    "text": "Goal"
  },
  "text": "Goal! Arsenal 1, Chelsea 0. Bukayo Saka left footed shot from the right side of the box.",
  "clock": {
    "value": 23,
    "display_value": "23'",
    "added_value": 0,
    "added_display_value": ""
  },
  "period": 1,
  "wallclock": "2026-08-22T14:23:12.000Z",
  "home_score": 1,
  "away_score": 0,
  "score_value": 1,
  "club": {
    "source_id": "HOME_CLUB_ID",
    "side": "home",
    "name": "Arsenal"
  },
  "flags": {
    "scoring_play": true,
    "yellow_card": false,
    "red_card": false,
    "substitution": false,
    "penalty_kick": false,
    "own_goal": false,
    "shootout": false
  },
  "valid": true
}
```

*Events are written via `bulkWrite` with `upsert: true` indexed on `event_key` to avoid duplicate timeline records.*

---

## 5. League Tables & Standings (`soccer_standings`)

Standard round-robin leagues use `group_id: "overall"`. Group-stage competitions store one document per group.

```json
{
  "league_slug": "eng.1",
  "season_year": 2026,
  "group_id": "overall",
  "group_name": "League Table",
  "entries": [
    {
      "rank": 1,
      "club": {
        "source_id": "CLUB_ID",
        "display_name": "Arsenal",
        "abbreviation": "ARS",
        "logo": "https://example.com/arsenal.png"
      },
      "stats": {
        "gamesPlayed": 3,
        "wins": 3,
        "ties": 0,
        "losses": 0,
        "points": 9,
        "goalDifference": 6
      },
      "note": null
    }
  ],
  "last_synced_at": "2026-08-22T18:00:00.000Z"
}
```

---

## 6. Coordination & Leases (`soccer_sync_states`)

The listener coordinates polling frequency and avoids duplicate concurrent requests across worker instances via atomic leases:

```json
{
  "provider": "upstream",
  "league_slug": "eng.1",
  "resource_type": "plays",
  "resource_key": "EVENT_ID",
  "status": "healthy",
  "last_polled_at": "2026-07-19T19:08:00.000Z",
  "last_success_at": "2026-07-19T19:08:00.000Z",
  "next_poll_at": "2026-07-19T19:08:05.000Z",
  "cursor": { "last_event_key": "49878820", "count": 37 },
  "consecutive_errors": 0,
  "lease": {
    "owner": "listener-worker-1",
    "expires_at": "2026-07-19T19:08:15.000Z"
  }
}
```

---

## Database User Privileges

The listener worker only requires read and write access (`find`, `insert`, `update`) on the `soccer` database collections. Administrative permissions (`dropDatabase`, user management) should not be granted to background listener workers.
