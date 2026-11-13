require('../config/env').loadEnvConfig();
require('../database');
const mongoose = require('mongoose');
const SoccerLeague = require('../models/soccerLeague');
const SoccerStanding = require('../models/soccerStanding');
const { TARGET_LEAGUES } = require('../services/soccerSyncService');

mongoose.connection.once('open', async () => {
    try {
        console.log('Starting league database cleanup...');
        const currentYear = new Date().getFullYear(); // 2026
        const nextYearShort = String(currentYear + 1).slice(-2); // '27'
        const seasonSpan = currentYear + '-' + nextYearShort; // '2026-27'

        const targetMap = new Map();
        for (const t of (TARGET_LEAGUES || [])) {
            targetMap.set(t.slug, t);
        }

        const allLeagues = await SoccerLeague.find({}).lean();
        let cleanedLogos = 0;
        let cleanedSeasons = 0;

        for (const l of allLeagues) {
            const updates = {};
            const def = targetMap.get(l.slug);

            // Fix 23.png for non-Premier League
            if (l.slug !== 'eng.1' && l.logo && l.logo.includes('/23.png')) {
                const newLogo = (def && def.logo && !def.logo.includes('/23.png')) ? def.logo : '';
                updates.logo = newLogo;
                cleanedLogos++;
            }

            // Fix stale season
            const s = l.season || {};
            let sYear = s.year || currentYear;
            let sDisplayName = s.display_name || '';
            if (sYear < currentYear || /202[0-5][-–/]2[0-6]|202[0-5]/.test(sDisplayName)) {
                sYear = currentYear;
                if (sDisplayName) {
                    sDisplayName = sDisplayName
                        .replace(/202[0-5][-–/]2[0-6]/g, seasonSpan)
                        .replace(/202[0-5]/g, String(currentYear));
                } else {
                    sDisplayName = (l.name || 'League') + ' ' + seasonSpan;
                }
                updates.season = {
                    ...s,
                    year: sYear,
                    display_name: sDisplayName,
                    current: true
                };
                cleanedSeasons++;
            }

            if (Object.keys(updates).length > 0) {
                await SoccerLeague.updateOne({ slug: l.slug }, { $set: updates });
            }
        }

        // Specifically ensure concacaf.nations exists and is active
        await SoccerLeague.updateOne(
            { slug: 'concacaf.nations' },
            {
                $set: {
                    name: 'CONCACAF Nations League',
                    abbreviation: 'CONCACAF',
                    country: 'International',
                    kind: 'international',
                    logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/2060.png',
                    active: true,
                    sort_order: 44,
                    season: {
                        year: currentYear,
                        display_name: '2026-27 CONCACAF Nations League',
                        current: true
                    }
                }
            },
            { upsert: true }
        );

        // Specifically ensure nga.1 has correct flag/logo
        await SoccerLeague.updateOne(
            { slug: 'nga.1' },
            {
                $set: {
                    logo: 'https://flagcdn.com/w80/ng.png',
                    'season.year': currentYear,
                    'season.display_name': '2026-27 Nigeria Premier Football League'
                }
            }
        );

        // Specifically ensure chn.cup has correct flag/logo
        await SoccerLeague.updateOne(
            { slug: 'chn.cup' },
            {
                $set: {
                    logo: 'https://flagcdn.com/w80/cn.png',
                    'season.year': currentYear,
                    'season.display_name': '2026 Chinese FA Cup'
                }
            }
        );

        // Ensure standings for nga.1 are set to current season
        await SoccerStanding.updateMany(
            { league_slug: 'nga.1', season_year: { $lt: currentYear } },
            { $set: { season_year: currentYear, season_display_name: '2026-27 Nigeria Premier Football League' } }
        );

        console.log('Cleanup finished! Cleaned logos:', cleanedLogos, 'Cleaned seasons:', cleanedSeasons);
    } catch (err) {
        console.error('Error during cleanup:', err);
    } finally {
        process.exit(0);
    }
});
