# DECISIONS.md — Decision Log

Every significant decision made during this project, what else was considered, and why we went the way we did.

---

## 1. Tech stack — Next.js + Drizzle ORM + PostgreSQL

**What we considered:**
- Python (FastAPI or Flask) + React — two repos, two deploys
- Next.js with API routes + frontend in one repo — single deploy
- Django — too heavy for this scope

**What we chose:** Next.js 14 with API routes, Drizzle ORM, PostgreSQL on Supabase, deployed on Vercel.

**Why Next.js:** Single repo, single `git push` deploy. API routes live alongside the pages that call them. Under live-session pressure, navigating one codebase is faster than two.

**On the ORM — Prisma was planned, Drizzle is what runs.** Prisma was the original choice because its `schema.prisma` file is a clean, readable schema document that doubles as the DB schema deliverable. It's still in the repo at `prisma/schema.prisma` and serves that documentation purpose. However, Prisma requires native binary engines that are downloaded at install time — this failed in the build environment. The actual database queries run through Drizzle ORM (`db/schema.ts`, `db/index.ts`), which is pure JavaScript with no binary dependencies. `lib/prisma.ts` re-exports the Drizzle client under the name `prisma` so the rest of the codebase didn't need to change. Both schema files exist — Prisma for documentation, Drizzle for runtime.

---

## 2. Currency conversion — fixed rate, not a live API

**What we considered:**
- Calling a live exchange rate API (Open Exchange Rates, etc.) at import time
- Using a fixed rate that's documented and stored per expense

**What we chose:** Fixed rate, defaulting to ₹83.5 per dollar, editable by the user at import time. The rate used is stored on each expense row in the database.

**Why:** A live API introduces a failure point that has nothing to do with the app's logic — if the exchange rate service is down, the import fails. More importantly, re-importing the same CSV a week later with a live rate would produce different numbers, making it impossible to audit or reproduce results. A fixed, documented rate means the numbers are stable and traceable. If someone asks "why does this expense show ₹4,175?", the answer is "$50 × ₹83.5" — fully visible on the expense record.

---

## 3. Negative amounts — refund, not error

**What we considered:**
- Reject any negative amount as invalid data
- Treat negative amounts as refunds (negative splits credit each person)

**What we chose:** Treat as refund.

**Why:** The context makes it unambiguous. Row 25 is a parasailing trip with a note saying "one slot got cancelled" and the amount is -$30. That's a refund. Rejecting it would silently drop real money from the group's records. The import log records it as KEPT_WITH_WARNING so it's visible, and the negative splits correctly reduce each person's balance.

---

## 4. Duplicate detection — two-tier, not one-size-fits-all

**What we considered:**
- Exact match only (same date + description + amount + payer = duplicate)
- Fuzzy match on description alone
- Two-tier: exact duplicates handled differently from conflicting duplicates

**What we chose:** Two-tier approach. Exact duplicates (Marina Bites — same everything) are auto-skipped. Conflicting duplicates (Thalassa dinner — same meal, different payers and amounts) are flagged and the first row wins.

**Why:** These are two genuinely different situations. An exact duplicate is almost certainly an accidental double-entry — safe to skip silently. A conflicting duplicate means two people logged the same event differently, which is a real data dispute. Auto-picking one without flagging it would hide that dispute. Flagging it gives Meera something to review.

---

## 5. Membership windows — hard-coded from the assignment narrative

**What we considered:**
- Infer membership dates from each person's first and last appearance in the CSV
- Hard-code the dates from the assignment description

**What we chose:** Hard-coded. Meera: February 1 to March 31. Sam: April 15 onward.

**Why:** Inferring from CSV appearances produces wrong answers. Sam first appears in the CSV on April 8 (the deposit row), but the assignment says he moved in mid-April. If we used first appearance, Sam would be billed for the April 8 deposit itself — which is the payment he made when moving in, not a shared flat expense. Meera appears in a farewell dinner row in late March, so inferring her leave date from "last appearance" also goes wrong. The story in the assignment is the authoritative source, not the CSV row order.

---

## 6. Detecting settlements in the CSV — regex on description

**What we considered:**
- Requiring a dedicated "type" column in the CSV (not possible — we can't edit the CSV)
- Regex matching on the description and notes fields
- Machine learning classification (wildly overkill)

**What we chose:** Regex. Pattern: `paid.*back|deposit share|settlement` on the description and notes combined.

**Why:** There are exactly two rows that need this treatment ("Rohan paid Aisha back" and "Sam deposit share") and both are caught cleanly by the regex. The pattern is readable, testable, and easy to explain in the live session. A more sophisticated approach would add complexity without improving outcomes for this specific dataset.

---

## 7. Percentage splits that don't add up to 100 — normalise, don't reject

**What we considered:**
- Reject the row and flag it as an error
- Normalise proportionally (divide each percentage by the total)

**What we chose:** Normalise proportionally.

**Why:** The Pizza Friday row has percentages that add up to 110%. The note on the row says "percentages might be off". The intent is clear — four people sharing a pizza with roughly those proportions. Rejecting the row loses a valid expense. Normalising to 100% preserves the relative shares and gets the maths right. The original and corrected values are both stored in the import log.

---

## 8. Rounding — last-person adjustment, not independent rounding

**What we considered:**
- Round each person's split independently to 2 decimal places
- Round n-1 splits independently, assign the remainder to the last person

**What we chose:** Last-person adjustment.

**Why:** Independent rounding can make the splits sum to slightly more or less than the expense total. For example, ₹100 split three ways is ₹33.33 × 3 = ₹99.99, not ₹100. The last-person adjustment forces the sum to be exact. The maximum discrepancy any one person absorbs is (n-1) paise, which on any realistic expense is less than a rupee — an acceptable rounding artefact.

---

## 9. Missing payer — skip the row, don't guess

**What we considered:**
- Default to the logged-in user who triggered the import
- Skip the row and flag it as an error requiring human input

**What we chose:** Skip and flag as ERROR.

**Why:** Defaulting to the importing user would silently assign a debt to the wrong person. That's worse than having a gap in the data. The row in question (house cleaning supplies) has a note saying "can't remember who paid" — the original data creator already flagged this as genuinely unknown. The right response is to surface it, not guess.

---

## 10. Ambiguous date (04-05-2026) — treat as DD-MM, flag it

**What we considered:**
- Treat as MM-DD (American format) → April 5
- Treat as DD-MM (used by every other row in the CSV) → May 4
- Reject as unparseable

**What we chose:** Treat as DD-MM (May 4) for consistency with the rest of the file, but flag it as FLAGGED_FOR_REVIEW so a human can verify.

**Why:** Every other date in the CSV uses DD-MM format. Treating one row differently without evidence would be inconsistent. But the date is genuinely ambiguous — both interpretations are valid calendar dates — so flagging it rather than silently committing is the right call. The import report shows it clearly.
