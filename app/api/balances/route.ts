import { NextRequest, NextResponse } from "next/server";
import { db, expenses, expenseSplits, settlements, groupMembers, users } from "@/db";
import { eq, and } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { computeBalances, minimiseDebts } from "@/lib/balances";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const groupId = req.nextUrl.searchParams.get("groupId");
  if (!groupId) return NextResponse.json({ error: "groupId required" }, { status: 400 });

  const expRows = await db.select().from(expenses)
    .where(and(eq(expenses.groupId, groupId), eq(expenses.isDeleted, false)));

  const expWithSplits = await Promise.all(expRows.map(async (e) => {
    const splits = await db.select().from(expenseSplits).where(eq(expenseSplits.expenseId, e.id));
    return { ...e, splits };
  }));

  const settRows = await db.select().from(settlements).where(eq(settlements.groupId, groupId));

  const memberRows = await db
    .select({ user: { id: users.id, name: users.name } })
    .from(groupMembers)
    .innerJoin(users, eq(groupMembers.userId, users.id))
    .where(eq(groupMembers.groupId, groupId));

  const userMap = new Map<string, { id: string; name: string }>();
  for (const m of memberRows) userMap.set(m.user.id, m.user);
  const userList = Array.from(userMap.values());

  const balances = computeBalances(
    expWithSplits.map((e) => ({
      id: e.id,
      description: e.description,
      date: e.date,
      amountINR: Number(e.amount),
      paidById: e.paidById,
      splits: e.splits.map((s) => ({ userId: s.userId, amount: Number(s.amount) })),
    })),
    settRows.map((s) => ({ payerId: s.payerId, receiverId: s.receiverId, amount: Number(s.amount) })),
    userList
  );

  return NextResponse.json({ balances, debts: minimiseDebts(balances) });
}
