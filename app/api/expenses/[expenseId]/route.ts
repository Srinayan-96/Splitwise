import { NextRequest, NextResponse } from "next/server";
import { db, expenses, expenseSplits } from "@/db";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { randomUUID } from "crypto";

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ expenseId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { expenseId } = await params;
  await db.update(expenses).set({ isDeleted: true }).where(eq(expenses.id, expenseId));
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ expenseId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { expenseId } = await params;
  const body = await req.json();
  const { splits, ...data } = body;
  if (data.date) data.date = new Date(data.date);
  if (data.amount) data.amount = String(data.amount);
  await db.update(expenses).set(data).where(eq(expenses.id, expenseId));
  if (splits) {
    await db.delete(expenseSplits).where(eq(expenseSplits.expenseId, expenseId));
    await db.insert(expenseSplits).values(
      splits.map((s: { userId: string; amount: number }) => ({ id: randomUUID(), expenseId, userId: s.userId, amount: String(s.amount) }))
    );
  }
  return NextResponse.json({ ok: true });
}
