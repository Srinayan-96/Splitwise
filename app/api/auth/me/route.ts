import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db, users } from "@/db";
import { eq } from "drizzle-orm";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const [dbUser] = await db.select().from(users).where(eq(users.id, user.userId)).limit(1);
  if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });
  return NextResponse.json({ id: dbUser.id, name: dbUser.name, email: dbUser.email });
}
