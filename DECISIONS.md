# DECISIONS.md — Engineering & Product Decision Log

## 1. Tech Stack: Next.js + PostgreSQL + Prisma

**Options considered:**
- Python (Flask/FastAPI) + React (separate repos)
- Next.js (single repo, API routes + frontend)
- Django (heavy, admin panel not needed)

**Decision:** Next.js + Prisma + PostgreSQL hosted on Supabase, deployed on Vercel.

**Why:** Single repo, single `git push` deploy. API routes live alongside pages. Prisma schema file doubles as the schema documentation required by the assignment. Under live-session pressure, navigating one codebase is materially faster than two.

---

## 2. Currency Conversion: Fixed Rate, Documented

**Options considered:**
- Live Open Exchange Rates API (real-time)
- Fixed rate stored in .env and documented

**Decision:** Fixed rate (default ₹83.5 to $1), user-editable at import time, stored per expense in `exchangeRate` column.

**Why:** Live API introduces an external failure point and rate drift between import runs. A fixed, documented rate is reproducible and auditable — if you re-import the CSV a year from now with the same rate, you get the same numbers. The rate used is stored on each expense row so it's never a mystery.

---

## 3. Negative Amount = Refund, Not Error

**Options considered:**
- Reject negative amounts as errors
- Treat as refunds (negative splits)

**Decision:** Treat as refund. The parasailing cancellation is clearly a partial refund (-$30). Splits are computed as negative amounts — each person gets credited their share.

**Why:** The note "one slot got cancelled" makes intent unambiguous. Erroring here would lose real financial data. The ImportLog records this for review.

---

## 4. Duplicate Detection: Two-tier

**Options considered:**
- Hash-based deduplication (exact match only)
- Fuzzy match by date + normalised description + amount + payer
- Two-tier: exact duplicate → skip silently; conflicting duplicate → flag and keep first

**Decision:** Two-tier. Exact duplicates (Marina Bites) are auto-skipped. Conflicting duplicates (Thalassa dinner with different amounts and payers) are flagged — first row wins, second is skipped with a WARNING in the log.

**Why:** A silent skip for conflicting entries would hide a real data dispute. Keeping first and flagging surfaces it for human review without blocking the import.

---

## 5. Membership Windows: Hard-coded from CSV Context

**Options considered:**
- Infer membership dates automatically from first/last appearance in CSV
- Hard-code from story context (Meera left end-March, Sam joined mid-April)

**Decision:** Hard-coded based on the assignment context. Meera: Feb 1 – Mar 31. Sam: Apr 15 onward.

**Why:** Inferring from CSV would be wrong — Meera appears in a March expense, and Sam first appears Apr 8 (deposit), but his actual move-in is mid-April per the story. Using CSV first-appearance would produce incorrect membership windows. The membership dates are documented here and in the code for the live session.

---

## 6. "Settlement Logged as Expense" Detection: Regex on Description

**Options considered:**
- Manual flag column in CSV
- Regex on description + note fields
- ML classification (overkill)

**Decision:** Regex matching `paid.*back|deposit share|settlement` on description and notes fields.

**Why:** Simple and transparent. The two affected rows ("Rohan paid Aisha back", "Sam deposit share") are caught cleanly. Easy to explain line by line in the live session.

---

## 7. Percentage Normalisation: Proportional Rescaling

**Options considered:**
- Reject if percentages don't sum to 100
- Normalise proportionally (divide each by total)

**Decision:** Normalise proportionally. Pizza Friday (30+30+30+20 = 110%) is rescaled so each person's share stays in the same ratio.

**Why:** Erroring here loses a valid expense. The note says "percentages might be off" — clearly a user typo. Rescaling preserves intent. Auto-fixed with the original and resolved values logged.

---

## 8. Rounding: Banker's Rounding NOT Used — Last-Person Adjustment

**Options considered:**
- Banker's rounding (round half to even)
- Always round down, accumulate remainder to last person

**Decision:** Round each split to 2dp; assign the remainder (amountINR minus sum of other splits) to the last person in the list.

**Why:** Total must always equal the expense amount exactly. Banker's rounding applied independently per split can produce totals that are ±1 paisa off. Last-person adjustment guarantees the sum. The discrepancy is at most (n-1) paise where n is the number of splits.

---

## 9. Missing paid_by: Skip Row

**Options considered:**
- Default to logged-in user
- Skip the row and flag it

**Decision:** Skip and flag as ERROR.

**Why:** Defaulting silently would assign a debt to the wrong person — potentially worse than skipping. The house cleaning row (Row 12) has a note "can't remember who paid" — this is a genuine unknown that requires human input.

---

## 10. Ambiguous Date 04-05-2026: Treat as DD-MM, Flag for Review

**Options considered:**
- Treat as MM-DD (American format)
- Treat as DD-MM (used by all other rows in this CSV)
- Error out

**Decision:** Treat as DD-MM (May 4) to be consistent with all other dates in the file, but flag as FLAGGED_FOR_REVIEW.

**Why:** All 40 other dates in the CSV use DD-MM format. Switching format mid-file for one row would be inconsistent. Flagging it means the user is informed and can override if needed.
