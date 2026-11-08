/**
 * Norra AI Soccer Live Telemetry & Scoreboard Synchronization Service
 * 
 * Ingests multi-date match schedules, real-time scores, standings,
 * club rosters and crests across the top 7 world leagues into MongoDB Atlas.
 */

const https = require('https');
const zlib = require('zlib');
const mongoose = require('mongoose');
const SoccerLeague = require('../models/soccerLeague');
const SoccerClub = require('../models/soccerClub');
const SoccerMatch = require('../models/soccerMatch');
const SoccerMatchEvent = require('../models/soccerMatchEvent');
const SoccerStanding = require('../models/soccerStanding');
const SoccerSyncState = require('../models/soccerSyncState');
const { synthesizeMatchTelemetry } = require('./soccerSerializer');

const TARGET_LEAGUES = [
    { slug: 'eng.1', name: 'English Premier League', abbreviation: 'Premier League', country: 'England', kind: 'club', sort_order: 1, logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/23.png' },
    { slug: 'esp.1', name: 'Spanish La Liga', abbreviation: 'La Liga', country: 'Spain', kind: 'club', sort_order: 2, logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/15.png' },
    { slug: 'uefa.champions', name: 'UEFA Champions League', abbreviation: 'Champions League', country: 'International', kind: 'club', sort_order: 3, logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/2.png' },
    { slug: 'ita.1', name: 'Italian Serie A', abbreviation: 'Serie A', country: 'Italy', kind: 'club', sort_order: 4, logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/12.png' },
    { slug: 'ger.1', name: 'German Bundesliga', abbreviation: 'Bundesliga', country: 'Germany', kind: 'club', sort_order: 5, logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/10.png' },
    { slug: 'fra.1', name: 'French Ligue 1', abbreviation: 'Ligue 1', country: 'France', kind: 'club', sort_order: 6, logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/9.png' },
    { slug: 'uefa.europa', name: 'UEFA Europa League', abbreviation: 'Europa League', country: 'International', kind: 'club', sort_order: 7, logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/2054.png' },
    { slug: 'uefa.europa.conf', name: 'UEFA Conference League', abbreviation: 'Conference League', country: 'International', kind: 'club', sort_order: 8, logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/20420.png' },
    { slug: 'ned.1', name: 'Dutch Eredivisie', abbreviation: 'Eredivisie', country: 'Netherlands', kind: 'club', sort_order: 9, logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/11.png' },
    { slug: 'por.1', name: 'Portuguese Primeira Liga', abbreviation: 'Primeira Liga', country: 'Portugal', kind: 'club', sort_order: 10, logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/14.png' },
    { slug: 'eng.2', name: 'EFL Championship', abbreviation: 'Championship', country: 'England', kind: 'club', sort_order: 11, logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/24.png' },
    { slug: 'esp.2', name: 'Spanish Segunda División', abbreviation: 'La Liga 2', country: 'Spain', kind: 'club', sort_order: 12, logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/16.png' },
    { slug: 'ita.2', name: 'Italian Serie B', abbreviation: 'Serie B', country: 'Italy', kind: 'club', sort_order: 13, logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/13.png' },
    { slug: 'ger.2', name: 'German 2. Bundesliga', abbreviation: '2. Bundesliga', country: 'Germany', kind: 'club', sort_order: 14, logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/255.png' },
    { slug: 'fra.2', name: 'French Ligue 2', abbreviation: 'Ligue 2', country: 'France', kind: 'club', sort_order: 15, logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/17.png' },
    { slug: 'bel.1', name: 'Belgian Pro League', abbreviation: 'Pro League', country: 'Belgium', kind: 'club', sort_order: 16, logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/62.png' },
    { slug: 'tur.1', name: 'Turkish Süper Lig', abbreviation: 'Süper Lig', country: 'Turkey', kind: 'club', sort_order: 17, logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/18.png' },
    { slug: 'sco.1', name: 'Scottish Premiership', abbreviation: 'Premiership', country: 'Scotland', kind: 'club', sort_order: 18, logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/45.png' },
    { slug: 'usa.1', name: 'Major League Soccer', abbreviation: 'MLS', country: 'United States', kind: 'club', sort_order: 19, logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/19.png' },
    { slug: 'ksa.1', name: 'Saudi Pro League', abbreviation: 'Saudi League', country: 'Saudi Arabia', kind: 'club', sort_order: 20, logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/2157.png' },
    { slug: 'bra.1', name: 'Brasileirão Série A', abbreviation: 'Brasileirão', country: 'Brazil', kind: 'club', sort_order: 21, logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/85.png' },
    { slug: 'arg.1', name: 'Argentine Primera División', abbreviation: 'Liga Profesional', country: 'Argentina', kind: 'club', sort_order: 22, logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/1.png' },
    { slug: 'mex.1', name: 'Liga MX', abbreviation: 'Liga MX', country: 'Mexico', kind: 'club', sort_order: 23, logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/22.png' },
    { slug: 'conmebol.libertadores', name: 'Copa Libertadores', abbreviation: 'Libertadores', country: 'South America', kind: 'club', sort_order: 24, logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/2056.png' },
    { slug: 'conmebol.sudamericana', name: 'Copa Sudamericana', abbreviation: 'Sudamericana', country: 'South America', kind: 'club', sort_order: 25, logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/2057.png' },
    { slug: 'uefa.nations', name: 'UEFA Nations League', abbreviation: 'Nations League', country: 'International', kind: 'international', sort_order: 26, logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/2059.png' },
    { slug: 'eng.fa', name: 'English FA Cup', abbreviation: 'FA Cup', country: 'England', kind: 'club', sort_order: 27, logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/21.png' },
    { slug: 'eng.league_cup', name: 'English Carabao Cup', abbreviation: 'EFL Cup', country: 'England', kind: 'club', sort_order: 28, logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/22.png' },
    { slug: 'esp.copa_del_rey', name: 'Copa del Rey', abbreviation: 'Copa del Rey', country: 'Spain', kind: 'club', sort_order: 29, logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/80.png' },
    { slug: 'ita.coppa_italia', name: 'Coppa Italia', abbreviation: 'Coppa Italia', country: 'Italy', kind: 'club', sort_order: 30, logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/2064.png' },
    { slug: 'ger.dfb_pokal', name: 'German Cup', abbreviation: 'DFB-Pokal', country: 'Germany', kind: 'club', sort_order: 31, logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/2063.png' },
    { slug: 'fra.coupe_de_france', name: 'Coupe de France', abbreviation: 'Coupe de France', country: 'France', kind: 'club', sort_order: 32, logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/275.png' },
    { slug: 'aut.1', name: 'Austrian Bundesliga', abbreviation: 'Austrian Bundesliga', country: 'Austria', kind: 'club', sort_order: 33 },
    { slug: 'sui.1', name: 'Swiss Super League', abbreviation: 'Swiss Super League', country: 'Switzerland', kind: 'club', sort_order: 34 },
    { slug: 'den.1', name: 'Danish Superliga', abbreviation: 'Superliga', country: 'Denmark', kind: 'club', sort_order: 35 },
    { slug: 'gre.1', name: 'Super League Greece', abbreviation: 'Super League', country: 'Greece', kind: 'club', sort_order: 36 },
    { slug: 'swe.1', name: 'Swedish Allsvenskan', abbreviation: 'Allsvenskan', country: 'Sweden', kind: 'club', sort_order: 37 },
    { slug: 'nor.1', name: 'Norwegian Eliteserien', abbreviation: 'Eliteserien', country: 'Norway', kind: 'club', sort_order: 38 },
    { slug: 'jpn.1', name: 'Japanese J1 League', abbreviation: 'J1 League', country: 'Japan', kind: 'club', sort_order: 39 },
    { slug: 'aus.1', name: 'Australian A-League', abbreviation: 'A-League', country: 'Australia', kind: 'club', sort_order: 40 },
    { slug: 'kor.1', name: 'South Korean K League 1', abbreviation: 'K League 1', country: 'South Korea', kind: 'club', sort_order: 41 },
    { slug: 'kor.2', name: 'South Korean K League 2', abbreviation: 'K League 2', country: 'South Korea', kind: 'club', sort_order: 42 },
    { slug: 'kor.cup', name: 'Korean FA Cup', abbreviation: 'Korea Cup', country: 'South Korea', kind: 'cup', sort_order: 43 },
    { slug: 'chn.1', name: 'Chinese Super League', abbreviation: 'CSL', country: 'China', kind: 'club', sort_order: 44 },
    { slug: 'chn.2', name: 'China League One', abbreviation: 'China L1', country: 'China', kind: 'club', sort_order: 45 },
    { slug: 'chn.cup', name: 'Chinese FA Cup', abbreviation: 'Chinese FA Cup', country: 'China', kind: 'cup', sort_order: 46 },
    { slug: 'eng.trophy', name: 'EFL Trophy', abbreviation: 'EFL Trophy', country: 'England', kind: 'cup', sort_order: 47 },
    { slug: 'fin.1', name: 'Finnish Veikkausliiga', abbreviation: 'Veikkausliiga', country: 'Finland', kind: 'club', sort_order: 48 },
    { slug: 'concacaf.champions', name: 'CONCACAF Champions Cup', abbreviation: 'Champions Cup', country: 'International', kind: 'club', sort_order: 43 },
    { slug: 'caf.champions', name: 'CAF Champions League', abbreviation: 'CAF Champions', country: 'International', kind: 'club', sort_order: 44 },
    { slug: 'afc.champions', name: 'AFC Champions League Elite', abbreviation: 'AFC Champions', country: 'International', kind: 'club', sort_order: 45 },
    { slug: 'fifa.cwc', name: 'FIFA Club World Cup', abbreviation: 'Club World Cup', country: 'International', kind: 'club', sort_order: 46 },
    { slug: 'uefa.super_cup', name: 'UEFA Super Cup', abbreviation: 'Super Cup', country: 'International', kind: 'club', sort_order: 47 },
    { slug: 'conmebol.recopa', name: 'CONMEBOL Recopa', abbreviation: 'Recopa', country: 'International', kind: 'club', sort_order: 48 },
    { slug: 'eng.w.1', name: 'Women\'s Super League', abbreviation: 'WSL', country: 'England', kind: 'club', sort_order: 49 },
    { slug: 'usa.w.1', name: 'National Women\'s Soccer League', abbreviation: 'NWSL', country: 'United States', kind: 'club', sort_order: 50 },
    { slug: 'usa.usl.1', name: 'USL Championship', abbreviation: 'USL Championship', country: 'United States', kind: 'club', sort_order: 51 },
    { slug: 'usa.open', name: 'U.S. Open Cup', abbreviation: 'US Open Cup', country: 'United States', kind: 'cup', sort_order: 52 },
    { slug: 'caf.confed', name: 'CAF Confederation Cup', abbreviation: 'CAF Confed Cup', country: 'International', kind: 'club', sort_order: 53 },
    { slug: 'caf.nations', name: 'Africa Cup of Nations', abbreviation: 'AFCON', country: 'International', kind: 'international', sort_order: 54 },
    { slug: 'rsa.1', name: 'South African Premiership', abbreviation: 'PSL', country: 'South Africa', kind: 'club', sort_order: 55 },
    { slug: 'egy.1', name: 'Egyptian Premier League', abbreviation: 'Egyptian PL', country: 'Egypt', kind: 'club', sort_order: 56 },
    { slug: 'mar.1', name: 'Moroccan Botola Pro', abbreviation: 'Botola Pro', country: 'Morocco', kind: 'club', sort_order: 57 },
    { slug: 'nga.1', name: 'Nigeria Premier Football League', abbreviation: 'NPFL', country: 'Nigeria', kind: 'club', sort_order: 58 },
    { slug: 'eng.3', name: 'EFL League One', abbreviation: 'League One', country: 'England', kind: 'club', sort_order: 59 },
    { slug: 'eng.4', name: 'EFL League Two', abbreviation: 'League Two', country: 'England', kind: 'club', sort_order: 60 },
    { slug: 'col.1', name: 'Colombian Primera A', abbreviation: 'Liga BetPlay', country: 'Colombia', kind: 'club', sort_order: 61 },
    { slug: 'mex.2', name: 'Liga de Expansión MX', abbreviation: 'Expansión MX', country: 'Mexico', kind: 'club', sort_order: 62 },
    { slug: 'bra.2', name: 'Brasileirão Série B', abbreviation: 'Série B', country: 'Brazil', kind: 'club', sort_order: 63 },
    { slug: 'arg.copa', name: 'Copa Argentina', abbreviation: 'Copa Argentina', country: 'Argentina', kind: 'cup', sort_order: 64 },
    { slug: 'bol.copa', name: 'Copa Bolivia', abbreviation: 'Copa Bolivia', country: 'Bolivia', kind: 'cup', sort_order: 65 },
    { slug: 'uefa.youth', name: 'UEFA Youth League', abbreviation: 'Youth League', country: 'Europe', kind: 'club', sort_order: 66 },
    { slug: 'fifa.u20', name: 'FIFA U-20 World Cup', abbreviation: 'U20 World Cup', country: 'International', kind: 'international', sort_order: 67 },
    { slug: 'fifa.u17', name: 'FIFA U-17 World Cup', abbreviation: 'U17 World Cup', country: 'International', kind: 'international', sort_order: 68 },
    { slug: 'conmebol.u20', name: 'U-20 Copa Libertadores', abbreviation: 'Libertadores U20', country: 'South America', kind: 'club', sort_order: 69 },
    { slug: 'club.friendly', name: 'Club Friendlies', abbreviation: 'Friendlies', country: 'International', kind: 'club', sort_order: 70 },
    { slug: 'idn.1', name: 'Indonesian Super League', abbreviation: 'Liga 1', country: 'Indonesia', kind: 'club', sort_order: 68 },
    { slug: 'tha.1', name: 'Thai League 1', abbreviation: 'Thai League 1', country: 'Thailand', kind: 'club', sort_order: 69 },
    { slug: 'mys.1', name: 'Malaysian Super League', abbreviation: 'Super League', country: 'Malaysia', kind: 'club', sort_order: 70 },
    { slug: 'sgp.1', name: 'Singapore Premier League', abbreviation: 'SPL', country: 'Singapore', kind: 'club', sort_order: 71 },
    { slug: 'ken.1', name: 'Kenyan Premier League', abbreviation: 'FKF Premier', country: 'Kenya', kind: 'club', sort_order: 72 },
    { slug: 'gha.1', name: 'Ghana Premier League', abbreviation: 'Ghana Premier', country: 'Ghana', kind: 'club', sort_order: 73 },
    { slug: 'uga.1', name: 'Uganda Premier League', abbreviation: 'Uganda Premier', country: 'Uganda', kind: 'club', sort_order: 74 },
    { slug: 'ind.1', name: 'Indian Super League', abbreviation: 'ISL', country: 'India', kind: 'club', sort_order: 75 },
    { slug: 'ind.2', name: 'Indian I-League', abbreviation: 'I-League', country: 'India', kind: 'club', sort_order: 76 },
    { slug: 'afc.cup', name: 'AFC Champions League Two', abbreviation: 'ACL Two', country: 'International', kind: 'club', sort_order: 77 },
    { slug: 'per.1', name: 'Peruvian Liga 1', abbreviation: 'Liga 1 Peru', country: 'Peru', kind: 'club', sort_order: 78 },
    { slug: 'bol.1', name: 'Bolivian Liga Profesional', abbreviation: 'Liga Bolivia', country: 'Bolivia', kind: 'club', sort_order: 79 },
    { slug: 'ecu.1', name: 'LigaPro Ecuador', abbreviation: 'LigaPro', country: 'Ecuador', kind: 'club', sort_order: 80 },
    { slug: 'par.1', name: 'Paraguayan Primera División', abbreviation: 'División de Honor', country: 'Paraguay', kind: 'club', sort_order: 81 },
    { slug: 'ven.1', name: 'Venezuelan Primera División', abbreviation: 'Liga FUTVE', country: 'Venezuela', kind: 'club', sort_order: 82 },
    { slug: 'uru.1', name: 'Liga AUF Uruguaya', abbreviation: 'Primera Uruguay', country: 'Uruguay', kind: 'club', sort_order: 83 },
    { slug: 'crc.1', name: 'Costa Rican Primera División', abbreviation: 'Primera Costa Rica', country: 'Costa Rica', kind: 'club', sort_order: 84 },
    { slug: 'hon.1', name: 'Honduran Liga Nacional', abbreviation: 'Liga Betcris', country: 'Honduras', kind: 'club', sort_order: 85 },
    { slug: 'gua.1', name: 'Guatemalan Liga Nacional', abbreviation: 'Liga Mayor', country: 'Guatemala', kind: 'club', sort_order: 86 },
    { slug: 'vie.1', name: 'Vietnamese V.League 1', abbreviation: 'V.League 1', country: 'Vietnam', kind: 'club', sort_order: 87 },
    { slug: 'irn.1', name: 'Persian Gulf Pro League', abbreviation: 'Pro League', country: 'Iran', kind: 'club', sort_order: 88 },
    { slug: 'uae.1', name: 'UAE President\'s Cup', abbreviation: 'President\'s Cup', country: 'United Arab Emirates', kind: 'cup', sort_order: 89 },
    { slug: 'uzb.1', name: 'Uzbekistan Super League', abbreviation: 'Superliga', country: 'Uzbekistan', kind: 'club', sort_order: 90 },
    { slug: 'rou.2', name: 'Romanian Liga II', abbreviation: 'Liga II', country: 'Romania', kind: 'club', sort_order: 91 },
    { slug: 'mne.1', name: 'Montenegrin First League', abbreviation: '1. CFL', country: 'Montenegro', kind: 'club', sort_order: 92 },
    { slug: 'qat.1', name: 'Qatar Stars League', abbreviation: 'Stars League', country: 'Qatar', kind: 'club', sort_order: 93 },
    { slug: 'irq.1', name: 'Iraq Stars League', abbreviation: 'Stars League', country: 'Iraq', kind: 'club', sort_order: 94 },
    { slug: 'jor.1', name: 'Jordanian Pro League', abbreviation: 'Pro League', country: 'Jordan', kind: 'club', sort_order: 95 },
    { slug: 'bhr.1', name: 'Bahraini Premier League', abbreviation: 'Premier League', country: 'Bahrain', kind: 'club', sort_order: 96 },
    { slug: 'isl.1', name: 'Icelandic Besta deild', abbreviation: 'Besta deild', country: 'Iceland', kind: 'club', sort_order: 97 },
    { slug: 'esp.w.1', name: 'Liga F', abbreviation: 'Liga F', country: 'Spain', kind: 'club', sort_order: 98 },
    { slug: 'ger.w.1', name: 'Frauen-Bundesliga', abbreviation: 'Frauen-BL', country: 'Germany', kind: 'club', sort_order: 99 },
    { slug: 'fra.w.1', name: 'Première Ligue', abbreviation: 'D1 Arkema', country: 'France', kind: 'club', sort_order: 100 },
    { slug: 'ita.w.1', name: 'Serie A Femminile', abbreviation: 'Serie A Fem', country: 'Italy', kind: 'club', sort_order: 101 },
    { slug: 'uefa.w.champions', name: 'UEFA Women\'s Champions League', abbreviation: 'UWCL', country: 'International', kind: 'club', sort_order: 102 },
    { slug: 'eng.w.cup', name: 'WSL Players Cup', abbreviation: 'WSL Cup', country: 'England', kind: 'cup', sort_order: 103 },
    { slug: 'eng.w.fa', name: 'Women\'s FA Cup', abbreviation: 'Women\'s FA Cup', country: 'England', kind: 'cup', sort_order: 104 },
    { slug: 'aus.w.1', name: 'A-League Women', abbreviation: 'A-League W', country: 'Australia', kind: 'club', sort_order: 105 },
    { slug: 'mex.w.1', name: 'Liga MX Femenil', abbreviation: 'Liga MX Fem', country: 'Mexico', kind: 'club', sort_order: 106 },
    { slug: 'sui.w.1', name: 'Swiss Women\'s Super League', abbreviation: 'Swiss WSL', country: 'Switzerland', kind: 'club', sort_order: 107 },
    { slug: 'bel.w.1', name: 'Belgian Super League Women', abbreviation: 'Super League W', country: 'Belgium', kind: 'club', sort_order: 108 },
    { slug: 'sco.w.1', name: 'Scottish Women\'s Premier League', abbreviation: 'SWPL', country: 'Scotland', kind: 'club', sort_order: 109 },
    { slug: 'bra.w.1', name: 'Brasileirão Feminino', abbreviation: 'Brasileirão Fem', country: 'Brazil', kind: 'club', sort_order: 110 },
    { slug: 'w.international', name: 'Women\'s International Football', abbreviation: 'Women Intl', country: 'International', kind: 'international', sort_order: 111 },
    { slug: 'eng.u21', name: 'Premier League 2', abbreviation: 'PL2 / U21', country: 'England', kind: 'club', sort_order: 112 },
    { slug: 'eng.5', name: 'National League', abbreviation: 'National League', country: 'England', kind: 'club', sort_order: 104 },
    { slug: 'eng.northern', name: 'Northern Premier League', abbreviation: 'Northern PL', country: 'England', kind: 'club', sort_order: 105 },
    { slug: 'eng.southern', name: 'Southern Premier League', abbreviation: 'Southern PL', country: 'England', kind: 'club', sort_order: 106 },
    { slug: 'eng.isthmian', name: 'Isthmian Premier League', abbreviation: 'Isthmian PL', country: 'England', kind: 'club', sort_order: 107 },
    { slug: 'can.1', name: 'Canadian Premier League', abbreviation: 'CPL', country: 'Canada', kind: 'club', sort_order: 108 },
    { slug: 'kwt.1', name: 'Kuwait Premier League', abbreviation: 'Kuwait PL', country: 'Kuwait', kind: 'club', sort_order: 109 },
    { slug: 'rus.1', name: 'Russian Premier League', abbreviation: 'Russian PL', country: 'Russia', kind: 'club', sort_order: 110 },
    { slug: 'ukr.1', name: 'Ukrainian Premier League', abbreviation: 'Ukrainian PL', country: 'Ukraine', kind: 'club', sort_order: 111 },
    { slug: 'nzl.1', name: 'New Zealand National League', abbreviation: 'NZ National', country: 'New Zealand', kind: 'club', sort_order: 112 },
    { slug: 'tza.1', name: 'Tanzanian Premier League', abbreviation: 'NBC Premier League', country: 'Tanzania', kind: 'club', sort_order: 113 },
    { slug: 'zmb.1', name: 'Zambian Super League', abbreviation: 'Zambia SL', country: 'Zambia', kind: 'club', sort_order: 114 },
    { slug: 'zwe.1', name: 'Zimbabwe Premier Soccer League', abbreviation: 'Zimbabwe PSL', country: 'Zimbabwe', kind: 'club', sort_order: 115 },
    { slug: 'eth.1', name: 'Ethiopian Premier League', abbreviation: 'Ethiopian PL', country: 'Ethiopia', kind: 'club', sort_order: 116 },
    { slug: 'rwa.1', name: 'Rwanda Premier League', abbreviation: 'Rwanda PL', country: 'Rwanda', kind: 'club', sort_order: 117 },
    { slug: 'cod.1', name: 'DR Congo Linafoot', abbreviation: 'Linafoot', country: 'DR Congo', kind: 'club', sort_order: 118 },
    { slug: 'cmr.1', name: 'Cameroon Elite One', abbreviation: 'Elite One', country: 'Cameroon', kind: 'club', sort_order: 119 },
    { slug: 'civ.1', name: 'Ivory Coast Ligue 1', abbreviation: 'Ligue 1 CIV', country: 'Ivory Coast', kind: 'club', sort_order: 120 },
    { slug: 'dza.1', name: 'Algerian Ligue 1', abbreviation: 'Ligue 1 Algeria', country: 'Algeria', kind: 'club', sort_order: 121 },
    { slug: 'tun.1', name: 'Tunisian Ligue Professionnelle 1', abbreviation: 'Ligue 1 Tunisia', country: 'Tunisia', kind: 'club', sort_order: 122 },
    { slug: 'sdn.1', name: 'Sudan Premier League', abbreviation: 'Sudan PL', country: 'Sudan', kind: 'club', sort_order: 123 },
    { slug: 'ago.1', name: 'Angola Girabola', abbreviation: 'Girabola', country: 'Angola', kind: 'club', sort_order: 124 },
    { slug: 'bwa.1', name: 'Botswana Premier League', abbreviation: 'Botswana PL', country: 'Botswana', kind: 'club', sort_order: 125 },
    { slug: 'mwi.1', name: 'Malawi Super League', abbreviation: 'Malawi SL', country: 'Malawi', kind: 'club', sort_order: 126 },
    { slug: 'jam.1', name: 'Jamaica Premier League', abbreviation: 'Jamaica PL', country: 'Jamaica', kind: 'club', sort_order: 127 },
    { slug: 'lby.1', name: 'Libyan Premier League', abbreviation: 'Libya PL', country: 'Libya', kind: 'club', sort_order: 128 },
    { slug: 'isr.1', name: 'Israeli Premier League', abbreviation: 'Israeli PL', country: 'Israel', kind: 'club', sort_order: 129 },
    { slug: 'aze.1', name: 'Azerbaijan Premier League', abbreviation: 'Azerbaijan PL', country: 'Azerbaijan', kind: 'club', sort_order: 130 },
    { slug: 'blr.1', name: 'Belarusian Premier League', abbreviation: 'Belarus PL', country: 'Belarus', kind: 'club', sort_order: 131 },
    { slug: 'arm.1', name: 'Armenian Premier League', abbreviation: 'Armenia PL', country: 'Armenia', kind: 'club', sort_order: 132 },
    { slug: 'bih.1', name: 'Bosnian Premier League', abbreviation: 'Premijer Liga BiH', country: 'Bosnia and Herzegovina', kind: 'club', sort_order: 133 },
    { slug: 'nir.1', name: 'NIFL Premiership', abbreviation: 'NIFL Premiership', country: 'Northern Ireland', kind: 'club', sort_order: 134 },
    { slug: 'wal.1', name: 'Cymru Premier', abbreviation: 'Cymru Premier', country: 'Wales', kind: 'club', sort_order: 135 },
    { slug: 'irl.1', name: 'League of Ireland Premier Division', abbreviation: 'LOI Premier', country: 'Ireland', kind: 'club', sort_order: 136 },
    { slug: 'hkg.1', name: 'Hong Kong Premier League', abbreviation: 'HKPL', country: 'Hong Kong', kind: 'club', sort_order: 137 },
    { slug: 'bgd.1', name: 'Bangladesh Premier League', abbreviation: 'BPL', country: 'Bangladesh', kind: 'club', sort_order: 138 },
    { slug: 'mlt.1', name: 'Maltese Premier League', abbreviation: 'Malta PL', country: 'Malta', kind: 'club', sort_order: 139 },
    { slug: 'kaz.1', name: 'Kazakhstan Premier League', abbreviation: 'KPL', country: 'Kazakhstan', kind: 'club', sort_order: 140 },
    { slug: 'por.2', name: 'Liga Portugal 2', abbreviation: 'Liga 2', country: 'Portugal', kind: 'club', sort_order: 141 },
    { slug: 'ecu.2', name: 'LigaPro Serie B', abbreviation: 'Serie B', country: 'Ecuador', kind: 'club', sort_order: 142 },
    { slug: 'ben.1', name: 'Benin Ligue 1', abbreviation: 'Benin L1', country: 'Benin', kind: 'club', sort_order: 143 },
    { slug: 'bfa.1', name: 'Burkina Faso Premier League', abbreviation: 'Burkina PL', country: 'Burkina Faso', kind: 'club', sort_order: 144 },
    { slug: 'sen.1', name: 'Senegal Ligue 1', abbreviation: 'Senegal L1', country: 'Senegal', kind: 'club', sort_order: 145 },
    { slug: 'mli.1', name: 'Mali Première Division', abbreviation: 'Mali L1', country: 'Mali', kind: 'club', sort_order: 146 },
    { slug: 'gin.1', name: 'Guinea Ligue 1', abbreviation: 'Guinea L1', country: 'Guinea', kind: 'club', sort_order: 147 },
    { slug: 'twn.1', name: 'Taiwan Football Premier League', abbreviation: 'Taiwan PL', country: 'Taiwan', kind: 'club', sort_order: 148 },
    { slug: 'mda.1', name: 'Moldovan Super Liga', abbreviation: 'Super Liga', country: 'Moldova', kind: 'club', sort_order: 149 }
];

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: {
                'User-Agent': 'NorraScores/2.1',
                'Accept-Encoding': 'gzip, deflate'
            }
        }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetchJson(res.headers.location).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
            }

            const encoding = res.headers['content-encoding'];
            let stream = res;
            if (encoding === 'gzip') {
                stream = res.pipe(zlib.createGunzip());
            } else if (encoding === 'deflate') {
                stream = res.pipe(zlib.createInflate());
            }

            let data = '';
            stream.on('data', chunk => data += chunk);
            stream.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
            stream.on('error', reject);
        });
        req.on('error', reject);
        req.setTimeout(14000, () => {
            req.destroy(new Error(`Timeout fetching ${url}`));
        });
    });
}

function formatDateToScoreboard(date = new Date()) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}${m}${d}`;
}

async function processEvents(events, slug, leagueDef, season, now) {
    let count = 0;
    if (!Array.isArray(events) || !events.length) return count;

    for (const ev of events) {
        const comp = ev.competitions?.[0];
        if (!comp) continue;

        const competitors = comp.competitors || [];
        const homeComp = competitors.find(c => c.homeAway === 'home') || competitors[0];
        const awayComp = competitors.find(c => c.homeAway === 'away') || competitors[1];

        if (!homeComp || !awayComp) continue;

        const homeTeam = homeComp.team || {};
        const awayTeam = awayComp.team || {};

        // Club Profiles Upsert
        if (homeTeam.id) {
            await SoccerClub.updateOne(
                { 'source.provider': 'upstream', 'source.club_id': String(homeTeam.id) },
                {
                    $set: {
                        slug: String(homeTeam.name || homeTeam.displayName || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                        name: homeTeam.name || homeTeam.displayName || 'Home Club',
                        display_name: homeTeam.displayName || homeTeam.name || 'Home Club',
                        short_display_name: homeTeam.shortDisplayName || homeTeam.abbreviation || '',
                        abbreviation: homeTeam.abbreviation || '',
                        country: leagueDef.country,
                        logo: homeTeam.logo || '',
                        color: homeTeam.color || '',
                        alternate_color: homeTeam.alternateColor || '',
                        active: true,
                        last_synced_at: now
                    },
                    $addToSet: { league_slugs: slug },
                    $setOnInsert: { created_at: now }
                },
                { upsert: true }
            );
        }

        if (awayTeam.id) {
            await SoccerClub.updateOne(
                { 'source.provider': 'upstream', 'source.club_id': String(awayTeam.id) },
                {
                    $set: {
                        slug: String(awayTeam.name || awayTeam.displayName || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                        name: awayTeam.name || awayTeam.displayName || 'Away Club',
                        display_name: awayTeam.displayName || awayTeam.name || 'Away Club',
                        short_display_name: awayTeam.shortDisplayName || awayTeam.abbreviation || '',
                        abbreviation: awayTeam.abbreviation || '',
                        country: leagueDef.country,
                        logo: awayTeam.logo || '',
                        color: awayTeam.color || '',
                        alternate_color: awayTeam.alternateColor || '',
                        active: true,
                        last_synced_at: now
                    },
                    $addToSet: { league_slugs: slug },
                    $setOnInsert: { created_at: now }
                },
                { upsert: true }
            );
        }

        const matchDate = new Date(ev.date || comp.date || now);
        const scoreboardDate = formatDateToScoreboard(matchDate);
        const statusType = ev.status?.type || {};
        const state = ['pre', 'in', 'post'].includes(statusType.state) ? statusType.state : 'pre';

        const homeScore = parseInt(homeComp.score, 10);
        const awayScore = parseInt(awayComp.score, 10);

        const matchDoc = {
            source: {
                provider: 'upstream',
                event_id: String(ev.id),
                competition_id: String(comp.id || ev.id),
                uid: ev.uid || comp.uid || '',
                modified_at: now
            },
            league_slug: slug,
            scoreboard_date: scoreboardDate,
            date: matchDate,
            name: ev.name || `${homeTeam.displayName || 'Home'} vs ${awayTeam.displayName || 'Away'}`,
            short_name: ev.shortName || `${homeTeam.abbreviation || 'HOM'} vs ${awayTeam.abbreviation || 'AWY'}`,
            season: {
                year: season.year || 2026,
                type_id: String(season.type?.id || '1'),
                slug: 'regular-season',
                name: season.displayName || `${leagueDef.name} ${season.year || 2026}`
            },
            status: {
                state,
                name: statusType.name || (state === 'in' ? 'STATUS_IN_PROGRESS' : state === 'post' ? 'STATUS_FINAL' : 'STATUS_SCHEDULED'),
                description: statusType.description || (state === 'in' ? 'In Progress' : state === 'post' ? 'Full Time' : 'Scheduled'),
                detail: statusType.detail || ev.status?.displayClock || (state === 'in' ? "45'" : state === 'post' ? 'FT' : 'Scheduled'),
                short_detail: statusType.shortDetail || (state === 'in' ? "45'" : state === 'post' ? 'FT' : 'Scheduled'),
                clock: ev.status?.displayClock || '',
                clock_seconds: ev.status?.clock || 0,
                period: ev.status?.period || 1,
                completed: statusType.completed || state === 'post',
                suspended: false
            },
            home: {
                source_id: String(homeTeam.id || '1'),
                name: homeTeam.name || homeTeam.displayName || 'Home Club',
                display_name: homeTeam.displayName || homeTeam.name || 'Home Club',
                abbreviation: homeTeam.abbreviation || '',
                logo: homeTeam.logo || '',
                score: isNaN(homeScore) ? 0 : homeScore,
                winner: homeComp.winner === true,
                form: homeComp.form || ''
            },
            away: {
                source_id: String(awayTeam.id || '2'),
                name: awayTeam.name || awayTeam.displayName || 'Away Club',
                display_name: awayTeam.displayName || awayTeam.name || 'Away Club',
                abbreviation: awayTeam.abbreviation || '',
                logo: awayTeam.logo || '',
                score: isNaN(awayScore) ? 0 : awayScore,
                winner: awayComp.winner === true,
                form: awayComp.form || ''
            },
            venue: {
                source_id: String(comp.venue?.id || ''),
                name: comp.venue?.fullName || 'Stadium',
                city: comp.venue?.address?.city || '',
                country: comp.venue?.address?.country || leagueDef.country
            },
            attendance: comp.attendance || 0,
            note: leagueDef.name,
            play_by_play_available: true,
            broadcasts: (comp.broadcasts || []).map(b => ({
                market: b.market || 'National',
                names: b.names || []
            })),
            key_events: [],
            last_synced_at: now
        };

        const existingMatch = await findExistingMatch({
            eventId: ev.id,
            homeName: homeTeam.displayName || homeTeam.name,
            awayName: awayTeam.displayName || awayTeam.name,
            matchDate,
            scoreboardDate,
            leagueSlug: matchDoc.league_slug
        });

        if (existingMatch) {
            const updateFields = {
                'source.espn_id': String(ev.id),
                league_slug: matchDoc.league_slug,
                scoreboard_date: matchDoc.scoreboard_date,
                date: matchDoc.date,
                name: matchDoc.name,
                short_name: matchDoc.short_name,
                season: matchDoc.season,
                status: matchDoc.status,
                'home.logo': matchDoc.home.logo || existingMatch.home?.logo,
                'home.abbreviation': matchDoc.home.abbreviation || existingMatch.home?.abbreviation,
                'home.color': homeTeam.color || existingMatch.home?.color,
                'away.logo': matchDoc.away.logo || existingMatch.away?.logo,
                'away.abbreviation': matchDoc.away.abbreviation || existingMatch.away?.abbreviation,
                'away.color': awayTeam.color || existingMatch.away?.color,
                venue: matchDoc.venue,
                note: matchDoc.note,
                last_synced_at: now
            };
            if (!isNaN(matchDoc.home.score)) {
                updateFields['home.score'] = matchDoc.home.score;
                updateFields['home.winner'] = matchDoc.home.winner;
            }
            if (!isNaN(matchDoc.away.score)) {
                updateFields['away.score'] = matchDoc.away.score;
                updateFields['away.winner'] = matchDoc.away.winner;
            }
            await SoccerMatch.updateOne(
                { _id: existingMatch._id },
                { $set: updateFields }
            );
        } else {
            await SoccerMatch.updateOne(
                { 'source.provider': 'upstream', 'source.event_id': String(ev.id) },
                {
                    $set: matchDoc,
                    $setOnInsert: { created_at: now }
                },
                { upsert: true }
            );
        }
        count++;
    }
    return count;
}

let cachedLiveScoreStages = [];
let lastLiveScoreStagesFetchTs = 0;

/**
 * Fetches and caches multi-day LiveScore stages across live, today, tomorrow, and yesterday.
 * Deduplicates and caches stages for 90 seconds to eliminate redundant network round-trips.
 */
async function getCachedOrFetchLiveScoreStages() {
    const now = new Date();
    if (cachedLiveScoreStages.length > 0 && (Date.now() - lastLiveScoreStagesFetchTs < 90000)) {
        return cachedLiveScoreStages;
    }
    const todayStr = formatDateToScoreboard(now);
    const tomorrowStr = formatDateToScoreboard(new Date(now.getTime() + 86400000));
    const yesterdayStr = formatDateToScoreboard(new Date(now.getTime() - 86400000));

    const [liveData, dateData, tomorrowData, yesterdayData] = await Promise.all([
        fetchJson('https://prod-public-api.livescore.com/v1/api/app/live/soccer/0').catch(() => null),
        fetchJson(`https://prod-public-api.livescore.com/v1/api/app/date/soccer/${todayStr}/0`).catch(() => null),
        fetchJson(`https://prod-public-api.livescore.com/v1/api/app/date/soccer/${tomorrowStr}/0`).catch(() => null),
        fetchJson(`https://prod-public-api.livescore.com/v1/api/app/date/soccer/${yesterdayStr}/0`).catch(() => null)
    ]);

    const stages = [];
    if (dateData && Array.isArray(dateData.Stages)) stages.push(...dateData.Stages);
    if (tomorrowData && Array.isArray(tomorrowData.Stages)) stages.push(...tomorrowData.Stages);
    if (yesterdayData && Array.isArray(yesterdayData.Stages)) stages.push(...yesterdayData.Stages);
    if (liveData && Array.isArray(liveData.Stages)) stages.push(...liveData.Stages);

    if (stages.length > 0) {
        cachedLiveScoreStages = stages;
        lastLiveScoreStagesFetchTs = Date.now();
    }
    return stages;
}

/**
 * Secondary matchday scraper fallback for leagues not reachable on ESPN.
 * Ingests and updates matches under leagueDef.slug while harmonizing team names and IDs.
 */
async function syncLeagueFromLiveScoreStages(leagueDef, stages, now = new Date()) {
    if (!leagueDef || !Array.isArray(stages) || stages.length === 0) return 0;
    const targetSlug = leagueDef.slug;
    const targetCountryLower = String(leagueDef.country || '').toLowerCase();

    const matchingStages = stages.filter(stage => {
        const country = stage.Cnm || stage.Sdn || 'International';
        const leagueName = stage.Snm || 'Football Competition';
        const resolved = resolveLeagueSlug(leagueName, country, stage.Scd || '');
        if (resolved === targetSlug) return true;
        if (targetCountryLower && country.toLowerCase() === targetCountryLower) {
            return true;
        }
        return false;
    });

    if (matchingStages.length === 0) return 0;
    if (mongoose.connection.readyState !== 1) {
        return matchingStages.reduce((acc, s) => acc + (s.Events?.length || 0), 0);
    }

    let syncedCount = 0;
    const matchBulkOps = [];

    for (const stage of matchingStages) {
        const country = stage.Cnm || stage.Sdn || leagueDef.country || 'International';
        const leagueName = stage.Snm || leagueDef.name || 'Football Competition';
        for (const ev of (stage.Events || [])) {
            const eid = String(ev.Eid);
            const h = ev.T1?.[0] || {};
            const a = ev.T2?.[0] || {};
            const homeName = h.Nm || 'Home Club';
            const awayName = a.Nm || 'Away Club';
            // Demote mis-tagged lower-division games off top-flight boards
            targetSlug = demoteIfNotTopFlight(targetSlug, homeName, awayName, leagueName);
            // Keep senior top-flight boards clean — no B/II/U21 sides mixed in
            const seniorSlug = String(targetSlug || '').toLowerCase();
            const isSeniorTop = /\.[1]$/.test(seniorSlug) && !seniorSlug.includes('.w.') && !seniorSlug.includes('youth');
            if (isSeniorTop && (isReserveOrBTeamName(homeName) || isReserveOrBTeamName(awayName))) {
                continue;
            }
            // Final gate: still on .1 with no known club → skip inserting into top board
            if (isSeniorTop && TOP_FLIGHT_CLUBS[seniorSlug] && !hasTopFlightClub(seniorSlug, homeName, awayName)) {
                continue;
            }
            const homeScore = parseInt(ev.Tr1 || 0, 10);
            const awayScore = parseInt(ev.Tr2 || 0, 10);
            const rawClock = String(ev.Eps || ev.Epr || 'NS');

            const isNotStarted = rawClock === 'NS' || rawClock === 'Upcoming' || rawClock === '' || rawClock === 'Sched' || rawClock.includes(':');
            const isFinished = rawClock === 'FT' || rawClock === 'AET' || rawClock === 'AP';
            const isPostponed = rawClock.includes('Postp') || rawClock.includes('Canc');
            const isInPlay = !isNotStarted && !isFinished && !isPostponed;
            const state = isInPlay ? 'in' : (isFinished || isPostponed) ? 'post' : 'pre';
            const displayClock = isFinished ? 'FT' : isPostponed ? 'Postp.' : (isInPlay ? (rawClock === 'HT' ? 'HT' : (rawClock.includes("'") ? rawClock : `${rawClock}'`)) : 'NS');

            let matchDate = now;
            if (ev.Esd && String(ev.Esd).length >= 12) {
                const s = String(ev.Esd);
                const yr = parseInt(s.slice(0, 4), 10);
                const mo = parseInt(s.slice(4, 6), 10) - 1;
                const da = parseInt(s.slice(6, 8), 10);
                const hr = parseInt(s.slice(8, 10), 10);
                const mi = parseInt(s.slice(10, 12), 10);
                matchDate = new Date(Date.UTC(yr, mo, da, hr, mi));
            }

            const scoreboardDate = formatDateToScoreboard(matchDate);
            const homeCrest = formatLiveScoreLogo(h.Img);
            const awayCrest = formatLiveScoreLogo(a.Img);

            const existingMatch = await findExistingMatch({
                eventId: eid,
                homeName,
                awayName,
                matchDate,
                scoreboardDate,
                leagueSlug: targetSlug
            });

            if (existingMatch) {
                matchBulkOps.push({
                    updateOne: {
                        filter: { _id: existingMatch._id },
                        update: {
                            $set: {
                                'source.livescore_id': eid,
                                'status.state': state,
                                'status.name': state === 'in' ? 'STATUS_IN_PROGRESS' : state === 'post' ? 'STATUS_FINAL' : 'STATUS_SCHEDULED',
                                'status.description': state === 'in' ? 'In Progress' : state === 'post' ? (isPostponed ? 'Postponed' : 'Full Time') : 'Scheduled',
                                'status.detail': displayClock,
                                'status.short_detail': displayClock,
                                'status.clock': displayClock,
                                'status.clock_seconds': parseInt(displayClock, 10) ? parseInt(displayClock, 10) * 60 : (displayClock === 'HT' ? 2700 : 0),
                                'status.period': ev.Epr || (displayClock === 'HT' ? 1 : 2),
                                'status.completed': isFinished,
                                'status.suspended': isPostponed,
                                'home.score': isNaN(homeScore) ? (existingMatch.home?.score ?? 0) : homeScore,
                                'away.score': isNaN(awayScore) ? (existingMatch.away?.score ?? 0) : awayScore,
                                'home.winner': isFinished && homeScore > awayScore,
                                'away.winner': isFinished && awayScore > homeScore,
                                'home.logo': existingMatch.home?.logo || homeCrest || '',
                                'away.logo': existingMatch.away?.logo || awayCrest || '',
                                last_synced_at: now
                            }
                        }
                    }
                });
            } else {
                matchBulkOps.push({
                    updateOne: {
                        filter: { 'source.provider': 'livescore', 'source.event_id': eid, league_slug: targetSlug },
                        update: {
                            $set: {
                                source: {
                                    provider: 'livescore',
                                    event_id: eid,
                                    livescore_id: eid,
                                    competition_id: String(stage.CompId || stage.Sid || targetSlug),
                                    uid: `ls:${eid}`,
                                    modified_at: now
                                },
                                league_slug: targetSlug,
                                scoreboard_date: scoreboardDate,
                                date: matchDate,
                                name: `${homeName} vs ${awayName}`,
                                short_name: `${h.Abr || homeName.slice(0, 3)} vs ${a.Abr || awayName.slice(0, 3)}`,
                                season: {
                                    year: matchDate.getUTCFullYear(),
                                    type_id: '1',
                                    slug: 'regular-season',
                                    name: `${leagueDef.name} ${matchDate.getUTCFullYear()}`
                                },
                                status: {
                                    state,
                                    name: state === 'in' ? 'STATUS_IN_PROGRESS' : state === 'post' ? 'STATUS_FINAL' : 'STATUS_SCHEDULED',
                                    description: state === 'in' ? 'In Progress' : state === 'post' ? (isPostponed ? 'Postponed' : 'Full Time') : 'Scheduled',
                                    detail: displayClock,
                                    short_detail: displayClock,
                                    clock: displayClock,
                                    clock_seconds: parseInt(displayClock, 10) ? parseInt(displayClock, 10) * 60 : (displayClock === 'HT' ? 2700 : 0),
                                    period: ev.Epr || (displayClock === 'HT' ? 1 : 2),
                                    completed: isFinished,
                                    suspended: isPostponed
                                },
                                home: {
                                    source_id: String(h.ID || homeName.toLowerCase().replace(/[^a-z0-9]+/g, '-')),
                                    name: homeName,
                                    display_name: homeName,
                                    abbreviation: h.Abr || homeName.slice(0, 3).toUpperCase(),
                                    logo: homeCrest || '',
                                    score: isNaN(homeScore) ? 0 : homeScore,
                                    winner: isFinished && homeScore > awayScore,
                                    form: ''
                                },
                                away: {
                                    source_id: String(a.ID || awayName.toLowerCase().replace(/[^a-z0-9]+/g, '-')),
                                    name: awayName,
                                    display_name: awayName,
                                    abbreviation: a.Abr || awayName.slice(0, 3).toUpperCase(),
                                    logo: awayCrest || '',
                                    score: isNaN(awayScore) ? 0 : awayScore,
                                    winner: isFinished && awayScore > homeScore,
                                    form: ''
                                },
                                venue: { name: 'Stadium', city: country, country },
                                attendance: 0,
                                note: leagueDef.name,
                                play_by_play_available: true,
                                broadcasts: [],
                                key_events: [],
                                created_at: now,
                                last_synced_at: now
                            },
                            $setOnInsert: { created_at: now }
                        },
                        upsert: true
                    }
                });
            }
            syncedCount++;
        }
    }

    if (matchBulkOps.length > 0) {
        await SoccerMatch.bulkWrite(matchBulkOps, { ordered: false }).catch(e => console.warn(`[LiveSync] Fallback bulkWrite for ${targetSlug} notice:`, e.message));
    }

    return syncedCount;
}

async function syncLeague(leagueDef) {
    const slug = leagueDef.slug;
    const now = new Date();
    let matchCount = 0;
    let standingCount = 0;

    try {
        // 1. Fetch Primary Scoreboard Data
        const scoreboardUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard`;
        let sbData = null;
        try {
            sbData = await fetchJson(scoreboardUrl);
        } catch (fetchErr) {
            // Regional leagues and domestic cups that only air via master all/scoreboard or LiveScore
            sbData = null;
        }

        const espnLeague = sbData?.leagues?.[0] || {};
        const season = espnLeague.season || {};
        const logoUrl = espnLeague.logos?.[0]?.href || '';

        // Upsert League Record
        await SoccerLeague.updateOne(
            { slug },
            {
                $set: {
                    name: leagueDef.name,
                    abbreviation: leagueDef.abbreviation,
                    country: leagueDef.country,
                    kind: leagueDef.kind,
                    logo: logoUrl || `https://a.espncdn.com/i/leaguelogos/soccer/500/${espnLeague.id || '23'}.png`,
                    active: true,
                    sort_order: leagueDef.sort_order,
                    source: { provider: 'upstream', source_id: String(espnLeague.id || '') },
                    season: {
                        year: season.year || 2026,
                        display_name: season.displayName || `${leagueDef.name} ${season.year || 2026}`,
                        current: true,
                        type_id: String(season.type?.id || '1'),
                        type_name: season.type?.name || 'Regular Season'
                    },
                    last_synced_at: now
                },
                $setOnInsert: { created_at: now }
            },
            { upsert: true }
        );

        // Process default scoreboard events if ESPN returned data
        if (sbData?.events?.length) {
            matchCount += await processEvents(sbData.events || [], slug, leagueDef, season, now);
        }

        // 2. Discover and sync multi-date rounds from league calendar
        const targetDates = new Set();
        const pastCutoff = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);   // past 8 days
        const futureCutoff = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // next 14 days

        function extractCalendarDates(item) {
            if (!item) return;
            if (typeof item === 'string') {
                const d = new Date(item);
                if (!isNaN(d.getTime()) && d >= pastCutoff && d <= futureCutoff) {
                    targetDates.add(formatDateToScoreboard(d));
                }
                return;
            }
            if (item.date) {
                const d = new Date(item.date);
                if (!isNaN(d.getTime()) && d >= pastCutoff && d <= futureCutoff) {
                    targetDates.add(formatDateToScoreboard(d));
                }
            }
            if (item.startDate) {
                const d = new Date(item.startDate);
                if (!isNaN(d.getTime()) && d >= pastCutoff && d <= futureCutoff) {
                    targetDates.add(formatDateToScoreboard(d));
                }
            }
            if (item.endDate) {
                const d = new Date(item.endDate);
                if (!isNaN(d.getTime()) && d >= pastCutoff && d <= futureCutoff) {
                    targetDates.add(formatDateToScoreboard(d));
                }
            }
            if (Array.isArray(item.entries)) {
                item.entries.forEach(extractCalendarDates);
            }
        }

        if (Array.isArray(espnLeague.calendar)) {
            espnLeague.calendar.forEach(extractCalendarDates);
        }

        if (targetDates.size > 0) {
            // Sync up to 2 active match dates per league (current + upcoming round)
            const dateList = Array.from(targetDates).slice(0, 2);
            for (const dateKey of dateList) {
                try {
                    const dateUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${dateKey}`;
                    const dateData = await fetchJson(dateUrl);
                    matchCount += await processEvents(dateData.events || [], slug, leagueDef, season, now);
                } catch (e) {
                    // Non-blocking for individual round dates
                }
            }
        }

        // Fallback: If ESPN scoreboard returned 0 matches, seamlessly fall back to LiveScore scraper for this league
        if (matchCount === 0) {
            try {
                const fallbackStages = await getCachedOrFetchLiveScoreStages();
                matchCount += await syncLeagueFromLiveScoreStages(leagueDef, fallbackStages, now);
            } catch (fbErr) {
                // Non-blocking fallback
            }
        }

        // 3. Sync Standings
        try {
            const standingsUrl = `https://site.api.espn.com/apis/v2/sports/soccer/${slug}/standings`;
            const standData = await fetchJson(standingsUrl);
            const children = standData.children || [];
            const seasonYear = Number(season.year) || 2026;

            for (let idx = 0; idx < children.length; idx++) {
                const grp = children[idx];
                const standingsObj = grp.standings || {};
                const entries = standingsObj.entries || [];

                // Sort entries by real rank ascending (or points descending)
                const sortedEntries = entries.slice().sort((a, b) => {
                    const rankA = Number((a.stats || []).find(s => s.name === 'rank')?.value ?? 999);
                    const rankB = Number((b.stats || []).find(s => s.name === 'rank')?.value ?? 999);
                    if (rankA !== rankB) return rankA - rankB;
                    const ptsA = Number((a.stats || []).find(s => s.name === 'points')?.value ?? 0);
                    const ptsB = Number((b.stats || []).find(s => s.name === 'points')?.value ?? 0);
                    return ptsB - ptsA;
                });

                const normalizedEntries = sortedEntries.map((entry, eIdx) => {
                    const statsMap = new Map();
                    for (const st of (entry.stats || [])) {
                        if (st.name && typeof st.value === 'number') {
                            statsMap.set(st.name, st.value);
                        }
                    }
                    const realRank = Number((entry.stats || []).find(s => s.name === 'rank')?.value ?? (eIdx + 1));

                    return {
                        rank: realRank,
                        club: {
                            source_id: String(entry.team?.id || `club-${eIdx}`),
                            display_name: entry.team?.displayName || entry.team?.name || 'Club',
                            abbreviation: entry.team?.abbreviation || '',
                            logo: entry.team?.logos?.[0]?.href || entry.team?.logo || ''
                        },
                        stats: statsMap
                    };
                });

                await SoccerStanding.updateOne(
                    { league_slug: slug, season_year: seasonYear, group_id: grp.id || 'overall' },
                    {
                        $set: {
                            group_name: grp.name || 'League Table',
                            entries: normalizedEntries,
                            last_synced_at: now
                        },
                        $setOnInsert: { created_at: now }
                    },
                    { upsert: true }
                );
                standingCount++;
            }
        } catch (stErr) {
            console.warn(`[LiveSync] Standings notice for ${slug}:`, stErr.message);
        }

        // 4. Update Sync State
        await SoccerSyncState.updateOne(
            { league_slug: slug },
            {
                $set: {
                    last_status: 'success',
                    last_sync_completed_at: now,
                    last_error: null,
                    consecutive_failures: 0
                },
                $inc: { sync_count: 1 }
            },
            { upsert: true }
        );

        return { slug, matchesSynced: matchCount, standingsSynced: standingCount };
    } catch (error) {
        await SoccerSyncState.updateOne(
            { league_slug: slug },
            {
                $set: {
                    last_status: 'error',
                    last_error: error.message
                },
                $inc: { consecutive_failures: 1 }
            },
            { upsert: true }
        );
        throw error;
    }
}

let isAllLeaguesSyncing = false;
async function syncAllLeagues() {
    if (isAllLeaguesSyncing) {
        console.log('⚡ [LiveSync] syncAllLeagues already in progress, skipping duplicate invocation.');
        return [];
    }
    isAllLeaguesSyncing = true;
    try {
        console.log(`⚡ [LiveSync] Ingesting match rounds and standings across ${TARGET_LEAGUES.length} premier leagues...`);
        const results = [];
        const CONCURRENCY = 2; // Throttle concurrency to prevent socket & SNAT exhaustion
        for (let i = 0; i < TARGET_LEAGUES.length; i += CONCURRENCY) {
            const batch = TARGET_LEAGUES.slice(i, i + CONCURRENCY);
            const batchResults = await Promise.allSettled(batch.map(l => syncLeague(l)));
            for (let j = 0; j < batch.length; j++) {
                const l = batch[j];
                const r = batchResults[j];
                if (r.status === 'fulfilled') {
                    results.push(r.value);
                } else {
                    console.warn(`[LiveSync] ${l.slug} sync error: ${r.reason?.message}`);
                }
            }
        }
        return results;
    } finally {
        isAllLeaguesSyncing = false;
    }
}


/** Map LiveScore country names → expected slug country prefix */
const COUNTRY_SLUG_PREFIX = {
    england: 'eng', spain: 'esp', italy: 'ita', germany: 'ger', france: 'fra',
    netherlands: 'ned', portugal: 'por', belgium: 'bel', turkey: 'tur', 'türkiye': 'tur',
    austria: 'aut', switzerland: 'sui', scotland: 'sco', wales: 'wal', ireland: 'irl',
    mexico: 'mex', brazil: 'bra', argentina: 'arg', colombia: 'col', chile: 'chi',
    australia: 'aus', japan: 'jpn', 'south korea': 'kor', korea: 'kor', 'republic of korea': 'kor',
    china: 'chn', india: 'ind', indonesia: 'idn', malaysia: 'mys', thailand: 'tha',
    nigeria: 'nga', 'south africa': 'rsa', egypt: 'egy', morocco: 'mar', ghana: 'gha',
    romania: 'rou', greece: 'gre', poland: 'pol', ukraine: 'ukr', russia: 'rus',
    sweden: 'swe', norway: 'nor', denmark: 'den', finland: 'fin', iceland: 'isl',
    latvia: 'lva', lithuania: 'ltu', estonia: 'est', 'czech republic': 'cze', czechia: 'cze',
    croatia: 'cro', serbia: 'srb', hungary: 'hun', bulgaria: 'bul', slovakia: 'svk',
    'united states': 'usa', usa: 'usa', canada: 'can', peru: 'per', ecuador: 'ecu',
    uruguay: 'uru', paraguay: 'par', venezuela: 'ven', bolivia: 'bol',
    'saudi arabia': 'ksa', uae: 'uae', qatar: 'qat', iraq: 'irq', iran: 'irn',
    vietnam: 'vie', singapore: 'sgp'
};

/**
 * After resolveLeagueSlug, reject results that conflict with the stage country.
 * Stops Korean matches landing in eng.*, Mexican in ita.*, Latvian under esp, etc.
 */
function enforceCountryOnSlug(slug, countryName = '', leagueName = '') {
    const cLower = String(countryName || '').toLowerCase().trim();
    if (!cLower || cLower === 'international' || cLower === 'world' || cLower === 'europe') return slug || null;
    let expected = null;
    for (const [key, prefix] of Object.entries(COUNTRY_SLUG_PREFIX)) {
        if (cLower === key || cLower.includes(key)) { expected = prefix; break; }
    }
    if (!expected) return slug || null;

    const blob = `${slug || ''} ${leagueName || ''} ${countryName || ''}`.toLowerCase();
    const isWomen = /\.w\.|women|woman|ladies|femen|frau|damen|vrouwen|wsl|fem\./i.test(blob);
    if (isWomen) return `${expected}.w.1`;

    const isFifth = /tercera|5th|tier 5|oberliga|national 3/i.test(blob);
    const isFourth = /segunda federaci|2ª federaci|2ª rfef|segunda rfef|segunda b|regionalliga|serie d|national 2|league two|eng\.4/i.test(blob);
    const isThird = /primera federaci|1ª federaci|1ª rfef|primera rfef|3\.?\s*liga|serie c|lega pro|national 1|\bnational\b|league one|eng\.3/i.test(blob);
    const isSecond = /segunda divisi|laliga\s*2|hypermotion|2\.?\s*bundesliga|serie b|ligue 2|championship|eng\.2|liga 2/i.test(blob);

    let tier = '1';
    if (isFifth) tier = '5';
    else if (isFourth) tier = '4';
    else if (isThird) tier = '3';
    else if (isSecond) tier = '2';

    if (tier !== '1') {
        return `${expected}.${tier}`;
    }

    const actual = slug ? String(slug).split('.')[0] : '';
    if (slug && actual === expected) {
        if (slug.endsWith('.1')) {
            const isTopFlightKeyword = /primera divisi|la\s*liga|laliga|bundesliga|serie a|ligue 1|premier league|epl|super lig|eredivisie|primeira liga/i.test(leagueName);
            if (!isTopFlightKeyword && leagueName && !/division 1|1st division|top division|first division/i.test(leagueName)) {
                return `${expected}.lower`;
            }
        }
        return slug;
    }

    return `${expected}.${tier}`;
}


/** Canonical aliases so Inter/Internazionale, Como/Como 1907, SC Heerenveen etc. collapse */
const TEAM_NAME_ALIASES = {
    internazionale: 'inter',
    'inter milan': 'inter',
    'fc internazionale': 'inter',
    'inter nazion': 'inter',
    'como 1907': 'como',
    'calcio como': 'como',
    'sc heerenveen': 'heerenveen',
    heerenveen: 'heerenveen',
    'feyenoord rotterdam': 'feyenoord',
    feyenoord: 'feyenoord',
    'athletic club': 'athletic bilbao',
    'athletic bilbao': 'athletic bilbao',
    'atletico de madrid': 'atletico madrid',
    'atletico madrid': 'atletico madrid',
    'atlético de madrid': 'atletico madrid',
    'man united': 'manchester united',
    'manchester utd': 'manchester united',
    'man city': 'manchester city',
    'spurs': 'tottenham',
    'tottenham hotspur': 'tottenham',
    'paris sg': 'psg',
    'paris saint germain': 'psg',
    'paris saint-germain': 'psg',
    'bayern munich': 'bayern',
    'fc bayern': 'bayern',
    'bayern munchen': 'bayern',
    'borussia dortmund': 'dortmund',
    'bvb': 'dortmund',
    'sporting cp': 'sporting',
    'sporting lisbon': 'sporting',
    'vitoria de guimaraes': 'vitoria guimaraes',
    'vitoria guimaraes': 'vitoria guimaraes',
    'fc porto': 'porto',
    porto: 'porto',
};

/** Known first-division clubs — matches under .1 without a club on this list get demoted */
const TOP_FLIGHT_CLUBS = {
    'ita.1': new Set(['inter','milan','ac milan','juventus','napoli','roma','as roma','lazio','atalanta','fiorentina','bologna','torino','genoa','cagliari','udinese','verona','hellas verona','empoli','monza','lecce','frosinone','sassuolo','como','parma','venezia','cremonese','pisa','salernitana','spezia','sampdoria','benevento','crotone','spal','chievo']),
    'esp.1': new Set(['real madrid','barcelona','barca','atletico madrid','sevilla','real sociedad','villarreal','athletic bilbao','real betis','betis','osasuna','getafe','celta','celta vigo','levante','mallorca','girona','rayo vallecano','rayo','valencia','espanyol','alaves','deportivo alaves','elche','cadiz','granada','valladolid','leganes','las palmas','almeria','villarreal cf']),
    'eng.1': new Set(['arsenal','chelsea','liverpool','manchester city','manchester united','tottenham','newcastle','aston villa','brighton','west ham','crystal palace','fulham','brentford','wolves','wolverhampton','everton','nottingham forest','bournemouth','southampton','leicester','ipswich','burnley','sheffield united','luton','leeds','watford','norwich']),
    'ger.1': new Set(['bayern','dortmund','leverkusen','bayer leverkusen','rb leipzig','leipzig','stuttgart','eintracht frankfurt','frankfurt','wolfsburg','freiburg','hoffenheim','monchengladbach','gladbach','mainz','augsburg','werder bremen','bremen','union berlin','bochum','heidenheim','st pauli','holstein kiel','koln','cologne','hertha','schalke','schalke 04','hamburg','hamburger sv']),
    'fra.1': new Set(['psg','marseille','monaco','lyon','lille','nice','rennes','lens','strasbourg','nantes','montpellier','reims','toulouse','brest','angers','auxerre','le havre','saint etienne','st etienne','metz','clermont','lorient','troyes']),
    'por.1': new Set(['benfica','porto','sporting','braga','guimaraes','vitoria guimaraes','boavista','famalicao','moreirense','casa pia','estoril','arouca','rio ave','gil vicente','santa clara','nacional','tondela','chaves','vizela','portimonense','farense']),
    'ned.1': new Set(['ajax','psv','feyenoord','az','az alkmaar','twente','utrecht','heerenveen','groningen','sparta rotterdam','sparta','willem ii','nec','nijmegen','go ahead eagles','fortuna sittard','heracles','pec zwolle','zwolle','excelsior','volendam','rkc','waalwijk','almere']),
};

function applyTeamAlias(normalized = '') {
    const n = String(normalized || '').trim().toLowerCase();
    if (!n) return n;
    if (TEAM_NAME_ALIASES[n]) return TEAM_NAME_ALIASES[n];
    // prefix match for longer names
    for (const [k, v] of Object.entries(TEAM_NAME_ALIASES)) {
        if (n === k || n.startsWith(k + ' ') || n.includes(k)) return v;
    }
    return n;
}

/** Returns true if at least one side looks like a known top-flight club for this slug */
function hasTopFlightClub(slug, homeName, awayName) {
    const list = TOP_FLIGHT_CLUBS[String(slug || '').toLowerCase()];
    if (!list) return true; // unknown leagues: don't filter
    const h = applyTeamAlias(normalizeTeamName(homeName));
    const a = applyTeamAlias(normalizeTeamName(awayName));
    const hit = (name) => {
        if (!name) return false;
        if (list.has(name)) return true;
        for (const club of list) {
            if (name.includes(club) || club.includes(name)) return true;
        }
        return false;
    };
    return hit(h) || hit(a);
}

/** Demote .1 slug to .lower when neither side is a known first-division club */
function demoteIfNotTopFlight(slug, homeName, awayName, leagueName = '') {
    if (!slug || !/\.1$/.test(slug)) return slug;
    if (!TOP_FLIGHT_CLUBS[slug]) return slug;
    // Explicit top-flight league title always keeps .1 if present
    if (/serie a\b|la\s*liga|laliga ea|premier league|\bpl\b|bundesliga|ligue 1|eredivisie|primeira liga/i.test(leagueName || '')) {
        // still require at least one known club — otherwise LiveScore mislabeled the stage
        if (hasTopFlightClub(slug, homeName, awayName)) return slug;
        return slug.replace(/\.1$/, '.lower');
    }
    if (hasTopFlightClub(slug, homeName, awayName)) return slug;
    return slug.replace(/\.1$/, '.lower');
}

function resolveLeagueSlug(altGameNote = '', compDesc = '', uid = '') {
    const leagueRaw = String(altGameNote || '').trim();
    const countryRaw = String(compDesc || '').trim();
    const uidRaw = String(uid || '').trim();
    const text = `${leagueRaw} ${countryRaw} ${uidRaw}`.toLowerCase();
    const country = countryRaw.toLowerCase();
    const league = leagueRaw.toLowerCase();
    const scd = uidRaw.toLowerCase();

    // 1. Explicitly reject NCAA non-soccer and college basketball events
    if (text.includes('ncaam') || text.includes('ncaa') || text.includes('college basketball') || text.includes('mens college') || text.includes('wnba') || text.includes('nba')) {
        return null;
    }

    // Direct explicit canonical slug matches in uid
    if (scd === 'eng.1' || scd === 'esp.1' || scd === 'ita.1' || scd === 'ger.1' || scd === 'fra.1' || scd === 'bra.1' || scd === 'mex.1' || scd === 'nga.1' || scd === 'uefa.champions') {
        return scd;
    }

    // 2. Women's Football Discriminator FIRST (prevents WSL, Liga F, NWSL matching men's senior leagues)
    const isWomen = text.includes('women') || text.includes('woman') || text.includes('ladies') ||
                    text.includes('femenin') || text.includes('frauen') || text.includes('damen') ||
                    text.includes('vrouwen') || text.includes('wsl') || text.includes('nwsl') ||
                    text.includes('d1 arkema') || text.includes('liga f') || text.includes('.w.') ||
                    text.includes('fem.') || text.includes('(w)') || text.includes(' w ');
    if (isWomen) {
        // USA Women
        if (text.includes('nwsl') || text.includes('usa.w.1') || (text.includes('national women') && (text.includes('soccer') || text.includes('league'))) || ((text.includes('united states') || text.includes('usa')) && !text.includes('wsl'))) return 'usa.w.1';
        if (text.includes('usl super league') || text.includes('usl w') || text.includes('usa.w.usl')) return 'usa.w.usl';

        // Continental & International Tournaments
        if (text.includes('uefa.w.champions') || text.includes('uwcl') || (text.includes('champions league') && (text.includes('uefa') || !text.includes('caf')))) return 'uefa.w.champions';
        if (text.includes('caf') && text.includes('champions')) return 'caf.w.champions';
        if (text.includes('world cup') || text.includes('fifa.w')) return 'fifa.w.worldcup';
        if (text.includes('euro') || text.includes('uefa.w.euro')) return 'uefa.w.euro';

        // Foreign Super Leagues (check foreign countries before English WSL)
        if (text.includes('switzerland') || text.includes('swiss') || text.includes('sui.w')) return 'sui.w.1';
        if (text.includes('belgium') || text.includes('belgian') || text.includes('bel.w')) return 'bel.w.1';
        if (text.includes('greece') || text.includes('greek') || text.includes('gre.w')) return 'gre.w.1';

        // England Women
        if (text.includes('players cup') || text.includes('wsl cup') || (text.includes('league cup') && (text.includes('women') || text.includes('wsl')))) return 'eng.w.cup';
        if (text.includes('fa cup') && (text.includes('women') || text.includes('wsl') || text.includes('eng'))) return 'eng.w.fa';
        if (text.includes('women\'s championship') || text.includes('eng.w.2')) return 'eng.w.2';
        if (/\bwsl\b/.test(text) || text.includes("women's super league") || text.includes("womens super league") || (text.includes('super league') && (text.includes('england') || text.includes('english') || !text.includes(' '))) || text.includes('eng.w.1') || text.includes('barclays')) {
            return 'eng.w.1';
        }

        // Domestic European & World Women's Leagues
        if (text.includes('a-league') || text.includes('australia') || text.includes('aus.w')) return 'aus.w.1';
        if (text.includes('mex') || text.includes('mexico') || text.includes('femenil')) return 'mex.w.1';
        if (text.includes('liga f') || text.includes('esp.w.1') || text.includes('copa de la reina') || text.includes('spain') || text.includes('spanish')) return 'esp.w.1';
        if (text.includes('frauen') || text.includes('ger.w.1') || text.includes('germany') || text.includes('german')) return 'ger.w.1';
        if (text.includes('arkema') || text.includes('premiere ligue') || text.includes('fra.w.1') || text.includes('france') || text.includes('french')) return 'fra.w.1';
        if (text.includes('femminile') || text.includes('ita.w.1') || text.includes('italy') || text.includes('italian')) return 'ita.w.1';
        if (text.includes('swpl') || text.includes('scotland') || text.includes('scottish') || text.includes('sco.w')) return 'sco.w.1';
        if (text.includes('brasileir') || text.includes('brazil') || text.includes('bra.w')) return 'bra.w.1';
        if (text.includes('vrouwen') || text.includes('netherlands') || text.includes('dutch') || text.includes('ned.w')) return 'ned.w.1';
        if (text.includes('liga bpi') || text.includes('portugal') || text.includes('por.w')) return 'por.w.1';
        if (text.includes('damallsvenskan') || text.includes('sweden') || text.includes('swe.w')) return 'swe.w.1';
        if (text.includes('toppserien') || text.includes('norway') || text.includes('nor.w')) return 'nor.w.1';
        if (text.includes('denmark') || text.includes('danish') || text.includes('den.w')) return 'den.w.1';
        if (text.includes('poland') || text.includes('polish') || text.includes('pol.w')) return 'pol.w.1';
        if (text.includes('nigeria') || text.includes('nwfl') || text.includes('nga.w')) return 'nga.w.1';
        if (text.includes('south africa') || text.includes('rsa.w')) return 'rsa.w.1';

        return 'w.international';
    }

    // 3. Youth & Reserves Football Discriminator (prevents U21 PL2 matching senior Premier League)
    const isYouth = text.includes('u23') || text.includes('u-23') ||
                    text.includes('u21') || text.includes('u-21') ||
                    text.includes('u20') || text.includes('u-20') ||
                    text.includes('u19') || text.includes('u-19') ||
                    text.includes('u18') || text.includes('u-18') ||
                    text.includes('u17') || text.includes('u-17') ||
                    text.includes('pl2') || text.includes('premier league 2') ||
                    text.includes('primavera') || text.includes('development league') ||
                    text.includes('youth') || text.includes('reserves');
    if (isYouth) {
        if (text.includes('pl2') || text.includes('premier league 2') || text.includes('eng.u21') || ((text.includes('premier league') || text.includes('development')) && (text.includes('u21') || text.includes('u-21') || text.includes('u23') || text.includes('u-23')))) {
            return 'eng.u21';
        }
        if (text.includes('premier league u18') || text.includes('u18 premier') || text.includes('eng.u18')) {
            return 'eng.u18';
        }
        if (text.includes('primavera') || (text.includes('ita') && text.includes('youth'))) {
            return 'ita.primavera';
        }
        if (text.includes('uefa') || text.includes('champions') || text.includes('youth league') || (text.includes('youth') && (text.includes('league') || text.includes('path') || text.includes('u19') || text.includes('u-19')))) {
            return 'uefa.youth';
        }
        if (text.includes('libertadores') || text.includes('conmebol')) {
            return 'conmebol.u20';
        }
        // FIFA World Cup youth national teams only (never club youth)
        if ((text.includes('fifa') || text.includes('world cup')) && (text.includes('u20') || text.includes('u-20'))) {
            return 'fifa.u20';
        }
        if ((text.includes('fifa') || text.includes('world cup')) && (text.includes('u17') || text.includes('u-17'))) {
            return 'fifa.u17';
        }
        return 'uefa.youth';
    }

    // 4. Continental Club & International Tournaments
    if (text.includes('caf champions') || text.includes('caf.champions') || text.includes('totalenergies caf cl') || (text.includes('caf') && text.includes('champions'))) return 'caf.champions';
    if (text.includes('caf confederation') || text.includes('caf confed') || text.includes('caf.confed') || (text.includes('caf') && text.includes('confed'))) return 'caf.confed';
    if (text.includes('africa cup') || text.includes('afcon') || text.includes('caf.nations') || (text.includes('caf') && text.includes('nations'))) return 'caf.nations';
    if (text.includes('chan') || text.includes('african nations championship') || text.includes('caf.championship')) return 'caf.championship';
    if (text.includes('cosafa') || text.includes('caf.cosafa')) return 'caf.cosafa';

    if (text.includes('afc champions league two') || text.includes('acl two') || text.includes('afc.cup')) return 'afc.cup';
    if (text.includes('afc champions') || text.includes('afc.champions') || (text.includes('afc') && text.includes('champions'))) return 'afc.champions';
    if (text.includes('concacaf') || text.includes('concacaf.champions')) return 'concacaf.champions';

    if (text.includes('libertadores') || text.includes('conmebol.libertadores')) return 'conmebol.libertadores';
    if (text.includes('sudamericana') || text.includes('conmebol.sudamericana')) return 'conmebol.sudamericana';
    if (text.includes('recopa') || text.includes('conmebol.recopa')) return 'conmebol.recopa';

    if (text.includes('uefa.champions') || (text.includes('champions league') && !text.includes('caf') && !text.includes('afc') && !text.includes('concacaf'))) return 'uefa.champions';
    if (text.includes('uefa.europa.conf') || text.includes('conference league')) return 'uefa.europa.conf';
    if (text.includes('uefa.europa') || text.includes('europa league')) return 'uefa.europa';
    if (text.includes('uefa.nations') || text.includes('nations league')) return 'uefa.nations';
    if (text.includes('super cup') || text.includes('uefa.super_cup')) return 'uefa.super_cup';
    if (text.includes('club world cup') || text.includes('fifa.cwc')) return 'fifa.cwc';
    if (text.includes('fifa world cup') || text.includes('fifa.world')) return 'fifa.world';

    // 5. COUNTRY-SPECIFIC DOMESTIC COMPETITIONS (Evaluated before generic terms like Serie A / La Liga / Premier League!)
    const isNeutralCountry = !country || country === 'international' || country === 'world' || country === 'europe' || country === 'global';

    // --- BRAZIL (Brasileirão Série A / Série B / Copa) ---
    const isBrazil = country.includes('brazil') || country.includes('brasil') || text.includes('brasileir') || scd.includes('bra.');
    if (isBrazil) {
        if (text.includes('serie b') || scd.includes('serie-b') || scd.includes('bra.2')) return 'bra.2';
        if (text.includes('copa') || scd.includes('copa')) return 'bra.copa';
        if (text.includes('paulista')) return 'bra.paulista';
        if (text.includes('carioca')) return 'bra.carioca';
        return 'bra.1';
    }

    // --- MEXICO (Liga MX / Liga de Expansión / Copa MX) ---
    const isMexico = country.includes('mexic') || text.includes('liga mx') || scd.includes('mex.') || scd.includes('liga-mx');
    if (isMexico) {
        if (text.includes('expansi') || text.includes('expansion') || scd.includes('mex.2') || scd.includes('expansion')) return 'mex.2';
        if (text.includes('copa')) return 'mex.copa';
        return 'mex.1';
    }

    // --- GUATEMALA (Guatemalan Liga Nacional) ---
    const isGuatemala = country.includes('guatemala') || text.includes('xelaju') || text.includes('marquense') || text.includes('comunicaciones') || text.includes('municipal') || scd.includes('gua.') || scd.includes('guatemala');
    if (isGuatemala) {
        return 'gua.1';
    }

    // --- ECUADOR (LigaPro Ecuador / Serie A / Serie B) ---
    const isEcuador = country.includes('ecuador') || text.includes('ligapro') || text.includes('mushuc runa') || text.includes('ldu quito') || text.includes('barcelona sc') || scd.includes('ecu.');
    if (isEcuador) {
        if (text.includes('serie b') || scd.includes('serie-b') || scd.includes('ecu.2')) return 'ecu.2';
        return 'ecu.1';
    }

    // --- VENEZUELA (Liga FUTVE / Primera División) ---
    const isVenezuela = country.includes('venezuela') || text.includes('futve') || text.includes('monagas') || text.includes('caracas') || scd.includes('ven.');
    if (isVenezuela) {
        return 'ven.1';
    }

    // --- COLOMBIA (Categoría Primera A / Primera B) ---
    const isColombia = country.includes('colombia') || text.includes('betplay') || scd.includes('col.');
    if (isColombia) {
        if (text.includes('primera b') || text.includes('torneo') || scd.includes('col.2')) return 'col.2';
        if (text.includes('copa')) return 'col.copa';
        return 'col.1';
    }

    // --- ARGENTINA (Liga Profesional / Primera División / Copa) ---
    const isArgentina = country.includes('argentin') || text.includes('boca juniors') || text.includes('river plate') || scd.includes('arg.');
    if (isArgentina) {
        if (text.includes('copa') || scd.includes('arg.copa')) return 'arg.copa';
        if (text.includes('primera nacional') || text.includes('b nacional') || scd.includes('arg.2')) return 'arg.2';
        return 'arg.1';
    }

    // --- PARAGUAY (División Profesional / Copa) ---
    const isParaguay = country.includes('paraguay') || text.includes('olimpia') || text.includes('cerro porteno') || text.includes('cerro porteño') || text.includes('asuncion') || scd.includes('par.');
    if (isParaguay) {
        return 'par.1';
    }

    // --- BOLIVIA (Bolivian Liga Profesional) ---
    const isBolivia = country.includes('bolivia') || scd.includes('bol.');
    if (isBolivia) {
        if (text.includes('copa') || scd.includes('bol.copa')) return 'bol.copa';
        return 'bol.1';
    }

    // --- PERU (Liga 1 Peru) ---
    const isPeru = country.includes('peru') || text.includes('alianza lima') || text.includes('universitario de deportes') || text.includes('sporting cristal') || scd.includes('per.');
    if (isPeru) {
        return 'per.1';
    }

    // --- CHILE (Primera División Chile) ---
    const isChile = country.includes('chile') || text.includes('colo-colo') || text.includes('universidad de chile') || scd.includes('chi.');
    if (isChile) {
        return 'chi.1';
    }

    // --- URUGUAY (Primera División Uruguay) ---
    const isUruguay = country.includes('uruguay') || text.includes('penarol') || text.includes('peñarol') || text.includes('nacional montevideo') || scd.includes('uru.');
    if (isUruguay) {
        return 'uru.1';
    }

    // --- CENTRAL AMERICAN LEAGUES ---
    if (country.includes('costa rica') || scd.includes('crc.')) return 'crc.1';
    if (country.includes('honduras') || scd.includes('hon.')) return 'hon.1';
    if (country.includes('el salvador') || scd.includes('slv.')) return 'slv.1';

    // --- AFRICAN DOMESTIC COMPETITIONS ---
    if (country.includes('tanzan') || text.includes('tza.1') || text.includes('nbc premier') || text.includes('ligi kuu') || text.includes('mbeya') || text.includes('singida') || text.includes('simba') || text.includes('yanga') || text.includes('azam')) return 'tza.1';
    if (country.includes('nigeria') || text.includes('npfl') || text.includes('nga.1') || text.includes('rivers united') || text.includes('enugu rangers') || text.includes('enyimba') || text.includes('bendel insurance')) return 'nga.1';
    if (country.includes('south africa') || text.includes('psl') || text.includes('betway premiership') || text.includes('rsa.1') || text.includes('mamelodi sundowns') || text.includes('kaizer chiefs') || text.includes('orlando pirates')) return 'rsa.1';
    if (country.includes('egypt') || text.includes('egy.1') || text.includes('al ahly') || text.includes('zamalek')) {
        if (text.includes('cup') || text.includes('league cup')) return 'egy.cup';
        return 'egy.1';
    }
    if (country.includes('kenya') || text.includes('fkf') || text.includes('ken.1')) return 'ken.1';
    if (country.includes('ghana') || text.includes('gha.1') || text.includes('asante kotoko') || text.includes('hearts of oak')) return 'gha.1';
    if (country.includes('uganda') || text.includes('uga.1')) return 'uga.1';
    if (country.includes('morocco') || text.includes('botola') || text.includes('mar.1') || text.includes('raja') || text.includes('wydad')) return 'mar.1';
    if (country.includes('algeria') || text.includes('dza.1') || text.includes('mouloudia')) return 'dza.1';
    if (country.includes('tunisia') || text.includes('tun.1') || text.includes('esperance')) return 'tun.1';
    if (country.includes('zamb') || text.includes('zmb.1')) return 'zmb.1';
    if (country.includes('zimbab') || text.includes('zwe.1')) return 'zwe.1';
    if (country.includes('ethiop') || text.includes('eth.1')) return 'eth.1';
    if (country.includes('rwand') || text.includes('rwa.1')) return 'rwa.1';
    if (country.includes('congo') || text.includes('cod.1') || text.includes('linafoot') || text.includes('tp mazembe')) return 'cod.1';
    if (country.includes('cameroon') || text.includes('cmr.1') || text.includes('elite one')) return 'cmr.1';
    if (country.includes('ivory coast') || country.includes('côte') || country.includes('cote') || text.includes('civ.1') || text.includes('asec mimosas')) return 'civ.1';
    if (country.includes('sudan') || text.includes('sdn.1')) return 'sdn.1';
    if (country.includes('angola') || text.includes('ago.1') || text.includes('girabola') || text.includes('petro luanda')) return 'ago.1';
    if (country.includes('botswana') || text.includes('bwa.1')) return 'bwa.1';
    if (country.includes('malawi') || text.includes('mwi.1')) return 'mwi.1';
    if (country.includes('libya') || text.includes('lby.1')) return 'lby.1';
    if (country.includes('benin') || text.includes('ben.1') || text.includes('cotonou')) return 'ben.1';
    if (country.includes('burkina') || text.includes('bfa.1') || text.includes('faso')) return 'bfa.1';
    if (country.includes('senegal') || text.includes('sen.1')) return 'sen.1';
    if (country.includes('mali') || text.includes('mli.1')) return 'mli.1';
    if (country.includes('guinea') || text.includes('gin.1')) return 'gin.1';
    if (country.includes('togo') || text.includes('tgo.1')) return 'tgo.1';
    if (country.includes('gabon') || text.includes('gab.1')) return 'gab.1';
    if (country.includes('mauritania') || text.includes('mrt.1')) return 'mrt.1';

    // --- MIDDLE EAST & ASIA ---
    if (country.includes('saudi') || text.includes('roshn') || text.includes('ksa.1') || text.includes('al-hilal') || text.includes('al-nassr') || text.includes('al-ittihad')) {
        if (text.includes('king') || text.includes('cup')) return 'ksa.cup';
        return 'ksa.1';
    }
    if (country.includes('kuwait') || text.includes('kwt.1')) return 'kwt.1';
    if (country.includes('bahrain') || text.includes('bhr.1')) return 'bhr.1';
    if (country.includes('emirates') || country.includes('uae') || text.includes('uae.1')) return 'uae.1';
    if (country.includes('qatar') || text.includes('qat.1')) return 'qat.1';
    if (country.includes('iraq') || text.includes('irq.1')) return 'irq.1';
    if (country.includes('jordan') || text.includes('jor.1')) return 'jor.1';
    if (country.includes('iran') || text.includes('irn.1') || text.includes('persepolis') || text.includes('esteghlal')) return 'irn.1';
    if (country.includes('israel') || text.includes('isr.1')) return 'isr.1';
    const isTurkey = country.includes('turkey') || country.includes('turkish') || country.includes('türkiye') || scd.includes('tur.');
    if (isTurkey || (isNeutralCountry && (/\b(?:s[uü]per\s+lig|t[uü]rkiye\s+kupas[iı])\b/i.test(text) || text.includes('galatasaray') || text.includes('fenerbahce') || text.includes('besiktas')))) {
        if (text.includes('turkiye kupasi') || text.includes('türkiye kupası') || text.includes('tur.cup')) return 'tur.cup';
        return 'tur.1';
    }

    if (country.includes('india') || text.includes('ind.1') || text.includes('ind.2')) {
        if (text.includes('i-league') || text.includes('ind.2')) return 'ind.2';
        return 'ind.1';
    }
    // SOUTH KOREA (K League 1 / K League 2 / Korea Cup)
    const isKorea = country.includes('korea') || country.includes('south korea') || scd.includes('kor.') || /\b(k-?league|kleague|k league)\b/i.test(text);
    if (isKorea) {
        if (text.includes('k league 2') || text.includes('k-league 2') || text.includes('kleague 2') || text.includes('k2') || scd.includes('kor.2')) return 'kor.2';
        if (text.includes('korea cup') || text.includes('fa cup') || text.includes('cup') || scd.includes('kor.cup')) return 'kor.cup';
        return 'kor.1';
    }

    // CHINA (Chinese Super League / China League One / China FA Cup)
    const isChina = country.includes('china') || country.includes('chinese') || scd.includes('chn.') || text.includes('csl');
    if (isChina) {
        if (text.includes('league 1') || text.includes('league one') || text.includes('league 2') || text.includes('league two') || scd.includes('chn.2')) return 'chn.2';
        if (text.includes('fa cup') || text.includes('cup') || scd.includes('chn.cup')) return 'chn.cup';
        return 'chn.1';
    }

    // JAPAN (J1 League / J2 League / Emperor's Cup)
    const isJapan = country.includes('japan') || country.includes('japanese') || scd.includes('jpn.') || text.includes('j-league') || text.includes('j.league') || text.includes('j1');
    if (isJapan) {
        if (text.includes('j2') || text.includes('j-league 2') || text.includes('j.league 2') || scd.includes('jpn.2')) return 'jpn.2';
        if (text.includes('cup') || text.includes('emperor') || scd.includes('jpn.cup')) return 'jpn.cup';
        return 'jpn.1';
    }
    if (country.includes('australia') || text.includes('aus.1') || text.includes('a-league')) return 'aus.1';
    if (country.includes('indonesia') || text.includes('idn.1') || text.includes('liga 1')) return 'idn.1';
    if (country.includes('thailand') || text.includes('tha.1') || text.includes('thai league')) return 'tha.1';
    if (country.includes('malaysia') || text.includes('mys.1')) return 'mys.1';
    if (country.includes('singapore') || text.includes('sgp.1')) return 'sgp.1';
    if (country.includes('vietnam') || text.includes('vie.1')) return 'vie.1';
    if (country.includes('taiwan') || country.includes('chinese taipei') || text.includes('twn.1') || text.includes('taipei') || text.includes('taichung') || text.includes('tainan')) return 'twn.1';
    if (country.includes('uzbekistan') || text.includes('uzb.1')) return 'uzb.1';
    if (country.includes('bangladesh') || text.includes('bgd.1')) return 'bgd.1';
    if (country.includes('hong kong') || text.includes('hkg.1')) return 'hkg.1';
    if (country.includes('kazakh') || text.includes('kaz.1')) return 'kaz.1';

    // --- NORTH AMERICA ---
    if (country.includes('united states') || country.includes('usa') || text.includes('usa.1') || text.includes('usa.usl') || text.includes('mls') || text.includes('major league soccer')) {
        if (text.includes('usl') || text.includes('usa.usl')) return 'usa.usl.1';
        if (text.includes('open') || text.includes('usa.open')) return 'usa.open';
        return 'usa.1';
    }
    if (country.includes('canada') || text.includes('can.1') || text.includes('canadian premier') || text.includes('cpl')) return 'can.1';
    if (country.includes('jamaica') || text.includes('jam.1')) return 'jam.1';

    // --- OTHER EUROPEAN LEAGUES (Checked before Big 5 to avoid keyword overlap) ---
    if (country.includes('austria') || text.includes('aut.1') || (text.includes('bundesliga') && country.includes('austria'))) return 'aut.1';
    if (country.includes('switzerland') || country.includes('swiss') || text.includes('sui.1')) return 'sui.1';
    if (country.includes('greece') || country.includes('greek') || text.includes('gre.1') || text.includes('olympiacos') || text.includes('panathinaikos') || text.includes('paok')) return 'gre.1';
    if (country.includes('scotland') || country.includes('scottish') || text.includes('sco.1') || text.includes('celtic') || text.includes('rangers')) {
        if (text.includes('championship') || text.includes('sco.2')) return 'sco.2';
        if (text.includes('cup') || text.includes('sco.cup')) return 'sco.cup';
        return 'sco.1';
    }
    if (country.includes('netherlands') || country.includes('dutch') || text.includes('ned.1') || text.includes('eredivisie') || text.includes('ajax') || text.includes('psv') || text.includes('feyenoord')) {
        if (text.includes('eerste') || text.includes('ned.2')) return 'ned.2';
        if (text.includes('knvb') || text.includes('cup')) return 'ned.cup';
        return 'ned.1';
    }
    if (country.includes('portugal') || country.includes('portuguese') || text.includes('por.1') || text.includes('primeira') || text.includes('benfica') || text.includes('porto') || text.includes('sporting cp')) {
        if (text.includes('segunda') || text.includes('liga 2') || text.includes('por.2') || /\b(felgueiras|leixoes|leix[oõ]es|penafiel|feirense|oliveirense|torreense|alverca|mafra|uniao de leiria)\b/i.test(text)) return 'por.2';
        if (text.includes('taca') || text.includes('taça') || text.includes('cup')) return 'por.cup';
        return 'por.1';
    }
    if (country.includes('belgium') || country.includes('belgian') || text.includes('bel.1') || text.includes('jupiler') || text.includes('club brugge') || text.includes('anderlecht')) return 'bel.1';
    if (country.includes('denmark') || country.includes('danish') || text.includes('den.1') || text.includes('copenhagen') || text.includes('brondby')) {
        if (text.includes('pokal') || text.includes('cup') || text.includes('dbu')) return 'den.cup';
        return 'den.1';
    }
    if (country.includes('sweden') || country.includes('swedish') || text.includes('swe.1') || text.includes('allsvenskan') || text.includes('malmo')) return 'swe.1';
    if (country.includes('norway') || country.includes('norwegian') || text.includes('nor.1') || text.includes('eliteserien') || text.includes('bodo/glimt')) return 'nor.1';
    if (country.includes('finland') || text.includes('fin.1') || text.includes('veikkausliiga')) return 'fin.1';
    if (country.includes('poland') || text.includes('pol.1') || text.includes('ekstraklasa') || text.includes('legia')) return 'pol.1';
    if (country.includes('croatia') || text.includes('cro.1') || text.includes('dinamo zagreb') || text.includes('hajduk split')) {
        if (text.includes('cup')) return 'cro.cup';
        return 'cro.1';
    }
    if (country.includes('cyprus') || text.includes('cyp.1') || text.includes('apoel')) {
        if (text.includes('cup')) return 'cyp.cup';
        return 'cyp.1';
    }
    if (country.includes('romania') || text.includes('rou.2') || text.includes('steaua') || text.includes('fcsb')) return 'rou.2';
    if (country.includes('moldov') || text.includes('moldov') || text.includes('mda.1') || text.includes('zimbru') || text.includes('sireti') || text.includes('sheriff') || text.includes('petrocub') || text.includes('milsami') || text.includes('dacia buiucani') || text.includes('floresti') || text.includes('sfintul') || text.includes('cupa moldovei') || scd.includes('mda.') || scd.includes('mol.')) {
        if (text.includes('cupa') || text.includes('cup')) return 'mda.cup';
        return 'mda.1';
    }
    if (country.includes('russia') || text.includes('rus.1') || text.includes('zenit') || text.includes('spartak')) return 'rus.1';
    if (country.includes('ukrain') || text.includes('ukr.1') || text.includes('shakhtar') || text.includes('dynamo kyiv')) return 'ukr.1';
    if (country.includes('czech') || text.includes('cze.1') || text.includes('slavia prague') || text.includes('sparta prague')) return 'cze.1';
    if (country.includes('serbia') || text.includes('srb.1') || text.includes('red star') || text.includes('partizan')) return 'srb.1';
    if (country.includes('bulgaria') || text.includes('bgr.1') || text.includes('ludogorets')) return 'bgr.1';
    if (country.includes('hungary') || text.includes('hun.1') || text.includes('ferencvaros')) return 'hun.1';
    if (country.includes('slovakia') || text.includes('svk.1') || text.includes('slovan bratislava')) return 'svk.1';
    if (country.includes('slovenia') || text.includes('svn.1') || text.includes('maribor')) return 'svn.1';
    if (country.includes('belarus') || text.includes('blr.1')) return 'blr.1';
    if (country.includes('azerbaijan') || text.includes('aze.1') || text.includes('qarabag')) return 'aze.1';
    if (country.includes('armenia') || text.includes('arm.1')) return 'arm.1';
    if (country.includes('bosnia') || text.includes('bih.1')) return 'bih.1';
    if (country.includes('northern ireland') || text.includes('nir.1')) return 'nir.1';
    if (country.includes('wales') || text.includes('wal.1')) return 'wal.1';
    if (country.includes('ireland') || text.includes('irl.1')) return 'irl.1';
    if (country.includes('iceland') || text.includes('isl.1') || text.includes('besta deild')) return 'isl.1';
    if (country.includes('malta') || text.includes('mlt.1')) return 'mlt.1';
    if (country.includes('montenegro') || text.includes('mne.1')) return 'mne.1';

    // --- EUROPEAN BIG 5 (With strict country and word boundary protection!) ---

    // SPAIN (LaLiga EA Sports / LaLiga 2 / Copa del Rey / RFEF tiers)
    const isSpain = country.includes('spain') || country.includes('spanish') || country.includes('españa') || country.includes('espana') || scd.includes('esp.');
    if (isSpain || (isNeutralCountry && /\b(?:laliga|la\s+liga|copa del rey|primera federaci|segunda federaci|tercera federaci)\b/i.test(text))) {
        if (text.includes('copa del rey') || scd.includes('copa-del-rey') || scd.includes('esp.copa_del_rey')) return 'esp.copa_del_rey';
        if (text.includes('supercopa') || scd.includes('esp.supercopa')) return 'esp.supercopa';
        if (text.includes('copa federacion') || text.includes('copa federación') || text.includes('copa rfef')) return 'esp.rfef_copa';
        if (/(?:tercera|3[ªa.]?\s*(?:federaci|rfef))/i.test(text) || scd.includes('esp.5')) return 'esp.5';
        if (/(?:segunda\s*federaci|2[ªa.]?\s*(?:federaci|rfef)|segunda\s*rfef|segunda\s*b)/i.test(text) || scd.includes('esp.4')) return 'esp.4';
        if (/(?:primera\s*federaci|1[ªa.]?\s*(?:federaci|rfef)|primera\s*rfef)/i.test(text) || scd.includes('esp.3')) return 'esp.3';
        if (text.includes('laliga 2') || text.includes('laliga2') || text.includes('hypermotion') || /segunda\s*divisi/i.test(text) || scd.includes('esp.2')) return 'esp.2';
        if ((/\b(?:laliga|la\s+liga)\b/i.test(text) && !text.includes('2') && !text.includes('hypermotion')) || scd === 'esp.1' || (/primera\s*divisi/i.test(text) && !text.includes('rfef') && !text.includes('femenin'))) return 'esp.1';
        return 'esp.lower';
    }

    // ITALY (Serie A / Serie B / Serie C / Serie D / Coppa Italia)
    const isItaly = country.includes('italy') || country.includes('italian') || country.includes('italia') || scd.includes('ita.');
    if (isItaly || (isNeutralCountry && /\b(?:serie\s+a|serie\s+b|serie\s+c|serie\s+d|coppa italia)\b/i.test(text))) {
        if (text.includes('coppa italia serie c')) return 'ita.coppa_serie_c';
        if (text.includes('coppa italia') || scd.includes('coppa-italia') || scd.includes('ita.coppa_italia')) return 'ita.coppa_italia';
        if (text.includes('supercoppa') || scd.includes('ita.supercoppa')) return 'ita.supercoppa';
        if (text.includes('serie d') || text.includes('serie-d') || scd.includes('ita.4')) return 'ita.4';
        if (text.includes('serie c') || text.includes('serie-c') || text.includes('lega pro') || scd.includes('ita.3')) return 'ita.3';
        if (text.includes('serie b') || scd.includes('serie-b') || scd.includes('ita.2')) return 'ita.2';
        if ((/\bserie\s*a\b/i.test(text) && !text.includes('femminile')) || scd === 'ita.1') return 'ita.1';
        return 'ita.lower';
    }

    // GERMANY (Bundesliga / 2. Bundesliga / 3. Liga / Regionalliga / Oberliga / DFB-Pokal)
    const isGermany = country.includes('germany') || country.includes('german') || country.includes('deutschland') || scd.includes('ger.');
    if (isGermany || (isNeutralCountry && /\b(?:bundesliga|dfb-pokal|regionalliga|oberliga)\b/i.test(text))) {
        if (text.includes('dfb-pokal') || text.includes('dfb pokal') || scd.includes('dfb-pokal') || scd.includes('ger.dfb_pokal')) return 'ger.dfb_pokal';
        if (text.includes('supercup') || scd.includes('ger.supercup')) return 'ger.supercup';
        if (text.includes('oberliga') || text.includes('bayernliga') || text.includes('hessenliga') || scd.includes('ger.5')) return 'ger.5';
        if (text.includes('regionalliga') || scd.includes('ger.4')) return 'ger.4';
        if (text.includes('3. liga') || text.includes('3 liga') || text.includes('3.liga') || scd.includes('ger.3')) return 'ger.3';
        if (text.includes('2. bundesliga') || text.includes('2 bundesliga') || text.includes('2-bundesliga') || scd.includes('ger.2')) return 'ger.2';
        if ((text.includes('bundesliga') && !text.includes('2') && !text.includes('3') && !text.includes('frauen')) || scd === 'ger.1' || text.includes('1. bundesliga')) return 'ger.1';
        return 'ger.lower';
    }

    // FRANCE (Ligue 1 / Ligue 2 / National / Coupe de France)
    const isFrance = country.includes('france') || country.includes('french') || scd.includes('fra.');
    if (isFrance || (isNeutralCountry && /\b(?:ligue\s*1|ligue\s*2|national|coupe de france)\b/i.test(text))) {
        if (text.includes('coupe de france') || scd.includes('coupe-de-france') || scd.includes('fra.coupe_de_france')) return 'fra.coupe_de_france';
        if (text.includes('national 3') || scd.includes('fra.5')) return 'fra.5';
        if (text.includes('national 2') || scd.includes('fra.4')) return 'fra.4';
        if (text.includes('national 1') || (text.includes('national') && !text.includes('international') && !text.includes('league')) || scd.includes('fra.3')) return 'fra.3';
        if (text.includes('ligue 2') || scd.includes('fra.2')) return 'fra.2';
        if ((/\bligue\s*1\b/i.test(text) && !text.includes('arkema') && !text.includes('fem')) || scd === 'fra.1') return 'fra.1';
        return 'fra.lower';
    }

    // ENGLAND (EPL / Championship / League One / League Two / FA Cup / Carabao Cup / National Leagues)
    const isEngland = country.includes('england') || country.includes('english') || scd.includes('eng.');
    if (isEngland || (isNeutralCountry && (text.includes('premier league') || text.includes('championship') || text.includes('league 1') || text.includes('league 2') || text.includes('fa cup') || text.includes('efl')))) {
        const foreignIndicators = ['egypt', 'ghana', 'kenya', 'uganda', 'singapore', 'bahrain', 'canada', 'scotland', 'russia', 'ukraine', 'kuwait', 'new zealand', 'ireland', 'wales', 'jamaica', 'india', 'nigeria', 'south africa', 'tanzania', 'zambia', 'zimbabwe', 'ethiopia', 'rwanda', 'congo', 'cameroon', 'ivory', 'algeria', 'tunisia', 'sudan', 'angola', 'botswana', 'malawi', 'bangladesh', 'hong kong', 'malta', 'israel', 'kazakhstan', 'northern ireland', 'armenia', 'azerbaijan', 'georgia', 'belarus', 'libya', 'nbc', 'ligi kuu', 'psl', 'npfl', 'korea', 'south korea', 'k-league', 'kleague', 'china', 'chinese', 'csl', 'japan', 'j-league'];
        const hasForeign = foreignIndicators.some(f => text.includes(f) || country.includes(f));
        if (!hasForeign && !isKorea && !isChina && !isJapan) {
            if (text.includes('northern premier') || text.includes('eng.northern')) return 'eng.northern';
            if (text.includes('southern premier') || text.includes('eng.southern')) return 'eng.southern';
            if (text.includes('isthmian') || text.includes('eng.isthmian')) return 'eng.isthmian';
            if (text.includes('national league north') || text.includes('national league south') || text.includes('eng.6')) return 'eng.6';
            if (text.includes('national league') || text.includes('eng.5')) return 'eng.5';
            if (text.includes('eng.4') || ((text.includes('league two') || text.includes('league 2')) && !text.includes('afc'))) return 'eng.4';
            if (text.includes('eng.3') || ((text.includes('league one') || text.includes('league 1')) && !text.includes('ligue 1'))) return 'eng.3';
            if (text.includes('efl championship') || text.includes('english championship') || (text.includes('championship') && (text.includes('eng') || text.includes('efl') || text.includes('sky bet'))) || text.includes('eng.2') || scd === 'championship') return 'eng.2';
            if (text.includes('fa cup') || text.includes('eng.fa')) return 'eng.fa';
            if (text.includes('carabao') || text.includes('efl cup') || (text.includes('league cup') && !text.includes('scot') && !text.includes('thai') && !text.includes('egypt')) || text.includes('eng.league_cup')) return 'eng.league_cup';
            if ((text.includes('efl trophy') || scd.includes('efl-trophy') || (text.includes('trophy') && (text.includes('papa john') || text.includes('bristol') || isEngland))) && !text.includes('korea') && !text.includes('china')) return 'eng.trophy';
            if (((text.includes('premier league') || text.includes('epl')) && !text.includes('2') && !text.includes('u21') && !text.includes('u18')) || scd === 'eng.1') return 'eng.1';
            return 'eng.lower';
        }
    }

    // 10. Friendlies
    if (text.includes('club friendly') || text.includes('friendly') || scd.includes('friendly')) return 'club.friendly';

    // 11. Foreign Country Fallback: if a specific foreign country was provided, map to that country's tier 1
    if (country && !isNeutralCountry) {
        const cSlug = country.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 3);
        if (cSlug && cSlug.length >= 2) {
            return `${cSlug}.1`;
        }
    }

    // 12. Clean Universal Fallback: derive from altGameNote or compDesc so NO live matches are ever dropped
    const cleanTitle = (altGameNote || compDesc || '').split(',')[0].trim();
    if (cleanTitle) {
        const slugified = cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 32);
        if (slugified.length >= 3) return slugified;
    }
    return null;
}

function formatLiveScoreLogo(img) {
    if (!img) return '';
    if (img.startsWith('http')) {
        return img.replace('https://static.livescore.com/', 'https://storage.livescore.com/images/team/medium/');
    }
    const clean = img.replace(/^\/+/, '');
    return `https://storage.livescore.com/images/team/medium/${clean}`;
}

async function fetchLiveScoreMatchDetails(eventId) {
    if (!eventId) return null;
    const eid = String(eventId).trim();

    try {
        const [statsData, incsData, lineupsData, infoData] = await Promise.all([
            fetchJson(`https://prod-public-api.livescore.com/v1/api/app/statistics/soccer/${eid}`).catch(() => null),
            fetchJson(`https://prod-public-api.livescore.com/v1/api/app/incidents/soccer/${eid}`).catch(() => null),
            fetchJson(`https://prod-public-api.livescore.com/v1/api/app/lineups/soccer/${eid}`).catch(() => null),
            fetchJson(`https://prod-public-api.livescore.com/v1/api/app/info/soccer/${eid}`).catch(() => null)
        ]);

        const result = {};

        // 1. In-play boxscore statistics
        if (statsData?.Stat?.length) {
            const hStat = statsData.Stat.find(s => s.Tnb === 1) || statsData.Stat[0] || {};
            const aStat = statsData.Stat.find(s => s.Tnb === 2) || statsData.Stat[1] || {};

            const mapStats = (s) => [
                { name: 'possessionPct', displayName: 'Possession', displayValue: `${s.Pss ?? 50}%`, value: s.Pss ?? 50 },
                { name: 'shotsOnTarget', displayName: 'Shots on Target', displayValue: `${s.Shon ?? 0}`, value: s.Shon ?? 0 },
                { name: 'shotsOffTarget', displayName: 'Shots off Target', displayValue: `${s.Shof ?? 0}`, value: s.Shof ?? 0 },
                { name: 'totalShots', displayName: 'Total Shots', displayValue: `${(s.Shon || 0) + (s.Shof || 0) + (s.Shbl || 0)}`, value: (s.Shon || 0) + (s.Shof || 0) + (s.Shbl || 0) },
                { name: 'wonCorners', displayName: 'Corner Kicks', displayValue: `${s.Cos ?? 0}`, value: s.Cos ?? 0 },
                { name: 'foulsCommitted', displayName: 'Fouls', displayValue: `${s.Fls ?? 0}`, value: s.Fls ?? 0 },
                { name: 'foulsCommited', displayName: 'Fouls', displayValue: `${s.Fls ?? 0}`, value: s.Fls ?? 0 },
                { name: 'offsides', displayName: 'Offsides', displayValue: `${s.Ofs ?? 0}`, value: s.Ofs ?? 0 },
                { name: 'yellowCards', displayName: 'Yellow Cards', displayValue: `${s.Ycs ?? 0}`, value: s.Ycs ?? 0 },
                { name: 'redCards', displayName: 'Red Cards', displayValue: `${s.Rcs ?? 0}`, value: s.Rcs ?? 0 },
                { name: 'saves', displayName: 'Goalkeeper Saves', displayValue: `${s.Gks ?? 0}`, value: s.Gks ?? 0 },
                { name: 'expectedGoals', displayName: 'Expected Goals (xG)', displayValue: `${s.Xg ?? 0}`, value: s.Xg ?? 0 }
            ];

            result.boxscore = {
                teams: [
                    { id: 'home', homeAway: 'home', statistics: mapStats(hStat) },
                    { id: 'away', homeAway: 'away', statistics: mapStats(aStat) }
                ]
            };
        }

        // 2. Key events / match timeline (goals, cards, substitutions)
        if (incsData?.Incs) {
            const keyEvents = [];
            const periods = Object.keys(incsData.Incs);
            for (const p of periods) {
                for (const inc of (incsData.Incs[p] || [])) {
                    const min = inc.Min || 0;
                    const isHome = inc.Nm === 1;
                    let type = 'event';
                    let text = inc.Pn || inc.Fn ? `${inc.Fn || ''} ${inc.Ln || inc.Pn || ''}`.trim() : 'Event';
                    let scoringPlay = false;
                    let yellowCard = false;
                    let redCard = false;
                    let substitution = false;

                    if (inc.IT === 36 || inc.IT === 37) {
                        type = 'Goal';
                        scoringPlay = true;
                        text = `Goal! ${text}`;
                        if (inc.Sc) text += ` (${inc.Sc[0]}-${inc.Sc[1]})`;
                    } else if (inc.IT === 43) {
                        type = 'Yellow Card';
                        yellowCard = true;
                        text = `Yellow Card: ${text}`;
                    } else if (inc.IT === 44 || inc.IT === 45) {
                        type = 'Red Card';
                        redCard = true;
                        text = `Red Card: ${text}`;
                    } else if (inc.IT === 46 || inc.IT === 47) {
                        type = 'Substitution';
                        substitution = true;
                        text = `Substitution: ${text}`;
                    }

                    keyEvents.push({
                        id: `ls-${min}-${inc.IT || 0}-${inc.ID || Math.random()}`,
                        clock: `${min}'`,
                        clockValue: min,
                        scoringPlay,
                        yellowCard,
                        redCard,
                        substitution,
                        text,
                        type: { text: type, type },
                        team: { side: isHome ? 'home' : 'away' },
                        athletesInvolved: inc.Pn ? [{ displayName: inc.Pn, shortName: inc.Ln || inc.Pn }] : []
                    });
                }
            }
            if (keyEvents.length) result.keyEvents = keyEvents;
        }

        // 3. Lineups and rosters
        if (lineupsData?.Lu?.length) {
            const rosters = [];
            for (const lu of lineupsData.Lu) {
                const isHome = lu.Tnb === 1;
                const roster = (lu.Ps || []).map(p => ({
                    jersey: String(p.Snu || ''),
                    starter: true,
                    athlete: {
                        displayName: `${p.Fn || ''} ${p.Ln || ''}`.trim() || p.Pn || 'Player',
                        position: { abbreviation: p.Pon ? p.Pon.slice(0, 3).toUpperCase() : 'POS' }
                    },
                    position: { abbreviation: p.Pon ? p.Pon.slice(0, 3).toUpperCase() : 'POS' }
                }));
                rosters.push({
                    team: { side: isHome ? 'home' : 'away' },
                    roster
                });
            }
            if (rosters.length) result.rosters = rosters;
        }

        // 4. Stadium / venue info
        if (infoData?.Vnm) {
            result.gameInfo = {
                venue: {
                    fullName: infoData.Vnm,
                    address: {
                        city: infoData.Vcy || '',
                        country: infoData.VCnm || ''
                    }
                }
            };
        }

        return Object.keys(result).length > 0 ? result : null;
    } catch {
        return null;
    }
}

async function fetchEspnMatchDetails(leagueSlug, eventId) {
    if (!eventId) return null;
    const cleanEid = String(eventId).trim();
    try {
        // Universal /all/summary works for all ESPN football matches worldwide and prevents 400s
        let data = await fetchJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/all/summary?event=${encodeURIComponent(cleanEid)}`).catch(() => null);
        if (!data && leagueSlug && leagueSlug !== 'all') {
            data = await fetchJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/${encodeURIComponent(leagueSlug)}/summary?event=${encodeURIComponent(cleanEid)}`).catch(() => null);
        }
        if (!data) return null;

        const result = {};

        if (data.boxscore?.teams?.length) {
            result.boxscore = data.boxscore;
        }

        if (Array.isArray(data.keyEvents) && data.keyEvents.length > 0) {
            result.keyEvents = data.keyEvents;
        }

        if (Array.isArray(data.rosters) && data.rosters.length > 0) {
            result.rosters = data.rosters;
        }

        if (data.gameInfo) {
            result.gameInfo = data.gameInfo;
        }

        if (data.predictor) {
            result.predictor = data.predictor;
        }

        return Object.keys(result).length > 0 ? result : null;
    } catch {
        return null;
    }
}

function extractStatsMap(teamStatsList) {
    const map = {};
    if (!Array.isArray(teamStatsList)) return map;
    for (const item of teamStatsList) {
        if (!item) continue;
        const key = item.name;
        if (!key) continue;

        let val = Number(item.value);
        if (isNaN(val)) {
            const rawStr = String(item.displayValue || '').trim().replace(/%/g, '');
            val = parseFloat(rawStr);
        }
        if (!isNaN(val)) {
            map[key] = val;
        }
    }
    return map;
}

/**
 * High-performance batch ingestion of in-game match statistics & key incidents
 * across all worldwide leagues for live match state and Norra AI training.
 */
async function syncInGameStats({ limit = 150, onlyLive = false, forceAll = false } = {}) {
    const now = new Date();
    let statsUpdated = 0;
    let eventsInserted = 0;
    const leaguesCovered = new Set();

    try {
        let matchQuery = {};
        if (onlyLive) {
            matchQuery = { 'status.state': 'in' };
        } else if (forceAll) {
            matchQuery = { 'status.state': { $in: ['in', 'post'] } };
        } else {
            matchQuery = {
                $or: [
                    { 'status.state': 'in' },
                    {
                        'status.state': 'post',
                        $or: [
                            { 'home.stats': { $exists: false } },
                            { 'home.stats': null }
                        ]
                    }
                ]
            };
        }

        const candidateMatches = await SoccerMatch.find(matchQuery)
            .sort({ 'status.state': 1, date: -1 })
            .limit(limit)
            .lean();

        if (candidateMatches.length === 0) {
            return { totalChecked: 0, statsUpdated: 0, eventsInserted: 0, leaguesCovered: 0 };
        }

        const CONCURRENCY = 6;
        for (let i = 0; i < candidateMatches.length; i += CONCURRENCY) {
            const chunk = candidateMatches.slice(i, i + CONCURRENCY);
            await Promise.allSettled(chunk.map(async (m) => {
                const eid = m.source?.event_id;
                if (!eid) return;

                const isLiveScore = String(m.source?.provider || '').toLowerCase() === 'livescore' || String(eid).length <= 8;
                let details = null;
                let resolvedLiveScoreId = m.source?.livescore_id || (isLiveScore ? String(eid) : null);
                let resolvedEspnId = m.source?.espn_id || (!isLiveScore && /^\d{6,}$/.test(String(eid)) ? String(eid) : null);

                if (isLiveScore) {
                    details = await fetchLiveScoreMatchDetails(eid);
                    // Fallback to ESPN if LiveScore has no stats and match has an ESPN ID
                    if ((!details?.boxscore && !details?.keyEvents?.length) && resolvedEspnId) {
                        const espnDetails = await fetchEspnMatchDetails(m.league_slug, resolvedEspnId);
                        if (espnDetails?.boxscore || espnDetails?.keyEvents?.length) {
                            details = espnDetails;
                        }
                    }
                } else {
                    details = await fetchEspnMatchDetails(m.league_slug, eid);
                    // Fallback to LiveScore if ESPN has no stats and match has a LiveScore ID
                    if (!details?.boxscore && !details?.keyEvents?.length) {
                        const lsId = resolvedLiveScoreId || (String(eid).length <= 8 ? eid : null);
                        if (lsId) {
                            const lsDetails = await fetchLiveScoreMatchDetails(lsId);
                            if (lsDetails?.boxscore || lsDetails?.keyEvents?.length) {
                                details = lsDetails;
                                resolvedLiveScoreId = String(lsId);
                            }
                        }
                    }
                }

                if (!details || (!details.boxscore?.teams?.length && !details.keyEvents?.length)) {
                    if (m.status?.state === 'in' || m.status?.state === 'post') {
                        const synth = synthesizeMatchTelemetry(m, details || {});
                        if (synth?.teams?.length) {
                            if (!details) details = {};
                            details.boxscore = synth;
                        }
                    }
                }

                if (!details) return;

                leaguesCovered.add(m.league_slug);

                let homeStatsMap = null;
                let awayStatsMap = null;

                if (details.boxscore?.teams?.length) {
                    const hTeam = details.boxscore.teams.find(t => t.homeAway === 'home' || t.id === 'home') || details.boxscore.teams[0];
                    const aTeam = details.boxscore.teams.find(t => t.homeAway === 'away' || t.id === 'away') || details.boxscore.teams[1];
                    if (hTeam?.statistics?.length) homeStatsMap = extractStatsMap(hTeam.statistics);
                    if (aTeam?.statistics?.length) awayStatsMap = extractStatsMap(aTeam.statistics);
                }

                const keyEvents = Array.isArray(details.keyEvents) ? details.keyEvents : [];

                const updatePayload = {
                    last_synced_at: now
                };

                if (homeStatsMap && Object.keys(homeStatsMap).length > 0) {
                    updatePayload['home.stats'] = homeStatsMap;
                }
                if (awayStatsMap && Object.keys(awayStatsMap).length > 0) {
                    updatePayload['away.stats'] = awayStatsMap;
                }
                if (keyEvents.length > 0) {
                    updatePayload.key_events = keyEvents;
                }
                if (details.rosters?.length) {
                    updatePayload.lineups = details.rosters;
                }
                if (resolvedLiveScoreId && !m.source?.livescore_id) {
                    updatePayload['source.livescore_id'] = resolvedLiveScoreId;
                }
                if (resolvedEspnId && !m.source?.espn_id) {
                    updatePayload['source.espn_id'] = resolvedEspnId;
                }

                if (Object.keys(updatePayload).length > 1) {
                    await SoccerMatch.updateOne({ _id: m._id }, { $set: updatePayload });
                    statsUpdated++;
                }

                if (keyEvents.length > 0) {
                    const eventOps = keyEvents.map((ke, idx) => {
                        const eventKey = String(ke.id || `${eid}-${idx + 1}`);
                        return {
                            updateOne: {
                                filter: {
                                    'source.provider': m.source?.provider || (isLiveScore ? 'livescore' : 'upstream'),
                                    league_slug: m.league_slug,
                                    event_id: eid,
                                    'source.event_key': eventKey
                                },
                                update: {
                                    $set: {
                                        source: {
                                            provider: m.source?.provider || (isLiveScore ? 'livescore' : 'upstream'),
                                            event_key: eventKey,
                                            modified_at: now
                                        },
                                        league_slug: m.league_slug,
                                        event_id: eid,
                                        competition_id: m.source?.competition_id || m.league_slug,
                                        sequence: idx + 1,
                                        event_type: {
                                            id: String(ke.type?.type || ke.type?.text || 'play').toLowerCase(),
                                            name: ke.type?.text || ke.type?.type || 'Play',
                                            text: ke.text || ''
                                        },
                                        text: ke.text || '',
                                        clock: {
                                            value: ke.clockValue ? Number(ke.clockValue) * 60 : (parseInt(ke.clock, 10) || 0) * 60,
                                            display_value: String(ke.clock || '')
                                        },
                                        club: {
                                            side: ke.team?.side || 'unknown',
                                            name: ke.team?.side === 'home' ? m.home?.name : (ke.team?.side === 'away' ? m.away?.name : '')
                                        },
                                        flags: {
                                            scoring_play: Boolean(ke.scoringPlay),
                                            yellow_card: Boolean(ke.yellowCard),
                                            red_card: Boolean(ke.redCard),
                                            substitution: Boolean(ke.substitution)
                                        },
                                        valid: true
                                    },
                                    $setOnInsert: { created_at: now }
                                },
                                upsert: true
                            }
                        };
                    });

                    if (eventOps.length > 0) {
                        const writeRes = await SoccerMatchEvent.bulkWrite(eventOps, { ordered: false }).catch(() => null);
                        if (writeRes) {
                            eventsInserted += (writeRes.upsertedCount || 0) + (writeRes.modifiedCount || 0);
                        }
                    }
                }
            }));
        }
    } catch (err) {
        console.warn('[StatsSync] in-game stats ingest notice:', err.message);
    }

    return {
        totalChecked: limit,
        statsUpdated,
        eventsInserted,
        leaguesCovered: leaguesCovered.size
    };
}

/**
 * Detects team category (gender and age/reserves tier)
 */
function isReserveOrBTeamName(name = '') {
    const s = String(name || '').trim();
    if (!s) return false;
    if (/\b(u-?2[0-3]|u-?1[5-9]|youth|primavera|reserves?|development|academy)\b/i.test(s)) return true;
    if (/\s+[bB]$/.test(s) || /\s+II$/i.test(s) || /\s+2$/.test(s) || /\(b\)|\(ii\)|\(res\)/i.test(s)) return true;
    if (/\b(castilla|atl[eè]tic|fortuna|promesas|fabril|vetusta|filial)\b/i.test(s)) return true;
    return false;
}

function getTeamCategory(name = '', leagueSlug = '') {
    const s = `${name} ${leagueSlug}`.toLowerCase();
    const isWomen = /\b(women|woman|ladies|femenin[oa]?|frauen|damen|vrouwen|fem|wfc|w)\b|\(w\)/i.test(s) ||
                    s.includes('liga f') || s.includes('femenil') || s.includes('damallsvenskan') || s.includes('toppserien') ||
                    s.includes('.w.') || s.startsWith('w.') || s.endsWith('.w');
    const isYouth = /\b(u-?23|u-?21|u-?20|u-?19|u-?18|u-?17|u-?16|u-?15|youth|primavera|reserves?|development)\b|\b(ii|b)\b$/i.test(s) ||
                    s.includes('youth') || s.includes('u21') || s.includes('u23') || s.includes('u20') || s.includes('u19') || s.includes('u18') || s.includes('u17') || s.includes('primavera');
    return { isWomen, isYouth };
}

/**
 * Computes canonical match tier: 'w' (women) vs 'm' (men), and 'y' (youth/reserves) vs 's' (senior).
 * Returns e.g. 'm_s' (Men's Senior), 'm_y' (Men's Youth), 'w_s' (Women's Senior), 'w_y' (Women's Youth)
 */
function getMatchTier(homeName = '', awayName = '', leagueSlug = '') {
    const catH = getTeamCategory(homeName, leagueSlug);
    const catA = getTeamCategory(awayName, leagueSlug);
    const isWomen = catH.isWomen || catA.isWomen;
    const isYouth = catH.isYouth || catA.isYouth;
    return `${isWomen ? 'w' : 'm'}_${isYouth ? 'y' : 's'}`;
}

/**
 * Normalizes club names for robust cross-provider fuzzy matching (ESPN vs LiveScore)
 */
function normalizeTeamName(name = '') {
    if (!name) return '';
    let s = String(name).toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\([^)]*\)/g, ' ')
        // Remove gender/youth markers from base name so e.g. "Arsenal Women" and "Arsenal Ladies" match each other
        .replace(/\b(women|woman|ladies|femenin[oa]?|frauen|damen|vrouwen|fem|wfc|w)\b|\(w\)/gi, '')
        .replace(/\b(u-?23|u-?21|u-?20|u-?19|u-?18|u-?17|u-?16|u-?15|youth|reserves?|development)\b/gi, '')
        // Canonical club aliases
        .replace(/\bman\s+utd\b|\bman\s+united\b|\bmanchester\s+utd\b/g, 'manchesterunited')
        .replace(/\bman\s+city\b|\bmanchester\s+city\b/g, 'manchestercity')
        .replace(/\bspurs\b|\btottenham\s+hotspur\b/g, 'tottenham')
        .replace(/\bwolves\b|\bwolverhampton\s+wanderers\b/g, 'wolverhampton')
        .replace(/\bpsg\b|\bparis\s+sg\b|\bparis\s+saint-germain\b/g, 'parissaintgermain')
        .replace(/\batletico\s+madrid\b|\batl\.\s*madrid\b/g, 'atleticomadrid')
        .replace(/\breal\s+madrid\b/g, 'realmadrid')
        .replace(/\bbayern\s+munich\b|\bbayern\s+munchen\b/g, 'bayernmunich')
        .replace(/\bdortmund\b|\bborussia\s+dortmund\b/g, 'borussiadortmund')
        .replace(/\binter\s+milan\b|\binternazionale\b|\binter\b/g, 'inter')
        .replace(/\bac\s+milan\b/g, 'acmilan')
        .replace(/\bsporting\s+cp\b|\bsporting\s+lisbon\b/g, 'sportingcp')
        .replace(/\bjuve\b|\bjuventus\b/g, 'juventus')
        .replace(/\bnewcastle\s+united\b/g, 'newcastle')
        .replace(/\bwest\s+ham\s+united\b/g, 'westham')
        .replace(/\bbrighton\s+(and|&)\s+hove\s+albion\b/g, 'brighton')
        .replace(/\bqpr\b|\bqueens\s+park\s+rangers\b/g, 'queensparkrangers')
        .replace(/\bbodoe\b|\bbodo\b/g, 'bodo')
        .replace(/\bblackburn\s+rovers\b/g, 'blackburn')
        .replace(/\bbolton\s+wanderers\b/g, 'bolton')
        .replace(/\bstoke\s+city\b/g, 'stoke')
        .replace(/\bswansea\s+city\b/g, 'swansea')
        .replace(/\bnorwich\s+city\b/g, 'norwich')
        .replace(/\bderby\s+county\b/g, 'derby')
        .replace(/\bpreston\s+north\s+end\b/g, 'preston')
        .replace(/\bsheffield\s+united\b/g, 'sheffieldunited')
        .replace(/\bsheffield\s+wednesday\b/g, 'sheffieldwednesday')
        .replace(/\bwest\s+brom\b|\bwest\s+bromwich\s+albion\b/g, 'westbrom')
        .replace(/\bbirmingham\s+city\b/g, 'birmingham')
        .replace(/\bcharlton\s+athletic\b/g, 'charlton')
        .replace(/\basante\s+kotoko\b/g, 'asantekotoko')
        .replace(/\baduana\s+stars\b/g, 'aduanastars')
        .replace(/\bhearts\s+of\s+oak\b/g, 'heartsofoak')
        .replace(/\byoung\s+africans\b|\byanga\b/g, 'youngafricans')
        .replace(/\bsimba\s+sc\b|\bsimba\b/g, 'simba')
        .replace(/\bmbeya\s+city\b/g, 'mbeyacity')
        .replace(/\bsingida\s+black\s+stars\b|\bsingida\s+bs\b/g, 'singidablackstars')
        .replace(/\bsantos\s+laguna\b/g, 'santos')
        .replace(/\bfeyenoord\s+rotterdam\b/g, 'feyenoord')
        .replace(/\bsc\s+heerenveen\b/g, 'heerenveen')
        .replace(/\bcomo\s+1907\b|\bcalcio\s+como\b/g, 'como')
        // Strip common non-distinct club markers like Club, FC, CF, etc. and foundation years (e.g. Como 1907 -> como)
        .replace(/\b(club|clube|csd|deportivo|fc|cf|sc|ac|cd|ceif|afc|fk|sk|sv|ssc|as|rc|ud|rb|calcio|sad|sa)\b/gi, '')
        .replace(/\b(de\s+)?(junin|resistencia|cordoba|la\s+plata)\b/gi, '')
        .replace(/\b(18\d{2}|19\d{2}|20\d{2})\b/g, '')
        .replace(/\b(04|05|96|98)\b/g, '')
        .replace(/[^a-z0-9]/g, '')
        .trim();
    return s;
}

function areTeamNamesMatching(nameA = '', nameB = '', leagueSlugA = '', leagueSlugB = '') {
    if (!nameA || !nameB) return false;
    const catA = getTeamCategory(nameA, leagueSlugA);
    const catB = getTeamCategory(nameB, leagueSlugB);
    if (catA.isWomen !== catB.isWomen) return false;
    if (catA.isYouth !== catB.isYouth) return false;

    // Block cross-country fuzzy matches (Korean teams must not match English fixtures etc.)
    if (leagueSlugA && leagueSlugB) {
        const cA = String(leagueSlugA).split('.')[0];
        const cB = String(leagueSlugB).split('.')[0];
        if (cA && cB && cA !== cB && cA !== 'intl' && cB !== 'intl') return false;
    }

    const a = normalizeTeamName(nameA);
    const b = normalizeTeamName(nameB);
    if (!a || !b) return false;
    if (a === b) return true;

    const shorter = a.length <= b.length ? a : b;
    const longer = a.length > b.length ? a : b;
    // Require substantial containment (min 5 chars) to avoid "fc" / short false positives
    if (shorter.length >= 5 && longer.includes(shorter)) return true;

    const tokensA = a.split(/\s+/).filter(t => t.length > 2);
    const tokensB = b.split(/\s+/).filter(t => t.length > 2);
    if (tokensA.length >= 2 && tokensB.length >= 2) {
        const setB = new Set(tokensB);
        const overlap = tokensA.filter(t => setB.has(t)).length;
        if (overlap >= Math.min(tokensA.length, tokensB.length)) return true;
    }
    return false;
}

/**
 * Searches for an existing match across providers by ID, date window, and team names
 */
async function findExistingMatch({ eventId, homeName, awayName, matchDate, scoreboardDate, leagueSlug = '' }) {
    if (mongoose.connection.readyState !== 1) return null;
    if (eventId) {
        const idMatch = await SoccerMatch.findOne({
            $or: [
                { 'source.event_id': String(eventId) },
                { 'source.livescore_id': String(eventId) },
                { 'source.espn_id': String(eventId) }
            ]
        });
        if (idMatch) return idMatch;
    }

    if (!homeName || !awayName) return null;

    const dateQuery = [];
    if (scoreboardDate) {
        dateQuery.push({ scoreboard_date: scoreboardDate });
    }
    if (matchDate instanceof Date && !isNaN(matchDate.getTime())) {
        const minDate = new Date(matchDate.getTime() - 14 * 3600 * 1000);
        const maxDate = new Date(matchDate.getTime() + 14 * 3600 * 1000);
        dateQuery.push({ date: { $gte: minDate, $lte: maxDate } });
    }

    if (dateQuery.length === 0) return null;

    const candidates = await SoccerMatch.find({ $or: dateQuery }).lean();
    for (const cand of candidates) {
        const candHome = cand.home?.name || cand.home?.display_name || '';
        const candAway = cand.away?.name || cand.away?.display_name || '';
        if (areTeamNamesMatching(candHome, homeName, cand.league_slug, leagueSlug) &&
            areTeamNamesMatching(candAway, awayName, cand.league_slug, leagueSlug)) {
            return cand;
        }
    }
    return null;
}

/**
 * Resolves the primary ESPN event ID for a given match document, searching
 * cross-provider matches on the same date window if the current record originated from LiveScore.
 */
async function resolveMatchEspnId(match, rawEventId = '') {
    if (!match) return null;
    if (match.source?.espn_id && /^\d+$/.test(match.source.espn_id)) {
        return String(match.source.espn_id);
    }
    const currentEventId = String(match.source?.event_id || rawEventId || '');
    if (/^\d{6,}$/.test(currentEventId)) {
        return currentEventId;
    }
    // Cross-provider lookup: find canonical ESPN match on same date with matching teams
    if (match.date) {
        const hName = match.home?.name || match.home?.display_name || '';
        const aName = match.away?.name || match.away?.display_name || '';
        if (hName && aName) {
            const mTime = new Date(match.date).getTime();
            const minDate = new Date(mTime - 24 * 3600 * 1000);
            const maxDate = new Date(mTime + 24 * 3600 * 1000);
            const candidates = await SoccerMatch.find({
                _id: { $ne: match._id },
                date: { $gte: minDate, $lte: maxDate },
                'source.event_id': { $regex: /^\d{6,}$/ }
            }).lean();
            for (const cand of candidates) {
                const candH = cand.home?.name || cand.home?.display_name || '';
                const candA = cand.away?.name || cand.away?.display_name || '';
                if ((areTeamNamesMatching(candH, hName) && areTeamNamesMatching(candA, aName)) ||
                    (areTeamNamesMatching(candH, aName) && areTeamNamesMatching(candA, hName))) {
                    const resolvedId = String(cand.source?.event_id);
                    SoccerMatch.updateOne({ _id: match._id }, { $set: { 'source.espn_id': resolvedId } }).catch(() => {});
                    return resolvedId;
                }
            }
        }
    }
    return null;
}

let isCleanupSyncing = false;

/**
 * Auto-finalizes stuck matches older than 3 hours, re-classifies miscategorized games,
 * purges duplicate match documents, and removes accidental NCAA basketball entries
 */
async function cleanupStuckMatchesAndPurgeNcaa() {
    if (isCleanupSyncing) return;
    isCleanupSyncing = true;
    try {
        // 1. Purge NCAA basketball and non-soccer records completely
        await SoccerMatch.deleteMany({
            $or: [
                { league_slug: 'usa.ncaa' },
                { 'source.uid': /ncaa/i },
                { name: /ncaam|ncaa basketball/i },
                { note: /ncaam|ncaa basketball/i }
            ]
        });
        await SoccerLeague.deleteMany({
            $or: [
                { slug: 'usa.ncaa' },
                { name: /ncaa/i }
            ]
        });

        // 2. Auto-finalize ALL stuck in-play matches that started more than 180 minutes (3 hours) ago
        const threeHoursAgo = new Date(Date.now() - 180 * 60 * 1000);
        const finalRes = await SoccerMatch.updateMany(
            {
                'status.state': 'in',
                date: { $lt: threeHoursAgo }
            },
            {
                $set: {
                    'status.state': 'post',
                    'status.name': 'STATUS_FINAL',
                    'status.description': 'Full Time',
                    'status.detail': 'FT',
                    'status.short_detail': 'FT',
                    'status.clock': 'FT',
                    'status.completed': true
                }
            }
        );
        if (finalRes.modifiedCount > 0) {
            console.log(`🧹 [AutoFinalize] Finalized ${finalRes.modifiedCount} stale in-progress matches older than 3 hours.`);
        }

        // 3. Clean any corrupted league names starting with "International "
        const intlLeagues = await SoccerLeague.find({ name: /^international\s+/i }).lean();
        for (const l of intlLeagues) {
            const cleanName = l.name.replace(/^international\s+/i, '');
            if (cleanName && cleanName !== l.name) {
                await SoccerLeague.updateOne({ _id: l._id }, { $set: { name: cleanName } });
            }
        }

        // 4. Re-classify matches mistakenly categorized under 'eng.1'
        const misclassifiedEngMatches = await SoccerMatch.find({
            league_slug: 'eng.1',
            $or: [
                { note: /tanzan|mbeya|singida|simba|young africans|yanga|azam|mashujaa|namungo|fountain gate|kagera|pamba|ghana|aduana|berekum|ashanti|asante kotoko|medeama|hearts of oak|bechem|dreams fc|samartex|bibiani|karela|botswana|township rollers|tonota|enesia|israel|maccabi|hapoel|beitar|kuwait|al-qadsia|al-arabi|al-jahra|fahaheel|jamaica|montego bay|portmore|tivoli|arnett|tru-juice|chapelton|racing united|dunbeholden|humble lions|azerbaijan|sumqayit|shafa|belarus|torpedo zhodino|belshina|minsk|maxline|armenia|ararat|gandzasar|libya|al-ahli tripoli|al khmes|egypt|kenya|ghana|uganda|singapore|bahrain|canada|scotland|saudi|kuwait|russia|ukraine|new zealand|women|wsl|nwsl|u21|u-21|u23|northern|southern|isthmian|national league/i },
                { name: /tanzan|mbeya|singida|simba|young africans|yanga|azam|mashujaa|namungo|fountain gate|kagera|pamba|ghana|aduana|berekum|ashanti|asante kotoko|medeama|hearts of oak|bechem|dreams fc|samartex|bibiani|karela|botswana|township rollers|tonota|enesia|israel|maccabi|hapoel|beitar|kuwait|al-qadsia|al-arabi|al-jahra|fahaheel|jamaica|montego bay|portmore|tivoli|arnett|tru-juice|chapelton|racing united|dunbeholden|humble lions|azerbaijan|sumqayit|shafa|belarus|torpedo zhodino|belshina|minsk|maxline|armenia|ararat|gandzasar|libya|al-ahli tripoli|al khmes|women|ladies|femenin|frauen|u21|u-21|u23|u19|u18|u17|pl2/i },
                { 'home.name': /tanzan|mbeya|singida|simba|young africans|yanga|azam|mashujaa|namungo|fountain gate|kagera|pamba|ghana|aduana|berekum|ashanti|asante kotoko|medeama|hearts of oak|bechem|dreams fc|samartex|bibiani|karela|botswana|township rollers|tonota|enesia|israel|maccabi|hapoel|beitar|kuwait|al-qadsia|al-arabi|al-jahra|fahaheel|jamaica|montego bay|portmore|tivoli|arnett|tru-juice|chapelton|racing united|dunbeholden|humble lions|azerbaijan|sumqayit|shafa|belarus|torpedo zhodino|belshina|minsk|maxline|armenia|ararat|gandzasar|libya|al-ahli tripoli|al khmes|women|ladies|femenin|frauen|u21|u-21|u23|u19|u18|u17/i },
                { 'away.name': /tanzan|mbeya|singida|simba|young africans|yanga|azam|mashujaa|namungo|fountain gate|kagera|pamba|ghana|aduana|berekum|ashanti|asante kotoko|medeama|hearts of oak|bechem|dreams fc|samartex|bibiani|karela|botswana|township rollers|tonota|enesia|israel|maccabi|hapoel|beitar|kuwait|al-qadsia|al-arabi|al-jahra|fahaheel|jamaica|montego bay|portmore|tivoli|arnett|tru-juice|chapelton|racing united|dunbeholden|humble lions|azerbaijan|sumqayit|shafa|belarus|torpedo zhodino|belshina|minsk|maxline|armenia|ararat|gandzasar|libya|al-ahli tripoli|al khmes|women|ladies|femenin|frauen|u21|u-21|u23|u19|u18|u17/i }
            ]
        }).lean();

        const reclassOps = [];
        for (const m of misclassifiedEngMatches) {
            const rawHint = `${m.note || ''} ${m.name || ''} ${m.home?.name || ''} ${m.away?.name || ''}`;
            const newSlug = resolveLeagueSlug(rawHint, m.venue?.country || '', m.source?.uid || '');
            if (newSlug && newSlug !== 'eng.1') {
                reclassOps.push({
                    updateOne: {
                        filter: { _id: m._id },
                        update: { $set: { league_slug: newSlug } }
                    }
                });
            }
        }
        if (reclassOps.length > 0) {
            await SoccerMatch.bulkWrite(reclassOps, { ordered: false });
        }

        // 4b. Re-classify matches mistakenly categorized under 'w.other'
        const misclassifiedWOther = await SoccerMatch.find({ league_slug: 'w.other' }).lean();
        for (const m of misclassifiedWOther) {
            const rawHint = `${m.note || ''} ${m.name || ''} ${m.home?.name || ''} ${m.away?.name || ''}`;
            const newSlug = resolveLeagueSlug(rawHint, m.venue?.country || '', m.source?.uid || '') || 'w.international';
            await SoccerMatch.updateOne({ _id: m._id }, { $set: { league_slug: newSlug } });
        }
        await SoccerLeague.deleteOne({ slug: 'w.other' }).catch(() => {});

        // 4c. Re-classify matches mistakenly categorized under 'fifa.youth'
        await SoccerMatch.updateMany(
            { league_slug: 'fifa.youth' },
            { $set: { league_slug: 'uefa.youth' } }
        );
        await SoccerLeague.updateOne(
            { slug: 'uefa.youth' },
            {
                $set: {
                    name: 'UEFA Youth League',
                    abbreviation: 'Youth League',
                    country: 'Europe',
                    kind: 'club',
                    active: true,
                    sort_order: 66
                }
            },
            { upsert: true }
        );
        await SoccerLeague.deleteOne({ slug: 'fifa.youth' }).catch(() => {});

        // 4d. Re-classify matches mistakenly categorized under European Big 5
        const europeanBig5Slugs = ['ita.1', 'ita.2', 'esp.1', 'esp.2', 'ger.1', 'ger.2', 'fra.1', 'fra.2', 'eng.1', 'eng.2', 'eng.league_cup'];
        const misclassifiedRegionalMatches = await SoccerMatch.find({
            $or: [
                {
                    league_slug: { $in: europeanBig5Slugs },
                    $or: [
                        { note: /brazil|brasileir|ecuador|ligapro|guatemala|mexic|liga mx|egypt|tanzan|ghana|nigeria|kenya|uganda|benin|burkina|senegal|mali|guinea|togo|gabon|taiwan/i },
                        { name: /brazil|brasileir|ecuador|ligapro|guatemala|mexic|liga mx|egypt|chapecoense|mirassol|mushuc runa|manta|san pedro|municipal|xelaju|marquense|mbeya|singida|simba|young africans|yanga|azam|coritiba|sport recife|novorizontino|guarani|enyimba|rivers utd|plateau|remo stars|kano pillars|rangers int|bendel/i },
                        { 'home.name': /chapecoense|mirassol|mushuc runa|manta|san pedro|municipal|xelaju|marquense|america|cruz azul|guadalajara|chivas|tigres|monterrey|pachuca|toluca|santos laguna|pumas|necaxa|atlas|puebla|mazatlan|juarez|queretaro|tijuana|leon|atletico san luis|mbeya|singida|simba|young africans|yanga|azam|coritiba|sport recife|novorizontino|guarani|enyimba|rivers utd|plateau|remo stars|kano pillars|rangers int|bendel/i },
                        { 'away.name': /chapecoense|mirassol|mushuc runa|manta|san pedro|municipal|xelaju|marquense|america|cruz azul|guadalajara|chivas|tigres|monterrey|pachuca|toluca|santos laguna|pumas|necaxa|atlas|puebla|mazatlan|juarez|queretaro|tijuana|leon|atletico san luis|mbeya|singida|simba|young africans|yanga|azam|coritiba|sport recife|novorizontino|guarani|enyimba|rivers utd|plateau|remo stars|kano pillars|rangers int|bendel/i }
                    ]
                },
                {
                    league_slug: { $in: europeanBig5Slugs },
                    'venue.country': { $exists: true, $nin: ['', 'Italy', 'Spain', 'Germany', 'France', 'England', 'United Kingdom', 'Great Britain', 'Wales', 'Scotland', 'Northern Ireland', 'Europe', 'International'] }
                }
            ]
        }).lean();

        const regionalReclassOps = [];
        for (const m of misclassifiedRegionalMatches) {
            const rawHint = `${m.note || ''} ${m.name || ''} ${m.home?.name || ''} ${m.away?.name || ''}`;
            const countryHint = m.venue?.country || (m.note && /brazil/i.test(m.note) ? 'Brazil' : (m.note && /mexic/i.test(m.note) ? 'Mexico' : (m.note && /ecuador/i.test(m.note) ? 'Ecuador' : '')));
            const newSlug = resolveLeagueSlug(rawHint, countryHint, m.source?.uid || '');
            if (newSlug && newSlug !== m.league_slug) {
                regionalReclassOps.push({
                    updateOne: {
                        filter: { _id: m._id },
                        update: { $set: { league_slug: newSlug } }
                    }
                });
            }
        }
        if (regionalReclassOps.length > 0) {
            await SoccerMatch.bulkWrite(regionalReclassOps, { ordered: false });
        }

        // 4e. Re-classify Moldovan matches mistakenly categorized under Turkish Süper Lig ('tur.1')
        const misclassifiedMoldovanMatches = await SoccerMatch.find({
            league_slug: 'tur.1',
            $or: [
                { note: /moldov|zimbru|sireti|sheriff|petrocub|milsami|dacia buiucani|floresti|cupa moldovei/i },
                { name: /moldov|zimbru|sireti|sheriff|petrocub|milsami|dacia buiucani|floresti|cupa moldovei/i },
                { 'home.name': /zimbru|sireti|sheriff|petrocub|milsami|dacia buiucani|floresti|sfintul/i },
                { 'away.name': /zimbru|sireti|sheriff|petrocub|milsami|dacia buiucani|floresti|sfintul/i },
                { 'venue.country': 'Moldova' }
            ]
        }).lean().catch(() => []);

        if (misclassifiedMoldovanMatches.length > 0) {
            await SoccerMatch.updateMany(
                { _id: { $in: misclassifiedMoldovanMatches.map(m => m._id) } },
                { $set: { league_slug: 'mda.1' } }
            );
        }
        await SoccerLeague.updateOne(
            { slug: 'mda.1' },
            {
                $set: {
                    name: 'Moldovan Super Liga',
                    abbreviation: 'Super Liga',
                    country: 'Moldova',
                    kind: 'club',
                    active: true,
                    sort_order: 149
                }
            },
            { upsert: true }
        ).catch(() => {});

        // 4f. Upsert Liga Portugal 2 and re-classify any Portuguese matches mistakenly categorized under Spanish Segunda
        await SoccerLeague.updateOne(
            { slug: 'por.2' },
            {
                $set: {
                    name: 'Liga Portugal 2',
                    abbreviation: 'Liga 2',
                    country: 'Portugal',
                    kind: 'club',
                    active: true,
                    sort_order: 141
                }
            },
            { upsert: true }
        ).catch(() => {});

        await SoccerMatch.updateMany(
            {
                $or: [
                    { league_slug: 'por.2', note: /segunda divisi[oó]n|spanish/i },
                    {
                        league_slug: 'esp.2',
                        $or: [
                            { note: /felgueiras|leixoes|leixões|penafiel|pacos de ferreira|paços de ferreira|vizela|chaves|portimonense|feirense|oliveirense|torreense|alverca|maritimo|marítimo|porto b|benfica b|uniao de leiria|tondela|mafra/i },
                            { name: /felgueiras|leixoes|leixões|penafiel|vizela|feirense|oliveirense|torreense|alverca|tondela|mafra/i },
                            { 'home.name': /felgueiras|leixoes|leixões|penafiel|vizela|feirense|oliveirense|torreense|alverca|tondela|mafra/i },
                            { 'away.name': /felgueiras|leixoes|leixões|penafiel|vizela|feirense|oliveirense|torreense|alverca|tondela|mafra/i },
                            { 'venue.country': 'Portugal' }
                        ]
                    }
                ]
            },
            {
                $set: {
                    league_slug: 'por.2',
                    note: 'Liga Portugal 2'
                }
            }
        ).catch(() => {});

        // 5. Purge duplicate match documents across the past 7 days
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
        const recentMatches = await SoccerMatch.find({ date: { $gte: sevenDaysAgo } }).sort({ date: 1, _id: 1 }).lean();
        const signatureMap = new Map();
        const idsToDelete = [];

        for (const m of recentMatches) {
            const homeNorm = normalizeTeamName(m.home?.name || m.home?.display_name || '');
            const awayNorm = normalizeTeamName(m.away?.name || m.away?.display_name || '');
            if (!homeNorm || !awayNorm) continue;
            const categoryKey = getMatchTier(m.home?.name || m.home?.display_name || '', m.away?.name || m.away?.display_name || '', m.league_slug || '');
            const teamsKey = [homeNorm, awayNorm].sort().join('_vs_');
            const dateKey = m.scoreboard_date || (m.date ? m.date.toISOString().slice(0, 10) : '');
            const sig = `${teamsKey}_${dateKey}_${categoryKey}`;

            if (signatureMap.has(sig)) {
                const primary = signatureMap.get(sig);
                const currentScore = (m.home?.logo?.includes('espncdn') ? 3 : 0) + (m.source?.livescore_id ? 2 : 0) + (m.boxscore ? 2 : 0) + (m.key_events?.length ? 1 : 0);
                const primaryScore = (primary.home?.logo?.includes('espncdn') ? 3 : 0) + (primary.source?.livescore_id ? 2 : 0) + (primary.boxscore ? 2 : 0) + (primary.key_events?.length ? 1 : 0);

                const toDelete = (currentScore > primaryScore) ? primary : m;
                const winnerDoc = (currentScore > primaryScore) ? m : primary;

                const mergeUpdates = {};
                if (toDelete.source?.livescore_id && !winnerDoc.source?.livescore_id) {
                    mergeUpdates['source.livescore_id'] = toDelete.source.livescore_id;
                }
                if (toDelete.status?.state === 'in') {
                    mergeUpdates['status.state'] = toDelete.status.state;
                    mergeUpdates['status.clock'] = toDelete.status.clock;
                    mergeUpdates['status.detail'] = toDelete.status.detail;
                    mergeUpdates['status.period'] = toDelete.status.period;
                    mergeUpdates['home.score'] = toDelete.home?.score ?? winnerDoc.home?.score;
                    mergeUpdates['away.score'] = toDelete.away?.score ?? winnerDoc.away?.score;
                }
                if (Object.keys(mergeUpdates).length > 0) {
                    await SoccerMatch.updateOne({ _id: winnerDoc._id }, { $set: mergeUpdates });
                }

                if (currentScore > primaryScore) {
                    idsToDelete.push(primary._id);
                    signatureMap.set(sig, m);
                } else {
                    idsToDelete.push(m._id);
                }
            } else {
                signatureMap.set(sig, m);
            }
        }

        if (idsToDelete.length > 0) {
            await SoccerMatch.deleteMany({ _id: { $in: idsToDelete } });
            console.log(`🧹 [Deduplication] Purged ${idsToDelete.length} duplicate match documents from database.`);
        }
    } catch (err) {
        console.warn('Notice running startup match cleanup:', err.message);
    }
}

let isLiveScoreInPlaySyncing = false;

async function syncLiveScoreInPlay() {
    if (isLiveScoreInPlaySyncing) return 0;
    isLiveScoreInPlaySyncing = true;
    const now = new Date();
    let updatedCount = 0;
    try {
        const todayStr = formatDateToScoreboard(now);
        const tomorrow = new Date(now.getTime() + 86400000);
        const tomorrowStr = formatDateToScoreboard(tomorrow);
        const yesterday = new Date(now.getTime() - 86400000);
        const yesterdayStr = formatDateToScoreboard(yesterday);

        const stages = await getCachedOrFetchLiveScoreStages();
        if (stages.length === 0) return 0;

        // Preload today, tomorrow, and yesterday's existing matches from database once to eliminate N+1 DB lookups
        const existingList = await SoccerMatch.find({ scoreboard_date: { $in: [todayStr, tomorrowStr, yesterdayStr] } })
            .select('_id source league_slug name short_name date status home away venue')
            .lean()
            .catch(() => []);

        const byEventId = new Map();
        const bySig = new Map();
        for (const m of existingList) {
            if (m.source?.event_id) byEventId.set(String(m.source.event_id), m);
            if (m.source?.livescore_id) byEventId.set(String(m.source.livescore_id), m);
            if (m.source?.espn_id) byEventId.set(String(m.source.espn_id), m);
            const h = normalizeTeamName(m.home?.name || m.home?.display_name || '');
            const a = normalizeTeamName(m.away?.name || m.away?.display_name || '');
            if (h && a) {
                const tier = getMatchTier(m.home?.name || m.home?.display_name, m.away?.name || m.away?.display_name, m.league_slug);
                bySig.set(`${h}_vs_${a}_${m.league_slug}_${tier}`, m);
                bySig.set(`${h}_vs_${a}_${tier}`, m);
                bySig.set(`${a}_vs_${h}_${m.league_slug}_${tier}`, m);
                bySig.set(`${a}_vs_${h}_${tier}`, m);
            }
        }

        const matchBulkOps = [];
        const seenMatchesInBatch = new Set();

        for (const stage of stages) {
            const country = stage.Cnm || stage.Sdn || 'International';
            const leagueName = stage.Snm || 'Football Competition';
            const cLower = country.toLowerCase();

            let targetSlug = resolveLeagueSlug(leagueName, country, stage.Scd || '');
            if (!targetSlug) {
                if (cLower.includes('tanzania')) targetSlug = 'tza.1';
                else if (cLower.includes('botswana')) targetSlug = 'bwa.1';
                else if (cLower.includes('jamaica')) targetSlug = 'jam.1';
                else if (cLower.includes('israel')) targetSlug = 'isr.1';
                else if (cLower.includes('belarus')) targetSlug = 'blr.1';
                else if (cLower.includes('azerbaijan')) targetSlug = 'aze.1';
                else if (cLower.includes('armenia')) targetSlug = 'arm.1';
                else if (cLower.includes('libya')) targetSlug = 'lby.1';
                else if (cLower.includes('zambia')) targetSlug = 'zmb.1';
                else if (cLower.includes('zimbabwe')) targetSlug = 'zwe.1';
                else if (cLower.includes('rwanda')) targetSlug = 'rwa.1';
                else if (cLower.includes('congo')) targetSlug = 'cod.1';
                else if (cLower.includes('cameroon')) targetSlug = 'cmr.1';
                else if (cLower.includes('ivory') || cLower.includes('côte')) targetSlug = 'civ.1';
                else if (cLower.includes('algeria')) targetSlug = 'dza.1';
                else if (cLower.includes('tunisia')) targetSlug = 'tun.1';
                else if (cLower.includes('sudan')) targetSlug = 'sdn.1';
                else if (cLower.includes('angola')) targetSlug = 'ago.1';
                else if (cLower.includes('malawi')) targetSlug = 'mwi.1';
                else if (cLower.includes('bosnia')) targetSlug = 'bih.1';
                else if (cLower.includes('wales')) targetSlug = 'wal.1';
                else if (cLower.includes('ireland')) targetSlug = 'irl.1';
                else if (cLower.includes('indonesia')) targetSlug = 'idn.1';
                else if (cLower.includes('vietnam')) targetSlug = 'vie.1';
                else if (cLower.includes('thailand')) targetSlug = 'tha.1';
                else if (cLower.includes('malaysia')) targetSlug = 'mys.1';
                else if (cLower.includes('singapore')) targetSlug = 'sgp.1';
                else if (cLower.includes('kenya')) targetSlug = 'ken.1';
                else if (cLower.includes('ghana')) targetSlug = 'gha.1';
                else if (cLower.includes('uganda')) targetSlug = 'uga.1';
                else if (cLower.includes('india')) targetSlug = 'ind.1';
                else if (cLower.includes('iran')) targetSlug = 'irn.1';
                else if (cLower.includes('emirates') || cLower.includes('uae')) targetSlug = 'uae.1';
                else if (cLower.includes('uzbekistan')) targetSlug = 'uzb.1';
                else if (cLower.includes('romania')) targetSlug = 'rou.2';
                else if (cLower.includes('montenegro')) targetSlug = 'mne.1';
                else if (cLower.includes('qatar')) targetSlug = 'qat.1';
                else if (cLower.includes('iraq')) targetSlug = 'irq.1';
                else if (cLower.includes('jordan')) targetSlug = 'jor.1';
                else if (cLower.includes('bahrain')) targetSlug = 'bhr.1';
                else if (cLower.includes('egypt')) targetSlug = 'egy.1';
                else if (cLower.includes('saudi')) targetSlug = 'ksa.1';
                else if (cLower.includes('colombia')) targetSlug = 'col.1';
                else if (cLower.includes('morocco')) targetSlug = 'mar.1';
                else if (cLower.includes('nigeria')) targetSlug = 'nga.1';
                else if (cLower.includes('south africa')) targetSlug = 'rsa.1';
                else if (cLower.includes('brazil')) targetSlug = 'bra.1';
                else if (cLower.includes('argentina')) targetSlug = 'arg.1';
                else if (cLower.includes('korea') || cLower.includes('republic of korea')) {
                    targetSlug = /2|challenge/i.test(leagueName) ? 'kor.2' : 'kor.1';
                }
                else if (cLower.includes('china')) {
                    targetSlug = /2|jia|league one/i.test(leagueName) ? 'chn.2' : 'chn.1';
                }
                else if (cLower.includes('latvia')) targetSlug = 'lva.1';
                else if (cLower.includes('england')) {
                    const ln = leagueName.toLowerCase();
                    if (ln.includes('league two')) targetSlug = 'eng.4';
                    else if (ln.includes('league one')) targetSlug = 'eng.3';
                    else if (ln.includes('championship')) targetSlug = 'eng.2';
                    else if (ln.includes('national league')) targetSlug = 'eng.5';
                    else if (ln.includes('fa cup')) targetSlug = 'eng.fa';
                    else if (ln.includes('efl cup') || ln.includes('league cup') || ln.includes('carabao')) targetSlug = 'eng.league_cup';
                    else targetSlug = 'eng.1';
                }
                else if (cLower.includes('spain') || cLower.includes('españa')) {
                    const ln = leagueName.toLowerCase();
                    if (ln.includes('liga f') || ln.includes('femenina')) targetSlug = 'esp.w.1';
                    else if (ln.includes('copa del rey')) targetSlug = 'esp.copa_del_rey';
                    else if (ln.includes('tercera') || ln.includes('3ª rfef') || ln.includes('3. federacion')) targetSlug = 'esp.5';
                    else if (ln.includes('segunda federacion') || ln.includes('segunda federación') || ln.includes('2ª rfef') || ln.includes('2. federacion') || ln.includes('segunda rfef') || ln.includes('segunda b')) targetSlug = 'esp.4';
                    else if (ln.includes('primera rfef') || ln.includes('primera rfe') || ln.includes('1ª rfef') || ln.includes('1. federacion') || ln.includes('primera federacion')) targetSlug = 'esp.3';
                    else if (ln.includes('segunda') || ln.includes('laliga2') || ln.includes('hypermotion')) targetSlug = 'esp.2';
                    else if (ln.includes('laliga') || ln.includes('la liga') || ln.includes('primera division')) targetSlug = 'esp.1';
                    else targetSlug = 'esp.lower';
                }
                else if (cLower.includes('italy') || cLower.includes('italia')) {
                    const ln = leagueName.toLowerCase();
                    if (ln.includes('femminile')) targetSlug = 'ita.w.1';
                    else if (ln.includes('coppa italia')) targetSlug = 'ita.coppa_italia';
                    else if (ln.includes('serie d')) targetSlug = 'ita.4';
                    else if (ln.includes('serie c') || ln.includes('lega pro')) targetSlug = 'ita.3';
                    else if (ln.includes('serie b')) targetSlug = 'ita.2';
                    else if (ln.includes('serie a')) targetSlug = 'ita.1';
                    else targetSlug = 'ita.lower';
                }
                else if (cLower.includes('germany') || cLower.includes('deutschland')) {
                    const ln = leagueName.toLowerCase();
                    if (ln.includes('frauen')) targetSlug = 'ger.w.1';
                    else if (ln.includes('dfb-pokal') || ln.includes('dfb pokal')) targetSlug = 'ger.dfb_pokal';
                    else if (ln.includes('oberliga')) targetSlug = 'ger.5';
                    else if (ln.includes('regionalliga')) targetSlug = 'ger.4';
                    else if (ln.includes('3. liga') || ln.includes('3 liga')) targetSlug = 'ger.3';
                    else if (ln.includes('2. bundesliga') || ln.includes('2 bundesliga')) targetSlug = 'ger.2';
                    else if (ln.includes('bundesliga')) targetSlug = 'ger.1';
                    else targetSlug = 'ger.lower';
                }
                else if (cLower.includes('france')) {
                    const ln = leagueName.toLowerCase();
                    if (ln.includes('arkema') || ln.includes('fem')) targetSlug = 'fra.w.1';
                    else if (ln.includes('coupe de france')) targetSlug = 'fra.coupe_de_france';
                    else if (ln.includes('national 3')) targetSlug = 'fra.5';
                    else if (ln.includes('national 2')) targetSlug = 'fra.4';
                    else if (ln.includes('national 1') || (ln.includes('national') && !ln.includes('international'))) targetSlug = 'fra.3';
                    else if (ln.includes('ligue 2')) targetSlug = 'fra.2';
                    else if (ln.includes('ligue 1')) targetSlug = 'fra.1';
                    else targetSlug = 'fra.lower';
                }
                else if (cLower.includes('peru')) targetSlug = 'per.1';
                else if (cLower.includes('bolivia')) targetSlug = 'bol.1';
                else if (cLower.includes('ecuador')) targetSlug = 'ecu.1';
                else if (cLower.includes('paraguay')) targetSlug = 'par.1';
                else if (cLower.includes('venezuela')) targetSlug = 'ven.1';
                else if (cLower.includes('uruguay')) targetSlug = 'uru.1';
                else if (cLower.includes('costa rica')) targetSlug = 'crc.1';
                else if (cLower.includes('honduras')) targetSlug = 'hon.1';
                else if (cLower.includes('guatemala')) targetSlug = 'gua.1';
                else if (cLower.includes('iceland')) targetSlug = 'isl.1';
                else {
                    const cSlug = (stage.Ccd || country).toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 3);
                    const sSlug = (stage.Scd || leagueName).toLowerCase().replace(/[^a-z0-9]+/g, '.').slice(0, 16);
                    targetSlug = `${cSlug}.${sSlug}`.replace(/^\.+|\.+$/g, '');
                }
            }

            // Hard guard: slug country prefix must match stage country
            targetSlug = enforceCountryOnSlug(targetSlug, country, leagueName);

            // Never allow non-England stages to keep eng.* (common LiveScore mislabel)
            if (targetSlug && targetSlug.startsWith('eng.') && !cLower.includes('england') && !cLower.includes('united kingdom')) {
                targetSlug = enforceCountryOnSlug(null, country, leagueName) || targetSlug;
            }
            if (targetSlug && targetSlug.startsWith('esp.') && !cLower.includes('spain') && !cLower.includes('espa')) {
                targetSlug = enforceCountryOnSlug(null, country, leagueName) || targetSlug;
            }
            if (targetSlug && targetSlug.startsWith('ita.') && !cLower.includes('italy') && !cLower.includes('italia')) {
                targetSlug = enforceCountryOnSlug(null, country, leagueName) || targetSlug;
            }

            let displayName = leagueName;
            if (cLower !== 'international' && cLower !== 'world') {
                if (!leagueName.toLowerCase().startsWith(cLower)) {
                    displayName = `${country} ${leagueName}`;
                }
            } else {
                displayName = leagueName.replace(/^international\s+/i, '');
            }

            const leagueDef = TARGET_LEAGUES.find(l => l.slug === targetSlug) || {
                slug: targetSlug,
                name: displayName,
                abbreviation: leagueName.slice(0, 16),
                country: (cLower === 'international' || cLower === 'world') ? 'International' : country,
                kind: 'club'
            };

            for (const ev of (stage.Events || [])) {
                const eid = String(ev.Eid);
                if (seenMatchesInBatch.has(eid)) continue;
                seenMatchesInBatch.add(eid);

                const h = ev.T1?.[0] || {};
                const a = ev.T2?.[0] || {};
                const homeName = h.Nm || 'Home Club';
                const awayName = a.Nm || 'Away Club';

                // Keep senior top-flight boards clean — no B/II/U21 sides mixed in
                const seniorSlug = String(targetSlug || '').toLowerCase();
                const isSeniorTop = /\.[1]$/.test(seniorSlug) && !seniorSlug.includes('.w.') && !seniorSlug.includes('youth');
                if (isSeniorTop && (isReserveOrBTeamName(homeName) || isReserveOrBTeamName(awayName))) {
                    continue;
                }
                const homeScore = parseInt(ev.Tr1 || 0, 10);
                const awayScore = parseInt(ev.Tr2 || 0, 10);
                const rawClock = String(ev.Eps || ev.Epr || 'NS');

                const isNotStarted = rawClock === 'NS' || rawClock === 'Upcoming' || rawClock === '' || rawClock === 'Sched' || rawClock.includes(':');
                const isFinished = rawClock === 'FT' || rawClock === 'AET' || rawClock === 'AP';
                const isPostponed = rawClock.includes('Postp') || rawClock.includes('Canc');
                const isInPlay = !isNotStarted && !isFinished && !isPostponed;
                const state = isInPlay ? 'in' : (isFinished || isPostponed) ? 'post' : 'pre';
                const displayClock = isFinished ? 'FT' : isPostponed ? 'Postp.' : (isInPlay ? (rawClock === 'HT' ? 'HT' : (rawClock.includes("'") ? rawClock : `${rawClock}'`)) : 'NS');

                let matchDate = now;
                if (ev.Esd && String(ev.Esd).length >= 12) {
                    const s = String(ev.Esd);
                    const yr = parseInt(s.slice(0, 4), 10);
                    const mo = parseInt(s.slice(4, 6), 10) - 1;
                    const da = parseInt(s.slice(6, 8), 10);
                    const hr = parseInt(s.slice(8, 10), 10);
                    const mi = parseInt(s.slice(10, 12), 10);
                    matchDate = new Date(Date.UTC(yr, mo, da, hr, mi));
                }

                const scoreboardDate = formatDateToScoreboard(matchDate);
                const homeCrest = formatLiveScoreLogo(h.Img);
                const awayCrest = formatLiveScoreLogo(a.Img);

                // Zero-latency in-memory lookup
                const hNorm = normalizeTeamName(homeName);
                const aNorm = normalizeTeamName(awayName);
                const tier = getMatchTier(homeName, awayName, targetSlug);
                const sig = `${hNorm}_vs_${aNorm}_${tier}`;
                const existingMatch = byEventId.get(eid) || bySig.get(`${hNorm}_vs_${aNorm}_${targetSlug}_${tier}`) || bySig.get(sig);

                // Never overwrite a completed senior match with an in-play match
                if (existingMatch?.status?.completed && state === 'in') {
                    continue;
                }

                const finalHomeLogo = existingMatch?.home?.logo || homeCrest || '';
                const finalAwayLogo = existingMatch?.away?.logo || awayCrest || '';

                if (existingMatch) {
                    matchBulkOps.push({
                        updateOne: {
                            filter: { _id: existingMatch._id },
                            update: {
                                $set: {
                                    'source.livescore_id': eid,
                                    'status.state': state,
                                    'status.name': state === 'in' ? 'STATUS_IN_PROGRESS' : state === 'post' ? 'STATUS_FINAL' : 'STATUS_SCHEDULED',
                                    'status.description': state === 'in' ? 'In Progress' : state === 'post' ? (isPostponed ? 'Postponed' : 'Full Time') : 'Scheduled',
                                    'status.detail': displayClock,
                                    'status.short_detail': displayClock,
                                    'status.clock': displayClock,
                                    'status.clock_seconds': parseInt(displayClock, 10) ? parseInt(displayClock, 10) * 60 : (displayClock === 'HT' ? 2700 : 0),
                                    'status.period': ev.Epr || (displayClock === 'HT' ? 1 : 2),
                                    'status.completed': isFinished,
                                    'status.suspended': isPostponed,
                                    'home.score': isNaN(homeScore) ? (existingMatch.home?.score ?? 0) : homeScore,
                                    'away.score': isNaN(awayScore) ? (existingMatch.away?.score ?? 0) : awayScore,
                                    'home.winner': isFinished && homeScore > awayScore,
                                    'away.winner': isFinished && awayScore > homeScore,
                                    'home.logo': finalHomeLogo,
                                    'away.logo': finalAwayLogo,
                                    last_synced_at: now
                                }
                            }
                        }
                    });
                } else {
                    const matchDoc = {
                        source: {
                            provider: 'livescore',
                            event_id: eid,
                            livescore_id: eid,
                            competition_id: String(stage.CompId || stage.Sid || targetSlug),
                            uid: `ls:${eid}`,
                            modified_at: now
                        },
                        league_slug: targetSlug,
                        scoreboard_date: scoreboardDate,
                        date: matchDate,
                        name: `${homeName} vs ${awayName}`,
                        short_name: `${h.Abr || homeName.slice(0, 3)} vs ${a.Abr || awayName.slice(0, 3)}`,
                        season: {
                            year: matchDate.getUTCFullYear(),
                            type_id: '1',
                            slug: 'regular-season',
                            name: `${leagueDef.name} ${matchDate.getUTCFullYear()}`
                        },
                        status: {
                            state,
                            name: state === 'in' ? 'STATUS_IN_PROGRESS' : state === 'post' ? 'STATUS_FINAL' : 'STATUS_SCHEDULED',
                            description: state === 'in' ? 'In Progress' : state === 'post' ? (isPostponed ? 'Postponed' : 'Full Time') : 'Scheduled',
                            detail: displayClock,
                            short_detail: displayClock,
                            clock: displayClock,
                            clock_seconds: parseInt(displayClock, 10) ? parseInt(displayClock, 10) * 60 : (displayClock === 'HT' ? 2700 : 0),
                            period: ev.Epr || (displayClock === 'HT' ? 1 : 2),
                            completed: isFinished,
                            suspended: isPostponed
                        },
                        home: {
                            source_id: String(h.ID || homeName.toLowerCase().replace(/[^a-z0-9]+/g, '-')),
                            name: homeName,
                            display_name: homeName,
                            abbreviation: h.Abr || homeName.slice(0, 3).toUpperCase(),
                            logo: finalHomeLogo,
                            score: isNaN(homeScore) ? 0 : homeScore,
                            winner: isFinished && homeScore > awayScore,
                            form: ''
                        },
                        away: {
                            source_id: String(a.ID || awayName.toLowerCase().replace(/[^a-z0-9]+/g, '-')),
                            name: awayName,
                            display_name: awayName,
                            abbreviation: a.Abr || awayName.slice(0, 3).toUpperCase(),
                            logo: finalAwayLogo,
                            score: isNaN(awayScore) ? 0 : awayScore,
                            winner: isFinished && awayScore > homeScore,
                            form: ''
                        },
                        venue: {
                            name: 'Stadium',
                            city: country,
                            country
                        },
                        attendance: 0,
                        note: leagueDef.name,
                        play_by_play_available: true,
                        broadcasts: [],
                        key_events: [],
                        created_at: now,
                        last_synced_at: now
                    };

                    matchBulkOps.push({
                        updateOne: {
                            filter: { 'source.provider': 'livescore', 'source.event_id': eid, league_slug: targetSlug },
                            update: { $set: matchDoc, $setOnInsert: { created_at: now } },
                            upsert: true
                        }
                    });
                }
                updatedCount++;
            }
        }

        if (matchBulkOps.length > 0) {
            await SoccerMatch.bulkWrite(matchBulkOps, { ordered: false }).catch(e => console.warn('[LiveSync] bulkWrite matches notice:', e.message));
        }

        // Auto-finalize ANY stuck in-play matches that have concluded (started > 180 minutes ago)
        const threeHoursAgo = new Date(Date.now() - 180 * 60 * 1000);
        await SoccerMatch.updateMany(
            {
                'status.state': 'in',
                date: { $lt: threeHoursAgo }
            },
            {
                $set: {
                    'status.state': 'post',
                    'status.name': 'STATUS_FINAL',
                    'status.description': 'Full Time',
                    'status.detail': 'FT',
                    'status.short_detail': 'FT',
                    'status.clock': 'FT',
                    'status.completed': true
                }
            }
        ).catch(() => {});
    } catch (err) {
        console.warn('[LiveSync] LiveScore in-play ingest notice:', err.message);
    } finally {
        isLiveScoreInPlaySyncing = false;
    }
    return updatedCount;
}

const CORE_AND_REGIONAL_SCOREBOARD_FEEDS = [
    // Prime UEFA Continental & Youth
    'uefa.champions', 'uefa.europa', 'uefa.europa.conf', 'uefa.youth',
    // English tiers & domestic cups
    'eng.1', 'eng.2',
    // Top European domestic leagues & second tiers
    'esp.1', 'esp.2', 'ita.1', 'ger.1', 'fra.1', 'por.1', 'por.2',
    // African Premier Competitions
    'caf.champions', 'nga.1', 'gha.1', 'ken.1', 'tza.1', 'egy.1', 'rsa.1',
    // Asian continental
    'afc.champions', 'afc.cup',
    // Americas & Women's Premier
    'conmebol.libertadores', 'bra.1', 'arg.1', 'mex.1', 'mex.w.1', 'col.1', 'esp.w.1'
];

let isScoreboardSyncing = false;

async function syncLiveScoreboards() {
    if (isScoreboardSyncing) return 0;
    isScoreboardSyncing = true;
    const now = new Date();
    let updatedCount = 0;
    try {
        const todayStr = formatDateToScoreboard(now);
        const allUrl = `https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard?dates=${todayStr}&limit=300`;

        const feedResults = [await fetchJson(allUrl).catch(() => ({ events: [] }))];
        const batchSize = 5;
        for (let i = 0; i < CORE_AND_REGIONAL_SCOREBOARD_FEEDS.length; i += batchSize) {
            const batch = CORE_AND_REGIONAL_SCOREBOARD_FEEDS.slice(i, i + batchSize);
            const batchRes = await Promise.all(
                batch.map(slug =>
                    fetchJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard`)
                        .then(data => ({
                            events: (data.events || []).map(e => ({ ...e, _forcedLeagueSlug: slug }))
                        }))
                        .catch(() => ({ events: [] }))
                )
            );
            feedResults.push(...batchRes);
        }
        const events = [];
        const seenEvIds = new Set();
        for (const res of feedResults) {
            for (const ev of (res.events || [])) {
                if (!seenEvIds.has(String(ev.id))) {
                    seenEvIds.add(String(ev.id));
                    events.push(ev);
                }
            }
        }

        // Preload all today's existing matches from database once to eliminate N+1 DB lookups
        const existingScoreboardMatches = await SoccerMatch.find({ scoreboard_date: todayStr })
            .select('_id source league_slug name short_name date status home away venue')
            .lean()
            .catch(() => []);
        const byEvId = new Map();
        const byNormSig = new Map();
        for (const m of existingScoreboardMatches) {
            if (m.source?.event_id) byEvId.set(String(m.source.event_id), m);
            if (m.source?.espn_id) byEvId.set(String(m.source.espn_id), m);
            if (m.source?.livescore_id) byEvId.set(String(m.source.livescore_id), m);
            const h = normalizeTeamName(m.home?.name || m.home?.display_name || '');
            const a = normalizeTeamName(m.away?.name || m.away?.display_name || '');
            if (h && a) {
                const tier = getMatchTier(m.home?.name || m.home?.display_name, m.away?.name || m.away?.display_name, m.league_slug);
                byNormSig.set(`${h}_vs_${a}_${tier}`, m);
                byNormSig.set(`${a}_vs_${h}_${tier}`, m);
            }
        }

        const sbMatchOps = [];

        for (const ev of events) {
            const comp = ev.competitions?.[0];
            if (!comp) continue;

            const competitors = comp.competitors || [];
            const homeComp = competitors.find(c => c.homeAway === 'home') || competitors[0];
            const awayComp = competitors.find(c => c.homeAway === 'away') || competitors[1];
            if (!homeComp || !awayComp) continue;

            const statusType = ev.status?.type || {};
            const state = ['pre', 'in', 'post'].includes(statusType.state) ? statusType.state : 'pre';
            const homeScore = parseInt(homeComp.score, 10);
            const awayScore = parseInt(awayComp.score, 10);

            let targetSlug = ev._forcedLeagueSlug || resolveLeagueSlug(comp.altGameNote || '', comp.notes?.[0]?.headline || '', ev.uid || '');
            if (!targetSlug || targetSlug === 'usa.ncaa') {
                continue;
            }

            const homeCompName = homeComp.team?.displayName || homeComp.team?.name || '';
            const awayCompName = awayComp.team?.displayName || awayComp.team?.name || '';
            const eventDate = ev.date ? new Date(ev.date) : now;
            const scoreboardDate = formatDateToScoreboard(eventDate);

            // Zero-latency in-memory lookup
            const hNorm = normalizeTeamName(homeCompName);
            const aNorm = normalizeTeamName(awayCompName);
            const tier = getMatchTier(homeCompName, awayCompName, targetSlug);
            const sig = `${hNorm}_vs_${aNorm}_${tier}`;
            const existingMatch = byEvId.get(String(ev.id)) || byNormSig.get(sig);

            if (!targetSlug && existingMatch?.league_slug) {
                targetSlug = existingMatch.league_slug;
            }

            const leagueDef = TARGET_LEAGUES.find(l => l.slug === targetSlug) || {
                slug: targetSlug,
                name: comp.altGameNote ? comp.altGameNote.split(',')[0].trim().replace(/^international\s+/i, '') : 'Football Competition',
                abbreviation: comp.altGameNote ? comp.altGameNote.split(',')[0].trim().replace(/^international\s+/i, '').slice(0, 16) : 'Soccer',
                country: 'International',
                kind: 'club'
            };

            const updateFields = {
                league_slug: targetSlug,
                'status.state': state,
                'status.name': statusType.name || (state === 'in' ? 'STATUS_IN_PROGRESS' : state === 'post' ? 'STATUS_FINAL' : 'STATUS_SCHEDULED'),
                'status.description': statusType.description || (state === 'in' ? 'In Progress' : state === 'post' ? 'Full Time' : 'Scheduled'),
                'status.detail': statusType.detail || ev.status?.displayClock || statusType.shortDetail || (state === 'in' ? "45'" : state === 'post' ? 'FT' : 'Scheduled'),
                'status.short_detail': statusType.shortDetail || ev.status?.displayClock || statusType.detail || (state === 'in' ? "45'" : state === 'post' ? 'FT' : 'Scheduled'),
                'status.clock': ev.status?.displayClock || statusType.shortDetail || statusType.detail || '',
                'status.clock_seconds': ev.status?.clock || 0,
                'status.period': ev.status?.period || 1,
                'status.completed': statusType.completed || state === 'post',
                'home.score': isNaN(homeScore) ? 0 : homeScore,
                'away.score': isNaN(awayScore) ? 0 : awayScore,
                'home.winner': homeComp.winner === true,
                'away.winner': awayComp.winner === true,
                'last_synced_at': now
            };

            if (existingMatch) {
                sbMatchOps.push({
                    updateOne: {
                        filter: { _id: existingMatch._id },
                        update: {
                            $set: {
                                ...updateFields,
                                'source.espn_id': String(ev.id),
                                'home.logo': homeComp.team?.logo || existingMatch.home?.logo || '',
                                'away.logo': awayComp.team?.logo || existingMatch.away?.logo || '',
                                'home.display_name': homeCompName || existingMatch.home?.display_name || '',
                                'away.display_name': awayCompName || existingMatch.away?.display_name || ''
                            }
                        }
                    }
                });
            } else {
                const matchDoc = {
                    source: {
                        provider: 'upstream',
                        event_id: String(ev.id),
                        espn_id: String(ev.id),
                        competition_id: String(comp.id || ev.id),
                        uid: ev.uid || comp.uid || '',
                        modified_at: now
                    },
                    league_slug: targetSlug,
                    scoreboard_date: scoreboardDate,
                    date: eventDate,
                    name: ev.name || `${homeCompName} vs ${awayCompName}`,
                    short_name: ev.shortName || `${homeComp.team?.abbreviation || 'HOM'} vs ${awayComp.team?.abbreviation || 'AWY'}`,
                    season: {
                        year: eventDate.getUTCFullYear(),
                        type_id: '1',
                        slug: 'regular-season',
                        name: `${leagueDef.name} ${eventDate.getUTCFullYear()}`
                    },
                    status: {
                        state,
                        name: updateFields['status.name'],
                        description: updateFields['status.description'],
                        detail: updateFields['status.detail'],
                        short_detail: updateFields['status.short_detail'],
                        clock: updateFields['status.clock'],
                        clock_seconds: updateFields['status.clock_seconds'],
                        period: updateFields['status.period'],
                        completed: updateFields['status.completed'],
                        suspended: false
                    },
                    home: {
                        source_id: String(homeComp.team?.id || '1'),
                        name: homeCompName,
                        display_name: homeCompName,
                        abbreviation: homeComp.team?.abbreviation || '',
                        logo: homeComp.team?.logo || '',
                        score: updateFields['home.score'],
                        winner: updateFields['home.winner'],
                        form: homeComp.form || ''
                    },
                    away: {
                        source_id: String(awayComp.team?.id || '2'),
                        name: awayCompName,
                        display_name: awayCompName,
                        abbreviation: awayComp.team?.abbreviation || '',
                        logo: awayComp.team?.logo || '',
                        score: updateFields['away.score'],
                        winner: updateFields['away.winner'],
                        form: awayComp.form || ''
                    },
                    venue: {
                        name: comp.venue?.fullName || 'Stadium',
                        city: comp.venue?.address?.city || '',
                        country: comp.venue?.address?.country || leagueDef.country
                    },
                    attendance: comp.attendance || 0,
                    note: leagueDef.name,
                    play_by_play_available: true,
                    broadcasts: (comp.broadcasts || []).map(b => ({
                        market: b.market || 'National',
                        names: b.names || []
                    })),
                    key_events: [],
                    last_synced_at: now
                };

                sbMatchOps.push({
                    updateOne: {
                        filter: { 'source.provider': 'upstream', 'source.event_id': String(ev.id) },
                        update: { $set: matchDoc, $setOnInsert: { created_at: now } },
                        upsert: true
                    }
                });
            }
            updatedCount++;
        }

        if (sbMatchOps.length > 0) {
            await SoccerMatch.bulkWrite(sbMatchOps, { ordered: false }).catch(e => console.warn('[LiveSync] bulkWrite scoreboard notice:', e.message));
        }

        // Auto-finalize any in-play matches that have concluded (started > 180 minutes ago)
        await SoccerMatch.updateMany(
            {
                'status.state': 'in',
                date: { $lt: new Date(Date.now() - 180 * 60 * 1000) }
            },
            {
                $set: {
                    'status.state': 'post',
                    'status.name': 'STATUS_FINAL',
                    'status.description': 'Full Time',
                    'status.detail': 'FT',
                    'status.short_detail': 'FT',
                    'status.clock': 'FT',
                    'status.completed': true
                }
            }
        ).catch(() => {});
    } catch (err) {
        console.warn('[LiveSync] Real-time scoreboard tick warning:', err.message);
    } finally {
        isScoreboardSyncing = false;
    }
    return updatedCount;
}

module.exports = {
    syncLeague,
    syncLeagueFromLiveScoreStages,
    getCachedOrFetchLiveScoreStages,
    syncAllLeagues,
    syncLiveScoreboards,
    syncLiveScoreInPlay,
    syncInGameStats,
    cleanupStuckMatchesAndPurgeNcaa,
    getTeamCategory,
    isReserveOrBTeamName,
    hasTopFlightClub,
    demoteIfNotTopFlight,
    applyTeamAlias,
    getMatchTier,
    normalizeTeamName,
    areTeamNamesMatching,
    fetchLiveScoreMatchDetails,
    fetchEspnMatchDetails,
    formatLiveScoreLogo,
    resolveLeagueSlug,
    enforceCountryOnSlug,
    resolveMatchEspnId,
    TARGET_LEAGUES
};
