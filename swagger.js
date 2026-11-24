const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const packageJson = require('./package.json');

const publicUrl = String(process.env.PUBLIC_SITE_URL || process.env.API_URL || 'http://localhost:3050').replace(/\/$/, '');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Norra AI Live Football Scores & Commercial Sports API',
      version: packageJson.version,
      description: 'Production JSON football API for Premier League, LaLiga and expanding multi-country coverage. Read stored fixtures, stored snapshots, live scores, results, tables, clubs, match summaries, play-by-play and rosters from a database-backed REST service. Supported by Norra AI (scores.mynorra.xyz). Commercial API plans and white-label access available. Requests never call upstream providers directly.',
      contact: {
        name: 'Norra AI Support',
        url: 'https://scores.mynorra.xyz',
        email: 'support@mynorra.xyz'
      }
    },
    externalDocs: {
      description: 'Football data freshness, limitations and citation guide for AI assistants',
      url: `${publicUrl}/ai-data-guide.md`
    },
    servers: [
      {
        url: publicUrl,
        description: process.env.PUBLIC_SITE_URL || process.env.API_URL ? 'Configured server' : 'Development server'
      }
    ],
    tags: [
      {
        name: 'Soccer Data',
        description: 'Multi-league club data read from MongoDB'
      },
      {
        name: 'Health',
        description: 'Service and database health'
      }
    ],
    components: {
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        },
        League: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            abbreviation: { type: 'string' },
            slug: { type: 'string', example: 'eng.1' },
            country: { type: 'string', example: 'England' },
            kind: { type: 'string', enum: ['club', 'international'] },
            logo: { type: 'string' },
            active: { type: 'boolean' },
            lastSyncedAt: { type: 'string', format: 'date-time', nullable: true },
            coverage: { $ref: '#/components/schemas/Coverage' }
          }
        },
        Coverage: {
          type: 'object',
          required: ['matches', 'clubs', 'dedicatedClubs', 'standingsGroups', 'hasData'],
          properties: {
            matches: { type: 'integer', minimum: 0 },
            clubs: { type: 'integer', minimum: 0, description: 'Best available club count, including match-derived participants' },
            dedicatedClubs: { type: 'integer', minimum: 0, description: 'Full documents stored in soccer_clubs' },
            standingsGroups: { type: 'integer', minimum: 0 },
            hasData: { type: 'boolean' }
          }
        },
        Club: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            displayName: { type: 'string' },
            shortDisplayName: { type: 'string' },
            abbreviation: { type: 'string' },
            country: { type: 'string' },
            city: { type: 'string' },
            logo: { type: 'string' },
            color: { type: 'string' },
            foundedYear: { type: 'integer', nullable: true },
            venue: { type: 'object', nullable: true },
            isActive: { type: 'boolean' },
            catalogSource: { type: 'string', enum: ['club-catalog', 'match-snapshot'] }
          }
        },
        ServiceMeta: {
          type: 'object',
          properties: {
            service: { type: 'object' },
            coverage: {
              type: 'object',
              properties: {
                competitions: { type: 'integer' },
                activeClubCompetitions: { type: 'integer' },
                activeInternationalCompetitions: { type: 'integer' },
                competitionsWithMatches: { type: 'integer' },
                dedicatedClubDocuments: { type: 'integer' },
                matches: { type: 'integer' },
                playByPlayEvents: { type: 'integer' },
                standingsGroups: { type: 'integer' }
              }
            },
            features: { type: 'array', items: { type: 'string' } },
            lastSuccessfulSyncAt: { type: 'string', format: 'date-time', nullable: true },
            generatedAt: { type: 'string', format: 'date-time' }
          }
        },
        MatchStatus: {
          type: 'object',
          properties: {
            clock: { type: 'number' },
            displayClock: { type: 'string' },
            period: { type: 'integer' },
            type: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                state: { type: 'string', enum: ['pre', 'in', 'post', 'unknown'] },
                completed: { type: 'boolean' },
                description: { type: 'string' },
                detail: { type: 'string' },
                shortDetail: { type: 'string' }
              }
            }
          }
        },
        MatchDataAvailability: {
          type: 'object',
          description: 'Storage-backed match features and intentionally unavailable league-wide data',
          properties: {
            timeline: {
              type: 'object',
              properties: {
                available: { type: 'boolean', example: true },
                storedIn: { type: 'string', example: 'soccer_match_events' }
              }
            },
            matchGoals: {
              type: 'object',
              properties: {
                available: { type: 'boolean', example: true },
                storedIn: {
                  type: 'array',
                  items: { type: 'string' },
                  example: ['soccer_match_events', 'soccer_matches.key_events']
                }
              }
            },
            statisticsAndSummary: {
              type: 'object',
              properties: {
                available: { type: 'boolean', example: true },
                storedIn: { type: 'string', example: 'soccer_matches' }
              }
            },
            leagueTopScorers: {
              type: 'object',
              properties: {
                available: { type: 'boolean', example: false },
                reason: { type: 'string' }
              }
            }
          }
        },
        MatchSummary: {
          type: 'object',
          description: 'Stored match summary with score, teams, statistics, key events, and data availability',
          properties: {
            header: { type: 'object' },
            boxscore: { type: 'object' },
            keyEvents: {
              type: 'array',
              description: 'Goals, cards, and other important events; goal items have scoringPlay=true and may include athletesInvolved',
              items: { type: 'object' }
            },
            rosters: { type: 'array', items: { type: 'object' } },
            gameInfo: { type: 'object' },
            commentary: { type: 'array', items: { type: 'object' } },
            meta: {
              type: 'object',
              properties: {
                dataSource: { type: 'string', example: 'database' },
                provider: { type: 'string', example: 'upstream' },
                lastSyncedAt: { type: 'string', format: 'date-time', nullable: true },
                dataAvailability: { $ref: '#/components/schemas/MatchDataAvailability' }
              }
            }
          }
        },
        MatchPlay: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            type: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                text: { type: 'string', example: 'Goal' },
                type: { type: 'string', example: 'goal' }
              }
            },
            text: { type: 'string' },
            period: { type: 'object' },
            clock: { type: 'object' },
            scoringPlay: { type: 'boolean' },
            scoreValue: { type: 'number' },
            redCard: { type: 'boolean' },
            yellowCard: { type: 'boolean' },
            penaltyKick: { type: 'boolean' },
            ownGoal: { type: 'boolean' },
            substitution: { type: 'boolean' },
            team: { type: 'object', nullable: true },
            athletesInvolved: { type: 'array', items: { type: 'object' } },
            participants: {
              type: 'array',
              description: 'Players involved in an event; substitution events normally contain the incoming and outgoing players',
              items: { type: 'object' }
            }
          }
        }
      },
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key',
          description: 'Norra AI Master API key or commercial client key'
        },
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Account or Admin JWT Bearer token'
        }
      }
    },
    paths: {
      '/api/v1/football/live': {
        get: {
          tags: ['Commercial Football API'],
          summary: 'Get all live football matches',
          security: [{ ApiKeyAuth: [] }],
          parameters: [
            { name: 'league', in: 'query', schema: { type: 'string' }, description: 'Optional league slug filter (e.g. eng.1)' }
          ],
          responses: { '200': { description: 'Live matches snapshot' }, '429': { description: 'Tier rate limit exceeded' } }
        }
      },
      '/api/v1/football/live/stream': {
        get: {
          tags: ['Commercial Football API'],
          summary: 'Server-Sent Events (SSE) real-time live score & FT delta stream',
          security: [{ ApiKeyAuth: [] }],
          responses: { '200': { description: 'text/event-stream live delta feed' }, '503': { description: 'Stream capacity reached' } }
        }
      },
      '/api/v1/football/fixtures': {
        get: {
          tags: ['Commercial Football API'],
          summary: 'Query multi-league fixtures by date, league, team, or status',
          security: [{ ApiKeyAuth: [] }],
          parameters: [
            { name: 'date', in: 'query', schema: { type: 'string' }, description: 'YYYY-MM-DD or today/yesterday/tomorrow' },
            { name: 'league', in: 'query', schema: { type: 'string' } },
            { name: 'status', in: 'query', schema: { type: 'string', enum: ['all', 'live', 'upcoming', 'finished'] } }
          ],
          responses: { '200': { description: 'Fixtures board' } }
        }
      },
      '/api/v1/football/standings': {
        get: {
          tags: ['Commercial Football API'],
          summary: 'Get competition league table and standings',
          security: [{ ApiKeyAuth: [] }],
          parameters: [
            { name: 'league', in: 'query', required: true, schema: { type: 'string' } }
          ],
          responses: { '200': { description: 'Standings groups' } }
        }
      },
      '/api/v1/football/match/{eventId}/predictions-context': {
        get: {
          tags: ['Commercial Football API'],
          summary: 'Get H2H, recent form, table context, and Norra AI Poisson predictions',
          security: [{ ApiKeyAuth: [] }],
          parameters: [
            { name: 'eventId', in: 'path', required: true, schema: { type: 'string' } }
          ],
          responses: { '200': { description: 'Predictions and H2H analytics context' } }
        }
      },
      '/api/v1/booking/convert': {
        post: {
          tags: ['Booking Code Converter'],
          summary: 'Convert a bookmaker booking code across supported providers',
          security: [{ ApiKeyAuth: [] }],
          responses: { '200': { description: 'Converted booking selections and code' } }
        }
      },
      '/api/payments/flutterwave/webhook': {
        post: {
          tags: ['Payments'],
          summary: 'Signed Flutterwave server-to-server webhook receiver (verif-hash)',
          responses: { '200': { description: 'Webhook acknowledged' }, '401': { description: 'Invalid signature' } }
        }
      },
      '/api/account/forgot-password': {
        post: {
          tags: ['Account'],
          summary: 'Request a time-limited password reset email',
          responses: { '200': { description: 'Generic non-enumerating confirmation' } }
        }
      },
      '/api/account/reset-password': {
        post: {
          tags: ['Account'],
          summary: 'Complete password reset using emailed token',
          responses: { '200': { description: 'Password updated' }, '400': { description: 'Invalid or expired token' } }
        }
      },
      '/api/account/favorites': {
        get: {
          tags: ['Account'],
          summary: 'Get cross-device synced favorite teams, leagues, and matches',
          security: [{ BearerAuth: [] }],
          responses: { '200': { description: 'User favorites lists' } }
        },
        put: {
          tags: ['Account'],
          summary: 'Update cross-device synced favorite teams, leagues, and matches',
          security: [{ BearerAuth: [] }],
          responses: { '200': { description: 'Updated favorites lists' } }
        }
      }
    }
  },
  apis: [
    './controllers/footballApiController.js',
    './controllers/soccerController.js',
    './controllers/healthController.js'
  ]
};

const specs = swaggerJsdoc(options);

module.exports = { swaggerUi, specs };
