"use client";

import { useReducer, useState, type JSX } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ParentGate, NotAvailable } from "@/components/parent/ParentGate";
import { ConfirmDialog } from "@/components/parent/ConfirmDialog";
import { setImpersonationCookie } from "@/lib/impersonation";
import {
  CONTENT_READ_LOGGED_NOTICE, DEFAULT_RANGE_DAYS, ParentApiError, confirmReducer, describeError, fetchChildMessages,
  fetchChildStats, formatFailureRate, formatWhen, lastDaysRange, openChildAsAdmin, removeChild, runConfirmed,
} from "@/lib/parent-orgs";

export default function ParentChildPage(): JSX.Element {
  return (
    <ParentGate>
      <ChildDetail />
    </ParentGate>
  );
}

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-gray-900 tabular-nums">{value}</p>
    </div>
  );
}

function ChildDetail(): JSX.Element {
  const { childId } = useParams<{ childId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [opening, setOpening] = useState(false);
  const [gate, dispatch] = useReducer(confirmReducer, "idle");
  const [removeError, setRemoveError] = useState<string | null>(null);

  const stats = useQuery({
    queryKey: ["parent-child-stats", childId],
    queryFn: () => fetchChildStats(childId, lastDaysRange(DEFAULT_RANGE_DAYS)),
    retry: false,
  });
  const messages = useInfiniteQuery({
    queryKey: ["parent-child-messages", childId],
    queryFn: ({ pageParam }) => fetchChildMessages(childId, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    retry: false,
  });

  async function openAsAdmin() {
    if (!stats.data) return;
    setOpening(true);
    try {
      await openChildAsAdmin({ orgId: childId, name: stats.data.name }, { setCookie: setImpersonationCookie, storage: sessionStorage });
      window.location.href = "/dashboard";
    } catch (err) {
      toast.error(err instanceof ParentApiError && err.status === 429 ? "Limit reached (10 sessions per hour)." : describeError(err));
      setOpening(false);
    }
  }

  async function confirmRemove() {
    setRemoveError(null);
    const current = gate;
    dispatch("confirm");
    try {
      await runConfirmed(current, () => removeChild(childId));
      await qc.invalidateQueries({ queryKey: ["parent-dashboard"] });
      toast.success("Client removed.");
      router.push("/parent");
      return;
    } catch (err) {
      setRemoveError(describeError(err));
    }
    dispatch("done");
  }

  if (stats.isError && stats.error instanceof ParentApiError && (stats.error.status === 404 || stats.error.status === 403)) {
    return (
      <div className="space-y-3">
        <Link href="/parent" className="text-sm text-gray-500 hover:text-gray-700">Back to clients</Link>
        <NotAvailable message={stats.error.status === 404 ? undefined : "This client is not available. It may have been removed."} />
      </div>
    );
  }

  const s = stats.data;
  const rows = messages.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/parent" className="text-sm text-gray-500 hover:text-gray-700">Back to clients</Link>
          <h1 className="text-2xl font-bold text-gray-900">{s ? s.name : "Client"}</h1>
          <p className="text-sm text-gray-500">Last {DEFAULT_RANGE_DAYS} days</p>
        </div>
        <div className="flex gap-2">
          <button type="button" disabled={!s || opening} onClick={() => { void openAsAdmin(); }} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
            {opening ? "Opening..." : "Open as admin"}
          </button>
          <button type="button" disabled={!s} onClick={() => { setRemoveError(null); dispatch("request"); }} className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">
            Remove client
          </button>
        </div>
      </div>

      {stats.isLoading ? (
        <div className="h-24 animate-pulse rounded-xl bg-gray-100" />
      ) : stats.isError ? (
        <div role="alert" className="space-y-2">
          <p className="text-sm text-red-600">{describeError(stats.error)}</p>
          <button type="button" onClick={() => { void stats.refetch(); }} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">Try again</button>
        </div>
      ) : s ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Sent" value={s.sent.toLocaleString("en-US")} />
          <Stat label="Delivered" value={s.delivered.toLocaleString("en-US")} />
          <Stat label="Read" value={s.read.toLocaleString("en-US")} />
          <Stat label="Failed" value={s.failed.toLocaleString("en-US")} />
          <Stat label="Received" value={s.received.toLocaleString("en-US")} />
          <Stat label="Failure rate" value={formatFailureRate(s.failureRate)} />
          <Stat label="Last activity" value={formatWhen(s.lastActivityAt)} />
          <Stat label="WhatsApp connected" value={s.wabaConnected ? "Yes" : "No"} />
        </div>
      ) : null}

      <section className="rounded-xl border border-gray-200 bg-white">
        <h2 className="border-b border-gray-100 px-5 py-4 text-sm font-semibold text-gray-900">Recent messages</h2>
        <p className="border-b border-gray-100 bg-amber-50 px-5 py-3 text-sm text-amber-900">{CONTENT_READ_LOGGED_NOTICE}</p>
        {messages.isLoading ? (
          <div className="p-5 text-sm text-gray-400">Loading...</div>
        ) : messages.isError ? (
          <div role="alert" className="space-y-2 p-5">
            <p className="text-sm text-red-600">{describeError(messages.error)}</p>
            <button type="button" onClick={() => { void messages.refetch(); }} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">Try again</button>
          </div>
        ) : rows.length === 0 ? (
          <p className="p-5 text-sm text-gray-500">No messages yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {rows.map((m) => (
              <li key={m.id} className="px-5 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                  <span>{m.direction === "inbound" ? "From" : "To"} {m.contactName || m.contactPhone || "Unknown contact"}</span>
                  <span>{formatWhen(m.sentAt)} - {m.status}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-gray-900">{m.body ?? `[${m.contentType}]`}</p>
              </li>
            ))}
          </ul>
        )}
        {messages.hasNextPage && (
          <div className="border-t border-gray-100 p-3 text-center">
            <button type="button" disabled={messages.isFetchingNextPage} onClick={() => { void messages.fetchNextPage(); }} className="rounded-lg border border-gray-200 px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              {messages.isFetchingNextPage ? "Loading..." : "Load more"}
            </button>
          </div>
        )}
      </section>

      {gate !== "idle" && (
        <ConfirmDialog title={`Remove ${s?.name ?? "this client"}?`} confirmLabel="Remove client" busy={gate === "running"} error={removeError} onConfirm={() => { void confirmRemove(); }} onCancel={() => dispatch("cancel")}>
          <p>You will lose read access to this client and will no longer see it here. The client keeps its own account and data.</p>
          <p>To link it again, you need to send a new invitation.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
