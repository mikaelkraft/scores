#!/usr/bin/env node
/**
 * Archive & Prune MongoDB Atlas Storage
 * -------------------------------------
 * 1. Exports finished matches older than KEEP_FULL_DAYS (default: 7) and match events
 *    older than KEEP_EVENTS_DAYS (default: 14) to gzipped JSONL files in ARCHIVE_DIR
 *    (can point directly to your mounted 5TB drive, e.g. ARCHIVE_DIR=/mnt/5tb/scores-archive).
 * 2. Strips heavy ephemeral blobs (lineups, commentary, news, videos, broadcasts, odds,
 *    officials, leaders) from old finished matches while keeping 100% of scores, teams,
 *    dates, leagues, venues, and H2H intact.
 * 3. Deletes archived soccer_match_events older than KEEP_EVENTS_DAYS.
 *
 * Usage:
 *   node scripts/archive-and-prune-db.js --dry-run
 *   ARCHIVE_DIR=/path/to/5tb/archive node scripts/archive-and-prune-db.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const mongoose = require('../database');
const SoccerMatch = require('../models/soccerMatch');
const SoccerMatchEvent = require('../models/soccerMatchEvent');

const DRY_RUN = process.argv.includes('--dry-run');
const KEEP_FULL_DAYS = Number(process.env.KEEP_FULL_DAYS || 7);
const KEEP_EVENTS_DAYS = Number(process.env.KEEP_EVENTS_DAYS || 14);
const ARCHIVE_DIR = process.env.ARCHIVE_DIR || path.join(__dirname, '../archives');

async function run() {
    await new Promise(r => (mongoose.connection.readyState === 1 ? r() : mongoose.connection.once('open', r)));
    const db = mongoose.connection.db;

    const matchCutoff = new Date(Date.now() - KEEP_FULL_DAYS * 86400 * 1000);
    const eventCutoff = new Date(Date.now() - KEEP_EVENTS_DAYS * 86400 * 1000);
    const stamp = new Date().toISOString().slice(0, 10);

    const beforeMatches = await db.command({ collStats: 'soccer_matches' });
    const beforeEvents = await db.command({ collStats: 'soccer_match_events' });
    console.log(`[Before] soccer_matches: ${(beforeMatches.size / 1048576).toFixed(2)} MB (${beforeMatches.count} docs)`);
    console.log(`[Before] soccer_match_events: ${(beforeEvents.size / 1048576).toFixed(2)} MB (${beforeEvents.count} docs)`);

    const heavyMatchFilter = {
        date: { $lt: matchCutoff },
        'status.state': 'post',
        $or: [
            { 'lineups.0': { $exists: true } },
            { 'commentary.0': { $exists: true } },
            { 'odds.0': { $exists: true } },
            { 'broadcasts.0': { $exists: true } },
            { 'news.0': { $exists: true } },
            { 'videos.0': { $exists: true } }
        ]
    };

    const heavyCount = await SoccerMatch.countDocuments(heavyMatchFilter);
    const oldEventCount = await SoccerMatchEvent.countDocuments({ created_at: { $lt: eventCutoff } });
    console.log(`[Plan] Matches to strip heavy telemetry (> ${KEEP_FULL_DAYS}d old): ${heavyCount}`);
    console.log(`[Plan] Match events to archive & prune (> ${KEEP_EVENTS_DAYS}d old): ${oldEventCount}`);

    if (DRY_RUN) {
        console.log('Dry-run complete. Re-run without --dry-run to archive and prune.');
        await mongoose.disconnect();
        return;
    }

    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });

    // 1. Archive & strip heavy blobs from old finished matches
    if (heavyCount > 0) {
        const archivePath = path.join(ARCHIVE_DIR, `matches_telemetry_${stamp}.jsonl.gz`);
        const gz = zlib.createGzip();
        const out = fs.createWriteStream(archivePath);
        gz.pipe(out);

        const cursor = SoccerMatch.find(heavyMatchFilter).lean().cursor();
        let archived = 0;
        for await (const doc of cursor) {
            gz.write(JSON.stringify(doc) + '\n');
            archived++;
        }
        await new Promise((resolve, reject) => {
            out.on('finish', resolve);
            out.on('error', reject);
            gz.end();
        });
        console.log(`Archived ${archived} full match records -> ${archivePath}`);

        const stripRes = await SoccerMatch.updateMany(heavyMatchFilter, {
            $set: {
                lineups: [],
                commentary: [],
                odds: [],
                broadcasts: [],
                news: [],
                videos: [],
                officials: [],
                leaders: []
            }
        });
        console.log(`Stripped heavy telemetry blobs from ${stripRes.modifiedCount} old matches (scores/H2H preserved).`);
    }

    // 2. Archive & prune old soccer_match_events
    if (oldEventCount > 0) {
        const eventsPath = path.join(ARCHIVE_DIR, `match_events_${stamp}.jsonl.gz`);
        const gz = zlib.createGzip();
        const out = fs.createWriteStream(eventsPath);
        gz.pipe(out);

        const cursor = SoccerMatchEvent.find({ created_at: { $lt: eventCutoff } }).lean().cursor();
        let archivedEv = 0;
        for await (const doc of cursor) {
            gz.write(JSON.stringify(doc) + '\n');
            archivedEv++;
        }
        await new Promise((resolve, reject) => {
            out.on('finish', resolve);
            out.on('error', reject);
            gz.end();
        });
        console.log(`Archived ${archivedEv} match events -> ${eventsPath}`);

        const delRes = await SoccerMatchEvent.deleteMany({ created_at: { $lt: eventCutoff } });
        console.log(`Pruned ${delRes.deletedCount} old match events from Atlas.`);
    }

    const afterMatches = await db.command({ collStats: 'soccer_matches' });
    const afterEvents = await db.command({ collStats: 'soccer_match_events' });
    console.log(`[After] soccer_matches: ${(afterMatches.size / 1048576).toFixed(2)} MB (${afterMatches.count} docs)`);
    console.log(`[After] soccer_match_events: ${(afterEvents.size / 1048576).toFixed(2)} MB (${afterEvents.count} docs)`);

    await mongoose.disconnect();
}

run().catch(err => {
    console.error('Archive/prune error:', err);
    process.exit(1);
});
