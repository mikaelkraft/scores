const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.development') });
if (!process.env.MONGODB_URL) {
    require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
}
const SoccerMatch = require('../models/soccerMatch');

async function migrate() {
    console.log('Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('Connected!');

    // 1. Peruvian matches in idn.1
    const peruTeams = /comerciantes unidos|sport boys|universitario|alianza lima|sporting cristal|fbc melgar|melgar|cienciano|cusco|cesar vallejo|adt tarma|asociacion deportiv|deportivo garcilaso|utc|cajamarca|chankas|grau|carlos mannucci|juan pablo|alianza atletico/i;
    const peruMatches = await SoccerMatch.find({
        league_slug: 'idn.1',
        $or: [{ note: /peru/i }, { name: peruTeams }]
    }).lean();
    console.log(`Found ${peruMatches.length} Peruvian matches in idn.1`);
    for (const m of peruMatches) {
        const prov = m.source?.provider;
        const eid = m.source?.event_id;
        if (prov && eid) {
            const exists = await SoccerMatch.findOne({ 'source.provider': prov, 'source.event_id': eid, league_slug: 'per.1' });
            if (exists) {
                await SoccerMatch.deleteOne({ _id: m._id });
                continue;
            }
        }
        await SoccerMatch.updateOne({ _id: m._id }, { $set: { league_slug: 'per.1', note: 'Peruvian Liga 1' } });
    }

    // 2. Romanian matches in idn.1
    const rouTeams = /uta arad|petrolul|dinamo bucuresti|arges|miercurea ciuc|universitatea cluj|farul|rapid 1923|fcsb|corvinul|sepsi|voluntari|cfr cluj|universitatea craiova|botosani|otelul/i;
    const rouMatches = await SoccerMatch.find({
        league_slug: 'idn.1',
        $or: [{ note: /romania/i }, { name: rouTeams }]
    }).lean();
    console.log(`Found ${rouMatches.length} Romanian matches in idn.1`);
    for (const m of rouMatches) {
        const prov = m.source?.provider;
        const eid = m.source?.event_id;
        if (prov && eid) {
            const exists = await SoccerMatch.findOne({ 'source.provider': prov, 'source.event_id': eid, league_slug: 'rou.1' });
            if (exists) {
                await SoccerMatch.deleteOne({ _id: m._id });
                continue;
            }
        }
        await SoccerMatch.updateOne({ _id: m._id }, { $set: { league_slug: 'rou.1', note: 'Romanian SuperLiga' } });
    }

    // 3. Coupe de France matches in srb.1
    const fraCupTeams = /paris 13|red star|chambery|niort|rochefort|juventus de papus|saint pauloise|tamponnaise|massay|montlouis|saint-renan|laval|st\. omer|af vire|sedan|bourges|vandoeuvre|pontivy|plabennec|crosne|cosne|seyssinet|nimes/i;
    const fraCupMatches = await SoccerMatch.find({
        league_slug: 'srb.1',
        $or: [{ note: /coupe de france/i }, { name: fraCupTeams }]
    }).lean();
    console.log(`Found ${fraCupMatches.length} Coupe de France matches in srb.1`);
    for (const m of fraCupMatches) {
        const prov = m.source?.provider;
        const eid = m.source?.event_id;
        if (prov && eid) {
            const exists = await SoccerMatch.findOne({ 'source.provider': prov, 'source.event_id': eid, league_slug: 'fra.coupe_de_france' });
            if (exists) {
                await SoccerMatch.deleteOne({ _id: m._id });
                continue;
            }
        }
        await SoccerMatch.updateOne({ _id: m._id }, { $set: { league_slug: 'fra.coupe_de_france', note: 'Coupe de France' } });
    }

    console.log('Migration finished successfully!');
    process.exit(0);
}

migrate().catch(err => {
    console.error('Migration error:', err);
    process.exit(1);
});
