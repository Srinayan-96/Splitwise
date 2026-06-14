# SCOPE.md — Anomaly Log & Database Schema

## Database Schema

The project has two schema files:

- `prisma/schema.prisma` — readable schema documentation in Prisma format. Good for the live session — shows the full model structure at a glance.
- `db/schema.ts` — the active Drizzle ORM schema that the app actually uses for queries.

Both define the same 7 tables. `db/migrations/0001_init.sql` is what was run on Supabase to create the actual tables.

| Table | What it stores | Key design note |
|---|---|---|
| `users` | Every person — flat mates and guests | `name` is unique and is how CSV names get matched to accounts |
| `groups` | A shared expense group | Simple — just a name and an ID |
| `group_members` | Who belongs to which group, and when | Has `joined_at` and `left_at` columns — this is how the app knows Meera shouldn't share April rent and Sam shouldn't share February electricity |
| `expenses` | One row per expense | `amount` is always in INR. If the original was USD, `original_amount`, `original_currency`, and `exchange_rate` are stored alongside so nothing is lost. `import_row_num` links back to the CSV row for full traceability |
| `expense_splits` | One row per person per expense | This is the source of truth for balances. Each row says exactly what one person owes for one expense |
| `settlements` | Payment records | Separate from expenses. "Rohan paid Aisha back" is a settlement, not an expense |
| `import_logs` | Every anomaly found during CSV import | Stores what was wrong, what the app did, and the severity — this is the import report |

---

## Anomalies Found in expenses_export.csv

The CSV has at least 20 deliberate data problems. Here's every one we found, where it is, and what the app does with it.

| # | Row | Field | What's wrong | What the app does |
|---|---|---|---|---|
| 1 | 4 & 5 | description | Exact duplicate — "Dinner at Marina Bites" appears twice with the same date, amount, payer, and split | Second row is skipped. Logged as SKIPPED. |
| 2 | 6 | amount | `1,200` — comma inside the number breaks float parsing | Comma stripped, parsed as 1200. AUTO_FIXED. |
| 3 | 8 | paid_by | `priya` — all lowercase, doesn't match "Priya" | Normalised to title case. AUTO_FIXED. |
| 4 | 9 | amount | `899.995` — three decimal places, a fraction of a paisa | Rounded to ₹900.00. AUTO_FIXED. |
| 5 | 10 | paid_by | `Priya S` — different name format for the same person | Name map resolves "Priya S" → "Priya". AUTO_FIXED. |
| 6 | 12 | paid_by | Blank — no payer for "House cleaning supplies" | Can't import without knowing who paid. Row skipped. FLAGGED_FOR_REVIEW. |
| 7 | 13 | description | "Rohan paid Aisha back" — this is a payment, not an expense | Rerouted to the settlements table instead of expenses. AUTO_FIXED. |
| 8 | 14 | split_details | Pizza Friday percentages add up to 110%, not 100% (30+30+30+20) | Rescaled proportionally so each person's share stays in the same ratio. AUTO_FIXED. |
| 9 | Multiple | currency | Several rows have USD amounts but the CSV treats them as if they were rupees | Converted to INR using the documented rate (₹83.5/$). Original amount and rate stored on the expense. AUTO_FIXED. |
| 10 | 22 | split_with | "Dev's friend Kabir" is in the split — not a flat mate | Included as a guest. His share is tracked but no login account is created. FLAGGED_FOR_REVIEW. |
| 11 | 23 & 24 | description | "Dinner at Thalassa" and "Thalassa dinner" — same meal, different payers, different amounts | First row wins (Aisha, ₹2400). Second row skipped with a warning. The note on row 24 says "hers is wrong" which is ambiguous — flagged for review. |
| 12 | 25 | amount | `-30` USD — negative amount for the parasailing trip | Treated as a refund, not an error. Splits are negative so each person gets credited. KEPT_WITH_WARNING. |
| 13 | 26 | date | `Mar-14` — month-name format with no year | Parsed as March 14, 2026 (year inferred from context). AUTO_FIXED. |
| 14 | 26 | paid_by | `rohan ` — trailing space after the name | Trimmed. AUTO_FIXED. |
| 15 | 27 | currency | Currency field is blank for "Groceries DMart" | Defaulted to INR — every other grocery row in the file is INR. AUTO_FIXED. |
| 16 | 30 | amount | Amount is `0`. Note says "counted twice earlier" | Zero-value expense has no financial effect. Row skipped. SKIPPED. |
| 17 | 33 | date | `04-05-2026` — could be April 5 or May 4 depending on format | Every other date in the CSV is DD-MM, so this is treated as May 4. Flagged so a human can verify. FLAGGED_FOR_REVIEW. |
| 18 | 35 | split_with | April grocery row still lists Meera — but she left at end of March | Meera removed from the split. Remaining active members split the amount equally. AUTO_FIXED. |
| 19 | 37 | description | "Sam deposit share" — Sam is paying Aisha, not buying something | Imported as a settlement record (Sam → Aisha), not an expense. AUTO_FIXED. |
| 20 | 41 | split_type | `equal` split type but `split_details` are also provided | `split_type` wins. Details ignored — they're redundant anyway since all shares are 1. KEPT_WITH_WARNING. |

### How actions are classified

- **AUTO_FIXED** — the app corrected the problem and imported the row. The fix is logged so you can see exactly what changed.
- **FLAGGED_FOR_REVIEW** — the app made a best-effort decision but a human should verify it. Meera can use the import report to approve or reject each one.
- **KEPT_WITH_WARNING** — the row was imported as-is but something unusual was noted.
- **SKIPPED** — the row couldn't be imported safely. The reason is logged.

A crashed import and a silent guess were both treated as unacceptable outcomes. Every row gets an explicit decision.
