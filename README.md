# Imperial Learning — Productivity Leaderboard

A full-stack web app that turns the weekly Screenshot Monitor report into a
gamified departmental leaderboard: podiums, points, badges, streaks, monthly
champions and a company-wide department table.

**Managers sign in. Everyone else just looks.** Leaderboards are public with no
account required; only managers can upload data, and only managers see
per-person flags.

---

## Contents

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Running it locally](#running-it-locally)
- [Deploying](#deploying) → full step-by-step in [DEPLOYMENT.md](./DEPLOYMENT.md)
- [How the score works](#how-the-score-works)
- [The import pipeline](#the-import-pipeline)
- [API reference](#api-reference)
- [Things the next developer should know](#things-the-next-developer-should-know)
- [Decisions taken, and why](#decisions-taken-and-why)

---

## What it does

### For employees (no login)

| Page | What's on it |
|---|---|
| `/` | Every department, company stats, how the score works |
| `/d/[dept]` | The weekly leaderboard: podium, full standings, per-day hours, badges. Tap anyone's points to see the arithmetic |
| `/d/[dept]/monthly` | The monthly race — points added up across the month, plus the confirmed champion |
| `/company` | Department vs department, ranked by average points per person |
| `/p/[person]` | Personal profile: level, badge cabinet, form-over-time chart, week-by-week history |
| `/hall-of-fame` | Every monthly champion, plus the all-time points table |
| `/badges` | The full badge catalogue and how many times each has been earned |

### For managers (login required)

| Page | What it's for |
|---|---|
| `/admin` | Dashboard — nudges you if last week hasn't been uploaded or a draft is unpublished |
| `/admin/upload` | Drop in the report → preview → fix any unmatched name → import |
| `/admin/weeks` + `/admin/weeks/[id]` | Publish, unpublish, annotate, correct a single row, recalculate, delete |
| `/admin/roster` | Names, alternative spellings, merge duplicates, hide someone from the board |
| `/admin/prizes` | Confirm each month's champion and record the prize |
| `/admin/scoring` | Tune the weights with a **live preview** that re-ranks as you drag |
| `/admin/departments` * | Department codes, target hours, colours |
| `/admin/users` * | Create managers, reset passwords, deactivate accounts |

\* administrators only

---

## Architecture

Deliberately two separate deployables, as requested:

```
┌────────────────────────┐         ┌─────────────────────────┐
│  frontend/  → Vercel   │  HTTPS  │  backend/  → Railway    │
│                        │ ──────► │                         │
│  Next.js 14 App Router │  JSON   │  Express + TypeScript   │
│  React 18 · Tailwind   │         │  Prisma ORM             │
│  Client-side fetching  │         │  JWT auth (managers)    │
└────────────────────────┘         └───────────┬─────────────┘
                                               │
                                   ┌───────────▼─────────────┐
                                   │  PostgreSQL (Railway)   │
                                   └─────────────────────────┘
```

The frontend fetches entirely **client-side**. That is a deliberate choice: it
means a Vercel build can never fail because the API is down or an env var is
missing, and the two can be deployed in either order.

### Backend layout

```
backend/src/
├── index.ts              Express app, CORS, rate limiting, graceful shutdown
├── config.ts             Env parsing; refuses to boot in prod with a weak JWT secret
├── lib/
│   ├── prisma.ts         Prisma singleton
│   ├── auth.ts           bcrypt + JWT + password policy
│   ├── errors.ts         Typed AppError helpers
│   ├── text.ts           Name normalisation, duration & percentage parsing
│   └── period.ts         ISO weeks, month keys — all UTC, no timezone drift
├── parsers/
│   ├── pdf.ts            Coordinate-aware PDF table extraction (pdfjs)
│   ├── tabular.ts        CSV/XLSX with automatic column detection
│   └── index.ts          Routes an upload to the right parser
├── services/
│   ├── scoring.ts        Pure scoring engine — no DB, unit-testable
│   ├── badges.ts         Badge catalogue and award rules
│   ├── matching.ts       Name → person resolution (alias, exact, fuzzy)
│   ├── imports.ts        Preview + commit + recalculate
│   └── leaderboard.ts    Read models for the public site
├── middleware/           auth guard, department scoping, error handler
└── routes/               auth · public · imports · weeks · employees ·
                          departments · settings · prizes · users
```

### Frontend layout

```
frontend/src/
├── app/                  App Router pages (see tables above)
├── components/
│   ├── ui.tsx            Button, Input, Card, Modal, Notice, …
│   ├── bits.tsx          Avatar, RankBadge, RankDelta, StatTile, Meter
│   ├── charts.tsx        Hand-rolled SVG charts (no chart library)
│   ├── leaderboard.tsx   Podium, standings table, score explainer
│   └── chrome.tsx        Header and footer
└── lib/                  api client + useApi hook, auth context, formatters
```

---

## Running it locally

**Prerequisites:** Node 20+, PostgreSQL 14+.

```bash
# ── Backend ──────────────────────────────────────────────
cd backend
cp .env.example .env          # then edit DATABASE_URL
npm install
npx prisma migrate deploy     # create the schema
npm run seed                  # departments, badges, admin, sample week
npm run dev                   # → http://localhost:4000

# ── Frontend (second terminal) ───────────────────────────
cd frontend
cp .env.example .env.local    # NEXT_PUBLIC_API_URL=http://localhost:4000
npm install
npm run dev                   # → http://localhost:3000
```

Sign in with the credentials from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`
(defaults `sadeev@imperiallearning.co.uk` / `ChangeMe!2026`). You will be forced
to change the password immediately.

### What the seed creates

- All **10 departments** (Course Development + the nine others, plus Management)
- **16 badge definitions**
- The **company-wide default scoring** (50/50, 35h target)
- One **administrator** account
- The real **6–12 April 2026 Course Development week**, all 17 people, published

Set `SEED_SAMPLE_WEEK=false` to skip that last one and start empty.

---

## Deploying

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for click-by-click instructions.
Short version:

1. **Railway** — new project → add PostgreSQL → deploy `backend/` from the repo →
   set `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `JWT_SECRET`, `CORS_ORIGINS` →
   run `npm run seed` once in the shell.
2. **Vercel** — import the repo → root directory `frontend` → set
   `NEXT_PUBLIC_API_URL` to the Railway URL → deploy.
3. Go back to Railway and put the real Vercel domain into `CORS_ORIGINS`.

`backend/railway.json` and `frontend/vercel.json` are already configured;
migrations run automatically on each Railway deploy.

---

## How the score works

```
hoursScore    = min(hoursWorked / targetHours, hoursCap) / hoursCap   → 0…1
activityScore = activityPct / 100                                     → 0…1

basePoints    = maxPoints × (hoursWeight × hoursScore + activityWeight × activityScore)
points        = basePoints + bonuses
```

Defaults: `hoursWeight 0.5`, `activityWeight 0.5`, `targetHours 35`,
`hoursCap 1.1`, `maxPoints 1000`.

Bonuses: **+20** hitting target · **+25** activity ≥ 85% · **+25** new personal best.

**Worked example** — Ridma Keshan, week of 6 Apr 2026 (target reduced to 28h for
Easter Monday), 32h 45m at 100% activity:

```
ratio        = 32.75 / 28          = 1.169
cappedRatio  = min(1.169, 1.1)     = 1.1
hoursScore   = 1.1 / 1.1           = 1.00
activityScore= 100 / 100           = 1.00
basePoints   = 1000 × (0.5×1.00 + 0.5×1.00) = 1000
bonuses      = +20 (target) +25 (activity ≥85%) = 45
points       = 1045                                    ← matches the app
```

### Two design decisions worth keeping

**Hours are capped.** Full credit arrives at 1.1× target and nothing beyond.
Without a cap the leaderboard rewards the longest hours, which produces burnout
and inflated timesheets rather than good work.

**Below the qualifying threshold, people are unranked — not last.** Someone on
annual leave with 4 hours shows a `–` rather than "17th place". Default
threshold is 8 hours; change it in Settings.

### Ranking rules

- Standard competition ranking (1, 2, 2, 4) — ties share a place.
- Unqualified people sit together after the ranked block.
- Ties break for display by activity %, then hours, then name, so the order is
  stable between reruns.

---

## The import pipeline

```
      upload                preview                    commit
  ┌────────────┐      ┌─────────────────┐        ┌──────────────────┐
  │ PDF / CSV  │ ───► │ parse + match   │ ─────► │ write as DRAFT   │
  │ XLSX       │      │ NOTHING SAVED   │        │ then Publish     │
  └────────────┘      └─────────────────┘        └──────────────────┘
```

### PDF parsing

A PDF has no rows — only positioned glyphs. `parsers/pdf.ts`:

1. pulls every text run with its x/y coordinates via `pdfjs-dist`;
2. clusters on the y-axis to rebuild logical rows;
3. finds the `Employee | Duration | Activity` header and reads everything below it;
4. identifies columns **by content** (what parses as a duration, what parses as a
   percentage) rather than by fixed x offsets, so it survives column widths moving;
5. **checks its own answer** against the totals printed on the report and reports a
   warning if they disagree.

It was built and verified against the actual supplied report: 17 rows,
562h 12m total, 68.18% mean activity — an exact match to the printed
`562h 12m / 68%`.

If the table header is missing it falls back to a strict pattern scan and says
so. If the PDF is a scan with no text layer it fails loudly and tells the manager
to use CSV instead. It never silently invents a number.

### Name matching

Screenshot Monitor names are typed by humans and drift week to week. Three passes:

1. **Alias** — exact match on any spelling ever seen for that person.
2. **Exact** — match on the normalised canonical name.
3. **Fuzzy** — Levenshtein + token similarity, offered as a *suggestion* only.

Anything unresolved is presented as "new person" for the manager to confirm.
**The system never links two names on its own.** Every spelling that is confirmed
gets stored as an alias, so next week's upload matches it instantly.

### Date handling

`06/04/26 - 12/04/26` is ambiguous. The parser tries day-first and month-first and
keeps whichever produces a sane 6–7 day span — day-first for this report, giving
6–12 April 2026, cross-checked against the `Mon Apr 6 … Sun Apr 12` axis labels.

---

## API reference

Base URL: your Railway domain. All responses are JSON. Errors:
`{ "error": { "code": "...", "message": "...", "details": ... } }`

### Public — no authentication

| Method | Path | Returns |
|---|---|---|
| `GET` | `/health` | Liveness + database connectivity |
| `GET` | `/api/public/summary` | Company headline numbers |
| `GET` | `/api/public/departments` | All active departments |
| `GET` | `/api/public/departments/:slug/leaderboard?week=YYYY-MM-DD` | Podium, standings, stats, day totals, scoring config |
| `GET` | `/api/public/departments/:slug/months` | Months with published data |
| `GET` | `/api/public/departments/:slug/monthly?month=YYYY-MM` | Monthly standings + prize |
| `GET` | `/api/public/company?week=YYYY-MM-DD` | Department vs department |
| `GET` | `/api/public/employees/:slug` | Profile, level, badges, history |
| `GET` | `/api/public/hall-of-fame` | Champions + all-time table |
| `GET` | `/api/public/badges` | Badge catalogue |

Public responses have `flags` and `statId` stripped.

### Authentication

| Method | Path | Body |
|---|---|---|
| `POST` | `/api/auth/login` | `{ email, password }` → `{ token, user }` |
| `GET` | `/api/auth/me` | — |
| `POST` | `/api/auth/change-password` | `{ currentPassword, newPassword }` |

Send `Authorization: Bearer <token>` on everything below. Tokens last 8 hours.
Login is rate-limited to 10 attempts per 15 minutes per IP.

### Imports

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/imports/preview` | `multipart/form-data`: `file`, optional `departmentId`, `startDate`, `columnMap`. **Writes nothing.** |
| `POST` | `/api/imports/commit` | Creates the week as `DRAFT` (or publishes with `publishImmediately`) |
| `POST` | `/api/imports/manual` | Same shape, no file — type a week in by hand |

### Weeks

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/weeks` | `?departmentId=&status=&limit=` |
| `GET` | `/api/weeks/:id` | Full detail incl. manager-only flags |
| `PATCH` | `/api/weeks/:id` | `{ status, note, targetHoursOverride }` — changing the target re-scores |
| `POST` | `/api/weeks/:id/recalculate` | Re-run scoring with current settings |
| `PATCH` | `/api/weeks/:id/stats/:statId` | Correct one row, then re-score |
| `DELETE` | `/api/weeks/:id` | |

### Employees · Departments · Settings · Prizes · Users

| Method | Path |
|---|---|
| `GET` `POST` | `/api/employees` |
| `PATCH` `DELETE` | `/api/employees/:id` |
| `POST` | `/api/employees/:id/aliases` · `DELETE /:aliasId` |
| `POST` | `/api/employees/:id/merge` — `{ intoEmployeeId }` |
| `GET` `POST` `PATCH` `DELETE` | `/api/departments` (create/delete admin-only) |
| `GET` `PUT` | `/api/settings/scoring` — `?departmentId=` for per-department |
| `POST` | `/api/settings/scoring/preview` — try weights without saving |
| `GET` `PUT` | `/api/settings/app` |
| `GET` | `/api/prizes` · `/api/prizes/candidates?departmentId=&month=` |
| `POST` `DELETE` | `/api/prizes` · `/api/prizes/:id` |
| `GET` `POST` `PATCH` `DELETE` | `/api/users` (admin only) |
| `GET` | `/api/users/audit-log` |

---

## Things the next developer should know

**Managers are scoped to one department.** `assertDepartmentAccess()` in
`middleware/auth.ts` is the single choke point; admins bypass it. Every route
that touches department data calls it.

**Weeks are always Monday-start and always UTC.** `startOfIsoWeek()` snaps any
date to its Monday. Dates are `@db.Date` and constructed at `T00:00:00Z`. Do not
introduce `new Date()` on a date-only value without a UTC constructor or the week
will shift by a day east of Greenwich.

**A week stores the scoring config it was calculated with** (`Week.scoringSnapshot`).
Editing settings does not silently rewrite history; retroactive re-scoring is an
explicit opt-in checkbox.

**A month owns the week containing its Thursday** (ISO 8601). A week straddling
a month boundary is counted exactly once.

**Deleting is usually deactivating.** An employee with history is deactivated,
not deleted. A department with weeks is hidden, not deleted. The last active
admin cannot be removed.

**`scoring.ts` is pure.** No database, no side effects. If you change the
formula, `scoreOne` is the only place to touch, and the frontend explainer
reproduces the same arithmetic from the stored breakdown.

### Suggested next steps

- **Automate the weekly import.** Screenshot Monitor has an API; a scheduled job
  hitting `/api/imports/commit` with `sourceType: "API"` would remove the manual
  step entirely. The enum value already exists.
- **Email or Teams digest** when a week is published — "here's this week's podium".
- **Unit tests** for `scoring.ts` and `parsers/`. Both are pure functions with
  known-good fixtures available (the supplied report and its printed totals).
- **A second sample week** would exercise rank movement, streaks and personal
  bests, none of which can fire on a first week.

---

## Decisions taken, and why

**No points bonus for climbing the table.** An earlier draft awarded points for
rank improvement. That pays people for being inconsistent — the optimal strategy
becomes "have a bad week, then a normal week", repeatedly — and it is circular,
since the bonus changes the total that produced the rank. Climbing is celebrated
with the **Biggest Climber** and **Comeback** badges instead. Badges carry status,
not points, so recognition cannot be farmed for prize position.

**Nothing publishes itself.** Imports land as drafts. Monthly champions are
confirmed by a human. An automatic system that got a name wrong would embarrass
someone publicly before anyone noticed.

**The formula is public.** `/api/public/.../leaderboard` returns the exact
scoring config, and any employee can tap a score to see its arithmetic. A
leaderboard people cannot audit is a leaderboard people do not trust.

**Activity outliers are flagged, not accused.** Sustained ~100% activity is
surfaced to the manager with an explanation that it can be genuine
(data entry, video editing) or an input-simulation tool. The app states the
ambiguity and leaves the judgement to a person.

**The footer explains what activity % is not.** Thinking, reading, meetings and
phone calls all register as low activity. That caveat sits on every public page,
because a productivity leaderboard without it invites people to draw conclusions
the data cannot support.
