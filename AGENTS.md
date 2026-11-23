# NorraScore (`mikaelkraft/scores`)

Real-time global football scores, match telemetry, and commercial sports API powering Norra AI (`mynorra.xyz`).

## Non-Negotiable Release & Quality Protocol

- **Initial Release `v1.0.0`**: Keep `package.json`, `manifest.webmanifest`, `public/index.html`, and `public/sw.js` (`CACHE_NAME = 'norrascore-v1.0.0'`) on `v1.0.0`.
- **Frontend Asset Mirroring & Signed APK**: After editing `public/app.js` or `public/styles.css`, mirror them to `public/app-v9.js`, `android/assets/app.js`, `public/styles-v9.css`, `android/assets/styles.css`, and run `bash scripts/build-apk.sh`.
- **Verification Gate**: Run `npm test` and confirm **0 failures** before committing. For Mongoose-touching tests, call `mongoose.disconnect()` in `test.after(...)`.
- **Architecture & Telemetry Invariants**: Read `docs/agents/architecture-and-invariants.md` before changing fixture sync, live status transitions, league slug resolution, H2H/telemetry enrichment, predictions/training feeds, API tier gates, or modal/UI rendering.

## Agent skills

### Issue tracker

GitHub Issues on `mikaelkraft/scores` (via `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout (`GLOSSARY.md` and `docs/adr/` at the repo root). See `docs/agents/domain.md`.
