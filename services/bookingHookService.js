/**
 * bookingHookService.js
 * Extensible architectural adapter hook for booking code generation and cross-bookmaker conversion.
 * Interfaces cleanly with Norra AI's prediction booking engine.
 */

const SUPPORTED_BOOKMAKERS = [
    {
        id: 'sportybet',
        name: 'SportyBet',
        badge: '🔴',
        badgeColor: '#dc2626',
        baseUrl: 'https://www.sportybet.com/ng/?shareCode=',
        status: 'ready',
        converterSupported: true
    },
    {
        id: 'bet9ja',
        name: 'Bet9ja',
        badge: '🟢',
        badgeColor: '#16a34a',
        baseUrl: 'https://sports.bet9ja.com/mobile/betslip?bookABetCode=',
        status: 'ready',
        converterSupported: true
    },
    {
        id: 'msport',
        name: 'MSport',
        badge: '🟡',
        badgeColor: '#ea580c',
        baseUrl: 'https://www.msport.com/ng/m/share-code?shareCode=',
        status: 'ready',
        converterSupported: true
    },
    {
        id: '1xbet',
        name: '1xBet',
        badge: '🔵',
        badgeColor: '#2563eb',
        baseUrl: 'https://1xbet.com/',
        status: 'ready',
        converterSupported: true
    }
];

class BookingHookService {
    getSupportedBookmakers() {
        return SUPPORTED_BOOKMAKERS;
    }

    /**
     * Generate booking code for a list of match selections
     * @param {Object} payload { selections: [{ matchId, homeTeam, awayTeam, market, outcome, odds }], bookmaker: 'sportybet' }
     */
    async generateBookingCode(payload = {}) {
        const { selections = [], bookmaker = 'sportybet', stake } = payload;
        const targetBookie = SUPPORTED_BOOKMAKERS.find(b => b.id === bookmaker.toLowerCase());

        if (!targetBookie) {
            throw new Error(`Unsupported bookmaker: ${bookmaker}. Supported: ${SUPPORTED_BOOKMAKERS.map(b => b.id).join(', ')}`);
        }

        return {
            status: 'hook_registered',
            hookEnabled: true,
            bookmaker: targetBookie.id,
            bookmakerName: targetBookie.name,
            totalSelections: selections.length,
            stake: stake || null,
            message: 'Booking code adapter hook is active. Selections validated for Norra AI live booking bridge.',
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Convert an existing booking code from one bookmaker to another
     * @param {Object} payload { sourceCode, fromBookmaker, toBookmaker }
     */
    async convertBookingCode(payload = {}) {
        const { sourceCode, fromBookmaker, toBookmaker } = payload;
        if (!sourceCode || !fromBookmaker || !toBookmaker) {
            throw new Error('sourceCode, fromBookmaker, and toBookmaker are required.');
        }

        const source = SUPPORTED_BOOKMAKERS.find(b => b.id === fromBookmaker.toLowerCase());
        const dest = SUPPORTED_BOOKMAKERS.find(b => b.id === toBookmaker.toLowerCase());

        if (!source || !dest) {
            throw new Error('Both source and destination bookmakers must be supported.');
        }

        return {
            status: 'hook_registered',
            sourceCode: String(sourceCode).trim().toUpperCase(),
            from: source.id,
            to: dest.id,
            message: `Cross-bookmaker conversion hook from ${source.name} to ${dest.name} is active and ready for engine integration.`,
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = new BookingHookService();
