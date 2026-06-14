/**
 * Balance calculator.
 * - Computes net balance per person from ExpenseSplit + Settlement records.
 * - Produces minimal debt-settlement list (Aisha's "one number per person" requirement).
 * - Keeps full expense breakdown per person (Rohan's requirement).
 */

export interface ExpenseRow {
  id: string;
  description: string;
  date: Date;
  amountINR: number;
  paidById: string;
  splits: { userId: string; amount: number }[];
}

export interface SettlementRow {
  payerId: string;
  receiverId: string;
  amount: number;
}

export interface PersonBalance {
  userId: string;
  name: string;
  totalPaid: number;      // sum of expenses they paid for
  totalOwed: number;      // sum of their own splits
  netBalance: number;     // positive = owed money, negative = owes money
  breakdown: BreakdownItem[];
}

export interface BreakdownItem {
  expenseId: string;
  description: string;
  date: Date;
  youPaid: number;        // what you fronted
  yourShare: number;      // what your split says you owe
  net: number;            // youPaid - yourShare (positive = others owe you from this expense)
}

export interface DebtInstruction {
  from: string;   // name
  to: string;     // name
  amount: number; // in INR
}

/**
 * Compute each person's net balance.
 * net > 0 → others owe them
 * net < 0 → they owe others
 */
export function computeBalances(
  expenses: ExpenseRow[],
  settlements: SettlementRow[],
  users: { id: string; name: string }[]
): PersonBalance[] {
  const userMap = new Map(users.map((u) => [u.id, u.name]));
  const net = new Map<string, number>(); // userId → net INR
  const breakdown = new Map<string, BreakdownItem[]>();

  for (const u of users) {
    net.set(u.id, 0);
    breakdown.set(u.id, []);
  }

  for (const exp of expenses) {
    for (const split of exp.splits) {
      // The payer fronted the full expense; each person owes their split amount.
      // net effect on payer: +split.amount for everyone else's share (they're owed back)
      // net effect on each splitter: -split.amount (they owe the payer)

      if (split.userId === exp.paidById) {
        // payer: net += (totalExpense - their own share) = net += sum of others' shares
        // We handle this by just tracking: payer paid, so net += split.amount for each OTHER person
        // Easier: payer's net += split.amount, then deduct their own split below
        net.set(split.userId, (net.get(split.userId) ?? 0)); // no change yet; payer's contribution handled below
      }

      // Each person's split reduces their net (they owe this much)
      net.set(split.userId, (net.get(split.userId) ?? 0) - split.amount);

      // Payer gets credited the full split amount back
      net.set(exp.paidById, (net.get(exp.paidById) ?? 0) + split.amount);

      // Breakdown for the splitter
      const item: BreakdownItem = {
        expenseId: exp.id,
        description: exp.description,
        date: exp.date,
        youPaid: split.userId === exp.paidById ? exp.amountINR : 0,
        yourShare: split.amount,
        net: (split.userId === exp.paidById ? exp.amountINR : 0) - split.amount,
      };
      breakdown.get(split.userId)?.push(item);
    }
  }

  // Apply settlements
  for (const s of settlements) {
    net.set(s.payerId,    (net.get(s.payerId)    ?? 0) + s.amount); // payer reduces debt
    net.set(s.receiverId, (net.get(s.receiverId) ?? 0) - s.amount); // receiver gets less
  }

  return users.map((u) => ({
    userId: u.id,
    name: u.name,
    totalPaid: expenses
      .filter((e) => e.paidById === u.id)
      .reduce((sum, e) => sum + e.amountINR, 0),
    totalOwed: expenses
      .flatMap((e) => e.splits)
      .filter((s) => s.userId === u.id)
      .reduce((sum, s) => sum + s.amount, 0),
    netBalance: Math.round((net.get(u.id) ?? 0) * 100) / 100,
    breakdown: breakdown.get(u.id) ?? [],
  }));
}

/**
 * Minimise the number of transactions to settle all debts.
 * Classic greedy algorithm: largest creditor receives from largest debtor.
 * Satisfies Aisha's requirement: "one number per person, who pays whom."
 */
export function minimiseDebts(balances: PersonBalance[]): DebtInstruction[] {
  const debtors  = balances.filter((b) => b.netBalance < -0.01)
    .map((b) => ({ name: b.name, amount: -b.netBalance }))
    .sort((a, b) => b.amount - a.amount);

  const creditors = balances.filter((b) => b.netBalance > 0.01)
    .map((b) => ({ name: b.name, amount: b.netBalance }))
    .sort((a, b) => b.amount - a.amount);

  const instructions: DebtInstruction[] = [];
  let i = 0, j = 0;

  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amount, creditors[j].amount);
    instructions.push({
      from: debtors[i].name,
      to: creditors[j].name,
      amount: Math.round(pay * 100) / 100,
    });
    debtors[i].amount  -= pay;
    creditors[j].amount -= pay;
    if (debtors[i].amount  < 0.01) i++;
    if (creditors[j].amount < 0.01) j++;
  }

  return instructions;
}
