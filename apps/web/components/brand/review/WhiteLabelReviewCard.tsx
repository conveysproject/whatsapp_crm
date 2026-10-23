"use client";

import { useRef, useState, type JSX } from "react";
import { useAuth } from "@/lib/auth/client";
import { reviewErrorText, setWhiteLabel, type BrandReview } from "@/lib/brand-review";
import { finishConfirm, startConfirm } from "@/lib/brand-settings";
import { confirmReducer, type ConfirmState } from "@/lib/parent-orgs";
import { WhiteLabelReviewCardView } from "./WhiteLabelReviewCardView";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

/** Super admin only (the page is under /admin and the API checks the role). Always approves the revision on screen. */
export function WhiteLabelReviewCard({ orgId, review, onChanged }: { orgId: string; review: BrandReview; onChanged: () => void }): JSX.Element {
  const { getToken } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revokeState, setRevokeState] = useState<ConfirmState>("idle");
  const revokeRunning = useRef(false);

  async function run(enabled: boolean): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const token = await getToken();
      // Approval carries the revision this card is showing, so a brand edited meanwhile is refused (BRAND_CHANGED).
      await setWhiteLabel(API_URL, token ?? "", orgId, enabled, enabled ? review.brandRevision : undefined);
      onChanged();
      return true;
    } catch (err) {
      const t = reviewErrorText(err);
      setError(t.message);
      if (t.refetch) onChanged();
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function confirmRevoke() {
    const step = startConfirm(revokeState);
    if (!step.proceed || revokeRunning.current) return;
    revokeRunning.current = true;
    setRevokeState(step.next);
    try {
      setRevokeState(finishConfirm(await run(false)));
    } finally {
      revokeRunning.current = false;
    }
  }

  return (
    <WhiteLabelReviewCardView
      review={review}
      busy={busy}
      error={error}
      revokeState={revokeState}
      onApprove={() => { void run(true); }}
      onRequestRevoke={() => { setError(null); setRevokeState(confirmReducer("idle", "request")); }}
      onCancelRevoke={() => { setRevokeState("idle"); setError(null); }}
      onConfirmRevoke={() => { void confirmRevoke(); }}
    />
  );
}
