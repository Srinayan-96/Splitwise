# FlatSplit — Shared Expenses App

A shared expense tracker built for the Spreetail engineering internship assignment. Four flat mates, one messy spreadsheet, and a 2-day deadline to turn it into a proper app.

**Live app:** splitwise-expense-xi.vercel.app

---

## What it does

- Register and log in (JWT auth, passwords hashed)
- Create expense groups with members who can join and leave over time
- Add expenses with four split types: equal, unequal, percentage, by shares
- Import the provided `expenses_export.csv` directly — no manual editing allowed
- Detect and surface every data problem in the CSV, handle each one deliberately
- Show group-wide balances and tell you exactly who pays whom to settle up
- Record payments when someone actually settles a debt

---

## Tech stack

| Layer              | Choice                               |
| ------------------ | ------------------------------------ |
| Frontend + Backend | Next.js 14 (App Router + API Routes) |
| Database           | PostgreSQL on Supabase               |
| ORM                | Drizzle ORM                          |
| Auth               | JWT via `jose`, bcrypt for passwords |
| Deploy             | Vercel                               |
| AI collaborator    | Claude (Anthropic) — see AI_USAGE.md |

Everything lives in one repo. One `git push` deploys both the frontend and all API routes. No separate backend server.

---

## Running locally

### You'll need

- Node.js 18 or higher
- A PostgreSQL database (Supabase free tier works perfectly)

### Steps

```bash
git clone https://github.com/YOUR_USERNAME/flatsplit
cd flatsplit
npm install
```

Create a `.env.local` file in the project root:

```
DATABASE_URL=postgresql://postgres:PASSWORD@HOST:5432/postgres
JWT_SECRET=any-random-string-you-make-up
```

Set up the database tables by running the SQL in `db/migrations/0001_init.sql` — paste it into Supabase's SQL Editor and hit Run.

Start the dev server:

```bash
npm run dev
```

App runs at `http://localhost:3000`.

---

## Deploying to Vercel

1. Push the repo to GitHub
2. Go to [vercel.com](https://vercel.com) → Add New Project → import your repo
3. Add two environment variables before deploying:
   - `DATABASE_URL` — your Supabase connection string (use the Transaction Pooler URL)
   - `JWT_SECRET` — any random string
4. Click Deploy

Vercel auto-deploys on every `git push` after that.

---

## Database setup (Supabase)

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to SQL Editor → New query → paste the contents of `db/migrations/0001_init.sql` → Run
3. Go to Settings → Database → Connection pooling → copy the Transaction Pooler URI
4. Use that URI as your `DATABASE_URL` (replace `[YOUR-PASSWORD]` with your actual password)

The migration creates 7 tables: `users`, `groups`, `group_members`, `expenses`, `expense_splits`, `settlements`, `import_logs`.

---

## Project structure

```
app/
  api/
    auth/              register, login, logout, me
    groups/            create groups, manage membership
    expenses/          add, edit, soft-delete expenses
    settlements/       record payments between members
    balances/          compute net balances + settle-up instructions
    import/            CSV import endpoint
  login/               login and register UI
  dashboard/           list of all groups
  groups/[groupId]/    group detail — expenses, balances, import tabs
db/
  schema.ts            Drizzle ORM schema (active — used for all queries)
  index.ts             database connection
  migrations/
    0001_init.sql      run this once to create all tables
prisma/
  schema.prisma        Prisma schema (documentation reference — same tables as db/schema.ts)
lib/
  importer.ts          CSV anomaly detection — the core of the assignment
  balances.ts          balance computation + debt minimisation algorithm
  auth.ts              JWT sign/verify helpers
  prisma.ts            re-exports Drizzle db client (named prisma for compatibility)
README.md
SCOPE.md               anomaly log + DB schema explanation
DECISIONS.md           every significant decision and why
AI_USAGE.md            how AI was used, and where it went wrong
```

---

## For the live session

The four files most likely to be probed:

**`lib/importer.ts`** — walks through every row of the CSV, detects 20 data problems, decides what to do with each one. Every decision is logged. No silent failures.

**`lib/balances.ts`** — `computeBalances()` builds a net position for each person from the expense splits. `minimiseDebts()` uses a greedy largest-debtor-to-largest-creditor algorithm to produce the shortest possible list of payments to settle everything.

**`db/schema.ts`** — `group_members` has `joined_at` and `left_at` columns so the app knows Sam shouldn't share February rent. `expense_splits` is a separate table so every person's exact share is a queryable row, not a JSON blob.

**`DECISIONS.md`** — every fork in the road, what else was considered, and the reasoning behind what was chosen.
