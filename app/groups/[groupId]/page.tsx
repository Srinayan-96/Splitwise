"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";

interface Member {
  user: { id: string; name: string };
  joinedAt: string;
  leftAt: string | null;
}
interface Split {
  user: { id: string; name: string };
  amount: string;
}
interface Expense {
  id: string;
  description: string;
  date: string;
  amount: string;
  splitType: string;
  paidBy: { id: string; name: string };
  splits: Split[];
  notes?: string;
  originalAmount?: string;
  originalCurrency?: string;
  exchangeRate?: string;
}
interface Balance {
  userId: string;
  name: string;
  netBalance: number;
}
interface Debt {
  from: string;
  to: string;
  amount: number;
}

export default function GroupPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<"expenses" | "balances" | "import">(
    "expenses",
  );
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [groupName, setGroupName] = useState("");

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [usdRate, setUsdRate] = useState("83.5");
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState<null | {
    imported: number;
    settlementsImported: number;
    skipped: number[];
    anomalies: {
      rowNum: number;
      issue: string;
      action: string;
      severity: string;
    }[];
  }>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [newExp, setNewExp] = useState({
    description: "",
    date: new Date().toISOString().slice(0, 10),
    amount: "",
    splitType: "equal",
    paidById: "",
    notes: "",
  });

  const [showSettle, setShowSettle] = useState(false);
  const [settleForm, setSettleForm] = useState({
    payerId: "",
    receiverId: "",
    amount: "",
    date: new Date().toISOString().slice(0, 10),
    notes: "",
  });
  const [settling, setSettling] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => {
        if (!u) router.push("/login");
      });
    loadExpenses();
    fetch(`/api/groups`)
      .then((r) => r.json())
      .then((gs: { id: string; name: string; members: Member[] }[]) => {
        const g = gs.find((x) => x.id === groupId);
        if (g) {
          setGroupName(g.name);
          setMembers(g.members);
        }
      });
    loadBalances();
  }, [groupId]);

  function loadExpenses() {
    fetch(`/api/expenses?groupId=${groupId}`)
      .then((r) => r.json())
      .then(setExpenses);
  }
  function loadBalances() {
    fetch(`/api/balances?groupId=${groupId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.balances) {
          setBalances(d.balances);
          setDebts(d.debts);
        }
      });
  }

  async function deleteExpense(id: string) {
    if (!confirm("Delete this expense?")) return;
    await fetch(`/api/expenses/${id}`, { method: "DELETE" });
    loadExpenses();
    loadBalances();
  }

  async function addExpense(e: React.FormEvent) {
    e.preventDefault();
    const splitWith = members.filter((m) => !m.leftAt).map((m) => m.user.id);
    const share =
      Math.round((parseFloat(newExp.amount) / splitWith.length) * 100) / 100;
    const splits = splitWith.map((userId, i) => ({
      userId,
      amount:
        i === splitWith.length - 1
          ? Math.round(
              (parseFloat(newExp.amount) - share * (splitWith.length - 1)) *
                100,
            ) / 100
          : share,
    }));
    await fetch("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        groupId,
        ...newExp,
        amount: parseFloat(newExp.amount),
        splits,
      }),
    });
    setShowAdd(false);
    setNewExp({
      description: "",
      date: new Date().toISOString().slice(0, 10),
      amount: "",
      splitType: "equal",
      paidById: "",
      notes: "",
    });
    loadExpenses();
    loadBalances();
  }

  function prefillSettle(d: Debt) {
    const payer = members.find((m) => m.user.name === d.from);
    const receiver = members.find((m) => m.user.name === d.to);
    setSettleForm({
      payerId: payer?.user.id ?? "",
      receiverId: receiver?.user.id ?? "",
      amount: String(d.amount),
      date: new Date().toISOString().slice(0, 10),
      notes: "",
    });
    setShowSettle(true);
  }

  async function recordSettlement(e: React.FormEvent) {
    e.preventDefault();
    setSettling(true);
    await fetch("/api/settlements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        groupId,
        payerId: settleForm.payerId,
        receiverId: settleForm.receiverId,
        amount: parseFloat(settleForm.amount),
        date: settleForm.date,
        notes: settleForm.notes,
      }),
    });
    setSettling(false);
    setShowSettle(false);
    setSettleForm({
      payerId: "",
      receiverId: "",
      amount: "",
      date: new Date().toISOString().slice(0, 10),
      notes: "",
    });
    loadBalances();
  }

  async function doImport() {
    if (!csvFile) return;
    setImporting(true);
    setImportReport(null);
    const fd = new FormData();
    fd.append("file", csvFile);
    fd.append("groupId", groupId);
    fd.append("usdRate", usdRate);
    const res = await fetch("/api/import", { method: "POST", body: fd });
    const data = await res.json();
    setImportReport(data);
    setImporting(false);
    loadExpenses();
    loadBalances();
  }

  const activeMembers = members.filter((m) => !m.leftAt);
  const severityColor = (s: string) =>
    s === "ERROR"
      ? "bg-red-50 border-red-200 text-red-700"
      : s === "WARNING"
        ? "bg-yellow-50 border-yellow-200 text-yellow-700"
        : "bg-blue-50 border-blue-200 text-blue-600";

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard" className="text-gray-400 hover:text-gray-600">
          ←
        </Link>
        <h1 className="text-2xl font-bold text-gray-800">{groupName}</h1>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {members.map((m) => (
          <span
            key={m.user.id}
            className={`px-3 py-1 rounded-full text-sm font-medium ${m.leftAt ? "bg-gray-100 text-gray-400 line-through" : "bg-indigo-100 text-indigo-700"}`}
          >
            {m.user.name}
            {m.leftAt ? " (left)" : ""}
          </span>
        ))}
      </div>

      <div className="flex border-b mb-6">
        {(["expenses", "balances", "import"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-all ${
              tab === t
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* EXPENSES TAB */}
      {tab === "expenses" && (
        <div>
          <div className="flex justify-end mb-4">
            <button
              onClick={() => setShowAdd(!showAdd)}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"
            >
              + Add expense
            </button>
          </div>

          {showAdd && (
            <form
              onSubmit={addExpense}
              className="bg-white border rounded-xl p-5 mb-6 space-y-3"
            >
              <h3 className="font-semibold text-gray-700">New expense</h3>
              <input
                required
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="Description"
                value={newExp.description}
                onChange={(e) =>
                  setNewExp((n) => ({ ...n, description: e.target.value }))
                }
              />
              <div className="flex gap-3">
                <input
                  required
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="flex-1 border rounded-lg px-3 py-2 text-sm"
                  placeholder="Amount (₹)"
                  value={newExp.amount}
                  onChange={(e) =>
                    setNewExp((n) => ({ ...n, amount: e.target.value }))
                  }
                />
                <input
                  required
                  type="date"
                  className="flex-1 border rounded-lg px-3 py-2 text-sm"
                  value={newExp.date}
                  onChange={(e) =>
                    setNewExp((n) => ({ ...n, date: e.target.value }))
                  }
                />
              </div>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={newExp.paidById}
                onChange={(e) =>
                  setNewExp((n) => ({ ...n, paidById: e.target.value }))
                }
                required
              >
                <option value="">Who paid?</option>
                {activeMembers.map((m) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.name}
                  </option>
                ))}
              </select>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={newExp.splitType}
                onChange={(e) =>
                  setNewExp((n) => ({ ...n, splitType: e.target.value }))
                }
              >
                <option value="equal">Equal split</option>
                <option value="unequal">Unequal</option>
                <option value="percentage">Percentage</option>
                <option value="share">By shares</option>
              </select>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="Notes (optional)"
                value={newExp.notes}
                onChange={(e) =>
                  setNewExp((n) => ({ ...n, notes: e.target.value }))
                }
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="text-gray-500 text-sm px-4 py-2"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="space-y-3">
            {expenses.map((exp) => (
              <div key={exp.id} className="bg-white border rounded-xl p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-gray-800">
                      {exp.description}
                    </p>
                    <p className="text-sm text-gray-500">
                      {new Date(exp.date).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                      {" · "} paid by{" "}
                      <span className="font-medium">{exp.paidBy.name}</span>
                      {" · "}{" "}
                      <span className="capitalize text-indigo-600">
                        {exp.splitType}
                      </span>
                    </p>
                    {exp.originalCurrency && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Originally {exp.originalCurrency} {exp.originalAmount} @
                        ₹{exp.exchangeRate}/$
                      </p>
                    )}
                    {exp.notes && (
                      <p className="text-xs text-gray-400 italic mt-1">
                        {exp.notes}
                      </p>
                    )}
                    <div className="flex gap-2 flex-wrap mt-2">
                      {exp.splits.map((s) => (
                        <span
                          key={s.user.id}
                          className="text-xs bg-gray-100 px-2 py-0.5 rounded-full text-gray-600"
                        >
                          {s.user.name}: ₹
                          {Number(s.amount).toLocaleString("en-IN")}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right ml-4">
                    <p className="font-bold text-gray-800">
                      ₹{Number(exp.amount).toLocaleString("en-IN")}
                    </p>
                    <button
                      onClick={() => deleteExpense(exp.id)}
                      className="text-xs text-red-400 hover:text-red-600 mt-1"
                    >
                      delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {expenses.length === 0 && (
              <p className="text-gray-400 text-center py-8">
                No expenses yet. Import or add one.
              </p>
            )}
          </div>
        </div>
      )}

      {/* BALANCES TAB */}
      {tab === "balances" && (
        <div className="space-y-6">
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-indigo-800">Settle up</h3>
              <button
                onClick={() => setShowSettle(true)}
                className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700"
              >
                + Record payment
              </button>
            </div>
            {debts.length === 0 ? (
              <p className="text-indigo-600 text-sm">All settled! 🎉</p>
            ) : (
              debts.map((d, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 mb-2 bg-white rounded-lg p-3 border border-indigo-100"
                >
                  <span className="font-medium text-gray-800">{d.from}</span>
                  <span className="text-gray-400 text-sm">pays</span>
                  <span className="font-medium text-gray-800">{d.to}</span>
                  <span className="font-bold text-indigo-700 ml-1">
                    ₹{d.amount.toLocaleString("en-IN")}
                  </span>
                  <button
                    onClick={() => prefillSettle(d)}
                    className="ml-auto bg-green-500 hover:bg-green-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg"
                  >
                    Mark Paid ✓
                  </button>
                </div>
              ))
            )}
          </div>

          {showSettle && (
            <form
              onSubmit={recordSettlement}
              className="bg-white border border-green-200 rounded-xl p-5 space-y-3"
            >
              <h3 className="font-semibold text-gray-700">Record a payment</h3>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-gray-500 mb-1 block">
                    Who paid
                  </label>
                  <select
                    required
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={settleForm.payerId}
                    onChange={(e) =>
                      setSettleForm((f) => ({ ...f, payerId: e.target.value }))
                    }
                  >
                    <option value="">Select person</option>
                    {members.map((m) => (
                      <option key={m.user.id} value={m.user.id}>
                        {m.user.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-500 mb-1 block">
                    Paid to
                  </label>
                  <select
                    required
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={settleForm.receiverId}
                    onChange={(e) =>
                      setSettleForm((f) => ({
                        ...f,
                        receiverId: e.target.value,
                      }))
                    }
                  >
                    <option value="">Select person</option>
                    {members.map((m) => (
                      <option key={m.user.id} value={m.user.id}>
                        {m.user.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-3">
                <input
                  required
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="Amount (₹)"
                  className="flex-1 border rounded-lg px-3 py-2 text-sm"
                  value={settleForm.amount}
                  onChange={(e) =>
                    setSettleForm((f) => ({ ...f, amount: e.target.value }))
                  }
                />
                <input
                  required
                  type="date"
                  className="flex-1 border rounded-lg px-3 py-2 text-sm"
                  value={settleForm.date}
                  onChange={(e) =>
                    setSettleForm((f) => ({ ...f, date: e.target.value }))
                  }
                />
              </div>
              <input
                placeholder="Notes (optional)"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={settleForm.notes}
                onChange={(e) =>
                  setSettleForm((f) => ({ ...f, notes: e.target.value }))
                }
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={settling}
                  className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {settling ? "Saving..." : "Save payment"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowSettle(false)}
                  className="text-gray-500 text-sm px-4 py-2"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div>
            <h3 className="font-semibold text-gray-700 mb-3">
              Individual balances
            </h3>
            <div className="space-y-3">
              {balances.map((b) => (
                <div
                  key={b.userId}
                  className="bg-white border rounded-xl p-4 flex justify-between items-center"
                >
                  <span className="font-medium text-gray-800">{b.name}</span>
                  <span
                    className={`font-bold ${b.netBalance >= 0 ? "text-green-600" : "text-red-500"}`}
                  >
                    {b.netBalance >= 0 ? "+" : ""}₹
                    {Math.abs(b.netBalance).toLocaleString("en-IN")}
                    <span className="text-xs font-normal text-gray-400 ml-1">
                      {b.netBalance >= 0 ? "is owed" : "owes"}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* IMPORT TAB */}
      {tab === "import" && (
        <div className="space-y-4">
          <div className="bg-white border rounded-xl p-5">
            <h3 className="font-semibold text-gray-700 mb-4">
              Import expenses_export.csv
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-600 block mb-1">
                  CSV file
                </label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
                  className="text-sm text-gray-600"
                />
              </div>
              <div>
                <label className="text-sm text-gray-600 block mb-1">
                  USD → INR rate
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={usdRate}
                  onChange={(e) => setUsdRate(e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm w-40"
                />
              </div>
              <button
                onClick={doImport}
                disabled={!csvFile || importing}
                className="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {importing ? "Importing..." : "Import"}
              </button>
            </div>
          </div>

          {importReport && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <h4 className="font-semibold text-green-800 mb-1">
                  Import complete
                </h4>
                <p className="text-sm text-green-700">
                  {importReport.imported} expenses ·{" "}
                  {importReport.settlementsImported} settlements ·{" "}
                  {importReport.skipped.length} rows skipped ·{" "}
                  {importReport.anomalies.length} anomalies detected
                </p>
              </div>
              <div className="bg-white border rounded-xl p-5">
                <h4 className="font-semibold text-gray-700 mb-3">
                  Import report — anomaly log
                </h4>
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {importReport.anomalies.map((a, i) => (
                    <div
                      key={i}
                      className={`border rounded-lg p-3 text-sm ${severityColor(a.severity)}`}
                    >
                      <div className="flex gap-2 items-start">
                        <span className="font-mono font-bold whitespace-nowrap">
                          Row {a.rowNum}
                        </span>
                        <span className="flex-1">{a.issue}</span>
                        <span className="whitespace-nowrap font-medium">
                          {a.action}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
