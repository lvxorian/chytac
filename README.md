# Chytac - .cz Domain Drop Catching Monitor

Monitors `.cz` domains via the NIC.cz RDAP API and sends email alerts via Resend when a domain becomes available.

**100% free tier** — no paid services required.

## Architecture

- **Next.js 14** (App Router) — Web UI + API routes
- **Supabase** (free tier) — PostgreSQL database
- **GitHub Actions** — Cron job runs every 5 minutes (free)
- **Resend** (free tier) — Email alerts (100/day)
- **Vercel Hobby** — Web UI hosting (free)

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
3. Add environment variables in Vercel project settings
4. Deploy (Hobby plan is free)

#### GitHub Actions (Cron Job)

1. Go to your GitHub repo **Settings > Secrets and variables > Actions**
2. Add these repository secrets:
   - `DATABASE_URL` — your Supabase connection pooler URL
   - `RESEND_API_KEY` — your Resend API key
   - `ALERT_EMAIL_TO` — your email address
3. Push to `main` branch — the workflow starts automatically
4. Verify in **Actions** tab — you'll see runs every 5 minutes

The workflow is defined in `.github/workflows/check-domains.yml`.

## How It Works

1. Add `.cz` domains to your watchlist via the web UI
2. Every 5 minutes, GitHub Actions runs `scripts/check-domains.ts` which queries NIC.cz RDAP for each monitored domain
3. **HTTP 200** → domain is registered → keep monitoring
4. **HTTP 404** → domain is free → send email via Resend → mark as "caught" → stop polling
5. Domains in `pendingDelete`/`redemptionPeriod` are kept in monitoring
6. No 10-second timeout limit — GitHub Actions allows up to 6 hours per job

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
| GET | `/api/cron/check-domains` | Trigger checks manually (secured by `CRON_SECRET`) |

## Security

- Cron API endpoint requires `Authorization: Bearer <CRON_SECRET>` header
- Web UI is password-protected (single user, no registration)
- Auth uses httpOnly JWT cookies

## Notes

- Rate limiting: 500ms delay between RDAP checks, exponential backoff on 429 responses
- RDAP `Retry-After` header is respected
- Only `.cz` domains are accepted
- All services used are on free tiers — zero cost to run
