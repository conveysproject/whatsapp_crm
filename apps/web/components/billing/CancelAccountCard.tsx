"use client";

import { useEffect, useRef, useState, type JSX } from "react";
import { useAuth } from "@/lib/auth/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_BASE } from "@/lib/message-usage";
import { normalizeCancellation, cancellationText, type CancellationState } from "@/lib/billing-cancellation";

/**
 * "Cancel account" on the billing page. An admin asks to cancel (after an explicit confirmation); the WBMSG team approves.
 * Shows the request's state afterwards, and lets the admin withdraw a request that has not been approved yet.
 */
export function CancelAccountCard(): JSX.Element {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const noRef = useRef<HTMLButtonElement>(null);

  const q = useQuery<CancellationState | null>({
    queryKey: ["billing-cancellation"],
    queryFn: async ({ signal }) => {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/v1/billing/cancellation`, { headers: { Authorization: `Bearer ${token ?? ""}` }, signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return normalizeCancellation(((await res.json()) as { data?: unknown }).data);
    },
    retry: false,
  });

  async function call(path: string, body?: unknown): Promise<void> {
    const token = await getToken();
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
      body: JSON.stringify(body ?? {}),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(j.error?.message ?? `HTTP ${res.status}`);
    }
  }

  const request = useMutation({
    mutationFn: () => call("/v1/billing/cancellation", { confirm: true, reason: reason.trim() || undefined }),
    onSuccess: () => { setOpen(false); setError(null); setReason(""); void qc.invalidateQueries({ queryKey: ["billing-cancellation"] }); },
    onError: (e: Error) => setError(e.message),
  });
  const withdraw = useMutation({
    mutationFn: () => call("/v1/billing/cancellation/withdraw"),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["billing-cancellation"] }); },
    onError: (e: Error) => setError(e.message),
  });

  useEffect(() => {
    if (!open) return;
    noRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => { if (e.key === "Escape" && !request.isPending) setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, request.isPending]);

  if (q.isError) return <></>;
  const state = q.data ?? null;
  const text = state ? cancellationText(state) : null;

  return (
    <section data-testid="cancel-account" className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-gray-900">Cancel account</h2>
      {state && state.status !== "withdrawn" ? (
        <>
          <p className="mt-2 text-sm text-gray-700">{text}</p>
          {state.status === "requested" && (
            <button type="button" disabled={withdraw.isPending} onClick={() => withdraw.mutate()} className="mt-3 min-h-[44px] rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-800 hover:bg-gray-50 disabled:opacity-60">
              Withdraw request
            </button>
          )}
        </>
      ) : (
        <>
          <p className="mt-2 text-sm text-gray-600">No contract and no cancellation fee. When we confirm your cancellation, sending stops, you get a final statement for the messages counted so far, and you keep access for 30 days to export your data.</p>
          <button type="button" onClick={() => { setError(null); setOpen(true); }} className="mt-3 min-h-[44px] rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
            Cancel my account
          </button>
        </>
      )}
      {error && !open && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => { if (!request.isPending) setOpen(false); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="cancel-title" onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <h3 id="cancel-title" className="text-xl font-bold text-gray-900">Cancel your WBMSG account?</h3>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-gray-700">
              <li>Nothing changes until we confirm. You can withdraw the request until then.</li>
              <li>When we confirm, sending WhatsApp messages from WBMSG stops straight away.</li>
              <li>You get a final statement for the messages counted so far in this billing month, using the same bands.</li>
              <li>You can sign in and export your contacts and conversations for 30 days. After that your data is deleted.</li>
            </ul>
            <label className="mt-4 block text-sm text-gray-700">Why are you leaving? (optional)
              <textarea value={reason} maxLength={500} rows={3} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
            </label>
            {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
            <div className="mt-5 flex justify-end gap-3">
              <button ref={noRef} type="button" disabled={request.isPending} onClick={() => setOpen(false)} className="min-h-[44px] rounded-lg border border-gray-300 px-5 py-2 text-sm text-gray-800 hover:bg-gray-50">Keep my account</button>
              <button type="button" disabled={request.isPending} onClick={() => request.mutate()} className="min-h-[44px] rounded-lg bg-red-700 px-5 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60">
                {request.isPending ? "Sending…" : "Request cancellation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
