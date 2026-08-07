# Deployment guide

Backend → **Railway** (with PostgreSQL). Frontend → **Vercel**.
Allow about 30 minutes for a first deploy.

The two are completely independent: neither build reads the other at build time,
so you can deploy them in either order and redeploy one without touching the other.

---

## 0. Put the code in Git first

```bash
cd imperial-leaderboard
git init
git add .
git commit -m "Imperial Learning productivity leaderboard"
git remote add origin git@github.com:YOUR-ORG/imperial-leaderboard.git
git push -u origin main
```

Keep `backend/` and `frontend/` in **one repository**. Both platforms support
pointing at a subdirectory, and one repo means one source of truth.

`.env` files are already gitignored. Never commit real secrets.

---

## 1. Backend on Railway

### 1.1 Create the project and database

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
2. Pick the repository, then in **Settings → Source**, set
   **Root Directory** to `backend`.
3. In the same project: **New → Database → Add PostgreSQL**.

Railway creates a `Postgres` service alongside your API. They can reference each
other by name.

### 1.2 Environment variables

Open the **API service → Variables** and add:

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Type it exactly — Railway resolves the reference |
| `JWT_SECRET` | *(generate one)* | `openssl rand -base64 48`. **The API refuses to boot in production without a strong value.** |
| `JWT_EXPIRES_IN` | `8h` | |
| `CORS_ORIGINS` | `https://your-app.vercel.app` | Fill in properly at step 3 |
| `PUBLIC_SITE_URL` | `https://your-app.vercel.app` | |
| `NODE_ENV` | `production` | |
| `SEED_ADMIN_EMAIL` | `seed admin email need to add ` | |
| `SEED_ADMIN_PASSWORD` | *(a strong temporary password)* | Changed on first sign-in |
| `SEED_ADMIN_NAME` | `enter admin name ` | |
| `SEED_SAMPLE_WEEK` | `true` | `false` to start with no data |
| `MAX_UPLOAD_MB` | `15` | |

Do **not** set `PORT` — Railway injects it.

### 1.3 Deploy

`backend/railway.json` already specifies:

```
build:  npm ci && npm run build
start:  npx prisma migrate deploy && npm run start
health: /health
```

So **migrations run automatically on every deploy**. Push, and Railway builds.

### 1.4 Seed once

**API service → Settings → Networking → Generate Domain** to get a public URL.

Then open the service **Shell** (or run `railway run` locally) and execute **once**:

```bash
npm run seed
```

Expected output ends with:

```
✔ Seed complete.
```

Check it worked:

```bash
curl https://YOUR-API.up.railway.app/health
# {"status":"ok","database":"connected", ...}
```

> The seed is idempotent — running it twice will not duplicate anything — but it
> only creates the admin if no account with that email exists, and only imports
> the sample week if it is not already there.

---

## 2. Frontend on Vercel

1. [vercel.com](https://vercel.com) → **Add New → Project** → import the same repo.
2. **Root Directory:** `frontend`  ← this matters
3. Framework preset: **Next.js** (detected automatically)
4. **Environment Variables:**

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://YOUR-API.up.railway.app` (no trailing slash) |
| `NEXT_PUBLIC_SITE_NAME` | `Imperial Learning` |

Add them to **Production, Preview and Development**.

5. **Deploy.**

> `NEXT_PUBLIC_*` variables are baked in at build time. If you change one, you
> must **redeploy** — restarting is not enough.

---

## 3. Close the CORS loop

Copy your real Vercel domain and update `CORS_ORIGINS` on Railway:

```
CORS_ORIGINS=https://imperial-leaderboard.vercel.app,http://localhost:3000
```

Comma-separated, no spaces, no trailing slashes. Railway redeploys.

If you use Vercel preview deployments, include one `.vercel.app` origin in the
list — the API then also accepts `https://<anything>.vercel.app`
(see the `origin` callback in `backend/src/index.ts`).

**Symptom of getting this wrong:** the site loads but every panel says "Could not
reach the API". Open the browser console; a CORS error names the blocked origin.

---

## 4. Verify

Work through this list on the live site:

- [ ] `https://YOUR-API.up.railway.app/health` → `{"status":"ok"}`
- [ ] Home page lists 10 departments
- [ ] `/d/course-development` shows the podium (Ridma Keshan 1045 pts, if seeded)
- [ ] Tapping a score opens the explainer with visible arithmetic
- [ ] `/login` → sign in with the seeded admin → forced password change
- [ ] `/admin/upload` → drop in a report → preview appears, everyone matched
- [ ] Import as draft → `/admin/weeks/[id]` → **Publish** → appears publicly
- [ ] `/admin/scoring` → drag the balance slider → preview table re-ranks
- [ ] Sign out → `/admin` redirects to `/login`

---

## 5. First-week checklist for the manager

1. Sign in and change the password.
2. **Admin → Departments** — check every department **code** against how people
   are actually named in Screenshot Monitor. `CDD` is confirmed from the sample
   report; the other nine were seeded as sensible guesses and need verifying.
   A wrong code only means you pick the department by hand at upload time.
3. **Admin → Scoring** — set `targetHours` to your real contracted week. The
   default is 35. If everyone is pinned at the hours cap, the app tells you and
   suggests raising it.
4. **Admin → Managers** — create an account for each department head.
5. Upload a week, publish it, and share the department URL with the team.

---

## Ongoing costs

| Service | Plan | Rough cost |
|---|---|---|
| Railway API + PostgreSQL | Hobby | ~$5/month usage-based |
| Vercel | Hobby (free) or Pro | $0, or $20/user/month |

Verify current pricing on each provider — these change.

### Cutting the Railway bill with Serverless mode

For a small internal tool like this one, the API sits idle most of the day.
Railway's **Serverless** mode puts the API service to sleep after ~10 minutes
with no outbound traffic and wakes it automatically on the next request — you
stop paying for compute while it's asleep.

1. API service → **Settings → Deploy → Serverless** → toggle **Enable Serverless**.
2. Redeploy from source so the change takes effect: `Cmd/Ctrl+K` → **Deploy latest commit**
   (a plain restart is not enough).
3. Leave the **Postgres** service as-is — do not enable Serverless on it. Database
   sleep/wake has had reported issues, and the DB's own idle cost is small.

The app already disconnects its idle Prisma connection after 5 minutes
([backend/src/index.ts](backend/src/index.ts)) so the pool's keepalive traffic doesn't
block sleep — no other change is needed.

**Trade-off:** the first request after a sleep takes a few seconds longer
(cold start), and very rarely returns a 502 that succeeds on retry. Fine for
an internal team tool; avoid adding any uptime pinger/health-check monitor
against this service, since that traffic will keep it awake and cancel out
the savings.

---

## Troubleshooting

**"JWT_SECRET must be set to a strong random value in production"**
Deliberate. Set a real secret of 32+ characters that does not contain `change-me`.

**Prisma "Can't reach database server"**
`DATABASE_URL` should be the literal string `${{Postgres.DATABASE_URL}}`, not a
copied connection string — those rotate.

**Vercel build succeeds but the site shows API errors**
`NEXT_PUBLIC_API_URL` was missing at build time, or has a trailing slash. Fix and
**redeploy**.

**Upload says "No employee rows could be read from this PDF"**
Either it is a scanned image with no text layer, or the report format changed.
Export the same report as CSV or Excel and use that — the tabular importer maps
columns automatically and lets you override the mapping.

**A week imported but nobody can see it**
It is a draft. `/admin/weeks/[id]` → **Publish**.

**Someone appears twice**
Two spellings created two people. `/admin/roster` → open the duplicate →
**Merge into someone else**. Their weeks, badges and spellings move across.

### Backups

Railway takes automated PostgreSQL backups on paid plans. To take your own:

```bash
pg_dump "$DATABASE_URL" > leaderboard-$(date +%F).sql
```

The source Screenshot Monitor reports are the true system of record — as long as
you keep those, any week can be re-imported.
