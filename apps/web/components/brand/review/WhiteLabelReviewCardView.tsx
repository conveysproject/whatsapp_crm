import type { JSX } from "react";
import { ConfirmDialog } from "@/components/parent/ConfirmDialog";
import { NewBadge } from "@/components/ui/NewBadge";
import { REVIEW_CHECKLIST, REVIEW_IMAGES, approvalBlockers, type BrandReview } from "@/lib/brand-review";
import { HIDE_POWERED_BY_LABEL } from "@/lib/brand-settings";
import { signInPath } from "@/lib/brand";
import type { ConfirmState } from "@/lib/parent-orgs";

interface Props {
  review: BrandReview;
  busy: boolean;
  error: string | null;
  revokeState: ConfirmState;
  onApprove: () => void;
  onRequestRevoke: () => void;
  onCancelRevoke: () => void;
  onConfirmRevoke: () => void;
}

const row = "flex gap-3 text-sm";
const dt = "w-36 shrink-0 text-gray-500";

/** Super admin: what the parent set up, and the switch that shows it to their clients. */
export function WhiteLabelReviewCardView(p: Props): JSX.Element {
  const r = p.review;
  const blockers = approvalBlockers(r);
  const path = r.slug ? signInPath(r.slug) : null;
  return (
    <div className="border rounded-lg p-5 space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="font-medium">White-label brand</h2>
        <NewBadge />
        <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${r.whiteLabelEnabled ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-800"}`}>
          {r.whiteLabelEnabled ? "Approved" : "Not approved"}
        </span>
      </div>

      <dl className="space-y-2">
        <div className={row}><dt className={dt}>Brand name</dt><dd>{r.brandName ?? <span className="text-gray-400">Not set</span>}</dd></div>
        <div className={row}>
          <dt className={dt}>Primary color</dt>
          <dd className="flex items-center gap-2">
            {r.brandColor ? (
              <>
                <span aria-hidden="true" data-testid="color-swatch" className="inline-block h-4 w-4 rounded border" style={{ backgroundColor: /^#[0-9a-fA-F]{6}$/.test(r.brandColor) ? r.brandColor : "transparent" }} />
                <span className="font-mono">{r.brandColor}</span>
              </>
            ) : <span className="text-gray-400">Not set</span>}
          </dd>
        </div>
        <div className={row}><dt className={dt}>Support email</dt><dd>{r.brandSupportEmail ?? <span className="text-gray-400">Not set</span>}</dd></div>
        <div className={row}>
          <dt className={dt}>Web address</dt>
          <dd>
            {path ? (
              r.whiteLabelEnabled ? (
                <a href={path} target="_blank" rel="noopener noreferrer" className="font-mono text-brand-700 hover:underline">{path}</a>
              ) : (
                <span className="font-mono" title="Not clickable until approved">{path}</span>
              )
            ) : <span className="text-gray-400">Not set</span>}
          </dd>
        </div>
        <div className={row}><dt className={dt}>{HIDE_POWERED_BY_LABEL}</dt><dd>{r.hidePoweredBy ? "Yes" : "No"}</dd></div>
        <div className={row}><dt className={dt}>Brand revision</dt><dd data-testid="brand-revision">{r.brandRevision}</dd></div>
      </dl>

      <div className="grid grid-cols-3 gap-3">
        {REVIEW_IMAGES.map(({ field, label, dark }) => {
          const url = r[field];
          return (
            <div key={field} data-image={field} className="space-y-1">
              <div className={`flex h-16 items-center justify-center rounded border ${dark ? "bg-gray-800" : "bg-gray-50"}`}>
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt={label} className="max-h-12 max-w-full object-contain" />
                ) : <span className="text-xs text-gray-400">None</span>}
              </div>
              <p className="text-xs text-gray-500">{label}</p>
            </div>
          );
        })}
      </div>

      <div className="rounded border bg-gray-50 p-3">
        <p className="text-xs font-medium text-gray-700">Before approving, check</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-gray-600">
          {REVIEW_CHECKLIST.map((c) => <li key={c}>{c}</li>)}
        </ul>
      </div>

      {blockers.length > 0 && !r.whiteLabelEnabled && (
        <ul data-testid="blockers" className="list-disc pl-5 text-xs text-amber-800">
          {blockers.map((b) => <li key={b}>{b}</li>)}
        </ul>
      )}
      {p.error && <p role="alert" className="text-sm text-red-600">{p.error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={p.onApprove}
          disabled={p.busy || blockers.length > 0 || r.whiteLabelEnabled}
          title={blockers.length > 0 ? blockers.join(". ") : undefined}
          className="rounded bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700 disabled:opacity-50"
        >
          {p.busy && p.revokeState === "idle" ? "Approving..." : "Approve"}
        </button>
        <button
          type="button"
          onClick={p.onRequestRevoke}
          disabled={p.busy || !r.whiteLabelEnabled}
          className="rounded border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          Revoke approval
        </button>
      </div>

      {p.revokeState !== "idle" && (
        <ConfirmDialog
          title="Revoke approval?"
          confirmLabel="Revoke"
          busy={p.revokeState === "running"}
          error={p.error}
          onConfirm={p.onConfirmRevoke}
          onCancel={p.onCancelRevoke}
        >
          <p>This client&apos;s brand stops showing to its clients right away. They see the standard look until it is approved again.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
