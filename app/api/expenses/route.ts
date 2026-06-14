import { NextRequest, NextResponse } from "next/server";
import { db, expenses, expenseSplits, users } from "@/db";
import { eq, and } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { randomUUID } from "crypto";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const groupId = req.nextUrl.searchParams.get("groupId");

  const rows = await db.select().from(expenses)
    .where(and(groupId ? eq(expenses.groupId, groupId) : undefined, eq(expenses.isDeleted, false)))
    .orderBy(expenses.date);

  const result = await Promise.all(rows.map(async (exp) => {
    const [paidBy] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, exp.paidById)).limit(1);
    const splits = await db
      .select({ user: { id: users.id, name: users.name }, amount: expenseSplits.amount })
      .from(expenseSplits)
      .innerJoin(users, eq(expenseSplits.userId, users.id))
      .where(eq(expenseSplits.expenseId, exp.id));
    return { ...exp, paidBy, splits };
  }));

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const body = await req.json();
  const { groupId, description, date, amount, splitType, paidById, splits, notes, originalAmount, originalCurrency, exchangeRate } = body;

  const id = randomUUID();
  await db.insert(expenses).values({
    id, groupId, description,
    date: new Date(date),
    amount: String(amount),
    splitType,
    paidById,
    notes: notes || null,
    originalAmount: originalAmount ? String(originalAmount) : null,
    originalCurrency: originalCurrency || null,
    exchangeRate: exchangeRate ? String(exchangeRate) : null,
    isDeleted: false,
  });

  await db.insert(expenseSplits).values(
    splits.map((s: { userId: string; amount: number }) => ({
      id: randomUUID(),
      expenseId: id,
      userId: s.userId,
      amount: String(s.amount),
    }))
  );

  const [paidBy] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, paidById)).limit(1);
  const splitRows = await db
    .select({ user: { id: users.id, name: users.name }, amount: expenseSplits.amount })
    .from(expenseSplits).innerJoin(users, eq(expenseSplits.userId, users.id))
    .where(eq(expenseSplits.expenseId, id));

  return NextResponse.json({ id, groupId, description, date, amount, splitType, paidBy, splits: splitRows, notes }, { status: 201 });
}
