require('../config/env');
const mongoose = require('../database');
const SoccerStanding = require('../models/soccerStanding');
const SoccerLeague = require('../models/soccerLeague');

async function main() {
    try {
        console.log('Connecting to database...');
        // Wait for mongoose connection
        if (mongoose.connection.readyState !== 1) {
            await new Promise(resolve => mongoose.connection.once('open', resolve));
        }
        console.log('Connected to MongoDB.');

        // 1. Check nga.1 standings
        const ngaStandings = await SoccerStanding.find({ league_slug: 'nga.1' }).sort({ season_year: -1 }).lean();
        console.log(`Found ${ngaStandings.length} standing documents for nga.1:`, ngaStandings.map(s => ({ id: s._id, year: s.season_year, group: s.group_name })));

        if (ngaStandings.length > 1) {
            const newestYear = ngaStandings[0].season_year;
            console.log(`Newest season_year for nga.1 is ${newestYear}. Purging stale older standing records...`);
            const delRes = await SoccerStanding.deleteMany({ league_slug: 'nga.1', season_year: { $lt: newestYear } });
            console.log(`Deleted ${delRes.deletedCount} stale nga.1 standing documents.`);
        }

        // 2. Upsert kvx.1 league in SoccerLeague
        const kvxRes = await SoccerLeague.findOneAndUpdate(
            { slug: 'kvx.1' },
            {
                $set: {
                    slug: 'kvx.1',
                    name: 'Kosovar Superliga',
                    abbreviation: 'Superliga Kosovo',
                    country: 'Kosovo',
                    kind: 'club',
                    sort_order: 150,
                    logo: 'https://flagcdn.com/w80/xk.png',
                    active: true,
                    last_synced_at: new Date()
                }
            },
            { upsert: true, new: true }
        );
        console.log('Upserted kvx.1 league:', kvxRes.slug, kvxRes.name);

        console.log('Done!');
    } catch (err) {
        console.error('Error during cleanup:', err);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

main();
