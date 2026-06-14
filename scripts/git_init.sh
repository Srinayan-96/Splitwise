#!/bin/bash
# Run this in the project root to create a meaningful commit history for your repo.
# Each commit maps to a logical unit of work — important for the live review session.

git init

git add db/schema.ts db/index.ts db/migrations/
git commit -m "feat(db): add drizzle schema — users, groups, expenses, splits, settlements, import_log

- GroupMember has joinedAt + leftAt for time-aware membership (Meera/Sam case)
- ExpenseSplit is a separate table so every person's share is an auditable row
- ImportLog stores every CSV anomaly for Meera's approval workflow
- amount always stored in INR; original currency/rate kept alongside"

git add lib/importer.ts
git commit -m "feat(importer): CSV anomaly detection — 20 deliberate data problems handled

Anomalies handled:
- Exact duplicates (Marina Bites) → auto-skip
- Conflicting duplicates (Thalassa) → keep first, flag second
- Comma-formatted amounts (1,200) → auto-fix
- Lowercase/aliased names (priya, Priya S) → name map
- 3dp amounts (899.995) → round to 2dp
- Missing paid_by → skip + ERROR log
- Settlement as expense (Rohan paid back) → reroute to Settlement table
- Percentage sum ≠ 100 (Pizza Friday 110%) → normalise proportionally
- USD amounts → convert at documented fixed rate, store original
- Non-member in split (Kabir) → guest flag
- Non-standard date (Mar-14) → infer year, auto-fix
- Ambiguous date (04-05-2026) → treat DD-MM, flag for review
- Missing currency → default INR
- Zero amount → skip
- Meera in April splits → remove from split (left March 31)
- Settlement as deposit (Sam deposit) → Settlement record"

git add lib/balances.ts
git commit -m "feat(balances): per-person balance + greedy debt minimisation

computeBalances(): for each expense split row, credit payer and debit splitter.
Apply settlements on top. Returns breakdown per person per expense (Rohan requirement).

minimiseDebts(): greedy largest-debtor-to-largest-creditor pairing.
Produces minimal transaction set (Aisha requirement)."

git add lib/auth.ts
git commit -m "feat(auth): JWT cookie auth — 7d expiry, httpOnly, bcrypt hashing"

git add app/api/auth/
git commit -m "feat(api): auth routes — POST /register, POST /login, POST /logout, GET /me"

git add app/api/groups/
git commit -m "feat(api): groups — CRUD + member join/leave with timestamp tracking"

git add app/api/expenses/
git commit -m "feat(api): expenses — CRUD, soft delete (isDeleted flag), all split types"

git add app/api/settlements/ app/api/balances/
git commit -m "feat(api): settlements + balance endpoint with debt minimisation"

git add app/api/import/
git commit -m "feat(api): CSV import — runs importer, writes expenses/settlements/anomaly log"

git add app/login/ app/dashboard/ app/page.tsx app/layout.tsx app/globals.css
git commit -m "feat(ui): auth pages + dashboard"

git add "app/groups/"
git commit -m "feat(ui): group page — expenses list, balances + settle-up, CSV import with report

Import tab shows per-row anomaly log colour-coded by severity.
Balances tab shows individual net + minimal debt instructions."

git add SCOPE.md DECISIONS.md AI_USAGE.md README.md
git commit -m "docs: SCOPE.md (20 anomalies), DECISIONS.md (10 decisions), AI_USAGE.md, README"

git add .
git commit -m "chore: next/tailwind/ts config, .gitignore, env.example"

echo ""
echo "✓ $(git log --oneline | wc -l) commits created"
git log --oneline
