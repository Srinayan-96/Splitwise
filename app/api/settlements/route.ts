import { NextRequest, NextResponse } from "next/server";
import { db, settlements, users } from "@/db";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { randomUUID } from "crypto";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const groupId = req.nextUrl.searchParams.get("groupId");
  const rows = await db.select().from(settlements)
    .where(groupId ? eq(settlements.groupId, groupId) : undefined)
    .orderBy(settlements.date);

  const result = await Promise.all(rows.map(async (s) => {
    const [payer]    = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, s.payerId)).limit(1);
    const [receiver] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, s.receiverId)).limit(1);
    return { ...s, payer, receiver };
  }));
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { groupId, payerId, receiverId, amount, date, notes } = await req.json();
  const id = randomUUID();
  await db.insert(settlements).values({ id, groupId, payerId, receiverId, amount: String(amount), date: new Date(date), notes: notes || null });
  return NextResponse.json({ id, groupId, payerId, receiverId, amount, date }, { status: 201 });
}
