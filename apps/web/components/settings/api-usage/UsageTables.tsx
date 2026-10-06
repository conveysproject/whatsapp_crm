import type { JSX, ReactNode } from "react";
import {
  endpointLabel,
  errorCount,
  formatCount,
  formatDuration,
  MESSAGE_STATUSES,
  statusLabel,
  type CredentialUsage,
  type EndpointUsage,
  type FailureReason,
  type MessageStatus,
} from "@/lib/api-usage";
import { formatLastUsed } from "@/lib/api-credentials";

export function Panel({ title, id, children }: { title: string; id: string; children: ReactNode }): JSX.Element {
  return (
    <section aria-labelledby={id} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
      <h2 id={id} className="text-sm font-semibold mb-3">{title}</h2>
      {children}
    </section>
  );
}

const th = "px-2 py-1.5 text-left font-medium text-gray-500 dark:text-gray-400";
const thNum = "px-2 py-1.5 text-right font-medium text-gray-500 dark:text-gray-400";
const td = "px-2 py-1.5";
const tdNum = "px-2 py-1.5 text-right tabular-nums";

export function EndpointTable({ rows }: { rows: EndpointUsage[] }): JSX.Element {
  return (
    <Panel title="By endpoint" id="usage-by-endpoint">
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No requests in this period.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="endpoint-table">
            <thead>
              <tr>
                <th scope="col" className={th}>Endpoint</th>
                <th scope="col" className={thNum}>Requests</th>
                <th scope="col" className={thNum}>Success</th>
                <th scope="col" className={thNum}>Errors</th>
                <th scope="col" className={thNum}>Avg latency</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {rows.map((r) => (
                <tr key={r.endpoint}>
                  <th scope="row" className={`${td} font-normal text-left`}>{endpointLabel(r.endpoint)}</th>
                  <td className={tdNum}>{formatCount(r.requests)}</td>
                  <td className={tdNum}>{formatCount(r.success)}</td>
                  <td className={tdNum}>{formatCount(errorCount(r))}</td>
                  <td className={tdNum}>{formatDuration(r.avgLatencyMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

export function CredentialTable({
  rows,
  selectedId,
  onSelect,
}: {
  rows: CredentialUsage[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}): JSX.Element {
  return (
    <Panel title="By credential" id="usage-by-credential">
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No credential activity in this period.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="credential-table">
            <thead>
              <tr>
                <th scope="col" className={th}>Credential</th>
                <th scope="col" className={th}>Status</th>
                <th scope="col" className={th}>Last used</th>
                <th scope="col" className={thNum}>Requests</th>
                <th scope="col" className={thNum}>Errors</th>
                <th scope="col" className={thNum}>Messages</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {rows.map((r) => (
                <tr
                  key={r.apiKeyId}
                  data-testid="credential-usage-row"
                  aria-selected={selectedId === r.apiKeyId}
                  className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 ${selectedId === r.apiKeyId ? "bg-green-50 dark:bg-green-950" : ""}`}
                  onClick={() => onSelect(r.apiKeyId)}
                >
                  <td className={td}>
                    <button
                      type="button"
                      className="font-medium text-left hover:underline focus:outline-none focus:ring-2 focus:ring-green-500 rounded"
                      aria-label={`Filter by ${r.name}`}
                      onClick={(e) => { e.stopPropagation(); onSelect(r.apiKeyId); }}
                    >
                      {r.name}
                    </button>
                  </td>
                  <td className={td}>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${r.revoked ? "bg-gray-200 text-gray-700" : "bg-green-100 text-green-800"}`}>
                      {r.revoked ? "Revoked" : "Active"}
                    </span>
                  </td>
                  <td className={td}>{formatLastUsed(r.lastUsedAt)}</td>
                  <td className={tdNum}>{formatCount(r.requests)}</td>
                  <td className={tdNum}>{formatCount(errorCount(r))}</td>
                  <td className={tdNum}>{formatCount(r.messages)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

export function MessageStatusChips({ counts }: { counts: Record<MessageStatus, number> }): JSX.Element {
  return (
    <Panel title="Messages by status" id="usage-by-status">
      <ul className="flex flex-wrap gap-2" data-testid="status-chips">
        {MESSAGE_STATUSES.map((s) => (
          <li key={s} className="rounded-full border border-gray-200 dark:border-gray-700 px-3 py-1 text-sm">
            <span className="text-gray-600 dark:text-gray-300">{statusLabel(s)}</span>{" "}
            <span className="font-semibold tabular-nums">{formatCount(counts[s])}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function FailureReasons({ rows }: { rows: FailureReason[] }): JSX.Element {
  return (
    <Panel title="Top failure reasons" id="usage-failure-reasons">
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No failed messages in this period.</p>
      ) : (
        <table className="w-full text-sm" data-testid="failure-table">
          <thead>
            <tr>
              <th scope="col" className={th}>Code</th>
              <th scope="col" className={th}>Reason</th>
              <th scope="col" className={thNum}>Messages</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {rows.map((r, i) => (
              <tr key={`${r.code ?? "none"}-${i}`}>
                <td className={`${td} font-mono`}>{r.code ?? "—"}</td>
                <td className={td}>{r.title ?? "Unknown"}</td>
                <td className={tdNum}>{formatCount(r.count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
