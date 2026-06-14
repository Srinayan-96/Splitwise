# AI_USAGE.md

## Tool Used
**Claude (Anthropic)** — claude.ai chat interface, used as a development collaborator.

## Role
Claude was used to generate code scaffolding, reason through edge cases in the CSV data, suggest algorithms (debt minimisation), and draft documentation. Every line was reviewed and in many cases rewritten before committing.

## Key Prompts

1. "Here is a CSV with shared expenses. Identify every data quality problem you can find and classify each as error, warning, or info."
2. "Write a TypeScript function that normalises a member name accounting for case differences, trailing spaces, and known aliases like 'Priya S'."
3. "What's the cleanest algorithm to minimise the number of transactions to settle group debts?"
4. "Write a Prisma schema for a shared expenses app where group membership changes over time."

## Three Cases Where Claude Was Wrong

### 1. Balance calculation double-counting
**What Claude produced:** An initial balance calculator that credited the payer for the *full* expense amount, then also added each split amount back. This double-counted the payer's credit.

**How I caught it:** Manually traced through a simple 2-person, ₹1000 expense where A pays. Claude's version gave A a net of +₹1000 instead of +₹500. The unit test I wrote immediately failed.

**What I changed:** Rewrote the credit logic. The payer receives credit equal to *each split amount* (which sums to the total), not the total separately. Now the loop is `net[payer] += split.amount` for every split row — including their own — which nets out correctly.

### 2. Percentage normalisation losing the last paisa
**What Claude produced:** A normalisation function that divided each percentage by the total, multiplied by the amount, and rounded independently. For 3 people and ₹1440, this produced 3 × ₹436.36 = ₹1308.08, not ₹1440.

**How I caught it:** Checked `sum(splits) === expense.amount` assertion. Failed on the Pizza Friday row.

**What I changed:** Added last-person adjustment: compute splits for the first n-1 people normally, assign the remainder to the last person. This guarantees the sum is always exact.

### 3. Membership window inference from CSV
**What Claude initially suggested:** "You can infer membership dates by looking at each person's first and last appearance in the CSV."

**Why this is wrong:** Sam first appears on Apr 8 (deposit row) but moves in mid-April. Meera appears in a March farewell dinner expense. If you use first/last appearance as membership bounds, Sam's membership starts Apr 8 (wrong — he shouldn't share the Apr 8 expense either by the strict reading) and Meera's ends Mar 28 (wrong — she left Mar 31). The assignment explicitly states the story: Meera left end-March, Sam joined mid-April.

**What I changed:** Hard-coded membership windows from the assignment narrative. Documented the decision in DECISIONS.md §5.
