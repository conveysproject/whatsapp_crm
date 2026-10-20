import type { JSX } from "react";
import { formatFailureRate, formatWhen, totalsFailureRate, type ChildRow, type Totals } from "@/lib/parent-orgs";

const n = (v: number) => v.toLocaleString("en-US");

export function ChildrenTable({
  rows, totals, busyId, onOpen, onOpenAsAdmin,
}: {
  rows: ChildRow[];
  totals: Totals;
  busyId: string | null;
  onOpen: (childId: string) => void;
  onOpenAsAdmin: (child: ChildRow) => void;
}): JSX.Element {
  const th = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500";
  const num = "px-3 py-2 text-right tabular-nums";
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-100 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className={th}>Client</th>
            <th className={`${th} text-right`}>Sent</th>
            <th className={`${th} text-right`}>Delivered</th>
            <th className={`${th} text-right`}>Read</th>
            <th className={`${th} text-right`}>Failed</th>
            <th className={`${th} text-right`}>Received</th>
            <th className={`${th} text-right`}>Failure rate</th>
            <th className={th}>Last activity</th>
            <th className={th}>WhatsApp connected</th>
            <th className={th}><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((c) => (
            <tr key={c.orgId} onClick={() => onOpen(c.orgId)} className="cursor-pointer hover:bg-gray-50">
              <td className="px-3 py-2 font-medium text-gray-900">{c.name}</td>
              <td className={num}>{n(c.sent)}</td>
              <td className={num}>{n(c.delivered)}</td>
              <td className={num}>{n(c.read)}</td>
              <td className={num}>{n(c.failed)}</td>
              <td className={num}>{n(c.received)}</td>
              <td className={num}>{formatFailureRate(c.failureRate)}</td>
              <td className="px-3 py-2 text-gray-600">{formatWhen(c.lastActivityAt)}</td>
              <td className="px-3 py-2">{c.wabaConnected ? "Yes" : "No"}</td>
              <td className="px-3 py-2 text-right">
                <button
                  type="button"
                  disabled={busyId === c.orgId}
                  onClick={(e) => { e.stopPropagation(); onOpenAsAdmin(c); }}
                  className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                >
                  {busyId === c.orgId ? "Opening..." : "Open as admin"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-gray-50 font-semibold">
          <tr>
            <td className="px-3 py-2">Total</td>
            <td className={num}>{n(totals.sent)}</td>
            <td className={num}>{n(totals.delivered)}</td>
            <td className={num}>{n(totals.read)}</td>
            <td className={num}>{n(totals.failed)}</td>
            <td className={num}>{n(totals.received)}</td>
            <td className={num}>{formatFailureRate(totalsFailureRate(totals))}</td>
            <td colSpan={3} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
