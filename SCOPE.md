# SCOPE.md — Anomaly Log & Database Schema

## Database Schema

See `prisma/schema.prisma` for the full source of truth. Summary:

| Table | Purpose |
|---|---|
| `User` | Each flat mate (and guests). `name` is unique and used for matching CSV names. |
| `Group` | A shared expense group (e.g. "Flat 4B"). |
| `GroupMember` | Tracks when each user joined and left a group. `leftAt = NULL` means still active. This is what powers Sam/Meera's timeline. |
| `Expense` | One expense record. `amount` is always in INR. Original currency/amount/rate stored separately for transparency. `isDeleted` for soft delete. `importRowNum` links back to CSV row for traceability. |
| `ExpenseSplit` | One row per person per expense — the exact INR amount that person owes. This is the source of truth for balances. |
| `Settlement` | A payment from one person to another, separate from expenses. |
| `ImportLog` | Every anomaly detected during CSV import, including action taken and severity. Meera's approval mechanism. |

---

## Anomalies Found in expenses_export.csv

| # | Row | Field | Problem | Policy |
|---|---|---|---|---|
| 1 | 4 & 5 | description | Exact duplicate: "Dinner at Marina Bites" and "dinner - marina bites" — same date, amount, payer, split | Skip the second row. Log as SKIPPED. |
| 2 | 6 | amount | `1,200` — comma-formatted number, not parseable as float | Strip comma, parse as 1200. AUTO_FIXED. |
| 3 | 8 | paid_by | `priya` (lowercase) — doesn't match any user by exact case | Normalise to title case → "Priya". AUTO_FIXED. |
| 4 | 9 | amount | `899.995` — three decimal places, sub-paise amount impossible to split exactly | Round to ₹900.00. AUTO_FIXED. |
| 5 | 10 | paid_by | `Priya S` — different name format for Priya | NAME_MAP resolves "Priya S" → "Priya". AUTO_FIXED. |
| 6 | 12 | paid_by | Missing paid_by for "House cleaning supplies" | Cannot import without a payer. FLAGGED_FOR_REVIEW, row skipped. |
| 7 | 13 | split_type | `Rohan paid Aisha back` — settlement, not an expense. `split_type` is null | Imported as a `Settlement` record, not an `Expense`. AUTO_FIXED. |
| 8 | 14 | split_details | Pizza Friday percentages: 30+30+30+20 = 110%, not 100% | Normalise proportionally: each % divided by total 110. AUTO_FIXED. |
| 9 | 19, 20, 22, 25 | currency | USD amounts — CSV treats them as INR | Convert to INR at documented rate (default ₹83.5/$). Rate stored per expense. AUTO_FIXED. |
| 10 | 22 | split_with | `Dev's friend Kabir` in parasailing split — not a flat mate | Included as guest split. No user account created. FLAGGED_FOR_REVIEW. |
| 11 | 23 & 24 | description | Conflicting duplicate: "Dinner at Thalassa" (Aisha, ₹2400) vs "Thalassa dinner" (Rohan, ₹2450). Note says "hers is wrong". | Keep first row (Aisha, ₹2400). Second row skipped. FLAGGED_FOR_REVIEW. |
| 12 | 25 | amount | `-30` USD — negative amount for parasailing refund | Treated as refund. Splits computed as negative (each person gets credited). KEPT_WITH_WARNING. |
| 13 | 26 | date | `Mar-14` — non-standard format, year missing | Parsed as March 14 2026. AUTO_FIXED. |
| 14 | 26 | paid_by | `rohan ` — trailing space | Trimmed → "Rohan". AUTO_FIXED. |
| 15 | 27 | currency | Empty currency for "Groceries DMart" | Defaulted to INR (context: all other grocery rows are INR). AUTO_FIXED. |
| 16 | 30 | amount | `0` — zero amount. Note says "counted twice earlier" | Row skipped — zero-value expense has no financial effect. SKIPPED. |
| 17 | 33 | date | `04-05-2026` — ambiguous: April 5 or May 4? Note says "is this April 5 or May 4?" | Treated as DD-MM (day first) per rest of CSV = May 4. FLAGGED_FOR_REVIEW. |
| 18 | 35 | split_with | April grocery row still includes Meera (who left March 31) | Meera removed from split. Remaining 3 members split equally. AUTO_FIXED. |
| 19 | 37 | description | "Sam deposit share" — Sam pays Aisha his deposit. Looks like a settlement. | Imported as Settlement (Sam → Aisha). AUTO_FIXED. |
| 20 | 41 | split_type | `equal` split_type but `split_details` provided ("Aisha 1; Rohan 1; Priya 1; Sam 1") | split_type wins. Details ignored (all shares equal anyway). KEPT_WITH_WARNING. |
