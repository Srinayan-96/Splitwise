import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db, users } from "@/db";
import { eq } from "drizzle-orm";
import { signToken } from "@/lib/auth";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  const { name, email, password } = await req.json();
  if (!name || !email || !password)
    return NextResponse.json({ error: "All fields required" }, { status: 400 });

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0)
    return NextResponse.json({ error: "Email already registered" }, { status: 409 });

  const passwordHash = await bcrypt.hash(password, 10);
  const id = randomUUID();
  await db.insert(users).values({ id, name, email, passwordHash });
  const token = await signToken({ userId: id, name });
  const res = NextResponse.json({ user: { id, name, email } });
  res.cookies.set("token", token, { httpOnly: true, sameSite: "lax", maxAge: 604800 });
  return res;
}
