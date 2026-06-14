# AI_USAGE.md — How I Used AI on This Project

## Tool

**Claude (Anthropic)** — claude.ai, used throughout the project as a development collaborator.

---

## What I used it for

Claude was involved at most stages of the project — but as a collaborator, not an autopilot. The rough breakdown:

- **CSV analysis** — asked it to read the raw CSV and help identify data quality problems. It found most of them; I found a few it missed and caught several it got wrong.
- **Code scaffolding** — generated initial versions of the importer, balance calculator, and API routes. Every file was read, understood, and in many cases rewritten before committing.
- **Algorithm suggestions** — the greedy debt-minimisation algorithm (largest debtor pays largest creditor first) was suggested by Claude. I verified it by hand before using it.
- **Documentation drafts** — first drafts of SCOPE.md and DECISIONS.md were generated with Claude, then heavily rewritten to reflect the actual decisions made and the actual code that ended up in the repo.

---

## Key prompts

1. *"Here is the raw CSV. Read every row and tell me every data quality problem you can find — inconsistencies, duplicates, formatting issues, logical errors. Classify each as error, warning, or informational."*

2. *"Write a TypeScript function that normalises a member name from a CSV. It should handle lowercase, trailing spaces, and known aliases like 'Priya S' mapping to 'Priya'."*

3. *"What's the simplest correct algorithm to minimise the number of transactions needed to settle all debts in a group? Walk me through it with an example before writing any code."*

4. *"The CSV has a row where percentages sum to 110%. What are my options for handling this, and what are the tradeoffs of each?"*

5. *"Write a Drizzle ORM schema for a shared expenses app where group membership changes over time — members can join and leave, and expenses should only affect people who were members on the date of the expense."*

---

## Three cases where Claude got it wrong

### 1. The balance calculator double-counted the payer's credit

**What Claude produced:** An initial `computeBalances` function that, for each expense, credited the payer with the full expense total *and* added each split amount. So if Aisha paid ₹1000 for a 4-way split, she was credited ₹1000 (the payment) plus ₹250 (her own split row) = ₹1250. Wrong.

**How I caught it:** I traced through a simple 2-person, ₹1000 expense manually before running anything. A pays. The splits are A: ₹500, B: ₹500. A's net should be +₹500 (B owes her). Claude's version gave A a net of +₹1000. Failed immediately.

**What I changed:** The correct logic is: for every split row, credit the payer by `split.amount` and debit the splitter by `split.amount`. That's it. The payer's own split row debits them their share and credits them the same amount — netting to zero for their own share, positive for everyone else's. I rewrote the loop from scratch with this in mind.

---

### 2. Percentage normalisation lost money due to independent rounding

**What Claude produced:** A normalisation function that divided each percentage by the sum of all percentages, multiplied by the total amount, and rounded each result to 2 decimal places independently. For the Pizza Friday row (₹1440, four people, percentages summing to 110%), this produced splits that added up to ₹1439.99 — one paisa short.

**How I caught it:** I added an assertion after computing splits: `assert(sum(splits) === expense.amount)`. It failed on the Pizza Friday row. Traced it to the independent rounding.

**What I changed:** Implemented last-person adjustment — compute splits for the first n-1 people normally, then give the last person whatever is left over (`totalAmount - sumOfOthers`). The maximum deviation any one person absorbs is (n-1) paise, but the total always equals the expense amount exactly.

---

### 3. Suggested inferring membership dates from CSV appearance

**What Claude suggested:** "You can infer when each member joined and left by looking at their first and last appearance in the CSV."

**Why it's wrong:** Sam first appears in the CSV on row 37 — a deposit payment dated April 8. But the assignment says he moved in mid-April. If we use first appearance, Sam would be on the hook for his own deposit (which is money he paid, not a shared flat expense) and would be treated as a member from April 8. Meera's situation is similar — she appears in a farewell dinner row in late March, so "last appearance" as a leave date is slightly off.

**What I changed:** Hard-coded the membership windows directly from the assignment narrative. Meera: February 1 to March 31. Sam: April 15 onward. These are the dates the assignment explicitly describes, and they're documented in DECISIONS.md so anyone reading the code knows why those specific dates are in there.

---

## What I didn't use AI for

- The final decision on how to handle each CSV anomaly — those were made by reading the data and thinking about the intent, not by asking Claude
- The database schema structure — I drafted the first version and used Claude to sanity-check it, not the other way around
- Debugging the Supabase connection issues during deployment — those required reading actual error logs and understanding the difference between direct connections and connection poolers
- The `git` history — that was structured by hand to reflect the actual order work was done

The assignment says "you remain responsible for every line you submit." That was taken seriously. Every function in this repo was read before it was committed.
