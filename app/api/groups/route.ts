import { NextRequest, NextResponse } from "next/server";
import { db, groups, groupMembers, users, expenses } from "@/db";
import { eq, sql } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { randomUUID } from "crypto";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const allGroups = await db.select().from(groups).orderBy(groups.createdAt);

  const result = await Promise.all(allGroups.map(async (g) => {
    const members = await db
      .select({ user: { id: users.id, name: users.name }, joinedAt: groupMembers.joinedAt, leftAt: groupMembers.leftAt })
      .from(groupMembers)
      .innerJoin(users, eq(groupMembers.userId, users.id))
      .where(eq(groupMembers.groupId, g.id));

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(expenses)
      .where(eq(expenses.groupId, g.id));

    return { ...g, members, _count: { expenses: Number(count) } };
  }));

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { name, memberIds } = await req.json();
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const id = randomUUID();
  await db.insert(groups).values({ id, name });

  const ids: string[] = memberIds ?? [user.userId];
  await db.insert(groupMembers).values(
    ids.map((uid: string) => ({ id: randomUUID(), groupId: id, userId: uid, joinedAt: new Date() }))
  );

  const members = await db
    .select({ user: { id: users.id, name: users.name }, joinedAt: groupMembers.joinedAt, leftAt: groupMembers.leftAt })
    .from(groupMembers)
    .innerJoin(users, eq(groupMembers.userId, users.id))
    .where(eq(groupMembers.groupId, id));

  return NextResponse.json({ id, name, members, _count: { expenses: 0 } }, { status: 201 });
}
