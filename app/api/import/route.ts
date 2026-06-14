import { NextRequest, NextResponse } from "next/server";
import { db, users, groupMembers, expenses, expenseSplits, settlements, importLogs } from "@/db";
import { eq, and, isNull } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { importCSV } from "@/lib/importer";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const formData = await req.formData();
  const file    = formData.get("file") as File | null;
  const groupId = formData.get("groupId") as string | null;
  const usdRate = parseFloat((formData.get("usdRate") as string) ?? "83.5");

  if (!file || !groupId)
    return NextResponse.json({ error: "file and groupId required" }, { status: 400 });

  const csvText = await file.text();
  const result  = importCSV(csvText, usdRate);

  // Collect all names from import
  const allNames = new Set<string>();
  for (const exp of result.expenses) {
    allNames.add(exp.paidBy);
    exp.splitWith.forEach((n) => allNames.add(n));
  }

  // Resolve or create user records
  const userMap = new Map<string, string>(); // name → id
  for (const name of allNames) {
    const [existing] = await db.select().from(users).where(eq(users.name, name)).limit(1);
    if (existing) {
      userMap.set(name, existing.id);
    } else {
      const id = randomUUID();
      await db.insert(users).values({
        id, name,
        email: `${name.toLowerCase().replace(/\s+/g, ".")}@flatmates.local`,
        passwordHash: "GUEST_NO_LOGIN",
      });
      userMap.set(name, id);
    }
  }

  // Ensure all users are group members
  for (const [name, userId] of userMap.entries()) {
    const [existing] = await db.select().from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
      .limit(1);
    if (!existing) {
      await db.insert(groupMembers).values({
        id: randomUUID(), groupId, userId,
        joinedAt: new Date("2026-02-01"),
      });
    }
  }

  let imported = 0;
  let settlementsImported = 0;

  for (const exp of result.expenses) {
    const paidById = userMap.get(exp.paidBy);
    if (!paidById) continue;

    if (exp.isSettlement) {
      const receiverId = userMap.get(exp.splitWith[0]);
      if (receiverId) {
        await db.insert(settlements).values({
          id: randomUUID(), groupId,
          payerId: paidById, receiverId,
          amount: String(exp.amountINR),
          date: exp.date,
          notes: exp.notes || null,
        });
        settlementsImported++;
      }
      continue;
    }

    const splitAmounts = computeSplits(exp);
    const expId = randomUUID();

    await db.insert(expenses).values({
      id: expId, groupId,
      description: exp.description,
      date: exp.date,
      amount: String(exp.amountINR),
      originalAmount: exp.originalAmount ? String(exp.originalAmount) : null,
      originalCurrency: exp.originalCurrency || null,
      exchangeRate: exp.exchangeRate ? String(exp.exchangeRate) : null,
      splitType: exp.splitType,
      paidById,
      notes: exp.notes || null,
      isDeleted: false,
      importRowNum: exp.rowNum,
    });

    const splitEntries = Object.entries(splitAmounts)
      .filter(([name]) => userMap.has(name))
      .map(([name, amount]) => ({
        id: randomUUID(),
        expenseId: expId,
        userId: userMap.get(name)!,
        amount: String(amount),
      }));

    if (splitEntries.length > 0) {
      await db.insert(expenseSplits).values(splitEntries);
    }
    imported++;
  }

  // Persist anomaly log
  if (result.anomalies.length > 0) {
    await db.insert(importLogs).values(
      result.anomalies.map((a) => ({
        id: randomUUID(),
        rowNum: a.rowNum,
        field: a.field || null,
        issue: a.issue,
        action: a.action,
        originalVal: a.originalVal || null,
        resolvedVal: a.resolvedVal || null,
        severity: a.severity,
        approved: true,
      }))
    );
  }

  return NextResponse.json({
    imported,
    settlementsImported,
    skipped: result.skipped,
    anomalyCount: result.anomalies.length,
    anomalies: result.anomalies,
  });
}

function computeSplits(exp: {
  amountINR: number;
  splitType: string;
  splitWith: string[];
  splitDetails?: string;
}): Record<string, number> {
  const { amountINR, splitType, splitWith, splitDetails } = exp;
  const result: Record<string, number> = {};

  if (splitType === "equal" || !splitDetails) {
    const n = splitWith.length;
    const base = Math.floor((amountINR / n) * 100) / 100;
    let remaining = Math.round((amountINR - base * n) * 100) / 100;
    splitWith.forEach((name, i) => {
      result[name] = i === 0 ? Math.round((base + remaining) * 100) / 100 : base;
    });
    return result;
  }

  if (splitType === "percentage") {
    const parts = splitDetails.split(";");
    let totalPct = 0;
    const raw: Record<string, number> = {};
    for (const p of parts) {
      const m = p.trim().match(/^(.+?)\s+([\d.]+)%$/);
      if (m) { raw[m[1].trim()] = parseFloat(m[2]); totalPct += parseFloat(m[2]); }
    }
    let assigned = 0;
    const names = Object.keys(raw);
    names.forEach((name, i) => {
      const share = i === names.length - 1
        ? Math.round((amountINR - assigned) * 100) / 100
        : Math.round((amountINR * (raw[name] / totalPct)) * 100) / 100;
      result[name] = share;
      assigned += share;
    });
    return result;
  }

  if (splitType === "share") {
    const parts = splitDetails.split(";");
    const shares: Record<string, number> = {};
    let totalShares = 0;
    for (const p of parts) {
      const m = p.trim().match(/^(.+?)\s+(\d+)$/);
      if (m) { shares[m[1].trim()] = parseInt(m[2]); totalShares += parseInt(m[2]); }
    }
    let assigned = 0;
    const names = Object.keys(shares);
    names.forEach((name, i) => {
      const share = i === names.length - 1
        ? Math.round((amountINR - assigned) * 100) / 100
        : Math.round((amountINR * (shares[name] / totalShares)) * 100) / 100;
      result[name] = share;
      assigned += share;
    });
    return result;
  }

  if (splitType === "unequal") {
    const parts = splitDetails.split(";");
    for (const p of parts) {
      const m = p.trim().match(/^(.+?)\s+([\d.]+)$/);
      if (m) result[m[1].trim()] = parseFloat(m[2]);
    }
    return result;
  }

  // fallback: equal
  const base = Math.round((amountINR / splitWith.length) * 100) / 100;
  splitWith.forEach((n) => (result[n] = base));
  return result;
}
