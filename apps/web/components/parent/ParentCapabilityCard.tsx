"use client";

import { useState, type JSX } from "react";
import { useAuth } from "@/lib/auth/client";
import { NewBadge } from "@/components/ui/NewBadge";
import { describeError, setParentCapability } from "@/lib/parent-orgs";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

/** Super admin only (the page is under /admin and the API checks the role). */
export function ParentCapabilityCard({ orgId, isParent, onChanged }: { orgId: string; isParent: boolean; onChanged: () => void }): JSX.Element {
  const { getToken } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(enabled: boolean) {
    setBusy(true);
    setError(null);
    try {
      const token = await getToken();
      await setParentCapability(API_URL, token ?? "", orgId, enabled);
      onChanged();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border rounded-lg p-5 space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="font-medium">Clients</h2>
        <NewBadge />
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={isParent} disabled={busy} onChange={(e) => { void toggle(e.target.checked); }} />
        Allow this organization to have clients
      </label>
      <p className="text-xs text-gray-500">
        A client organization can never have clients of its own, and this cannot be turned off while the organization still has clients.
      </p>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
