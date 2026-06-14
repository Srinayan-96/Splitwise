import { NextRequest, NextResponse } from "next/server";
import { db, groupMembers } from "@/db";
import { eq, and, isNull } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest, { params }: { params: Promise<{ groupId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { groupId } = await params;
  const { userId, joinedAt } = await req.json();
  const id = randomUUID();
  await db.insert(groupMembers).values({ id, groupId, userId, joinedAt: joinedAt ? new Date(joinedAt) : new Date() });
  return NextResponse.json({ id, groupId, userId }, { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ groupId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const { groupId } = await params;
  const { userId, leftAt } = await req.json();
  const [member] = await db.select().from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId), isNull(groupMembers.leftAt)))
    .limit(1);
  if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });
  await db.update(groupMembers).set({ leftAt: leftAt ? new Date(leftAt) : new Date() }).where(eq(groupMembers.id, member.id));
  return NextResponse.json({ ok: true });
}
