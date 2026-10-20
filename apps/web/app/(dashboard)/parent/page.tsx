"use client";

import { useState, type JSX } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ParentGate, NotAvailable } from "@/components/parent/ParentGate";
import { ChildrenTable } from "@/components/parent/ChildrenTable";
import { InviteClientForm } from "@/components/parent/InviteClientForm";
import { NewBadge } from "@/components/ui/NewBadge";
import { setImpersonationCookie } from "@/lib/impersonation";
import {
  DEFAULT_RANGE_DAYS, ParentApiError, describeError, fetchInvites, fetchParentDashboard, formatWhen,
  inviteClient, lastDaysRange, openChildAsAdmin, revokeInvite, type ChildRow,
} from "@/lib/parent-orgs";

const RANGES = [{ days: 7, label: "Last 7 days" }, { days: 30, label: "Last 30 days" }, { days: 90, label: "Last 90 days" }];

export default function ParentOverviewPage(): JSX.Element {
  return (
    <ParentGate>
      <Overview />
    </ParentGate>
  );
}

function Overview(): JSX.Element {
  const router = useRouter();
  const qc = useQueryClient();
  const [days, setDays] = useState(DEFAULT_RANGE_DAYS);
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const dash = useQuery({ queryKey: ["parent-dashboard", days], queryFn: () => fetchParentDashboard(lastDaysRange(days)), retry: false });
  const invites = useQuery({ queryKey: ["client-invitations"], queryFn: fetchInvites, retry: false });

  const invite = useMutation({
    mutationFn: inviteClient,
    onSuccess: (_r, email) => { setSentTo(email.trim()); setInviteError(null); void qc.invalidateQueries({ queryKey: ["client-invitations"] }); },
    onError: (err) => setInviteError(describeError(err)),
  });
  const revoke = useMutation({
    mutationFn: revokeInvite,
    onSuccess: () => { toast.success("Invitation revoked."); void qc.invalidateQueries({ queryKey: ["client-invitations"] }); },
    onError: (err) => toast.error(describeError(err)),
  });

  async function openAsAdmin(child: ChildRow) {
    setBusyId(child.orgId);
    try {
      await openChildAsAdmin(child, { setCookie: setImpersonationCookie, storage: sessionStorage });
      window.location.href = "/dashboard";
    } catch (err) {
      toast.error(err instanceof ParentApiError && err.status === 429 ? "Limit reached (10 sessions per hour)." : describeError(err));
      setBusyId(null);
    }
  }

  function closeInvite() { setInviting(false); setInviteError(null); setSentTo(null); }

  if (dash.isError && dash.error instanceof ParentApiError && dash.error.status === 404) return <NotAvailable />;

  const pending = (invites.data ?? []).filter((i) => i.status === "pending");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
          <NewBadge />
        </div>
        <div className="flex items-center gap-3">
          <select
            aria-label="Date range"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700"
          >
            {RANGES.map((r) => <option key={r.days} value={r.days}>{r.label}</option>)}
          </select>
          <button type="button" onClick={() => setInviting(true)} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">
            Invite client
          </button>
        </div>
      </div>

      {dash.isLoading ? (
        <div className="h-40 animate-pulse rounded-xl bg-gray-100" />
      ) : dash.isError ? (
        <div role="alert" className="space-y-2">
          <p className="text-sm text-red-600">{describeError(dash.error)}</p>
          <button type="button" onClick={() => { void dash.refetch(); }} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">Try again</button>
        </div>
      ) : dash.data && dash.data.children.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-600">
          You have no clients yet. Invite a client to see their message totals here.
        </div>
      ) : dash.data ? (
        <ChildrenTable
          rows={dash.data.children}
          totals={dash.data.totals}
          busyId={busyId}
          onOpen={(id) => router.push(`/parent/${encodeURIComponent(id)}`)}
          onOpenAsAdmin={(c) => { void openAsAdmin(c); }}
        />
      ) : null}

      <section className="rounded-xl border border-gray-200 bg-white">
        <h2 className="border-b border-gray-100 px-5 py-4 text-sm font-semibold text-gray-900">Pending invitations</h2>
        {invites.isLoading ? (
          <div className="p-5 text-sm text-gray-400">Loading...</div>
        ) : invites.isError ? (
          <p role="alert" className="p-5 text-sm text-red-600">{describeError(invites.error)}</p>
        ) : pending.length === 0 ? (
          <p className="p-5 text-sm text-gray-500">No pending invitations.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {pending.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                <span className="font-medium text-gray-900">{i.email}</span>
                <span className="text-gray-500">Expires {formatWhen(i.expiresAt)}</span>
                <button
                  type="button"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate(i.id)}
                  className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {inviting && (
        <InviteClientForm busy={invite.isPending} error={inviteError} sentTo={sentTo} onSubmit={(email) => invite.mutate(email)} onClose={closeInvite} />
      )}
    </div>
  );
}
