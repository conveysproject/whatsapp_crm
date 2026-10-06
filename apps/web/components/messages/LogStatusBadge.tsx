import type { JSX } from "react";
import { formatDeliveryError, shortDeliveryError, type DeliveryError } from "@/lib/delivery-error";

const STATUS_COLOR: Record<string, string> = {
  failed: "bg-red-50 text-red-600",
};

/** Status pill for the Message Log. Failed rows also show Meta's code/title, with the full reason as a tooltip. */
export function LogStatusBadge({
  status,
  colorClass,
  deliveryError,
}: {
  status: string;
  colorClass?: string;
  deliveryError?: DeliveryError | null;
}): JSX.Element {
  const short = status === "failed" ? shortDeliveryError(deliveryError) : "";
  return (
    <>
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${colorClass ?? STATUS_COLOR[status] ?? "bg-gray-100 text-gray-600"}`}>
        {status}
      </span>
      {short && (
        <span
          data-testid="delivery-error"
          className="block text-[11px] text-red-600 mt-0.5 max-w-[14rem] truncate"
          title={formatDeliveryError(deliveryError)}
        >
          {short}
        </span>
      )}
    </>
  );
}
