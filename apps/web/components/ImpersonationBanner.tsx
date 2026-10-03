"use client";

import { JSX, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { toast } from "sonner";
import {
  IMPERSONATION_STORAGE_KEY,
  parseImpersonationSession,
  type ImpersonationSession,
} from "@/lib/impersonation";

const API_URL = (process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000").replace(/\/+$/, "");

export function ImpersonationBanner(): JSX.Element | null {
  const { getToken } = useAuth();
  const [state, setState] = useState<ImpersonationSession | null>(null);
  const [askingReason, setAskingReason] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem(IMPERSONATION_STORAGE_KEY);
    const session = parseImpersonationSession(raw);
    if (session) {
      setState(session);
    } else if (raw) {
      // Malformed or already expired.
      sessionStorage.removeItem(IMPERSONATION_STORAGE_KEY);
      toast.info("Impersonation session expired.");
      window.location.href = "/admin/organizations";
    }
  }, []);

  // Auto-exit when the token expires.
  useEffect(() => {
    if (!state) return;
    const ms = state.expiresAt - Date.now();
    const timer = setTimeout(() => {
      sessionStorage.removeItem(IMPERSONATION_STORAGE_KEY);
      setState(null);
      toast.info("Impersonation session expired.");
      window.location.href = "/admin/organizations";
    }, Math.max(0, Math.min(ms, 2_147_000_000)));
    return () => clearTimeout(timer);
  }, [state]);

  // These calls are made as the real super admin (Clerk token only). The fetch
  // interceptor never adds the impersonation header to these paths.
  async function adminCall(path: string, method: "POST" | "DELETE", body: unknown): Promise<Response> {
    const clerk = await getToken();
    return fetch(`${API_URL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${clerk ?? ""}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function exit() {
    if (!state || busy) return;
    setBusy(true);
    try {
      const res = await adminCall(`/v1/admin/organizations/${state.orgId}/impersonate`, "DELETE", { token: state.token });
      if (!res.ok && res.status !== 404) toast.error("Could not revoke the token on the server; it will expire on its own.");
    } catch {
      toast.error("Could not revoke the token on the server; it will expire on its own.");
    }
    sessionStorage.removeItem(IMPERSONATION_STORAGE_KEY);
    setState(null);
    window.location.href = "/admin/organizations";
  }

  async function enableEdit() {
    if (!state || busy) return;
    const trimmed = reason.trim();
    if (trimmed.length < 10 || trimmed.length > 500) {
      toast.error("Reason must be between 10 and 500 characters.");
      return;
    }
    setBusy(true);
    try {
      const res = await adminCall("/v1/admin/impersonation/elevate", "POST", { token: state.token, reason: trimmed });
      if (res.ok || res.status === 409) {
        // 409 = already in edit mode on the server; sync the UI.
        const next: ImpersonationSession = { ...state, mode: "edit" };
        sessionStorage.setItem(IMPERSONATION_STORAGE_KEY, JSON.stringify(next));
        setState(next);
        setAskingReason(false);
        setReason("");
        toast.success("Edit mode enabled. Your actions are audited.");
      } else {
        const err = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        toast.error(err?.error?.message ?? `Could not enable edit mode (${res.status})`);
      }
    } catch {
      toast.error("Could not enable edit mode. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!state) return null;

  const isEdit = state.mode === "edit";
  const who = state.userName || "user";
  const org = state.orgName || "organization";

  return (
    <div className={`${isEdit ? "bg-red-600" : "bg-amber-500"} text-white px-4 py-2 text-sm`}>
      <div className="flex items-center justify-between gap-4">
        <span>
          Viewing as <strong>{who}</strong> ({org}) - {isEdit ? "EDIT MODE (actions are audited)" : "read-only"}
        </span>
        <div className="flex items-center gap-4">
          {!isEdit && !askingReason && (
            <button onClick={() => setAskingReason(true)} className="underline hover:no-underline font-medium">
              Enable edit
            </button>
          )}
          <button onClick={() => { void exit(); }} disabled={busy} className="underline hover:no-underline font-medium disabled:opacity-50">
            Exit
          </button>
        </div>
      </div>
      {!isEdit && askingReason && (
        <form
          className="mt-2 flex items-center gap-2"
          onSubmit={(e) => { e.preventDefault(); void enableEdit(); }}
        >
          <input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            placeholder="Reason for enabling edit (10-500 characters)"
            className="flex-1 rounded px-2 py-1 text-gray-900 text-sm"
          />
          <button
            type="submit"
            disabled={busy || reason.trim().length < 10}
            className="px-3 py-1 rounded bg-white text-amber-700 font-medium disabled:opacity-50"
          >
            {busy ? "..." : "Confirm"}
          </button>
          <button type="button" onClick={() => { setAskingReason(false); setReason(""); }} className="underline">
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}
