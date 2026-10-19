# Deployment and Subdomain Guide: scores.mynorra.xyz

This guide walks you through the step-by-step process of configuring the subdomain **`scores.mynorra.xyz`**, connecting your **MongoDB Atlas (M0 Free Tier)** database, and deploying the **Scores by Norra AI** platform to production.

---

## Table of Contents
1. [DNS and Subdomain Setup (`scores.mynorra.xyz`)](#1-dns-and-subdomain-setup-scoresmynorraxyz)
2. [Database Setup (MongoDB Atlas Free Tier)](#2-database-setup-mongodb-atlas-free-tier)
3. [Recommended Hosting Providers Comparison](#3-recommended-hosting-providers-comparison)
4. [Deployment Walkthroughs](#4-deployment-walkthroughs)
   - [Option A: Render.com (Recommended for Simplicity)](#option-a-rendercom-recommended-for-simplicity)
   - [Option B: Railway.app (Fastest Container Deployment)](#option-b-railwayapp-fastest-container-deployment)
   - [Option C: Linux VPS (Ubuntu/Debian with PM2, Nginx & SSL)](#option-c-linux-vps-ubuntudebian-with-pm2-nginx--ssl)
5. [Production Environment Variables Checklist](#5-production-environment-variables-checklist)
6. [Initial Admin Setup & Commercial Configuration](#6-initial-admin-setup--commercial-configuration)

---

## 1. DNS and Subdomain Setup (`scores.mynorra.xyz`)

Your main domain is **`mynorra.xyz`**. To route traffic for `scores.mynorra.xyz` to this application:

### Step 1: Open your DNS Provider (Cloudflare, Namecheap, GoDaddy, Porkbun, etc.)
Log into the dashboard where `mynorra.xyz`'s nameservers or DNS records are managed.

### Step 2: Add a DNS Record
Depending on your hosting provider, you will add either a **CNAME** or an **A** record:

- **For PaaS (Render, Railway, Fly.io, Vercel):**
  - **Type:** `CNAME`
  - **Name / Host:** `scores` (or `scores.mynorra.xyz` depending on registrar)
  - **Target / Value:** The domain provided by your host (e.g., `scores-mynorra.onrender.com` or `norra-scores.up.railway.app`)
  - **TTL:** Auto or 300 seconds
  - **Proxy Status (Cloudflare):** Set to **Proxied** (Orange Cloud) for free SSL and DDoS mitigation, or **DNS Only** (Grey Cloud) if using Render's automatic Let's Encrypt certificates.

- **For a Dedicated Linux VPS (DigitalOcean, Hetzner, AWS, Linode):**
  - **Type:** `A`
  - **Name / Host:** `scores`
  - **Target / Value:** Your VPS Public IPv4 address (e.g., `198.51.100.24`)
  - **TTL:** Auto or 300 seconds

---

## 2. Database Setup (MongoDB Atlas Free Tier)

The application uses MongoDB Atlas M0 (Free Tier forever, 512MB storage, zero credit card required).

### Step 1: Create Cluster
1. Sign up or log into [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
2. Click **Build a Database** and select **M0 Shared (Free)**.
3. Choose a cloud provider and region closest to your host (e.g., AWS Frankfurt, London, or US East).
4. Click **Create Deployment**.

### Step 2: Create a Database User
1. Under **Security** → **Database Access**, click **Add New Database User**.
2. Authentication Method: **Password**.
3. Choose a username (e.g. `norra_admin`) and a secure password.
4. Database User Privileges: Select **Read and write to any database** (or `Built-in Role: readWriteAnyDatabase`).
5. Click **Add User**.

### Step 3: Configure Network Access (IP Whitelist)
1. Under **Security** → **Network Access**, click **Add IP Address**.
2. For cloud platforms with dynamic outbound IPs (Render, Railway), click **Allow Access from Anywhere** (`0.0.0.0/0`).
3. Click **Confirm**. (MongoDB Atlas requires this so your cloud containers can connect).

### Step 4: Obtain Connection String
1. In **Deployments** → **Database**, click **Connect**.
2. Choose **Drivers** (Node.js).
3. Copy the SRV URI:
   ```
   mongodb+srv://norra_admin:<password>@cluster0.abcde.mongodb.net/soccer?retryWrites=true&w=majority&appName=NorraScores
   ```
4. Replace `<password>` with your database user password and replace the default database name with `soccer`.

---

## 3. Recommended Hosting Providers Comparison

| Feature | Render.com | Railway.app | Linux VPS (Hetzner / DO) |
| :--- | :--- | :--- | :--- |
| **Best For** | Easiest zero-maintenance setup | High-speed Docker / Git deploys | Full OS control, low monthly cost |
| **Pricing** | Free tier or $7/mo Starter | Pay-as-you-go (~$5/mo) | Fixed $4 - $6/mo |
| **Custom Domain & SSL** | 1-click automatic SSL | 1-click automatic SSL | Free with Certbot (`certbot --nginx`) |
| **Persistent Disk** | Optional add-on | Volume support | Full native disk for uploads |
| **Setup Effort** | 5 minutes | 5 minutes | 20 minutes |

---

## 4. Deployment Walkthroughs

### Option A: Render.com (Recommended for Simplicity)
1. Fork or push this repository to GitHub: `https://github.com/mikaelkraft/scores.git`.
2. Sign in to [Render.com](https://render.com) and click **New +** → **Web Service**.
3. Connect your GitHub repository `mikaelkraft/scores`.
4. Configure service settings:
   - **Name:** `scores-mynorra`
   - **Region:** Frankfurt or Oregon
   - **Branch:** `main`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. In **Environment Variables**, add the keys listed in [Section 5](#5-production-environment-variables-checklist).
6. Under **Settings** → **Custom Domains**, add `scores.mynorra.xyz`.
7. Render will provide a CNAME target. Add it in your domain registrar's DNS settings.

---

### Option B: Railway.app (Fastest Container Deployment)
1. Log into [Railway.app](https://railway.app).
2. Click **New Project** → **Deploy from GitHub repo**.
3. Select `mikaelkraft/scores`.
4. Under **Variables**, add all production environment variables.
5. Under **Settings** → **Networking** → **Custom Domain**, enter `scores.mynorra.xyz`.
6. Follow the DNS instructions given by Railway to verify the CNAME.

---

### Option C: Linux VPS (Ubuntu/Debian with PM2, Nginx & SSL)

If deploying to a VPS (e.g., Hetzner, DigitalOcean, Linode):

1. **SSH into your server:**
   ```bash
   ssh root@your-server-ip
   ```

2. **Install Node.js 22 LTS, PM2 & Nginx:**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
   sudo apt-get install -y nodejs nginx git certbot python3-certbot-nginx
   sudo npm install -g pm2
   ```

3. **Clone the repository:**
   ```bash
   cd /var/www
   git clone https://github.com/mikaelkraft/scores.git scores
   cd scores
   npm install --production
   ```

4. **Create the `.env` file:**
   ```bash
   nano .env
   # Paste production environment variables from Section 5
   ```

5. **Start application with PM2:**
   ```bash
   pm2 start index.js --name "scores-mynorra"
   pm2 save
   pm2 startup
   ```

6. **Configure Nginx reverse proxy:**
   Create `/etc/nginx/sites-available/scores.mynorra.xyz`:
   ```nginx
   server {
       server_name scores.mynorra.xyz;

       location / {
           proxy_pass http://127.0.0.1:3050;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```
   Enable site and reload Nginx:
   ```bash
   ln -s /etc/nginx/sites-available/scores.mynorra.xyz /etc/nginx/sites-enabled/
   nginx -t
   systemctl reload nginx
   ```

7. **Issue Free SSL Certificate (HTTPS):**
   ```bash
   certbot --nginx -d scores.mynorra.xyz
   ```

---

## 5. Production Environment Variables Checklist

Set these environment variables in your deployment dashboard or VPS `.env` file:

```ini
# Application Core
NODE_ENV=production
PORT=3050
PUBLIC_SITE_URL=https://scores.mynorra.xyz
API_URL=https://scores.mynorra.xyz

# MongoDB Atlas
MONGODB_URL=mongodb+srv://norra_admin:<password>@cluster0.abcde.mongodb.net/soccer?retryWrites=true&w=majority&appName=NorraScores
STRICT_DB=false

# Admin Console Security (Used for initial login at /admin)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=SetAStrongPasswordHere2026!
ADMIN_JWT_SECRET=super-secret-random-jwt-key-minimum-32-chars-long

# Payment Gateways (Leave empty or set to test keys; mock mode engages automatically if blank)
FLUTTERWAVE_PUBLIC_KEY=FLWPUBK-xxxxxxxxxxxxxxxxxxxx-X
FLUTTERWAVE_SECRET_KEY=FLWSECK-xxxxxxxxxxxxxxxxxxxx-X
FLUTTERWAVE_ENCRYPTION_KEY=FLWSECK_APxxxxxxxxxx

PAYPAL_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PAYPAL_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PAYPAL_MODE=live

# High Performance Rate Limiting
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=300
PUBLIC_RATE_LIMIT_WINDOW=60000
PUBLIC_RATE_LIMIT_MAX=180
```

---

## 6. Initial Admin Setup & Commercial Configuration

Once your app is live at `https://scores.mynorra.xyz`:

### 1. Access the Admin Console
- Navigate to **`https://scores.mynorra.xyz/admin`**.
- Sign in using your `ADMIN_USERNAME` and `ADMIN_PASSWORD`.

### 2. Branding & Logo Upload
- Under **Branding & Logos**, upload your custom header logo and footer logo.
- The built-in uploader formats and stores them directly in `/uploads/` and dynamically binds them to the site header and footer.

### 3. API Pricing Adjustment
- Under **API Plans & Commercial Pricing**, view the default USD prices:
  - **Free Tier:** $0 / month (120 req/min)
  - **Starter Tier:** $29 / month (500 req/min, Ad-free)
  - **Pro Tier:** $79 / month (1,500 req/min, Ad-free, Head-to-Head stats)
  - **Whitelabel Tier:** $249 / month (5,000 req/min, Ad-free, Custom domain iframe embed)
- Change prices or features directly in the admin console anytime without code redeployment. Client portals automatically detect user currencies and display estimated local conversions.

### 4. Sponsor Bookmaker Promo Boxes
- Under **Hero Bookmaker Promos (3-Box Grid)**, adjust the headline, promo bonus code (e.g. `NORRA100`), affiliate CTA URL, and badges for **SportyBet**, **Bet9ja**, and **MSport**.

### 5. Dynamic Ad Slots
- Enable or disable the 4 semantic ad banners (Header, In-Feed, Match Drawer, Footer).
- Paste your custom Google AdSense, direct advertiser HTML scripts, or upload sponsor image banners.
- Users who access the site with a paid API key or whitelabel embed enjoy an automated ad-free guarantee.
