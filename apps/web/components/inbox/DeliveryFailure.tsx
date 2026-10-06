import type { JSX } from "react";
import { formatDeliveryError, shortDeliveryError, type DeliveryError } from "@/lib/delivery-error";

/** Red "!" for a failed outbound message; the tooltip and accessible name carry Meta's reason. */
export function FailedTick({ deliveryError }: { deliveryError?: DeliveryError | null }): JSX.Element {
  const reason = formatDeliveryError(deliveryError);
  return (
    <span role="img" className="text-red-400 text-[10px] ml-1" title={reason || "Not delivered"} aria-label={reason ? `Not delivered: ${reason}` : "Not delivered"}>
      <span aria-hidden="true">!</span>
      {!reason && <span className="sr-only" data-testid="failed-tick-text">Not delivered</span>}
    </span>
  );
}

/** Visible, text-based reason under a failed outbound bubble. Nothing when Meta gave no reason. */
export function NotDeliveredNote({ status, deliveryError }: { status?: string | null; deliveryError?: DeliveryError | null }): JSX.Element | null {
  if (status !== "failed") return null;
  const short = shortDeliveryError(deliveryError);
  if (!short) return null;
  return (
    <p data-testid="not-delivered" className="text-[11px] text-red-600 mt-1 text-right" title={formatDeliveryError(deliveryError)}>
      Not delivered: {short}
    </p>
  );
}
