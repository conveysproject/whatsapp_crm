"use client";

import { useState, type FormEvent, type JSX } from "react";
import { FULL_READ_ACCESS_SENTENCE } from "@/lib/parent-orgs";

/** Presentational: the page owns the request so this renders without a data layer. */
export function InviteClientForm({
  busy, error, sentTo, onSubmit, onClose,
}: {
  busy: boolean;
  error: string | null;
  sentTo: string | null;
  onSubmit: (email: string) => void;
  onClose: () => void;
}): JSX.Element {
  const [email, setEmail] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit(email);
  }
  return (
    <div role="dialog" aria-modal="true" aria-label="Invite client" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-gray-900">Invite client</h2>
        {sentTo ? (
          <p role="status" className="text-sm text-green-700">Invitation created for {sentTo}. It expires in 7 days.</p>
        ) : (
          <>
            <label className="block text-sm text-gray-700">
              Client email
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{FULL_READ_ACCESS_SENTENCE}</p>
          </>
        )}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
            {sentTo ? "Close" : "Cancel"}
          </button>
          {!sentTo && (
            <button type="submit" disabled={busy || !email.trim()} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
              {busy ? "Sending..." : "Send invitation"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
