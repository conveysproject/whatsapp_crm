"use client";

import { useState, type FormEvent, type JSX } from "react";
import { useRouter } from "next/navigation";

export default function InviteTeamPage(): JSX.Element {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("agent");
  const [sent, setSent] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleInvite(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    await fetch("/api/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
    setSent((prev) => [...prev, email]);
    setEmail("");
    setLoading(false);
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 mb-2">Invite Your Team</h2>
      <p className="text-sm text-gray-500 mb-6">Add colleagues who will use TrustCRM.</p>

      <form onSubmit={handleInvite} className="flex gap-2 mb-4">
        <input
          type="email"
          placeholder="colleague@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="border border-gray-300 rounded-lg px-2 py-2 text-sm"
        >
          <option value="admin">Admin</option>
          <option value="manager">Manager</option>
          <option value="agent">Agent</option>
          <option value="viewer">Viewer</option>
        </select>
        <button
          type="submit"
          disabled={loading}
          className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
        >
          Invite
        </button>
      </form>

      {sent.length > 0 && (
        <ul className="mb-4 space-y-1">
          {sent.map((e) => (
            <li key={e} className="text-sm text-gray-600 flex items-center gap-1">
              <span className="text-green-500">&#10003;</span> {e}
            </li>
          ))}
        </ul>
      )}

      <button
        onClick={() => router.push("/onboarding/checklist")}
        className="w-full border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg hover:bg-gray-50 transition-colors text-sm"
      >
        {sent.length > 0 ? "Done — go to checklist" : "Skip for now"}
      </button>
    </div>
  );
}
