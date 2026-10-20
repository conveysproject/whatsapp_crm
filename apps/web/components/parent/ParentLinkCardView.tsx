import type { JSX } from "react";
import { formatWhen, modeLabel, type ConfirmState, type ParentSession } from "@/lib/parent-orgs";
import { ConfirmDialog } from "./ConfirmDialog";
import { NewBadge } from "@/components/ui/NewBadge";

/** Child side: who the parent is, what they can do, and when they opened this account. */
export function ParentLinkCardView({
  parentName, sessions, gate, error, onLeave, onConfirm, onCancel,
}: {
  parentName: string;
  sessions: ParentSession[];
  gate: ConfirmState;
  error: string | null;
  onLeave: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}): JSX.Element {
  const name = parentName;
  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-gray-900">Linked to {name}</h2>
        <NewBadge />
      </div>
      <div className="space-y-4 px-5 py-4 text-sm text-gray-600">
        <p>
          {name} has full read access to this account, including its conversations, contacts and settings,
          and can open it as an admin. Each time they do, it is listed below.
        </p>
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Recent sessions by {name}</h3>
          {sessions.length === 0 ? (
            <p className="text-gray-500">No sessions yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100">
              {sessions.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span className="font-medium text-gray-900">{s.actorName}</span>
                  <span>{formatWhen(s.startedAt)}</span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs">{modeLabel(s.mode)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button type="button" onClick={onLeave} className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
          Leave {name}
        </button>
        {error && gate === "idle" && <p role="alert" className="text-red-600">{error}</p>}
      </div>
      {gate !== "idle" && (
        <ConfirmDialog title={`Leave ${name}?`} confirmLabel="Leave" busy={gate === "running"} error={error} onConfirm={onConfirm} onCancel={onCancel}>
          <p>{name} will lose its read access and can no longer open this account. Your data and your account stay as they are.</p>
          <p>You cannot be linked again unless {name} sends a new invitation.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}
