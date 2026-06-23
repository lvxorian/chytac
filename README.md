# Chytac - .cz Domain Drop Catching Monitor

Monitors `.cz` domains via the NIC.cz RDAP API and sends email alerts via Resend when a domain becomes available.

**100% free tier** — no paid services required.

## Architecture

- **Next.js 14** (App Router) — Web UI + API routes
- **Supabase** (free tier) — PostgreSQL database
- **External cron** (cron-job.org) — Pings Vercel endpoint every 5 minutes (free)
- **GitHub Actions** — Backup cron, handles bulk checks and notified re-checks (free, no timeout)
- **Resend** (free tier) — Email alerts (100/day)
- **Vercel Hobby** — Web UI hosting (free)

### Dual-cron design

Vercel Hobby limits serverless functions to 10 seconds. To work around this:

| Cron | Frequency | Checks | Timeout |
|---|---|---|---|
| **cron-job.org** → `/api/cron/check-domains` | Every 5 min | Up to 8 domains (prioritizes least recently checked) | 10s (Vercel limit) |
| **GitHub Actions** → `scripts/check-domains.ts` | ~1–4 hours | All 100 monitoring domains + notified re-checks | 6 hours |

External cron ensures fast detection. GitHub Actions handles the rest with no timeout.

## Setup

### 1. Supabase (Database)

1. Create a free project at [supabase.com](https://supabase.com)
2. Go to **Project Settings > Database**
3. Copy the **connection pooler** URL (Session mode, port 5432)
4. The app auto-creates tables on first run via `initDB()`

### 2. Resend (Email)

1. Create an account at [resend.com](https://resend.com)
2. Get an API key from the dashboard
3. Verify your sender domain or use Resend's test domain

### 3. Environment Variables

Copy `.env.local.example` to `.env.local` and fill in:

| Variable | Description |
|---|---|
| `DATABASE_URL` | Supabase connection pooler URL |
| `RESEND_API_KEY` | Resend API key (starts with `re_`) |
| `ALERT_EMAIL_TO` | Email to send alerts to |
| `CRON_SECRET` | Random secret for the cron API endpoint |
| `AUTH_PASSWORD` | Password to access the web dashboard |
| `JWT_SECRET` | Random secret for session tokens |

### 4. Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

To test the domain checker manually:
```bash
npm run check-domains
```

### 5. Deploy

#### Vercel (Web UI)

1. Push to GitHub
2. Import repo in Vercel dashboard
3. Add all environment variables in Vercel project settings
4. Deploy (Hobby plan is free)
5. Note your Vercel domain: `https://<project>.vercel.app`

#### GitHub Actions (Backup Cron)

1. Go to your GitHub repo **Settings > Secrets and variables > Actions**
2. Add repository secrets: `DATABASE_URL`, `RESEND_API_KEY`, `ALERT_EMAIL_TO`
3. Push to `main` branch — workflow starts automatically

#### cron-job.org (Primary Cron — every 5 minutes)

1. Create a free account at [cron-job.org](https://cron-job.org)
2. Click **Create Cron Job**
3. Configure:
   - **URL**: `https://<your-vercel-domain>.vercel.app/api/cron/check-domains`
   - **Execution schedule**: Every 5 minutes
   - **Request method**: GET
   - **Header**: `Authorization` = `Bearer <your-CRON_SECRET>`
4. Save — that's it

The cron-job.org service will ping your Vercel endpoint every 5 minutes reliably.

## How It Works

1. Add `.cz` domains to your watchlist via the web UI
2. Every 5 minutes, cron-job.org pings `/api/cron/check-domains` → checks up to 8 monitoring domains
3. GitHub Actions runs `scripts/check-domains.ts` periodically with full batch processing
4. **RDAP check** (NIC.cz API):
   - **HTTP 200** → parse status (`pendingDelete`, `redemptionPeriod`) → keep monitoring
   - **HTTP 404** → verify via **WHOIS HEAD request**
     - WHOIS 404 → domain is truly free → email alert → status `notified`
     - WHOIS 200 → domain in auction/transition → keep monitoring (no false alarm)
5. After notification, domain is re-checked every 5 min for availability status (`available` / `registered`)

## API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/login` | Login (password-based) |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/check` | Check auth status |
| GET | `/api/domains` | List all domains with recent logs |
| POST | `/api/domains` | Add domain to watchlist |
| DELETE | `/api/domains/[id]` | Remove domain |
| PATCH | `/api/domains/[id]` | Update domain status |
| GET | `/api/domains/[id]/logs` | Get check logs for a domain |
| GET | `/api/cron/check-domains` | Trigger checks (secured by `CRON_SECRET`) |

## Security

- Cron API endpoint requires `Authorization: Bearer <CRON_SECRET>` header
- Web UI is password-protected (single user, no registration)
- Auth uses httpOnly JWT cookies

## Domain State Machine

```
monitoring → RDAP check
                │
     ┌──────────┼──────────┐
     ▼          ▼          ▼
  RDAP 404   RDAP 200   error
  +WHOIS 404  (reg/tran)  
     │          │
     ▼          ▼
  notified   monitoring
  (email!)   (keep polling)
     │
     └─ re-check 5min → available / registered
```

## Notes

- Rate limiting: 500ms delay between checks, exponential backoff on 429
- RDAP 404 alone does not mean free — WHOIS HEAD request confirms
- Only `.cz` domains are accepted
- All services on free tiers — zero cost to run
