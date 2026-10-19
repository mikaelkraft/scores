# Scores by Norra AI — Real-Time Live Football Scores & Commercial Sports API

An enterprise-ready, database-backed REST API and sleek livescore platform for real-time football scores, match fixtures, results, league standings, head-to-head statistics, play-by-play timelines, clubs, and commercial sports data.

- **Production Platform:** [scores.mynorra.xyz](https://scores.mynorra.xyz)
- **Developer Portal:** [scores.mynorra.xyz/account](https://scores.mynorra.xyz/account)
- **Commercial API Pricing:** [scores.mynorra.xyz/football-api](https://scores.mynorra.xyz/football-api)
- **Interactive OpenAPI Documentation:** [scores.mynorra.xyz/api-docs](https://scores.mynorra.xyz/api-docs/)
- **Deployment & Subdomain Guide:** [docs/DEPLOYMENT_AND_SUBDOMAIN_GUIDE.md](docs/DEPLOYMENT_AND_SUBDOMAIN_GUIDE.md)

---

## Key Highlights

- **Sleek Team-vs-Team Score Center:** Modern, high-contrast match cards displaying club crests, pulsing live minute badges (`● LIVE 74'`), kickoff times in detected local timezones, and full match drawers with H2H stat comparison progress bars.
- **Strict Single-Color Accent Design:** Engineered with a unified royal blue accent palette across light mode (`#f8fafc`) and dark mode (`#0b0f19`) — strictly zero cyan or turquoise.
- **Commercial API Key Infrastructure:** Sliding-window rate limiting and quota enforcement:
  - **Free Tier:** 120 req/min
  - **Starter Tier:** 500 req/min (Ad-free)
  - **Pro Tier:** 1,500 req/min (Ad-free, H2H statistics)
  - **Whitelabel Tier:** 5,000 req/min (Ad-free, custom domain embed)
- **Automated Ad-Free Guarantee:** Requests carrying paid API keys or whitelabel embed tokens automatically strip all advertisement slots.
- **Dynamic 3-Box Hero Bookmaker Promos & Ad Slots:** Fully editable via the backend admin panel. Supports sponsor codes (SportyBet, Bet9ja, MSport) and 4 semantic ad containers (Header, In-Feed, Match Drawer, Footer).
- **Payment Gateways:** Integrated with **Flutterwave** and **PayPal** for multi-currency automated checkout with fallback sandbox mock mode.
- **Betting Code Booking Hook:** Built-in extensible endpoints for betting code generation (`/api/v1/booking/generate`) and cross-bookmaker code conversion (`/api/v1/booking/convert`).
- **Admin Management Console (`/admin`):** Sized header & footer logo uploads (`multer`), live pricing adjustments in USD, ad management, and API key provisioning.
- **Customer Account Portal (`/account`):** Self-service API key generation, quota tracking, invoice history, and iframe whitelabel embed generator.
- **MongoDB Atlas Free Tier Ready:** Optimized for MongoDB M0 with automatic connection retry loops and zero serverless crash loops.

---

## Architecture Overview

```text
Upstream Data Feeds
        │
        ▼
Data Sync Listener
        │  Normalized upserts
        ▼
MongoDB Atlas (M0 Free Tier)
        │
        ├───────────────────────────────┐
        ▼                               ▼
Public Livescore Platform       Commercial Sports API
   scores.mynorra.xyz               x-api-key Auth
(Dynamic Ads & Hero Promos)     (Ad-free, Tiered Quotas)
```

The public platform never calls upstream providers directly during client requests. All data is read from MongoDB, ensuring ultra-fast response times under 20ms and complete upstream failure resilience.

---

## Public & Commercial API Endpoints

### 1. Livescore & Football Catalog
Base path: `/get/soccer`

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/get/soccer/meta` | `GET` | Service status, active leagues, match counts, and sync freshness |
| `/get/soccer/leagues` | `GET` | List verified competitions with match coverage statistics |
| `/get/soccer/{league}/fixtures` | `GET` | Filterable fixtures and results by date window (`from`, `to`, `status`) |
| `/get/soccer/{league}/events/{eventId}` | `GET` | Comprehensive match summary, lineups, scorers, and form |
| `/get/soccer/{league}/events/{eventId}/plays` | `GET` | Chronological play-by-play events (goals, cards, substitutions) |
| `/get/soccer/{league}/standings` | `GET` | League tables, groups, points, goal difference, and rankings |

### 2. Commercial API Keys & Authentication
Pass your API key in the `x-api-key` header or via query parameter `?api_key=`:

```bash
curl -H "x-api-key: nra_live_your_key_here" "https://scores.mynorra.xyz/get/soccer/eng.1/fixtures"
```

### 3. Betting Code Booking & Conversion Hooks
Base path: `/api/v1/booking`

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/v1/booking/providers` | `GET` | Returns supported bookmakers (SportyBet, Bet9ja, MSport, 1xBet, BetKing) |
| `/api/v1/booking/generate` | `POST` | Generates a booking code for match selections |
| `/api/v1/booking/convert` | `POST` | Converts a booking code from one bookmaker to another |

### 4. Commercial Payments & Checkout
Base path: `/api/v1/payments`

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/v1/payments/plans` | `GET` | Returns current subscription pricing tiers in USD |
| `/api/v1/payments/initialize` | `POST` | Initializes Flutterwave or PayPal checkout |
| `/api/v1/payments/verify/flutterwave` | `GET` | Verifies and activates a Flutterwave payment |
| `/api/v1/payments/capture/paypal` | `POST` | Captures and activates a PayPal order |

---

## Quick Start & Local Development

### Prerequisites
- Node.js 20 or newer
- MongoDB 6 or MongoDB Atlas connection URI

### 1. Installation
```bash
git clone https://github.com/mikaelkraft/scores.git
cd scores
npm install
```

### 2. Environment Configuration
Create a `.env` file in the project root:

```ini
PORT=3050
NODE_ENV=development
PUBLIC_SITE_URL=http://localhost:3050
MONGODB_URL=mongodb://localhost:27017/soccer

# Admin Credentials
ADMIN_USERNAME=admin
ADMIN_PASSWORD=AdminSecurePassword2026!
ADMIN_JWT_SECRET=norra-super-secret-jwt-key-2026

# Gateways (Leave empty for automatic mock mode)
FLUTTERWAVE_PUBLIC_KEY=
FLUTTERWAVE_SECRET_KEY=
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
```

### 3. Initialize Database Indexes & Start
```bash
# Initialize collections and indexes
npm run db:init-live

# Run tests
npm run test:soccer

# Start server
npm start
```

Access the application:
- Livescore Webapp: [http://localhost:3050](http://localhost:3050)
- Customer Developer Portal: [http://localhost:3050/account](http://localhost:3050/account)
- Admin Console: [http://localhost:3050/admin](http://localhost:3050/admin)
- Interactive API Docs: [http://localhost:3050/api-docs](http://localhost:3050/api-docs)

---

## Production Deployment & Subdomain Setup

For detailed instructions on configuring the **`scores.mynorra.xyz`** subdomain DNS CNAME, setting up MongoDB Atlas free tier, and deploying with Render, Railway, or Linux VPS, consult the comprehensive guide:

👉 [**Deployment & Subdomain Guide (docs/DEPLOYMENT_AND_SUBDOMAIN_GUIDE.md)**](docs/DEPLOYMENT_AND_SUBDOMAIN_GUIDE.md)

---

## License

ISC License. See `LICENSE` for details.
