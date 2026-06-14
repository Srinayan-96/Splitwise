"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Group { id: string; name: string; _count: { expenses: number }; members: { user: { id: string; name: string } }[] }

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<{ id: string; name: string } | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [newGroup, setNewGroup] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.ok ? r.json() : null).then(u => {
      if (!u) { router.push("/login"); return; }
      setUser(u);
    });
    fetch("/api/groups").then(r => r.json()).then(setGroups);
  }, []);

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!newGroup.trim()) return;
    setCreating(true);
    const res = await fetch("/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newGroup }),
    });
    const g = await res.json();
    setGroups(gs => [g, ...gs]);
    setNewGroup("");
    setCreating(false);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-indigo-700">FlatSplit</h1>
          <p className="text-gray-500 text-sm">Welcome back, {user?.name}</p>
        </div>
        <button onClick={logout} className="text-sm text-gray-500 hover:text-red-500">Sign out</button>
      </div>

      <form onSubmit={createGroup} className="flex gap-2 mb-8">
        <input value={newGroup} onChange={e => setNewGroup(e.target.value)}
          className="flex-1 border rounded-lg px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
          placeholder="New group name (e.g. Flat 4B)" />
        <button type="submit" disabled={creating}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
          Create group
        </button>
      </form>

      {groups.length === 0 && (
        <p className="text-gray-400 text-center py-12">No groups yet. Create one above.</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {groups.map(g => (
          <Link key={g.id} href={`/groups/${g.id}`}
            className="bg-white rounded-xl border p-5 hover:border-indigo-300 hover:shadow-md transition">
            <h2 className="font-semibold text-gray-800 mb-1">{g.name}</h2>
            <p className="text-sm text-gray-500">
              {g._count.expenses} expense{g._count.expenses !== 1 ? "s" : ""} ·{" "}
              {g.members.map(m => m.user.name).join(", ")}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
