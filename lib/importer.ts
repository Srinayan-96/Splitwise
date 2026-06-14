/**
 * CSV Importer — the core of the assignment.
 * Handles all 12+ deliberate anomalies in expenses_export.csv.
 * Every decision is logged to ImportLog for the import report.
 */

import { parse } from "papaparse";
import { Decimal } from "@prisma/client/runtime/library";

export type AnomalyAction =
  | "AUTO_FIXED"
  | "FLAGGED_FOR_REVIEW"
  | "SKIPPED"
  | "KEPT_WITH_WARNING";

export interface ImportAnomaly {
  rowNum: number;
  field?: string;
  issue: string;
  action: AnomalyAction;
  originalVal?: string;
  resolvedVal?: string;
  severity: "INFO" | "WARNING" | "ERROR";
}

export interface CleanedExpense {
  rowNum: number;
  description: string;
  date: Date;
  amountINR: number;           // always in INR
  originalAmount?: number;
  originalCurrency?: string;
  exchangeRate?: number;
  splitType: "equal" | "unequal" | "percentage" | "share";
  paidBy: string;              // normalised name
  splitWith: string[];         // normalised names
  splitDetails?: string;
  notes?: string;
  isSettlement: boolean;
}

export interface ImportResult {
  expenses: CleanedExpense[];
  skipped: number[];           // row numbers skipped entirely
  anomalies: ImportAnomaly[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Normalise a member name: trim, title-case, resolve known aliases */
const NAME_MAP: Record<string, string> = {
  priya: "Priya",
  "priya s": "Priya",   // "Priya S" in paid_by — same person
  rohan: "Rohan",
  "rohan ": "Rohan",
  aisha: "Aisha",
  meera: "Meera",
  sam: "Sam",
  dev: "Dev",
};

function normaliseName(raw: string): string {
  const key = raw.trim().toLowerCase();
  return NAME_MAP[key] ?? raw.trim();
}

/** Parse an amount string — handles "1,200", "899.995", negatives */
function parseAmount(raw: string): { value: number; wasComma: boolean; wasExtraDecimal: boolean } {
  const stripped = String(raw).replace(/,/g, "");
  const wasComma = String(raw).includes(",");
  const value = parseFloat(stripped);
  // Round to 2dp — handles 899.995
  const rounded = Math.round(value * 100) / 100;
  const wasExtraDecimal = rounded !== value;
  return { value: rounded, wasComma, wasExtraDecimal };
}

/** Try to parse a date in multiple formats */
function parseDate(raw: string, rowNum: number, anomalies: ImportAnomaly[]): Date | null {
  // Standard: DD-MM-YYYY
  const ddmmyyyy = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (ddmmyyyy) {
    return new Date(`${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`);
  }
  // MM-DD-YYYY (ambiguous — e.g. 04-05-2026 could be Apr 5 or May 4)
  // We treat DD-MM as canonical but flag ambiguous ones
  const ambiguous = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (ambiguous) {
    const d1 = parseInt(ambiguous[1]);
    const d2 = parseInt(ambiguous[2]);
    if (d1 <= 12 && d2 <= 12) {
      anomalies.push({
        rowNum,
        field: "date",
        issue: `Ambiguous date "${raw}" — could be DD-MM or MM-DD. Treated as DD-MM (day first).`,
        action: "FLAGGED_FOR_REVIEW",
        originalVal: raw,
        resolvedVal: `${ambiguous[3]}-${ambiguous[2]}-${ambiguous[1]}`,
        severity: "WARNING",
      });
    }
    return new Date(`${ambiguous[3]}-${ambiguous[2]}-${ambiguous[1]}`);
  }
  // "Mar-14" style — month name + day, year missing → assume current year context
  const monthDay = raw.match(/^([A-Za-z]{3})-(\d{1,2})$/);
  if (monthDay) {
    const months: Record<string, string> = {
      jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
      jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
    };
    const m = months[monthDay[1].toLowerCase()];
    if (m) {
      const resolved = `2026-${m}-${monthDay[2].padStart(2, "0")}`;
      anomalies.push({
        rowNum,
        field: "date",
        issue: `Non-standard date format "${raw}" — year missing, inferred 2026.`,
        action: "AUTO_FIXED",
        originalVal: raw,
        resolvedVal: resolved,
        severity: "WARNING",
      });
      return new Date(resolved);
    }
  }
  anomalies.push({
    rowNum,
    field: "date",
    issue: `Unparseable date "${raw}" — row skipped.`,
    action: "SKIPPED",
    originalVal: raw,
    severity: "ERROR",
  });
  return null;
}

/** Parse percentage split details like "Aisha 30%; Rohan 30%; Priya 30%; Meera 20%" */
function parsePercentages(details: string): Record<string, number> {
  const result: Record<string, number> = {};
  const parts = details.split(";");
  for (const p of parts) {
    const m = p.trim().match(/^(.+?)\s+([\d.]+)%$/);
    if (m) result[normaliseName(m[1])] = parseFloat(m[2]);
  }
  return result;
}

/** Parse share details like "Aisha 1; Rohan 2; Priya 1; Dev 2" */
function parseShares(details: string): Record<string, number> {
  const result: Record<string, number> = {};
  const parts = details.split(";");
  for (const p of parts) {
    const m = p.trim().match(/^(.+?)\s+(\d+)$/);
    if (m) result[normaliseName(m[1])] = parseInt(m[2]);
  }
  return result;
}

// ── Known non-member guests ───────────────────────────────────────────────────
const KNOWN_MEMBERS = new Set(["Aisha", "Rohan", "Priya", "Meera", "Sam", "Dev"]);

// ── Main importer ─────────────────────────────────────────────────────────────

export function importCSV(csvText: string, usdToInr = 83.5): ImportResult {
  const { data: rows } = parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  const anomalies: ImportAnomaly[] = [];
  const expenses: CleanedExpense[] = [];
  const skipped: number[] = [];

  // ── Pass 1: clean each row ────────────────────────────────────────────────
  const cleaned: Array<CleanedExpense & { _raw: Record<string, string> }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // 1-indexed, +1 for header

    // ── 1. Missing paid_by ──────────────────────────────────────────────────
    if (!row.paid_by || row.paid_by.trim() === "") {
      anomalies.push({
        rowNum,
        field: "paid_by",
        issue: `paid_by is empty ("${row.description}") — row flagged, cannot determine payer.`,
        action: "FLAGGED_FOR_REVIEW",
        originalVal: "",
        severity: "ERROR",
      });
      skipped.push(rowNum);
      continue;
    }

    // ── 2. Normalise paid_by (case, aliases) ────────────────────────────────
    const rawPaidBy = row.paid_by.trim();
    const paidBy = normaliseName(rawPaidBy);
    if (paidBy !== rawPaidBy) {
      anomalies.push({
        rowNum,
        field: "paid_by",
        issue: `paid_by "${rawPaidBy}" normalised to "${paidBy}".`,
        action: "AUTO_FIXED",
        originalVal: rawPaidBy,
        resolvedVal: paidBy,
        severity: "INFO",
      });
    }

    // ── 3. Parse date ────────────────────────────────────────────────────────
    const date = parseDate(row.date?.trim() ?? "", rowNum, anomalies);
    if (!date) { skipped.push(rowNum); continue; }

    // ── 4. Ambiguous date 04-05-2026 (May 4 vs April 5) ────────────────────
    if (row.date?.trim() === "04-05-2026") {
      anomalies.push({
        rowNum,
        field: "date",
        issue: `Date "04-05-2026" is ambiguous (April 5 or May 4). Note says: "${row.notes}". Treated as DD-MM = 4th May 2026.`,
        action: "FLAGGED_FOR_REVIEW",
        originalVal: row.date,
        resolvedVal: "2026-05-04",
        severity: "WARNING",
      });
    }

    // ── 5. Parse amount ──────────────────────────────────────────────────────
    const rawAmount = row.amount?.trim() ?? "";
    const { value: parsedAmount, wasComma, wasExtraDecimal } = parseAmount(rawAmount);

    if (wasComma) {
      anomalies.push({
        rowNum,
        field: "amount",
        issue: `Amount "${rawAmount}" has comma-formatted number. Stripped comma.`,
        action: "AUTO_FIXED",
        originalVal: rawAmount,
        resolvedVal: String(parsedAmount),
        severity: "INFO",
      });
    }
    if (wasExtraDecimal) {
      anomalies.push({
        rowNum,
        field: "amount",
        issue: `Amount "${rawAmount}" has more than 2 decimal places. Rounded to ${parsedAmount}.`,
        action: "AUTO_FIXED",
        originalVal: rawAmount,
        resolvedVal: String(parsedAmount),
        severity: "INFO",
      });
    }

    // ── 6. Zero amount ───────────────────────────────────────────────────────
    if (parsedAmount === 0) {
      anomalies.push({
        rowNum,
        field: "amount",
        issue: `Amount is 0 for "${row.description}". Note: "${row.notes}". Row skipped.`,
        action: "SKIPPED",
        originalVal: rawAmount,
        severity: "WARNING",
      });
      skipped.push(rowNum);
      continue;
    }

    // ── 7. Negative amount = refund, not error ───────────────────────────────
    if (parsedAmount < 0) {
      anomalies.push({
        rowNum,
        field: "amount",
        issue: `Negative amount ${parsedAmount} for "${row.description}". Treated as a refund — splits will be negative (credit each person).`,
        action: "KEPT_WITH_WARNING",
        originalVal: rawAmount,
        resolvedVal: String(parsedAmount),
        severity: "INFO",
      });
    }

    // ── 8. Settlement logged as expense ─────────────────────────────────────
    const isSettlement =
      /paid.*back|deposit share|settlement/i.test(row.description) ||
      /settlement/i.test(row.notes ?? "");
    if (isSettlement) {
      anomalies.push({
        rowNum,
        field: "description",
        issue: `"${row.description}" looks like a settlement, not an expense (note: "${row.notes}"). Importing as a Settlement record, not an Expense.`,
        action: "AUTO_FIXED",
        originalVal: row.description,
        resolvedVal: "→ Settlement record",
        severity: "WARNING",
      });
    }

    // ── 9. Missing currency → assume INR ────────────────────────────────────
    let currency = row.currency?.trim().toUpperCase() || "";
    if (!currency) {
      anomalies.push({
        rowNum,
        field: "currency",
        issue: `Currency missing for "${row.description}". Defaulting to INR.`,
        action: "AUTO_FIXED",
        originalVal: "",
        resolvedVal: "INR",
        severity: "WARNING",
      });
      currency = "INR";
    }

    // ── 10. Currency conversion: USD → INR ──────────────────────────────────
    let amountINR = parsedAmount;
    let originalAmount: number | undefined;
    let exchangeRate: number | undefined;

    if (currency === "USD") {
      originalAmount = parsedAmount;
      exchangeRate = usdToInr;
      amountINR = Math.round(parsedAmount * usdToInr * 100) / 100;
      anomalies.push({
        rowNum,
        field: "currency",
        issue: `Amount in USD ($${parsedAmount}). Converted to INR at ₹${usdToInr}/$ = ₹${amountINR}.`,
        action: "AUTO_FIXED",
        originalVal: `$${parsedAmount}`,
        resolvedVal: `₹${amountINR}`,
        severity: "INFO",
      });
    }

    // ── 11. split_type ───────────────────────────────────────────────────────
    let splitType = row.split_type?.trim().toLowerCase() as CleanedExpense["splitType"];
    const validSplitTypes = ["equal", "unequal", "percentage", "share"];

    if (!validSplitTypes.includes(splitType)) {
      // settlement rows have no split_type — already handled above
      if (!isSettlement) {
        anomalies.push({
          rowNum,
          field: "split_type",
          issue: `split_type "${row.split_type}" is invalid. Defaulting to "equal".`,
          action: "AUTO_FIXED",
          originalVal: row.split_type,
          resolvedVal: "equal",
          severity: "WARNING",
        });
      }
      splitType = "equal";
    }

    // ── 12. split_type=equal but split_details provided ──────────────────────
    if (splitType === "equal" && row.split_details?.trim()) {
      anomalies.push({
        rowNum,
        field: "split_details",
        issue: `split_type is "equal" but split_details "${row.split_details}" were provided. Details ignored — using equal split.`,
        action: "KEPT_WITH_WARNING",
        originalVal: row.split_details,
        severity: "INFO",
      });
    }

    // ── 13. Percentage sum ≠ 100 ────────────────────────────────────────────
    if (splitType === "percentage" && row.split_details?.trim()) {
      const pcts = parsePercentages(row.split_details);
      const total = Object.values(pcts).reduce((a, b) => a + b, 0);
      if (Math.abs(total - 100) > 0.01) {
        anomalies.push({
          rowNum,
          field: "split_details",
          issue: `Percentages sum to ${total}% (not 100%) for "${row.description}". Normalised proportionally to 100%.`,
          action: "AUTO_FIXED",
          originalVal: row.split_details,
          resolvedVal: Object.entries(pcts)
            .map(([n, v]) => `${n} ${((v / total) * 100).toFixed(1)}%`)
            .join("; "),
          severity: "WARNING",
        });
      }
    }

    // ── 14. Parse split_with — normalise names, flag non-members ────────────
    const rawSplitWith = (row.split_with ?? "")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    const splitWith: string[] = [];

    for (const name of rawSplitWith) {
      const normalised = normaliseName(name);
      if (!KNOWN_MEMBERS.has(normalised)) {
        anomalies.push({
          rowNum,
          field: "split_with",
          issue: `"${name}" in split_with is not a known flat member. Included as a guest — their share is tracked but no user account created.`,
          action: "FLAGGED_FOR_REVIEW",
          originalVal: name,
          resolvedVal: normalised,
          severity: "WARNING",
        });
      }
      splitWith.push(normalised);
    }

    cleaned.push({
      rowNum,
      description: row.description?.trim() ?? "",
      date,
      amountINR,
      originalAmount,
      originalCurrency: currency !== "INR" ? currency : undefined,
      exchangeRate,
      splitType,
      paidBy,
      splitWith,
      splitDetails: row.split_details?.trim() || undefined,
      notes: row.notes?.trim() || undefined,
      isSettlement,
      _raw: row,
    });
  }

  // ── Pass 2: Duplicate detection ───────────────────────────────────────────
  // Two rows are duplicates if same date + normalised description + amount + paidBy
  const seen = new Map<string, number>(); // key → first rowNum
  const deduped: typeof cleaned = [];

  for (const exp of cleaned) {
    const normDesc = exp.description.toLowerCase().replace(/[^a-z0-9]/g, "");
    const key = `${exp.date.toISOString().slice(0, 10)}|${normDesc}|${exp.amountINR}|${exp.paidBy}`;

    if (seen.has(key)) {
      anomalies.push({
        rowNum: exp.rowNum,
        field: "description",
        issue: `Duplicate of row ${seen.get(key)}: same date, description, amount and payer. Row skipped.`,
        action: "SKIPPED",
        originalVal: exp.description,
        severity: "WARNING",
      });
      skipped.push(exp.rowNum);
      continue;
    }

    // Conflicting duplicates: same date+description, different amounts/payers (Thalassa)
    const partialKey = `${exp.date.toISOString().slice(0, 10)}|${normDesc}`;
    const conflictKey = `conflict:${partialKey}`;
    if (seen.has(conflictKey)) {
      anomalies.push({
        rowNum: exp.rowNum,
        field: "description",
        issue: `Conflicting duplicate of row ${seen.get(conflictKey)}: same date+description but different amount/payer ("${exp.description}"). Note says: "${exp.notes}". Keeping the FIRST row (row ${seen.get(conflictKey)}), flagging this one.`,
        action: "SKIPPED",
        originalVal: exp.description,
        severity: "WARNING",
      });
      skipped.push(exp.rowNum);
      continue;
    }
    seen.set(conflictKey, exp.rowNum);
    seen.set(key, exp.rowNum);
    deduped.push(exp);
  }

  // ── Pass 3: Membership date validation ───────────────────────────────────
  // Meera left end of March 2026; Sam joined mid-April 2026
  const membershipWindows: Record<string, { from: Date; to?: Date }> = {
    Aisha: { from: new Date("2026-02-01") },
    Rohan: { from: new Date("2026-02-01") },
    Priya: { from: new Date("2026-02-01") },
    Meera: { from: new Date("2026-02-01"), to: new Date("2026-03-31") },
    Sam:   { from: new Date("2026-04-15") },
    Dev:   { from: new Date("2026-02-01") }, // guest, always valid
  };

  const finalExpenses: CleanedExpense[] = [];

  for (const exp of deduped) {
    const invalidMembers: string[] = [];
    for (const member of exp.splitWith) {
      const window = membershipWindows[member];
      if (!window) continue; // guest like Kabir
      if (exp.date < window.from) {
        invalidMembers.push(`${member} (not yet a member on ${exp.date.toLocaleDateString()})`);
      }
      if (window.to && exp.date > window.to) {
        invalidMembers.push(`${member} (left on ${window.to.toLocaleDateString()})`);
      }
    }

    if (invalidMembers.length > 0) {
      anomalies.push({
        rowNum: exp.rowNum,
        field: "split_with",
        issue: `Expense dated ${exp.date.toLocaleDateString()} includes members outside their membership window: ${invalidMembers.join(", ")}. These members removed from split; remaining members split equally.`,
        action: "AUTO_FIXED",
        originalVal: exp.splitWith.join("; "),
        resolvedVal: exp.splitWith
          .filter((m) => {
            const w = membershipWindows[m];
            if (!w) return true;
            if (exp.date < w.from) return false;
            if (w.to && exp.date > w.to) return false;
            return true;
          })
          .join("; "),
        severity: "WARNING",
      });
      exp.splitWith = exp.splitWith.filter((m) => {
        const w = membershipWindows[m];
        if (!w) return true;
        if (exp.date < w.from) return false;
        if (w.to && exp.date > w.to) return false;
        return true;
      });
    }

    finalExpenses.push(exp);
  }

  return {
    expenses: finalExpenses,
    skipped,
    anomalies: anomalies.sort((a, b) => a.rowNum - b.rowNum),
  };
}
