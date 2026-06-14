# FlatSplit — Shared Expenses App

Built for the Spreetail engineering internship assignment. A shared expense tracker for flat mates with CSV import, multi-currency support, and time-aware membership.

## Live App
**[https://flatsplit.vercel.app](https://flatsplit.vercel.app)** ← replace with your Vercel URL

## Tech Stack
- **Frontend + Backend:** Next.js 14 (App Router, API Routes)
- **Database:** PostgreSQL on Supabase
- **ORM:** Prisma
- **Auth:** JWT via `jose`, passwords hashed with bcrypt
- **Deploy:** Vercel
- **AI used:** Claude (Anthropic) — see AI_USAGE.md

## Setup (local)

### Prerequisites
- Node.js 18+
- A Supabase account (free tier) — or any PostgreSQL instance

### Steps

```bash
git clone https://github.com/YOUR_USERNAME/flatsplit
cd flatsplit
npm install
```

Create `.env.local`:
```
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DB?pgbouncer=true&connection_limit=1
JWT_SECRET=your-random-secret-here
```

```bash
npx prisma db push       # creates tables
npx prisma generate      # generates client
npm run dev              # starts on http://localhost:3000
```

### Deploy to Vercel
```bash
npm install -g vercel
vercel --prod
```
Add `DATABASE_URL` and `JWT_SECRET` in Vercel → Project → Settings → Environment Variables.

## Key Features

1. **Login / Register** — JWT cookie auth
2. **Groups** — create groups, members tracked with join/leave dates
3. **Expenses** — equal, unequal, percentage, share splits. All stored in INR.
4. **Multi-currency** — USD amounts converted at a documented fixed rate, original values preserved
5. **Balances** — per-person net balance + minimal debt settlement (greedy algorithm)
6. **CSV Import** — ingests `expenses_export.csv` with full anomaly detection (20 issues found and handled)
7. **Import Report** — every anomaly, action taken, severity, for Meera's approval workflow

## Project Structure

```
app/
  api/
    auth/         register, login, logout, me
    groups/       CRUD + member join/leave
    expenses/     CRUD
    settlements/  record payments
    balances/     compute net balances + settle-up
    import/       CSV import endpoint
  login/          login/register UI
  dashboard/      groups list
  groups/[id]/    expenses + balances + import tabs
lib/
  importer.ts     CSV anomaly detection (core logic)
  balances.ts     balance computation + debt minimisation
  auth.ts         JWT helpers
  prisma.ts       Prisma client singleton
prisma/
  schema.prisma   database schema (source of truth)
docs/
SCOPE.md          anomaly log + schema description
DECISIONS.md      engineering decision log
AI_USAGE.md       AI tool usage log
```

## Database Setup (Supabase — recommended)

1. Go to [supabase.com](https://supabase.com) → New project
2. Go to **SQL Editor** → paste the contents of `db/migrations/0001_init.sql` → Run
3. Go to **Settings → Database → Connection string** → copy the URI
4. Add it to `.env.local` and Vercel environment variables as `DATABASE_URL`

The migration creates all 7 tables with correct foreign keys and enum types.

## Vercel Deployment Steps

```bash
# 1. Push to GitHub
git init && git add . && git commit -m "feat: initial working app"
git remote add origin https://github.com/YOUR_USERNAME/flatsplit
git push -u origin main

# 2. Import on Vercel
# Go to vercel.com → Add New Project → Import from GitHub
# Add env vars: DATABASE_URL, JWT_SECRET
# Deploy
```

## Live Session Preparation

For the 45-min live session, be ready to explain:

- `lib/importer.ts` — every anomaly detection rule, line by line
- `lib/balances.ts` — the `computeBalances` and `minimiseDebts` algorithms
- `db/schema.ts` — why GroupMember has joinedAt/leftAt, why ExpenseSplit is a separate table
- `app/api/import/route.ts` → `computeSplits()` — how each split type is calculated
- `DECISIONS.md` — every decision, the alternatives, and why you chose what you chose
