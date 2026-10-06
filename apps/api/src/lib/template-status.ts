import type { TemplateStatus } from "@prisma/client";

/** Meta's template statuses / status-update events mapped to ours. Unknown values return null: callers keep the current status. */
const META_TO_STATUS: Record<string, TemplateStatus> = {
  APPROVED: "approved",
  REINSTATED: "approved", // Meta lifts a FLAGGED/paused state
  PENDING: "pending",
  REJECTED: "rejected",
  PAUSED: "paused",
  DISABLED: "disabled",
  IN_APPEAL: "in_appeal",
  FLAGGED: "flagged",
  LIMIT_EXCEEDED: "limit_exceeded",
  PENDING_DELETION: "pending_deletion",
  ARCHIVED: "archived",
  DELETED: "archived",
};

export function fromMetaTemplateStatus(raw: unknown): TemplateStatus | null {
  if (typeof raw !== "string") return null;
  return META_TO_STATUS[raw.trim().toUpperCase()] ?? null;
}

/** Status as the public API reports it (Meta's own upper-case names). A draft has not reached Meta, so it reads as PENDING. */
export function toPublicTemplateStatus(s: TemplateStatus): string {
  return s === "draft" ? "PENDING" : s.toUpperCase();
}

/** Templates Meta allows to be edited. */
export const PUBLIC_EDITABLE_STATUSES: ReadonlySet<TemplateStatus> = new Set<TemplateStatus>(["approved", "rejected", "paused"]);
